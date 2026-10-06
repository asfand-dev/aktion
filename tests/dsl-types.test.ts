/**
 * `aktion-runtime/dsl` — the generated, committed declarations and manifest
 * (`src/dsl/{index.d.ts,globals.d.ts,manifest.json}`, written by
 * `scripts/emit-dsl-types.mjs`).
 *
 * Types that describe a runtime are only worth having if they cannot drift from
 * it, and every way they could is pinned here:
 *
 *   1. freshness — a fresh generation is byte-identical to the committed files;
 *   2. runtime ⇄ catalogue ⇄ manifest ⇄ declarations — every component, `$`-name
 *      and injected name the runtime honours is in the manifest and declared,
 *      and every member of every namespace / resource handle agrees across the
 *      live runtime value, the runtime's own TS interface, the language
 *      catalogue and the generated interface;
 *   3. `tsc` fixtures — §5.2-style programs type-check (with the real
 *      `CompiledProgram`, without the DOM lib, and in the ambient flavour), and
 *      a negative corpus fails line by line with the annotated error code;
 *   4. the binding oracle — real calls through the evaluator land every argument
 *      in exactly the slot the manifest (and therefore the overloads) names.
 *
 * The tsc runs are separate processes started in `beforeAll` and awaited by the
 * tests, so they overlap with each other and with the in-process checks.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import manifest from "../src/dsl/manifest.json";
import { defaultLibrary } from "../src/library/index.js";
import { findPositionalIndex, propExpectsObject, type ComponentSpec } from "../src/library/types.js";
import { UNIVERSAL_PROP_NAMES } from "../src/library/sx.js";
import { validateProgramSchema } from "../src/library/validate.js";
import { builtinCatalog } from "../src/language/builtins.js";
import {
  factoryResourceCatalog,
  findBuiltinConfig,
  i18nResultMembers,
  namespaceCatalog,
  routeMembers,
  type NamespaceMember,
} from "../src/language/namespaces.js";
import { parse } from "../src/parser/index.js";
import type { Expression, Program } from "../src/parser/types.js";
import { createContext, evaluate, type ComponentNode, type EvaluationContext } from "../src/runtime/evaluator.js";
import { StateStore } from "../src/runtime/state.js";
import { Util } from "../src/runtime/util.js";
import { Rules, Style } from "../src/runtime/namespaces-extra.js";
import { createHttpResource, createMutationResource, createQueryResource } from "../src/runtime/http.js";
import { createSocketResource, createSseResource } from "../src/runtime/realtime.js";
import { createScriptResource } from "../src/runtime/interop.js";
import { createI18n } from "../src/runtime/i18n.js";
import { cleanup as cleanupScreens, flush, render } from "../src/testing/index.js";
import { RESERVED_WORDS } from "../scripts/dsl-types/components.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dslDir = resolve(repoRoot, "src/dsl");
const fixtureDir = resolve(repoRoot, "tests/fixtures/dsl-types");
const tscBin = resolve(repoRoot, "node_modules/typescript/bin/tsc");
const emitter = resolve(repoRoot, "scripts/emit-dsl-types.mjs");
const OUTPUT_FILES = ["index.d.ts", "globals.d.ts", "manifest.json"] as const;
const read = (path: string): string => readFileSync(path, "utf8");

/* ---------------------------------------------------------------- processes */

interface Run { code: number | null; output: string }

function node(args: readonly string[]): Promise<Run> {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", (error) => done({ code: -1, output: `${output}${String(error)}` }));
    child.on("close", (code) => done({ code, output }));
  });
}

interface TscError { file: string; line: number; code: string; message: string }

/** `file(line,col): error TSxxxx: message` lines of a `--pretty false` run. */
function tscErrors(output: string): TscError[] {
  const out: TscError[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line);
    if (m) out.push({ file: m[1]!, line: Number(m[2]), code: m[3]!, message: m[4]! });
  }
  return out;
}

const tsc = (project: string): Promise<Run> => node([tscBin, "-p", project, "--pretty", "false"]);

/* ---------------------------------------------------------------- the negative corpus */

/**
 * The negative corpora: every `negative*.dsl.ts` next to this file
 * (`negative.dsl.ts`, plus one `negative.<area>.dsl.ts` per surface, so each
 * area owns its cases).
 */
const CORPORA = readdirSync(fixtureDir).filter((f) => /^negative(\.[\w-]+)?\.dsl\.ts$/.test(f)).sort();
/** The positive module fixtures: `surface*.aktion.ts` (one per area) next to `app.aktion.ts`. */
const SURFACES = readdirSync(fixtureDir).filter((f) => /^surface(\.[\w-]+)?\.aktion\.ts$/.test(f)).sort();
/** A real directive: `// @ts-expect-error` opening a line comment (prose that mentions one is not). */
const ANY_DIRECTIVE = /^\s*\/\/ @ts-expect-error\b/;
const DIRECTIVE = /^\s*\/\/ @ts-expect-error (TS\d+)(?: \[(validator|parser|types)\])? (.+)$/;

interface Case { file: string; line: number; code: string; layer?: "validator" | "parser" | "types"; why: string; source: string }

function corpusCases(): Case[] {
  const cases: Case[] = [];
  for (const file of CORPORA) {
    const lines = read(resolve(fixtureDir, file)).split("\n");
    lines.forEach((text, i) => {
      if (!ANY_DIRECTIVE.test(text)) return;
      const m = DIRECTIVE.exec(text);
      if (!m) throw new Error(`${file}:${i + 1}: malformed directive — expected "// @ts-expect-error TS<code> [layer] why"`);
      cases.push({ file, line: i + 2, code: m[1]!, layer: m[2] as Case["layer"], why: m[3]!, source: lines[i + 1]!.trim() });
    });
  }
  return cases;
}

