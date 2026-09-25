import { ComponentSpec } from '../library/types.js';
import { ThemeInput } from '../theme/index.js';
import { CompiledProgram } from '../compiler/runtime.js';
import { HttpInterceptors } from '../runtime/http.js';
import * as coverageApi from "../runtime/coverage.js";
/**
 * DSL coverage for the program under test.
 *
 * `.aktion` files compile to a `JSON.parse` of their AST, so V8 and Istanbul see
 * one executed line however much DSL is behind it — real coverage has to come
 * from the interpreter. Turn it on once per test file and read it back at the
 * end:
 *
 * ```ts
 * import { coverage, renderCompiled } from "aktion-runtime/test";
 * import app from "../src/app.aktion";
 *
 * beforeAll(() => { coverage.start(); });
 * afterAll(() => {
 *   const report = coverage.report();
 *   writeFileSync("coverage/aktion.lcov", coverage.toLcov(report));
 * });
 * ```
 *
 * Measurement accumulates across every `render`/`renderCompiled` in the file, so
 * each test contributes; call `coverage.reset()` to start over.
 *
 * @see {@link coverageApi.report} for what lines / functions / branches mean here.
 */
export declare const coverage: {
    start: typeof coverageApi.start;
    stop: typeof coverageApi.stop;
    reset: typeof coverageApi.reset;
    isEnabled: typeof coverageApi.isEnabled;
    report: typeof coverageApi.report;
    merge: typeof coverageApi.merge;
    toLcov: typeof coverageApi.toLcov;
    formatSummary: typeof coverageApi.formatSummary;
};
export type { CoverageReport, FileCoverageReport, CoverageSummary, CoverageMetric, FunctionReport, BranchReport, BranchKind, } from '../runtime/coverage.js';
/** The public surface of the `<aktion-app>` element this library drives. */
export type AktionApp = HTMLElement & {
    setResponse(text: string): void;
    mountCompiled(compiled: CompiledProgram, state?: Record<string, unknown>): void;
    appendChunk(chunk: string): void;
    serializeState(): Record<string, unknown>;
    hydrateState(snapshot: Record<string, unknown>): void;
    setState(name: string, value: unknown): void;
    setTheme(theme: ThemeInput): void;
    registerComponents(components: ComponentSpec[], rootName?: string): void;
    registerHttpInterceptors(interceptors: HttpInterceptors): void;
    navigate(path: string): void;
    clear(): void;
    route: string;
    streaming: boolean;
    showErrors: boolean;
};
/** A value the fetch mock may return; normalised into a real `Response`. */
export type MockResult = Response | string | {
    status?: number;
    json?: unknown;
    body?: BodyInit | null;
    headers?: Record<string, string>;
};
/** The fetch mock handler — receives the resolved URL and the `fetch` init. */
export type FetchHandler = (url: string, init: RequestInit & {
    method: string;
}) => MockResult | Promise<MockResult>;
/** A request the mock fetch observed, captured for assertions. */
export interface CapturedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}
export interface RenderOptions {
    /** Theme name (`"dark"`) or a token map applied before the first render. */
    theme?: ThemeInput;
    /** Seed reactive `$state` before the program plans (inject props / spies). */
    state?: Record<string, unknown>;
    /** Host-registered custom components (TypeScript `ComponentSpec`s). */
    components?: ComponentSpec[];
    /** Initial hash route, e.g. `"/orders/42"`. */
    route?: string;
    /** Mock the global `fetch` used by `$http(...)` for the lifetime of the test. */
    fetch?: FetchHandler;
    /**
     * Custom `$emit("name", ...)` event names to capture from the first render.
     * The built-ins (`assistant-message`, `route-change`, `error`) are always
     * captured; custom events need their name listed here (or a `screen.listen`
     * call) BEFORE they fire, since their names aren't known in advance.
     */
    captureEvents?: string[];
    /** Mount in this element instead of `document.body`. */
    container?: HTMLElement;
    /** Render the in-shadow parse-error banner (off by default). */
    showErrors?: boolean;
    /**
     * Host HTTP interceptors, installed before the program mounts — the same
     * `registerHttpInterceptors(...)` a host page uses to inject an auth header.
     * Pair with `fetch` to assert what the program actually put on the wire.
     */
    httpInterceptors?: HttpInterceptors;
}
export interface ComponentRenderOptions extends RenderOptions {
    /** DSL statements injected ABOVE the `$app(expression)` line (helpers, state). */
    setup?: string;
}
export interface TextMatchOptions {
    /** Exact normalised-text match (default `true`); `false` => substring. */
    exact?: boolean;
}
export interface WaitForOptions {
    /** Give up after this many ms (default 1000). */
    timeout?: number;
    /** Poll interval in ms (default 20). */
    interval?: number;
    /**
     * Decide when the value counts as settled, replacing the default rule.
     *
     * Use it when the value you are waiting for is legitimately `0` or `""`:
     * `waitFor(() => list.length, { until: (n) => n === 3 })`.
     */
    until?: (value: unknown) => boolean;
}
/** A string, regex, or predicate used to match an element's accessible text. */
export type Matcher = string | RegExp | ((content: string, element: Element) => boolean);
/**
 * Drain the microtask queue so Aktion's state-flush → render cascade settles.
 * Aktion schedules both state notifications and renders with `queueMicrotask`,
 * so a handful of turns is enough for any synchronous chain (a click that
 * writes state, which re-derives a computed atom, which re-renders).
 */
