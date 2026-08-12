/**
 * Aktion Testing Library (`aktion/test`)
 * ======================================
 *
 * A testing toolkit for Aktion programs, modelled on React Testing Library /
 * Vitest ergonomics but built around Aktion's own principles:
 *
 *   - You test the **program string**, not internal AST nodes. The unit of
 *     authorship in Aktion is a `$app(...)` program, so `render(source)` mounts
 *     a real `<aktion-app>` and exercises the genuine
 *     parse → plan → render → morph pipeline (real reactivity, real effects,
 *     real two-way binding, real router).
 *   - You query the **rendered shadow DOM the way a user sees it** — by visible
 *     text, ARIA role, label, or test id — never by reaching into private
 *     state. (`getByRole`/`getByText` first, like Testing Library.)
 *   - Assertions target the three things an Aktion program exposes: the
 *     **rendered output**, the **reactive `$state`** (via `serializeState()`),
 *     and the **events** it emits (`assistant-message`, `route-change`,
 *     `error`, and custom `$emit(...)` events).
 *   - Aktion renders on the **microtask queue**, so interactions auto-flush and
 *     `findBy*` queries retry until the next paint settles — no manual
 *     `await Promise.resolve()` plumbing.
 *
 * This module has zero dependencies on any test runner. Use it with Vitest,
 * Jest, Web Test Runner, or a bare `happy-dom`/`jsdom` script. For automatic
 * teardown, wire `cleanup` into your runner's `afterEach` (Vitest:
 * `import { afterEach } from "vitest"; afterEach(cleanup)`).
 */

import { defineElement } from "../element.js";
import type { ComponentSpec } from "../library/types.js";
import type { ThemeInput } from "../theme/index.js";
import type { CompiledProgram } from "../compiler/runtime.js";
import { moduleLocalBaseName } from "../compiler/linker.js";
import type { HttpInterceptors } from "../runtime/http.js";
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
export const coverage = {
  start: coverageApi.start,
  stop: coverageApi.stop,
  reset: coverageApi.reset,
  isEnabled: coverageApi.isEnabled,
  report: coverageApi.report,
  merge: coverageApi.merge,
  toLcov: coverageApi.toLcov,
  formatSummary: coverageApi.formatSummary,
};

export type {
  CoverageReport,
  FileCoverageReport,
  CoverageSummary,
  CoverageMetric,
  FunctionReport,
  BranchReport,
  BranchKind,
} from "../runtime/coverage.js";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

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
export type MockResult =
  | Response
  | string
  | {
      status?: number;
      json?: unknown;
      body?: BodyInit | null;
      headers?: Record<string, string>;
    };

/** The fetch mock handler — receives the resolved URL and the `fetch` init. */
export type FetchHandler = (
  url: string,
  init: RequestInit & { method: string },
) => MockResult | Promise<MockResult>;

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
export type Matcher =
  | string
  | RegExp
  | ((content: string, element: Element) => boolean);

/* -------------------------------------------------------------------------- */
/*  Async flushing                                                             */
/* -------------------------------------------------------------------------- */

const microtask = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const macrotask = (ms = 0): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Drain the microtask queue so Aktion's state-flush → render cascade settles.
 * Aktion schedules both state notifications and renders with `queueMicrotask`,
 * so a handful of turns is enough for any synchronous chain (a click that
 * writes state, which re-derives a computed atom, which re-renders).
 */
export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await microtask();
}

/**
 * Run `fn` (which may trigger reactive writes / handlers) and then flush —
 * the Aktion equivalent of React's `act(...)`. Returns whatever `fn` returns.
 */
export async function act<T>(fn: () => T | Promise<T>): Promise<T> {
  const result = await fn();
  await flush();
  return result;
}

/**
 * Poll `fn` until it returns a truthy / non-empty value or `timeout` elapses.
 * Use it (or the `findBy*` queries built on it) to await async work —
 * `$http(...)` resolutions, `setTimeout`, debounced effects.
 */
/**
 * Has `fn`'s value arrived yet?
 *
 * `false` counts as NOT yet. The overwhelmingly common shape is a predicate —
 * `waitFor(() => screen.requests.length > 0)` — and treating `false` as a result
 * made every such wait return on its first tick, so the assertion after it ran
 * against an unsettled DOM and the test passed or failed on timing. `null`,
 * `undefined` and an empty array likewise mean "not yet".
 *
 * `0` and `""` DO count as settled: they are ordinary values, and a wait for a
 * count that must reach zero should say so with `until`.
 */
function settled(value: unknown, until?: (value: unknown) => boolean): boolean {
  if (until) return until(value);
  if (value == null || value === false) return false;
  return !(Array.isArray(value) && value.length === 0);
}

export async function waitFor<T>(
  fn: () => T,
  opts: WaitForOptions = {},
): Promise<T> {
  const timeout = opts.timeout ?? 1000;
  const interval = opts.interval ?? 20;
  const start = Date.now();
  let lastError: unknown;
  for (;;) {
    await flush(2);
    try {
      const value = fn();
      if (settled(value, opts.until)) return value;
    } catch (err) {
      lastError = err;
    }
    if (Date.now() - start >= timeout) {
      throw lastError ?? new Error(`waitFor timed out after ${timeout}ms`);
    }
    await macrotask(interval);
  }
}

