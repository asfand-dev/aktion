/**
 * Tests for the suggestions-global Phase 1 foundation:
 *  - the universal `sx` / `animate` / `id` channel (Part I, III)
 *  - expanded theme tokens + gradients (Part I.2/I.3)
 *  - new marketing / layout / utility components (Part II, VIII)
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { serializeSx, resolveAnimate, applyUniversal } from "../src/library/sx.js";

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

type ScriptedEl = HTMLElement & { setResponse(text: string): void };

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await flush();
};

const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("sx serializer (Part I.1)", () => {
  it("maps spacing tokens to CSS variables", () => {
    const { style } = serializeSx({ p: "l", gap: "m" });
    expect(style).toContain("padding:var(--rui-spacing-l)");
    expect(style).toContain("gap:var(--rui-spacing-m)");
  });

  it("maps safe-area inset tokens (II.5)", () => {
    expect(serializeSx({ pb: "safe-bottom" }).style).toContain("padding-bottom:env(safe-area-inset-bottom)");
    expect(serializeSx({ pt: "safe-top" }).style).toContain("padding-top:env(safe-area-inset-top)");
    expect(serializeSx({ p: "safe" }).style).toContain(
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
    );
  });

  it("maps dvh sizing keyword (II.5)", () => {
    expect(serializeSx({ minH: "dvh" }).style).toContain("min-height:100dvh");
  });

  it("maps color tokens and gradient refs", () => {
    expect(serializeSx({ bg: "surface" }).style).toContain("background:var(--rui-color-surface)");
    expect(serializeSx({ bg: "gradient.brand" }).style).toContain("background:var(--rui-gradient-brand)");
    expect(serializeSx({ color: "text-muted" }).style).toContain("color:var(--rui-color-text-muted)");
  });

  it("maps radius, shadow, and size keywords", () => {
    const { style } = serializeSx({ radius: "lg", shadow: "md", w: "full", maxW: "640px" });
    expect(style).toContain("border-radius:var(--rui-radius-lg)");
    expect(style).toContain("box-shadow:var(--rui-shadow-md)");
    expect(style).toContain("width:100%");
    expect(style).toContain("max-width:640px");
  });

  it("maps flex shorthands and z-index aliases", () => {
    const { style } = serializeSx({ display: "flex", align: "center", justify: "between", zIndex: "modal" });
    expect(style).toContain("display:flex");
    expect(style).toContain("align-items:center");
    expect(style).toContain("justify-content:space-between");
    // Layer tokens are themeable vars (I.2) with the documented default baked in.
    expect(style).toContain("z-index:var(--rui-z-modal, 1300)");
  });

  it("emits hover utility classes (no dynamic CSS)", () => {
    const { classes } = serializeSx({ hover: { lift: true, glow: true } });
    expect(classes).toContain("ak-hover-lift");
    expect(classes).toContain("ak-hover-glow");
  });

  it("rejects unsafe color values", () => {
    const { style } = serializeSx({ color: "red;}body{display:none" });
    expect(style).not.toContain("display:none");
  });

  it("ignores unknown keys", () => {
    const { style } = serializeSx({ wat: "nope", p: "m" });
    expect(style).toBe("padding:var(--rui-spacing-m)");
  });
});

describe("animate resolver (Part III.1)", () => {
  it("maps presets to classes", () => {
    const { classes } = resolveAnimate("fade-up");
    expect(classes).toEqual(["ak-anim", "ak-anim-fade-up"]);
  });

  it("supports delay/duration overrides", () => {
    const { classes, style } = resolveAnimate({ preset: "pulse", delay: 200, duration: 800 });
    expect(classes).toContain("ak-anim-pulse");
    expect(style).toContain("animation-delay:200ms");
    expect(style).toContain("animation-duration:800ms");
  });

  it("ignores unknown presets", () => {
    expect(resolveAnimate("nope").classes).toEqual([]);
  });
});

describe("applyUniversal", () => {
  it("merges style, classes, id, aria onto an element", () => {
    const el = document.createElement("div");
    el.setAttribute("style", "color:red");
    applyUniversal(el, { sx: { p: "m" }, className: "extra", id: "hero", aria: { label: "x" } });
    expect(el.getAttribute("style")).toContain("color:red");
    expect(el.getAttribute("style")).toContain("padding:var(--rui-spacing-m)");
    expect(el.classList.contains("extra")).toBe(true);
    expect(el.id).toBe("hero");
    expect(el.getAttribute("aria-label")).toBe("x");
  });

  it("no-ops on non-elements", () => {
    expect(() => applyUniversal(document.createTextNode("x"), { sx: { p: "m" } })).not.toThrow();
  });
});

describe("universal channel end-to-end (Part I.1)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("applies sx to any component via the evaluator", async () => {
    const el = create();
    el.setResponse(`$app(Card([CardHeader("Hi")], { sx: { bg: "gradient.brand", radius: "lg", p: "xl" } }))`);
    await settle();
    const card = el.shadowRoot?.querySelector(".rui-card") as HTMLElement;
    expect(card).toBeTruthy();
    const style = card.getAttribute("style") ?? "";
    expect(style).toContain("var(--rui-gradient-brand)");
    expect(style).toContain("var(--rui-radius-lg)");
  });

  it("applies animate + id to any component", async () => {
    const el = create();
    el.setResponse(`$app(Text("Hello", { animate: "fade-up", id: "greeting" }))`);
    await settle();
    const node = el.shadowRoot?.querySelector("#greeting") as HTMLElement;
    expect(node).toBeTruthy();
    expect(node.classList.contains("ak-anim-fade-up")).toBe(true);
  });

  it("a real slot named the same as a universal prop still wins (id is universal, sx is not a slot)", async () => {
    const el = create();
    el.setResponse(`$app(Column([Text("a")], { sx: { gap: "l" } }))`);
    await settle();
    const col = el.shadowRoot?.querySelector(".rui-stack, .rui-column, [class*=stack]") as HTMLElement;
    expect(col?.getAttribute("style") ?? "").toContain("var(--rui-spacing-l)");
  });
});

describe("expanded theme tokens + gradients (Part I.2/I.3)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("$theme gradients group sets --rui-gradient-* vars", async () => {
    const el = create();
    el.setResponse(`$theme({ gradients: { brand: ["#ff0000", "#00ff00"] } })
$app(Text("x"))`);
    await settle();
    const host = el as HTMLElement;
    expect(host.style.getPropertyValue("--rui-gradient-brand")).toContain("linear-gradient");
    expect(host.style.getPropertyValue("--rui-gradient-brand")).toContain("#ff0000");
  });

  it("$theme spacing group extends spacing scale", async () => {
    const el = create();
    el.setResponse(`$theme({ spacing: { "3xl": "120px" } })
$app(Text("x"))`);
    await settle();
    expect((el as HTMLElement).style.getPropertyValue("--rui-spacing-3xl")).toBe("120px");
  });
});

describe("new marketing/layout components (Part II, VIII)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("GradientText renders with the gradient class", async () => {
    const el = create();
    el.setResponse(`$app(Display(["Build ", GradientText("fast")]))`);
    await settle();
    const grad = el.shadowRoot?.querySelector(".rui-gradient-text");
    expect(grad?.textContent).toBe("fast");
    expect(el.shadowRoot?.querySelector(".rui-display")).toBeTruthy();
  });

  it("Section renders eyebrow/title/subtitle + children", async () => {
    const el = create();
    el.setResponse(`$app(Section([Text("body")], { eyebrow: "Why", title: "One language", subtitle: "Everything", background: "soft", align: "center" }))`);
    await settle();
    const section = el.shadowRoot?.querySelector(".rui-section") as HTMLElement;
    expect(section).toBeTruthy();
    expect(section.getAttribute("data-bg")).toBe("soft");
    expect(el.shadowRoot?.querySelector(".rui-section-title")?.textContent).toContain("One language");
    expect(el.shadowRoot?.textContent).toContain("body");
  });

  it("NavBar + Brand render brand, links, actions", async () => {
    const el = create();
    el.setResponse(`$app(NavBar({ brand: Brand("Aktion", { version: "v1" }), links: [Link("Docs", { href: "x.html" })], actions: [Button("Go")] }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-navbar2")).toBeTruthy();
    expect(el.shadowRoot?.querySelector(".rui-brand")?.textContent).toContain("Aktion");
    expect(el.shadowRoot?.textContent).toContain("Docs");
  });

  it("MetricStrip + Metric render values", async () => {
    const el = create();
    el.setResponse(`$app(MetricStrip([Metric("170+", { label: "Components" }), Metric("7", { label: "Themes" })]))`);
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-metric").length).toBe(2);
    expect(el.shadowRoot?.textContent).toContain("Components");
  });

  it("CodeWindow takes a code string and renders it chromeless + highlighted", async () => {
    const el = create();
    el.setResponse(`$app(CodeWindow("$x = 1", { file: "a.aktion", preview: Text("live") }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-codewindow")).toBeTruthy();
    expect(el.shadowRoot?.querySelector(".rui-window-file")?.textContent).toBe("a.aktion");
    const block = el.shadowRoot?.querySelector(".rui-codewindow-code .rui-code-block") as HTMLElement;
    expect(block.getAttribute("data-headerless")).toBe("true");
    expect(block.querySelector(".rui-code-block-head")).toBeNull();
    expect(block.textContent).toContain("$x = 1");
    expect(el.shadowRoot?.querySelector(".rui-codewindow-preview")?.textContent).toContain("live");
    expect(el.shadowRoot?.querySelector(".rui-window-live")).toBeTruthy();
  });

  it("CodeWindow infers the highlight language from the file extension", async () => {
    const el = create();
    el.setResponse(`$app(CodeWindow("const x = 1", { file: "main.js" }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-hl-keyword")?.textContent).toBe("const");
  });

  it("CodeWindow still accepts a legacy CodeBlock(...) node", async () => {
    const el = create();
    el.setResponse(`$app(CodeWindow(CodeBlock("let y = 2", { language: "js" }), { file: "b.aktion" }))`);
    await settle();
    const block = el.shadowRoot?.querySelector(".rui-codewindow-code .rui-code-block") as HTMLElement;
    expect(block.getAttribute("data-headerless")).toBe("true");
    expect(block.textContent).toContain("let y = 2");
    // language lifted from the legacy node
    expect(block.querySelector(".rui-hl-keyword")?.textContent).toBe("let");
  });

  it("CodeWindow preview:true runs the code string as a live app", async () => {
    const el = create();
    el.setResponse(`$app(CodeWindow("$app(Text(\\"hi from preview\\"))", { file: "demo.aktion", preview: true }))`);
    await settle();
    const app = el.shadowRoot?.querySelector(".rui-codewindow-preview aktion-app");
    expect(app).toBeTruthy();
    expect(app?.getAttribute("response")).toContain("hi from preview");
  });

  it("Backdrop renders grid + blobs + a particle canvas", async () => {
    const el = create();
    el.setResponse(`$app(Section([Backdrop({ grid: true, blobs: ["#6366f1", "#ec4899"], particles: 10, type: "snow" })]))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-backdrop-grid")).toBeTruthy();
    expect(el.shadowRoot?.querySelectorAll(".rui-backdrop-blob").length).toBe(2);
    const canvas = el.shadowRoot?.querySelector("canvas.rui-backdrop-canvas") as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    expect(canvas.getAttribute("data-count")).toBe("10");
    expect(canvas.getAttribute("data-type")).toBe("snow");
  });

  it("Backdrop omits the particle canvas when particles is 0", async () => {
    const el = create();
    el.setResponse(`$app(Section([Backdrop({ grid: true })]))`);
    await settle();
    expect(el.shadowRoot?.querySelector("canvas.rui-backdrop-canvas")).toBeNull();
  });

  it("CopyButton shows the copied confirmation after a click", async () => {
    const el = create();
    el.setResponse(`$app(CopyButton("npm i aktion", { label: "Copy", copiedLabel: "Copied ✓" }))`);
    await settle();
    const btn = el.shadowRoot?.querySelector(".rui-copy-button") as HTMLButtonElement;
    expect(btn.textContent).toContain("Copy");
    btn.click();
    expect(btn.getAttribute("data-copied")).toBe("true");
    expect(btn.querySelector(".rui-copy-button-label")?.textContent).toBe("Copied ✓");
  });

  it("Footer renders brand/tagline/columns/legal", async () => {
    const el = create();
    el.setResponse(`$app(Footer({ brand: Brand("Aktion"), tagline: "A language", columns: [FooterColumn("Product", [Link("Docs", { href: "d.html" })])], legal: "© 2026" }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-footer")).toBeTruthy();
    expect(el.shadowRoot?.querySelector(".rui-footer-legal")?.textContent).toContain("2026");
    expect(el.shadowRoot?.textContent).toContain("Product");
  });

  it("SegmentedControl renders options and marks the active one", async () => {
    const el = create();
    el.setResponse(`$plan = "pro"
$app(SegmentedControl(["free", "pro", "team"], { value: $plan }))`);
    await settle();
    const buttons = el.shadowRoot?.querySelectorAll(".rui-segmented button") ?? [];
    expect(buttons.length).toBe(3);
    const active = [...buttons].find((b) => b.getAttribute("aria-pressed") === "true");
    expect(active?.textContent).toBe("pro");
  });
});

describe("e-commerce / content / utility components (Part VIII)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("PriceTag computes discount percent", async () => {
    const el = create();
    el.setResponse(`$app(PriceTag(80, { compareAt: 100 }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-pricetag-now")?.textContent).toBe("$80");
    expect(el.shadowRoot?.querySelector(".rui-pricetag-was")?.textContent).toBe("$100");
    expect(el.shadowRoot?.querySelector(".rui-pricetag-off")?.textContent).toBe("-20%");
  });

  it("QuantityStepper increments a bound $variable", async () => {
    const el = create();
    el.setResponse(`$qty = 1
$app(QuantityStepper($qty, { min: 0, max: 5 }))`);
    await settle();
    const plus = [...(el.shadowRoot?.querySelectorAll(".rui-qty button") ?? [])].find((b) => b.textContent === "+") as HTMLButtonElement;
    plus.click();
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-qty-value")?.textContent).toBe("2");
  });

  it("ProductCard renders title, price, badge", async () => {
    const el = create();
    el.setResponse(`$app(ProductCard("Sneakers", { price: 59, compareAt: 89, badge: "Sale", rating: 4 }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-product-title")?.textContent).toBe("Sneakers");
    expect(el.shadowRoot?.querySelector(".rui-product-badge")?.textContent).toBe("Sale");
    expect(el.shadowRoot?.querySelectorAll(".rui-product-rating .rui-icon").length).toBe(5);
  });

  it("TableOfContents renders nav links", async () => {
    const el = create();
    el.setResponse(`$app(TableOfContents([{ label: "Intro", href: "#intro" }, { label: "Setup", href: "#setup", level: 2 }]))`);
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-toc-item").length).toBe(2);
    expect(el.shadowRoot?.querySelector(".rui-toc-item a")?.getAttribute("href")).toBe("#intro");
  });

  it("TypingIndicator renders three dots", async () => {
    const el = create();
    el.setResponse(`$app(TypingIndicator("Ada"))`);
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-typing-dots i").length).toBe(3);
    expect(el.shadowRoot?.textContent).toContain("Ada");
  });
});

describe("$util formatting helpers (Part XIII.6)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("slugify, currency, percent, bytes, truncate, initials", async () => {
    const el = create();
    el.setResponse(`$app(Column([
  Text($util.slugify("Hello World! 2026")),
  Text($util.currency(1234.5, "USD", "en-US")),
  Text($util.percent(0.42)),
  Text($util.bytes(1536)),
  Text($util.truncate("abcdefghij", 5)),
  Text($util.initials("Ada Lovelace"))
]))`);
    await settle();
    const txt = el.shadowRoot?.textContent ?? "";
    expect(txt).toContain("hello-world-2026");
    expect(txt).toContain("$1,234.50");
    expect(txt).toContain("42%");
    expect(txt).toContain("1.5 KB");
    expect(txt).toContain("abcd…");
    expect(txt).toContain("AL");
  });
});
