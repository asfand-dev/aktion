import { describe, expect, it } from "vitest";
import { FollowUpBlock, FollowUpItem } from "../src/library/components/chat.js";
import {
  Avatar, AvatarGroup, Progress, ProgressRing, Switch, Toggle, ToggleGroup,
  Tooltip, Kbd, Rating, ChatBubble, Popover, Toast, Toasts,
} from "../src/library/components/feedback.js";
import {
  Breadcrumb, BreadcrumbItem, Pagination, Sheet, Navbar, NavbarItem,
} from "../src/library/components/navigation.js";
import {
  DropdownMenu, MenuItem, MenuSeparator, MenuLabel,
} from "../src/library/components/menu.js";
import {
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
} from "../src/library/components/forms.js";
import { Tree, TreeNode } from "../src/library/components/data.js";
import {
  Hero, PageHeader, MetricGrid, EmptyState, Timeline, TimelineItem,
  FeatureGrid, FeatureItem, KanbanBoard, KanbanColumn, KanbanCard,
  ProfileCard, Banner,
  SectionHeader, Toolbar, Sidebar, SidebarItem, SidebarSection,
  AppShell, SplitView, DescriptionList, DescriptionItem,
  StatusDot, PricingTable, PricingCard,
  Cover, MediaCard, Stats, Tile, Notification, PersonChip,
} from "../src/library/components/patterns.js";
import {
  Container, Spacer, Quote, Note, Markdown, Image, Link, Skeleton,
} from "../src/library/components/content.js";
import { SearchBar } from "../src/library/components/forms.js";
import { Grid, AspectRatio } from "../src/library/components/layout.js";
import type { RenderHelpers } from "../src/library/types.js";
import { defaultLibrary } from "../src/library/index.js";
import { findComponent } from "../src/library/registry.js";
import { Router } from "../src/runtime/router.js";

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
  runAction: noop,
  bindState: noop,
  registerScript: noop,
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
      "Stack", "Grid", "Card", "CardHeader", "Button", "Input", "Select", "Table", "BarChart",
      "FollowUpBlock", "Avatar", "AvatarGroup", "Progress", "Switch", "Toggle",
      "ToggleGroup", "Tooltip", "HoverCard", "Kbd", "Breadcrumb", "BreadcrumbItem",
      "Pagination", "Sheet", "AspectRatio", "ScrollArea",
      "Hero", "PageHeader", "MetricGrid", "EmptyState", "Timeline", "TimelineItem",
      "FeatureGrid", "FeatureItem", "Testimonial", "ProfileCard", "Comment", "Banner",
      "KanbanBoard", "KanbanColumn", "KanbanCard",
      // Rich-layout / app-shell patterns
      "SectionHeader", "Toolbar", "DescriptionList", "DescriptionItem",
      "StatusDot", "PricingTable", "PricingCard",
      "AppShell", "Sidebar", "SidebarSection", "SidebarItem", "SplitView",
      // Richer composition primitives
      "Container", "Spacer", "Cover", "MediaCard", "Stats", "Tile",
      "Notification", "PersonChip", "Quote", "Note", "Rating",
      "ProgressRing", "ChatBubble", "SearchBar",
      // Menu & overlay primitives
      "DropdownMenu", "MenuItem", "MenuSeparator", "MenuLabel",
      "Popover", "Toast", "Toasts",
      // Extended form inputs
      "Slider", "NumberInput", "DatePicker", "FileUpload", "Combobox",
      // Hierarchical data + top navigation
      "Tree", "TreeNode", "Navbar", "NavbarItem",
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
  it("renders initials as fallback when src is missing", () => {
    const node = Avatar.render(
      makeNode("Avatar", ["Alex Rivera"]),
      { name: "Alex Rivera" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-avatar")).toBe(true);
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

describe("Toggle", () => {
  it("flips a bound $variable on click via an Action payload", () => {
    let payload: unknown = null;
    const localHelpers = {
      ...helpers,
      runAction: (p: unknown) => { payload = p; },
    };
    const node = makeNode("Toggle", ["Bold", true], [{}, { stateRef: "bold_on" }]);
    const button = Toggle.render(node, { label: "Bold", value: true }, localHelpers) as HTMLButtonElement;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Set", name: "bold_on", value: false }],
    });
  });
});

describe("ToggleGroup", () => {
  it("sets the bound state to the clicked value", () => {
    let payload: unknown = null;
    const localHelpers = {
      ...helpers,
      runAction: (p: unknown) => { payload = p; },
    };
    const items = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
    const node = makeNode("ToggleGroup", ["digest", items, "weekly"], [{}, {}, { stateRef: "digest" }]);
    const root = ToggleGroup.render(node, { id: "digest", items, value: "weekly" }, localHelpers) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll("button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[1]?.getAttribute("aria-checked")).toBe("true");
    buttons[0]?.click();
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Set", name: "digest", value: "daily" }],
    });
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
    let payload: unknown = null;
    const localHelpers = {
      ...helpers,
      runAction: (p: unknown) => { payload = p; },
    };
    const node = makeNode("Pagination", [5, 10], [{ stateRef: "page" }, {}]);
    const root = Pagination.render(node, { page: 5, totalPages: 10 }, localHelpers) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.rui-pagination-button"));
    const fourBtn = buttons.find((b) => b.textContent === "4");
    expect(fourBtn).toBeDefined();
    fourBtn?.click();
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Set", name: "page", value: 4 }],
    });
  });

  it("disables prev on the first page and next on the last page", () => {
    const node = makeNode("Pagination", [1, 3], [{ stateRef: "p" }, {}]);
    const root = Pagination.render(node, { page: 1, totalPages: 3 }, helpers) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.rui-pagination-button"));
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[buttons.length - 1]?.disabled).toBe(false);
  });
});