/* -------------------------------------------------------------------------- */
/*  Text / role / name matching                                               */
/* -------------------------------------------------------------------------- */

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function textMatches(content: string, matcher: Matcher, exact: boolean, el: Element): boolean {
  if (typeof matcher === "function") return matcher(content, el);
  if (matcher instanceof RegExp) return matcher.test(content);
  return exact ? content === matcher : content.includes(matcher);
}

/**
 * Implicit ARIA roles, per the HTML-AAM mapping.
 *
 * Covers the landmarks and table/list/form structure a real app renders, not just
 * interactive controls: a `<nav aria-label="Breadcrumb">` has role `navigation`
 * whether or not the author wrote it down, and a test that cannot ask for it by
 * role has to reach for a class name instead — which is exactly the coupling
 * role-based queries exist to avoid.
 */
function implicitRoles(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type;
  switch (tag) {
    case "button":
      return ["button"];
    case "a":
      return el.hasAttribute("href") ? ["link"] : [];
    case "textarea":
      return ["textbox"];
    case "select":
      // A `size`/`multiple` select is a listbox; a plain one is a combobox. Both
      // are reported so either query finds it.
      return ["combobox", "listbox"];
    case "option":
      return ["option"];
    case "optgroup":
      return ["group"];
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return ["heading"];
    case "img":
      // An empty `alt` marks a decorative image, which has no role at all.
      return el.getAttribute("alt") === "" ? ["presentation"] : ["img"];
    case "ul": case "ol": case "menu":
      return ["list"];
    case "li":
      return ["listitem"];
    case "dl":
      return ["list"];
    case "table":
      return ["table"];
    case "thead": case "tbody": case "tfoot":
      return ["rowgroup"];
    case "tr":
      return ["row"];
    case "td":
      return ["cell"];
    case "th":
      return ["columnheader", "rowheader"];
    case "caption":
      return ["caption"];
    // --- Landmarks ---
    case "nav":
      return ["navigation"];
    case "main":
      return ["main"];
    case "aside":
      return ["complementary"];
    case "form":
      return ["form"];
    case "search":
      return ["search"];
    case "header":
      // `banner` / `contentinfo` only apply at the top level of the document; a
      // `<header>` inside an article or section is a generic wrapper.
      return el.closest("article, aside, main, nav, section") ? [] : ["banner"];
    case "footer":
      return el.closest("article, aside, main, nav, section") ? [] : ["contentinfo"];
    case "section":
      // Only a NAMED section is a region — an unnamed one is generic.
      return accessibleNameAttrs(el) ? ["region"] : [];
    case "dialog":
      return ["dialog"];
    case "details":
      return ["group"];
    case "summary":
      return ["button"];
    case "fieldset":
      return ["group"];
    case "legend":
      return [];
    case "progress":
      return ["progressbar"];
    case "meter":
      return ["meter"];
    case "output":
      return ["status"];
    case "hr":
      return ["separator"];
    case "input":
      if (type === "checkbox") return ["checkbox"];
      if (type === "radio") return ["radio"];
      if (type === "range") return ["slider"];
      if (type === "number") return ["spinbutton"];
      if (type === "search") return ["searchbox"];
      if (["text", "email", "tel", "url", "password", "", undefined].includes(type)) return ["textbox"];
      return [];
    default:
      return [];
  }
}

/** Whether the element carries an author-supplied name — decides `<section>`'s role. */
function accessibleNameAttrs(el: Element): boolean {
  return Boolean(el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby") ?? el.getAttribute("title"));
}

function rolesOf(el: Element): string[] {
  const explicit = el.getAttribute("role");
  // `role` may list fallbacks (`role="switch checkbox"`); all of them count.
  return explicit ? explicit.trim().split(/\s+/) : implicitRoles(el);
}

/** Compute a best-effort accessible name (aria-label → label → text → …). */
function accessibleName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return normalize(ariaLabel);

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = el.getRootNode() as ShadowRoot | Document;
    const names = labelledBy
      .split(/\s+/)
      .map((id) => (root as ShadowRoot).getElementById?.(id)?.textContent ?? "")
      .join(" ");
    if (normalize(names)) return normalize(names);
  }

  // A wrapping or associated <label>.
  if (el.id) {
    const root = el.getRootNode() as ShadowRoot | Document;
    const label = (root as ShadowRoot).querySelector?.(`label[for="${cssEscape(el.id)}"]`);
    if (label?.textContent) return normalize(label.textContent);
  }
  const wrappingLabel = el.closest?.("label");
  if (wrappingLabel?.textContent) return normalize(wrappingLabel.textContent);

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return normalize(placeholder);
  const alt = el.getAttribute("alt");
  if (alt) return normalize(alt);
  const title = el.getAttribute("title");
  if (title) return normalize(title);
  const value = (el as HTMLInputElement).value;
  if ((el.tagName === "INPUT" || el.tagName === "BUTTON") && value) return normalize(value);

  return normalize(contentText(el));
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  return id.replace(/([^A-Za-z0-9_-])/g, "\\$1");
}

/* -------------------------------------------------------------------------- */
/*  Query engine                                                               */
/* -------------------------------------------------------------------------- */

/** Return the innermost matching elements (drop ancestors that only match
 *  because a descendant does), mirroring Testing Library's `getByText`. */
function innermost(elements: Element[]): Element[] {
  const set = new Set(elements);
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other) && set.has(other)));
}

