/**
 * Behavioural tests for the in-script `$theme({...})` construct.
 *
 * The runtime treats a bare `$theme({...})` statement (or the equivalent
 * `theme = $theme({...})` binding) as a reserved top-level theme declaration
 * that writes partial token overrides to the host element as CSS custom
 * properties — without re-rendering the rest of the UI and without leaking
 * across renders.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import {
  applyPartialTheme,
  clearTokenOverrides,
  sanitiseThemeTokens,
  lightTheme,
  builtInThemes,
  type ThemeTokens,
} from "../src/theme/index.js";
import { isThemeNode } from "../src/runtime/index.js";

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

type ScriptedEl = HTMLElement & {
  setResponse(text: string): void;
  setTheme(theme: string | Partial<ThemeTokens>): void;
};

describe("$theme({...}) language construct", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const create = (): ScriptedEl => {
    const el = document.createElement("aktion-app");
    document.body.appendChild(el);
    return el as ScriptedEl;
  };

  it("writes token overrides as CSS custom properties on the host", async () => {
    const el = create();
    el.setResponse(`theme = $theme({
  colors: { primary: "#0969da" },
  radius: { button: "6px" },
  font:   { family: "-apple-system, sans-serif" }
})
aktion = Card([CardHeader("Hello")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#0969da");
    expect(el.style.getPropertyValue("--rui-radius-button")).toBe("6px");
    expect(el.style.getPropertyValue("--rui-font-family")).toBe(
      "-apple-system, sans-serif",
    );
  });

  it("applies a bare $theme({...}) statement with no `theme =` binding", async () => {
    const el = create();
    el.setResponse(`$theme({
  colors: { primary: "#6366f1" },
  radius: { button: "8px" }
})
aktion = Stack([Text("Hello World")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#6366f1");
    expect(el.style.getPropertyValue("--rui-radius-button")).toBe("8px");
  });

  it("applies a built-in theme via the `name` property", async () => {
    const el = create();
    el.setResponse(`$theme({ name: "neon" })
aktion = Stack([Text("Hello World")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    // The full neon palette is written as CSS custom properties on the host.
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe(
      builtInThemes.neon.colorPrimary,
    );
    expect(el.style.getPropertyValue("--rui-color-bg")).toBe(
      builtInThemes.neon.colorBg,
    );
    expect(el.style.getPropertyValue("--rui-font-family")).toBe(
      builtInThemes.neon.fontFamily,
    );
  });

  it("lets structured overrides layer on top of a `name` built-in theme", async () => {
    const el = create();
    el.setResponse(`$theme({ name: "neon", colors: { primary: "#ff00ff" } })
aktion = Stack([Text("Hello World")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    // Override wins for the primary colour...
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#ff00ff");
    // ...while the rest of the neon palette still applies.
    expect(el.style.getPropertyValue("--rui-color-bg")).toBe(
      builtInThemes.neon.colorBg,
    );
  });

  it("ignores an unknown `name` and applies no built-in palette", async () => {
    const el = create();
    el.setResponse(`$theme({ name: "not-a-theme", colors: { primary: "#123456" } })
aktion = Stack([Text("Hello World")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    // Only the explicit override is written; no built-in tokens leak in.
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#123456");
    expect(el.style.getPropertyValue("--rui-color-bg")).not.toBe(
      builtInThemes.neon.colorBg,
    );
  });

  it("clears stale tokens when a bare $theme({...}) is removed", async () => {
    const el = create();
    el.setResponse(`$theme({colors: { primary: "#6366f1" }})
aktion = Stack([Text("v1")])`);
    for (let i = 0; i < 4; i += 1) await flush();
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#6366f1");

    el.setResponse(`aktion = Stack([Text("v2")])`);
    for (let i = 0; i < 4; i += 1) await flush();
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("");
  });

  it("layers on top of the base theme; untouched tokens keep base values", async () => {
    const el = create();
    el.setAttribute("theme", "dark");
    el.setResponse(`theme = $theme({colors: { primary: "#ff5722" }})
aktion = Card([CardHeader("Hello")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#ff5722");
    // Dark base theme background should still be present (override didn't touch it).
    expect(el.style.getPropertyValue("--rui-color-bg")).toBe("#0b1220");
  });

  it("clears stale script tokens when $theme({...}) is removed from the program", async () => {
    const el = create();
    el.setResponse(`theme = $theme({colors: { primary: "#16a34a" }})
aktion = Card([CardHeader("v1")])`);
    for (let i = 0; i < 4; i += 1) await flush();
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#16a34a");

    el.setResponse(`aktion = Card([CardHeader("v2")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("");
    expect(el.style.getPropertyValue("--rui-color-bg")).toBe(
      lightTheme.colorBg,
    );
  });

  it("replaces previous script tokens when $theme({...}) changes between renders", async () => {
    const el = create();
    el.setResponse(`theme = $theme({colors: { primary: "#16a34a" }, radius: { button: "12px" }})
aktion = Card([CardHeader("v1")])`);
    for (let i = 0; i < 4; i += 1) await flush();
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#16a34a");
    expect(el.style.getPropertyValue("--rui-radius-button")).toBe("12px");

    el.setResponse(`theme = $theme({colors: { primary: "#0070f3" }})
aktion = Card([CardHeader("v2")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#0070f3");
    // Previous radius override must be cleared so the base value wins again.
    expect(el.style.getPropertyValue("--rui-radius-button")).toBe("");
  });

  it("ignores unknown token keys silently", async () => {
    const el = create();
    el.setResponse(`theme = $theme({
  colors: { primary: "#7928ca", notARealToken: "should be ignored" }
})
aktion = Card([CardHeader("Hello")])`);
    for (let i = 0; i < 4; i += 1) await flush();

    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#7928ca");
    // No CSS variable created for unknown tokens.
    expect(el.style.getPropertyValue("--rui-color-not-a-real-token")).toBe("");
  });

  it("does not require the theme binding — root alone still renders", async () => {
    const el = create();
    el.setResponse(`aktion = Card([CardHeader("No theme block")])`);
    for (let i = 0; i < 4; i += 1) await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-card-title")?.textContent).toBe(
      "No theme block",
    );
  });

  it("$theme({...}) overrides survive host-level setTheme() updates", async () => {
    const el = create();
    el.setResponse(`theme = $theme({colors: { primary: "#0969da" }})
aktion = Card([CardHeader("Hello")])`);
    for (let i = 0; i < 4; i += 1) await flush();
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#0969da");

    el.setTheme("dark");
    for (let i = 0; i < 4; i += 1) await flush();

    // After setTheme(), the host reapplies its base theme — script-level
    // overrides are written on top during the next render.
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#0969da");
    expect(el.style.getPropertyValue("--rui-color-bg")).toBe("#0b1220");
  });

  it("surfaces a warning for the legacy flat-shape Theme form", async () => {
    const el = create();
    // Use the schema-validator directly via parse() to capture warnings.
    const { parse, validateProgramSchema, defaultLibrary } = await import(
      "../src/index.js"
    );
    const program = parse(
      `theme = $theme({colorPrimary: "#0969da", radiusMd: "8px"})`,
    );
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.find((w) => w.message.includes("colorPrimary"))?.message)
      .toMatch(/legacy flat-shape/i);
    expect(warnings.find((w) => w.message.includes("colorPrimary"))?.message)
      .toMatch(/colors: \{ primary/);
    expect(warnings.find((w) => w.message.includes("radiusMd"))?.message)
      .toMatch(/radius: \{ md/);
  });

  it("rejects free-form `--css-variable` keys with a migration warning", async () => {
    const { parse, validateProgramSchema, defaultLibrary } = await import(
      "../src/index.js"
    );
    const program = parse(`theme = $theme({"--rui-color-x": "#abc"})`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]?.message).toMatch(/free-form CSS variable keys/i);
  });

  it("accepts the bare structured `$theme({...})` form with no warnings", async () => {
    const { parse, validateProgramSchema, defaultLibrary } = await import(
      "../src/index.js"
    );
    const program = parse(`$theme({ colors: { primary: "#0969da" }, radius: { button: "6px" } })
aktion = Stack([Text("hi")])`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toHaveLength(0);
  });
});

describe("theme utilities (used by $theme({...}))", () => {
  it("applyPartialTheme writes only the requested keys and returns them", () => {
    const host = document.createElement("div");
    const keys = applyPartialTheme(host, {
      colorPrimary: "#abcdef",
      radiusMd: "9px",
    });
    expect(keys).toEqual(
      expect.arrayContaining(["colorPrimary", "radiusMd"]),
    );
    expect(keys).toHaveLength(2);
    expect(host.style.getPropertyValue("--rui-color-primary")).toBe("#abcdef");
    expect(host.style.getPropertyValue("--rui-radius-md")).toBe("9px");
    expect(host.style.getPropertyValue("--rui-color-bg")).toBe("");
  });

  it("clearTokenOverrides removes only the listed keys", () => {
    const host = document.createElement("div");
    applyPartialTheme(host, {
      colorPrimary: "#abcdef",
      colorAccent: "#123456",
    });
    clearTokenOverrides(host, ["colorPrimary"]);
    expect(host.style.getPropertyValue("--rui-color-primary")).toBe("");
    expect(host.style.getPropertyValue("--rui-color-accent")).toBe("#123456");
  });

  it("sanitiseThemeTokens keeps known keys and discards unknown / empty values", () => {
    const cleaned = sanitiseThemeTokens({
      colorPrimary: "#123",
      radiusButton: "8px",
      notReal: "x",
      colorBg: "",
      colorAccentHover: null as unknown as string,
    });
    expect(cleaned.colorPrimary).toBe("#123");
    expect(cleaned.radiusButton).toBe("8px");
    expect((cleaned as Record<string, unknown>).notReal).toBeUndefined();
    expect(cleaned.colorBg).toBeUndefined();
    expect(cleaned.colorAccentHover).toBeUndefined();
  });

  it("sanitiseThemeTokens stringifies numeric values for known tokens", () => {
    const cleaned = sanitiseThemeTokens({
      buttonFontWeight: 700,
      borderWidth: "2px",
    });
    expect(cleaned.buttonFontWeight).toBe("700");
    expect(cleaned.borderWidth).toBe("2px");
  });

  it("sanitiseThemeTokens returns empty for non-object input", () => {
    expect(sanitiseThemeTokens(null)).toEqual({});
    expect(sanitiseThemeTokens(undefined)).toEqual({});
    expect(sanitiseThemeTokens("string")).toEqual({});
    expect(sanitiseThemeTokens([1, 2, 3])).toEqual({});
  });

  it("isThemeNode identifies ThemeNode markers and rejects other shapes", () => {
    expect(isThemeNode({ kind: "Theme", tokens: {} })).toBe(true);
    expect(isThemeNode({ kind: "Card" })).toBe(false);
    expect(isThemeNode(null)).toBe(false);
    expect(isThemeNode("Theme")).toBe(false);
    expect(isThemeNode(undefined)).toBe(false);
  });
});
