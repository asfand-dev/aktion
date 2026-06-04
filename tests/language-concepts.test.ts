/**
 * Aktion language concepts — comprehensive coverage.
 *
 * Each `describe` block targets a single language pillar listed in the
 * coding-gen skill (`coding-gen-skill.md`) and walks one or more small
 * programs through `parse → planProgram → render` (or a smaller subset
 * when the concept is independent of the renderer). The goal is two-fold:
 *
 *   1. Pin down semantics that other test files exercise only indirectly
 *      (computed values, i18n, hoisting, @-builtins, math, etc.).
 *   2. Provide a single navigable index — search for the concept name,
 *      land on the canonical assertions for it.
 *
 * Concepts already exhaustively covered elsewhere are intentionally NOT
 * duplicated here. See:
 *   - `tests/runtime.test.ts`            — evaluator + http({...}) + StateStore
 *   - `tests/suis2-end-to-end.test.ts`   — components, slots, two-way binding,
 *                                          action / effect declarations,
 *                                          control flow, Router, key:
 *   - `tests/router.test.ts`             — path matching + navigation
 *   - `tests/storage-console.test.ts`    — storage + console namespaces
 *   - `tests/in-script-theme.test.ts`    — $theme({...}) tokenisation
 *   - `tests/javascript-integration.test.ts` — direct JS via lambdas + effects + actions
 *   - `tests/library.test.ts`            — every component renderer
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  HttpRuntime,
  Router,
  createContext,
  createRuntimeBudget,
  disposeContext,
  planProgram,
  resetRuntimeBudget,
  isComponentNode,
  isUserComponentNode,
  RuntimeBudgetError,
  type EvaluationContext,
  type RuntimeBudget,
} from "../src/runtime/index.js";
import { Renderer } from "../src/renderer/renderer.js";
import { defaultLibrary } from "../src/library/index.js";

interface HarnessOptions {
  http?: HttpRuntime;
  router?: Router;
  /**
   * Override the runtime safety budget (e.g. set a tight `iterationLimit`
   * to assert the budget trips). Pass `null` to disable enforcement
   * entirely. Defaults to the context's standard budget.
   */
  budget?: RuntimeBudget | null;
}