interface QuerySet<Args extends unknown[]> {
  getBy: (...args: Args) => HTMLElement;
  queryBy: (...args: Args) => HTMLElement | null;
  getAllBy: (...args: Args) => HTMLElement[];
  queryAllBy: (...args: Args) => HTMLElement[];
  findBy: (...args: [...Args, WaitForOptions?]) => Promise<HTMLElement>;
  findAllBy: (...args: [...Args, WaitForOptions?]) => Promise<HTMLElement[]>;
}

function makeQuerySet<Args extends unknown[]>(
  label: string,
  getRoot: () => ParentNode,
  collect: (root: ParentNode, ...args: Args) => Element[],
): QuerySet<Args> {
  const queryAllBy = (...args: Args): HTMLElement[] =>
    collect(getRoot(), ...args) as HTMLElement[];

  const getAllBy = (...args: Args): HTMLElement[] => {
    const found = queryAllBy(...args);
    if (found.length === 0) {
      throw new Error(`Unable to find an element by ${label}: ${describeArgs(args)}`);
    }
    return found;
  };

  const queryBy = (...args: Args): HTMLElement | null => {
    const found = queryAllBy(...args);
    if (found.length > 1) {
      throw new Error(`Found ${found.length} elements by ${label}: ${describeArgs(args)} (use getAllBy*).`);
    }
    return found[0] ?? null;
  };

  const getBy = (...args: Args): HTMLElement => {
    const found = getAllBy(...args);
    if (found.length > 1) {
      throw new Error(`Found ${found.length} elements by ${label}: ${describeArgs(args)} (use getAllBy*).`);
    }
    return found[0]!;
  };

  const findBy = async (...args: [...Args, WaitForOptions?]): Promise<HTMLElement> => {
    const { queryArgs, options } = splitWaitArgs<Args>(args);
    return waitFor(() => getBy(...queryArgs), options);
  };

  const findAllBy = async (...args: [...Args, WaitForOptions?]): Promise<HTMLElement[]> => {
    const { queryArgs, options } = splitWaitArgs<Args>(args);
    return waitFor(() => getAllBy(...queryArgs), options);
  };

  return { getBy, queryBy, getAllBy, queryAllBy, findBy, findAllBy };
}

function splitWaitArgs<Args extends unknown[]>(
  args: unknown[],
): { queryArgs: Args; options: WaitForOptions } {
  const last = args[args.length - 1];
  const isOpts =
    last != null && typeof last === "object" && !(last instanceof RegExp) &&
    ("timeout" in (last as object) || "interval" in (last as object));
  if (isOpts) return { queryArgs: args.slice(0, -1) as Args, options: last as WaitForOptions };
  return { queryArgs: args as Args, options: {} };
}

function describeArgs(args: unknown[]): string {
  return args
    .map((a) => (a instanceof RegExp ? a.toString() : typeof a === "function" ? "[predicate]" : JSON.stringify(a)))
    .join(", ");
}

/**
 * Elements a user could perceive — everything except the nodes whose text
 * content is code rather than content.
 *
 * A themed Aktion app puts a large `<style>` in its shadow root (and `Styles(…)`
 * adds more), so an unfiltered `querySelectorAll("*")` makes CSS eligible for
 * text queries: `getByText("cluster", { exact: false })` would match a
 * stylesheet rule and report a duplicate match, or worse, pass for the wrong
 * reason. Testing Library's DOM queries ignore these elements for the same
 * reason; so do these.
 */
const NON_CONTENT_TAGS = new Set(["STYLE", "SCRIPT", "TEMPLATE", "LINK", "META", "TITLE"]);

function allElements(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!NON_CONTENT_TAGS.has(el.tagName)) out.push(el);
  }
  return out;
}

/**
 * The text of `el` as a user would read it, with the content of `<style>` /
 * `<script>` descendants left out.
 *
 * Excluding those elements from the candidate list is not enough on its own:
 * `textContent` on any ANCESTOR of the app's stylesheet still returns the whole
 * sheet, so the root container would match half the CSS in the theme.
 */
/**
 * The program's rendered markup — the shadow root's children minus the chrome
 * the element itself injects.
 *
 * `firstElementChild.outerHTML` used to be the answer and no longer is: on a
 * themed app the first child is the injected `<style>`, so `screen.html()`
 * returned the whole stylesheet and never the UI. Dropping the non-content tags
 * and the hidden error banner leaves exactly what the program produced, which is
 * what a snapshot or a failure message should show.
 */
function renderedHtml(root: ParentNode): string {
  const parts: string[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 1) {
      const el = node as Element;
      if (NON_CONTENT_TAGS.has(el.tagName)) continue;
      // The error banner is always present and `hidden` unless a program failed
      // to parse; an empty banner is noise in every snapshot.
      if (el.classList.contains("rui-error-banner") && el.hasAttribute("hidden")) continue;
      parts.push(el.outerHTML);
      continue;
    }
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (text.trim() !== "") parts.push(text);
    }
  }
  return parts.join("\n");
}

function contentText(el: Element): string {
  if (NON_CONTENT_TAGS.has(el.tagName)) return "";
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) out += child.textContent ?? "";
    else if (child.nodeType === 1) out += contentText(child as Element);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Fetch mock                                                                 */
/* -------------------------------------------------------------------------- */