/** The staged, directive-free copy of a corpus file. */
const strippedName = (file: string): string => file.replace(/\.dsl\.ts$/, ".stripped.ts");

/* ---------------------------------------------------------------- staging */

/**
 * The flavours a user can hit, beyond this repo's own flags: §5.4's recommended
 * options with and without the DOM lib, and the ambient flavour. These cannot
 * use src/ directly — `index.d.ts` imports `../compiler/runtime.js`, which from
 * src/dsl/ is the TypeScript SOURCE of the compiler (DOM-dependent) — so the
 * committed files are copied next to a declaration-only `CompiledProgram`,
 * mirroring the published `dist/types/` layout. `skipLibCheck: false` makes tsc
 * check the declarations themselves.
 */
const STUB_RUNTIME = [
  "// Declaration-only stand-in for dist/types/compiler/runtime.d.ts (members pinned by tests/dsl-types.test.ts).",
  "export interface CompiledProgram {",
  "  readonly __aktionCompiled: 1;",
  "  readonly program: unknown;",
  "  readonly source: string;",
  "  readonly path: string;",
  "  readonly sourcesContent?: readonly string[];",
  "}",
  "",
].join("\n");

let stage = "";
const runs: Record<string, Promise<Run>> = {};

function writeProject(name: string, lib: readonly string[], files: readonly string[]): string {
  const path = join(stage, `tsconfig.${name}.json`);
  writeFileSync(path, JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      lib,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      erasableSyntaxOnly: true,
      types: [],
      paths: { "aktion-runtime/dsl": [join(stage, "dsl/index.d.ts")] },
    },
    files,
  }, null, 2));
  return path;
}

beforeAll(() => {
  stage = mkdtempSync(join(tmpdir(), "aktion-dsl-types-"));
  runs.fresh = node([emitter, "--out-dir", join(stage, "fresh")]);

  mkdirSync(join(stage, "dsl"));
  mkdirSync(join(stage, "compiler"));
  for (const name of ["index.d.ts", "globals.d.ts"]) writeFileSync(join(stage, "dsl", name), read(join(dslDir, name)));
  writeFileSync(join(stage, "compiler/runtime.d.ts"), STUB_RUNTIME);
  // Each corpus with every directive blanked, so each case's own error shows.
  for (const file of CORPORA) {
    writeFileSync(join(stage, strippedName(file)), read(resolve(fixtureDir, file)).split("\n").map((l) => (ANY_DIRECTIVE.test(l) ? "//" : l)).join("\n"));
  }

  const moduleFixtures = ["app.aktion.ts", ...SURFACES, "host-usage.dsl.ts", ...CORPORA].map((f) => join(fixtureDir, f));
  const ambientFixtures = [join(stage, "dsl/globals.d.ts"), ...["ambient/app.aktion.ts", "ambient/negative.dsl.ts"].map((f) => join(fixtureDir, f))];
  runs.real = tsc(resolve(fixtureDir, "tsconfig.json"));
  runs.dom = tsc(writeProject("dom", ["ES2022", "DOM", "DOM.Iterable"], moduleFixtures));
  runs.nodom = tsc(writeProject("nodom", ["ES2022"], moduleFixtures));
  runs.ambient = tsc(writeProject("ambient", ["ES2022"], ambientFixtures));
  runs.ambientWithDom = tsc(writeProject("ambient-dom", ["ES2022", "DOM"], ambientFixtures));
  runs.stripped = tsc(writeProject("stripped", ["ES2022"], CORPORA.map((f) => join(stage, strippedName(f)))));
});

afterAll(async () => {
  await Promise.allSettled(Object.values(runs));
  if (stage) rmSync(stage, { recursive: true, force: true });
});

const TSC_TIMEOUT = 60_000;

/* ================================================================ 1. freshness */

describe("aktion-runtime/dsl — freshness", () => {
  it("the committed src/dsl files are byte-identical to a fresh generation", async () => {
    const run = await runs.fresh!;
    expect(run.code, run.output).toBe(0);
    for (const name of OUTPUT_FILES) {
      const fresh = read(join(stage, "fresh", name));
      const committed = read(join(dslDir, name));
      if (fresh === committed) continue;
      const a = fresh.split("\n");
      const b = committed.split("\n");
      let at = 0;
      while (at < Math.max(a.length, b.length) && a[at] === b[at]) at += 1;
      expect.fail(
        `src/dsl/${name} is stale — run \`npm run build:dsl-types\` and commit the result.\n` +
          `first difference at line ${at + 1}:\n  generated: ${a[at] ?? "<end of file>"}\n  committed: ${b[at] ?? "<end of file>"}`,
      );
    }
  }, TSC_TIMEOUT);

  it("carries no timestamp or version stamp (a release bump must not make it stale)", () => {
    for (const name of ["index.d.ts", "globals.d.ts"]) {
      const head = read(join(dslDir, name)).split("\n", 3).join("\n");
      expect(head).toContain("GENERATED by scripts/emit-dsl-types.mjs");
      expect(head).not.toMatch(/\d{4}-\d{2}-\d{2}|\b\d+\.\d+\.\d+\b/);
    }
  });
});

/* ================================================================ 2. the d.ts as a module */

