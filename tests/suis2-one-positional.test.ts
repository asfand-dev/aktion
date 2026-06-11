/**
 * Acceptance tests for Aktion §19 flexible call binding.
 *
 * A call may use ONE of: the canonical form (one positional for the
 * `(positional)` slot + a trailing named object), the all-positional form
 * (arguments bind to props in declaration order), or the all-named form
 * (a single object naming every prop). This file pins down:
 *
 *   - The `PropSpec.positional` flag + `findPositionalIndex` helper
 *     correctly identify the canonical positional prop, even when it
 *     lives at a non-zero slot (e.g. `Callout(variant?, title (positional))`).
 *   - `assertOnePositionalMax` throws on contradictory specs.
 *   - `validateProgramSchema` accepts all three call forms, checks
 *     positional arity, and validates literal enum values positionally.
 *   - The evaluator routes the single positional arg to the spec's
 *     positional slot, regardless of the prop's index in `props`.
 *   - Named arg values land in the right spec slot (slot order, not
 *     source order) — verifies `argMeta` alignment for state-ref binding.
 *   - `value: $atom` (and member chains `value: $form.email`) lift the
 *     target's dotted state path onto the slot's `argMeta.stateRef` so
 *     library renderers can wire two-way binding automatically — there
 *     is no longer a separate `bind:` keyword.
 *   - The system prompt's component signatures project the new
 *     `(positional)` tag onto the canonical primary prop.
 *   - The §19.1 rule is taught in the system prompt's syntax section.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  defaultLibrary,
  validateProgramSchema,
  findPositionalIndex,
  findPositionalProp,
  assertOnePositionalMax,
} from "../src/library/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  evaluate,
  isComponentNode,
  type ComponentNode,
} from "../src/runtime/index.js";
import { generatePrompt } from "../src/prompt/generator.js";

function evalCall(src: string): ComponentNode {
  const program = parse(src);
  expect(program.errors).toEqual([]);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  planProgram(program, ctx);
  const stmt = [...program.statements].reverse().find((s) => s.kind === "Assignment");
  if (!stmt || stmt.kind !== "Assignment") throw new Error("expected an assignment");
  const value = evaluate(stmt.expression, ctx);
  if (!isComponentNode(value)) throw new Error("expected a ComponentNode");
  return value;
}

describe("§19.1 — schema metadata", () => {
  it("`findPositionalIndex` returns the explicitly-marked prop's index", () => {
    const callout = defaultLibrary.components.find((c) => c.name === "Callout")!;
    expect(findPositionalIndex(callout)).toBe(1);
    expect(findPositionalProp(callout)?.name).toBe("title");
  });

  it("`findPositionalIndex` falls back to slot 0 when no explicit marker is set", () => {
    const stack = defaultLibrary.components.find((c) => c.name === "Stack")!;
    expect(findPositionalIndex(stack)).toBe(0);
    expect(findPositionalProp(stack)?.name).toBe("children");
  });

  it("`findPositionalIndex` returns -1 for void components", () => {
    const sep = defaultLibrary.components.find((c) => c.name === "MenuSeparator")!;
    expect(sep.props.length).toBe(0);
    expect(findPositionalIndex(sep)).toBe(-1);
    expect(findPositionalProp(sep)).toBeUndefined();
  });

  it("explicit positional markers cover the helpers whose positional ≠ slot 0", () => {
    const portal = defaultLibrary.components.find((c) => c.name === "Portal")!;
    const eb = defaultLibrary.components.find((c) => c.name === "ErrorBoundary")!;
    const code = defaultLibrary.components.find((c) => c.name === "CodeBlock")!;
    expect(findPositionalProp(portal)?.name).toBe("children");
    expect(findPositionalProp(eb)?.name).toBe("children");
    expect(findPositionalProp(code)?.name).toBe("codeString");
  });

  it("`assertOnePositionalMax` rejects a spec with two positional props", () => {
    expect(() =>
      assertOnePositionalMax([
        {
          name: "Bogus",
          description: "two positional flags",
          props: [
            { name: "a", type: "string", positional: true },
            { name: "b", type: "string", positional: true },
          ],
          render: () => document.createElement("div"),
        },
      ]),
    ).toThrowError(/Bogus.*declares 2 positional/);
  });

  it("`assertOnePositionalMax` accepts a spec with zero or one positional", () => {
    expect(() =>
      assertOnePositionalMax([
        {
          name: "Zero",
          description: "no positional",
          props: [{ name: "a", type: "string" }],
          render: () => document.createElement("div"),
        },
        {
          name: "One",
          description: "one positional",
          props: [
            { name: "a", type: "string" },
            { name: "b", type: "string", positional: true },
          ],
          render: () => document.createElement("div"),
        },
      ]),
    ).not.toThrow();
  });

  it("the default library passes the one-positional-max self-check at load", () => {
    expect(() => assertOnePositionalMax(defaultLibrary.components)).not.toThrow();
  });
});

describe("§19 — validateProgramSchema accepts the flexible call forms", () => {
  it("accepts an all-positional call (signature order)", () => {
    const program = parse(`btn = Button("Save", "primary", true)`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("accepts a long all-positional call", () => {
    const program = parse(
      `card = StatCard("Revenue", "$48k", "up", "+12%", "chart-pie")`,
    );
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("accepts an all-named single-object call", () => {
    const program = parse(`btn = Button({ label: "Save", variant: "primary", loading: true })`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("flags more positionals than the spec has props", () => {
    const program = parse(`e = Eyebrow("Pricing", "extra")`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    const warn = warnings.find((w) => w.message.startsWith("Eyebrow(...)"));
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/at most 1 positional argument/);
  });

  it("validates enum literals positionally along the slot mapping", () => {
    const program = parse(`s = Spinner("gigantic")`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    const warn = warnings.find((w) => w.message.includes("gigantic"));
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/must be one of/);
  });

  it("accepts a single-positional call without warnings", () => {
    const program = parse(`btn = Button("Save", { variant: "primary", loading: true })`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("accepts a single-positional call to a non-slot-0 positional spec", () => {
    const program = parse(
      `note = Callout("Saved!", { variant: "success", description: "Changes applied." })`,
    );
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("never warns on `key:` even alongside the canonical positional", () => {
    const program = parse(`btn = Button("Save", { key: "save-btn", variant: "primary" })`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });
});

describe("§19.1 — evaluator routes positional args to the spec slot", () => {
  it("routes a single positional to the `(positional)` slot when it is not slot 0", () => {
    const node = evalCall(`x = Callout("Saved!", { variant: "success" })`);
    expect(node.name).toBe("Callout");
    expect(node.args[0]).toBe("success");
    expect(node.args[1]).toBe("Saved!");
  });

  it("named-arg slot order matches spec slot order (not source order)", () => {
    const node = evalCall(
      `x = Button("Save", { variant: "primary", size: "lg", type: "submit" })`,
    );
    expect(node.args[0]).toBe("Save");     // label slot
    expect(node.args[2]).toBe("primary");  // variant slot
    expect(node.args[3]).toBe("submit");   // type slot
    expect(node.args[4]).toBe("lg");       // size slot
  });

  it("all-positional binds slots in declaration order", () => {
    const node = evalCall(
      `x = StatCard("Revenue", "$48k", "up", "+12%", "chart-pie")`,
    );
    expect(node.args[0]).toBe("Revenue");  // label
    expect(node.args[1]).toBe("$48k");     // value
    expect(node.args[2]).toBe("up");       // trend
    expect(node.args[3]).toBe("+12%");     // delta
    expect(node.args[4]).toBe("chart-pie"); // icon
  });

  it("a single all-named object binds by prop name", () => {
    const node = evalCall(`x = Button({ label: "Save", variant: "primary" })`);
    expect(node.name).toBe("Button");
    expect(node.args[0]).toBe("Save");     // label slot
    expect(node.args[2]).toBe("primary");  // variant slot
  });
});

describe("§19.1 — value: $atom lifts target onto argMeta.stateRef", () => {
  it("`value: $title` (trailing object with state ref) sets argMeta on the right slot", () => {
    const node = evalCall(
      `$title = "hello"\nx = Input("title", { placeholder: "Title", value: $title })`,
    );
    expect(node.name).toBe("Input");
    expect(node.argMeta[4]?.stateRef).toBe("title");
    expect(node.argMeta[0]?.stateRef).toBeUndefined();
  });

  it("`value: $form.email` (member chain rooted at $state) sets dotted argMeta.stateRef", () => {
    const node = evalCall(
      `$form = { email: "" }\nx = Input("email", { placeholder: "Email", value: $form.email })`,
    );
    expect(node.name).toBe("Input");
    expect(node.argMeta[4]?.stateRef).toBe("form.email");
  });

  it("`value: $cart.items[0]` (bracket access on $state) sets dotted argMeta.stateRef", () => {
    const node = evalCall(
      `$cart = { items: ["a"] }\nx = Input("first", { placeholder: "First", value: $cart.items[0] })`,
    );
    expect(node.argMeta[4]?.stateRef).toBe("cart.items.0");
  });

  it("a single positional `$variable` still lifts argMeta.stateRef (default slot 0)", () => {
    const node = evalCall(`$label = "Save"\nx = Button($label)`);
    expect(node.argMeta[0]?.stateRef).toBe("label");
  });
});

describe("§19 — prompt projection", () => {
  it("teaches the argument forms in the Syntax section", () => {
    const prompt = generatePrompt(defaultLibrary);
    expect(prompt).toMatch(/Argument forms/);
    expect(prompt).toMatch(/all-positional, signature order/);
    expect(prompt).toMatch(/StatCard\("Revenue", \{ value: "\$48k"/);
  });

  it("marks the canonical positional prop with `(positional)` in component signatures", () => {
    const prompt = generatePrompt(defaultLibrary);
    expect(prompt).toMatch(/Callout\([^)]*title[^)]*\(positional\)/);
    expect(prompt).toMatch(/CodeBlock\([^)]*codeString[^)]*\(positional\)/);
    expect(prompt).toMatch(/Portal\([^)]*children[^)]*\(positional\)/);
    expect(prompt).toMatch(/ErrorBoundary\([^)]*children[^)]*\(positional\)/);
  });
});