function toResponse(result: MockResult): Response {
  if (result instanceof Response) return result;
  if (typeof result === "string") return new Response(result, { status: 200 });
  const { status = 200, json, body, headers = {} } = result ?? {};
  const h = new Headers(headers);
  let payload: BodyInit | null;
  if (json !== undefined) {
    payload = JSON.stringify(json);
    if (!h.has("content-type")) h.set("content-type", "application/json");
  } else {
    payload = body ?? "";
  }
  return new Response(payload, { status, headers: h });
}

interface InstalledFetch {
  requests: CapturedRequest[];
  restore: () => void;
}

function installFetchMock(handler: FetchHandler): InstalledFetch {
  const requests: CapturedRequest[] = [];
  const original = (globalThis as { fetch?: typeof fetch }).fetch;

  const mock = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? (input as Request)?.method ?? "GET").toUpperCase();
    // Header names are lowercased so assertions are stable: HTTP treats them
    // case-insensitively, browsers normalise them, and `Headers.forEach` in
    // happy-dom preserves the case the caller used — so
    // `requests[0].headers["authorization"]` would otherwise pass or fail
    // depending on which DOM the suite runs in.
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* keep raw string */ }
    }
    requests.push({ url, method, headers, body });
    const result = await handler(url, { ...init, method });
    return toResponse(result);
  }) as typeof fetch;

  (globalThis as { fetch?: typeof fetch }).fetch = mock;
  return {
    requests,
    restore: () => { (globalThis as { fetch?: typeof fetch }).fetch = original; },
  };
}

/* -------------------------------------------------------------------------- */
/*  The Screen                                                                 */
/* -------------------------------------------------------------------------- */

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

  // --- Queries (Testing Library semantics) ---
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

  // --- Interaction (auto-flush) ---
  readonly user: UserEvent;
  /** Click a button/link/[role=button] found by its text, or click an element. */
  click(target: string | Element): Promise<void>;
  /** Type into a field found by label/placeholder/role, or into an element. */
  type(target: string | Element, text: string): Promise<void>;
  fireEvent(el: Element, type: string, init?: EventInit): Promise<void>;

  // --- Reactive state ---
  readonly state: StateProbe;
  /** Await an atom until `predicate(value)` holds (or it becomes non-null). */
  waitForState(name: string, predicate?: (value: unknown) => boolean, wait?: WaitForOptions): Promise<unknown>;

  // --- Events ---
  readonly events: ReadonlyArray<CapturedEvent>;
  /** Start capturing a custom `$emit(...)` event type (call before the trigger). */
  listen(type: string): void;
  emitted(type?: string): unknown[];
  lastEvent(type: string): unknown;
  waitForEvent(type: string, wait?: WaitForOptions): Promise<unknown>;

  // --- Routing ---
  navigate(path: string): Promise<void>;
  readonly route: string;

  // --- Lifecycle ---
  rerender(program: string): Promise<void>;
  appendChunk(chunk: string): Promise<void>;
  stream(chunks: string[]): Promise<void>;
  setStreaming(value: boolean): void;
  setTheme(theme: ThemeInput): Promise<void>;
  flush(times?: number): Promise<void>;
  unmount(): void;

  // --- Debugging / snapshots ---
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

/* -------------------------------------------------------------------------- */
/*  render()                                                                   */
/* -------------------------------------------------------------------------- */

interface MountRecord {
  el: HTMLElement;
  fetchMock: InstalledFetch | null;
  /** Put `location.hash` back if this mount (or the program) changed it. */
  restoreHash: (() => void) | null;
}

const mounted = new Set<MountRecord>();

/**
 * Mount an Aktion program in a real `<aktion-app>` and return a `Screen`
 * scoped to its shadow root. Renders synchronously enough that the returned
 * screen's `getBy*` queries see the first paint; use `findBy*` / `waitFor`
 * for anything that resolves after an effect, timer, or `$http(...)` request.
 */
export function render(program: string, options: RenderOptions = {}): Screen {
  return mount(options, (el) => { el.setResponse(program); });
}

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
export function renderCompiled(compiled: CompiledProgram, options: RenderOptions = {}): Screen {
  return mount(options, (el) => { el.mountCompiled(compiled); });
}

/**
 * Shared mount sequence for `render` / `renderCompiled`.
 *
 * The ordering matters and is the reason this is one function rather than two:
 * host components and the theme have to be registered before the program plans,
 * seeded state has to land before the first render so `$state` defaults do not
 * overwrite it, and the fetch mock has to be installed before any `$http` on
 * mount fires.
 */
