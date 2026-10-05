/**
 * Where two diagnostics land, and what the runtime does in the cases E127
 * calls "ignored":
 *
 *   - E127 for a LITERAL computed route path (`$router({ ["/x"]: … })`) points
 *     at the key, like the non-literal case does — a literal key used to carry
 *     no position, so the report fell back to the `$` of `$router`;
 *   - the strict-mode "forwarded as a positional argument" warning stays
 *     silent for a component with a `...rest` parameter, which takes object
 *     arguments positionally by design;
 *   - the spread, computed-path and non-literal-`routes` arms E127 rejects
 *     really are ignored when the program runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, flush, render } from "../src/testing/index.js";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { parse } from "../src/parser/index.js";
import "../src/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const typescript = createTypeScriptFrontend();
const lines = (...l: string[]): string => l.join("\n");

function codes(src: string, path = "/src/m.aktion.js"): string[] {
  const frontend = path.endsWith(".ts") ? typescript : javascriptFrontend;
  const out = frontend.compile(src, path);
  return out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`);
}

const texts = (screen: ReturnType<typeof render>): string[] =>
  [...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent ?? "");

describe("E127 for a literal computed route path points at the key", () => {
  it("in .aktion.js and .aktion.ts", () => {
    const src = lines('$app($router({ ["/x"]: Text("X"), default: Text("NF") }))');
    // Column 17 is the `"` of `"/x"` (column 6 is the `$` of `$router`).
    expect(codes(src)).toEqual(["E127@1:17"]);
    expect(codes(src, "/src/m.aktion.ts")).toEqual(["E127@1:17"]);
  });

  it("a number, a template and a nested key land on their first token too", () => {
    expect(codes('$app($router({ [404]: Text("X") }))')).toEqual(["E127@1:17"]);
    expect(codes("$app($router({ [`/a`]: Text(\"X\") }))")).toEqual(["E127@1:17"]);
    expect(codes('$app($router({\n  "/": { layout: Column([outlet]), routes: { [  "/a"]: Text("A") } },\n}))')).toEqual([
      "E127@2:49",
    ]);
  });

  it("the parser records the key's position; a key that has one keeps it", () => {
    const keyOf = (src: string) =>
      ((parse(src).statements[0] as { expression: { properties: Array<{ computedKey?: { loc?: unknown } }> } }).expression
        .properties[0]!.computedKey!.loc);
    expect(keyOf('x = { [ "a"]: 1 }')).toEqual({ line: 1, column: 9 });
    expect(keyOf("x = { [k]: 1 }")).toEqual({ line: 1, column: 8 });
  });
});

describe("the strict-mode forwarded-object warning", () => {
  async function warnings(program: string): Promise<string[]> {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = document.createElement("aktion-app") as HTMLElement & { setResponse(text: string): void };
    el.setAttribute("strict", "");
    document.body.appendChild(el);
    el.setResponse(program);
    for (let i = 0; i < 5; i += 1) await flush();
    el.remove();
    return warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("forwarded as a positional argument"));
  }

  it("stays silent for a component with a `...rest` parameter", async () => {
    const program = lines(
      'function Legend(...items) { return Text(items.map((i) => i.name).join(",")) }',
      'aktion = Legend({ name: "A" }, { name: "B" })',
    );
    expect(await warnings(program)).toEqual([]);
  });

  it("still warns for a component without one", async () => {
    const program = lines("function Card(title) { return Text(title) }", 'aktion = Card({ heading: "Hi" })');
    expect(await warnings(program)).toHaveLength(1);
  });
});

describe("control: the runtime ignores the arms E127 rejects", () => {
  it("a spread arm is ignored — the default renders", async () => {
    const screen = render(
      lines('const base = { "/": Text("HOME") }', '$app(Column([$router({ ...base, default: Text("NF") }), Text("END")]))'),
    );
    await flush();
    expect(texts(screen)).toEqual(["NF", "END"]);
  });

  it("a computed path is ignored — the default renders", async () => {
    const screen = render(
      lines('const path = "/"', '$app(Column([$router({ [path]: Text("HOME"), default: Text("NF") }), Text("END")]))'),
    );
    await flush();
    expect(texts(screen)).toEqual(["NF", "END"]);
    cleanup();
    const literal = render('$app(Column([$router({ ["/"]: Text("HOME"), default: Text("NF") }), Text("END")]))');
    await flush();
    expect(texts(literal)).toEqual(["NF", "END"]);
  });

  it("a layout arm whose `routes` is a variable renders the layout with no child route", async () => {
    const screen = render(
      lines(
        'const child = { "/": Text("CHILD"), default: Text("CHILD") }',
        '$app($router({ "/": { layout: Column([Text("LAYOUT"), outlet]), routes: child } }))',
      ),
    );
    await flush();
    expect(texts(screen)).toEqual(["LAYOUT"]);
  });
});
