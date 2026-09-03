import { ComponentLibrary } from '../library/types.js';
export interface Position {
    /** 1-indexed line number. */
    line: number;
    /** 1-indexed column number. */
    column: number;
}
export interface Diagnostic {
    line: number;
    column: number;
    message: string;
    /** `error` when the program will not render; `warning` is reserved for the future. */
    severity: "error" | "warning";
}
export interface CompletionItem {
    /** Insertion text (the user types this to accept). */
    label: string;
    /**
     * What kind of symbol this is. Useful when the host wants to render
     * different icons per kind (LSP / editor UIs typically display these).
     */
    kind: "component" | "prop" | "state" | "builtin" | "keyword";
    /** Short textual description. */
    detail?: string;
    /** Long-form documentation surfaced in a tooltip. */
    documentation?: string;
}
export interface HoverInfo {
    /** Markdown-friendly text rendered in the hover popup. */
    contents: string;
    /** Symbol kind for clients that prefer typed surfaces. */
    kind: "component" | "prop" | "state" | "builtin" | "unknown";
}
/**
 * Combine parse-level + schema-level diagnostics into one list. Every
 * entry has a `severity` field so editors can theme errors vs warnings
 * (in 0.5 every entry is currently `error` — there are no soft
 * warnings — but the surface stays future-proof).
 */
export declare function getDiagnostics(source: string, library: ComponentLibrary): Diagnostic[];
/**
 * Static lint warnings for patterns the schema validator cannot flag. On by
 * default inside `getDiagnostics`; also exported standalone for hosts that want
 * only the soft warnings. Currently:
 *
 *   - `unknown-component` — a PascalCase call (`Cardd(...)`) that is neither a
 *     library component nor anything this document declares or imports.
 *     Requires `library`; skipped when it is omitted.
 *   - `shadowed-i18n` — a `function` / lambda parameter or `for…of` / `for…in`
 *     loop variable named the same as a binding destructured from `$i18n(...)`
 *     (typically `t`). Inside that scope the name resolves to the local, so a
 *     `t("key")` call quietly invokes the loop item instead of the translator.
 *     Only fires when `$i18n` is actually destructured in the program, so a
 *     plain `arr.map(t => …)` elsewhere is never flagged.
 *   - `awaited-value` — the RESULT of an `await` being used. `await` parses so
 *     that JavaScript-shaped source still compiles, but it does not suspend:
 *     bodies run synchronously and nothing unwraps the thenable, so the value is
 *     the PROMISE. `const ok = await $util.copy(v)` is therefore always truthy.
 *     A bare `await f()` whose value is discarded is not flagged — only a use.
 */
export declare function getLintWarnings(source: string, library?: ComponentLibrary): Diagnostic[];
/**
 * Completion items for the cursor position `position`. Heuristics are
 * intentionally simple — the prompt + the closed schema (§16) make
 * deep static analysis unnecessary:
 *
 *   - After `$` → the reactive-atom hint + the `$`-builtin catalog.
 *   - Inside a component call's trailing `{ … }` props object → that
 *     component's prop names, FOLLOWED BY the general list (so you can
 *     still reference components / atoms / actions in prop values).
 *   - Everywhere else (top of line, inside a `[ … ]` children array, a
 *     `( … )` argument list) → the general list: author-declared symbols,
 *     keywords, and the full component library. Components are ALWAYS
 *     offered here — a children array like `Column([ Sidebar() ])` is the
 *     most common authoring position, so suppressing components there
 *     (the old behaviour) broke the headline autocomplete.
 */
export declare function getCompletions(source: string, position: Position, library: ComponentLibrary): CompletionItem[];
/**
 * Hover info for the symbol under the cursor. Returns `null` when the
 * cursor is not over a recognised symbol.
 */
export declare function getHoverInfo(source: string, position: Position, library: ComponentLibrary): HoverInfo | null;