function mount(options: RenderOptions, load: (el: AktionApp) => void): Screen {
  defineElement(); // idempotent — registers <aktion-app> if not already defined.

  const fetchMock = options.fetch ? installFetchMock(options.fetch) : null;

  // The hash is DOCUMENT state, not element state, so a route this mount sets —
  // or that the program navigates to — outlives the element unless it is put
  // back. Left alone, the next `render()` WITHOUT a `route` starts on whatever
  // path the previous test finished on, and a suite passes or fails on its own
  // ordering. Captured here, restored by `unmount` / `cleanup`.
  let restoreHash: (() => void) | null = null;
  if (typeof window !== "undefined" && window.location) {
    const before = window.location.hash;
    restoreHash = () => {
      if (window.location.hash !== before) {
        try { window.location.hash = before; } catch { /* ignore in restricted envs */ }
      }
    };
  }

  if (options.route != null && typeof window !== "undefined" && window.location) {
    const path = options.route.startsWith("/") ? options.route : `/${options.route}`;
    try { window.location.hash = `#${path}`; } catch { /* ignore in restricted envs */ }
  }

  const el = document.createElement("aktion-app") as AktionApp;
  if (options.theme != null && typeof options.theme === "string") el.setAttribute("theme", options.theme);
  if (options.showErrors) el.setAttribute("showerrors", "true");

  const container = options.container ?? document.body;
  container.appendChild(el);

  // Register custom components before the program plans.
  if (options.components && options.components.length > 0) {
    el.registerComponents(options.components);
  }
  // Non-string themes (token maps) go through setTheme.
  if (options.theme != null && typeof options.theme !== "string") {
    el.setTheme(options.theme);
  }
  // Host interceptors must exist before the first request, which a program can
  // fire during its very first plan.
  if (options.httpInterceptors) el.registerHttpInterceptors(options.httpInterceptors);

  load(el);

  // Seed state AFTER loading, not before: both `setResponse` and
  // `mountCompiled` begin by rebinding the state store to the new program,
  // which clears every value — so anything hydrated earlier was silently
  // dropped and `options.state` never reached the program. Loading only
  // *schedules* the render, and `declare` never overwrites a name that already
  // has a value, so seeding here still lands before the first plan and survives
  // it.
  if (options.state) el.hydrateState(options.state);

  const record: MountRecord = { el, fetchMock, restoreHash };
  mounted.add(record);

  return buildScreen(el, record, fetchMock, options.captureEvents ?? []);
}

/**
 * Render a single component expression in isolation — sugar over `render`
 * that wraps the expression in `$app(...)` and lets you prepend `setup` DSL
 * (helper functions, seed state). Capture interactions the idiomatic Aktion
 * way (write a `$state` flag or `$emit(...)` inside an inline handler) and
 * assert with `screen.state` / `screen.emitted`.
 *
 *   renderComponent(`Button("Save", { onClick: () => $saved = true })`)
 */
export function renderComponent(expression: string, options: ComponentRenderOptions = {}): Screen {
  const setup = options.setup ? `${options.setup}\n` : "";
  return render(`${setup}$app(${expression})`, options);
}

