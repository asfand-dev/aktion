/**
 * `$store` / `$form` singleton identity across a LINKED module graph.
 *
 * Both builtins hand back one handle per CALL SITE, and the call site used to be
 * `line:column` alone. That is exact for a single file and wrong the moment a
 * program is linked: `linkProgram` merges every module's statements into one
 * AST, so line 4 exists once per module. Two modules that each open with
 * `export view = $store({...})` landed on the same key, and the second silently
 * received the FIRST module's handle — sharing its state, its methods and its
 * persisted data, with nothing reported anywhere.
 *
 * `SourceLocation.source` is the module index the linker stamps for exactly this
 * reason. These tests pin that it is part of the identity, and that folding it in
 * did not change the key for a single-file program or for the entry module —
 * which matters because the key is also the default `persist` key and the name of
 * the backing atom.
 */

import { describe, it, expect, afterEach } from "vitest";
import { renderCompiled, cleanup, flush } from "../src/testing/index.js";
import { linkProgram, defineCompiledProgram, COMPILED_PROGRAM_VERSION } from "../src/compiler/index.js";
import type { ModuleResolver } from "../src/compiler/index.js";

afterEach(() => cleanup());

/** Link an in-memory multi-file project the way the Vite plugin does. */
function link(files: Record<string, string>, entry: string) {
  const resolver: ModuleResolver = {
    resolve(spec, importer) {
      const dir = importer.slice(0, importer.lastIndexOf("/"));
      return spec.startsWith("./") ? `${dir}/${spec.slice(2)}` : spec;
    },
    load(path) {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
  const result = linkProgram(files[entry]!, entry, resolver);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program: result.program,
    source: files[entry]!,
    path: entry,
  });
}

/** Render a project and read the `$probe` atom its mount effect wrote. */
async function probe(files: Record<string, string>, entry = "/p/app.aktion"): Promise<unknown> {
  const screen = renderCompiled(link(files, entry));
  await flush(12);
  return screen.state.get("probe");
}

