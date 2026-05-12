import { describe, expect, it } from "vitest";
import { FollowUpBlock, FollowUpItem } from "../src/library/components/chat.js";
import {
  Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup, Tooltip, Kbd,
} from "../src/library/components/feedback.js";
import {
  Breadcrumb, Pagination, Sheet,
} from "../src/library/components/navigation.js";
import {
  Hero, PageHeader, MetricGrid, EmptyState, Timeline, TimelineItem,
  FeatureGrid, FeatureItem, KanbanBoard, KanbanColumn, KanbanCard,
  ProfileCard, Banner,
} from "../src/library/components/patterns.js";
import { Grid, AspectRatio } from "../src/library/components/layout.js";
import type { RenderHelpers } from "../src/library/types.js";
import { defaultLibrary } from "../src/library/index.js";
import { findComponent } from "../src/library/registry.js";

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
  javascriptEnabled: false,
  router: null,
  routesEnabled: false,
};

const makeNode = (name: string, args: unknown[], argMeta: Array<{ stateRef?: string }> = []) => ({
  __kind: "Component" as const,
  name,
  args,
  argMeta: argMeta.length > 0 ? argMeta : args.map(() => ({})),
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
    ];
    for (const name of expected) {
      expect(findComponent(defaultLibrary, name), `${name} should be registered`).toBeDefined();
    }
  });

  it("declares a Patterns and Feedback group in componentGroups", () => {
    const groupNames = defaultLibrary.componentGroups?.map((g) => g.name) ?? [];
    expect(groupNames).toContain("Patterns");
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
      { title: "No data", description: "Add one to get started.", icon: "📭", action },
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
      { title: "Hello", time: "now", description: "There", icon: "🚀", tone: "success" },
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
      { title: "Fast", description: "Snappy.", icon: "⚡️", tone: "info" },
      helpers,
    ) as HTMLElement;
    expect(item.querySelector(".rui-feature-icon")?.textContent).toBe("⚡️");
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
      { title: "Deploy ready", message: "Tag v2.0 is built.", tone: "success", icon: "🚀", action },
      helpers,
    ) as HTMLElement;
    expect(node.getAttribute("data-tone")).toBe("success");
    expect(node.querySelector(".rui-banner-icon")?.textContent).toBe("🚀");
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
