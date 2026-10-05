// Negative corpus for the `$`-builtin, namespace, resource and injected-name
// declarations. Directive format and layer tags: see negative.dsl.ts. Each case
// is a value the runtime silently mishandles (ignores, coerces to the wrong
// thing, or drops), so the types reject it.
import {
  $dom, $effect, $form, $head, $http, $mutation, $query, $router, $script, $socket, $storage, $toast, $util,
  $app, outlet, slots,
  type AktionNode, type RouteParamsOf,
} from "aktion-runtime/dsl";

interface Row { id: number; name: string }
declare const rows: Row[];

// ---- $util list helpers -------------------------------------------------------------
// @ts-expect-error TS2345 [types] an unknown operator matches nothing (filter returns [])
$util.filter([{ a: 1 }], "a", "eq", 1);
// @ts-expect-error TS2353 [types] a non-array input is silently treated as []
$util.count({ a: 1 });
// @ts-expect-error TS2345 [types] a Set is not an array: the helpers read it as []
$util.first(new Set([1]));
// @ts-expect-error TS2322 the element type flows through: a Row's id is a number
const firstId: string | undefined = $util.first(rows)?.id;
// @ts-expect-error TS2741 pick returns exactly the picked keys
const picked: { id: number; name: string } = $util.pick(rows[0]!, ["id"]);
// @ts-expect-error TS2322 [types] pick keys must be keys of the object
$util.pick({ a: 1 }, ["z"]);
// @ts-expect-error TS2345 [types] a RegExp stringifies with its slashes and never matches as meant
$util.match("abc", /b/);
// @ts-expect-error TS2345 [types] an unknown format mode is silently plain
$util.format(3, "bogus");
// @ts-expect-error TS2353 [types] format options are { currency, locale, decimals }
$util.format(3, "currency", { code: "EUR" });
// @ts-expect-error TS2345 [types] a missing date silently becomes NOW
$util.addDays(null, 1);
// @ts-expect-error TS2345 [types] a non-function is a silent no-op
$util.debounceFn("search", 300);
// @ts-expect-error TS2345 the debounced function keeps the wrapped function's parameters
$util.debounceFn((q: string) => q, 300)(1);
// @ts-expect-error TS2345 worker arguments are checked against the function
$util.worker((n: number) => n * 2, "21");
// @ts-expect-error TS2322 [types] the "as" option has three values
$util.readFile(null, { as: "binary" });
// @ts-expect-error TS2345 [types] a non-string URL is never opened
$util.openUrl(42);
// @ts-expect-error TS2353 [types] unknown window features are dropped
$util.openWindow({ features: { evil: "yes" } });
// @ts-expect-error TS2345 [types] OpenedWindow.navigate takes a URL string
$util.openWindow().navigate({ href: "/x" });
// @ts-expect-error TS2561 [types] webManifest reads camelCase keys (short_name is ignored; tsc suggests shortName)
$util.webManifest({ short_name: "App" });
// @ts-expect-error TS2367 [types] deviceType answers only mobile / tablet / desktop
$util.deviceType() === "phone";
// @ts-expect-error TS2353 [types] duration.format reads only { style }
$util.duration.format(90, { unit: "s" });

// ---- $util env, style, interceptors -------------------------------------------------
// @ts-expect-error TS2367 [types] the breakpoint names are base / sm / md / lg / xl
$util.breakpoint.active === "xxl";
// @ts-expect-error TS2540 the env snapshots are fresh read-only copies: writing one does nothing
$util.viewport.width = 10;
// @ts-expect-error TS2345 [types] a string angle is silently replaced by 120deg
$util.style.gradient(["red", "blue"], "45deg");
// @ts-expect-error TS2322 [types] toStyle drops false/null but stringifies `true` uselessly
$util.style.toStyle({ hidden: true });
// @ts-expect-error TS2345 [types] a non-function custom rule is always valid
$util.rules.custom("x");
// @ts-expect-error TS2322 an async request interceptor is not awaited: its headers are lost
$util.onRequest(async (request) => ({ headers: { ...request.headers, a: "b" } }));
// @ts-expect-error TS2322 a partial response REPLACES the response and loses its status
$util.onResponse((response) => ({ body: response.body }));
// @ts-expect-error TS2367 onError's source is the failing action's name (a string)
$util.onError((info) => info.source === 1);

