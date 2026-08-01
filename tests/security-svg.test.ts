/**
 * SVG sanitiser regression tests.
 *
 * Raw SVG markup reaches the DOM through two DSL-reachable paths:
 *   - `Svg("<path …/>")`
 *   - `$theme({ icons: { name: "<svg …>" } })` + `Icon("name")`
 *
 * Both used to be guarded by a regex blocklist against the raw string, which
 * the HTML parser's entity decoding walked straight through. Each rejection
 * case below is a payload that previously survived.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { sanitiseSvgMarkup } from "../src/library/svg-sanitizer.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Sanitise markup and return the resulting element names + serialised markup. */
function scrub(markup: string): { names: string[]; html: string } {
  const safe = sanitiseSvgMarkup(markup);
  if (!safe) return { names: [], html: "" };
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const c of safe.children) host.appendChild(c);
  const names: string[] = [];
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      names.push(child.localName);
      walk(child);
    }
  };
  walk(host);
  return { names, html: host.innerHTML };
}

describe("SVG sanitiser — script execution vectors", () => {
  it("drops <script>", () => {
    const { names } = scrub('<script>globalThis.__pwned=1</script><rect width="9"/>');
    expect(names).not.toContain("script");
    expect(names).toContain("rect");
  });

  it("drops <foreignObject> (re-entry into the HTML namespace)", () => {
    const { names } = scrub('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="globalThis.__pwned=1"></body></foreignObject>');
    expect(names).not.toContain("foreignObject");
    expect(names).not.toContain("img");
  });

  it("drops SVG <a>, which executes javascript: hrefs on click", () => {
    const { names, html } = scrub('<a href="javascript:globalThis.__pwned=1"><rect width="99" height="99"/></a>');
    expect(names).not.toContain("a");
    expect(html).not.toContain("javascript:");
  });

  it("drops an <a> whose javascript: scheme is entity-encoded", () => {
    // The blocklist tested the raw string for `javascript:`, but the HTML
    // parser decodes `&#106;` to `j` inside the attribute value afterwards.
    const { names, html } = scrub('<a href="&#106;avascript:globalThis.__pwned=1"><rect width="99"/></a>');
    expect(names).not.toContain("a");
    expect(html).not.toContain("javascript:");
  });

  it("drops event-handler attributes", () => {
    const { html } = scrub('<rect width="9" onclick="globalThis.__pwned=1" onload="globalThis.__pwned=1"/>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onload");
  });

  it("drops <iframe>, <embed>, <object>", () => {
    const { names } = scrub('<iframe src="//evil.example"></iframe><embed src="//evil.example"/><object data="//evil.example"></object>');
    expect(names).toEqual([]);
  });
});

describe("SVG sanitiser — SMIL attribute injection", () => {
  it("drops an <animate> that targets href", () => {
    // SMIL can assign an attribute value after the static markup was vetted.
    const { names, html } = scrub('<a href="#x"><rect width="9"/></a><animate attributeName="href" to="javascript:globalThis.__pwned=1" begin="0s"/>');
    expect(names).not.toContain("animate");
    expect(html).not.toContain("javascript:");
  });

  it("drops an <animate> that targets an event handler", () => {
    const { names } = scrub('<animate attributeName="onclick" to="globalThis.__pwned=1"/>');
    expect(names).not.toContain("animate");
  });

  it("drops <set>, which assigns arbitrary attribute values", () => {
    const { names } = scrub('<set attributeName="href" to="javascript:globalThis.__pwned=1"/>');
    expect(names).not.toContain("set");
  });

  it("keeps an <animate> that targets an inert presentation attribute", () => {
    const { names } = scrub('<circle r="4"><animate attributeName="opacity" from="0" to="1" dur="1s"/></circle>');
    expect(names).toContain("animate");
  });
});

describe("SVG sanitiser — CSS and resource-loading vectors", () => {
  it("drops <style> (CSS injection / @import beacon)", () => {
    const { names } = scrub("<style>@import url(//evil.example/x.css);</style><rect width=\"9\"/>");
    expect(names).not.toContain("style");
    expect(names).toContain("rect");
  });

  it("drops <image>, which fetches an external URL", () => {
    const { names } = scrub('<image href="//evil.example/beacon.png" width="9" height="9"/>');
    expect(names).not.toContain("image");
  });

  it("strips url() from an inline style attribute", () => {
    const { html } = scrub('<rect width="9" style="fill:url(//evil.example/beacon)"/>');
    expect(html).not.toContain("evil.example");
  });

  it("keeps a benign inline style", () => {
    const { html } = scrub('<rect width="9" style="fill: #ff0000"/>');
    expect(html).toContain("#ff0000");
  });
});

describe("SVG sanitiser — href handling", () => {
  it("keeps a same-document fragment on <use>", () => {
    const { html } = scrub('<defs><rect id="box" width="9"/></defs><use href="#box"/>');
    expect(html).toContain('href="#box"');
  });

  it("drops an external href on <use>", () => {
    const { html } = scrub('<use href="//evil.example/x.svg#y"/>');
    expect(html).not.toContain("evil.example");
  });

  it("drops xlink:href with a javascript: payload", () => {
    const { html } = scrub('<use xlink:href="javascript:globalThis.__pwned=1"/>');
    expect(html).not.toContain("javascript:");
  });
});

describe("SVG sanitiser — legitimate markup survives", () => {
  it("keeps shapes, groups, gradients, and their presentation attributes", () => {
    const { names, html } = scrub(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
      '<g transform="translate(2,2)"><path d="M0 0 L10 10" stroke="#333" stroke-width="2" fill="none"/>' +
      '<circle cx="5" cy="5" r="3" fill="url(#g)"/></g><text x="1" y="2">hi</text>',
    );
    expect(names).toContain("linearGradient");
    expect(names).toContain("path");
    expect(names).toContain("circle");
    expect(names).toContain("text");
    expect(html).toContain('d="M0 0 L10 10"');
    expect(html).toContain('stroke-width="2"');
  });

  it("preserves text content", () => {
    const { html } = scrub('<text x="0" y="10">Total: 42</text>');
    expect(html).toContain("Total: 42");
  });

  it("rejects oversized input", () => {
    expect(sanitiseSvgMarkup(`<rect width="9"/>`.repeat(20000))).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(sanitiseSvgMarkup(null)).toBeNull();
    expect(sanitiseSvgMarkup({})).toBeNull();
    expect(sanitiseSvgMarkup(42)).toBeNull();
  });
});

describe("Svg component end-to-end", () => {
  it("renders sanitised markup without an anchor", async () => {
    const screen = render(
      `$app(Svg('<a href="javascript:globalThis.__pwned=1"><rect width="99" height="99"/></a>', { viewBox: "0 0 24 24" }))`,
    );
    await settle();
    const svg = screen.shadowRoot.querySelector("svg.rui-svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("a")).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("renders benign markup", async () => {
    const screen = render(`$app(Svg('<circle cx="12" cy="12" r="10"/>', { viewBox: "0 0 24 24" }))`);
    await settle();
    expect(screen.shadowRoot.querySelector("svg.rui-svg circle")).not.toBeNull();
  });
});

describe("$theme custom icons end-to-end", () => {
  it("does not register icon markup carrying an anchor payload", async () => {
    const screen = render(
      `$app(Column([
        $theme({ icons: { evil: '<svg><a href="&#106;avascript:globalThis.__pwned=1"><rect width="99" height="99"/></a></svg>' } }),
        Icon("evil")
      ]))`,
    );
    await settle();
    const root = screen.shadowRoot;
    expect(root.querySelector("a")).toBeNull();
    expect(root.innerHTML).not.toContain("javascript:");
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("still registers and renders a benign custom icon", async () => {
    const screen = render(
      `$app(Column([
        $theme({ icons: { logo: '<path d="M4 4 L20 20"/>' } }),
        Icon("logo")
      ]))`,
    );
    await settle();
    const path = screen.shadowRoot.querySelector(".rui-icon-custom svg path");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("d")).toBe("M4 4 L20 20");
  });
});
