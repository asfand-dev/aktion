// Positive fixture for round 2 of the library fixes: the field-shell
// `optional` marker on every field-shell component, and the generic item
// callbacks with an empty list. Nothing here is expected to fail.
import {
  ActivityLog, Calendar, CalendarView, CodeEditor, ColorPicker, DateTimePicker, DrawingCanvas, Gallery,
  InlineEdit, MaskedInput, MentionInput, NotificationBell, PasswordInput, PinInput, PresenceAvatars,
  RichTextEditor, SignaturePad, TagInput, TimePicker,
  type Children,
} from "aktion-runtime/dsl";

export let $title = "";
export let $date = "";

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

// ---- an empty list still types the item callbacks -------------------------------
// The item type is inferred from the list, and `[]` infers `never`: the
// callback falls back to the component's default item type instead.

export function EmptyLists(): Children {
  return [
    ActivityLog([], { onItemClick: (_index, item) => { $title = String(item.title); } }),
    CalendarView({ events: [], onEventClick: (_id, event) => { $date = event.date; } }),
    Calendar({ events: [], onEventClick: (event) => { $date = event.date; } }),
    PresenceAvatars([], { onClick: (person) => { $title = person.name; } }),
    NotificationBell(0, { items: [], onItemClick: (item) => { $title = String(item.title); } }),
    Gallery([], { onSelect: (_index, item) => { $title = typeof item === "string" ? item : "src" in item ? item.src : ""; } }),
  ];
}
