import { describe, expect, it } from "vitest";
import { generatePrompt } from "../src/prompt/generator.js";
import { defaultLibrary } from "../src/library/index.js";

describe("generatePrompt", () => {
  it("includes syntax, components, and root rule", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("Aktion");
    expect(text).toContain("$app(");
    expect(text).toContain("Stack(children: Node[]");
    expect(text).toContain("CardHeader(title: string");
  });

  it("toggles tool/binding sections by feature flag", () => {
    const minimal = generatePrompt(defaultLibrary, { toolCalls: false, bindings: false });
    expect(minimal).not.toContain("## Reactive State");
    expect(minimal).not.toContain("## Data — `$http({...})`");

    const full = generatePrompt(defaultLibrary, {
      tools: [{ name: "list_users", description: "Returns users.", argsExample: { limit: 10 } }],
    });
    expect(full).toContain("## Reactive State");
    expect(full).toContain("## Data — `$http({...})`");
    expect(full).toContain("list_users");
  });

  it("documents fine-grained (path-level) reactivity", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("Fine-grained reactivity");
    expect(text).toContain("$user.name");
    expect(text).toContain("path");
  });

  it("documents per-component re-rendering (memoization)", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("re-executes only when");
    expect(text).toContain("React.memo");
  });

  it("documents the global `$store({...})` primitive", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("Global stores");
    expect(text).toContain("$store({");
    expect(text).toContain("store.method(args)");
  });

  it("documents the hook primitives (`$state` / `$memo` / `$name`)", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("### Hooks");
    expect(text).toContain("$state(initial)");
    expect(text).toContain("$memo(");
    expect(text).toContain("function $name");
  });

  it("documents the `$util` runtime helper namespace", () => {
    const text = generatePrompt(defaultLibrary, {
      tools: [{ name: "lookup", description: "demo" }],
    });
    expect(text).toContain("`$util`");
    expect(text).toContain("$util.format");
    expect(text).toContain("$util.formatDate");
    expect(text).toContain("$util.sort");
    // Legacy `@`-builtin syntax must not be re-introduced.
    expect(text).not.toContain("@Filter(");
    expect(text).not.toContain("@Count(");
  });

  it("appends additional rules and examples", () => {
    const text = generatePrompt(defaultLibrary, {
      additionalRules: ["Always end with a FollowUpBlock."],
      examples: [`aktion = Stack([Card([CardHeader("Demo")])])`],
    });
    expect(text).toContain("Always end with a FollowUpBlock.");
    expect(text).toContain("Demo");
  });

  it("documents the actions, effects, and data surfaces in the full prompt", () => {
    const text = generatePrompt(defaultLibrary, {
      toolCalls: true,
      bindings: true,
      tools: [{ name: "list_users", description: "Returns users." }],
    });
    expect(text).toContain("## Effects");
    expect(text).toContain("## Actions");
    expect(text).toContain("## Data — `$http({...})`");
    expect(text).toContain("effect");
    expect(text).toContain("mount");
    expect(text).toContain("debounce(");
    expect(text).toContain("$http({");
    expect(text).toContain(".refetch()");
    expect(text).toContain(".loading");
    expect(text).toContain("Async(");
  });

  it("documents the router block surface in the full prompt", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("$router({");
    expect(text).toContain("NavLink");
    expect(text).toContain("route");
    // The router handle is `route` (not `$route`); `$router` is fine and would
    // otherwise trip a naive substring check, so match `$route` at a boundary.
    expect(text).not.toMatch(/\$route\b/);
    expect(text).toContain('"/":');
    expect(text).toContain("default:");
  });

  it("documents the single reactive state model and standard helper components", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("$count = 0");
    expect(text).toContain("## Standard helper components");
    for (const helper of ["Async", "Show", "Portal", "Redirect", "Lazy", "ErrorBoundary"]) {
      expect(text, `${helper} should appear in the helpers section`).toContain(helper);
    }
  });

  it("never teaches the LLM to escape backticks (regression test)", () => {
    const fullPrompt = generatePrompt(defaultLibrary, {
      toolCalls: true,
      tools: [{ name: "list_users", description: "Returns users." }],
    });
    const chatPrompt = generatePrompt(defaultLibrary, { mode: "chat" });
    expect(fullPrompt).not.toMatch(/\\`/);
    expect(chatPrompt).not.toMatch(/\\`/);
    expect(chatPrompt).toMatch(/`[^`]*\$\{/);
    expect(fullPrompt).toMatch(/`[^`]*\$\{/);
  });

  it("never teaches any legacy token that was removed from the language", () => {
    const fullPrompt = generatePrompt(defaultLibrary, {
      tools: [{ name: "demo", description: "demo", kind: "Query" }],
      bindings: true,
      toolCalls: true,
      inlineMode: true,
      editMode: true,
    });
    const chatPrompt = generatePrompt(defaultLibrary, { mode: "chat" });
    const forbidden = [
      "$$",
      "$state ",
      "$persist ",
      "$session ",
      "$shared ",
      "$computed ",
      "$query ",
      "$mutation ",
      "$subscription ",
      "query GetOrders",
      "mutation SaveOrder",
      "subscription LiveTicker",
      "@Run",
      "@Set",
      "@Reset",
      "@ToAssistant",
      "@OpenUrl",
      "@Navigate",
      "@Js",
      "@Const",
      "@Memo",
      "Routes(",
      "Route(",
      "setTools",
      "registerTools",
    ];
    for (const token of forbidden) {
      expect(fullPrompt, `full prompt must not mention legacy token ${token}`).not.toContain(token);
      expect(chatPrompt, `chat prompt must not mention legacy token ${token}`).not.toContain(token);
    }
  });

  it("teaches the bare $theme({...}) construct and no longer lists a Theme component", () => {
    const text = generatePrompt(defaultLibrary);
    // The dedicated theming section teaches the bare statement form.
    expect(text).toContain("$theme({");
    // The non-functional capitalized `Theme(...)` component entry and its
    // singleton group header were removed from the catalogue.
    expect(text).not.toMatch(/\n- Theme\(/);
    expect(text).not.toContain("### Theming");
  });

  describe("chat mode (read-only UI conversion)", () => {
    it("emits a compact read-only prompt with the expected section structure", () => {
      const text = generatePrompt(defaultLibrary, { mode: "chat" });
      expect(text).toContain("Aktion");
      expect(text).toContain("$app(");
      expect(text).toContain("## Syntax (read-only subset)");
      expect(text).toContain("## Component library (read-only)");
      expect(text).toContain("## `$util` — runtime helper namespace");
      expect(text).toContain("## Hoisting & streaming (CRITICAL)");
      expect(text).toContain("## Examples");
      expect(text).toContain("## Important rules");
      expect(text).toContain("## Final verification");
    });

    it("never teaches interactive / app-level surfaces in chat mode", () => {
      const text = generatePrompt(defaultLibrary, { mode: "chat" });
      expect(text).not.toContain("## Effects");
      expect(text).not.toContain("## Routing");
      expect(text).not.toContain("## Actions");
      expect(text).not.toContain("$router({");
      expect(text).not.toContain("## Data — `$http({...})`");
      expect(text).not.toContain("$http({");
      expect(text).not.toContain(`js` + `{`);
      expect(text).not.toContain("bind:value:");
    });

    it("includes only the read-only display components", () => {
      const text = generatePrompt(defaultLibrary, { mode: "chat" });
      for (const expected of [
        "Stack(", "Card(", "Table(", "BarChart(",
        "FollowUpBlock(", "Text(", "Markdown(", "Callout(",
      ]) {
        expect(text, `${expected} should appear in the chat prompt`).toContain(expected);
      }
      for (const omitted of [
        "AppShell", "Sidebar", "SplitView", "KanbanBoard",
        "Form", "Button", "Input", "TextArea", "Select", "Modal",
      ]) {
        expect(
          text,
          `${omitted} should NOT be listed as a chat-mode component`,
        ).not.toMatch(new RegExp(`\\n- ${omitted}\\(`));
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
        examples: ["aktion = Stack([title])\ntitle = Text(\"Hello\")"],
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
