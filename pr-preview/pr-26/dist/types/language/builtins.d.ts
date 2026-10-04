/**
 * Catalog of Aktion's `$`-prefixed builtins — the single source of truth for
 * editor tooling (completions, hover, semantic highlighting, the TextMate
 * grammar generator, and signature help).
 *
 * Aktion's runtime "builtins" are all `$`-prefixed forms. Some are hooks
 * (`$state`, `$memo`, …), some are reactive factories (`$store`, `$http`, …),
 * some register the app / router / theme, and some resolve to a namespace
 * object (`$util.format(...)`, `$storage.local`, …). The legacy `@`-builtin
 * catalog was removed in 0.5; programs use native JavaScript or `$util`.
 *
 * Keep this list in sync with the runtime dispatch in
 * `src/runtime/evaluator.ts` (`evaluateInvoke` for `StateRef` callees) and the
 * namespace implementations in `src/runtime/*`. Anything added here is
 * automatically surfaced to every editor that consumes `aktion-runtime/language`.
 */
export type BuiltinCategory = "hook" | "effect" | "data" | "app" | "routing" | "theme" | "event" | "namespace";
export interface BuiltinEntry {
    /** Name WITHOUT the leading `$` sigil (e.g. `"state"`, `"util"`). */
    name: string;
    /** Reference form WITH the sigil (e.g. `"$state"`). */
    sigil: string;
    category: BuiltinCategory;
    /** Completion label / signature skeleton, e.g. `"$state(initial)"`. */
    signature: string;
    /** One-line description for hover popups and completion detail. */
    summary: string;
    /**
     * True when the name resolves to a namespace object whose members are
     * reached via `.` (`$util.format`, `$storage.local`, `$toast.show`, …).
     * Namespaces are NOT necessarily callable.
     */
    namespace?: boolean;
}
/**
 * Every `$`-prefixed builtin Aktion exposes, grouped loosely by purpose.
 * The order is the order editors surface them in the after-`$` completion
 * list, so the most common authoring tools (hooks, effects) come first.
 */
export declare const builtinCatalog: readonly BuiltinEntry[];
/** Bare builtin names (without the `$` sigil), for O(1) membership tests. */
export declare const builtinNames: ReadonlySet<string>;
/** Catalog indexed by the bare name (`"state"`, `"util"`, …). */
export declare const builtinsByName: Readonly<Record<string, BuiltinEntry>>;
/**
 * Resolve a `$`-prefixed builtin by its bare name (the value carried on a
 * `StateIdentifier` token, e.g. `"state"` for `$state`). Returns `undefined`
 * for user atoms / hooks that are not part of the runtime catalog.
 */
export declare function findBuiltin(bareName: string): BuiltinEntry | undefined;
/** True when `bareName` (no `$`) names a runtime builtin. */
export declare function isBuiltinName(bareName: string): boolean;
