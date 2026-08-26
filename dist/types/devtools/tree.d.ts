import { ComponentRenderRecord, InstanceNode } from './protocol.js';
/**
 * Parent instance key of `key` within `keys`, or `null` when it is a root.
 *
 * Only prefixes that end at a segment boundary count, so `…#Item@2:0` is never
 * mistaken for the parent of `…#Item@2:01` (a real collision once a program has
 * more than nine columns of indentation).
 */
export declare function parentKeyOf(key: string, keys: ReadonlySet<string>): string | null;
/** Ancestor keys of `key`, root first. */
export declare function ancestorsOf(key: string, keys: ReadonlySet<string>): string[];
/**
 * Component name encoded in the last segment of an instance key
 * (`…#Button@9:12` → `Button`). Useful when a key outlives the commit that
 * produced it — a stale selection still shows a meaningful label.
 */
export declare function componentNameFromKey(key: string): string;
/**
 * Short, human display form of an instance key: the component name plus the
 * disambiguator the renderer used (`Button@9:12`, `Row=user-3`).
 */
export declare function shortInstanceLabel(key: string): string;
/**
 * Build the instance tree for one commit.
 *
 * Records for the same instance can legitimately repeat within a commit (a
 * component painted out of band by `helpers.renderNode`), so the last record
 * wins — it is the one whose timing and props describe the DOM currently on
 * screen. `depth` is recomputed from the derived parent chain rather than
 * trusted from the record, because the renderer's `depth` counts `#` segments
 * and a list-heavy tree indents in `/` segments the flamegraph collapses.
 */
export declare function buildInstanceTree(records: ReadonlyArray<ComponentRenderRecord>): InstanceNode[];
/**
 * Order nodes so a flat render is already a readable tree: parents immediately
 * followed by their children, siblings in the order the renderer produced them.
 */
export declare function sortTree(nodes: ReadonlyArray<InstanceNode>): InstanceNode[];
/** Keys of every descendant of `key` (not including `key` itself). */
export declare function descendantsOf(key: string, nodes: ReadonlyArray<InstanceNode>): string[];
