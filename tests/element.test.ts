/**
 * Behavioural tests for <llm-response-ui-lang>.
 *
 * These run in happy-dom which provides Custom Elements + ShadowRoot. The most
 * important regression here: ensuring setResponse on a program that uses
 * Query() does NOT trigger an infinite render loop (the bug that froze the
 * examples page before the fix).
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const PROGRAM_WITH_QUERY = `root = Stack([info, table])
info = Card([CardHeader("Repos"), Markdown("Loading...")])
data = Query("get_repos", {limit: 5}, {rows: [
  {name: "alpha", stars: 12},
  {name: "beta", stars: 7}
]})
table = Table([
  Col("Name", data.rows.name),
  Col("Stars", data.rows.stars, "number")
])`;

describe("<llm-response-ui-lang>", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const create = () => {
    const el = document.createElement("llm-response-ui-lang");
    document.body.appendChild(el);
    return el as HTMLElement & {
      setResponse(text: string): void;
      response: string;
      getSystemPrompt(): string;
    };
  };

  it("renders a basic program into the shadow root", async () => {
    const el = create();
    el.setResponse(`root = Card([CardHeader("Hello", "World")])`);
    await flush();
    await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-card-title")?.textContent).toBe("Hello");
    expect(shadow.querySelector(".rui-card-subtitle")?.textContent).toBe("World");
  });

  it("does not infinite-loop when the program registers a Query", async () => {
    const el = create();
    el.setResponse(PROGRAM_WITH_QUERY);
    // Drain a healthy number of microtasks; if the loop was still present,
    // the test would hang. Vitest would then exceed its default timeout.
    for (let i = 0; i < 50; i += 1) await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-table")).not.toBeNull();
    expect(shadow.querySelectorAll(".rui-table tbody tr").length).toBeGreaterThan(0);
  });

  it("re-renders without re-fetching when state changes", async () => {
    const el = create();
    el.setResponse(`$count = 0\nlabel = TextContent("" + $count, "large-heavy")\nroot = Stack([label])`);
    await flush();
    await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-text")?.textContent).toBe("0");
    // simulate state mutation through the public API
    (el as unknown as { state: { set: (k: string, v: unknown) => void } }).state.set("count", 7);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(shadow.querySelector(".rui-text")?.textContent).toBe("7");
  });

  it("accepts the response attribute declaratively", async () => {
    document.body.innerHTML = `<llm-response-ui-lang response='root = Card([CardHeader(\"From attribute\")])'></llm-response-ui-lang>`;
    await flush();
    await flush();
    const el = document.querySelector("llm-response-ui-lang")!;
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("From attribute");
  });

  it("getSystemPrompt returns LLM Response UI Lang spec text", () => {
    const el = create();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("LLM Response UI Lang");
    expect(prompt).toContain("root = Stack(");
  });
});
