/**
 * Prop aliases (PropSpec.aliases) — named arguments at the call site must
 * also resolve through aliases. This is the mechanism that lets authors
 * write `Badge("Live", { tone: "success" })` *and* `Badge("Live", { variant:
 * "success" })` and have both forms land in the same spec slot.
 *
 * Regression test for the bug where `Badge("Primary", { tone: "primary" })`
 * silently dropped `tone:` (the prop was called `variant`) and every
 * badge rendered as `data-variant="neutral"`.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  defaultLibrary,
  validateProgramSchema,
} from "../src/library/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  evaluate,
  isComponentNode,
  type ComponentNode,
} from "../src/runtime/index.js";

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

function evalExpression(src: string): unknown {
  const program = parse(src);
  expect(program.errors).toEqual([]);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  planProgram(program, ctx);
  const stmt = [...program.statements].reverse().find((s) => s.kind === "Assignment");
  if (!stmt || stmt.kind !== "Assignment") throw new Error("expected an assignment");
  return evaluate(stmt.expression, ctx);
}

describe("trailing object keyword keys", () => {
  it("accepts reserved keywords as keys inside trailing objects (e.g. `action:`)", () => {
    const program = parse(
      `b = Button("Save", { action: () => 1, variant: "primary" })`,
    );
    expect(program.errors).toEqual([]);
  });

  it("accepts other tier keywords as trailing object keys without escaping", () => {
    for (const name of ["action", "effect", "query", "mutation", "subscription", "component", "then"]) {
      const program = parse(`x = Foo("v", { ${name}: 1 })`);
      expect(program.errors.map((e) => e.message)).toEqual([]);
    }
  });
});

describe("PropSpec.aliases", () => {
  it("Badge('X', { tone: 'primary' }) routes tone via the canonical prop slot", () => {
    const node = evalCall(`x = Badge("Primary", { tone: "primary" })`);
    expect(node.name).toBe("Badge");
    expect(node.args[0]).toBe("Primary"); // label
    expect(node.args[1]).toBe("primary"); // tone
  });

  it("Badge('X', { variant: 'primary' }) still works via the variant alias", () => {
    const node = evalCall(`x = Badge("Primary", { variant: "primary" })`);
    expect(node.args[1]).toBe("primary");
  });

  it("Callout accepts both `tone:` and the legacy `variant:` alias", () => {
    const a = evalCall(`x = Callout("Done", { tone: "success", text: "Saved" })`);
    const b = evalCall(`x = Callout("Done", { variant: "success", text: "Saved" })`);
    expect(a.args[0]).toBe("success");
    expect(b.args[0]).toBe("success");
    expect(a.args[2]).toBe("Saved");
    expect(b.args[2]).toBe("Saved");
  });

  it("BadgeList accepts both `tone:` and the legacy `variant:` alias", () => {
    const a = evalCall(`x = BadgeList(["a", "b"], { tone: "info" })`);
    const b = evalCall(`x = BadgeList(["a", "b"], { variant: "info" })`);
    expect(a.args[1]).toBe("info");
    expect(b.args[1]).toBe("info");
  });

  it("Validator accepts alias names without flagging them as unknown props", () => {
    const program = parse(`x = Badge("Primary", { tone: "primary" })`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.find((w) => /Unknown prop/.test(w.message))).toBeUndefined();
  });

  it("Validator still flags genuinely unknown props", () => {
    const program = parse(`x = Badge("Primary", { colour: "primary" })`);
    const warnings = validateProgramSchema(program, defaultLibrary);
    expect(warnings.find((w) => /Unknown prop "colour"/.test(w.message))).toBeDefined();
  });

  it("Six badges with six distinct `tone:` values produce six distinct slot values", () => {
    const src = `root = [
  Badge("Default"),
  Badge("Primary", { tone: "primary" }),
  Badge("Success", { tone: "success" }),
  Badge("Warning", { tone: "warning" }),
  Badge("Danger",  { tone: "danger" }),
  Badge("Info",    { tone: "info" })
]`;
    const arr = evalExpression(src) as ComponentNode[];
    const tones = arr.map((badge) => badge.args[1]);
    expect(tones).toEqual([undefined, "primary", "success", "warning", "danger", "info"]);
  });
});
