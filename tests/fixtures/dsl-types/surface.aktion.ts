// Positive fixture: one use of every `$`-builtin and injected name, and every
// library calling convention the declarations model. It must type-check with
// and without the DOM lib; nothing here is expected to fail.
import {
  $app, $console, $dom, $effect, $emit, $form, $head, $http, $i18n, $id, $memo, $mutation, $optimistic,
  $query, $reducer, $ref, $router, $script, $socket, $sse, $state, $storage, $store, $theme, $toast, $util,
  Async, Badge, Button, Callout, Card, Col, Column, DescriptionItem, IconButton, Input, Map, MenuSeparator,
  Row, Select, SelectItem, Show, Spacer, TabItem, Table, Tabs, Text,
  children, cleanup, clearInterval, outlet, params, route, setInterval, setTimeout, clearTimeout, slots,
  type AktionNode, type Children, type HttpResource, type ButtonVariant,
} from "aktion-runtime/dsl";

type Tab = "overview" | "settings";

export let $tick = 0;
export let $search = "";
export let $tab: Tab = "overview";

// ---- calling conventions --------------------------------------------------

export function Toolbar(variant: ButtonVariant): AktionNode {
  return Row([
    Button("Save", { variant, size: "lg", onClick: () => {}, key: "save", sx: { p: "md" }, testId: "save" }),
    Button({ label: "Save", tone: "danger" }),                    // all-named bag, alias spelling
    Button("Icon", { icon: "plus", iconOnly: true, size: "small" }), // legacy size token
    Button("Next", () => {}),                                     // positional #1 → onClick
    IconButton("trash", "Delete", { onClick: () => {} }),         // positional run, then the bag
    Badge(3),                                                     // string slots accept numbers (asString)
    Spacer(),                                                     // optional positional omitted
    MenuSeparator(),                                              // zero-prop component
  ], { gap: { base: "sm", md: "lg" }, align: "center" });         // responsive enum prop
}

export function Layouts(): Children {
  const m = new Map<string, number>([["a", 1]]);                  // the JS Map constructor …
  const first: number | undefined = m.get("a");
  return [
    Map(52.52, { lng: 13.4, zoom: first ?? 12 }),                 // … and the Map component
    Callout("Heads up", { variant: "warning" }),                  // positional slot is index 1 (title)
    Callout("Saved", "success"),                                  // positional #1 → slot 0 (tone)
    Card([Text("body")], { variant: "outlined", padding: "none" }),
    Card(Text("single child")),                                   // a Node[] slot takes one node
    Column([[Text("nested")], null, undefined, 3, "s"]),          // nested arrays, null, numbers, strings
    Show(true, [Text("visible")], { fallback: Text("hidden") }),
    Tabs([TabItem("a", { label: "A", children: [Text("A body")] })], { defaultValue: "a" }),
    Select("country", { items: [SelectItem("de", "Germany"), { value: "fr", label: "France" }, "Spain"], label: "Country" }),
    SelectItem("at", "Austria", { disabled: true }),
    DescriptionItem("Region", "eu-central"),
    Table([Col("Name", ["a", "b"], null, "right"), Col("Size", [1, 2])]),
    Row(["a", "b"].map((label) => Badge(label))),
  ];
}

// ---- hooks + effects -------------------------------------------------------

export function Counter(): AktionNode {
  const [count, setCount] = $state(0);
  const [label] = $state<string>();
  const doubled = $memo(() => count * 2, [count]);
  const box = $ref<number | null>(null);
  const [items, dispatch] = $reducer((s: string[], a: { type: "add"; text: string }) => [...s, a.text], [] as string[]);
  const id = $id("counter");
  $effect(() => {
    const timer = setInterval(() => setCount((c) => c + 1), 1000);
    cleanup(() => clearInterval(timer));
  }, ["mount", "every(1000)", "debounce(300)", $tick, $search]);
  $effect(() => {
    const once = setTimeout(() => setCount(0), 10);
    cleanup(() => clearTimeout(once));
  }, [$tab, "throttle(50)", "unmount"]);
  $effect(() => {});
  box.current = doubled;
  return Row([
    Text(`count ${count} ${label ?? ""}`, { id }),
    Text(items.length),
    Button("+", { onClick: () => { setCount(count + 1); dispatch({ type: "add", text: "x" }); } }),
  ]);
}

