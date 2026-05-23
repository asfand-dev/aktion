/**
 * Behavioural tests for Aktion effects, actions, and the HTTP
 * interceptor surface used by the runtime data layer. The tests below
 * exercise:
 *   - `effect [ ...deps ] { body }` — declarative side-effects.
 *   - `action Name() { body }` + lambda handlers — declarative click handlers.
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
  // Cast through `unknown` because the class declares `state` private but
  // we need to read it here for assertions; structural overlap rules require
  // the intermediate cast.
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
effect [on:mount] {
  $count = 1
}
_app_ = Stack([])`);
    await waitForRenders();
    expect(el.state.get("count")).toBe(1);
  });

  it("re-runs the effect body whenever a watched atom changes", async () => {
    const el = mount();
    el.setResponse(`$input = "a"
$runs = 0
effect [$input] {
  $runs = $runs + 1
}
_app_ = Stack([])`);
    await waitForRenders();
    // Initial run on mount.
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
effect [$watched] {
  $runs = $runs + 1
}
_app_ = Stack([])`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
    // Bumping an unwatched atom should not re-fire the effect.
    el.state.set("ignored", 42);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
  });

  it("mounts an effect declared inside a `component { … }` body on first render", async () => {
    // Effects inside a component body are scoped to the component instance:
    // the runner mounts them after the instance renders for the first time,
    // and tears them down when the instance disappears.
    const el = mount();
    el.setResponse(`_app_ = App()
$ticks = 0
component App() {
  effect [on:mount] {
    $ticks = $ticks + 1
  }
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("ticks")).toBe(1);
  });

  it("re-runs a component-local effect when its watched atom changes", async () => {
    const el = mount();
    el.setResponse(`_app_ = App()
$input = "a"
$runs = 0
component App() {
  effect [$input] {
    $runs = $runs + 1
  }
  return Stack([])
}`);
    await waitForRenders();
    expect(el.state.get("runs")).toBe(1);
    el.state.set("input", "b");
    await waitForRenders();
    expect(el.state.get("runs")).toBe(2);
  });

  it("tears down a component-local interval effect when the instance unmounts", async () => {
    // Toggling `$showApp` between true / false causes the `App` instance to
    // appear and disappear from the tree. The interval effect inside it must
    // stop firing as soon as the instance leaves the tree, otherwise it
    // would keep mutating state from the background.
    const el = mount();
    el.setResponse(`_app_ = if $showApp { App() } else { Stack([]) }
$showApp = true
$ticks = 0
component App() {
  effect [on:every(10)] {
    $ticks = $ticks + 1
  }
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

    // Sleep past several interval periods; the counter must NOT advance
    // because the per-instance interval was cleared on unmount.
    await new Promise((r) => setTimeout(r, 60));
    await waitForRenders();
    expect(el.state.get("ticks")).toBe(ticksAtTeardown);
  });

  it("does not register a component-local effect on the global runner", async () => {
    // Regression: effects nested inside a component body must NOT leak into
    // `ctx.effectDecls`, otherwise `syncEffects` would mount them once
    // globally (and they'd outlive the instance).
    const el = mount() as ElementWithApi & {
      // Reach into the private evaluation context for the assertion.
      // The shape mirrors `EvaluationContext.effectDecls`.
      context?: { effectDecls?: Map<string, unknown> };
    };
    el.setResponse(`_app_ = App()
$runs = 0
component App() {
  effect [on:mount] {
    $runs = $runs + 1
  }
  return Stack([])
}`);
    await waitForRenders();
    // The runner still ticked the body once — proves the per-instance mount fired.
    expect(el.state.get("runs")).toBe(1);
    // …but the global effectDecls map must be empty.
    const ctx = (el as unknown as { context?: { effectDecls?: Map<string, unknown> } }).context;
    expect(ctx?.effectDecls?.size ?? 0).toBe(0);
  });

  it("resets the effect runner cleanly across setResponse calls", async () => {
    const el = mount();
    el.setResponse(`$count = 0
effect [on:mount] {
  $count = $count + 1
}
_app_ = Stack([])`);
    await waitForRenders();
    expect(el.state.get("count")).toBe(1);

    // A fresh program drops the previous effect and mounts the new one.
    el.setResponse(`$count = 0
effect [on:mount] {
  $count = 99
}
_app_ = Stack([])`);
    await waitForRenders();
    expect(el.state.get("count")).toBe(99);
  });
});

describe("actions: declarative click handlers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("runs an `action` body when a Button passes the action callable", async () => {
    // `inc()` (call form) returns a callable the renderer invokes on click.
    // This is the v0.5 equivalent of `Button("Inc", Action([@Set(...)]))`.
    const el = mount();
    el.setResponse(`$state count = 0
action inc() {
  $count = $count + 1
}
label = Text("" + $count, "large-heavy")
btn = Button("Inc", inc())
root = Stack([label, btn])`);
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
    // The canonical todo-app teaching pattern: mutating $todos by replacing
    // the whole array, with `$draft` cleared explicitly inside the action.
    const el = mount();
    el.setResponse(`$state todos = []
$state draft = ""
action add() {
  $todos = [...$todos, {id: $todos.length + 1, text: $draft}]
  $draft = ""
}
addBtn = Button("Add", add())
root = Stack([addBtn])`);
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

  it("runs inline `() => { js{ … } }` body on Button click (lambda parity)", async () => {
    // Regression: inline lambda + js{} must fire the JS body on click,
    // exactly like the named-action form (`action onClick() { js { … } }`).
    // The runtime wires `jsBlockExecutor` on the lambda call site — without
    // it, the click resolved to a deferred JsBlock payload and nothing
    // happened.
    const el = mount();
    (globalThis as { __ruiInlineHit?: number }).__ruiInlineHit = 0;
    el.setResponse(`root = Button("Click Me", onClick: () => { js { globalThis.__ruiInlineHit = (globalThis.__ruiInlineHit || 0) + 1 } })`);
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    await waitForRenders();
    button.click();
    await waitForRenders();
    expect((globalThis as { __ruiInlineHit?: number }).__ruiInlineHit).toBe(2);
  });

  it("repeats an action on multiple clicks", async () => {
    // The same action callable can be invoked repeatedly from a button and
    // state updates accumulate.
    const el = mount();
    el.setResponse(`$count = 0
action next() {
  $count = $count + 1
}
btn = Button("Next", next())
_app_ = Stack([btn])`);
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
    // Each call merges onto the interceptor chain rather than replacing it.
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
_app_ = Stack([])`);
      // Wait for the in-flight fetch to flush through the interceptor chain.
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
    expect(prompt).toContain("on:mount");
    expect(prompt).toContain("debounce(");
    // The capability sandbox is gone — no `uses { … }` clause anywhere.
    expect(prompt).not.toMatch(/uses\s*\{/);
  });

  it("documents the `action` declaration surface", () => {
    const el = mount();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("## Actions");
    expect(prompt).toContain("action save(");
  });

  it("omits the effects deep-dive from the compact chat-mode prompt", () => {
    const el = mount();
    const prompt = el.getSystemPrompt({ mode: "chat" });
    // The chat-mode prompt is the compact flavour — no effects deep-dive,
    // no router block walkthrough.
    expect(prompt).not.toContain("Declarative side effects");
    expect(prompt).not.toContain("on:every(");
  });
});
