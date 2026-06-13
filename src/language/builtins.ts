/**
 * Catalog of Aktion's `$`-prefixed builtins — the single source of truth for
 * editor tooling (completions, hover, semantic highlighting, the TextMate
 * grammar generator, and signature help).
 *
 * Aktion's runtime "builtins" are all `$`-prefixed forms. Some are hooks
 * (`$state`, `$memo`, …), some are reactive factories (`$store`, `$http`, …),
 * some register the app / router / theme, and some resolve to a namespace
 * object (`$util.format(...)`, `$storage.local`, …). The legacy `@`-builtin
 * catalog was removed in 0.5; programs use native JavaScript or `$util`.
 *
 * Keep this list in sync with the runtime dispatch in
 * `src/runtime/evaluator.ts` (`evaluateInvoke` for `StateRef` callees) and the
 * namespace implementations in `src/runtime/*`. Anything added here is
 * automatically surfaced to every editor that consumes `aktion-runtime/language`.
 */

export type BuiltinCategory =
  | "hook"
  | "effect"
  | "data"
  | "app"
  | "routing"
  | "theme"
  | "event"
  | "namespace";

export interface BuiltinEntry {
  /** Name WITHOUT the leading `$` sigil (e.g. `"state"`, `"util"`). */
  name: string;
  /** Reference form WITH the sigil (e.g. `"$state"`). */
  sigil: string;
  category: BuiltinCategory;
  /** Completion label / signature skeleton, e.g. `"$state(initial)"`. */
  signature: string;
  /** One-line description for hover popups and completion detail. */
  summary: string;
  /**
   * True when the name resolves to a namespace object whose members are
   * reached via `.` (`$util.format`, `$storage.local`, `$toast.show`, …).
   * Namespaces are NOT necessarily callable.
   */
  namespace?: boolean;
}

/**
 * Every `$`-prefixed builtin Aktion exposes, grouped loosely by purpose.
 * The order is the order editors surface them in the after-`$` completion
 * list, so the most common authoring tools (hooks, effects) come first.
 */