describe("Sheet", () => {
  it("closes by dispatching a Set false action when the close button is clicked", () => {
    let payload: unknown = null;
    const localHelpers = {
      ...helpers,
      runAction: (p: unknown) => { payload = p; },
    };
    const node = makeNode("Sheet", ["Details", true, []], [{}, { stateRef: "panelOpen" }, {}]);
    const overlay = Sheet.render(node, { title: "Details", open: true, children: [] }, localHelpers) as HTMLElement;
    expect(overlay.getAttribute("data-open")).toBe("true");
    overlay.querySelector<HTMLButtonElement>(".rui-sheet-close")?.click();
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Set", name: "panelOpen", value: false }],
    });
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

  it("MetricGrid renders each item", () => {
    const items = [
      makeNode("StatCard", ["A", "1"]),
      makeNode("StatCard", ["B", "2"]),
      makeNode("StatCard", ["C", "3"]),
    ];
    const node = MetricGrid.render(
      makeNode("MetricGrid", [items]),
      { items },
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
    let payload: unknown = null;
    const localHelpers = {
      ...helpers,
      runAction: (p: unknown) => { payload = p; },
    };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "open" }] };
    const node = KanbanCard.render(
      makeNode("KanbanCard", []),
      { title: "Task", action },
      localHelpers,
    ) as HTMLElement;
    expect(node.getAttribute("role")).toBe("button");
    node.click();
    expect(payload).toBe(action);
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
        status: makeNode("Tag", ["Up 12%"]),
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "open" }] };
    const node = SidebarItem.render(
      makeNode("SidebarItem", []),
      { label: "Projects", icon: "folder", active: true, badge: "12", action },
      localHelpers,
    ) as HTMLButtonElement;
    expect(node.getAttribute("data-active")).toBe("true");
    const sidebarIcon = node.querySelector(".rui-sidebar-item-icon");
    expect(sidebarIcon?.classList.contains("fa-folder")).toBe(true);
    expect(node.querySelector(".rui-sidebar-item-badge")?.textContent).toBe("12");
    node.click();
    expect(payload).toBe(action);
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

  it("Cover strips characters that would break out of url(...)", () => {
    // Regression: `imageSrc` containing `");` could close the url() literal
    // and inject arbitrary CSS rules. The sanitiser drops those characters
    // so anything the attacker supplied stays trapped *inside* the url()
    // literal (where the browser treats it as a malformed URL, never CSS).
    const benign = Cover.render(
      makeNode("Cover", []),
      { title: "x", imageSrc: "https://example.com/cover.jpg" },
      helpers,
    ) as HTMLElement;
    const hostile = Cover.render(
      makeNode("Cover", []),
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

describe("Cover", () => {
  it("renders title, eyebrow, subtitle, and actions", () => {
    const node = Cover.render(
      makeNode("Cover", []),
      {
        title: "Aurora",
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "open" }] };
    const node = Tile.render(
      makeNode("Tile", []),
      { label: "Inbox", icon: "inbox", value: "12", description: "Unread", tone: "primary", action },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("button");
    expect(node.getAttribute("data-tone")).toBe("primary");
    const tileIcon = node.querySelector(".rui-tile-icon");
    expect(tileIcon?.classList.contains("fa-inbox")).toBe(true);
    expect(node.querySelector(".rui-tile-label")?.textContent).toBe("Inbox");
    expect(node.querySelector(".rui-tile-value")?.textContent).toBe("12");
    (node as HTMLButtonElement).click();
    expect(payload).toBe(action);
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "open" }] };
    const node = PersonChip.render(
      makeNode("PersonChip", []),
      { name: "Asha", action },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("button");
    (node as HTMLButtonElement).click();
    expect(payload).toBe(action);
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

describe("Note", () => {
  it("renders content and a tone-based default FA icon", () => {
    const node = Note.render(
      makeNode("Note", []),
      { content: "Free returns within 30 days.", tone: "tip" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-note")).toBe(true);
    expect(node.getAttribute("data-tone")).toBe("tip");
    const noteIcon = node.querySelector(".rui-note-icon");
    expect(noteIcon?.classList.contains("fa-lightbulb")).toBe(true);
    expect(node.querySelector(".rui-note-text")?.textContent).toBe("Free returns within 30 days.");
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const node = makeNode("Rating", [3], [{ stateRef: "stars" }]);
    const root = Rating.render(
      node,
      { value: 3, interactive: true },
      localHelpers,
    ) as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.rui-rating-star"));
    expect(buttons).toHaveLength(5);
    buttons[4]?.click();
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Set", name: "stars", value: 5 }],
    });
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "search" }] };
    const form = SearchBar.render(
      makeNode("SearchBar", ["q"]),
      { id: "q", action, submitLabel: "Go" },
      localHelpers,
    ) as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>("button.rui-search-bar-submit");
    expect(submit).not.toBeNull();
    expect(submit?.textContent).toBe("Go");
    form.dispatchEvent(new Event("submit"));
    expect(payload).toBe(action);
  });
});

describe("FollowUpBlock", () => {
  it("renders FollowUpItem ComponentNodes via positional args", () => {
    let captured: unknown = null;
    const localHelpers = { ...helpers, runAction: (payload: unknown) => { captured = payload; } };
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
    expect(captured).toMatchObject({
      kind: "Action",
      steps: [{ kind: "ToAssistant", message: "Show me how to invite teammates" }],
    });
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "save" }] };
    const items = [makeNode("MenuItem", ["Save", action])];
    const node = DropdownMenu.render(
      makeNode("DropdownMenu", ["Open", items]),
      { trigger: "Open", items },
      localHelpers,
    ) as HTMLElement;
    node.querySelector<HTMLElement>(".rui-dropdown-menu-trigger")?.click();
    expect(node.getAttribute("data-open")).toBe("true");
    node.querySelector<HTMLButtonElement>(".rui-menu-item")?.click();
    expect(payload).toBe(action);
    expect(node.getAttribute("data-open")).toBe("false");
  });

  it("disabled MenuItems do not fire actions", () => {
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "save" }] };
    const items = [makeNode("MenuItem", ["Save", action, null, null, "default", true])];
    const node = DropdownMenu.render(
      makeNode("DropdownMenu", ["Open", items]),
      { trigger: "Open", items },
      localHelpers,
    ) as HTMLElement;
    const itemBtn = node.querySelector<HTMLButtonElement>(".rui-menu-item");
    expect(itemBtn?.disabled).toBe(true);
    itemBtn?.click();
    expect(payload).toBeNull();
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

