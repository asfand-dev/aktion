/**
 * What the generated `name.d.aktion.ts` declarations say (src/plugin/declarations.ts):
 * parameter types from literal defaults, hook arity, atom types from their
 * initializers and every write the module makes, typed named-props overloads
 * with `key`, collision-free names — and modules reached through an `alias`. Each claim is checked by a real `tsc`
 * run with `skipLibCheck: false`, so an invalid declaration fails the test
 * instead of hiding behind the templates' `skipLibCheck: true`.
 *
 * The negative probe uses the directive format of
 * tests/fixtures/dsl-types/negative.dsl.ts: one case per line, preceded by
 * `// @ts-expect-error <TS code> <why>`. It must compile as written (every
 * directive used), and with the directives blanked every case line must fail
 * with exactly its code and no other line may fail.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  aktionDeclarationText,
  aktionPlugin,
  compileAktionSource,
  emitAktionDeclarations,
  updateAktionDeclaration,
} from "../src/plugin/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import { ensurePluginDist, repoRoot } from "./fixtures/tooling/plugin-dist.js";

const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");
const binScript = join(repoRoot, "bin/aktion-dts.mjs");

let work = "";
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "aktion-decl-"));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

function put(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
}

/** `aktion-runtime/dsl` → the committed declarations, beside a stand-in for the runtime module they take `CompiledProgram` from. */
function stageDsl(root: string): string {
  put(root, {
    "stage/dsl/index.d.ts": readFileSync(join(repoRoot, "src/dsl/index.d.ts"), "utf8"),
    "stage/compiler/runtime.d.ts":
      "export interface CompiledProgram { readonly __aktionCompiled: 1; readonly program: unknown; readonly source: string; readonly path: string; readonly sourcesContent?: readonly string[] }\n",
  });
  return join(root, "stage/dsl/index.d.ts");
}

const compilerOptions = (dsl: string, extra: Record<string, unknown> = {}) => ({
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  lib: ["ES2022", "DOM"],
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  allowImportingTsExtensions: true,
  allowArbitraryExtensions: true,
  rootDirs: ["src", ".aktion-types/src"],
  ...extra,
  paths: { "aktion-runtime/dsl": [dsl], ...((extra.paths as Record<string, string[]>) ?? {}) },
});

function tsc(config: string): { code: number; output: string } {
  const run = spawnSync(process.execPath, [tscBin, "-p", config], { encoding: "utf8" });
  return { code: run.status ?? 1, output: `${run.stdout}${run.stderr}` };
}

/** `{ line, code }` of every case in a negative probe (the line after each directive, 1-based). */
function expectedFailures(text: string): Array<{ line: number; code: string }> {
  const out: Array<{ line: number; code: string }> = [];
  text.split("\n").forEach((line, i) => {
    const m = /^\s*\/\/ @ts-expect-error (TS\d+)\b/.exec(line);
    if (m) out.push({ line: i + 2, code: m[1]! });
  });
  return out;
}

/** `{ line, code }` of every error tsc reported in `file`. */
function reportedFailures(output: string, file: string): Array<{ line: number; code: string }> {
  const out: Array<{ line: number; code: string }> = [];
  for (const m of output.matchAll(/^(.*?)\((\d+),\d+\): error (TS\d+)/gm)) {
    if (m[1]!.endsWith(file)) out.push({ line: Number(m[2]), code: m[3]! });
  }
  return out;
}

/* -------------------------------------------------------------------------- */

const PILL = [
  "export let $items = []",
  'export $user = { name: "Ada", age: 3 }',
  'export $res = $http({ url: "/x" })',
  'export $pages = $query({ url: "/x", infinite: { param: "page" } })',
  'export $signup = $form({ values: { email: "" } })',
  "export $selected = null",
  "export $count = 0",
  "export function Pill(label, tone = \"muted\", { size }) { return Text(label) }",
  "export function bump(by = 1) { $count = $count + by; $selected = 3 }",
  "export function $useThing(a, b) { return a }",
  "export function Shell(title) { return Column([Text(title), children]) }",
  "export function Row2(label) { return Text(label) }",
  "export function Panel(children) { return Column([slots.header, children]) }",
  "",
].join("\n");

