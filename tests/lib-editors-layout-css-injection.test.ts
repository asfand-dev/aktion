/**
 * CSS declaration injection through the editors' height props.
 *
 * RichTextEditor and CodeEditor interpolated `minHeight` / `maxHeight` into an
 * inline `style` through bare `asString`, so a value such as
 * `"100px;position:fixed"` closed the declaration and appended its own — an
 * LLM-supplied prop could turn the editor into a full-viewport overlay.
 * `sanitiseCssLength` is the library's guard for exactly this; these tests pin
 * that the injected declaration no longer reaches the element, and that an
 * ordinary length still does.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

const INJECTION = JSON.stringify("100px;position:fixed;top:0;left:0");

async function styleOf(program: string, selector: string): Promise<CSSStyleDeclaration> {
  const screen = render(program);
  await screen.flush();
  const node = screen.shadowRoot.querySelector<HTMLElement>(selector);
  expect(node, `${selector} not rendered`).not.toBeNull();
  return node!.style;
}

describe("RichTextEditor height props cannot inject declarations", () => {
  it("drops an injected declaration from minHeight", async () => {
    const style = await styleOf(`$app(RichTextEditor("rte", { minHeight: ${INJECTION} }))`, ".rui-rich-text-content");
    expect(style.position).toBe("");
    expect(style.top).toBe("");
    expect(style.minHeight).toBe("160px");
  });

  it("drops an injected declaration from maxHeight", async () => {
    const style = await styleOf(`$app(RichTextEditor("rte", { maxHeight: ${INJECTION} }))`, ".rui-rich-text-content");
    expect(style.position).toBe("");
    expect(style.maxHeight).toBe("");
  });

  it("still applies ordinary lengths", async () => {
    const style = await styleOf(`$app(RichTextEditor("rte", { minHeight: "8rem", maxHeight: "40vh" }))`, ".rui-rich-text-content");
    expect(style.minHeight).toBe("8rem");
    expect(style.maxHeight).toBe("40vh");
  });
});

describe("CodeEditor height props cannot inject declarations", () => {
  it("drops an injected declaration from minHeight", async () => {
    const style = await styleOf(`$app(CodeEditor("ce", { minHeight: ${INJECTION} }))`, ".rui-code-editor-body");
    expect(style.position).toBe("");
    expect(style.top).toBe("");
    expect(style.minHeight).toBe("200px");
  });

  it("drops an injected declaration from maxHeight, and with it the scroll cap", async () => {
    const style = await styleOf(`$app(CodeEditor("ce", { maxHeight: ${INJECTION} }))`, ".rui-code-editor-body");
    expect(style.position).toBe("");
    expect(style.maxHeight).toBe("");
    expect(style.overflow).toBe("");
  });

  it("still applies ordinary lengths", async () => {
    const style = await styleOf(`$app(CodeEditor("ce", { minHeight: "120px", maxHeight: "50vh" }))`, ".rui-code-editor-body");
    expect(style.minHeight).toBe("120px");
    expect(style.maxHeight).toBe("50vh");
    expect(style.overflow).toBe("auto");
  });
});
