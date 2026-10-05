/**
 * `renderToString`, `renderToStaticMarkup` and `renderToTextTree` take a
 * `CompiledProgram` as well as source text, and render its AST as is.
 *
 * They used to take text only, so a compiled program had to go through its
 * `source` — the linked program printed back to Aktion text — which for a
 * `.aktion.ts` / `.aktion.js` program does not carry the JavaScript semantics
 * its AST does.
 */

import { describe, expect, it } from "vitest";
import { defineCompiledProgram, linkProject, type CompiledProgram } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { renderToStaticMarkup, renderToString, renderToTextTree } from "../src/runtime/ssr.js";

const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };

async function compile(src: string, entry = "app.aktion.ts"): Promise<CompiledProgram> {
  const res = await linkProject({ entry, files: { [entry]: src }, frontends });
  expect(res.diagnostics).toEqual([]);
  return defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry });
}

// `KVRow` binds its object-literal argument positionally only in the AST
// (`CallExpr.positional`), so the result shows which one was rendered.
const PROGRAM = [
  'function KVRow(entry: { key: string; value: string }) { return Text(entry ? entry.key + "=" + entry.value : "<missing>") }',
  '$app(Column([KVRow({ key: "name", value: "Ada" }), Text("count " + $n)]))',
  "let $n = 1",
].join("\n");

describe("SSR of a CompiledProgram", () => {
  it("renderToString renders the AST, and hydration state and options apply", async () => {
    const compiled = await compile(PROGRAM);
    const { html, state } = renderToString(compiled, { initialState: { n: 5 } });
    expect(html).toContain("name=Ada");
    expect(html).toContain("count 5");
    expect(state).toMatchObject({ n: 5 });
    expect(renderToString(compiled, { container: false }).html.startsWith("<div class=\"rui-root\"")).toBe(false);
  });

  it("renderToStaticMarkup takes one too", async () => {
    expect(renderToStaticMarkup(await compile(PROGRAM))).toContain("name=Ada");
  });

  it("renderToTextTree takes one, and reports the program's own errors as parse errors", async () => {
    const compiled = await compile(PROGRAM);
    const tree = renderToTextTree(compiled);
    expect(tree.errors).toEqual([]);
    expect(tree.text).toContain('"name=Ada"');
    const broken = defineCompiledProgram({
      ...compiled,
      program: { ...compiled.program, errors: [{ message: "boom", line: 3, column: 4 }] },
    });
    expect(renderToTextTree(broken).errors).toContain("parse 3:4: boom");
  });

  it("does not change the artefact it renders", async () => {
    const compiled = await compile(PROGRAM);
    const before = JSON.stringify(compiled.program);
    renderToString(compiled);
    renderToTextTree(compiled);
    expect(JSON.stringify(compiled.program)).toBe(before);
  });

  it("still takes source text", () => {
    expect(renderToString('$app(Text("plain"))').html).toContain("plain");
    expect(renderToTextTree('$app(Text("plain"))').ok).toBe(true);
  });
});
