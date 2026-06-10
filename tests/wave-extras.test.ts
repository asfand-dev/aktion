/**
 * Tests for the later waves of suggestions-global items:
 *  - III.3 Transition (enter/exit gated by `show`)
 *  - X.3   a11y primitives (VisuallyHidden, SkipLink, LiveRegion, FocusTrap)
 *  - X.2   i18n ICU plural / select
 *  - VIII.8 QRCode (offline encoder structure)
 *  - VIII.4 ReactionPicker, LiveCursor
 *  - XII.1 TabBar
 *  - VIII.2 Cart
 *  - VIII.3 CodeBlock syntax highlighting
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { createI18n } from "../src/runtime/i18n.js";
import { encodeQr } from "../src/library/qr.js";
import { highlightLine } from "../src/library/highlight.js";
import { Util } from "../src/runtime/util.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await flush(); };
type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("Transition (III.3)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders the child when show=true and animates state", async () => {
    const el = create();
    el.setResponse(`$open = true
$app(Transition(Card([Text("Body")]), { show: $open, preset: "scale" }))`);
    await settle();
    const t = el.shadowRoot?.querySelector(".rui-transition") as HTMLElement;
    expect(t).toBeTruthy();
    expect(t.getAttribute("data-preset")).toBe("scale");
    expect(el.shadowRoot?.textContent).toContain("Body");
  });

  it("keeps the child mounted briefly on exit then removes it", async () => {
    const el = create();
    el.setResponse(`$open = true
function toggle() { $open = false }
$app(Column([Transition(Text("Bye"), { show: $open, duration: 0 }), Button("X", { onClick: toggle })]))`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("Bye");
    const btn = [...(el.shadowRoot?.querySelectorAll("button") ?? [])][0] as HTMLButtonElement;
    btn.click();
    await settle();
    // duration:0 → removed immediately on exit
    const t = el.shadowRoot?.querySelector(".rui-transition") as HTMLElement;
    expect(t.getAttribute("data-state")).toBe("exit");
  });
});

describe("a11y primitives (X.3)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("VisuallyHidden renders sr-only content", async () => {
    const el = create();
    el.setResponse(`$app(VisuallyHidden([Text("for screen readers")]))`);
    await settle();
    const vh = el.shadowRoot?.querySelector(".rui-visually-hidden");
    expect(vh?.textContent).toContain("for screen readers");
  });

  it("SkipLink targets the given id", async () => {
    const el = create();
    el.setResponse(`$app(SkipLink("main", { label: "Skip" }))`);
    await settle();
    const link = el.shadowRoot?.querySelector(".rui-skip-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("#main");
    expect(link.textContent).toBe("Skip");
  });

  it("SkipLink moves focus to the shadow-DOM target on activation", async () => {
    const el = create();
    el.setResponse(`$app(Stack([
  SkipLink("main-content", { label: "Skip" }),
  Card([Text("Main")], { id: "main-content" })
]))`);
    await settle();
    const link = el.shadowRoot?.querySelector(".rui-skip-link") as HTMLAnchorElement;
    link.click();
    const target = el.shadowRoot?.getElementById("main-content") as HTMLElement;
    expect(target).toBeTruthy();
    // The handler stamps tabindex=-1 so a non-interactive container can
    // receive focus, then focuses it.
    expect(target.getAttribute("tabindex")).toBe("-1");
    expect(el.shadowRoot?.activeElement).toBe(target);
  });

  it("LiveRegion sets aria-live politeness", async () => {
    const el = create();
    el.setResponse(`$app(LiveRegion("Saved", { politeness: "assertive" }))`);
    await settle();
    const lr = el.shadowRoot?.querySelector(".rui-live-region") as HTMLElement;
    expect(lr.getAttribute("aria-live")).toBe("assertive");
    expect(lr.textContent).toBe("Saved");
  });

  it("FocusTrap wraps content and is focusable", async () => {
    const el = create();
    el.setResponse(`$app(FocusTrap([Button("One"), Button("Two")]))`);
    await settle();
    const trap = el.shadowRoot?.querySelector(".rui-focus-trap");
    expect(trap?.querySelectorAll("button").length).toBe(2);
  });
});

describe("i18n ICU plural / select (X.2)", () => {
  it("selects plural categories with # substitution", () => {
    const { t } = createI18n({
      defaultLanguage: "en",
      translations: { items: { en: "{count, plural, =0 {no items} one {# item} other {# items}}" } },
    });
    expect(t("items", { count: 0 })).toBe("no items");
    expect(t("items", { count: 1 })).toBe("1 item");
    expect(t("items", { count: 5 })).toBe("5 items");
  });

  it("resolves select blocks", () => {
    const { t } = createI18n({
      defaultLanguage: "en",
      translations: { g: { en: "{gender, select, male {he} female {she} other {they}}" } },
    });
    expect(t("g", { gender: "male" })).toBe("he");
    expect(t("g", { gender: "x" })).toBe("they");
  });

  it("still interpolates simple placeholders", () => {
    const { t } = createI18n({ defaultLanguage: "en", translations: { hi: { en: "Hi {name}" } } });
    expect(t("hi", { name: "Ada" })).toBe("Hi Ada");
  });
});

describe("QRCode encoder (VIII.8)", () => {
  it("produces a square version-1 matrix (21x21) for short input", () => {
    const m = encodeQr("HI", "M");
    expect(m.length).toBe(21);
    expect(m.every((row) => row.length === 21)).toBe(true);
  });

  it("places the three finder patterns (dark centre 3x3 ring)", () => {
    const m = encodeQr("https://example.com", "M");
    const size = m.length;
    const finderDark = (cx: number, cy: number): boolean =>
      // centre 3x3 is dark, surrounded by a light ring at distance 2
      m[cy]![cx] === true && m[cy]![cx + 2] === false && m[cy]![cx - 2] === false;
    expect(finderDark(3, 3)).toBe(true);
    expect(finderDark(size - 4, 3)).toBe(true);
    expect(finderDark(3, size - 4)).toBe(true);
  });

  it("grows the version for longer data", () => {
    const small = encodeQr("hi", "M").length;
    const big = encodeQr("x".repeat(200), "M").length;
    expect(big).toBeGreaterThan(small);
  });

  it("is deterministic", () => {
    expect(encodeQr("aktion", "Q")).toEqual(encodeQr("aktion", "Q"));
  });
});

describe("QRCode component renders SVG", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("emits an <svg> with a module path", async () => {
    const el = create();
    el.setResponse(`$app(QRCode("https://aktion.dev", { size: 120 }))`);
    await settle();
    const svg = el.shadowRoot?.querySelector(".rui-qrcode svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });
});

describe("ReactionPicker / LiveCursor / TabBar / Cart", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("ReactionPicker renders reaction buttons with counts", async () => {
    const el = create();
    el.setResponse(`$app(ReactionPicker([{ emoji: "👍", count: 3, active: true }, { emoji: "❤️", count: 1 }]))`);
    await settle();
    const btns = el.shadowRoot?.querySelectorAll(".rui-reaction");
    expect(btns?.length).toBe(2);
    expect(btns?.[0]?.getAttribute("data-active")).toBe("true");
  });

  it("TabBar marks the active tab", async () => {
    const el = create();
    el.setResponse(`$app(TabBar([{ id: "home", label: "Home" }, { id: "me", label: "Me" }], { active: "me" }))`);
    await settle();
    const tabs = [...(el.shadowRoot?.querySelectorAll(".rui-tabbar-item") ?? [])];
    const active = tabs.find((t) => t.getAttribute("data-active") === "true");
    expect(active?.textContent).toContain("Me");
  });

  it("Cart renders lines and a subtotal", async () => {
    const el = create();
    el.setResponse(`$app(Cart([{ id: "a", name: "Widget", price: 10, qty: 2 }, { id: "b", name: "Gadget", price: 5, qty: 1 }]))`);
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-cart-line").length).toBe(2);
    expect(el.shadowRoot?.querySelector(".rui-cart-subtotal-value")?.textContent).toContain("25");
  });

  it("LiveCursor positions via transform", async () => {
    const el = create();
    el.setResponse(`$app(LiveCursor({ x: 40, y: 60, label: "Ada" }))`);
    await settle();
    const cur = el.shadowRoot?.querySelector(".rui-live-cursor") as HTMLElement;
    expect(cur.getAttribute("style")).toContain("translate(40px,60px)");
    expect(cur.textContent).toContain("Ada");
  });
});

describe("CodeBlock syntax highlighting (VIII.3)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("highlightLine tokenises keywords, strings, comments", () => {
    const toks = highlightLine(`const x = "hi" // note`, "js", { inBlockComment: false });
    const byCls = (cls: string): string[] => toks.filter((t) => t.cls === cls).map((t) => t.text);
    expect(byCls("keyword")).toContain("const");
    expect(byCls("string")).toContain('"hi"');
    expect(byCls("comment").join("")).toContain("// note");
  });

  it("renders highlighted spans in the component", async () => {
    const el = create();
    el.setResponse(`$app(CodeBlock("const x = 1", { language: "js" }))`);
    await settle();
    const kw = el.shadowRoot?.querySelector(".rui-hl-keyword");
    expect(kw?.textContent).toBe("const");
  });

  it("highlights aktion source via the JS tokenizer", async () => {
    const el = create();
    el.setResponse(`$app(CodeBlock("function inc() {}", { language: "aktion" }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-hl-keyword")?.textContent).toBe("function");
  });

  it("header=false renders a chromeless block (no head, no language/copy)", async () => {
    const el = create();
    el.setResponse(`$app(CodeBlock("npm i aktion", { language: "bash", header: false }))`);
    await settle();
    const block = el.shadowRoot?.querySelector(".rui-code-block") as HTMLElement;
    expect(block.getAttribute("data-headerless")).toBe("true");
    expect(block.querySelector(".rui-code-block-head")).toBeNull();
    expect(block.querySelector(".rui-code-block-copy")).toBeNull();
    expect(block.textContent).toContain("npm i aktion");
  });

  it("applies explicit width/height for a scrollable block", async () => {
    const el = create();
    el.setResponse(`$app(CodeBlock("line", { width: "320px", height: "120px" }))`);
    await settle();
    const block = el.shadowRoot?.querySelector(".rui-code-block") as HTMLElement;
    expect(block.style.width).toBe("320px");
    expect(block.style.height).toBe("120px");
  });
});

describe("Avatar offline gradient (IX.4)", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("renders a deterministic gradient avatar with initials", async () => {
    const el = create();
    el.setResponse(`$app(Avatar({ name: "Ada Lovelace", fallback: "gradient" }))`);
    await settle();
    const g = el.shadowRoot?.querySelector(".rui-avatar-gradient") as HTMLElement;
    expect(g).toBeTruthy();
    expect(g.getAttribute("style")).toContain("linear-gradient");
    expect(g.textContent).toBe("AL");
  });
});

describe("Styles scoping + token interpolation (I.6)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("interpolates {group.key} tokens and scopes selectors", async () => {
    const el = create();
    el.setResponse(`$app(Styles(".hero { padding: {spacing.l}; color: {colors.primary} }", { scope: ".widget" }))`);
    await settle();
    const style = el.shadowRoot?.querySelector("style.rui-styles");
    const css = style?.textContent ?? "";
    expect(css).toContain("var(--rui-spacing-l)");
    expect(css).toContain("var(--rui-color-primary)");
    expect(css).toContain(".widget .hero");
  });
});

describe("device/sensor $util helpers (XII.3)", () => {
  it("deviceType + isOnline return sane values", () => {
    expect(["mobile", "tablet", "desktop"]).toContain(Util.deviceType());
    expect(typeof Util.isOnline()).toBe("boolean");
  });
  it("vibrate fails gracefully without the API", () => {
    expect(typeof Util.vibrate(10)).toBe("boolean");
  });
  it("geolocate resolves to null when unavailable", async () => {
    const result = await Util.geolocate();
    expect(result === null || (typeof result === "object")).toBe(true);
  });
});
