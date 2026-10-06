// Positive fixture for the `$`-builtin, namespace, resource and injected-name
// declarations (scripts/dsl-types/builtins.ts + the runtime types printed by
// scripts/dsl-types/runtime-types.ts). Every line must type-check, with and
// without the DOM lib; the `const x: T = …` annotations pin what the
// declarations INFER, so a regression to `unknown` / `any` fails here.
import {
  $dom, $form, $head, $http, $i18n, $mutation, $query, $router, $script, $socket, $sse, $storage,
  $store, $toast, $util, $effect, Button, Column, Mount, Text,
  outlet, params, slots,
  type AktionNode, type Children, type DomElement, type HttpInterceptedResponse, type I18nInstance, type RouteParamsOf,
  type Store, type UtilWebManifest,
} from "aktion-runtime/dsl";

interface Row { id: number; name: string; owner: { name: string }; tags: string[] }
declare const rows: Row[] | undefined;

// ---- $util list helpers: the element type flows through ------------------------

export function lists(): number {
  const named: Row[] = $util.filter(rows, "name", "contains", "a");
  const byOwner: Row[] = $util.filter(rows, "owner.name", "==", "Ada");    // a dotted path
  const firstRow: Row | null = $util.first(rows);
  const lastRow: Row | null = $util.last(rows);
  const found: Row | null = $util.find(rows, "id", ">=", 2);
  const [pass, fail]: [Row[], Row[]] = $util.partition(rows, "id", "<", 10);
  const sorted: Row[] = $util.sort(rows, "name", "desc");
  const groups: Record<string, Row[]> = $util.groupBy(rows, "owner.name");
  const byId: Record<string, Row> = $util.keyBy(rows, "id");
  const distinct: Row[] = $util.unique(rows, "name");
  const pages: Row[][] = $util.chunk(rows, 10);
  const someRows: Row[] = $util.slice(rows, 0, 5);
  const reversed: Row[] = $util.reverse(rows);
  const flat: number[] = $util.flatten([[1, 2], [3]]);
  const deep: number[] = $util.flatten([[1, [2]], [3]], 2);
  const pairs: [number | null, string | null][] = $util.zip([1, 2], ["a", "b"]);
  const picked: { id: number; name: string } = $util.pick({ id: 1, name: "a", extra: true }, ["id", "name"]);
  const rest: { extra: boolean } = $util.omit({ id: 1, name: "a", extra: true }, ["id", "name"]);
  const tagged = $util.filter(rows?.flatMap((r) => r.tags), "", "startsWith", "x");
  const tags: string[] = tagged;
  return named.length + byOwner.length + (firstRow?.id ?? 0) + (lastRow?.id ?? 0) + (found?.id ?? 0) + pass.length + fail.length +
    sorted.length + Object.keys(groups).length + Object.keys(byId).length + distinct.length + pages.length + someRows.length +
    reversed.length + flat.length + deep.length + pairs.length + picked.id + Number(rest.extra) + tags.length +
    $util.count(rows) + $util.sum([1, "2"]) + $util.avg(null) + $util.min(undefined) + $util.max([3]);
}

// ---- $util formatting, dates, functions, device ----------------------------------

export function formatting(): string {
  const money = $util.format(12.5, "currency", { currency: "EUR", locale: "de-DE", decimals: 2 });
  const legacy = $util.format("3", "currency", "USD", "en-US");
  const when = $util.formatDate(Date.now(), "relative") + $util.formatDate("2024-01-01", "YYYY-MM-DD");
  const days: number = $util.diffDays(new Date(), "2030-01-01");
  const later: string = $util.addDays(new Date(), 1) + $util.addHours(0, 2) + $util.startOfWeek("2024-05-05") + $util.endOfMonth(new Date());
  const iso = $util.duration.format(90, { style: "iso" });
  const matched: boolean = $util.match("abc", "^a.c$");
  return `${money}${legacy}${when}${days}${later}${iso}${matched}${$util.relativeTime(Date.now())}${$util.join(rows, ", ")}`;
}

export function functions(): void {
  const search = $util.debounceFn((query: string, page: number) => { $util.sleep(page).then(() => query); }, 300);
  search("ada", 1);
  const onScroll = $util.throttleFn(() => {}, 100);
  onScroll();
  const doubled: Promise<number> = $util.worker((n: number) => n * 2, 21);
  const awaited: Promise<string> = $util.worker(async (s: string) => s.trim(), " x ");
  void doubled;
  void awaited;
}

