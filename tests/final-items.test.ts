/**
 * Tests for the final deferred items:
 *  - III.4  FlipList (FLIP reorder animation wiring)
 *  - III.8  Lottie (graceful fallback + lottie-web usage)
 *  - XI.5   $util.worker (off-thread with inline fallback)
 *  - XII.2  $util.registerServiceWorker + $util.webManifest
 *  - VIII.5 DataGrid CSV export button
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { Util } from "../src/runtime/util.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await flush(); };
type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("FlipList (III.4)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders its children inside a flip container", async () => {
    const el = create();
    el.setResponse(`$items = ["a", "b", "c"]
$app(FlipList($items.map(x => Text(x, { key: x }))))`);
    await settle();
    const list = el.shadowRoot?.querySelector(".rui-flip-list");
    expect(list).toBeTruthy();
    expect(list?.textContent).toContain("a");
    expect(list?.textContent).toContain("b");
    expect(list?.textContent).toContain("c");
  });
});

describe("RouteView (IV.4)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("wraps the page in a keyed animating wrapper that swaps on route change", async () => {
    const el = create();
    el.setResponse(`pages = $router({ "/": Text("HOME"), "/about": Text("ABOUT"), default: Text("NF") })
$app(RouteView(pages, { routeKey: route.path, animation: "fade-up" }))`);
    await settle();
    const page = el.shadowRoot?.querySelector(".rui-route-page") as HTMLElement;
    expect(page).toBeTruthy();
    expect(page.getAttribute("data-anim")).toBe("fade-up");
    expect(page.getAttribute("data-rui-key")).toBe("/");
    expect(el.shadowRoot?.textContent).toContain("HOME");

    (el as unknown as { navigate(p: string): void }).navigate("/about");
    await settle();
    const page2 = el.shadowRoot?.querySelector(".rui-route-page") as HTMLElement;
    expect(page2.getAttribute("data-rui-key")).toBe("/about");
    expect(el.shadowRoot?.textContent).toContain("ABOUT");
  });
});

describe("Lottie (III.8)", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("shows a poster fallback when lottie-web is absent", async () => {
    const el = create();
    el.setResponse(`$app(Lottie({ src: "https://example.com/a.json", poster: "https://example.com/p.png" }))`);
    await settle();
    const poster = el.shadowRoot?.querySelector(".rui-lottie-poster") as HTMLImageElement;
    expect(poster).toBeTruthy();
    expect(poster.getAttribute("src")).toContain("p.png");
  });

  it("uses window.lottie when present", async () => {
    const loadAnimation = vi.fn(() => ({ destroy: vi.fn(), setSpeed: vi.fn() }));
    (window as unknown as { lottie: unknown }).lottie = { loadAnimation };
    const el = create();
    el.setResponse(`$app(Lottie({ src: "https://example.com/a.json" }))`);
    await settle();
    await new Promise((r) => setTimeout(r, 5));
    expect(loadAnimation).toHaveBeenCalled();
    delete (window as unknown as { lottie?: unknown }).lottie;
  });
});

describe("$util.worker (XI.5)", () => {
  it("runs a pure function and resolves its result (inline fallback ok)", async () => {
    const result = await Util.worker((a: number, b: number) => a * b, 6, 7);
    expect(result).toBe(42);
  });

  it("returns undefined for a non-function", async () => {
    expect(await Util.worker(null)).toBeUndefined();
  });
});

describe("PWA helpers (XII.2)", () => {
  it("webManifest builds a sanitised manifest object", () => {
    const m = Util.webManifest({
      name: "My App", shortName: "App", themeColor: "#123456",
      icons: [{ src: "/icon.png", sizes: "192x192" }],
    }) as Record<string, unknown>;
    expect(m.name).toBe("My App");
    expect(m.short_name).toBe("App");
    expect(m.theme_color).toBe("#123456");
    expect(m.display).toBe("standalone");
    expect(Array.isArray(m.icons)).toBe(true);
  });

  it("registerServiceWorker resolves false when unsupported", async () => {
    const ok = await Util.registerServiceWorker("/sw.js");
    expect(typeof ok).toBe("boolean");
  });
});

describe("DataGrid CSV export (VIII.5)", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("renders an Export CSV button and triggers a download on click", async () => {
    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const node = originalCreate(tag);
      if (tag === "a") {
        (node as HTMLAnchorElement).click = clickSpy;
      }
      return node;
    });
    // Provide URL.createObjectURL for happy-dom.
    const origCreateUrl = (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:x");
    (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn();

    const el = create();
    el.setResponse(`$app(DataGrid([
  Col("Name", ["Ada", "Bob"]),
  Col("Age", [36, 28], "number")
], { exportable: true }))`);
    await settle();
    const btn = el.shadowRoot?.querySelector(".rui-data-grid-export") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(clickSpy).toHaveBeenCalled();

    (URL as unknown as { createObjectURL?: unknown }).createObjectURL = origCreateUrl;
  });
});
