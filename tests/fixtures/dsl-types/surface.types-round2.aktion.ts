// Positive fixture for the round-2 declaration fixes. It must type-check with
// and without the DOM lib; nothing here is expected to fail.
import {
  $dom, $effect, $head, $http, $mutation, $query, $socket, $sse, $toast, $util,
  Button, Column, Text,
  children, cleanup, clearInterval, clearTimeout, setInterval, setTimeout, slots,
  type AktionNode, type Children, type ComponentOptions, type DomElement,
} from "aktion-runtime/dsl";

interface Row { id: number; name: string }

export let $page = 1;

// ---- ComponentOptions: a typed key, bound positionally ------------------------------------------

export function Item(label: string, _opts?: ComponentOptions): AktionNode {
  return Text(label);
}

export function Shell(title: string, children: Children): AktionNode {
  return Column([Text(title), children]);
}

export const items: AktionNode[] = ["a", "b"].map((id) => Item(id, { key: id }));
export const numbered: AktionNode = Item("c", { key: 3 });
export const bare: AktionNode = Item("d");
export const shell: AktionNode = Shell("S", [Text("child"), null]);

// ---- slots are unknown: narrow before calling, cast to render ----------------------------------

export function Panel(title: string): AktionNode {
  const onClose = slots.onClose;
  return Column([
    Text(title),
    slots.header as Children,
    children,
    Button("Close", { onClick: () => { if (typeof onClose === "function") onClose(); } }),
  ]);
}

// ---- callbacks whose result is ignored may return anything (a Promise included) ---------------

export const $todos = $query<Row[]>({ url: "/api/todos" });
export const create = $mutation<Row>({ url: "/api/todos", optimistic: () => $todos.refetch() });
create.onDone = () => $todos.refetch();
export const $user = $http<Row>({ url: "/api/me" });
$user.onDone = (resource) => resource.refetch();
export const live = $socket<{ type: string }>({ url: "wss://example.invalid/live", onMessage: () => $todos.refetch() });
export const events = $sse<string>({ url: "/api/events", onMessage: (message) => $toast.info(message) });
$util.onError((info) => $toast.error(info.source));

$effect(() => $todos.refetch(), [$page]);
$effect(() => {
  const timer = setInterval(() => $todos.refetch(), 1000);
  const once = setTimeout(() => $todos.refetch(), 10);
  cleanup(() => $todos.refetch());
  cleanup(() => { clearInterval(timer); clearTimeout(once); });
}, ["mount"]);

export function observe(node: DomElement | null): () => void {
  const stopResize = $dom.onResize(node, () => $todos.refetch());
  const stopIntersect = $dom.onIntersect(node, (entry) => (entry.isIntersecting ? $todos.refetch() : null));
  const stopMutation = $dom.onMutation(node, (records) => records.length);
  return () => { stopResize(); stopIntersect(); stopMutation(); };
}

// ---- $util on data that is untyped or not loaded yet ---------------------------------------------

export const $untyped = $query({ url: "/api/stats" });
export const total: number =
  $util.count($untyped.data) + $util.sum($untyped.data) + $util.avg($untyped.data) + $util.min($untyped.data) + $util.max($untyped.data);
export const joined: string = $util.join($untyped.data, ", ");
export const counted: number = $util.count($todos.data) + $util.sum($todos.data?.map((t) => t.id));
export const picked: { readonly name?: string } = $util.pick($user.data, ["name"]);
export const rest: { readonly name?: string } = $util.omit($user.data, ["id"]);
export const exact: { name: string } = $util.pick({ id: 1, name: "a" }, ["name"]);
export const typedRows: Row[] | undefined = $todos.data;

// ---- $head: what sanitiseLinkEntry keeps ------------------------------------------------------------

$head({
  link: [
    { rel: "Canonical", href: "/a", crossOrigin: "anonymous", referrerPolicy: "no-referrer", hrefLang: "de" },
    { rel: "ICON", href: "/favicon.png", sizes: 32, type: "image/png", media: null },
    { rel: "Shortcut icon", href: "/favicon.ico", crossorigin: "", title: 2026 },
  ],
  htmlAttrs: { lang: "en", dir: null, "data-theme": "dark" },
});
