import { describe, expect, it } from "vitest";
import {
  builtinCatalog,
  findBuiltin,
  isBuiltinName,
  getLanguageSpec,
} from "../src/language/index.js";
import { getCompletions, getHoverInfo } from "../src/tooling/language-service.js";
import { defaultLibrary } from "../src/library/index.js";

describe("builtin catalog", () => {
  it("indexes the core $-builtins by bare name", () => {
    expect(isBuiltinName("state")).toBe(true);
    expect(isBuiltinName("effect")).toBe(true);
    expect(isBuiltinName("util")).toBe(true);
    expect(isBuiltinName("count")).toBe(false); // a user atom, not a builtin
    expect(findBuiltin("router")?.sigil).toBe("$router");
    expect(findBuiltin("util")?.namespace).toBe(true);
  });

  it("every entry carries a sigil, signature, and summary", () => {
    for (const entry of builtinCatalog) {
      expect(entry.sigil).toBe(`$${entry.name}`);
      expect(entry.signature.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it("is surfaced on the language spec", () => {
    const spec = getLanguageSpec();
    expect(spec.builtins).toBe(builtinCatalog);
    const names = new Set(spec.builtins.map((b) => b.name));
    for (const required of ["state", "memo", "effect", "http", "router", "util", "toast"]) {
      expect(names.has(required)).toBe(true);
    }
  });
});

describe("completions + hover are sourced from the catalog", () => {
  const program = "$count = 0\n$";

  it("offers every builtin after a lone `$`", () => {
    const labels = getCompletions(program, { line: 2, column: 2 }, defaultLibrary).map((c) => c.label);
    // User atom first…
    expect(labels).toContain("$count");
    // …then the catalog signatures.
    for (const entry of builtinCatalog) {
      expect(labels).toContain(entry.signature);
    }
  });

  it("hover resolves a builtin via the catalog", () => {
    const src = "x = $http({ url: \"/api\" })";
    const info = getHoverInfo(src, { line: 1, column: 6 }, defaultLibrary);
    expect(info?.kind).toBe("builtin");
    expect(info?.contents).toContain("$http");
  });

  it("hover treats an unknown $name as a reactive atom", () => {
    const src = "$count = 1\nx = $count";
    const info = getHoverInfo(src, { line: 2, column: 6 }, defaultLibrary);
    expect(info?.kind).toBe("state");
    expect(info?.contents).toContain("reactive state atom");
  });
});
