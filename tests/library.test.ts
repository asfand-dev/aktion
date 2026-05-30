import { describe, expect, it, vi } from "vitest";
import { FollowUpBlock, FollowUpItem } from "../src/library/components/chat.js";
import {
  Avatar, AvatarGroup, Progress, ProgressRing, Switch, ToggleGroup,
  Tooltip, Kbd, Rating, ChatBubble, Popover, Toast,
} from "../src/library/components/feedback.js";
import {
  Breadcrumb, BreadcrumbItem, Pagination, Navbar, NavbarItem,
} from "../src/library/components/navigation.js";
import {
  DropdownMenu, MenuItem, MenuSeparator, MenuLabel,
} from "../src/library/components/menu.js";
import {
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
} from "../src/library/components/forms.js";
import { Tree, TreeNode } from "../src/library/components/data.js";
import {
  Hero, PageHeader, EmptyState, Timeline, TimelineItem,
  FeatureGrid, FeatureItem, KanbanBoard, KanbanColumn, KanbanCard,
  ProfileCard, Banner,
  SectionHeader, Toolbar, Sidebar, SidebarItem, SidebarSection,
  AppShell, SplitView, DescriptionList, DescriptionItem,
  StatusDot, PricingTable, PricingCard,
  MediaCard, Stats, Tile, Notification, PersonChip,
} from "../src/library/components/patterns.js";
import {
  Container, Spacer, Quote, Markdown, Image, Skeleton,
  Spinner, Badge, BadgeList, Callout, CodeBlock, Text, TextContent,
} from "../src/library/components/content.js";
import {
  Link, OnClick, OnMouse, OnKeyboard, OnFocus, OnIntersect, Css,
} from "../src/library/components/wrappers.js";
import { SearchBar, MultiSelect, DateRangePicker, Button } from "../src/library/components/forms.js";
import {
  Stack, StackItem, Grid, GridItem, Box, resolveSpan,
  AspectRatio, Modal, Tabs, TabItem, Separator,
} from "../src/library/components/layout.js";
import { Sparkline, StatCard, Table, Col } from "../src/library/components/data.js";
import type { RenderHelpers } from "../src/library/types.js";
import { defaultLibrary } from "../src/library/index.js";
import { findComponent } from "../src/library/registry.js";
import { Router } from "../src/runtime/router.js";
import { Drawer } from "../src/library/components/advanced-patterns.js";

const noop = () => {/* no-op */};
const helpers: RenderHelpers = {
  renderNode: (value: unknown) => {
    if (value && typeof value === "object" && (value as { __kind?: string }).__kind === "Component") {
      // For tests, render component nodes as a labeled <div> so that
      // `node.children` (element children) reflects what was appended.
      const stub = document.createElement("div");
      stub.className = "rui-stub";
      const name = (value as { name?: string }).name ?? "";
      stub.dataset.componentName = name;
      return stub;
    }
    if (typeof value === "string") return document.createTextNode(value);
    return document.createTextNode("");
  },
  invoke: noop,
  setState: noop,
  resetState: noop,
  sendToAssistant: noop,
  openUrl: noop,
  bindState: noop,
  // Tests use a per-call ephemeral store so each render is independent.
  useInstanceState: <T,>(_key: string, initial: T) => {
    let value = initial;
    return { get: () => value, set: (next: T) => { value = next; } };
  },
  registerDisposer: noop,
  router: new Router(),
};

const makeNode = (name: string, args: unknown[], argMeta: Array<{ stateRef?: string }> = []) => ({
  __kind: "Component" as const,
  name,
  args,
  argMeta: argMeta.length > 0 ? argMeta : args.map(() => ({})),
});

