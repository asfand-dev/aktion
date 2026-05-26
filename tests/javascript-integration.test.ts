/**
 * Behavioural tests for Aktion effects, actions, and the HTTP
 * interceptor surface used by the runtime data layer. The tests below
 * exercise:
 *   - `effect(() => { body }, [...deps])` — declarative side-effects.
 *   - `function name() { body }` + lambda handlers — declarative click handlers.
 *   - `registerHttpInterceptors({ … })` — extension point for the
 *     HTTP-native data layer.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import type {
  HttpRequest,
  HttpResponse,
  HttpInterceptors,
} from "../src/runtime/http.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const waitForRenders = async (n = 10): Promise<void> => {
  for (let i = 0; i < n; i += 1) await flush();
};

interface ElementWithApi extends HTMLElement {
  setResponse(text: string): void;
  appendChunk(text: string): void;
  clear(): void;
  streaming: boolean;
  getSystemPrompt(opts?: Record<string, unknown>): string;
  registerHttpInterceptors(interceptors: HttpInterceptors): void;
  state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
}

const mount = (attributes: Record<string, string> = {}): ElementWithApi => {
  const el = document.createElement("aktion-app") as unknown as ElementWithApi;
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
};

describe("effects: declaration, mount, and triggers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("runs an effect body once on mount", async () => {
    const el = mount();
    el.setResponse(`$count = 0
effect(() => {
  $count = 1
}, ["mount"])
aktion = Stack([])`);
    await waitForRenders();
    expect(el.state.get("count")).toBe(1);
  });

  it("re-runs the effect body whenever a watched atom changes", async () => {
    const el = mount();
    el.setResponse(`$input = "a"
$runs = 0
effect(() => {
  $runs = $runs + 1
}, [$input])
aktion = Stack([])`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
    el.state.set("input", "b");
    await waitForRenders();
    expect(el.state.get("runs")).toBe(2);
    el.state.set("input", "c");
    await waitForRenders();
    expect(el.state.get("runs")).toBe(3);
  });

  it("does not re-run for state changes that aren't watched", async () => {
    const el = mount();
    el.setResponse(`$watched = 0
$ignored = 0
$runs = 0
effect(() => {
  $runs = $runs + 1
}, [$watched])
aktion = Stack([])`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
    el.state.set("ignored", 42);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
  });

  it("mounts an effect declared inside a `function Name() { … }` body on first render", async () => {
    const el = mount();
    el.setResponse(`aktion = App()
$ticks = 0
function App() {
  effect(() => {
    $ticks = $ticks + 1
  }, ["mount"])
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("ticks")).toBe(1);
  });

  it("re-runs a component-local effect when its watched atom changes", async () => {
    const el = mount();
    el.setResponse(`aktion = App()
$input = "a"
$runs = 0
function App() {
  effect(() => {
    $runs = $runs + 1
  }, [$input])
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
    el.state.set("input", "b");
    await waitForRenders();
    expect(el.state.get("runs")).toBe(2);
  });

  it("tears down a component-local interval effect when the instance unmounts", async () => {
    const el = mount();
    el.setResponse(`aktion = if ($showApp) { App() } else { Stack([]) }
$showApp = true
$ticks = 0
function App() {
  effect(() => {
    $ticks = $ticks + 1
  }, ["every(10)"])
  return Stack([])
}`);
    await waitForRenders();
    await new Promise((r) => setTimeout(r, 35));
    await waitForRenders();
    const ticksWhileMounted = el.state.get("ticks") as number;
    expect(ticksWhileMounted).toBeGreaterThan(0);

    el.state.set("showApp", false);
    await waitForRenders();
    const ticksAtTeardown = el.state.get("ticks") as number;

    await new Promise((r) => setTimeout(r, 60));
    await waitForRenders();
    expect(el.state.get("ticks")).toBe(ticksAtTeardown);
  });

  it("an effect inside a component body writes to the per-instance state slot, not the top-level one", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack([Counter(), Counter()])
function Counter() {
  $count = 0
  effect(() => {
    $count = $count + 5
  }, ["mount"])
  return Text(\`\${$count}\`)
}`);
    await waitForRenders();
    const state = (el as unknown as { state: { entries: () => Iterable<[string, unknown]> } }).state;
    const perInstanceSlots = [...state.entries()]
      .map(([k, v]) => [k, v] as const)
      .filter(([k]) => k.endsWith(":count"));
    expect(perInstanceSlots).toHaveLength(2);
    for (const [, value] of perInstanceSlots) {
      expect(value).toBe(5);
    }
    expect((el.state as { get: (k: string) => unknown }).get("count")).toBeUndefined();
    expect(el.shadowRoot?.textContent ?? "").toContain("5");
  });

  it("re-fires a per-instance `effect(fn, [$state])` when its per-instance atom changes (and only that instance)", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack([Item("A"), Item("B")])
function Item(label) {
  $hits = 0
  effect(() => {
    $log = $log + 1
  }, [$hits])
  return Button(label, () => { $hits = $hits + 1 })
}
$log = 0`);
    await waitForRenders();
    expect(el.state.get("log")).toBe(2);

    const buttons = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons).toHaveLength(2);
    buttons[0]!.click();
    await waitForRenders();
    expect(el.state.get("log")).toBe(3);
    buttons[1]!.click();
    await waitForRenders();
    expect(el.state.get("log")).toBe(4);
    const perInstance = [...(el.state as unknown as { entries: () => Iterable<[string, unknown]> }).entries()]
      .filter(([k]) => (k as string).endsWith(":hits"))
      .map(([, v]) => v);
    expect(perInstance.sort()).toEqual([1, 1]);
  });

  it("a per-instance effect with mixed per-instance + top-level deps fires for both", async () => {
    const el = mount();
    el.setResponse(`aktion = Item()
$shared = 0
$runs = 0
function Item() {
  $local = 0
  effect(() => {
    $runs = $runs + 1
  }, [$local, $shared])
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);

    el.state.set("shared", 1);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(2);

    const localSlot = [...(el.state as unknown as { entries: () => Iterable<[string, unknown]> }).entries()]
      .map(([k]) => k as string)
      .find((k) => k.endsWith(":local"));
    expect(localSlot).toBeDefined();
    el.state.set(localSlot!, 1);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(3);
  });

  it("a per-instance effect tears down its subscription when the instance unmounts", async () => {
    const el = mount();
    el.setResponse(`aktion = if ($on) { Item() } else { Stack([]) }
$on = true
$runs = 0
function Item() {
  $local = 0
  effect(() => {
    $runs = $runs + 1
  }, [$local])
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);

    const localKey = [...(el.state as unknown as { entries: () => Iterable<[string, unknown]> }).entries()]
      .map(([k]) => k as string)
      .find((k) => k.endsWith(":local"));
    expect(localKey).toBeDefined();
    el.state.set(localKey!, 1);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(2);

    el.state.set("on", false);
    await waitForRenders();
    const runsAfterTeardown = el.state.get("runs") as number;
    el.state.set(localKey!, 2);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(runsAfterTeardown);
  });

  it("does not register a component-local effect on the global runner", async () => {
    const el = mount() as ElementWithApi & {
      context?: { effectDecls?: Map<string, unknown> };
    };
    el.setResponse(`aktion = App()
$runs = 0
function App() {
  effect(() => {
    $runs = $runs + 1
  }, ["mount"])
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
    const ctx = (el as unknown as { context?: { effectDecls?: Map<string, unknown> } }).context;
    expect(ctx?.effectDecls?.size ?? 0).toBe(0);
  });

  it("resets the effect runner cleanly across setResponse calls", async () => {
    const el = mount();
    el.setResponse(`$count = 0
effect(() => {
  $count = $count + 1
}, ["mount"])
aktion = Stack([])`);
    await waitForRenders();
    expect(el.state.get("count")).toBe(1);

    el.setResponse(`$count = 0
effect(() => {
  $count = 99
}, ["mount"])
aktion = Stack([])`);
    await waitForRenders();
    expect(el.state.get("count")).toBe(99);
  });
});

describe("actions: declarative click handlers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("runs a `function` body when a Button passes the action callable", async () => {
    const el = mount();
    el.setResponse(`$count = 0
function inc() {
  $count = $count + 1
}
label = Text("" + $count, "large-heavy")
btn = Button("Inc", inc())
aktion = Stack([label, btn])`);
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    button.click();
    await waitForRenders();
    expect(el.state.get("count")).toBe(1);
    button.click();
    await waitForRenders();
    expect(el.state.get("count")).toBe(2);
  });

  it("supports the declarative 'add via spread' pattern with no JS at all", async () => {
    const el = mount();
    el.setResponse(`$todos = []
$draft = ""
function add() {
  $todos = [...$todos, {id: $todos.length + 1, text: $draft}]
  $draft = ""
}
addBtn = Button("Add", add())
aktion = Stack([addBtn])`);
    await waitForRenders();
    el.state.set("draft", "first task");
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    button.click();
    await waitForRenders();
    const todos = el.state.get("todos") as Array<{ id: number; text: string }>;
    expect(todos).toHaveLength(1);
    expect(todos[0]).toEqual({ id: 1, text: "first task" });
    expect(el.state.get("draft")).toBe("");
  });

  it("runs inline lambda body on Button click (lambda parity)", async () => {
    const el = mount();
    el.setResponse(`$hits = 0
aktion = Button("Click Me", () => { $hits = $hits + 1 })`);
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    await waitForRenders();
    button.click();
    await waitForRenders();
    expect(el.state.get("hits")).toBe(2);
  });

  it("repeats an action on multiple clicks", async () => {
    const el = mount();
    el.setResponse(`$count = 0
function next() {
  $count = $count + 1
}
btn = Button("Next", next())
aktion = Stack([btn])`);
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    button.click();
    await waitForRenders();
    button.click();
    await waitForRenders();
    button.click();
    await waitForRenders();
    expect(el.state.get("count")).toBe(3);
  });
});

describe("HTTP interceptors (replacement for setTools)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("`registerHttpInterceptors` is callable and merges multiple registrations", () => {
    const el = mount();
    const onRequest = (req: HttpRequest): HttpRequest => req;
    const onResponse = (res: HttpResponse): HttpResponse => res;
    expect(() => el.registerHttpInterceptors({ onRequest })).not.toThrow();
    expect(() => el.registerHttpInterceptors({ onResponse })).not.toThrow();
  });

  it("interceptors fire around HTTP requests issued by http({...}) calls", async () => {
    const phases: Array<"request" | "response"> = [];
    const requestedUrls: string[] = [];
    const originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    const fetchMock = (async () => new Response(JSON.stringify({ rows: [{ id: 1 }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock;
    try {
      const el = mount();
      el.registerHttpInterceptors({
        onRequest: (req) => {
          phases.push("request");
          requestedUrls.push(req.url);
          return req;
        },
        onResponse: (res) => {
          phases.push("response");
          return res;
        },
      });
      el.setResponse(`$items = http({ url: "/items", method: "GET" })
aktion = Stack([])`);
      await waitForRenders(30);
      expect(phases).toContain("request");
      expect(phases).toContain("response");
      expect(requestedUrls.some((u) => u.includes("/items"))).toBe(true);
    } finally {
      if (originalFetch) {
        (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
      }
    }
  });
});

describe("system prompt: effects + actions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("documents the effect surface in the full prompt", () => {
    const el = mount();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("Declarative side effects");
    expect(prompt).toContain("effect");
    expect(prompt).toContain("mount");
    expect(prompt).toContain("debounce(");
    expect(prompt).not.toMatch(/uses\s*\{/);
  });

  it("documents the action declaration surface", () => {
    const el = mount();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("## Actions");
    expect(prompt).toContain("function save(");
  });

  it("omits the effects deep-dive from the compact chat-mode prompt", () => {
    const el = mount();
    const prompt = el.getSystemPrompt({ mode: "chat" });
    expect(prompt).not.toContain("Declarative side effects");
    expect(prompt).not.toContain("every(");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Effect closures — captured component parameters / outer for-loop vars
// ──────────────────────────────────────────────────────────────────────
describe("effects: closures over component params + outer loop vars", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads the surrounding component parameter on mount (regression: `todo` was undefined)", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = App()

function Item(todo) {
  $isDone = null
  effect(() => {
    console.log("todo in effect:", todo)
  }, [$isDone])
  return Button(todo.title, () => { $isDone = !$isDone })
}

function App() {
  return [for (let todo of $todos) { Item(todo) }]
}

$todos = [
  { id: "1", title: "Design system audit", done: false },
  { id: "2", title: "Update documentation", done: true }
]`);
      await waitForRenders();
      const onMountLogs = logs.filter(([prefix]) => prefix === "todo in effect:");
      expect(onMountLogs).toHaveLength(2);
      const titles = onMountLogs.map(([, todo]) =>
        (todo as { title: string }).title,
      );
      expect(titles).toEqual(["Design system audit", "Update documentation"]);
    } finally {
      console.log = originalLog;
    }
  });

  it("retains the captured prop across re-fires triggered by per-instance state changes", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Stack([for (let todo of $todos) { Item(todo) }])
function Item(todo) {
  $isDone = false
  effect(() => {
    console.log("fire:", todo.title, $isDone)
  }, [$isDone])
  return Button(todo.title, () => { $isDone = !$isDone })
}
$todos = [{ id: "1", title: "A" }, { id: "2", title: "B" }]`);
      await waitForRenders();
      const buttons = Array.from(
        el.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
      );
      expect(buttons).toHaveLength(2);
      buttons[1]!.click();
      await waitForRenders();
      buttons[1]!.click();
      await waitForRenders();
      buttons[0]!.click();
      await waitForRenders();
      const fires = logs.filter(([prefix]) => prefix === "fire:");
      expect(fires).toHaveLength(5);
      expect(fires.map(([, title]) => title)).toEqual([
        "A", "B", "B", "B", "A",
      ]);
    } finally {
      console.log = originalLog;
    }
  });

  it("refreshes captured props on re-render so the effect observes the latest values", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Stack([for (let todo of $todos) { Item(todo) }])
function Item(todo) {
  $isDone = false
  effect(() => {
    console.log("title:", todo.title)
  }, [$isDone])
  return Button(todo.title, () => { $isDone = !$isDone })
}
$todos = [{ id: "1", title: "Original" }]`);
      await waitForRenders();
      let titles = logs
        .filter(([prefix]) => prefix === "title:")
        .map(([, t]) => t);
      expect(titles).toEqual(["Original"]);

      el.state.set("todos", [{ id: "1", title: "Renamed" }]);
      await waitForRenders();

      const button = el.shadowRoot!.querySelector<HTMLButtonElement>("button");
      button!.click();
      await waitForRenders();
      titles = logs
        .filter(([prefix]) => prefix === "title:")
        .map(([, t]) => t);
      expect(titles).toEqual(["Original", "Renamed"]);
    } finally {
      console.log = originalLog;
    }
  });

  it("cleanup lambda closes over the captured prop and uses it on teardown", async () => {
    const el = mount();
    el.setResponse(`aktion = if ($on) { Item(name) } else { Stack([]) }
function Item(name) {
  effect(() => {
    cleanup(() => { $mark = name })
  }, ["mount"])
  return Text(name)
}
$on = true
$mark = ""
name = "Alpha"`);
    await waitForRenders();
    expect(el.state.get("mark")).toBe("");
    el.state.set("on", false);
    await waitForRenders();
    expect(el.state.get("mark")).toBe("Alpha");
  });

  it("`every(N)` interval effect sees the captured prop on every tick", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Item(name)
function Item(name) {
  effect(() => {
    console.log("tick:", name)
  }, ["every(10)"])
  return Text(name)
}
name = "Beta"`);
      await waitForRenders();
      await new Promise((r) => setTimeout(r, 35));
      await waitForRenders();
      const ticks = logs.filter(([p]) => p === "tick:");
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      for (const [, value] of ticks) expect(value).toBe("Beta");
    } finally {
      console.log = originalLog;
    }
  });

  it("two instances of the same component capture independent props", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Stack([Item("X"), Item("Y")])
function Item(label) {
  $hits = 0
  effect(() => {
    console.log("hit:", label)
  }, [$hits])
  return Button(label, () => { $hits = $hits + 1 })
}`);
      await waitForRenders();
      let hits = logs
        .filter(([p]) => p === "hit:")
        .map(([, v]) => v);
      expect(hits.sort()).toEqual(["X", "Y"]);
      const buttons = Array.from(
        el.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
      );
      buttons[1]!.click();
      await waitForRenders();
      hits = logs
        .filter(([p]) => p === "hit:")
        .map(([, v]) => v);
      expect(hits.filter((v) => v === "X")).toHaveLength(1);
      expect(hits.filter((v) => v === "Y")).toHaveLength(2);
    } finally {
      console.log = originalLog;
    }
  });

  it("captures outer for-loop iterators that wrap the effect", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Stack([for (let n of [1, 2, 3]) { Item(n) }])
function Item(n) {
  effect(() => {
    console.log("n=", n)
  }, ["mount"])
  return Text(\`\${n}\`)
}`);
      await waitForRenders();
      const lines = logs.filter(([p]) => p === "n=").map(([, v]) => v);
      expect(lines.sort()).toEqual([1, 2, 3]);
    } finally {
      console.log = originalLog;
    }
  });

  it("debounced effect still sees the captured prop on its trailing-edge fire", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Item("Gamma")
function Item(name) {
  $count = 0
  effect(() => {
    console.log("debounced:", name, $count)
  }, [$count, "debounce(20)"])
  return Button("tap", () => { $count = $count + 1 })
}`);
      await waitForRenders();
      await new Promise((r) => setTimeout(r, 40));
      await waitForRenders();
      const btn = el.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
      btn.click();
      btn.click();
      btn.click();
      await new Promise((r) => setTimeout(r, 40));
      await waitForRenders();
      const fires = logs.filter(([p]) => p === "debounced:");
      expect(fires.length).toBeGreaterThanOrEqual(2);
      for (const [, name] of fires) expect(name).toBe("Gamma");
    } finally {
      console.log = originalLog;
    }
  });

  it("throttled effect leading/trailing fires both see the captured prop", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Item("Delta")
function Item(name) {
  $count = 0
  effect(() => {
    console.log("throttled:", name)
  }, [$count, "throttle(30)"])
  return Button("tap", () => { $count = $count + 1 })
}`);
      await waitForRenders();
      const btn = el.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
      btn.click();
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
      await waitForRenders();
      const fires = logs.filter(([p]) => p === "throttled:");
      expect(fires.length).toBeGreaterThanOrEqual(1);
      for (const [, name] of fires) expect(name).toBe("Delta");
    } finally {
      console.log = originalLog;
    }
  });

  it("writes still route through the per-instance state alias while reading captured props", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack([Counter("a"), Counter("b")])
function Counter(label) {
  $count = 0
  effect(() => {
    $count = label == "a" ? 10 : 20
  }, ["mount"])
  return Text(\`\${label}:\${$count}\`)
}`);
    await waitForRenders();
    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("a:10");
    expect(text).toContain("b:20");
    expect(el.state.get("count")).toBeUndefined();
  });

  it("top-level effects are unaffected by the captured-loop-vars path", async () => {
    const el = mount();
    el.setResponse(`$count = 0
$mark = "untouched"
effect(() => {
  $mark = "touched"
}, [$count])
aktion = Stack([])`);
    await waitForRenders();
    expect(el.state.get("mark")).toBe("touched");
    el.state.set("count", 1);
    await waitForRenders();
    expect(el.state.get("mark")).toBe("touched");
  });

  it("for-loop iterators that have already exited are not captured by sibling effects", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Item("only")
function Item(label) {
  $rows = for (let n of [1, 2]) { n }
  effect(() => {
    console.log("label:", label, "n:", n)
  }, ["mount"])
  return Text(label)
}`);
      await waitForRenders();
      const entry = logs.find(([p]) => p === "label:");
      expect(entry).toBeDefined();
      expect(entry![1]).toBe("only");
      expect(entry![3]).toBeNull();
    } finally {
      console.log = originalLog;
    }
  });

  it("captured props do not keep teardown-cancelled effects alive", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = if ($on) { Item("only") } else { Stack([]) }
function Item(label) {
  $count = 0
  effect(() => {
    console.log("fire:", label, $count)
  }, [$count])
  return Button(label, () => { $count = $count + 1 })
}
$on = true`);
      await waitForRenders();
      expect(logs.filter(([p]) => p === "fire:")).toHaveLength(1);

      const localKey = [...(el.state as unknown as {
        entries: () => Iterable<[string, unknown]>;
      }).entries()]
        .map(([k]) => k as string)
        .find((k) => k.endsWith(":count"));
      expect(localKey).toBeDefined();

      el.state.set("on", false);
      await waitForRenders();
      el.state.set(localKey!, 42);
      await waitForRenders();
      expect(logs.filter(([p]) => p === "fire:")).toHaveLength(1);
    } finally {
      console.log = originalLog;
    }
  });

  it("effect inside an `if` arm still captures the component parameter", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Item(true, "Hi")
function Item(visible, msg) {
  effect(() => {
    console.log("seen:", visible, msg)
  }, ["mount"])
  return if (visible) { Text(msg) } else { Stack([]) }
}`);
      await waitForRenders();
      const entry = logs.find(([p]) => p === "seen:");
      expect(entry).toBeDefined();
      expect(entry![1]).toBe(true);
      expect(entry![2]).toBe("Hi");
    } finally {
      console.log = originalLog;
    }
  });

  it("captures the slot props so effects can react to passed-in slot content", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Section("Hello", { footer: Text("Bye") })
function Section(title, footer) {
  effect(() => {
    console.log("slot-present:", footer != null)
  }, ["mount"])
  return Stack([Text(title), footer])
}`);
      await waitForRenders();
      const entry = logs.find(([p]) => p === "slot-present:");
      expect(entry).toBeDefined();
      expect(entry![1]).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("re-rendering with unchanged props does not re-fire the effect", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const el = mount();
      el.setResponse(`aktion = Stack([Item("stable"), Counter()])
function Item(label) {
  effect(() => {
    console.log("once:", label)
  }, ["mount"])
  return Text(label)
}
function Counter() {
  $tick = 0
  return Button("tick", () => { $tick = $tick + 1 })
}`);
      await waitForRenders();
      expect(logs.filter(([p]) => p === "once:")).toHaveLength(1);

      const buttons = Array.from(
        el.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
      );
      buttons[0]!.click();
      buttons[0]!.click();
      await waitForRenders();
      expect(logs.filter(([p]) => p === "once:")).toHaveLength(1);
    } finally {
      console.log = originalLog;
    }
  });
});
