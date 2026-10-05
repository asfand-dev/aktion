// Negative corpus for round 2 of the library fixes (the optional marker).
// Directive format and layer tags: see negative.dsl.ts.
import {
  PinInput, SignaturePad, TagInput,
} from "aktion-runtime/dsl";

// ---- the optional marker -------------------------------------------------------------
// @ts-expect-error TS2769 [types] a number is not a marker (it renders nothing)
PinInput("pin", { label: "PIN", optional: 1 });
// @ts-expect-error TS2769 [types] … on TagInput either
TagInput("tags", { label: "Tags", optional: 0 });
// @ts-expect-error TS2769 [types] … nor on a pad
SignaturePad({ label: "Signature", optional: 2 });
