/**
 * Catalog of the *members* exposed by Aktion's `$`-namespace builtins and the
 * reactive resource bags its factory builtins return — the single source of
 * truth for member-level editor tooling (completions / hover / semantic
 * highlighting / signature help after a `.`).
 *
 * The sibling `builtins.ts` catalog covers the top-level `$`-forms
 * (`$util`, `$http`, …). This file covers what comes AFTER the dot:
 *
 *   - `$util.format(...)`, `$util.style.cx(...)`, `$util.rules.required()`
 *   - `$storage.local.set(...)`, `$storage.cookies.get(...)`
 *   - `$console.log(...)`, `$toast.success(...)`
 *   - the resource bag a factory returns — `$todos.data` / `.refetch()` for
 *     `$http`, `form.values` / `.submit()` for `$form`, … — and the reserved
 *     reactive `route` handle (`route.path`, `route.navigate(...)`).
 *
 * Everything here is pure + DOM-free so the VS Code extension, the docs
 * playground, an LSP server, or any other host can consume it.
 *
 * KEEP IN SYNC with the runtime sources:
 *   - `$util`     → `src/runtime/util.ts` (`Util`) + the `$util` facade getters
 *                   in `src/runtime/evaluator.ts` + `src/runtime/namespaces-extra.ts`
 *                   (`Style` → `$util.style`, `Rules` → `$util.rules`).
 *   - `$storage`  → `src/runtime/storage.ts` (`StorageRoot`).
 *   - `$console`  → `src/runtime/console.ts` (`ConsoleNamespace`).
 *   - `$toast`    → `src/runtime/toast.ts` (`ToastManager`).
 *   - resource bags → `src/runtime/{http,realtime,effects}.ts`.
 *   - `route`     → `src/runtime/router.ts`.
 */

/** What kind of member a name resolves to (drives the editor icon). */
export type NamespaceMemberKind = "method" | "property" | "namespace";

export interface NamespaceMember {
  /**
   * Member name RELATIVE to its namespace. Nested members carry a dotted
   * path so a single flat list can describe sub-namespaces: `"style.cx"`,
   * `"rules.required"`, `"url.setQuery"`, `"local.set"`.
   */
  name: string;
  kind: NamespaceMemberKind;
  /** Signature skeleton, e.g. `"format(value, mode?)"` or `"scroll"` for a property. */
  signature: string;
  /** One-line description for hover popups + completion detail. */
  summary: string;
}

export interface NamespaceEntry {
  /** Bare namespace name without the `$` sigil (e.g. `"util"`). */
  name: string;
  /** Reference form WITH the sigil (e.g. `"$util"`). */
  sigil: string;
  summary: string;
  members: readonly NamespaceMember[];
}

const method = (name: string, signature: string, summary: string): NamespaceMember => ({
  name,
  kind: "method",
  signature,
  summary,
});

const prop = (name: string, summary: string): NamespaceMember => ({
  name,
  kind: "property",
  signature: name,
  summary,
});

// ---------------------------------------------------------------------------
// $util
// ---------------------------------------------------------------------------