function buildScreen(
  el: AktionApp,
  record: MountRecord,
  fetchMock: InstalledFetch | null,
  captureEvents: string[],
): Screen {
  const getRoot = (): ParentNode => {
    if (!el.shadowRoot) throw new Error("aktion-app has no shadowRoot — was it mounted?");
    return el.shadowRoot;
  };

  // --- query collectors ---
  const byText = makeQuerySet<[Matcher, TextMatchOptions?]>(
    "text",
    getRoot,
    (root, matcher, opts) => {
      const exact = opts?.exact ?? true;
      const hits = allElements(root).filter((node) =>
        textMatches(normalize(contentText(node)), matcher, exact, node),
      );
      return innermost(hits);
    },
  );

  const byRole = makeQuerySet<[string, { name?: Matcher; exact?: boolean }?]>(
    "role",
    getRoot,
    (root, role, opts) =>
      allElements(root).filter((node) => {
        if (!rolesOf(node).includes(role)) return false;
        if (opts?.name == null) return true;
        // A string `name` matches EXACTLY, as in Testing Library. Substring
        // matching here is a trap in any real list: asking for the link named
        // "prod-fra-platform" also returns "prod-fra-platform-2", and the query
        // fails with "found 2 elements" long after the assertion was written.
        // Pass a regex (or `exact: false`) when a substring is what you want.
        return textMatches(accessibleName(node), opts.name, opts.exact ?? true, node);
      }),
  );

  const byLabel = makeQuerySet<[Matcher, TextMatchOptions?]>(
    "label text",
    getRoot,
    (root, matcher, opts) => {
      const exact = opts?.exact ?? false;
      return allElements(root).filter((node) => {
        const name = node.tagName === "LABEL" ? "" : accessibleName(node);
        const isField = ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName) || node.hasAttribute("role");
        return isField && name !== "" && textMatches(name, matcher, exact, node);
      });
    },
  );

  const byPlaceholder = makeQuerySet<[Matcher, TextMatchOptions?]>(
    "placeholder text",
    getRoot,
    (root, matcher, opts) => {
      const exact = opts?.exact ?? true;
      return allElements(root).filter((node) => {
        const ph = node.getAttribute("placeholder");
        return ph != null && textMatches(normalize(ph), matcher, exact, node);
      });
    },
  );

  const byTestId = makeQuerySet<[string]>(
    "test id",
    getRoot,
    (root, id) => Array.from(root.querySelectorAll(`[data-testid="${cssEscape(id)}"]`)),
  );

  // --- events ---
  const events: CapturedEvent[] = [];
  const builtinEvents = ["assistant-message", "route-change", "error"];
  const listening = new Set<string>();
  const listen = (type: string): void => {
    if (listening.has(type)) return;
    listening.add(type);
    el.addEventListener(type, (ev: Event) => {
      events.push({ type, detail: (ev as CustomEvent).detail, event: ev });
    });
  };
  builtinEvents.forEach(listen);
  captureEvents.forEach(listen);

  // --- interactions ---
  const fire = async (target: Element, type: string, init: EventInit = {}): Promise<void> => {
    target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init }));
    await flush();
  };

  const user: UserEvent = {
    async click(node) {
      if (typeof (node as HTMLElement).click === "function") (node as HTMLElement).click();
      else node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await flush();
    },
    async type(node, text) {
      const field = node as HTMLInputElement;
      (field as HTMLElement).focus?.();
      for (const ch of text) {
        field.value = (field.value ?? "") + ch;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      field.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    },
    async clear(node) {
      const field = node as HTMLInputElement;
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    },
    async selectOption(node, value) {
      const select = node as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    },
    async check(node) {
      const box = node as HTMLInputElement;
      if (!box.checked) box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    },
    async uncheck(node) {
      const box = node as HTMLInputElement;
      if (box.checked) box.checked = false;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    },
    async keyboard(node, key) {
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      await flush();
    },
    async hover(node) {
      node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await flush();
    },
    async unhover(node) {
      node.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await flush();
    },
    async submit(form) {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flush();
    },
  };

  const findClickable = (text: string): HTMLElement => {
    const candidates = allElements(getRoot()).filter((node) => {
      const roles = rolesOf(node);
      const isClickable = roles.includes("button") || roles.includes("link") || node.tagName === "BUTTON" || node.tagName === "A";
      return isClickable && textMatches(accessibleName(node), text, false, node);
    });
    const target = innermost(candidates)[0];
    if (!target) throw new Error(`No clickable element (button/link) with text "${text}".`);
    return target as HTMLElement;
  };

  const findField = (label: string): HTMLElement => {
    const all = allElements(getRoot()).filter((node) =>
      ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName),
    );
    const match = all.find((node) => textMatches(accessibleName(node), label, false, node));
    if (!match) throw new Error(`No form field labelled / placeheld "${label}".`);
    return match as HTMLElement;
  };

  /**
   * Map an author-written atom name onto the key the runtime actually uses.
   *
   * An exact hit wins — the entry module's atoms keep their names, and so does
   * anything a test seeded by hand. Otherwise we look for the single module-local
   * symbol whose base name matches. Two matches is a genuine ambiguity (the same
   * atom name declared in two modules), and silently picking one would make a
   * test assert against the wrong file's state, so it raises instead.
   */
  const resolveStateKey = (name: string): string => {
    const snapshot = el.serializeState();
    if (Object.prototype.hasOwnProperty.call(snapshot, name)) return name;
    const matches = Object.keys(snapshot).filter((k) => moduleLocalBaseName(k) === name);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      throw new Error(
        `State atom "${name}" is declared in more than one module (${matches.join(", ")}). ` +
          `Use screen.state.snapshot() and pick the module-local key you mean.`,
      );
    }
    return name;
  };

  /**
   * Has the program declared its reactive state yet?
   *
   * The store is empty until the first plan runs, and the plan is what declares
   * every atom — so an empty store means there is no atom for `state.set` to
   * resolve a name against. Deliberately NOT inferred from the DOM: the element
   * creates its root container synchronously on connect, so "the shadow root has
   * content" is already true before anything has been planned.
   */
  const planned = (): boolean => Object.keys(el.serializeState()).length > 0;

  const state: StateProbe = {
    get: (name) => el.serializeState()[resolveStateKey(name)],
    get planned() {
      return planned();
    },
    has: (name) =>
      Object.prototype.hasOwnProperty.call(el.serializeState(), resolveStateKey(name)),
    snapshot: () => el.serializeState(),
    set: async (name, value) => {
      // `set` is "the reactive write an onClick handler performs", and a handler
      // can only run once the program has planned. Called before that — the
      // common slip, because `render` returns before the first microtask — the
      // store is empty, so `resolveStateKey` cannot see the module-local symbol
      // (`__a5_userSearch`) the author means and hands back the bare name. The
      // write then DECLARES a new top-level atom nothing reads, the program's own
      // atom keeps its default, and the test fails somewhere else entirely. Say
      // so here instead.
      if (!planned()) {
        throw new Error(
          `screen.state.set(${JSON.stringify(name)}) ran before the program planned, so the atom does not exist yet ` +
            `and the write would silently create an unrelated one. Await screen.flush() (or a findBy* query) first, ` +
            `or seed the value with render(..., { state }) / screen.state.hydrate(...), which are designed for it.`,
        );
      }

      el.setState(resolveStateKey(name), value);
      await flush();
    },
    hydrate: async (snapshot) => {
      const mapped: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(snapshot)) mapped[resolveStateKey(name)] = value;
      el.hydrateState(mapped);
      await flush();
    },
    key: resolveStateKey,
  };

  const screen: Screen = {
    get container() { return el; },
    get shadowRoot() { return getRoot() as ShadowRoot; },
    get requests() { return fetchMock?.requests ?? []; },

    getByText: byText.getBy,
    queryByText: byText.queryBy,
    getAllByText: byText.getAllBy,
    queryAllByText: byText.queryAllBy,
    findByText: (m, o, w) => byText.findBy(m, o, w),
    findAllByText: (m, o, w) => byText.findAllBy(m, o, w),

    getByRole: byRole.getBy,
    queryByRole: byRole.queryBy,
    getAllByRole: byRole.getAllBy,
    queryAllByRole: byRole.queryAllBy,
    findByRole: (r, o, w) => byRole.findBy(r, o, w),
    findAllByRole: (r, o, w) => byRole.findAllBy(r, o, w),

    getByLabelText: byLabel.getBy,
    queryByLabelText: byLabel.queryBy,
    getAllByLabelText: byLabel.getAllBy,
    queryAllByLabelText: byLabel.queryAllBy,
    findByLabelText: (m, o, w) => byLabel.findBy(m, o, w),
    findAllByLabelText: (m, o, w) => byLabel.findAllBy(m, o, w),
    getByPlaceholderText: byPlaceholder.getBy,
    queryByPlaceholderText: byPlaceholder.queryBy,
    getAllByPlaceholderText: byPlaceholder.getAllBy,
    queryAllByPlaceholderText: byPlaceholder.queryAllBy,
    findByPlaceholderText: (m, o, w) => byPlaceholder.findBy(m, o, w),
    findAllByPlaceholderText: (m, o, w) => byPlaceholder.findAllBy(m, o, w),
    getByTestId: byTestId.getBy,
    queryByTestId: byTestId.queryBy,
    getAllByTestId: byTestId.getAllBy,
    queryAllByTestId: byTestId.queryAllBy,
    findByTestId: (id, w) => byTestId.findBy(id, w),
    findAllByTestId: (id, w) => byTestId.findAllBy(id, w),

    user,
    click: async (target) => {
      const node = typeof target === "string" ? findClickable(target) : target;
      await user.click(node);
    },
    type: async (target, text) => {
      const node = typeof target === "string" ? findField(target) : target;
      await user.type(node, text);
    },
    fireEvent: fire,

    state,
    // Resolves the author's name to the runtime key on EVERY poll, exactly as
    // `state.get` does. Reading `serializeState()[name]` raw looks equivalent and
    // is not: in a multi-file program the linker renames every non-entry module's
    // atoms (`$newUserEmail` in `lib/store.aktion` is `__a5_newUserEmail`), so the
    // raw read was `undefined` forever and the wait could only ever time out.
    // Re-resolving per poll also covers the case this function exists for — the
    // atom not being declared yet when the wait starts.
    waitForState: (name, predicate, wait) =>
      waitFor(() => {
        const value = el.serializeState()[state.key(name)];
        const ok = predicate ? predicate(value) : value != null;
        return ok ? (value as unknown) : null;
      }, wait),

    get events() { return events; },
    listen,
    emitted: (type) => (type ? events.filter((e) => e.type === type).map((e) => e.detail) : events.map((e) => e.detail)),
    lastEvent: (type) => {
      for (let i = events.length - 1; i >= 0; i -= 1) {
        if (events[i]!.type === type) return events[i]!.detail;
      }
      return undefined;
    },
    waitForEvent: async (type, wait) => {
      listen(type);
      return waitFor(() => {
        const hit = [...events].reverse().find((e) => e.type === type);
        return hit ? hit.detail : null;
      }, wait);
    },

    navigate: async (path) => { el.navigate(path); await flush(); },
    get route() { return el.route; },

    rerender: async (next) => { el.setResponse(next); await flush(); },
    appendChunk: async (chunk) => { el.appendChunk(chunk); await flush(); },
    stream: async (chunks) => {
      el.streaming = true;
      for (const chunk of chunks) { el.appendChunk(chunk); await flush(); }
      el.streaming = false;
      await flush();
    },
    setStreaming: (value) => { el.streaming = value; },
    setTheme: async (theme) => { el.setTheme(theme); await flush(); },
    flush,
    unmount: () => {
      el.remove();
      fetchMock?.restore();
      record.restoreHash?.();
      mounted.delete(record);
    },

    html: () => renderedHtml(getRoot()),
    debug: (node) => {
      // eslint-disable-next-line no-console
      console.log(node ? (node as HTMLElement).outerHTML : renderedHtml(getRoot()));
    },
  };

  return screen;
}

