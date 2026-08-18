/**
 * Behavioural tests for <aktion-app>.
 *
 * These run in happy-dom which provides Custom Elements + ShadowRoot. Most
 * important regression here: ensuring `setResponse` on a program with
 * reactive state does NOT trigger an infinite render loop.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { builtInThemes } from "../src/theme/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

/** Await a few microtask + macrotask turns so async `src` loads settle. */
const settle = async (turns = 10) => {
  for (let i = 0; i < turns; i += 1) {
    await flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

const PROGRAM_WITH_STATE = `$rows = [{name: "alpha", stars: 12}, {name: "beta", stars: 7}]
info = Card([CardHeader("Repos"), Markdown("Loading...")])
table = Table([
  Col("Name", { values: $rows.name }),
  Col("Stars", { values: $rows.stars, format: "number" })
])
aktion = Stack([info, table])`;

describe("<aktion-app>", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const create = () => {
    const el = document.createElement("aktion-app");
    document.body.appendChild(el);
    return el as HTMLElement & {
      setResponse(text: string): void;
      response: string;
      getSystemPrompt(): string;
    };
  };

  it("renders a basic program into the shadow root", async () => {
    const el = create();
    el.setResponse(`aktion = Card([CardHeader("Hello", { subtitle: "World" })])`);
    await flush();
    await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-card-title")?.textContent).toBe("Hello");
    expect(shadow.querySelector(".rui-card-subtitle")?.textContent).toBe("World");
  });

  it("renders a rich pattern-composite layout end-to-end", async () => {
    const el = create();
    el.setResponse(`aktion = Stack([header, kpis, board, follow])
header = PageHeader("Engineering Q3", { subtitle: "12 active · 4 at risk", breadcrumbs: ["Workspace", "Engineering"], actions: headerActions, status: status })
headerActions = [Button("Export", { action: null, variant: "secondary" }), Button("New project", { action: null, variant: "primary" })]
status = Badge("On track", { variant: "success" })
kpis = Stats([k1, k2, k3], { layout: "grid" })
k1 = StatCard("Active", { value: "12", trend: "flat", delta: "0 vs last week", icon: "chart-pie" })
k2 = StatCard("At risk", { value: "4", trend: "up", delta: "+2", icon: "triangle-exclamation" })
k3 = StatCard("Shipped", { value: "8", trend: "up", delta: "+3", icon: "rocket" })
board = KanbanBoard([colTodo, colDoing])
colTodo = KanbanColumn("To do", { items: [cardA] })
colDoing = KanbanColumn("Doing", { items: [cardB], tone: "primary" })
cardA = KanbanCard("Migrate auth", { description: "Roll out new SDK.", tags: ["auth"], assignee: "Asha" })
cardB = KanbanCard("Streaming UI v2", { description: "20 new components.", tags: ["frontend"], assignee: "Alex", tone: "primary", icon: "sparkles" })
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

  it("does not infinite-loop when the program declares reactive state used by a Table", async () => {
    const el = create();
    el.setResponse(PROGRAM_WITH_STATE);
    for (let i = 0; i < 50; i += 1) await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-table")).not.toBeNull();
    expect(shadow.querySelectorAll(".rui-table tbody tr").length).toBeGreaterThan(0);
  });

  it("re-renders without re-fetching when state changes", async () => {
    const el = create();
    el.setResponse(`$count = 0\nlabel = Text("" + $count, { variant: "large-heavy" })\naktion = Stack([label])`);
    await flush();
    await flush();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".rui-text")?.textContent).toBe("0");
    (el as unknown as { state: { set: (k: string, v: unknown) => void } }).state.set("count", 7);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(shadow.querySelector(".rui-text")?.textContent).toBe("7");
  });

  it("accepts the response attribute declaratively", async () => {
    document.body.innerHTML = `<aktion-app response='aktion = Card([CardHeader(\"From attribute\")])'></aktion-app>`;
    await flush();
    await flush();
    const el = document.querySelector("aktion-app")!;
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("From attribute");
  });

  it("getSystemPrompt returns Aktion spec text", () => {
    const el = create();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("Aktion");
    expect(prompt).toContain("$app(Column(");
  });

  it("hides the parse-error banner while streaming and surfaces errors after", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      appendChunk(text: string): void;
      streaming: boolean;
      showErrors: boolean;
    };
    el.showErrors = true;
    el.streaming = true;
    el.setResponse(`aktion = Stack([body])\nbody = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);

    el.appendChunk(`CardHeader("Done")])`);
    el.streaming = false;
    for (let i = 0; i < 5; i += 1) await flush();
    expect(banner.hidden).toBe(true);
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Done");

    el.setResponse(`aktion = Stack([\nbroken = Card([`);
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
    el.setResponse(`aktion = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);
  });

  it("toggles the banner reactively when showErrors flips", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      showErrors: boolean;
    };
    el.setResponse(`aktion = Stack([\nbroken = Card([`);
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
    el.setResponse(`aktion = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(errorCount).toBeGreaterThan(0);
  });

  it("respects showerrors attribute set declaratively", async () => {
    document.body.innerHTML = `<aktion-app showerrors="true" response='aktion = Stack([\nbroken = Card(['></aktion-app>`;
    for (let i = 0; i < 5; i += 1) await flush();
    const el = document.querySelector("aktion-app") as HTMLElement;
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
    el.setResponse(`aktion = Stack([hero, body])`);
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

  it("preserves focus and selection when typing into an Input bound to state", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      streaming: boolean;
      state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
    };
    el.setResponse(`$title = ""\nfield = FormControl("Title", { field: Input("title", { placeholder: "Type here", type: "text", value: $title }) })\naktion = Stack([field])`);
    for (let i = 0; i < 5; i += 1) await flush();

    const shadow = el.shadowRoot!;
    const input = shadow.getElementById("title") as HTMLInputElement;
    expect(input).not.toBeNull();

    input.focus();
    expect(shadow.activeElement).toBe(input);

    input.value = "h";
    input.setSelectionRange(1, 1);
    el.state.set("title", "h");
    for (let i = 0; i < 5; i += 1) await flush();

    const refreshed = shadow.getElementById("title") as HTMLInputElement;
    expect(refreshed.value).toBe("h");
    expect(shadow.activeElement).toBe(refreshed);
    expect(refreshed.selectionStart).toBe(1);
    expect(refreshed.selectionEnd).toBe(1);

    refreshed.value = "hi";
    refreshed.setSelectionRange(2, 2);
    el.state.set("title", "hi");
    for (let i = 0; i < 5; i += 1) await flush();

    const after = shadow.getElementById("title") as HTMLInputElement;
    expect(after.value).toBe("hi");
    expect(shadow.activeElement).toBe(after);
    expect(after.selectionStart).toBe(2);
  });

  it("reflects the resolved theme name as data-rui-theme on the host", async () => {
    const el = create();
    el.setAttribute("theme", "modern");
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("modern");

    el.setAttribute("theme", "soft");
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("soft");

    el.setAttribute("theme", "light");
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("light");

    el.setAttribute("theme", '{"colorPrimary":"#ff0000"}');
    await flush();
    expect(el.getAttribute("data-rui-theme")).toBe("custom");
  });

  it("applies CSS custom properties for built-in themes", () => {
    // Assert against each theme's OWN declared value rather than a hardcoded
    // literal. What this test exists to prove is that switching the attribute
    // writes the token onto the host — the specific hex is incidental, and
    // pinning it made a legitimate accessibility fix (soft's primary was 2.72:1
    // as text) look like a regression.
    const el = create();
    for (const name of ["modern", "soft"] as const) {
      el.setAttribute("theme", name);
      expect(el.style.getPropertyValue("--rui-color-primary"))
        .toBe(builtInThemes[name].colorPrimary);
    }
    // …and the two themes must genuinely differ, or the assertion above could
    // pass while nothing was being applied at all.
    expect(builtInThemes.modern.colorPrimary).not.toBe(builtInThemes.soft.colorPrimary);
  });

  it("preserves DOM identity for non-text input types (email/number)", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(
      `$email = ""\nfield = FormControl("Email", { field: Input("email", { placeholder: "you@example.com", type: "email", value: $email }) })\naktion = Stack([field])`,
    );
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const input = shadow.getElementById("email") as HTMLInputElement;
    expect(input.type).toBe("email");
    input.focus();
    expect(shadow.activeElement).toBe(input);
    el.state.set("email", "a");
    for (let i = 0; i < 3; i += 1) await flush();
    el.state.set("email", "ab");
    for (let i = 0; i < 3; i += 1) await flush();
    el.state.set("email", "abc");
    for (let i = 0; i < 3; i += 1) await flush();
    const after = shadow.getElementById("email") as HTMLInputElement;
    expect(after).toBe(input);
    expect(after.value).toBe("abc");
    expect(shadow.activeElement).toBe(after);
  });

  it("preserves the active tab across unrelated re-renders", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(`$count = 0
tabs = Tabs([
  TabItem("overview", { label: "Overview", children: [Text("Overview pane")] }),
  TabItem("details",  { label: "Details",  children: [Text("Details pane")] }),
  TabItem("settings", { label: "Settings", children: [Text("Settings pane")] })
])
counter = Text("" + $count)
aktion = Stack([tabs, counter])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const detailsBtn = shadow.querySelector<HTMLButtonElement>(
      '.rui-tab-trigger[data-value="details"]',
    );
    expect(detailsBtn).not.toBeNull();
    detailsBtn!.click();
    expect(detailsBtn!.getAttribute("aria-selected")).toBe("true");

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

  /**
   * A toast is a SIBLING of the author's root, and the runtime appends it only
   * while one is on screen — so the root itself used to sit at a different tree
   * position with a toast up than without one. Instance paths are positional, so
   * that re-keyed every component in the program and `endRender` reclaimed the
   * old keys: one `$toast.success("Saved")` snapped the active tab back to
   * `defaultValue`, closed open popovers, and reset every DataGrid's sort.
   * `Renderer.render` now normalises the root to a one-slot list so its path is
   * the same either way.
   */
  it("preserves the active tab when a toast is raised and again when it clears", async () => {
    vi.useFakeTimers();
    try {
      const el = create() as HTMLElement & {
        setResponse(text: string): void;
        state: { set: (k: string, v: unknown) => void };
      };
      el.setResponse(`function notifySaved() {
  $toast.success("Saved")
}
tabs = Tabs([
  TabItem("overview", { label: "Overview", children: [Text("Overview pane")] }),
  TabItem("details",  { label: "Details",  children: [Button("Save", { onClick: notifySaved })] })
])
aktion = Stack([tabs])`);
      await vi.advanceTimersByTimeAsync(20);
      const shadow = el.shadowRoot!;
      const activeValue = () =>
        shadow
          .querySelector<HTMLButtonElement>('.rui-tab-trigger[aria-selected="true"]')
          ?.getAttribute("data-value");

      shadow.querySelector<HTMLButtonElement>('.rui-tab-trigger[data-value="details"]')!.click();
      expect(activeValue()).toBe("details");

      // Raising the toast adds the sibling layer beside the root.
      shadow.querySelector<HTMLButtonElement>(".rui-button")!.click();
      await vi.advanceTimersByTimeAsync(20);
      expect(shadow.querySelector(".rui-toasts")).not.toBeNull();
      expect(activeValue()).toBe("details");

      // Auto-dismiss (4s) takes the layer away again — the other direction of
      // the same shape change, and just as capable of re-keying the tree.
      await vi.advanceTimersByTimeAsync(5000);
      expect(shadow.querySelector(".rui-toasts")).toBeNull();
      expect(activeValue()).toBe("details");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an open <details> open across re-renders", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(`$count = 0
acc = Accordion([
  AccordionItem("FAQ", { children: [Text("Answer body")] })
])
counter = Text("" + $count)
aktion = Stack([acc, counter])`);
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

  it("reuses the same input element across re-renders (DOM identity stays stable)", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void };
    };
    el.setResponse(
      `$title = "Hello"\nfield = Input("title", { placeholder: "Title", type: "text", value: $title })\naktion = Stack([field])`,
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

  it("typing into an input updates the bound $variable after re-renders", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
    };
    el.setResponse(`$title = "initial"
field = Input("title", { placeholder: "Title", type: "text", value: $title })
caption = Text("value=" + $title)
aktion = Stack([field, caption])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const input = shadow.getElementById("title") as HTMLInputElement;
    expect(input).not.toBeNull();
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

  it("partial re-render keeps other state values intact", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
    };
    el.setResponse(`$name = "Ada"
$count = 0
nameField = Input("name", { placeholder: "Name", type: "text", value: $name })
counter = Text("count=" + $count)
banner = Text("hi " + $name)
aktion = Stack([nameField, counter, banner])`);
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

  it("re-renders after detach + reattach so the DOM is restored", async () => {
    const el = create();
    el.setResponse(`aktion = Card([CardHeader("Hello")])`);
    for (let i = 0; i < 3; i += 1) await flush();
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Hello");

    document.body.removeChild(el);
    for (let i = 0; i < 3; i += 1) await flush();
    document.body.appendChild(el);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Hello");
  });

  it("clear() resets state, effects, instance slots, and banner", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      clear(): void;
      showErrors: boolean;
      state: { get: (k: string) => unknown };
    };
    el.showErrors = true;
    el.setResponse(`aktion = Stack([\nbroken = Card([`);
    for (let i = 0; i < 5; i += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);

    el.clear();
    expect(banner.hidden).toBe(true);
    expect(el.shadowRoot!.querySelector(".rui-stack")).toBeNull();

    el.setResponse(`aktion = Card([CardHeader("Fresh")])`);
    for (let i = 0; i < 3; i += 1) await flush();
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Fresh");
  });

  describe("Aktion — no capability sandbox", () => {
    it("does not expose an `isCapabilityAllowed` method on the element", () => {
      const el = create() as HTMLElement & Record<string, unknown>;
      expect((el as { isCapabilityAllowed?: unknown }).isCapabilityAllowed).toBeUndefined();
    });

    it("ignores legacy `capabilities` / `capabilities-default` attributes", () => {
      const el = create();
      el.setAttribute("capabilities", "timer, net");
      el.setAttribute("capabilities-default", "deny");
      expect(el.getAttribute("capabilities")).toBe("timer, net");
      expect(el.getAttribute("capabilities-default")).toBe("deny");
    });
  });

  it("implicit two-way binding flows through a member path", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { get: (k: string) => unknown };
    };
    el.setResponse(`$obj = { done: true }
checkbox = Checkbox("done", { label: "Done", value: $obj.done })
display = Text(\`Is Done: \${$obj.done ? "Yes" : "No"}\`)
aktion = Stack([checkbox, display])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector<HTMLInputElement>(
      "input[type='checkbox']",
    );
    expect(input).not.toBeNull();
    expect(input!.checked).toBe(true);

    input!.checked = false;
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 5; i += 1) await flush();

    expect((el.state.get("obj") as { done: boolean }).done).toBe(false);
    const text = Array.from(shadow.querySelectorAll(".rui-text")).map(
      (n) => n.textContent,
    );
    expect(text).toContain("Is Done: No");
  });

  it("member-chain assignment in a lambda re-renders dependents", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      state: { get: (k: string) => unknown };
    };
    el.setResponse(`$obj = { done: false }
btn = Button("Change Value", () => { $obj.done = true })
display = Text(\`Is Done: \${$obj.done ? "Yes" : "No"}\`)
aktion = Stack([btn, display])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    expect(
      Array.from(shadow.querySelectorAll(".rui-text")).map((n) => n.textContent),
    ).toContain("Is Done: No");

    const button = shadow.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    button!.click();
    for (let i = 0; i < 5; i += 1) await flush();

    expect((el.state.get("obj") as { done: boolean }).done).toBe(true);
    expect(
      Array.from(shadow.querySelectorAll(".rui-text")).map((n) => n.textContent),
    ).toContain("Is Done: Yes");
  });

  it("per-instance `$effect(fn, [$state])` fires when its per-instance state changes", async () => {
    const logs: unknown[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const el = create() as HTMLElement & {
        setResponse(text: string): void;
      };
      el.setResponse(`aktion = App()

function Item(todo) {
  $isDone = null

  $effect(() => {
    console.log("isDone:", $isDone)
  }, [$isDone])

  return Button(todo.title, () => { $isDone = !$isDone })
}

function App() {
  return $todos.map(todo => Item(todo))
}

$todos = [
  { id: "1", title: "Design system audit" },
  { id: "2", title: "Update documentation" }
]`);
      for (let i = 0; i < 5; i += 1) await flush();

      const initial = logs.filter(([prefix]) => prefix === "isDone:");
      expect(initial.length).toBe(2);

      const shadow = el.shadowRoot!;
      const buttons = Array.from(shadow.querySelectorAll<HTMLButtonElement>("button"));
      expect(buttons.length).toBe(2);
      buttons[0]!.click();
      for (let i = 0; i < 5; i += 1) await flush();

      const afterClick = logs.filter(([prefix]) => prefix === "isDone:");
      expect(afterClick.length).toBe(3);
      expect(afterClick[2]![1]).toBe(true);

      buttons[0]!.click();
      for (let i = 0; i < 5; i += 1) await flush();
      const afterSecondClick = logs.filter(([prefix]) => prefix === "isDone:");
      expect(afterSecondClick.length).toBe(4);
      expect(afterSecondClick[3]![1]).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });

  describe("src attribute", () => {
    const mockFetch = (files: Record<string, string>) => {
      const fetchMock = vi.fn(async (input: unknown) => {
        const url = String(input);
        const key = Object.keys(files).find((f) => url.endsWith(f));
        if (key === undefined) {
          return { ok: false, status: 404, text: async () => "" } as unknown as Response;
        }
        return { ok: true, status: 200, text: async () => files[key]! } as unknown as Response;
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("loads and renders a single-file program from src", async () => {
      mockFetch({ "app.aktion": `$app(Card([CardHeader("From src")]))` });
      document.body.innerHTML = `<aktion-app src="./app.aktion"></aktion-app>`;
      await settle();
      const el = document.querySelector("aktion-app")!;
      expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("From src");
    });

    it("links and renders a multi-file project referenced by src", async () => {
      mockFetch({
        "app.aktion": `import { Hello } from "./hello.aktion"\n$app(Hello())`,
        "hello.aktion": `export function Hello() { return Card([CardHeader("Linked module")]) }`,
      });
      document.body.innerHTML = `<aktion-app src="./app.aktion"></aktion-app>`;
      await settle();
      const el = document.querySelector("aktion-app")!;
      expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Linked module");
    });

    it("surfaces a fetch failure through the error event and banner", async () => {
      mockFetch({}); // every request 404s
      const el = create() as HTMLElement & {
        loadFromSrc(src: string): Promise<void>;
        showErrors: boolean;
      };
      el.showErrors = true;
      let errorFired = false;
      el.addEventListener("error", () => { errorFired = true; });
      await el.loadFromSrc("./missing.aktion");
      await settle();
      expect(errorFired).toBe(true);
      const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
      expect(banner.hidden).toBe(false);
    });

    it("the response attribute takes precedence over src", async () => {
      mockFetch({ "app.aktion": `$app(Card([CardHeader("From src")]))` });
      document.body.innerHTML =
        `<aktion-app src="./app.aktion" response='$app(Card([CardHeader(\"From attribute\")]))'></aktion-app>`;
      await settle();
      const el = document.querySelector("aktion-app")!;
      expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("From attribute");
    });
  });

  it("appendChunk safely ignores empty / non-string chunks", async () => {
    const el = create() as HTMLElement & {
      setResponse(text: string): void;
      appendChunk(chunk: unknown): void;
      response: string;
    };
    el.setResponse(`aktion = Card([CardHeader("Initial")])`);
    for (let i = 0; i < 3; i += 1) await flush();
    el.appendChunk("");
    el.appendChunk(null as unknown as string);
    el.appendChunk(undefined as unknown as string);
    expect(el.response).toBe(`aktion = Card([CardHeader("Initial")])`);
  });
});
