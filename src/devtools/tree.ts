/**
 * Aktion DevTools — component-tree derivation.
 *
 * The runtime never sends a nested tree over the protocol; it sends a flat list
 * of {@link ComponentRenderRecord}s in render order, each carrying the instance
 * key the renderer derived. That is not a shortcut — the instance key *is* the
 * tree:
 *
 *   `$/0#Page@1:0/1#Card@7:4>0#Button@9:12`
 *    └ root  └ user comp   └ library comp  └ child painted via `renderNode`
 *
 * Every child key extends its parent's key by a `/index`, `>index`, or `#Name`
 * segment, so the parent of any key is the longest other key that is a prefix
 * of it at a segment boundary. Deriving the shape here — in one pure function
 * both the host and the panel call — means the runtime pays nothing for it and
 * the two halves can never disagree about who owns whom.
 */

import type { ComponentRenderRecord, InstanceNode } from "./protocol.js";

/** Characters that begin a new segment of an instance key. */
const SEGMENT_STARTS = new Set(["/", ">", "#"]);

/**
 * Parent instance key of `key` within `keys`, or `null` when it is a root.
 *
 * Only prefixes that end at a segment boundary count, so `…#Item@2:0` is never
 * mistaken for the parent of `…#Item@2:01` (a real collision once a program has
 * more than nine columns of indentation).
 */
export function parentKeyOf(key: string, keys: ReadonlySet<string>): string | null {
  for (let i = key.length - 1; i > 0; i -= 1) {
    if (!SEGMENT_STARTS.has(key[i]!)) continue;
    const candidate = key.slice(0, i);
    if (candidate !== key && keys.has(candidate)) return candidate;
  }
  return null;
}

/** Ancestor keys of `key`, root first. */
export function ancestorsOf(key: string, keys: ReadonlySet<string>): string[] {
  const out: string[] = [];
  let current = parentKeyOf(key, keys);
  let guard = 0;
  while (current !== null && guard++ < 200) {
    out.push(current);
    current = parentKeyOf(current, keys);
  }
  return out.reverse();
}

/**
 * Component name encoded in the last segment of an instance key
 * (`…#Button@9:12` → `Button`). Useful when a key outlives the commit that
 * produced it — a stale selection still shows a meaningful label.
 */
export function componentNameFromKey(key: string): string {
  const hash = key.lastIndexOf("#");
  if (hash < 0) return key;
  const tail = key.slice(hash + 1);
  const cut = tail.search(/[@=/>]/);
  return cut < 0 ? tail : tail.slice(0, cut);
}

/**
 * Short, human display form of an instance key: the component name plus the
 * disambiguator the renderer used (`Button@9:12`, `Row=user-3`).
 */
export function shortInstanceLabel(key: string): string {
  const hash = key.lastIndexOf("#");
  return hash < 0 ? key : key.slice(hash + 1);
}

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
export function buildInstanceTree(records: ReadonlyArray<ComponentRenderRecord>): InstanceNode[] {
  const byKey = new Map<string, ComponentRenderRecord>();
  const counts = new Map<string, number>();
  for (const record of records) {
    byKey.set(record.instanceKey, record);
    counts.set(record.instanceKey, (counts.get(record.instanceKey) ?? 0) + 1);
  }
  const keys = new Set(byKey.keys());
  const depthCache = new Map<string, number>();
  const depthOf = (key: string): number => {
    const cached = depthCache.get(key);
    if (cached !== undefined) return cached;
    const parent = parentKeyOf(key, keys);
    const depth = parent === null ? 0 : depthOf(parent) + 1;
    depthCache.set(key, depth);
    return depth;
  };

  const nodes: InstanceNode[] = [];
  for (const [key, record] of byKey) {
    nodes.push({
      instanceKey: key,
      name: record.name,
      kind: record.kind,
      parentKey: parentKeyOf(key, keys),
      depth: depthOf(key),
      phase: record.phase,
      selfTime: record.selfTime,
      source: record.source,
      explicitKey: record.explicitKey,
      propCount: record.props?.length ?? 0,
      renders: counts.get(key) ?? 1,
    });
  }
  return sortTree(nodes);
}

/**
 * Order nodes so a flat render is already a readable tree: parents immediately
 * followed by their children, siblings in the order the renderer produced them.
 */
export function sortTree(nodes: ReadonlyArray<InstanceNode>): InstanceNode[] {
  const children = new Map<string | null, InstanceNode[]>();
  for (const node of nodes) {
    const bucket = children.get(node.parentKey);
    if (bucket) bucket.push(node);
    else children.set(node.parentKey, [node]);
  }
  const out: InstanceNode[] = [];
  const visit = (parent: string | null): void => {
    for (const node of children.get(parent) ?? []) {
      out.push(node);
      visit(node.instanceKey);
    }
  };
  visit(null);
  // Any node whose parent is not in the set (a partial commit, a stale record)
  // would be orphaned by the walk above; append it so nothing silently vanishes.
  if (out.length < nodes.length) {
    const seen = new Set(out.map((n) => n.instanceKey));
    for (const node of nodes) {
      if (!seen.has(node.instanceKey)) out.push(node);
    }
  }
  return out;
}

/** Keys of every descendant of `key` (not including `key` itself). */
export function descendantsOf(key: string, nodes: ReadonlyArray<InstanceNode>): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.instanceKey !== key && node.instanceKey.startsWith(key)) {
      const next = node.instanceKey[key.length];
      if (next !== undefined && SEGMENT_STARTS.has(next)) out.push(node.instanceKey);
    }
  }
  return out;
}