describe("registry lookup", () => {
  it("findComponent returns the same spec instance across calls (cached)", () => {
    const a = findComponent(defaultLibrary, "Stack");
    const b = findComponent(defaultLibrary, "Stack");
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it("findComponent returns undefined for unknown names", () => {
    expect(findComponent(defaultLibrary, "DoesNotExist")).toBeUndefined();
  });
});

describe("default library", () => {
  it("registers every documented component group", () => {
    const expected = [
      "Stack", "StackItem", "Grid", "GridItem", "Box", "Card", "CardHeader", "Button", "Input", "Select", "Table", "BarChart",
      "FollowUpBlock", "Avatar", "AvatarGroup", "Progress", "Switch",
      "ToggleGroup", "Tooltip", "HoverCard", "Kbd", "Breadcrumb", "BreadcrumbItem",
      "Pagination", "Drawer", "AspectRatio", "ScrollArea",
      "Hero", "PageHeader", "Stats", "EmptyState", "Timeline", "TimelineItem",
      "FeatureGrid", "FeatureItem", "Testimonial", "ProfileCard", "Comment", "Banner",
      "KanbanBoard", "KanbanColumn", "KanbanCard",
      // Rich-layout / app-shell patterns
      "SectionHeader", "Toolbar", "DescriptionList", "DescriptionItem",
      "StatusDot", "PricingTable", "PricingCard",
      "AppShell", "Sidebar", "SidebarSection", "SidebarItem", "SplitView",
      // Richer composition primitives
      "Container", "Spacer", "Hero", "MediaCard", "Stats", "Tile",
      "Notification", "PersonChip", "Quote", "Rating",
      "ProgressRing", "ChatBubble", "SearchBar",
      // Menu & overlay primitives
      "DropdownMenu", "MenuItem", "MenuSeparator", "MenuLabel",
      "Popover", "Toast",
      // Extended form inputs
      "Slider", "NumberInput", "DatePicker", "FileUpload", "Combobox",
      // Hierarchical data + top navigation
      "Tree", "TreeNode", "Navbar", "NavbarItem",
      "StackItem", "GridItem", "Box",
      "IconButton", "CommandPalette", "FilterChips", "FieldRepeater",
      "VirtualList", "QueryBuilder", "DiffViewer", "JsonTree", "Gantt",
      "Truncate", "InlineEdit", "NotificationBell",
      "HTMLTag", "Styles",
    ];
    for (const name of expected) {
      expect(findComponent(defaultLibrary, name), `${name} should be registered`).toBeDefined();
    }
  });

  it("declares a Patterns, App shell, Feedback, and Navigation group", () => {
    const groupNames = defaultLibrary.componentGroups?.map((g) => g.name) ?? [];
    expect(groupNames).toContain("Patterns");
    expect(groupNames).toContain("App shell");
    expect(groupNames).toContain("Feedback & Media");
    expect(groupNames).toContain("Navigation");
  });
});

describe("Avatar", () => {
  it("falls back to a deterministic DiceBear illustration when src is missing", () => {
    const node = Avatar.render(
      makeNode("Avatar", ["Alex Rivera"]),
      { name: "Alex Rivera" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-avatar")).toBe(true);
    const img = node.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("api.dicebear.com");
    expect(img?.getAttribute("src")).toContain("seed=Alex%20Rivera");
  });

  it("renders initials when fallback=\"initials\" and src is missing", () => {
    const node = Avatar.render(
      makeNode("Avatar", ["Alex Rivera"]),
      { name: "Alex Rivera", fallback: "initials" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toBe("AR");
  });

  it("renders the image when src is provided", () => {
    const node = Avatar.render(
      makeNode("Avatar", ["Alex", "https://example.com/a.png"]),
      { name: "Alex", src: "https://example.com/a.png" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector("img")).not.toBeNull();
    expect(node.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
  });

  it("falls back to ? for empty name", () => {
    const node = Avatar.render(
      makeNode("Avatar", [""]),
      { name: "" },
      helpers,
    ) as HTMLElement;
    expect(node.textContent).toBe("?");
  });
});

describe("AvatarGroup", () => {
  it("renders +N overflow chip beyond max", () => {
    const items = ["Alice", "Bob", "Charlie", "Dana", "Eve"];
    const node = AvatarGroup.render(
      makeNode("AvatarGroup", [items]),
      { items, max: 3 },
      helpers,
    ) as HTMLElement;
    const overflow = node.querySelector(".rui-avatar-overflow");
    expect(overflow).not.toBeNull();
    expect(overflow?.textContent).toBe("+2");
  });
});

describe("Progress", () => {
  it("clamps value to [0, max] and exposes ARIA attributes", () => {
    const node = Progress.render(
      makeNode("Progress", []),
      { value: 250, max: 100 },
      helpers,
    ) as HTMLElement;
    const track = node.querySelector(".rui-progress-track");
    expect(track?.getAttribute("aria-valuenow")).toBe("100");
    expect(track?.getAttribute("aria-valuemax")).toBe("100");
  });

  it("renders indeterminate state without aria-valuenow", () => {
    const node = Progress.render(
      makeNode("Progress", []),
      { indeterminate: true },
      helpers,
    ) as HTMLElement;
    const track = node.querySelector(".rui-progress-track");
    expect(track?.getAttribute("data-indeterminate")).toBe("true");
    expect(track?.hasAttribute("aria-valuenow")).toBe(false);
  });
});

describe("Switch", () => {
  it("binds to state when the value arg references a $variable", () => {
    const bindings: Array<{ name: string; type: string }> = [];
    const localHelpers = {
      ...helpers,
      bindState: (el: HTMLElement, name: string, opts?: { event?: string }) => {
        bindings.push({ name, type: opts?.event ?? "input" });
      },
    };
    const node = makeNode("Switch", ["wifi", "Wifi", true], [{}, {}, { stateRef: "wifi_on" }]);
    const root = Switch.render(node, { id: "wifi", label: "Wifi", value: true }, localHelpers) as HTMLElement;
    expect(root.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(bindings).toEqual([{ name: "wifi_on", type: "change" }]);
  });
});

describe("ToggleGroup", () => {
  it("sets the bound state to the clicked value", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const items = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
    const node = makeNode("ToggleGroup", ["digest", items, "weekly"], [{}, {}, { stateRef: "digest" }]);
    const root = ToggleGroup.render(node, { id: "digest", items, value: "weekly" }, localHelpers) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll("button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[1]?.getAttribute("aria-checked")).toBe("true");
    buttons[0]?.click();
    expect(captured).toEqual({ name: "digest", value: "daily" });
  });
});

describe("Tooltip", () => {
  it("renders the label inside the content node", () => {
    const node = Tooltip.render(
      makeNode("Tooltip", ["Copy to clipboard", "trigger"]),
      { label: "Copy to clipboard", trigger: "trigger" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-tooltip")).toBe(true);
    expect(node.querySelector(".rui-tooltip-content")?.textContent).toBe("Copy to clipboard");
  });
});

describe("Kbd", () => {
  it("renders multiple keys with separators", () => {
    const node = Kbd.render(
      makeNode("Kbd", [["Cmd", "K"]]),
      { keys: ["Cmd", "K"] },
      helpers,
    ) as HTMLElement;
    const keys = Array.from(node.querySelectorAll("kbd")).map((k) => k.textContent);
    expect(keys).toEqual(["Cmd", "K"]);
    expect(node.querySelectorAll(".rui-kbd-sep")).toHaveLength(1);
  });
});

describe("Breadcrumb", () => {
  it("emphasises the last item as the current page", () => {
    const items = ["Workspace", "Reports", "Q3"];
    const node = Breadcrumb.render(
      makeNode("Breadcrumb", [items]),
      { items },
      helpers,
    ) as HTMLElement;
    const current = node.querySelector("[aria-current='page']");
    expect(current).not.toBeNull();
    expect(current?.textContent).toContain("Q3");
  });
});

describe("Pagination", () => {
  it("dispatches a Set action with the clicked page number", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const node = makeNode("Pagination", [5, 10], [{ stateRef: "page" }, {}]);
    const root = Pagination.render(node, { page: 5, totalPages: 10 }, localHelpers) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.rui-pagination-button"));
    const fourBtn = buttons.find((b) => b.textContent === "4");
    expect(fourBtn).toBeDefined();
    fourBtn?.click();
    expect(captured).toEqual({ name: "page", value: 4 });
  });

  it("disables prev on the first page and next on the last page", () => {
    const node = makeNode("Pagination", [1, 3], [{ stateRef: "p" }, {}]);
    const root = Pagination.render(node, { page: 1, totalPages: 3 }, helpers) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.rui-pagination-button"));
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[buttons.length - 1]?.disabled).toBe(false);
  });
});

describe("Drawer", () => {
  it("closes by dispatching a Set false action when the close button is clicked", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const node = makeNode("Drawer", ["Details", true, []], [{}, { stateRef: "panelOpen" }, {}]);
    const overlay = Drawer.render(node, { title: "Details", open: true, children: [] }, localHelpers) as HTMLElement;
    expect(overlay.getAttribute("data-open")).toBe("true");
    overlay.querySelector<HTMLButtonElement>(".rui-sheet-close")?.click();
    expect(captured).toEqual({ name: "panelOpen", value: false });
  });
});

describe("Stack", () => {
  it("defaults row stacks to uniform flex growth", () => {
    const node = Stack.render(
      makeNode("Stack", [[], "row"]),
      { children: [], direction: "row" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-uniform")).toBe("true");
    expect(node.getAttribute("data-direction")).toBe("row");
  });

  it("supports reverse and justify evenly", () => {
    const node = Stack.render(
      makeNode("Stack", [[]]),
      { children: [], direction: "column", reverse: true, justify: "evenly" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-direction")).toBe("column-reverse");
    expect(node.getAttribute("data-justify")).toBe("evenly");
  });

  it("emits responsive align CSS variables", () => {
    const node = Stack.render(
      makeNode("Stack", [[]]),
      { children: [], align: { base: "start", md: "center" } },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-align")).toBe("responsive");
    expect(node.getAttribute("data-responsive-align")).toBe("true");
    expect(node.getAttribute("style") ?? "").toContain("--rui-stack-align-base:flex-start");
    expect(node.getAttribute("style") ?? "").toContain("--rui-stack-align-md:center");
  });
});

describe("StackItem", () => {
  it("renders flex item data attributes and child", () => {
    const child = makeNode("Text", ["Hello"]);
    const node = StackItem.render(
      makeNode("StackItem", [child, 0, 1]),
      { child, grow: 0, shrink: 0, alignSelf: "center", order: 2 },
      helpers,
    ) as HTMLElement;
    expect(node.className).toBe("rui-stack-item");
    expect(node.getAttribute("data-grow")).toBe("0");
    expect(node.getAttribute("data-shrink")).toBe("0");
    expect(node.getAttribute("data-align-self")).toBe("center");
    expect(node.getAttribute("style") ?? "").toContain("order:2");
    expect(node.querySelector(".rui-stub")).toBeTruthy();
  });
});

describe("resolveSpan", () => {
  it("resolves fraction strings on a 12-column grid", () => {
    expect(resolveSpan("1/2")).toBe(6);
    expect(resolveSpan("1/3")).toBe(4);
    expect(resolveSpan("2/3")).toBe(8);
    expect(resolveSpan("1/4")).toBe(3);
    expect(resolveSpan(6)).toBe(6);
  });
});

describe("Grid", () => {
  it("forwards an explicit column count", () => {
    const node = Grid.render(
      makeNode("Grid", [[], 3]),
      { children: [], columns: 3 },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-columns")).toBe("3");
  });

  it("enables 12-column mode for columns=12", () => {
    const node = Grid.render(
      makeNode("Grid", [[], 12]),
      { children: [], columns: 12 },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-columns")).toBe("12");
    expect(node.getAttribute("data-grid-mode")).toBe("12");
  });

  it("auto-enables 12-column mode when children include GridItem", () => {
    const item = makeNode("GridItem", [makeNode("Text", ["x"]), 6]);
    const node = Grid.render(
      makeNode("Grid", [[item]]),
      { children: [item] },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-grid-mode")).toBe("12");
  });

  it("does NOT force 12-column mode when columns:N (N != 12) is explicit with GridItem children", () => {
    // Regression: `Grid([GridItem(...), GridItem(...), GridItem(...)], 3, "l")`
    // used to silently switch to a 12-column grid because GridItem children
    // were present, squashing each card to ~8% width. When the author sets
    // `columns: 3` explicitly, that wins and the cards take 1/3 of the row.
    const item = makeNode("GridItem", [makeNode("Card", [[]])]);
    const node = Grid.render(
      makeNode("Grid", [[item, item, item], 3]),
      { children: [item, item, item], columns: 3 },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-columns")).toBe("3");
    expect(node.getAttribute("data-grid-mode")).not.toBe("12");
  });

  it("falls back to auto-fit when no columns provided", () => {
    const node = Grid.render(
      makeNode("Grid", [[]]),
      { children: [] },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-columns")).toBeNull();
    expect(node.getAttribute("style") ?? "").toContain("--rui-grid-min-item");
  });
});

describe("GridItem", () => {
  it("renders span, offset, and responsive span CSS vars", () => {
    const child = makeNode("Text", ["Cell"]);
    const node = GridItem.render(
      makeNode("GridItem", [child, "1/3", 2]),
      { child, span: "1/3", offset: 2, spanAt: { base: 12, md: 4 } },
      helpers,
    ) as HTMLElement;
    expect(node.className).toBe("rui-grid-item");
    expect(node.getAttribute("data-span")).toBe("4");
    expect(node.getAttribute("data-offset")).toBe("2");
    expect(node.getAttribute("data-responsive-span")).toBe("true");
    expect(node.getAttribute("style") ?? "").toContain("--rui-grid-item-span:4");
    expect(node.getAttribute("style") ?? "").toContain("--rui-grid-item-span-md:4");
    expect(node.getAttribute("style") ?? "").toContain("--rui-grid-item-span-base:12");
  });
});

describe("Box", () => {
  it("renders semantic surface and spacing attrs", () => {
    const node = Box.render(
      makeNode("Box", [[]]),
      { children: [], padding: "l", margin: "s", border: "subtle", background: "muted", maxWidth: "480px" },
      helpers,
    ) as HTMLElement;
    expect(node.className).toBe("rui-box");
    expect(node.getAttribute("data-padding")).toBe("l");
    expect(node.getAttribute("data-margin")).toBe("s");
    expect(node.getAttribute("data-border")).toBe("subtle");
    expect(node.getAttribute("data-background")).toBe("muted");
    expect(node.getAttribute("style") ?? "").toContain("max-width:480px");
  });
});

describe("AspectRatio", () => {
  it("translates 16:9 into a CSS aspect-ratio", () => {
    const node = AspectRatio.render(
      makeNode("AspectRatio", ["16:9", []]),
      { ratio: "16:9", children: [] },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("style") ?? "").toContain("aspect-ratio:16 / 9");
  });
});

describe("Pattern composites", () => {
  it("Hero renders eyebrow, title, subtitle, highlights, and ctas", () => {
    const node = Hero.render(
      makeNode("Hero", []),
      {
        title: "Ship faster",
        subtitle: "From idea to production in minutes.",
        eyebrow: "v2 launch",
        highlights: ["No setup", "Streaming-first"],
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-hero")).toBe(true);
    expect(node.querySelector(".rui-hero-eyebrow")?.textContent).toBe("v2 launch");
    expect(node.querySelector(".rui-hero-title")?.textContent).toBe("Ship faster");
    expect(node.querySelector(".rui-hero-subtitle")?.textContent).toBe("From idea to production in minutes.");
    expect(node.querySelectorAll(".rui-hero-highlight")).toHaveLength(2);
  });

  it("PageHeader renders breadcrumbs as strings", () => {
    const node = PageHeader.render(
      makeNode("PageHeader", []),
      { title: "Reports", breadcrumbs: ["Workspace", "Reports"] },
      helpers,
    ) as HTMLElement;
    expect(node.querySelectorAll(".rui-page-header-crumb")).toHaveLength(2);
    expect(node.querySelector(".rui-page-header-title")?.textContent).toBe("Reports");
  });

  it("Stats renders each item", () => {
    const items = [
      makeNode("StatCard", ["A", "1"]),
      makeNode("StatCard", ["B", "2"]),
      makeNode("StatCard", ["C", "3"]),
    ];
    const node = Stats.render(
      makeNode("Stats", [items]),
      { items, layout: "grid" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-metric-grid")).toBe(true);
    expect(node.childNodes.length).toBe(3);
  });

  it("EmptyState renders title, description, and action wrapper", () => {
    const action = makeNode("Button", ["Add"]);
    const node = EmptyState.render(
      makeNode("EmptyState", []),
      { title: "No data", description: "Add one to get started.", icon: "inbox", action },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-empty-state-title")?.textContent).toBe("No data");
    expect(node.querySelector(".rui-empty-state-description")?.textContent).toBe("Add one to get started.");
    expect(node.querySelector(".rui-empty-state-action")).not.toBeNull();
  });

  it("Timeline + TimelineItem render together", () => {
    const items = [
      makeNode("TimelineItem", ["Created"]),
      makeNode("TimelineItem", ["Updated"]),
    ];
    const node = Timeline.render(
      makeNode("Timeline", [items]),
      { items },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("ol");
    expect(node.children.length).toBe(2);

    const item = TimelineItem.render(
      makeNode("TimelineItem", ["Hello"]),
      { title: "Hello", time: "now", description: "There", icon: "rocket", tone: "success" },
      helpers,
    ) as HTMLElement;
    expect(item.getAttribute("data-tone")).toBe("success");
    expect(item.querySelector(".rui-timeline-title")?.textContent).toBe("Hello");
    expect(item.querySelector(".rui-timeline-time")?.textContent).toBe("now");
  });

  it("FeatureGrid + FeatureItem render together", () => {
    const items = [makeNode("FeatureItem", ["A"]), makeNode("FeatureItem", ["B"])];
    const grid = FeatureGrid.render(
      makeNode("FeatureGrid", [items, 2]),
      { items, columns: 2 },
      helpers,
    ) as HTMLElement;
    expect(grid.getAttribute("data-columns")).toBe("2");

    const item = FeatureItem.render(
      makeNode("FeatureItem", ["Fast"]),
      { title: "Fast", description: "Snappy.", icon: "bolt", tone: "info" },
      helpers,
    ) as HTMLElement;
    const featureIcon = item.querySelector(".rui-feature-icon");
    expect(featureIcon?.classList.contains("fa-solid")).toBe(true);
    expect(featureIcon?.classList.contains("fa-bolt")).toBe(true);
    expect(item.getAttribute("data-tone")).toBe("info");
  });

  it("KanbanBoard renders columns and cards in order", () => {
    const cards = [makeNode("KanbanCard", ["Card A"]), makeNode("KanbanCard", ["Card B"])];
    const column = makeNode("KanbanColumn", ["To do", cards]);
    const colNode = KanbanColumn.render(
      column,
      { title: "To do", items: cards },
      {
        ...helpers,
        renderNode: (value: unknown) => {
          const v = value as { name?: string; args?: unknown[] };
          const d = document.createElement("div");
          d.className = "rui-kanban-card";
          d.textContent = typeof v?.args?.[0] === "string" ? v.args[0] : "";
          return d;
        },
      },
    ) as HTMLElement;
    expect(colNode.querySelector(".rui-kanban-column-title")?.textContent).toBe("To do");
    expect(colNode.querySelector(".rui-kanban-column-count")?.textContent).toBe("2");
    expect(colNode.querySelectorAll(".rui-kanban-card")).toHaveLength(2);
  });

  it("KanbanCard exposes a click action when an Action is provided", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = KanbanCard.render(
      makeNode("KanbanCard", []),
      { title: "Task", onClick: action },
      localHelpers,
    ) as HTMLElement;
    expect(node.getAttribute("role")).toBe("button");
    node.click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("ProfileCard renders avatar and tags", () => {
    const node = ProfileCard.render(
      makeNode("ProfileCard", []),
      { name: "Asha Patel", role: "Engineer", tags: ["react", "ts"] },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-avatar")).not.toBeNull();
    expect(node.querySelector(".rui-profile-card-name")?.textContent).toBe("Asha Patel");
    expect(node.querySelectorAll(".rui-profile-card-tags .rui-tag")).toHaveLength(2);
  });

  it("Banner accepts a tone and renders an action wrapper", () => {
    const action = makeNode("Button", ["Reload"]);
    const node = Banner.render(
      makeNode("Banner", []),
      { title: "Deploy ready", message: "Tag v2.0 is built.", tone: "success", icon: "rocket", action },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-tone")).toBe("success");
    const bannerIcon = node.querySelector(".rui-banner-icon");
    expect(bannerIcon?.classList.contains("fa-rocket")).toBe(true);
    expect(node.querySelector(".rui-banner-action")).not.toBeNull();
  });

  it("KanbanBoard renders all columns", () => {
    const cols = [makeNode("KanbanColumn", ["A", []]), makeNode("KanbanColumn", ["B", []])];
    const board = KanbanBoard.render(
      makeNode("KanbanBoard", [cols]),
      { columns: cols },
      helpers,
    ) as HTMLElement;
    expect(board.classList.contains("rui-kanban-board")).toBe(true);
    expect(board.childNodes.length).toBe(2);
  });
});

describe("Rich layout patterns", () => {
  it("SectionHeader renders eyebrow, title, subtitle, status, and actions", () => {
    const node = SectionHeader.render(
      makeNode("SectionHeader", []),
      {
        title: "Revenue trend",
        subtitle: "Daily · last 30 days",
        eyebrow: "INSIGHTS",
        status: makeNode("Badge", ["Up 12%"]),
        actions: [makeNode("Button", ["View"])],
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-section-header")).toBe(true);
    expect(node.querySelector(".rui-section-header-eyebrow")?.textContent).toBe("INSIGHTS");
    expect(node.querySelector(".rui-section-header-title")?.textContent).toBe("Revenue trend");
    expect(node.querySelector(".rui-section-header-subtitle")?.textContent).toBe("Daily · last 30 days");
    expect(node.querySelector(".rui-section-header-actions")).not.toBeNull();
  });

  it("Toolbar renders left and right slots", () => {
    const node = Toolbar.render(
      makeNode("Toolbar", []),
      {
        left: [makeNode("Input", ["search"])],
        right: [makeNode("Button", ["Export"])],
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-toolbar")).toBe(true);
    expect(node.querySelector(".rui-toolbar-left")?.childNodes.length).toBe(1);
    expect(node.querySelector(".rui-toolbar-right")?.childNodes.length).toBe(1);
  });

  it("Sidebar renders brand, items, and footer", () => {
    const items = [
      makeNode("SidebarItem", ["Home"]),
      makeNode("SidebarItem", ["Projects"]),
    ];
    const node = Sidebar.render(
      makeNode("Sidebar", []),
      { items, brand: "Acme HQ", tagline: "Production", footer: [makeNode("Button", ["Settings"])] },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-sidebar")).toBe(true);
    expect(node.querySelector(".rui-sidebar-brand")?.textContent).toBe("Acme HQ");
    expect(node.querySelector(".rui-sidebar-tagline")?.textContent).toBe("Production");
    expect(node.querySelector(".rui-sidebar-body")?.childNodes.length).toBe(2);
    expect(node.querySelector(".rui-sidebar-footer")).not.toBeNull();
  });

  it("SidebarItem marks active and fires action on click", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = SidebarItem.render(
      makeNode("SidebarItem", []),
      { label: "Projects", icon: "folder", active: true, badge: "12", onClick: action },
      localHelpers,
    ) as HTMLButtonElement;
    expect(node.getAttribute("data-active")).toBe("true");
    const sidebarIcon = node.querySelector(".rui-sidebar-item-icon");
    expect(sidebarIcon?.classList.contains("fa-folder")).toBe(true);
    expect(node.querySelector(".rui-sidebar-item-badge")?.textContent).toBe("12");
    node.click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("SidebarSection labels and contains its items", () => {
    const items = [makeNode("SidebarItem", ["A"]), makeNode("SidebarItem", ["B"])];
    const node = SidebarSection.render(
      makeNode("SidebarSection", []),
      { label: "Workspace", items },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-sidebar-section-label")?.textContent).toBe("Workspace");
    expect(node.querySelectorAll(".rui-stub").length).toBe(2);
  });

  it("AppShell composes sidebar, topbar, and content", () => {
    const node = AppShell.render(
      makeNode("AppShell", []),
      {
        sidebar: makeNode("Sidebar", []),
        content: [makeNode("PageHeader", [])],
        topbar: [makeNode("Buttons", [])],
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-app-shell")).toBe(true);
    expect(node.querySelector(".rui-app-shell-topbar")).not.toBeNull();
    expect(node.querySelector(".rui-app-shell-content")?.childNodes.length).toBe(1);
  });

  it("SplitView renders primary and detail panes", () => {
    const node = SplitView.render(
      makeNode("SplitView", []),
      { primary: [makeNode("List", [])], detail: [makeNode("Card", [])] },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-split-view")).toBe(true);
    expect(node.querySelector(".rui-split-view-primary")?.childNodes.length).toBe(1);
    expect(node.querySelector(".rui-split-view-detail")?.childNodes.length).toBe(1);
  });

  it("DescriptionList renders items, DescriptionItem renders label/value", () => {
    const items = [
      makeNode("DescriptionItem", ["Team", "Design"]),
      makeNode("DescriptionItem", ["Joined", "Mar 2022"]),
    ];
    const list = DescriptionList.render(
      makeNode("DescriptionList", []),
      { items, columns: 2 },
      helpers,
    ) as HTMLElement;
    expect(list.classList.contains("rui-description-list")).toBe(true);
    expect(list.getAttribute("data-columns")).toBe("2");

    const item = DescriptionItem.render(
      makeNode("DescriptionItem", []),
      { label: "Status", value: "Active", icon: "circle" },
      helpers,
    ) as HTMLElement;
    expect(item.querySelector(".rui-description-label")?.textContent).toContain("Status");
    expect(item.querySelector(".rui-description-value")?.textContent).toBe("Active");
    const descIcon = item.querySelector(".rui-description-icon");
    expect(descIcon?.classList.contains("fa-circle")).toBe(true);
  });

  it("StatusDot renders tone, label, and optional pulse", () => {
    const node = StatusDot.render(
      makeNode("StatusDot", []),
      { label: "Live", tone: "success", pulse: true },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-tone")).toBe("success");
    expect(node.getAttribute("data-pulse")).toBe("true");
    expect(node.querySelector(".rui-status-dot-label")?.textContent).toBe("Live");
  });

  it("PricingTable + PricingCard render features, price, and CTA", () => {
    const tier = PricingCard.render(
      makeNode("PricingCard", []),
      {
        plan: "Pro",
        price: "$29",
        period: "/mo",
        description: "For teams shipping LLM features.",
        features: ["Unlimited workspaces", "Priority support"],
        action: makeNode("Button", ["Start"]),
        badge: "Most popular",
        featured: true,
      },
      helpers,
    ) as HTMLElement;
    expect(tier.getAttribute("data-featured")).toBe("true");
    expect(tier.querySelector(".rui-pricing-card-plan")?.textContent).toBe("Pro");
    expect(tier.querySelector(".rui-pricing-card-price")?.textContent).toBe("$29");
    expect(tier.querySelector(".rui-pricing-card-period")?.textContent).toBe("/mo");
    expect(tier.querySelectorAll(".rui-pricing-card-feature").length).toBe(2);
    expect(tier.querySelector(".rui-pricing-card-badge")?.textContent).toBe("Most popular");

    const table = PricingTable.render(
      makeNode("PricingTable", []),
      { tiers: [makeNode("PricingCard", []), makeNode("PricingCard", [])] },
      helpers,
    ) as HTMLElement;
    expect(table.classList.contains("rui-pricing-table")).toBe(true);
    expect(table.childNodes.length).toBe(2);
  });
});

describe("Container", () => {
  it("applies size, padding, and maxWidth", () => {
    const node = Container.render(
      makeNode("Container", []),
      { children: [], size: "md", padding: "l", maxWidth: "720px" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-container")).toBe(true);
    expect(node.getAttribute("data-size")).toBe("md");
    expect(node.getAttribute("data-padding")).toBe("l");
    expect(node.getAttribute("style") ?? "").toContain("max-width:720px");
  });
});

describe("Spacer", () => {
  it("defaults to a flex-growing spacer when size is omitted", () => {
    const node = Spacer.render(makeNode("Spacer", []), {}, helpers) as HTMLElement;
    expect(node.getAttribute("data-flex")).toBe("true");
    expect(node.getAttribute("data-size")).toBeNull();
  });

  it("renders a fixed gap when size is set", () => {
    const node = Spacer.render(makeNode("Spacer", []), { size: "l" }, helpers) as HTMLElement;
    expect(node.getAttribute("data-flex")).toBe("false");
    expect(node.getAttribute("data-size")).toBe("l");
  });
});

describe("Text", () => {
  it("renders text with the requested variant and tone data attributes", () => {
    const node = Text.render(
      makeNode("Text", ["Hello"]),
      { value: "Hello", variant: "large-heavy", tone: "primary" },
      helpers,
    ) as HTMLElement;
    expect(node.tagName).toBe("SPAN");
    expect(node.className).toBe("rui-text");
    expect(node.getAttribute("data-variant")).toBe("large-heavy");
    expect(node.getAttribute("data-color")).toBe("primary");
    expect(node.textContent).toBe("Hello");
    expect(node.hasAttribute("style")).toBe(false);
  });

  it("applies a sanitised inline style declaration string", () => {
    const node = Text.render(
      makeNode("Text", ["Styled"]),
      { value: "Styled", style: "font-size: 16px; font-weight: bold; color: #000;" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("style")).toBe(
      "font-size: 16px; font-weight: bold; color: #000;",
    );
  });

  it("drops the style attribute when input contains an XSS vector", () => {
    const cases = [
      "color: red; expression(alert(1))",
      "background: url(javascript:alert(1))",
      "behavior: url(#default#userdata)",
      "color: red; @import url(evil.css)",
      "color: red; <script>",
    ];
    for (const style of cases) {
      const node = Text.render(
        makeNode("Text", ["Hi"]),
        { value: "Hi", style },
        helpers,
      ) as HTMLElement;
      expect(node.hasAttribute("style")).toBe(false);
    }
  });

  it("TextContent renders identically (deprecated alias)", () => {
    const props = { value: "Aloha", variant: "body", tone: "muted" } as const;
    const newNode = Text.render(makeNode("Text", ["Aloha"]), props, helpers) as HTMLElement;
    const oldNode = TextContent.render(makeNode("TextContent", ["Aloha"]), props, helpers) as HTMLElement;
    expect(oldNode.outerHTML).toBe(newNode.outerHTML);
  });
});

describe("Markdown", () => {
  it("blocks `javascript:` URLs in link rewrites", () => {
    const node = Markdown.render(
      makeNode("Markdown", []),
      // eslint-disable-next-line no-script-url
      { content: "click [me](javascript:alert(1)) now" },
      helpers,
    ) as HTMLElement;
    const anchor = node.querySelector("a");
    expect(anchor).not.toBeNull();
    // The disallowed scheme is replaced with a safe `#` so even if a tool
    // smuggles attacker-controlled markdown into the response it cannot
    // execute scripts when the user clicks the link.
    expect(anchor?.getAttribute("href")).toBe("#");
  });

  it("preserves http(s) and mailto: links untouched", () => {
    const node = Markdown.render(
      makeNode("Markdown", []),
      { content: "see [docs](https://example.com/x) or [hi](mailto:a@b.com)" },
      helpers,
    ) as HTMLElement;
    const hrefs = Array.from(node.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://example.com/x", "mailto:a@b.com"]);
  });

  it("allows fragment and relative URLs", () => {
    const node = Markdown.render(
      makeNode("Markdown", []),
      { content: "[anchor](#section) and [page](/about)" },
      helpers,
    ) as HTMLElement;
    const hrefs = Array.from(node.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#section", "/about"]);
  });

  it("blocks protocol-relative URLs that could navigate to a hostile host", () => {
    // Regression: `//evil.com` was previously treated as same-origin because
    // it starts with `/`. Browsers actually resolve it to `https://evil.com`,
    // so we must replace it with a safe `#`.
    const node = Markdown.render(
      makeNode("Markdown", []),
      { content: "click [me](//evil.com/steal) now" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector("a")?.getAttribute("href")).toBe("#");
  });
});

describe("CSS-length sanitisation in style props", () => {
  it("rejects values containing semicolons / quotes (Container.maxWidth)", () => {
    // Regression: an unsanitised `maxWidth` could inject extra CSS declarations
    // through the `style` attribute (e.g. `300px; background: url(...)`).
    const node = makeNode("Container", ["x"], []);
    const root = defaultLibrary.components
      .find((c) => c.name === "Container")!
      .render(node, { maxWidth: "300px; background: red" }, helpers) as HTMLElement;
    // Hostile value is dropped → fallback width applied.
    expect(root.getAttribute("style") ?? "").not.toContain("background:");
  });

  it("Hero strips characters that would break out of url(...)", () => {
    // Regression: `imageSrc` containing `");` could close the url() literal
    // and inject arbitrary CSS rules. The sanitiser drops those characters
    // so anything the attacker supplied stays trapped *inside* the url()
    // literal (where the browser treats it as a malformed URL, never CSS).
    const benign = Hero.render(
      makeNode("Hero", []),
      { title: "x", imageSrc: "https://example.com/cover.jpg" },
      helpers,
    ) as HTMLElement;
    const hostile = Hero.render(
      makeNode("Hero", []),
      { title: "x", imageSrc: 'foo");background:red;//' },
      helpers,
    ) as HTMLElement;
    const benignStyle = benign.getAttribute("style") ?? "";
    const hostileStyle = hostile.getAttribute("style") ?? "";
    // Hostile input must not introduce additional `;` or `"` beyond what
    // a benign URL produces — those are the only characters that could
    // break out of the declaration / url() literal.
    const count = (s: string, c: string) => (s.match(new RegExp(`\\${c}`, "g")) ?? []).length;
    expect(count(hostileStyle, ";")).toBe(count(benignStyle, ";"));
    expect(count(hostileStyle, '"')).toBe(count(benignStyle, '"'));
  });

  it("Container.maxWidth falls back when given non-length input", () => {
    const node = makeNode("Container", ["x"], []);
    const root = defaultLibrary.components
      .find((c) => c.name === "Container")!
      .render(node, { maxWidth: "300px; background: red" }, helpers) as HTMLElement;
    // Hostile value is dropped, leaving the documented `auto` fallback.
    expect(root.getAttribute("style") ?? "").toContain("max-width:auto");
  });
});

/**
 * Regression-grade coverage for URL sanitisation across every component that
 * lands an LLM-supplied `href` / `src` on a DOM attribute. Each component
 * funnels through `sanitiseHref` / `sanitiseImageSrc`, so the rules tested
 * here apply uniformly — a `javascript:` URL must NEVER reach the live DOM,
 * regardless of which component wraps it.
 */
describe("URL sanitisation in component props", () => {
  // eslint-disable-next-line no-script-url
  const JAVASCRIPT_URL = "javascript:alert(1)";
  // Tab-bypassed scheme — Chrome historically permitted this until the
  // sanitiser was added. The regex strips control chars before matching.
  // eslint-disable-next-line no-script-url
  const TAB_BYPASS = "java\tscript:alert(1)";

  it("Link sanitises `href` and rejects `javascript:` URLs", () => {
    const safe = Link.render(
      makeNode("Link", []),
      { href: "https://example.com/x", label: "Docs" },
      helpers,
    ) as HTMLAnchorElement;
    expect(safe.getAttribute("href")).toBe("https://example.com/x");

    const hostile = Link.render(
      makeNode("Link", []),
      { href: JAVASCRIPT_URL, label: "Hostile" },
      helpers,
    ) as HTMLAnchorElement;
    expect(hostile.getAttribute("href")).toBe("#");

    const bypass = Link.render(
      makeNode("Link", []),
      { href: TAB_BYPASS, label: "Hostile" },
      helpers,
    ) as HTMLAnchorElement;
    // Control characters are stripped, exposing the unsafe scheme, which
    // the sanitiser then maps to the fallback.
    expect(bypass.getAttribute("href")).toBe("#");
  });

  it("Link applies `noopener noreferrer` to external destinations", () => {
    const external = Link.render(
      makeNode("Link", []),
      { href: "https://example.com/x", label: "Docs", external: true },
      helpers,
    ) as HTMLAnchorElement;
    expect(external.getAttribute("rel")).toBe("noopener noreferrer");
    expect(external.getAttribute("target")).toBe("_blank");
  });

  it("Link preserves fragment, root-relative, and mailto URLs verbatim", () => {
    const fragment = Link.render(makeNode("Link", []), { href: "#section", label: "go" }, helpers) as HTMLAnchorElement;
    const rooted = Link.render(makeNode("Link", []), { href: "/about", label: "go" }, helpers) as HTMLAnchorElement;
    const mailto = Link.render(makeNode("Link", []), { href: "mailto:a@b.com", label: "go" }, helpers) as HTMLAnchorElement;
    expect(fragment.getAttribute("href")).toBe("#section");
    expect(rooted.getAttribute("href")).toBe("/about");
    expect(mailto.getAttribute("href")).toBe("mailto:a@b.com");
  });

  it("Link rejects protocol-relative URLs that could navigate cross-origin", () => {
    const evil = Link.render(
      makeNode("Link", []),
      { href: "//evil.com/steal", label: "go" },
      helpers,
    ) as HTMLAnchorElement;
    expect(evil.getAttribute("href")).toBe("#");
  });

  it("BreadcrumbItem sanitises `href` and falls back to plain text when scheme is unsafe", () => {
    // Safe URL → anchor with sanitised href.
    const safe = BreadcrumbItem.render(
      makeNode("BreadcrumbItem", []),
      { label: "Home", href: "/home" },
      helpers,
    ) as HTMLElement;
    expect(safe.querySelector("a")?.getAttribute("href")).toBe("/home");

    // Hostile URL → still rendered as an anchor (label position is unchanged
    // so the visual hierarchy is preserved), but the href is the safe `#`.
    const hostile = BreadcrumbItem.render(
      makeNode("BreadcrumbItem", []),
      { label: "Hostile", href: JAVASCRIPT_URL },
      helpers,
    ) as HTMLElement;
    expect(hostile.querySelector("a")?.getAttribute("href")).toBe("#");
  });

  it("NavbarItem sanitises `href` and rel includes noreferrer for external", () => {
    const hostile = NavbarItem.render(
      makeNode("NavbarItem", []),
      { label: "X", href: JAVASCRIPT_URL, external: true },
      helpers,
    ) as HTMLElement;
    // Hostile href is dropped so the item degrades to a `<button>` (no `to`
    // either) — that is the safest fallback for keyboard navigation.
    expect(hostile.tagName.toLowerCase()).toBe("button");

    const external = NavbarItem.render(
      makeNode("NavbarItem", []),
      { label: "X", href: "https://example.com", external: true },
      helpers,
    ) as HTMLElement;
    expect(external.getAttribute("href")).toBe("https://example.com");
    expect(external.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("Image renders a placeholder instead of attaching an unsafe src", () => {
    const safe = Image.render(
      makeNode("Image", []),
      { src: "https://example.com/cat.jpg", alt: "cat" },
      helpers,
    ) as HTMLElement;
    expect(safe.querySelector("img")?.getAttribute("src")).toBe("https://example.com/cat.jpg");

    const hostile = Image.render(
      makeNode("Image", []),
      { src: JAVASCRIPT_URL, alt: "x" },
      helpers,
    ) as HTMLElement;
    // No `<img>` should be attached when the source is unsafe — there is a
    // placeholder div instead so the layout slot is preserved.
    expect(hostile.querySelector("img")).toBeNull();
    expect(hostile.querySelector(".rui-image-placeholder")).not.toBeNull();
  });

  it("Image rejects `data:text/html` payloads but keeps `data:image/...`", () => {
    const html = Image.render(
      makeNode("Image", []),
      { src: "data:text/html,<script>alert(1)</script>" },
      helpers,
    ) as HTMLElement;
    expect(html.querySelector("img")).toBeNull();

    const ok = Image.render(
      makeNode("Image", []),
      { src: "data:image/png;base64,iVBORw0KGgo=" },
      helpers,
    ) as HTMLElement;
    expect(ok.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/png/);
  });

  it("Skeleton coerces non-numeric `height` / `lines` props safely", () => {
    const node = Skeleton.render(
      makeNode("Skeleton", []),
      // `"10px"` previously produced `height:NaNpx` inline style. The
      // coercion now drops anything that is not a finite positive number.
      { height: "10px", lines: "abc" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("style") ?? "").not.toContain("NaN");
    // `lines` falls back to the default (3) when non-numeric input is given.
    expect(node.querySelectorAll(".rui-skeleton-line").length).toBe(3);
  });

  it("Skeleton clamps absurd `lines` values to a sane maximum", () => {
    const node = Skeleton.render(
      makeNode("Skeleton", []),
      { lines: 99999 },
      helpers,
    ) as HTMLElement;
    // Soft cap prevents an LLM-supplied `lines: 1e9` from locking up the page.
    expect(node.querySelectorAll(".rui-skeleton-line").length).toBeLessThanOrEqual(50);
  });
});

describe("Hero", () => {
  it("renders title, eyebrow, subtitle, and actions", () => {
    const node = Hero.render(
      makeNode("Hero", []),
      {
        title: "Aurora",
        layout: "cover",
        imageSrc: "https://example.com/cover.jpg",
        subtitle: "Studio sound",
        eyebrow: "NEW",
        actions: [makeNode("Button", ["Buy"])],
        tone: "primary",
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-cover")).toBe(true);
    expect(node.getAttribute("data-tone")).toBe("primary");
    expect(node.querySelector(".rui-cover-title")?.textContent).toBe("Aurora");
    expect(node.querySelector(".rui-cover-eyebrow")?.textContent).toBe("NEW");
    expect(node.querySelector(".rui-cover-subtitle")?.textContent).toBe("Studio sound");
    expect(node.querySelector(".rui-cover-actions")).not.toBeNull();
    expect(node.getAttribute("style") ?? "").toContain("background-image:");
  });
});

describe("MediaCard", () => {
  it("renders an image, badge, tags, and actions", () => {
    const node = MediaCard.render(
      makeNode("MediaCard", []),
      {
        title: "Aurora Headphones",
        imageSrc: "https://example.com/h.jpg",
        description: "Studio sound",
        tags: ["wireless", "noise-cancel"],
        meta: "Free returns",
        actions: [makeNode("Button", ["Buy"])],
        badge: "SALE",
        orientation: "vertical",
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-media-card")).toBe(true);
    expect(node.querySelector(".rui-media-card-title")?.textContent).toBe("Aurora Headphones");
    expect(node.querySelector(".rui-media-card-media img")?.getAttribute("src")).toBe("https://example.com/h.jpg");
    expect(node.querySelector(".rui-media-card-badge")?.textContent).toContain("SALE");
    expect(node.querySelectorAll(".rui-media-card-tags .rui-tag")).toHaveLength(2);
    expect(node.querySelector(".rui-media-card-actions")).not.toBeNull();
    expect(node.querySelector(".rui-media-card-meta")?.textContent).toBe("Free returns");
  });

  it("renders a placeholder when imageSrc is missing", () => {
    const node = MediaCard.render(
      makeNode("MediaCard", []),
      { title: "Untitled" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-media-card-media-empty")).not.toBeNull();
    expect(node.querySelector(".rui-media-card-placeholder")).not.toBeNull();
  });
});

describe("Stats", () => {
  it("renders one stat block per item", () => {
    const node = Stats.render(
      makeNode("Stats", []),
      {
        items: [
          { label: "Comfort", value: "4.8", tone: "success" },
          { label: "Sound", value: "4.7", hint: "stable" },
        ],
      },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-stats")).toBe(true);
    expect(node.querySelectorAll(".rui-stats-item")).toHaveLength(2);
    expect(node.querySelectorAll(".rui-stats-value").item(0)?.textContent).toBe("4.8");
    expect(node.querySelectorAll(".rui-stats-item").item(0)?.getAttribute("data-tone")).toBe("success");
    expect(node.querySelectorAll(".rui-stats-hint").item(0)?.textContent).toBe("stable");
  });
});

describe("Tile", () => {
  it("renders a button when an action is provided", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = Tile.render(
      makeNode("Tile", []),
      { label: "Inbox", icon: "inbox", value: "12", description: "Unread", tone: "primary", onClick: action },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("button");
    expect(node.getAttribute("data-tone")).toBe("primary");
    const tileIcon = node.querySelector(".rui-tile-icon");
    expect(tileIcon?.classList.contains("fa-inbox")).toBe(true);
    expect(node.querySelector(".rui-tile-label")?.textContent).toBe("Inbox");
    expect(node.querySelector(".rui-tile-value")?.textContent).toBe("12");
    (node as HTMLButtonElement).click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("renders a div when no action is provided", () => {
    const node = Tile.render(
      makeNode("Tile", []),
      { label: "Inbox" },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("div");
  });
});

describe("Notification", () => {
  it("renders title, message, tone, and unread state", () => {
    const node = Notification.render(
      makeNode("Notification", []),
      { title: "Deploy ready", message: "v2.0 is live", time: "2m ago", tone: "success", unread: true, icon: "rocket" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-tone")).toBe("success");
    expect(node.getAttribute("data-unread")).toBe("true");
    expect(node.querySelector(".rui-notification-title")?.textContent).toBe("Deploy ready");
    expect(node.querySelector(".rui-notification-message")?.textContent).toBe("v2.0 is live");
    expect(node.querySelector(".rui-notification-time")?.textContent).toBe("2m ago");
    const notifIcon = node.querySelector(".rui-notification-icon");
    expect(notifIcon?.classList.contains("fa-rocket")).toBe(true);
  });
});

describe("PersonChip", () => {
  it("renders an avatar, name, and role", () => {
    const node = PersonChip.render(
      makeNode("PersonChip", []),
      { name: "Asha Patel", role: "Staff Engineer", size: "md" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-person-chip")).toBe(true);
    expect(node.querySelector(".rui-avatar")).not.toBeNull();
    expect(node.querySelector(".rui-person-chip-name")?.textContent).toBe("Asha Patel");
    expect(node.querySelector(".rui-person-chip-role")?.textContent).toBe("Staff Engineer");
  });

  it("becomes a button when an action is provided", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = PersonChip.render(
      makeNode("PersonChip", []),
      { name: "Asha", onClick: action },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("button");
    (node as HTMLButtonElement).click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("Quote", () => {
  it("renders the text and citation", () => {
    const node = Quote.render(
      makeNode("Quote", []),
      { text: "Generative UI just shipped.", cite: "Ada Lovelace", tone: "primary" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-quote")).toBe(true);
    expect(node.getAttribute("data-tone")).toBe("primary");
    expect(node.querySelector(".rui-quote-text")?.textContent).toBe("Generative UI just shipped.");
    expect(node.querySelector(".rui-quote-cite")?.textContent).toBe("Ada Lovelace");
  });
});

describe("Rating", () => {
  it("renders the right number of stars and a label/count", () => {
    const node = Rating.render(
      makeNode("Rating", []),
      { value: 3.5, max: 5, label: "3.5", count: 124 },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-rating")).toBe(true);
    expect(node.querySelectorAll(".rui-rating-star")).toHaveLength(5);
    expect(node.querySelector(".rui-rating-label")?.textContent).toBe("3.5");
    expect(node.querySelector(".rui-rating-count")?.textContent).toBe("(124)");
    const stars = Array.from(node.querySelectorAll(".rui-rating-star"));
    expect(stars[0]?.getAttribute("data-fill")).toBe("full");
    expect(stars[2]?.getAttribute("data-fill")).toBe("full");
    expect(stars[3]?.getAttribute("data-fill")).toBe("half");
    expect(stars[4]?.getAttribute("data-fill")).toBe("empty");
    // Half stars use Font Awesome's dedicated half-stroke glyph rather
    // than the regular (empty) star — the previous gradient/text-clip
    // approach rendered a broken cut-off glyph for FA pseudo-elements.
    expect(stars[3]?.classList.contains("fa-star-half-stroke")).toBe(true);
    expect(stars[0]?.classList.contains("fa-star")).toBe(true);
    expect(stars[4]?.classList.contains("fa-star")).toBe(true);
    expect(stars[4]?.classList.contains("fa-regular")).toBe(true);
  });

  it("fires a Set action with the clicked rating when interactive", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const node = makeNode("Rating", [3], [{ stateRef: "stars" }]);
    const root = Rating.render(
      node,
      { value: 3, interactive: true },
      localHelpers,
    ) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.rui-rating-star"));
    expect(buttons).toHaveLength(5);
    buttons[4]?.click();
    expect(captured).toEqual({ name: "stars", value: 5 });
  });
});

describe("ProgressRing", () => {
  it("renders an SVG with the right percent label", () => {
    const node = ProgressRing.render(
      makeNode("ProgressRing", []),
      { value: 75, max: 100, caption: "completion" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-progress-ring")).toBe(true);
    expect(node.querySelector("svg.rui-progress-ring-svg")).not.toBeNull();
    expect(node.querySelector(".rui-progress-ring-value")?.textContent).toBe("75%");
    expect(node.querySelector(".rui-progress-ring-caption")?.textContent).toBe("completion");
  });

  it("renders an indeterminate ring", () => {
    const node = ProgressRing.render(
      makeNode("ProgressRing", []),
      { indeterminate: true },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-indeterminate")).toBe("true");
    expect(node.querySelector(".rui-progress-ring-value")?.textContent).toBe("…");
  });

  it("renders the label as a Font Awesome icon when it resolves to one", () => {
    const node = ProgressRing.render(
      makeNode("ProgressRing", []),
      { value: 100, max: 100, label: "circle-check", tone: "success" },
      helpers,
    ) as HTMLElement;
    const value = node.querySelector(".rui-progress-ring-value");
    const icon = value?.querySelector("i.rui-progress-ring-icon");
    expect(icon).not.toBeNull();
    expect(icon?.classList.contains("fa-circle-check")).toBe(true);
    expect(icon?.classList.contains("fa-solid")).toBe(true);
    expect(value?.textContent ?? "").not.toContain("circle-check");
  });

  it("keeps plain text labels intact (no icon rendering)", () => {
    const node = ProgressRing.render(
      makeNode("ProgressRing", []),
      { value: 60, max: 100, label: "On track" },
      helpers,
    ) as HTMLElement;
    const value = node.querySelector(".rui-progress-ring-value");
    expect(value?.querySelector("i.rui-progress-ring-icon")).toBeNull();
    expect(value?.textContent).toBe("On track");
  });
});

describe("ChatBubble", () => {
  it("renders body, author, and time on the correct lane", () => {
    const meNode = ChatBubble.render(
      makeNode("ChatBubble", []),
      { author: "You", body: "Hello there", time: "now", from: "me" },
      helpers,
    ) as HTMLElement;
    expect(meNode.getAttribute("data-from")).toBe("me");
    expect(meNode.querySelector(".rui-chat-bubble-author")?.textContent).toBe("You");
    expect(meNode.querySelector(".rui-chat-bubble-body")?.textContent).toBe("Hello there");
    expect(meNode.querySelector(".rui-chat-bubble-time")?.textContent).toBe("now");

    const agentNode = ChatBubble.render(
      makeNode("ChatBubble", []),
      { author: "Assistant", body: "Hi", from: "agent" },
      helpers,
    ) as HTMLElement;
    expect(agentNode.getAttribute("data-from")).toBe("agent");
    expect(agentNode.querySelector(".rui-chat-bubble-avatar")).not.toBeNull();
  });
});

describe("SearchBar", () => {
  it("renders an input with the right placeholder and shortcut", () => {
    const node = SearchBar.render(
      makeNode("SearchBar", ["q", "Find tickets…", "", "/"]),
      { id: "q", placeholder: "Find tickets…", value: "", shortcut: "/" },
      helpers,
    ) as HTMLFormElement;
    expect(node.classList.contains("rui-search-bar")).toBe(true);
    const input = node.querySelector<HTMLInputElement>("input.rui-search-bar-input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("placeholder")).toBe("Find tickets…");
    expect(node.querySelector(".rui-search-bar-shortcut")?.textContent).toBe("/");
    expect(node.querySelector("button.rui-search-bar-submit")).toBeNull();
  });

  it("renders a submit button and fires the action on submit", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const form = SearchBar.render(
      makeNode("SearchBar", ["q"]),
      { id: "q", onSubmit: action, submitLabel: "Go" },
      localHelpers,
    ) as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>("button.rui-search-bar-submit");
    expect(submit).not.toBeNull();
    expect(submit?.textContent).toBe("Go");
    form.dispatchEvent(new Event("submit"));
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("FollowUpBlock", () => {
  it("renders FollowUpItem ComponentNodes via positional args", () => {
    let capturedMessage: string | null = null;
    const localHelpers = {
      ...helpers,
      sendToAssistant: (message: string) => { capturedMessage = message; },
    };
    const itemNode = {
      __kind: "Component" as const,
      name: "FollowUpItem",
      args: ["Show invite link", "Show me how to invite teammates"],
      argMeta: [{}, {}],
    };

    const node = FollowUpBlock.render(
      { __kind: "Component", name: "FollowUpBlock", args: [[itemNode]], argMeta: [{}] },
      { items: [itemNode], title: "Try one of these" },
      localHelpers,
    ) as HTMLElement;

    const button = node.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("Show invite link");

    button!.click();
    expect(capturedMessage).toBe("Show me how to invite teammates");
  });

  it("falls back to label when message is omitted", () => {
    const itemNode = {
      __kind: "Component" as const,
      name: "FollowUpItem",
      args: ["Add a chart"],
      argMeta: [{}],
    };
    const node = FollowUpItem.render(
      itemNode,
      { label: "Add a chart" },
      helpers,
    ) as HTMLButtonElement;
    expect(node.textContent).toBe("Add a chart");
  });

  it("accepts plain string items", () => {
    const node = FollowUpBlock.render(
      { __kind: "Component", name: "FollowUpBlock", args: [["First", "Second"]], argMeta: [{}] },
      { items: ["First", "Second"] },
      helpers,
    ) as HTMLElement;
    const buttons = Array.from(node.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["First", "Second"]);
  });
});

describe("DropdownMenu", () => {
  it("renders trigger, items, separators, and labels", () => {
    const items = [
      makeNode("MenuLabel", ["Account"]),
      makeNode("MenuItem", ["Profile"]),
      makeNode("MenuItem", ["Settings", null, "gear", "⌘,"]),
      makeNode("MenuSeparator", []),
      makeNode("MenuItem", ["Sign out", null, null, null, "danger"]),
    ];
    const node = DropdownMenu.render(
      makeNode("DropdownMenu", ["Open", items]),
      { trigger: "Open", items },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-dropdown-menu")).toBe(true);
    expect(node.getAttribute("data-open")).toBe("false");
    expect(node.querySelector(".rui-menu-label")?.textContent).toBe("Account");
    expect(node.querySelectorAll(".rui-menu-separator")).toHaveLength(1);
    const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>(".rui-menu-item"));
    expect(buttons).toHaveLength(3);
    expect(buttons[1]?.querySelector(".rui-menu-item-shortcut")?.textContent).toBe("⌘,");
    expect(buttons[2]?.getAttribute("data-variant")).toBe("danger");
  });

  it("toggles open state when the trigger is clicked", () => {
    const items = [makeNode("MenuItem", ["Hello"])];
    const node = DropdownMenu.render(
      makeNode("DropdownMenu", ["Toggle", items]),
      { trigger: "Toggle", items },
      helpers,
    ) as HTMLElement;
    const trigger = node.querySelector<HTMLElement>(".rui-dropdown-menu-trigger");
    expect(trigger).not.toBeNull();
    // Trigger is wrapped in a <span>, not a nested <button>, to keep the HTML
    // valid when the user-provided trigger is itself a <button>.
    expect(trigger?.tagName).toBe("SPAN");
    trigger?.click();
    expect(node.getAttribute("data-open")).toBe("true");
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  });

  it("runs a MenuItem's action and closes the menu", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const items = [makeNode("MenuItem", ["Save", action])];
    const node = DropdownMenu.render(
      makeNode("DropdownMenu", ["Open", items]),
      { trigger: "Open", items },
      localHelpers,
    ) as HTMLElement;
    node.querySelector<HTMLElement>(".rui-dropdown-menu-trigger")?.click();
    expect(node.getAttribute("data-open")).toBe("true");
    node.querySelector<HTMLButtonElement>(".rui-menu-item")?.click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(node.getAttribute("data-open")).toBe("false");
  });

  it("disabled MenuItems do not fire actions", () => {
    const action = vi.fn();
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const items = [makeNode("MenuItem", ["Save", action, null, null, "default", true])];
    const node = DropdownMenu.render(
      makeNode("DropdownMenu", ["Open", items]),
      { trigger: "Open", items },
      localHelpers,
    ) as HTMLElement;
    const itemBtn = node.querySelector<HTMLButtonElement>(".rui-menu-item");
    expect(itemBtn?.disabled).toBe(true);
    itemBtn?.click();
    expect(action).not.toHaveBeenCalled();
  });
});

describe("Popover", () => {
  it("opens on trigger click and renders its content", () => {
    const node = Popover.render(
      makeNode("Popover", ["Open", ["Details"]]),
      { trigger: "Open", content: ["Body text"], title: "Filters" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-popover")).toBe(true);
    expect(node.getAttribute("data-open")).toBe("false");
    expect(node.querySelector(".rui-popover-title")?.textContent).toBe("Filters");
    node.querySelector<HTMLElement>(".rui-popover-trigger")?.click();
    expect(node.getAttribute("data-open")).toBe("true");
  });

  it("renders the trigger inside a span wrapper, not a nested <button>", () => {
    // Nesting <button> inside <button> is invalid HTML and silently swallows
    // clicks in some browsers. The wrapper must be a non-button element.
    const node = Popover.render(
      makeNode("Popover", ["Open", []]),
      { trigger: "Open", content: [] },
      helpers,
    ) as HTMLElement;
    const trigger = node.querySelector(".rui-popover-trigger");
    expect(trigger?.tagName).toBe("SPAN");
  });

  it("toggles closed when the trigger is clicked again", () => {
    const node = Popover.render(
      makeNode("Popover", ["Open", []]),
      { trigger: "Open", content: [] },
      helpers,
    ) as HTMLElement;
    const trigger = node.querySelector<HTMLElement>(".rui-popover-trigger");
    trigger?.click();
    expect(node.getAttribute("data-open")).toBe("true");
    trigger?.click();
    expect(node.getAttribute("data-open")).toBe("false");
  });

  it("renders an always-on close (×) button that closes the popover", () => {
    const node = Popover.render(
      makeNode("Popover", ["Open", []]),
      { trigger: "Open", content: [] },
      helpers,
    ) as HTMLElement;
    const trigger = node.querySelector<HTMLElement>(".rui-popover-trigger");
    trigger?.click();
    expect(node.getAttribute("data-open")).toBe("true");
    const closeBtn = node.querySelector<HTMLButtonElement>(".rui-popover-close");
    expect(closeBtn).not.toBeNull();
    closeBtn?.click();
    expect(node.getAttribute("data-open")).toBe("false");
  });
});

describe("Toast & Toast", () => {
  it("Toast renders title, message, and tone-based icon", () => {
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Saved", message: "Changes applied", tone: "success" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-tone")).toBe("success");
    expect(node.querySelector(".rui-toast-title")?.textContent).toBe("Saved");
    expect(node.querySelector(".rui-toast-message")?.textContent).toBe("Changes applied");
    const icon = node.querySelector(".rui-toast-icon");
    expect(icon?.classList.contains("fa-circle-check")).toBe(true);
  });

  it("Toast always renders a close (×) button, even without onClose", () => {
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Done" },
      helpers,
    ) as HTMLElement;
    const closeBtn = node.querySelector<HTMLButtonElement>(".rui-toast-close");
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute("aria-label")).toBe("Dismiss notification");
  });

  it("Toast fires onClose action via the close button", () => {
    const onClose = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Done", onClose },
      localHelpers,
    ) as HTMLElement;
    node.querySelector<HTMLButtonElement>(".rui-toast-close")?.click();
    expect(invokedWith).toBe(onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(node.classList.contains("is-dismissed")).toBe(true);
  });

  it("Toast auto-dismisses after the configured duration", async () => {
    const onClose = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Saved", duration: 20, onClose },
      localHelpers,
    ) as HTMLElement;
    // Hosted in the document so `root.isConnected` is true when the timer fires.
    document.body.appendChild(node);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invokedWith).toBe(onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(node.classList.contains("is-dismissed")).toBe(true);
    node.remove();
  });

  it("Toast without duration does not auto-dismiss", async () => {
    const onClose = vi.fn();
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Persistent", onClose },
      localHelpers,
    ) as HTMLElement;
    document.body.appendChild(node);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onClose).not.toHaveBeenCalled();
    expect(node.classList.contains("is-dismissed")).toBe(false);
    node.remove();
  });

  it("Toast pins itself to a viewport corner when position is set", () => {
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Saved", position: "bottom-right" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-toast")).toBe(true);
    expect(node.getAttribute("data-position")).toBe("bottom-right");
  });
});

describe("Slider", () => {
  it("clamps the rendered value within min/max bounds and binds to state", () => {
    let bound: { name: string; event: string } | null = null;
    const localHelpers = {
      ...helpers,
      bindState: (_el: HTMLElement, name: string, opts?: { event?: string }) => {
        bound = { name, event: opts?.event ?? "input" };
      },
    };
    const node = makeNode("Slider", ["vol", 0, 100, 5, 60], [{}, {}, {}, {}, { stateRef: "volume" }]);
    const root = Slider.render(
      node,
      { id: "vol", min: 0, max: 100, step: 5, value: 60, label: "Volume", showValue: true },
      localHelpers,
    ) as HTMLElement;
    expect(root.classList.contains("rui-slider")).toBe(true);
    const input = root.querySelector<HTMLInputElement>("input.rui-slider-input");
    expect(input?.value).toBe("60");
    expect(input?.min).toBe("0");
    expect(input?.max).toBe("100");
    expect(root.querySelector(".rui-slider-value")?.textContent).toBe("60");
    expect(bound).toEqual({ name: "volume", event: "input" });
  });

  it("updates the value pill via event.currentTarget so the DOM-reconciled handler still works", () => {
    // Regression: a previous implementation captured `root` and `input`
    // by closure. After morph copies `oninput` onto the live DOM node, those
    // captured references point at the detached fresh tree, so dragging
    // never updates the pill. The fix resolves both via the event target.
    const node = makeNode("Slider", ["vol", 0, 100, 5, 30], [{}, {}, {}, {}, {}]);
    const root = Slider.render(
      node,
      { id: "vol", min: 0, max: 100, step: 5, value: 30, showValue: true },
      helpers,
    ) as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("input.rui-slider-input")!;
    const pill = root.querySelector<HTMLElement>(".rui-slider-value")!;
    expect(pill.textContent).toBe("30");
    // Simulate a drag: the user changes the value and the browser fires
    // `input` on the live element.
    input.value = "75";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(pill.textContent).toBe("75");
  });
});

describe("NumberInput", () => {
  it("increments the bound value by the configured step within bounds", () => {
    const node = makeNode("NumberInput", ["qty", 5, 0, 10, 1], [{}, { stateRef: "qty" }, {}, {}, {}]);
    const root = NumberInput.render(
      node,
      { id: "qty", value: 5, min: 0, max: 10, step: 1 },
      helpers,
    ) as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("input");
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons).toHaveLength(2);
    expect(input?.value).toBe("5");
    buttons[1]?.click(); // increment
    expect(input?.value).toBe("6");
    buttons[0]?.click(); // decrement
    expect(input?.value).toBe("5");
  });

  it("clamps to max even when the step would overflow", () => {
    const node = makeNode("NumberInput", ["qty", 9, 0, 10, 5], [{}, { stateRef: "qty" }, {}, {}, {}]);
    const root = NumberInput.render(
      node,
      { id: "qty", value: 9, min: 0, max: 10, step: 5 },
      helpers,
    ) as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("input");
    const incBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))[1];
    incBtn?.click();
    expect(input?.value).toBe("10");
  });
});

describe("DatePicker", () => {
  it("renders a date input with min/max bounds", () => {
    const node = DatePicker.render(
      makeNode("DatePicker", ["dob", "2024-01-15"]),
      { id: "dob", value: "2024-01-15", min: "2000-01-01", max: "2030-01-01", label: "Date" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-date-picker")).toBe(true);
    expect(node.querySelector(".rui-date-picker-label")?.textContent).toBe("Date");
    const input = node.querySelector<HTMLInputElement>("input");
    expect(input?.getAttribute("type")).toBe("date");
    expect(input?.getAttribute("min")).toBe("2000-01-01");
    expect(input?.getAttribute("max")).toBe("2030-01-01");
    expect(input?.getAttribute("value")).toBe("2024-01-15");
  });
});

describe("FileUpload", () => {
  it("fires the action when a file is picked", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = FileUpload.render(
      makeNode("FileUpload", ["avatar"]),
      { id: "avatar", label: "Drop a photo", accept: "image/*", onSelect: action },
      localHelpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-file-upload")).toBe(true);
    expect(node.querySelector(".rui-file-upload-label")?.textContent).toBe("Drop a photo");
    const input = node.querySelector<HTMLInputElement>("input");
    expect(input?.getAttribute("type")).toBe("file");
    expect(input?.getAttribute("accept")).toBe("image/*");
    input?.dispatchEvent(new Event("change"));
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("Combobox", () => {
  it("renders the selected label and filters matching options on type", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const items = [
      makeNode("SelectItem", ["us", "United States"]),
      makeNode("SelectItem", ["uk", "United Kingdom"]),
      makeNode("SelectItem", ["ca", "Canada"]),
    ];
    const node = makeNode("Combobox", ["country", items, "us"], [{}, {}, { stateRef: "country" }]);
    const root = Combobox.render(
      node,
      { id: "country", items, value: "us" },
      localHelpers,
    ) as HTMLElement;
    expect(root.classList.contains("rui-combobox")).toBe(true);
    expect(root.querySelector(".rui-combobox-value")?.textContent).toBe("United States");

    // Open the panel and filter for "kingdom"
    const trigger = root.querySelector<HTMLButtonElement>(".rui-combobox-trigger");
    trigger?.click();
    expect(root.getAttribute("data-open")).toBe("true");

    const filter = root.querySelector<HTMLInputElement>(".rui-combobox-filter");
    if (filter) {
      filter.value = "kingdom";
      filter.dispatchEvent(new Event("input"));
    }
    const visible = Array.from(root.querySelectorAll<HTMLButtonElement>(".rui-combobox-option"));
    expect(visible.map((b) => b.textContent)).toEqual(["United Kingdom"]);

    // Picking an option fires a setState with the new value
    visible[0]?.click();
    expect(captured).toEqual({ name: "country", value: "uk" });
  });
});

describe("Tree & TreeNode", () => {
  it("Tree renders TreeNode children", () => {
    const items = [
      makeNode("TreeNode", ["src", [makeNode("TreeNode", ["index.ts"])]]),
      makeNode("TreeNode", ["README.md"]),
    ];
    const node = Tree.render(
      makeNode("Tree", []),
      { items },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-tree")).toBe(true);
    expect(node.querySelectorAll(".rui-stub").length).toBe(2);
  });

  it("TreeNode renders a leaf when no children are provided", () => {
    const node = TreeNode.render(
      makeNode("TreeNode", ["index.ts", null, "file"]),
      { label: "index.ts", icon: "file" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-tree-node-row")).toBe(true);
    expect(node.querySelector(".rui-tree-node-label")?.textContent).toBe("index.ts");
  });

  it("TreeNode renders a <details> branch when children are provided", () => {
    const child = makeNode("TreeNode", ["index.ts"]);
    const node = TreeNode.render(
      makeNode("TreeNode", ["src", [child], "folder", true]),
      { label: "src", children: [child], icon: "folder", expanded: true, badge: "12" },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("details");
    expect(node.hasAttribute("open")).toBe(true);
    expect(node.querySelector(".rui-tree-node-label")?.textContent).toBe("src");
    expect(node.querySelector(".rui-tree-node-badge")?.textContent).toBe("12");
  });

  it("TreeNode runs its action on click", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = TreeNode.render(
      makeNode("TreeNode", ["index.ts"]),
      { label: "index.ts", onClick: action },
      localHelpers,
    ) as HTMLElement;
    (node as HTMLButtonElement).click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("Navbar & NavbarItem", () => {
  it("Navbar renders brand, items, and actions", () => {
    const items = [
      makeNode("NavbarItem", ["Home"]),
      makeNode("NavbarItem", ["Docs"]),
    ];
    const actions = [makeNode("Button", ["Sign in"])];
    const node = Navbar.render(
      makeNode("Navbar", []),
      { brand: "Acme", items, actions, sticky: true },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-navbar")).toBe(true);
    expect(node.getAttribute("data-sticky")).toBe("true");
    expect(node.querySelector(".rui-navbar-brand")?.textContent).toBe("Acme");
    expect(node.querySelectorAll(".rui-navbar-items > .rui-stub").length).toBe(2);
    expect(node.querySelectorAll(".rui-navbar-actions > .rui-stub").length).toBe(1);
  });

  it("NavbarItem marks active and navigates on click when `to` is set", () => {
    let navigatedTo: string | null = null;
    const router = new Router();
    router.navigate = (path: string) => { navigatedTo = path; };
    const localHelpers = { ...helpers, router };
    const node = NavbarItem.render(
      makeNode("NavbarItem", ["Docs", "/docs"]),
      { label: "Docs", to: "/docs", active: true, icon: "book" },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("a");
    expect(node.getAttribute("data-active")).toBe("true");
    const navIcon = node.querySelector(".rui-navbar-item-icon");
    expect(navIcon?.classList.contains("fa-book")).toBe(true);
    (node as HTMLAnchorElement).click();
    expect(navigatedTo).toBe("/docs");
  });

  it("MenuItem (standalone) renders a button with icon and shortcut", () => {
    const action = vi.fn();
    let invokedWith: unknown = null;
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => {
        invokedWith = fn;
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
    };
    const node = MenuItem.render(
      makeNode("MenuItem", ["Save", action, "save", "⌘S"]),
      { label: "Save", onClick: action, icon: "save", shortcut: "⌘S" },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("button");
    expect(node.querySelector(".rui-menu-item-label")?.textContent).toBe("Save");
    expect(node.querySelector(".rui-menu-item-shortcut")?.textContent).toBe("⌘S");
    (node as HTMLButtonElement).click();
    expect(invokedWith).toBe(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("MenuSeparator and MenuLabel render the expected elements", () => {
    const sep = MenuSeparator.render(makeNode("MenuSeparator", []), {}, helpers) as HTMLElement;
    expect(sep.classList.contains("rui-menu-separator")).toBe(true);
    expect(sep.getAttribute("role")).toBe("separator");
    const label = MenuLabel.render(
      makeNode("MenuLabel", ["Workspace"]),
      { label: "Workspace" },
      helpers,
    ) as HTMLElement;
    expect(label.classList.contains("rui-menu-label")).toBe(true);
    expect(label.textContent).toBe("Workspace");
  });
});

describe("new components — phase 1-4 rollout", () => {
  it("Spinner renders a ring + optional label and announces via aria-label", () => {
    const node = Spinner.render(
      makeNode("Spinner", ["lg", "Loading data"]),
      { size: "lg", label: "Loading data" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-spinner")).toBe(true);
    expect(node.getAttribute("data-size")).toBe("lg");
    expect(node.getAttribute("aria-label")).toBe("Loading data");
    expect(node.querySelector(".rui-spinner-ring")).not.toBeNull();
    expect(node.querySelector(".rui-spinner-label")?.textContent).toBe("Loading data");
  });

  it("Spinner without label defaults to aria-label=\"Loading\"", () => {
    const node = Spinner.render(
      makeNode("Spinner", []), {}, helpers,
    ) as HTMLElement;
    expect(node.getAttribute("aria-label")).toBe("Loading");
    expect(node.querySelector(".rui-spinner-label")).toBeNull();
  });

  it("Sparkline renders an SVG line + area for 2+ values", () => {
    const node = Sparkline.render(
      makeNode("Sparkline", [[1, 3, 2, 5, 4], "success"]),
      { values: [1, 3, 2, 5, 4], tone: "success" },
      helpers,
    ) as HTMLElement;
    const svg = node.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("data-tone")).toBe("success");
    expect(svg?.querySelector(".rui-sparkline-line")).not.toBeNull();
    expect(svg?.querySelector(".rui-sparkline-area")).not.toBeNull();
  });

  it("Sparkline renders empty SVG when only one value", () => {
    const node = Sparkline.render(
      makeNode("Sparkline", [[42]]),
      { values: [42] },
      helpers,
    ) as HTMLElement;
    const svg = node.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector(".rui-sparkline-line")).toBeNull();
  });

  it("StatCard.spark renders an inline sparkline when given values", () => {
    const node = StatCard.render(
      makeNode("StatCard", ["Active", "12", "up", "+2", "users", [1, 2, 3]]),
      { label: "Active", value: "12", trend: "up", delta: "+2", icon: "users", spark: [1, 2, 3] },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-stat-spark svg")).not.toBeNull();
  });

  it("Badge with size + icon honors the tone prop (variant alias supported)", () => {
    const node = Badge.render(
      makeNode("Badge", ["New", "primary", "star", "sm"]),
      { label: "New", tone: "primary", icon: "star", size: "sm" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-variant")).toBe("primary");
    expect(node.getAttribute("data-size")).toBe("sm");
    expect(node.querySelector(".rui-badge-label")?.textContent).toBe("New");
  });

  it("BadgeList renders Badge pills from a labels[] array", () => {
    const list = BadgeList.render(
      makeNode("BadgeList", [["alpha", "beta"]]),
      { labels: ["alpha", "beta"] },
      helpers,
    ) as HTMLElement;
    expect(list.classList.contains("rui-badge-list")).toBe(true);
    expect(list.querySelectorAll(".rui-badge").length).toBe(2);
    expect(list.querySelectorAll(".rui-badge-label")[0]?.textContent).toBe("alpha");
  });

  it("Callout(compact=true) marks the wrapper as compact", () => {
    const node = Callout.render(
      makeNode("Callout", ["info", "Heads up", "Saved!", null, true]),
      { tone: "info", title: "Heads up", description: "Saved!", compact: true },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-compact")).toBe("true");
    expect(node.querySelector(".rui-callout-description")?.textContent).toBe("Saved!");
  });

  it("Separator(label) renders the label segment between two lines", () => {
    const node = Separator.render(
      makeNode("Separator", ["horizontal", "OR"]),
      { orientation: "horizontal", label: "OR" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-separator-with-label")).toBe(true);
    expect(node.querySelector(".rui-separator-label")?.textContent).toBe("OR");
  });

  it("CodeBlock renders a Copy button and a language label", () => {
    const node = CodeBlock.render(
      makeNode("CodeBlock", ["ts", "const x = 1"]),
      { language: "ts", codeString: "const x = 1" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-code-block-language")?.textContent).toBe("ts");
    expect(node.querySelector(".rui-code-block-copy")).not.toBeNull();
    expect(node.querySelector("code")?.textContent).toBe("const x = 1");
  });

  it("CodeBlock(showLineNumbers + highlightLines) renders a gutter and highlights", () => {
    const code = "a\nb\nc\nd\ne";
    const node = CodeBlock.render(
      makeNode("CodeBlock", ["", code, true, "2-3"]),
      { codeString: code, showLineNumbers: true, highlightLines: "2-3" },
      helpers,
    ) as HTMLElement;
    const lines = node.querySelectorAll(".rui-code-block-line");
    expect(lines.length).toBe(5);
    expect(lines[1]?.getAttribute("data-highlight")).toBe("true");
    expect(lines[2]?.getAttribute("data-highlight")).toBe("true");
    expect(lines[0]?.getAttribute("data-highlight")).toBeNull();
    expect(node.querySelectorAll(".rui-code-block-gutter").length).toBe(5);
  });

  it("Modal renders a × close button by default and a footer slot when provided", () => {
    const footerBtn = makeNode("Button", ["OK"]);
    const node = Modal.render(
      makeNode("Modal", ["Dialog", true, [], "lg", [footerBtn]], [
        {}, { stateRef: "open" }, {}, {}, {},
      ]),
      { title: "Dialog", open: true, children: [], size: "lg", footer: [footerBtn] },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-modal-overlay")).toBe(true);
    expect(node.querySelector(".rui-modal")?.getAttribute("data-size")).toBe("lg");
    expect(node.querySelector(".rui-modal-close")).not.toBeNull();
    expect(node.querySelector(".rui-modal-footer")).not.toBeNull();
  });

  it("Modal(closable=false) hides the × button", () => {
    const node = Modal.render(
      makeNode("Modal", ["t", true, []], [{}, { stateRef: "open" }, {}]),
      { title: "t", open: true, children: [], closable: false },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-modal-close")).toBeNull();
  });

  it("Image(ratio,fit) applies aspect-ratio + data-fit and renders a placeholder for missing src", () => {
    const node = Image.render(
      makeNode("Image", ["", "alt", "cap", "16:9", "contain", "image"]),
      { src: "", alt: "alt", caption: "cap", ratio: "16:9", fit: "contain", fallback: "image" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-fit")).toBe("contain");
    expect(node.getAttribute("style") ?? "").toContain("aspect-ratio:16 / 9");
    expect(node.querySelector(".rui-image-placeholder")).not.toBeNull();
    expect(node.querySelector("figcaption")?.textContent).toBe("cap");
  });

  it("Skeleton variants pick the right shape primitives", () => {
    const card = Skeleton.render(
      makeNode("Skeleton", ["card"]),
      { variant: "card" }, helpers,
    ) as HTMLElement;
    expect(card.getAttribute("data-variant")).toBe("card");
    expect(card.querySelectorAll(".rui-skeleton-line").length).toBe(3);
    const avatar = Skeleton.render(
      makeNode("Skeleton", ["avatar", undefined, undefined, undefined, "32px"]),
      { variant: "avatar", width: "32px" }, helpers,
    ) as HTMLElement;
    expect(avatar.querySelector(".rui-skeleton-shape")?.getAttribute("data-shape")).toBe("circle");
  });

  it("MultiSelect renders chip-trigger + filter + options and selected chips removal", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const items = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    const node = MultiSelect.render(
      makeNode("MultiSelect", ["filter", items, ["a"]], [{}, {}, { stateRef: "picks" }]),
      { id: "filter", items, value: ["a"] },
      localHelpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-multiselect")).toBe(true);
    expect(node.querySelector(".rui-multiselect-chip-label")?.textContent).toBe("Alpha");
    const removeBtn = node.querySelector(".rui-multiselect-chip-remove") as HTMLButtonElement;
    removeBtn.click();
    expect(captured).toEqual({ name: "picks", value: [] });
  });

  it("ToggleGroup marks the active option + sets the bound state on click", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const items = [
      { value: "grid", label: "Grid", icon: "grip" },
      { value: "list", label: "List" },
    ];
    const node = ToggleGroup.render(
      makeNode("ToggleGroup", ["view", items, "grid"], [{}, {}, { stateRef: "view" }]),
      { id: "view", items, value: "grid" },
      localHelpers,
    ) as HTMLElement;
    const buttons = node.querySelectorAll<HTMLButtonElement>(".rui-toggle");
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.getAttribute("aria-checked")).toBe("true");
    buttons[1]?.click();
    expect(captured).toEqual({ name: "view", value: "list" });
  });

  it("DateRangePicker renders two date inputs with shared min/max", () => {
    const node = DateRangePicker.render(
      makeNode("DateRangePicker", ["dr", "2026-05-01", "2026-05-15", "Range", "2026-01-01", "2026-12-31"], [
        {}, { stateRef: "from" }, { stateRef: "to" }, {}, {}, {},
      ]),
      { id: "dr", from: "2026-05-01", to: "2026-05-15", label: "Range", min: "2026-01-01", max: "2026-12-31" },
      helpers,
    ) as HTMLElement;
    const inputs = node.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(inputs.length).toBe(2);
    expect(inputs[0]?.getAttribute("min")).toBe("2026-01-01");
    expect(inputs[1]?.getAttribute("max")).toBe("2026-12-31");
  });

  it("Pagination(total,perPage) renders the summary line", () => {
    const node = Pagination.render(
      makeNode("Pagination", [2, 5, 1, 123, 25], [{ stateRef: "page" }, {}, {}, {}, { stateRef: "perPage" }]),
      { page: 2, totalPages: 5, siblings: 1, total: 123, perPage: 25 },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-pagination-summary")?.textContent ?? "").toContain("Showing 26");
    expect(node.querySelector(".rui-pagination-summary")?.textContent ?? "").toContain("of 123");
    expect(node.querySelector(".rui-pagination-per-page-select")).not.toBeNull();
  });

  it("Pagination(compact) hides the numbered page row and shows current/total", () => {
    const node = Pagination.render(
      makeNode("Pagination", [3, 10, 1, undefined, undefined, undefined, true], [{ stateRef: "p" }, {}, {}, {}, {}, {}, {}]),
      { page: 3, totalPages: 10, compact: true },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-compact")).toBe("true");
    expect(node.querySelector(".rui-pagination-current")?.textContent).toBe("3 / 10");
  });

  it("Progress(segments) renders an N-segment strip with the right fill count", () => {
    const node = Progress.render(
      makeNode("Progress", [60, 100, "Step 3 of 5", "primary", false, true, 5]),
      { value: 60, max: 100, segments: 5, showValue: true, label: "Step 3 of 5" },
      helpers,
    ) as HTMLElement;
    const segs = node.querySelectorAll<HTMLElement>(".rui-progress-segment");
    expect(segs.length).toBe(5);
    expect([...segs].filter((s) => s.getAttribute("data-filled") === "true").length).toBe(3);
    expect(node.querySelector(".rui-progress-value")?.textContent).toBe("3 / 5");
  });

  it("Progress(buffered) renders a buffer bar behind the bar", () => {
    const node = Progress.render(
      makeNode("Progress", [40, 100, undefined, undefined, false, false, undefined, 75]),
      { value: 40, max: 100, buffered: 75 },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-progress-buffer")).not.toBeNull();
  });

  it("Table(density,striped,sticky,align,emptyLabel) wires through to the wrapper", () => {
    const col = makeNode("Col", ["Name", ["Ada"], "text", "right"]);
    const node = Table.render(
      makeNode("Table", [[col], "People", "compact", true, true, "Nothing yet"]),
      { columns: [col], caption: "People", density: "compact", striped: true, sticky: true, emptyLabel: "Nothing yet" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-density")).toBe("compact");
    expect(node.getAttribute("data-striped")).toBe("true");
    expect(node.getAttribute("data-sticky")).toBe("true");
    expect(node.querySelector("td")?.getAttribute("data-align")).toBe("right");
  });

  it("Table renders the emptyLabel when no rows", () => {
    const col = makeNode("Col", ["Name", []]);
    const node = Table.render(
      makeNode("Table", [[col], undefined, undefined, undefined, undefined, "No people"]),
      { columns: [col], emptyLabel: "No people" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-table-empty")?.textContent).toBe("No people");
  });

  it("Table renders a component node passed directly as a cell value", () => {
    const badge = makeNode("Badge", ["Active"]);
    // Col args: header, values, format, align, sortable, filterable, render, onClick
    const col = makeNode("Col", ["Status", [badge]]);
    const node = Table.render(
      makeNode("Table", [[col]]),
      { columns: [col] },
      helpers,
    ) as HTMLElement;
    const cellStub = node.querySelector("td .rui-stub");
    expect(cellStub).not.toBeNull();
    expect(cellStub?.getAttribute("data-component-name")).toBe("Badge");
  });

  it("Table Col render() maps each value to a component cell", () => {
    const rows = [{ id: 1, name: "Ada" }, { id: 2, name: "Lin" }];
    const render = (row: { id: number }) => makeNode("Button", [`Edit ${row.id}`]);
    const col = makeNode("Col", ["Actions", rows, undefined, undefined, undefined, undefined, render]);
    const node = Table.render(
      makeNode("Table", [[col]]),
      { columns: [col] },
      helpers,
    ) as HTMLElement;
    const stubs = node.querySelectorAll("tbody td .rui-stub");
    expect(stubs.length).toBe(2);
    expect(stubs[0]?.getAttribute("data-component-name")).toBe("Button");
  });

  it("Table Col onClick makes cells clickable and fires with (value, rowIndex)", () => {
    const calls: Array<{ value: unknown; index: unknown }> = [];
    const localHelpers = {
      ...helpers,
      invoke: (fn: unknown, ...args: unknown[]) => { calls.push({ value: args[0], index: args[1] }); },
    };
    const onClick = noop; // identity placeholder — invoke is intercepted
    const col = makeNode("Col", ["Name", ["Ada", "Lin"], undefined, undefined, undefined, undefined, undefined, onClick]);
    const node = Table.render(
      makeNode("Table", [[col]]),
      { columns: [col] },
      localHelpers,
    ) as HTMLElement;
    const cells = node.querySelectorAll<HTMLElement>("tbody td[data-clickable='true']");
    expect(cells.length).toBe(2);
    expect(cells[1]?.getAttribute("role")).toBe("button");
    cells[1]!.onclick?.(new MouseEvent("click"));
    expect(calls).toEqual([{ value: "Lin", index: 1 }]);
  });

  it("Rating(halfStep) emits a half value when clicking the left half of a star", () => {
    let captured: { name: string; value: unknown } | null = null;
    const localHelpers = {
      ...helpers,
      setState: (name: string, value: unknown) => { captured = { name, value }; },
    };
    const node = Rating.render(
      makeNode("Rating", [0, 5, undefined, undefined, "md", true, true], [{ stateRef: "score" }, {}, {}, {}, {}, {}, {}]),
      { value: 0, max: 5, interactive: true, halfStep: true },
      localHelpers,
    ) as HTMLElement;
    const star = node.querySelectorAll<HTMLButtonElement>(".rui-rating-star")[2];
    expect(star).toBeDefined();
    // Simulate a click on the left half of the 3rd star by faking the bounding rect.
    if (!star) return;
    const fakeRect = { left: 0, width: 20 } as DOMRect;
    star.getBoundingClientRect = () => fakeRect;
    star.dispatchEvent(new MouseEvent("click", { clientX: 5, bubbles: true }));
    expect(captured).toEqual({ name: "score", value: 2.5 });
  });

  it("Toast(position) marks itself as standalone with the corner anchor", () => {
    const node = Toast.render(
      makeNode("Toast", ["Saved", "Doc saved.", "success", undefined, undefined, undefined, undefined, "bottom-right"]),
      { title: "Saved", message: "Doc saved.", tone: "success", position: "bottom-right" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-toast-standalone")).toBe(true);
    expect(node.getAttribute("data-position")).toBe("bottom-right");
  });

  it("EmptyState(actions) renders a CTA row and prefers illustration over icon", () => {
    const primary = makeNode("Button", ["Create"]);
    const secondary = makeNode("Button", ["Learn more"]);
    const node = EmptyState.render(
      makeNode("EmptyState", ["No projects", "Create your first project.", "folder", "https://example.com/i.png", undefined, [primary, secondary]]),
      { title: "No projects", description: "Create your first project.", icon: "folder", illustration: "https://example.com/i.png", actions: [primary, secondary] },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-empty-state-illustration")).not.toBeNull();
    expect(node.querySelectorAll(".rui-empty-state-actions > *").length).toBe(2);
  });

  it("Toolbar(center) renders the center slot when provided", () => {
    const item = makeNode("Button", ["Filter"]);
    const node = Toolbar.render(
      makeNode("Toolbar", [[], [], [item]]),
      { left: [], right: [], center: [item] },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-has-center")).toBe("true");
    expect(node.querySelector(".rui-toolbar-center")).not.toBeNull();
  });

  it("Markdown renders headings, fenced code, ordered lists, and auto-linked URLs", () => {
    const md = [
      "# Heading",
      "",
      "Visit https://example.com today.",
      "",
      "1. first",
      "2. second",
      "",
      "```js",
      "console.log('hi')",
      "```",
    ].join("\n");
    const node = Markdown.render(
      makeNode("Markdown", [md]),
      { content: md },
      helpers,
    ) as HTMLElement;
    const html = node.innerHTML;
    expect(html).toContain("<h1");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<ol>");
    expect(html).toContain('<pre class="rui-markdown-code"');
  });

  it("Markdown sanitises javascript: links and images", () => {
    const node = Markdown.render(
      makeNode("Markdown", ["[bad](javascript:alert(1)) ![x](javascript:1)"]),
      { content: "[bad](javascript:alert(1)) ![x](javascript:1)" },
      helpers,
    ) as HTMLElement;
    const html = node.innerHTML;
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("Steps accepts {title, details, active} objects", async () => {
    const { Steps } = await import("../src/library/components/layout.js");
    const node = Steps.render(
      makeNode("Steps", [[{ title: "Sign up", details: "Free", active: true }, { title: "Verify" }]]),
      { items: [{ title: "Sign up", details: "Free", active: true }, { title: "Verify" }] },
      helpers,
    ) as HTMLElement;
    const items = node.querySelectorAll<HTMLElement>(".rui-steps-item");
    expect(items.length).toBe(2);
    expect(items[0]?.getAttribute("data-active")).toBe("true");
    expect(items[1]?.getAttribute("data-active")).toBe("false");
  });

  it("TabItem badge + icon attach to the rendered trigger", () => {
    const t1 = makeNode("TabItem", ["one", "One", [], "3", "house"]);
    const t2 = makeNode("TabItem", ["two", "Two", []]);
    const node = Tabs.render(
      makeNode("Tabs", [[t1, t2], "one", "horizontal"]),
      { items: [t1, t2], defaultValue: "one", orientation: "horizontal" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-orientation")).toBe("horizontal");
    const firstBadge = node.querySelector(".rui-tab-trigger-badge");
    expect(firstBadge?.textContent).toBe("3");
  });

  it("Button accepts both legacy and canonical size tokens", () => {
    const a = Button.render(
      makeNode("Button", ["Save", null, "primary", "button", "small"]),
      { label: "Save", variant: "primary", size: "small" },
      helpers,
    ) as HTMLElement;
    const b = Button.render(
      makeNode("Button", ["Save", null, "primary", "button", "sm"]),
      { label: "Save", variant: "primary", size: "sm" },
      helpers,
    ) as HTMLElement;
    expect(a.getAttribute("data-size")).toBe("sm");
    expect(b.getAttribute("data-size")).toBe("sm");
  });
});

/* ----------------------------------------------------------------------- *
 * Advanced components (DataGrid, CalendarView, Carousel, MultiStepForm, …)
 * ----------------------------------------------------------------------- */

import {
  DataGrid, CalendarView, ComparisonTable, ActivityLog, InfiniteList,
} from "../src/library/components/advanced-data.js";
import {
  Carousel, Gallery, Lightbox, VideoPlayer, AudioPlayer, Map as MapComponent,
} from "../src/library/components/media.js";
import { RichTextEditor, CodeEditor, ContextMenu, ColorPicker } from "../src/library/components/editors.js";
import { LineChart } from "../src/library/components/charts.js";
import {
  Gauge, Heatmap, RadarChart, ScatterChart, Histogram,
} from "../src/library/components/advanced-charts.js";
import {
  PinInput, PasswordInput, TagInput, MentionInput,
  TimePicker, DateTimePicker, MaskedInput, FormSection, FieldSet,
  ValidationSummary, MultiStepForm,
} from "../src/library/components/advanced-forms.js";
import {
  InboxPanel, OnboardingChecklist, LoadingState, ErrorState, SuccessState,
  Tour, Spotlight, ResizablePanels, MasonryGrid, TopBar,
  Sticky,
} from "../src/library/components/advanced-patterns.js";

/** Smoke-test every newly-added component renders without crashing. */
const ADVANCED_SMOKE_TESTS: Array<{
  name: string;
  spec: import("../src/library/types.js").ComponentSpec;
  props: Record<string, unknown>;
  rootClass: string;
}> = [
  {
    name: "DataGrid",
    spec: DataGrid,
    props: {
      cols: [makeNode("Col", ["Name", ["Alice", "Bob"], undefined, undefined, true])],
      page: 1,
      perPage: 5,
      selectedIds: [],
    },
    rootClass: "rui-data-grid",
  },
  {
    name: "CalendarView",
    spec: CalendarView,
    props: { month: "2026-05", value: "2026-05-17", events: [] },
    rootClass: "rui-calendar",
  },
  {
    name: "ComparisonTable",
    spec: ComparisonTable,
    props: {
      columns: ["Free", "Pro"],
      rows: [{ label: "SSO", values: [false, true] }],
    },
    rootClass: "rui-comparison-table",
  },
  {
    name: "InfiniteList",
    spec: InfiniteList,
    props: { items: [makeNode("ListItem", ["one"])], hasMore: true },
    rootClass: "rui-infinite-list",
  },
  {
    name: "Carousel",
    spec: Carousel,
    props: { items: [{ src: "a.png" }, { src: "b.png" }, { src: "c.png" }] },
    rootClass: "rui-carousel",
  },
  {
    name: "Gallery",
    spec: Gallery,
    props: { items: [{ src: "a.png", caption: "A" }] },
    rootClass: "rui-gallery",
  },
  {
    name: "Lightbox",
    spec: Lightbox,
    props: { open: true, index: 0, items: [{ src: "a.png" }] },
    // Lightbox returns a `rui-lightbox-root` wrapper that contains both
    // the optional thumbnail and the overlay (rui-lightbox-overlay).
    rootClass: "rui-lightbox-root",
  },
  {
    name: "VideoPlayer",
    spec: VideoPlayer,
    props: { src: "https://example.com/clip.mp4" },
    rootClass: "rui-video-player",
  },
  {
    name: "AudioPlayer",
    spec: AudioPlayer,
    props: { src: "https://example.com/track.mp3" },
    rootClass: "rui-audio-player",
  },
  {
    name: "Map",
    spec: MapComponent,
    props: { lat: 48.85, lng: 2.35, zoom: 12 },
    rootClass: "rui-map",
  },
  {
    name: "RichTextEditor",
    spec: RichTextEditor,
    props: { id: "editor", value: "<p>hi</p>" },
    rootClass: "rui-rich-text",
  },
  {
    name: "CodeEditor",
    spec: CodeEditor,
    props: { id: "code", value: "a\nb\nc" },
    rootClass: "rui-code-editor",
  },
  {
    name: "ContextMenu",
    spec: ContextMenu,
    props: { target: makeNode("Card", []), items: [{ label: "Open" }] },
    rootClass: "rui-context-menu",
  },
  {
    name: "ColorPicker",
    spec: ColorPicker,
    props: { id: "color", value: "#ff00aa", swatches: ["#ff0000"] },
    rootClass: "rui-color-picker",
  },
  {
    name: "LineChart",
    spec: LineChart,
    props: {
      labels: ["Jan", "Feb", "Mar"],
      series: [makeNode("Series", ["Revenue", [10, 20, 30]])],
    },
    rootClass: "rui-chart",
  },
  {
    name: "Gauge",
    spec: Gauge,
    props: { value: 70, min: 0, max: 100, label: "Score" },
    rootClass: "rui-gauge",
  },
  {
    name: "Heatmap",
    spec: Heatmap,
    props: { xLabels: ["Mon", "Tue"], yLabels: ["AM", "PM"], values: [[1, 2], [3, 4]] },
    rootClass: "rui-heatmap",
  },
  {
    name: "RadarChart",
    spec: RadarChart,
    props: { axes: ["A", "B", "C"], series: [makeNode("Series", ["P", [80, 70, 60]])] },
    rootClass: "rui-radar-chart",
  },
  {
    name: "ScatterChart",
    spec: ScatterChart,
    props: { series: [makeNode("Series", ["A", [{ x: 1, y: 2 }, { x: 3, y: 4 }]])] },
    rootClass: "rui-scatter-chart",
  },
  {
    name: "Histogram",
    spec: Histogram,
    props: { values: [1, 2, 2, 3, 3, 3, 4, 4, 5], binCount: 4 },
    rootClass: "rui-histogram",
  },
  {
    name: "PinInput",
    spec: PinInput,
    props: { id: "pin", length: 4 },
    rootClass: "rui-pin-input",
  },
  {
    name: "PinInput",
    spec: PinInput,
    props: { id: "otp" },
    rootClass: "rui-pin-input",
  },
  {
    name: "PasswordInput",
    spec: PasswordInput,
    props: { id: "pw", strengthMeter: true, value: "Sup3r$ecret" },
    rootClass: "rui-password-input",
  },
  {
    name: "TagInput",
    spec: TagInput,
    props: { id: "tags", value: ["alpha", "beta"] },
    rootClass: "rui-tag-input",
  },
  {
    name: "MentionInput",
    spec: MentionInput,
    props: { id: "msg", people: [{ name: "Alice" }], value: "Hello" },
    rootClass: "rui-mention-input",
  },
  {
    name: "TimePicker",
    spec: TimePicker,
    props: { id: "t" },
    rootClass: "rui-time-picker",
  },
  {
    name: "DateTimePicker",
    spec: DateTimePicker,
    props: { id: "dt" },
    rootClass: "rui-datetime-picker",
  },
  {
    name: "MaskedInput",
    spec: MaskedInput,
    props: { id: "phone", mask: "(999) 999-9999" },
    rootClass: "rui-masked-input",
  },
  {
    name: "FormSection",
    spec: FormSection,
    props: { label: "Contact", helper: "How to reach you", children: [makeNode("Input", ["email"])] },
    rootClass: "rui-form-section",
  },
  {
    name: "FieldSet",
    spec: FieldSet,
    props: { legend: "Notifications", children: [] },
    rootClass: "rui-fieldset",
  },
  {
    name: "ValidationSummary",
    spec: ValidationSummary,
    props: { errors: [{ label: "email", message: "Invalid email" }] },
    rootClass: "rui-validation-summary",
  },
  {
    name: "MultiStepForm",
    spec: MultiStepForm,
    props: {
      steps: [
        { title: "Account", content: [makeNode("Input", ["email"])] },
        { title: "Profile", content: [makeNode("Input", ["name"])] },
      ],
      current: 0,
    },
    rootClass: "rui-multi-step-form",
  },
  {
    name: "ActivityLog",
    spec: ActivityLog,
    props: {
      items: [{ actor: "Alice", title: "merged PR #42", time: "2m" }],
    },
    rootClass: "rui-activity-log",
  },
  {
    name: "ActivityLog audit variant",
    spec: ActivityLog,
    props: {
      items: [{ actor: "system", title: "rotated key", meta: "kid=abc123" }],
      variant: "audit",
    },
    rootClass: "rui-audit-trail",
  },
  {
    name: "InboxPanel",
    spec: InboxPanel,
    props: {
      items: [
        { title: "New comment", unread: true },
        { title: "Old comment", unread: false },
      ],
    },
    rootClass: "rui-inbox-panel",
  },
  {
    name: "OnboardingChecklist",
    spec: OnboardingChecklist,
    props: {
      items: [
        { title: "Invite team", done: true },
        { title: "Connect repo", done: false },
      ],
    },
    rootClass: "rui-onboarding-checklist",
  },
  {
    name: "LoadingState",
    spec: LoadingState,
    props: { title: "Loading projects…" },
    rootClass: "rui-loading-state",
  },
  {
    name: "ErrorState",
    spec: ErrorState,
    props: { title: "Something went wrong" },
    rootClass: "rui-error-state",
  },
  {
    name: "SuccessState",
    spec: SuccessState,
    props: { title: "Saved" },
    rootClass: "rui-success-state",
  },
  {
    name: "Tour",
    spec: Tour,
    props: {
      steps: [{ title: "Welcome", description: "Get started" }, { title: "Settings" }],
      current: 0,
    },
    rootClass: "rui-tour",
  },
  {
    name: "Spotlight",
    spec: Spotlight,
    props: { title: "Try the new filter", description: "Press F" },
    rootClass: "rui-spotlight",
  },
  {
    name: "Sticky",
    spec: Sticky,
    props: { children: [makeNode("Card", [])], side: "top", offset: "16px" },
    rootClass: "rui-sticky",
  },
  {
    name: "ResizablePanels",
    spec: ResizablePanels,
    props: { primary: [], secondary: [], initialPrimaryWidth: "320px" },
    rootClass: "rui-resizable-panels",
  },
  {
    name: "MasonryGrid",
    spec: MasonryGrid,
    props: { items: [makeNode("Card", []), makeNode("Card", []), makeNode("Card", [])], columns: 3 },
    rootClass: "rui-masonry-grid",
  },
  {
    name: "Drawer",
    spec: Drawer,
    props: { title: "Filters", open: true, children: [] },
    rootClass: "rui-sheet-overlay",
  },
  {
    name: "TopBar",
    spec: TopBar,
    props: { title: "Dashboard", right: [makeNode("Button", ["Save"])] },
    rootClass: "rui-topbar",
  },
];

describe("Advanced components render", () => {
  for (const t of ADVANCED_SMOKE_TESTS) {
    it(`${t.name} renders with .${t.rootClass}`, () => {
      const node = t.spec.render(
        makeNode(t.name, []),
        t.props,
        helpers,
      ) as HTMLElement;
      expect(node).not.toBeNull();
      // Some components return a fragment-like root with no class
      // (e.g. ContextMenu when no target is supplied). Skip the class
      // assertion only if the component explicitly returned nothing.
      if ((node as Element).classList) {
        expect(node.classList.contains(t.rootClass)).toBe(true);
      }
    });
  }
});

describe("DataGrid cell rendering", () => {
  // Col args: header, values, format, align, sortable, filterable, render, onClick
  it("renders a component node passed directly as a cell value", () => {
    const badge = makeNode("Badge", ["VIP"]);
    const col = makeNode("Col", ["Tag", [badge]]);
    const node = DataGrid.render(
      makeNode("DataGrid", [[col]]),
      { columns: [col] },
      helpers,
    ) as HTMLElement;
    const stub = node.querySelector("tbody td .rui-stub");
    expect(stub?.getAttribute("data-component-name")).toBe("Badge");
  });

  it("Col render() maps each row value to a component cell", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const render = (row: { id: number }) => makeNode("Button", [`Edit ${row.id}`]);
    const col = makeNode("Col", ["Actions", rows, undefined, undefined, undefined, undefined, render]);
    const node = DataGrid.render(
      makeNode("DataGrid", [[col]]),
      { columns: [col] },
      helpers,
    ) as HTMLElement;
    const stubs = node.querySelectorAll("tbody td .rui-stub[data-component-name='Button']");
    expect(stubs.length).toBe(3);
  });

  it("Col onClick fires with (value, rowIndex) and stops row-click propagation", () => {
    const cellCalls: Array<unknown[]> = [];
    const localHelpers = {
      ...helpers,
      invoke: (_fn: unknown, ...args: unknown[]) => { cellCalls.push(args); },
    };
    const col = makeNode("Col", ["Name", ["Ada", "Lin"], undefined, undefined, undefined, undefined, undefined, noop]);
    const node = DataGrid.render(
      makeNode("DataGrid", [[col]]),
      { columns: [col], onRowClick: noop },
      localHelpers,
    ) as HTMLElement;
    const clickable = node.querySelectorAll<HTMLElement>("tbody td[data-clickable='true']");
    expect(clickable.length).toBe(2);
    let rowBubbled = false;
    clickable[0]!.addEventListener("click", () => {}, false);
    const tr = clickable[0]!.closest("tr")!;
    tr.addEventListener("click", () => { rowBubbled = true; });
    clickable[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(cellCalls).toEqual([["Ada", 0]]);
    expect(rowBubbled).toBe(false); // stopPropagation prevented the row handler
  });
});

describe("self-decorating defaults", () => {
  it("PageHeader auto-derives breadcrumbs from the title when omitted", () => {
    const node = PageHeader.render(
      makeNode("PageHeader", ["Revenue"]),
      { title: "Revenue" },
      helpers,
    ) as HTMLElement;
    const crumbs = node.querySelectorAll(".rui-page-header-crumb");
    expect(crumbs.length).toBe(2);
    expect(crumbs[0]?.textContent).toBe("Home");
    expect(crumbs[1]?.textContent).toBe("Revenue");
  });

  it("PageHeader breadcrumbs=false suppresses the auto-derived trail", () => {
    const node = PageHeader.render(
      makeNode("PageHeader", ["Sign in"]),
      { title: "Sign in", breadcrumbs: false },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-page-header-breadcrumbs")).toBeNull();
  });

  it("StatCard picks an icon from the label when omitted", () => {
    const node = StatCard.render(
      makeNode("StatCard", ["Monthly revenue", "$48,200"]),
      { label: "Monthly revenue", value: "$48,200" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-stat-icon")).not.toBeNull();
  });

  it("Banner picks an icon from the tone when omitted", () => {
    const node = Banner.render(
      makeNode("Banner", ["Heads up", "Maintenance tonight", null, undefined, "warning"]),
      { title: "Heads up", message: "Maintenance tonight", tone: "warning" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-banner-icon")).not.toBeNull();
  });

  it("Hero auto-derives an eyebrow from intent keywords in the title", () => {
    const node = Hero.render(
      makeNode("Hero", ["Introducing Bolt for Teams"]),
      { title: "Introducing Bolt for Teams" },
      helpers,
    ) as HTMLElement;
    const eyebrow = node.querySelector(".rui-hero-eyebrow");
    expect(eyebrow).not.toBeNull();
    expect(eyebrow?.textContent).toBe("Introducing");
  });

  it("EmptyState picks an icon from the title when omitted", () => {
    const node = EmptyState.render(
      makeNode("EmptyState", ["No messages yet"]),
      { title: "No messages yet" },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-empty-state-icon")).not.toBeNull();
  });

  it("Toolbar(searchable=true) auto-mounts a SearchBar", () => {
    const node = Toolbar.render(
      makeNode("Toolbar", []),
      { searchable: true },
      helpers,
    ) as HTMLElement;
    // SearchBar renders an input — confirm one made it into the left slot.
    const inputs = node.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
  });
});

describe("Accordion showArrow", () => {
  it("defaults to no chevron indicator on the wrapper", async () => {
    const { Accordion } = await import("../src/library/components/layout.js");
    const node = Accordion.render(
      makeNode("Accordion", [[]]),
      { items: [] },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-show-arrow")).toBe("false");
  });

  it("propagates showArrow=true to the wrapper data attribute", async () => {
    const { Accordion } = await import("../src/library/components/layout.js");
    const node = Accordion.render(
      makeNode("Accordion", [[], true]),
      { items: [], showArrow: true },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-show-arrow")).toBe("true");
  });

  it("AccordionItem renders a chevron element so CSS can toggle visibility", async () => {
    const { AccordionItem } = await import("../src/library/components/layout.js");
    const node = AccordionItem.render(
      makeNode("AccordionItem", ["FAQ", [], false, true]),
      { title: "FAQ", children: [], open: false, showArrow: true },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-show-arrow")).toBe("true");
    expect(node.querySelector(".rui-accordion-chevron")).not.toBeNull();
  });
});

describe("MaskedInput", () => {
  it("formats raw digits against the mask", () => {
    const input = MaskedInput.render(
      makeNode("MaskedInput", ["phone", "(999) 999-9999", "4155550114"]),
      { id: "phone", mask: "(999) 999-9999", value: "4155550114" },
      helpers,
    ) as HTMLInputElement;
    expect(input.value).toBe("(415) 555-0114");
  });

  it("re-masks on input when there is no state binding", () => {
    const input = MaskedInput.render(
      makeNode("MaskedInput", ["phone", "(999) 999-9999"]),
      { id: "phone", mask: "(999) 999-9999" },
      helpers,
    ) as HTMLInputElement;
    input.value = "41";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.value).toBe("(41");
  });
});

describe("MentionInput suggestions", () => {
  it("opens the suggestions popover when typing @", () => {
    const node = MentionInput.render(
      makeNode("MentionInput", ["msg", [{ name: "Ada Lovelace", handle: "ada" }, { name: "Linus Torvalds", handle: "linus" }]]),
      {
        id: "msg",
        people: [
          { name: "Ada Lovelace", handle: "ada" },
          { name: "Linus Torvalds", handle: "linus" },
        ],
      },
      helpers,
    ) as HTMLElement;
    const textarea = node.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "Hi @";
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const suggestions = node.querySelector(".rui-mention-input-suggestions")!;
    expect(suggestions.getAttribute("data-open")).toBe("true");
    expect(suggestions.querySelectorAll(".rui-mention-input-option").length).toBe(2);
  });

  it("filters suggestions by the typed query", () => {
    const node = MentionInput.render(
      makeNode("MentionInput", ["msg", [{ name: "Ada" }, { name: "Linus" }]]),
      { id: "msg", people: [{ name: "Ada" }, { name: "Linus" }] },
      helpers,
    ) as HTMLElement;
    const textarea = node.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "Hi @Lin";
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const options = node.querySelectorAll(".rui-mention-input-option");
    expect(options.length).toBe(1);
    expect(options[0]?.textContent).toContain("Linus");
  });
});

describe("MultiStepForm layout", () => {
  it("defaults to column layout for the steps indicator", () => {
    const node = MultiStepForm.render(
      makeNode("MultiStepForm", [[{ title: "One" }, { title: "Two" }], 0]),
      { steps: [{ title: "One" }, { title: "Two" }], current: 0 },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-layout")).toBe("column");
    expect(node.querySelector(".rui-multi-step-form-steps")?.getAttribute("data-layout")).toBe("column");
  });

  it("supports a horizontal row layout via stepsLayout", () => {
    const node = MultiStepForm.render(
      makeNode("MultiStepForm", [[{ title: "One" }, { title: "Two" }], 0, null, null, null, null, "row"]),
      { steps: [{ title: "One" }, { title: "Two" }], current: 0, stepsLayout: "row" },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-layout")).toBe("row");
  });
});

describe("PieChart value labels", () => {
  it("renders inline numeric labels for each non-trivial segment", async () => {
    const { PieChart } = await import("../src/library/components/charts.js");
    const node = PieChart.render(
      makeNode("PieChart", [["Free", "Pro", "Team"], [240, 95, 32]]),
      { labels: ["Free", "Pro", "Team"], values: [240, 95, 32] },
      helpers,
    ) as HTMLElement;
    const labels = node.querySelectorAll(".rui-pie-chart-value");
    expect(labels.length).toBe(3);
  });

  it("hides inline labels when showValues=false", async () => {
    const { PieChart } = await import("../src/library/components/charts.js");
    const node = PieChart.render(
      makeNode("PieChart", [["A", "B"], [70, 30]]),
      { labels: ["A", "B"], values: [70, 30], showValues: false },
      helpers,
    ) as HTMLElement;
    expect(node.querySelectorAll(".rui-pie-chart-value").length).toBe(0);
  });

  it("emits percent-formatted labels when valueFormat=percent", async () => {
    const { PieChart } = await import("../src/library/components/charts.js");
    const node = PieChart.render(
      makeNode("PieChart", [["A", "B"], [75, 25]]),
      { labels: ["A", "B"], values: [75, 25], valueFormat: "percent" },
      helpers,
    ) as HTMLElement;
    const labels = Array.from(node.querySelectorAll(".rui-pie-chart-value"))
      .map((l) => l.textContent);
    expect(labels).toEqual(["75%", "25%"]);
  });
});

describe("Notification unread visual", () => {
  it("adds a leading unread dot when unread=true", () => {
    const node = Notification.render(
      makeNode("Notification", []),
      { title: "New ping", unread: true },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-notification-unread-dot")).not.toBeNull();
  });

  it("omits the unread dot when unread is falsy", () => {
    const node = Notification.render(
      makeNode("Notification", []),
      { title: "Old ping", unread: false },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector(".rui-notification-unread-dot")).toBeNull();
  });
});

describe("LineChart row-shaped shorthand", () => {
  it("accepts data=[{x, …series}] and derives labels + series", async () => {
    const { LineChart } = await import("../src/library/components/charts.js");
    const node = LineChart.render(
      makeNode("LineChart", []),
      {
        data: [
          { x: "Jan", revenue: 10, signups: 4 },
          { x: "Feb", revenue: 14, signups: 5 },
          { x: "Mar", revenue: 18, signups: 9 },
        ],
      },
      helpers,
    ) as HTMLElement;
    expect(node.querySelector("svg")).not.toBeNull();
    // 2 series -> 2 polyline paths drawn inside the SVG.
    expect(node.querySelectorAll("svg path").length).toBeGreaterThanOrEqual(2);
  });
});

describe("HTMLTag", () => {
  it("renders the requested tag with allow-listed attributes and child nodes", async () => {
    const { HTMLTag } = await import("../src/library/components/escape-hatch.js");
    const node = HTMLTag.render(
      makeNode("HTMLTag", []),
      {
        tag: "section",
        attributes: { class: "hero", "data-id": "42" },
        children: ["Hello", " world"],
      },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("section");
    expect(node.getAttribute("class")).toBe("hero");
    expect(node.getAttribute("data-id")).toBe("42");
    expect(node.textContent).toBe("Hello world");
  });

  it("falls back to <div> for tag names outside the allow-list", async () => {
    const { HTMLTag } = await import("../src/library/components/escape-hatch.js");
    const node = HTMLTag.render(
      makeNode("HTMLTag", []),
      { tag: "script", attributes: {}, children: [] },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("div");
  });

  it("strips on* event-handler attributes and `javascript:` URLs", async () => {
    const { HTMLTag } = await import("../src/library/components/escape-hatch.js");
    const node = HTMLTag.render(
      makeNode("HTMLTag", []),
      {
        tag: "a",
        attributes: {
          href: "javascript:alert(1)",
          onclick: "alert(1)",
          onerror: "alert(2)",
          class: "link",
        },
        children: ["click"],
      },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("a");
    expect(node.hasAttribute("onclick")).toBe(false);
    expect(node.hasAttribute("onerror")).toBe(false);
    expect(node.getAttribute("href")).not.toBe("javascript:alert(1)");
    expect(node.getAttribute("class")).toBe("link");
  });

  it("filters dangerous patterns in inline `style` declarations", async () => {
    const { HTMLTag } = await import("../src/library/components/escape-hatch.js");
    const safe = HTMLTag.render(
      makeNode("HTMLTag", []),
      {
        tag: "div",
        attributes: { style: "background: red; color: white;" },
        children: [],
      },
      helpers,
    ) as HTMLElement;
    expect(safe.getAttribute("style")).toBe("background: red; color: white;");

    const hostile = HTMLTag.render(
      makeNode("HTMLTag", []),
      {
        tag: "div",
        attributes: { style: "background: expression(alert(1));" },
        children: [],
      },
      helpers,
    ) as HTMLElement;
    expect(hostile.hasAttribute("style")).toBe(false);
  });

  it("renders component-shaped children via the renderNode helper", async () => {
    const { HTMLTag } = await import("../src/library/components/escape-hatch.js");
    const node = HTMLTag.render(
      makeNode("HTMLTag", []),
      {
        tag: "div",
        attributes: { class: "wrapper" },
        children: [makeNode("Text", ["Hi"])],
      },
      helpers,
    ) as HTMLElement;
    const stub = node.querySelector(".rui-stub");
    expect(stub).not.toBeNull();
    expect(stub?.getAttribute("data-component-name")).toBe("Text");
  });
});

describe("Styles", () => {
  it("renders a <style> element containing the supplied CSS", async () => {
    const { Styles } = await import("../src/library/components/escape-hatch.js");
    const node = Styles.render(
      makeNode("Styles", []),
      { css: ".hero { color: red; } .accent { color: blue; }" },
      helpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("style");
    expect(node.textContent).toContain(".hero { color: red; }");
    expect(node.textContent).toContain(".accent { color: blue; }");
  });

  it("drops payloads that try to break out of the <style> tag or smuggle script", async () => {
    const { Styles } = await import("../src/library/components/escape-hatch.js");
    const cases = [
      "</style><script>alert(1)</script>",
      ".x { background: url(javascript:alert(1)); }",
      "@import 'evil.css';",
      ".x { width: expression(alert(1)); }",
    ];
    for (const css of cases) {
      const node = Styles.render(
        makeNode("Styles", []),
        { css },
        helpers,
      ) as HTMLElement;
      expect(node.tagName.toLowerCase()).toBe("style");
      expect(node.textContent).toBe("");
    }
  });
});

