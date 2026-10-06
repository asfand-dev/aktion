// Negative corpus for the editor, layout, content, extras and motion components.
// Directive format and layer tags: see negative.dsl.ts.
import {
  AspectRatio, Bento, BentoCell, Box, Button, Callout, ContextMenu, MultiStepForm, RichTextEditor, StackItem,
  Steps, TabItem, Tabs, TagInput, Text,
} from "aktion-runtime/dsl";

// @ts-expect-error TS2339 [types] TagInput's onFocus receives the tag array, not the draft string
TagInput("t", { onFocus: (tags) => tags.trim() });
// @ts-expect-error TS2769 [types] ContextMenu ignores component nodes other than MenuItem / MenuSeparator
ContextMenu(Text("t"), [Button("Not a row")]);
// @ts-expect-error TS2769 [types] ContextMenu ignores a bare string item
ContextMenu(Text("t"), ["Copy"]);
// @ts-expect-error TS2769 [types] a ContextMenu row role is one of the menu-item roles
ContextMenu(Text("t"), [{ label: "Copy", role: "button" }]);
// @ts-expect-error TS2769 [types] Tabs items are TabItem nodes (or holes), not arbitrary nodes
Tabs([TabItem("a", "A", [Text("x")]), Text("not a tab")]);
// @ts-expect-error TS2769 [types] a `true` step is printed as the title "true"
Steps([{ title: "A" }, true]);
// @ts-expect-error TS2769 [types] a ratio is `w:h`, `w/h` or a number
AspectRatio("4-3", [Text("x")]);
// @ts-expect-error TS2769 [types] a boolean flex-basis reaches CSS as `flex-basis:true`
StackItem(Text("x"), { basis: true });
// @ts-expect-error TS2769 [types] `icon: true` renders the glyph "fa-true"; only `false` hides the icon
Callout("x", { icon: true });
// @ts-expect-error TS2769 [types] a CSS length is a string or a number of px
RichTextEditor("r", { minHeight: true });
// @ts-expect-error TS2769 [types] a responsive row height is a map of lengths
Bento([BentoCell(Text("a"))], { rowHeight: { base: true } });
// @ts-expect-error TS2769 [validator] stepsLayout is column / row (or vertical / horizontal)
MultiStepForm([{ title: "A" }], 0, { stepsLayout: "diagonal" });
// @ts-expect-error TS2769 [validator] radius is a size token (legacy spellings included) or none / pill
Box([Text("x")], { radius: "huge" });
