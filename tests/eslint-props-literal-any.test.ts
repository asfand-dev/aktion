/**
 * The runtime half of `aktion/props-literal`'s `any` exemption: in an untyped
 * `.aktion.js` module every parameter is `any`, TypeScript resolves
 * `Button("Save", onSave)` to the first overload, `(label, props?)`, and the
 * rule must still stay silent — because the runtime binds a non-literal
 * argument positionally. This mounts the lint fixture's own silent controls,
 * copied line for line out of tests/fixtures/eslint-generated-dsl/untyped.aktion.js
 * (the whole fixture does not compile: its `propsSpread` case is E117), and
 * checks each argument reached the positional slot: `onSave` is the click
 * handler, `d.path` the description's value, `user.variant` the text variant.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";

afterEach(() => cleanup());

const FIXTURE_LINES = readFileSync(join(__dirname, "fixtures", "eslint-generated-dsl", "untyped.aktion.js"), "utf8").split("\n");

/** The fixture's one-line `export function <name>(…) { … }` declaration. */
function fixtureFunction(name: string): string {
  const line = FIXTURE_LINES.find((text) => text.startsWith(`export function ${name}(`));
  if (!line) throw new Error(`untyped.aktion.js declares no ${name}`);
  return line;
}

const CONTROLS = [
  'import { Button, DescriptionItem, Text } from "aktion-runtime/dsl";',
  ...["Save", "Detail", "Greeting"].map(fixtureFunction),
  "",
].join("\n");

const ENTRY = [
  'import { Column, Text } from "aktion-runtime/dsl";',
  'import { Detail, Greeting, Save } from "./controls.aktion.js";',
  "let $clicks = 0;",
  "$app(",
  "  Column([",
  "    Save(() => { $clicks = $clicks + 1; }),",
  "    Text(`clicks=${$clicks}`),",
  '    Detail({ path: "/srv/x" }),',
  '    Greeting({ variant: "heading" }),',
  "  ]),",
  ");",
  "",
].join("\n");

async function mountFixture() {
  const res = await linkProject({ entry: "app.aktion.js", files: { "app.aktion.js": ENTRY, "controls.aktion.js": CONTROLS } });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion.js" }),
  );
  await flush();
  return screen;
}

describe("an `any` argument the first overload types as `props` is positional at run time", () => {
  it("Button(\"Save\", onSave) binds onSave to onClick", async () => {
    const screen = await mountFixture();
    await screen.click("Save");
    await flush();
    await screen.click("Save");
    await flush();
    expect(screen.getByText("clicks=2")).toBeTruthy();
  });

  it("DescriptionItem(\"Path\", d.path) binds d.path to value", async () => {
    const screen = await mountFixture();
    expect(screen.getByText("/srv/x")).toBeTruthy();
  });

  it("Text(\"Hello\", user.variant) binds user.variant to variant", async () => {
    const screen = await mountFixture();
    expect(screen.getByText("Hello").closest("[data-variant]")?.getAttribute("data-variant")).toBe("heading");
  });
});
