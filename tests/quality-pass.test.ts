/**
 * Quality pass — regression tests for the audit fixes:
 *
 *  - sx: logical inline spacing (X.1), ps/pe/ms/me, fontSize/weight,
 *    textDecoration, bgOverlay + bgImage scheme whitelist, themeable z-index,
 *    responsive maps on the expanded key set
 *  - $theme zIndex/motion groups (I.2)
 *  - $form: dirty flag, submit() alias, async submitting, asyncCustom rules
 *  - $socket: status field, send queue, reconnect with backoff (VI.3)
 *  - $util: copy resolves real success, throttleFn trailing edge
 *  - components: Metric gradient prop, NavBar burger, Sheet/ConfirmDialog
 *    Escape, Calendar arrow-key navigation, Confetti self-cleanup
 *  - tooling: tailwindToSx typography/responsive/state mapping,
 *    htmlToAktion class→sx, axe svg-name + aria-labelledby rules
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { serializeSx } from "../src/library/sx.js";
import { tailwindToSx } from "../src/tooling/schema.js";
import { htmlToAktion } from "../src/tooling/html-import.js";
import { parse } from "../src/parser/index.js";
import { StateStore, createContext, planProgram } from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";
import { Util } from "../src/runtime/util.js";
import { axe } from "../src/testing/index.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await flush(); };

type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};
const textOf = (el: ScriptedEl): string => el.shadowRoot?.textContent ?? "";
const clickButton = async (el: ScriptedEl, label: string): Promise<void> => {
  const btn = [...(el.shadowRoot?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").includes(label)) as HTMLButtonElement;
  btn.click();
  await settle();
};

/* ────────────────────────────────────────────────────────────────────── */
/*  sx serializer upgrades                                                */
/* ────────────────────────────────────────────────────────────────────── */

describe("sx — logical properties & typography (I.1/X.1)", () => {
  it("px/mx emit logical inline padding/margin so RTL mirrors", () => {
    const { style } = serializeSx({ px: "l", mx: "auto" });
    expect(style).toContain("padding-inline:var(--rui-spacing-l)");
    expect(style).toContain("margin-inline:auto");
    expect(style).not.toContain("padding-left");
  });

  it("ps/pe/ms/me map to inline-start/end", () => {
    const { style } = serializeSx({ ps: "m", pe: "s", ms: "xs", me: "xl" });
    expect(style).toContain("padding-inline-start:var(--rui-spacing-m)");
    expect(style).toContain("padding-inline-end:var(--rui-spacing-s)");
    expect(style).toContain("margin-inline-start:var(--rui-spacing-xs)");
    expect(style).toContain("margin-inline-end:var(--rui-spacing-xl)");
  });

  it("fontSize/weight/textDecoration resolve bounded values", () => {
    const { style } = serializeSx({ fontSize: "2xl", weight: "700", textDecoration: "underline" });
    expect(style).toContain("font-size:1.5rem");
    expect(style).toContain("font-weight:700");
    expect(style).toContain("text-decoration:underline");
    const bad = serializeSx({ weight: "javascript:x" });
    expect(bad.style).not.toContain("font-weight");
  });

  it("bgImage whitelists schemes and composes a bgOverlay layer", () => {
    const ok = serializeSx({ bgImage: "/hero.jpg", bgOverlay: "rgba(0,0,0,0.4)" });
    expect(ok.style).toContain('background-image:linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("/hero.jpg")');
    const gradient = serializeSx({ bgImage: "https://cdn.x/y.png", bgOverlay: "gradient.brand" });
    expect(gradient.style).toContain('var(--rui-gradient-brand), url("https://cdn.x/y.png")');
    const evil = serializeSx({ bgImage: "javascript:alert(1)" });
    expect(evil.style).not.toContain("background-image");
    const blob = serializeSx({ bgImage: "blob:abc" });
    expect(blob.style).not.toContain("background-image");
    const dataImg = serializeSx({ bgImage: "data:image/png;base64,AAA" });
    expect(dataImg.style).toContain("background-image");
  });

  it("bgOverlay alone paints a tint layer", () => {
    const { style } = serializeSx({ bgOverlay: "gradient.cool" });
    expect(style).toContain("background-image:var(--rui-gradient-cool)");
  });

  it("expanded keys accept responsive maps (or fall back to base inline)", () => {
    const out = serializeSx({ opacity: { base: 0.5, md: 1 }, border: { base: "subtle", lg: "strong" } });
    const handled = out.classes.length > 0
      || (out.style.includes("opacity:0.5") && out.style.includes("border:1px solid var(--rui-color-border-subtle)"));
    expect(handled).toBe(true);
  });
});

