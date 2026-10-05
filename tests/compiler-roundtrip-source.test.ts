/**
 * `CompiledProgram.source` is the linked program printed back to Aktion text
 * (`printProgram`). Text consumers re-parse it — `applyDelta`, DevTools
 * Edit/Apply, generated tests, a reconnect — so it has to MEAN what
 * `CompiledProgram.program` means. For `.aktion.ts` / `.aktion.js` modules
 * the AST carries JavaScript semantics in fields text cannot hold
 * (`CallExpr.positional`, `ComponentDeclaration.javascript`,
 * `DeclParam.publicName`, `LambdaExpr.selfName`), and the printer used to drop
 * them: a program rendered `name=Ada fact5=120` from its AST and
 * `<missing> fact5=0` from its source.
 *
 * Every case renders the AST and the re-parsed source and compares the
 * shadow DOM, and does the same through `renderToString`, which now takes the
 * `CompiledProgram` itself.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, render, renderCompiled, type Screen } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject, type CompiledProgram } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { compileAktionFile } from "../src/plugin/index.js";
import { renderToString, renderToTextTree } from "../src/runtime/ssr.js";

afterEach(() => cleanup());

const repoRoot = resolve(__dirname, "..");
const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };
const lines = (...l: string[]): string => l.join("\n");

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await flush();
}

/** Attributes whose value is a list of element ids. */
const ID_ATTRIBUTES = /\b(id|for|list|aria-(?:labelledby|describedby|controls|owns|activedescendant|errormessage|details))="([^"]*)"/g;

/**
 * `html` with every generated id numbered by first appearance. `$id()` and the
 * library's own ids count up across the whole process, so two renderings of
 * one program differ only in those numbers.
 */
function canonicalIds(html: string): string {
  const seen = new Map<string, string>();
  return html.replace(ID_ATTRIBUTES, (_, name: string, value: string) => {
    const ids = value.split(" ").map((id) => {
      const match = /^(.*)-(\d+)$/.exec(id);
      if (!match) return id;
      if (!seen.has(id)) seen.set(id, `${match[1]}-#${seen.size}`);
      return seen.get(id)!;
    });
    return `${name}="${ids.join(" ")}"`;
  });
}

/** The rendered shadow DOM, `<style>` elements left out. */
function markup(screen: Screen): string {
  return canonicalIds(
    [...screen.shadowRoot.children]
      .filter((el) => el.tagName !== "STYLE")
      .map((el) => el.outerHTML)
      .join(""),
  );
}

/** The text of every `Text`, in order. */
function texts(screen: Screen): string[] {
  return [...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent ?? "");
}

async function link(files: Record<string, string>, entry: string): Promise<CompiledProgram> {
  const res = await linkProject({ entry, files, frontends });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry });
}

interface Rendered {
  /** Shadow DOM of `compiled.program`. */
  ast: string;
  /** Shadow DOM of `compiled.source`, parsed again. */
  source: string;
  /** `Text` contents of the AST rendering. */
  texts: string[];
}

async function renderBoth(compiled: CompiledProgram, route?: string): Promise<Rendered> {
  const options = route ? { route } : {};
  const a = renderCompiled(compiled, options);
  await settle();
  const ast = markup(a);
  const shown = texts(a);
  cleanup();
  const b = render(compiled.source, options);
  await settle();
  const source = markup(b);
  cleanup();
  return { ast, source, texts: shown };
}

/** Render the AST and the re-parsed source — they must agree — and return the texts. */
async function sameBothWays(files: Record<string, string>, entry: string, route?: string): Promise<string[]> {
  const compiled = await link(files, entry);
  const { ast, source, texts: shown } = await renderBoth(compiled, route);
  expect(source, compiled.source).toBe(ast);
  const ssr = (input: string | CompiledProgram) => canonicalIds(renderToString(input, route ? { path: route } : {}).html);
  expect(ssr(compiled.source), compiled.source).toBe(ssr(compiled));
  return shown;
}

