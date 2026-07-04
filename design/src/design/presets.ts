/**
 * Curated presets: frame sizes, palette categorization rules, sensible
 * default props/children for commonly-dropped components, and the theme
 * editor's catalogs. Components without an entry still work — the inspector
 * derives editors from the live component schema.
 */
import type { DesignNode, PropValue } from "./types";
import { createNode } from "./document";

export interface FramePreset {
  name: string;
  width: number;
  height: number;
  group: "Desktop" | "Tablet" | "Phone" | "Social";
}

export const FRAME_PRESETS: FramePreset[] = [
  { name: "Desktop", width: 1440, height: 1024, group: "Desktop" },
  { name: "Laptop", width: 1280, height: 800, group: "Desktop" },
  { name: "Tablet portrait", width: 768, height: 1024, group: "Tablet" },
  { name: "Tablet landscape", width: 1024, height: 768, group: "Tablet" },
  { name: "iPhone 15 Pro", width: 393, height: 852, group: "Phone" },
  { name: "Android", width: 412, height: 915, group: "Phone" },
  { name: "Social post", width: 1080, height: 1080, group: "Social" },
  { name: "Social cover", width: 1500, height: 500, group: "Social" },
];

export interface CategoryRule {
  category: string;
  names?: string[];
  pattern?: RegExp;
  descPattern?: RegExp;
}

/** Order palette categories are presented in. */
export const CURATED_ORDER = [
  "Basics",
  "Layout",
  "Typography",
  "Forms",
  "Data",
  "Charts",
  "Navigation",
  "Feedback",
  "Media",
  "Marketing",
  "Commerce",
  "Chat & Realtime",
  "Scheduling",
  "Motion",
  "Accessibility",
  "Advanced",
  "Other",
];

/** First matching rule wins; explicit name lists beat patterns. */
export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Basics",
    names: [
      "Text", "Button", "Input", "Image", "Icon", "Card", "Badge", "Avatar",
      "Divider", "Link", "Heading", "Markdown", "Tag", "Chip",
    ],
  },
  {
    category: "Layout",
    names: [
      "Column", "Row", "Stack", "Grid", "Box", "Spacer", "Center", "Container",
      "AppShell", "Sidebar", "Split", "Bento", "Section", "Masonry", "AspectRatio",
      "Sticky", "ScrollArea", "Collapse", "Accordion", "Tabs", "Panel", "PageHeader",
      "Toolbar", "Group", "Flex", "Wrap",
    ],
  },
  {
    category: "Typography",
    names: [
      "GradientText", "Blockquote", "Code", "CodeBlock", "Kbd", "List", "ListItem",
      "Label", "Caption", "Prose", "Highlight", "TypewriterText",
    ],
  },
  {
    category: "Forms",
    pattern: /Input|Select|Checkbox|Radio|Switch|Slider|Form|Field|TextArea|Picker|Upload|Dropzone|Rating|Stepper|OTP|Combobox|Autocomplete|Search|Toggle|Editor$/,
  },
  {
    category: "Charts",
    pattern: /Chart|Sparkline|Gauge|Heatmap|Funnel|Treemap|Radar|Histogram|Candlestick/,
  },
  {
    category: "Data",
    pattern: /Table|Col$|DataGrid|Stat|KPI|Metric|Timeline|Tree$|TreeView|Kanban|VirtualList|VirtualGrid|Diff|JsonViewer|Property|DescriptionList|Comparison/,
  },
  {
    category: "Navigation",
    pattern: /Nav|Menu|Breadcrumb|Pagination|Steps|Tab$|SidebarItem|Drawer|CommandPalette|Dock|SpeedDial|Anchor|Link$/,
  },
  {
    category: "Feedback",
    pattern: /Alert|Toast|Progress|Spinner|Skeleton|Empty|Error|Loading|Banner|Modal|Dialog|Popover|Tooltip|Snackbar|Result|Notification|Confirm/,
  },
  {
    category: "Media",
    pattern: /Image|Video|Audio|Carousel|Gallery|Lightbox|Map$|QR|Barcode|Iframe|Embed|Logo|Figure|Canvas|Signature/,
  },
  {
    category: "Marketing",
    pattern: /Hero|Pricing|Feature|Testimonial|CTA|Faq|FAQ|Footer|Team|Brand|Newsletter|Announcement|Stats?Band|Reveal$|Marquee|Ribbon/,
  },
  {
    category: "Commerce",
    pattern: /Cart|Product|Order|Checkout|Price|Sku|Coupon|Payment/,
  },
  {
    category: "Chat & Realtime",
    pattern: /Chat|Message|Bubble|Typing|Presence|Reaction|LiveCursor|Live|FollowUp|Assistant/,
  },
  { category: "Scheduling", pattern: /Calendar|Date|Time|Schedule|Agenda|Event/ },
  {
    category: "Motion",
    pattern: /Transition|Flip|Parallax|Animate|Motion|Confetti|Particles|Counter|Ticker/,
  },
  {
    category: "Accessibility",
    pattern: /VisuallyHidden|SkipLink|LiveRegion|FocusTrap|Announcer/,
  },
  {
    category: "Advanced",
    pattern: /HTMLTag|Styles|Script|Show|Async|Repeat|Slot|Provider|Boundary|Observer|Intersect|Measure|Hotkey|Clipboard|Download|Print|Share|Fullscreen|Idle|Meta|Head/,
  },
];