describe("Toast & Toasts", () => {
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const onClose = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "dismiss" }] };
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Done", onClose },
      localHelpers,
    ) as HTMLElement;
    node.querySelector<HTMLButtonElement>(".rui-toast-close")?.click();
    expect(payload).toBe(onClose);
    expect(node.classList.contains("is-dismissed")).toBe(true);
  });

  it("Toast auto-dismisses after the configured duration", async () => {
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const onClose = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "auto" }] };
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Saved", duration: 20, onClose },
      localHelpers,
    ) as HTMLElement;
    // Hosted in the document so `root.isConnected` is true when the timer fires.
    document.body.appendChild(node);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(payload).toBe(onClose);
    expect(node.classList.contains("is-dismissed")).toBe(true);
    node.remove();
  });

  it("Toast without duration does not auto-dismiss", async () => {
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const onClose = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "auto" }] };
    const node = Toast.render(
      makeNode("Toast", []),
      { title: "Persistent", onClose },
      localHelpers,
    ) as HTMLElement;
    document.body.appendChild(node);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(payload).toBeNull();
    expect(node.classList.contains("is-dismissed")).toBe(false);
    node.remove();
  });

  it("Toasts positions the stack and renders children", () => {
    const items = [makeNode("Toast", ["A"]), makeNode("Toast", ["B"])];
    const node = Toasts.render(
      makeNode("Toasts", []),
      { items, position: "bottom-right" },
      helpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-toasts")).toBe(true);
    expect(node.getAttribute("data-position")).toBe("bottom-right");
    expect(node.children.length).toBe(2);
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "upload" }] };
    const node = FileUpload.render(
      makeNode("FileUpload", ["avatar"]),
      { id: "avatar", label: "Drop a photo", accept: "image/*", action },
      localHelpers,
    ) as HTMLElement;
    expect(node.classList.contains("rui-file-upload")).toBe(true);
    expect(node.querySelector(".rui-file-upload-label")?.textContent).toBe("Drop a photo");
    const input = node.querySelector<HTMLInputElement>("input");
    expect(input?.getAttribute("type")).toBe("file");
    expect(input?.getAttribute("accept")).toBe("image/*");
    input?.dispatchEvent(new Event("change"));
    expect(payload).toBe(action);
  });
});

