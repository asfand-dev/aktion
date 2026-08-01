/**
 * Regression tests for the string-to-DOM sinks and the sandbox-escape paths.
 *
 * Each case below was confirmed to execute before the fix.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { setGlobalAccessPolicy } from "../src/runtime/evaluator.js";

afterEach(() => {
  cleanup();
  setGlobalAccessPolicy("all");
  const g = globalThis as Record<string, unknown>;
  delete g.__pwned;
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("el() no longer has a magic `html` attribute key", () => {
  it("HTMLTag cannot inject markup through an attribute named `html`", async () => {
    // `el()` used to treat the attribute KEY `html` as `innerHTML = value`, and
    // HTMLTag's attribute record is built from a DSL-supplied object — so the
    // DSL could name that key itself and bypass the tag/attribute allow-lists.
    const screen = render(
      `$app(HTMLTag("div", { attributes: { html: "<img src=x onerror=\\"globalThis.__pwned=1\\">" } }))`,
    );
    await settle();
    const root = screen.shadowRoot;
    expect(root.querySelector("img")).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("the same payload spelled with a different case is also inert", async () => {
    const screen = render(
      `$app(HTMLTag("div", { attributes: { HTML: "<img src=x onerror=\\"globalThis.__pwned=1\\">" } }))`,
    );
    await settle();
    expect(screen.shadowRoot.querySelector("img")).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
});

describe("RichTextEditor value", () => {
  it("sanitises markup supplied through the value prop", async () => {
    const screen = render(
      `$app(RichTextEditor("ed", { value: "<img src=x onerror=\\"globalThis.__pwned=1\\"><b>keep</b>" }))`,
    );
    await settle();
    const content = screen.shadowRoot.querySelector(".rui-rich-text-content");
    expect(content).not.toBeNull();
    // Images are legitimate in rich text, so the <img> itself survives — what
    // must not survive is the handler that made it execute.
    const img = content!.querySelector("img");
    expect(img?.getAttribute("onerror") ?? null).toBeNull();
    expect(content!.innerHTML).not.toContain("onerror");
    // Benign formatting survives — the editor is still usable.
    expect(content!.querySelector("b")).not.toBeNull();
    expect(content!.textContent).toContain("keep");
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("strips an event handler from otherwise-allowed markup", async () => {
    const screen = render(
      `$app(RichTextEditor("ed", { value: "<b onmouseover=\\"globalThis.__pwned=1\\">hi</b>" }))`,
    );
    await settle();
    const b = screen.shadowRoot.querySelector(".rui-rich-text-content b");
    expect(b).not.toBeNull();
    expect(b!.getAttribute("onmouseover")).toBeNull();
  });

  it("rejects a javascript: href inside the value", async () => {
    const screen = render(
      `$app(RichTextEditor("ed", { value: "<a href=\\"javascript:globalThis.__pwned=1\\">x</a>" }))`,
    );
    await settle();
    const a = screen.shadowRoot.querySelector(".rui-rich-text-content a");
    expect(a?.getAttribute("href") ?? null).toBeNull();
  });
});

describe("ActionStripe href", () => {
  it("rejects a javascript: URL instead of falling back to the raw value", async () => {
    // The old code was `sanitiseCssUrl(href) || href` — a CSS-literal escaper
    // whose rejection path handed the RAW value straight to the anchor.
    const screen = render(
      `$app(ActionStripe({ label: "go", href: "javascript:globalThis.__pwned=1" }))`,
    );
    await settle();
    const a = screen.shadowRoot.querySelector("a.rui-action-stripe");
    const href = a?.getAttribute("href") ?? null;
    expect(href === null || href === "#").toBe(true);
    expect(href).not.toContain("javascript:");
  });

  it("keeps a normal https href", async () => {
    const screen = render(
      `$app(ActionStripe({ label: "go", href: "https://example.com/x" }))`,
    );
    await settle();
    const a = screen.shadowRoot.querySelector("a.rui-action-stripe");
    expect(a?.getAttribute("href")).toBe("https://example.com/x");
  });
});

describe("WebComponent properties/attributes", () => {
  it("refuses to assign innerHTML through the properties map", async () => {
    const screen = render(
      `$app(WebComponent("x-widget", { properties: { innerHTML: "<img src=x onerror=\\"globalThis.__pwned=1\\">" } }))`,
    );
    await settle();
    const host = screen.shadowRoot.querySelector("x-widget");
    expect(host).not.toBeNull();
    expect(host!.querySelector("img")).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("still passes through an ordinary custom property", async () => {
    const screen = render(
      `$app(WebComponent("x-widget", { properties: { chartData: [1, 2, 3] } }))`,
    );
    await settle();
    const host = screen.shadowRoot.querySelector("x-widget") as unknown as { chartData?: number[] };
    expect(host.chartData).toEqual([1, 2, 3]);
  });

  it("sanitises a URL attribute and drops srcdoc", async () => {
    const screen = render(
      `$app(WebComponent("x-frame", { attributes: { href: "javascript:globalThis.__pwned=1", srcdoc: "<script>globalThis.__pwned=1</script>" } }))`,
    );
    await settle();
    const host = screen.shadowRoot.querySelector("x-frame")!;
    expect(host.getAttribute("srcdoc")).toBeNull();
    expect(host.getAttribute("href")).toBeNull();
  });
});

describe("$script src validation", () => {
  it("refuses a javascript: src", async () => {
    const screen = render(
      `$s = $script({ src: "javascript:globalThis.__pwned=1" })
$app(Text($s.error ? "blocked" : "loaded"))`,
    );
    await settle();
    expect(screen.shadowRoot.textContent).toContain("blocked");
    expect(document.head.querySelector('script[src^="javascript:"]')).toBeNull();
  });

  it("refuses a data: src", async () => {
    const screen = render(
      `$s = $script({ src: "data:text/javascript,globalThis.__pwned=1" })
$app(Text($s.error ? "blocked" : "loaded"))`,
    );
    await settle();
    expect(screen.shadowRoot.textContent).toContain("blocked");
  });

  it("is disabled entirely under a restricted global-access policy", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$s = $script({ src: "https://cdn.example.com/x.js" })
$app(Text($s.error ? "blocked" : "loaded"))`,
    );
    await settle();
    expect(screen.shadowRoot.textContent).toContain("blocked");
  });
});

describe("prototype-reaching property names", () => {
  it("blocks .constructor on a lambda (the Function escape)", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$f = () => 1
$app(Column([Button("go", { onClick: () => { $f.constructor("globalThis.__pwned=1")() } })]))`,
    );
    await settle();
    for (const b of [...screen.shadowRoot.querySelectorAll("button")]) {
      try { b.click(); } catch { /* blocked path may throw */ }
    }
    await settle();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("blocks computed access to constructor", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$f = () => 1
$app(Column([Button("go", { onClick: () => { $x = $f["cons" + "tructor"]; $x && $x("globalThis.__pwned=1")() } })]))`,
    );
    await settle();
    for (const b of [...screen.shadowRoot.querySelectorAll("button")]) {
      try { b.click(); } catch { /* blocked */ }
    }
    await settle();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("blocks __proto__ reads", async () => {
    const screen = render(`$o = { a: 1 }
$app(Text($o.__proto__ ? "reached" : "blocked"))`);
    await settle();
    expect(screen.shadowRoot.textContent).toContain("blocked");
  });
});

describe("Markdown still renders through the sanitiser", () => {
  it("keeps ordinary markdown formatting", async () => {
    const screen = render(`$app(Markdown("# Title\\n\\nSome **bold** and a [link](https://example.com)."))`);
    await settle();
    const md = screen.shadowRoot.querySelector(".rui-markdown")!;
    expect(md.querySelector("h1")).not.toBeNull();
    expect(md.querySelector("strong")).not.toBeNull();
    const a = md.querySelector("a") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("rel")).toContain("noopener");
  });
});
