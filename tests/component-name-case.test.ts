/**
 * Component names are case-sensitive. `Card(...)` resolves the built-in;
 * `card(...)` is a plain call to a user function named `card` and does not
 * resolve it, so the program renders a loading skeleton instead of a card
 * and `getDiagnostics` reports nothing. The system prompts must not tell a
 * model that `Card` and `card` are equivalent.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { defaultLibrary } from "../src/library/index.js";
import { getDiagnostics } from "../src/tooling/language-service.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await flush();
};

type ScriptedEl = HTMLElement & { setResponse(text: string): void };

const render = async (source: string): Promise<ShadowRoot> => {
  const el = document.createElement("aktion-app") as ScriptedEl;
  document.body.appendChild(el);
  el.setResponse(source);
  await settle();
  return el.shadowRoot as ShadowRoot;
};

describe("component name case", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the built-in for the PascalCase spelling", async () => {
    const root = await render(`$app(Card([Text("x")]))`);
    expect(root.querySelector(".rui-card")).not.toBeNull();
    expect(root.querySelector(".rui-skeleton")).toBeNull();
  });

  it("does not resolve the built-in for the lowercase spelling, and reports nothing", async () => {
    const source = `$app(card([text("x")]))`;
    const root = await render(source);
    expect(root.querySelector(".rui-card")).toBeNull();
    expect(root.querySelector(".rui-skeleton")).not.toBeNull();
    expect(getDiagnostics(source, defaultLibrary)).toEqual([]);
  });

  it("resolves a user function only by the spelling it was declared with", async () => {
    const declared = await render(`function card(t) { return Text(t) }\n$app(card("hi"))`);
    expect(declared.textContent).toContain("hi");
    const respelled = await render(`function Card2(t) { return Text(t) }\n$app(card2("hi"))`);
    expect(respelled.querySelector(".rui-skeleton")).not.toBeNull();
  });
});