export function Panel(title: string): AktionNode {
  return Card([Text(title), slots.header, children]);
}

// ---- $store / $form ---------------------------------------------------------

export const cart = $store({
  items: [] as string[],
  total: 0,
  add: (s, item: string) => { s.items = [...s.items, item]; },
  persist: "cart",
  history: true,
});

export function addApple(): number {
  cart.add("apple");
  cart.items = [...cart.items, "pear"];
  if (cart.canUndo) cart.undo();
  return cart.total;
}

export const save = $mutation<{ ok: boolean }>({ url: "/api/save", invalidates: ["/api/users"] });
export const signup = $form({
  values: { email: "", age: 0 },
  rules: { email: [$util.rules.required(), $util.rules.email()] },
  onSubmit: (values) => save.mutate({ body: values }),
});

export function SignupForm(): AktionNode {
  const email = signup.field("email");
  return Column([
    Input("email", { label: "Email", value: signup.values.email, error: email.error, onChange: email.onChange, onBlur: email.onBlur }),
    Button("Sign up", { onClick: () => signup.submit(), disabled: !signup.valid || signup.submitting }),
  ]);
}

// ---- data -------------------------------------------------------------------

export const $users = $http<{ id: number; name: string }[]>({ url: "/api/users", method: "get", query: { page: 1 } });
export const feed = $query<{ id: number }>({ url: "/api/feed", infinite: { limit: 20 } });
export const cached = $query<string[]>({ url: "/api/tags", ttl: 60000 });
export const live = $socket<{ type: string }>({ url: "wss://example.invalid/live", reconnect: true });
export const events = $sse({ url: "/api/events", onMessage: (message) => $console.log(message) });
export const sdk = $script<{ version: string }>({ src: "https://example.invalid/sdk.js", global: "Sdk" });

export function wire(resource: HttpResource<{ id: number; name: string }[]>): void {
  resource.onDone = (r) => {
    if (r.error) $toast.error("failed", { title: "Users" });
  };
  feed.loadMore().then(() => $console.info(feed.page, feed.hasMore, feed.data.length));
  save.reset();
  live.send({ type: "ping" });
  $console.log(live.last?.type, events.status, sdk.value?.version, cached.data?.length);
}

export function Users(): AktionNode {
  return Async($users, {
    loading: Text("Loading…"),
    data: Column($users.data?.map((u) => Text(u.name, { key: u.id })) ?? []),
    retry: () => $users.refetch(),
  });
}

// ---- namespaces ---------------------------------------------------------------

export function helpers(): string {
  $util.copy("x").then((ok) => $toast.success(ok ? "copied" : "failed"));
  $util.url.setQuery("tab", "settings");
  $util.url.setQuery({ tab: null });
  $storage.local.set("k", 1);
  $storage({}).cookies.remove("k", { path: "/" });
  $dom.measure(null);
  $emit("saved", { id: 1 });
  $optimistic(() => { $tick = $tick + 1; });
  const parsed: number | null = $util.duration.parse("5m");
  const wide: boolean = $util.viewport.width > 640 && $util.breakpoint.md;
  return `${$util.slugify("Hello World")} ${$util.style.cx("a", { b: wide })} ${parsed ?? 0} ${route.path}`;
}

const { t } = $i18n({ translations: { hi: { en: "Hello {name}" } }, currentLanguage: "en" });
$theme({ name: "dark", colors: { primary: "#0969da" } });
$head({ title: "Surface", meta: { description: "fixture" } });

// ---- routing + the entry ------------------------------------------------------------

export const view = $router({
  "/": Counter(),
  "/users/:id": Text(`user ${params.id ?? "?"}`),
  "/settings": { layout: Column([Text("Settings"), outlet]), routes: { "/profile": Text("Profile") } },
  default: Text(`not found: ${route.path}`),
});

export default $app(view, Toolbar("primary"), Text(t("hi", { name: "Ada" })));
