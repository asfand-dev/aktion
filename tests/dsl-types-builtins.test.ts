/**
 * The `$`-builtin, namespace, resource and injected-name declarations
 * (`scripts/dsl-types/builtins.ts`, plus the runtime types
 * `scripts/dsl-types/runtime-types.ts` prints) against the runtime they
 * describe.
 *
 * `tests/dsl-types.test.ts` proves the declarations are fresh, total and
 * type-check (the `surface.builtins.aktion.ts` / `negative.builtins.dsl.ts`
 * fixtures pin what they accept and reject). This file pins the other half:
 *
 *   1. every closed value set the declarations derive from a runtime table
 *      (`$toast` tones and corners, the `$head` allow-lists, the `$util`
 *      comparison operators and colour tokens) still equals that table;
 *   2. every runtime behaviour a declaration or its JSDoc states — usually a
 *      silent no-op the types now reject — is measured here, so the docs
 *      cannot claim what the runtime does not do.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultLibrary } from "../src/library/index.js";
import { TOAST_TONES, TOASTS_POSITIONS } from "../src/library/components/feedback.js";
import { parse } from "../src/parser/index.js";
import type { Expression } from "../src/parser/types.js";
import { HttpRuntime, StateStore, createContext, evaluate, planProgram, type EvaluationContext } from "../src/runtime/index.js";
import { createHeadManager, SAFE_HTML_ATTRS, SAFE_LINK_ATTRS, SAFE_LINK_RELS } from "../src/runtime/head.js";
import { createSocketResource } from "../src/runtime/realtime.js";
import { createScriptResource } from "../src/runtime/interop.js";
import { createI18n } from "../src/runtime/i18n.js";
import { Router } from "../src/runtime/router.js";
import { storage } from "../src/runtime/storage.js";
import { Util } from "../src/runtime/util.js";
import { Rules, Style } from "../src/runtime/namespaces-extra.js";
import { cleanup as cleanupScreens, flush, render } from "../src/testing/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexText = readFileSync(resolve(repoRoot, "src/dsl/index.d.ts"), "utf8");
const sf = ts.createSourceFile("index.d.ts", indexText, ts.ScriptTarget.ES2022, true);

/** The string literals of `export type <name> = "a" | "b" | …`. */
function literalUnion(name: string): string[] {
  for (const s of sf.statements) {
    if (ts.isTypeAliasDeclaration(s) && s.name.text === name) {
      const members = ts.isUnionTypeNode(s.type) ? s.type.types : [s.type];
      return members.map((m) => {
        if (!ts.isLiteralTypeNode(m) || !ts.isStringLiteral(m.literal)) throw new Error(`${name}: not a string-literal union (${m.getText(sf)})`);
        return m.literal.text;
      });
    }
  }
  throw new Error(`index.d.ts declares no type ${name}`);
}

/** The named (non-index-signature) members of `export interface <name>`. */
function interfaceMembers(name: string): string[] {
  for (const s of sf.statements) {
    if (ts.isInterfaceDeclaration(s) && s.name.text === name) {
      return s.members.flatMap((m) => (m.name ? [m.name.getText(sf).replace(/^"|"$/g, "")] : []));
    }
  }
  throw new Error(`index.d.ts declares no interface ${name}`);
}

const newContext = (extra: Partial<Parameters<typeof createContext>[1]> = {}): EvaluationContext =>
  createContext(new StateStore(), { library: defaultLibrary, ...extra });
const expression = (src: string): Expression => {
  const program = parse(src);
  expect(program.errors, src).toEqual([]);
  const stmt = program.statements[0] as { expression?: Expression };
  if (!stmt?.expression) throw new Error(`not an expression statement: ${src}`);
  return stmt.expression;
};
const textOf = (screen: ReturnType<typeof render>): string => {
  const root = screen.shadowRoot.cloneNode(true) as ShadowRoot;
  root.querySelectorAll("style").forEach((s) => s.remove());
  return (root.textContent ?? "").trim();
};

/* ================================================================ 1. tables */

