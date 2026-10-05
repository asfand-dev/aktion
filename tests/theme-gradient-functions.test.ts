/**
 * `$theme({ gradients: { name: "…" } })` accepts a gradient STRING by reading
 * `THEME_GRADIENT_FUNCTIONS` — the same table the DSL types print
 * `ThemeGradient` from — rather than a regex of its own that only a test kept
 * in step with the table. Proven by giving the table one more function: the
 * runtime must accept it without being edited.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/theme/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/theme/index.js")>();
  return { ...actual, THEME_GRADIENT_FUNCTIONS: [...actual.THEME_GRADIENT_FUNCTIONS, "repeating-linear"] };
});

const { parse } = await import("../src/parser/index.js");
const { createContext, evaluate } = await import("../src/runtime/evaluator.js");
const { StateStore } = await import("../src/runtime/state.js");
const { defaultLibrary } = await import("../src/library/index.js");
type Expression = import("../src/parser/types.js").Expression;

function gradientOf(value: unknown): string | undefined {
  const ctx = createContext(new StateStore(), { library: defaultLibrary });
  const program = parse(`$theme(${JSON.stringify({ gradients: { brand: value } })})`);
  const theme = evaluate((program.statements[0] as { expression: Expression }).expression, ctx) as {
    tokens: Record<string, string>;
  };
  return theme.tokens.gradientBrand;
}

describe("$theme gradient strings follow THEME_GRADIENT_FUNCTIONS", () => {
  it("accepts a function the table gains", () => {
    expect(gradientOf("repeating-linear-gradient(#111111, #222222 10%)")).toBe(
      "repeating-linear-gradient(#111111, #222222 10%)",
    );
  });

  it("still accepts the built-in functions and rejects the rest", () => {
    expect(gradientOf("radial-gradient(#111111, #222222)")).toBe("radial-gradient(#111111, #222222)");
    expect(gradientOf("repeating-radial-gradient(#111111, #222222)")).toBeUndefined();
    expect(gradientOf("#ff0000")).toBeUndefined();
  });
});
