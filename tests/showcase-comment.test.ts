/**
 * The pull-request comment built by scripts/showcase-comment.mjs. The workflow
 * finds its previous comment by the marker on the first line and edits it in
 * place, so the marker is a contract with .github/workflows/_screenshots.yml.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MARKER, renderComment } from "../scripts/showcase-comment.mjs";

const variant = (id: string, label: string, width: number, parts: number, extra: Record<string, unknown> = {}) => ({
  id,
  label,
  width,
  height: parts * 1000,
  state: "ready",
  problems: [] as string[],
  files: Array.from({ length: parts }, (_, i) => ({ name: `shot-${id}${parts > 1 ? `-part${i + 1}` : ""}.jpg` })),
  ...extra,
});

const options = { assets: "https://example.com/assets/", page: "https://example.com/showcase.html", commit: "0123456789abcdef", run: "https://example.com/run/1" };

describe("showcase screenshot comment", () => {
  it("starts with the marker the workflow searches for", () => {
    const body: string = renderComment({ variants: [variant("desktop-light", "Desktop", 1440, 1)] }, options);
    expect(body.split("\n")[0]).toBe(MARKER);
    const workflow = readFileSync(".github/workflows/_screenshots.yml", "utf-8");
    expect(workflow).toContain(`startswith("${MARKER}")`);
  });

  it("expands the first variant and stacks its parts as one continuous image", () => {
    const body: string = renderComment({ variants: [variant("desktop-light", "Desktop", 1440, 2), variant("desktop-dark", "Dark", 1440, 1)] }, options);
    expect(body).toContain("<details open>");
    expect(body.match(/<details>/g)).toHaveLength(1);
    // No whitespace between the parts, so nothing separates them on the page.
    expect(body).toContain('part 1 of 2"><img src="https://example.com/assets/shot-desktop-light-part2.jpg"');
    expect(body).toContain("at 0123456.");
  });

  it("lays narrow phone captures out side by side, top-aligned", () => {
    const body: string = renderComment({ variants: [variant("mobile-light", "Mobile", 390, 3)] }, options);
    expect(body.match(/width="180" align="top"/g)).toHaveLength(3);
    expect(body).toContain("Read the columns left to right");
  });

  it("warns when a capture never got ready or the page logged errors", () => {
    const broken = variant("desktop-light", "Desktop", 1440, 1, { state: "timeout", problems: ["console: <boom> & bust"] });
    const body: string = renderComment({ variants: [broken] }, options);
    expect(body).toContain("> [!WARNING]");
    expect(body).toContain("(timeout)");
    expect(body).toContain("desktop-light: console: &lt;boom> &amp; bust");
  });
});
