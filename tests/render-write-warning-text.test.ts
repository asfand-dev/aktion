/**
 * The one-time "state write during render" warning must describe what actually
 * triggers it. A `$x = …` directly in a function body is a set-once declaration
 * while rendering (whatever the function's case), so it never warns; the same
 * write nested in an `if` or a loop, or a compound write such as `$n++`, does.
 * The old text blamed a lowercase function and told authors a PascalCase
 * component was needed for set-once semantics.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderWarnings(program: string): Promise<string[]> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const screen = render(program);
  await screen.flush(12);
  return warn.mock.calls.map((call) => String(call[0])).filter((message) => message.includes("during render"));
}

describe("state write during render warning", () => {
  it.each([
    ["nested in an `if`", "if (true) {\n    $n = 5\n  }"],
    ["nested in a `for` loop", "for (const i of [1]) {\n    $n = 5\n  }"],
    ["a compound write", "$n += 1"],
  ])("fires once for a write %s, and says what a set-once declaration is", async (_label, body) => {
    const warnings = await renderWarnings(`
let $n = 0
$app(app())

function app() {
  ${body}
  return Text(\`n=\${$n}\`)
}
`);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("a write that is not a set-once declaration");
    expect(warnings[0]).toContain("directly in a function body is a set-once declaration while rendering");
    expect(warnings[0]).toContain("whatever the function's name or case");
    expect(warnings[0]).not.toContain("PascalCase");
    expect(warnings[0]).not.toContain("lowercase");
  });

  it.each([
    ["lowercase", "app"],
    ["PascalCase", "App"],
  ])("does not fire for a body-level `$n = 5` in a %s function", async (_label, name) => {
    const warnings = await renderWarnings(`
$app(${name}())

function ${name}() {
  $n = 5
  return Text(\`n=\${$n}\`)
}
`);

    expect(warnings).toEqual([]);
  });
});