const utilMembers: readonly NamespaceMember[] = [
  // Aggregation
  method("count", "count(items)", "Number of items in an array."),
  method("sum", "sum(items)", "Sum of the numeric values."),
  method("avg", "avg(items)", "Arithmetic mean of the values."),
  method("min", "min(items)", "Smallest numeric value."),
  method("max", "max(items)", "Largest numeric value."),
  method("first", "first(items)", "First element, or null when empty."),
  method("last", "last(items)", "Last element, or null when empty."),
  // Reshaping
  method("filter", "filter(items, field?, op?, value?)", "Keep items where field matches. Operators: == != > < >= <= contains startsWith endsWith."),
  method("find", "find(items, field?, op?, value?)", "First item matching the comparator, or null."),
  method("sort", "sort(items, field?, direction?)", 'Sort by field, "asc" (default) or "desc".'),
  method("groupBy", "groupBy(items, field?)", "Group items into an object keyed by the field value."),
  method("slice", "slice(items, start?, end?)", "Subarray between start and end indices."),
  method("unique", "unique(items, field?)", "De-duplicate an array (optionally by a field)."),
  method("reverse", "reverse(items)", "Reversed copy of the array."),
  method("range", "range(start, end, step?)", "Array of numbers from start to end (inclusive)."),
  method("repeat", "repeat(value, n)", "Array with the value repeated n times."),
  method("pick", "pick(obj, keys)", "Object containing only the listed keys."),
  method("omit", "omit(obj, keys)", "Object without the listed keys."),
  method("chunk", "chunk(items, size)", "Split an array into chunks of the given size."),
  method("flatten", "flatten(items, depth?)", "Flatten nested arrays to the given depth (default 1)."),
  method("zip", "zip(...arrays)", "Combine arrays element-wise into tuples."),
  method("partition", "partition(items, field?, op?, value?)", "Split into [pass, fail] by a comparator."),
  method("keyBy", "keyBy(items, field?)", "Index an array into an object keyed by a field."),
  method("cloneDeep", "cloneDeep(value)", "Deep-clone a value (arrays / objects / dates)."),
  method("merge", "merge(target, ...sources)", "Deep-merge source objects onto a clone of the target."),
  // Formatting
  method("format", "format(value, mode?, options?)", 'Locale number format: "number" | "currency" | "percent" | "compact".'),
  method("formatDate", "formatDate(value, format?)", 'Format a date — a token pattern (MMM D, YYYY-MM-DD) or "relative"/"date"/"time"/"datetime"/"iso".'),
  method("plural", "plural(count, singular, plural?)", "Count + correctly pluralised noun: `3 items` / `1 item`."),
  method("capitalize", "capitalize(text)", "Capitalise the first letter."),
  method("lowercase", "lowercase(text)", "Lowercase the whole string."),
  method("uppercase", "uppercase(text)", "Uppercase the whole string."),
  method("titlecase", "titlecase(text)", "Title-case each word."),
  method("case", "case(text, kind?)", 'Recase: "camel" | "pascal" | "snake" | "kebab".'),
  // Date / time
  method("now", "now()", "Current time as epoch milliseconds."),
  method("today", "today()", "Start of today as an ISO string."),
  method("addDays", "addDays(date, days)", "Date shifted by n days (ISO)."),
  method("addHours", "addHours(date, hours)", "Date shifted by n hours (ISO)."),
  method("diffDays", "diffDays(start, end)", "Whole days between two dates."),
  method("startOfWeek", "startOfWeek(date)", "Start of the week containing the date (ISO)."),
  method("endOfMonth", "endOfMonth(date)", "End of the month containing the date (ISO)."),
  // String / regex
  method("join", "join(items, sep?)", "Join an array into a string with a separator."),
  method("split", "split(text, sep?)", "Split a string into an array on a separator."),
  method("trim", "trim(text)", "Trim surrounding whitespace."),
  method("replace", "replace(text, search, replacement?)", "Replace every occurrence of a substring."),
  method("substring", "substring(text, start, end?)", "Substring between two indices."),
  method("startsWith", "startsWith(text, prefix)", "True when the text starts with the prefix."),
  method("endsWith", "endsWith(text, suffix)", "True when the text ends with the suffix."),
  method("contains", "contains(text, needle)", "True when the text contains the needle."),
  method("match", "match(text, pattern)", "Test the text against a regular-expression pattern."),
  // Math
  method("round", "round(value, decimals?)", "Round to n decimal places."),
  method("floor", "floor(value)", "Round down to an integer."),
  method("ceil", "ceil(value)", "Round up to an integer."),
  method("abs", "abs(value)", "Absolute value."),
  method("clamp", "clamp(value, min, max)", "Constrain a number to a [min, max] range."),
  method("pow", "pow(base, exp)", "Exponentiation (base^exp)."),
  method("sqrt", "sqrt(value)", "Square root."),
  method("random", "random()", "Pseudo-random number in [0, 1)."),
  method("log", "log(value)", "Natural logarithm."),
  // Formatting / misc convenience
  method("slugify", "slugify(text)", 'URL-safe slug: "Hello World" → "hello-world".'),
  method("truncate", "truncate(text, length?, ellipsis?)", "Cut text to n chars with an ellipsis."),
  method("initials", "initials(name, max?)", "Up-to-`max` initials from a full name."),
  method("currency", "currency(value, code?, locale?)", "Locale currency string."),
  method("percent", "percent(value, decimals?)", 'Locale percent string (0.42 → "42%").'),
  method("bytes", "bytes(value)", 'Human-readable byte size (1536 → "1.5 KB").'),
  method("relativeTime", "relativeTime(value)", '"3 minutes ago" / "in 2 days" via Intl.'),
  method("copy", "copy(text)", "Copy to the clipboard — async; resolves true only when the write succeeds (`await $util.copy(x)`)."),
  method("sleep", "sleep(ms?)", "Awaitable pause: `await $util.sleep(ms)` (capped at 60s)."),
  method("uuid", "uuid()", "Random UUID v4 string."),
  method("debounceFn", "debounceFn(fn, wait?)", "Wrap a function so it fires `wait` ms after the LAST call."),
  method("throttleFn", "throttleFn(fn, wait?)", "Wrap a function to fire at most once per `wait` ms (leading + one trailing)."),
  // Computed + program hooks
  method("derived", "derived(fn)", "Computed reactive value — recomputes from the atoms the lambda reads."),
  method("onError", "onError(fn)", "Program-level error sink — fires with { error, source } when an action throws."),
  method("onNavigate", "onNavigate(fn)", "Navigation guard: return false to block, a path string to redirect, anything else to allow."),
  method("onRequest", "onRequest(fn)", "HTTP request interceptor — a partial return merges over every outgoing request."),
  method("onResponse", "onResponse(fn)", "HTTP response interceptor — replace the response or `await retry()`."),
  method("invalidate", "invalidate(keys)", "Refetch every cached $query whose key contains one of the substrings."),
  // Reactive environment (listeners attach lazily on first read)
  prop("scroll", 'Reactive scroll: .x / .y / .progress (0–1) / .direction ("up"|"down").'),
  prop("viewport", "Reactive viewport: .width / .height."),
  prop("breakpoint", 'Reactive breakpoint: .active ("base"|"sm"|"md"|"lg"|"xl") + boolean .sm/.md/.lg/.xl.'),
  prop("media", "Reactive media flags: .prefersDark / .prefersReducedMotion / .online / .pointer / .portrait."),
  prop("mouse", "Reactive pointer position: .x / .y."),
  // URL + query-param state
  prop("url", "Reactive URL snapshot: .path / .params / .query / .hash + .navigate(to)."),
  method("url.setQuery", "url.setQuery(key, value)", 'Write a query param in place (null/"" drops it) — shareable filter/tab state.'),
  method("url.removeQuery", "url.removeQuery(key)", "Drop a query param from the URL."),
  // Styling helpers ($util.style)
  { name: "style", kind: "namespace", signature: "style", summary: "Safe styling helpers: .cx / .gradient / .alpha / .clamp / .token / .toStyle." },
  method("style.cx", "style.cx(...args)", "clsx-style class composer — strings, arrays, { name: cond } objects."),
  method("style.gradient", "style.gradient(stops, angle?)", "Safe linear-gradient() from color stops + angle."),
  method("style.alpha", "style.alpha(color, amount)", "color-mix transparency: token or color at 0–1 alpha."),
  method("style.clamp", "style.clamp(min, preferred, max)", "Responsive clamp(min, preferred, max) size."),
  method("style.token", "style.token(path)", 'Resolve a theme token path to its CSS var: "colors.primary" → var(--rui-color-primary).'),
  method("style.toStyle", "style.toStyle(obj)", "Serialise a CSS-declarations object to a sanitised style string."),
  // Validators ($util.rules)
  { name: "rules", kind: "namespace", signature: "rules", summary: "Composable validators — compose per field; run with .validate / .validateAll or hand to $form." },
  method("rules.required", "rules.required(message?)", "Non-empty value."),
  method("rules.email", "rules.email(message?)", "Valid email address."),
  method("rules.url", "rules.url(message?)", "Valid http(s) URL."),
  method("rules.min", "rules.min(n, message?)", "Number ≥ n."),
  method("rules.max", "rules.max(n, message?)", "Number ≤ n."),
  method("rules.minLength", "rules.minLength(n, message?)", "String length ≥ n."),
  method("rules.maxLength", "rules.maxLength(n, message?)", "String length ≤ n."),
  method("rules.pattern", "rules.pattern(re, message?)", "Match a regular expression."),
  method("rules.oneOf", "rules.oneOf(options, message?)", "Value is in the allowed list."),
  method("rules.matches", "rules.matches(other, message?)", "Equals another value (password confirmation)."),
  method("rules.custom", "rules.custom(fn, message?)", "Custom sync rule — return true/null (valid), false, or an error string."),
  method("rules.asyncCustom", "rules.asyncCustom(fn, message?)", "Async rule (Promise) — server-side checks; $form awaits it before submitting."),
  method("rules.validate", "rules.validate(value, validators)", "Run validators — first error message or null (a Promise when an async rule is hit)."),
  method("rules.validateAll", "rules.validateAll(values, schema)", "Validate an object against { field: [validators] } → { field: message }."),
  // Device / platform
  method("vibrate", "vibrate(pattern?)", "Haptic pulse (ms or pattern array) on supporting devices."),
  method("share", "share(data)", "Native share sheet (Web Share API) — resolves true on share."),
  method("readClipboard", "readClipboard()", "Read clipboard text (async, permission-gated)."),
  method("geolocate", "geolocate(options?)", "Resolve { lat, lng, accuracy } via the Geolocation API."),
  method("isOnline", "isOnline()", "Current navigator.onLine flag."),
  method("deviceType", "deviceType()", '"mobile" | "tablet" | "desktop" heuristic.'),
  method("worker", "worker(fn, ...args)", "Run a closure-free function in a Web Worker; resolves its return value."),
  method("registerServiceWorker", "registerServiceWorker(url, scope?)", "Register a service worker for PWA/offline."),
  method("webManifest", "webManifest(config)", "Build a sanitised web-app manifest (name, icons, themeColor…)."),
  method("nativeShell", "nativeShell()", "Detect the wrapper: capacitor/cordova/tauri/electron/react-native or \"web\"."),
  method("isNativeApp", "isNativeApp()", "True when running inside a native shell."),
];

