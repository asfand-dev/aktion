/**
 * Comments in `.aktion.js` / `.aktion.ts` modules. The parser attaches comment
 * records (`{ kind: "Line" | "Block", text, … }`) to statements; a `Block`
 * comment carries the same `kind` as a statement block, so a structural walk
 * that did not skip them reported a `/* … *\/` comment as a block with no body
 * and the JS-semantics lowering crashed on it (the whole module failed with
 * AKT-LINK-FRONTEND at 0:0). Each case here compiles with and without its
 * comments and must render the same thing.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends, javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { parse, walk } from "../src/parser/index.js";

afterEach(() => cleanup());

const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };

/** Link `src` as `entry`, click "Go" when there is one, and return the rendered text. */
async function render(src: string, entry: string): Promise<string> {
  const res = await linkProject({ entry, files: { [entry]: src }, frontends });
  expect(res.diagnostics).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  if (screen.shadowRoot.querySelector("button")) {
    await screen.click("Go");
    await flush();
  }
  const root = screen.shadowRoot.cloneNode(true) as ShadowRoot;
  for (const style of root.querySelectorAll("style")) style.remove();
  return `${root.textContent ?? ""}|${JSON.stringify(screen.state.get("out") ?? null)}`;
}

/** Remove every `/* … *\/` comment (none of the cases nests one in a string). */
const stripBlockComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "");

const CASES: Record<string, string> = {
  "JSDoc on an exported function": [
    "/** Increment. */",
    "export function inc(n) {",
    "  return n + 1",
    "}",
    "let $out = 0",
    "function go() { $out = inc(1) }",
    '$app(Button("Go", { onClick: go }))',
  ].join("\n"),
  "a block comment inside a function body": [
    "let $out = 0",
    "function go() {",
    "  /* note */",
    "  $out = 2",
    "  /* trailing */",
    "}",
    '$app(Button("Go", { onClick: go }))',
  ].join("\n"),
  "a block comment inside a call argument": [
    "let $out = 0",
    "function go() {",
    "  $out = Math.max(/* why */ 1, 3)",
    "}",
    '$app(Button("Go", { onClick: go }))',
  ].join("\n"),
  "a block comment inside a switch case": [
    'let $out = ""',
    "function go() {",
    "  switch (2) {",
    "    /* the even branch */",
    "    case 2:",
    "      /* inside */",
    '      $out = "two"',
    "      break",
    "  }",
    "}",
    '$app(Button("Go", { onClick: go }))',
  ].join("\n"),
  "a block comment inside a module-level object literal": [
    "const cfg = { /* c */ a: 1, b: /* d */ 2 }",
    "let $out = 0",
    "function go() { $out = cfg.a + cfg.b }",
    '$app(Button("Go", { onClick: go }))',
  ].join("\n"),
  "a top-level block comment": [
    "/* top */",
    "const a = 1",
    "let $out = 0",
    "function go() { $out = a }",
    '$app(Button("Go", { onClick: go }))',
  ].join("\n"),
};

describe("block comments in JavaScript-shaped modules", () => {
  for (const [name, src] of Object.entries(CASES)) {
    it(`${name} compiles exactly as without it (.aktion.js)`, async () => {
      expect(await render(src, "app.aktion.js")).toBe(await render(stripBlockComments(src), "app.aktion.js"));
    });

    it(`${name} compiles exactly as without it (.aktion.ts)`, async () => {
      expect(await render(src, "app.aktion.ts")).toBe(await render(stripBlockComments(src), "app.aktion.ts"));
    });
  }

  it("the frontend never throws on a commented module", () => {
    const src = CASES["JSDoc on an exported function"]!;
    const out = javascriptFrontend.compile(src, "/src/a.aktion.js");
    expect(out.program.errors).toEqual([]);
    expect(out.diagnostics).toEqual([]);
  });

  it("JSDoc typing — the documented way to type `.aktion.js` — compiles", async () => {
    const src = [
      'import { Button } from "aktion-runtime/dsl"',
      "",
      '/** @type {import("aktion-runtime/dsl").ButtonNamed} */',
      'const opts = { variant: "primary" }',
      "",
      "let $out = \"\"",
      "/**",
      " * Records the variant.",
      " * @returns {void}",
      " */",
      "function go() { $out = opts.variant }",
      '$app(Button("Go", { variant: "primary", onClick: go }))',
    ].join("\n");
    expect(await render(src, "app.aktion.js")).toBe('Go|"primary"');
  });
});

describe("walk skips comment records", () => {
  it("never reports a comment as a node", () => {
    const program = parse(
      [
        "/** doc */",
        "function f() {",
        "  // line",
        "  /* block */",
        "  return 1 // trailing",
        "}",
        "switch (x) {",
        "  /* case note */",
        "  case 1:",
        "    break",
        "}",
        "function g() {",
        "  /* only an inner comment */",
        "}",
      ].join("\n"),
    );
    const blocks: unknown[] = [];
    walk(program, ({ node }) => {
      expect(node.kind).not.toBe("Line");
      if (node.kind === "Block") blocks.push(node);
    });
    // The two function bodies and nothing else — no comment posing as a block.
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(Array.isArray((block as { body: unknown }).body)).toBe(true);
  });
});