/**
 * Default props applied when a component is dropped on the canvas, so new
 * nodes render something visible immediately.
 */
export const DEFAULT_PROPS: Record<string, Record<string, PropValue>> = {
  Text: { value: "Text" },
  Heading: { content: "Heading" },
  Button: { label: "Button" },
  Badge: { label: "Badge" },
  Input: { id: "input", placeholder: "Type something…", label: "Label" },
  TextArea: { id: "textarea", placeholder: "Type something…" },
  Checkbox: { id: "checkbox", label: "Checkbox" },
  Switch: { id: "switch", label: "Switch" },
  Radio: { id: "radio", items: ["Option A", "Option B"] },
  Select: { id: "select", items: ["Option A", "Option B", "Option C"] },
  Avatar: { name: "Ada Lovelace" },
  Image: {
    src: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
    alt: "Placeholder",
  },
  Icon: { name: "star" },
  Link: { label: "Link", href: "#" },
  Card: {},
  CardHeader: { title: "Card title", subtitle: "Card subtitle" },
  PageHeader: { title: "Page title", subtitle: "A short description" },
  StatCard: { label: "Revenue", value: "$48,210", trend: "up", delta: "+12%" },
  Progress: { value: 64 },
  Slider: { id: "slider", value: 40 },
  Rating: { value: 4 },
  Separator: {},
  Spacer: { size: "md" },
  Column: { gap: "md" },
  Row: { gap: "md" },
  Stack: { gap: "md" },
  Grid: { columns: 3, gap: "md" },
  Markdown: { content: "**Markdown** supports _rich_ text." },
  Hero: {
    title: "Build something people love",
    subtitle: "A hero section dropped straight from the Aktion library.",
  },
  Navbar: { brand: "Brand" },
  Footer: { tagline: "Built with Aktion Design" },
  EmptyState: { title: "Nothing here yet", description: "Add your first item." },
  LoadingState: { title: "Loading…" },
  ErrorState: { title: "Something went wrong" },
  Spinner: {},
  Skeleton: {},
  Kbd: { keys: "⌘K" },
  CodeBlock: { codeString: "const x = 42" },
  Tooltip: { label: "Tooltip" },
  Pagination: { page: 1, totalPages: 12 },
  Tabs: {
    items: [
      { label: "Tab 1", value: "one" },
      { label: "Tab 2", value: "two" },
    ],
  },
  Calendar: {},
  NumberInput: { id: "number", value: 0 },
  DatePicker: { id: "date" },
  ProductCard: {
    title: "Studio Headphones",
    price: "$299",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
  },
};

/**
 * Default child trees for container components whose content lives in
 * component-typed slots (Accordion → AccordionItems, Bento → tiles, ...), so
 * dropping them renders something real and editable immediately. Each entry
 * is a factory: fresh node ids per insert.
 */
export const DEFAULT_CHILDREN: Record<string, () => DesignNode[]> = {
  Accordion: () => [
    createNode(
      "AccordionItem",
      { title: "What is included?", open: true },
      [createNode("Text", { value: "Everything in the starter plan, plus priority support." })],
    ),
    createNode(
      "AccordionItem",
      { title: "Can I cancel anytime?" },
      [createNode("Text", { value: "Yes — subscriptions are month-to-month." })],
    ),
  ],
  List: () => [
    createNode("ListItem", { title: "First item", description: "Supporting detail", icon: "circle-check" }),
    createNode("ListItem", { title: "Second item", description: "Supporting detail", icon: "circle-check" }),
    createNode("ListItem", { title: "Third item", description: "Supporting detail", icon: "circle-check" }),
  ],
  Bento: () => [
    createNode("Card", {}, [
      createNode("CardHeader", { title: "Fast", subtitle: "Sub-second interactions" }),
    ]),
    createNode("Card", {}, [
      createNode("CardHeader", { title: "Flexible", subtitle: "Composable building blocks" }),
    ]),
    createNode("Card", {}, [
      createNode("CardHeader", { title: "Reliable", subtitle: "Battle-tested runtime" }),
    ]),
  ],
  Carousel: () => [
    createNode("Image", {
      src: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80",
      alt: "Slide 1",
    }),
    createNode("Image", {
      src: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=80",
      alt: "Slide 2",
    }),
  ],
  Split: () => [
    createNode("Column", { gap: "md" }, [
      createNode("Heading", { content: "Side by side" }),
      createNode("Text", { value: "Use Split for two-column marketing bands." }),
    ]),
  ],
  Section: () => [
    createNode("Column", { gap: "md" }, [
      createNode("Heading", { content: "Section title" }),
      createNode("Text", { value: "Sections give marketing pages consistent rhythm." }),
    ]),
  ],
  Card: () => [
    createNode("CardHeader", { title: "Card title", subtitle: "Card subtitle" }),
  ],
};

