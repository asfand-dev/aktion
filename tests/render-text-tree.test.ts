/**
 * DOM-free render verification — `renderToTextTree` (issue #9 from
 * issues-to-fix.md). Confirms a program actually *renders* (not just parses)
 * without needing happy-dom / jsdom, so `node` and CI can verify offline.
 */

import { describe, expect, it } from "vitest";
import { renderToTextTree } from "../src/runtime/ssr.js";

describe("#9 renderToTextTree", () => {
  it("renders a valid program to an outline with no errors", () => {
    const result = renderToTextTree(`$app(Column([Text("Hello"), Text("World")]))`);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.text).toContain("<Column>");
    expect(result.text).toContain("<Text>");
    expect(result.text).toContain('"Hello"');
    expect(result.text).toContain('"World"');
  });

  it("expands user components and shows their output", () => {
    const program = [
      'function Greeting(title) { return Column([Text(title)]) }',
      '$app(Greeting("Hi there"))',
    ].join("\n");
    const result = renderToTextTree(program);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("<Greeting>");
    expect(result.text).toContain("<Column>");
    expect(result.text).toContain('"Hi there"');
  });

  it("flags a bare-value root as not renderable", () => {
    const result = renderToTextTree(`aktion = "leftover-string"`);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("root-not-renderable"))).toBe(true);
  });

  it("flags a missing UI root", () => {
    const result = renderToTextTree(`x = 5`);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("no UI root"))).toBe(true);
  });

  it("surfaces schema violations", () => {
    const result = renderToTextTree(`$app(Button("Save", { variant: "primry" }))`);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("schema"))).toBe(true);
  });

  it("surfaces a throw inside a user component", () => {
    const program = [
      'function Boom() { throw "kaboom" }',
      "$app(Boom())",
    ].join("\n");
    const result = renderToTextTree(program);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Boom") && e.includes("kaboom"))).toBe(true);
  });

  it("the per-call scope fix is observable through the text tree (#1 + #9)", () => {
    const program = [
      "function inner() { const x = 99; return x }",
      "function outer() { let x = 1; inner(); return x }",
      "$app(Text(`result=${outer()}`))",
    ].join("\n");
    const result = renderToTextTree(program);
    expect(result.text).toContain('"result=1"');
  });

  it("works with NO DOM present (the whole point of the API)", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    let removed = false;
    try {
      // Hide the DOM the test environment provides.
      Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
      removed = true;
      const result = renderToTextTree(`$app(Text("no dom needed"))`);
      expect(result.ok).toBe(true);
      expect(result.text).toContain('"no dom needed"');
    } finally {
      if (removed) {
        if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
        else delete (globalThis as { document?: unknown }).document;
      }
    }
  });
});
