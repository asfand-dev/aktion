/**
 * Behavioural tests for the `$app(...)` runtime-root construct.
 *
 * `$app(...)` is the canonical way to declare the UI root, replacing the
 * legacy `aktion = ...` assignment. It accepts a single node, an array of
 * nodes, or variadic node arguments; multiple nodes render as sibling roots
 * (the renderer wraps a list in a document fragment). The legacy
 * `aktion = ...` form keeps working.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

type ScriptedEl = HTMLElement & { setResponse(text: string): void };

describe("$app(...) runtime root", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const create = (): ScriptedEl => {
    const el = document.createElement("aktion-app");
    document.body.appendChild(el);
    return el as ScriptedEl;
  };

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) await flush();
  };

  it("renders a single root node — $app(Stack([Text(...)]))", async () => {
    const el = create();
    el.setResponse(`$app(Stack([Text("Hello World")]))`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("Hello World");
  });

  it("renders an array root as sibling nodes — $app([Text, Button])", async () => {
    const el = create();
    el.setResponse(`$app([Text("Hello World"), Button("Click me")])`);
    await settle();
    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("Hello World");
    expect(text).toContain("Click me");
  });

  it("renders variadic root args as siblings — $app(Text, Button)", async () => {
    const el = create();
    el.setResponse(`$app(Text("Hello World"), Button("Click me"))`);
    await settle();
    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("Hello World");
    expect(text).toContain("Click me");
  });

  it("resolves forward references declared below $app(...)", async () => {
    const el = create();
    el.setResponse(`$app(App())
function App() { return Stack([Text("From component")]) }`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("From component");
  });

  it("keeps reactive $state working with a bare $app(...) root", async () => {
    const el = create();
    el.setResponse(`$count = 7
$app(Text(\`Count: \${$count}\`))`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("Count: 7");
  });

  it("still supports the legacy `aktion = ...` root assignment", async () => {
    const el = create();
    el.setResponse(`aktion = Stack([Text("Legacy root")])`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("Legacy root");
  });
});
