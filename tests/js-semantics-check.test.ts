/**
 * The JS-semantics checks (`src/compiler/js-semantics.ts`, `aktion-in-typescript.md`
 * §6.4): for every E/W code, a fixture that triggers it — at the author's
 * line:column — and a fixture of the supported spelling that does not.
 *
 * Fixtures go through the real `.aktion.js` frontend, so they also prove each
 * rule is wired into `compileJavaScriptModule` (and that a rejected module is
 * never lowered). E116, E122 and E123 are linker rules — see
 * `tests/linker-frontends.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { checkJavaScriptSemantics, normalizeComponentForms } from "../src/compiler/js-semantics.js";
import { aktionFrontend } from "../src/compiler/frontend.js";
import { linkProject } from "../src/compiler/index.js";
import { parse } from "../src/parser/index.js";

interface Found {
  code: string;
  line: number;
  column: number;
  message: string;
  severity: string;
}

/** Every diagnostic the `.aktion.js` frontend reports for `src` (parse errors as `PARSE`). */
function diagnose(src: string): Found[] {
  const result = javascriptFrontend.compile(src, "/app/m.aktion.js");
  return [
    ...result.program.errors.map((e) => ({ code: "PARSE", line: e.line, column: e.column, message: e.message, severity: "error" })),
    ...result.diagnostics.map((d) => ({
      code: d.code ?? "?",
      line: d.line,
      column: d.column,
      message: d.message,
      severity: d.severity,
    })),
  ];
}

/** `code@line:column` for each diagnostic of `code`. */
function at(src: string, code: string): string[] {
  return diagnose(src)
    .filter((d) => d.code === code)
    .map((d) => `${d.line}:${d.column}`);
}

const lines = (...l: string[]): string => l.join("\n");

describe("E101 — await", () => {
  it("rejects statement and expression `await`", () => {
    expect(at(lines("function go() {", "  await save()", "}"), "E101")).toEqual(["2:3"]);
    expect(at(lines("function go() {", "  const v = await p", "  return v", "}"), "E101")).toEqual(["2:13"]);
  });
  it("accepts `.then` chains", () => {
    expect(diagnose(lines("function go() {", "  save().then((v) => v)", "}"))).toEqual([]);
  });
  it("uses the specified message", () => {
    expect(diagnose("function go() {\n  await save()\n}")[0]!.message).toBe(
      "`await` is not supported in Aktion modules: Aktion bodies run synchronously, so `await x` is the Promise " +
        "itself and a statement-level `await f()` is skipped. Chain it instead — `f().then((value) => { … })` — or " +
        "use `$http(…)` and its `.onDone`.",
    );
  });
});

describe("E102 — async", () => {
  it("rejects `async function`, `async` arrows and `async` function expressions", () => {
    expect(at("async function go() { return 1 }", "E102")).toEqual(["1:1"]);
    expect(at("const f = async () => 1", "E102")).toEqual(["1:11"]);
    expect(at("const g = async function () { return 1 }", "E102")).toEqual(["1:11"]);
    expect(at("const h = async x => x", "E102")).toEqual(["1:11"]);
  });
  it("replaces the generic parse error of an `async` arrow instead of adding to it", () => {
    expect(diagnose("const f = async () => 1").map((d) => d.code)).toEqual(["E102"]);
  });
  it("is not fooled by a property named `async`", () => {
    expect(diagnose(lines("const o = { async: true }", "const v = o.async", "const w = o?.async"))).toEqual([]);
  });
});

