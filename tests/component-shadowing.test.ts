/**
 * Custom components that reuse a built-in component's name:
 *
 *   - a plain collision still renders the custom component but surfaces a
 *     banner error telling the author to rename (or wrap);
 *   - the wrapper pattern — the body calls the same name — is supported:
 *     inside its own body the name resolves to the BUILT-IN, so
 *     `function Badge(l) { return Badge(l, {...}) }` renders the library
 *     Badge instead of recursing to the depth limit (which previously
 *     produced a blank `[render error]` with no banner);
 *   - calls to user-declared names are not schema-validated against the
 *     built-in spec (the custom signature differs by design).
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await flush(); };

type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  el.setAttribute("showerrors", "true");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("validator", () => {
  it("flags a custom component that reuses a built-in name without wrapping it", () => {
    const errors = validateProgramSchema(
      parse(`function Badge(label) {\n  return Text(label)\n}\n$app(Column([Badge("x")]))`),
      defaultLibrary,
    );
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"Badge" is a built-in component name');
  });

  it("does not flag the wrapper pattern (body calls the same name)", () => {
    const errors = validateProgramSchema(
      parse(`function Badge(label) {\n  return Badge(label, { tone: "success" })\n}\n$app(Column([Badge("x")]))`),
      defaultLibrary,
    );
    expect(errors).toEqual([]);
  });

  it("does not flag custom components with non-colliding names", () => {
    const errors = validateProgramSchema(
      parse(`function PriceBadge(label) {\n  return Badge(label)\n}\n$app(Column([PriceBadge("x")]))`),
      defaultLibrary,
    );
    expect(errors).toEqual([]);
  });

  it("skips library schema checks for calls to user-declared names", () => {
    // `customProp` is not a built-in Badge prop — must not be flagged,
    // because the call targets the custom component.
    const errors = validateProgramSchema(
      parse(`function Badge(label, customProp) {\n  return Badge(label, { tone: customProp })\n}\n$app(Column([Badge("x", { customProp: "success" })]))`),
      defaultLibrary,
    );
    expect(errors).toEqual([]);
  });
});

describe("runtime", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("plain collision renders the custom component plus the banner error", async () => {
    const el = create();
    el.setResponse(`
function Badge(label) {
  return Text(label)
}
$app(Column([Badge("hello-collision")]))
`);
    await settle();
    const banner = el.shadowRoot?.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner?.textContent ?? "").toContain('"Badge" is a built-in component name');
    expect(el.shadowRoot?.textContent).toContain("hello-collision");
  });

  it("wrapper pattern renders the built-in inside the custom component, no error", async () => {
    const el = create();
    el.setResponse(`
function Badge(label) {
  return Badge(label, { tone: "success" })
}
$app(Column([Badge("hello-wrapper")]))
`);
    await settle();
    const banner = el.shadowRoot?.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner?.hidden ?? true).toBe(true);
    const badge = el.shadowRoot?.querySelector(".rui-badge") as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("hello-wrapper");
    expect(badge.getAttribute("data-variant")).toBe("success");
  });

  it("wrapper components compose from other components (outer custom, inner built-in)", async () => {
    const el = create();
    el.setResponse(`
function Button(label, opts) {
  return Row([Icon("rocket"), Button(label, { variant: "primary" })], { gap: "sm" })
}
$app(Column([Button("Launch")]))
`);
    await settle();
    const banner = el.shadowRoot?.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner?.hidden ?? true).toBe(true);
    const button = el.shadowRoot?.querySelector("button") as HTMLElement;
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Launch");
    expect(el.shadowRoot?.querySelector(".rui-icon")).toBeTruthy();
  });

  it("self-recursion without a built-in collision still works", async () => {
    const el = create();
    el.setResponse(`
function TreeRow(node, depth) {
  return Column([
    Text(node.label),
    Column((node.children ?? []).map(c => TreeRow(c, depth + 1)), { key: node.label })
  ], { key: node.label + depth })
}
$app(TreeRow({ label: "root", children: [{ label: "leaf-a" }, { label: "leaf-b" }] }, 0))
`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("root");
    expect(el.shadowRoot?.textContent).toContain("leaf-a");
    expect(el.shadowRoot?.textContent).toContain("leaf-b");
  });
});
