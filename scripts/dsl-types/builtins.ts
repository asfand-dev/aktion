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
 *     (see `runtime-types.ts`), with the parameter types they mention;
 *   - closed value sets come from the runtime's own tables (`$toast` tones and
 *     corners, the `$head` allow-lists), passed in by `generate.ts`;
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
  /** The `Toast` component's tones (`TOAST_TONES`), which `$toast` renders through. */
  toastTones: readonly string[];
  /** The `Toasts` component's corners (`TOASTS_POSITIONS`), which `$toast.configure` accepts. */
  toastPositions: readonly string[];
  /** `$head`'s allow-lists (`src/runtime/head.ts`). */
  head: { linkRels: readonly string[]; linkAttributes: readonly string[]; htmlAttributes: readonly string[] };
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
    jsdoc("Any function value. Every component callback prop has its own exact signature; this alias remains for code that stores handlers generically.") +
      `export type ${typeName("Callable")} = (...args: any[]) => unknown;`,
    ...domBridge(typeName),
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
    "export declare function $query<Item = unknown>(config: InfiniteQueryConfig<Item>): InfiniteQueryResource<Item>;");
  builtin("mutation", "export declare function $mutation<T = unknown>(config: MutationConfig): MutationResource<T>;");
  builtin("socket", "export declare function $socket<M = unknown>(config: SocketConfig<M>): SocketResource<M>;");
  builtin("sse", "export declare function $sse<M = unknown>(config: SseConfig<M>): SseResource<M>;");
  builtin("script", "export declare function $script<V = unknown>(config: ScriptConfig): ScriptResource<V>;");
  builtin("head", "export declare function $head(config: HeadConfig): null;");
  builtin("i18n", "export declare function $i18n<const T extends I18nTranslations = {}>(config?: I18nConfig<T>): I18nInstance<keyof T & string, __I18nLanguages<T>>;");
  // ---- app / routing / theme / events
  builtin("app", "export declare function $app(root: AktionNode | readonly Children[] | null, ...more: Children[]): CompiledProgram;");
  builtin("router", "export declare function $router<const R extends RouteTable>(routes: R): RouterResult<R>;");
  builtin("theme", "export declare function $theme(config: ThemeConfig): ThemeHandle;");
  builtin("emit", "export declare function $emit(name: string, detail?: unknown): void;");
  // ---- namespaces
  builtin("util", "export declare const $util: AktionUtil;");
  builtin("storage", "export declare const $storage: StorageRoot & ((config?: Readonly<Record<string, never>>) => StorageRoot);");
  builtin("console", "export declare const $console: ConsoleNamespace;");
  builtin("toast", "export declare const $toast: ToastManager;");
  builtin("dom", "export declare const $dom: DomManager;");

  expectMembers("$-builtin declarations", Object.keys(decls), input.builtinCatalog.map((b) => b.name));

  const extraDocs: Readonly<Record<string, string>> = {
    state: "The initializer is a VALUE (it is not called). The setter takes a value or an updater `prev => next` and no-ops when `Object.is`-equal.",
    app: "The return type is a type-level fiction: `export default $app(App())` gives host code a typed `CompiledProgram` default import. A bare string/number root is a validation error (root-not-renderable).",
    effect: "`body` must be an inline arrow or function expression (a function reference parses to an empty body). Deps must be an array LITERAL of `$` atoms (or member paths such as `$user.name`) and trigger strings; empty or omitted deps mean `[\"mount\"]`. Return nothing from the body — register teardown with `cleanup(fn)`.",
    store: "Non-function entries become reactive state, function entries become methods `(s, ...args) => …` whose first parameter is the store handle — typed `any` inside the method, because TypeScript cannot infer a handle from the object literal it is defined in; callers of the returned store ARE fully typed. To type the handle, annotate it with `Store<Fields>` over an interface of the fields: `interface Cart { items: Item[] }` … `add: (s: Store<Cart>, item: Item) => { s.items = [...s.items, item] }`. One store per call site.",
    query: "With `infinite: {…}` the bag accumulates pages (`.loadMore()`, `.hasMore`, `.data` is the flattened items); `Item` is inferred from a typed `infinite.select`. The infinite form ignores `ttl` and the `refetch*` options, so its config does not declare them.",
    http: "`T` is an unchecked assertion about the response body; `data` is `undefined` until the first successful response.",
    router: "Must be called with an object LITERAL: arms are evaluated lazily and only the matching one runs. Returns the matched arm's value (a layout arm's `layout`), or null when nothing matches and there is no `default`. Type an arm's `params` with `params as RouteParamsOf<\"/users/:id\">`.",
    head: "Returns null — call it as a statement.",
    storage: "Also callable: `$storage(…)` returns the same namespace; the argument is evaluated and ignored.",
    i18n: "`t` completes the declared keys and `setCurrentLanguage` the declared languages; any other string is still accepted (an unknown key translates to itself).",
  };

  const effectHelpers = [
    jsdoc("Milliseconds in an interval trigger: a bigint literal that starts with a digit, so `\"every(1.5)\"` and `\"every(-1)\"` are rejected (hex such as `\"every(0x10)\"` still passes the types; the parser rejects it).") +
      `type ${typeName("__EffectMs")} = \`\${bigint}\` & \`\${"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"}\${string}\`;`,
    jsdoc("String triggers the `$effect` dependency parser understands (`every(ms)`, `debounce(ms)`, `throttle(ms)` take whole decimal milliseconds).") +
      `export type ${typeName("EffectTrigger")} = "mount" | "unmount" | \`every(\${__EffectMs})\` | \`debounce(\${__EffectMs})\` | \`throttle(\${__EffectMs})\`;`,
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
    ["submit", "submit(extra?: unknown): boolean | Promise<unknown>"],
    ["handleSubmit", "handleSubmit(extra?: unknown): boolean | Promise<unknown>"],
    ["reset", "reset(): void"],
  ];
  expectMembers("$form handle", formHandle.map(([n]) => n), formMembers.map((m) => m.name));
  const formSection = [
    jsdoc("A validator from `$util.rules.*`: an error message, or null when valid (a Promise for async rules). `T` is the value it checks; `$form` hands each field's validators that field's value.") +
      `export type ${typeName("Validator")}${rt.validatorTypeParameters} = ${rt.validator};`,
    `export type ${typeName("FormValues")} = Record<string, unknown>;`,
    configInterface("form", `${typeName("FormConfig")}<V extends FormValues = FormValues>`, {
      overrides: {
        values: "V",
        rules: "{ readonly [K in keyof V]?: Validator<V[K]> | readonly Validator<V[K]>[] }",
        onSubmit: "(values: V, extra?: unknown) => unknown",
      },
    }),
    iface(`${typeName("FieldBinding")}<T>`, [
      ["name", "readonly name: string"],
      ["value", `readonly value: T | ""`],
      ["error", "readonly error: string | undefined"],
      ["onChange", "readonly onChange: (value: unknown) => void"],
      ["onBlur", "readonly onBlur: () => void"],
    ], new Map([
      ["name", "The field name."],
      ["value", "The field's value (`values[name] ?? \"\"`)."],
      ["error", "The field's error, but only once the field is touched (`undefined` before)."],
      ["onChange", "Writes the field's value (and clears its error)."],
      ["onBlur", "Marks the field touched and validates it."],
    ]), "The controlled prop bag `form.field(name)` returns. Spreading it into a component call (`{ ...form.field(\"x\") }`) is DROPPED by the runtime — pass the members explicitly."),
    iface(`${typeName("FormHandle")}<V extends FormValues = FormValues>`, formHandle, docsOf(formMembers), "A `$form(…)` handle. Destructuring a handle reads `undefined` — read `form.values`, `form.valid`, …"),
  ];

  // ---- data layer
  const httpMembers = catalogueMembers("http");
  const queryMembers = catalogueMembers("query");
  const httpResource: Member[] = [
    ["state", "readonly state: ResourceState"],
    ["data", "readonly data: T | undefined"],
    ["error", "readonly error: HttpResourceError | undefined"],
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
    ["cancel", "cancel(): void"],
    ["onDone", "onDone?: (resource: InfiniteQueryResource<Item>) => void"],
  ];
  expectMembers("$query resource (plain + infinite)", [...new Set([...httpResource, ...infiniteExtra].map(([n]) => n))], queryMembers.map((m) => m.name));
  const mutationMembers = catalogueMembers("mutation");
  const mutationResource: Member[] = [
    ["data", "readonly data: T | undefined"],
    ["error", "readonly error: HttpResourceError | undefined"],
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
    ["error", "readonly error: RealtimeError | undefined"],
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
    ["error", "readonly error: RealtimeError | undefined"],
    ["close", "close(): void"],
  ];
  expectMembers("$sse resource", sseResource.map(([n]) => n), sseMembers.map((m) => m.name));
  const scriptMembers = catalogueMembers("script");
  const scriptResource: Member[] = [
    ["ready", "readonly ready: boolean"],
    ["loading", "readonly loading: boolean"],
    ["error", "readonly error: Error | null"],
    ["value", "readonly value: V | null"],
  ];
  expectMembers("$script resource", scriptResource.map(([n]) => n), scriptMembers.map((m) => m.name));

  const record = "Readonly<Record<string, string | number | boolean | null | undefined>>";
  const headers = "Readonly<Record<string, string | number | null | undefined>>";

  // $head: the shapes follow the runtime's allow-lists, so a `rel` or an
  // attribute the runtime drops is a type error rather than a silent no-op.
  const headLinkOverrides: Readonly<Record<string, string>> = { crossorigin: `"" | "anonymous" | "use-credentials"` };
  const headHtmlOverrides: Readonly<Record<string, string>> = { dir: `"ltr" | "rtl" | "auto"`, translate: `"yes" | "no"` };
  for (const [table, overrides, label] of [
    [input.head.linkAttributes, headLinkOverrides, "SAFE_LINK_ATTRS"],
    [input.head.htmlAttributes, headHtmlOverrides, "SAFE_HTML_ATTRS"],
  ] as const) {
    for (const key of Object.keys(overrides)) {
      if (!table.includes(key)) throw new Error(`emit-dsl-types: a $head type override names "${key}", which src/runtime/head.ts ${label} does not list`);
    }
  }
  const union = (values: readonly string[]): string => values.map((v) => JSON.stringify(v)).join(" | ");

  const dataSection = [
    `export type ${typeName("HttpMethod")} = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";`,
    jsdoc("Lifecycle of an `$http` / `$query` bag (`\"stale\"`: refetching while the previous data is still shown).") +
      `export type ${typeName("ResourceState")} = "idle" | "loading" | "data" | "error" | "stale";`,
    iface(typeName("HttpFetchOptions"), [
      ["redirect", `redirect?: "follow" | "error" | "manual"`],
      ["referrer", "referrer?: string"],
      ["referrerPolicy", `referrerPolicy?: "" | "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url"`],
      ["integrity", "integrity?: string"],
      ["keepalive", "keepalive?: boolean"],
      ["priority", `priority?: "high" | "low" | "auto"`],
    ], new Map([
      ["referrerPolicy", "An unknown policy makes `fetch` reject (a `TypeError`), which lands in `.error`."],
      ["keepalive", "Let the request outlive the page (an analytics beacon on unload)."],
    ]), "`fetch` options that `$http`, `$query` and `$mutation` forward verbatim (every config key the runtime does not read itself is passed to `fetch`)."),
    configInterface("http", `${typeName("HttpConfig")} extends HttpFetchOptions`, {
      required: ["url"],
      overrides: { method: "HttpMethod | Lowercase<HttpMethod>", query: record, headers, body: "unknown", variables: "Readonly<Record<string, unknown>>" },
    }),
    iface(`${typeName("InfiniteConfig")}<Item = unknown>`, [
      ["param", "readonly param?: string"],
      ["start", "readonly start?: number"],
      ["limit", "readonly limit?: number"],
      ["mode", `readonly mode?: "page" | "offset"`],
      ["select", "readonly select?: (body: any) => readonly Item[]"],
    ], new Map([
      ["param", "Query key carrying the page / offset (default `\"page\"`)."],
      ["start", "First page (default 1) or offset (default 0)."],
      ["limit", "Page size (default 20); a page shorter than this ends `hasMore`."],
      ["mode", "`\"page\"` (1, 2, 3…) or `\"offset\"` (0, limit, 2·limit…)."],
      ["select", "Map a page body to its items when they are nested (`body => body.results`); a non-array result counts as an empty page. Without it the body itself must be the array. Annotate the body to infer `Item`."],
    ]), "Pagination config for `$query({ infinite: {…} })`."),
    configInterface("query", `${typeName("QueryConfig")} extends HttpFetchOptions`, {
      required: ["url"],
      overrides: { method: "HttpMethod | Lowercase<HttpMethod>", query: record, headers, body: "unknown", variables: "Readonly<Record<string, unknown>>", infinite: "InfiniteConfig" },
    }),
    iface(`${typeName("InfiniteQueryConfig")}<Item = unknown> extends Omit<QueryConfig, "ttl" | "refetchInterval" | "refetchOnFocus" | "refetchOnReconnect" | "infinite">`, [
      ["infinite", "readonly infinite: InfiniteConfig<Item>"],
    ], new Map([["infinite", input.findBuiltinConfig("query")?.find((k) => k.name === "infinite")?.summary ?? ""]]),
    "The config of an infinite `$query`: no `ttl` or `refetch*` options, which only the plain form honours."),
    configInterface("mutation", `${typeName("MutationConfig")} extends HttpFetchOptions`, {
      required: ["url"],
      overrides: {
        method: `"POST" | "PUT" | "PATCH" | "DELETE" | "post" | "put" | "patch" | "delete"`,
        query: record,
        headers,
        body: "unknown",
        variables: "Readonly<Record<string, unknown>>",
        optimistic: "(overrides: Readonly<Partial<MutationConfig>>) => void",
        invalidates: "string | readonly string[]",
      },
    }),
    iface(typeName("HttpResourceError"), [
      ["status", "readonly status?: number"],
      ["body", "readonly body?: unknown"],
      ["graphqlErrors", "readonly graphqlErrors?: readonly unknown[]"],
      ["message", "readonly message?: string"],
      ["name", "readonly name?: string"],
    ], new Map([
      ["status", "The HTTP status of a non-2xx response."],
      ["body", "The parsed body of a non-2xx response."],
      ["graphqlErrors", "The `errors` array of a GraphQL response (even on a 200)."],
      ["message", "The message of a thrown error (a network failure, a throwing interceptor), or of the runtime's own `{ message }`."],
      ["name", "The name of a thrown error (`\"TypeError\"` for a network failure)."],
    ]), "What `.error` holds after a failure. The shape depends on the failure — `{ status, body }` (non-2xx), `{ graphqlErrors }` (GraphQL), the thrown error (network, interceptor), `{ message }` (no HTTP runtime) — so every key is optional: read `res.error?.status === 404` and branch."),
    iface(`${typeName("HttpResource")}<T = unknown>`, httpResource, docsOf(httpMembers), "Reactive HTTP bag: fields update in place as the request progresses."),
    iface(`${typeName("InfiniteQueryResource")}<Item = unknown> extends Omit<HttpResource<Item[]>, "data" | "onDone" | "cancel">`, infiniteExtra, new Map([
      ...docsOf(queryMembers),
      ["data", "Flattened items across every loaded page (starts as `[]`)."],
      ["cancel", "A no-op: an infinite query has no single in-flight request to abort."],
    ]), "An infinite `$query` bag."),
    iface(`${typeName("MutationResource")}<T = unknown>`, mutationResource, docsOf(mutationMembers), "Deferred write bag: nothing is sent until `.mutate(…)`."),
    configInterface("socket", `${typeName("SocketConfig")}<M = unknown>`, {
      required: ["url"],
      overrides: { protocols: "string | readonly string[]", onMessage: "(message: M) => void" },
    }),
    configInterface("sse", `${typeName("SseConfig")}<M = unknown>`, {
      required: ["url"],
      overrides: { onMessage: "(message: M) => void" },
    }),
    `export type ${typeName("SocketStatus")} = "connecting" | "open" | "closed";`,
    jsdoc("What a `$socket` / `$sse` bag's `.error` holds: the socket / EventSource `error` event, the error its constructor threw (a bad URL), or `{ message }` when the API is unavailable. `undefined` once the connection opens.") +
      `export type ${typeName("RealtimeError")} = DomEvent | Error | { readonly message: string };`,
    iface(`${typeName("SocketResource")}<M = unknown>`, socketResource, docsOf(socketMembers), "Reactive WebSocket bag."),
    iface(`${typeName("SseResource")}<M = unknown>`, sseResource, docsOf(sseMembers), "Reactive Server-Sent Events bag."),
    configInterface("script", typeName("ScriptConfig"), {
      required: ["src"],
      overrides: { attributes: "Readonly<Record<string, string | number | boolean | null | undefined>>" },
    }),
    iface(`${typeName("ScriptResource")}<V = unknown>`, scriptResource, new Map([...docsOf(scriptMembers), ["error", "The load error (always an `Error`), or `null`."]]), "External script / stylesheet load bag."),
    jsdoc("`rel` values `$head({ link })` keeps (metadata and resource hints only); a link with any other `rel` is dropped.") +
      `export type ${typeName("HeadLinkRel")} = ${union(input.head.linkRels)};`,
    iface(typeName("HeadLink"), [
      ["rel", "readonly rel: HeadLinkRel"],
      ["href", "readonly href: string"],
      ...input.head.linkAttributes.map((name): Member => [name, `readonly ${propKey(name)}?: ${headLinkOverrides[name] ?? "string"}`]),
    ], new Map([["href", "Required: a link without one (or with an unsafe one) is dropped. Relative, `#`, `?` or absolute http(s) only."]]),
    "A `<link>` descriptor. Only these attributes are kept; any other key is dropped."),
    jsdoc("Attributes `$head({ htmlAttrs })` sets on `<html>`: these names plus any `data-*`. Any other attribute (notably `style`) is dropped; a nullish value is skipped.") +
      `export interface ${typeName("HeadHtmlAttrs")} {\n${input.head.htmlAttributes.map((name) => `  readonly ${propKey(name)}?: ${headHtmlOverrides[name] ?? "string"};`).join("\n")}\n  readonly [attribute: \`data-\${string}\`]: string | number | boolean | null | undefined;\n}`,
    configInterface("head", typeName("HeadConfig"), {
      overrides: {
        meta: record,
        og: record,
        twitter: record,
        link: "HeadLink | readonly HeadLink[]",
        jsonLd: "object | readonly object[]",
        base: "string | { readonly href: string }",
        htmlAttrs: "HeadHtmlAttrs",
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
    ["t", "t(key: K | (string & {}), vars?: Readonly<Record<string, unknown>>): string"],
    ["setCurrentLanguage", "setCurrentLanguage(lang: L | (string & {})): void"],
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
    `type ${typeName("__RouterArmResult")}<V> = V extends LayoutArm ? V["layout"] : V;`,
    jsdoc("What `$router(table)` evaluates to: one arm's value (a layout arm's `layout`), or null when nothing matches.") +
      `export type ${typeName("RouterResult")}<R> = { [K in keyof R]: __RouterArmResult<R[K]> }[keyof R] | null;`,
    `type ${typeName("__RouteSegmentParam")}<S extends string> = S extends \`:\${infer Name}\` ? (Name extends "" ? {} : { readonly [K in Name]: string }) : {};`,
    `type ${typeName("__RouteParams")}<P extends string> = P extends \`\${infer Head}/\${infer Tail}\` ? (Head extends "*" ? { readonly _: string } : __RouteSegmentParam<Head> & __RouteParams<Tail>) : P extends "*" ? { readonly _: string } : __RouteSegmentParam<P>;`,
    jsdoc("The params a route pattern captures: `RouteParamsOf<\"/users/:id/files/*\">` is `{ id: string; _: string }` (a trailing `*` captures the rest of the path as `_`; a bare `\"*\"` captures nothing). Arms are expressions, so `params` cannot be typed per arm — cast it: `params as RouteParamsOf<\"/users/:id\">`.") +
      `export type ${typeName("RouteParamsOf")}<P extends string> = P extends "*" | "default" ? {} : { readonly [K in keyof __RouteParams<P>]: string };`,
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
    jsdoc("`$i18n` translations: `{ key: { lang: \"text {name}\" } }`.") +
      `export type ${typeName("I18nTranslations")} = Readonly<Record<string, Readonly<Record<string, string>>>>;`,
    `type ${typeName("__I18nLanguages")}<T> = { [K in keyof T]: keyof T[K] & string }[keyof T];`,
    configInterface("i18n", `${typeName("I18nConfig")}<T extends I18nTranslations = I18nTranslations>`, {
      overrides: { translations: "T" },
    }),
    iface(`${typeName("I18nInstance")}<K extends string = string, L extends string = string>`, i18nInstance, new Map([
      ...docsOf(input.i18nResultMembers),
      ["t", `${input.i18nResultMembers.find((m) => m.name === "t")?.summary ?? ""} An unknown key translates to itself, so any string is accepted; the declared keys (\`K\`) complete.`],
    ]), "The bag `$i18n(…)` returns (safe to destructure). `K` / `L` are the keys and languages of the config's `translations`."),
  ];

  // ---- namespaces
  const utilCatalogue = namespaceMembers("util");
  const facade: Member[] = [
    ...rt.env.map((m) => [m.name, `readonly ${m.name}: ${m.type}`] as const),
    ["url", "readonly url: UrlSnapshot"],
    ["style", "readonly style: StyleNamespace"],
    ["rules", "readonly rules: RulesNamespace"],
    ["derived", "derived<T>(fn: () => T): T"],
    ["onError", "onError(fn: ((info: { readonly error: unknown; readonly source: string }) => void) | null): void"],
    ["onNavigate", "onNavigate(fn: ((info: NavigationInfo) => boolean | string | void) | null): void"],
    ["onRequest", "onRequest(fn: (request: HttpInterceptedRequest) => Partial<HttpInterceptedRequest> | void): void"],
    ["onResponse", "onResponse(fn: (response: HttpInterceptedResponse, retry: () => Promise<HttpInterceptedResponse>) => HttpInterceptedResponse | void | Promise<HttpInterceptedResponse | void>): void"],
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

  // `local`, `session` and the root share one web-storage shape; only
  // `cookies` reads the options argument.
  const storageCatalogue = namespaceMembers("storage");
  const storageBackend: Member[] = [
    ["set", "set(key: string, value: unknown): boolean"],
    ["get", "get<T = unknown>(key: string): T | null"],
    ["remove", "remove(key: string): boolean"],
    ["clear", "clear(): boolean"],
  ];
  const cookieBackend: Member[] = [
    ["set", "set(key: string, value: unknown, options?: CookieOptions): boolean"],
    ["get", "get<T = unknown>(key: string): T | null"],
    ["remove", "remove(key: string, options?: CookieOptions): boolean"],
    ["clear", "clear(): boolean"],
  ];
  const storageRoot: Member[] = [
    ["local", "readonly local: StorageNamespace"],
    ["session", "readonly session: StorageNamespace"],
    ["cookies", "readonly cookies: CookieStorageNamespace"],
  ];
  const backendOf = (name: string): readonly Member[] => (name === "cookies" ? cookieBackend : storageBackend);
  expectMembers("$storage", [
    ...storageBackend.map(([n]) => n),
    ...storageRoot.flatMap(([n]) => [n, ...backendOf(n).map(([m]) => `${n}.${m}`)]),
  ], storageCatalogue.map((m) => m.name));

  const consoleMembers: Member[] = ["log", "error", "warn", "info", "debug"].map((n) => [n, `${n}(...args: unknown[]): void`] as const);
  expectMembers("$console", consoleMembers.map(([n]) => n), namespaceMembers("console").map((m) => m.name));
  // The shortcuts overwrite `tone`, so they do not take one.
  const toastManager: Member[] = [
    ["items", "readonly items: readonly ToastItem[]"],
    ["show", "show(message: string | number, options?: ToastShowOptions): string"],
    ["success", `success(message: string | number, options?: Omit<ToastShowOptions, "tone">): string`],
    ["error", `error(message: string | number, options?: Omit<ToastShowOptions, "tone">): string`],
    ["info", `info(message: string | number, options?: Omit<ToastShowOptions, "tone">): string`],
    ["warning", `warning(message: string | number, options?: Omit<ToastShowOptions, "tone">): string`],
    ["dismiss", "dismiss(id: string): void"],
    ["clear", "clear(): void"],
    ["configure", "configure(options?: ToastConfig): void"],
  ];
  expectMembers("$toast", toastManager.map(([n]) => n), namespaceMembers("toast").map((m) => m.name));
  const domNode = "DomElement | null | undefined";
  const domManager: Member[] = [
    ["onResize", `onResize(node: ${domNode}, callback: (size: { readonly width: number; readonly height: number; /** The \`ResizeObserverEntry\`. */ readonly entry: unknown }) => void): DomDisposer`],
    ["onIntersect", `onIntersect(node: ${domNode}, callback: (entry: DomIntersectionEntry) => void, options?: { readonly root?: DomElement | null; readonly rootMargin?: string; readonly threshold?: number | readonly number[] }): DomDisposer`],
    ["onMutation", `onMutation(node: ${domNode}, callback: (records: readonly DomMutationRecord[]) => void, options?: { readonly childList?: boolean; readonly attributes?: boolean; readonly subtree?: boolean; readonly characterData?: boolean }): DomDisposer`],
    ["measure", `measure(node: ${domNode}): DomMeasurement | null`],
  ];
  expectMembers("$dom", domManager.map(([n]) => n), namespaceMembers("dom").map((m) => m.name));

  const namespaceSection = [
    // The runtime's own parameter types, as written in its source.
    ...rt.declarations.map((d) => {
      typeName(d.name);
      return d.text;
    }),
    iface(typeName("OpenedWindow"), printed(rt.openedWindow), printedDocs(rt.openedWindow), "The handle `$util.openWindow()` returns — deliberately not a raw `Window`. Printed from `src/runtime/util.ts`."),
    iface(typeName("DurationNamespace"), printed(rt.duration), docsOf(utilCatalogue, "duration."), "`$util.duration` — printed from `src/runtime/util.ts`."),
    iface(typeName("StyleNamespace"), printed(rt.style), docsOf(utilCatalogue, "style."), "`$util.style` — printed from `src/runtime/namespaces-extra.ts`."),
    iface(typeName("RulesNamespace"), printed(rt.rules), docsOf(utilCatalogue, "rules."), "`$util.rules` — printed from `src/runtime/namespaces-extra.ts`."),
    iface(typeName("UtilStatic"), [...printed(rt.util), ["duration", "readonly duration: DurationNamespace"]], docsOf(utilCatalogue), "The static `$util` helpers — printed from `typeof Util` (`src/runtime/util.ts`)."),
    iface(typeName("UrlSnapshot"), urlSnapshot, new Map([
      ["path", "The current route path."],
      ["params", "The matched route's path params (`/users/:id` → `{ id }`)."],
      ["query", "The parsed query string."],
      ["hash", "The fragment after `#`, without the `#` — but currently filled in only when the URL also has a `?query` before it (`/p?x=1#s` → `\"s\"`); otherwise `\"\"` (`/p#s`, and a hash-router URL such as `/#/p?x=1`)."],
      ["navigate", "Navigate to a path."],
      ...docsOf(utilCatalogue, "url."),
    ]), "Reactive URL snapshot (`$util.url`)."),
    iface(typeName("NavigationInfo"), [["to", "readonly to: string"], ["from", "readonly from: string"]], new Map([
      ["to", "The path being navigated to (normalised)."],
      ["from", "The path being left."],
    ]), "What a `$util.onNavigate` guard receives."),
    iface(typeName("HttpInterceptedRequest"), [
      ["url", "url: string"],
      ["method", "method: HttpMethod"],
      ["headers", "headers: Record<string, string>"],
      ["body", "body?: unknown"],
      ["init", "init?: Record<string, unknown>"],
    ], new Map([["init", "The config's extra `fetch` options (`credentials`, `mode`, …)."]]),
    "The request a `$util.onRequest` interceptor receives: mutate it and return nothing, or return a partial to merge over it (headers are shallow-merged). The interceptor runs SYNCHRONOUSLY — a returned Promise is ignored."),
    iface(typeName("HttpInterceptedResponse"), [
      ["status", "readonly status: number"],
      ["headers", "readonly headers: Readonly<Record<string, string>>"],
      ["body", "readonly body: unknown"],
    ], undefined, "The response a `$util.onResponse` interceptor receives — and must return in full: a returned object REPLACES the response (a partial loses `status`, which turns a success into an error)."),
    iface(`${typeName("AktionUtil")} extends UtilStatic`, facade, new Map([...docsOf(utilCatalogue), ...printedDocs(rt.env)]), "`$util`: the static helpers plus the per-program facade (reactive env, URL, interceptors)."),
    iface(typeName("CookieOptions"), [
      ["expires", "expires?: number | Date | string"],
      ["maxAge", "maxAge?: number"],
      ["path", "path?: string"],
      ["domain", "domain?: string"],
      ["secure", "secure?: boolean"],
      ["sameSite", `sameSite?: "Strict" | "Lax" | "None" | "strict" | "lax" | "none"`],
    ], new Map([
      ["expires", "Days until expiry, a Date, or a date string."],
      ["maxAge", "`Max-Age` in seconds (wins over `expires`)."],
      ["path", "Restrict the cookie to this path (default `/`; an invalid path falls back to `/`)."],
      ["domain", "Restrict the cookie to this domain (dropped unless it is a valid hostname)."],
      ["secure", "Only send the cookie over HTTPS."],
      ["sameSite", "The `SameSite` policy. Always sent: `Lax` when omitted or not one of the three."],
    ]), "Options of `$storage.cookies.set` / `.remove` (the standard cookie attributes)."),
    iface(typeName("StorageNamespace"), storageBackend, new Map([
      ["set", "Write a value (anything but a string is JSON-encoded). Returns false when the storage is unavailable."],
      ["get", "Read a value (JSON-decoded when it parses), or null when the key is missing. `T` is an unchecked assertion about what was stored."],
      ["remove", "Delete a key."],
      ["clear", "Delete every key of this storage."],
    ]), "A web-storage backend (`$storage.local`, `$storage.session`, and `$storage` itself, which is `local`)."),
    iface(`${typeName("CookieStorageNamespace")} extends StorageNamespace`, cookieBackend, new Map([
      ...docsOf(storageCatalogue, "cookies."),
      ["get", "Read a cookie value (JSON-decoded when it parses), or null when it is not set. `T` is an unchecked assertion about what was stored."],
    ]), "`$storage.cookies`: the document's cookies, with cookie options on `set` / `remove`."),
    iface(`${typeName("StorageRoot")} extends StorageNamespace`, storageRoot, docsOf(storageCatalogue)),
    iface(typeName("ConsoleNamespace"), consoleMembers, docsOf(namespaceMembers("console"))),
    jsdoc("A toast's visual accent: the `Toast` component's tones.") +
      `export type ${typeName("ToastShowTone")} = ${union(input.toastTones)};`,
    jsdoc("A corner the auto-rendered toast stack can pin to: the `Toasts` component's positions.") +
      `export type ${typeName("ToastStackPosition")} = ${union(input.toastPositions)};`,
    iface(typeName("ToastShowOptions"), [
      ["title", "readonly title?: string | number"],
      ["tone", "readonly tone?: ToastShowTone"],
      ["duration", "readonly duration?: number"],
    ], new Map([
      ["title", "Optional bold heading; the message becomes the secondary line."],
      ["tone", "Visual accent (default `\"default\"`)."],
      ["duration", "Auto-dismiss delay in ms (default 4000); `0` keeps the toast until dismissed."],
    ]), "Options of `$toast.show` (the shortcuts take all but `tone`)."),
    iface(typeName("ToastConfig"), [["position", "readonly position?: ToastStackPosition"]], new Map([
      ["position", "Viewport corner the auto-rendered stack pins to (default `\"top-right\"`). Any other value is ignored."],
    ]), "Options of `$toast.configure`."),
    iface(typeName("ToastItem"), [
      ["id", "readonly id: string"],
      ["message", "readonly message: string"],
      ["title", "readonly title?: string"],
      ["tone", "readonly tone: ToastShowTone"],
      ["duration", "readonly duration: number"],
      ["createdAt", "readonly createdAt: number"],
    ], new Map([
      ["id", "Pass to `$toast.dismiss(id)`."],
      ["tone", "Visual accent, mapped onto the `Toast` component's `tone`."],
      ["duration", "Auto-dismiss delay in ms; `0` keeps the toast until dismissed."],
      ["createdAt", "ms-epoch the toast was shown."],
    ]), "One live toast in `$toast.items`."),
    iface(typeName("ToastManager"), toastManager, docsOf(namespaceMembers("toast"))),
    `export type ${typeName("DomDisposer")} = () => void;`,
    iface(typeName("DomMeasurement"), [
      ["rect", "readonly rect: { readonly width: number; readonly height: number; readonly top: number; readonly left: number; readonly right: number; readonly bottom: number }"],
      ["scroll", "readonly scroll: { readonly top: number; readonly left: number; readonly width: number; readonly height: number }"],
      ["viewport", "readonly viewport: { readonly width: number; readonly height: number }"],
    ], new Map([
      ["rect", "The element's bounding rectangle (`getBoundingClientRect()`)."],
      ["scroll", "Scroll position and scrollable size of the element."],
      ["viewport", "Current viewport size."],
    ]), "What `$dom.measure(node)` returns."),
    iface(typeName("DomRectLike"), ["x", "y", "width", "height", "top", "right", "bottom", "left"].map((n): Member => [n, `readonly ${n}: number`]), undefined,
      "A rectangle (`lib.dom`'s `DOMRectReadOnly`, structurally)."),
    iface(typeName("DomIntersectionEntry"), [
      ["isIntersecting", "readonly isIntersecting: boolean"],
      ["intersectionRatio", "readonly intersectionRatio: number"],
      ["target", "readonly target: DomElement"],
      ["time", "readonly time: number"],
      ["boundingClientRect", "readonly boundingClientRect: DomRectLike"],
      ["intersectionRect", "readonly intersectionRect: DomRectLike"],
      ["rootBounds", "readonly rootBounds: DomRectLike | null"],
    ], undefined, "What a `$dom.onIntersect` callback receives (`lib.dom`'s `IntersectionObserverEntry`, structurally)."),
    iface(typeName("DomMutationRecord"), [
      ["type", `readonly type: "attributes" | "characterData" | "childList"`],
      ["target", "readonly target: unknown"],
      ["attributeName", "readonly attributeName: string | null"],
      ["oldValue", "readonly oldValue: string | null"],
      ["addedNodes", "readonly addedNodes: ArrayLike<unknown>"],
      ["removedNodes", "readonly removedNodes: ArrayLike<unknown>"],
    ], undefined, "One of the records a `$dom.onMutation` callback receives (`lib.dom`'s `MutationRecord`, structurally)."),
    iface(typeName("DomManager"), domManager, docsOf(namespaceMembers("dom")), "Element arguments are the nodes `Mount` / `OnMount` / ref callbacks hand you. A null or non-element node makes the call a no-op: an observer returns a disposer that does nothing, `measure` returns null."),
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
    outlet: "export declare const outlet: Children;",
    children: "export declare const children: Children;",
    slots: "export declare const slots: Readonly<Record<string, any>>;",
    cleanup: "export declare function cleanup(fn: () => void): void;",
    setTimeout: "export declare function setTimeout<A extends unknown[]>(fn: (...args: A) => void, ms?: number, ...args: A): number;",
    setInterval: "export declare function setInterval<A extends unknown[]>(fn: (...args: A) => void, ms?: number, ...args: A): number;",
    clearTimeout: "export declare function clearTimeout(id: number | null | undefined): void;",
    clearInterval: "export declare function clearInterval(id: number | null | undefined): void;",
  };
  const exportedInjected = Object.keys(INJECTED_NAMES).filter((n) => INJECTED_NAMES[n]!.exported);
  expectMembers("injected-name declarations", Object.keys(injectedDecls), exportedInjected);
  const injectedDocs: Readonly<Record<string, string>> = {
    params: "Type them for one pattern with `params as RouteParamsOf<\"/users/:id\">`.",
    outlet: "Whatever the matched child arm evaluates to (a node, an array, a string, a nested layout's result), or null when no child matches.",
    slots: "Values are ANY named prop the caller passed — nodes, callbacks, data — so they are `any`: check one before calling or rendering it.",
  };
  const injectedText = [
    "/* ================================================================ injected names */",
    "// Bound by the runtime without a declaration. Importing one is a compile-time",
    "// reference: the linker drops the import and the name resolves at runtime.",
    "",
    ...exportedInjected.map((n) => `${jsdoc([`Injected: ${INJECTED_NAMES[n]!.reason}.`, injectedDocs[n]].filter(Boolean).join(" "))}${injectedDecls[n]}`),
  ].join("\n");

  // Every name a printed runtime type mentions must be declared here or by
  // lib.es2022 — a DOM type leaking in would break the no-DOM flavour.
  const allowed = new Set([...declared, ...input.libGlobals.esTypes]);
  const hint = "Export it from the runtime file and list it in PRINTED_DECLARATIONS (scripts/dsl-types/runtime-types.ts), or declare it in builtins.ts.";
  for (const member of [...rt.util, ...rt.duration, ...rt.style, ...rt.rules, ...rt.env, ...rt.openedWindow]) {
    for (const ref of typeReferences(ts, `type __Ref = ${member.type};`)) {
      if (!allowed.has(ref)) {
        throw new Error(`emit-dsl-types: the printed type of runtime member "${member.name}" mentions "${ref}", which is neither declared by aktion-runtime/dsl nor by lib.es2022: ${member.type}\n  ${hint}`);
      }
    }
  }
  for (const decl of rt.declarations) {
    for (const ref of typeReferences(ts, decl.text)) {
      if (!allowed.has(ref)) {
        throw new Error(`emit-dsl-types: the runtime type ${decl.name} (copied from the runtime source) mentions "${ref}", which is neither declared by aktion-runtime/dsl nor by lib.es2022.\n  ${hint}`);
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

/** Every type-reference identifier in printed declaration text, minus the type parameters it declares. */
function typeReferences(ts: typeof TS, declarationText: string): string[] {
  const sf = ts.createSourceFile("ref.ts", declarationText, ts.ScriptTarget.ES2022, true);
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

/**
 * The `Dom*` bridge types: what component callbacks receive when the renderer
 * hands over a DOM value (an event, an element, a picked file). Each resolves
 * to `lib.dom`'s own type when the DOM lib is loaded — so host-flavoured
 * projects get the full `KeyboardEvent` — and otherwise to a structural SUBSET
 * of it, which is sound because the runtime always passes the real object.
 * Detection reads `typeof globalThis`, where `lib.dom` declares every
 * constructor (`declare var KeyboardEvent: { prototype: KeyboardEvent; … }`).
 */
export function domBridge(typeName: (name: string) => string): string[] {
  const shapes: Array<[name: string, lib: string, doc: string, members: string]> = [
    ["DomEvent", "Event", "A DOM event (`lib.dom`'s `Event`).",
      "readonly type: string; readonly target: unknown; readonly currentTarget: unknown; readonly defaultPrevented: boolean; readonly timeStamp: number; preventDefault(): void; stopPropagation(): void"],
    ["DomKeyboardEvent", "KeyboardEvent", "A keyboard event (`lib.dom`'s `KeyboardEvent`).",
      "readonly key: string; readonly code: string; readonly altKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean; readonly repeat: boolean; readonly isComposing: boolean"],
    ["DomMouseEvent", "MouseEvent", "A mouse event (`lib.dom`'s `MouseEvent`).",
      "readonly button: number; readonly buttons: number; readonly clientX: number; readonly clientY: number; readonly pageX: number; readonly pageY: number; readonly offsetX: number; readonly offsetY: number; readonly screenX: number; readonly screenY: number; readonly altKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean"],
    ["DomPointerEvent", "PointerEvent", "A pointer event (`lib.dom`'s `PointerEvent`).",
      "readonly pointerId: number; readonly pointerType: string; readonly pressure: number; readonly width: number; readonly height: number; readonly isPrimary: boolean"],
    ["DomFocusEvent", "FocusEvent", "A focus event (`lib.dom`'s `FocusEvent`).", "readonly relatedTarget: unknown"],
    ["DomDragEvent", "DragEvent", "A drag event (`lib.dom`'s `DragEvent`).", "readonly dataTransfer: unknown"],
    ["DomWheelEvent", "WheelEvent", "A wheel event (`lib.dom`'s `WheelEvent`).",
      "readonly deltaX: number; readonly deltaY: number; readonly deltaZ: number; readonly deltaMode: number"],
    ["DomClipboardEvent", "ClipboardEvent", "A clipboard event (`lib.dom`'s `ClipboardEvent`).", "readonly clipboardData: unknown"],
    ["DomInputEvent", "InputEvent", "An input event (`lib.dom`'s `InputEvent`).",
      "readonly data: string | null; readonly inputType: string; readonly isComposing: boolean"],
    ["DomElement", "HTMLElement", "A rendered element (`lib.dom`'s `HTMLElement`), as `Mount` / `OnMount` / ref callbacks receive it.",
      "readonly tagName: string; readonly id: string; readonly className: string; readonly textContent: string | null; readonly isConnected: boolean; focus(): void; blur(): void; scrollIntoView(arg?: boolean | { readonly behavior?: \"auto\" | \"smooth\" | \"instant\"; readonly block?: \"start\" | \"center\" | \"end\" | \"nearest\"; readonly inline?: \"start\" | \"center\" | \"end\" | \"nearest\" }): void; getAttribute(name: string): string | null; setAttribute(name: string, value: string): void; removeAttribute(name: string): void"],
    ["DomFile", "File", "A picked / dropped file (`lib.dom`'s `File`).",
      "readonly name: string; readonly size: number; readonly type: string; readonly lastModified: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>"],
  ];
  // The fallbacks nest like lib.dom's interfaces do.
  const parent: Readonly<Record<string, string>> = {
    DomKeyboardEvent: "DomEvent", DomMouseEvent: "DomEvent", DomFocusEvent: "DomEvent", DomClipboardEvent: "DomEvent", DomInputEvent: "DomEvent",
    DomPointerEvent: "DomMouseEvent", DomDragEvent: "DomMouseEvent", DomWheelEvent: "DomMouseEvent",
  };
  const lines = [
    jsdoc("`lib.dom`'s instance type `N` when the DOM lib is loaded, else `Fallback`.") +
      `type ${typeName("__DomLib")}<N extends string, Fallback> = typeof globalThis extends { readonly [K in N]: { readonly prototype: infer E } } ? E : Fallback;`,
  ];
  for (const [name, lib, doc, members] of shapes) {
    const shape = `__${name}Shape`;
    const base = parent[name] ? ` extends __${parent[name]}Shape` : "";
    lines.push(`interface ${typeName(shape)}${base} { ${members} }`);
    lines.push(`${jsdoc(`${doc} Without the DOM lib: the structural subset the runtime guarantees.`)}export type ${typeName(name)} = __DomLib<${JSON.stringify(lib)}, ${shape}>;`);
  }
  return lines;
}
