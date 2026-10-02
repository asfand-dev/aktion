/**
 * Declarations for everything that is not a library component: the shared
 * prelude (`AktionNode`, `Children`, `BaseProps`, …), the `$`-builtins, their
 * config objects and resource handles, and the names the runtime injects.
 *
 * The SHAPES here are curated (the runtime's own TS types are untyped `unknown`
 * bags where a DSL author wants generics, or mention DOM types the DSL never
 * sees), but nothing here is free to drift:
 *
 *   - config interfaces are built from the language catalogue's config keys
 *     (`findBuiltinConfig`), with type overrides where the catalogue's hint is
 *     coarser than the runtime;
 *   - every curated member list is checked against the catalogue member list
 *     for the same handle, and generation FAILS on a mismatch — a member added
 *     to the catalogue without a type here cannot ship untyped;
 *   - `$util`'s static helpers, `$util.style`, `$util.rules`, `$util.duration`,
 *     the env snapshots and `OpenedWindow` are printed from the runtime source
 *     (see `runtime-types.ts`);
 *   - JSDoc comes from the catalogue summaries.
 */
import type * as TS from "typescript";
import type { BuiltinEntry } from "../../src/language/builtins.js";
import type { ConfigKey, FactoryResourceEntry, NamespaceEntry, NamespaceMember } from "../../src/language/namespaces.js";
import type { LibGlobals, PrintedMember, RuntimeTypes } from "./runtime-types.js";
import { byCodePoint, jsdoc, propKey } from "./components.js";
import { compileTypeString } from "./typestr.js";

export interface BuiltinsInput {
  ts: typeof TS;
  builtinCatalog: readonly BuiltinEntry[];
  namespaceCatalog: readonly NamespaceEntry[];
  factoryResourceCatalog: readonly FactoryResourceEntry[];
  routeMembers: readonly NamespaceMember[];
  i18nResultMembers: readonly NamespaceMember[];
  findBuiltinConfig: (bareName: string) => readonly ConfigKey[] | undefined;
  universalProps: ReadonlyArray<{ name: string; type: string; description?: string }>;
  universalPropNames: ReadonlySet<string>;
  responsiveBreakpoints: readonly string[];
  themeNames: readonly string[];
  runtimeTypes: RuntimeTypes;
  libGlobals: LibGlobals;
}

export interface BuiltinsOutput {
  /** Prelude: core value types + `BaseProps`, emitted before the components. */
  prelude: string;
  /** `$`-builtins and their support types, emitted after the components. */
  builtins: string;
  /** Injected (non-`$`) names, emitted last. */
  injected: string;
  /** Every top-level name these sections declare (values and types). */
  declaredNames: string[];
  /** Exported VALUE names: `$`-builtins and injected names. */
  valueExports: string[];
}

/**
 * Non-`$` names the runtime binds without a declaration, and why each is (or is
 * not) exported from `aktion-runtime/dsl`. The manifest lists all of them; the
 * JS-semantics layer decides which are reserved.
 */
export const INJECTED_NAMES: Readonly<Record<string, { exported: boolean; reason: string }>> = {
  route: { exported: true, reason: "the reactive router handle (`route.path`, `route.navigate(…)`)" },
  params: { exported: true, reason: "path params, bound inside `$router` arms" },
  outlet: { exported: true, reason: "the matched child route, bound inside a layout arm's `layout`" },
  children: { exported: true, reason: "extra positional arguments, bound inside a user component's body" },
  slots: { exported: true, reason: "named props that matched no parameter, bound inside a user component's body" },
  cleanup: { exported: true, reason: "registers a teardown, bound inside an `$effect` body" },
  setTimeout: { exported: true, reason: "tracked timer (cleared when the program is torn down)" },
  setInterval: { exported: true, reason: "tracked timer (cleared when the program is torn down)" },
  clearTimeout: { exported: true, reason: "clears a tracked timer" },
  clearInterval: { exported: true, reason: "clears a tracked timer" },
  aktion: { exported: false, reason: "the legacy `aktion = …` UI-root binding — use `$app(…)`" },
  theme: { exported: false, reason: "the legacy `theme = $theme(…)` binding — call `$theme(…)` as a statement" },
};

/**
 * `$`-builtins whose call returns a plain bag of functions rather than a
 * reactive handle. Classified with the namespaces in the manifest: `$i18n(…)`
 * returns `{ t, setCurrentLanguage, getCurrentLanguage }`, which is safe to
 * destructure (unlike a `$store` / `$form` handle).
 */
export const NAMESPACE_LIKE_BUILTINS: ReadonlySet<string> = new Set(["i18n"]);

/** Split `builtinCatalog` into the manifest's four `$`-name lists. */
export function classifyBuiltins(
  builtinCatalog: readonly BuiltinEntry[],
  factoryResourceCatalog: readonly FactoryResourceEntry[],
): { hooks: string[]; factories: string[]; namespaces: string[]; builtins: string[] } {
  const factorySet = new Set(factoryResourceCatalog.map((f) => f.factory));
  const out = { hooks: [] as string[], factories: [] as string[], namespaces: [] as string[], builtins: [] as string[] };
  for (const entry of builtinCatalog) {
    if (entry.category === "hook") out.hooks.push(entry.name);
    else if (factorySet.has(entry.name)) out.factories.push(entry.name);
    else if (entry.namespace || NAMESPACE_LIKE_BUILTINS.has(entry.name)) out.namespaces.push(entry.name);
    else out.builtins.push(entry.name);
  }
  for (const factory of factorySet) {
    if (!out.factories.includes(factory)) {
      throw new Error(`emit-dsl-types: factory resource "${factory}" has no builtinCatalog entry`);
    }
  }
  for (const list of Object.values(out)) list.sort(byCodePoint);
  return out;
}

type Member = readonly [name: string, declaration: string];

