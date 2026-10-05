// Negative corpus for the aktion-runtime/dsl declarations. Deliberately NOT named
// `*.aktion.ts`: it is a type-level fixture, not a program, so repo sweeps over
// Aktion modules must not pick it up.
//
// Every case is ONE line, preceded by a directive in this exact form:
//
//   // @ts-expect-error <TS code> [<layer>] <why>
//
// tests/dsl-types.test.ts compiles the file as-is (each directive must be used)
// and again with the directives blanked, asserting each case line fails with
// exactly the annotated code and no other line fails. The optional layer tag
// says which Aktion layer ALSO rejects the line on its own — checked by parsing
// and validating the line as a standalone program:
//   [validator]  validateProgramSchema reports an error
//   [parser]     parse() reports an error
//   [types]      only the types reject it (the runtime accepts it, usually with a
//                surprising result — the types are deliberately stricter)
// Untagged cases depend on declarations above them and are not checked standalone.
import {
  $app, $effect, $form, $http, $mutation, $query, $state, $store, $theme, $util,
  Async, Badge, Button, Card, Column, MenuSeparator, Row, Select, Text,
} from "aktion-runtime/dsl";

// ---- components -------------------------------------------------------------
// @ts-expect-error TS2769 [validator] unknown prop (a misspelt `variant`)
Button("Go", { varient: "danger" });
// @ts-expect-error TS2769 [validator] enum mismatch
Button("Go", { variant: "magic" });
// @ts-expect-error TS2769 [validator] enum mismatch on an aliased prop (`tone` → `variant`)
Card([Text("x")], { tone: "nope" });
// @ts-expect-error TS2345 [validator] a zero-prop component takes no positionals
MenuSeparator("x");
// @ts-expect-error TS2769 [validator] an object where a string slot is expected
Text({ foo: 1 });
// @ts-expect-error TS2769 [types] booleans render as the text "true"/"false" (`cond && X` is a bug)
Column([1 > 2 && Text("x")]);
// @ts-expect-error TS2769 [types] a boolean child is printed as text
Row([Text("a"), true]);
// @ts-expect-error TS2769 [types] "primary" binds to the 2nd slot (`onClick`), not `variant`
Button("Save", "primary");
// @ts-expect-error TS2345 [types] .map(Badge) passes (item, index, array): the index lands in `tone`
Row(["a", "b"].map(Badge));
// @ts-expect-error TS2769 [types] the positional slot's prop may not be repeated in the bag
Button("A", { label: "B" });
// @ts-expect-error TS2769 [types] required prop `items` is missing
Select("country", { label: "Country" });
// @ts-expect-error TS2345 [types] … also when the bag is omitted
Select("country");
// @ts-expect-error TS2769 [types] a required prop spelt twice (canonical + alias) — exactly one spelling
Column({ children: [Text("a")], child: Text("b") });
// @ts-expect-error TS2769 [types] the named props must be the LAST argument
Button("Go", { onClick: () => {} }, "primary");

// ---- $app ---------------------------------------------------------------------
// @ts-expect-error TS2345 [validator] a bare string root is not renderable
$app("hello");

// ---- $effect ---------------------------------------------------------------------
// @ts-expect-error TS2322 [parser] a string that is not a trigger
$effect(() => {}, ["evry(1000)"]);
// @ts-expect-error TS2322 [parser] intervals are whole milliseconds
$effect(() => {}, ["every(1.5)"]);
// @ts-expect-error TS2820 [parser] lifecycle triggers are lower-case (tsc suggests "mount")
$effect(() => {}, ["Mount"]);
// @ts-expect-error TS2345 [types] the body must be a function
$effect("mount");

// ---- hooks ------------------------------------------------------------------------
export function Counter() {
  const [count, setCount] = $state(0);
  // @ts-expect-error TS2345 the setter keeps the state's type
  setCount("one");
  // @ts-expect-error TS2345 … and so does an updater
  setCount((c) => `${c}`);
  return Text(count);
}

// ---- data -------------------------------------------------------------------------
const users = $http<{ id: number }[]>({ url: "/api/users" });
// @ts-expect-error TS18048 `data` is undefined until the first response
users.data.length;
// @ts-expect-error TS2345 [types] a config without `url`
$http({ method: "GET" });
// @ts-expect-error TS2322 [types] unknown method
$http({ url: "/x", method: "FETCH" });
// @ts-expect-error TS2339 [types] a plain $query has no `loadMore` (only `infinite: {…}` adds it)
$query({ url: "/x" }).loadMore();
// @ts-expect-error TS2322 [types] $mutation takes write methods only
$mutation({ url: "/x", method: "GET" });

// ---- $store / $form -----------------------------------------------------------------
const counter = $store({ n: 0, inc: (s) => { s.n = s.n + 1; } });
// @ts-expect-error TS2322 store fields keep their type
counter.n = "x";
// @ts-expect-error TS2554 methods are pre-bound: the handle parameter is not passed
counter.inc(1);
// @ts-expect-error TS2339 no `history` → no undo
counter.undo();
const signup = $form({ values: { email: "" } });
// @ts-expect-error TS2345 unknown field name
signup.field("nope");

// ---- namespaces / theme ------------------------------------------------------------
// @ts-expect-error TS2551 [types] not a $util member (tsc suggests `format`)
$util.formatt(1);
// @ts-expect-error TS2322 [types] not a built-in theme name
$theme({ name: "solarized" });