export const builtinCatalog: readonly BuiltinEntry[] = [
  // Hooks (per-instance state — mirror React's use* family).
  {
    name: "state",
    sigil: "$state",
    category: "hook",
    signature: "$state(initial)",
    summary: "Hook: per-instance state → [value, setValue] (like React's useState).",
  },
  {
    name: "memo",
    sigil: "$memo",
    category: "hook",
    signature: "$memo(() => value, [deps])",
    summary: "Hook: value recomputed only when a dependency changes (like useMemo).",
  },
  {
    name: "ref",
    sigil: "$ref",
    category: "hook",
    signature: "$ref(initial)",
    summary: "Hook: stable { current } box; writing .current does not re-render (like useRef).",
  },
  {
    name: "reducer",
    sigil: "$reducer",
    category: "hook",
    signature: "$reducer((state, action) => next, initial)",
    summary: "Hook: [state, dispatch] (like useReducer).",
  },
  {
    name: "id",
    sigil: "$id",
    category: "hook",
    signature: "$id(prefix?)",
    summary: "Hook: stable unique id per component instance (like useId).",
  },

  // Effects + reactivity.
  {
    name: "effect",
    sigil: "$effect",
    category: "effect",
    signature: "$effect(() => { … }, [deps])",
    summary: "Declarative side effect; deps mix $state, \"mount\"/\"unmount\", \"every(N)\", \"debounce(N)\".",
  },
  {
    name: "optimistic",
    sigil: "$optimistic",
    category: "effect",
    signature: "$optimistic(() => { … })",
    summary: "Run optimistic writes; auto-rolls back state if the callback throws or rejects.",
  },
  {
    name: "store",
    sigil: "$store",
    category: "effect",
    signature: "$store({ ...state, ...methods })",
    summary: "Global store: shared state + actions (like Zustand/Pinia). persist: \"key\" mirrors data to localStorage (persistIn: \"session\" for sessionStorage); history: true|depth adds undo()/redo()/clearHistory() + reactive canUndo/canRedo.",
  },
  {
    name: "form",
    sigil: "$form",
    category: "effect",
    signature: "$form({ values, rules, onSubmit })",
    summary: "Reactive form engine: values/errors/touched/dirty/valid/submitting/validating + field()/validate()/touch()/setField()/submit() (alias handleSubmit())/reset(). Async rules ($util.rules.asyncCustom) are awaited before submit; submitting stays true until an async onSubmit settles.",
  },

  // Data layer.
  {
    name: "http",
    sigil: "$http",
    category: "data",
    signature: "$http({ url, method, … })",
    summary: "Reactive HTTP resource bag — { data, loading, error, refetch }.",
  },
  {
    name: "query",
    sigil: "$query",
    category: "data",
    signature: "$query({ url, key, ttl })",
    summary: "Cached + deduplicated HTTP read. Polling via refetchInterval/refetchOnFocus/refetchOnReconnect; pagination via infinite: { param, limit, mode } (→ .loadMore()/.hasMore/.loadingMore); GraphQL via gql + variables.",
  },
  {
    name: "mutation",
    sigil: "$mutation",
    category: "data",
    signature: "$mutation({ url, method })",
    summary: "Deferred write; fires on .mutate(overrides?). optimistic: (vars) => {…} applies instantly (auto-rollback on failure); invalidates: [keys] refetches matching cached queries; gql for GraphQL.",
  },
  {
    name: "socket",
    sigil: "$socket",
    category: "data",
    signature: "$socket({ url, reconnect? })",
    summary: "Reactive WebSocket — { status: \"connecting\"|\"open\"|\"closed\", connected, last, messages, attempts, send, close }. reconnect: true|n retries with exponential backoff; sends queue while connecting and flush on open; close() stops for good.",
  },
  {
    name: "sse",
    sigil: "$sse",
    category: "data",
    signature: "$sse({ url, event })",
    summary: "Reactive Server-Sent Events stream — { status, connected, last, messages, close }. EventSource reconnects natively (status reads \"connecting\" while it does).",
  },
  {
    name: "script",
    sigil: "$script",
    category: "data",
    signature: "$script({ src, global? })",
    summary: "Load an external UMD/ESM script or stylesheet once → reactive { ready, loading, error, value }. `global` reads window[global] into `value` (e.g. window.Stripe). De-duplicated per src across the app; gate a third-party widget on `.ready`.",
  },
  {
    name: "head",
    sigil: "$head",
    category: "app",
    signature: "$head({ title, meta, og, twitter, link, jsonLd })",
    summary: "Reactive document head: title, meta description, canonical/alternate links, Open Graph + Twitter cards, JSON-LD, <html> attrs. Per-route calls compose; renderToString emits the resolved <head> so SSR pages are crawlable.",
  },

  // App / routing / theming / events.
  {
    name: "app",
    sigil: "$app",
    category: "app",
    signature: "$app(root)",
    summary: "Register the root of the rendered UI tree — every program needs one.",
  },
  {
    name: "router",
    sigil: "$router",
    category: "routing",
    signature: "$router({ '/': Home(), default: NotFound() })",
    summary: "Outlet-first router: maps path patterns to component trees.",
  },
  {
    name: "theme",
    sigil: "$theme",
    category: "theme",
    signature: "$theme({ colors, radius, font, … })",
    summary: "In-script theme override merged on top of the active base theme. Structured groups: colors/radius/font/spacing/shadows/gradients/zIndex/motion/fonts (web-font import)/icons (custom inline SVG), plus name/direction metadata.",
  },
  {
    name: "emit",
    sigil: "$emit",
    category: "event",
    signature: "$emit('name', detail)",
    summary: "Dispatch a CustomEvent from the host element.",
  },

  // Namespaces (members reached via `.`).
  {
    name: "util",
    sigil: "$util",
    category: "namespace",
    signature: "$util",
    summary: "Runtime helper + reactive-environment namespace: data helpers ($util.format/.sum/.range/.groupBy…), formatting ($util.slugify/.truncate/.initials/.currency/.percent/.bytes/.relativeTime), misc ($util.copy — async, resolves true on real success —/.sleep/.uuid/.debounceFn/.throttleFn — leading+trailing), styling ($util.style.cx/.gradient/.alpha/.clamp/.token/.toStyle), validators ($util.rules.required/.email/.url/.min/.max/.minLength/.maxLength/.pattern/.oneOf/.matches/.custom/.asyncCustom + .validate/.validateAll), computed ($util.derived(fn)), hooks ($util.onError/.onNavigate/.onRequest/.onResponse/.invalidate), reactive env ($util.scroll/.viewport/.breakpoint/.media/.mouse/.url incl. .url.setQuery/.removeQuery), device ($util.vibrate/.share/.readClipboard/.geolocate/.isOnline/.deviceType/.nativeShell/.isNativeApp), and platform ($util.worker/.registerServiceWorker/.webManifest).",
    namespace: true,
  },
  {
    name: "storage",
    sigil: "$storage",
    category: "namespace",
    signature: "$storage",
    summary: "Persistent storage namespace ($storage.local, $storage.session, …).",
    namespace: true,
  },
  {
    name: "console",
    sigil: "$console",
    category: "namespace",
    signature: "$console",
    summary: "Console namespace ($console.log, $console.warn, …).",
    namespace: true,
  },
  {
    name: "toast",
    sigil: "$toast",
    category: "namespace",
    signature: "$toast",
    summary: "Imperative toasts: $toast.show/.success/.error/.dismiss; reactive .items.",
    namespace: true,
  },
  {
    name: "dom",
    sigil: "$dom",
    category: "namespace",
    signature: "$dom",
    summary: "Managed DOM-observer namespace: $dom.onResize(node, cb) / .onIntersect(node, cb, opts?) / .onMutation(node, cb, opts?) (auto-disposed on replan) and .measure(node) → { rect, scroll, viewport }. Pair with Mount/OnMount node refs.",
    namespace: true,
  },
  {
    name: "i18n",
    sigil: "$i18n",
    category: "data",
    signature: "$i18n({ translations, … })",
    summary: "Translation bundle → { t, setCurrentLanguage, getCurrentLanguage }.",
  },
];

/** Bare builtin names (without the `$` sigil), for O(1) membership tests. */
export const builtinNames: ReadonlySet<string> = new Set(
  builtinCatalog.map((b) => b.name),
);

/** Catalog indexed by the bare name (`"state"`, `"util"`, …). */
export const builtinsByName: Readonly<Record<string, BuiltinEntry>> = Object.freeze(
  Object.fromEntries(builtinCatalog.map((b) => [b.name, b])),
);

/**
 * Resolve a `$`-prefixed builtin by its bare name (the value carried on a
 * `StateIdentifier` token, e.g. `"state"` for `$state`). Returns `undefined`
 * for user atoms / hooks that are not part of the runtime catalog.
 */
export function findBuiltin(bareName: string): BuiltinEntry | undefined {
  return builtinsByName[bareName];
}

/** True when `bareName` (no `$`) names a runtime builtin. */
export function isBuiltinName(bareName: string): boolean {
  return builtinNames.has(bareName);
}
