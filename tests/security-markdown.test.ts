/**
 * Markdown renderer XSS regression tests.
 *
 * `Markdown` output goes through `innerHTML`, and its input is the most
 * attacker-controlled data in the product (LLM output, chat messages, tool
 * responses). Every case here is a payload that previously executed.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Render a Markdown document and return the generated markup. */
async function md(source: string): Promise<{ html: string; root: ShadowRoot }> {
  // The DSL string literal is single-quoted here, so escape any single quotes.
  const literal = source.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  const screen = render(`$app(Markdown('${literal}'))`);
  await settle();
  const node = screen.shadowRoot.querySelector(".rui-markdown");
  return { html: node?.innerHTML ?? "", root: screen.shadowRoot };
}

describe("Markdown image alt attribute", () => {
  it("does not let the alt text break out of the attribute", async () => {
    const { html, root } = await md('![" onerror="globalThis.__pwned=1](https://example.com/x.png)');
    // The quote must be encoded, so no new attribute can be introduced.
    expect(html).not.toContain('onerror="');
    const img = root.querySelector("img.rui-markdown-image");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("onerror")).toBeNull();
    // The payload survives as inert alt text.
    expect(img!.getAttribute("alt")).toContain('onerror=');
  });

  it("keeps a single quote from breaking a single-quoted attribute", async () => {
    const { root } = await md("![' onerror='globalThis.__pwned=1](https://example.com/x.png)");
    const img = root.querySelector("img.rui-markdown-image");
    expect(img!.getAttribute("onerror")).toBeNull();
  });
});

describe("Markdown fenced code language", () => {
  it("does not let the fence info string break out of data-language", async () => {
    const { html, root } = await md('```js" onmouseover="globalThis.__pwned=1\nconst a = 1;\n```');
    expect(html).not.toContain('onmouseover="');
    const pre = root.querySelector("pre.rui-markdown-code");
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute("onmouseover")).toBeNull();
  });
});

describe("Markdown autolinker", () => {
  it("does not rewrite a URL that sits inside generated markup", async () => {
    // The autolinker used to run over already-generated HTML, so a URL inside
    // the image's alt attribute got an <a href="…"> spliced into it — which
    // terminated the alt attribute and injected attributes into the <img>.
    const { root } = await md("![see https://evil.example/x](https://example.com/y.png)");
    const imgs = root.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    // No anchor may have been created inside the image tag.
    expect(imgs[0]!.querySelector?.("a") ?? null).toBeNull();
    expect(imgs[0]!.getAttribute("alt")).toContain("https://evil.example/x");
    // And the img must carry only its intended attributes.
    const names = imgs[0]!.getAttributeNames().sort();
    expect(names).toEqual(["alt", "class", "loading", "src"]);
  });

  it("still autolinks a bare URL in ordinary prose", async () => {
    const { root } = await md("visit https://example.com/docs for more");
    const a = root.querySelector("a.rui-link") as HTMLAnchorElement | null;
    expect(a).not.toBeNull();
    expect(a!.getAttribute("href")).toBe("https://example.com/docs");
    expect(a!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("leaves ordinary numbers in text untouched", async () => {
    // Guards the fragment-sentinel mechanism: a naive sentinel (e.g. a
    // space-delimited index) would swallow prose like "step 1 done".
    const { root } = await md("step 1 done and 2 more");
    expect(root.querySelector(".rui-markdown")!.textContent).toContain("step 1 done and 2 more");
  });
});

describe("Markdown link href", () => {
  it("rejects javascript: URLs", async () => {
    const { root } = await md("[click](javascript:globalThis.__pwned=1)");
    const a = root.querySelector("a.rui-link") as HTMLAnchorElement | null;
    expect(a!.getAttribute("href")).toBe("#");
  });

  it("rejects entity-encoded javascript: URLs in an image src", async () => {
    // The HTML parser decodes `&#106;` inside an attribute value, so a scheme
    // check that runs on the raw text sees `&#106;avascript:` and lets it by.
    const { root } = await md("![x](&#106;avascript:globalThis.__pwned=1)");
    const img = root.querySelector("img.rui-markdown-image");
    expect(img).toBeNull();
  });

  it("rejects protocol-relative URLs", async () => {
    const { root } = await md("[click](//evil.example/x)");
    const a = root.querySelector("a.rui-link") as HTMLAnchorElement | null;
    expect(a!.getAttribute("href")).toBe("#");
  });
});

describe("Markdown text escaping", () => {
  it("escapes raw HTML in the source", async () => {
    const { html } = await md("<img src=x onerror=globalThis.__pwned=1>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