const TWO = 'export function Two(label = "x", count = 0) { return Text(label) }\n';

const CLASH = [
  "export compiled = 5",
  'export function Foo({ a }, p0) { return Text("x") }',
  "export class = 1",
  // React-habit components: a parameter called `props`.
  'export function Card(props) { return Text("x") }',
  "export function Card2(title, props) { return Text(title) }",
  "",
].join("\n");

const HANDLES = [
  'export $sock = $socket({ url: "wss://example.test/ws" })',
  'export $events = $sse({ url: "/events" })',
  'export $scr = $script({ src: "/vendor.js" })',
  'export $tr = $i18n({ defaultLanguage: "en" })',
  'export $th = $theme({ name: "dark" })',
  'export let $todos = [{ id: 1, title: "Buy milk" }, { id: 2, title: "Walk", done: true }]',
  'export let $filters = { status: "all" }',
  'export let $tags = ["a"]',
  'export let $prefs = { theme: "dark" }',
  "export let $code = null",
  "export let $ticks = 0",
  "export function clear() {",
  "  $filters.status = null",
  "  $tags[0] = 5",
  '  $prefs.lang = "de"',
  '  $code ??= "A1"',
  "  $ticks++",
  "}",
  "",
].join("\n");

describe("what a declaration states", () => {
  const text = aktionDeclarationText(PILL, "src/pill.aktion").text;

  it("types a parameter from its literal default, with `null` (only `undefined` selects the default)", () => {
    expect(text).toContain('export declare function Pill(label?: any, tone?: string | null, p2?: any, ...children: Children[]): AktionNode<"Pill">;');
    expect(text).toContain("export declare function bump(by?: number | null): any;");
  });

  it("checks a hook's arity, as an action's", () => {
    expect(text).toContain("export declare function $useThing(a?: any, b?: any): any;");
  });

  it("types atoms from array, object and resource initializers, widened by the module's assignments", () => {
    expect(text).toContain("export declare let $items: any[];");
    expect(text).toContain("export declare let $user: { name: string; age: number };");
    expect(text).toContain("export declare let $res: HttpResource<unknown>;");
    expect(text).toContain("export declare let $pages: InfiniteQueryResource<unknown>;");
    expect(text).toContain("export declare let $signup: FormHandle<{ email: string }>;");
    // `null` at first, a number once `bump` ran.
    expect(text).toContain("export declare let $selected: number | null;");
    // `$count = $count + by` keeps a primitive's kind.
    expect(text).toContain("export declare let $count: number;");
  });

  it("types the positionals after the props as the parameters they fill", () => {
    // `Pill({ key: 1 }, "x")` binds "x" to `label`, not to `children`.
    expect(text).toContain(
      'export declare function Pill(props: PillProps & { readonly label?: never } & ({ readonly key: Key } | { readonly tone: string | null | undefined }), label: any): AktionNode<"Pill">;',
    );
    expect(text).toContain(
      'export declare function Pill(props: PillProps & { readonly label?: never; readonly tone?: never } & { readonly key: Key }, label: any, tone: string | null | undefined): AktionNode<"Pill">;',
    );
    // Children only once every parameter is filled.
    expect(text).toContain(
      'export declare function Pill(label: any, props: PillProps & { readonly label?: never; readonly tone?: never }, tone: string | null | undefined, p2: any, ...children: Children[]): AktionNode<"Pill">;',
    );
    expect(text).not.toMatch(/function Pill\(props: [^)]*\), \.\.\.children/);
  });

  it("types the resource handles each builtin returns", () => {
    const { text: handles } = aktionDeclarationText(HANDLES);
    expect(handles).toContain("export declare let $sock: SocketResource<unknown>;");
    expect(handles).toContain("export declare let $events: SseResource<unknown>;");
    expect(handles).toContain("export declare let $scr: ScriptResource<unknown>;");
    expect(handles).toContain("export declare let $tr: I18nInstance;");
    expect(handles).toContain("export declare let $th: ThemeHandle;");
    expect(handles).toContain(
      'import type { CompiledProgram, I18nInstance, ScriptResource, SocketResource, SseResource, ThemeHandle } from "aktion-runtime/dsl";',
    );
  });

  it("widens an atom by every write: through a member, an index, a compound assignment, `++`", () => {
    const { text: handles } = aktionDeclarationText(HANDLES);
    expect(handles).toContain("export declare let $filters: any;");
    expect(handles).toContain("export declare let $tags: any;");
    expect(handles).toContain("export declare let $prefs: any;");
    // `??=` stores its operand; `++` leaves a number.
    expect(handles).toContain("export declare let $code: string | null;");
    expect(handles).toContain("export declare let $ticks: number;");
    const writes = (body: string, init = '{ a: "x" }'): string =>
      aktionDeclarationText(`export let $v = ${init}\nexport function f() { ${body} }`).text.match(/declare let \$v: (.*);/)![1]!;
    expect(writes("$v.a = 1")).toBe("any");
    expect(writes("$v.a += 1")).toBe("any");
    expect(writes("$v.n++")).toBe("any");
    expect(writes("delete $v.a")).toBe("any");
    expect(writes("$v.list.push(1)", "{ list: [] }")).toBe("any");
    expect(writes("Object.assign($v, { b: 1 })")).toBe("any");
    expect(writes("$v.push(null)", "[1]")).toBe("any");
    // The runtime turns a primitive written through a member into an object.
    expect(writes("$v.a = 1", '"s"')).toBe("any");
    expect(writes("$v.length = 9", "0")).toBe("any");
    expect(writes("$v += 1", '"s"')).toBe("string");
    expect(writes('$v += "px"', "0")).toBe("number | string");
    expect(writes("$v -= 1", '"s"')).toBe("string | number");
    expect(writes("$v ||= 2", "null")).toBe("number | null");
    expect(writes("$v += 1", "[1]")).toBe("any");
    // A single-expression lambda body assigns too.
    expect(aktionDeclarationText('export let $v = "s"\nexport const f = () => $v = null').text).toContain(
      "export declare let $v: string | null;",
    );
  });

  it("merges object literals into one shape, a key optional where one lacks it", () => {
    const { text: handles } = aktionDeclarationText(HANDLES);
    expect(handles).toContain("export declare let $todos: Array<{ id: number; title: string; done?: boolean }>;");
    const type = (src: string): string => aktionDeclarationText(src).text.match(/declare let \$v: (.*);/)![1]!;
    expect(type('export let $v = [{ meta: { a: 1 } }, { meta: { b: "x" } }, { meta: null }]')).toBe(
      "Array<{ meta: { a?: number; b?: string } | null }>",
    );
    expect(type('export let $v = [{ id: 1 }, "x"]')).toBe("Array<{ id: number } | string>");
    expect(type("export let $v = [{ on: null }, { on: () => 1 }]")).toBe("Array<{ on: ((...args: any[]) => any) | null }>");
    expect(type('export let $v = { name: "Ada" }\nexport function f() { $v = { name: "Bob", age: 3 } }')).toBe(
      "{ name: string; age?: number }",
    );
    expect(type("export let $v = [1]\nexport function f() { $v = [] }")).toBe("any[]");
  });

  it("forgets an object's shape once the module assigns it something unknown", () => {
    const { text: spread } = aktionDeclarationText(
      'export $user = { name: "Ada" }\nexport function rename(n) { $user = { ...$user, name: n } }',
    );
    expect(spread).toContain("export declare let $user: any;");
  });

  it("declares named props with `key` and named slots, after any prefix of the parameters", () => {
    expect(text).toContain("export interface PillProps {");
    expect(text).toContain("  readonly key?: Key;");
    expect(text).toContain("  readonly tone?: string | null;");
    expect(text).toContain("  readonly [slot: string]: unknown;");
    expect(text).toContain('import type { AktionNode, Children, CompiledProgram, FormHandle, HttpResource, InfiniteQueryResource, Key } from "aktion-runtime/dsl";');
  });

  it("never declares an identifier twice", () => {
    const { text: clash } = aktionDeclarationText(
      [
        "export compiled = 5",
        "export function Foo({ a }, p0) { return Text(\"x\") }",
        "export $x = 0",
        'export $x = "s"',
        "export function act(new, class) { return 1 }",
        "export class = 1",
        'export function Card(props) { return Text("x") }',
        "export function Card2(title, props) { return Text(title) }",
      ].join("\n"),
    );
    expect(clash).toContain("export declare const compiled: number;");
    expect(clash).toContain("declare const _compiled: CompiledProgram;\nexport default _compiled;");
    expect(clash).toContain('export declare function Foo(_p0?: any, p0?: any, ...children: Children[]): AktionNode<"Foo">;');
    expect(clash.match(/declare let \$x\b/g)).toHaveLength(1);
    expect(clash).toContain("export declare let $x: string | number;");
    expect(clash).toContain("export declare function act(_new?: any, _class?: any): any;");
    expect(clash).toContain("declare const _class: number;\nexport { _class as class };");
    // A parameter called `props` moves the overloads' own props aside.
    expect(clash).toContain('export declare function Card(_props: CardProps & { readonly props?: never }, props: any, ...children: Children[]): AktionNode<"Card">;');
    expect(clash).toContain(
      'export declare function Card2(title: any, props: any, _props: Card2Props & { readonly title?: never; readonly props?: never }, ...children: Children[]): AktionNode<"Card2">;',
    );
    expect(clash).not.toMatch(/\bprops: [^,)]*, props:/);
  });
});

