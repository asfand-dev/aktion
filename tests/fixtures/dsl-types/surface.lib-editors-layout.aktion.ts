// Positive fixture for the editor, layout, content, extras and motion
// components: CSS lengths as plain numbers where the prop goes through
// `sanitiseCssLength`, legacy size spellings the renderer canonicalises, and
// the item shapes the renderers accept (holes, nodes, checkable menu rows).
// Everything here must type-check.
import {
  AspectRatio, BadgeList, Bento, BentoCell, BottomSheet, Box, Callout, Center, CodeBlock, CodeEditor,
  ContextMenu, Container, Draggable, DropZone, Grid, GridItem, Icon, Image, Lottie, MenuItem, MenuSeparator,
  Modal, MultiStepForm, PresenceAvatars, ReadingProgress, RichTextEditor, ScrollArea, ScrollSpy, Sheet, Split,
  StackItem, Steps, Svg, TabItem, Tabs, TagInput, Text, TimePicker,
  type AktionNode, type Children,
} from "aktion-runtime/dsl";

export let $admin = false;
export let $wrap = false;
export let $open = false;

function Cell(label: string): AktionNode<"GridItem"> {
  return GridItem(Text(label), { span: 6 });
}

export function Lengths(): Children {
  return [
    RichTextEditor("rte", { minHeight: 160, maxHeight: "40vh" }),
    CodeEditor("ce", { minHeight: 200, maxHeight: 400 }),
    StackItem(Text("x"), { basis: 240, minWidth: 120, maxWidth: "50%" }),
    StackItem(Text("y"), { basis: "auto" }),
    Center([Text("x")], { minHeight: 400 }),
    Box([Text("x")], { maxWidth: 640 }),
    Grid([Text("x")], { minChildWidth: 240 }),
    ScrollArea([Text("x")], { maxHeight: 320, height: 200 }),
    Container([Text("x")], { maxWidth: 960 }),
    CodeBlock("const x = 1", { width: 300, height: 120 }),
    Split(Text("a"), { right: Text("b"), sticky: "left", stickyOffset: 64 }),
    ReadingProgress({ height: 4 }),
    Bento([BentoCell(Text("a"))], { rowHeight: 180 }),
    Bento([BentoCell(Text("b"))], { rowHeight: { base: 220, md: "180px" } }),
    BottomSheet([Text("x")], { open: $open, height: 400 }),
    Sheet([Text("x")], { open: $open, width: 480 }),
    Lottie({ src: "https://example.com/a.json", width: 200, height: "12rem" }),
    ScrollSpy([{ label: "Intro", id: "intro.part" }], { top: 16 }),
  ];
}

export function LegacySizes(): Children {
  return [
    Box([Text("x")], { radius: "small" }),
    Icon("house", { size: "s" }),
    PresenceAvatars([{ name: "Ada" }], { size: "large" }),
    Modal("Title", { open: $open, size: "large", children: [Text("body")] }),
  ];
}

export function Items(): Children {
  return [
    Steps([
      { title: "A", complete: true },
      $admin ? { title: "Admin" } : null,
      $admin && { title: "Also admin" },
      Text("a node renders as-is"),
      "Title only",
    ]),
    Tabs([TabItem("a", "A", [Text("x")]), $admin ? TabItem("b", "B", [Text("y")]) : null]),
    Grid([Cell("a"), Cell("b")]),
    BadgeList(["a", null, "c"], { tones: ["success", null, "warning"], icons: [null, null, "house"] }),
    AspectRatio("4/3", [Text("x")]),
    AspectRatio(1.5, [Text("x")]),
    Image("https://example.com/a.png", { ratio: "16/9" }),
    ContextMenu(Text("target"), [
      MenuItem("Wrap lines", { onClick: () => { $wrap = !$wrap; }, checked: $wrap, keepOpen: true }),
      { label: "Delete", tone: "danger", onClick: () => {} },
      { label: "Sort ascending", role: "menuitemradio", checked: true },
      { label: "Legacy", action: () => {} },
      $admin && { label: "Admin only", onClick: () => {} },
      MenuSeparator(),
      { separator: true },
    ]),
    Callout("Heads up", { icon: false }),
    Svg("<path d='M0 0h48v48H0z'/>", { viewBox: "0,0,48,48" }),
  ];
}

export function Callbacks(): Children {
  return [
    TagInput("tags", { onFocus: (tags) => { const count: number = tags.length; void count; } }),
    TimePicker("t", { step: "any", onChange: $admin ? (value) => { const v: string = value; void v; } : null }),
    MultiStepForm([{ title: "A", content: Text("a") }], 0, { stepsLayout: "horizontal" }),
    Draggable(Text("drag"), { data: { id: 7 }, onDragStart: (data) => { const id: number = data.id; void id; } }),
    DropZone({ label: "drop", onDrop: (data) => { void data; } }),
  ];
}
