// Negative corpus for the form components (src/library/components/forms.ts).
// Directive format and layer tags: see negative.dsl.ts.
import {
  Button, ButtonGroup, Checkbox, FileUpload, FormControl, Input, InputGroup,
} from "aktion-runtime/dsl";

// ---- sizes -------------------------------------------------------------------
// @ts-expect-error TS2769 [validator] not a size, legacy or otherwise
Button("Go", { size: "huge" });
// @ts-expect-error TS2769 [validator] ButtonGroup has no xl (and so no legacy spelling of one)
ButtonGroup([Button("A")], { size: "xl" });

// ---- the optional marker -------------------------------------------------------
// @ts-expect-error TS2769 [types] a number is not a marker (it renders nothing)
Input("a", { label: "Name", optional: 1 });
// @ts-expect-error TS2769 [types] … on FormControl either
FormControl("Name", Input("b"), { optional: 0 });
// @ts-expect-error TS2769 [types] … nor on a control that renders its own label
Checkbox("news", "Send me news", { optional: 2 });

// ---- validations ---------------------------------------------------------------
// @ts-expect-error TS2769 [types] a flag is a boolean, not a string
Input("e", { validations: { required: "yes" } });
// @ts-expect-error TS2769 [types] `true` is a flag; a length needs its number
Input("e", { validations: { minLength: true } });

// ---- callbacks -----------------------------------------------------------------
// @ts-expect-error TS2769 InputGroup reports a string, or the selected values of a MultiSelect — never a number
InputGroup(Input("q"), { onBlur: (value: number) => value });
// @ts-expect-error TS2339 the pick is a File[]: there is no FileList.item()
FileUpload("f", { onSelect: (files) => files.item(0) });