// ---------------------------------------------------------------------------
// $storage
// ---------------------------------------------------------------------------

const storageBackendMembers = (prefix: string, label: string): NamespaceMember[] => [
  method(`${prefix}set`, `${prefix}set(key, value, options?)`, `${label} write.`),
  method(`${prefix}get`, `${prefix}get(key)`, `${label} read. Returns null when missing.`),
  method(`${prefix}remove`, `${prefix}remove(key, options?)`, `Delete a key from ${label.toLowerCase()}.`),
  method(`${prefix}clear`, `${prefix}clear()`, `Wipe every ${label.toLowerCase()} entry.`),
];

const storageMembers: readonly NamespaceMember[] = [
  ...storageBackendMembers("", "localStorage (default namespace)"),
  { name: "local", kind: "namespace", signature: "local", summary: "localStorage backend — set/get/remove/clear." },
  ...storageBackendMembers("local.", "localStorage"),
  { name: "session", kind: "namespace", signature: "session", summary: "sessionStorage backend (per-tab) — set/get/remove/clear." },
  ...storageBackendMembers("session.", "Per-tab sessionStorage"),
  { name: "cookies", kind: "namespace", signature: "cookies", summary: "Document cookies — set/get/remove/clear (options: expires, maxAge, path, domain, secure, sameSite)." },
  method("cookies.set", "cookies.set(key, value, options?)", "Set a cookie. Options: expires, maxAge, path, domain, secure, sameSite."),
  method("cookies.get", "cookies.get(key)", "Read a cookie value."),
  method("cookies.remove", "cookies.remove(key, options?)", "Delete a cookie. Path/domain must match the original set call."),
  method("cookies.clear", "cookies.clear()", "Clear every cookie on this document."),
];