describe("the declarations type-check, and type what the runtime binds", () => {
  let project = "";
  const GOOD = [
    'import { Text, type AktionNode } from "aktion-runtime/dsl";',
    'import app, { Pill, bump, $useThing, Shell, Row2, Panel, $items, $user, $res, $pages, $signup, $selected, $count } from "./pill.aktion";',
    'import { compiled, Foo, Card, Card2 } from "./clash.aktion";',
    'import { $later } from "./late.aktion";',
    'import { Two } from "./two.aktion";',
    'import { $sock, $events, $scr, $tr, $th, $todos, $filters, $tags, $prefs, $code, $ticks } from "./handles.aktion";',
    'export const a: AktionNode<"Pill"> = Pill("x");',
    'export const b = [Pill("x", "muted"), Pill("x", null), Pill("x", { key: 1 }), Pill("x", { tone: "loud" }), Pill("x", { tone: undefined })];',
    'export const c = Pill({ label: "x", tone: "y", key: "k" });',
    // `{ size: 1 }` names no parameter and the positionals before it do not
    // fill all three: it binds positionally, to the `{ size }` pattern.
    'export const d = Pill("x", "muted", { size: 1 });',
    'export const e = Pill("x", "muted", undefined, { header: Text("h") });',
    'export const f = [Shell("S", Text("child")), Shell("S", Text("A"), { key: "k" }), Shell("S", { key: 2 }, Text("c"))];',
    'export const g = [Row2("r", { key: "k1" }), Panel(Text("body"), { header: Text("H") })];',
    "bump(); bump(2); bump(null);",
    "$useThing(1, 2);",
    "export const n: number = compiled + $count + $items.length + $user.age + $pages.data.length;",
    "export const o: string = $user.name + $signup.values.email;",
    "export const p: boolean = $res.loading;",
    "export const q: number | null = $selected;",
    "export const r = [app.program, Foo({ a: 1 }, 2)];",
    "export const u: boolean | undefined = $later?.loading;",
    // Positionals after the props fill the parameters, then `children`.
    'export const v = [Pill({ key: "k" }, "g", "loud"), Two({ key: "k" }, "s", 7, "kid"), Two({ count: 2 }, "t"), Two()];',
    'export const w = [Card({ title: "x" }), Card(1, { key: 1 }), Card2("t", { key: 1 }), Card2("t", { props: 2 })];',
    // One member of each resource handle: a renamed dsl export fails the declaration.
    "export const x: [boolean, unknown, boolean, string, Readonly<Record<string, string>>] = [$sock.connected, $events.last, $scr.ready, $tr.t(\"k\"), $th.tokens];",
    // Merged shapes read the key only some elements have.
    "export const y: number[] = $todos.filter((t) => t.done === true).map((t) => t.id + t.title.length);",
    // Written through a member, so typed by what the writes leave.
    "export const z: [null, number, string] = [$filters.status, $tags[0], $prefs.lang];",
    "export const zz: [string | null, number] = [$code, $ticks];",
    "",
  ].join("\n");
  const BAD = [
    'import { Pill, bump, $useThing, Shell, Row2, $res, $user, $items, $selected } from "./pill.aktion";',
    'import { Two } from "./two.aktion";',
    'import { $code, $todos } from "./handles.aktion";',
    "// @ts-expect-error TS2769 a number where the default says string",
    'Pill("x", 42);',
    "// @ts-expect-error TS2769 `key` is a string or a number",
    'Pill("x", { key: {} });',
    "// @ts-expect-error TS2769 names no parameter, so the runtime binds it to `tone`",
    'Pill("x", { size: 1 });',
    "// @ts-expect-error TS2769 `label` given twice: the runtime drops the positional one",
    'Pill("x", { label: "again" });',
    "// @ts-expect-error TS2345 a boolean key",
    'Row2("r", { key: true });',
    "// @ts-expect-error TS2345 `title` given twice",
    'Shell("S", { title: "dup" });',
    "// @ts-expect-error TS2345 the default says number",
    'bump("not a number");',
    "// @ts-expect-error TS2554 a hook's arity is checked",
    "$useThing(1, 2, 3, 4);",
    "// @ts-expect-error TS2339 a resource has no such field",
    "$res.whatever;",
    "// @ts-expect-error TS2339 the object literal has no such field",
    "$user.nope;",
    "// @ts-expect-error TS2322 an array is not a string",
    "export const s: string = $items;",
    "// @ts-expect-error TS2322 may be null",
    "export const t: number = $selected;",
    "// @ts-expect-error TS2769 the 42 after the props is `label`, whose default says string",
    "Two({ key: 1 }, 42);",
    "// @ts-expect-error TS2769 `label` given after the props and by name: the runtime drops the positional one",
    'Two({ label: "a" }, "s");',
    "// @ts-expect-error TS2769 `count` given after the props and by name",
    'Two({ count: 1 }, "s", 2);',
    "// @ts-expect-error TS2322 `??=` may store a string",
    "export const c: number = $code;",
    "// @ts-expect-error TS2339 no element has such a key",
    "$todos[0]!.nope;",
    "",
  ].join("\n");

  beforeAll(() => {
    project = join(work, "precision");
    put(project, {
      "src/pill.aktion": PILL,
      "src/clash.aktion": CLASH,
      "src/two.aktion": TWO,
      "src/handles.aktion": HANDLES,
      // The resource type comes from an assignment only: its import must too.
      "src/late.aktion": 'export $later = null\nexport function load() { $later = $mutation({ url: "/y" }) }\n',
      "src/good.aktion.ts": GOOD,
      "src/bad.aktion.ts": BAD,
    });
    const dsl = stageDsl(project);
    // `.aktion-types` is included, so tsc checks the declarations themselves.
    for (const [name, file] of [["tsconfig.good.json", "src/good.aktion.ts"], ["tsconfig.bad.json", "src/bad.aktion.ts"]] as const) {
      writeFileSync(join(project, name), JSON.stringify({ compilerOptions: compilerOptions(dsl), files: [file], include: [".aktion-types"] }));
    }
    emitAktionDeclarations({ root: project });
  });

  it("the declarations are valid TypeScript, and the calls the runtime accepts type-check", () => {
    const run = tsc(join(project, "tsconfig.good.json"));
    expect(run.output).toBe("");
    expect(run.code).toBe(0);
  }, 60_000);

  it("every call the runtime binds wrongly fails with its annotated code", () => {
    const asWritten = tsc(join(project, "tsconfig.bad.json"));
    expect(asWritten.output).toBe("");
    writeFileSync(join(project, "src/bad.aktion.ts"), BAD.replace(/^(\s*)\/\/ @ts-expect-error .*$/gm, "$1//"));
    try {
      const blanked = tsc(join(project, "tsconfig.bad.json"));
      const reported = reportedFailures(blanked.output, "src/bad.aktion.ts");
      expect(reported).toEqual(expectedFailures(BAD));
      expect(reported.length).toBe(17);
    } finally {
      writeFileSync(join(project, "src/bad.aktion.ts"), BAD);
    }
  }, 60_000);
});