/** Top-level declarations of a d.ts, by kind. */
function declarationsOf(text: string): { values: Map<string, number>; interfaces: Map<string, ts.InterfaceDeclaration>; types: Set<string> } {
  const sf = ts.createSourceFile("dsl.d.ts", text, ts.ScriptTarget.ES2022, true);
  const values = new Map<string, number>();
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  const types = new Set<string>();
  const exported = (s: ts.Statement): boolean =>
    (ts.canHaveModifiers(s) ? ts.getModifiers(s) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || !ts.isExternalModule(sf);
  for (const s of sf.statements) {
    if (!exported(s)) continue;
    if (ts.isFunctionDeclaration(s) && s.name) values.set(s.name.text, (values.get(s.name.text) ?? 0) + 1);
    else if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) values.set(d.name.getText(sf), 1);
    else if (ts.isInterfaceDeclaration(s)) interfaces.set(s.name.text, s);
    else if (ts.isTypeAliasDeclaration(s)) types.add(s.name.text);
  }
  return { values, interfaces, types };
}

const indexText = read(join(dslDir, "index.d.ts"));
const index = declarationsOf(indexText);

/** Member names of a generated interface, following `extends` of other generated interfaces. */
function declaredMembers(name: string): string[] {
  const decl = index.interfaces.get(name);
  if (!decl) throw new Error(`index.d.ts declares no interface ${name}`);
  const own = decl.members.map((m) => (m.name ? m.name.getText() : "")).filter(Boolean);
  const inherited = (decl.heritageClauses ?? []).flatMap((h) => h.types).flatMap((t) => {
    const base = t.expression.getText();
    if (base === "Omit") {
      // `Omit<Base<…>, "a" | "b">` — the base's members minus the omitted keys.
      const [target, keys] = t.typeArguments ?? [];
      const omitted = new Set((keys?.getText() ?? "").match(/"[^"]+"/g)?.map((k) => k.slice(1, -1)) ?? []);
      const targetName = target && ts.isTypeReferenceNode(target) ? target.typeName.getText() : "";
      return declaredMembers(targetName).filter((m) => !omitted.has(m));
    }
    return index.interfaces.has(base) ? declaredMembers(base) : [];
  });
  return [...new Set([...inherited, ...own])];
}

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();
const catalogueOf = (factory: string): readonly NamespaceMember[] =>
  factoryResourceCatalog.find((f) => f.factory === factory)!.members;
const namespaceOf = (name: string): readonly NamespaceMember[] => namespaceCatalog.find((n) => n.name === name)!.members;

/** Interface member names straight from a runtime source file (parse only, no type-check). */
function sourceInterface(relative: string, name: string): string[] {
  const path = resolve(repoRoot, "src", relative);
  const sf = ts.createSourceFile(path, read(path), ts.ScriptTarget.ES2022, true);
  for (const s of sf.statements) {
    if (ts.isInterfaceDeclaration(s) && s.name.text === name) {
      return s.members.map((m) => (m.name ? m.name.getText(sf) : "")).filter(Boolean);
    }
    if (ts.isTypeAliasDeclaration(s) && s.name.text === name && ts.isTypeLiteralNode(s.type)) {
      return s.type.members.map((m) => (m.name ? m.name.getText(sf) : "")).filter(Boolean);
    }
  }
  throw new Error(`src/${relative} declares no ${name}`);
}

/* ================================================================ 2a. coverage */

const componentNames = sorted(defaultLibrary.components.map((c) => c.name));
const builtinSigils = builtinCatalog.map((b) => b.sigil);
/** Injected names deliberately NOT exported: the legacy root / theme assignment targets. */
const LEGACY_BINDINGS = ["aktion", "theme"];

describe("aktion-runtime/dsl — every runtime name is declared", () => {
  it("index.d.ts exports exactly the components, the $-builtins and the injected names", () => {
    const expected = sorted([...componentNames, ...builtinSigils, ...manifest.injected.filter((n) => !LEGACY_BINDINGS.includes(n))]);
    expect(sorted(index.values.keys())).toEqual(expected);
    expect(index.types.has("AktionNode") || index.interfaces.has("AktionNode")).toBe(true);
    // The DSL value type must not reuse the `<aktion-app>` element's class name.
    expect(index.interfaces.has("AktionElement") || index.types.has("AktionElement")).toBe(false);
  });

  it("globals.d.ts declares the same values as ambient globals", () => {
    const text = read(join(dslDir, "globals.d.ts"));
    const globals = declarationsOf(text);
    const hybrids = [...text.matchAll(/^interface (\w+)Constructor extends __Aktion(\w+)Component \{\}$/gm)].map((m) => m[2]!);
    const declared = [...globals.values.keys(), ...hybrids].filter((n) => !manifest.hostGlobals.includes(n));
    expect(sorted(declared)).toEqual(sorted(index.values.keys()));
    // The host extras the ambient flavour adds are exactly the manifest's list.
    expect(sorted([...globals.values.keys()].filter((n) => manifest.hostGlobals.includes(n)))).toEqual(manifest.hostGlobals);
    expect(hybrids).toEqual(["Map"]);
    // It must stay a global SCRIPT: one top-level import/export would turn every
    // declaration into a module-local one.
    expect(text).not.toMatch(/^(import|export)\s/m);
  });

  it("components: name, slot order, positional slot and aliases mirror the library", () => {
    expect(manifest.components.map((c) => c.name)).toEqual(componentNames);
    const bySpec = new Map(defaultLibrary.components.map((c) => [c.name, c]));
    for (const entry of manifest.components) {
      const spec = bySpec.get(entry.name)!;
      expect(entry.slots, entry.name).toEqual(spec.props.map((p) => p.name));
      expect(entry.positional, entry.name).toBe(findPositionalIndex(spec));
      // Runtime precedence (resolveLibraryCallArgs): a canonical name always
      // wins its slot; an alias binds only where nothing claimed it first.
      const canonical = new Set(spec.props.map((p) => p.name));
      const aliases: Record<string, string> = {};
      for (const p of spec.props) {
        for (const a of p.aliases ?? []) if (!canonical.has(a) && !(a in aliases)) aliases[a] = p.name;
      }
      expect(entry.aliases, entry.name).toEqual(aliases);
    }
  });

  it("the $-name lists partition builtinCatalog by kind", () => {
    const lists = [manifest.hooks, manifest.factories, manifest.namespaces, manifest.builtins];
    for (const list of [...lists, manifest.injected, manifest.hostGlobals]) expect(list).toEqual([...list].sort());
    expect(sorted(lists.flat())).toEqual(sorted(builtinCatalog.map((b) => b.name)));
    expect(lists.flat().length).toBe(builtinCatalog.length);
    expect(manifest.hooks).toEqual(sorted(builtinCatalog.filter((b) => b.category === "hook").map((b) => b.name)));
    expect(manifest.factories).toEqual(sorted(factoryResourceCatalog.map((f) => f.factory)));
    // `$i18n(…)` returns a plain, destructurable bag of functions — classified
    // with the namespaces rather than with the reactive handles.
    expect(manifest.namespaces).toEqual(sorted([...builtinCatalog.filter((b) => b.namespace).map((b) => b.name), "i18n"]));
    expect(manifest.version).toBe(1);
  });
});

/* ================================================================ 2b. runtime dispatch */

function newContext(extra: Partial<Parameters<typeof createContext>[1]> = {}): EvaluationContext {
  return createContext(new StateStore(), { library: defaultLibrary, ...extra });
}
const expression = (src: string): Expression => {
  const program: Program = parse(src);
  expect(program.errors, src).toEqual([]);
  const stmt = program.statements[0] as { kind: string; expression?: Expression };
  if (!stmt?.expression) throw new Error(`not an expression statement: ${src}`);
  return stmt.expression;
};

describe("aktion-runtime/dsl — the runtime honours every listed name", () => {
  // Hooks probed outside a component log a (correct) warning; keep the run quiet.
  const quiet = (): void => {};
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(quiet);
    vi.spyOn(console, "error").mockImplementation(quiet);
  });
  afterAll(() => vi.restoreAllMocks());
  afterEach(() => cleanupScreens());

  // An unknown `$name(...)` evaluates to null, so each probe asserts a result
  // only the real builtin produces.
  type Probe = { src: string; ok: (value: unknown, ctx: EvaluationContext, emitted: unknown[]) => boolean };
  const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const DISPATCH: Record<string, Probe> = {
    state: { src: "$state(1)", ok: (v) => Array.isArray(v) && v[0] === 1 && typeof v[1] === "function" },
    memo: { src: "$memo(() => 2)", ok: (v) => v === 2 },
    ref: { src: "$ref(3)", ok: (v) => object(v) && v.current === 3 },
    reducer: { src: "$reducer((s, a) => s, 4)", ok: (v) => Array.isArray(v) && v[0] === 4 && typeof v[1] === "function" },
    id: { src: '$id("probe")', ok: (v) => typeof v === "string" && v.startsWith("probe-") },
    store: { src: "$store({ n: 1 })", ok: (v) => object(v) && v.__kind === "Store" },
    form: { src: "$form({ values: { a: 1 } })", ok: (v) => object(v) && v.__kind === "Store" },
    http: { src: '$http({ url: "/x" })', ok: (v) => object(v) && "refetch" in v && "state" in v },
    query: { src: '$query({ url: "/y" })', ok: (v) => object(v) && "refetch" in v },
    mutation: { src: '$mutation({ url: "/z" })', ok: (v) => object(v) && typeof v.mutate === "function" },
    socket: { src: '$socket({ url: "" })', ok: (v) => object(v) && typeof v.send === "function" },
    sse: { src: '$sse({ url: "" })', ok: (v) => object(v) && "messages" in v },
    script: { src: '$script({ src: "javascript:void 0" })', ok: (v) => object(v) && "ready" in v },
    head: { src: '$head({ title: "probe" })', ok: (v, ctx) => v === null && (ctx as { headManager?: unknown }).headManager != null },
    i18n: { src: "$i18n({})", ok: (v) => object(v) && typeof v.t === "function" },
    app: { src: "$app(5)", ok: (v) => v === 5 },
    router: { src: "$router({ default: 7 })", ok: (v) => v === 7 },
    theme: { src: "$theme({})", ok: (v) => object(v) && v.kind === "Theme" },
    emit: { src: '$emit("probe", 1)', ok: (_v, _ctx, emitted) => emitted.length === 1 },
    optimistic: { src: "$optimistic(() => 8)", ok: (v) => v === 8 },
    util: { src: "$util", ok: (v) => object(v) && typeof v.slugify === "function" },
    storage: { src: "$storage", ok: (v) => object(v) && typeof v.get === "function" },
    console: { src: "$console", ok: (v) => object(v) && typeof v.log === "function" },
    toast: { src: "$toast", ok: (v) => object(v) && typeof v.show === "function" },
    dom: { src: "$dom", ok: (v) => object(v) && typeof v.measure === "function" },
  };

  it("every $-builtin in the manifest is dispatched by the evaluator (or the parser)", () => {
    const names = [...manifest.hooks, ...manifest.factories, ...manifest.namespaces, ...manifest.builtins];
    expect(sorted([...Object.keys(DISPATCH), "effect"])).toEqual(sorted(names));
    for (const [name, probe] of Object.entries(DISPATCH)) {
      const emitted: unknown[] = [];
      const ctx = newContext({ onEmit: (_n: string, d: unknown) => { emitted.push(d); } });
      expect(probe.ok(evaluate(expression(probe.src), ctx), ctx, emitted), `$${name}: ${probe.src}`).toBe(true);
    }
    // `$effect` is a parser special form.
    expect(parse('$effect(() => {}, ["mount"])').statements[0]?.kind).toBe("EffectDeclaration");
  });

  const text = (screen: ReturnType<typeof render>): string => {
    const root = screen.shadowRoot.cloneNode(true) as ShadowRoot;
    root.querySelectorAll("style").forEach((s) => s.remove());
    return (root.textContent ?? "").trim();
  };

  it("every injected name in the manifest is bound by the runtime", async () => {
    const probes: Record<string, () => Promise<void> | void> = {
      route: () => {
        const v = evaluate(expression("route"), newContext()) as Record<string, unknown>;
        expect(typeof v.path).toBe("string");
      },
      params: () => {
        expect(evaluate(expression("$router({ default: params })"), newContext())).toEqual({});
      },
      outlet: () => {
        expect(evaluate(expression('$router({ "/": { layout: outlet, routes: { default: 9 } } })'), newContext())).toBe(9);
      },
      children: async () => {
        const screen = render('function Box(title) { return Text(title + ":" + children) }\n$app(Box("t", "c"))');
        await flush();
        expect(text(screen)).toBe("t:c");
      },
      slots: async () => {
        const screen = render('function Box(title) { return Text(title + ":" + slots.header) }\n$app(Box("t", { header: "h" }))');
        await flush();
        expect(text(screen)).toBe("t:h");
      },
      cleanup: async () => {
        const screen = render('$t = "none"\n$effect(() => { $t = typeof cleanup }, ["mount"])\n$app(Text($t))');
        await flush();
        expect(text(screen)).toBe("function");
      },
      setTimeout: () => timer("setTimeout", "clearTimeout", "timeouts"),
      clearTimeout: () => timer("setTimeout", "clearTimeout", "timeouts"),
      setInterval: () => timer("setInterval", "clearInterval", "intervals"),
      clearInterval: () => timer("setInterval", "clearInterval", "intervals"),
      aktion: async () => {
        const screen = render('aktion = Text("legacy root")');
        await flush();
        expect(text(screen)).toBe("legacy root");
      },
      theme: async () => {
        const screen = render('theme = $theme({ colors: { primary: "#ff0000" } })\n$app(Text("x"))');
        await flush();
        expect((screen.container as unknown as HTMLElement).style.getPropertyValue("--rui-color-primary")).toBe("#ff0000");
      },
    };
    function timer(set: string, clear: string, registry: "timeouts" | "intervals"): void {
      const ctx = newContext();
      const id = evaluate(expression(`${set}(() => 1, 60000)`), ctx);
      expect(ctx.timers[registry].size, set).toBe(1);
      ctx.loopVars.set("probeTimer", id);
      evaluate(expression(`${clear}(probeTimer)`), ctx);
      expect(ctx.timers[registry].size, clear).toBe(0);
    }
    expect(sorted(Object.keys(probes))).toEqual(manifest.injected);
    for (const [name, probe] of Object.entries(probes)) {
      try {
        await probe();
      } catch (error) {
        throw new Error(`injected name "${name}": ${String(error)}`);
      } finally {
        cleanupScreens();
      }
    }
  });
});

