// Positive fixture for round 2 of the library fixes: icon-name props typed
// `AktionIconName`, the field-shell `optional` marker on every field-shell
// component, and the generic item callbacks with an empty list. Nothing here
// is expected to fail.
import {
  ActivityLog, BadgeList, Breadcrumb, BreadcrumbItem, Button, Calendar, CalendarView, Callout, CodeEditor,
  ColorPicker, ContextMenu, DateTimePicker, DrawingCanvas, DropdownMenu, FloatingActionButton, Gallery, Icon,
  IconButton, Image, InlineEdit, MaskedInput, MentionInput, NotificationBell, PasswordInput, PinInput,
  PresenceAvatars, Rating, RichTextEditor, SegmentedControl, SignaturePad, SpeedDial, StatCard, TabBar,
  TabItem, Tabs, TagInput, Text, TimePicker, ToggleGroup,
  type AktionIconName, type Children,
} from "aktion-runtime/dsl";

export let $title = "";
export let $date = "";

// ---- icon names: a Font Awesome name, a style-prefixed one, or text -----------

const brand: AktionIconName = "brands:github";

export function Icons(): Children {
  return [
    Icon("house"),
    Icon(brand, { label: "GitHub" }),
    Icon("regular:star"),
    Button("Save", { icon: "floppy-disk" }),
    IconButton("gear", { label: "Settings" }),
    FloatingActionButton("plus", { label: "New" }),
    Image("/missing.png", { fallback: "image" }),
    Image("/missing.png", { fallback: "Image unavailable" }),
    // `false` hides the icon; "none" turns StatCard's guess off.
    Callout("Saved", { icon: false }),
    Callout("Saved", { icon: "circle-check" }),
    StatCard("Users", { value: 12, icon: "none" }),
    StatCard("Users", { value: 12, icon: false }),
    Breadcrumb(["Home", "Docs"], { homeIcon: false }),
    Breadcrumb([{ label: "Home", to: "/", icon: "house" }, "Docs"], { homeIcon: "compass" }),
    BreadcrumbItem("Home", { to: "/", icon: "house" }),
    Rating({ value: 3, icon: "heart" }),
    Rating({ value: 3, icon: "regular:circle" }),
    BadgeList(["a", "b"], { icons: ["star", null] }),
    ToggleGroup("view", { items: [["grid", "Grid", "table-cells"], { value: "list", icon: "list" }] }),
    SegmentedControl([{ value: "a", label: "A", icon: "bolt" }]),
    Tabs([TabItem("a", "A", [Text("Body")], { icon: "house" })]),
    TabBar([{ id: "home", label: "Home", icon: "house" }]),
    SpeedDial({ actions: [{ label: "Share", icon: "share" }] }),
    DropdownMenu(Button("Menu"), [{ label: "Delete", icon: "trash", tone: "danger" }]),
    ContextMenu(Text("target"), [{ label: "Copy", icon: "copy" }]),
  ];
}

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
