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

  it("hides the parse-error banner while streaming and surfaces errors after", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      appendChunk(text: string): void;
      streaming: boolean;
      showErrors: boolean;
    };
    // Opt in to the error banner so the assertions can observe it.
    el.showErrors = true;
    el.streaming = true;
    // A clearly-broken in-flight chunk: the trailing line is mid-token.
    el.setResponse(`root = Stack([body])\nbody = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);

    // Streaming completes with a fully-formed program → no errors, no banner.
    el.appendChunk(`CardHeader("Done")])`);
    el.streaming = false;
    for (let i = 0; i < 5; i += 1) await flush();
    expect(banner.hidden).toBe(true);
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Done");

    // A subsequent broken response with streaming off should surface errors.
    el.setResponse(`root = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(banner.hidden).toBe(false);
  });

  it("defaults to suppressing the parse-error banner (showErrors=false)", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      showErrors: boolean;
      streaming: boolean;
    };
    expect(el.showErrors).toBe(false);
    el.setResponse(`root = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);
  });

  it("toggles the banner reactively when showErrors flips", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      showErrors: boolean;
    };
    el.setResponse(`root = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);

    el.showErrors = true;
    for (let i = 0; i < 5; i += 1) await flush();
    expect(banner.hidden).toBe(false);

    el.showErrors = false;
    for (let i = 0; i < 5; i += 1) await flush();
    expect(banner.hidden).toBe(true);
  });

  it("still emits the error event when showErrors is false", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
    };
    let errorCount = 0;
    el.addEventListener("error", () => { errorCount += 1; });
    el.setResponse(`root = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(errorCount).toBeGreaterThan(0);
  });

  it("respects showerrors attribute set declaratively", async () => {
    document.body.innerHTML = `<llm-response-ui-lang showerrors="true" response='root = Stack([\nbroken = Card(['></llm-response-ui-lang>`;
    for (let i = 0; i < 5; i += 1) await flush();
    const el = document.querySelector("llm-response-ui-lang") as HTMLElement;
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
  });

  it("renders a streaming-friendly response progressively without flashing errors", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      appendChunk(text: string): void;
      streaming: boolean;
    };
    el.streaming = true;
    // Stream root first — children are still undefined and silently render
    // as empty until their definitions arrive.
    el.setResponse(`root = Stack([hero, body])`);
    for (let i = 0; i < 3; i += 1) await flush();
    expect(el.shadowRoot!.querySelector(".rui-stack")).not.toBeNull();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);

    el.appendChunk(`\nhero = Card([CardHeader("Streaming UI")])`);
    for (let i = 0; i < 3; i += 1) await flush();
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Streaming UI");
    expect(banner.hidden).toBe(true);

    el.appendChunk(`\nbody = Card([CardHeader("Body")])`);
    el.streaming = false;
    for (let i = 0; i < 3; i += 1) await flush();
    expect(el.shadowRoot!.querySelectorAll(".rui-card-title").length).toBe(2);
    expect(banner.hidden).toBe(true);
  });

  // Regression: typing into an Input bound to a $variable used to lose focus
  // every keystroke because state changes triggered a full re-render which
  // replaced the input element wholesale. The renderer now snapshots the
  // active element + selection range and restores it after the swap.
  it("preserves focus and selection when typing into an Input bound to state", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      streaming: boolean;
      state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
    };
    el.setResponse(`$title = ""\nfield = FormControl("Title", Input("title", "Type here", "text", null, $title))\nroot = Stack([field])`);
    for (let i = 0; i < 5; i += 1) await flush();

    const shadow = el.shadowRoot!;
    const input = shadow.getElementById("title") as HTMLInputElement;
    expect(input).not.toBeNull();

    input.focus();
    expect(shadow.activeElement).toBe(input);

    // Simulate a keystroke followed by another render tick (the way real
    // input → state.set → render plays out).
    input.value = "h";
    input.setSelectionRange(1, 1);
    el.state.set("title", "h");
    for (let i = 0; i < 5; i += 1) await flush();

    const refreshed = shadow.getElementById("title") as HTMLInputElement;
    expect(refreshed.value).toBe("h");
    expect(shadow.activeElement).toBe(refreshed);
    expect(refreshed.selectionStart).toBe(1);
    expect(refreshed.selectionEnd).toBe(1);

    // A second keystroke should also stay focused on the same element.
    refreshed.value = "hi";
    refreshed.setSelectionRange(2, 2);
    el.state.set("title", "hi");
    for (let i = 0; i < 5; i += 1) await flush();

    const after = shadow.getElementById("title") as HTMLInputElement;
    expect(after.value).toBe("hi");
    expect(shadow.activeElement).toBe(after);
    expect(after.selectionStart).toBe(2);
  });

  // The library exposes 4 built-in themes. Setting `theme` should reflect a
  // matching `data-rui-theme` attribute on the host so theme-specific
  // overrides (fonts, gradients, animations) can hook in.
  it("reflects the resolved theme name as data-rui-theme on the host", async () => {
    const el = create();
    el.setAttribute("theme", "neon");
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("neon");

    el.setAttribute("theme", "pastel");
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("pastel");

    el.setAttribute("theme", "light");
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("light");

    // Custom JSON map → "custom"
    el.setAttribute("theme", '{"colorPrimary":"#ff0000"}');
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("custom");
  });

  it("applies CSS custom properties for built-in themes", () => {
    const el = create();
    el.setAttribute("theme", "neon");
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#ec4899");
    el.setAttribute("theme", "pastel");
    expect(el.style.getPropertyValue("--rui-color-primary")).toBe("#a78bfa");
  });
});