export declare function flush(times?: number): Promise<void>;
/**
 * Run `fn` (which may trigger reactive writes / handlers) and then flush —
 * the Aktion equivalent of React's `act(...)`. Returns whatever `fn` returns.
 */
export declare function act<T>(fn: () => T | Promise<T>): Promise<T>;
export declare function waitFor<T>(fn: () => T, opts?: WaitForOptions): Promise<T>;
/** How to narrow a `*ByRole` query. */
export interface RoleOptions {
    /** Accessible name. A string matches exactly; use a regex for a substring. */
    name?: Matcher;
    /** Set `false` to match `name` as a substring. Ignored for regex/predicate matchers. */
    exact?: boolean;
}
/** A captured DOM/custom event with its `detail` payload. */
export interface CapturedEvent {
    type: string;
    detail: unknown;
    event: Event;
}
export interface Screen {
    /** The mounted `<aktion-app>` element. */
    readonly container: AktionApp;
    /** The element's shadow root (where the program renders). */
    readonly shadowRoot: ShadowRoot;
    /** Captured fetch requests (empty unless a `fetch` mock was supplied). */
    readonly requests: ReadonlyArray<CapturedRequest>;
    getByText(matcher: Matcher, options?: TextMatchOptions): HTMLElement;
    queryByText(matcher: Matcher, options?: TextMatchOptions): HTMLElement | null;
    getAllByText(matcher: Matcher, options?: TextMatchOptions): HTMLElement[];
    queryAllByText(matcher: Matcher, options?: TextMatchOptions): HTMLElement[];
    findByText(matcher: Matcher, options?: TextMatchOptions, wait?: WaitForOptions): Promise<HTMLElement>;
    findAllByText(matcher: Matcher, options?: TextMatchOptions, wait?: WaitForOptions): Promise<HTMLElement[]>;
    /**
     * Find by ARIA role, optionally narrowed by accessible name. A string `name`
     * must match the whole name; pass a regex or `exact: false` for a substring.
     */
    getByRole(role: string, options?: RoleOptions): HTMLElement;
    queryByRole(role: string, options?: RoleOptions): HTMLElement | null;
    getAllByRole(role: string, options?: RoleOptions): HTMLElement[];
    queryAllByRole(role: string, options?: RoleOptions): HTMLElement[];
    findByRole(role: string, options?: RoleOptions, wait?: WaitForOptions): Promise<HTMLElement>;
    findAllByRole(role: string, options?: RoleOptions, wait?: WaitForOptions): Promise<HTMLElement[]>;
    getByLabelText(matcher: Matcher, options?: TextMatchOptions): HTMLElement;
    queryByLabelText(matcher: Matcher, options?: TextMatchOptions): HTMLElement | null;
    getAllByLabelText(matcher: Matcher, options?: TextMatchOptions): HTMLElement[];
    queryAllByLabelText(matcher: Matcher, options?: TextMatchOptions): HTMLElement[];
    findByLabelText(matcher: Matcher, options?: TextMatchOptions, wait?: WaitForOptions): Promise<HTMLElement>;
    findAllByLabelText(matcher: Matcher, options?: TextMatchOptions, wait?: WaitForOptions): Promise<HTMLElement[]>;
    getByPlaceholderText(matcher: Matcher, options?: TextMatchOptions): HTMLElement;
    queryByPlaceholderText(matcher: Matcher, options?: TextMatchOptions): HTMLElement | null;
    getAllByPlaceholderText(matcher: Matcher, options?: TextMatchOptions): HTMLElement[];
    queryAllByPlaceholderText(matcher: Matcher, options?: TextMatchOptions): HTMLElement[];
    findByPlaceholderText(matcher: Matcher, options?: TextMatchOptions, wait?: WaitForOptions): Promise<HTMLElement>;
    findAllByPlaceholderText(matcher: Matcher, options?: TextMatchOptions, wait?: WaitForOptions): Promise<HTMLElement[]>;
    getByTestId(id: string): HTMLElement;
    queryByTestId(id: string): HTMLElement | null;
    getAllByTestId(id: string): HTMLElement[];
    queryAllByTestId(id: string): HTMLElement[];
    findByTestId(id: string, wait?: WaitForOptions): Promise<HTMLElement>;
    findAllByTestId(id: string, wait?: WaitForOptions): Promise<HTMLElement[]>;
    readonly user: UserEvent;
    /** Click a button/link/[role=button] found by its text, or click an element. */
    click(target: string | Element): Promise<void>;
    /** Type into a field found by label/placeholder/role, or into an element. */
    type(target: string | Element, text: string): Promise<void>;
    fireEvent(el: Element, type: string, init?: EventInit): Promise<void>;
    readonly state: StateProbe;
    /** Await an atom until `predicate(value)` holds (or it becomes non-null). */
    waitForState(name: string, predicate?: (value: unknown) => boolean, wait?: WaitForOptions): Promise<unknown>;
    readonly events: ReadonlyArray<CapturedEvent>;
    /** Start capturing a custom `$emit(...)` event type (call before the trigger). */
    listen(type: string): void;
    emitted(type?: string): unknown[];
    lastEvent(type: string): unknown;
    waitForEvent(type: string, wait?: WaitForOptions): Promise<unknown>;
    navigate(path: string): Promise<void>;
    readonly route: string;
    rerender(program: string): Promise<void>;
    appendChunk(chunk: string): Promise<void>;
    stream(chunks: string[]): Promise<void>;
    setStreaming(value: boolean): void;
    setTheme(theme: ThemeInput): Promise<void>;
    flush(times?: number): Promise<void>;
    unmount(): void;
    html(): string;
    debug(el?: Element): void;
}
export interface UserEvent {
    click(el: Element): Promise<void>;
    type(el: Element, text: string): Promise<void>;
    clear(el: Element): Promise<void>;
    selectOption(select: Element, value: string): Promise<void>;
    check(el: Element): Promise<void>;
    uncheck(el: Element): Promise<void>;
    keyboard(el: Element, key: string): Promise<void>;
    hover(el: Element): Promise<void>;
    unhover(el: Element): Promise<void>;
    submit(form: Element): Promise<void>;
}
/**
 * Read and write the program's reactive `$state`.
 *
 * Names are the ones the AUTHOR wrote. That distinction matters for a multi-file
 * program: the linker gives every non-entry module private scope by renaming its
 * atoms (`$stateFilter` declared in `lib/store.aktion` is `__a4_stateFilter` in
 * `serializeState()`), and the numeric part comes from import traversal order, so
 * it changes when an import is added. Tests that hard-code the mangled key break
 * on an unrelated edit; these methods resolve `"stateFilter"` for you and throw a
 * naming-collision error rather than guessing when two modules declare the same
 * atom.
 */
