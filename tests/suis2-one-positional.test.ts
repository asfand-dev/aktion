/**
 * Acceptance tests for Aktion 0.5 §19.1 — "one positional
 * argument max" enforcement.
 *
 * The redesign mandates that every component call accepts at most one
 * positional argument (the canonical primary slot) and every other
 * argument MUST be passed as a named arg (`prop: value`). This file
 * pins down:
 *
 *   - The `PropSpec.positional` flag + `findPositionalIndex` helper
 *     correctly identify the canonical positional prop, even when it
 *     lives at a non-zero slot (e.g. `Callout(variant?, title (positional))`).
 *   - `assertOnePositionalMax` throws on contradictory specs.
 *   - `validateProgramSchema` surfaces an advisory warning when a call
 *     passes more than one positional argument.
 *   - The evaluator routes the single positional arg to the spec's
 *     positional slot, regardless of the prop's index in `props`.
 *   - Named arg values land in the right spec slot (slot order, not
 *     source order) — verifies `argMeta` alignment for state-ref binding.
 *   - `bind:value: $atom` lifts the bind target's name onto the slot's
 *     `argMeta.stateRef` so library renderers can wire two-way binding
 *     for both the legacy positional `$x` and the canonical `bind:` form.
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
  // Grab the LAST assignment — programs may start with `$state` declarations.
  const stmt = [...program.statements].reverse().find((s) => s.kind === "Assignment");
  if (!stmt || stmt.kind !== "Assignment") throw new Error("expected an assignment");
  const value = evaluate(stmt.expression, ctx);
  if (!isComponentNode(value)) throw new Error("expected a ComponentNode");
  return value;
}

describe("§19.1 — schema metadata", () => {
  it("`findPositionalIndex` returns the explicitly-marked prop's index", () => {
    const callout = defaultLibrary.components.find((c) => c.name === "Callout")!;
    // `Callout` declares `variant?, title (positional), description?, ...`
    // so the positional slot is slot 1, not slot 0.
    expect(findPositionalIndex(callout)).toBe(1);
    expect(findPositionalProp(callout)?.name).toBe("title");
  });

  it("`findPositionalIndex` falls back to slot 0 when no explicit marker is set", () => {
    const stack = defaultLibrary.components.find((c) => c.name === "Stack")!;
    // Stack does not declare an explicit `positional: true` flag; the
    // default-to-slot-0 fallback should return 0 (the `children` prop).
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
    // Each of these moves the positional away from slot 0 — verify the
    // explicit marker steers `findPositionalIndex` correctly.
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
    // Library import already runs the assert; calling it again confirms the
    // invariant survives any future spec edits.
    expect(() => assertOnePositionalMax(defaultLibrary.components)).not.toThrow();
  });
});

describe("§19.1 — validateProgramSchema warns on multi-positional", () => {
  it("flags `Button(label, variant, ...)` as a multi-positional violation", () => {
    const program = parse(`btn = Button("Save", "primary", true)`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    const warn = warnings.find((w) => w.message.startsWith("Button(...)"));
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/at most one positional argument/);
    expect(warn!.message).toMatch(/"label" prop/);
    expect(warn!.message).toMatch(/action: …/);
  });

  it("flags `StatCard(\"Revenue\", \"$48k\", \"up\", …)` with extras counted", () => {
    const program = parse(
      `card = StatCard("Revenue", "$48k", "up", "+12%", "chart-pie")`,
    );
    const warnings = validateProgramSchema(program, defaultLibrary);
    const warn = warnings.find((w) => w.message.startsWith("StatCard(...)"));
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/at most one positional argument/);
    expect(warn!.message).toMatch(/value: …, trend: …, delta: …, icon: …/);
  });

  it("accepts a single-positional call without warnings", () => {
    const program = parse(`btn = Button("Save", variant: "primary", loading: true)`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("accepts a single-positional call to a non-slot-0 positional spec", () => {
    // `Callout` keeps `variant` at slot 0 and `title` at slot 1 (positional).
    // The one positional arg lands in `title` via named-args + bare label.
    const program = parse(
      `note = Callout("Saved!", variant: "success", description: "Changes applied.")`,
    );
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });

  it("never warns on `key:` even alongside the canonical positional", () => {
    const program = parse(`btn = Button("Save", key: "save-btn", variant: "primary")`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings).toEqual([]);
  });
});

describe("§19.1 — evaluator routes positional args to the spec slot", () => {
  it("routes a single positional to the `(positional)` slot when it is not slot 0", () => {
    // Callout's positional is `title` (slot 1). The bare string should
    // land in slot 1, leaving slot 0 (`variant`) empty when omitted.
    const node = evalCall(`x = Callout("Saved!", variant: "success")`);
    expect(node.name).toBe("Callout");
    // args layout: [variant, title, ...]
    expect(node.args[0]).toBe("success");
    expect(node.args[1]).toBe("Saved!");
  });

  it("named-arg slot order matches spec slot order (not source order)", () => {
    // The named args are written `variant: …, size: …, type: …` (source
    // order) but spec slot order for Button is `label, action, variant,
    // type, size, ...`. The evaluator must map each named arg into the
    // right slot so the renderer's positional `args[N]` reads still work.
    const node = evalCall(
      `x = Button("Save", variant: "primary", size: "lg", type: "submit")`,
    );
    expect(node.args[0]).toBe("Save");     // label slot
    expect(node.args[2]).toBe("primary");  // variant slot
    expect(node.args[3]).toBe("submit");   // type slot
    expect(node.args[4]).toBe("lg");       // size slot
  });

  it("multi-positional is gracefully accepted (legacy fallback)", () => {
    // Schema-validator warns but the runtime still places extras in the
    // next unfilled slots so legacy programs keep rendering.
    const node = evalCall(
      `x = StatCard("Revenue", "$48k", "up", "+12%", "chart-pie")`,
    );
    expect(node.args[0]).toBe("Revenue");  // label
    expect(node.args[1]).toBe("$48k");     // value
    expect(node.args[2]).toBe("up");       // trend
    expect(node.args[3]).toBe("+12%");     // delta
    expect(node.args[4]).toBe("chart-pie"); // icon
  });
});

describe("§19.1 — bind:value lifts target onto argMeta.stateRef", () => {
  it("`bind:value: $title` sets argMeta on the right slot", () => {
    const node = evalCall(
      `$title = "hello"\nx = Input("title", placeholder: "Title", bind:value: $title)`,
    );
    expect(node.name).toBe("Input");
    // Spec props: [id, placeholder, type, validations, value]. Slot 4 = value.
    expect(node.argMeta[4]?.stateRef).toBe("title");
    expect(node.argMeta[0]?.stateRef).toBeUndefined();
  });

  it("`value: $title` (named arg with state ref) also sets stateRef", () => {
    const node = evalCall(
      `$title = "hello"\nx = Input("title", placeholder: "Title", value: $title)`,
    );
    expect(node.argMeta[4]?.stateRef).toBe("title");
  });

  it("a single positional `$variable` still lifts argMeta.stateRef (default slot 0)", () => {
    // Button has no explicit `positional: true` flag — the default-to-slot-0
    // fallback should land the bare `$label` ref on the `label` slot (slot 0)
    // and lift its name into argMeta so renderers can react to changes.
    const node = evalCall(`$label = "Save"\nx = Button($label)`);
    expect(node.argMeta[0]?.stateRef).toBe("label");
  });
});

describe("§19.1 — prompt projection", () => {
  it("teaches the one-positional rule in the Syntax section", () => {
    const prompt = generatePrompt(defaultLibrary);
    expect(prompt).toMatch(/One positional argument max/);
    expect(prompt).toMatch(/StatCard\("Revenue", value: "\$48k"/);
  });

  it("marks the canonical positional prop with `(positional)` in component signatures", () => {
    const prompt = generatePrompt(defaultLibrary);
    // Callout's positional is `title` — must be tagged.
    expect(prompt).toMatch(/Callout\([^)]*title[^)]*\(positional\)/);
    // CodeBlock's positional is `codeString`.
    expect(prompt).toMatch(/CodeBlock\([^)]*codeString[^)]*\(positional\)/);
    // Portal's positional is `children`.
    expect(prompt).toMatch(/Portal\([^)]*children[^)]*\(positional\)/);
    // ErrorBoundary keeps `children` as the trailing positional.
    expect(prompt).toMatch(/ErrorBoundary\([^)]*children[^)]*\(positional\)/);
  });
});