/* ================================================================ 2c. members */

describe("aktion-runtime/dsl — members agree across runtime, catalogue and declarations", () => {
  const ctx = newContext();
  const value = (src: string): Record<string, unknown> => evaluate(expression(src), ctx) as Record<string, unknown>;
  const keys = (v: object): string[] => Object.keys(v);
  const minus = (list: readonly string[], drop: readonly string[]): string[] => list.filter((n) => !drop.includes(n));
  const names = (members: readonly NamespaceMember[], prefix = ""): string[] =>
    members.filter((m) => m.name.startsWith(prefix) && !m.name.slice(prefix.length).includes(".")).map((m) => m.name.slice(prefix.length));

  /** Runtime list = live value ∪ the runtime's own TS interface (optional members are absent from a fresh value). */
  const check = (label: string, runtime: readonly string[], catalogue: readonly string[], declared: readonly string[]): void => {
    expect(sorted(catalogue), `${label}: catalogue vs runtime`).toEqual(sorted(runtime));
    expect(sorted(declared), `${label}: declarations vs runtime`).toEqual(sorted(runtime));
  };

  const util = namespaceOf("util");

  it("$util and its sub-namespaces", () => {
    const facade = value("$util");
    check("$util", [...keys(facade), ...keys(Util)], names(util), [...declaredMembers("AktionUtil")]);
    check("$util.style", keys(Style), names(util, "style."), declaredMembers("StyleNamespace"));
    check("$util.rules", keys(Rules), names(util, "rules."), declaredMembers("RulesNamespace"));
    check("$util.duration", keys(Util.duration), names(util, "duration."), declaredMembers("DurationNamespace"));
    // The catalogue lists `$util.url`'s methods only; the declaration is the whole snapshot.
    const url = minus(keys(facade.url as object), ["toString"]);
    expect(sorted(declaredMembers("UrlSnapshot"))).toEqual(sorted(url));
    for (const name of names(util, "url.")) expect(url, `$util.url.${name}`).toContain(name);
    expect(sorted(declaredMembers("OpenedWindow"))).toEqual(sorted(sourceInterface("runtime/util.ts", "OpenedWindow")));
  });

  it("$storage, $console, $toast, $dom, route, $i18n(…)", () => {
    const storage = value("$storage");
    const backends = ["local", "session", "cookies"];
    const storageRuntime = [...keys(storage), ...backends.flatMap((b) => keys(storage[b] as object).map((k) => `${b}.${k}`))];
    const storageDeclared = [
      ...declaredMembers("StorageRoot"),
      ...backends.flatMap((b) => declaredMembers("StorageNamespace").map((k) => `${b}.${k}`)),
    ];
    check("$storage", storageRuntime, namespaceOf("storage").map((m) => m.name), storageDeclared);
    check("$console", keys(value("$console")), names(namespaceOf("console")), declaredMembers("ConsoleNamespace"));
    check("$toast", keys(value("$toast")), names(namespaceOf("toast")), declaredMembers("ToastManager"));
    check("$dom", keys(value("$dom")), names(namespaceOf("dom")), declaredMembers("DomManager"));
    check("route", minus(keys(value("route")), ["toString"]), names(routeMembers), declaredMembers("RouteHandle"));
    check("$i18n(…)", [...keys(value("$i18n({})")), ...sourceInterface("runtime/i18n.ts", "I18nInstance")], names(i18nResultMembers), declaredMembers("I18nInstance"));
  });

  it("the resource handles $http, $query, $mutation, $socket, $sse, $script", () => {
    const INFINITE_ONLY = ["loadMore", "hasMore", "loadingMore", "page", "pages"];
    const endpoint = sourceInterface("runtime/http.ts", "EndpointResource");
    check("$http", [...keys(value('$http({ url: "/x" })')), ...minus(endpoint, INFINITE_ONLY)], names(catalogueOf("http")), declaredMembers("HttpResource"));
    check(
      "$query",
      [...keys(value('$query({ url: "/q" })')), ...keys(value('$query({ url: "/i", infinite: { limit: 5 } })')), ...endpoint],
      names(catalogueOf("query")),
      [...declaredMembers("HttpResource"), ...declaredMembers("InfiniteQueryResource")],
    );
    check("$mutation", [...keys(value('$mutation({ url: "/m" })')), ...sourceInterface("runtime/http.ts", "MutationResource")], names(catalogueOf("mutation")), declaredMembers("MutationResource"));
    check("$socket", [...keys(value('$socket({ url: "" })')), ...sourceInterface("runtime/realtime.ts", "SocketResource")], names(catalogueOf("socket")), declaredMembers("SocketResource"));
    check("$sse", [...keys(value('$sse({ url: "" })')), ...sourceInterface("runtime/realtime.ts", "SseResource")], names(catalogueOf("sse")), declaredMembers("SseResource"));
    check("$script", [...keys(value('$script({ src: "javascript:void 0" })')), ...sourceInterface("runtime/interop.ts", "ScriptResource")], names(catalogueOf("script")), declaredMembers("ScriptResource"));
  });

  it("the $form and $store handles", () => {
    const handle = (src: string): { state: string[]; methods: string[] } => {
      const h = value(src) as { __atom: string; __methods: Record<string, unknown> };
      return { state: keys(ctx.state.get(h.__atom) as object), methods: keys(h.__methods) };
    };
    const form = handle("$form({ values: { email: \"\" } })");
    check("$form", [...form.state, ...form.methods], names(catalogueOf("form")), declaredMembers("FormHandle"));
    const store = handle("$store({ n: 0, history: true })");
    check("$store (history)", [...minus(store.state, ["n"]), ...store.methods], names(catalogueOf("store")), declaredMembers("StoreHistory"));
  });

  it("every config key a factory reads is in the catalogue and declared", async () => {
    /** Keys forwarded to `fetch` verbatim (read by `Object.entries`, never by name). */
    const FETCH_PASSTHROUGH = ["credentials", "mode", "cache"];
    /** `signal` takes a DOM AbortSignal: read by the runtime, not part of the DSL surface. */
    const INTERNAL = ["signal"];
    const fakeCtx = {
      notify() {},
      queryCache: new Map(),
      disposers: [] as Array<() => void>,
      state: { entries: () => [][Symbol.iterator](), set() {} },
      http: { resolveUrl: (u: string) => u, request: async () => ({ status: 200, headers: {}, body: [] }) },
    } as unknown as EvaluationContext;
    const readKeys = async (create: (config: unknown) => unknown, seed: Record<string, unknown>): Promise<string[]> => {
      const read = new Set<string>();
      const config = new Proxy({ ...seed }, {
        get(target, key) { if (typeof key === "string") read.add(key); return target[key as string]; },
        has(target, key) { if (typeof key === "string") read.add(key); return key in target; },
      });
      const made = create(config) as { mutate?: (o: unknown) => Promise<unknown> };
      if (made && typeof made.mutate === "function") await made.mutate({});
      await new Promise((r) => setTimeout(r, 0));
      return [...read].filter((k) => k !== "then" && k !== "toJSON" && k !== "constructor");
    };
    // A real URL only where the request goes to the fake transport; "" makes the
    // realtime factories return before opening a connection (their config is
    // read first). The other direction — every catalogue key is read — is not
    // checkable this way: $query / $mutation forward COPIES of the config.
    const live = { url: "https://example.invalid/x" };
    const cases: Array<[string, string, (c: unknown) => unknown, Record<string, unknown>]> = [
      ["http", "HttpConfig", (c) => createHttpResource(c, fakeCtx), live],
      ["query", "QueryConfig", (c) => createQueryResource(c, fakeCtx), live],
      ["mutation", "MutationConfig", (c) => createMutationResource(c, fakeCtx), live],
      ["socket", "SocketConfig", (c) => createSocketResource(c, fakeCtx), { url: "" }],
      ["sse", "SseConfig", (c) => createSseResource(c, fakeCtx), { url: "" }],
      ["script", "ScriptConfig", (c) => createScriptResource(c, fakeCtx), { src: "javascript:void 0" }],
      ["i18n", "I18nConfig", (c) => createI18n(c as never), {}],
    ];
    for (const [builtin, iface, create, seed] of cases) {
      const runtime = minus(await readKeys(create, seed), INTERNAL);
      expect(runtime.length, `$${builtin}: the probe read nothing`).toBeGreaterThan(0);
      const catalogue = (findBuiltinConfig(builtin) ?? []).map((k) => k.name);
      expect(runtime.filter((k) => !catalogue.includes(k)), `$${builtin} reads config keys the catalogue does not list`).toEqual([]);
      for (const key of catalogue) expect(declaredMembers(iface), `${iface}.${key}`).toContain(key);
    }
    // Forwarded to fetch() verbatim, so documented although never read by name.
    for (const key of FETCH_PASSTHROUGH) expect(findBuiltinConfig("http")!.map((k) => k.name)).toContain(key);
  });
});