describe("aktion-runtime/dsl builtins — closed value sets equal the runtime's tables", () => {
  it("$toast: the tones and corners are the Toast / Toasts components' own", () => {
    const spec = (name: string) => defaultLibrary.components.find((c) => c.name === name)!;
    expect(spec("Toast").props.find((p) => p.name === "tone")?.enum).toEqual([...TOAST_TONES]);
    expect(spec("Toasts").props.find((p) => p.name === "position")?.enum).toEqual([...TOASTS_POSITIONS]);
    expect(literalUnion("ToastShowTone")).toEqual([...TOAST_TONES]);
    expect(literalUnion("ToastStackPosition")).toEqual([...TOASTS_POSITIONS]);
  });

  it("$head: the link rels, link attributes and <html> attributes are head.ts's allow-lists", () => {
    expect(literalUnion("HeadLinkRel")).toEqual([...SAFE_LINK_RELS]);
    expect(interfaceMembers("HeadLink")).toEqual(["rel", "href", ...SAFE_LINK_ATTRS]);
    expect(interfaceMembers("HeadHtmlAttrs")).toEqual([...SAFE_HTML_ATTRS]);
  });

  it("$util comparison operators: each declared one is honoured, any other string matches nothing", () => {
    const rows = [{ v: 5 }, { v: "abc" }];
    const probe: Record<string, unknown> = {
      "==": 5, "!=": 5, ">": 1, "<": 10, ">=": 5, "<=": 5, contains: "b", startsWith: "a", endsWith: "c",
    };
    expect(literalUnion("UtilCompareOp").sort()).toEqual(Object.keys(probe).sort());
    for (const [op, value] of Object.entries(probe)) {
      expect(Util.filter(rows, "v", op as never, value).length, op).toBeGreaterThan(0);
    }
    expect(Util.filter(rows, "v", "eq" as never, 5)).toEqual([]);
    expect(Util.find(rows, "v", "eq" as never, 5)).toBeNull();
  });

  it("$util.style colour tokens: each declared name resolves to its theme variable", () => {
    const tokens = literalUnion("UtilStyleColorToken");
    expect(tokens.length).toBeGreaterThan(5);
    for (const token of tokens) expect(Style.alpha(token, 1), token).toMatch(/^color-mix\(in srgb, var\(--rui-color-[a-z-]+\) 100%, transparent\)$/);
    // Any other name is plain CSS, passed through.
    expect(Style.alpha("rebeccapurple", 1)).toBe("color-mix(in srgb, rebeccapurple 100%, transparent)");
  });
});

/* ================================================================ 2. measured behaviour */

