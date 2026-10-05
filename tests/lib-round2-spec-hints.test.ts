/**
 * Spec hints that described a narrower value than the renderer accepts.
 *
 *   - SegmentedControl's `value` hint said `string` while option values keep
 *     their type (a numeric option writes a number back), so the prompt, the
 *     schema and hover all showed a type the component does not produce.
 */

import { describe, expect, it } from "vitest";
import { SegmentedControl } from "../src/library/components/marketing.js";
import { propExpectsObject } from "../src/library/types.js";
import { validateProgramSchema } from "../src/library/validate.js";
import { defaultLibrary } from "../src/library/index.js";
import { parse } from "../src/parser/index.js";

describe("SegmentedControl(value:)", () => {
  const value = SegmentedControl.props.find((p) => p.name === "value")!;

  it("is hinted `string | number`", () => {
    expect(value.type).toBe("string | number");
  });

  it("is still not an object prop, so a trailing `{…}` stays the named props", () => {
    expect(propExpectsObject(value)).toBe(false);
    const program = parse(`$app(SegmentedControl([1, 2], 2, { size: "sm" }))`);
    expect(program.errors).toEqual([]);
    expect(validateProgramSchema(program, defaultLibrary).map((e) => e.message)).toEqual([]);
  });
});
