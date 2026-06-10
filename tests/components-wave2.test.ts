/**
 * Tests for the second wave of suggestions-global components & helpers:
 *  - Layout/motion: Split, Bento/BentoCell, Reveal, OnGesture, Sortable, etc.
 *  - Extras: Svg, Sheet, ConfirmDialog, VariantSelector, OrderSummary, etc.
 *  - Helpers: $util.style (cx/gradient/alpha/clamp/token), $util.rules validators,
 *    $util additions (uuid/debounceFn).
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { Style, Rules } from "../src/runtime/namespaces-extra.js";
import { Util } from "../src/runtime/util.js";

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

describe("$style helpers (Part XIII.2)", () => {
  it("cx joins strings, arrays, and conditional objects", () => {
    expect(Style.cx("a", ["b", "c"], { d: true, e: false })).toBe("a b c d");
    expect(Style.cx("a", "a")).toBe("a"); // de-dupes
  });

  it("gradient builds a safe linear-gradient", () => {
    expect(Style.gradient(["#ff0000", "#00ff00"], 90)).toBe("linear-gradient(90deg, #ff0000, #00ff00)");
    expect(Style.gradient(["#ff0000"])).toBe(""); // needs >= 2
  });

  it("alpha + clamp + token produce CSS strings", () => {
    expect(Style.alpha("primary", 0.12)).toContain("color-mix");
    expect(Style.clamp("16px", "2vw", "24px")).toBe("clamp(16px, 2vw, 24px)");
    expect(Style.token("spacing.l")).toBe("var(--rui-spacing-l)");
    expect(Style.token("colors.primary")).toBe("var(--rui-color-primary)");
  });

  it("rejects unsafe color input", () => {
    expect(Style.gradient(["red;}body{x", "#0f0"])).toBe("");
  });
});

describe("$rules validators (Part V.2)", () => {
  it("required / email / min", () => {
    expect(Rules.required()("")).toBeTruthy();
    expect(Rules.required()("x")).toBeNull();
    expect(Rules.email()("nope")).toBeTruthy();
    expect(Rules.email()("a@b.co")).toBeNull();
    expect(Rules.min(18)(10)).toBeTruthy();
    expect(Rules.min(18)(21)).toBeNull();
  });

  it("validate returns first error; validateAll returns map", () => {
    expect(Rules.validate("", [Rules.required(), Rules.email()])).toBe("This field is required");
    expect(Rules.validate("a@b.co", [Rules.required(), Rules.email()])).toBeNull();
    const errs = Rules.validateAll({ email: "x", age: 10 }, { email: [Rules.email()], age: [Rules.min(18)] });
    expect(Object.keys(errs)).toEqual(["email", "age"]);
  });
});

describe("$util additions (Part XIII.6)", () => {
  it("uuid produces a v4-ish id", () => {
    const id = Util.uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("debounceFn delays invocation", async () => {
    let calls = 0;
    const fn = Util.debounceFn(() => { calls += 1; }, 20);
    fn(); fn(); fn();
    expect(calls).toBe(0);
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toBe(1);
  });
});

describe("namespaces are reachable from programs", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("$util.style.token resolves inside a program", async () => {
    const el = create();
    el.setResponse(`$app(Text($util.style.token("spacing.l")))`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("var(--rui-spacing-l)");
  });

  it("$util.rules.validate runs inside a program", async () => {
    const el = create();
    el.setResponse(`$email = ""
$app(Text($util.rules.validate($email, [$util.rules.required()]) ?? "ok"))`);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("This field is required");
  });
});

describe("layout & motion components (Part II.2, III)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("Split renders two panes with a ratio", async () => {
    const el = create();
    el.setResponse(`$app(Split(Text("left"), Text("right"), { ratio: "3/2", divider: true }))`);
    await settle();
    const split = el.shadowRoot?.querySelector(".rui-split") as HTMLElement;
    expect(split).toBeTruthy();
    expect(split.getAttribute("style")).toContain("3fr 2fr");
    expect(el.shadowRoot?.querySelectorAll(".rui-split-pane").length).toBe(2);
  });

  it("Bento places cells with span", async () => {
    const el = create();
    el.setResponse(`$app(Bento([BentoCell(Text("a"), { span: "wide" }), BentoCell(Text("b"), { span: "tall" }), BentoCell(Text("c"), { span: "2x2" })]))`);
    await settle();
    const cells = el.shadowRoot?.querySelectorAll(".rui-bento-cell") ?? [];
    expect(cells.length).toBe(3);
    // Spans flow through custom properties so the responsive stylesheet can
    // collapse the grid without fighting inline styles.
    expect((cells[0] as HTMLElement).style.getPropertyValue("--rui-cell-col")).toBe("2");
    expect((cells[1] as HTMLElement).style.getPropertyValue("--rui-cell-row")).toBe("2");
    expect((cells[2] as HTMLElement).style.getPropertyValue("--rui-cell-col")).toBe("2");
    expect((cells[2] as HTMLElement).style.getPropertyValue("--rui-cell-row")).toBe("2");
    expect(el.shadowRoot?.querySelector(".rui-bento")?.getAttribute("data-cols")).toBe("6");
  });

  it("Bento clamps cell spans to the track count and marks full cells", async () => {
    const el = create();
    el.setResponse(`$app(Bento([BentoCell(Text("a"), { span: "hero" }), BentoCell(Text("b"), { span: "full" })], { columns: 2 }))`);
    await settle();
    const cells = el.shadowRoot?.querySelectorAll(".rui-bento-cell") ?? [];
    expect((cells[0] as HTMLElement).style.getPropertyValue("--rui-cell-col")).toBe("2");
    expect((cells[1] as HTMLElement).getAttribute("data-span")).toBe("full");
  });

  it("Reveal renders the child and is revealed under reduced motion", async () => {
    const el = create();
    el.setResponse(`$app(Reveal(Text("hi"), { animation: "fade-up" }))`);
    await settle();
    const reveal = el.shadowRoot?.querySelector(".rui-reveal") as HTMLElement;
    expect(reveal).toBeTruthy();
    expect(reveal.getAttribute("data-anim")).toBe("fade-up");
    expect(el.shadowRoot?.textContent).toContain("hi");
  });

  it("OnGesture fires swipe with the direction", async () => {
    const el = create();
    el.setResponse(`$msg = "none"
$app(Stack([Text("g:" + $msg), OnGesture(Card([Text("surface")]), { swipe: (dir) => { $msg = dir } })]))`);
    await settle();
    const surface = el.shadowRoot?.querySelector(".rui-gesture") as HTMLElement;
    expect(surface).toBeTruthy();
    surface.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }));
    surface.dispatchEvent(new MouseEvent("pointerup", { clientX: 90, clientY: 12, bubbles: true }));
    await settle();
    expect(el.shadowRoot?.textContent).toContain("g:right");
    // A second gesture still works after the state change re-rendered the
    // tree (the original bug: handlers/state were lost across re-renders).
    surface.dispatchEvent(new MouseEvent("pointerdown", { clientX: 50, clientY: 80, bubbles: true }));
    surface.dispatchEvent(new MouseEvent("pointerup", { clientX: 52, clientY: 10, bubbles: true }));
    await settle();
    expect(el.shadowRoot?.textContent).toContain("g:up");
  });

  it("OnGesture fires doubleTap on two quick taps", async () => {
    const el = create();
    el.setResponse(`$taps = 0
$app(Stack([Text("t:" + $taps), OnGesture(Text("tap me"), { doubleTap: () => { $taps = $taps + 1 } })]))`);
    await settle();
    const surface = el.shadowRoot?.querySelector(".rui-gesture") as HTMLElement;
    for (let i = 0; i < 2; i += 1) {
      surface.dispatchEvent(new MouseEvent("pointerdown", { clientX: 20, clientY: 20, bubbles: true }));
      surface.dispatchEvent(new MouseEvent("pointerup", { clientX: 21, clientY: 20, bubbles: true }));
    }
    await settle();
    expect(el.shadowRoot?.textContent).toContain("t:1");
  });

  it("Sortable renders draggable rows", async () => {
    const el = create();
    el.setResponse(`$items = ["a", "b", "c"]
$app(Sortable($items.map(x => Text(x))))`);
    await settle();
    const rows = el.shadowRoot?.querySelectorAll(".rui-sortable-item") ?? [];
    expect(rows.length).toBe(3);
    expect((rows[0] as HTMLElement).getAttribute("draggable")).toBe("true");
  });
});

describe("extra components (Part VIII, IX)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("Svg renders sanitised inline markup", async () => {
    const el = create();
    el.setResponse(`$app(Svg("<circle cx='12' cy='12' r='10' />", { viewBox: "0 0 24 24" }))`);
    await settle();
    const svg = el.shadowRoot?.querySelector(".rui-svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("circle")).toBeTruthy();
  });

  it("Svg strips script payloads", async () => {
    const el = create();
    el.setResponse(`$app(Svg("<script>alert(1)<\\/script><rect />"))`);
    await settle();
    const svg = el.shadowRoot?.querySelector(".rui-svg");
    expect(svg?.querySelector("script")).toBeFalsy();
  });

  it("ConfirmDialog renders title + actions when open", async () => {
    const el = create();
    el.setResponse(`$open = true
$app(ConfirmDialog("Delete item?", { open: $open, message: "Cannot undo", tone: "danger" }))`);
    await settle();
    const root = el.shadowRoot?.querySelector(".rui-confirm-root") as HTMLElement;
    expect(root.getAttribute("data-open")).toBe("true");
    expect(el.shadowRoot?.querySelector(".rui-confirm-title")?.textContent).toBe("Delete item?");
    expect(el.shadowRoot?.querySelector(".rui-confirm-ok")?.getAttribute("data-tone")).toBe("danger");
  });

  it("VariantSelector marks the selected variant", async () => {
    const el = create();
    el.setResponse(`$size = "M"
$app(VariantSelector(["S", "M", "L"], { value: $size }))`);
    await settle();
    const sel = [...(el.shadowRoot?.querySelectorAll(".rui-variant") ?? [])].find((b) => b.getAttribute("data-selected") === "true");
    expect(sel?.textContent).toBe("M");
  });

  it("OrderSummary renders lines and total", async () => {
    const el = create();
    el.setResponse(`$app(OrderSummary([{ label: "Item A", amount: 20 }], { subtotal: 20, total: 25 }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-order-line")?.textContent).toContain("Item A");
    expect(el.shadowRoot?.querySelector(".rui-order-total")?.textContent).toContain("$25");
  });

  it("PresenceAvatars caps at max with +N", async () => {
    const el = create();
    el.setResponse(`$app(PresenceAvatars([{ name: "A" }, { name: "B" }, { name: "C" }], { max: 2 }))`);
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-presence-avatar").length).toBe(2);
    expect(el.shadowRoot?.querySelector(".rui-presence-more")?.textContent).toBe("+1");
  });

  it("KbdShortcut renders key caps", async () => {
    const el = create();
    el.setResponse(`$app(KbdShortcut(["Cmd", "K"]))`);
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-kbd-key").length).toBe(2);
  });
});

describe("Image upgrades (Part IX.1)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("sets lazy loading, sizes/srcset, and blur placeholder", async () => {
    const el = create();
    el.setResponse(`$app(Image("https://example.com/p.jpg", { placeholder: "blur", sizes: "100vw", srcset: "p.jpg 1x, p2.jpg 2x", ratio: "16:9" }))`);
    await settle();
    const img = el.shadowRoot?.querySelector(".rui-image img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("sizes")).toBe("100vw");
    expect(img.getAttribute("data-blur")).toBe("true");
  });
});