// ---- $form: validators are typed per field ------------------------------------------
// @ts-expect-error TS2339 the age validator receives the age (a number)
$form({ values: { name: "", age: 0 }, rules: { age: $util.rules.custom((v) => v.length > 2) } });
// @ts-expect-error TS2339 submit answers a boolean (no `.then`) unless a rule or onSubmit is async
$form({ values: { a: "" } }).submit().then(() => 1);

// ---- $toast ---------------------------------------------------------------------------
// @ts-expect-error TS2353 [types] the shortcut overwrites tone: { tone: "info" } renders "success"
$toast.success("hi", { tone: "info" });
// @ts-expect-error TS2322 [types] not one of the Toast component's tones
$toast.show("hi", { tone: "error" });
// @ts-expect-error TS2322 [types] configure ignores any position that is not a real corner
$toast.configure({ position: "center" });
// @ts-expect-error TS2345 [types] an object message renders "[object Object]"
$toast.show({ text: "hi" });

// ---- $head ----------------------------------------------------------------------------
// @ts-expect-error TS2322 [types] rel "stylesheet" is dropped (no attacker CSS over the host page)
$head({ link: [{ rel: "stylesheet", href: "/x.css" }] });
// @ts-expect-error TS2741 [types] a link without href is dropped
$head({ link: [{ rel: "canonical" }] });
// @ts-expect-error TS2353 [types] htmlAttrs drops style (no full-viewport overlays)
$head({ htmlAttrs: { style: "display:none" } });
// @ts-expect-error TS2353 [types] base reads only href (target is silently ignored)
$head({ base: { href: "/app/", target: "_blank" } });

// ---- data -------------------------------------------------------------------------------
// @ts-expect-error TS2769 [types] the infinite form ignores refetchInterval
$query({ url: "/feed", refetchInterval: 1000, infinite: {} });
// @ts-expect-error TS2322 [types] an unknown referrer policy makes fetch reject
$http({ url: "/x", referrerPolicy: "sometimes" });
// @ts-expect-error TS2322 [types] fetch credentials take omit / same-origin / include
$mutation({ url: "/x", credentials: "always" });
// @ts-expect-error TS2322 .error is a view of the failure shapes: `status` is a number
const statusText: string | undefined = $http({ url: "/x" }).error?.status;
// @ts-expect-error TS2531 a script bag's error is null until a load fails
$script({ src: "/x.js" }).error.message;
// @ts-expect-error TS2322 onMessage and the bag share one message type
const lastKind: number | undefined = $socket({ url: "wss://x", onMessage: (message: { type: string }) => message.type }).last?.type;

// ---- $dom / $storage ------------------------------------------------------------------------
// @ts-expect-error TS2345 [types] a non-element is a silent no-op
$dom.measure("#app");
// @ts-expect-error TS2339 intersection entries are typed
$dom.onIntersect(null, (entry) => entry.isVisible);
// @ts-expect-error TS2554 [types] localStorage ignores cookie options
$storage.local.set("k", 1, { path: "/" });
// @ts-expect-error TS2322 [types] the callable form ignores its argument
$storage({ persist: true });

// ---- routing / injected / i18n / effects ------------------------------------------------
// @ts-expect-error TS2345 [types] a string root renders a blank page (the validator only catches a literal one)
$app($router({ "/": "home" }));
// @ts-expect-error TS2339 a pattern's params are exactly its captures
const missing: string = ({} as RouteParamsOf<"/users/:id">).name;
// @ts-expect-error TS2322 outlet is whatever the child arm evaluates to, not just a node
const outletNode: AktionNode | null = outlet;
// @ts-expect-error TS2322 [parser] intervals are positive whole milliseconds
$effect(() => {}, ["every(-1)"]);
// @ts-expect-error TS2322 [parser] … written in decimal
$effect(() => {}, ["debounce(1e3)"]);

export { firstId, picked, statusText, lastKind, outletNode, missing, slots };