export function device(files: readonly { size: number; type: string; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }[]): string {
  const kind: "mobile" | "tablet" | "desktop" = $util.deviceType();
  const shell: "tauri" | "capacitor" | "cordova" | "react-native" | "electron" | "web" = $util.nativeShell();
  $util.readFile(files, { as: "base64", maxSize: 1_000_000 }).then((text) => text.length);
  $util.readFile(files[0], { as: "dataUrl" });
  $util.readFile(null);
  $util.openUrl("https://example.invalid/docs", { target: "docs", features: { width: 800, height: 600, noopener: "yes" } });
  $util.openUrl("/help", { features: "width=800,height=600" });
  const win = $util.openWindow({ name: "console", features: { popup: true } });
  if (win.ok) win.navigate("https://example.invalid/sso");
  const manifest: UtilWebManifest = $util.webManifest({ name: "App", display: "standalone", icons: [{ src: "/icon.png" }] });
  $util.share({ title: "Hi", url: "https://example.invalid" });
  $util.share("plain text");
  $util.vibrate([100, 50, 100]);
  $util.geolocate({ enableHighAccuracy: true, timeout: 5000 }).then((pos) => pos?.lat);
  $util.registerServiceWorker("/sw.js", "/");
  $util.copy(42);
  return `${kind}${shell}${manifest.short_name}${manifest.icons?.[0]?.sizes ?? ""}`;
}

// ---- $util env snapshots, style, interceptors -------------------------------------

export function env(): string {
  const bp: "base" | "sm" | "md" | "lg" | "xl" = $util.breakpoint.active;
  const dir: "up" | "down" = $util.scroll.direction;
  const pointer: "coarse" | "fine" = $util.media.pointer;
  return `${bp}${dir}${pointer}${$util.viewport.width}${$util.mouse.x}`;
}

export function style(active: boolean): string {
  return [
    $util.style.cx("btn", ["lg", { active }], null, false, 0),
    $util.style.gradient(["primary", "#ff0000"], 45),
    $util.style.alpha("accent", 0.5),
    $util.style.clamp("1rem", "2vw", 32),
    $util.style.token("spacing.l"),
    $util.style.toStyle({ backgroundColor: "red", opacity: 0.5, display: false, margin: null }),
  ].join(" ");
}

$util.onError((info) => $toast.error(`${info.source} failed`));
$util.onRequest((request) => ({ headers: { ...request.headers, authorization: "Bearer x" } }));
$util.onRequest((request) => { request.headers["x-trace"] = "1"; });
$util.onResponse((response, retry) => (response.status === 401 ? retry() : undefined));
$util.onResponse(async (response): Promise<HttpInterceptedResponse> => ({ ...response, body: { wrapped: response.body } }));

// ---- $util.rules + $form: validators are typed per field ----------------------------

export const profile = $form({
  values: { name: "", age: 0, role: "user" },
  rules: {
    name: [$util.rules.required(), $util.rules.custom((v) => v.length > 2 || "too short"), $util.rules.pattern(/^[a-z]+$/)],
    age: $util.rules.custom((v) => v > 0),
    role: [$util.rules.oneOf(["user", "admin"] as const), $util.rules.asyncCustom((v) => Promise.resolve(v !== "root"))],
  },
  onSubmit: (values) => values.name,
});
export const timeout = $util.rules.duration({ min: 1, max: 3600 }, "1s to 1h");
export const submitted: boolean | Promise<unknown> = profile.submit();

// ---- $store: annotate the method handle with Store<Fields> -------------------------

interface Cart { items: string[]; total: number }
export const cart = $store({
  items: [] as string[],
  total: 0,
  add: (s: Store<Cart>, item: string) => { s.items = [...s.items, item]; s.total = s.total + 1; },
});
cart.add("apple");

// ---- $toast ---------------------------------------------------------------------------

$toast.configure({ position: "bottom-center" });
$toast.configure();
export const toastId: string = $toast.show(3, { tone: "warning", title: 42, duration: 0 });
$toast.success("Saved", { title: "Profile", duration: 2000 });
export const tones: readonly ("default" | "primary" | "success" | "warning" | "danger" | "info")[] = $toast.items.map((t) => t.tone);

// ---- $head ------------------------------------------------------------------------------

