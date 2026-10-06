/**
 * A `$x = …` written directly in a function body is a set-once declaration while
 * the UI renders and an ordinary write from a handler; the same statement nested
 * in an `if` or a loop is always an ordinary write. Measured examples behind
 * `docs/language.html#set-once`. Related: `render-loop-guard.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RENDER_WARNING = "during render";

describe("body-level `$x = …`", () => {
  it("seeds once during render, survives a re-render, and is an ordinary write from a handler", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const screen = render(`
$app(app())

function app() {
  $n = 5
  return Column([
    Text(\`n=\${$n}\`),
    Button("inc", () => { $n = $n + 1 }),
    Button("reset", reset)
  ])
}

function reset() {
  $n = 0
}
`);
    await screen.flush(12);
    expect(screen.queryByText("n=5")).not.toBeNull();

    await screen.click("inc");
    expect(screen.queryByText("n=6")).not.toBeNull();

    await screen.click("reset");
    expect(screen.queryByText("n=0")).not.toBeNull();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes(RENDER_WARNING))).toEqual([]);
  });

  it("is an ordinary write when the function runs from a handler, nested or not", async () => {
    const screen = render(`
let $n = 1
let $m = 1
$app(Column([Text(\`n=\${$n}\`), Text(\`m=\${$m}\`), Button("flat", flat), Button("nested", nested)]))

function flat() {
  $n = 9
}

function nested() {
  if (true) {
    $m = 9
  }
}
`);
    await screen.flush(12);
    await screen.click("flat");
    expect(screen.queryByText("n=9")).not.toBeNull();
    await screen.click("nested");
    expect(screen.queryByText("m=9")).not.toBeNull();
  });
});

describe.each([
  ["an `if`", "if (true) {\n    $n = 5\n  }"],
  ["a `for` loop", "for (const i of [1]) {\n    $n = 5\n  }"],
])("the same write nested in %s", (_label, nested) => {
  it("is an ordinary write in render position: it clobbers the handler's value and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const screen = render(`
$app(app())

function app() {
  ${nested}
  return Column([Text(\`n=\${$n}\`), Button("inc", () => { $n = $n + 1 })])
}
`);
    await screen.flush(12);
    expect(screen.queryByText("n=5")).not.toBeNull();

    await screen.click("inc");
    expect(screen.queryByText("n=5")).not.toBeNull();
    expect(warn.mock.calls.some((call) => String(call[0]).includes(RENDER_WARNING))).toBe(true);
  });
});
