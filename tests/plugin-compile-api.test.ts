/**
 * `compileAktionFile` / `compileAktionSource` — producing a `CompiledProgram`
 * outside a Vite build (tests, SSR, CLIs).
 */
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileAktionFile, compileAktionSource } from "../src/plugin/index.js";
import { isCompiledProgram } from "../src/compiler/index.js";
import { renderCompiled, cleanup } from "../src/testing/index.js";

const dir = mkdtempSync(join(tmpdir(), "aktion-compile-"));
const write = (name: string, source: string): string => {
  const path = join(dir, name);
  writeFileSync(path, source, "utf8");
  return path;
};

const entry = write(
  "app.aktion",
  ['import { label } from "./copy.aktion"', "$app(Text(label()))"].join("\n"),
);
write("copy.aktion", ['export function label() {', '  return "compiled from disk"', "}"].join("\n"));

afterAll(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

describe("compileAktionFile", () => {
  it("links a graph from disk into a mountable program", async () => {
    const compiled = compileAktionFile(entry);
    expect(isCompiledProgram(compiled)).toBe(true);
    expect(compiled.program.sources).toHaveLength(2);

    const screen = renderCompiled(compiled);
    await screen.flush();
    expect(screen.getByText("compiled from disk")).toBeDefined();
  });

  it("reports an unresolved import as a thrown diagnostic", () => {
    const broken = write("broken.aktion", 'import { x } from "./missing.aktion"\n$app(Text("hi"))');
    expect(() => compileAktionFile(broken)).toThrow(/Failed to load imported module/);
  });

  it("reports a syntax error in a dependency", () => {
    write("bad.aktion", "export function oops( {\n");
    const host = write("host.aktion", 'import { oops } from "./bad.aktion"\n$app(Text("hi"))');
    expect(() => compileAktionFile(host)).toThrow(/\[aktion\] failed to compile/);
  });

  it("confines imports to `root`", () => {
    // `../copy.aktion` resolves outside the declared root, so the resolver
    // refuses it rather than reading a file the caller did not opt into.
    const escaping = write("escape.aktion", 'import { label } from "../copy.aktion"\n$app(Text("x"))');
    expect(() => compileAktionFile(escaping, { root: join(dir, "nowhere") })).toThrow(
      /Cannot resolve import/,
    );
  });

  it("`strict` promotes a warning to a failure", () => {
    const noEntry = write("no-entry.aktion", 'greeting = "hi"');
    expect(() => compileAktionFile(noEntry)).not.toThrow();
    expect(() => compileAktionFile(noEntry, { strict: true })).toThrow(/renders nothing/);
  });
});

describe("compileAktionSource", () => {
  it("resolves an inline program's imports against the real filesystem", async () => {
    const compiled = compileAktionSource(
      ['import { label } from "./copy.aktion"', "$app(Text(`inline: ${label()}`))"].join("\n"),
      join(dir, "inline.aktion"),
    );
    const screen = renderCompiled(compiled);
    await screen.flush();
    expect(screen.getByText("inline: compiled from disk")).toBeDefined();
  });

  it("attributes the imported module to its real path, so coverage merges", () => {
    const compiled = compileAktionSource(
      ['import { label } from "./copy.aktion"', "$app(Text(label()))"].join("\n"),
      join(dir, "probe-one.aktion"),
    );
    expect(compiled.program.sources).toEqual([
      join(dir, "probe-one.aktion"),
      join(dir, "copy.aktion"),
    ]);
  });

  it("does not require the virtual entry to exist on disk", () => {
    expect(() =>
      compileAktionSource('$app(Text("nowhere"))', join(dir, "does-not-exist.aktion")),
    ).not.toThrow();
  });
});
