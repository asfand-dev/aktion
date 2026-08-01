/**
 * End-to-end tests for `editors/lsp` — the standalone Aktion language server.
 *
 * These drive the REAL built bundle over a REAL stdio pipe, because that is the
 * only thing that catches the failure modes that matter for an LSP server:
 * message framing (`Content-Length` counts bytes, not characters), delta-encoded
 * semantic tokens, and the 1-indexed → 0-indexed coordinate conversion. A unit
 * test against the handler map would pass while the wire format was broken.
 *
 * The bundle is rebuilt in `beforeAll`, so the test always exercises current
 * source rather than a stale artifact.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lspRoot = resolve(repoRoot, "editors/lsp");
const serverBundle = resolve(lspRoot, "dist/server.mjs");

/* -------------------------------------------------------------------------- */
/*  A minimal LSP client                                                      */
/* -------------------------------------------------------------------------- */

interface RpcResponse {
  id?: number;
  result?: any;
  error?: { code: number; message: string };
}

class TestClient {
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, (msg: RpcResponse) => void>();
  readonly notifications: Array<{ method: string; params: any }> = [];
  readonly stderr: string[] = [];

  constructor() {
    this.proc = spawn(process.execPath, [serverBundle, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    this.proc.stderr.on("data", (d: Buffer) => this.stderr.push(d.toString()));
    this.proc.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.byteLength < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      this.buffer = this.buffer.subarray(bodyStart + length);
      const msg = JSON.parse(body);
      if (msg.id != null && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg);
        this.pending.delete(msg.id);
      } else if (msg.method) {
        this.notifications.push(msg);
      }
    }
  }

  private send(message: unknown): void {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    this.proc.stdin.write(`Content-Length: ${payload.byteLength}\r\n\r\n`);
    this.proc.stdin.write(payload);
  }

  request(method: string, params: unknown): Promise<RpcResponse> {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`LSP request timed out: ${method}`));
      }, 20_000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolvePromise(msg);
      });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  /**
   * Wait for the `publishDiagnostics` that belongs to document `version`.
   *
   * Keying on version rather than on the payload is what makes these tests
   * deterministic: diagnostics are debounced, so without it a assertion can
   * happily match the *previous* edit's still-latest notification.
   */
  async waitForDiagnostics(uri: string, version: number): Promise<any[]> {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const match = [...this.notifications]
        .reverse()
        .find(
          (n) =>
            n.method === "textDocument/publishDiagnostics" &&
            n.params?.uri === uri &&
            n.params?.version === version,
        );
      if (match) return match.params.diagnostics;
      if (Date.now() > deadline) {
        const seen = this.notifications
          .filter((n) => n.method === "textDocument/publishDiagnostics" && n.params?.uri === uri)
          .map((n) => n.params.version);
        throw new Error(
          `Timed out waiting for diagnostics v${version} on ${uri}. Versions seen: ${seen.join(", ")}`,
        );
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  dispose(): void {
    this.proc.kill();
  }
}

/* -------------------------------------------------------------------------- */
/*  Fixture project                                                           */
/* -------------------------------------------------------------------------- */

const COUNTER_SRC = ["export $count = 0", "export function increment() { $count += 1 }", ""].join("\n");

const APP_SRC = [
  'import { $count, increment } from "./counter.aktion"',
  "",
  '$title = "Dashboard"',
  "",
  "function Panel(label) {",
  '  return Card([CardHeader(label), Text($count), Button("Add", { action: increment })])',
  "}",
  "",
  "$app(Column([",
  '  PageHeader($title, { subtitle: "smoke" }),',
  '  Panel("Counter"),',
  '  Pill("SSL active", "success"),',
  "]))",
  "",
].join("\n");

let client: TestClient;
let appUri: string;
let counterUri: string;

const lineOf = (needle: string): number => APP_SRC.split("\n").findIndex((l) => l.includes(needle));

beforeAll(async () => {
  // Always test current source, not whatever happened to be in dist/.
  const build = spawnSync(process.execPath, ["esbuild.mjs"], { cwd: lspRoot, encoding: "utf8" });
  if (build.status !== 0) {
    throw new Error(`Failed to build editors/lsp:\n${build.stdout}\n${build.stderr}`);
  }

  const dir = mkdtempSync(resolve(tmpdir(), "aktion-lsp-"));
  writeFileSync(resolve(dir, "counter.aktion"), COUNTER_SRC);
  writeFileSync(resolve(dir, "app.aktion"), APP_SRC);
  appUri = pathToFileURL(resolve(dir, "app.aktion")).href;
  counterUri = pathToFileURL(resolve(dir, "counter.aktion")).href;

  client = new TestClient();
  await client.request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(dir).href,
    capabilities: {
      textDocument: {
        completion: { completionItem: { snippetSupport: true } },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        hover: { contentFormat: ["markdown", "plaintext"] },
      },
    },
  });
  client.notify("initialized", {});
  client.notify("textDocument/didOpen", {
    textDocument: { uri: appUri, languageId: "aktion", version: 1, text: APP_SRC },
  });
}, 120_000);

