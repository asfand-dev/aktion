/**
 * The runtime behaviour behind the round-2 `aktion-runtime/dsl` declaration
 * fixes (scripts/dsl-types/builtins.ts, the `$util` types in
 * src/runtime/util.ts). The surface.types-round2 / negative.types-round2
 * fixtures pin what the types accept and reject; this file measures what each
 * declaration and its JSDoc claims:
 *
 *   - `ComponentOptions`: a `.aktion.ts` call binds the options literal to the
 *     parameter AND reads a key-only literal as the identity; a held object is
 *     only bound;
 *   - `slots` / `children` in a `.aktion.ts` component: what a `.aktion` caller
 *     and a `.aktion.ts` caller put in them;
 *   - `$head` links: the case-insensitive `rel` and attribute names, the
 *     `String()`ed values and the dropped nullish ones the widened types allow;
 *   - the `$util` aggregates and `pick` / `omit` on untyped and nullish input;
 *   - `onDone`: an infinite `$query` never calls it (so its bag no longer
 *     declares one), a plain query and a mutation do, and a Promise-returning
 *     handler — the reason it returns `unknown` — works.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { defaultFrontends, defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultLibrary } from "../src/library/index.js";
import { parse } from "../src/parser/index.js";
import { tryLoadTypeScriptFrontend } from "../src/plugin/typescript.js";
import { createHeadManager } from "../src/runtime/head.js";
import { HttpRuntime, StateStore, createContext, planProgram, type EvaluationContext } from "../src/runtime/index.js";
import { Util } from "../src/runtime/util.js";
import { cleanup, flush, render, renderCompiled } from "../src/testing/index.js";

afterEach(() => cleanup());

/** Link an in-memory project (`.aktion.ts` modules included) and mount it. */
async function mount(entry: string, files: Record<string, string>) {
  const typescript = await tryLoadTypeScriptFrontend();
  const res = await linkProject({ entry, files, frontends: { ...defaultFrontends, typescript } });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  return screen;
}

const textOf = (root: ShadowRoot): string => {
  const copy = root.cloneNode(true) as ShadowRoot;
  copy.querySelectorAll("style").forEach((s) => s.remove());
  return (copy.textContent ?? "").trim();
};

describe("ComponentOptions in a .aktion.ts module", () => {
  const APP = [
    'import { $app, Column, Text, type AktionNode, type ComponentOptions } from "aktion-runtime/dsl";',
    "export function Item(label: string, _opts?: ComponentOptions): AktionNode {",
    '  return Text(label + ":" + (_opts === undefined ? "none" : JSON.stringify(_opts)));',
    "}",
    'const held: ComponentOptions = { key: "held" };',
    "export default $app(Column([",
    '  Item("a", { key: "a" }),',
    '  Item("b", held),',
    '  Item("c"),',
    "]));",
    "",
  ].join("\n");

  it("binds the options to the parameter; a key-only literal is also the identity, a held object is not", async () => {
    const screen = await mount("app.aktion.ts", { "app.aktion.ts": APP });
    const text = textOf(screen.shadowRoot);
    expect(text).toContain('a:{"key":"a"}');
    expect(text).toContain('b:{"key":"held"}');
    expect(text).toContain("c:none");
    const keyed = [...screen.shadowRoot.querySelectorAll("[data-rui-key]")].map((el) => el.getAttribute("data-rui-key"));
    expect(keyed).toEqual(["a"]);
  });
});

describe("slots and children in a .aktion.ts component", () => {
  const PANEL = [
    'import { Text, children, slots } from "aktion-runtime/dsl";',
    "export function Panel(title: string) {",
    '  return Text(title + "|" + String(slots.header) + "|" + JSON.stringify(children));',
    "}",
    "",
  ].join("\n");

  it("a .aktion caller fills slots from its named props and children from extra positionals", async () => {
    const screen = await mount("app.aktion", {
      "app.aktion": 'import { Panel } from "./panel.aktion.ts"\n$app(Column([Panel("dsl", { header: "h" }), Panel("more", "extra")]))\n',
      "panel.aktion.ts": PANEL,
    });
    const text = textOf(screen.shadowRoot);
    expect(text).toContain("dsl|h|null");
    expect(text).toContain('more|undefined|"extra"');
  });

  it("a .aktion.ts caller binds positionally: the props object lands in children, slots stay empty", async () => {
    const screen = await mount("app.aktion.ts", {
      "app.aktion.ts": 'import { $app, Column } from "aktion-runtime/dsl";\nimport { Panel } from "./panel.aktion.ts";\n$app(Column([Panel("ts", { header: "h" })]));\n',
      "panel.aktion.ts": PANEL,
    });
    expect(textOf(screen.shadowRoot)).toContain('ts|undefined|{"header":"h"}');
  });
});

