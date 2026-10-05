// Lint fixture for `aktion/props-literal` (tests/eslint-generated-dsl.test.ts):
// an untyped `.aktion.js` module, `allowJs` without `checkJs`. JavaScript
// widens `let $variant = "primary"` to `string`, so most calls below match no
// overload — with no error shown — and the rule must bind their arguments the
// way the runtime does, not the way TypeScript's error message does.
import { Button, Col, Column, DescriptionItem, SelectItem, Text } from "aktion-runtime/dsl";

export let $variant = "primary";
export let $count = 0;

function save() {
  $count = $count + 1;
}

const extra = { disabled: true };

// Silent: a handler and a variant are positional, here as at run time.
export const handlerAndBag = Button("Save", save, { variant: $variant });
export const positionalVariant = Text(`Saved ${$count}`, $variant);
export const handlerOnly = Button("Save", save);

// Silent: an untyped parameter is `any`, which the first overload accepts as
// `props`, but the runtime binds a non-literal positionally: `onSave` is the
// click handler and `d.path` the value (tests/eslint-props-literal-any.test.ts).
export function Save(onSave) { return Button("Save", onSave); }
export function Detail(d) { return DescriptionItem("Path", d.path); }
export function NameColumn(users) { return Col("Name", users.map((u) => u.name)); }
export function Option(m) { return SelectItem(m.value, m.label); }
export function Greeting(user) { return Text("Hello", user.variant); }

// Reported: a props object held in a variable is bound positionally.
const full = { label: "Save", variant: "primary", onClick: save };
export const wholeProps = Button(full); // expect: propsNotLiteral
const layout = { children: [Text("a")], gap: "md" };
export const wholeLayout = Column(layout); // expect: propsNotLiteral
const looseOpts = { variant: $variant };
export const trailingVariable = Button("Save", looseOpts); // expect: propsNotLiteral

// Reported: a spread in the bag of a call that matches no overload.
export const spreadBag = Button("Save", { variant: $variant, ...extra }); // expect: propsSpread
