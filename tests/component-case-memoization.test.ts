/**
 * First-letter case decides more than per-instance state: a PascalCase component
 * re-executes only when its own inputs change, while a lowercase function is
 * re-run on every render of its caller. Measured behind the case notes in
 * `docs/language.html` (the "Set-once" and per-component re-rendering paragraphs).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ["a PascalCase component", "ShowAge", 1],
  ["a lowercase function", "showAge", 3],
])("%s", (_label, name, runs) => {
  it(`runs ${runs} time(s) over two re-renders that only change a sibling atom`, async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const screen = render(`
let $user = { name: "Ada", age: 36 }
let $tick = 0
$app(Column([
  Text(\`tick=\${$tick}\`),
  Button("bump", () => { $tick = $tick + 1 }),
  ${name}($user.age)
]))

function ${name}(age) {
  console.log("ran")
  return Text(\`age=\${age}\`)
}
`);
    await screen.flush(12);
    await screen.click("bump");
    await screen.click("bump");

    expect(screen.queryByText("tick=2")).not.toBeNull();
    expect(log.mock.calls.filter((call) => call[0] === "ran")).toHaveLength(runs);
  });
});
