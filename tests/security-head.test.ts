/**
 * `$head(...)` security regression tests.
 *
 * `$head` is the one runtime API that writes OUTSIDE the shadow DOM, into the
 * host page's `<head>` and `<html>`. A program that can inject there owns the
 * host application, so every field is allow-listed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

function managed(): Element[] {
  return [...document.head.querySelectorAll("[data-rui-head]")];
}

beforeEach(() => {
  document.head.querySelectorAll("[data-rui-head]").forEach((n) => n.remove());
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("onload");
});

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-rui-head]").forEach((n) => n.remove());
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("$head base", () => {
  it("rejects a protocol-relative base that would hijack host-relative URLs", async () => {
    // `<base href="//evil">` rewrites how the HOST page resolves every
    // relative URL it has — script src, form action, fetch("/api/…").
    render(`$app(Column([$head({ base: "//evil.example/" }), Text("x")]))`);
    await settle();
    expect(document.head.querySelector("base[data-rui-head]")).toBeNull();
  });

  it("rejects an absolute cross-origin base", async () => {
    render(`$app(Column([$head({ base: "https://evil.example/app/" }), Text("x")]))`);
    await settle();
    expect(document.head.querySelector("base[data-rui-head]")).toBeNull();
  });

  it("rejects a javascript: base", async () => {
    render(`$app(Column([$head({ base: "javascript:globalThis.__pwned=1" }), Text("x")]))`);
    await settle();
    expect(document.head.querySelector("base[data-rui-head]")).toBeNull();
  });

  it("still accepts a same-origin base path", async () => {
    render(`$app(Column([$head({ base: "/app/" }), Text("x")]))`);
    await settle();
    const base = document.head.querySelector("base[data-rui-head]");
    expect(base?.getAttribute("href")).toBe("/app/");
  });
});

describe("$head link", () => {
  it("rejects rel=stylesheet (attacker CSS over the whole host page)", async () => {
    render(`$app(Column([$head({ link: [{ rel: "stylesheet", href: "https://evil.example/x.css" }] }), Text("x")]))`);
    await settle();
    expect(document.head.querySelector("link[rel=stylesheet][data-rui-head]")).toBeNull();
  });

  it("rejects rel=preload as=script", async () => {
    render(`$app(Column([$head({ link: [{ rel: "preload", as: "script", href: "https://evil.example/x.js" }] }), Text("x")]))`);
    await settle();
    expect(managed().some((n) => n.getAttribute("rel") === "preload")).toBe(false);
  });

  it("rejects rel=modulepreload", async () => {
    render(`$app(Column([$head({ link: [{ rel: "modulepreload", href: "https://evil.example/x.js" }] }), Text("x")]))`);
    await settle();
    expect(managed().some((n) => n.getAttribute("rel") === "modulepreload")).toBe(false);
  });

  it("rejects a protocol-relative href on an allowed rel", async () => {
    render(`$app(Column([$head({ link: [{ rel: "canonical", href: "//evil.example/x" }] }), Text("x")]))`);
    await settle();
    expect(document.head.querySelector("link[rel=canonical][data-rui-head]")).toBeNull();
  });

  it("drops an on* attribute on a link", async () => {
    render(`$app(Column([$head({ link: [{ rel: "canonical", href: "/x", onload: "globalThis.__pwned=1" }] }), Text("x")]))`);
    await settle();
    const link = document.head.querySelector("link[rel=canonical][data-rui-head]");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("onload")).toBeNull();
  });

  it("still accepts a canonical link", async () => {
    render(`$app(Column([$head({ link: [{ rel: "canonical", href: "https://example.com/page" }] }), Text("x")]))`);
    await settle();
    const link = document.head.querySelector("link[rel=canonical][data-rui-head]");
    expect(link?.getAttribute("href")).toBe("https://example.com/page");
  });
});

describe("$head htmlAttrs", () => {
  it("rejects style, which would let a program overlay the host page", async () => {
    render(`$app(Column([$head({ htmlAttrs: { style: "position:fixed;inset:0;z-index:99999;background:#000" } }), Text("x")]))`);
    await settle();
    expect(document.documentElement.getAttribute("style")).toBeNull();
  });

  it("rejects on* handlers", async () => {
    render(`$app(Column([$head({ htmlAttrs: { onload: "globalThis.__pwned=1" } }), Text("x")]))`);
    await settle();
    expect(document.documentElement.getAttribute("onload")).toBeNull();
  });

  it("still accepts lang and dir", async () => {
    render(`$app(Column([$head({ htmlAttrs: { lang: "de", dir: "ltr" } }), Text("x")]))`);
    await settle();
    expect(document.documentElement.getAttribute("lang")).toBe("de");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });
});

describe("$head meta", () => {
  it("cannot inject http-equiv (meta refresh / CSP downgrade)", async () => {
    render(`$app(Column([$head({ meta: { "http-equiv": "refresh" } }), Text("x")]))`);
    await settle();
    // The key is always emitted as the *value* of `name`, never as `http-equiv`.
    expect(document.head.querySelector("meta[http-equiv][data-rui-head]")).toBeNull();
  });

  it("drops a meta key that is not a valid attribute name", async () => {
    render(`$app(Column([$head({ meta: { 'x" onload="globalThis.__pwned=1': "y" } }), Text("x")]))`);
    await settle();
    expect(managed().some((n) => n.getAttribute("onload") !== null)).toBe(false);
  });
});

describe("SSR head serialisation", () => {
  it("does not let a link attribute name inject a second attribute", async () => {
    // `escapeAttr` on a NAME is not enough: the name is emitted outside quotes,
    // so `a onload=alert(1)` would become two attributes in the SSR output.
    const { renderToString } = await import("../src/runtime/ssr.js");
    const { head } = renderToString(
      `$app(Column([$head({ link: [{ rel: "canonical", href: "/x", "a onload=globalThis.__pwned=1": "y" }] }), Text("x")]))`,
    );
    // Guard against a vacuous pass: the link must actually have been emitted.
    expect(head).toContain('rel="canonical"');
    expect(head).not.toContain("onload=");
  });

  it("escapes a quote in a meta content value", async () => {
    const { renderToString } = await import("../src/runtime/ssr.js");
    const { head } = renderToString(
      `$app(Column([$head({ meta: { description: '\\" onload=\\"globalThis.__pwned=1' } }), Text("x")]))`,
    );
    expect(head).toContain("<meta");
    expect(head).not.toContain('onload="');
    expect(head).toContain("&quot;");
  });

  it("rejects a cross-origin base in the SSR output too", async () => {
    const { renderToString } = await import("../src/runtime/ssr.js");
    const { head } = renderToString(
      `$app(Column([$head({ base: "//evil.example/", title: "t" }), Text("x")]))`,
    );
    expect(head).toContain("<title>");
    expect(head).not.toContain("<base");
  });
});