/**
 * Unmount every screen created since the last cleanup, restore any mocked
 * `fetch`, and put `location.hash` back where each mount found it. Call from
 * your runner's `afterEach` for isolated tests.
 */
export function cleanup(): void {
  // Newest first, so a stack of nested mounts unwinds to the outermost mount's
  // hash rather than to the innermost one's.
  for (const record of [...mounted].reverse()) {
    try { record.el.remove(); } catch { /* ignore */ }
    record.fetchMock?.restore();
    record.restoreHash?.();
    mounted.delete(record);
  }
}

/** Convenience for building a JSON `MockResult` in a `fetch` handler. */
export function json(data: unknown, status = 200): MockResult {
  return { json: data, status };
}

/* -------------------------------------------------------------------------- */
/*  Scoped queries — `within(element)` (XIV.6)                                 */
/* -------------------------------------------------------------------------- */

export interface WithinQueries {
  getByText(matcher: Matcher): HTMLElement;
  queryByText(matcher: Matcher): HTMLElement | null;
  getAllByText(matcher: Matcher): HTMLElement[];
  getByRole(role: string, options?: RoleOptions): HTMLElement;
  queryByRole(role: string, options?: RoleOptions): HTMLElement | null;
  getAllByRole(role: string, options?: RoleOptions): HTMLElement[];
  getByTestId(id: string): HTMLElement;
  queryByTestId(id: string): HTMLElement | null;
}