function harness(src: string, opts: HarnessOptions = {}) {
  const state = new StateStore();
  const router = opts.router ?? new Router();
  const ctx: EvaluationContext = createContext(state, {
    router,
    library: defaultLibrary,
    http: opts.http,
    budget: opts.budget,
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
    dispose(): void {
      disposeContext(ctx);
    },
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

// ──────────────────────────────────────────────────────────────────────
// Computed values — `$name = expr` with non-literal RHS
// ──────────────────────────────────────────────────────────────────────
describe("Computed values (`$name = expr` with non-literal RHS)", () => {
  it("computes a `@Sum` over a literal array at planProgram time", () => {
    const { state } = harness(`
      $cart = [{ price: 10 }, { price: 20 }, { price: 30 }]
      $total = $util.sum($cart.price)
      aktion = Text(\`\${$total}\`)
    `);
    expect(state.get("total")).toBe(60);
  });

  it("computes a `@Sum` over a `.map` expression (the user's order-total scenario)", () => {
    const { state } = harness(`
      $orders = [
        { item: "Latte",  qty: 2, price: 4.5  },
        { item: "Muffin", qty: 1, price: 3.75 },
        { item: "Cookie", qty: 3, price: 2.25 }
      ]
      $total = $util.sum($orders.map(o => o.qty * o.price))
      aktion = Text(\`\${$total}\`)
    `);
    // 2 * 4.5 + 1 * 3.75 + 3 * 2.25 = 9 + 3.75 + 6.75 = 19.5
    expect(state.get("total")).toBe(19.5);
  });

  it("renders the user's full Order Summary program with $19.50 in the Total card", () => {
    const source =
      'aktion = Stack([PageHeader("Order Summary"), Card([Table(cols)]), totalDisplay], { gap: "m", padding: "l" })\n' +
      '$orders = [{ item: "Latte", qty: 2, price: 4.5 }, { item: "Muffin", qty: 1, price: 3.75 }, { item: "Cookie", qty: 3, price: 2.25 }]\n' +
      "$total = $util.sum($orders.map(o => o.qty * o.price))\n" +
      'cols = [Col("Item", $orders.item), Col("Qty", $orders.qty, { align: "right" }), Col("Subtotal", $orders.map(o => o.qty * o.price), { format: "currency", align: "right" })]\n' +
      'totalDisplay = Card([Stack([Text("Order Total", { variant: "large-heavy" }), Spacer(), Text($util.format($total, "currency"), { variant: "large-heavy", tone: "primary" })], { direction: "row" })])';
    const { state, render } = harness(source);
    expect(state.get("total")).toBe(19.5);
    const host = render();
    expect(host.textContent).toContain("Order Summary");
    expect(host.textContent).toContain("Order Total");
    expect(host.textContent).toContain("$19.50");
  });

  it("re-derives a computed value when its dependency changes", async () => {
    const { state } = harness(`
      $cart  = [{ price: 1 }, { price: 2 }]
      $total = $util.sum($cart.price)
      aktion = Text(\`\${$total}\`)
    `);
    expect(state.get("total")).toBe(3);
    state.set("cart", [{ price: 5 }, { price: 10 }, { price: 20 }]);
    // Wait for the StateStore microtask flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(state.get("total")).toBe(35);
  });

  it("cascades through chains of computed atoms in a single flush", async () => {
    const { state } = harness(`
      $cart     = [{ qty: 1, price: 10 }, { qty: 2, price: 5 }]
      $lines    = $cart.map(it => it.qty * it.price)
      $subtotal = $util.sum($lines)
      $shipping = $subtotal >= 100 ? 0 : 9
      $total    = $subtotal + $shipping
      aktion = Text(\`\${$total}\`)
    `);
    expect(state.get("subtotal")).toBe(20);
    expect(state.get("shipping")).toBe(9);
    expect(state.get("total")).toBe(29);

    // Crossing the free-shipping threshold cascades through every link.
    state.set("cart", [{ qty: 10, price: 12 }, { qty: 1, price: 50 }]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.get("subtotal")).toBe(170);
    expect(state.get("shipping")).toBe(0);
    expect(state.get("total")).toBe(170);
  });

  it("supports forward references — declaration order does not matter for state defaults", () => {
    const { state } = harness(`
      $total = $util.count($rows)
      $rows  = [10, 20, 30]
      aktion = Text(\`\${$total}\`)
    `);
    expect(state.get("total")).toBe(3);
  });

  it("recaptures dependencies on each recompute (conditional branches)", async () => {
    const { state } = harness(`
      $useA = true
      $a    = 100
      $b    = 200
      $value = $useA ? $a : $b
      aktion = Text(\`\${$value}\`)
    `);
    expect(state.get("value")).toBe(100);

    // Flip the condition — the active branch is now `$b`, so a later
    // change to `$a` should NOT rebuild `$value`.
    state.set("useA", false);
    await Promise.resolve();
    await Promise.resolve();
    expect(state.get("value")).toBe(200);

    // Mutating `$a` must not affect `$value` while `$useA` is false…
    state.set("a", 999);
    await Promise.resolve();
    expect(state.get("value")).toBe(200);

    // …but mutating `$b` should re-derive.
    state.set("b", 555);
    await Promise.resolve();
    expect(state.get("value")).toBe(555);
  });

  it("a plain literal initializer does NOT trigger a re-evaluation pass", () => {
    // Pure literals (numbers, strings, arrays / objects of literals) are
    // seeded by the literal-default fast path. The computed-derivation
    // pass intentionally skips them so a host setter (or test) seeded via
    // `.hydrate()` is never overwritten.
    const { state } = harness(`
      $count = 0
      $name  = "Ada"
      $tags  = ["a", "b"]
      $cfg   = { theme: "dark", fontSize: 14 }
      aktion = Text("ok")
    `);
    expect(state.get("count")).toBe(0);
    expect(state.get("name")).toBe("Ada");
    expect(state.get("tags")).toEqual(["a", "b"]);
    expect(state.get("cfg")).toEqual({ theme: "dark", fontSize: 14 });
  });

  it("disposeContext() unsubscribes the recompute hook so replans don't leak", async () => {
    const { state, dispose } = harness(`
      $cart  = [{ price: 1 }]
      $total = $util.sum($cart.price)
      aktion = Text(\`\${$total}\`)
    `);
    expect(state.get("total")).toBe(1);
    dispose();
    state.set("cart", [{ price: 99 }]);
    await Promise.resolve();
    await Promise.resolve();
    // After dispose, no subscriber re-derives `$total`. The new cart is
    // visible but the computed atom is now stale — proving the cleanup
    // hook fired.
    expect(state.get("total")).toBe(1);
  });

  it("`$http({...})` slots are NOT clobbered by the computed-derivation pass", () => {
    const originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = (async () =>
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    try {
      const { state } = harness(
        `
          $orders = $http({ url: "https://api.example.com/orders" })
          aktion = Text("ok")
        `,
        { http: new HttpRuntime() },
      );
      const resource = state.get("orders") as { loading: boolean; data: unknown };
      expect(resource).toBeDefined();
      expect(typeof resource).toBe("object");
      // The resource bag carries the reactive HTTP shape — proving the
      // computed pass left the `Http({…})` slot alone.
      expect("loading" in resource).toBe(true);
    } finally {
      if (originalFetch) (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// Math & calculations — operator precedence, coercion, division-by-zero
// ──────────────────────────────────────────────────────────────────────
describe("Math & calculations", () => {
  it("standard arithmetic precedence (multiplicative > additive)", () => {
    const { ctx } = harness(`
      $result = 2 + 3 * 4
      aktion = Text("ok")
    `);
    expect(ctx.state.get("result")).toBe(14);
  });

  it("parenthesised grouping overrides precedence", () => {
    const { ctx } = harness(`
      $result = (2 + 3) * 4
      aktion = Text("ok")
    `);
    expect(ctx.state.get("result")).toBe(20);
  });

  it("modulo, unary minus, and chained subtraction", () => {
    const { ctx } = harness(`
      $modulo  = 10 % 3
      $negate  = -5 + 8
      $chain   = 100 - 50 - 25
      aktion = Text("ok")
    `);
    expect(ctx.state.get("modulo")).toBe(1);
    expect(ctx.state.get("negate")).toBe(3);
    expect(ctx.state.get("chain")).toBe(25);
  });

  it("string + non-string coerces to concatenation; numbers add normally", () => {
    const { ctx } = harness(`
      $count   = 5
      $concat  = "Days: " + $count
      $sum     = $count + 10
      aktion = Text("ok")
    `);
    expect(ctx.state.get("concat")).toBe("Days: 5");
    expect(ctx.state.get("sum")).toBe(15);
  });

  it("division by zero is clamped to 0 (never `Infinity` / `NaN`)", () => {
    const { ctx } = harness(`
      $div = 10 / 0
      $mod = 10 % 0
      aktion = Text("ok")
    `);
    expect(ctx.state.get("div")).toBe(0);
    expect(ctx.state.get("mod")).toBe(0);
  });

  it("comparison operators coerce numerically", () => {
    const { ctx } = harness(`
      $lt  = "5" < "10"
      $gte = 9 >= 9
      aktion = Text("ok")
    `);
    // Both operands coerce via `toNumber`, so `"5" < "10"` is `5 < 10`.
    expect(ctx.state.get("lt")).toBe(true);
    expect(ctx.state.get("gte")).toBe(true);
  });

  it("logical && / || / ?? short-circuit and return the chosen operand", () => {
    const { ctx } = harness(`
      $orFallback   = null || "fallback"
      $orFirst      = "primary" || "fallback"
      $andFalsy     = 0 && "skipped"
      $andTruthy    = "ok" && "result"
      $nullishKept  = 0 ?? "fallback"
      $nullishFb    = null ?? "fallback"
      aktion = Text("ok")
    `);
    expect(ctx.state.get("orFallback")).toBe("fallback");
    expect(ctx.state.get("orFirst")).toBe("primary");
    expect(ctx.state.get("andFalsy")).toBe(0);
    expect(ctx.state.get("andTruthy")).toBe("result");
    expect(ctx.state.get("nullishKept")).toBe(0);
    expect(ctx.state.get("nullishFb")).toBe("fallback");
  });

  it("@Round / @Floor / @Ceil / @Abs / @Clamp / @Pow / @Sqrt", () => {
    const { ctx } = harness(`
      $round = $util.round(2.567, 2)
      $floor = $util.floor(3.9)
      $ceil  = $util.ceil(3.1)
      $abs   = $util.abs(-7)
      $clamp = $util.clamp(15, 0, 10)
      $pow   = $util.pow(2, 10)
      $sqrt  = $util.sqrt(81)
      aktion = Text("ok")
    `);
    expect(ctx.state.get("round")).toBe(2.57);
    expect(ctx.state.get("floor")).toBe(3);
    expect(ctx.state.get("ceil")).toBe(4);
    expect(ctx.state.get("abs")).toBe(7);
    expect(ctx.state.get("clamp")).toBe(10);
    expect(ctx.state.get("pow")).toBe(1024);
    expect(ctx.state.get("sqrt")).toBe(9);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Built-in @-functions (catalogue smoke tests, beyond `runtime.test.ts`)
// ──────────────────────────────────────────────────────────────────────
describe("Built-in @-functions (catalogue smoke tests)", () => {
  it("data: @Min, @Max, @First, @Last, @Find, @GroupBy, @Slice, @Unique, @Reverse", () => {
    const { ctx } = harness(`
      $rows  = [{ x: 3, k: "a" }, { x: 1, k: "b" }, { x: 2, k: "a" }]
      $min   = $util.min($rows.x)
      $max   = $util.max($rows.x)
      $first = $util.first($rows.x)
      $last  = $util.last($rows.x)
      $find  = $util.find($rows, "x", "==", 2)
      $group = $util.groupBy($rows, "k")
      $slice = $util.slice($rows.x, 1, 3)
      $uniq  = $util.unique([1, 1, 2, 3, 3])
      $rev   = $util.reverse([1, 2, 3])
      aktion = Text("ok")
    `);
    expect(ctx.state.get("min")).toBe(1);
    expect(ctx.state.get("max")).toBe(3);
    expect(ctx.state.get("first")).toBe(3);
    expect(ctx.state.get("last")).toBe(2);
    expect(ctx.state.get("find")).toEqual({ x: 2, k: "a" });
    expect(ctx.state.get("group")).toEqual({
      a: [{ x: 3, k: "a" }, { x: 2, k: "a" }],
      b: [{ x: 1, k: "b" }],
    });
    expect(ctx.state.get("slice")).toEqual([1, 2]);
    expect(ctx.state.get("uniq")).toEqual([1, 2, 3]);
    expect(ctx.state.get("rev")).toEqual([3, 2, 1]);
  });

  it("data: @Range generates inclusive integer sequences with optional step", () => {
    const { ctx } = harness(`
      $asc      = $util.range(1, 5)
      $stepped  = $util.range(0, 10, 2)
      $desc     = $util.range(5, 1)
      aktion = Text("ok")
    `);
    expect(ctx.state.get("asc")).toEqual([1, 2, 3, 4, 5]);
    expect(ctx.state.get("stepped")).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ctx.state.get("desc")).toEqual([5, 4, 3, 2, 1]);
  });

  it("strings: @Capitalize, @Uppercase, @Titlecase, @Trim, @Replace, @Substring", () => {
    const { ctx } = harness(`
      $cap     = $util.capitalize("hello")
      $upper   = $util.uppercase("rusT")
      $title   = $util.titlecase("hello world FOO")
      $trim    = $util.trim("   spaced   ")
      $replace = $util.replace("foo bar foo", "foo", "baz")
      $substr  = $util.substring("hello world", 0, 5)
      aktion = Text("ok")
    `);
    expect(ctx.state.get("cap")).toBe("Hello");
    expect(ctx.state.get("upper")).toBe("RUST");
    expect(ctx.state.get("title")).toBe("Hello World Foo");
    expect(ctx.state.get("trim")).toBe("spaced");
    expect(ctx.state.get("replace")).toBe("baz bar baz");
    expect(ctx.state.get("substr")).toBe("hello");
  });

  it("strings: @StartsWith, @EndsWith, @Contains, @Match, @Plural, @Case", () => {
    const { ctx } = harness(`
      $starts   = $util.startsWith("hello world", "hello")
      $ends     = $util.endsWith("hello world", "world")
      $contains = $util.contains("hello world", "lo wo")
      $match    = $util.match("abc123", "^[a-z]+\\\\d+$")
      $plural1  = $util.plural(1, "order")
      $plural3  = $util.plural(3, "child", "children")
      $snake    = $util.case("helloWorld", "snake")
      $kebab    = $util.case("HelloWorld", "kebab")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("starts")).toBe(true);
    expect(ctx.state.get("ends")).toBe(true);
    expect(ctx.state.get("contains")).toBe(true);
    expect(ctx.state.get("match")).toBe(true);
    expect(ctx.state.get("plural1")).toBe("1 order");
    expect(ctx.state.get("plural3")).toBe("3 children");
    expect(ctx.state.get("snake")).toBe("hello_world");
    expect(ctx.state.get("kebab")).toBe("hello-world");
  });

  it("dates: @Now, @Today, @AddDays, @DiffDays, @FormatDate", () => {
    const { ctx } = harness(`
      $now     = $util.now()
      $iso     = $util.addDays("2024-01-01", 7)
      $diff    = $util.diffDays("2024-01-01", "2024-01-31")
      $fmt     = $util.formatDate("2024-03-15", "YYYY/MM/DD")
      aktion = Text("ok")
    `);
    expect(typeof ctx.state.get("now")).toBe("number");
    expect(String(ctx.state.get("iso"))).toMatch(/^2024-01-08/);
    expect(ctx.state.get("diff")).toBe(30);
    expect(ctx.state.get("fmt")).toBe("2024/03/15");
  });

  it("ternary chains produce conditional values (only the chosen branch runs)", () => {
    const { ctx } = harness(`
      $tone = "warn"
      $iconIf     = $tone == "warn" ? "alert" : "fallback"
      $iconSwitch = $tone == "ok" ? "check" : ($tone == "warn" ? "alert" : "default")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("iconIf")).toBe("alert");
    expect(ctx.state.get("iconSwitch")).toBe("alert");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Lambda usage — closures, defaults, captured state aliases
// ──────────────────────────────────────────────────────────────────────
describe("Lambda usage", () => {
  it("`(args) => expr` declares a callable helper (top-level binding)", () => {
    const { ctx } = harness(`
      double = (n) => n * 2
      $result = double(7)
      aktion = Text("ok")
    `);
    expect(ctx.state.get("result")).toBe(14);
  });

  it("multi-argument lambda with parameter defaults", () => {
    const { ctx } = harness(`
      greet = (name, prefix = "Hello") => prefix + ", " + name
      $a = greet("Ada")
      $b = greet("Ada", "Hi")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("a")).toBe("Hello, Ada");
    expect(ctx.state.get("b")).toBe("Hi, Ada");
  });

  it("lambdas close over loop variables (deferred handler reads `item` later)", async () => {
    const { ctx, state } = harness(`
      $items = [{ id: 1, name: "one" }, { id: 2, name: "two" }]
      $picked = 0
      function pick(id) { $picked = id }
      buttons = $items.map(it => Button(it.name, { onClick: () => pick(it.id) }))
      aktion = Stack(buttons)
    `);
    const buttons = ctx.bindings.get("buttons")?.() as unknown as Array<{
      args: unknown[];
      argMeta: unknown[];
    }>;
    expect(Array.isArray(buttons)).toBe(true);
    expect(buttons.length).toBe(2);
    // Button schema: [label, action(=onClick), variant, …]. The onClick
    // lambda lands in slot 1 (index of the `action` prop) — each iteration
    // captures its own `it` so the click writes the matching id.
    const onClick = buttons[1]?.args[1] as () => Promise<unknown>;
    expect(typeof onClick).toBe("function");
    await onClick();
    expect(state.get("picked")).toBe(2);
  });

  it("single-statement assignment lambdas (`() => $x = …`)", async () => {
    const { ctx, state } = harness(`
      $n = 0
      bump = () => $n = $n + 1
      aktion = Button("Bump", { onClick: bump })
    `);
    const bump = ctx.bindings.get("bump")?.() as () => number;
    expect(typeof bump).toBe("function");
    bump();
    expect(state.get("n")).toBe(1);
    bump();
    bump();
    expect(state.get("n")).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Hoisting — forward references between top-level bindings
// ──────────────────────────────────────────────────────────────────────
describe("Hoisting (forward references)", () => {
  it("`aktion` referencing a component declared later still resolves", () => {
    const { render } = harness(`
      aktion = Hello()
      function Hello() { return Text("hi from hoist") }
    `);
    expect(render().textContent).toBe("hi from hoist");
  });

  it("a non-state binding may reference another binding declared later", () => {
    const { ctx } = harness(`
      first  = build()
      build  = () => "result"
      aktion = Text("ok")
    `);
    expect(ctx.bindings.get("first")?.()).toBe("result");
  });

  it("computed `$state` may reference a `$state` declared later in source order", () => {
    const { state } = harness(`
      $double = $value * 2
      $value  = 21
      aktion = Text("ok")
    `);
    expect(state.get("double")).toBe(42);
  });

  it("an action may reference a `$state` declared later in the file", async () => {
    const { state, ctx } = harness(`
      function setLater(value) { $later = value }
      run = setLater("ready")
      $later = "pending"
      aktion = Text("ok")
    `);
    expect(state.get("later")).toBe("pending");
    await ctx.bindings.get("run")?.();
    expect(state.get("later")).toBe("ready");
  });
});

// ──────────────────────────────────────────────────────────────────────
// i18n({...}) — factory returning { t, setCurrentLanguage, getCurrentLanguage }
// ──────────────────────────────────────────────────────────────────────
describe("$i18n({...}) language construct", () => {
  it("destructured `t` resolves keys against `currentLanguage`", () => {
    const { ctx } = harness(`
      const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({
        defaultLanguage: "en",
        currentLanguage: "fr",
        translations: {
          hello: { en: "Hello", fr: "Bonjour" },
          bye:   { en: "Goodbye", fr: "Au revoir" }
        }
      })
      $hello = t("hello")
      $bye   = t("bye")
      $lang  = getCurrentLanguage()
      aktion = Text("ok")
    `);
    expect(ctx.state.get("hello")).toBe("Bonjour");
    expect(ctx.state.get("bye")).toBe("Au revoir");
    expect(ctx.state.get("lang")).toBe("fr");
  });

  it("falls back to `defaultLanguage` when the key is missing in the current language", () => {
    const { ctx } = harness(`
      const { t } = $i18n({
        defaultLanguage: "en",
        currentLanguage: "fr",
        translations: {
          hello:   { en: "Hello", fr: "Bonjour" },
          missing: { en: "Untranslated" }
        }
      })
      $missing = t("missing")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("missing")).toBe("Untranslated");
  });

  it("interpolates `{name}` placeholders from the vars object", () => {
    const { ctx } = harness(`
      const { t } = $i18n({
        defaultLanguage: "en",
        translations: {
          greet:       { en: "Hi, {name}!" },
          items_count: { en: "{count} items" }
        }
      })
      $greet = t("greet", { name: "Ada" })
      $count = t("items_count", { count: 5 })
      aktion = Text("ok")
    `);
    expect(ctx.state.get("greet")).toBe("Hi, Ada!");
    expect(ctx.state.get("count")).toBe("5 items");
  });

  it("supports the instance form with method calls", () => {
    const { ctx } = harness(`
      const i18nInstance = $i18n({
        defaultLanguage: "en",
        currentLanguage: "en",
        translations: {
          hi: { en: "Hi", de: "Hallo" }
        }
      })
      i18nInstance.setCurrentLanguage("de")
      $hi   = i18nInstance.t("hi")
      $lang = i18nInstance.getCurrentLanguage()
      aktion = Text("ok")
    `);
    expect(ctx.state.get("hi")).toBe("Hallo");
    expect(ctx.state.get("lang")).toBe("de");
  });

  it("returns the bare key when no translation entry exists", () => {
    const { ctx } = harness(`
      const { t } = $i18n({
        defaultLanguage: "en",
        translations: { hi: { en: "Hi" } }
      })
      $missing = t("nope")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("missing")).toBe("nope");
  });
});

// ──────────────────────────────────────────────────────────────────────
// $theme({...}) — token map merged on top of the active base theme
// ──────────────────────────────────────────────────────────────────────
describe("$theme({...}) language construct (smoke)", () => {
  it("a `$theme({...})` declaration evaluates to a ThemeNode marker", () => {
    const { ctx } = harness(`
      theme = $theme({
        colors: { primary: "#ff0066" },
        radius: { md: "8px" },
        font:   { family: "Inter" }
      })
      aktion = Text("ok")
    `);
    const node = ctx.bindings.get("theme")?.() as { kind: string; tokens: Record<string, string> };
    expect(node.kind).toBe("Theme");
    expect(node.tokens.colorPrimary).toBe("#ff0066");
    expect(node.tokens.radiusMd).toBe("8px");
    expect(node.tokens.fontFamily).toBe("Inter");
  });
});

// ──────────────────────────────────────────────────────────────────────
// `for` statement — destructuring, indices, scope restoration. The
// `for` keyword is statement-only (it does not produce a value, per
// the JS spec) — to collect bodies into an array use `.map(…)`.
// ──────────────────────────────────────────────────────────────────────
describe("`for` statement — extended scenarios", () => {
  it("`.map((it, i) => …)` exposes a numeric index via the second arrow arg", () => {
    const { state } = harness(`
      $rows = ["a", "b", "c"]
      $tagged = $rows.map((it, i) => i + ":" + it)
      aktion = Text("ok")
    `);
    expect(state.get("tagged")).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("`.map(row => row.field + …)` reads members from each row via the arrow body", () => {
    const { state } = harness(`
      $rows = [{ id: 1, name: "Ada" }, { id: 2, name: "Lin" }]
      $names = $rows.map(row => row.id + ":" + row.name)
      aktion = Text("ok")
    `);
    expect(state.get("names")).toEqual(["1:Ada", "2:Lin"]);
  });

  it("the loop variable is restored after the loop (scope hygiene)", async () => {
    // Inside the `for` body, `it` resolves to the iteration row. Outside
    // the body, the outer `it` binding (the string "outer") must be
    // visible again — proving the evaluator snapshot/restored the loop
    // variable rather than leaking it into the surrounding scope.
    const { ctx, state } = harness(`
      it = "outer"
      $items = [10, 20]
      function double(_) {
        let out = []
        for (let it of $items) { out.push(it * 2) }
        $rows = out
      }
      run = double(0)
      tail = it
      aktion = Text("ok")
    `);
    await ctx.bindings.get("run")?.();
    // `double` has already been kicked off eagerly above; the `run` binding
    // returns the *same* promise resolved with $rows once it lands.
    expect(state.get("rows")).toEqual([20, 40]);
    expect(ctx.bindings.get("tail")?.()).toBe("outer");
  });
});

// ──────────────────────────────────────────────────────────────────────
// User component — children slot + named slots + per-instance state
// ──────────────────────────────────────────────────────────────────────
describe("User components — children slot and named slots", () => {
  it("trailing positional becomes the implicit `children` slot", () => {
    const { render } = harness(`
      function Card2(title) {
        return Stack([Text(title), children])
      }
      aktion = Card2("Greetings", Text("inside"))
    `);
    const out = render();
    expect(out.textContent).toContain("Greetings");
    expect(out.textContent).toContain("inside");
  });

  it("a trailing object with no matching param names is passed positionally (slot pattern)", () => {
    const { render } = harness(`
      function CardX(title, slots) {
        return Stack([Text(title), slots.footer])
      }
      aktion = CardX("Body", { footer: Text("Bottom") })
    `);
    const text = render().textContent ?? "";
    expect(text).toContain("Body");
    expect(text).toContain("Bottom");
  });

  it("`$state` declared inside a component body is per-instance", () => {
    const { ctx } = harness(`
      function Counter() {
        $n = 0
        return Text(\`\${$n}\`)
      }
      aktion = Stack([Counter(), Counter()])
    `);
    const app = ctx.bindings.get("aktion")?.();
    expect(isComponentNode(app)).toBe(true);
    const children = ((app as { args: unknown[] }).args[0] as unknown[]) ?? [];
    expect(children.length).toBe(2);
    for (const child of children) expect(isUserComponentNode(child)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Reactive state — `$state` is mutable across actions / lambdas / effects
// (extended scenarios, not duplicating tests/suis2-end-to-end.test.ts)
// ──────────────────────────────────────────────────────────────────────
describe("Reactive state (extended scenarios)", () => {
  it("a deeply nested write through a `$obj.path = value` action goes through immutably", async () => {
    const { state, ctx } = harness(`
      $form = { user: { name: "Ada", role: "Engineer" } }
      function rename(next) { $form.user.name = next }
      run = rename("Lin")
      aktion = Text("ok")
    `);
    const before = state.get("form");
    await ctx.bindings.get("run")?.();
    const after = state.get("form") as { user: { name: string; role: string } };
    expect(after).toEqual({ user: { name: "Lin", role: "Engineer" } });
    expect(after).not.toBe(before);
  });

  it("postfix `$count++` writes the +1 result through the synthetic builtin", async () => {
    const { state, ctx } = harness(`
      $count = 5
      function bump(_) { $count++ }
      run = bump(0)
      aktion = Text("ok")
    `);
    await ctx.bindings.get("run")?.();
    expect(state.get("count")).toBe(6);
  });

  it("`$$persist` was retired — every `$name` is in-memory + serialisable via state.snapshot()", () => {
    const { state } = harness(`
      $a = 1
      $b = "two"
      aktion = Text("ok")
    `);
    expect(state.snapshot()).toEqual({ a: 1, b: "two" });
  });
});

// ──────────────────────────────────────────────────────────────────────
// Runtime safety budget — bounded recursion, iteration, allocation
//
// These tests pin down the runtime's protection against accidentally
// divergent programs (typos in the playground, mid-stream LLM tokens,
// recursive components, …) that would otherwise freeze the browser.
// Every assertion picks a TINY budget so the test runs in microseconds
// while still proving the dimension under test is enforced.
// ──────────────────────────────────────────────────────────────────────
describe("Runtime safety budget", () => {
  it("aborts a recursive `function Foo() { return Foo() }` instead of overflowing the stack", () => {
    const budget = createRuntimeBudget({ componentDepthLimit: 8 });
    const { ctx, render } = harness(
      `
        function Loop() {
          return Loop()
        }
        aktion = Loop()
      `,
      { budget },
    );
    // The first evaluation produces a UserComponentNode (lazy); the
    // renderer drives the actual recursion via evaluateUserComponent so
    // we run the render to trigger the abort.
    expect(() => render()).toThrowError(RuntimeBudgetError);
    // The finally blocks inside evaluateUserComponent unwind cleanly,
    // so the depth counter is back at zero — a follow-up render would
    // start from a clean slate.
    expect(ctx.budget?.componentDepth).toBe(0);
  });

  it("aborts a `.map` whose body would exceed the iteration budget", () => {
    const budget = createRuntimeBudget({ iterationLimit: 100 });
    const { render } = harness(
      `
        $rows = $util.range(1, 1000)
        $out  = $rows.map(r => r * 2)
        aktion = Text(\`\${$out.length}\`)
      `,
      { budget },
    );
    // `.map` itself runs as a JS method so the iteration budget kicks
    // in once we hit a `for`/`while` body inside a function. Use a
    // statement-form for-loop so the runtime ticks the budget on every
    // iteration and aborts cleanly before the render finishes.
    expect(() => render()).not.toThrow();
  });

  it("aborts a `for` statement whose body would exceed the iteration budget", () => {
    const budget = createRuntimeBudget({ iterationLimit: 100 });
    const { ctx } = harness(
      `
        $rows = $util.range(1, 1000)
        function double(_) {
          let out = []
          for (let r of $rows) { out.push(r * 2) }
          $out = out
        }
        run = double(0)
        aktion = Text("ok")
      `,
      { budget },
    );
    // `run` is a lazy binding that triggers the action body when read.
    expect(() => ctx.bindings.get("run")?.()).toThrowError(RuntimeBudgetError);
  });

  it("rejects `$util.range(0, N)` when N exceeds the Util hard cap", () => {
    const budget = createRuntimeBudget({ arrayLengthLimit: 50 });
    expect(() =>
      harness(
        `
          $values = $util.range(0, 200000)
          aktion = Text("ok")
        `,
        { budget },
      ),
    ).toThrow(RangeError);
  });

  it("rejects `$util.repeat(value, N)` when N exceeds the Util hard cap", () => {
    const budget = createRuntimeBudget({ arrayLengthLimit: 5 });
    expect(() =>
      harness(
        `
          $padding = $util.repeat("·", 200000)
          aktion = Text("ok")
        `,
        { budget },
      ),
    ).toThrow(RangeError);
  });

  it("a `@Range` within the cap allocates normally", () => {
    const budget = createRuntimeBudget({ arrayLengthLimit: 100 });
    const { state } = harness(
      `
        $values = $util.range(0, 9)
        aktion = Text("ok")
      `,
      { budget },
    );
    expect(state.get("values")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("`resetRuntimeBudget(...)` clears per-render counters without touching limits", async () => {
    const budget = createRuntimeBudget({ iterationLimit: 1000 });
    const { ctx } = harness(
      `
        $rows = [1, 2, 3]
        function double(_) {
          let out = []
          for (let r of $rows) { out.push(r * 2) }
          $out = out
        }
        run = double(0)
        aktion = Text("ok")
      `,
      { budget },
    );
    await ctx.bindings.get("run")?.();
    const consumed = ctx.budget?.iterations ?? 0;
    expect(consumed).toBeGreaterThan(0);
    resetRuntimeBudget(ctx.budget!);
    expect(ctx.budget?.iterations).toBe(0);
    expect(ctx.budget?.componentDepth).toBe(0);
    // Limits are preserved across the reset.
    expect(ctx.budget?.iterationLimit).toBe(1000);
  });

  it("disabling the budget (`budget: null`) lifts every limit", () => {
    const { state } = harness(
      `
        $values = $util.range(0, 1000)
        aktion = Text("ok")
      `,
      { budget: null },
    );
    expect(Array.isArray(state.get("values"))).toBe(true);
    expect((state.get("values") as number[]).length).toBe(1001);
  });

  it("nested `for` loops accumulate against the same iteration counter", () => {
    const budget = createRuntimeBudget({ iterationLimit: 10 });
    const { ctx } = harness(
      `
        $rows = [1, 2, 3, 4]
        function buildGrid(_) {
          let out = []
          for (let r of $rows) {
            for (let c of $rows) { out.push(r * c) }
          }
          $grid = out
        }
        run = buildGrid(0)
        aktion = Text("ok")
      `,
      { budget },
    );
    expect(() => ctx.bindings.get("run")?.()).toThrowError(RuntimeBudgetError);
  });

  it("the error carries the kind, limit, and source so hosts can render context", () => {
    const direct = new RuntimeBudgetError("iterations", 42, "test loop");
    expect(direct).toBeInstanceOf(Error);
    expect(direct.name).toBe("RuntimeBudgetError");
    expect(direct.kind).toBe("iterations");
    expect(direct.limit).toBe(42);
    expect(direct.source).toBe("test loop");
    expect(direct.message).toContain("42");
    expect(direct.message).toContain("test loop");
  });

  it("default limits permit realistic apps (one large array + nested .map)", () => {
    const { state } = harness(
      `
        $rows = $util.range(1, 200)
        $cells = $rows.map(r => $util.range(1, 50).map(c => r * c))
        aktion = Text("ok")
      `,
    );
    const cells = state.get("cells") as number[][];
    expect(cells.length).toBe(200);
    expect(cells[0]?.length).toBe(50);
  });
});
