/**
 * Behavioural tests for <streaming-ui-script>.
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

describe("<streaming-ui-script>", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const create = () => {
    const el = document.createElement("streaming-ui-script");
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

  it("renders a rich pattern-composite layout end-to-end", async () => {
    const el = create();
    el.setResponse(`root = Stack([header, kpis, board, follow])
header = PageHeader("Engineering Q3", "12 active · 4 at risk", ["Workspace", "Engineering"], headerActions, status)
headerActions = [Button("Export", null, "secondary"), Button("New project", null, "primary")]
status = Badge("On track", "success")
kpis = MetricGrid([k1, k2, k3])
k1 = StatCard("Active", "12", "flat", "0 vs last week", "chart-pie")
k2 = StatCard("At risk", "4", "up", "+2", "triangle-exclamation")
k3 = StatCard("Shipped", "8", "up", "+3", "rocket")
board = KanbanBoard([colTodo, colDoing])
colTodo = KanbanColumn("To do", [cardA])
colDoing = KanbanColumn("Doing", [cardB], "primary")
cardA = KanbanCard("Migrate auth", "Roll out new SDK.", ["auth"], "Asha")
cardB = KanbanCard("Streaming UI v2", "20 new components.", ["frontend"], "Alex", "primary", "sparkles")
follow = FollowUpBlock(["Show at-risk projects", "Compare to Q2"])`);
    for (let i = 0; i < 4; i += 1) await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-page-header-title")?.textContent).toBe("Engineering Q3");
    expect(shadow.querySelector(".rui-metric-grid")).not.toBeNull();
    expect(shadow.querySelectorAll(".rui-stat-card")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rui-kanban-column")).toHaveLength(2);
    expect(shadow.querySelectorAll(".rui-kanban-card")).toHaveLength(2);
    expect(shadow.querySelector(".rui-stat-icon")?.classList.contains("fa-chart-pie")).toBe(true);
    expect(shadow.querySelector(".rui-kanban-card-icon")?.classList.contains("fa-sparkles")).toBe(true);
    expect(shadow.querySelector(".rui-badge[data-variant='success']")?.textContent).toBe("On track");
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
    document.body.innerHTML = `<streaming-ui-script response='root = Card([CardHeader(\"From attribute\")])'></streaming-ui-script>`;
    await flush();
    await flush();
    const el = document.querySelector("streaming-ui-script")!;
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("From attribute");
  });

  it("getSystemPrompt returns Streaming UI Script spec text", () => {
    const el = create();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("Streaming UI Script");
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
    document.body.innerHTML = `<streaming-ui-script showerrors="true" response='root = Stack([\nbroken = Card(['></streaming-ui-script>`;
    for (let i = 0; i < 5; i += 1) await flush();
    const el = document.querySelector("streaming-ui-script") as HTMLElement;
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

  // Regression: typing into an email/number/url input used to send the
  // cursor to the start. The old renderer recreated the input every tick
  // and then tried `setSelectionRange`, which throws for those types. The
  // morph reconciler now reuses the same `<input>` element across renders,
  // so the browser-owned caret position is preserved natively without ever
  // needing to call setSelectionRange.
  it("preserves DOM identity for non-text input types (email/number)", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(
      `$email = ""\nfield = FormControl("Email", Input("email", "you@example.com", "email", null, $email))\nroot = Stack([field])`,
    );
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const input = shadow.getElementById("email") as HTMLInputElement;
    expect(input.type).toBe("email");
    input.focus();
    expect(shadow.activeElement).toBe(input);
    // Drive several state changes while the input is focused — the kind
    // of churn that used to blur and reset the caret.
    el.state.set("email", "a");
    for (let i = 0; i < 3; i += 1) await flush();
    el.state.set("email", "ab");
    for (let i = 0; i < 3; i += 1) await flush();
    el.state.set("email", "abc");
    for (let i = 0; i < 3; i += 1) await flush();
    const after = shadow.getElementById("email") as HTMLInputElement;
    expect(after).toBe(input); // same DOM node — never recreated
    expect(after.value).toBe("abc");
    expect(shadow.activeElement).toBe(after);
  });

  // Regression: clicking tab #2 then triggering an unrelated state change
  // used to send Tabs back to its first pane because the click-installed
  // active value lived in a closure that the new render recreated from
  // scratch. The Tabs component now uses helpers.useInstanceState so the
  // active pane survives re-renders.
  it("preserves the active tab across unrelated re-renders", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(`$count = 0
tabs = Tabs([
  TabItem("overview", "Overview", [TextContent("Overview pane")]),
  TabItem("details",  "Details",  [TextContent("Details pane")]),
  TabItem("settings", "Settings", [TextContent("Settings pane")])
])
counter = TextContent("" + $count)
root = Stack([tabs, counter])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const detailsBtn = shadow.querySelector<HTMLButtonElement>(
      '.rui-tab-trigger[data-value="details"]',
    );
    expect(detailsBtn).not.toBeNull();
    detailsBtn!.click();
    expect(detailsBtn!.getAttribute("aria-selected")).toBe("true");

    // Trigger a re-render that has nothing to do with Tabs.
    el.state.set("count", 42);
    for (let i = 0; i < 5; i += 1) await flush();

    const stillActive = shadow.querySelector<HTMLButtonElement>(
      '.rui-tab-trigger[data-value="details"]',
    );
    expect(stillActive?.getAttribute("aria-selected")).toBe("true");
    const overviewBtn = shadow.querySelector<HTMLButtonElement>(
      '.rui-tab-trigger[data-value="overview"]',
    );
    expect(overviewBtn?.getAttribute("aria-selected")).toBe("false");
  });

  // Regression: the user opens an AccordionItem then types into an input
  // elsewhere on the page. The accordion used to slam shut because the
  // fresh <details> render had no `open` attribute. The morph reconciler
  // now treats `<details>.open` as user state and leaves it alone.
  it("keeps an open <details> open across re-renders", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(`$count = 0
acc = Accordion([
  AccordionItem("FAQ", [TextContent("Answer body")])
])
counter = TextContent("" + $count)
root = Stack([acc, counter])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const details = shadow.querySelector<HTMLDetailsElement>(".rui-accordion-item");
    expect(details).not.toBeNull();
    details!.open = true;
    expect(details!.open).toBe(true);

    el.state.set("count", 7);
    for (let i = 0; i < 5; i += 1) await flush();

    const same = shadow.querySelector<HTMLDetailsElement>(".rui-accordion-item");
    expect(same).toBe(details);
    expect(same!.open).toBe(true);
  });

  // The morph reconciler should reuse stable DOM nodes wherever possible
  // so scroll positions, references kept by host code, etc. stay valid.
  it("reuses the same input element across re-renders (DOM identity stays stable)", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(
      `$title = "Hello"\nfield = Input("title", "Title", "text", null, $title)\nroot = Stack([field])`,
    );
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const first = shadow.getElementById("title");
    expect(first).not.toBeNull();
    el.state.set("title", "Hello world");
    for (let i = 0; i < 5; i += 1) await flush();
    const second = shadow.getElementById("title");
    expect(second).toBe(first);
    expect((second as HTMLInputElement).value).toBe("Hello world");
  });

  // Regression: bindState's event handler used to read the value off the
  // *fresh*-render element via a closure. After a morph re-render that
  // element is detached, so the handler wrote stale values back into the
  // store. The fix routes the read through `event.currentTarget` (always
  // the live DOM node).
  it("typing into an input updates the bound $variable after re-renders", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
    };
    el.setResponse(`$title = "initial"
field = Input("title", "Title", "text", null, $title)
caption = TextContent("value=" + $title)
root = Stack([field, caption])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const input = shadow.getElementById("title") as HTMLInputElement;
    expect(input).not.toBeNull();
    // Simulate the user typing two characters across two events.
    input.value = "h";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.state.get("title")).toBe("h");
    input.value = "hello";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.state.get("title")).toBe("hello");
    expect(shadow.querySelector(".rui-text")?.textContent).toBe("value=hello");
  });

  // Regression: changing one $variable used to clobber unrelated state
  // values because the renderer re-bound the whole shadow tree. The morph
  // + scoped state path now leaves untouched stores alone.
  it("partial re-render keeps other state values intact", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
    };
    el.setResponse(`$name = "Ada"
$count = 0
nameField = Input("name", "Name", "text", null, $name)
counter = TextContent("count=" + $count)
banner = TextContent("hi " + $name)
root = Stack([nameField, counter, banner])`);
    for (let i = 0; i < 5; i += 1) await flush();
    el.state.set("count", 42);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.state.get("name")).toBe("Ada");
    expect(el.state.get("count")).toBe(42);
    const shadow = el.shadowRoot!;
    const labels = Array.from(shadow.querySelectorAll(".rui-text")).map((n) => n.textContent);
    expect(labels).toContain("count=42");
    expect(labels).toContain("hi Ada");
  });

  // Regression: rendering after disconnect/reconnect used to skip scripts
  // because `connectedCallback` short-circuited when the response attribute
  // hadn't changed. The element now always re-renders on reconnect so any
  // declared `Script(...)` re-registers and re-runs.
  it("re-renders after detach + reattach so Script(...) re-runs", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { get: (k: string) => unknown };
    };
    el.setResponse(`$ticks = 0
boot = Script("boot", "ctx.state.set('ticks', (ctx.state.get('ticks')||0) + 1)")
root = Stack([boot, TextContent("" + $ticks)])`);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.state.get("ticks")).toBe(1);

    // Detach then re-attach to the document. The renderer is destroyed
    // and rebuilt; the script must re-run.
    document.body.removeChild(el);
    for (let i = 0; i < 3; i += 1) await flush();
    document.body.appendChild(el);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.state.get("ticks")).toBe(2);
  });

  // Regression: `clear()` used to leave parse errors and stale renderer
  // instance state behind. After clearing, the element should behave like
  // a fresh mount.
  it("clear() resets state, queries, scripts, instance slots, and banner", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      clear(): void;
      showErrors: boolean;
      state: { get: (k: string) => unknown };
    };
    el.showErrors = true;
    el.setResponse(`root = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);

    el.clear();
    expect(banner.hidden).toBe(true);
    expect(el.shadowRoot!.querySelector(".rui-stack")).toBeNull();

    // After clearing, a fresh program should mount cleanly.
    el.setResponse(`root = Card([CardHeader("Fresh")])`);
    for (let i = 0; i < 3; i += 1) await flush();
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Fresh");
  });

  // Regression: `appendChunk` used to corrupt the program buffer if called
  // with a non-string (e.g. a `Uint8Array`). It now coerces and skips empty.
  it("appendChunk safely ignores empty / non-string chunks", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      appendChunk(chunk: unknown): void;
      response: string;
    };
    el.setResponse(`root = Card([CardHeader("Initial")])`);
    for (let i = 0; i < 3; i += 1) await flush();
    el.appendChunk("");
    el.appendChunk(null as unknown as string);
    el.appendChunk(undefined as unknown as string);
    expect(el.response).toBe(`root = Card([CardHeader("Initial")])`);
  });
});