/* ================================================================ 3. tsc fixtures */

describe("aktion-runtime/dsl — tsc fixtures", () => {
  const clean = async (name: string): Promise<void> => {
    const run = await runs[name]!;
    expect(tscErrors(run.output), run.output).toEqual([]);
    expect(run.code, run.output).toBe(0);
  };

  it("§5.2 store / component / entry + host type-check against the REAL CompiledProgram (repo flags, DOM lib)", () => clean("real"), TSC_TIMEOUT);
  it("the module flavour type-checks with §5.4's options and the DOM lib (declarations checked: skipLibCheck false)", () => clean("dom"), TSC_TIMEOUT);
  it("the module flavour type-checks WITHOUT the DOM lib", () => clean("nodom"), TSC_TIMEOUT);
  it("the ambient flavour type-checks without the DOM lib", () => clean("ambient"), TSC_TIMEOUT);

  it("the ambient flavour cannot be combined with the DOM lib — the collisions its header lists", async () => {
    const run = await runs.ambientWithDom!;
    expect(run.code).not.toBe(0);
    const conflict = tscErrors(run.output).find((e) => e.code === "TS6200" && e.file.endsWith("globals.d.ts"));
    expect(conflict, run.output).toBeDefined();
    const header = read(join(dslDir, "globals.d.ts")).split("\n").slice(0, 12).join("\n");
    for (const name of ["Text", "Image", "Comment", "Notification", "console", "setTimeout"]) {
      expect(conflict!.message, name).toContain(name);
      expect(header, name).toContain(name);
    }
  }, TSC_TIMEOUT);

  it("the stand-in CompiledProgram has the real interface's members", () => {
    const stub = STUB_RUNTIME.match(/readonly (\w+)\??:/g)!.map((m) => m.slice(9).replace(/\??:$/, ""));
    expect(sorted(stub)).toEqual(sorted(sourceInterface("compiler/runtime.ts", "CompiledProgram")));
    expect(indexText).toContain('import type { CompiledProgram } from "../compiler/runtime.js";');
  });

  it("each negative case fails on its own line with its annotated code, and nothing else fails", async () => {
    const cases = corpusCases();
    expect(cases.length).toBeGreaterThan(30);
    const run = await runs.stripped!;
    const errors = tscErrors(run.output);
    // tsc prints the staged path; key every error by `<corpus file>:<line>`.
    const where = (file: string, line: number): string => `${file}:${line}`;
    const corpusOf = (path: string): string => {
      const base = path.split(/[\\/]/).pop()!;
      return CORPORA.find((f) => strippedName(f) === base) ?? base;
    };
    const byLine = new Map<string, string[]>();
    for (const e of errors) {
      const k = where(corpusOf(e.file), e.line);
      byLine.set(k, [...(byLine.get(k) ?? []), e.code]);
    }
    for (const c of cases) {
      expect(byLine.get(where(c.file, c.line)), `${c.file}:${c.line} (${c.why}) should fail with ${c.code}:\n  ${c.source}`).toContain(c.code);
    }
    const caseLines = new Set(cases.map((c) => where(c.file, c.line)));
    expect(errors.filter((e) => !caseLines.has(where(corpusOf(e.file), e.line))).map((e) => `${corpusOf(e.file)}:${e.line}: ${e.code} ${e.message}`)).toEqual([]);
  }, TSC_TIMEOUT);

  it("negative cases tagged with an Aktion layer are rejected (or accepted) by that layer too", () => {
    const tagged = corpusCases().filter((c) => c.layer);
    expect(tagged.length).toBeGreaterThan(20);
    for (const c of tagged) {
      const program = parse(c.source.replace(/;\s*$/, ""));
      const where = `${c.file}:${c.line} [${c.layer}] ${c.source}`;
      if (c.layer === "parser") {
        expect(program.errors.length, where).toBeGreaterThan(0);
        continue;
      }
      expect(program.errors.map((e) => e.message), where).toEqual([]);
      const validation = validateProgramSchema(program, defaultLibrary).map((e) => e.message);
      if (c.layer === "validator") expect(validation.length, where).toBeGreaterThan(0);
      else expect(validation, `${where} — the validator now rejects it: retag it [validator]`).toEqual([]);
    }
  });
});