// ---------------------------------------------------------------------------
// $console
// ---------------------------------------------------------------------------

const consoleMembers: readonly NamespaceMember[] = [
  method("log", "log(...args)", "Log a message at the default level."),
  method("error", "error(...args)", "Log an error."),
  method("warn", "warn(...args)", "Log a warning."),
  method("info", "info(...args)", "Log an informational message."),
  method("debug", "debug(...args)", "Log a verbose debug message."),
];

// ---------------------------------------------------------------------------
// $toast
// ---------------------------------------------------------------------------

const toastMembers: readonly NamespaceMember[] = [
  method("show", "show(message, options?)", "Show a toast; returns its id. Options: { title?, tone?, duration? }."),
  method("success", "success(message, options?)", '`show` with tone "success".'),
  method("error", "error(message, options?)", '`show` with tone "danger".'),
  method("info", "info(message, options?)", '`show` with tone "info".'),
  method("warning", "warning(message, options?)", '`show` with tone "warning".'),
  method("dismiss", "dismiss(id)", "Remove a single toast by id."),
  method("clear", "clear()", "Remove every toast."),
  prop("items", "Reactive list of live toasts (newest last). Treat as read-only."),
];

/** Every `$`-namespace whose members are reached via `.`. */
export const namespaceCatalog: readonly NamespaceEntry[] = [
  { name: "util", sigil: "$util", summary: "Runtime helper + reactive-environment namespace.", members: utilMembers },
  { name: "storage", sigil: "$storage", summary: "Browser storage namespace (local / session / cookies).", members: storageMembers },
  { name: "console", sigil: "$console", summary: "Console namespace forwarding to the browser console.", members: consoleMembers },
  { name: "toast", sigil: "$toast", summary: "Imperative toast namespace.", members: toastMembers },
];