describe("aktion-runtime/dsl builtins — the behaviour the declarations state", () => {
  afterEach(() => cleanupScreens());

  it("$toast: a shortcut overwrites the caller's tone; configure ignores anything but a corner", () => {
    const ctx = newContext();
    const toast = evaluate(expression("$toast"), ctx) as {
      success: (m: unknown, o?: unknown) => string; show: (m: unknown, o?: unknown) => string;
      configure: (o?: unknown) => void; items: Array<{ tone: string; message: string; title?: string }>;
    };
    toast.success("hi", { tone: "info" });
    toast.show({ text: "x" }, { title: 7 });
    expect(toast.items.map((t) => t.tone)).toEqual(["success", "default"]);
    expect(toast.items[1]).toMatchObject({ message: "[object Object]", title: "7" });
    toast.configure({ position: "center" });
    expect(ctx.toastPosition).toBeUndefined();
    toast.configure();
    toast.configure({ position: "bottom-left" });
    expect(ctx.toastPosition).toBe("bottom-left");
  });

  it("$head: drops a disallowed rel, a link without href, unknown attributes, style on <html> and base.target", () => {
    const head = createHeadManager({ disposers: [] } as unknown as EvaluationContext);
    head.apply({
      link: [
        { rel: "stylesheet", href: "/x.css" },
        { rel: "canonical" },
        { rel: "canonical", href: "/a", crossorigin: "anonymous", onload: "x", media: "print" },
      ],
      htmlAttrs: { style: "display:none", lang: "en", "data-theme": "dark", dir: null },
      base: { href: "/app/", target: "_blank" },
      meta: { rating: 5, skip: null },
    });
    head.apply({ link: { rel: "icon", href: "/favicon.svg" } });
    head.apply({ link: [{ rel: "next", href: "javascript:alert(1)" }, { rel: "prev", href: "//evil.example/p" }], base: "https://evil.example/" });
    const html = head.serialize();
    expect(html).not.toContain("evil");
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("stylesheet");
    expect(html).toContain('<link rel="canonical" href="/a" crossorigin="anonymous" media="print">');
    expect(html).toContain('<link rel="icon" href="/favicon.svg">');
    expect(html).toContain('<base href="/app/">');
    expect(html).toContain('<meta name="rating" content="5">');
    expect(html).not.toContain("skip");
    expect(head.htmlAttrs()).toEqual({ lang: "en", "data-theme": "dark" });
  });

  it("$util.match and rules.pattern read a regular-expression SOURCE (a RegExp's slashes / flags are lost)", () => {
    expect(Util.match("abc", "b")).toBe(true);
    expect(Util.match("abc", /b/ as never)).toBe(false);
    expect(Rules.pattern("abc")("abc")).toBeNull();
    expect(Rules.pattern(/abc/i)("ABC")).toBe("Invalid format");
  });

  it("$util helpers: silent fallbacks the parameter types now rule out", () => {
    expect(Util.format(3, "bogus" as never)).toBe(Util.format(3));
    expect(Util.count({ a: 1 } as never)).toBe(0);
    expect(Util.count(new Set([1, 2]) as never)).toBe(0);
    expect(Util.count(null)).toBe(0);
    const tomorrow = Date.now() + 86_400_000;
    expect(Math.abs(Date.parse(Util.addDays(null as never, 1)) - tomorrow)).toBeLessThan(5_000);
    expect(() => Util.debounceFn("search" as never, 10)("x")).not.toThrow();
    expect(Style.gradient(["red", "blue"], "45deg" as never)).toBe("linear-gradient(120deg, red, blue)");
    expect(Style.gradient("red" as never)).toBe("");
    expect(Style.toStyle({ hidden: true } as never)).toBe("hidden:true");
    expect(Util.duration.format(90, { unit: "s" } as never)).toBe("90s");
    expect(Util.duration.format(90, { style: "iso" })).toBe("PT1M30S");
    expect(Rules.custom("not a function" as never)("anything")).toBeNull();
  });

  it("$util env snapshots are fresh copies: writing one changes nothing", () => {
    const util = evaluate(expression("$util"), newContext()) as { viewport: { width: number }; scroll: { direction: string } };
    const width = util.viewport.width;
    util.viewport.width = width + 1;
    expect(util.viewport.width).toBe(width);
    expect(util.viewport).not.toBe(util.viewport);
    expect(["up", "down"]).toContain(util.scroll.direction);
  });

  it("$util list helpers hand back the input's own elements", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(Util.first(rows)).toBe(rows[0]);
    expect(Util.last(rows)).toBe(rows[1]);
    expect(Util.filter(rows, "id", ">", 1)[0]).toBe(rows[1]);
    expect(Util.pick(rows[0]!, ["id"])).toEqual({ id: 1 });
    expect(Util.zip([1, 2], ["a"])).toEqual([[1, "a"], [2, null]]);
  });

  it("$util.worker needs a host function: an Aktion lambda serialises as the runtime's own closure", () => {
    const lambda = evaluate(expression("(n) => n * 2"), newContext()) as (n: number) => number;
    expect(lambda(21)).toBe(42);
    const source = lambda.toString();
    expect(source).not.toContain("n * 2");
    expect(source).toMatch(/\bctx\b/);
    // What a Worker does with it: re-create the function from its source in a
    // scope that has none of the evaluator's variables, then call it.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const revived = new Function(`return (${source});`)() as (n: number) => number;
    expect(() => revived(21)).toThrow(ReferenceError);
  });

  it("$storage: local / session ignore cookie options; the callable form ignores its argument", () => {
    const before = document.cookie;
    expect(storage.local.set("dslTypesProbe", 1, { path: "/" })).toBe(true);
    expect(document.cookie).toBe(before);
    expect(storage.local.get("dslTypesProbe")).toBe(1);
    storage.local.remove("dslTypesProbe");
    const ctx = newContext();
    expect(evaluate(expression("$storage({ persist: true })"), ctx)).toBe(evaluate(expression("$storage"), ctx));
  });

  it("a navigation guard's `from` is the current path, a string even on the first navigation", () => {
    const router = new Router();
    const seen: unknown[] = [];
    router.setGuard((info) => { seen.push(info.from); return true; });
    router.navigate("/a");
    router.navigate("/b");
    expect(seen).toEqual(["/", "/a"]);
  });

  it("$i18n: an unknown key translates to itself; any language string is accepted", () => {
    const i18n = createI18n({ defaultLanguage: "en", translations: { hi: { en: "Hi" } } });
    expect(i18n.t("not.declared")).toBe("not.declared");
    i18n.setCurrentLanguage("de");
    expect(i18n.getCurrentLanguage()).toBe("de");
    expect(i18n.t("hi")).toBe("Hi");
  });

  it("$effect: whole decimal milliseconds only — the hex the types still let through is a parse error", () => {
    expect(parse('$effect(() => {}, ["every(0)"])').errors).toEqual([]);
    for (const trigger of ["every(-1)", "every(0x10)", "debounce(1e3)", "throttle(1.5)"]) {
      expect(parse(`$effect(() => {}, ["${trigger}"])`).errors.length, trigger).toBeGreaterThan(0);
    }
  });

  it("$router returns the matched arm's own value; outlet is whatever the child arm evaluates to", () => {
    const ctx = newContext();
    expect(evaluate(expression("$router({ default: [1, 2] })"), ctx)).toEqual([1, 2]);
    expect(evaluate(expression('$router({ "/": { layout: outlet, routes: { default: "text" } } })'), ctx)).toBe("text");
    expect(evaluate(expression('$router({ "/": { layout: outlet, routes: { default: ["a", "b"] } } })'), ctx)).toEqual(["a", "b"]);
  });

  it("slots carries every unmatched named prop — callbacks included", async () => {
    const screen = render('function Box(title) { return Text(title + ":" + typeof slots.onClose + ":" + slots.count) }\n$app(Box("t", { onClose: () => 1, count: 3 }))');
    await flush();
    expect(textOf(screen)).toBe("t:function:3");
  });

  it("$util.onError hands the handler the failing action's name as `source`", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = render('$err = ""\n$util.onError(info => { $err = typeof info.source + ":" + info.source })\nfunction boom() { throw "kaboom" }\n$app(Column([Button("Go", { onClick: boom }), Text($err)]))');
    await flush();
    await screen.click(screen.getByRole("button"));
    await flush();
    expect(textOf(screen)).toContain("string:boom");
    vi.restoreAllMocks();
  });

  it("$dom: a null node is a no-op; onMutation observes attributes and children by default", async () => {
    const ctx = newContext();
    const dom = evaluate(expression("$dom"), ctx) as {
      measure: (n: unknown) => unknown;
      onResize: (n: unknown, cb: () => void) => () => void;
      onMutation: (n: unknown, cb: (records: Array<{ type: string }>) => void) => () => void;
    };
    expect(dom.measure(null)).toBeNull();
    expect(dom.measure("#app")).toBeNull();
    expect(() => dom.onResize(null, () => {})()).not.toThrow();
    const node = document.createElement("div");
    document.body.appendChild(node);
    const types: string[] = [];
    const stop = dom.onMutation(node, (records) => { for (const r of records) types.push(r.type); });
    node.setAttribute("data-x", "1");
    node.appendChild(document.createElement("span"));
    await new Promise((r) => setTimeout(r, 0));
    stop();
    node.remove();
    expect(types).toContain("attributes");
    expect(types).toContain("childList");
  });

  it("$socket / $script: the error shapes the declarations name", () => {
    const fakeCtx = { notify() {}, disposers: [] } as unknown as EvaluationContext;
    expect(createSocketResource({ url: "" }, fakeCtx).error).toEqual({ message: "WebSocket not available" });
    expect(createScriptResource({ src: "javascript:void 0" }, fakeCtx).error).toBeInstanceOf(Error);
    expect(createScriptResource({ src: "javascript:void 0" }, fakeCtx).error).not.toBeNull();
  });
});

