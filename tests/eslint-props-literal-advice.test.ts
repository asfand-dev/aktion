/**
 * The runtime behind `aktion/props-literal`'s `objectReadAsProps` advice
 * (tests/fixtures/eslint-generated-dsl/positional-object.aktion.ts): an object
 * literal followed by more arguments is read as the props bag, and the fix is
 * to move it, and the arguments after it, into the bag by name. This mounts
 * the reported call and the advised one side by side.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";

afterEach(() => cleanup());

const ENTRY = [
  'import { Column, HTMLTag, Text } from "aktion-runtime/dsl";',
  "$app(",
  "  Column([",
  '    HTMLTag("div", { class: "reported", "data-id": 1 }, [Text("reported child")]),',
  '    HTMLTag("div", { attributes: { "data-id": 1 }, class: "advised", children: [Text("advised child")] }),',
  "  ]),",
  ");",
  "",
].join("\n");

async function mount() {
  const res = await linkProject({ entry: "app.aktion.js", files: { "app.aktion.js": ENTRY } });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion.js" }),
  );
  await flush();
  return screen;
}

describe("HTMLTag with an object literal followed by children", () => {
  it("the reported call drops the attribute and the child", async () => {
    const screen = await mount();
    const div = screen.shadowRoot.querySelector("div.reported");
    expect(div).not.toBeNull();
    expect(div!.hasAttribute("data-id")).toBe(false);
    expect(screen.queryByText("reported child")).toBeNull();
  });

  it("the advised call, everything passed by name, keeps both", async () => {
    const screen = await mount();
    const div = screen.shadowRoot.querySelector("div.advised");
    expect(div?.getAttribute("data-id")).toBe("1");
    expect(div?.textContent).toContain("advised child");
  });
});