/** `src` as an entry in both JavaScript-shaped languages. */
const jsAndTs = (src: string): Array<{ entry: string; files: Record<string, string> }> =>
  (["app.aktion.ts", "app.aktion.js"] as const).map((entry) => ({ entry, files: { [entry]: src } }));

describe("the measured regression", () => {
  const src = lines(
    'function KVRow(entry: {key: string; value: string}) { return Text(entry ? entry.key + "=" + entry.value : "<missing>") }',
    "const fact = function fact(n: number): number { return n <= 1 ? 1 : n * fact(n - 1) }",
    '$app(Column([KVRow({ key: "name", value: "Ada" }), Text("fact5=" + fact(5))]))',
  );

  it("renders the same from the AST and from the printed source", async () => {
    expect(await sameBothWays({ "app.aktion.ts": src }, "app.aktion.ts")).toEqual(["name=Ada", "fact5=120"]);
  });

  it("renderToString takes the CompiledProgram and renders its AST", async () => {
    const compiled = await link({ "app.aktion.ts": src }, "app.aktion.ts");
    const { html } = renderToString(compiled);
    expect(html).toContain("name=Ada");
    expect(html).toContain("fact5=120");
    expect(renderToString(compiled, { container: false }).html).toBe(
      renderToString(compiled.source, { container: false }).html,
    );
  });

  it("renderToTextTree takes the CompiledProgram too", async () => {
    const compiled = await link({ "app.aktion.ts": src }, "app.aktion.ts");
    const tree = renderToTextTree(compiled);
    expect(tree.errors).toEqual([]);
    expect(tree.text).toContain('"name=Ada"');
    expect(tree.text).toContain('"fact5=120"');
    // The artefact is not changed by rendering it.
    expect(compiled.program.errors).toEqual([]);
  });
});