describe("$theme zIndex/motion groups (I.2)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("applies --rui-z-* / --rui-motion-* vars that sx tokens consume", async () => {
    const el = create();
    el.setResponse(`$theme({ zIndex: { modal: 2000 }, motion: { fast: "100ms" } })
$app(Box([Text("x")], { sx: { zIndex: "modal" } }))`);
    await settle();
    expect(el.style.getPropertyValue("--rui-z-modal")).toBe("2000");
    expect(el.style.getPropertyValue("--rui-motion-fast")).toBe("100ms");
    const styled = [...(el.shadowRoot?.querySelectorAll("*") ?? [])]
      .find((n) => (n.getAttribute("style") ?? "").includes("--rui-z-modal"));
    expect(styled?.getAttribute("style")).toContain("z-index:var(--rui-z-modal, 1300)");
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/*  $form upgrades (V.1/V.2)                                              */
/* ────────────────────────────────────────────────────────────────────── */

describe("$form — dirty / submit alias / async (V.1, V.2)", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("tracks dirty across edits and reset", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { name: "" }, rules: {} })
$app(Column([
  Text(\`dirty:\${form.dirty}\`),
  Button("Edit", { onClick: () => form.setField("name", "x") }),
  Button("Reset", { onClick: () => form.reset() })
]))`);
    await settle();
    expect(textOf(el)).toContain("dirty:false");
    await clickButton(el, "Edit");
    expect(textOf(el)).toContain("dirty:true");
    await clickButton(el, "Reset");
    expect(textOf(el)).toContain("dirty:false");
  });

  it("flips dirty when a two-way binding writes (not just setField)", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { name: "" }, rules: {} })
$app(Column([
  Text(\`dirty:\${form.dirty}\`),
  Input("name", { value: form.values.name })
]))`);
    await settle();
    expect(textOf(el)).toContain("dirty:false");
    const input = el.shadowRoot?.querySelector("input") as HTMLInputElement;
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(textOf(el)).toContain("dirty:true");
    // Reverting to the clean value flips dirty back off (snapshot compare).
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(textOf(el)).toContain("dirty:false");
  });

  it("Input onBlur fires with the current value (validate-on-blur)", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { email: "" }, rules: { email: [$util.rules.required()] } })
$app(Column([
  Text(\`err:\${form.errors.email ?? "none"}\`),
  Input("email", { value: form.values.email, onBlur: () => form.touch("email") })
]))`);
    await settle();
    expect(textOf(el)).toContain("err:none");
    const input = el.shadowRoot?.querySelector("input") as HTMLInputElement;
    input.dispatchEvent(new Event("blur"));
    await settle();
    expect(textOf(el)).toContain("err:This field is required");
  });

  it("exposes submit() as the spec'd alias of handleSubmit()", async () => {
    const el = create();
    el.setResponse(`
$done = ""
form = $form({ values: { n: "1" }, rules: {}, onSubmit: (v) => { $done = "yes" } })
$app(Column([Text(\`done:\${$done}\`), Button("Go", { onClick: () => form.submit() })]))`);
    await settle();
    await clickButton(el, "Go");
    expect(textOf(el)).toContain("done:yes");
  });

  it("keeps submitting=true for the whole async onSubmit", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { n: "1" }, rules: {}, onSubmit: (v) => $util.sleep(40) })
$app(Column([Text(\`submitting:\${form.submitting}\`), Button("Go", { onClick: () => form.submit() })]))`);
    await settle();
    const btn = [...(el.shadowRoot?.querySelectorAll("button") ?? [])][0] as HTMLButtonElement;
    btn.click();
    await settle();
    expect(textOf(el)).toContain("submitting:true");
    await new Promise((r) => setTimeout(r, 80));
    await settle();
    expect(textOf(el)).toContain("submitting:false");
  });

  it("asyncCustom validators block submit until they resolve invalid", async () => {
    const el = create();
    el.setResponse(`
$done = ""
form = $form({
  values: { user: "taken" },
  rules: { user: [$util.rules.asyncCustom((v) => $util.sleep(10).then(() => v != "taken"), "Name taken")] },
  onSubmit: (v) => { $done = "yes" }
})
$app(Column([
  Text(\`err:\${form.errors.user ?? "none"}\`),
  Text(\`done:\${$done}\`),
  Button("Go", { onClick: () => form.submit() })
]))`);
    await settle();
    await clickButton(el, "Go");
    await new Promise((r) => setTimeout(r, 40));
    await settle();
    expect(textOf(el)).toContain("err:Name taken");
    expect(textOf(el)).not.toContain("done:yes");
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/*  $socket status / queue / reconnect (VI.3)                             */
/* ────────────────────────────────────────────────────────────────────── */

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  send(data: unknown): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.emit("close", {}); }
  emit(type: string, ev: unknown): void { for (const cb of this.listeners[type] ?? []) cb(ev); }
  open(): void { this.readyState = 1; this.emit("open", {}); }
}

function socketContext(source: string) {
  const program = parse(source);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary, notify: () => {} });
  planProgram(program, ctx);
  return { ctx, state };
}

