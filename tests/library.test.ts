import { describe, expect, it } from "vitest";
import { FollowUpBlock, FollowUpItem } from "../src/library/components/chat.js";
import { defaultLibrary } from "../src/library/index.js";
import { findComponent } from "../src/library/registry.js";

const noop = () => {/* no-op */};
const helpers = {
  renderNode: () => document.createTextNode(""),
  runAction: noop,
  bindState: noop,
};

describe("default library", () => {
  it("registers every documented component group", () => {
    const expected = ["Stack", "Card", "CardHeader", "Button", "Input", "Select", "Table", "BarChart", "FollowUpBlock"];
    for (const name of expected) {
      expect(findComponent(defaultLibrary, name)).toBeDefined();
    }
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