describe("the overloads follow the runtime's binding", () => {
  afterAll(() => cleanup());

  // What the negative probe rejects is what the runtime gets wrong: each row
  // prints how `Pill(label, tone = "muted", { size })` bound its arguments.
  it("binds the calls the types reject the way their comments say", async () => {
    const program = compileAktionSource(
      [
        'function Pill(label, tone = "muted", { size }) { return Text("[" + label + "|" + tone + "|" + size + "]") }',
        'function Two(label = "x", count = 0) { return Text("(" + label + "|" + count + "|" + children + ")") }',
        "$app(Column([",
        '  Pill("a", "muted", { size: 1 }),', // positional: the `{ size }` pattern
        '  Pill("b", { size: 2 }),', //          positional too — into `tone`
        '  Pill("c", { label: "again" }),', //   named: the positional "c" is dropped
        '  Pill("d", null),', //                  `null` is passed, not defaulted
        '  Pill("e", { tone: undefined }),', //   named, and `undefined` defaults
        '  Pill("f", "muted", undefined, { size: 3 }),', // every slot filled: a named slot
        '  Pill({ key: "k" }, "g", "loud"),', //  after the props: `label`, then `tone`
        '  Two({ key: "k" }, "s", 7, "kid"),', // the parameters, then `children`
        "  Two({ key: 1 }, 42),", //               so the 42 is `label`
        '  Two({ label: "a" }, "lost"),', //       named `label` wins; the positional is dropped
        '  Two({ count: 1 }, "t", 2),', //         named `count` wins; the 2 is dropped
        "]))",
      ].join("\n"),
      join(work, "binding.aktion"),
      { root: work },
    );
    const screen = renderCompiled(program);
    await flush();
    const text = screen.shadowRoot.textContent ?? "";
    expect(text).toContain("[a|muted|1]");
    expect(text).toContain('[b|{"size":2}|]');
    expect(text).toContain("[again|muted|]");
    expect(text).toContain("[d||]");
    expect(text).toContain("[e|muted|]");
    expect(text).toContain("[f|muted|3]");
    expect(text).toContain("[g|loud|]");
    expect(text).toContain("(s|7|kid)");
    expect(text).toContain("(42|0|)");
    expect(text).toContain("(a|0|)");
    expect(text).toContain("(t|1|)");
    expect(text).not.toContain("lost");
  });
});