describe("$socket — status, queue, reconnect (VI.3)", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("walks connecting → open → closed and queues early sends", async () => {
    const { ctx } = socketContext(`$chat = $socket({ url: "wss://x" })\naktion = Stack()`);
    const sock = () => ctx.state.get("chat") as { status: string; send: (d: unknown) => void; close: () => void };
    expect(sock().status).toBe("connecting");
    sock().send({ early: true }); // queued — not dropped
    const ws = MockWebSocket.instances[0]!;
    expect(ws.sent).toHaveLength(0);
    ws.open();
    expect(sock().status).toBe("open");
    expect(ws.sent[0]).toBe(JSON.stringify({ early: true }));
    sock().close();
    expect(sock().status).toBe("closed");
  });

  it("reconnects with backoff when reconnect is enabled", async () => {
    vi.useFakeTimers();
    const { ctx } = socketContext(`$chat = $socket({ url: "wss://x", reconnect: true })\naktion = Stack()`);
    const sock = () => ctx.state.get("chat") as { status: string; attempts: number };
    const first = MockWebSocket.instances[0]!;
    first.open();
    expect(sock().status).toBe("open");
    first.close(); // server drop — not user-initiated
    expect(sock().status).toBe("connecting");
    expect(sock().attempts).toBe(1);
    vi.advanceTimersByTime(600);
    expect(MockWebSocket.instances).toHaveLength(2);
    MockWebSocket.instances[1]!.open();
    expect(sock().status).toBe("open");
    expect(sock().attempts).toBe(0); // reset on success
  });

  it("does not reconnect after a user close, even with reconnect on", async () => {
    vi.useFakeTimers();
    const { ctx } = socketContext(`$chat = $socket({ url: "wss://x", reconnect: true })\naktion = Stack()`);
    const sock = () => ctx.state.get("chat") as { status: string; close: () => void };
    MockWebSocket.instances[0]!.open();
    sock().close();
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(sock().status).toBe("closed");
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/*  $util fixes                                                            */
/* ────────────────────────────────────────────────────────────────────── */

describe("$util — copy & throttle (XIII.6)", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("copy resolves true only when the clipboard write succeeds", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(Util.copy("hi")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    await expect(Util.copy("hi")).resolves.toBe(false);
    vi.stubGlobal("navigator", {});
    await expect(Util.copy("hi")).resolves.toBe(false);
  });

  it("throttleFn fires the trailing call with the latest args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = Util.throttleFn(fn, 100);
    throttled("a");
    throttled("b");
    throttled("c");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");
    vi.advanceTimersByTime(120);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/*  Component fixes                                                        */
/* ────────────────────────────────────────────────────────────────────── */

describe("component fixes (VIII/X)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("Metric respects gradient:false (and defaults gradient on)", async () => {
    const el = create();
    el.setResponse(`$app(Column([
  Metric("170+", { label: "on" }),
  Metric("7", { label: "off", gradient: false })
]))`);
    await settle();
    const values = el.shadowRoot?.querySelectorAll(".rui-metric-value");
    expect(values?.[0]?.getAttribute("data-gradient")).toBe("true");
    expect(values?.[1]?.hasAttribute("data-gradient")).toBe(false);
  });

  it("NavBar renders a burger that toggles the mobile menu", async () => {
    const el = create();
    el.setResponse(`$app(NavBar({ links: [Link("Docs", { href: "#d" })] }))`);
    await settle();
    const burger = el.shadowRoot?.querySelector(".rui-navbar2-burger") as HTMLButtonElement;
    expect(burger).toBeTruthy();
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    burger.click();
    await settle();
    const bar = el.shadowRoot?.querySelector(".rui-navbar2") as HTMLElement;
    expect(bar.getAttribute("data-menu-open")).toBe("true");
  });

  it("Sheet closes on Escape", async () => {
    const el = create();
    el.setResponse(`$open = true
$app(Column([Text(\`open:\${$open}\`), Sheet([Text("body")], { open: $open, title: "Panel" })]))`);
    await settle();
    expect(textOf(el)).toContain("open:true");
    const panel = el.shadowRoot?.querySelector(".rui-sheet-panel") as HTMLElement;
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(textOf(el)).toContain("open:false");
  });

  it("ConfirmDialog cancels on Escape", async () => {
    const el = create();
    el.setResponse(`$open = true
$cancelled = "no"
$app(Column([
  Text(\`c:\${$cancelled}\`),
  ConfirmDialog("Delete?", { open: $open, onCancel: () => { $cancelled = "yes" } })
]))`);
    await settle();
    const card = el.shadowRoot?.querySelector(".rui-confirm-card") as HTMLElement;
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(textOf(el)).toContain("c:yes");
  });

  it("Calendar arrow keys move focus across the grid", async () => {
    const el = create();
    el.setResponse(`$app(Calendar({ month: 1, year: 2024 }))`);
    await settle();
    const days = [...(el.shadowRoot?.querySelectorAll(".rui-gcal-day") ?? [])] as HTMLButtonElement[];
    days[0]!.focus();
    const grid = el.shadowRoot?.querySelector(".rui-gcal-grid") as HTMLElement;
    grid.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    expect(el.shadowRoot?.activeElement).toBe(days[1]);
    grid.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await settle();
    expect(el.shadowRoot?.activeElement).toBe(days[8]);
  });

  it("Confetti pieces remove themselves when their animation ends", async () => {
    const el = create();
    el.setResponse(`$app(Confetti({ count: 5 }))`);
    await settle();
    const pieces = [...(el.shadowRoot?.querySelectorAll(".rui-confetti-piece") ?? [])];
    expect(pieces.length).toBe(5);
    for (const p of pieces) p.dispatchEvent(new Event("animationend"));
    await settle();
    expect(el.shadowRoot?.querySelectorAll(".rui-confetti-piece").length).toBe(0);
  });

  it("TabBar marks the active tab with aria-current", async () => {
    const el = create();
    el.setResponse(`$app(TabBar([{ id: "home", label: "Home" }, { id: "feed", label: "Feed" }], { active: "feed" }))`);
    await settle();
    const tabs = [...(el.shadowRoot?.querySelectorAll(".rui-tabbar-item") ?? [])];
    expect(tabs[1]?.getAttribute("aria-current")).toBe("page");
    expect(tabs[0]?.hasAttribute("aria-current")).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/*  Tooling upgrades (XIV)                                                 */
/* ────────────────────────────────────────────────────────────────────── */

describe("tailwindToSx — typography, responsive, states (XIV.2)", () => {
  it("maps typography, sizing, layers, and overflow", () => {
    const sx = tailwindToSx("font-bold text-lg w-1/2 max-w-md z-50 overflow-hidden flex-1 border");
    expect(sx.weight).toBe("700");
    expect(sx.fontSize).toBe("lg");
    expect(sx.w).toBe("50%");
    expect(sx.maxW).toBe("448px");
    expect(sx.zIndex).toBe(50);
    expect(sx.overflow).toBe("hidden");
    expect(sx.grow).toBe(1);
    expect(sx.border).toBe("default");
    expect(sx._unmapped).toBeUndefined();
  });

  it("turns responsive prefixes into breakpoint maps", () => {
    const sx = tailwindToSx("p-4 md:p-8 lg:flex-row flex flex-col");
    expect(sx.p).toEqual({ base: "m", md: "l" });
    expect(sx.direction).toEqual({ base: "column", lg: "row" });
  });

  it("nests state prefixes under sx.states instead of dropping them", () => {
    const sx = tailwindToSx("bg-white hover:bg-primary hover:shadow-lg focus:opacity-75");
    expect(sx.bg).toBe("surface");
    expect((sx.states as Record<string, unknown>).hover).toEqual({ bg: "primary", shadow: "lg" });
    expect((sx.states as Record<string, unknown>).focus).toEqual({ opacity: 0.75 });
  });

  it("keeps genuinely unmappable classes under _unmapped", () => {
    const sx = tailwindToSx("dark:bg-black bg-white custom-thing");
    expect(sx.bg).toBe("surface");
    expect(sx._unmapped).toEqual(["dark:bg-black", "custom-thing"]);
  });
});

describe("htmlToAktion — class→sx + flex containers (XIV.1)", () => {
  it("maps flex classes to Row/Column and Tailwind utilities to sx", () => {
    const out = htmlToAktion('<div class="flex gap-4"><div class="flex-1">L</div><div class="flex flex-col">R</div></div>');
    expect(out).toContain("Row([");
    expect(out).toContain('"gap":"m"');
    expect(out).toContain('"grow":1');
    expect(out).toContain('Column([Text("R")])');
    expect(() => parse(out)).not.toThrow();
  });

  it("keeps unmapped classes under className", () => {
    const out = htmlToAktion('<div class="hero-banner p-4">x</div>');
    expect(out).toContain('"p":"m"');
    expect(out).toContain('className: "hero-banner"');
    expect(() => parse(out)).not.toThrow();
  });
});

describe("axe — svg + labelledby rules (XIV.6)", () => {
  it("flags unlabeled svgs but accepts titled/hidden/control-owned ones", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <svg id="bad"></svg>
      <svg aria-hidden="true"></svg>
      <svg aria-label="Chart"></svg>
      <svg><title>Logo</title></svg>
      <button aria-label="Play"><svg></svg></button>`;
    const violations = axe(host);
    expect(violations.filter((v) => v.rule === "svg-name")).toHaveLength(1);
    expect(violations.some((v) => v.rule === "button-name")).toBe(false);
  });

  it("resolves aria-labelledby and rejects dangling references", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <span id="lbl">Search</span>
      <button aria-labelledby="lbl"></button>
      <input aria-labelledby="missing">`;
    const violations = axe(host);
    expect(violations.some((v) => v.rule === "button-name")).toBe(false);
    expect(violations.some((v) => v.rule === "label")).toBe(true);
  });
});
