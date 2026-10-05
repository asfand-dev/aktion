// Positive fixture for round 2 of the library fixes: the field-shell
// `optional` marker on every field-shell component. Nothing here is expected
// to fail.
import {
  CodeEditor, ColorPicker, DateTimePicker, DrawingCanvas, InlineEdit, MaskedInput, MentionInput,
  PasswordInput, PinInput, RichTextEditor, SignaturePad, TagInput, TimePicker,
  type Children,
} from "aktion-runtime/dsl";

// ---- the optional marker: `true`, a translation, or `false` -------------------

export function OptionalMarkers(required: boolean): Children {
  return [
    PinInput("pin", { label: "PIN", optional: true }),
    PasswordInput("pw", { label: "Password", optional: !required, required }),
    TagInput("tags", { label: "Tags", optional: "(facultatif)" }),
    MentionInput("m", { people: [], label: "Comment", optional: true }),
    TimePicker("t", { label: "Start", optional: false }),
    DateTimePicker("dt", { label: "When", optional: "optional" }),
    MaskedInput("phone", { mask: "999", label: "Phone", optional: true }),
    RichTextEditor("body", { label: "Body", optional: true }),
    CodeEditor("code", { label: "Code", optional: true }),
    ColorPicker("color", { label: "Colour", optional: true }),
    InlineEdit("Ada", { label: "Name", optional: true }),
    DrawingCanvas({ label: "Sketch", optional: true }),
    SignaturePad({ label: "Signature", optional: "(if you can)" }),
  ];
}
