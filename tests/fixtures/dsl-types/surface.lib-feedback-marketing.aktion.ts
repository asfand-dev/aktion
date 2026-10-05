// Positive fixture for the feedback / menu / navigation / marketing / media
// components: the call forms their renderers accept. It must type-check with
// and without the DOM lib; nothing here is expected to fail.
import {
  BreadcrumbItem, Breadcrumb, BrowserFrame, Button, CodeWindow, CountdownTimer, Display, DropdownMenu,
  Heading, HoverCard, Map, MenuItem, OverlayItem, Popover, PriceTag, ProductCard, RelativeTime, Section,
  SegmentedControl, Terminal, Text, ThemeToggle, ToggleGroup,
  type AktionNode, type Children,
} from "aktion-runtime/dsl";

export let $count = 1;
export let $view = "grid";
export let $tab: "overview" | "settings" = "overview";

// ---- CSS lengths take a plain number (px) -------------------------------------

export function Lengths(): Children {
  return [
    HoverCard(Text("@ada"), [Text("Profile")], { width: 320 }),
    Popover(Button("Filters"), [Text("Body")], { width: 300 }),
    Map(52.52, { lng: 13.4, height: 240 }),
    OverlayItem(Text("New"), { offset: 8 }),
    CodeWindow("const a = 1", { height: 200, maxHeight: 400 }),
    Terminal(["$ npm test"], { height: 120, maxHeight: "40vh" }),
    BrowserFrame(Text("page"), { height: 300 }),
  ];
}

// ---- legacy size spellings stay accepted --------------------------------------

export function Sizes(): Children {
  return [
    Display("Ship faster", { size: "large" }),
    Heading("Pricing", { size: "l" }),
    Section([Text("band")], { width: "large" }),
  ];
}

// ---- marketing ---------------------------------------------------------------

export function Marketing(): Children {
  return [
    ProductCard("Shoe", { price: PriceTag(29, { period: "month" }) }),        // a custom price node
    ProductCard("Sock", { price: 9.5, compareAt: 12 }),
    CodeWindow(12345),                                                          // numbers coerce like any string slot
    ThemeToggle({ dark: "midnight" }),                                          // any theme names
    ThemeToggle("shadcn-light", "shadcn-dark"),
    CountdownTimer(new Date(2030, 0, 1), { onEnd: () => {} }),
    CountdownTimer(""),                                                         // still loading: shows `--`
    RelativeTime(new Date()),
  ];
}

export function Segments(): Children {
  return [
    // Option values keep their type: a number-typed $variable stays a number.
    SegmentedControl([{ value: 1, label: "One" }, { value: 2, label: "Two" }], {
      value: $count,
      onChange: (value) => { const next: number = value; $count = next; },
    }),
    // A union-typed $variable is inferred from the options.
    SegmentedControl(["overview", "settings"], { value: $tab, onChange: (value) => { $tab = value; } }),
    SegmentedControl(["a", "b"], { value: $view, onChange: (value: string) => { $view = value; } }),
  ];
}

// ---- ToggleGroup: the item list may be the only positional argument -------------

export function Toggles(): Children {
  return [
    ToggleGroup(["Day", "Week"]),
    ToggleGroup(["Day", "Week"], { value: $view, onChange: (value) => { $view = String(value); } }),
    ToggleGroup("view", ["grid", "list"], { value: $view }),
    ToggleGroup({ items: [{ value: 1, label: "One" }], value: $count }),
  ];
}

// ---- menus and trails ------------------------------------------------------------

function Crumb(label: string, to: string) {
  return BreadcrumbItem(label, { to });
}

function Archive(label: string): AktionNode<"MenuItem"> {
  return MenuItem(label, { onClick: () => {} });
}

export function Navigation(): Children {
  return [
    Breadcrumb([Crumb("Docs", "/docs"), "Here"], { onItemClick: (index, label) => { $view = `${index + 1}:${label}`; } }),
    DropdownMenu(Button("Actions"), [
      { label: "Delete", tone: "danger", onclick: () => {} },                  // MenuItem's alias spellings
      [[[[[{ label: "Deep", onClick: () => {} }]]]]],                            // nested arrays flatten to any depth
      Archive("Archive"),                                                        // the program's own item component
    ]),
  ];
}