function scopedTextMatches(value: string, matcher: Matcher, el?: Element): boolean {
  if (typeof matcher === "string") return value.includes(matcher);
  if (matcher instanceof RegExp) return matcher.test(value);
  if (typeof matcher === "function") return Boolean(matcher(value, el ?? document.createElement("div")));
  return false;
}

/**
 * Scope Testing-Library-style queries to a subtree (XIV.6). Mirror of RTL's
 * `within(node)` — useful for asserting inside one card/row of a list without
 * matching siblings.
 */
export function within(root: Element): WithinQueries {
  const all = (): HTMLElement[] => allElements(root) as HTMLElement[];
  const byText = (matcher: Matcher): HTMLElement[] =>
    all().filter((el) => {
      // Leaf-ish match: the element's own text (excluding nested element text noise)
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      const full = contentText(el).trim();
      return scopedTextMatches(own || full, matcher, el);
    });
  const byRole = (role: string, name?: Matcher, exact = true): HTMLElement[] =>
    all().filter((el) => {
      if (!rolesOf(el).includes(role)) return false;
      if (name == null) return true;
      const accName = el.getAttribute("aria-label") ?? contentText(el).trim();
      // Exact by default, matching the unscoped `getByRole` — `within(row)` on a
      // list is precisely where a substring hit on a sibling is most confusing.
      return textMatches(accName, name, exact, el);
    });
  return {
    getByText: (m) => { const r = byText(m); if (!r[0]) throw new Error(`within: no element with text ${String(m)}`); return r[0]; },
    queryByText: (m) => byText(m)[0] ?? null,
    getAllByText: (m) => byText(m),
    getByRole: (role, o) => { const r = byRole(role, o?.name, o?.exact); if (!r[0]) throw new Error(`within: no [role=${role}]`); return r[0]; },
    queryByRole: (role, o) => byRole(role, o?.name, o?.exact)[0] ?? null,
    getAllByRole: (role, o) => byRole(role, o?.name, o?.exact),
    getByTestId: (id) => { const el = root.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (!el) throw new Error(`within: no [data-testid=${id}]`); return el; },
    queryByTestId: (id) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`),
  };
}

/* -------------------------------------------------------------------------- */
/*  Accessibility audit — `axe(root)` (XIV.6)                                  */
/* -------------------------------------------------------------------------- */

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
export function axe(root: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const desc = (el: Element): string => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/)[0]}` : ""}`;
  const push = (rule: string, message: string, el: Element): void => { violations.push({ rule, message, element: desc(el) }); };
  const byId = (id: string): Element | null => root.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`);
  /** Resolve `aria-labelledby` to the concatenated text of EXISTING targets. */
  const labelledByText = (el: Element): string => {
    const refs = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    return refs.map((id) => byId(id)?.textContent ?? "").join(" ").trim();
  };

  for (const img of Array.from(root.querySelectorAll("img"))) {
    if (!img.hasAttribute("alt")) push("img-alt", "Image is missing an alt attribute", img);
  }
  // Standalone SVGs need a label unless explicitly decorative.
  for (const svg of Array.from(root.querySelectorAll("svg"))) {
    if (svg.getAttribute("aria-hidden") === "true" || svg.getAttribute("role") === "presentation") continue;
    if (svg.closest("button, a, [role=button]")) continue; // judged via its control's name
    const labelled = (svg.getAttribute("aria-label") ?? "").trim()
      || (svg.querySelector("title")?.textContent ?? "").trim()
      || labelledByText(svg);
    if (!labelled) push("svg-name", "SVG has no accessible label (add aria-label, a <title>, or aria-hidden=\"true\")", svg);
  }
  for (const btn of Array.from(root.querySelectorAll("button, [role=button]"))) {
    const name = (btn.getAttribute("aria-label") ?? "").trim()
      || labelledByText(btn)
      || (btn.textContent ?? "").trim();
    // An icon-only button passes only when the icon itself carries a label.
    const labelledIcon = btn.querySelector("img[alt], svg[aria-label], svg title");
    if (!name && !labelledIcon) push("button-name", "Button has no accessible name", btn);
  }
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    const name = (a.getAttribute("aria-label") ?? "").trim()
      || labelledByText(a)
      || (a.textContent ?? "").trim();
    if (!name && !a.querySelector("img[alt], svg[aria-label], svg title")) push("link-name", "Link has no accessible name", a);
  }
  for (const input of Array.from(root.querySelectorAll("input, select, textarea"))) {
    const type = (input as HTMLInputElement).type;
    if (type === "hidden") continue;
    const id = input.getAttribute("id");
    // `aria-labelledby` only counts when the referenced element exists.
    const hasLabel = Boolean((input.getAttribute("aria-label") ?? "").trim() || labelledByText(input) ||
      (id && root.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`)) || input.closest("label"));
    if (!hasLabel) push("label", "Form control has no associated label", input);
  }
  const seen = new Set<string>();
  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id")!;
    if (seen.has(id)) push("duplicate-id", `Duplicate id "${id}"`, el);
    seen.add(id);
  }
  for (const el of Array.from(root.querySelectorAll("[tabindex]"))) {
    const ti = Number(el.getAttribute("tabindex"));
    if (Number.isFinite(ti) && ti > 0) push("tabindex", `Positive tabindex (${ti}) disrupts tab order`, el);
  }
  return violations;
}
