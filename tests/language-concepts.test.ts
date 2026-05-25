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
 *                                          control flow, _router_, key:
 *   - `tests/router.test.ts`             — path matching + navigation
 *   - `tests/storage-console.test.ts`    — storage + console namespaces
 *   - `tests/in-script-theme.test.ts`    — Theme({...}) tokenisation
 *   - `tests/javascript-integration.test.ts` — js{ … } + effects + actions
 *   - `tests/library.test.ts`            — every component renderer
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  HttpRuntime,
  I18nRuntime,
  Router,
  createContext,
  disposeContext,
  planProgram,
  isComponentNode,
  isUserComponentNode,
  type EvaluationContext,
} from "../src/runtime/index.js";
import { Renderer } from "../src/renderer/renderer.js";
import { defaultLibrary } from "../src/library/index.js";

interface HarnessOptions {
  http?: HttpRuntime;
  i18n?: I18nRuntime;
  router?: Router;
}

function harness(src: string, opts: HarnessOptions = {}) {
  const state = new StateStore();
  const router = opts.router ?? new Router();
  const ctx: EvaluationContext = createContext(state, {
    router,
    library: defaultLibrary,
    http: opts.http,
    i18n: opts.i18n,
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
      const root = ctx.bindings.get("_app_")?.();
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
      $total = @Sum($cart.price)
      _app_ = Text(\`\${$total}\`)
    `);
    expect(state.get("total")).toBe(60);
  });

  it("computes a `@Sum` over a `for` expression (the user's order-total scenario)", () => {
    const { state } = harness(`
      $orders = [
        { item: "Latte",  qty: 2, price: 4.5  },
        { item: "Muffin", qty: 1, price: 3.75 },
        { item: "Cookie", qty: 3, price: 2.25 }
      ]
      $total = @Sum(for o in $orders { o.qty * o.price })
      _app_ = Text(\`\${$total}\`)
    `);
    // 2 * 4.5 + 1 * 3.75 + 3 * 2.25 = 9 + 3.75 + 6.75 = 19.5
    expect(state.get("total")).toBe(19.5);
  });

  it("renders the user's full Order Summary program with $19.50 in the Total card", () => {
    // Regression for the user-reported bug — exercises the full
    // parse → plan → render path including @Format(currency) on the
    // computed `$total` and a `for o in $orders { … }` inside a Col.
    const source =
      '_app_ = Stack([PageHeader("Order Summary"), Card([Table(cols)]), totalDisplay], gap: "m", padding: "l")\n' +
      '$orders = [{ item: "Latte", qty: 2, price: 4.5 }, { item: "Muffin", qty: 1, price: 3.75 }, { item: "Cookie", qty: 3, price: 2.25 }]\n' +
      "$total = @Sum(for o in $orders { o.qty * o.price })\n" +
      'cols = [Col("Item", $orders.item), Col("Qty", $orders.qty, align: "right"), Col("Subtotal", for o in $orders { o.qty * o.price }, format: "currency", align: "right")]\n' +
      'totalDisplay = Card([Stack([Text("Order Total", variant: "large-heavy"), Spacer(), Text(@Format($total, "currency"), variant: "large-heavy", tone: "primary")], direction: "row")])';
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
      $total = @Sum($cart.price)
      _app_ = Text(\`\${$total}\`)
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
      $lines    = for it in $cart { it.qty * it.price }
      $subtotal = @Sum($lines)
      $shipping = if $subtotal >= 100 { 0 } else { 9 }
      $total    = $subtotal + $shipping
      _app_ = Text(\`\${$total}\`)
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
      $total = @Count($rows)
      $rows  = [10, 20, 30]
      _app_ = Text(\`\${$total}\`)
    `);
    expect(state.get("total")).toBe(3);
  });

  it("recaptures dependencies on each recompute (conditional branches)", async () => {
    const { state } = harness(`
      $useA = true
      $a    = 100
      $b    = 200
      $value = if $useA { $a } else { $b }
      _app_ = Text(\`\${$value}\`)
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
      _app_ = Text("ok")
    `);
    expect(state.get("count")).toBe(0);
    expect(state.get("name")).toBe("Ada");
    expect(state.get("tags")).toEqual(["a", "b"]);
    expect(state.get("cfg")).toEqual({ theme: "dark", fontSize: 14 });
  });

  it("disposeContext() unsubscribes the recompute hook so replans don't leak", async () => {
    const { state, dispose } = harness(`
      $cart  = [{ price: 1 }]
      $total = @Sum($cart.price)
      _app_ = Text(\`\${$total}\`)
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

  it("`http({...})` slots are NOT clobbered by the computed-derivation pass", () => {
    const { state } = harness(
      `
        $orders = http({ url: "/api/orders" })
        _app_ = Text("ok")
      `,
      { http: new HttpRuntime() },
    );
    const resource = state.get("orders") as { loading: boolean; data: unknown };
    expect(resource).toBeDefined();
    expect(typeof resource).toBe("object");
    // The resource bag carries the reactive HTTP shape — proving the
    // computed pass left the `http({…})` slot alone.
    expect("loading" in resource).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Math & calculations — operator precedence, coercion, division-by-zero
// ──────────────────────────────────────────────────────────────────────
describe("Math & calculations", () => {
  it("standard arithmetic precedence (multiplicative > additive)", () => {
    const { ctx } = harness(`
      $result = 2 + 3 * 4
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("result")).toBe(14);
  });

  it("parenthesised grouping overrides precedence", () => {
    const { ctx } = harness(`
      $result = (2 + 3) * 4
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("result")).toBe(20);
  });

  it("modulo, unary minus, and chained subtraction", () => {
    const { ctx } = harness(`
      $modulo  = 10 % 3
      $negate  = -5 + 8
      $chain   = 100 - 50 - 25
      _app_ = Text("ok")
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
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("concat")).toBe("Days: 5");
    expect(ctx.state.get("sum")).toBe(15);
  });

  it("division by zero is clamped to 0 (never `Infinity` / `NaN`)", () => {
    const { ctx } = harness(`
      $div = 10 / 0
      $mod = 10 % 0
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("div")).toBe(0);
    expect(ctx.state.get("mod")).toBe(0);
  });

  it("comparison operators coerce numerically", () => {
    const { ctx } = harness(`
      $lt  = "5" < "10"
      $gte = 9 >= 9
      _app_ = Text("ok")
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
      _app_ = Text("ok")
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
      $round = @Round(2.567, 2)
      $floor = @Floor(3.9)
      $ceil  = @Ceil(3.1)
      $abs   = @Abs(-7)
      $clamp = @Clamp(15, 0, 10)
      $pow   = @Pow(2, 10)
      $sqrt  = @Sqrt(81)
      _app_ = Text("ok")
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
      $min   = @Min($rows.x)
      $max   = @Max($rows.x)
      $first = @First($rows.x)
      $last  = @Last($rows.x)
      $find  = @Find($rows, "x", "==", 2)
      $group = @GroupBy($rows, "k")
      $slice = @Slice($rows.x, 1, 3)
      $uniq  = @Unique([1, 1, 2, 3, 3])
      $rev   = @Reverse([1, 2, 3])
      _app_ = Text("ok")
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
      $asc      = @Range(1, 5)
      $stepped  = @Range(0, 10, 2)
      $desc     = @Range(5, 1)
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("asc")).toEqual([1, 2, 3, 4, 5]);
    expect(ctx.state.get("stepped")).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ctx.state.get("desc")).toEqual([5, 4, 3, 2, 1]);
  });

  it("strings: @Capitalize, @Uppercase, @Titlecase, @Trim, @Replace, @Substring", () => {
    const { ctx } = harness(`
      $cap     = @Capitalize("hello")
      $upper   = @Uppercase("rusT")
      $title   = @Titlecase("hello world FOO")
      $trim    = @Trim("   spaced   ")
      $replace = @Replace("foo bar foo", "foo", "baz")
      $substr  = @Substring("hello world", 0, 5)
      _app_ = Text("ok")
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
      $starts   = @StartsWith("hello world", "hello")
      $ends     = @EndsWith("hello world", "world")
      $contains = @Contains("hello world", "lo wo")
      $match    = @Match("abc123", "^[a-z]+\\\\d+$")
      $plural1  = @Plural(1, "order")
      $plural3  = @Plural(3, "child", "children")
      $snake    = @Case("helloWorld", "snake")
      $kebab    = @Case("HelloWorld", "kebab")
      _app_ = Text("ok")
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
      $now     = @Now()
      $iso     = @AddDays("2024-01-01", 7)
      $diff    = @DiffDays("2024-01-01", "2024-01-31")
      $fmt     = @FormatDate("2024-03-15", "YYYY/MM/DD")
      _app_ = Text("ok")
    `);
    expect(typeof ctx.state.get("now")).toBe("number");
    expect(String(ctx.state.get("iso"))).toMatch(/^2024-01-08/);
    expect(ctx.state.get("diff")).toBe(30);
    expect(ctx.state.get("fmt")).toBe("2024/03/15");
  });

  it("@If / @Switch lazy conditional builtins (only the chosen branch runs)", () => {
    // These intentionally read non-existent names in the unselected
    // branch — the test passes only because the runtime defers
    // evaluation.
    const { ctx } = harness(`
      $tone = "warn"
      $iconIf     = @If($tone == "warn", "alert", $unknownNeverEvaluated)
      $iconSwitch = @Switch($tone, { ok: "check", warn: "alert" }, "default")
      _app_ = Text("ok")
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
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("result")).toBe(14);
  });

  it("multi-argument lambda with parameter defaults", () => {
    const { ctx } = harness(`
      greet = (name, prefix: "Hello") => prefix + ", " + name
      $a = greet("Ada")
      $b = greet("Ada", "Hi")
      _app_ = Text("ok")
    `);
    expect(ctx.state.get("a")).toBe("Hello, Ada");
    expect(ctx.state.get("b")).toBe("Hi, Ada");
  });

  it("lambdas close over loop variables (deferred handler reads `item` later)", async () => {
    const { ctx, state } = harness(`
      $items = [{ id: 1, name: "one" }, { id: 2, name: "two" }]
      $picked = 0
      action pick(id) { $picked = id }
      buttons = for it in $items {
        Button(it.name, onClick: () => pick(it.id))
      }
      _app_ = Stack(buttons)
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
      _app_ = Button("Bump", onClick: bump)
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
  it("`_app_` referencing a `component` declared later still resolves", () => {
    const { render } = harness(`
      _app_ = Hello()
      component Hello() { return Text("hi from hoist") }
    `);
    expect(render().textContent).toBe("hi from hoist");
  });

  it("a non-state binding may reference another binding declared later", () => {
    const { ctx } = harness(`
      first  = build()
      build  = () => "result"
      _app_ = Text("ok")
    `);
    expect(ctx.bindings.get("first")?.()).toBe("result");
  });

  it("computed `$state` may reference a `$state` declared later in source order", () => {
    const { state } = harness(`
      $double = $value * 2
      $value  = 21
      _app_ = Text("ok")
    `);
    expect(state.get("double")).toBe(42);
  });

  it("an action may reference a `$state` declared later in the file", async () => {
    // Note: passing a positional arg eagerly invokes the action body
    // (zero-arg `action()` calls return the bare callable instead — see
    // the runtime's `evaluateComponentCall` action branch). The arg
    // becomes the new value, so this also doubles as an "action body
    // can read AND write a hoisted $state" assertion.
    const { state, ctx } = harness(`
      action setLater(value) { $later = value }
      run = setLater("ready")
      $later = "pending"
      _app_ = Text("ok")
    `);
    expect(state.get("later")).toBe("pending");
    await ctx.bindings.get("run")?.();
    expect(state.get("later")).toBe("ready");
  });
});

// ──────────────────────────────────────────────────────────────────────
// i18n({...}) — locale + message dictionaries + `t(key, vars)`
// ──────────────────────────────────────────────────────────────────────
describe("i18n({...}) language construct", () => {
  it("`i18n({...})` configures the runtime; `t(key)` returns the localised string", () => {
    const i18n = new I18nRuntime();
    const { ctx } = harness(
      `
        $i18n = i18n({
          locale: "fr",
          messages: { hello: "Bonjour", bye: "Au revoir" },
          fallback: "en",
          fallbackMessages: { hello: "Hello", bye: "Goodbye" }
        })
        $hello = @T("hello")
        $bye   = @T("bye")
        _app_ = Text(\`\${$hello}\`)
      `,
      { i18n },
    );
    expect(ctx.state.get("hello")).toBe("Bonjour");
    expect(ctx.state.get("bye")).toBe("Au revoir");
  });

  it("falls back to `fallback` locale when the key is missing in the active locale", () => {
    const i18n = new I18nRuntime();
    const { ctx } = harness(
      `
        $i18n = i18n({
          locale: "fr",
          messages: { hello: "Bonjour" },
          fallback: "en",
          fallbackMessages: { missing: "Untranslated" }
        })
        $missing = @T("missing")
        _app_ = Text("ok")
      `,
      { i18n },
    );
    expect(ctx.state.get("missing")).toBe("Untranslated");
  });

  it("interpolates `${name}` placeholders from the vars object passed to `@T`", () => {
    const i18n = new I18nRuntime();
    const { ctx } = harness(
      `
        $i18n = i18n({
          locale: "en",
          messages: { greet: "Hi, \${name}!" },
          fallback: "en"
        })
        $greet = @T("greet", { name: "Ada" })
        _app_ = Text("ok")
      `,
      { i18n },
    );
    expect(ctx.state.get("greet")).toBe("Hi, Ada!");
  });

  it("@Locale() returns the active locale tag", () => {
    const i18n = new I18nRuntime();
    const { ctx } = harness(
      `
        $i18n = i18n({ locale: "de-DE", messages: {}, fallback: "en" })
        $tag = @Locale()
        _app_ = Text("ok")
      `,
      { i18n },
    );
    expect(ctx.state.get("tag")).toBe("de-DE");
  });

  it("with no `i18n({...})` configured, @T returns the bare key as a fallback", () => {
    const { ctx } = harness(`
      $missing = @T("hello")
      _app_ = Text("ok")
    `);
    // Without an i18n runtime instance attached the builtin returns the
    // key verbatim — programs degrade gracefully without crashing.
    expect(ctx.state.get("missing")).toBe("hello");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Theme({...}) — token map merged on top of the active base theme
// ──────────────────────────────────────────────────────────────────────
describe("Theme({...}) language construct (smoke)", () => {
  it("a `Theme({...})` declaration evaluates to a ThemeNode marker", () => {
    const { ctx } = harness(`
      theme = Theme({
        colors: { primary: "#ff0066" },
        radius: { md: "8px" },
        font:   { heading: "Inter" }
      })
      _app_ = Text("ok")
    `);
    const node = ctx.bindings.get("theme")?.() as { kind: string; tokens: Record<string, string> };
    expect(node.kind).toBe("Theme");
    expect(node.tokens.colorPrimary).toBe("#ff0066");
    expect(node.tokens.radiusMd).toBe("8px");
    expect(node.tokens.fontHeading).toBe("Inter");
  });
});

// ──────────────────────────────────────────────────────────────────────
// `for` expression — destructuring, indices, scope restoration
// ──────────────────────────────────────────────────────────────────────
describe("`for` expression — extended scenarios", () => {
  it("`for (item, i) in xs { … }` exposes a numeric index", () => {
    const { state } = harness(`
      $rows = ["a", "b", "c"]
      $tagged = for (it, i) in $rows { i + ":" + it }
      _app_ = Text("ok")
    `);
    expect(state.get("tagged")).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("`for {field, field} in xs { … }` destructures each row", () => {
    const { state } = harness(`
      $rows = [{ id: 1, name: "Ada" }, { id: 2, name: "Lin" }]
      $names = for {id, name} in $rows { id + ":" + name }
      _app_ = Text("ok")
    `);
    expect(state.get("names")).toEqual(["1:Ada", "2:Lin"]);
  });

  it("the loop variable is restored after the loop (scope hygiene)", () => {
    // Inside the `for` body, `it` resolves to the iteration row. Outside
    // the body, the outer `it` binding (the string "outer") must be
    // visible again — proving the evaluator snapshot/restored the loop
    // variable rather than leaking it into the surrounding scope.
    const { ctx, state } = harness(`
      it = "outer"
      $items = [10, 20]
      $rows = for it in $items { it * 2 }
      tail = it
      _app_ = Text("ok")
    `);
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
      component Card2(title) {
        return Stack([Text(title), children])
      }
      _app_ = Card2("Greetings", Text("inside"))
    `);
    const out = render();
    expect(out.textContent).toContain("Greetings");
    expect(out.textContent).toContain("inside");
  });

  it("`slots: { footer? }` exposes named slots inside the body", () => {
    const { render } = harness(`
      component CardX(title, slots: { footer }) {
        return Stack([Text(title), slots.footer])
      }
      _app_ = CardX("Body", footer: Text("Bottom"))
    `);
    const text = render().textContent ?? "";
    expect(text).toContain("Body");
    expect(text).toContain("Bottom");
  });

  it("`$state` declared inside a component body is per-instance", () => {
    const { ctx } = harness(`
      component Counter() {
        $n = 0
        return Text(\`\${$n}\`)
      }
      _app_ = Stack([Counter(), Counter()])
    `);
    const app = ctx.bindings.get("_app_")?.();
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
      action rename(next) { $form.user.name = next }
      run = rename("Lin")
      _app_ = Text("ok")
    `);
    const before = state.get("form");
    await ctx.bindings.get("run")?.();
    const after = state.get("form") as { user: { name: string; role: string } };
    expect(after).toEqual({ user: { name: "Lin", role: "Engineer" } });
    expect(after).not.toBe(before);
  });

  it("postfix `$count++` writes the +1 result through the synthetic builtin", async () => {
    // The action takes a positional arg so the call is invoked eagerly
    // (a zero-arg call would only return the bare callable — see the
    // hoisting / setLater scenario above for the same quirk).
    const { state, ctx } = harness(`
      $count = 5
      action bump(_) { $count++ }
      run = bump(0)
      _app_ = Text("ok")
    `);
    await ctx.bindings.get("run")?.();
    expect(state.get("count")).toBe(6);
  });

  it("`$$persist` was retired — every `$name` is in-memory + serialisable via state.snapshot()", () => {
    const { state } = harness(`
      $a = 1
      $b = "two"
      _app_ = Text("ok")
    `);
    expect(state.snapshot()).toEqual({ a: 1, b: "two" });
  });
});