describe("$store identity across modules", () => {
  it("gives two modules their own store when the calls share a line and column", async () => {
    // Byte-for-byte the same call, at the same position, in two files — which is
    // the ordinary shape of an app whose modules each open with their own store.
    const files = {
      "/p/a.aktion": [
        'export sA = $store({v: "A"})',
        "export function readA() { return sA.v }",
      ].join("\n"),
      "/p/b.aktion": [
        'export sB = $store({v: "B"})',
        "export function readB() { return sB.v }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {readA} from "./a.aktion"',
        'import {readB} from "./b.aktion"',
        "$probe = null",
        '$effect(() => { $probe = readA() + readB() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    expect(await probe(files)).toBe("AB");
  });

  it("keeps a write to one module's store out of the other's", async () => {
    const files = {
      "/p/a.aktion": [
        'export sA = $store({v: "A", set: (s, next) => { s.v = next }})',
        "export function readA() { return sA.v }",
        "export function setA(next) { sA.set(next) }",
      ].join("\n"),
      "/p/b.aktion": [
        'export sB = $store({v: "B", set: (s, next) => { s.v = next }})',
        "export function readB() { return sB.v }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {readA, setA} from "./a.aktion"',
        'import {readB} from "./b.aktion"',
        "$probe = null",
        '$effect(() => { setA("Z"); $probe = readA() + readB() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    expect(await probe(files)).toBe("ZB");
  });

  it("still returns ONE handle per call site — a store read twice is the same store", async () => {
    // The de-collision must not turn into a store per read: the whole contract
    // of `$store` is a stable app-global singleton.
    const files = {
      "/p/a.aktion": [
        'export sA = $store({n: 0, bump: (s) => { s.n = s.n + 1 }})',
        "export function bump() { sA.bump() }",
        "export function readA() { return sA.n }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {bump, readA} from "./a.aktion"',
        "$probe = null",
        '$effect(() => { bump(); bump(); $probe = readA() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    expect(await probe(files)).toBe(2);
  });
});

describe("$form identity across modules", () => {
  it("gives two modules their own form when the calls share a line and column", async () => {
    const files = {
      "/p/fa.aktion": [
        'export fA = $form({values: {v: "A"}})',
        "export function readFA() { return fA.values.v }",
      ].join("\n"),
      "/p/fb.aktion": [
        'export fB = $form({values: {v: "B"}})',
        "export function readFB() { return fB.values.v }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {readFA} from "./fa.aktion"',
        'import {readFB} from "./fb.aktion"',
        "$probe = null",
        '$effect(() => { $probe = readFA() + readFB() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    expect(await probe(files)).toBe("AB");
  });

  it("keeps setField on one form out of the other", async () => {
    const files = {
      "/p/fa.aktion": [
        'export fA = $form({values: {v: "A"}})',
        "export function readFA() { return fA.values.v }",
        'export function setFA(next) { fA.setField("v", next) }',
      ].join("\n"),
      "/p/fb.aktion": [
        'export fB = $form({values: {v: "B"}})',
        "export function readFB() { return fB.values.v }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {readFA, setFA} from "./fa.aktion"',
        'import {readFB} from "./fb.aktion"',
        "$probe = null",
        '$effect(() => { setFA("Z"); $probe = readFA() + readFB() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    expect(await probe(files)).toBe("ZB");
  });
});

describe("a $store and a $form in different modules do not collide", () => {
  it("keeps them apart even at the same line and column", async () => {
    // They share one cache (`ctx.stores`), so before the fix a `$form` could be
    // handed a `$store` handle — a wrong-KIND collision, not just a wrong-instance
    // one, which fails as a missing method rather than as bad data.
    const files = {
      "/p/s.aktion": [
        'export s = $store({v: "S"})',
        "export function readS() { return s.v }",
      ].join("\n"),
      "/p/f.aktion": [
        'export f = $form({values: {v: "F"}})',
        "export function readF() { return f.values.v }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {readS} from "./s.aktion"',
        'import {readF} from "./f.aktion"',
        "$probe = null",
        '$effect(() => { $probe = readS() + readF() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    expect(await probe(files)).toBe("SF");
  });
});

describe("the call-site key is unchanged where it was already correct", () => {
  it("names an entry-module store atom by line and column alone", async () => {
    // The key doubles as the default `persist` key and as the backing atom's
    // name, so widening it for source 0 would orphan data an earlier version
    // persisted and rename atoms a host may have snapshotted. The linker stamps
    // the entry as source 0, which is falsy — so the entry keeps the old form
    // whether or not the program was linked.
    const files = {
      "/p/a.aktion": ['export function noop() { return 1 }'].join("\n"),
      "/p/app.aktion": [
        'import {noop} from "./a.aktion"',
        'view = $store({v: noop()})',
        "$probe = null",
        '$effect(() => { $probe = view.v }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    const screen = renderCompiled(link(files, "/p/app.aktion"));
    await flush(12);
    expect(screen.state.get("probe")).toBe(1);
    // No module scope in the name: `__store_<line>_<column>`, the pre-fix form.
    const stores = Object.keys(screen.state.snapshot()).filter((name) => name.startsWith("__store_"));
    expect(stores).toHaveLength(1);
    expect(stores[0]).toMatch(/^__store_2_\d+$/);
  });

  it("scopes an imported module's store atom by its module index", async () => {
    const files = {
      "/p/a.aktion": [
        'export sA = $store({v: "A"})',
        "export function readA() { return sA.v }",
      ].join("\n"),
      "/p/app.aktion": [
        'import {readA} from "./a.aktion"',
        "$probe = null",
        '$effect(() => { $probe = readA() }, ["mount"])',
        '$app(Text("probe"))',
      ].join("\n"),
    };
    const screen = renderCompiled(link(files, "/p/app.aktion"));
    await flush(12);
    expect(screen.state.get("probe")).toBe("A");
    // `a.aktion` is not the entry, so its atom carries the module scope —
    // mirroring the linker's own `__effect_a<id>_` convention.
    const names = screen.state.snapshot();
    const stores = Object.keys(names).filter((name) => name.startsWith("__store_"));
    expect(stores).toHaveLength(1);
    expect(stores[0]).toMatch(/^__store_a\d+_1_\d+$/);
  });
});