/* -------------------------------------------------------------------------- */
/*  A monorepo library reached through an alias                                */
/* -------------------------------------------------------------------------- */

describe("modules reached through an alias", () => {
  let mono = "";
  let app = "";
  beforeAll(() => {
    mono = join(work, "mono");
    app = join(mono, "apps/web");
    put(mono, {
      "aktion.config.json": JSON.stringify({ alias: { "@acme/ui": "./libs/ui/src" } }),
      "libs/ui/src/badge.aktion": 'export accent = "teal"\nexport function Badge(label, tone = "info") { return Text(label) }\n',
      "libs/ui/src/forms/field.aktion": "export function Field(label) { return Text(label) }\n",
      "apps/web/src/main.aktion.ts": [
        'import { Badge, accent } from "@acme/ui/badge.aktion";',
        'import { Field } from "@acme/ui/forms/field.aktion";',
        'export const view = [Badge(accent, { key: 1 }), Field("Name")];',
        "// @ts-expect-error the default says string",
        'Badge("x", 5);',
        "",
      ].join("\n"),
    });
    const dsl = stageDsl(app);
    writeFileSync(
      join(app, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: compilerOptions(dsl, {
          // TypeScript needs the alias either way; the second entry finds the mirror.
          paths: { "@acme/ui/*": ["../../libs/ui/src/*", "./.aktion-types/@acme/ui/*"] },
        }),
        files: ["src/main.aktion.ts"],
        include: [".aktion-types"],
      }),
    );
  });

  const alias = (): Record<string, string> => ({ "@acme/ui": join(mono, "libs/ui/src") });

  it("mirrors the library under `.aktion-types/<prefix>/`, which tsc resolves through `paths`", () => {
    const result = emitAktionDeclarations({ root: app, alias: alias() });
    expect(result.written.map((p) => p.slice(app.length + 1)).sort()).toEqual([
      ".aktion-types/@acme/ui/badge.d.aktion.ts",
      ".aktion-types/@acme/ui/forms/field.d.aktion.ts",
    ]);
    expect(result.warnings).toEqual([]);
    const run = tsc(join(app, "tsconfig.json"));
    expect(run.output).toBe("");
    expect(run.code).toBe(0);
  }, 60_000);

  it("keeps the mirror current: an edit rewrites it, a deletion removes it, a re-emit leaves it alone", () => {
    emitAktionDeclarations({ root: app, alias: alias() });
    const field = join(mono, "libs/ui/src/forms/field.aktion");
    const mirrored = join(app, ".aktion-types/@acme/ui/forms/field.d.aktion.ts");
    writeFileSync(field, "export function Field(label, hint) { return Text(label) }\n");
    expect(updateAktionDeclaration(field, { root: app, alias: alias() }).written).toEqual([mirrored]);
    expect(readFileSync(mirrored, "utf8")).toContain("Field(label?: any, hint?: any, ...children: Children[])");
    expect(emitAktionDeclarations({ root: app, alias: alias() }).written).toEqual([]);
    rmSync(field);
    expect(emitAktionDeclarations({ root: app, alias: alias() }).removed).toEqual([mirrored]);
    expect(existsSync(mirrored)).toBe(false);
    writeFileSync(field, "export function Field(label) { return Text(label) }\n");
  });

  it("the plugin's `dts` option takes the alias from aktion.config.json", async () => {
    rmSync(join(app, ".aktion-types"), { recursive: true, force: true });
    const plugin = aktionPlugin({ dts: true }) as unknown as {
      configResolved: (c: { command: string; root: string }) => void;
      buildStart: (this: unknown) => Promise<void>;
    };
    const warnings: string[] = [];
    plugin.configResolved({ command: "build", root: app });
    await plugin.buildStart.call({ warn: (m: string) => warnings.push(m) });
    expect(existsSync(join(app, ".aktion-types/@acme/ui/badge.d.aktion.ts"))).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("an `include` glob that leaves the root is reported, not silently empty", () => {
    const result = emitAktionDeclarations({ root: app, include: ["../../libs/ui/src/**/*.aktion"], write: false });
    expect(result.written).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/include "\.\.\/\.\.\/libs\/ui\/src\/\*\*\/\*\.aktion" matches nothing.*`alias`/);
  });

  describe("the aktion-dts bin", () => {
    beforeAll(() => ensurePluginDist(), 120_000);
    const run = (args: string[]) => spawnSync(process.execPath, [binScript, ...args], { cwd: app, encoding: "utf8" });

    it("reads aktion.config.json like the plugin, unless `--no-config`", () => {
      rmSync(join(app, ".aktion-types"), { recursive: true, force: true });
      const none = run(["--no-config"]);
      expect(none.status).toBe(0);
      expect(existsSync(join(app, ".aktion-types/@acme/ui/badge.d.aktion.ts"))).toBe(false);
      const written = run([]);
      expect(written.status).toBe(0);
      expect(written.stdout).toContain("wrote .aktion-types/@acme/ui/badge.d.aktion.ts");
      expect(run(["--check"]).status).toBe(0);
    });

    it("prints the warnings", () => {
      const bad = run(["--include", "../../libs/ui/src/**/*.aktion", "--quiet"]);
      expect(bad.status).toBe(0);
      expect(bad.stderr).toContain('warning: include "../../libs/ui/src/**/*.aktion" matches nothing');
    });
  });
});