/** Components pinned to the top of the palette. */
export const PINNED_COMPONENTS = [
  "Text",
  "Button",
  "Input",
  "Image",
  "Card",
  "Column",
  "Row",
  "Grid",
  "Badge",
  "Avatar",
  "Icon",
  "Separator",
];

export const DEFAULT_GROUP_COMPONENT = "Column";

// ---------------------------------------------------------------------------
// Theme editor catalogs — the grouped `$theme({...})` surface.
// ---------------------------------------------------------------------------

export interface ThemeColorField {
  /** Grouped-token key inside `colors`. */
  key: string;
  label: string;
}

export const THEME_COLOR_SECTIONS: Array<{
  label: string;
  fields: ThemeColorField[];
}> = [
  {
    label: "Brand",
    fields: [
      { key: "primary", label: "Primary" },
      { key: "primaryHover", label: "Primary hover" },
      { key: "primaryText", label: "On primary" },
      { key: "accent", label: "Accent" },
      { key: "focusRing", label: "Focus ring" },
    ],
  },
  {
    label: "Surfaces",
    fields: [
      { key: "bg", label: "Background" },
      { key: "bgSubtle", label: "Background subtle" },
      { key: "surface", label: "Surface" },
      { key: "surfaceMuted", label: "Surface muted" },
      { key: "border", label: "Border" },
    ],
  },
  {
    label: "Text",
    fields: [
      { key: "text", label: "Text" },
      { key: "textMuted", label: "Muted text" },
    ],
  },
  {
    label: "Status",
    fields: [
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "danger", label: "Danger" },
      { key: "info", label: "Info" },
    ],
  },
];

/** Quick two-color brand presets applied to primary/accent (+hovers). */
export const THEME_PRESETS: Array<{
  name: string;
  primary: string;
  primaryHover: string;
  accent: string;
}> = [
  { name: "Indigo", primary: "#6366f1", primaryHover: "#4f46e5", accent: "#06b6d4" },
  { name: "Emerald", primary: "#10b981", primaryHover: "#059669", accent: "#14b8a6" },
  { name: "Sunset", primary: "#f97316", primaryHover: "#ea580c", accent: "#f43f5e" },
  { name: "Royal", primary: "#7c3aed", primaryHover: "#6d28d9", accent: "#db2777" },
  { name: "Ocean", primary: "#0ea5e9", primaryHover: "#0284c7", accent: "#06b6d4" },
  { name: "Graphite", primary: "#334155", primaryHover: "#1e293b", accent: "#64748b" },
];

/** Roundness presets mapped onto the radius group. */
export const THEME_RADIUS_PRESETS: Record<string, Record<string, string> | null> = {
  Default: null,
  Sharp: { xs: "0px", sm: "0px", md: "0px", lg: "2px", button: "0px", input: "0px" },
  Soft: { xs: "4px", sm: "8px", md: "12px", lg: "18px", button: "10px", input: "10px" },
  Round: { xs: "6px", sm: "10px", md: "16px", lg: "24px", button: "999px", input: "12px" },
};

/** Density presets mapped onto the spacing ramp. */
export const THEME_DENSITY_PRESETS: Record<string, Record<string, string> | null> = {
  Default: null,
  Compact: { xs: "3px", sm: "6px", md: "8px", lg: "14px", xl: "24px" },
  Comfortable: { xs: "6px", sm: "12px", md: "18px", lg: "28px", xl: "44px" },
};

/** Elevation presets mapped onto the shadows ramp. */
export const THEME_SHADOW_PRESETS: Record<string, Record<string, string> | null> = {
  Default: null,
  Flat: { sm: "none", md: "none", lg: "none" },
  Soft: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
    md: "0 6px 24px rgba(15, 23, 42, 0.08)",
    lg: "0 18px 60px rgba(15, 23, 42, 0.12)",
  },
  Dramatic: {
    sm: "0 2px 6px rgba(15, 23, 42, 0.12)",
    md: "0 12px 32px rgba(15, 23, 42, 0.18)",
    lg: "0 28px 80px rgba(15, 23, 42, 0.28)",
  },
};

/** Font choices for body/heading; Google families carry an import shorthand. */
export const THEME_FONTS: Array<{
  id: string;
  label: string;
  family?: string;
  import?: string;
}> = [
  { id: "default", label: "Theme default" },
  { id: "inter", label: "Inter", family: "Inter, system-ui, sans-serif", import: "Inter:400,600,700" },
  { id: "poppins", label: "Poppins", family: "Poppins, system-ui, sans-serif", import: "Poppins:400,600,700" },
  { id: "roboto", label: "Roboto", family: "Roboto, system-ui, sans-serif", import: "Roboto:400,500,700" },
  { id: "nunito", label: "Nunito", family: "Nunito, system-ui, sans-serif", import: "Nunito:400,600,800" },
  { id: "spaceGrotesk", label: "Space Grotesk", family: "'Space Grotesk', system-ui, sans-serif", import: "Space Grotesk:400,600,700" },
  { id: "serif", label: "Georgia (serif)", family: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "JetBrains Mono", family: "'JetBrains Mono', ui-monospace, monospace", import: "JetBrains Mono:400,600,700" },
];