export function emitBuiltins(input: BuiltinsInput): BuiltinsOutput {
  const { ts } = input;
  const declared: string[] = [];
  const typeName = (name: string): string => {
    declared.push(name);
    return name;
  };

  /* ---------------------------------------------------------------- helpers */

  const docsOf = (members: readonly NamespaceMember[], prefix = ""): Map<string, string> =>
    new Map(members.filter((m) => m.name.startsWith(prefix)).map((m) => [m.name.slice(prefix.length), m.summary]));

  /** Fail generation when a curated member list and the catalogue disagree. */
  const expectMembers = (label: string, declaredNames: readonly string[], catalogueNames: readonly string[]): void => {
    const d = new Set(declaredNames);
    const c = new Set(catalogueNames);
    const missing = [...c].filter((n) => !d.has(n)).sort(byCodePoint);
    const extra = [...d].filter((n) => !c.has(n)).sort(byCodePoint);
    if (missing.length || extra.length) {
      throw new Error(
        `emit-dsl-types: ${label} — the declared members and the language catalogue disagree.\n` +
          `  in the catalogue, not declared: ${JSON.stringify(missing)}\n` +
          `  declared, not in the catalogue: ${JSON.stringify(extra)}\n` +
          "  Update scripts/dsl-types/builtins.ts and src/language/namespaces.ts together.",
      );
    }
  };

  const body = (members: readonly Member[], docs: ReadonlyMap<string, string> = new Map()): string =>
    members.map(([name, decl]) => `${jsdoc(docs.get(name), "  ")}  ${decl};`).join("\n");

  const iface = (head: string, members: readonly Member[], docs?: ReadonlyMap<string, string>, doc?: string): string =>
    `${jsdoc(doc)}export interface ${head} {\n${body(members, docs)}\n}`;

  const printed = (members: readonly PrintedMember[]): Member[] =>
    members.map((m) => [m.name, `readonly ${propKey(m.name)}: ${m.type}`] as const);
  const printedDocs = (members: readonly PrintedMember[]): Map<string, string> =>
    new Map(members.filter((m) => m.docs).map((m) => [m.name, m.docs]));

  const catalogueMembers = (factory: string): readonly NamespaceMember[] => {
    const entry = input.factoryResourceCatalog.find((f) => f.factory === factory);
    if (!entry) throw new Error(`emit-dsl-types: no factory resource catalogue entry for "${factory}"`);
    return entry.members;
  };
  const namespaceMembers = (name: string): readonly NamespaceMember[] => {
    const entry = input.namespaceCatalog.find((n) => n.name === name);
    if (!entry) throw new Error(`emit-dsl-types: no namespace catalogue entry for "${name}"`);
    return entry.members;
  };
  const summaryOf = (name: string): string => {
    const entry = input.builtinCatalog.find((b) => b.name === name);
    if (!entry) throw new Error(`emit-dsl-types: no builtinCatalog entry for "$${name}"`);
    return entry.summary;
  };

  const compile = (hint: string): string =>
    compileTypeString(hint.replace(/^enum:\s*/, ""), {
      ts,
      componentNames: new Set(),
      unresolved: new Set(),
    });

  /**
   * A config interface from the catalogue's config keys. `overrides` maps a key
   * to its type where the catalogue's hint (`"object"`, `"string[]"`) is coarser
   * than what the runtime reads.
   */
  const configInterface = (
    builtin: string,
    head: string,
    spec: { required?: readonly string[]; overrides?: Readonly<Record<string, string>>; extra?: readonly Member[]; extraDocs?: ReadonlyMap<string, string> } = {},
  ): string => {
    const keys = input.findBuiltinConfig(builtin);
    if (!keys) throw new Error(`emit-dsl-types: no config catalogue for "$${builtin}"`);
    for (const key of Object.keys(spec.overrides ?? {})) {
      if (!keys.some((k) => k.name === key)) {
        throw new Error(`emit-dsl-types: type override for $${builtin} config key "${key}", which the catalogue does not list`);
      }
    }
    const required = new Set(spec.required ?? []);
    const members: Member[] = keys.map((k) => [
      k.name,
      `${propKey(k.name)}${required.has(k.name) ? "" : "?"}: ${spec.overrides?.[k.name] ?? compile(k.type)}`,
    ]);
    const docs = new Map(keys.map((k) => [k.name, k.summary]));
    for (const [name, text] of spec.extraDocs ?? []) docs.set(name, text);
    return iface(head, [...members, ...(spec.extra ?? [])], docs);
  };

  /* ---------------------------------------------------------------- prelude */

  const universalDocs = new Map(input.universalProps.map((p) => [p.name, p]));
  const UNIVERSAL_TYPES: Readonly<Record<string, string>> = {
    sx: "SxProps",
    animate: "AnimateValue",
    style: "string | Readonly<Record<string, string | number>>",
    aria: "Readonly<Record<string, string | number | boolean | null | undefined>>",
    data: "Readonly<Record<string, string | number | boolean | null | undefined>>",
    dataAttrs: "Readonly<Record<string, string | number | boolean | null | undefined>>",
  };
  const universalMembers: Member[] = [...input.universalPropNames].sort(byCodePoint).map((name) => [
    name,
    `${propKey(name)}?: ${UNIVERSAL_TYPES[name] ?? compile(universalDocs.get(name)?.type ?? "any")}`,
  ]);
  const universalMemberDocs = new Map(input.universalProps.map((p) => [p.name, p.description ?? ""]));
  universalMemberDocs.set("key", "Stable identity for per-instance state across re-orders. Read only from the LAST argument, which must be the named-props object literal.");

  const breakpoints = input.responsiveBreakpoints;
  const prelude = [
    `/** Brand of {@link AktionNode} — never exists at runtime. */`,
    `declare const __aktionNode: unique symbol;`,
    jsdoc("The value a component call produces: an opaque UI node, phantom-branded with the component name (`AktionNode<\"Button\">`). Only component calls create one.") +
      `export interface ${typeName("AktionNode")}<N extends string = string> {\n  readonly [__aktionNode]: N;\n}`,
    jsdoc("One renderable value. `boolean` is deliberately excluded: the renderer prints a boolean as the text \"true\"/\"false\", so the React habit `cond && X` shows \"false\" — write `cond ? X : null`.") +
      `export type ${typeName("AktionChild")} = AktionNode | string | number | null | undefined;`,
    jsdoc("Renderable children: one child, or (nested) arrays of children.") +
      `export type ${typeName("Children")} = AktionChild | readonly Children[];`,
    jsdoc("Any function value passed as an event handler / callback prop. The library declares no handler signatures, so arguments are untyped.") +
      `export type ${typeName("Callable")} = (...args: any[]) => unknown;`,
    jsdoc("Content-addressed identity override (`key:`), accepted by every component call.") +
      `export type ${typeName("Key")} = string | number;`,
    jsdoc(`A breakpoint map honoured by responsive layout props (${breakpoints.join(" / ")}).`) +
      `export type ${typeName("Responsive")}<T> = { ${breakpoints.map((b) => `readonly ${b}?: T`).join("; ")} };`,
    jsdoc("Exactly one spelling (a prop or one of its aliases) of a required prop.") +
      `export type ${typeName("OneOf")}<K extends string, T> = { [P in K]: { [Q in P]: T } & { [Q in Exclude<K, P>]?: never } }[K];`,
    jsdoc("Token-aware style object (`sx: { p: \"md\", bg: \"surface\" }`). Keys are validated by the runtime, not by these types.") +
      `export interface ${typeName("SxProps")} {\n  readonly [key: string]: unknown;\n}`,
    jsdoc("An animation preset name, or a preset with timing overrides.") +
      `export type ${typeName("AnimateValue")} = string | { readonly preset?: string; readonly name?: string; readonly duration?: number | string; readonly delay?: number | string; readonly easing?: string; readonly repeat?: number | boolean | "infinite" };`,
    jsdoc("`{ value, label }` option objects accepted next to `SelectItem` nodes by Select / Radio / Combobox / MultiSelect.") +
      `export interface ${typeName("SelectItemData")} {\n  readonly value: string | number;\n  readonly label?: string;\n  readonly disabled?: boolean;\n  readonly group?: string;\n}`,
    jsdoc("`{ label, message }` objects accepted next to `FollowUpItem` nodes by `FollowUpBlock`.") +
      `export interface ${typeName("FollowUpItemData")} {\n  readonly label: string;\n  readonly message?: string;\n  readonly disabled?: boolean;\n}`,
    jsdoc("`{ name, src }` objects accepted next to `Avatar` nodes by `AvatarGroup`.") +
      `export interface ${typeName("AvatarItemData")} {\n  readonly name?: string;\n  readonly src?: string;\n  readonly status?: string;\n  readonly fallback?: string;\n}`,
    iface(
      typeName("BaseProps"),
      [["key", "key?: Key"], ...universalMembers],
      universalMemberDocs,
      "Props every component accepts: `key` plus the universal style / behaviour channel.",
    ),
  ].join("\n");

  /* ---------------------------------------------------------------- $-builtins */

  const rt = input.runtimeTypes;
  const themeNames = [...input.themeNames].sort(byCodePoint);
  const decls: Record<string, string[]> = {};
  const builtin = (name: string, ...lines: string[]): void => {
    decls[name] = lines;
  };

  // ---- hooks
  builtin("state",
    "export declare function $state<T>(initial: T): [value: T, setValue: StateSetter<T>];",
    "export declare function $state<T = undefined>(): [value: T | undefined, setValue: StateSetter<T | undefined>];");
  builtin("memo", "export declare function $memo<T>(compute: () => T, deps?: readonly unknown[]): T;");
  builtin("ref",
    "export declare function $ref<T>(initial: T): RefBox<T>;",
    "export declare function $ref<T = undefined>(): RefBox<T | undefined>;");
  builtin("reducer", "export declare function $reducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [state: S, dispatch: (action: A) => void];");
  builtin("id", "export declare function $id(prefix?: string): string;");
  // ---- effects
  builtin("effect", "export declare function $effect<const D extends readonly unknown[] = []>(body: () => void, deps?: EffectDependencies<D>): void;");
  builtin("optimistic", "export declare function $optimistic<T>(fn: () => T): T;");
  builtin("store", "export declare function $store<C extends { readonly [key: string]: unknown }>(config: C & StoreOptions & { readonly [key: string]: ((s: any, ...args: any[]) => unknown) | {} | null | undefined }): Store<C>;");
  builtin("form", "export declare function $form<V extends FormValues = FormValues>(config?: FormConfig<V>): FormHandle<V>;");
  // ---- data
  builtin("http", "export declare function $http<T = unknown>(config: HttpConfig): HttpResource<T>;");
  builtin("query",
    "export declare function $query<T = unknown>(config: QueryConfig & { readonly infinite?: undefined }): HttpResource<T>;",
    "export declare function $query<Item = unknown>(config: QueryConfig & { readonly infinite: InfiniteConfig }): InfiniteQueryResource<Item>;");
  builtin("mutation", "export declare function $mutation<T = unknown>(config: MutationConfig): MutationResource<T>;");
  builtin("socket", "export declare function $socket<M = unknown>(config: SocketConfig): SocketResource<M>;");
  builtin("sse", "export declare function $sse<M = unknown>(config: SseConfig): SseResource<M>;");
  builtin("script", "export declare function $script<V = unknown>(config: ScriptConfig): ScriptResource<V>;");
  builtin("head", "export declare function $head(config: HeadConfig): null;");
  builtin("i18n", "export declare function $i18n(config?: I18nConfig): I18nInstance;");
  // ---- app / routing / theme / events
  builtin("app", "export declare function $app(root: AktionNode | readonly Children[] | null, ...more: Children[]): CompiledProgram;");
  builtin("router", "export declare function $router(routes: RouteTable): AktionNode | null;");
  builtin("theme", "export declare function $theme(config: ThemeConfig): ThemeHandle;");
  builtin("emit", "export declare function $emit(name: string, detail?: unknown): void;");
  // ---- namespaces
  builtin("util", "export declare const $util: AktionUtil;");
  builtin("storage", "export declare const $storage: StorageRoot & ((config?: object) => StorageRoot);");
  builtin("console", "export declare const $console: ConsoleNamespace;");
  builtin("toast", "export declare const $toast: ToastManager;");
  builtin("dom", "export declare const $dom: DomManager;");

  expectMembers("$-builtin declarations", Object.keys(decls), input.builtinCatalog.map((b) => b.name));

  const extraDocs: Readonly<Record<string, string>> = {
    state: "The initializer is a VALUE (it is not called). The setter takes a value or an updater `prev => next` and no-ops when `Object.is`-equal.",
    app: "The return type is a type-level fiction: `export default $app(App())` gives host code a typed `CompiledProgram` default import. A bare string/number root is a validation error (root-not-renderable).",
    effect: "`body` must be an inline arrow or function expression (a function reference parses to an empty body). Deps must be an array LITERAL of `$` atoms (or member paths such as `$user.name`) and trigger strings; empty or omitted deps mean `[\"mount\"]`. Return nothing from the body — register teardown with `cleanup(fn)`.",
    store: "Non-function entries become reactive state, function entries become methods `(s, ...args) => …` whose first parameter is the store handle — typed `any` inside the method, because TypeScript cannot infer a handle from the object literal it is defined in; callers of the returned store ARE fully typed. One store per call site.",
    query: "With `infinite: {…}` the bag accumulates pages (`.loadMore()`, `.hasMore`, `.data` is the flattened items).",
    http: "`T` is an unchecked assertion about the response body; `data` is `undefined` until the first successful response.",
    router: "Must be called with an object LITERAL: arms are evaluated lazily and only the matching one runs. Returns the matched arm's tree, or null when nothing matches and there is no `default`.",
    head: "Returns null — call it as a statement.",
    storage: "Also callable: `$storage({...})` returns the same namespace.",
  };

  const effectHelpers = [
    jsdoc("String triggers the `$effect` dependency parser understands. The `${bigint}` holes reject `\"every(1.5)\"`.") +
      `export type ${typeName("EffectTrigger")} = "mount" | "unmount" | \`every(\${bigint})\` | \`debounce(\${bigint})\` | \`throttle(\${bigint})\`;`,
    `type __IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;`,
    `type __CheckDependency<E> = [E] extends [string] ? (string extends E ? E : true extends __IsUnion<E> ? E : E extends EffectTrigger ? E : EffectTrigger) : E;`,
    jsdoc("Checks an `$effect` dependency array: an entry whose type is ONE string literal must be an `EffectTrigger`; anything else is read as a `$` atom (or member path) and passes. Caveat: an atom TypeScript has narrowed to a single literal (`let $tab: Tab = \"a\"` read in the same scope) looks like a literal too — widen it (`$tab as Tab`).") +
      `export type ${typeName("EffectDependencies")}<D extends readonly unknown[]> = { readonly [I in keyof D]: __CheckDependency<D[I]> };`,
  ];

  // ---- $store
  const storeMembers = catalogueMembers("store");
  const storeHistory: Member[] = [
    ["canUndo", "readonly canUndo: boolean"],
    ["canRedo", "readonly canRedo: boolean"],
    ["undo", "undo(): void"],
    ["redo", "redo(): void"],
    ["clearHistory", "clearHistory(): void"],
  ];
  expectMembers("$store handle (history members)", storeHistory.map(([n]) => n), storeMembers.map((m) => m.name));
  const storeSection = [
    `type __AnyFn = (...args: any[]) => any;`,
    `type __StoreOptionKey = "persist" | "persistIn" | "history";`,
    configInterface("store", typeName("StoreOptions"), {
      overrides: { persist: "string | true", persistIn: `"local" | "session"`, history: "boolean | number" },
    }),
    jsdoc("The reactive fields of a store (its non-function entries).") +
      `export type ${typeName("StoreFields")}<C> = { -readonly [K in keyof C as K extends __StoreOptionKey ? never : C[K] extends __AnyFn ? never : K]: C[K] };`,
    jsdoc("The methods of a store, pre-bound: the handle is injected as the first argument, so callers omit it.") +
      `export type ${typeName("StoreMethods")}<C> = { readonly [K in keyof C as K extends __StoreOptionKey ? never : C[K] extends __AnyFn ? K : never]: C[K] extends (s: any, ...args: infer A) => infer R ? (...args: A) => R : never };`,
    iface(typeName("StoreHistory"), storeHistory, docsOf(storeMembers), "Undo / redo members added by `history: true | depth`."),
    jsdoc("A `$store(…)` handle. Read fields as `store.field`; destructuring a handle reads `undefined`.") +
      `export type ${typeName("Store")}<C> = StoreFields<C> & StoreMethods<C> & ("history" extends keyof C ? (C extends { readonly history: false | 0 } ? {} : StoreHistory) : {});`,
  ];

  // ---- $form
  const formMembers = catalogueMembers("form");
  const formHandle: Member[] = [
    ["values", "values: V"],
    ["errors", "readonly errors: { readonly [K in keyof V]?: string }"],
    ["touched", "readonly touched: { readonly [K in keyof V]?: boolean }"],
    ["dirty", "readonly dirty: boolean"],
    ["valid", "readonly valid: boolean"],
    ["submitting", "readonly submitting: boolean"],
    ["validating", "readonly validating: boolean"],
    ["field", "field<K extends keyof V & string>(name: K): FieldBinding<V[K]>"],
    ["touch", "touch(name: keyof V & string): void"],
    ["setField", "setField<K extends keyof V & string>(name: K, value: V[K]): void"],
    ["setValues", "setValues(values: Partial<V>): void"],
    ["validate", "validate(): boolean | Promise<boolean>"],
    ["validateField", "validateField(name: keyof V & string): string | null | Promise<string | null>"],
    ["submit", "submit(extra?: unknown): unknown"],
    ["handleSubmit", "handleSubmit(extra?: unknown): unknown"],
    ["reset", "reset(): void"],
  ];
  expectMembers("$form handle", formHandle.map(([n]) => n), formMembers.map((m) => m.name));
  const formSection = [
    jsdoc("A validator from `$util.rules.*`: an error message, or null when valid (a Promise for async rules).") +
      `export type ${typeName("Validator")} = ${rt.validator};`,
    `export type ${typeName("FormValues")} = Record<string, unknown>;`,
    configInterface("form", `${typeName("FormConfig")}<V extends FormValues = FormValues>`, {
      overrides: {
        values: "V",
        rules: "{ readonly [K in keyof V]?: Validator | readonly Validator[] }",
        onSubmit: "(values: V, extra?: unknown) => unknown",
      },
    }),
    iface(`${typeName("FieldBinding")}<T>`, [
      ["name", "readonly name: string"],
      ["value", `readonly value: T | ""`],
      ["error", "readonly error: string | undefined"],
      ["onChange", "readonly onChange: (value: unknown) => void"],
      ["onBlur", "readonly onBlur: () => void"],
    ], undefined, "The controlled prop bag `form.field(name)` returns. Spreading it into a component call (`{ ...form.field(\"x\") }`) is DROPPED by the runtime — pass the members explicitly."),
    iface(`${typeName("FormHandle")}<V extends FormValues = FormValues>`, formHandle, docsOf(formMembers), "A `$form(…)` handle. Destructuring a handle reads `undefined` — read `form.values`, `form.valid`, …"),
  ];

  // ---- data layer
  const httpMembers = catalogueMembers("http");
  const queryMembers = catalogueMembers("query");
  const httpResource: Member[] = [
    ["state", "readonly state: ResourceState"],
    ["data", "readonly data: T | undefined"],
    ["error", "readonly error: unknown"],
    ["status", "readonly status?: number"],
    ["loading", "readonly loading: boolean"],
    ["headers", "readonly headers?: Readonly<Record<string, string>>"],
    ["lastUpdated", "readonly lastUpdated?: number"],
    ["refetch", "refetch(): Promise<void>"],
    ["cancel", "cancel(): void"],
    ["onDone", "onDone?: (resource: HttpResource<T>) => void"],
  ];
  expectMembers("$http resource", httpResource.map(([n]) => n), httpMembers.map((m) => m.name));
  const infiniteExtra: Member[] = [
    ["data", "readonly data: Item[]"],
    ["hasMore", "readonly hasMore: boolean"],
    ["loadingMore", "readonly loadingMore: boolean"],
    ["page", "readonly page: number"],
    ["pages", "readonly pages: readonly unknown[]"],
    ["loadMore", "loadMore(): Promise<void>"],
    ["onDone", "onDone?: (resource: InfiniteQueryResource<Item>) => void"],
  ];
  expectMembers("$query resource (plain + infinite)", [...new Set([...httpResource, ...infiniteExtra].map(([n]) => n))], queryMembers.map((m) => m.name));
  const mutationMembers = catalogueMembers("mutation");
  const mutationResource: Member[] = [
    ["data", "readonly data: T | undefined"],
    ["error", "readonly error: unknown"],
    ["loading", "readonly loading: boolean"],
    ["status", "readonly status?: number"],
    ["mutate", "mutate(overrides?: Partial<MutationConfig>): Promise<T | undefined>"],
    ["reset", "reset(): void"],
    ["onDone", "onDone?: (resource: MutationResource<T>) => void"],
  ];
  expectMembers("$mutation resource", mutationResource.map(([n]) => n), mutationMembers.map((m) => m.name));
  const socketMembers = catalogueMembers("socket");
  const socketResource: Member[] = [
    ["status", "readonly status: SocketStatus"],
    ["connected", "readonly connected: boolean"],
    ["last", "readonly last: M | null"],
    ["messages", "readonly messages: readonly M[]"],
    ["attempts", "readonly attempts: number"],
    ["error", "readonly error: unknown"],
    ["send", "send(data: unknown): void"],
    ["close", "close(): void"],
  ];
  expectMembers("$socket resource", socketResource.map(([n]) => n), socketMembers.map((m) => m.name));
  const sseMembers = catalogueMembers("sse");
  const sseResource: Member[] = [
    ["status", "readonly status: SocketStatus"],
    ["connected", "readonly connected: boolean"],
    ["last", "readonly last: M | null"],
    ["messages", "readonly messages: readonly M[]"],
    ["error", "readonly error: unknown"],
    ["close", "close(): void"],
  ];
  expectMembers("$sse resource", sseResource.map(([n]) => n), sseMembers.map((m) => m.name));
  const scriptMembers = catalogueMembers("script");
  const scriptResource: Member[] = [
    ["ready", "readonly ready: boolean"],
    ["loading", "readonly loading: boolean"],
    ["error", "readonly error: unknown"],
    ["value", "readonly value: V | null"],
  ];
  expectMembers("$script resource", scriptResource.map(([n]) => n), scriptMembers.map((m) => m.name));

  const record = "Readonly<Record<string, string | number | boolean | null | undefined>>";
  const dataSection = [
    `export type ${typeName("HttpMethod")} = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";`,
    jsdoc("Lifecycle of an `$http` / `$query` bag (`\"stale\"`: refetching while the previous data is still shown).") +
      `export type ${typeName("ResourceState")} = "idle" | "loading" | "data" | "error" | "stale";`,
    configInterface("http", typeName("HttpConfig"), {
      required: ["url"],
      overrides: { method: "HttpMethod | Lowercase<HttpMethod>", query: record, headers: "Readonly<Record<string, string | number | null | undefined>>", body: "unknown", variables: "Readonly<Record<string, unknown>>" },
      extra: [
        ["redirect", `redirect?: "follow" | "error" | "manual"`],
        ["referrer", "referrer?: string"],
        ["referrerPolicy", "referrerPolicy?: string"],
        ["integrity", "integrity?: string"],
        ["keepalive", "keepalive?: boolean"],
        ["priority", `priority?: "high" | "low" | "auto"`],
      ],
      extraDocs: new Map([["redirect", "Other `fetch` options are forwarded verbatim (`redirect`, `referrer`, `referrerPolicy`, `integrity`, `keepalive`, `priority`)."]]),
    }),
    iface(typeName("InfiniteConfig"), [
      ["param", "readonly param?: string"],
      ["start", "readonly start?: number"],
      ["limit", "readonly limit?: number"],
      ["mode", `readonly mode?: "page" | "offset"`],
      ["select", "readonly select?: (body: any) => unknown"],
    ], new Map([
      ["param", "Query key carrying the page / offset (default `\"page\"`)."],
      ["start", "First page (default 1) or offset (default 0)."],
      ["limit", "Page size (default 20); a page shorter than this ends `hasMore`."],
      ["mode", "`\"page\"` (1, 2, 3…) or `\"offset\"` (0, limit, 2·limit…)."],
      ["select", "Map a page body to its item array when the items are nested (`body => body.results`)."],
    ]), "Pagination config for `$query({ infinite: {…} })`."),
    configInterface("query", typeName("QueryConfig"), {
      required: ["url"],
      overrides: { method: "HttpMethod | Lowercase<HttpMethod>", query: record, headers: "Readonly<Record<string, string | number | null | undefined>>", body: "unknown", variables: "Readonly<Record<string, unknown>>", infinite: "InfiniteConfig" },
    }),
    configInterface("mutation", typeName("MutationConfig"), {
      required: ["url"],
      overrides: {
        method: `"POST" | "PUT" | "PATCH" | "DELETE" | "post" | "put" | "patch" | "delete"`,
        query: record,
        headers: "Readonly<Record<string, string | number | null | undefined>>",
        body: "unknown",
        variables: "Readonly<Record<string, unknown>>",
        optimistic: "(overrides: Readonly<Record<string, unknown>>) => void",
        invalidates: "string | readonly string[]",
      },
    }),
    iface(`${typeName("HttpResource")}<T = unknown>`, httpResource, docsOf(httpMembers), "Reactive HTTP bag: fields update in place as the request progresses."),
    iface(`${typeName("InfiniteQueryResource")}<Item = unknown> extends Omit<HttpResource<Item[]>, "data" | "onDone">`, infiniteExtra, new Map([...docsOf(queryMembers), ["data", "Flattened items across every loaded page (starts as `[]`)."]]), "An infinite `$query` bag."),
    iface(`${typeName("MutationResource")}<T = unknown>`, mutationResource, docsOf(mutationMembers), "Deferred write bag: nothing is sent until `.mutate(…)`."),
    configInterface("socket", typeName("SocketConfig"), {
      required: ["url"],
      overrides: { protocols: "string | readonly string[]", onMessage: "(message: any) => void" },
    }),
    configInterface("sse", typeName("SseConfig"), { required: ["url"], overrides: { onMessage: "(message: any) => void" } }),
    `export type ${typeName("SocketStatus")} = "connecting" | "open" | "closed";`,
    iface(`${typeName("SocketResource")}<M = unknown>`, socketResource, docsOf(socketMembers), "Reactive WebSocket bag."),
    iface(`${typeName("SseResource")}<M = unknown>`, sseResource, docsOf(sseMembers), "Reactive Server-Sent Events bag."),
    configInterface("script", typeName("ScriptConfig"), {
      required: ["src"],
      overrides: { attributes: "Readonly<Record<string, string | number | boolean | null | undefined>>" },
    }),
    iface(`${typeName("ScriptResource")}<V = unknown>`, scriptResource, docsOf(scriptMembers), "External script / stylesheet load bag."),
    configInterface("head", typeName("HeadConfig"), {
      overrides: {
        meta: "Readonly<Record<string, string>>",
        og: "Readonly<Record<string, string>>",
        twitter: "Readonly<Record<string, string>>",
        link: "readonly Readonly<Record<string, string>>[]",
        jsonLd: "object | readonly object[]",
        base: "string | { readonly href: string; readonly target?: string }",
        htmlAttrs: "Readonly<Record<string, string>>",
      },
    }),
  ];

  // ---- app / routing / theme / events / i18n
  const routeHandle: Member[] = [
    ["path", "readonly path: string"],
    ["params", "readonly params: Readonly<Record<string, string>>"],
    ["query", "readonly query: Readonly<Record<string, string>>"],
    ["pattern", "readonly pattern: string | null"],
    ["navigate", "navigate(to: string): void"],
  ];
  expectMembers("route handle", routeHandle.map(([n]) => n), input.routeMembers.map((m) => m.name));
  const i18nInstance: Member[] = [
    ["t", "t(key: string, vars?: Readonly<Record<string, unknown>>): string"],
    ["setCurrentLanguage", "setCurrentLanguage(lang: string): void"],
    ["getCurrentLanguage", "getCurrentLanguage(): string"],
  ];
  expectMembers("$i18n result", i18nInstance.map(([n]) => n), input.i18nResultMembers.map((m) => m.name));
  const appSection = [
    iface(typeName("LayoutArm"), [
      ["layout", "readonly layout: Children"],
      ["routes", "readonly routes?: RouteTable"],
    ], new Map([
      ["layout", "Rendered around the matched child route, which is bound to `outlet`."],
      ["routes", "Child routes, matched against the rest of the path."],
    ]), "A layout route: matches as a prefix and renders `layout` around the matched child."),
    jsdoc("Route patterns (`\"/users/:id\"`, `\"default\"` / `\"*\"` for the fallback) → arm.") +
      `export type ${typeName("RouteTable")} = { readonly [pattern: string]: Children | LayoutArm };`,
    iface(typeName("RouteHandle"), routeHandle, docsOf(input.routeMembers), "The reactive `route` handle."),
    `export type ${typeName("BuiltInThemeName")} = ${themeNames.map((n) => JSON.stringify(n)).join(" | ")};`,
    configInterface("theme", typeName("ThemeConfig"), {
      overrides: {
        name: "BuiltInThemeName",
        colors: "Readonly<Record<string, string>>",
        radius: "Readonly<Record<string, string>>",
        font: "Readonly<Record<string, string | readonly string[]>>",
        spacing: "Readonly<Record<string, string>>",
        shadows: "Readonly<Record<string, string>>",
        gradients: "Readonly<Record<string, string | readonly string[]>>",
        zIndex: "Readonly<Record<string, string | number>>",
        motion: "Readonly<Record<string, string>>",
        fonts: "{ readonly import?: readonly string[] }",
        icons: "Readonly<Record<string, string>>",
      },
    }),
    iface(typeName("ThemeHandle"), [
      ["kind", `readonly kind: "Theme"`],
      ["tokens", "readonly tokens: Readonly<Record<string, string>>"],
    ], undefined, "What `$theme(…)` returns."),
    configInterface("i18n", typeName("I18nConfig"), {
      overrides: { translations: "Readonly<Record<string, Readonly<Record<string, string>>>>" },
    }),
    iface(typeName("I18nInstance"), i18nInstance, docsOf(input.i18nResultMembers), "The bag `$i18n(…)` returns (safe to destructure)."),
  ];

  // ---- namespaces
  const utilCatalogue = namespaceMembers("util");
  const facade: Member[] = [
    ...rt.env.map((m) => [m.name, `readonly ${m.name}: ${m.type}`] as const),
    ["url", "readonly url: UrlSnapshot"],
    ["style", "readonly style: StyleNamespace"],
    ["rules", "readonly rules: RulesNamespace"],
    ["derived", "derived<T>(fn: () => T): T"],
    ["onError", "onError(fn: ((info: { readonly error: unknown; readonly source?: unknown }) => void) | null): void"],
    ["onNavigate", "onNavigate(fn: ((info: NavigationInfo) => boolean | string | void) | null): void"],
    ["onRequest", "onRequest(fn: (request: { url: string; method: HttpMethod; headers: Record<string, string>; body?: unknown }) => object | void): void"],
    ["onResponse", "onResponse(fn: (response: { status: number; headers: Record<string, string>; body: unknown }, retry: () => Promise<unknown>) => unknown): void"],
    ["invalidate", "invalidate(keys: string | readonly string[]): void"],
  ];
  const urlSnapshot: Member[] = [
    ["path", "readonly path: string"],
    ["params", "readonly params: Readonly<Record<string, string>>"],
    ["query", "readonly query: Readonly<Record<string, string>>"],
    ["hash", "readonly hash: string"],
    ["navigate", "navigate(to: string): void"],
    ["setQuery", "setQuery(key: string, value: string | number | boolean | null | undefined): void"],
    ["setQuery", "setQuery(values: Readonly<Record<string, string | number | boolean | null | undefined>>): void"],
    ["removeQuery", "removeQuery(key: string): void"],
  ];
  // The catalogue lists the top level of `$util` and every member of its
  // `namespace`-kind children; `url` is a property whose methods it lists.
  const topLevel = (prefixless: readonly NamespaceMember[]): string[] => prefixless.filter((m) => !m.name.includes(".")).map((m) => m.name);
  const under = (prefix: string): string[] =>
    utilCatalogue.filter((m) => m.name.startsWith(`${prefix}.`)).map((m) => m.name.slice(prefix.length + 1));
  expectMembers("$util (top level)", [...rt.util.map((m) => m.name), "duration", ...facade.map(([n]) => n)], topLevel(utilCatalogue));
  expectMembers("$util.style", rt.style.map((m) => m.name), under("style"));
  expectMembers("$util.rules", rt.rules.map((m) => m.name), under("rules"));
  expectMembers("$util.duration", rt.duration.map((m) => m.name), under("duration"));
  for (const name of under("url")) {
    if (!urlSnapshot.some(([n]) => n === name)) throw new Error(`emit-dsl-types: catalogue lists $util.url.${name}, which UrlSnapshot does not declare`);
  }

  const storageCatalogue = namespaceMembers("storage");
  const storageBackend: Member[] = [
    ["set", "set(key: string, value: unknown, options?: CookieOptions): boolean"],
    ["get", "get(key: string): unknown"],
    ["remove", "remove(key: string, options?: CookieOptions): boolean"],
    ["clear", "clear(): boolean"],
  ];
  const storageRoot: Member[] = [
    ["local", "readonly local: StorageNamespace"],
    ["session", "readonly session: StorageNamespace"],
    ["cookies", "readonly cookies: StorageNamespace"],
  ];
  expectMembers("$storage", [
    ...storageBackend.map(([n]) => n),
    ...storageRoot.flatMap(([n]) => [n, ...storageBackend.map(([m]) => `${n}.${m}`)]),
  ], storageCatalogue.map((m) => m.name));

  const consoleMembers: Member[] = ["log", "error", "warn", "info", "debug"].map((n) => [n, `${n}(...args: unknown[]): void`] as const);
  expectMembers("$console", consoleMembers.map(([n]) => n), namespaceMembers("console").map((m) => m.name));
  const toastManager: Member[] = [
    ["items", "readonly items: readonly ToastItem[]"],
    ["show", "show(message: unknown, options?: ToastShowOptions): string"],
    ["success", "success(message: unknown, options?: ToastShowOptions): string"],
    ["error", "error(message: unknown, options?: ToastShowOptions): string"],
    ["info", "info(message: unknown, options?: ToastShowOptions): string"],
    ["warning", "warning(message: unknown, options?: ToastShowOptions): string"],
    ["dismiss", "dismiss(id: string): void"],
    ["clear", "clear(): void"],
    ["configure", "configure(options: ToastConfig): void"],
  ];
  expectMembers("$toast", toastManager.map(([n]) => n), namespaceMembers("toast").map((m) => m.name));
  const domManager: Member[] = [
    ["onResize", "onResize(node: unknown, callback: (size: { readonly width: number; readonly height: number; readonly entry: unknown }) => void): DomDisposer"],
    ["onIntersect", "onIntersect(node: unknown, callback: (entry: any) => void, options?: { readonly root?: unknown; readonly rootMargin?: string; readonly threshold?: number | readonly number[] }): DomDisposer"],
    ["onMutation", "onMutation(node: unknown, callback: (records: any) => void, options?: { readonly childList?: boolean; readonly attributes?: boolean; readonly subtree?: boolean; readonly characterData?: boolean }): DomDisposer"],
    ["measure", "measure(node: unknown): DomMeasurement | null"],
  ];
  expectMembers("$dom", domManager.map(([n]) => n), namespaceMembers("dom").map((m) => m.name));

  const namespaceSection = [
    iface(typeName("OpenedWindow"), printed(rt.openedWindow), printedDocs(rt.openedWindow), "The handle `$util.openWindow()` returns — deliberately not a raw `Window`. Printed from `src/runtime/util.ts`."),
    iface(typeName("DurationNamespace"), printed(rt.duration), docsOf(utilCatalogue, "duration."), "`$util.duration` — printed from `src/runtime/util.ts`."),
    iface(typeName("StyleNamespace"), printed(rt.style), docsOf(utilCatalogue, "style."), "`$util.style` — printed from `src/runtime/namespaces-extra.ts`."),
    iface(typeName("RulesNamespace"), printed(rt.rules), docsOf(utilCatalogue, "rules."), "`$util.rules` — printed from `src/runtime/namespaces-extra.ts`."),
    iface(typeName("UtilStatic"), [...printed(rt.util), ["duration", "readonly duration: DurationNamespace"]], docsOf(utilCatalogue), "The static `$util` helpers — printed from `typeof Util` (`src/runtime/util.ts`)."),
    iface(typeName("UrlSnapshot"), urlSnapshot, docsOf(utilCatalogue, "url."), "Reactive URL snapshot (`$util.url`)."),
    iface(typeName("NavigationInfo"), [["to", "readonly to: string"], ["from", "readonly from: string"]], undefined, "What a `$util.onNavigate` guard receives."),
    iface(`${typeName("AktionUtil")} extends UtilStatic`, facade, new Map([...docsOf(utilCatalogue), ...printedDocs(rt.env)]), "`$util`: the static helpers plus the per-program facade (reactive env, URL, interceptors)."),
    iface(typeName("CookieOptions"), [
      ["expires", "expires?: number | Date | string"],
      ["maxAge", "maxAge?: number"],
      ["path", "path?: string"],
      ["domain", "domain?: string"],
      ["secure", "secure?: boolean"],
      ["sameSite", `sameSite?: "Strict" | "Lax" | "None" | "strict" | "lax" | "none"`],
    ], new Map([["expires", "Days until expiry, a Date, or a date string."], ["maxAge", "`Max-Age` in seconds (wins over `expires`)."]])),
    iface(typeName("StorageNamespace"), storageBackend, docsOf(storageCatalogue, "local.")),
    iface(`${typeName("StorageRoot")} extends StorageNamespace`, storageRoot, docsOf(storageCatalogue)),
    iface(typeName("ConsoleNamespace"), consoleMembers, docsOf(namespaceMembers("console"))),
    iface(typeName("ToastShowOptions"), [["title", "title?: string"], ["tone", "tone?: string"], ["duration", "duration?: number"]]),
    iface(typeName("ToastConfig"), [["position", "position?: string"]]),
    iface(typeName("ToastItem"), [
      ["id", "readonly id: string"],
      ["message", "readonly message: string"],
      ["title", "readonly title?: string"],
      ["tone", "readonly tone: string"],
      ["duration", "readonly duration: number"],
      ["createdAt", "readonly createdAt: number"],
    ]),
    iface(typeName("ToastManager"), toastManager, docsOf(namespaceMembers("toast"))),
    `export type ${typeName("DomDisposer")} = () => void;`,
    iface(typeName("DomMeasurement"), [
      ["rect", "readonly rect: { readonly width: number; readonly height: number; readonly top: number; readonly left: number; readonly right: number; readonly bottom: number }"],
      ["scroll", "readonly scroll: { readonly top: number; readonly left: number; readonly width: number; readonly height: number }"],
      ["viewport", "readonly viewport: { readonly width: number; readonly height: number }"],
    ]),
    iface(typeName("DomManager"), domManager, docsOf(namespaceMembers("dom")), "Element arguments are the nodes `Mount` / `OnMount` hand you — typed `unknown`, since a DSL program has no DOM types."),
  ];

  const builtinLines: string[] = [];
  for (const entry of input.builtinCatalog) {
    const lines = decls[entry.name]!;
    const doc = [summaryOf(entry.name), extraDocs[entry.name]].filter(Boolean).join(" ");
    builtinLines.push(lines.map((line, i) => `${i === 0 ? jsdoc(doc) : ""}${line}`).join("\n"));
  }

  const builtinsText = [
    "/* ================================================================ $-builtins: support types */",
    "",
    "/* ---- hooks */",
    jsdoc("Setter returned by `$state`: a value or an updater `prev => next`.") + `export type ${typeName("StateSetter")}<T> = (next: T | ((prev: T) => T)) => void;`,
    iface(`${typeName("RefBox")}<T>`, [["current", "current: T"]], undefined, "The stable box `$ref(…)` returns; writing `.current` does not re-render."),
    "",
    "/* ---- effects */",
    ...effectHelpers,
    "",
    "/* ---- $store */",
    ...storeSection,
    "",
    "/* ---- $form */",
    ...formSection,
    "",
    "/* ---- data */",
    ...dataSection,
    "",
    "/* ---- app / routing / theme / i18n */",
    ...appSection,
    "",
    "/* ---- namespaces */",
    ...namespaceSection,
    "",
    "/* ================================================================ $-builtins */",
    "",
    ...builtinLines,
  ].join("\n");

  /* ---------------------------------------------------------------- injected */

  const injectedDecls: Readonly<Record<string, string>> = {
    route: "export declare const route: RouteHandle;",
    params: "export declare const params: Readonly<Record<string, string>>;",
    outlet: "export declare const outlet: AktionNode | null;",
    children: "export declare const children: Children;",
    slots: "export declare const slots: Readonly<Record<string, Children>>;",
    cleanup: "export declare function cleanup(fn: () => void): void;",
    setTimeout: "export declare function setTimeout<A extends unknown[]>(fn: (...args: A) => void, ms?: number, ...args: A): number;",
    setInterval: "export declare function setInterval<A extends unknown[]>(fn: (...args: A) => void, ms?: number, ...args: A): number;",
    clearTimeout: "export declare function clearTimeout(id: number | null | undefined): void;",
    clearInterval: "export declare function clearInterval(id: number | null | undefined): void;",
  };
  const exportedInjected = Object.keys(INJECTED_NAMES).filter((n) => INJECTED_NAMES[n]!.exported);
  expectMembers("injected-name declarations", Object.keys(injectedDecls), exportedInjected);
  const injectedText = [
    "/* ================================================================ injected names */",
    "// Bound by the runtime without a declaration. Importing one is a compile-time",
    "// reference: the linker drops the import and the name resolves at runtime.",
    "",
    ...exportedInjected.map((n) => `${jsdoc(`Injected: ${INJECTED_NAMES[n]!.reason}.`)}${injectedDecls[n]}`),
  ].join("\n");

  // Every name a printed runtime type mentions must be declared here or by
  // lib.es2022 — a DOM type leaking in would break the no-DOM flavour.
  const allowed = new Set([...declared, ...input.libGlobals.esTypes]);
  for (const member of [...rt.util, ...rt.duration, ...rt.style, ...rt.rules, ...rt.env, ...rt.openedWindow]) {
    for (const ref of typeReferences(ts, member.type)) {
      if (!allowed.has(ref)) {
        throw new Error(`emit-dsl-types: the printed type of runtime member "${member.name}" mentions "${ref}", which is neither declared by aktion-runtime/dsl nor by lib.es2022: ${member.type}`);
      }
    }
  }

  const valueExports = [...input.builtinCatalog.map((b) => b.sigil), ...exportedInjected];
  return {
    prelude,
    builtins: builtinsText,
    injected: injectedText,
    declaredNames: [...declared, ...valueExports],
    valueExports,
  };
}

/** Every type-reference identifier in a printed type expression, minus its own type parameters. */
function typeReferences(ts: typeof TS, typeText: string): string[] {
  const sf = ts.createSourceFile("ref.ts", `type __Ref = ${typeText};`, ts.ScriptTarget.ES2022, true);
  const refs: string[] = [];
  const typeParameters = new Set<string>();
  const visit = (node: TS.Node): void => {
    if (ts.isTypeParameterDeclaration(node)) typeParameters.add(node.name.text);
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName;
      refs.push(ts.isIdentifier(name) ? name.text : name.getText().split(".")[0]!);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return refs.filter((r) => !typeParameters.has(r));
}
