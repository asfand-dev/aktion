/**
 * "Did you mean …?" suggestions on invalid prop names and enum values
 * (issue #13 from issues-to-fix.md).
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import { validateProgramSchema } from "../src/library/index.js";
import { defaultLibrary } from "../src/library/index.js";

function messagesFor(src: string): string[] {
  return validateProgramSchema(parse(src), defaultLibrary).map((e) => e.message);
}

describe("#13 did-you-mean suggestions", () => {
  it("suggests the closest enum value for a typo", () => {
    // `primry` is a typo of the `primary` tone/variant token.
    const msgs = messagesFor(`aktion = Button("Save", { variant: "primry" })`);
    const enumMsg = msgs.find((m) => m.includes('"primry"'));
    expect(enumMsg).toBeDefined();
    expect(enumMsg).toContain('Did you mean "primary"?');
  });

  it("suggests the closest prop name for a typo", () => {
    const msgs = messagesFor(`aktion = Text("hi", { algn: "left" })`);
    const propMsg = msgs.find((m) => m.includes('Unknown prop "algn"'));
    expect(propMsg).toBeDefined();
    expect(propMsg).toContain('Did you mean "align"?');
  });

  it("does NOT invent a suggestion for an unrelated value", () => {
    // `diagonal` is not a near-typo of any `direction` value — list, don't guess.
    const msgs = messagesFor(`aktion = Stack({ direction: "diagonal" })`);
    const enumMsg = msgs.find((m) => m.includes('"diagonal"'));
    expect(enumMsg).toBeDefined();
    expect(enumMsg).not.toContain("Did you mean");
  });

  it("still lists the valid options alongside the suggestion", () => {
    const msgs = messagesFor(`aktion = Button("Save", { variant: "primry" })`);
    const enumMsg = msgs.find((m) => m.includes('"primry"'))!;
    expect(enumMsg).toContain("must be one of");
  });
});
