/**
 * Editor DX (feedback §3.2 + §3.4):
 *   - `getCompletions` is now scope-aware: it surfaces the author's own
 *     reactive atoms, component declarations, and action declarations, not
 *     just the library + reserved words.
 *   - The Vite plugin emits a real v3 source map (with `sourcesContent`)
 *     instead of `{ mappings: "" }`, so frames resolve to the `.aktion` file.
 */

import { describe, expect, it, vi } from "vitest";
import { getCompletions } from "../src/tooling/language-service.js";
import { defaultLibrary } from "../src/library/index.js";
import { aktionPlugin } from "../src/plugin/index.js";

const PROGRAM = `$count = 0
$user = { name: "Ada" }
function Card(title) { return Text(title) }
function increment() { $count = $count + 1 }
aktion = Stack([])
`;

describe("scope-aware completions", () => {
  // Cursor on the trailing blank line — top-level position (not after `$`,
  // not inside a call).
  const position = { line: 6, column: 1 };

  it("includes the author's reactive atoms", () => {
    const labels = getCompletions(PROGRAM, position, defaultLibrary).map((c) => c.label);
    expect(labels).toContain("$count");
    expect(labels).toContain("$user");
  });

  it("includes the author's component declarations", () => {
    const items = getCompletions(PROGRAM, position, defaultLibrary);
    const card = items.find((c) => c.label === "Card");
    expect(card).toBeDefined();
    expect(card?.kind).toBe("component");
    expect(card?.detail).toContain("this file");
  });

  it("includes the author's action declarations", () => {
    const items = getCompletions(PROGRAM, position, defaultLibrary);
    const inc = items.find((c) => c.label === "increment");
    expect(inc).toBeDefined();
    expect(inc?.detail).toContain("this file");
  });

  it("offers declared atoms after a `$`", () => {
    // Position right after a lone `$` on a new line.
    const src = PROGRAM + "$";
    const pos = { line: 7, column: 2 };
    const labels = getCompletions(src, pos, defaultLibrary).map((c) => c.label);
    expect(labels).toContain("$count");
    expect(labels).toContain("$user");
  });

  it("still surfaces library components and keywords", () => {
    const labels = getCompletions(PROGRAM, position, defaultLibrary).map((c) => c.label);
    expect(labels).toContain("Stack");
    expect(labels).toContain("function");
  });
});

describe("context-aware completions inside brackets", () => {
  it("offers components inside a children array (the headline authoring spot)", () => {
    // `Column([ Sid… ])` — typing a child component must suggest components,
    // not be suppressed by the enclosing call (regression test).
    const src = "$app(Column([\n  Sid\n]))";
    const labels = getCompletions(src, { line: 2, column: 6 }, defaultLibrary).map((c) => c.label);
    expect(labels).toContain("Sidebar");
  });

  it("offers prop names inside a component's trailing props object", () => {
    const src = 'Button("x", {\n  va\n})';
    const labels = getCompletions(src, { line: 2, column: 5 }, defaultLibrary).map((c) => c.label);
    // Prop completions are colon-suffixed; `variant:` is a Button prop.
    expect(labels.some((l) => l.endsWith(":"))).toBe(true);
    // …and the general list is still available so prop values can reference
    // components / atoms.
    expect(labels).toContain("Sidebar");
  });
});

describe("Vite plugin source map", () => {
  function runTransform(code: string, id: string) {
    const plugin = aktionPlugin();
    const transform = plugin.transform as (
      this: { addWatchFile: () => void; warn: () => void; error: (e: unknown) => never },
      code: string,
      id: string,
    ) => { code: string; map: { version: number; sources: string[]; sourcesContent: string[]; mappings: string } } | null;
    const mockCtx = {
      addWatchFile: vi.fn(),
      warn: vi.fn(),
      error: (e: unknown) => {
        throw e;
      },
    };
    return transform.call(mockCtx as never, code, id);
  }

  it("emits a v3 map with sourcesContent and non-empty mappings", () => {
    const code = `aktion = Stack([])\n`;
    const result = runTransform(code, "/proj/app.aktion");
    expect(result).not.toBeNull();
    const map = result!.map;
    expect(map.version).toBe(3);
    expect(map.sources).toEqual(["/proj/app.aktion"]);
    expect(map.sourcesContent).toEqual([code]);
    expect(map.mappings.length).toBeGreaterThan(0);
    // One mapping segment per generated line.
    const generatedLines = result!.code.split("\n").length;
    expect(map.mappings.split(";").length).toBe(generatedLines);
  });

  it("returns null for non-aktion ids", () => {
    expect(runTransform("x = 1", "/proj/main.ts")).toBeNull();
  });
});