/* ================================================================ $form */

describe("aktion-runtime/dsl builtins — $form", () => {
  type Handle = { __atom: string; __methods: Record<string, (...a: unknown[]) => unknown> };
  const form = (src: string): { ctx: EvaluationContext; h: Handle; state: () => Record<string, unknown> } => {
    const ctx = newContext();
    const h = evaluate(expression(src), ctx) as Handle;
    return { ctx, h, state: () => ctx.state.get(h.__atom) as Record<string, unknown> };
  };

  it("each field's validators receive that field's own value", () => {
    const seen: unknown[] = [];
    const ctx = newContext();
    ctx.loopVars.set("record", (v: unknown) => { seen.push(v); return true; });
    const h = evaluate(expression("$form({ values: { name: \"Ada\", age: 7 }, rules: { age: $util.rules.custom(v => record(v)) } })"), ctx) as Handle;
    h.__methods.validate!();
    expect(seen).toEqual([7]);
  });

  it("submit: false when invalid, true after a synchronous onSubmit, a Promise when onSubmit is async", async () => {
    const invalid = form('$form({ values: { email: "" }, rules: { email: $util.rules.required() }, onSubmit: (v) => 1 })');
    expect(invalid.h.__methods.submit!()).toBe(false);
    const sync = form('$form({ values: { email: "a" }, onSubmit: (v) => 1 })');
    expect(sync.h.__methods.submit!()).toBe(true);
    const async = form('$form({ values: { email: "a" }, onSubmit: (v) => $util.sleep(0) })');
    const result = async.h.__methods.submit!();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it("submit touches only the fields that have rules; field().error appears once the field is touched", () => {
    const f = form('$form({ values: { email: "", note: "" }, rules: { email: $util.rules.required("needed") } })');
    f.h.__methods.validate!();
    expect((f.h.__methods.field!("email") as { error?: string }).error).toBeUndefined();
    f.h.__methods.submit!();
    expect(f.state().touched).toEqual({ email: true });
    expect((f.h.__methods.field!("email") as { error?: string }).error).toBe("needed");
  });
});

/* ================================================================ HTTP */

describe("aktion-runtime/dsl builtins — HTTP interceptors and resources", () => {
  let originalFetch: typeof fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const settle = async (turns = 12): Promise<void> => {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  };
  const plan = (source: string): EvaluationContext => {
    const ctx = createContext(new StateStore(), { library: defaultLibrary, http: new HttpRuntime(), notify: () => {} });
    planProgram(parse(source), ctx);
    return ctx;
  };

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    fetchMock = vi.fn(async () => json({ ok: true }));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    if (originalFetch) (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
  });

  const sentHeaders = (): Record<string, string> => {
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return (init.headers as Record<string, string>) ?? {};
  };

  it("onRequest runs synchronously: a returned Promise is ignored, a synchronous partial merges", async () => {
    plan('$util.onRequest(req => Promise.resolve({ headers: { XAsync: "1" } }))\n$a = $query({ url: "https://api.example.com/a" })\naktion = Stack()');
    await settle();
    expect(sentHeaders().XAsync).toBeUndefined();
    fetchMock.mockClear();
    plan('$util.onRequest(req => ({ headers: { XSync: "1" } }))\n$b = $query({ url: "https://api.example.com/b" })\naktion = Stack()');
    await settle();
    expect(sentHeaders().XSync).toBe("1");
    fetchMock.mockClear();
    plan('$util.onRequest(req => { req.headers.XMutated = "1" })\n$c = $query({ url: "https://api.example.com/c" })\naktion = Stack()');
    await settle();
    expect(sentHeaders().XMutated).toBe("1");
  });

  it("onResponse REPLACES the response: a partial loses the status and turns a success into an error", async () => {
    const ctx = plan('$util.onResponse(res => ({ body: 1 }))\n$a = $query({ url: "https://api.example.com/a" })\naktion = Stack()');
    await settle();
    const a = ctx.state.get("a") as { state: string; error: { status?: number; body?: unknown } };
    expect(a.state).toBe("error");
    expect(a.error).toEqual({ status: undefined, body: 1 });
  });

  it("the infinite form ignores refetchInterval (only a plain query polls)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      fetchMock.mockImplementation(async () => json([{ id: 1 }]));
      const ctx = plan('$feed = $query({ url: "https://api.example.com/feed", refetchInterval: 300, infinite: { limit: 2 } })\n$poll = $query({ url: "https://api.example.com/poll", refetchInterval: 300 })\naktion = Stack()');
      await settle();
      vi.advanceTimersByTime(700);
      await settle();
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calls.filter((u) => u.includes("/feed"))).toHaveLength(1);
      expect(calls.filter((u) => u.includes("/poll")).length).toBeGreaterThan(1);
      for (const dispose of ctx.disposers) dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("$mutation forwards fetch options it does not read itself (credentials, mode, cache)", async () => {
    const ctx = plan('$save = $mutation({ url: "https://api.example.com/s", credentials: "include", mode: "cors", cache: "no-store" })\naktion = Stack()');
    await (ctx.state.get("save") as { mutate: () => Promise<unknown> }).mutate();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({ credentials: "include", mode: "cors", cache: "no-store" });
  });

  it("an infinite query's cancel() is a no-op (a plain query's aborts): the in-flight page still lands", async () => {
    fetchMock.mockImplementation(async () => json([{ id: 1 }]));
    const ctx = plan('$feed = $query({ url: "https://api.example.com/feed", infinite: { limit: 2 } })\n$plain = $query({ url: "https://api.example.com/plain" })\naktion = Stack()');
    (ctx.state.get("feed") as { cancel: () => void }).cancel();
    (ctx.state.get("plain") as { cancel: () => void }).cancel();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((ctx.state.get("feed") as { data: unknown[] }).data).toEqual([{ id: 1 }]);
    expect((ctx.state.get("plain") as { data: unknown }).data).toBeUndefined();
  });
});
