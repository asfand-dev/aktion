/**
 * The linker's module-local symbol mangling, shared with the parser.
 *
 * The linker (`src/compiler/linker.ts`) renames every top-level name of an
 * imported module to a per-module-unique symbol before merging the graph into
 * one program. The parser needs the inverse: it classifies a `function` by the
 * first character of its name (PascalCase → component), and a renamed
 * `Counter` is `__a1_Counter`, which starts with `_`. Printing a linked program
 * and parsing it again (`linkProject`, reconnect, DevTools reload) would demote
 * every imported component to an action unless the parser looks through the
 * mangling.
 *
 * Kept here, in `parser/`, because the compiler already depends on the parser:
 * importing the pattern from `compiler/` would create a parser → compiler
 * cycle. `src/compiler/linker.ts` should re-export these instead of keeping its
 * own copy, so the linker's renaming and the parser's classification can never
 * drift apart; `moduleLocalSymbol` / `moduleLocalBaseName` then stay part of the
 * compiler's public surface as well.
 */
/**
 * The symbol a module-local name is renamed to when it is merged into the linked
 * program: `total` in module 3 becomes `__a3_total`.
 *
 * Exported because the mangling is observable — `serializeState()` returns these
 * keys, so a test or devtool inspecting a multi-file program's `$state` sees
 * `__a3_total`, not `total`. {@link moduleLocalBaseName} is the inverse, and is
 * what lets a caller work in the names the author actually wrote.
 */
export declare function moduleLocalSymbol(moduleId: number, name: string): string;
/** Pattern behind {@link moduleLocalSymbol}. Group 1 is the id, group 2 the name. */
export declare const MODULE_LOCAL_SYMBOL: RegExp;
/**
 * Recover the name an author wrote from a linker-renamed symbol, or `null` if
 * `symbol` is not one.
 *
 * ```ts
 * moduleLocalBaseName("__a3_total"); // "total"
 * moduleLocalBaseName("total");      // null — an entry-module name, unrenamed
 * ```
 *
 * Note the module id is not stable across edits: it comes from import traversal
 * order, so a new import can renumber every module. Resolve by base name rather
 * than hard-coding a mangled symbol.
 */
export declare function moduleLocalBaseName(symbol: string): string | null;
/**
 * Pattern of the names the JS-semantics layer gives to local bindings of
 * `.aktion.js` / `.aktion.ts` modules (W1: `total` → `__l3_total`). Group 1 is
 * the counter, group 2 the name.
 */
export declare const LOCAL_BINDING_SYMBOL: RegExp;
/**
 * The name a W1-renamed local was written with: `"__l3_total"` → `"total"`,
 * `null` for any other name. The counterpart of {@link moduleLocalBaseName},
 * for messages, coverage and DevTools.
 */
export declare function localBindingBaseName(symbol: string): string | null;
/** The name an author wrote for any compiler-minted symbol (`__a{n}_` or `__l{n}_`), else `symbol` itself. */
export declare function authoredName(symbol: string): string;
