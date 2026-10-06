// Positive fixture for the form components (src/library/components/forms.ts)
// and the legacy size spellings the renderer canonicalises. Nothing here is
// expected to fail.
import {
  Avatar, Button, ButtonGroup, Checkbox, Column, Combobox, DatePicker, DateRangePicker, FileUpload,
  FormControl, Input, InputGroup, MultiSelect, NumberInput, Select, Slider, Text,
  type AktionNode,
} from "aktion-runtime/dsl";

export let $owner = "";
export let $tags: string[] = [];
export let $lastBlur: string | string[] = "";

// ---- legacy size spellings: accepted, and rendered as their canonical form ---

export function Sizes(): AktionNode {
  return Column([
    Button("Small", { size: "s" }),
    Button("Large", { size: "l" }),
    Button("Normal", { size: "normal" }),
    ButtonGroup([Button("A"), Button("B")], { size: "small" }),
    ButtonGroup([Button("A")], { size: "m" }),
    Avatar("Ada Lovelace", { size: "large" }),
  ]);
}

// ---- the optional marker -----------------------------------------------------

export function Optional(required: boolean): AktionNode {
  return Column([
    Input("a", { label: "Name", optional: false }),
    Input("b", { label: "Nickname", optional: !required, required }),
    Input("c", { label: "Nom", optional: "(facultatif)" }),
    FormControl("Notes", Input("d"), { optional: true }),
    Checkbox("news", "Send me news", { optional: true }),
    Slider("vol", { label: "Volume", optional: true }),
    DatePicker("start", { label: "Start", optional: false }),
    DateRangePicker("period", { label: "Period", optional: "optional" }),
  ]);
}

// ---- validations: the object form -------------------------------------------

export function Validations(strict: boolean): AktionNode {
  return Column([
    Input("email", { validations: { required: true, email: true, minLength: 3 } }),
    Input("age", { type: "number", validations: { required: strict, min: 0, max: 120 } }),
    Input("code", { validations: { pattern: strict ? "[A-Z]{3}" : false, maxLength: null } }),
    Input("legacy", { validations: ["required", "minLength:2", "email"] }),
  ]);
}

// ---- InputGroup / ButtonGroup / searchable Select ------------------------------

export function Groups(): AktionNode {
  return Column([
    InputGroup(Input("q"), { name: "query", icon: "search", onBlur: (value) => { $lastBlur = value; } }),
    InputGroup(Combobox("owner", { items: ["ada", "grace"], value: $owner }), {
      onFocus: (value: string | string[]) => { $lastBlur = value; },
    }),
    InputGroup(MultiSelect("tags", { items: ["a", "b"], value: $tags }), {
      onBlur: (value) => { $lastBlur = Array.isArray(value) ? value.join(",") : value; },
    }),
    NumberInput("qty", { name: "quantity" }),
    Text("Time range", { id: "range-heading" }),
    ButtonGroup([Button("Day"), Button("Week")], { ariaLabelledBy: "range-heading" }),
    ButtonGroup([Button("Day")], { ariaLabel: "Time range" }),
    Select("owner2", {
      items: ["ada", "grace"],
      searchable: true,
      label: "Owner",
      warning: "Careful",
      description: "Who owns it",
      optional: true,
      invalid: false,
      describedBy: "owner-help",
    }),
  ]);
}

// ---- FileUpload: the pick is an array ------------------------------------------

export function Upload(): AktionNode {
  return FileUpload("files", {
    multiple: true,
    onSelect: (files) => {
      $lastBlur = files.map((file) => file.name);
    },
  });
}