describe("positional calls to a .aktion.ts / .aktion.js component", () => {
  it("an object literal is the parameter's value", async () => {
    const src = lines(
      'function Pair(a, b) { return Text(JSON.stringify(a) + "/" + (b === undefined ? "none" : JSON.stringify(b))) }',
      '$app(Column([Pair({ x: 1 }, { y: 2 }), Pair({ key: "k", value: "v" }), Pair(1, { title: "t" })]))',
    );
    for (const { entry, files } of jsAndTs(src)) {
      expect(await sameBothWays(files, entry), entry).toEqual([
        '{"x":1}/{"y":2}',
        '{"key":"k","value":"v"}/none',
        '1/{"title":"t"}',
      ]);
    }
  });

  it("the identity read from an extra literal and from a key-only last literal", async () => {
    const src = lines(
      'function Row(item) { return Text(item.name + ":" + (children ? JSON.stringify(children) : "-")) }',
      'function Item(label, opts) { return Text(label + "|" + JSON.stringify(opts)) }',
      'const rows = [{ id: "a", name: "A" }, { id: "b", name: "B" }]',
      "$app(Column([",
      "  ...rows.map((r) => Row(r, { key: r.id })),",
      '  Item("one", { key: "k1" }),',
      '  Item("two", { key: "k2" }, { other: 1 }),',
      "]))",
    );
    for (const { entry, files } of jsAndTs(src)) {
      const compiled = await link(files, entry);
      const { ast, source } = await renderBoth(compiled);
      expect(source, compiled.source).toBe(ast);
      // The identity reaches the rendered element.
      expect(ast).toContain('data-rui-key="a"');
      expect(ast).toContain('data-rui-key="b"');
      expect(ast).toContain('data-rui-key="k1"');
      expect(ast).not.toContain('data-rui-key="k2"');
    }
  });

  it("an identity that is not one literal's own `key:` expression", async () => {
    // A spread may supply it, a call computes it, a later key replaces it.
    const src = lines(
      'function Row(item) { return Text(item.name + ":" + JSON.stringify(children)) }',
      'const meta = { key: "from-spread" }',
      "const none = { tag: 1 }",
      "const keyOf = (id) => `row-${id}`",
      "$app(Column([",
      '  Row({ name: "spread" }, { ...meta }),',
      '  Row({ name: "spread-none" }, { ...none }),',
      '  Row({ name: "call" }, { key: keyOf(7) }),',
      '  Row({ name: "override" }, { key: "first", ...meta }),',
      '  Row({ name: "computed" }, { ["key"]: "computed-key" }),',
      '  Row({ name: "two" }, { key: "early" }, { key: "late" }),',
      "]))",
    );
    for (const { entry, files } of jsAndTs(src)) {
      const compiled = await link(files, entry);
      const { ast, source } = await renderBoth(compiled);
      expect(source, compiled.source).toBe(ast);
      for (const key of ["from-spread", "row-7", "computed-key", "late"]) expect(ast).toContain(`data-rui-key="${key}"`);
    }
  });

  it("rest and destructured parameters", async () => {
    const src = lines(
      'function Tags(...items) { return Text(items.map((i) => i.name ?? i.key).join(",")) }',
      'function Card({ title, tone = "info" }, ...rest) { return Text(title + "/" + tone + "/" + rest.length) }',
      "$app(Column([",
      '  Tags({ name: "a" }, { name: "b" }),',
      '  Tags({ name: "c" }, { key: "last" }),',
      '  Card({ title: "T" }),',
      '  Card({ title: "U", tone: "warn" }, { x: 1 }, 2),',
      "]))",
    );
    for (const { entry, files } of jsAndTs(src)) {
      expect(await sameBothWays(files, entry), entry).toEqual(["a,b", "c,last", "T/info/0", "U/warn/2"]);
    }
  });

  it("a wrapper that shadows a built-in calls the built-in inside its own body", async () => {
    const src = lines(
      'function Badge(label, opts) { return Badge(label, { ...opts, tone: "success" }) }',
      '$app(Column([Badge("ok", { variant: "solid" }), Text("after")]))',
    );
    for (const { entry, files } of jsAndTs(src)) {
      const compiled = await link(files, entry);
      const { ast, source } = await renderBoth(compiled);
      expect(source, compiled.source).toBe(ast);
      expect(ast).toContain("ok");
    }
  });
});

describe("named props reach a renamed parameter (a .aktion module calling a .aktion.ts component)", () => {
  it("by its public name, with key and named slots beside it", async () => {
    const files = {
      "app.aktion": lines(
        'import { Card } from "./card.aktion.ts"',
        "$app(Column([",
        '  Card({ title: "T", subtitle: "S" }),',
        '  Card({ title: "K", key: "card-k" }),',
        '  Card("P", { subtitle: "Q", footer: "F" }),',
        "]))",
      ),
      "card.aktion.ts": lines(
        "export function Card(title: string, subtitle?: string) {",
        "  const label = title + (subtitle ? \"/\" + subtitle : \"\")",
        '  return Text(label + (slots.footer ? "+" + slots.footer : ""))',
        "}",
      ),
    };
    expect(await sameBothWays(files, "app.aktion")).toEqual(["T/S", "K", "P/Q+F"]);
    const compiled = await link(files, "app.aktion");
    expect((await renderBoth(compiled)).ast).toContain('data-rui-key="card-k"');
  });
});