const namespacesByName: Readonly<Record<string, NamespaceEntry>> = Object.freeze(
  Object.fromEntries(namespaceCatalog.map((n) => [n.name, n])),
);

// ---------------------------------------------------------------------------
// Reactive resource bags returned by factory builtins
// ---------------------------------------------------------------------------

const httpResourceMembers: readonly NamespaceMember[] = [
  prop("data", "Parsed response body — `null` until the request resolves."),
  prop("error", "`null` on success; `{ status, body }` on a non-2xx; the thrown error on network failure."),
  prop("status", "HTTP status code of the last response, e.g. `200`."),
  prop("loading", "`true` while a request is in flight."),
  prop("headers", "Response headers as a plain object."),
  prop("lastUpdated", "Epoch-ms of the last successful response."),
  method("refetch", "refetch()", "Re-issue the original request."),
  method("cancel", "cancel()", "Abort the in-flight request."),
  prop("onDone", "Settable callback fired each time the request settles (success or error)."),
];

const queryResourceMembers: readonly NamespaceMember[] = [
  ...httpResourceMembers,
  method("loadMore", "loadMore()", "Fetch the next page (infinite mode)."),
  prop("hasMore", "`true` while more pages are available (infinite mode)."),
  prop("loadingMore", "`true` while a `loadMore()` page is in flight."),
  prop("pages", "Raw page bodies loaded so far (infinite mode); `.data` is the flattened items."),
];

const mutationResourceMembers: readonly NamespaceMember[] = [
  method("mutate", "mutate(overrides?)", "Fire the request; overrides shallow-merge over the config. `optimistic` applies instantly and rolls back on failure."),
  prop("data", "Response body of the last successful mutation."),
  prop("error", "`null` on success; error details on failure."),
  prop("loading", "`true` while the mutation request is in flight."),
  prop("status", "HTTP status code of the last response."),
  prop("onDone", "Settable callback fired when the mutation settles."),
];

const socketResourceMembers: readonly NamespaceMember[] = [
  prop("status", 'Connection lifecycle: "connecting" | "open" | "closed".'),
  prop("connected", '`true` while status is "open".'),
  prop("last", "Most recent message (JSON auto-parsed), or null."),
  prop("messages", "Buffered messages, newest last (capped to bufferSize)."),
  prop("attempts", "Reconnect attempts in the current streak (resets on success)."),
  prop("error", "Last socket error event, if any."),
  method("send", "send(data)", "Send a message (objects JSON-stringified). Queues while connecting; flushes on open."),
  method("close", "close()", "Close for good — disables auto-reconnect."),
];

const sseResourceMembers: readonly NamespaceMember[] = [
  prop("status", '"connecting" | "open" | "closed" (EventSource retries natively).'),
  prop("connected", "`true` while the stream is open."),
  prop("last", "Most recent event payload (JSON auto-parsed)."),
  prop("messages", "Buffered events, newest last (capped to bufferSize)."),
  prop("error", "Last stream error, if any."),
  method("close", "close()", "Close the stream."),
];

