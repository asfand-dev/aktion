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
/** Every `$`-namespace whose members are reached via `.`. */
export declare const namespaceCatalog: readonly NamespaceEntry[];
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
export declare const factoryResourceCatalog: readonly FactoryResourceEntry[];
/** Factory builtin names whose returned bag has a known member shape. */
export declare const factoryResourceNames: ReadonlySet<string>;
/** Members of the reserved reactive `route` handle (`route.path`, …). */
export declare const routeMembers: readonly NamespaceMember[];
/** The bag `$i18n({...})` returns (usually destructured). */
export declare const i18nResultMembers: readonly NamespaceMember[];
/** Resolve a namespace entry by its bare name (`"util"`, `"storage"`, …). */
export declare function findNamespace(bareName: string): NamespaceEntry | undefined;
/** True when `bareName` (no `$`) names a `.`-member namespace. */
export declare function isNamespaceName(bareName: string): boolean;
/** Resolve the resource-bag entry for a factory builtin (`"http"`, …). */
export declare function findFactoryResource(factory: string): FactoryResourceEntry | undefined;
/**
 * Members offered at a member-access path inside a namespace. `path` is the
 * already-typed sub-namespace segments after the root, e.g. `["style"]` for
 * `$util.style.`. Returns the matching members with the consumed prefix
 * stripped from each name (so `style.cx` is offered as `cx` after `$util.style.`).
 */
export declare function namespaceMembersAt(bareName: string, path?: readonly string[]): NamespaceMember[];
/**
 * Resolve a fully-qualified member by its dotted path within a namespace.
 * `$util.style.cx` → `findNamespaceMember("util", "style.cx")`.
 */
export declare function findNamespaceMember(bareName: string, memberPath: string): NamespaceMember | undefined;
export interface ConfigKey {
    name: string;
    /** Value type hint, e.g. `"string"`, `"object"`, `'enum: "GET" | "POST"'`. */
    type: string;
    summary: string;
}
/**
 * Config-object keys accepted by a config-taking builtin (`bareName` without
 * the `$` — `"http"`, `"theme"`, …), or `undefined` when the builtin takes no
 * fixed-key config object (e.g. `$router`, whose keys are route patterns).
 */
export declare function findBuiltinConfig(bareName: string): readonly ConfigKey[] | undefined;
