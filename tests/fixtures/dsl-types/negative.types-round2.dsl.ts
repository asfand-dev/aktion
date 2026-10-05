// Negative corpus for the round-2 declaration fixes: `ComponentOptions`, the
// `unknown` slots, the infinite `$query` bag without `onDone`, the nullable
// `$util.pick` / `omit` results, the aggregate helpers' input and the widened
// `$head` link shape. Directive format and layer tags: see negative.dsl.ts.
import {
  $head, $http, $query, $util, Text, slots,
  type AktionNode, type ComponentOptions,
} from "aktion-runtime/dsl";

interface User { id: number; name: string }

export function Item(label: string, _opts?: ComponentOptions): AktionNode {
  return Text(label);
}

// ---- ComponentOptions -----------------------------------------------------------------
// @ts-expect-error TS2353 only `key` is read from the options literal (any other key is bound to `_opts` and ignored)
Item("a", { key: "a", label: "b" });
// @ts-expect-error TS2322 a key is a string or a number
Item("a", { key: true });

// ---- children: only an untyped caller passes extra arguments ----------------------------
export function Box(title: string): AktionNode {
  return Text(title);
}
// @ts-expect-error TS2554 a typed call cannot pass more arguments than declared: give Box a `children` parameter
Box("t", Text("extra"));

// ---- slots: values are unknown --------------------------------------------------------
// @ts-expect-error TS2322 a slot is not known to be a node: cast it (`slots.header as Children`)
const header: AktionNode = slots.header;
// @ts-expect-error TS18046 a slot is not known to be callable: narrow it first
slots.onClose();

// ---- data ---------------------------------------------------------------------------------
const feed = $query<User>({ url: "/feed", infinite: { limit: 10 } });
// @ts-expect-error TS2339 an infinite query never calls onDone: assigning one is a silent no-op
feed.onDone = () => {};
const user = $http<User>({ url: "/me" });
// @ts-expect-error TS2322 pick on data that may not be loaded yet gives `{}`: every picked key is optional
const name: string = $util.pick(user.data, ["name"]).name;
// @ts-expect-error TS2322 … and so does omit
const id: number = $util.omit(user.data, ["name"]).id;
// @ts-expect-error TS2322 pick keys must be keys of the (non-null) data
$util.pick(user.data, ["email"]);

// ---- aggregates: unknown input is accepted, a known non-array is not ---------------------------
// @ts-expect-error TS2345 [types] a string is not a list: count reads it as [] (0, not its length)
$util.count("abc");
// @ts-expect-error TS2345 [types] a Set is not a list: join reads it as [] ("")
$util.join(new Set(["a", "b"]), ",");

// ---- $head ---------------------------------------------------------------------------------
// @ts-expect-error TS2322 [types] rel is matched case-insensitively, but stylesheet stays dropped
$head({ link: [{ rel: "Stylesheet", href: "/x.css" }] });
// @ts-expect-error TS2322 [types] crossOrigin is the crossorigin attribute, with its three values
$head({ link: { rel: "preconnect", href: "https://cdn.example", crossOrigin: "always" } });
// @ts-expect-error TS2353 [types] fetchPriority (fetchpriority) is not an attribute $head keeps
$head({ link: { rel: "icon", href: "/favicon.svg", fetchPriority: "high" } });
// @ts-expect-error TS2322 [types] a boolean is stringified to "true"
$head({ link: { rel: "icon", href: "/favicon.svg", sizes: true } });

// ---- callbacks whose result the runtime reads keep their type ---------------------------------
// @ts-expect-error TS2345 [types] a navigation guard's number neither blocks nor redirects (only false / a path string do)
$util.onNavigate(() => 5);

export { header, name, id };
