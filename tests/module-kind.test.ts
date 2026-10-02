/**
 * Module classification (`src/compiler/module-kind.ts`, guide §7.1): the one
 * function the linker, the Vite plugin, the validators and the editors use to
 * decide which language a module is written in — from its path alone.
 */

import { describe, expect, it } from "vitest";
import {
  AKTION_MODULE_SUFFIXES,
  DSL_MODULE_ID,
  RESERVED_AKTION_SUFFIXES,
  isAktionModulePath,
  isNativeModulePath,
  isReservedAktionPath,
  moduleLanguage,
  stripQuery,
} from "../src/compiler/module-kind.js";
import { isAktionId } from "../src/plugin/index.js";

describe("moduleLanguage", () => {
  it.each([
    ["app.aktion", "aktion"],
    ["src/store.aktion.ts", "typescript"],
    ["lib/fmt.aktion.js", "javascript"],
    ["/abs/Upper.AKTION.TS", "typescript"],
    ["https://cdn.example/x.aktion.js?v=3", "javascript"],
    ["/src/app.aktion.ts?import", "typescript"],
    ["/src/app.aktion#frag", "aktion"],
    ["/p/a", "aktion"],
    ["app", "aktion"],
    ["https://cdn.example/widget", "aktion"],
  ] as const)("%s → %s", (path, language) => {
    expect(moduleLanguage(path)).toBe(language);
  });

  it.each([
    "utils.ts",
    "helpers.js",
    "x.mjs",
    "x.cjs",
    "x.mts",
    "x.cts",
    "view.tsx",
    "view.jsx",
    "data.json",
    "styles.css",
    "lib.wasm",
    "https://cdn.example/lib.js?v=2",
  ])("%s is native code → null", (path) => {
    expect(moduleLanguage(path)).toBeNull();
    expect(isNativeModulePath(path)).toBe(true);
    expect(isAktionModulePath(path)).toBe(false);
  });

  it.each(["page.aktion.tsx", "page.aktion.jsx", "/a/b.aktion.TSX?x=1"])("%s is reserved for JSX → null", (path) => {
    expect(moduleLanguage(path)).toBeNull();
    expect(isReservedAktionPath(path)).toBe(true);
    expect(isNativeModulePath(path)).toBe(false);
    expect(isAktionModulePath(path)).toBe(false);
  });
});

describe("isAktionModulePath / isAktionId", () => {
  it("accepts every Aktion suffix, with or without a query or hash", () => {
    for (const suffix of AKTION_MODULE_SUFFIXES) {
      expect(isAktionModulePath(`/p/x${suffix}`)).toBe(true);
      expect(isAktionModulePath(`/p/x${suffix}?import`)).toBe(true);
      expect(isAktionId(`/p/x${suffix}?v=1#h`)).toBe(true);
    }
  });

  it("rejects native code and extensionless paths (they are only Aktion by the linker's lenient default)", () => {
    expect(isAktionId("/proj/main.ts")).toBe(false);
    expect(isAktionId("/proj/main.js")).toBe(false);
    expect(isAktionModulePath("/p/a")).toBe(false);
  });

  it("orders suffixes longest first and reserves the JSX ones", () => {
    expect(AKTION_MODULE_SUFFIXES).toEqual([".aktion.ts", ".aktion.js", ".aktion"]);
    expect(RESERVED_AKTION_SUFFIXES).toEqual([".aktion.tsx", ".aktion.jsx"]);
    expect(DSL_MODULE_ID).toBe("aktion-runtime/dsl");
  });
});

describe("stripQuery", () => {
  it.each([
    ["/a/b.aktion.ts?import", "/a/b.aktion.ts"],
    ["/a/b.aktion#x", "/a/b.aktion"],
    ["/a/b.aktion?x=1#y", "/a/b.aktion"],
    ["/a/b.aktion", "/a/b.aktion"],
  ])("%s → %s", (id, clean) => {
    expect(stripQuery(id)).toBe(clean);
  });
});