const formResourceMembers: readonly NamespaceMember[] = [
  prop("values", "Reactive field values — two-way bind with an input's `value`."),
  prop("errors", "Per-field error messages (set after validate/touch/submit)."),
  prop("touched", "Per-field booleans — true once the user has interacted."),
  prop("dirty", "`true` once any value differs from the clean snapshot."),
  prop("valid", "`true` when the last validation pass found no errors."),
  prop("submitting", "`true` from submit() until an async onSubmit settles."),
  prop("validating", "`true` while async rules ($util.rules.asyncCustom) are in flight."),
  method("field", "field(name)", "Controlled prop bag: { value, error, name, onChange, onBlur } — spread onto an input."),
  method("touch", "touch(name)", "Mark a field touched + validate it (wire to `onBlur`)."),
  method("setField", "setField(name, value)", "Set one field value (clears its error)."),
  method("setValues", "setValues(values)", "Merge several field values at once."),
  method("validate", "validate()", "Validate every field → boolean (a Promise when async rules exist)."),
  method("validateField", "validateField(name)", "Validate one field → message | null (Promise for async rules)."),
  method("submit", "submit()", "Touch all → validate → onSubmit(values) when valid. Alias: handleSubmit()."),
  method("handleSubmit", "handleSubmit()", "Alias of submit()."),
  method("reset", "reset()", "Restore initial values; clears errors/touched/dirty."),
];

const storeResourceMembers: readonly NamespaceMember[] = [
  method("undo", "undo()", "Undo the last change (`history: true|depth` stores)."),
  method("redo", "redo()", "Redo the last undone change."),
  prop("canUndo", "Reactive — `true` when an undo step is available."),
  prop("canRedo", "Reactive — `true` when a redo step is available."),
  method("clearHistory", "clearHistory()", "Drop the undo/redo stacks."),
];

export interface FactoryResourceEntry {
  /** Factory builtin bare name (`"http"`, `"query"`, …). */
  factory: string;
  summary: string;
  members: readonly NamespaceMember[];
}

/**
 * The resource bag each factory builtin returns. A host that knows a binding
 * was assigned from `$http(...)` / `$form(...)` / … completes `binding.` with
 * the matching member list.
 */
export const factoryResourceCatalog: readonly FactoryResourceEntry[] = [
  { factory: "http", summary: "Reactive HTTP resource bag.", members: httpResourceMembers },
  { factory: "query", summary: "Cached query bag (HTTP + pagination).", members: queryResourceMembers },
  { factory: "mutation", summary: "Deferred mutation bag (fires on .mutate()).", members: mutationResourceMembers },
  { factory: "socket", summary: "Reactive WebSocket bag.", members: socketResourceMembers },
  { factory: "sse", summary: "Reactive Server-Sent Events bag.", members: sseResourceMembers },
  { factory: "form", summary: "Managed form engine bag.", members: formResourceMembers },
  { factory: "store", summary: "Global store handle (built-in history methods).", members: storeResourceMembers },
];

const factoriesByName: Readonly<Record<string, FactoryResourceEntry>> = Object.freeze(
  Object.fromEntries(factoryResourceCatalog.map((f) => [f.factory, f])),
);

/** Factory builtin names whose returned bag has a known member shape. */
export const factoryResourceNames: ReadonlySet<string> = new Set(
  factoryResourceCatalog.map((f) => f.factory),
);

// ---------------------------------------------------------------------------
// The reserved reactive `route` handle and the `$i18n` result bag
// ---------------------------------------------------------------------------

/** Members of the reserved reactive `route` handle (`route.path`, …). */
export const routeMembers: readonly NamespaceMember[] = [
  prop("path", "Current URL path, e.g. `/users/42`."),
  prop("params", "Captured path segments from the matched route pattern (`route.params.id`)."),
  prop("query", "Parsed query-string parameters as an object."),
  prop("pattern", "The matched route pattern, or `null`."),
  method("navigate", "navigate(to)", "Imperatively navigate to a path."),
];

