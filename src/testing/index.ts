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

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** The public surface of the `<aktion-app>` element this library drives. */
export type AktionApp = HTMLElement & {
  setResponse(text: string): void;
  appendChunk(chunk: string): void;
  serializeState(): Record<string, unknown>;
  hydrateState(snapshot: Record<string, unknown>): void;
  setTheme(theme: ThemeInput): void;
  registerComponents(components: ComponentSpec[], rootName?: string): void;
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
      const empty = value == null || (Array.isArray(value) && value.length === 0);
      if (!empty) return value;
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

/** Implicit ARIA roles for the handful of elements Aktion renders most. */
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
      return ["combobox", "listbox"];
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return ["heading"];
    case "img":
      return ["img"];
    case "ul": case "ol":
      return ["list"];
    case "li":
      return ["listitem"];
    case "table":
      return ["table"];
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

function rolesOf(el: Element): string[] {
  const explicit = el.getAttribute("role");
  return explicit ? [explicit] : implicitRoles(el);
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

  return normalize(el.textContent);
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

function allElements(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll("*"));
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
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
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

  getByRole(role: string, options?: { name?: Matcher }): HTMLElement;
  queryByRole(role: string, options?: { name?: Matcher }): HTMLElement | null;
  getAllByRole(role: string, options?: { name?: Matcher }): HTMLElement[];
  findByRole(role: string, options?: { name?: Matcher }, wait?: WaitForOptions): Promise<HTMLElement>;

  getByLabelText(matcher: Matcher, options?: TextMatchOptions): HTMLElement;
  queryByLabelText(matcher: Matcher, options?: TextMatchOptions): HTMLElement | null;

  getByPlaceholderText(matcher: Matcher, options?: TextMatchOptions): HTMLElement;
  queryByPlaceholderText(matcher: Matcher, options?: TextMatchOptions): HTMLElement | null;

  getByTestId(id: string): HTMLElement;
  queryByTestId(id: string): HTMLElement | null;

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

export interface StateProbe {
  /** Read one atom from the live snapshot (`serializeState()[name]`). */
  get(name: string): unknown;
  /** Whether the atom currently exists. */
  has(name: string): boolean;
  /** The full reactive snapshot — ideal for `toMatchSnapshot()`. */
  snapshot(): Record<string, unknown>;
  /** Simulate a host-side write (`hydrateState`) and re-render. */
  set(name: string, value: unknown): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  render()                                                                   */
/* -------------------------------------------------------------------------- */

const mounted = new Set<{ el: HTMLElement; fetchMock: InstalledFetch | null }>();

/**
 * Mount an Aktion program in a real `<aktion-app>` and return a `Screen`
 * scoped to its shadow root. Renders synchronously enough that the returned
 * screen's `getBy*` queries see the first paint; use `findBy*` / `waitFor`
 * for anything that resolves after an effect, timer, or `$http(...)` request.
 */
export function render(program: string, options: RenderOptions = {}): Screen {
  defineElement(); // idempotent — registers <aktion-app> if not already defined.

  const fetchMock = options.fetch ? installFetchMock(options.fetch) : null;

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
  // Seed state so the very first plan sees injected props / spies.
  if (options.state) el.hydrateState(options.state);

  el.setResponse(program);

  const record = { el, fetchMock };
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
  record: { el: HTMLElement; fetchMock: InstalledFetch | null },
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
        textMatches(normalize(node.textContent), matcher, exact, node),
      );
      return innermost(hits);
    },
  );

  const byRole = makeQuerySet<[string, { name?: Matcher }?]>(
    "role",
    getRoot,
    (root, role, opts) =>
      allElements(root).filter((node) => {
        if (!rolesOf(node).includes(role)) return false;
        if (opts?.name == null) return true;
        return textMatches(accessibleName(node), opts.name, false, node);
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

  const state: StateProbe = {
    get: (name) => el.serializeState()[name],
    has: (name) => Object.prototype.hasOwnProperty.call(el.serializeState(), name),
    snapshot: () => el.serializeState(),
    set: async (name, value) => {
      el.hydrateState({ [name]: value });
      await flush();
    },
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
    findByRole: (r, o, w) => byRole.findBy(r, o, w),

    getByLabelText: byLabel.getBy,
    queryByLabelText: byLabel.queryBy,
    getByPlaceholderText: byPlaceholder.getBy,
    queryByPlaceholderText: byPlaceholder.queryBy,
    getByTestId: byTestId.getBy,
    queryByTestId: byTestId.queryBy,

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
    waitForState: (name, predicate, wait) =>
      waitFor(() => {
        const value = el.serializeState()[name];
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
      mounted.delete(record);
    },

    html: () => getRoot().firstElementChild?.outerHTML ?? Array.from(getRoot().childNodes).map((n) => (n as Element).outerHTML ?? n.textContent).join(""),
    debug: (node) => {
      // eslint-disable-next-line no-console
      console.log(node ? (node as HTMLElement).outerHTML : Array.from(getRoot().childNodes).map((n) => (n as HTMLElement).outerHTML ?? n.textContent).join("\n"));
    },
  };

  return screen;
}

/**
 * Unmount every screen created since the last cleanup and restore any mocked
 * `fetch`. Call from your runner's `afterEach` for isolated tests.
 */
export function cleanup(): void {
  for (const record of [...mounted]) {
    try { record.el.remove(); } catch { /* ignore */ }
    record.fetchMock?.restore();
    mounted.delete(record);
  }
}

/** Convenience for building a JSON `MockResult` in a `fetch` handler. */
export function json(data: unknown, status = 200): MockResult {
  return { json: data, status };
}