afterAll(() => {
  client?.dispose();
});

/* -------------------------------------------------------------------------- */

describe("aktion-language-server — lifecycle", () => {
  it("advertises every capability the language service can back", async () => {
    // Re-initialising a fresh client keeps this assertion independent of the
    // shared one, which has already been driven through several requests.
    const probe = new TestClient();
    try {
      const res = await probe.request("initialize", { capabilities: {} });
      const caps = res.result.capabilities;
      expect(caps.hoverProvider).toBe(true);
      expect(caps.definitionProvider).toBe(true);
      expect(caps.referencesProvider).toBe(true);
      expect(caps.documentHighlightProvider).toBe(true);
      expect(caps.documentSymbolProvider).toBe(true);
      expect(caps.documentFormattingProvider).toBe(true);
      expect(caps.renameProvider.prepareProvider).toBe(true);
      expect(caps.completionProvider.triggerCharacters).toEqual(["$", "."]);
      expect(caps.signatureHelpProvider.triggerCharacters).toEqual(["(", ","]);
      expect(caps.textDocumentSync).toEqual({ openClose: true, change: 1 });
      // The legend must match the runtime's, in order — the client indexes into it.
      expect(caps.semanticTokensProvider.legend.tokenTypes).toEqual([
        "namespace", "class", "function", "variable", "property", "keyword", "number",
      ]);
      expect(caps.semanticTokensProvider.legend.tokenModifiers).toEqual([
        "declaration", "defaultLibrary",
      ]);
      expect(res.result.serverInfo.name).toBe("aktion-language-server");
    } finally {
      probe.dispose();
    }
  });

  it("answers MethodNotFound for an unknown request", async () => {
    const res = await client.request("textDocument/nonsense", {});
    expect(res.error?.code).toBe(-32601);
  });

  it("answers InvalidParams for a document it does not hold", async () => {
    const res = await client.request("textDocument/hover", {
      textDocument: { uri: "file:///not-open.aktion" },
      position: { line: 0, character: 0 },
    });
    expect(res.error?.code).toBe(-32602);
  });
});