describe("$head links: what sanitiseLinkEntry keeps", () => {
  it("rel and attribute names case-insensitively, values through String(), nullish values dropped", () => {
    const head = createHeadManager({ disposers: [] } as unknown as EvaluationContext);
    head.apply({
      link: [
        { rel: "Canonical", href: "/a", crossOrigin: "anonymous", referrerPolicy: "no-referrer", hrefLang: "de" },
        { rel: "ICON", href: "/favicon.png", sizes: 32, type: "image/png", media: null },
        { rel: "Shortcut icon", href: "/favicon.ico", crossorigin: "", title: 2026 },
        { rel: "Stylesheet", href: "/x.css" },
        { rel: "icon", href: "/f.svg", fetchPriority: "high" },
      ],
      htmlAttrs: { lang: "en", dir: null, "data-theme": "dark" },
    });
    head.flush();
    const html = head.serialize();
    expect(html).toContain('<link rel="canonical" href="/a" crossorigin="anonymous" referrerpolicy="no-referrer" hreflang="de">');
    expect(html).toContain('<link rel="icon" href="/favicon.png" sizes="32" type="image/png">');
    expect(html).toContain('<link rel="shortcut icon" href="/favicon.ico" crossorigin="" title="2026">');
    expect(html).toContain('<link rel="icon" href="/f.svg">');
    expect(html).not.toContain("stylesheet");
    expect(html).not.toContain("media");
    expect(head.htmlAttrs()).toEqual({ lang: "en", "data-theme": "dark" });
  });
});

describe("$util on untyped and not-yet-loaded data", () => {
  it("the aggregate helpers read any non-array as empty", () => {
    for (const input of [undefined, null, "abc", 7, { length: 2 }, new Set([1, 2])]) {
      expect(Util.count(input as never), String(input)).toBe(0);
      expect(Util.sum(input as never)).toBe(0);
      expect(Util.avg(input as never)).toBe(0);
      expect(Util.min(input as never)).toBe(0);
      expect(Util.max(input as never)).toBe(0);
      expect(Util.join(input as never, ",")).toBe("");
    }
    expect(Util.count([1, 2] as unknown)).toBe(2);
    expect(Util.join(["a", null, 1] as unknown, "-")).toBe("a--1");
  });

  it("pick / omit give {} for a nullish input", () => {
    expect(Util.pick(undefined as { a?: number } | undefined, ["a"])).toEqual({});
    expect(Util.omit(null as { a?: number } | null, ["a"])).toEqual({});
    expect(Util.pick({ a: 1, b: 2 } as { a: number; b: number } | undefined, ["a"])).toEqual({ a: 1 });
  });
});

describe("onDone", () => {
  let originalFetch: typeof fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const settle = async (turns = 16): Promise<void> => {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  };
  const plan = (source: string): EvaluationContext => {
    const ctx = createContext(new StateStore(), { library: defaultLibrary, http: new HttpRuntime(), notify: () => {} });
    planProgram(parse(source), ctx);
    return ctx;
  };

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    fetchMock = vi.fn(async () => json([{ id: 1 }, { id: 2 }]));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    if (originalFetch) (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
  });

  it("an infinite query never calls it — through the first page, loadMore() and refetch()", async () => {
    const ctx = plan('$feed = $query({ url: "https://api.example.com/feed", infinite: { limit: 2 } })\naktion = Stack()');
    const feed = ctx.state.get("feed") as { onDone?: () => void; loadMore: () => Promise<void>; refetch: () => Promise<void>; data: unknown[] };
    const onDone = vi.fn();
    feed.onDone = onDone;
    await settle();
    await feed.loadMore();
    await feed.refetch();
    await settle();
    expect(feed.data.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a mutation and a plain query call it, and a Promise-returning handler (`() => $list.refetch()`) works", async () => {
    const screen = render([
      '$list = $query({ url: "https://api.example.com/list" })',
      '$save = $mutation({ url: "https://api.example.com/save" })',
      "$listDone = 0",
      "function save() {",
      "  $save.onDone = () => $list.refetch()",
      "  $list.onDone = () => { $listDone = $listDone + 1 }",
      "  $save.mutate()",
      "}",
      '$app(Column([Text("done=" + $listDone), Button("Save", { onClick: save })]))',
    ].join("\n"));
    await flush();
    await settle();
    const listCalls = (): number => fetchMock.mock.calls.filter(([url]) => String(url).includes("/list")).length;
    expect(listCalls()).toBe(1);
    await screen.click(screen.getByRole("button"));
    await settle();
    await flush();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/save"))).toHaveLength(1);
    expect(listCalls()).toBe(2);
    expect(textOf(screen.shadowRoot)).toContain("done=1");
  });
});