export interface StateProbe {
    /** Read one atom, by the name it was declared with. */
    get(name: string): unknown;
    /**
     * Whether the program has planned, so its atoms exist and can be resolved.
     *
     * `render`/`renderCompiled` only SCHEDULE the first render (Aktion plans on the
     * microtask queue), so every method here is answering about an empty store
     * until one flush has happened. Await `screen.flush()` — or any `findBy*` —
     * before reading or writing state. A program that declares no `$state` at all
     * never reports `true`, and has nothing to probe either.
     */
    readonly planned: boolean;
    /** Whether the atom currently exists. */
    has(name: string): boolean;
    /** The full reactive snapshot, with the runtime's own keys — for `toMatchSnapshot()`. */
    snapshot(): Record<string, unknown>;
    /**
     * Write the atom and re-render — the same reactive write an `onClick` handler
     * in the program performs. Derived atoms that read it recompute.
     */
    set(name: string, value: unknown): Promise<void>;
    /**
     * Restore a snapshot the way a host does (`hydrateState`): the values are
     * marked as coming from outside the program, so they survive the planner's
     * reset of literal `$state` defaults on the next replan. Use `set` to simulate
     * a user interaction; use this to test SSR / snapshot resume.
     */
    hydrate(snapshot: Record<string, unknown>): Promise<void>;
    /**
     * The runtime key backing `name` — the mangled symbol for a module-local atom,
     * or `name` itself when it is already canonical. Useful in an error message, or
     * to build a `hydrateState` payload by hand.
     */
    key(name: string): string;
}
/**
 * Mount an Aktion program in a real `<aktion-app>` and return a `Screen`
 * scoped to its shadow root. Renders synchronously enough that the returned
 * screen's `getBy*` queries see the first paint; use `findBy*` / `waitFor`
 * for anything that resolves after an effect, timer, or `$http(...)` request.
 */