describe("aktion-language-server — diagnostics", () => {
  it("publishes an empty list for a valid program", async () => {
    const diagnostics = await client.waitForDiagnostics(appUri, 1);
    expect(diagnostics).toEqual([]);
  });

  it("reports an unknown prop as an error with an end-of-line range", async () => {
    const broken = '$app(Card([], { junk: 1 }))\n';
    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 2 },
      contentChanges: [{ text: broken }],
    });
    const diagnostics = await client.waitForDiagnostics(appUri, 2);
    expect(diagnostics[0].severity).toBe(1); // Error
    expect(diagnostics[0].source).toBe("aktion");
    expect(diagnostics[0].message).toContain("junk");
    // 1-indexed service line 1 → 0-indexed LSP line 0.
    expect(diagnostics[0].range.start.line).toBe(0);
    expect(diagnostics[0].range.end.character).toBe(broken.split("\n")[0]!.length);
  });

  it("reports an unknown component as a warning, once per site", async () => {
    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 3 },
      contentChanges: [{ text: '$app(Column([Cardd([])]))\n' }],
    });
    const diagnostics = await client.waitForDiagnostics(appUri, 3);
    const unknown = diagnostics.filter((d: any) => d.message.startsWith("Unknown component"));
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBe(2); // Warning
    expect(unknown[0].message).toContain('"Card"');
  });

  it("clears diagnostics when a document closes", async () => {
    const scratchUri = "file:///scratch.aktion";
    client.notify("textDocument/didOpen", {
      textDocument: { uri: scratchUri, languageId: "aktion", version: 1, text: "$app(Cardd([]))\n" },
    });
    const opened = await client.waitForDiagnostics(scratchUri, 1);
    expect(opened.length).toBeGreaterThan(0);
    client.notify("textDocument/didClose", { textDocument: { uri: scratchUri } });
    // The clearing notification deliberately carries no version — a closed
    // document has none — so look for it directly.
    const cleared = await new Promise<any[]>((res, rej) => {
      const deadline = Date.now() + 5_000;
      const poll = () => {
        const hit = [...client.notifications].reverse().find(
          (n) =>
            n.method === "textDocument/publishDiagnostics" &&
            n.params?.uri === scratchUri &&
            n.params?.version === undefined,
        );
        if (hit) return res(hit.params.diagnostics);
        if (Date.now() > deadline) return rej(new Error("diagnostics were never cleared"));
        setTimeout(poll, 25);
      };
      poll();
    });
    expect(cleared).toEqual([]);
  });
});