describe("E103 — this / arguments", () => {
  it("rejects both, at the identifier", () => {
    const found = diagnose(lines("function f() {", "  return this.x + arguments[0]", "}"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E103@2:10", "E103@2:19"]);
    expect(found[1]!.message).toBe("`arguments` is not available in Aktion — use a rest parameter `(...args)`.");
  });
  it("accepts explicit parameters", () => {
    expect(diagnose(lines("function f(self, ...args) {", "  return self.x + args[0]", "}"))).toEqual([]);
  });
});

describe("E104 — var", () => {
  it("rejects `var` declarations and loop heads", () => {
    expect(at(lines("var x = 1", "for (var k in o) {}"), "E104")).toEqual(["1:1", "2:1"]);
  });
  it("accepts let / const", () => {
    expect(at(lines("let x = 1", "const y = 2", "for (const k in o) {}"), "E104")).toEqual([]);
  });
});

describe("E105 — a local reassigned after a closure captured it", () => {
  it("S5: an assignment textually after the closure", () => {
    const src = lines("function go() {", '  let v = "a"', "  const f = () => v", '  v = "b"', "  return f()", "}");
    expect(at(src, "E105")).toEqual(["4:5"]);
  });
  it("S6: an assignment inside the closure (counter factory)", () => {
    expect(at(lines("function makeCounter() {", "  let n = 0", "  return () => { n = n + 1; return n }", "}"), "E105")).toEqual(["3:20"]);
  });
  it("an assignment in a loop body that also creates the closure", () => {
    const src = lines("function go() {", "  let n = 0", "  for (const x of [1]) {", "    n = n + x", "    const f = () => n", "  }", "}");
    expect(at(src, "E105")).toEqual(["4:7"]);
  });
  it("accepts assignments that only run before the closure, and loop-header variables", () => {
    const src = lines(
      "function go() {",
      '  let v = "a"',
      '  v = "b"',
      "  const f = () => v",
      "  for (let i = 0; i < 3; i++) { const g = () => i }",
      "  return f()",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E106 — a closure that uses a local before it is declared", () => {
  it("S37: a later declaration", () => {
    expect(at(lines("function go() {", "  const f = () => label", '  const label = "L"', "  return f()", "}"), "E106")).toEqual(["2:19"]);
  });
  it("S7: self-reference in the closure's own initializer", () => {
    const src = lines("function go() {", "  const fact = (n) => n <= 1 ? 1 : n * fact(n - 1)", "  return fact(5)", "}");
    expect(at(src, "E106")).toEqual(["2:40"]);
  });
  it("mutual recursion between local lambdas", () => {
    const src = lines(
      "function go() {",
      "  const isEven = (n) => n === 0 ? true : isOdd(n - 1)",
      "  const isOdd = (n) => n === 0 ? false : isEven(n - 1)",
      "  return isEven(4)",
      "}",
    );
    expect(at(src, "E106")).toEqual(["2:42"]);
  });
  it("a nested function used before its declaration (no hoisting)", () => {
    expect(at(lines("function C() {", "  inc()", "  function inc() {}", "  return null", "}"), "E106")).toEqual(["2:3"]);
  });
  it("a recursive nested function", () => {
    const src = lines("function go() {", "  function fact(n) { return n <= 1 ? 1 : n * fact(n - 1) }", "  return fact(3)", "}");
    expect(at(src, "E106")).toEqual(["2:46"]);
  });
  it("accepts declaration-before-use", () => {
    const src = lines("function go() {", '  const label = "L"', "  const f = () => label", "  function g() { return f() }", "  return g()", "}");
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E107 — a module-level binding changed after it was built", () => {
  it("S10: reassigned in an action", () => {
    const found = diagnose(lines("let count = 0", "function inc() {", "  count = count + 1", "}"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E107@3:9"]);
    expect(found[0]!.message).toBe(
      "Module-level `count` is changed in `inc`, but Aktion rebuilds module-level bindings on every render, so the " +
        "change is lost on the next render. Keep mutable data in a state atom (`let $count = …`) or, inside a " +
        "component, in `$ref(…)`.",
    );
  });
  it("S38: mutated in place inside a function", () => {
    expect(at(lines("const seen = new Set()", "function track(x) {", "  seen.add(x)", "}"), "E107")).toEqual(["3:8"]);
    expect(at(lines("const cache = {}", "function put(k, v) {", "  cache[k] = v", "}"), "E107")).toEqual(["3:12"]);
    expect(at(lines("const list = []", "const add = (x) => list.push(x)"), "E107")).toEqual(["2:25"]);
  });
  it("S11: reassigned at module level", () => {
    const found = diagnose(lines("let x = 1", "x = 2"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E107@2:3"]);
    expect(found[0]!.message).toContain("Module-level `x` is changed, but");
  });
  it("an imported binding changed in place", () => {
    expect(at(lines('import { list } from "./data.aktion"', "function add(x) {", "  list.push(x)", "}"), "E107")).toEqual(["3:8"]);
  });
  it("accepts API methods named like mutators", () => {
    // Building at module level (`const list = []` then `list.push(1)`) is E107
    // — see tests/compiler-module-mutation.test.ts.
    const src = lines(
      "const list = [1]",
      "const api = makeApi()",
      "function remove(id) {",
      "  api.delete(id)",
      "  return list.map((x) => x * 2)",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E108 — in-place change of a data atom", () => {
  it("S19: a mutating method", () => {
    const found = diagnose(lines("let $todos = []", "function add(t) {", "  $todos.push(t)", "}"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E108@3:10"]);
    expect(found[0]!.message).toBe(
      "`$todos.push(…)` changes state in place, and Aktion only re-renders when a `$` atom is assigned. Assign a new " +
        "value instead, e.g. `$todos = [...$todos, item]`.",
    );
  });
  it("a computed key, an increment through one, and `delete`", () => {
    expect(at(lines("let $a = [1]", "function put(i, v) {", "  $a[i] = v", "}"), "E108")).toEqual(["3:9"]);
    expect(at(lines("let $a = [1]", "function bump(i) {", "  $a[i]++", "}"), "E108")).toEqual(["3:8"]);
    expect(at(lines("let $o = { a: 1 }", "function drop(k) {", "  delete $o[k]", "}"), "E108")).toEqual(["3:3"]);
    expect(at(lines("let $seen = new Set()", "function track(x) {", "  $seen.add(x)", "}"), "E108")).toEqual(["3:9"]);
  });
  it("accepts reassignment, dot paths, `.length` and factory handles", () => {
    const src = lines(
      "let $todos = []",
      "let $o = { a: 1 }",
      "let $arr = [1]",
      "let $cart = $store({ items: [] })",
      "function f(t) {",
      "  $todos = [...$todos, t]",
      "  $o.a = 2",
      "  $arr.length = 0",
      "  $cart.add(t)",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
  it("flags an imported atom only when its exporter declares it as data", async () => {
    const importer = lines('import { $todos } from "./store.aktion"', "export function add(t) {", "  $todos.push(t)", "}");
    const data = await linkProject({
      entry: "app.aktion",
      files: {
        "app.aktion": 'import { add } from "./ops.aktion.js"\n$app(Button("Go", { onClick: () => add(1) }))',
        "ops.aktion.js": importer,
        "store.aktion": "export $todos = []",
      },
    });
    expect(data.diagnostics.map((d) => `${d.code}@${d.path}:${d.line}:${d.column}`)).toEqual(["E108@ops.aktion.js:3:10"]);
    const handle = await linkProject({
      entry: "app.aktion",
      files: {
        "app.aktion": 'import { add } from "./ops.aktion.js"\n$app(Button("Go", { onClick: () => add(1) }))',
        "ops.aktion.js": importer,
        "store.aktion": "export $todos = $store({ items: [] })",
      },
    });
    expect(handle.diagnostics).toEqual([]);
  });
});

describe("E109 — per-instance state declared in a nested block", () => {
  it("rejects `let $x` inside a block of a component body", () => {
    expect(at(lines("function C() {", "  if (true) {", "    let $x = 1", "  }", '  return Text("x")', "}"), "E109")).toEqual(["3:5"]);
  });
  it("accepts it at the top of the body", () => {
    expect(diagnose(lines("function C() {", "  let $x = 1", "  return Text(String($x))", "}"))).toEqual([]);
  });
});

describe("E110 — hooks outside the top level of a component or hook", () => {
  it("rejects hooks in actions, lambdas and conditions, at the `$`", () => {
    expect(at(lines("function go() {", "  const [n] = $state(0)", "}"), "E110")).toEqual(["2:15"]);
    expect(at(lines("function C() {", "  const f = () => $memo(() => 1, [])", "  return null", "}"), "E110")).toEqual(["2:19"]);
    expect(at(lines("function C() {", "  if (ok) {", "    const r = $ref(0)", "  }", "  return null", "}"), "E110")).toEqual(["3:15"]);
    expect(at(lines("function C() {", "  const v = ok ? $id() : null", "  return null", "}"), "E110")).toEqual(["2:18"]);
  });
  it("rejects a user hook called from an action", () => {
    expect(at(lines("function $useX() {", "  return 1", "}", "function go() {", "  return $useX()", "}"), "E110")).toEqual(["5:10"]);
  });
  it("accepts hooks in components (including W4 arrows) and hooks", () => {
    const src = lines(
      "function C() {",
      "  const [n, setN] = $state(0)",
      "  return Text(String(n))",
      "}",
      "const D = () => {",
      "  const r = $ref(0)",
      "  return null",
      "}",
      "function $useX() {",
      "  const [v] = $state(1)",
      "  return v",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E111 — a component used as a value", () => {
  it("rejects a PascalCase call in a value position", () => {
    const found = diagnose(lines("function Fmt(n) {", "  return Text(String(n))", "}", 'const s = "x" + Fmt(1)'));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E111@4:17"]);
    expect(found[0]!.message).toBe(
      "`Fmt` is a component (its name starts with a capital letter), so calling it produces a UI node, not a value. " +
        "Rename the helper to camelCase (`fmt`).",
    );
  });
  it("rejects a PascalCase function returning a plain value", () => {
    expect(at(lines("function Double(n) {", "  return n * 2", "}"), "E111")).toEqual(["2:3"]);
    expect(at("const Label = (n) => `#${n}`", "E111")).toEqual(["1:22"]);
  });
  it("accepts branches, `return null` and UI positions", () => {
    const src = lines(
      "function Card() {",
      '  return ok ? Text("a") : null',
      "}",
      "function Empty() {",
      "  return null",
      "}",
      "$app(Column([ok && Card(), Empty()]))",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E112 — names the runtime owns", () => {
  it("rejects a non-function binding named like a built-in component, and injected names", () => {
    const found = diagnose(lines("const Text = 1", "const route = 1", "function cleanup() {}"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E112@1:1", "E112@2:1", "E112@3:1"]);
    expect(found[0]!.message).toBe("`Text` is reserved by the Aktion runtime (it is the built-in `Text` component) — rename it.");
  });
  it("accepts wrapper components and `children` parameters", () => {
    const src = lines(
      "function Button(label) {",
      "  return Text(label)",
      "}",
      "const Card = (t) => Text(t)",
      "function Panel(children) {",
      "  return Column(children)",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E113 — block statements", () => {
  it("rejects `{ … }` that parses as an object literal", () => {
    expect(at(lines("function f() {", "  { foo }", "}"), "E113")).toEqual(["2:3"]);
  });
  it("accepts object literals in expressions", () => {
    expect(diagnose(lines("const foo = 1", "const o = { foo }"))).toEqual([]);
  });
});

describe("E114 — a derived atom that is also assigned", () => {
  it("rejects it at the declaration", () => {
    const found = diagnose(lines("let $items = [1]", "let $total = $items.length", "function reset() {", "  $total = 5", "}"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E114@2:1"]);
  });
  it("accepts a derived atom nobody assigns, and factory arguments", () => {
    const src = lines(
      "let $items = [1]",
      "let $id = 1",
      "let $total = $items.length",
      'let $res = $http({ url: "/x/" + $id })',
      "function next() {",
      "  $id = $id + 1",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E115 — compiler-reserved names", () => {
  it("rejects `__a<n>_` / `__l<n>_` names, plain or `$`", () => {
    expect(at(lines("const __a1_x = 1", "let $__l2_y = 0", "function f(__l9_z) { return __l9_z }"), "E115")).toEqual([
      "1:1",
      "2:1",
      "3:1",
    ]);
  });
  it("accepts look-alikes", () => {
    expect(diagnose(lines("const __ok = 1", "const _a1_x = 2", "const __a_x = 3"))).toEqual([]);
  });
});

describe("E117 — spreads in a library component's props", () => {
  it("rejects the spread", () => {
    expect(at(lines('const extra = { size: "sm" }', '$app(Button("Go", { ...extra, variant: "primary" }))'), "E117")).toEqual(["2:24"]);
  });
  it("accepts explicit props and spreads into user components", () => {
    const src = lines(
      'const extra = { size: "sm" }',
      "function Card(props) {",
      "  return Text(props.size)",
      "}",
      '$app(Column([Button("Go", { size: extra.size }), Card({ ...extra })]))',
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E118 — `$app` outside the module top level", () => {
  it("rejects nested `$app(…)`", () => {
    expect(at(lines("function f() {", '  return $app(Text("x"))', "}"), "E118")).toEqual(["2:10"]);
    expect(at('const root = $app(Text("x"))', "E118")).toEqual(["1:14"]);
  });
  it("accepts a top-level `$app(…)`, also as `export default`", () => {
    expect(diagnose('$app(Text("x"))')).toEqual([]);
    expect(diagnose('export default $app(Text("x"))')).toEqual([]);
  });
});

describe("E119 / E120 — `$effect` arguments Aktion ignores", () => {
  it("E119: a callback that is not an inline function", () => {
    const found = diagnose(lines("function load() {}", '$effect(load, ["mount"])'));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E119@2:9"]);
    expect(found[0]!.message).toBe(
      "Pass the effect body inline: `$effect(() => load(), [...])` — Aktion only runs an inline function here.",
    );
  });
  it("E120: dependencies that are not an array literal", () => {
    expect(at(lines("function load() {}", 'const deps = ["mount"]', "$effect(() => load(), deps)"), "E120")).toEqual(["3:23"]);
  });
  it("accepts inline arrows, function expressions and array literals", () => {
    const src = lines(
      "let $q = 1",
      "function load() {}",
      '$effect(() => load(), ["mount"])',
      "$effect(function () { load() }, [$q])",
      "$effect(() => load())",
    );
    expect(diagnose(src)).toEqual([]);
  });
  it("leaves `.aktion` effects alone", () => {
    expect(aktionFrontend.compile('$effect(load, ["mount"])', "/m.aktion").diagnostics).toEqual([]);
  });
});

describe("E121 — returning a cleanup function from an effect", () => {
  it("rejects `return <expr>` in an effect body", () => {
    const src = lines(
      "function tick() {}",
      "$effect(() => {",
      "  const id = setInterval(tick, 1000)",
      "  return () => clearInterval(id)",
      '}, ["mount"])',
    );
    expect(at(src, "E121")).toEqual(["4:3"]);
  });
  it("accepts `cleanup(…)`, a bare `return`, and returns inside callbacks", () => {
    const src = lines(
      "function tick() {}",
      "$effect(() => {",
      "  const id = setInterval(tick, 1000)",
      "  cleanup(() => clearInterval(id))",
      "  const pick = (x) => { return x }",
      "  if (!id) return",
      '}, ["mount"])',
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E124 — destructuring a `$store` / `$form` handle", () => {
  it("S39: a declaration from a handle binding, a `$` atom, or the factory call", () => {
    const found = diagnose(lines("const cart = $store({ count: 1 })", "const { count } = cart"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E124@2:1"]);
    expect(found[0]!.message).toBe(
      "Destructuring a `$store`/`$form` handle reads `undefined` in Aktion — read the fields as `cart.count`.",
    );
    expect(at(lines("let $cart = $store({ count: 1 })", "function f() {", "  const { count } = $cart", "}"), "E124")).toEqual(["3:3"]);
    expect(at('const { name } = $form({ name: "" })', "E124")).toEqual(["1:1"]);
  });
  it("a handle passed to a destructuring parameter", () => {
    const src = lines(
      "const cart = $store({ count: 1 })",
      "function Show({ count }) {",
      "  return Text(String(count))",
      "}",
      "$app(Show(cart))",
    );
    expect(at(src, "E124")).toEqual(["5:11"]);
  });
  it("accepts member reads", () => {
    expect(diagnose(lines("const cart = $store({ count: 1 })", "const n = cart.count", "const { a } = { a: 1 }"))).toEqual([]);
  });
});

describe("E125 — assignment to an undeclared name", () => {
  it("rejects plain and `$` names", () => {
    const found = diagnose(lines("function go() {", "  total = 1", "}", "$count = 0"));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E125@2:9", "E125@4:8"]);
    expect(found[1]!.message).toBe(
      "`$count` is not declared — declare it with `let` (state: `let $count = …` at module level or at the top of " +
        "the component body).",
    );
  });
  it("accepts declared names and imports", () => {
    const src = lines(
      'import { $shared } from "./s.aktion"',
      "let $count = 0",
      "function go() {",
      "  let total = 0",
      "  total = total + 1",
      "  $count = total",
      "  $shared = 1",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("E126 — components and hooks declared inside functions", () => {
  it("rejects them", () => {
    expect(at(lines("function Outer() {", '  function Inner() { return Text("x") }', "  return Inner()", "}"), "E126")).toEqual(["2:3"]);
    expect(at(lines("function Outer() {", "  function $useX() { return 1 }", "  return null", "}"), "E126")).toEqual(["2:3"]);
  });
  it("accepts nested camelCase functions", () => {
    expect(diagnose(lines("function Outer() {", "  function helper() { return 1 }", "  return Text(String(helper()))", "}"))).toEqual([]);
  });
});

describe("W201 — render-unstable module-level initializers", () => {
  it("warns for clocks, randomness, crypto and fetch", () => {
    const found = diagnose(lines("const now = Date.now()", "const id = crypto.randomUUID()", "const d = new Date()", 'const r = fetch("/x")'));
    expect(found.map((d) => `${d.code}@${d.line}:${d.column}:${d.severity}`)).toEqual([
      "W201@1:1:warning",
      "W201@2:1:warning",
      "W201@3:1:warning",
      "W201@4:1:warning",
    ]);
    expect(found[1]!.message).toBe(
      "`id` calls `crypto.randomUUID()`, and Aktion re-evaluates module-level bindings on every render. Use " +
        "`$state(…)`/`$memo(…)` in a component, or compute it in an effect or action.",
    );
  });
  it("accepts the same calls inside functions and lambdas", () => {
    expect(diagnose(lines("function f() {", "  const now = Date.now()", "  return now", "}", "const g = () => Math.random()"))).toEqual([]);
  });
});

describe("W202 — a state-writing function called while rendering", () => {
  it("warns at render-time calls from a component body or module level", () => {
    const src = lines("let $n = 0", "function init() {", "  $n = 1", "}", "function C() {", "  init()", '  return Text("x")', "}", "init()");
    expect(at(src, "W202")).toEqual(["6:3", "9:1"]);
  });
  it("accepts calls from handlers and effects", () => {
    const src = lines(
      "let $n = 0",
      "function init() {",
      "  $n = 1",
      "}",
      "function C() {",
      '  return Button("x", { onClick: () => init() })',
      "}",
      '$effect(() => init(), ["mount"])',
    );
    expect(diagnose(src)).toEqual([]);
  });
});

describe("pipeline", () => {
  it("does not lower a rejected module", () => {
    const result = javascriptFrontend.compile(lines("function go() {", "  let x = 1", "  var y = 2", "}"), "/m.aktion.js");
    expect(result.diagnostics.map((d) => d.code)).toEqual(["E104"]);
    expect(JSON.stringify(result.program)).not.toContain("__l");
  });

  it("never runs on `.aktion` modules", () => {
    const result = aktionFrontend.compile(lines("var x = 1", "async function go() { await save() }"), "/m.aktion");
    expect(result.diagnostics).toEqual([]);
  });

  it("checkJavaScriptSemantics is pure and sets path + code", () => {
    const program = normalizeComponentForms(parse("var x = 1"));
    const before = JSON.stringify(program);
    const found = checkJavaScriptSemantics(program, "/x.aktion.js");
    expect(found).toEqual([
      {
        severity: "error",
        message: "`var` is not supported in Aktion modules — use `let` or `const`.",
        line: 1,
        column: 1,
        path: "/x.aktion.js",
        code: "E104",
      },
    ]);
    expect(JSON.stringify(program)).toBe(before);
  });
});