/** The bag `$i18n({...})` returns (usually destructured). */
export const i18nResultMembers: readonly NamespaceMember[] = [
  method("t", "t(key, vars?)", "Translate a key for the current language; interpolates {name} placeholders + ICU plural/select."),
  method("setCurrentLanguage", "setCurrentLanguage(lang)", "Switch the active language."),
  method("getCurrentLanguage", "getCurrentLanguage()", "Return the active language code."),
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Resolve a namespace entry by its bare name (`"util"`, `"storage"`, …). */
export function findNamespace(bareName: string): NamespaceEntry | undefined {
  return namespacesByName[bareName];
}

/** True when `bareName` (no `$`) names a `.`-member namespace. */
export function isNamespaceName(bareName: string): boolean {
  return bareName in namespacesByName;
}

/** Resolve the resource-bag entry for a factory builtin (`"http"`, …). */
export function findFactoryResource(factory: string): FactoryResourceEntry | undefined {
  return factoriesByName[factory];
}

/**
 * Members offered at a member-access path inside a namespace. `path` is the
 * already-typed sub-namespace segments after the root, e.g. `["style"]` for
 * `$util.style.`. Returns the matching members with the consumed prefix
 * stripped from each name (so `style.cx` is offered as `cx` after `$util.style.`).
 */
export function namespaceMembersAt(
  bareName: string,
  path: readonly string[] = [],
): NamespaceMember[] {
  const ns = namespacesByName[bareName];
  if (!ns) return [];
  if (path.length === 0) return ns.members.slice();
  const prefix = `${path.join(".")}.`;
  const out: NamespaceMember[] = [];
  for (const m of ns.members) {
    if (m.name.startsWith(prefix)) {
      out.push({ ...m, name: m.name.slice(prefix.length) });
    }
  }
  return out;
}

/**
 * Resolve a fully-qualified member by its dotted path within a namespace.
 * `$util.style.cx` → `findNamespaceMember("util", "style.cx")`.
 */
export function findNamespaceMember(
  bareName: string,
  memberPath: string,
): NamespaceMember | undefined {
  const ns = namespacesByName[bareName];
  if (!ns) return undefined;
  return ns.members.find((m) => m.name === memberPath);
}

// ---------------------------------------------------------------------------
// Config-object keys for the config-taking builtins
// ---------------------------------------------------------------------------

export interface ConfigKey {
  name: string;
  /** Value type hint, e.g. `"string"`, `"object"`, `'enum: "GET" | "POST"'`. */
  type: string;
  summary: string;
}

const cfg = (name: string, type: string, summary: string): ConfigKey => ({ name, type, summary });

const httpConfigKeys: readonly ConfigKey[] = [
  cfg("url", "string", "Absolute request URL."),
  cfg("method", 'enum: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"', "HTTP method. Defaults to GET."),
  cfg("query", "object", "Object serialised into the URL querystring (`?k=v`)."),
  cfg("headers", "object", "Request headers as a plain object."),
  cfg("body", "object", "Request body. Objects are JSON-encoded automatically."),
  cfg("credentials", 'enum: "omit" | "same-origin" | "include"', "Fetch credentials mode."),
  cfg("mode", 'enum: "cors" | "no-cors" | "same-origin"', "Fetch request mode."),
  cfg("cache", 'enum: "default" | "no-store" | "reload" | "no-cache" | "force-cache"', "Fetch cache mode."),
  cfg("gql", "string", "GraphQL query — POSTs { query, variables }; `.data` is the unwrapped GraphQL data."),
  cfg("variables", "object", "GraphQL variables paired with `gql`."),
];

const queryConfigKeys: readonly ConfigKey[] = [
  ...httpConfigKeys,
  cfg("key", "string", "Cache key — identical keys share one in-flight request + cached bag."),
  cfg("ttl", "number", "Milliseconds before cached data is considered stale and auto-refetched."),
  cfg("refetchInterval", "number", "Poll interval in ms (live dashboards)."),
  cfg("refetchOnFocus", "boolean", "Refetch when the tab regains focus."),
  cfg("refetchOnReconnect", "boolean", "Refetch when the network reconnects."),
  cfg("infinite", "object", "Pagination config: { param?, start?, limit?, mode?, select? } → .loadMore()/.hasMore."),
];

const mutationConfigKeys: readonly ConfigKey[] = [
  cfg("url", "string", "Absolute request URL."),
  cfg("method", 'enum: "POST" | "PUT" | "PATCH" | "DELETE"', "HTTP method. Defaults to POST."),
  cfg("body", "object", "Default body; shallow-merged with `.mutate(overrides)`."),
  cfg("headers", "object", "Request headers as a plain object."),
  cfg("query", "object", "Object serialised into the URL querystring."),
  cfg("optimistic", "(vars) => void", "Runs synchronously before the request; auto-rolled-back on failure."),
  cfg("invalidates", "string[]", "Refetch every cached $query whose key contains a listed substring on success."),
  cfg("gql", "string", "GraphQL mutation document."),
  cfg("variables", "object", "GraphQL variables paired with `gql`."),
];

const socketConfigKeys: readonly ConfigKey[] = [
  cfg("url", "string", "WebSocket URL (ws:// or wss://)."),
  cfg("protocols", "string | string[]", "Optional sub-protocol(s)."),
  cfg("bufferSize", "number", "Max buffered messages kept in `.messages`."),
  cfg("onMessage", "(msg) => void", "Callback fired for each received message."),
  cfg("reconnect", "boolean | number", "Retry dropped connections (true, or a max-attempt count) with backoff."),
];

const sseConfigKeys: readonly ConfigKey[] = [
  cfg("url", "string", "EventSource URL."),
  cfg("event", "string", "Named event to listen for (defaults to message)."),
  cfg("withCredentials", "boolean", "Send credentials with the EventSource request."),
  cfg("bufferSize", "number", "Max buffered events kept in `.messages`."),
];

const formConfigKeys: readonly ConfigKey[] = [
  cfg("values", "object", "Initial field values — the clean snapshot."),
  cfg("rules", "object", "Per-field validator arrays: { field: [$util.rules.required(), …] }."),
  cfg("onSubmit", "(values) => void", "Called with the values once validation passes."),
];

const storeConfigKeys: readonly ConfigKey[] = [
  cfg("persist", "string", "Mirror the store's data to localStorage under this key (hydrates on first render)."),
  cfg("persistIn", 'enum: "local" | "session"', "Storage backend for `persist` (defaults to local)."),
  cfg("history", "boolean | number", "Enable undo()/redo()/clearHistory() + reactive canUndo/canRedo (number = depth)."),
];

const themeConfigKeys: readonly ConfigKey[] = [
  cfg("name", "string", 'Selects a built-in base theme ("dark", "neon", …).'),
  cfg("direction", 'enum: "ltr" | "rtl"', "Reading direction (metadata)."),
  cfg("colors", "object", "CSS color tokens: bg, surface, border, text, primary, accent, success, warning, danger, info, …."),
  cfg("radius", "object", "Border-radius tokens: xs, sm, md, lg, pill, button, input."),
  cfg("font", "object", "Font tokens: family, familyHeading, familyMono, sizeBase, weightBody, …."),
  cfg("spacing", "object", "Spacing scale tokens."),
  cfg("shadows", "object", "Box-shadow tokens."),
  cfg("gradients", "object", "Gradient color-stop arrays — referenced as gradient.<name>."),
  cfg("zIndex", "object", "Layer tokens (modal, toast, …) → sx.zIndex / --rui-z-*."),
  cfg("motion", "object", "Motion tokens: { fast, base, slow, ease } → --rui-motion-*."),
  cfg("fonts", "object", 'Web-font import: { import: ["Inter:400,700"] }.'),
  cfg("icons", "object", "Custom inline-SVG icons by name, usable anywhere an icon name is."),
];

const i18nConfigKeys: readonly ConfigKey[] = [
  cfg("defaultLanguage", "string", "Fallback language when a key is missing for the current language."),
  cfg("currentLanguage", "string", "Active language — drive from a reactive atom for live switching."),
  cfg("translations", "object", "{ key: { lang: \"text {name}\" } }. Supports ICU plural/select."),
];

const builtinConfigByName: Readonly<Record<string, readonly ConfigKey[]>> = Object.freeze({
  http: httpConfigKeys,
  query: queryConfigKeys,
  mutation: mutationConfigKeys,
  socket: socketConfigKeys,
  sse: sseConfigKeys,
  form: formConfigKeys,
  store: storeConfigKeys,
  theme: themeConfigKeys,
  i18n: i18nConfigKeys,
});

/**
 * Config-object keys accepted by a config-taking builtin (`bareName` without
 * the `$` — `"http"`, `"theme"`, …), or `undefined` when the builtin takes no
 * fixed-key config object (e.g. `$router`, whose keys are route patterns).
 */
export function findBuiltinConfig(bareName: string): readonly ConfigKey[] | undefined {
  return builtinConfigByName[bareName];
}