export declare function render(program: string, options?: RenderOptions): Screen;
/**
 * Mount a **compiled** program — what `import app from "./app.aktion"` gives you
 * once the `aktion-runtime/vite` plugin has linked the module graph.
 *
 * This is the entry point for testing a real app rather than a snippet.
 * `render(source)` takes a string and re-parses it, which cannot express a
 * multi-file program at all: `import`s are resolved by the linker at build time,
 * so the string form of an entry module is not a runnable program. Passing the
 * artefact keeps the test on exactly the AST that ships — same linking, same
 * module scoping, same per-file source provenance that coverage reports against.
 *
 * ```ts
 * import app from "../src/app.aktion";
 *
 * const screen = renderCompiled(app, {
 *   route: "/clusters",
 *   fetch: (url) => json({ items: [] }),
 * });
 * await screen.findByText("No clusters yet");
 * ```
 *
 * Every `RenderOptions` field applies, and options are honoured in the same
 * order as `render`: components and theme first, then seeded state, then the
 * mount — so the program's first plan already sees them.
 */
export declare function renderCompiled(compiled: CompiledProgram, options?: RenderOptions): Screen;
/**
 * Render a single component expression in isolation — sugar over `render`
 * that wraps the expression in `$app(...)` and lets you prepend `setup` DSL
 * (helper functions, seed state). Capture interactions the idiomatic Aktion
 * way (write a `$state` flag or `$emit(...)` inside an inline handler) and
 * assert with `screen.state` / `screen.emitted`.
 *
 *   renderComponent(`Button("Save", { onClick: () => $saved = true })`)
 */
export declare function renderComponent(expression: string, options?: ComponentRenderOptions): Screen;
/**
 * Unmount every screen created since the last cleanup, restore any mocked
 * `fetch`, and put `location.hash` back where each mount found it. Call from
 * your runner's `afterEach` for isolated tests.
 */
export declare function cleanup(): void;
/** Convenience for building a JSON `MockResult` in a `fetch` handler. */
export declare function json(data: unknown, status?: number): MockResult;
/**
 * The scoped query surface returned by {@link within}.
 *
 * ONE DELIBERATE DIVERGENCE FROM `Screen`: the scoped `getAll*` queries answer
 * `[]` when nothing matches, where `Screen`'s throw. That is long-standing
 * behaviour callers rely on to count occurrences inside a subtree, so it stays —
 * but it means `getAll*` here is not the "assert at least one" query it is on
 * `Screen`. Use `getBy*` for that, and `queryAll*` when the point IS that the
 * subtree may hold none.
 */
export interface WithinQueries {
    getByText(matcher: Matcher): HTMLElement;
    queryByText(matcher: Matcher): HTMLElement | null;
    getAllByText(matcher: Matcher): HTMLElement[];
    /** Every match, or `[]` — the assertion for "this subtree holds none of these". */
    queryAllByText(matcher: Matcher): HTMLElement[];
    getByRole(role: string, options?: RoleOptions): HTMLElement;
    queryByRole(role: string, options?: RoleOptions): HTMLElement | null;
    getAllByRole(role: string, options?: RoleOptions): HTMLElement[];
    queryAllByRole(role: string, options?: RoleOptions): HTMLElement[];
    getByTestId(id: string): HTMLElement;
    queryByTestId(id: string): HTMLElement | null;
    queryAllByTestId(id: string): HTMLElement[];
}
/**
 * Scope Testing-Library-style queries to a subtree (XIV.6). Mirror of RTL's
 * `within(node)` — useful for asserting inside one card/row of a list without
 * matching siblings.
 */
export declare function within(root: Element): WithinQueries;
export interface A11yViolation {
    rule: string;
    message: string;
    element: string;
}
/**
 * Lightweight accessibility audit (XIV.6) — a pragmatic subset of axe-style
 * checks that need no dependency: images without alt, non-decorative SVGs
 * without a label, buttons/links without an accessible name (resolving
 * `aria-labelledby`), inputs without a label, duplicate ids, and positive
 * tabindex. Returns the list of violations (empty = clean).
 */
export declare function axe(root: Element): A11yViolation[];