describe("Combobox", () => {
  it("renders the selected label and filters matching options on type", () => {
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
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

    // Picking an option fires a Set action with the new value
    visible[0]?.click();
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Set", name: "country", value: "uk" }],
    });
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "open" }] };
    const node = TreeNode.render(
      makeNode("TreeNode", ["index.ts"]),
      { label: "index.ts", action },
      localHelpers,
    ) as HTMLElement;
    (node as HTMLButtonElement).click();
    expect(payload).toBe(action);
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
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
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
    expect(payload).toMatchObject({
      kind: "Action",
      steps: [{ kind: "Navigate", path: "/docs" }],
    });
  });

  it("MenuItem (standalone) renders a button with icon and shortcut", () => {
    let payload: unknown = null;
    const localHelpers = { ...helpers, runAction: (p: unknown) => { payload = p; } };
    const action = { kind: "Action" as const, steps: [{ kind: "Run" as const, ref: "go" }] };
    const node = MenuItem.render(
      makeNode("MenuItem", ["Save", action, "save", "⌘S"]),
      { label: "Save", action, icon: "save", shortcut: "⌘S" },
      localHelpers,
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("button");
    expect(node.querySelector(".rui-menu-item-label")?.textContent).toBe("Save");
    expect(node.querySelector(".rui-menu-item-shortcut")?.textContent).toBe("⌘S");
    (node as HTMLButtonElement).click();
    expect(payload).toBe(action);
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
