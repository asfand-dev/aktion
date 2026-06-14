/**
 * `root-not-renderable` validation diagnostic (issue #7 from issues-to-fix.md).
 *
 * A leftover bare-value root (`aktion = "cdn-distribution-manager"`) used to
 * validate clean and render a blank page. The schema validator now flags any
 * unambiguous literal root with an actionable message.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import { validateProgramSchema } from "../src/library/index.js";
import { defaultLibrary } from "../src/library/index.js";

function errorsFor(src: string): string[] {
  return validateProgramSchema(parse(src), defaultLibrary).map((e) => e.message);
}

describe("#7 root-not-renderable", () => {
  it("flags a leftover string root (the reported case)", () => {
    const msgs = errorsFor(`aktion = "cdn-distribution-manager"`);
    expect(msgs.some((m) => m.includes("root-not-renderable"))).toBe(true);
  });

  it("flags a number / boolean / template root", () => {
    expect(errorsFor(`aktion = 42`).some((m) => m.includes("root-not-renderable"))).toBe(true);
    expect(errorsFor(`aktion = true`).some((m) => m.includes("root-not-renderable"))).toBe(true);
    expect(errorsFor("aktion = `just text`").some((m) => m.includes("root-not-renderable"))).toBe(true);
  });

  it("flags a bare-string root passed to $app(...)", () => {
    const msgs = errorsFor(`$app("oops")`);
    expect(msgs.some((m) => m.includes("root-not-renderable"))).toBe(true);
  });

  it("does NOT flag a proper component-tree root", () => {
    expect(errorsFor(`aktion = Text("hi")`).some((m) => m.includes("root-not-renderable"))).toBe(false);
    expect(errorsFor(`$app(Column([Text("a")]))`).some((m) => m.includes("root-not-renderable"))).toBe(false);
  });

  it("does NOT flag an identifier / computed root (can't judge statically)", () => {
    const program = `pages = $router({ "/": Text("HOME"), default: Text("NF") })
aktion = pages`;
    expect(errorsFor(program).some((m) => m.includes("root-not-renderable"))).toBe(false);
  });

  it("honours last-wins — a good $app after a bad assignment is fine", () => {
    const program = `aktion = "leftover"
$app(Text("real root"))`;
    expect(errorsFor(program).some((m) => m.includes("root-not-renderable"))).toBe(false);
  });
});
