/**
 * Aktion DevTools — wire protocol.
 *
 * The runtime ("backend") and the DevTools UI ("frontend") only ever talk
 * through the structured events and record shapes declared here, exactly like
 * the React/Vue DevTools split. Keeping the protocol in its own
 * dependency-free module means:
 *
 *   - the runtime can emit events without pulling in any UI code, and
 *   - a future *browser-extension* frontend (running in a different realm,
 *     behind `postMessage`) can re-use the identical, JSON-serialisable
 *     shapes without importing the runtime.
 *
 * Every payload is plain data — no class instances, no DOM nodes, no
 * functions — so an event survives `structuredClone` / `JSON` transport.
 * The one deliberate exception is {@link DevtoolsAppRecord} in `hook.ts`,
 * which is a live in-page handle (it holds the host element) and is therefore
 * only usable by an in-page frontend.
 */

/** Discriminator shared by every event flowing over the hook. */
export type DevtoolsEventKind =
  | "commit"
  | "state"
  | "effect"
  | "network"
  | "route"
  | "emit"
  | "log"
  | "error";

/* -------------------------------------------------------------------------- */
/*  Values                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A value rendered safe for transport: the runtime never sends a live object
 * over the protocol (a DOM node, a class instance, or a cyclic graph would
 * break `structuredClone` and could keep a torn-down subtree alive).
 * `preview` is the display string; `json` carries a round-trippable
 * representation when — and only when — the value is genuinely serialisable,
 * which is what makes a DevTools edit safe to apply.
 */
export interface DevtoolsValue {
  /** `string`, `number`, `boolean`, `null`, `undefined`, `array`, `object`, `function`, `resource`, `store`, `node`. */
  type: string;
  /** Short display form (`"Ada"`, `42`, `Array(3)`, `{ a, b, … }`, `ƒ ()`). */
  preview: string;
  /** JSON text for editable values; absent when the value cannot round-trip. */
  json?: string;
  /** Element count for arrays / key count for objects. */
  size?: number;
}

/* -------------------------------------------------------------------------- */
/*  Render profiler                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What happened to one component instance during a commit.
 *   - `mount`  — first time this instance appeared in the tree.
 *   - `update` — re-evaluated (its args or a `$state` dep it reads changed,
 *                or the commit was a forced full render).
 *   - `memo`   — skipped via per-instance memoization; its cached value was
 *                reused and its body did NOT run.
 */
export type RenderPhase = "mount" | "update" | "memo";

/** Whether a component is a user `function Foo()` or a built-in library one. */
export type ComponentKind = "user" | "library";

/** One declared prop / argument of a component instance. */
export interface ComponentPropRecord {
  /** Declared prop name (library components) or parameter name (user ones). */
  name: string;
  /** The value the instance received this commit. */
  value: DevtoolsValue;
  /**
   * Reactive path the argument was bound to (`count`, `form.email`), when the
   * author wrote `$`-bound syntax. Editing such a prop should write the atom,
   * not install an override — the atom is the source of truth.
   */
  stateRef?: string;
  /** True when the prop came from a DevTools override rather than the program. */
  overridden?: boolean;
}

/** One component instance's contribution to a single commit. */
export interface ComponentRenderRecord {
  /** Stable per-instance key derived from the render path. */
  instanceKey: string;
  /** Display name (`Counter`, `Button`, …). */
  name: string;
  /** `user` (`function Foo()`) or `library` (built-in primitive). */
  kind: ComponentKind;
  /** Render phase for this commit. */
  phase: RenderPhase;
  /**
   * Self time in milliseconds.
   *   - user components: body-evaluation time only (children excluded).
   *   - library components: inclusive of synchronously-rendered children
   *     (their render function builds the subtree in one call).
   * Zero for `memo` (skipped) records.
   */
  selfTime: number;
  /** Nesting depth in the render tree — drives flamegraph indentation. */
  depth: number;
  /** For user components: the `$state` paths this body read (its memo deps). */
  deps?: string[];
  /** Human-readable reason the instance rendered (or was skipped). */
  reason: string;
  /** Source position of the call site in the program (1-based line). */
  source?: { line: number; column: number };
  /** The author's `key:` value, when one was passed. */
  explicitKey?: string;
  /**
   * Props / arguments this instance received. Only collected while a frontend
   * is attached (the profiler is dormant otherwise), and capped so a table
   * with 200 columns can't turn one commit into a megabyte of payload.
   */
  props?: ComponentPropRecord[];
}

