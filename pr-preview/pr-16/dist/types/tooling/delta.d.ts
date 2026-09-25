/**
 * Aktion 0.5 §14 — Delta Protocol.
 *
 * In v1 every LLM turn replaced the entire program. SUIS/2 ships a
 * structured delta surface so a "tweak the UI" turn can stay tiny:
 * a handful of typed operations applied to the previous program's
 * Committed AST. The runtime mounts the patched program with the
 * user's `$state` preserved across the diff.
 *
 * The spec's original pragma signalling (`#sus/2 delta`) was retired
 * along with every other pragma in 0.5 (`#…` lines are comments). The
 * delta is therefore expressed as **structured operations** — hosts
 * call `el.applyDelta(ops)` directly, no in-language pragma required.
 *
 * Operations
 * ----------
 *
 *   { kind: "patch", target: "stateName", value: 50 }
 *     Update a `$state` atom in place. Does not touch the program
 *     text. Use for "set the slider to 50", "expand the panel", etc.
 *
 *   { kind: "replace", binding: "header", source: "PageHeader(\"Sales\")" }
 *     Replace a top-level binding's RHS. Equivalent to deleting and
 *     re-emitting the line(s).
 *
 *   { kind: "append", binding: "items", item: "{ label: \"Reports\" }" }
 *     Append an item to a top-level array binding. `binding`'s RHS
 *     must be a literal array expression.
 *
 *   { kind: "new", source: "function ReportCard(r) { return Card([Text(r.title)]) }" }
 *     Append a new top-level statement to the program.
 *
 *   { kind: "delete", binding: "legacyWidget" }
 *     Remove a top-level binding (or component / action / effect /
 *     endpoint declaration) by name.
 *
 * Op application is best-effort: each op that does not match its
 * target surfaces an advisory warning and is skipped. The runtime
 * still mounts the rest of the patched program — partial deltas
 * never strand the user with no UI.
 *
 * The function is pure: feed in `(source, ops)`, get back
 * `(programText, stateUpdates, warnings)`. State application is the
 * caller's responsibility (the host element wires it up — see
 * `AktionElement.applyDelta`).
 */
export type DeltaOp = {
    kind: "patch";
    target: string;
    value: unknown;
} | {
    kind: "replace";
    binding: string;
    source: string;
} | {
    kind: "append";
    binding: string;
    item: string;
} | {
    kind: "new";
    source: string;
} | {
    kind: "delete";
    binding: string;
};
export interface DeltaResult {
    /** Source text after every structural op (replace/append/new/delete) lands. */
    programText: string;
    /** `patch` ops collected as a name→value map; the caller applies these to its state store. */
    stateUpdates: Record<string, unknown>;
    /** Advisory diagnostics for ops that became no-ops. */
    warnings: string[];
}
export declare function applyDelta(source: string, ops: readonly DeltaOp[]): DeltaResult;
