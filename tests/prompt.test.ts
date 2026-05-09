import { describe, expect, it } from "vitest";
import { generatePrompt } from "../src/prompt/generator.js";
import { defaultLibrary } from "../src/library/index.js";

describe("generatePrompt", () => {
  it("includes syntax, components, and root rule", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("LLM Response UI Lang");
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
});
