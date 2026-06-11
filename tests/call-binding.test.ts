/**
 * §19 flexible call binding — `chooseNamedBagIndex` decides which argument
 * of a library call (if any) is the named-props object:
 *
 *   - canonical: positional(s) + trailing `{ }` object;
 *   - all-positional: every argument binds to slots in declaration order;
 *   - all-named: a single object naming the props;
 *   - payload objects: a lone object for a one-prop (or object-typed
 *     positional) component binds positionally, never split between roles;
 *   - legacy leading bag: `Grid({ columns: 3 }, [...])` keeps working.
 */

import { describe, expect, it } from "vitest";
import {
  chooseNamedBagIndex,
  callArgShapes,
  slotForNthPositional,
  propExpectsObject,
  type ComponentSpec,
} from "../src/library/types.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary } from "../src/library/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  evaluate,
  isComponentNode,
  type ComponentNode,
} from "../src/runtime/index.js";

const render = () => document.createElement("div");
const shapes = (...args: Array<string[] | null>) => args.map((objectKeys) => ({ objectKeys }));

const oneObjectProp: ComponentSpec = {
  name: "ConfigComp",
  description: "single object-typed prop",
  props: [{ name: "config", type: "object" }],
  render,
};

const oneStringProp: ComponentSpec = {
  name: "TextComp",
  description: "single string prop",
  props: [{ name: "text", type: "string" }],
  render,
};

const dataFirst: ComponentSpec = {
  name: "DataComp",
  description: "object-typed positional + options",
  props: [
    { name: "data", type: "object", positional: true },
    { name: "title", type: "string", optional: true },
  ],
  render,
};

const srcThenMarks: ComponentSpec = {
  name: "Annotated",
  description: "string positional then object slot",
  props: [
    { name: "src", type: "string" },
    { name: "marks", type: "object", optional: true },
  ],
  render,
};

describe("chooseNamedBagIndex", () => {
  it("no object argument → -1", () => {
    expect(chooseNamedBagIndex(shapes(null, null), dataFirst)).toBe(-1);
  });

  it("single object for a one-object-prop component → positional payload", () => {
    expect(chooseNamedBagIndex(shapes(["anything"]), oneObjectProp)).toBe(-1);
    // Even keys that happen to match the prop name stay positional.
    expect(chooseNamedBagIndex(shapes(["config"]), oneObjectProp)).toBe(-1);
  });

  it("single object for a one-string-prop component → named only when keys match", () => {
    expect(chooseNamedBagIndex(shapes(["text"]), oneStringProp)).toBe(0);
    expect(chooseNamedBagIndex(shapes(["junk"]), oneStringProp)).toBe(-1);
  });

  it("single object, multi-prop component: all keys known → named bag", () => {
    expect(chooseNamedBagIndex(shapes(["title"]), dataFirst)).toBe(0);
    expect(chooseNamedBagIndex(shapes(["data", "title"]), dataFirst)).toBe(0);
  });

  it("single object, multi-prop component: unknown keys + object positional → payload", () => {
    expect(chooseNamedBagIndex(shapes(["rows", "labels"]), dataFirst)).toBe(-1);
  });

  it("trailing object after positionals is the bag (canonical form)", () => {
    expect(chooseNamedBagIndex(shapes(null, ["title"]), dataFirst)).toBe(1);
    // Typo'd props (some keys known) still count as the bag so validation can flag them.
    expect(chooseNamedBagIndex(shapes(null, ["title", "typo"]), dataFirst)).toBe(1);
  });

  it("trailing object with no known keys destined for an object slot → payload", () => {
    expect(chooseNamedBagIndex(shapes(null, ["x", "y"]), srcThenMarks)).toBe(-1);
  });

  it("leading object is the bag only when its keys look like props", () => {
    expect(chooseNamedBagIndex(shapes(["title"], null), dataFirst)).toBe(0);
    expect(chooseNamedBagIndex(shapes(["rows"], null), dataFirst)).toBe(-1);
  });

  it("universal style props count as known bag keys", () => {
    expect(chooseNamedBagIndex(shapes(null, ["sx"]), srcThenMarks)).toBe(1);
  });
});

describe("slot helpers", () => {
  it("slotForNthPositional follows positional-slot-first ordering", () => {
    const callout = defaultLibrary.components.find((c) => c.name === "Callout")!;
    // Callout's positional prop (`title`) lives at index 1.
    expect(slotForNthPositional(callout, 0)?.name).toBe("title");
    expect(slotForNthPositional(callout, 1)?.name).toBe(callout.props[0]!.name);
  });

  it("propExpectsObject accepts object/responsive-map types", () => {
    expect(propExpectsObject({ name: "x", type: "object" })).toBe(true);
    expect(propExpectsObject({ name: "x", type: "string | object" })).toBe(true);
    expect(propExpectsObject({ name: "x", type: "string" })).toBe(false);
  });
});

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

describe("end-to-end binding through the evaluator", () => {
  it("legacy leading bag keeps working: Grid({ columns: 3 }, [...])", () => {
    const node = evalCall(`x = Grid({ columns: 3 }, [Text("a")])`);
    expect(node.name).toBe("Grid");
    const gridSpec = defaultLibrary.components.find((c) => c.name === "Grid")!;
    const columnsSlot = gridSpec.props.findIndex((p) => p.name === "columns");
    expect(node.args[columnsSlot]).toBe(3);
    expect(Array.isArray(node.args[0])).toBe(true);
  });

  it("all-named single object binds by name", () => {
    const node = evalCall(`x = Badge({ label: "Live", tone: "success" })`);
    expect(node.name).toBe("Badge");
    const spec = defaultLibrary.components.find((c) => c.name === "Badge")!;
    const labelSlot = spec.props.findIndex((p) => p.name === "label");
    expect(node.args[labelSlot]).toBe("Live");
  });

  it("mixed positional + named still wins by name", () => {
    const node = evalCall(`x = Button("Save", { variant: "primary" })`);
    expect(node.args[0]).toBe("Save");
    expect(node.args[2]).toBe("primary");
  });
});
