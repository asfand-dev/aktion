// Negative corpus for the feedback / menu / navigation / marketing / media
// components. Format and layer tags: see the header of negative.dsl.ts.
import {
  Breadcrumb, Button, CodeWindow, Display, DropdownMenu, HoverCard, ProductCard, Section,
  SegmentedControl, Text,
} from "aktion-runtime/dsl";

// ---- the size enums kept their canonical members (only legacy spellings were added) -----
// @ts-expect-error TS2769 [validator] not a Display size
Display("Ship faster", { size: "huge" });
// @ts-expect-error TS2769 [validator] not a Section width
Section([Text("band")], { width: "wide" });

// ---- CSS lengths take strings and numbers, nothing else ------------------------------------
// @ts-expect-error TS2769 [types] a boolean is not a CSS length
HoverCard(Text("@ada"), [Text("Profile")], { width: true });

// ---- marketing ------------------------------------------------------------------------------
// @ts-expect-error TS2769 [types] a boolean price renders as the text "true"
ProductCard("Shoe", { price: true });
// @ts-expect-error TS2769 [types] a boolean code renders as the text "true"
CodeWindow(true);
// @ts-expect-error TS2769 numeric options emit numbers, so a string handler is wrong (TS annotation: not standalone Aktion)
SegmentedControl([{ value: 1, label: "One" }], { onChange: (value: string) => value.length });

// ---- menus and trails --------------------------------------------------------------------------
// @ts-expect-error TS2769 [types] `tone` on an object item is a MenuItem variant
DropdownMenu(Button("Actions"), [{ label: "Delete", tone: "warning" }]);
// @ts-expect-error TS2769 [types] a crumb is a BreadcrumbItem, a string or a {label} record
Breadcrumb([Text("Docs")]);