/** A single committed render pass over the whole program tree. */
export interface CommitRecord {
  kind: "commit";
  appId: string;
  /** Monotonic sequence number within the app (0 = initial mount). */
  commitId: number;
  /** Timestamp (ms, from `nowMs()`) when the commit started. */
  startTime: number;
  /** Total wall-clock time of the commit (evaluate → render → morph), in ms. */
  duration: number;
  /** Reactive `$state` paths that triggered this commit (empty if forced). */
  changedPaths: string[];
  /** True when memoization was disabled and the whole tree re-evaluated. */
  fullRender: boolean;
  /** True for the very first commit of the program (initial mount). */
  initial: boolean;
  /** Per-instance records (both rendered and memoized), in render order. */
  components: ComponentRenderRecord[];
  /** Number of instances that actually rendered (phase !== "memo"). */
  rendered: number;
  /** Number of instances skipped via memoization. */
  memoized: number;
  /** DOM nodes under the render root after the commit (0 when unmeasured). */
  domNodes?: number;
  /** Time spent in the DOM reconciler (`morphChildren`) only, in ms. */
  morphTime?: number;
  /**
   * State snapshot immediately after the commit, for time-travel. Only
   * captured while a frontend is attached, and only for snapshots that
   * round-trip through `structuredClone`/JSON.
   */
  snapshot?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*  State inspector                                                            */
/* -------------------------------------------------------------------------- */

/** A reactive-state change notification (one per state-store flush). */
export interface StateEvent {
  kind: "state";
  appId: string;
  /** Full reactive `$state` snapshot after the change. */
  snapshot: Record<string, unknown>;
  /** Dotted paths changed in this flush (`count`, `user.name`, …). */
  changedPaths: string[];
  /** Timestamp (ms, from `nowMs()`). */
  time: number;
  /**
   * Where the write came from, when the runtime can attribute it:
   * `handler`, `effect`, `devtools`, `hydrate`, `render`, or `initial`.
   */
  origin?: string;
}

/** Static description of one declared reactive atom. */
export interface StateAtomMeta {
  /** Atom name as it appears in `$state` (`count`, `__a2_filter`, …). */
  name: string;
  /** The name the author wrote, for a module-scoped atom that was renamed. */
  authored?: string;
  /** Owning module path for a linked multi-file program. */
  module?: string;
  /** True for runtime-owned atoms (`route`, `__store_*`, `__form_*`). */
  reserved: boolean;
  /** True when a `$name = expr` initialiser makes this a derived atom. */
  computed: boolean;
  /** Source position of the declaration. */
  source?: { line: number; column: number };
}

/* -------------------------------------------------------------------------- */
/*  Effect timeline                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Effect lifecycle phases.
 *   - `mount`   — the declaration was registered (subscriptions/intervals wired).
 *   - `run`     — the effect body executed.
 *   - `cleanup` — registered `cleanup(fn)` handlers fired (before a re-run or teardown).
 *   - `unmount` — the declaration was torn down (instance left the tree / replan).
 *   - `error`   — the body threw.
 */
export type EffectPhase = "mount" | "run" | "cleanup" | "unmount" | "error";

/**
 * The runtime-facing half of an effect event — everything the
 * {@link EffectRunner} can compute on its own. The host element stamps on
 * `appId` + `time` to produce the full {@link EffectEvent}.
 */
export interface EffectEventPayload {
  /** Mounted-effect key (`__effect_L3_C1`, or `<instanceKey>::<name>`). */
  effectKey: string;
  /** Friendly label (`effect @ L3:C1`). */
  label: string;
  /** Owning component instance key, or `null` for a top-level effect. */
  instanceKey: string | null;
  phase: EffectPhase;
  /** Why this happened: `mount`, `state:count`, `every(1000)`, `cleanup`, `unmount`. */
  reason: string;
  /** Declared trigger summary (`["mount", $count]`). */
  triggers: string;
  /** Body run time in ms (only for `run`). */
  duration?: number;
  /** Number of cleanup handlers fired (only for `cleanup`). */
  cleanups?: number;
  /** Error message (only for `error`). */
  error?: string;
}

/** A timeline-ready effect event. */
export interface EffectEvent extends EffectEventPayload {
  kind: "effect";
  appId: string;
  /** Timestamp (ms, from `nowMs()`). */
  time: number;
}

/** Live summary of one mounted effect, for the effect explorer. */
export interface EffectInfo {
  effectKey: string;
  label: string;
  instanceKey: string | null;
  /** Declared trigger summary (`["mount", $count]`). */
  triggers: string;
  /** Reactive atoms this effect subscribes to. */
  stateDeps: string[];
  /** Interval periods (ms) the effect declared via `on:every(N)`. */
  intervals: number[];
  /** Number of `cleanup(fn)` handlers currently registered. */
  cleanups: number;
  /** Source position of the declaration. */
  source?: { line: number; column: number };
}

/* -------------------------------------------------------------------------- */
/*  Network inspector                                                          */
/* -------------------------------------------------------------------------- */

/** Lifecycle of one HTTP request the runtime issued. */
export type NetworkPhase = "start" | "success" | "error" | "mock" | "blocked";

/** One HTTP request/response event from the Aktion HTTP layer. */
export interface NetworkEvent {
  kind: "network";
  appId: string;
  /** Correlates `start` with its terminal event. */
  requestId: string;
  phase: NetworkPhase;
  method: string;
  url: string;
  /** Timestamp (ms, from `nowMs()`). */
  time: number;
  /** Request headers as sent (after interceptors). */
  requestHeaders?: Record<string, string>;
  /** Request body preview (truncated). */
  requestBody?: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  /** Response body preview (truncated). */
  responseBody?: string;
  /** Response body length in bytes/characters, before truncation. */
  responseSize?: number;
  /** Wall-clock duration in ms (terminal events only). */
  duration?: number;
  /** Error message for `phase: "error"`. */
  error?: string;
  /** Name of the DevTools rule that mocked / blocked / delayed this request. */
  rule?: string;
  /** Extra latency (ms) a DevTools rule injected. */
  injectedDelay?: number;
}

/**
 * A DevTools-installed request rule. Rules are evaluated in order; the first
 * whose `pattern` matches the request URL (substring, or a `*` glob) wins.
 * This is the network half of the testing toolkit — reproduce a 500, a slow
 * endpoint, or an offline device without touching the program.
 */
export interface NetworkRule {
  /** Stable id so the UI can edit / remove one rule. */
  id: string;
  /** Human label shown on the matched request. */
  label?: string;
  /** URL substring, or a glob with `*` wildcards. Empty matches everything. */
  pattern: string;
  /** Restrict to one method (`GET`); omit for any. */
  method?: string;
  /** Off rules are kept in the list but skipped. */
  enabled: boolean;
  /** What the rule does when it matches. */
  action: "delay" | "mock" | "fail" | "offline";
  /** Extra latency in ms (`delay`, and applied before a `mock`). */
  delayMs?: number;
  /** Response status for `mock` (default 200). */
  status?: number;
  /** Response body for `mock` — JSON text, or a plain string. */
  body?: string;
  /** Response headers for `mock`. */
  headers?: Record<string, string>;
  /** Error message for `fail` / `offline`. */
  message?: string;
}

/** Live snapshot of one `$query` / `Http({...})` resource. */
export interface QueryInfo {
  /** Cache key the resource is stored under. */
  key: string;
  /** `idle` | `loading` | `data` | `error` | `stale`. */
  state: string;
  loading: boolean;
  /** HTTP status of the last response, when known. */
  status?: number;
  /** Preview of the resolved data. */
  data: DevtoolsValue;
  /** Error preview, when the resource failed. */
  error?: DevtoolsValue;
  /** `lastUpdated` timestamp (ms since epoch) reported by the resource. */
  lastUpdated?: number;
  /** True for an infinite/paginated query. */
  infinite?: boolean;
  page?: number;
  hasMore?: boolean;
}

/** Live snapshot of one `Store({...})` / `$form({...})` handle. */
export interface StoreInfo {
  /** Backing reactive atom (`__store_3_10`). */
  atom: string;
  /** `store` or `form`. */
  flavour: string;
  /** Declaration site, when known. */
  source?: { line: number; column: number };
  /** Method names the handle exposes. */
  methods: string[];
  /** Current state object. */
  value: DevtoolsValue;
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

/** A navigation event. */
export interface RouteEvent {
  kind: "route";
  appId: string;
  /** Path before the navigation (`"/"`). */
  from: string;
  /** Path after the navigation. */
  to: string;
  /** Matched route pattern, when a `match`/`Route` arm claimed it. */
  pattern?: string | null;
  /** Extracted params for the matched pattern. */
  params?: Record<string, string>;
  /** `hash` | `history` | `initial` | `programmatic` — how it was triggered. */
  source?: string;
  /** Timestamp (ms, from `nowMs()`). */
  time: number;
}

/** Current router state. */
export interface RouteInfo {
  path: string;
  pattern: string | null;
  params: Record<string, string>;
  /** `hash` or `history`. */
  mode: string;
  basePath?: string;
  /** True when the program installed a navigation guard. */
  guarded: boolean;
  /** Route patterns the program declares, when statically discoverable. */
  declared: string[];
}

/* -------------------------------------------------------------------------- */
/*  Custom events, logs, errors                                                */
/* -------------------------------------------------------------------------- */

/** A custom event the program dispatched with `emit("name", detail)`. */
export interface EmitEvent {
  kind: "emit";
  appId: string;
  /** Event name as dispatched. */
  name: string;
  /** Preview of the detail payload. */
  detail: DevtoolsValue;
  time: number;
}

/** Console severity. */
export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

/** One console line produced by the program or the runtime. */
export interface LogEvent {
  kind: "log";
  appId: string;
  level: LogLevel;
  /** Rendered arguments, one entry per argument. */
  args: string[];
  /** `program` (author `console.log`) or `runtime` (`[aktion] …`). */
  origin: string;
  /** Repeat count when consecutive identical lines are collapsed. */
  count?: number;
  time: number;
}

/** A runtime error the app survived (render throw, handler throw, budget abort). */
export interface ErrorEvent {
  kind: "error";
  appId: string;
  /** `render`, `handler`, `effect`, `plan`, `budget`, `http`. */
  phase: string;
  message: string;
  /** Component / effect / atom the failure is attributed to. */
  subject?: string;
  stack?: string;
  time: number;
}

/* -------------------------------------------------------------------------- */
/*  Inspector (component tree + instance detail)                                */
/* -------------------------------------------------------------------------- */

/** One node of the live component-instance tree. */
export interface InstanceNode {
  instanceKey: string;
  name: string;
  kind: ComponentKind;
  /** Parent instance key, or `null` at the root. */
  parentKey: string | null;
  depth: number;
  /** Last observed render phase. */
  phase: RenderPhase;
  /** Self time of the last render, in ms. */
  selfTime: number;
  /** Source position of the call site. */
  source?: { line: number; column: number };
  /** The author's `key:` value, when one was passed. */
  explicitKey?: string;
  /** True when a DOM node carrying this instance's tag is in the document. */
  mounted?: boolean;
  /** Number of props the instance received. */
  propCount?: number;
  /** Cumulative renders observed in the session. */
  renders?: number;
}

/** One editable per-instance hook cell (`$state`, `$memo`, `$ref`, …). */
export interface InstanceHookRecord {
  /** Slot index — hooks are matched by call order (the rules of hooks). */
  slot: number;
  /** `state` | `memo` | `ref` | `reducer` | `id`. */
  kind: string;
  value: DevtoolsValue;
  /** True when DevTools can write this slot back. */
  editable: boolean;
}

/** One `useInstanceState` slot — a library component's internal UI state. */
export interface InstanceUiStateRecord {
  /** Slot key as the component declared it (`activeTab`, `open`, `sort`). */
  key: string;
  value: DevtoolsValue;
  editable: boolean;
}

/** Everything the inspector knows about one component instance. */
export interface InstanceDetail {
  instanceKey: string;
  name: string;
  kind: ComponentKind;
  parentKey: string | null;
  depth: number;
  source?: { line: number; column: number };
  explicitKey?: string;
  /** Props / arguments as of the last render. */
  props: ComponentPropRecord[];
  /** Per-instance `$state` / `$memo` cells (user components). */
  hooks: InstanceHookRecord[];
  /** `useInstanceState` slots (library components' internal UI state). */
  uiState: InstanceUiStateRecord[];
  /** Reactive paths the body read last render (its memo deps). */
  deps: string[];
  /** Effect keys mounted under this instance. */
  effects: string[];
  /** Ancestor instance keys, root first. */
  ancestors: string[];
  /** Whether a DOM node tagged with this instance is currently in the tree. */
  mounted: boolean;
  /** Outer HTML of the instance's root DOM node, truncated. */
  html?: string;
  /** Number of DOM nodes in the instance's subtree. */
  domNodes?: number;
  /** Active DevTools prop overrides for this instance. */
  overrides?: Array<{ prop: string; value: DevtoolsValue }>;
}

/* -------------------------------------------------------------------------- */
/*  Diagnostics, theme, stats, evaluation                                      */
/* -------------------------------------------------------------------------- */

/** One parse / schema diagnostic from the last plan. */
export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  /** `parse`, `schema`, `effect`, `src`, or `budget`. */
  kind: string;
  /** `error` or `warning`. */
  severity: string;
}

/** One top-level declaration in a program's outline. */
export interface OutlineEntry {
  /** `component`, `effect`, `action`, `hook`, `state`, `binding`, `import`. */
  kind: string;
  name: string;
  line: number;
  column: number;
  /** Exported from its module (multi-file programs). */
  exported?: boolean;
}

/** Result of analysing a program's text without mounting it. */
export interface ProgramAnalysis {
  diagnostics: Diagnostic[];
  outline: OutlineEntry[];
  /** True when the text parses and validates with no errors. */
  ok: boolean;
}

/** Current theme state, for the token editor. */
export interface ThemeInfo {
  /** Resolved theme name, or `custom` for a token map. */
  name: string;
  /** Every resolved token, name → CSS value. */
  tokens: Record<string, string>;
  /** Token names the program's `$theme({...})` block currently overrides. */
  scriptOverrides: string[];
  /** Token names DevTools is currently overriding. */
  devtoolsOverrides: string[];
  /** Built-in theme names available to switch to. */
  available: string[];
}

/** Cheap runtime counters for the overview / perf tabs. */
export interface AppStats {
  /** DOM nodes under the render root. */
  domNodes: number;
  /** Elements under the render root. */
  elements: number;
  /** Live component instances in the last commit. */
  instances: number;
  /** Reactive atoms declared. */
  atoms: number;
  /** Mounted effects. */
  effects: number;
  /** Cached `$query` resources. */
  queries: number;
  /** `Store` / `$form` handles. */
  stores: number;
  /** Program size in characters. */
  programBytes: number;
  /** Commits since mount. */
  commits: number;
  /** `performance.memory.usedJSHeapSize` in bytes, when the browser exposes it. */
  heapBytes?: number;
}

/** Result of evaluating an expression against the live program scope. */
export interface EvalResult {
  ok: boolean;
  value?: DevtoolsValue;
  /** Full text of the result, un-truncated, for large values. */
  text?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */

/** The full union of events the hook fans out to DevTools frontends. */
export type DevtoolsEvent =
  | CommitRecord
  | StateEvent
  | EffectEvent
  | NetworkEvent
  | RouteEvent
  | EmitEvent
  | LogEvent
  | ErrorEvent;
