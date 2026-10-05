/**
 * Template-literal interpolations are sub-parsed on their own; a `${…}` that
 * is not one complete expression is now a parse error at its own position (or
 * E102 for `async` in a `.aktion.js` / `.aktion.ts` module) instead of a silent
 * `""`. The constructs below are the ones a template used to swallow: each
 * gets the same message it gets outside a template.
 */

import { describe, expect, it } from "vitest";
import { aktionFrontend, javascriptFrontend } from "../src/compiler/frontend.js";
import { findAsyncModifiers } from "../src/compiler/js-semantics.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { parse } from "../src/parser/index.js";
import type { AssignmentStatement, TemplateLiteralExpr } from "../src/parser/types.js";

const typescript = createTypeScriptFrontend();
const FRONTENDS = [
  ["app.aktion", aktionFrontend],
  ["app.aktion.js", javascriptFrontend],
  ["app.aktion.ts", typescript],
] as const;

/** Every problem `src` gets as module `path`, as `code@line:column message`. */
function problems(src: string, path: string, frontend: { compile(s: string, p: string): ReturnType<typeof javascriptFrontend.compile> }): string[] {
  const out = frontend.compile(src, `/src/${path}`);
  return [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column} ${e.message}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column} ${d.message}`),
  ];
}

const inGo = (body: string): string =>
  ['let $out = ""', "function go() {", `  $out = ${body}`, "}", '$app(Button("Go", { onClick: go }))'].join("\n");

const CASES: Array<{ name: string; body: string; at: string; message: string }> = [
  {
    name: "`import.meta`",
    body: "`${import.meta.env.VITE_API}/todos`",
    at: "3:13",
    message: "`import.meta` is not supported in Aktion — pass the value in from the host page instead.",
  },
  {
    name: "a BigInt literal",
    body: "`n=${10n}`",
    at: "3:15",
    message: "BigInt literals (`10n`) are not supported in Aktion — use a regular number.",
  },
  {
    name: "a tagged template",
    body: "`x${t`a`}`",
    at: "3:15",
    message: "Tagged template literals are not supported in Aktion — call the function with the string instead: `tag(`…`)`.",
  },
  {
    name: "`class`",
    body: "`${typeof class {}}`",
    at: "3:20",
    message: "`class` is not supported in Aktion — there are no classes. Use plain objects for data and functions for behaviour.",
  },
  {
    name: "an incomplete expression",
    body: "`a${1 +}b`",
    at: "3:17",
    message: "Unexpected end of the `${…}` interpolation — it needs a complete expression.",
  },
  {
    name: "an empty interpolation",
    body: "`a${}b`",
    at: "3:12",
    message: "Empty `${}` in a template literal — write an expression inside it, or remove it.",
  },
  {
    name: "two statements",
    body: "`${a; b}`",
    at: "3:16",
    message: "A `${…}` interpolation holds a single expression — move the other statements out of the template.",
  },
];

describe("an interpolation that is not one expression is reported, not rendered as \"\"", () => {
  for (const c of CASES) {
    for (const [path, frontend] of FRONTENDS) {
      it(`${c.name} (${path})`, () => {
        expect(problems(inGo(c.body), path, frontend)[0]).toBe(`PARSE@${c.at} ${c.message}`);
      });
    }
  }

  it("`async` inside an interpolation is E102 in .aktion.js and .aktion.ts, at the `async`", () => {
    const src = inGo("`${(async () => 1)()}`");
    for (const [path, frontend] of FRONTENDS.slice(1)) {
      expect(problems(src, path, frontend).filter((p) => p.startsWith("E102")).map((p) => p.split(" ")[0]), path).toEqual([
        "E102@3:14",
      ]);
    }
    // `.aktion` keeps the parser's own message at the same position.
    expect(problems(src, "app.aktion", aktionFrontend)[0]).toMatch(/^PARSE@3:14 `async` arrow functions are not supported/);
  });

  it("findAsyncModifiers looks inside interpolations, nested ones included", () => {
    expect(findAsyncModifiers("x = `${async () => 1}`")).toEqual([{ line: 1, column: 8 }]);
    expect(findAsyncModifiers("x = `a${`b${async () => 1}`}`")).toEqual([{ line: 1, column: 13 }]);
    expect(findAsyncModifiers("x = `${\n  async () => 1\n}`")).toEqual([{ line: 2, column: 3 }]);
    expect(findAsyncModifiers("x = `${o.async}`")).toEqual([]);
  });

  it("positions an error on a later line of a multi-line interpolation", () => {
    const src = ["x = `${", "  a +", "}`"].join("\n");
    expect(parse(src).errors.map((e) => `${e.line}:${e.column}`)).toEqual(["3:1"]);
  });

  it("positions an error inside a nested template", () => {
    const src = "x = `a${`b${10n}`}`";
    expect(parse(src).errors.map((e) => `${e.line}:${e.column} ${e.message}`)).toEqual([
      "1:13 BigInt literals (`10n`) are not supported in Aktion — use a regular number.",
    ]);
  });
});

describe("well-formed interpolations are unchanged", () => {
  it("parse to their expressions at the author's positions", () => {
    const program = parse('x = `a${1 + 2}b${`n${$count}`}c${f(\n  "y"\n)}`');
    expect(program.errors).toEqual([]);
    const template = (program.statements[0] as AssignmentStatement).expression as TemplateLiteralExpr;
    expect(template.expressions.map((e) => e.kind)).toEqual(["Binary", "Template", "Call"]);
    expect(template.quasis).toEqual(["a", "b", "c", ""]);
  });

  it("a template still open at the end of a streamed prefix stays lenient", () => {
    expect(parse("x = `total: ${$count +", { streaming: true }).errors).toEqual([]);
    expect(parse("x = `total: ${$count.", { streaming: true }).errors).toEqual([]);
  });
});
