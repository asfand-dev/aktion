import { describe, expect, it } from "vitest";
import {
  sanitiseHtmlToNodes,
  setSanitisedHtml,
  readSanitisedHtml,
} from "../src/library/html-sanitizer.js";

describe("sanitiseHtmlToNodes()", () => {
  it("returns an empty array for empty input", () => {
    expect(sanitiseHtmlToNodes("")).toEqual([]);
  });

  it("returns an empty array for non-string input", () => {
    expect(sanitiseHtmlToNodes(null)).toEqual([]);
    expect(sanitiseHtmlToNodes(undefined)).toEqual([]);
    expect(sanitiseHtmlToNodes(42)).toEqual([]);
  });

  it("preserves allowed elements", () => {
    const nodes = sanitiseHtmlToNodes("<p>Hello</p>");
    expect(nodes).toHaveLength(1);
    expect((nodes[0] as Element).tagName.toLowerCase()).toBe("p");
    expect((nodes[0] as Element).textContent).toBe("Hello");
  });

  it("preserves text nodes", () => {
    const nodes = sanitiseHtmlToNodes("plain text");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toBe("plain text");
  });

  it("preserves inline elements", () => {
    const html = "<strong>bold</strong> <em>italic</em> <code>code</code>";
    const nodes = sanitiseHtmlToNodes(html);
    expect(nodes.length).toBeGreaterThan(0);
    const container = document.createElement("div");
    nodes.forEach((n) => container.appendChild(n));
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("preserves list elements", () => {
    const nodes = sanitiseHtmlToNodes("<ul><li>Item</li></ul>");
    expect(nodes).toHaveLength(1);
    const ul = nodes[0] as Element;
    expect(ul.tagName.toLowerCase()).toBe("ul");
    expect(ul.querySelector("li")?.textContent).toBe("Item");
  });

  it("preserves table elements", () => {
    const html = "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>";
    const nodes = sanitiseHtmlToNodes(html);
    const container = document.createElement("div");
    nodes.forEach((n) => container.appendChild(n));
    expect(container.querySelector("th")?.textContent).toBe("Header");
    expect(container.querySelector("td")?.textContent).toBe("Cell");
  });

  it("removes disallowed elements but keeps their text", () => {
    const nodes = sanitiseHtmlToNodes("<script>alert(1)</script><p>Safe</p>");
    const container = document.createElement("div");
    nodes.forEach((n) => container.appendChild(n));
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Safe");
  });

  it("unwraps unknown elements preserving children", () => {
    const nodes = sanitiseHtmlToNodes("<section><p>Inside</p></section>");
    const container = document.createElement("div");
    nodes.forEach((n) => container.appendChild(n));
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Inside");
  });

  it("strips event handler attributes", () => {
    const nodes = sanitiseHtmlToNodes('<p onclick="alert(1)">Click</p>');
    const p = nodes[0] as Element;
    expect(p.getAttribute("onclick")).toBeNull();
    expect(p.getAttribute("onmouseover")).toBeNull();
  });

  it("strips style attributes", () => {
    const nodes = sanitiseHtmlToNodes('<p style="color:red">Styled</p>');
    const p = nodes[0] as Element;
    expect(p.getAttribute("style")).toBeNull();
  });

  it("strips id attributes (DOM clobbering prevention)", () => {
    const nodes = sanitiseHtmlToNodes('<p id="evil">Test</p>');
    const p = nodes[0] as Element;
    expect(p.getAttribute("id")).toBeNull();
  });

  it("preserves allowed attributes", () => {
    const nodes = sanitiseHtmlToNodes('<p class="intro" title="Info" lang="en">Text</p>');
    const p = nodes[0] as Element;
    expect(p.getAttribute("class")).toBe("intro");
    expect(p.getAttribute("title")).toBe("Info");
    expect(p.getAttribute("lang")).toBe("en");
  });

  it("preserves data- and aria- attributes", () => {
    const nodes = sanitiseHtmlToNodes('<p data-id="1" aria-label="test">Text</p>');
    const p = nodes[0] as Element;
    expect(p.getAttribute("data-id")).toBe("1");
    expect(p.getAttribute("aria-label")).toBe("test");
  });

  it("sanitises href on anchors", () => {
    const nodes = sanitiseHtmlToNodes('<a href="https://example.com">Link</a>');
    const a = nodes[0] as Element;
    expect(a.getAttribute("href")).toBeTruthy();
  });

  it("strips javascript: hrefs", () => {
    const nodes = sanitiseHtmlToNodes('<a href="javascript:alert(1)">Evil</a>');
    const a = nodes[0] as Element;
    const href = a.getAttribute("href");
    expect(href === null || !href.startsWith("javascript")).toBe(true);
  });

  it("sanitises src on images", () => {
    const nodes = sanitiseHtmlToNodes('<img src="https://example.com/img.png" alt="photo">');
    const img = nodes[0] as Element;
    expect(img.getAttribute("alt")).toBe("photo");
  });

  it("adds noopener noreferrer for target=_blank links", () => {
    const nodes = sanitiseHtmlToNodes('<a href="https://example.com" target="_blank">Link</a>');
    const a = nodes[0] as Element;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("strips non-_blank target values", () => {
    const nodes = sanitiseHtmlToNodes('<a href="https://example.com" target="_parent">Link</a>');
    const a = nodes[0] as Element;
    expect(a.getAttribute("target")).toBeNull();
  });

  it("preserves heading elements", () => {
    const nodes = sanitiseHtmlToNodes("<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>");
    const container = document.createElement("div");
    nodes.forEach((n) => container.appendChild(n));
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("h2")?.textContent).toBe("Subtitle");
    expect(container.querySelector("h3")?.textContent).toBe("Section");
  });

  it("returns empty array for oversized input", () => {
    const huge = "<p>" + "x".repeat(512 * 1024 + 1) + "</p>";
    expect(sanitiseHtmlToNodes(huge)).toEqual([]);
  });

  it("preserves colspan and rowspan on td/th", () => {
    const nodes = sanitiseHtmlToNodes('<table><tr><td colspan="2" rowspan="3">Cell</td></tr></table>');
    const container = document.createElement("div");
    nodes.forEach((n) => container.appendChild(n));
    const td = container.querySelector("td");
    expect(td?.getAttribute("colspan")).toBe("2");
    expect(td?.getAttribute("rowspan")).toBe("3");
  });
});

describe("setSanitisedHtml()", () => {
  it("replaces children of a target element", () => {
    const target = document.createElement("div");
    target.textContent = "old";
    setSanitisedHtml(target, "<p>new</p>");
    expect(target.querySelector("p")?.textContent).toBe("new");
    expect(target.textContent).toBe("new");
  });

  it("clears target for empty input", () => {
    const target = document.createElement("div");
    target.textContent = "old";
    setSanitisedHtml(target, "");
    expect(target.childNodes).toHaveLength(0);
  });
});

describe("readSanitisedHtml()", () => {
  it("reads and sanitises HTML from an element", () => {
    const el = document.createElement("div");
    el.innerHTML = '<p class="ok">Text</p><script>bad</script>';
    const result = readSanitisedHtml(el);
    expect(result).toContain("<p");
    expect(result).not.toContain("<script");
  });

  it("returns empty string for empty element", () => {
    const el = document.createElement("div");
    expect(readSanitisedHtml(el)).toBe("");
  });

  it("strips event handlers on read-back", () => {
    const el = document.createElement("div");
    el.innerHTML = '<p onclick="hack()">Safe</p>';
    const result = readSanitisedHtml(el);
    expect(result).not.toContain("onclick");
    expect(result).toContain("Safe");
  });
});
