// Lint fixture for `aktion/props-literal` (tests/eslint-generated-dsl.test.ts):
// every call here has a type error on purpose (TS2769, no overload matches),
// so TypeScript resolves it to a signature built for the error message. The
// rule must not add a misleading second report to the arguments the runtime
// binds positionally, and must still report a props object in a variable.
import { Button, Text, VirtualList } from "aktion-runtime/dsl";

const variant: string = "primary";
const save = (): void => {};

// Silent: positional handlers and values.
export const handlerAndBag = Button("Save", save, { variant });
export const positionalVariant = Text("Saved", variant);
// Generic overloads fail differently (TypeScript keeps the first overload
// long enough for the call), but the handler is still positional.
export const genericHandler = VirtualList([1, 2], (n: number) => Text(String(n)));

// Reported: the props object is not written at the call site.
const looseOpts = { variant, onClick: save };
export const trailingVariable = Button("Save", looseOpts); // expect: propsNotLiteral
export const wholeProps = Button({ label: "Save", ...looseOpts }); // expect: propsSpread
