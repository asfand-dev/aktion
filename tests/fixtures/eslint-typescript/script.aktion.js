// Lint fixture for `aktion/props-literal` in a `.aktion.js` module, typed
// through JSDoc and `checkJs` (see ./tsconfig.json).
import { Button } from "aktion-runtime/dsl";

/** @type {import("aktion-runtime/dsl").ButtonNamed} */
const opts = { variant: "primary" };

export const inline = Button("Save", { variant: "primary" });
export const fromVariable = Button("Save", opts); // expect: propsNotLiteral
export const spread = Button("Save", { ...opts }); // expect: propsSpread
