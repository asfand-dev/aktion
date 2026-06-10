/**
 * Server-side rendering — `renderToString` / `renderToStaticMarkup` (XI.1).
 * Runs in happy-dom (the test env provides `document`), mirroring a Node SSR
 * setup with a DOM shim.
 */

import { describe, expect, it } from "vitest";
import { renderToString, renderToStaticMarkup } from "../src/runtime/ssr.js";

describe("renderToString (XI.1)", () => {
  it("renders a simple program to HTML + state snapshot", () => {
    const { html, state } = renderToString(`$count = 3
$app(Column([Text("Hello SSR"), Text(\`count=\${$count}\`)]))`);
    expect(html).toContain("Hello SSR");
    expect(html).toContain("count=3");
    expect(html).toContain("rui-root");
    expect(state.count).toBe(3);
  });

  it("hydrates initial state over the program declarations", () => {
    const { html } = renderToString(
      `$name = "default"\n$app(Text(\`hi \${$name}\`))`,
      { initialState: { name: "Ada" } },
    );
    expect(html).toContain("hi Ada");
  });

  it("renders the route matching the given path", () => {
    const program = `pages = $router({ "/": Text("HOME"), "/about": Text("ABOUT"), default: Text("NF") })
aktion = Stack([pages])`;
    expect(renderToString(program, { path: "/about" }).html).toContain("ABOUT");
    expect(renderToString(program, { path: "/" }).html).toContain("HOME");
  });

  it("renders components with props", () => {
    const html = renderToStaticMarkup(`$app(Button("Click me", { variant: "primary" }))`);
    expect(html).toContain("Click me");
    expect(html).toContain("rui-button");
  });

  it("container:false returns inner markup only", () => {
    const html = renderToStaticMarkup(`$app(Text("bare"))`, { container: false });
    expect(html).toContain("bare");
    expect(html).not.toContain('class="rui-root"');
  });

  it("degrades gracefully on a malformed program", () => {
    const { html } = renderToString(`$app(`);
    expect(typeof html).toBe("string");
  });
});
