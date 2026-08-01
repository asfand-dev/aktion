/**
 * Denial-of-service bounds.
 *
 * Every input here is *data* a trusted program renders — an LLM response, an
 * API payload, a pasted value — so an unbounded loop or a super-linear regex
 * lets that data freeze the host page. Each case was measured to hang for
 * seconds (or exhaust memory) before the fix.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { highlightLine } from "../src/library/highlight.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Run `fn` and return how long it took, in milliseconds. */
async function timed(fn: () => Promise<void> | void): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe("CodeBlock highlightLines range", () => {
  it("does not expand a huge range into a huge Set", async () => {
    const ms = await timed(async () => {
      render(`$app(CodeBlock("const a = 1;", { language: "javascript", highlightLines: "1-999999999" }))`);
      await settle();
    });
    expect(ms).toBeLessThan(2000);
  });

  it("still highlights a normal range", async () => {
    const screen = render(
      `$app(CodeBlock("a\\nb\\nc\\nd", { language: "javascript", highlightLines: "2-3" }))`,
    );
    await settle();
    // Confirms the clamp did not break ordinary highlighting: lines 2 and 3
    // must still be marked.
    const highlighted = screen.shadowRoot.querySelectorAll('[data-highlight="true"]');
    expect(highlighted.length).toBe(2);
  });
});

describe("Progress segments", () => {
  it("clamps a huge segment count", async () => {
    const ms = await timed(async () => {
      render(`$app(Progress({ value: 50, segments: 10000000 }))`);
      await settle();
    });
    expect(ms).toBeLessThan(2000);
  });

  it("still renders a normal segment count", async () => {
    const screen = render(`$app(Progress({ value: 50, segments: 5 }))`);
    await settle();
    expect(screen.shadowRoot.querySelectorAll(".rui-progress-segment").length).toBe(5);
  });
});

describe("syntax highlighter", () => {
  it("bounds work on a pathological long line", () => {
    // Unbalanced quotes in the HTML tokeniser were the measured 5s case.
    const line = `<div class="${'"'.repeat(60000)}">`;
    const ms = performance.now();
    const tokens = highlightLine(line, "html", { inBlockComment: false });
    const elapsed = performance.now() - ms;
    expect(elapsed).toBeLessThan(1000);
    // The text is preserved (unhighlighted), not dropped.
    expect(tokens.map((t) => t.text).join("")).toBe(line);
  });

  it("still highlights a normal line", () => {
    const tokens = highlightLine(`const x = "hi";`, "javascript", { inBlockComment: false });
    expect(tokens.some((t) => t.cls === "keyword" || t.cls === "string")).toBe(true);
  });
});

describe("Markdown renderer", () => {
  it("bounds work on a very long single line", async () => {
    const ms = await timed(async () => {
      // The image/link regexes backtrack super-linearly on a long line of
      // unclosed bracket syntax.
      const payload = "!".concat("[".repeat(100000));
      render(`$app(Markdown($p))\n$p = ${JSON.stringify(payload)}`);
      await settle();
    });
    expect(ms).toBeLessThan(3000);
  });

  it("bounds work on a very large document", async () => {
    const ms = await timed(async () => {
      const payload = "a *b* [c](https://x/y)\n".repeat(20000);
      render(`$app(Markdown($p))\n$p = ${JSON.stringify(payload)}`);
      await settle();
    });
    expect(ms).toBeLessThan(4000);
  });

  it("still renders ordinary markdown intact", async () => {
    const screen = render(`$app(Markdown("# T\\n\\n- one\\n- two"))`);
    await settle();
    const md = screen.shadowRoot.querySelector(".rui-markdown")!;
    expect(md.querySelector("h1")).not.toBeNull();
    expect(md.querySelectorAll("li").length).toBe(2);
  });
});
