// Lint fixture for `aktion/props-literal` (tests/eslint-generated-dsl.test.ts):
// arguments typed `any` in a `.aktion.ts` module. `any` satisfies every
// overload, so each call resolves to the first one, which takes the second
// argument as `props`; nothing says the value holds props, and the runtime
// binds a non-literal positionally. Type-checks cleanly.
import { Button, DescriptionItem } from "aktion-runtime/dsl";

// Silent: an `any` argument, where the first overload has `props`.
export function Save(onSave: any) { return Button("Save", onSave); }
export function Detail(d: any) { return DescriptionItem("Path", d.path); }

// Reported: a typed props object in a variable, on the same overload.
const opts = { variant: "primary" as const };
export const typedBag = Button("Save", opts); // expect: propsNotLiteral
