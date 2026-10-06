/**
 * Compiler diagnostics for `.aktion.js` / `.aktion.ts` modules:
 *
 *   - E127: `$router(…)` route arms must be an object literal written at the
 *     call (the evaluator reads them from the AST);
 *   - `$name<T>(…)` diagnostics sit at the `$`, not inside the blanked type
 *     arguments;
 *   - `import { type T } from "./types.ts"` gets a message that names the
 *     cause (every name is a type) and the fix (`import type`).
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import {
  defineCompiledProgram,
  linkProject,
  nativeImportMessage,
  typeOnlyNativeImportMessage,
} from "../src/compiler/index.js";
import { defaultFrontends, javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

afterEach(() => cleanup());

const typescript = createTypeScriptFrontend();
const frontends = { ...defaultFrontends, typescript };
const lines = (...l: string[]): string => l.join("\n");

type Frontend = typeof javascriptFrontend;

function problems(src: string, frontend: Frontend = javascriptFrontend, path = "/src/m.aktion.js"): string[] {
  const out = frontend.compile(src, path);
  return [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`),
  ];
}
const tsProblems = (src: string): string[] => problems(src, typescript, "/src/m.aktion.ts");

describe("E127 — `$router(…)` arms are an object literal written at the call", () => {
  it("rejects a variable", () => {
    const src = lines('const arms = { "/": Text("HOME") }', "$app($router(arms))");
    expect(problems(src)).toEqual(["E127@2:14"]);
    expect(tsProblems(src)).toEqual(["E127@2:14"]);
  });

  it("uses the specified message", () => {
    const out = javascriptFrontend.compile("$app($router(arms))", "/src/m.aktion.js");
    expect(out.diagnostics[0]!.message).toBe(
      "`$router(…)` takes its route arms as an object literal written at the call — " +
        '`$router({ "/": Home(), default: NotFound() })`. Aktion reads the arms from the source, so a value built ' +
        "elsewhere is ignored and the router renders nothing.",
    );
  });

  it("rejects a missing argument, a spread and a computed path", () => {
    expect(problems("$app($router())")).toEqual(["E127@1:6"]);
    expect(problems(lines('const base = { "/": Text("A") }', '$app($router({ ...base, default: Text("NF") }))'))).toEqual([
      "E127@2:19",
    ]);
    expect(problems(lines('const path = "/a"', '$app($router({ [path]: Text("A"), default: Text("NF") }))'))).toEqual([
      "E127@2:17",
    ]);
  });

  it("rejects a layout arm whose `routes` is not an object literal, at any depth", () => {
    const src = lines(
      'const child = { "/x": Text("X") }',
      "$app($router({",
      '  "/": { layout: Column([outlet]), routes: child },',
      '  "/deep": { layout: Column([outlet]), routes: { "/a": { layout: Column([outlet]), routes: child } } },',
      "}))",
    );
    expect(problems(src)).toEqual(["E127@3:44", "E127@4:92"]);
  });

  it("accepts literal arms, layout arms and a user `$router` hook", () => {
    expect(
      problems(
        lines(
          "$app($router({",
          '  "/": Text("HOME"),',
          '  "/users/:id": Text("USER"),',
          '  "/admin": { layout: Column([outlet]), routes: { "/": Text("DASH"), default: Text("NF") } },',
          '  default: Text("NF"),',
          "}))",
        ),
      ),
    ).toEqual([]);
    expect(problems(lines("function $router(arms) { return arms }", "function App() {", "  return $router(1)", "}"))).toEqual(
      [],
    );
  });

  it("control: the runtime really ignores arms it cannot see (.aktion)", async () => {
    const src = lines('const arms = { "/": Text("HOME"), default: Text("HOME") }', "$app(Column([$router(arms), Text(\"END\")]))");
    const res = await linkProject({ entry: "app.aktion", files: { "app.aktion": src }, frontends });
    const screen = renderCompiled(
      defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion" }),
    );
    await flush();
    const rendered = [...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent);
    expect(rendered).toEqual(["END"]);
  });
});

describe("`$name<T>(…)` diagnostics point at the `$`", () => {
  it("E110 for `$state<number>(…)` and `$memo<number>(…)`", () => {
    const state = lines(
      "function App() {",
      "  const onClick = () => {",
      "    const n = $state<number>(0)",
      "  }",
      '  return Button("Go", { onClick })',
      "}",
      "$app(App())",
    );
    expect(tsProblems(state)).toEqual(["E110@3:15"]);
    expect(tsProblems(state.replace("$state<number>(0)", "$state(0)"))).toEqual(["E110@3:15"]);
    const memo = lines(
      "function App() {",
      "  if (1 > 0) {",
      "    const v = $memo<number>(() => 1, [])",
      "  }",
      '  return Text("x")',
      "}",
      "$app(App())",
    );
    expect(tsProblems(memo)).toEqual(["E110@3:15"]);
  });

  it("E118 for a second `$app<any>(…)`, and type arguments that span lines", () => {
    expect(tsProblems(lines("function C() { return Text(\"x\") }", "$app(C())", "const x = $app<any>(C())"))).toEqual([
      "E118@3:11",
    ]);
    const multiline = lines(
      "function App() {",
      "  const onClick = () => {",
      "    const n = $state<",
      "      number",
      "    >(0)",
      "  }",
      '  return Button("Go", { onClick })',
      "}",
      "$app(App())",
    );
    expect(tsProblems(multiline)).toEqual(["E110@3:15"]);
  });

  it("a space before the `(` in `.aktion.js`", () => {
    const src = lines("function App() {", "  if (1 > 0) {", "    const v = $memo (() => 1, [])", "  }", '  return Text("x")', "}");
    expect(problems(src)).toEqual(["E110@3:15"]);
  });
});

describe("`import { type T }` from a native `.ts` file", () => {
  const types = "export interface Todo { id: number }\nexport interface Tag { name: string }";

  async function link(app: string): Promise<string[]> {
    const res = await linkProject({ entry: "app.aktion.ts", files: { "app.aktion.ts": app, "types.ts": types }, frontends });
    return res.diagnostics.map((d) => `${d.code}@${d.line}:${d.column} ${d.message}`);
  }

  it("names the cause and the fix", async () => {
    const app = lines(
      'import { $app, Text } from "aktion-runtime/dsl"',
      'import { type Todo } from "./types.ts"',
      "const t: Todo = { id: 1 }",
      "$app(Text(String(t.id)))",
    );
    expect(await link(app)).toEqual([`AKT-LINK-NATIVE@2:1 ${typeOnlyNativeImportMessage("./types.ts", ["Todo"])}`]);
    expect(typeOnlyNativeImportMessage("./types.ts", ["Todo"])).toBe(
      "Every name in this import is a type (`import { type Todo }`), so erasing the types leaves " +
        '`import {} from "./types.ts"`, which still loads "./types.ts" — and Aktion cannot import native code. ' +
        'Write `import type { Todo } from "./types.ts"`: a type-only import is erased completely.',
    );
  });

  it("lists every name, renames included", async () => {
    const app = lines(
      'import { $app, Text } from "aktion-runtime/dsl"',
      'import { type Todo, type Tag as Label } from "./types.ts"',
      "$app(Text(\"x\"))",
    );
    expect(await link(app)).toEqual([
      `AKT-LINK-NATIVE@2:1 ${typeOnlyNativeImportMessage("./types.ts", ["Todo", "Tag as Label"])}`,
    ]);
  });

  it("keeps the generic message when a name is a value, and accepts `import type`", async () => {
    const mixed = lines('import { $app, Text } from "aktion-runtime/dsl"', 'import { type Todo, helper } from "./types.ts"', "$app(Text(\"x\"))");
    expect(await link(mixed)).toEqual([`AKT-LINK-NATIVE@2:1 ${nativeImportMessage("./types.ts", "types.ts")}`]);
    const typeOnly = lines('import { $app, Text } from "aktion-runtime/dsl"', 'import type { Todo } from "./types.ts"', "$app(Text(\"x\"))");
    expect(await link(typeOnly)).toEqual([]);
  });
});