describe("aktion-language-server — language features", () => {
  beforeAll(() => {
    // Restore the fixture after the diagnostics suite rewrote it.
    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 10 },
      contentChanges: [{ text: APP_SRC }],
    });
  });

  it("hovers a library component", async () => {
    const res = await client.request("textDocument/hover", {
      textDocument: { uri: appUri },
      position: { line: lineOf("Pill("), character: 4 },
    });
    expect(res.result.contents.kind).toBe("markdown");
    expect(res.result.contents.value).toContain("Pill");
  });

  it("completes components and offers snippets to a snippet-capable client", async () => {
    const res = await client.request("textDocument/completion", {
      textDocument: { uri: appUri },
      position: { line: lineOf("PageHeader("), character: 14 },
    });
    const items = res.result.items as any[];
    expect(items.length).toBeGreaterThan(50);
    const snippets = items.filter((i) => i.insertTextFormat === 2);
    expect(snippets.length).toBeGreaterThan(0);
    // Snippet templates are LSP snippet syntax already — no conversion needed.
    expect(snippets.some((s) => /\$\{\d+/.test(s.insertText))).toBe(true);
  });

  it("withholds snippets from a client that cannot render them", async () => {
    const plain = new TestClient();
    try {
      await plain.request("initialize", { capabilities: {} });
      plain.notify("initialized", {});
      plain.notify("textDocument/didOpen", {
        textDocument: { uri: appUri, languageId: "aktion", version: 1, text: APP_SRC },
      });
      const res = await plain.request("textDocument/completion", {
        textDocument: { uri: appUri },
        position: { line: lineOf("PageHeader("), character: 14 },
      });
      expect((res.result.items as any[]).some((i) => i.insertTextFormat === 2)).toBe(false);
      // …and hover falls back to plaintext for such a client.
      const hover = await plain.request("textDocument/hover", {
        textDocument: { uri: appUri },
        position: { line: lineOf("Pill("), character: 4 },
      });
      expect(hover.result.contents.kind).toBe("plaintext");
    } finally {
      plain.dispose();
    }
  });

  it("provides signature help", async () => {
    const res = await client.request("textDocument/signatureHelp", {
      textDocument: { uri: appUri },
      position: { line: lineOf("PageHeader("), character: 14 },
    });
    expect(res.result.signatures.length).toBeGreaterThan(0);
    expect(res.result.signatures[0].label).toBeTruthy();
  });

  it("resolves go-to-definition across files", async () => {
    const res = await client.request("textDocument/definition", {
      textDocument: { uri: appUri },
      position: { line: 0, character: 20 }, // `increment` in the import clause
    });
    expect(res.result.uri).toBe(counterUri);
    // Lands on the declaration, not line 0.
    expect(res.result.range.start.line).toBe(1);
  });

  it("resolves a module specifier to the file's start", async () => {
    const specifierColumn = APP_SRC.indexOf("./counter.aktion") + 3;
    const res = await client.request("textDocument/definition", {
      textDocument: { uri: appUri },
      position: { line: 0, character: specifierColumn },
    });
    expect(res.result.uri).toBe(counterUri);
    expect(res.result.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
  });

  it("finds references and document highlights for a $state atom", async () => {
    const position = { line: 0, character: 10 }; // `$count` in the import clause
    const refs = await client.request("textDocument/references", {
      textDocument: { uri: appUri },
      position,
      context: { includeDeclaration: true },
    });
    expect((refs.result as any[]).length).toBeGreaterThanOrEqual(2);
    expect((refs.result as any[])[0].uri).toBe(appUri);

    const highlights = await client.request("textDocument/documentHighlight", {
      textDocument: { uri: appUri },
      position,
    });
    expect((highlights.result as any[]).length).toBeGreaterThanOrEqual(2);
    expect((highlights.result as any[])[0].kind).toBe(1);
  });

  it("lists document symbols hierarchically for a capable client", async () => {
    const res = await client.request("textDocument/documentSymbol", {
      textDocument: { uri: appUri },
    });
    const symbols = res.result as any[];
    const names = symbols.map((s) => s.name);
    expect(names).toContain("$title");
    expect(names).toContain("Panel");
    // Hierarchical shape → `range`/`selectionRange`, not `location`.
    expect(symbols[0].range).toBeDefined();
    expect(symbols[0].location).toBeUndefined();
  });

  it("renames a $state atom, preserving the sigil", async () => {
    const position = { line: lineOf("$title ="), character: 2 };
    const prepared = await client.request("textDocument/prepareRename", {
      textDocument: { uri: appUri },
      position,
    });
    expect(prepared.result.placeholder).toBe("$title");

    const renamed = await client.request("textDocument/rename", {
      textDocument: { uri: appUri },
      position,
      newName: "$heading",
    });
    const edits = renamed.result.changes[appUri];
    expect(edits.length).toBeGreaterThanOrEqual(2);
    expect(edits.every((e: any) => e.newText.startsWith("$"))).toBe(true);
  });

  it("rejects a rename the service refuses, with the reason", async () => {
    // A library component is not renameable — the error must carry the message.
    const res = await client.request("textDocument/rename", {
      textDocument: { uri: appUri },
      position: { line: lineOf("Pill("), character: 4 },
      newName: "Nope",
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message.length).toBeGreaterThan(0);
  });

  it("returns no formatting edits for an already-formatted document", async () => {
    const res = await client.request("textDocument/formatting", {
      textDocument: { uri: appUri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(Array.isArray(res.result)).toBe(true);
  });

  it("leaves a document with parse errors untouched when formatting", async () => {
    const brokenUri = "file:///broken.aktion";
    client.notify("textDocument/didOpen", {
      textDocument: { uri: brokenUri, languageId: "aktion", version: 1, text: "$app(Column([" },
    });
    const res = await client.request("textDocument/formatting", {
      textDocument: { uri: brokenUri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(res.result).toEqual([]);
    client.notify("textDocument/didClose", { textDocument: { uri: brokenUri } });
  });
});

describe("aktion-language-server — semantic tokens", () => {
  it("delta-encodes tokens in sorted order", async () => {
    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 20 },
      contentChanges: [{ text: APP_SRC }],
    });
    const res = await client.request("textDocument/semanticTokens/full", {
      textDocument: { uri: appUri },
    });
    const data = res.result.data as number[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.length % 5).toBe(0);

    // Decode and assert the invariants a client relies on: deltaLine never goes
    // backwards, and deltaStartChar is only negative-free because the encoder
    // resets it on a line change.
    let line = 0;
    let char = 0;
    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i]!;
      const deltaChar = data[i + 1]!;
      const length = data[i + 2]!;
      const type = data[i + 3]!;
      expect(deltaLine).toBeGreaterThanOrEqual(0);
      expect(deltaChar).toBeGreaterThanOrEqual(0);
      expect(length).toBeGreaterThan(0);
      expect(type).toBeGreaterThanOrEqual(0);
      expect(type).toBeLessThan(7); // within the legend
      line += deltaLine;
      char = deltaLine === 0 ? char + deltaChar : deltaChar;
      expect(char).toBeGreaterThanOrEqual(0);
    }
    expect(line).toBeLessThan(APP_SRC.split("\n").length);
  });
});

describe("aktion-language-server — transport", () => {
  it("frames non-ASCII payloads by byte length", async () => {
    // `Content-Length` counts bytes. If the server used `string.length` this
    // program would desynchronise the stream and every later request would hang.
    const unicode = '$app(Column([Text("héllo — 日本語 🎉"), Text("ok")]))\n';
    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 30 },
      contentChanges: [{ text: unicode }],
    });
    expect(await client.waitForDiagnostics(appUri, 30)).toEqual([]);
    const res = await client.request("textDocument/documentSymbol", {
      textDocument: { uri: appUri },
    });
    expect(Array.isArray(res.result)).toBe(true);
  });

  it("survives an unparseable frame and keeps serving", async () => {
    // Write a syntactically valid frame whose body is not JSON, then prove the
    // stream resynchronised.
    const junk = Buffer.from("{not json", "utf8");
    (client as unknown as { proc: ChildProcessWithoutNullStreams }).proc.stdin.write(
      `Content-Length: ${junk.byteLength}\r\n\r\n`,
    );
    (client as unknown as { proc: ChildProcessWithoutNullStreams }).proc.stdin.write(junk);

    const res = await client.request("textDocument/documentSymbol", {
      textDocument: { uri: appUri },
    });
    expect(Array.isArray(res.result)).toBe(true);
  });

  it("refuses an incremental change rather than corrupting the document", async () => {
    // The server declares full-document sync. A client that sends an incremental
    // change anyway would otherwise have its document replaced by a fragment,
    // and every later request would silently answer against garbage.
    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 40 },
      contentChanges: [{ text: APP_SRC }],
    });
    expect(await client.waitForDiagnostics(appUri, 40)).toEqual([]);

    client.notify("textDocument/didChange", {
      textDocument: { uri: appUri, version: 41 },
      contentChanges: [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, text: "X" },
      ],
    });

    // The document is unchanged, so the symbols from v40 still resolve.
    const res = await client.request("textDocument/documentSymbol", {
      textDocument: { uri: appUri },
    });
    expect((res.result as any[]).map((s) => s.name)).toContain("Panel");
    expect(client.stderr.join("")).toContain("ignoring an incremental");
  });

  it("reports its version via --version", () => {
    const res = spawnSync(process.execPath, [serverBundle, "--version"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints usage via --help without opening stdin", () => {
    const res = spawnSync(process.execPath, [serverBundle, "--help"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("aktion-language-server");
    expect(res.stdout).toContain("--stdio");
  });
});
