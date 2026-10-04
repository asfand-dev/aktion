// Lint fixture for `aktion/props-literal` (tests/eslint-typescript.test.ts).
// A line the rule must report ends in `// expect:` plus one message id per
// report; every other line must stay silent. The reported lines are Aktion
// mistakes on purpose — this module is linted, never compiled or rendered.
import {
  Button,
  Column,
  PriceBadge,
  Text,
  Toolbar,
  type ButtonNamed,
  type ButtonProps,
  type ColumnOptions,
  type PriceBadgeNamed,
  type ToolbarNamed,
} from "aktion-runtime/dsl";

export let $wide = false;

const opts: ButtonNamed = { variant: "primary" };
const extra: ButtonNamed = { disabled: true };
const full: ButtonProps = { label: "Save", variant: "ghost" };
const layout: ColumnOptions = { gap: 8 };
const priceOpts: PriceBadgeNamed = { currency: "USD" };
const toolbarOpts: ToolbarNamed = { sticky: true };
const rest: [ButtonNamed] = [opts];
const onSave = (): void => {};

function makeProps(): ButtonNamed {
  return { variant: "secondary" };
}

function maybeProps(): ButtonNamed | undefined {
  return $wide ? opts : undefined;
}

function format(props: ButtonNamed): string {
  return String(props.variant);
}

// Silent: the props bag is an object literal written at the call site.
export const inline = Button("Save", { variant: "primary", onClick: onSave });
export const singleObject = Button({ label: "Save", variant: "secondary" });
export const leadingObject = Column({ children: [Text("a")], gap: 4 });
export const asConst = Button("Save", { variant: "primary" } as const);
export const satisfied = Button("Save", { variant: "primary" } satisfies ButtonNamed);
export const emptyBag = Button("Save", {});
export const hostInline = PriceBadge(9.99, { currency: "EUR" });
export const restInline = Toolbar("Title", { dense: true }, { sticky: true });

// Silent: no argument binds to a `props` parameter.
export const labelOnly = Button("Save");
export const handlerSlot = Button("Save", onSave);
export const handlerAndBag = Button("Save", onSave, { variant: "ghost" });
export const childrenSlot = Column([Text("a"), Text("b")]);
export const titleOnly = Toolbar("Title");

// Silent: not a component call (camelCase callee), or no `props` parameter.
export const helper = format(opts);
export const builtin = String(opts);

// Silent, a known gap: arguments from a spread argument on are not mapped.
export const spreadArgument = Button("Save", ...rest);

// Reported: the props bag is not an object literal.
export const fromVariable = Button("Save", opts); // expect: propsNotLiteral
export const singleVariable = Button(full); // expect: propsNotLiteral
export const leadingVariable = Column(layout); // expect: propsNotLiteral
export const afterHandler = Button("Save", onSave, opts); // expect: propsNotLiteral
export const conditional = Button("Save", $wide ? { variant: "primary" } : { variant: "ghost" }); // expect: propsNotLiteral
export const fromCall = Button("Save", makeProps()); // expect: propsNotLiteral
export const nonNull = Button("Save", maybeProps()!); // expect: propsNotLiteral
export const castVariable = Button("Save", opts as ButtonNamed); // expect: propsNotLiteral
export const hostVariable = PriceBadge(9.99, priceOpts); // expect: propsNotLiteral
export const restVariable = Toolbar("Title", { dense: true }, toolbarOpts); // expect: propsNotLiteral

// Reported: spread entries inside the literal are dropped.
export const spreadOnly = Button("Save", { ...extra }); // expect: propsSpread
export const spreadMixed = Button("Save", { variant: "primary", ...extra, ...opts }); // expect: propsSpread propsSpread
export const spreadSingleObject = Button({ label: "Save", ...extra }); // expect: propsSpread
export const spreadCast = Button("Save", { ...extra } as ButtonNamed); // expect: propsSpread
export const spreadRest = Toolbar("Title", { ...toolbarOpts }); // expect: propsSpread