$head({
  title: "Users",
  meta: { description: "All users", "max-image-preview": "large", rating: 5 },
  link: [{ rel: "canonical", href: "/users" }, { rel: "alternate", href: "/de/users", hreflang: "de" }],
  htmlAttrs: { lang: "en", dir: "ltr", "data-theme": "dark" },
  base: { href: "/app/" },
});
$head({ link: { rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "any", crossorigin: "anonymous" } });

// ---- data: fetch options, errors, infinite select, realtime -----------------------------

interface Post { id: number; title: string }
export const posts = $http<Post[]>({ url: "/api/posts", credentials: "include", referrerPolicy: "no-referrer", keepalive: true });
export const notFound: boolean = posts.error?.status === 404 || posts.error?.message === "x";
export const save = $mutation<{ ok: boolean }>({
  url: "/api/posts",
  credentials: "include",
  mode: "cors",
  priority: "high",
  optimistic: (overrides) => { void overrides.body; },
});
export const saveFailed: number | undefined = save.error?.status;
export const feed = $query({ url: "/api/feed", key: 7, infinite: { limit: 20, select: (body: { results: Post[] }) => body.results } });
export const feedItems: Post[] = feed.data;
export const cachedTags = $query<string[]>({ url: "/api/tags", key: 3, ttl: 60_000, redirect: "follow" });
export const live = $socket({ url: "wss://example.invalid", onMessage: (message: { type: string }) => message.type });
export const lastType: string | undefined = live.last?.type;
export const stream = $sse<{ n: number }>({ url: "/api/events" });
export const streamFailed: boolean = stream.error !== undefined && "message" in stream.error;
export const sdk = $script({ src: "https://example.invalid/sdk.css", as: "stylesheet" });
export const sdkError: string | undefined = sdk.error?.message;

// ---- $dom ----------------------------------------------------------------------------------

export const observed = Mount((node: DomElement) => {
  const stopIntersect = $dom.onIntersect(node, (entry) => {
    if (entry.isIntersecting && entry.intersectionRatio > 0.5) entry.target.focus();
  }, { rootMargin: "10px", threshold: [0, 1] });
  const stopMutation = $dom.onMutation(node, (records) => {
    const first = records[0];
    if (first?.type === "attributes") $toast.info(first.attributeName ?? "");
  }, { subtree: true });
  const stopResize = $dom.onResize(node, (size) => $toast.info(`${size.width}x${size.height}`));
  const box = $dom.measure(node);
  $dom.measure(null);
  return { box, stop: () => { stopIntersect(); stopMutation(); stopResize(); } };
});

// ---- $storage ------------------------------------------------------------------------------

export const visits: number | null = $storage.local.get<number>("visits");
$storage.session.set("draft", { body: "" });
$storage.cookies.set("theme", "dark", { maxAge: 3600, sameSite: "Strict", path: "/" });
$storage.cookies.remove("theme", { path: "/" });
export const theme: string | null = $storage.cookies.get<string>("theme");
$storage().clear();

// ---- routing, slots, outlet, i18n, effects ----------------------------------------------------

export function Panel(title: string): AktionNode {
  const onClose = slots.onClose;
  const header = slots.header as Children;
  return Column([Text(title), header, Button("Close", { onClick: () => { if (typeof onClose === "function") onClose(); } })]);
}

export const view = $router({
  "/": [Text("home"), Text("feed")],
  "/users/:id/files/*": Text(`file ${(params as RouteParamsOf<"/users/:id/files/*">).id} ${(params as RouteParamsOf<"/users/:id/files/*">)._}`),
  "/settings": { layout: Column([Text("Settings"), outlet]), routes: { "/profile": "profile" } },
  default: null,
});
export const fileParams: { readonly id: string; readonly _: string } = {} as RouteParamsOf<"/users/:id/files/*">;
export const noParams: {} = {} as RouteParamsOf<"*">;

const { t, setCurrentLanguage } = $i18n({ defaultLanguage: "en", translations: { greeting: { en: "Hello {name}", fr: "Bonjour {name}" } } });
export const greeting: string = t("greeting", { name: "Ada" }) + t("not.declared");
setCurrentLanguage("fr");
setCurrentLanguage("de");
export const untyped = $i18n();
export const typedI18n: I18nInstance<"greeting", "en" | "fr"> = $i18n({ translations: { greeting: { en: "Hi", fr: "Salut" } } });

$effect(() => {}, ["every(0)", "debounce(250)", "throttle(16)"]);