describe("the JS-semantics rewrites print to text that means the same", () => {
  it("W1 renamed locals, W2 nested functions, W3 implicit returns, W4 arrow components", async () => {
    const src = lines(
      "const Badge = (props) => Text(\"badge:\" + props.label)",
      "function App() {",
      "  let x = 1",
      "  if (x > 0) {",
      "    let x = 2",
      "  }",
      "  function label(n) {",
      "    return \"#\" + n + \"/\" + x",
      "  }",
      "  function maybe(flag) {",
      "    if (flag) {",
      "      return \"yes\"",
      "    }",
      "    \"ignored\"",
      "  }",
      "  return Column([Text(label(1)), Text(String(maybe(false))), Badge({ label: \"b\" })])",
      "}",
      "$app(App())",
    );
    for (const { entry, files } of jsAndTs(src)) {
      expect(await sameBothWays(files, entry), entry).toEqual(["#1/1", "undefined", "badge:b"]);
    }
  });

  it("operators, grouping and literals keep their meaning", async () => {
    const src = lines(
      "const a = 2",
      "const b = 3",
      "const s = \"str\"",
      "const o = { k: 1, \"$x\": 2, \"a-b\": 3 }",
      "const name = \"k\"",
      "$app(Column([",
      "  Text(String((a + b) * 4)),",
      "  Text(String(a - (b - 1))),",
      "  Text(typeof s === \"string\" ? \"typed\" : \"untyped\"),",
      "  Text(String(!(a > 1 && b > 5))),",
      "  Text(String(-(-a))),",
      "  Text(String((-a) ** 2)),",
      "  Text(String((a ?? 0) || 9)),",
      "  Text(String((1).toFixed(2))),",
      "  Text(`tick \\` and \\${not} ${a}`),",
      "  Text(JSON.stringify({ [name]: o[name], dollar: o[\"$x\"], dash: o[\"a-b\"] })),",
      "  Text(String([1, 2].map((n) => ({ n })).length)),",
      "  Text(String(Object.is(-0, 0))),",
      "]))",
    );
    for (const { entry, files } of jsAndTs(src)) {
      expect(await sameBothWays(files, entry), entry).toEqual([
        "20",
        "0",
        "typed",
        "true",
        "2",
        "4",
        "2",
        "1.00",
        "tick ` and ${not} 2",
        '{"k":1,"dollar":2,"dash":3}',
        "2",
        "false",
      ]);
    }
  });

  it("a $router with params, layout arms and a multi-module project", async () => {
    const files = {
      "app.aktion.ts": lines(
        'import { $app, $router, Column, Text, params, outlet, type RouteParamsOf } from "aktion-runtime/dsl"',
        'import { UserRow } from "./rows.aktion.ts"',
        "export default $app($router({",
        '  "/users/:id": UserRow({ id: (params as RouteParamsOf<"/users/:id">).id, name: "Ada" }),',
        '  "/": { layout: Column([Text("shell"), outlet]), routes: { "/": Text("home") } },',
        "}))",
      ),
      "rows.aktion.ts": lines(
        'import { Text } from "aktion-runtime/dsl"',
        "export function UserRow(user: { id: string; name: string }) {",
        '  return Text(user.name + "#" + user.id)',
        "}",
      ),
    };
    expect(await sameBothWays(files, "app.aktion.ts", "/users/42")).toEqual(["Ada#42"]);
    expect(await sameBothWays(files, "app.aktion.ts", "/")).toEqual(["shell", "home"]);
  });
});

describe("every .aktion.ts / .aktion.js program in the repository", () => {
  const fixtures = execFileSync("git", ["ls-files", "*.aktion.ts", "*.aktion.js"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((path) => path.length > 0);

  it("finds them", () => {
    expect(fixtures.length).toBeGreaterThan(30);
  });

  for (const path of fixtures) {
    it(path, async () => {
      let compiled: CompiledProgram;
      try {
        compiled = compileAktionFile(resolve(repoRoot, path), { root: repoRoot });
      } catch {
        return; // fixtures that exist to fail compilation (lint and type-error corpora)
      }
      const { ast, source } = await renderBoth(compiled);
      expect(source, compiled.source).toBe(ast);
      expect(canonicalIds(renderToString(compiled.source).html)).toBe(canonicalIds(renderToString(compiled).html));
    });
  }
});
