import { Program, Statement } from '../parser/types.js';
import { EndpointResource } from '../runtime/http.js';
import { HookCell, StoreHandle } from '../runtime/evaluator.js';
import { Diagnostic, InstanceHookRecord, InstanceUiStateRecord, OutlineEntry, QueryInfo, StateAtomMeta, StoreInfo } from './protocol.js';
/**
 * Describe one component instance's hook cells.
 *
 * Slots are positional (the rules of hooks), so the slot index is the address
 * an edit is written to — there are no names to key on, which is exactly why
 * the inspector shows the index alongside the value.
 */
export declare function describeHookCells(cells: ReadonlyArray<HookCell> | undefined): InstanceHookRecord[];
/** Describe a renderer's `useInstanceState` slots for one instance. */
export declare function describeUiState(slots: ReadonlyArray<{
    key: string;
    value: unknown;
}>): InstanceUiStateRecord[];
/** True for an atom the runtime created rather than the author. */
export declare function isReservedAtom(name: string): boolean;
/**
 * Recover the name the author wrote for a module-scoped atom.
 *
 * The linker gives every non-entry module private scope by renaming its atoms
 * (`$filter` in `lib/store.aktion` becomes `__a4_filter`), so an inspector that
 * only showed the mangled name would be showing a name that appears nowhere in
 * the author's source. The numeric part is import-traversal order, which is why
 * this is a decode rather than a lookup.
 */
export declare function decodeModuleAtom(name: string): {
    authored: string;
    moduleIndex: number;
} | null;
/**
 * Describe every declared atom: whether it is runtime-owned, whether a
 * `$name = expr` initialiser makes it derived, and which module it came from.
 */
export declare function describeStateMeta(names: ReadonlyArray<string>, computedNames: ReadonlySet<string>, sources: ReadonlyArray<string> | undefined): StateAtomMeta[];
/** Describe the shared `$query` / `Http({...})` resource cache. */
export declare function describeQueries(cache: ReadonlyMap<string, EndpointResource>): QueryInfo[];
/**
 * Describe `Store({...})` / `$form({...})` handles.
 *
 * A handle's state lives in one reactive atom (`__store_3_10`), which is why
 * these show up in the State tab as unreadable machine names. Naming the
 * declaration site and the methods turns that back into something an author
 * recognises.
 */
export declare function describeStores(stores: ReadonlyMap<string, StoreHandle>, readAtom: (atom: string) => unknown): StoreInfo[];
/**
 * Statically collect the route patterns a program declares.
 *
 * The router discovers patterns *dynamically* — a pattern only becomes known
 * once its arm matches — so a Routes tab built from observation can only ever
 * show where you have already been. Walking the AST for `$router({ … })` arms
 * (including nested `layout` / `routes` maps) gives the full map up front,
 * which is what makes "click a route to navigate there" possible.
 */
export declare function collectRoutePatterns(program: Program): string[];
/** Merge the runtime's several error channels into one structured list. */
export declare function describeDiagnostics(input: {
    parse: ReadonlyArray<{
        line: number;
        column: number;
        message: string;
    }>;
    warnings?: ReadonlyArray<{
        line: number;
        column: number;
        message: string;
    }>;
    effects?: ReadonlyArray<string>;
    src?: ReadonlyArray<string>;
}): Diagnostic[];
/**
 * Outline of a program's top-level declarations — components, effects,
 * actions, hooks, state atoms, imports.
 *
 * This is the map the Source tab uses to jump around, and the answer to "what
 * does this program even contain?" for a streamed program nobody has read.
 */
export declare function outlineProgram(statements: ReadonlyArray<Statement>): OutlineEntry[];
/**
 * JSON text of a state snapshot, for the export / time-travel features.
 * Returns `null` when the snapshot holds something that cannot round-trip,
 * so a caller never writes a half-valid file.
 */
export declare function snapshotToJson(snapshot: Record<string, unknown>): string | null;
