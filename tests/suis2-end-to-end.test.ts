/**
 * End-to-end coverage for the Aktion language.
 *
 * Each `describe` block targets one of the language pillars and walks a
 * small program from source through `parse → planProgram → render` so a
 * regression anywhere in the pipeline surfaces as a test failure.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  isComponentNode,
  isUserComponentNode,
  Router,
  type EvaluationContext,
} from "../src/runtime/index.js";
import { Renderer } from "../src/renderer/renderer.js";
import { defaultLibrary } from "../src/library/index.js";

function harness(src: string) {
  const state = new StateStore();
  const router = new Router();
  const ctx: EvaluationContext = createContext(state, {
    router,
    library: defaultLibrary,
  });
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(
      `Unexpected parse errors:\n${program.errors.map((e) => `  ${e.message}`).join("\n")}`,
    );
  }
  planProgram(program, ctx);
  const renderer = new Renderer({
    library: defaultLibrary,
    state,
    router,
    evaluationContext: () => ctx,
  });
  return {
    state,
    router,
    ctx,
    program,
    render(): HTMLElement {
      renderer.beginRender();
      const root = ctx.bindings.get("aktion")?.();
      const node = renderer.render(root);
      const host = document.createElement("div");
      host.appendChild(node);
      renderer.endRender();
      return host;
    },
  };
}

describe("Reactive state", () => {
  it("`$name = value` declares a reactive in-memory atom", () => {
    const { ctx, state } = harness(`
      $count = 5
      aktion = Text(\`Count: \${$count}\`)
    `);
    expect(state.get("count")).toBe(5);
    const app = ctx.bindings.get("aktion")?.();
    expect(isComponentNode(app)).toBe(true);
    expect((app as { args: unknown[] }).args[0]).toBe("Count: 5");
  });

  it("state updates flow through bindings on subsequent reads", () => {
    const { ctx, state } = harness(`
      $count = 3
      aktion = Text(\`\${$count * 2}\`)
    `);
    expect((ctx.bindings.get("aktion")?.() as { args: unknown[] }).args[0]).toBe("6");
    state.set("count", 7);
    expect((ctx.bindings.get("aktion")?.() as { args: unknown[] }).args[0]).toBe("14");
  });
});

describe("Components and per-instance state", () => {
  it("user-declared components evaluate to a UserComponentNode the renderer expands", () => {
    const { ctx } = harness(`
      function Greeting(name) {
        return Text(\`Hi \${name}\`)
      }
      aktion = Greeting("Ada")
    `);
    const app = ctx.bindings.get("aktion")?.();
    expect(isUserComponentNode(app)).toBe(true);
  });

  it("default parameter expressions resolve in the component's scope", () => {
    const { render } = harness(`
      function Banner(message, tone = "info") {
        return Text(\`[\${tone}] \${message}\`)
      }
      aktion = Banner("hi")
    `);
    expect(render().textContent).toContain("[info] hi");
  });

  it("forward references resolve — `aktion = App()` before `function App() {}` works", () => {
    const { render } = harness(`
      aktion = App()
      function App() {
        return Text("Hello world")
      }
    `);
    expect(render().textContent).toBe("Hello world");
  });

  it("unresolved component references render an anticipatory Skeleton", () => {
    const { render } = harness(`
      aktion = NotYetDeclared()
    `);
    const host = render();
    expect(host.textContent).not.toContain("unknown component");
    expect(host.querySelector(".rui-skeleton")).toBeTruthy();
  });

  it("two component instances each hold an independent `$name` atom", () => {
    const { state, render } = harness(`
      function Counter(label) {
        $n = 0
        return Stack([
          Text(\`\${label}: \${$n}\`)
        ])
      }
      aktion = Stack([Counter("A"), Counter("B")])
    `);
    render();

    const counterKeys: string[] = [];
    for (const [key] of state.entries()) {
      if (key.endsWith(":n")) counterKeys.push(key);
    }
    expect(counterKeys.length).toBe(2);

    state.set(counterKeys[0]!, 42);
    expect(state.get(counterKeys[0]!)).toBe(42);
    expect(state.get(counterKeys[1]!)).toBe(0);
  });

  it("`$x = init` inside a component body initialises once and persists user mutations across re-renders", () => {
    const { state, render } = harness(`
      aktion = App()
      function App() {
        $isHide = true
        return Text($isHide ? "hidden" : "shown")
      }
    `);
    expect(render().textContent).toBe("hidden");

    const aliasKey = [...state.entries()]
      .map(([k]) => k)
      .find((k) => k.endsWith(":isHide"));
    expect(aliasKey).toBeDefined();
    state.set(aliasKey!, false);

    expect(render().textContent).toBe("shown");
    expect(state.get(aliasKey!)).toBe(false);
  });

  it("evaluates non-literal initializers (`$now = @Now()`) on the first render of a component instance", () => {
    const { state, render } = harness(`
      aktion = Clock()
      function Clock() {
        $tick = @Now()
        return Text(\`\${$tick}\`)
      }
    `);
    render();
    const aliasKey = [...state.entries()]
      .map(([k]) => k)
      .find((k) => k.endsWith(":tick"));
    expect(aliasKey).toBeDefined();
    expect(typeof state.get(aliasKey!)).toBe("number");
    expect(state.get(aliasKey!)).toBeGreaterThan(0);
  });

  it("uses a parameter-derived initializer (`$n = initial`) for the per-instance slot", () => {
    const { state, render } = harness(`
      aktion = Stack([Counter({ initial: 7 }), Counter({ initial: 12 })])
      function Counter(initial = 0) {
        $n = initial
        return Text(\`\${$n}\`)
      }
    `);
    render();
    const counterKeys = [...state.entries()]
      .map(([k]) => k)
      .filter((k) => k.endsWith(":n"));
    expect(counterKeys).toHaveLength(2);
    const values = counterKeys.map((k) => state.get(k));
    expect(values).toContain(7);
    expect(values).toContain(12);
  });
});

describe("Slots (via regular params)", () => {
  it("trailing positional becomes the implicit `children` slot", () => {
    const { render } = harness(`
      function MyCard() {
        return Stack(children)
      }
      aktion = MyCard(Text("Inside"))
    `);
    expect(render().textContent).toContain("Inside");
  });

  it("named props passed in trailing object resolve as slot params", () => {
    const { render } = harness(`
      function Modal(footer) {
        return Stack([
          Text("Body"),
          footer
        ])
      }
      aktion = Modal({ footer: Text("Cancel/OK") })
    `);
    const text = render().textContent ?? "";
    expect(text).toContain("Body");
    expect(text).toContain("Cancel/OK");
  });

  it("missing named slot falls through to the `??` default", () => {
    const { render } = harness(`
      function Modal(footer) {
        return Stack([
          Text("Body"),
          footer ?? Text("Default footer")
        ])
      }
      aktion = Modal()
    `);
    expect(render().textContent).toContain("Default footer");
  });
});

describe("Expression control flow (strict JS subset)", () => {
  it("ternary expression `cond ? a : b` is a value-yielding expression", () => {
    const { render } = harness(`
      $active = true
      aktion = $active ? Text("on") : Text("off")
    `);
    expect(render().textContent).toBe("on");
  });

  it("a chained ternary acts as a value-yielding switch", () => {
    const { render } = harness(`
      $status = "warn"
      aktion = $status == "ok" ? Text("Ok") : ($status == "warn" ? Text("Warn") : Text("Other"))
    `);
    expect(render().textContent).toBe("Warn");
  });

  it("`switch (…)` statement runs side-effecting arm bodies inside a function", () => {
    const { state, ctx } = harness(`
      $drafts  = []
      $records = []
      function submit(payload) {
        switch (payload.kind) {
          case "draft": $drafts = [...$drafts, payload]; break
          default: $records = [...$records, payload]
        }
      }
      run1 = submit({kind: "draft", title: "first"})
      run2 = submit({kind: "final", title: "second"})
      aktion = Text("ok")
    `);
    expect(ctx.actionDecls.has("submit")).toBe(true);
    ctx.bindings.get("run1")?.();
    ctx.bindings.get("run2")?.();
    expect(state.get("drafts")).toEqual([{ kind: "draft", title: "first" }]);
    expect(state.get("records")).toEqual([{ kind: "final", title: "second" }]);
  });

  it("a function with `switch` + `return` picks a value per arm", () => {
    const { render } = harness(`
      $stage = "draft"
      function viewFor(stage) {
        switch (stage) {
          case "draft": return Text("Draft view")
          default: return Text("Other")
        }
      }
      aktion = viewFor($stage)
    `);
    expect(render().textContent).toBe("Draft view");
  });

  it("`xs.map(item => …)` produces a renderable array", () => {
    const { render } = harness(`
      $items = ["a", "b", "c"]
      aktion = Stack($items.map(item => Text(item)))
    `);
    expect(render().textContent).toBe("abc");
  });
});

describe("Router calls", () => {
  it("`pages = Router({ p: C })` registers and matches paths", () => {
    const { ctx, router } = harness(`
      pages = Router({
        "/":      Text("home"),
        "/about": Text("about")
      })
      aktion = pages
    `);
    router.navigate("/about");
    const value = ctx.bindings.get("aktion")?.();
    expect(isComponentNode(value)).toBe(true);
    expect((value as { args: unknown[] }).args[0]).toBe("about");
  });

  it("falls back to the `default` arm when no path matches", () => {
    const { render, router } = harness(`
      pages = Router({
        "/":     Text("home"),
        default: Text("missing")
      })
      aktion = pages
    `);
    router.navigate("/something-else");
    expect(render().textContent).toBe("missing");
  });

  it("exposes `params` inside an arm body for `:id` segments", () => {
    const { ctx, router } = harness(`
      pages = Router({
        "/users/:id": Text(\`User \${params.id}\`),
        default:      Text("missing")
      })
      aktion = pages
    `);
    router.navigate("/users/42");
    const value = ctx.bindings.get("aktion")?.();
    expect(isComponentNode(value)).toBe(true);
    expect((value as { args: unknown[] }).args[0]).toBe("User 42");
  });

  it("exposes `params._` for trailing wildcards", () => {
    const { ctx, router } = harness(`
      pages = Router({
        "/docs/*": Text(\`Docs · \${params._}\`),
        default:   Text("home")
      })
      aktion = pages
    `);
    router.navigate("/docs/intro/getting-started");
    const value = ctx.bindings.get("aktion")?.();
    expect(isComponentNode(value)).toBe(true);
    expect((value as { args: unknown[] }).args[0]).toBe(
      "Docs · intro/getting-started",
    );
  });

  it("renders `null` when nothing matches and no default is provided", () => {
    const { ctx, router } = harness(`
      pages = Router({
        "/": Text("home")
      })
      aktion = pages
    `);
    router.navigate("/missing");
    const value = ctx.bindings.get("aktion")?.();
    expect(value).toBeNull();
  });
});

describe("Explicit `key:` for content-addressed identity", () => {
  it("an explicit `key:` survives reorderings of the surrounding list", () => {
    const { state, render } = harness(`
      $items = [{id: 1, label: "one"}, {id: 2, label: "two"}]
      aktion = Stack($items.map(item => Text(item.label, { key: item.id })))
    `);
    const host = render();
    expect(host.textContent).toBe("onetwo");
    state.set("items", [
      { id: 2, label: "two" },
      { id: 1, label: "one" },
    ]);
    expect(render().textContent).toBe("twoone");
  });
});

describe("Two-way binding", () => {
  it("plain `value: $atom` in trailing object participates in automatic two-way binding", () => {
    const { program } = harness(`
      $name = "Ada"
      aktion = TextInput({ value: $name })
    `);
    expect(program.errors).toEqual([]);
  });

  it("`value: $atom` produces a Call with an Object arg containing a StateRef", () => {
    const program = parse(`
      $name = "Ada"
      aktion = TextInput({ value: $name })
    `);
    expect(program.errors).toEqual([]);
    const app = program.statements[1] as {
      expression: { arguments: unknown[] };
    };
    const trailingObj = app.expression.arguments[0] as {
      kind: string;
      properties: Array<{ key: string; value: { kind: string; name: string } }>;
    };
    expect(trailingObj.kind).toBe("Object");
    expect(trailingObj.properties[0]!.key).toBe("value");
    expect(trailingObj.properties[0]!.value).toMatchObject({
      kind: "StateRef",
      name: "name",
    });
  });

  it("nested writes through a member chain replace the root atom immutably", () => {
    const { state } = harness(`
      $form = { name: "Ada", role: "Engineer" }
      function rename() { $form.name = "Alex" }
      aktion = Button("Rename", { onClick: rename })
    `);
    const before = state.get("form");
    expect(before).toEqual({ name: "Ada", role: "Engineer" });
    state.setPath("form", ["name"], "Alex");
    const after = state.get("form") as Record<string, unknown>;
    expect(after).toEqual({ name: "Alex", role: "Engineer" });
    expect(after).not.toBe(before);
  });

  it("postfix increment on a member chain writes the nested path", () => {
    const { state } = harness(`
      $cart = { qty: 1 }
      function add() { $cart.qty++ }
      aktion = Button("Add", { onClick: add })
    `);
    expect((state.get("cart") as { qty: number }).qty).toBe(1);
    state.setPath("cart", ["qty"], 2);
    expect((state.get("cart") as { qty: number }).qty).toBe(2);
  });
});

describe("Action declarations", () => {
  it("`function name() { … }` (camelCase) registers a callable action", () => {
    const { ctx } = harness(`
      $count = 0
      function increment() { $count = $count + 1 }
      aktion = Button("inc", { onClick: increment })
    `);
    expect(ctx.actionDecls.has("increment")).toBe(true);
    const app = ctx.bindings.get("aktion")?.();
    expect(isComponentNode(app)).toBe(true);
  });

  it("an action may optionally return a value the caller observes", () => {
    const { ctx } = harness(`
      function greet(name) { return "Hello, " + name }
      $hello = greet("Ada")
      aktion = Text("dummy")
    `);
    expect(ctx.actionDecls.has("greet")).toBe(true);
  });
});

describe("Effect declarations", () => {
  it("`effect(() => { … }, [\"mount\"])` parses", () => {
    const { ctx, program } = harness(`
      effect(() => {
        $visits = 0
      }, ["mount"])
      aktion = Text("hi")
    `);
    expect(program.errors).toEqual([]);
    expect(ctx.effectDecls.size).toBe(1);
  });

  it("`effect(() => { … })` (no deps) is equivalent to mount-once", () => {
    const { ctx, program } = harness(`
      effect(() => {
        $visits = 0
      })
      aktion = Text("hi")
    `);
    expect(program.errors).toEqual([]);
    expect(ctx.effectDecls.size).toBe(1);
  });

  it("`effect(() => { … }, [$dep, \"debounce(N)\"])` mixes state triggers and rate limits", () => {
    const { ctx, program } = harness(`
      $count = 0
      effect(() => {
        $logged = $count
      }, [$count, "debounce(250)"])
      aktion = Text("hi")
    `);
    expect(program.errors).toEqual([]);
    expect(ctx.effectDecls.size).toBe(1);
    const decl = [...ctx.effectDecls.values()][0]!;
    expect(decl.triggers).toEqual([{ kind: "state", name: "count" }]);
    expect(decl.rateLimit).toEqual({ kind: "debounce", ms: 250 });
  });
});

describe("emit() custom events", () => {
  it("`emit(\"name\", { detail })` parses without errors", () => {
    const { program } = harness(`
      function notify() { emit("ping", { ok: true }) }
      aktion = Button("notify", { onClick: notify })
    `);
    expect(program.errors).toEqual([]);
  });
});

describe("Schema-as-truth validation (advisory)", () => {
  it("flags closed-token enum mismatches", async () => {
    const { validateProgramSchema } = await import("../src/library/index.js");
    const program = parse(`
      aktion = Stack({ direction: "diagonal" })
    `);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.message).toContain("direction");
    expect(warnings[0]!.message).toContain("diagonal");
  });

  it("flags unknown props on built-in components", async () => {
    const { validateProgramSchema } = await import("../src/library/index.js");
    const program = parse(`
      aktion = Stack({ thisPropDoesNotExist: 42 })
    `);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.some((w) => w.message.includes("thisPropDoesNotExist"))).toBe(true);
  });

  it("does not warn for `key:` — content-addressed identity is universal", async () => {
    const { validateProgramSchema } = await import("../src/library/index.js");
    const program = parse(`
      aktion = Stack({ key: "main", direction: "row" })
    `);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.some((w) => w.message.includes('"key"'))).toBe(false);
  });
});
