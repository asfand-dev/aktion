import { describe, expect, it } from "vitest";
import {
  getSemanticTokens,
  semanticTokenTypes,
} from "../src/tooling/semantic-tokens.js";

function typesAt(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of getSemanticTokens(source)) out.set(`${t.line}:${t.column}`, t.tokenType);
  return out;
}

describe("getSemanticTokens", () => {
  it("classifies library components, builtins, state, and properties", () => {
    const source = [
      "$count = 0",
      "function Widget() {",
      "  return Text(`${$count}`)",
      "}",
      "$app(Widget())",
    ].join("\n");

    const tokens = getSemanticTokens(source);
    const byType = (type: string) => tokens.filter((t) => t.tokenType === type);

    // `Text` is a library component → class + defaultLibrary.
    const text = byType("class").find((t) => t.line === 3);
    expect(text).toBeDefined();
    expect(text?.tokenModifiers).toContain("defaultLibrary");

    // `$app` is a builtin → function + defaultLibrary.
    const app = tokens.find((t) => t.line === 5 && t.column === 1);
    expect(app?.tokenType).toBe("function");
    expect(app?.tokenModifiers).toContain("defaultLibrary");

    // `Widget` (user component) → class without defaultLibrary.
    const widget = byType("class").find((t) => t.line === 2);
    expect(widget?.tokenModifiers).not.toContain("defaultLibrary");

    // `$count` reactive atom → variable.
    expect(byType("variable").some((t) => t.line === 1)).toBe(true);
  });

  it("tags member access as a property", () => {
    const source = "x = $user.name";
    const tokens = getSemanticTokens(source);
    const name = tokens.find((t) => t.tokenType === "property");
    expect(name).toBeDefined();
  });

  it("only emits known legend token types", () => {
    const legend = new Set<string>(semanticTokenTypes);
    for (const t of getSemanticTokens("$x = 1\nfunction Go() { return Card([]) }")) {
      expect(legend.has(t.tokenType)).toBe(true);
    }
  });
});
