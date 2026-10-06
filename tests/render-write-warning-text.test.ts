/**
 * The one-time "state write during render" warning must describe what actually
 * triggers it. A `$x = …` directly in a `function` declaration's body is a
 * set-once declaration while rendering, so it never warns; the same write nested
 * in an `if` or a loop, directly in an arrow or function-expression body, or a
 * compound write such as `$n++`, does. Only a PascalCase component gets its own
 * copy per instance, and an existing top-level atom of that name wins. The old
 * text blamed a lowercase function and told authors a PascalCase component was
 * needed for set-once semantics, and an earlier rewrite said "whatever the
 * function's name or case", which is wrong for arrow bodies.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderWarnings(program: string, click?: string): Promise<{ warnings: string[]; screen: ReturnType<typeof render> }> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const screen = render(program);
  await screen.flush(12);
  if (click) await screen.click(click);
  return { warnings: warn.mock.calls.map((call) => String(call[0])).filter((message) => message.includes("during render")), screen };
}

describe("state write during render warning", () => {
  it.each([
    ["nested in an `if`", "$app(app())\nfunction app() {\n  if (true) {\n    $n = 5\n  }\n  return Text(`n=${$n}`)\n}"],
    ["nested in a `for` loop", "$app(app())\nfunction app() {\n  for (const i of [1]) {\n    $n = 5\n  }\n  return Text(`n=${$n}`)\n}"],
    ["a compound write", "let $n = 0\n$app(app())\nfunction app() {\n  $n += 1\n  return Text(`n=${$n}`)\n}"],
    ["directly in an arrow body", "$app(view())\nconst view = () => {\n  $n = 5\n  return Text(`n=${$n}`)\n}"],
    [
      "directly in a function expression body",
      "$app(Column([1].map(function (i) {\n  $n = 5\n  return Text(`n=${$n}`)\n})))",
    ],
  ])("fires once for a write %s, and states the set-once rule precisely", async (_label, program) => {
    const { warnings } = await renderWarnings(program);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("a write that is not a set-once declaration");
    expect(warnings[0]).toContain("directly in an arrow or function-expression body");
    expect(warnings[0]).toContain(
      "A `$name = …` written directly in the body of a `function` declaration (not an arrow or function expression) is a set-once declaration while rendering",
    );
    expect(warnings[0]).toContain(
      "only a PascalCase component gets its own copy per instance, while in a lowercase function every call shares one atom, and an existing top-level atom of that name wins",
    );
    expect(warnings[0]).not.toContain("whatever the function's");
    expect(warnings[0]).not.toContain("re-writes the atom every render");
  });

  it.each([
    ["lowercase", "app"],
    ["PascalCase", "App"],
  ])("does not fire for a body-level `$n = 5` in a %s `function` declaration", async (_label, name) => {
    const { warnings } = await renderWarnings(`
$app(${name}())

function ${name}() {
  $n = 5
  return Text(\`n=\${$n}\`)
}
`);

    expect(warnings).toEqual([]);
  });

  it.each([
    ["a lowercase function shares one atom between its calls", "counter", ["a=1", "b=1"]],
    ["a PascalCase component gets one atom per instance", "Counter", ["a=1", "b=0"]],
  ])("%s, as the warning says", async (_label, name, expected) => {
    const { warnings, screen } = await renderWarnings(
      `
$app(Column([${name}("a"), ${name}("b")]))

function ${name}(label) {
  $c = 0
  return Column([Text(\`\${label}=\${$c}\`), Button(\`inc-\${label}\`, () => { $c = $c + 1 })])
}
`,
      "inc-a",
    );

    for (const text of expected) expect(screen.queryByText(text)).not.toBeNull();
    expect(warnings).toEqual([]);
  });

  it("lets an existing top-level atom win over the set-once declaration, as the warning says", async () => {
    const { warnings, screen } = await renderWarnings(`
let $n = 0
$app(app())

function app() {
  $n = 5
  return Text(\`n=\${$n}\`)
}
`);

    expect(screen.queryByText("n=0")).not.toBeNull();
    expect(warnings).toEqual([]);
  });
});
