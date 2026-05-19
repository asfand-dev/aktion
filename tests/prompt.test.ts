import { describe, expect, it } from "vitest";
import { generatePrompt } from "../src/prompt/generator.js";
import { defaultLibrary } from "../src/library/index.js";

describe("generatePrompt", () => {
  it("includes syntax, components, and root rule", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("Streaming UI Script");
    expect(text).toContain("root = Stack(");
    expect(text).toContain("Stack(children: Node[]");
    expect(text).toContain("CardHeader(title: string");
  });

  it("toggles tool/binding sections by feature flag", () => {
    const minimal = generatePrompt(defaultLibrary, { toolCalls: false, bindings: false });
    expect(minimal).not.toContain("## Reactive State");
    expect(minimal).not.toContain("## Data: Query and Mutation");
    expect(minimal).not.toContain("## Built-in functions");

    const full = generatePrompt(defaultLibrary, {
      tools: [{ name: "list_users", description: "Returns users.", argsExample: { limit: 10 } }],
    });
    expect(full).toContain("## Reactive State");
    expect(full).toContain("## Data: Query and Mutation");
    expect(full).toContain("list_users");
  });

  it("appends additional rules and examples", () => {
    const text = generatePrompt(defaultLibrary, {
      additionalRules: ["Always end with a FollowUpBlock."],
      examples: [`root = Stack([Card([CardHeader("Demo")])])`],
    });
    expect(text).toContain("Always end with a FollowUpBlock.");
    expect(text).toContain("Demo");
  });

  it("includes the design principles and composition recipes by default", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("## Design principles");
    expect(text).toContain("Reach for high-level patterns first");
    expect(text).toContain("## Composition recipes");
    expect(text).toContain("Dashboard / analytics page");
    expect(text).toContain("Landing / marketing page");
  });

  it("documents the new shadcn-parity primitives and pattern composites", () => {
    const text = generatePrompt(defaultLibrary);
    // Primitives we added (shadcn parity)
    for (const name of ["Avatar", "Progress", "Switch", "ToggleGroup", "Tooltip", "Breadcrumb", "Pagination", "Drawer", "Grid"]) {
      expect(text, `${name} should appear in the prompt`).toContain(`${name}(`);
    }
    // Pattern composites
    for (const name of ["Hero", "PageHeader", "Stats", "EmptyState", "Timeline", "FeatureGrid", "KanbanBoard"]) {
      expect(text, `${name} should appear in the prompt`).toContain(`${name}(`);
    }
    // The Patterns group is announced in components section
    expect(text).toContain("### Patterns");
    expect(text).toContain("### Feedback & Media");
    expect(text).toContain("### Navigation");
  });

  it("documents the new rich-layout patterns and app-shell composites", () => {
    const text = generatePrompt(defaultLibrary);
    for (const name of [
      "SectionHeader", "Toolbar", "DescriptionList", "DescriptionItem",
      "StatusDot", "PricingTable", "PricingCard",
      "AppShell", "Sidebar", "SidebarSection", "SidebarItem", "SplitView",
    ]) {
      expect(text, `${name} should appear in the prompt`).toContain(`${name}(`);
    }
    // The App shell group is announced
    expect(text).toContain("### App shell");
    // Density targets section appears in the design principles
    expect(text).toContain("Density targets");
    expect(text).toContain("minimum");
  });

  it("documents the richer composition primitives", () => {
    const text = generatePrompt(defaultLibrary);
    for (const name of [
      "Container", "Spacer", "Hero", "MediaCard", "Stats", "Tile",
      "Notification", "PersonChip", "Quote", "Rating",
      "ProgressRing", "ChatBubble", "SearchBar",
    ]) {
      expect(text, `${name} should appear in the prompt`).toContain(`${name}(`);
    }
    // Product detail recipe references the new components
    expect(text).toContain("Hero(");
    expect(text).toContain("MediaCard(");
    expect(text).toContain("Rating(");
  });

  it("falls back to a built-in rich example when none is provided", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("## Examples");
    expect(text).toContain("Stats");
    expect(text).toContain("KanbanBoard");
  });

  it("teaches streaming-friendly statement order", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("## Hoisting & Streaming");
    expect(text).toContain("emit this FIRST");
    expect(text).toContain("Leaf data last");
    expect(text).toContain("## Final verification");
    expect(text).toContain("is the FIRST line");
    // The syntax section should mention forward references / hoisting.
    expect(text).toContain("Forward references are allowed");
  });

  it("always documents JavaScript interactions in the full prompt", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("## JavaScript interactions");
    expect(text).toContain('Script("id"');
    expect(text).toContain("@Js(");
    expect(text).toContain("ctx.state.set");
    expect(text).toContain("ctx.tools");
    expect(text).toContain("ctx.cleanup");
    expect(text).toContain("### Scripting");
  });

  it("always documents routing in the full prompt", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("## Routing");
    expect(text).toContain("Routes(");
    expect(text).toContain("NavLink(");
    expect(text).toContain("@Navigate(");
    expect(text).toContain("### Routing");
  });

  it("never teaches the LLM to escape backticks (regression: \\` in template-literal examples)", () => {
    // Earlier versions accidentally rendered `\`Hi ${name}\`` (backslash + backtick)
    // into the prompt because the TS template literal used \\\\` instead of \\`.
    // The LLM faithfully copied the backslashes into its output, breaking parsing.
    // Both the full and chat prompts must show backticks literally.
    const fullPrompt = generatePrompt(defaultLibrary);
    const chatPrompt = generatePrompt(defaultLibrary, { mode: "chat" });
    expect(fullPrompt).not.toMatch(/\\`/);
    expect(chatPrompt).not.toMatch(/\\`/);
    // And the correct backtick examples must be present.
    expect(fullPrompt).toContain("`Hello ${$user.name}");
    expect(chatPrompt).toContain("`Hi ${name}`");
    expect(chatPrompt).toContain("`Found ${$rows.length} results`");
  });

  describe("chat mode", () => {
    it("emits a compact OpenUI-Lang-style prompt", () => {
      const text = generatePrompt(defaultLibrary, { mode: "chat" });
      expect(text).toContain("Streaming UI Script");
      expect(text).toContain("root = Stack(");
      expect(text).toContain("## Syntax Rules");
      expect(text).toContain("## Component Signatures");
      expect(text).toContain("## Actions — Button Behaviour");
      expect(text).toContain("## Hoisting & Streaming");
      expect(text).toContain("## Examples");
      expect(text).toContain("## Important Rules");
      expect(text).toContain("## Final Verification");
    });

    it("omits the JavaScript interactions and routing surfaces", () => {
      const text = generatePrompt(defaultLibrary, { mode: "chat" });
      expect(text).not.toContain("## JavaScript interactions");
      expect(text).not.toContain('Script("id"');
      expect(text).not.toContain("@Js(");
      expect(text).not.toContain("## Routing");
      expect(text).not.toContain("Routes(");
      expect(text).not.toContain("NavLink(");
      expect(text).not.toContain("@Navigate(");
    });

    it("trims component groups to chat-friendly building blocks", () => {
      const text = generatePrompt(defaultLibrary, { mode: "chat" });
      for (const expected of ["Stack(", "Table(", "BarChart(", "Form(", "FollowUpBlock(", "Button("]) {
        expect(text, `${expected} should appear in the chat prompt`).toContain(expected);
      }
      for (const omitted of ["AppShell(", "Sidebar(", "SplitView(", "KanbanBoard("]) {
        expect(text, `${omitted} should NOT appear in the chat prompt`).not.toContain(omitted);
      }
    });

    it("is significantly shorter than the full prompt", () => {
      const full = generatePrompt(defaultLibrary);
      const chat = generatePrompt(defaultLibrary, { mode: "chat" });
      expect(chat.length).toBeLessThan(full.length / 2);
    });

    it("supports preamble, examples, tools, and additional rules", () => {
      const text = generatePrompt(defaultLibrary, {
        mode: "chat",
        preamble: "You are Acme's helpful chat assistant.",
        examples: ["root = Stack([title])\ntitle = TextContent(\"Hello\")"],
        tools: [{ name: "lookup_order", description: "Look up an order by id." }],
        additionalRules: ["Be terse."],
      });
      expect(text).toContain("Acme's helpful chat assistant");
      expect(text).toContain("Hello");
      expect(text).toContain("lookup_order");
      expect(text).toContain("Be terse.");
    });
  });
});