/* ================================================================ 4. binding oracle */

describe("aktion-runtime/dsl — binding oracle (calls through the evaluator)", () => {
  const ctx = newContext();
  const call = (src: string): ComponentNode => evaluate(expression(src), ctx) as ComponentNode;
  const key = (name: string): string => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));
  const specs = new Map<string, ComponentSpec>(defaultLibrary.components.map((c) => [c.name, c]));

  it("every argument of every overload shape lands in the slot the manifest names", () => {
    const failures: string[] = [];
    let checks = 0;
    const expectSlot = (label: string, node: ComponentNode, slot: number, marker: string): void => {
      checks += 1;
      if (node.args[slot] !== marker) failures.push(`${label}: expected ${marker} in slot ${slot}, got ${JSON.stringify(node.args)}`);
    };
    for (const entry of manifest.components) {
      const n = entry.slots.length;
      const k = entry.positional;
      const spec = specs.get(entry.name)!;
      const order = k < 0 ? [] : [k, ...entry.slots.map((_s, i) => i).filter((i) => i !== k)];
      // (1) positional runs: positional #j → slot order[j].
      for (let m = 1; m <= Math.min(n, 8); m += 1) {
        const node = call(`${entry.name}(${Array.from({ length: m }, (_v, j) => `"#${j}"`).join(", ")})`);
        for (let j = 0; j < m; j += 1) expectSlot(`${entry.name} run of ${m}`, node, order[j]!, `#${j}`);
      }
      // (2) positional + named bag, and (3) the bag alone: every spelling → its slot.
      const spellings = entry.slots.flatMap((slot, i) => [
        [slot, i] as const,
        ...Object.entries(entry.aliases).filter(([, target]) => target === slot).map(([alias]) => [alias, i] as const),
      ]);
      const bagOnly = !(n === 1 && propExpectsObject(spec.props[0]!));
      for (const [name, slot] of spellings) {
        if (slot !== k) {
          const node = call(`${entry.name}("#p", { ${key(name)}: "#b" })`);
          expectSlot(`${entry.name}("#p", { ${name} })`, node, k, "#p");
          expectSlot(`${entry.name}("#p", { ${name} })`, node, slot, "#b");
        }
        if (bagOnly) expectSlot(`${entry.name}({ ${name} })`, call(`${entry.name}({ ${key(name)}: "#b" })`), slot, "#b");
      }
      // (4) universal props ride beside the slots unless a slot shadows them; `key` is identity.
      const own = new Set(spellings.map(([name]) => name));
      for (const universal of UNIVERSAL_PROP_NAMES) {
        if (own.has(universal) || !bagOnly) continue;
        checks += 1;
        const node = call(`${entry.name}({ ${universal}: "#u" })`);
        if (node.universal?.[universal] !== "#u") failures.push(`${entry.name}({ ${universal} }) not collected as universal`);
      }
      checks += 1;
      const keyed = call(n > 0 ? `${entry.name}("#p", { key: "k1" })` : `${entry.name}({ key: "k1" })`);
      if (keyed.explicitKey !== "k1" || keyed.args.includes("k1")) failures.push(`${entry.name}: key not taken as identity`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(checks).toBeGreaterThan(15_000);
  });

  it("the overloads in index.d.ts bind the slots in the manifest's order", () => {
    const sf = ts.createSourceFile("index.d.ts", indexText, ts.ScriptTarget.ES2022, true);
    const signatures = new Map<string, Array<readonly string[]>>();
    const add = (name: string, params: readonly ts.ParameterDeclaration[]): void => {
      signatures.set(name, [...(signatures.get(name) ?? []), params.map((p) => p.name.getText(sf))]);
    };
    for (const s of sf.statements) {
      if (ts.isFunctionDeclaration(s) && s.name && specs.has(s.name.text)) add(s.name.text, s.parameters);
      if (ts.isInterfaceDeclaration(s) && s.name.text.endsWith("Component") && specs.has(s.name.text.slice(0, -9))) {
        for (const m of s.members) if (ts.isCallSignatureDeclaration(m)) add(s.name.text.slice(0, -9), m.parameters);
      }
    }
    const identifier = (name: string): boolean => /^[A-Za-z_$][\w$]*$/.test(name);
    let compared = 0;
    for (const entry of manifest.components) {
      const sigs = signatures.get(entry.name);
      expect(sigs, entry.name).toBeDefined();
      const n = entry.slots.length;
      if (n === 0) {
        expect(sigs, entry.name).toEqual([["props"]]);
        continue;
      }
      // Parameter names are sanitised prop names; compare where no sanitising happened.
      if (!entry.slots.every(identifier) || entry.slots.some((s) => s === "props" || s === "namedProps" || RESERVED_WORDS.has(s))) continue;
      const order = [entry.positional, ...entry.slots.map((_s, i) => i).filter((i) => i !== entry.positional)];
      const bagForm = !(n === 1 && propExpectsObject(specs.get(entry.name)!.props[0]!));
      const expected: string[][] = [[entry.slots[entry.positional]!, "props"]];
      if (bagForm) expected.push(["props"]);
      for (let m = 2; m <= Math.min(n, 8); m += 1) {
        const bound = order.slice(0, m).map((i) => entry.slots[i]!);
        expected.push(m === n ? bound : [...bound, "props"]);
      }
      expect(sigs, entry.name).toEqual(expected);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(250);
  });
});
