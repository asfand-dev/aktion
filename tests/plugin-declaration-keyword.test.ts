/**
 * The parser records `let` / `const` / `var` as `declaration` so the formatter
 * can print it back, but the runtime never reads it. The Vite plugin must not
 * ship it: a compiled `.aktion` module is byte-for-byte what it was before the
 * field existed.
 */
import { describe, expect, it } from "vitest";
import { aktionPlugin } from "../src/plugin/index.js";
import { parse } from "../src/parser/index.js";

type Hooks = {
  configResolved: (c: unknown) => void;
  buildStart: (this: unknown) => Promise<void>;
  transform: { handler: (this: unknown, c: string, id: string) => Promise<{ code: string } | null> };
};

async function transform(code: string): Promise<string> {
  const plugin = aktionPlugin() as unknown as Hooks;
  const ctx = { addWatchFile() {}, warn() {}, error() { throw new Error("unexpected"); } };
  plugin.configResolved({ command: "build", root: "/p" });
  await plugin.buildStart.call(ctx);
  const out = await plugin.transform.handler.call(ctx, code, "/p/app.aktion");
  return out!.code;
}

function embeddedProgram(code: string): { statements: unknown[] } {
  const literal = /JSON\.parse\((".*")\);/s.exec(code)![1]!;
  return JSON.parse(JSON.parse(literal) as string) as { statements: unknown[] };
}

const WITH_KEYWORDS = [
  "let $count = 0",
  "const LIMIT = 5",
  "var legacy = 1",
  "const [a, b] = [1, 2]",
  "export let shared = 2",
  "function run(items) {",
  "  for (const item of items) {",
  "    let doubled = item * 2",
  "    doubled",
  "  }",
  "  for (var key in items) {",
  "    key",
  "  }",
  "  for (let i = 0; i < 2; i++) {",
  "    i",
  "  }",
  "}",
  '$app(Text("x"))',
  "",
].join("\n");

describe("plugin — declaration keyword is not shipped", () => {
  it("parses the keyword, so the test is not vacuous", () => {
    expect(JSON.stringify(parse(WITH_KEYWORDS).statements)).toContain('"declaration"');
  });

  it("emits no `declaration` key anywhere in the compiled program", async () => {
    expect(JSON.stringify(embeddedProgram(await transform(WITH_KEYWORDS)))).not.toContain("declaration");
  });
});
