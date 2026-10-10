/**
 * State written from more than one module. Three shapes all share one cell
 * across every importer at runtime: an exported atom with an exported setter
 * action, an exported `$store` written by property, and a direct write to an
 * imported `$atom`. The first two are the documented patterns; the third is what
 * JavaScript tooling flags as `no-import-assign`. Measured behind
 * `docs/modules.html#shared-state-writes`. A `$store` factory is the shape that
 * does NOT work: it returns one instance per call site.
 */

import { afterEach, describe, expect, it } from "vitest";
import { linkProgram, defineCompiledProgram, COMPILED_PROGRAM_VERSION } from "../src/compiler/index.js";
import type { ModuleResolver } from "../src/compiler/index.js";
import { renderCompiled, cleanup } from "../src/testing/index.js";
import { parse, formatProgram } from "../src/language-api.js";

afterEach(() => cleanup());

function mount(files: Record<string, string>) {
  const resolver: ModuleResolver = {
    resolve: (spec) => (spec.startsWith("./") ? `/${spec.slice(2)}` : null),
    load: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
  const result = linkProgram(files["/app.aktion"]!, "/app.aktion", resolver);
  expect(result.diagnostics).toEqual([]);
  return renderCompiled(
    defineCompiledProgram({
      __aktionCompiled: COMPILED_PROGRAM_VERSION,
      program: result.program,
      source: files["/app.aktion"]!,
      path: "/app.aktion",
    }),
  );
}

/** The entry and an imported component each show the flag and each own a toggle button. */
const app = (importLine: string, entryToggle: string, read: string) =>
  [
    importLine,
    'import { Panel } from "./panel.aktion"',
    `$app(Column([Text(\`app=\${${read}}\`), Button("tog-app", ${entryToggle}), Panel()]))`,
  ].join("\n");
const panel = (importLine: string, panelToggle: string, read: string) =>
  [
    importLine,
    `export function Panel() { return Column([Text(\`panel=\${${read}}\`), Button("tog-panel", ${panelToggle})]) }`,
  ].join("\n");

const SHAPES: Array<[string, Record<string, string>]> = [
  [
    "an exported atom and an exported setter action",
    {
      "/ui.aktion": "export let $open = false\nexport function toggle() { $open = !$open }",
      "/app.aktion": app('import { $open, toggle } from "./ui.aktion"', "toggle", "$open"),
      "/panel.aktion": panel('import { $open, toggle } from "./ui.aktion"', "toggle", "$open"),
    },
  ],
  [
    "an exported $store written by property",
    {
      "/ui.aktion": "export const ui = $store({ open: false })",
      "/app.aktion": app('import { ui } from "./ui.aktion"', "() => { ui.open = !ui.open }", "ui.open"),
      "/panel.aktion": panel('import { ui } from "./ui.aktion"', "() => { ui.open = !ui.open }", "ui.open"),
    },
  ],
  [
    "a direct write to an imported atom (flagged by no-import-assign)",
    {
      "/ui.aktion": "export let $open = false",
      "/app.aktion": app('import { $open } from "./ui.aktion"', "() => { $open = !$open }", "$open"),
      "/panel.aktion": panel('import { $open } from "./ui.aktion"', "() => { $open = !$open }", "$open"),
    },
  ],
];

describe.each(SHAPES)("%s", (_label, files) => {
  it("is one cell shared by the entry and an imported component", async () => {
    const screen = mount(files);
    await screen.flush(12);
    expect(screen.queryByText("app=false")).not.toBeNull();
    expect(screen.queryByText("panel=false")).not.toBeNull();

    await screen.click("tog-app");
    expect(screen.queryByText("app=true")).not.toBeNull();
    expect(screen.queryByText("panel=true")).not.toBeNull();

    await screen.click("tog-panel");
    expect(screen.queryByText("app=false")).not.toBeNull();
    expect(screen.queryByText("panel=false")).not.toBeNull();
  });
});

describe("a $store factory", () => {
  it("hands every caller the same instance, because the store is keyed by its call site", async () => {
    const screen = mount({
      "/f.aktion": "export function make() { return $store({ n: 0 }) }",
      "/app.aktion": [
        'import { make } from "./f.aktion"',
        "const a = make()",
        "const b = make()",
        '$app(Column([Text(`a=${a.n}`), Text(`b=${b.n}`), Button("incA", () => { a.n = a.n + 1 })]))',
      ].join("\n"),
    });
    await screen.flush(12);
    await screen.click("incA");
    expect(screen.queryByText("a=1")).not.toBeNull();
    expect(screen.queryByText("b=1")).not.toBeNull();
  });
});

/**
 * What the setter-action shape does that a direct write does not, measured on
 * the runtime. These pin the claims in `docs/modules.html#shared-state-writes`.
 */
describe("a setter action, measured", () => {
  const ui = "export let $open = false\nexport const setOpen = v => { $open = v }";
  const text = (screen: ReturnType<typeof mount>) => (screen.shadowRoot?.textContent ?? "").replace(/<style[\s\S]*?<\/style>/g, "");

  it("re-runs an effect in the owner, the importer and a third module, whichever module calls it", async () => {
    const log: string[] = [];
    (globalThis as { __log?: string[] }).__log = log;
    const effect = (who: string) => `$effect(() => { globalThis.__log.push("${who}:" + $open) }, [$open])`;
    const screen = mount({
      "/ui.aktion": `${ui}\n${effect("owner")}`,
      "/b.aktion": [
        'import { $open, setOpen } from "./ui.aktion"',
        effect("b"),
        'export function B() { return Button("tog-b", () => setOpen(!$open)) }',
      ].join("\n"),
      "/app.aktion": [
        'import { $open, setOpen } from "./ui.aktion"',
        'import { B } from "./b.aktion"',
        effect("app"),
        '$app(Column([Button("tog-app", () => setOpen(!$open)), B()]))',
      ].join("\n"),
    });
    await screen.flush(12);
    expect(log).toEqual(["owner:false", "b:false", "app:false"]);
    log.length = 0;
    await screen.click("tog-app");
    expect(log).toEqual(["owner:true", "b:true", "app:true"]);
    log.length = 0;
    await screen.click("tog-b");
    expect(log).toEqual(["owner:false", "b:false", "app:false"]);
  });

  it("is what lets an importer set the atom at the top level, where a direct write does nothing", async () => {
    const direct = mount({
      "/ui.aktion": "export let $open = false",
      "/app.aktion": 'import { $open } from "./ui.aktion"\n$open = true\n$app(Text(`open=${$open}`))',
    });
    await direct.flush(12);
    expect(text(direct)).toContain("open=false");
    cleanup();
    const viaSetter = mount({
      "/ui.aktion": ui,
      "/app.aktion": 'import { $open, setOpen } from "./ui.aktion"\nsetOpen(true)\n$app(Text(`open=${$open}`))',
    });
    await viaSetter.flush(12);
    expect(text(viaSetter)).toContain("open=true");
  });

  it("is not a way to write while rendering: a function-declaration setter does nothing there", async () => {
    const screen = mount({
      "/ui.aktion": "export let $open = false\nexport function setOpen(v) { $open = v }",
      "/app.aktion": [
        'import { $open, setOpen } from "./ui.aktion"',
        "function C() { setOpen(true)\n return Text(`open=${$open}`) }",
        "$app(C())",
      ].join("\n"),
    });
    await screen.flush(12);
    expect(text(screen)).toContain("open=false");
  });

  it("is a direct write in a rendered component that gets a private copy, not the shared atom", async () => {
    const screen = mount({
      "/ui.aktion": "export let $open = false",
      "/c.aktion": 'import { $open } from "./ui.aktion"\nexport function C() { $open = true\n return Text(`c=${$open}`) }',
      "/app.aktion": [
        'import { $open } from "./ui.aktion"',
        'import { C } from "./c.aktion"',
        "$app(Column([C(), Text(`app=${$open}`)]))",
      ].join("\n"),
    });
    await screen.flush(12);
    expect(text(screen)).toContain("c=true");
    expect(text(screen)).toContain("app=false");
  });

  it("an exported $store property cannot be an effect dependency, an atom can", () => {
    const result = (dep: string, decl: string, read: string) => {
      const files: Record<string, string> = {
        "/ui.aktion": decl,
        "/app.aktion": `import { ${read} } from "./ui.aktion"\n$effect(() => { globalThis.console.log(1) }, [${dep}])\n$app(Text("x"))`,
      };
      const resolver: ModuleResolver = {
        resolve: (spec) => (spec.startsWith("./") ? `/${spec.slice(2)}` : null),
        load: (path) => files[path]!,
      };
      return linkProgram(files["/app.aktion"]!, "/app.aktion", resolver).diagnostics.length;
    };
    expect(result("ui.open", "export const ui = $store({ open: false })", "ui")).toBeGreaterThan(0);
    expect(result("$open", "export let $open = false", "$open")).toBe(0);
  });
});

/** More measurements behind `docs/modules.html#choosing-a-write-shape`. */
describe("writing shared state while rendering, effect order and formatting", () => {
  const text = (screen: ReturnType<typeof mount>) => (screen.shadowRoot?.textContent ?? "").replace(/<style[\s\S]*?<\/style>/g, "");
  const warnings = async (run: () => Promise<void>): Promise<string[]> => {
    const seen: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void seen.push(args.join(" "));
    try {
      await run();
    } finally {
      console.warn = original;
    }
    return seen;
  };

  it("an arrow setter called while rendering applies the write and warns once", async () => {
    const seen = await warnings(async () => {
      const screen = mount({
        "/ui.aktion": "export let $open = false\nexport const setOpen = v => { $open = v }",
        "/app.aktion": 'import { $open, setOpen } from "./ui.aktion"\nfunction C() { setOpen(true)\n return Text(`open=${$open}`) }\n$app(C())',
      });
      await screen.flush(12);
      expect(text(screen)).toContain("open=true");
    });
    expect(seen.filter((m) => m.includes("write happened during render"))).toHaveLength(1);
  });

  it("a store property written while rendering applies the write and warns once", async () => {
    const seen = await warnings(async () => {
      const screen = mount({
        "/ui.aktion": "export const ui = $store({ open: false })",
        "/app.aktion": 'import { ui } from "./ui.aktion"\nfunction C() { ui.open = true\n return Text(`open=${ui.open}`) }\n$app(C())',
      });
      await screen.flush(12);
      expect(text(screen)).toContain("open=true");
    });
    expect(seen.filter((m) => m.includes("write happened during render"))).toHaveLength(1);
  });

  it("a direct write in a lowercase function called while rendering does nothing", async () => {
    const screen = mount({
      "/ui.aktion": "export let $open = false",
      "/app.aktion": 'import { $open } from "./ui.aktion"\nfunction c() { $open = true\n return Text(`open=${$open}`) }\n$app(c())',
    });
    await screen.flush(12);
    expect(text(screen)).toContain("open=false");
  });

  it("a direct write re-runs the effects in link order, as a setter does", async () => {
    const log: string[] = [];
    (globalThis as { __log?: string[] }).__log = log;
    const effect = (who: string) => `$effect(() => { globalThis.__log.push("${who}:" + $open) }, [$open])`;
    const screen = mount({
      "/ui.aktion": `export let $open = false\n${effect("owner")}`,
      "/b.aktion": `import { $open } from "./ui.aktion"\n${effect("b")}\nexport function B() { return Button("tog-b", () => { $open = !$open }) }`,
      "/app.aktion": `import { $open } from "./ui.aktion"\nimport { B } from "./b.aktion"\n${effect("app")}\n$app(Column([B()]))`,
    });
    await screen.flush(12);
    log.length = 0;
    await screen.click("tog-b");
    expect(log).toEqual(["owner:true", "b:true", "app:true"]);
  });

  const strip = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, v) => (key === "loc" ? undefined : v)));

  it.each([
    ["the owner of a setter", "export let $open = false\nexport const setOpen = v => { $open = v }\nexport function toggle() { $open = !$open }\n"],
    ["its importer", 'import { $open, setOpen } from "./ui.aktion"\n$app(Button("t", () => { setOpen(!$open) }))\n'],
    ["an exported store and its importer", 'export const ui = $store({ open: false })\nimport { ui as u } from "./ui.aktion"\n$app(Button("t", () => { u.open = true }))\n'],
  ])("formatProgram keeps the program of %s and is stable", (_label, source) => {
    const once = formatProgram(source);
    expect(once.errors).toEqual([]);
    expect(once.warnings ?? []).toEqual([]);
    expect(strip(parse(once.formatted).statements)).toEqual(strip(parse(source).statements));
    expect(formatProgram(once.formatted).formatted).toBe(once.formatted);
  });
});
