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
    for (const name of ["Avatar", "Progress", "Switch", "Toggle", "Tooltip", "Breadcrumb", "Pagination", "Sheet", "Grid"]) {
      expect(text, `${name} should appear in the prompt`).toContain(`${name}(`);
    }
    // Pattern composites
    for (const name of ["Hero", "PageHeader", "MetricGrid", "EmptyState", "Timeline", "FeatureGrid", "KanbanBoard"]) {
      expect(text, `${name} should appear in the prompt`).toContain(`${name}(`);
    }
    // The Patterns group is announced in components section
    expect(text).toContain("### Patterns");
    expect(text).toContain("### Feedback & Media");
    expect(text).toContain("### Navigation");
  });

  it("falls back to a built-in rich example when none is provided", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("## Examples");
    expect(text).toContain("MetricGrid");
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

  it("omits the JavaScript interactions section by default", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).not.toContain("## JavaScript interactions");
    expect(text).not.toContain('Script("id"');
    expect(text).not.toContain("### Scripting");
  });

  it("includes the JavaScript interactions section when enabled", () => {
    const text = generatePrompt(defaultLibrary, { enableJavascript: true });
    expect(text).toContain("## JavaScript interactions");
    expect(text).toContain('Script("id"');
    expect(text).toContain("@Js(");
    expect(text).toContain("ctx.state.set");
    expect(text).toContain("ctx.tools");
    expect(text).toContain("ctx.cleanup");
    // The Scripting group should also surface in the Components section.
    expect(text).toContain("### Scripting");
  });
});
