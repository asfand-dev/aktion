/**
 * Aktion DevTools — runtime introspection helpers.
 *
 * Pure translations from live runtime structures into protocol shapes. They
 * live here rather than in `element.ts` because they are *descriptions*, not
 * behaviour: nothing in this file mutates the app, so each function is testable
 * on its own and the host element keeps only the glue.
 *
 * Everything imported from the runtime is a TYPE, so this module adds no
 * runtime dependency in either direction — the host bundles it as a few small
 * functions, and a frontend that never calls them never pulls them in.
 */

import type { Program, Statement } from "../parser/types.js";
import { walk } from "../parser/walk.js";
import type { EndpointResource } from "../runtime/http.js";
import type { HookCell, StoreHandle } from "../runtime/evaluator.js";
import type {
  Diagnostic,
  InstanceHookRecord,
  InstanceUiStateRecord,
  OutlineEntry,
  QueryInfo,
  StateAtomMeta,
  StoreInfo,
} from "./protocol.js";
import { toDevtoolsValue, toJsonText } from "./serialize.js";

/* -------------------------------------------------------------------------- */
/*  Hooks + per-instance UI state                                              */
/* -------------------------------------------------------------------------- */

/**
 * Describe one component instance's hook cells.
 *
 * Slots are positional (the rules of hooks), so the slot index is the address
 * an edit is written to — there are no names to key on, which is exactly why
 * the inspector shows the index alongside the value.
 */
export function describeHookCells(cells: ReadonlyArray<HookCell> | undefined): InstanceHookRecord[] {
  if (!cells) return [];
  return cells.map((cell, slot) => {
    const raw = cell.kind === "ref" ? cell.box.current : (cell as { value?: unknown }).value;
    const value = toDevtoolsValue(raw);
    return {
      slot,
      kind: cell.kind,
      value,
      // `id` cells are runtime-generated identifiers; overwriting one would
      // desynchronise the `aria-*` wiring that depends on it. `memo` cells are
      // recomputed from their deps, so an edit would be silently reverted on
      // the next render — showing it read-only is the honest answer.
      editable: (cell.kind === "state" || cell.kind === "ref" || cell.kind === "reducer") && value.json !== undefined,
    };
  });
}

/** Describe a renderer's `useInstanceState` slots for one instance. */
export function describeUiState(
  slots: ReadonlyArray<{ key: string; value: unknown }>,
): InstanceUiStateRecord[] {
  return slots.map(({ key, value }) => {
    const described = toDevtoolsValue(value);
    return { key, value: described, editable: described.json !== undefined };
  });
}

/* -------------------------------------------------------------------------- */
/*  Reactive state                                                             */
/* -------------------------------------------------------------------------- */

/** Atom names the runtime owns; an inspector shows them but must not edit them. */
const RUNTIME_ATOM_PREFIXES = ["__store_", "__form_", "__query_", "__effect_"];

/** True for an atom the runtime created rather than the author. */
export function isReservedAtom(name: string): boolean {
  if (name === "route") return true;
  return RUNTIME_ATOM_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Recover the name the author wrote for a module-scoped atom.
 *
 * The linker gives every non-entry module private scope by renaming its atoms
 * (`$filter` in `lib/store.aktion` becomes `__a4_filter`), so an inspector that
 * only showed the mangled name would be showing a name that appears nowhere in
 * the author's source. The numeric part is import-traversal order, which is why
 * this is a decode rather than a lookup.
 */
export function decodeModuleAtom(name: string): { authored: string; moduleIndex: number } | null {
  const match = /^__a(\d+)_(.+)$/.exec(name);
  if (!match) return null;
  return { authored: match[2]!, moduleIndex: Number(match[1]) };
}

/**
 * Describe every declared atom: whether it is runtime-owned, whether a
 * `$name = expr` initialiser makes it derived, and which module it came from.
 */
export function describeStateMeta(
  names: ReadonlyArray<string>,
  computedNames: ReadonlySet<string>,
  sources: ReadonlyArray<string> | undefined,
): StateAtomMeta[] {
  return names
    .map((name) => {
      const decoded = decodeModuleAtom(name);
      const meta: StateAtomMeta = {
        name,
        reserved: isReservedAtom(name),
        computed: computedNames.has(name),
      };
      if (decoded) {
        meta.authored = decoded.authored;
        const path = sources?.[decoded.moduleIndex];
        if (path) meta.module = path;
      }
      return meta;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------------------- */
/*  Data layer                                                                 */
/* -------------------------------------------------------------------------- */

/** Describe the shared `$query` / `Http({...})` resource cache. */
export function describeQueries(cache: ReadonlyMap<string, EndpointResource>): QueryInfo[] {
  const out: QueryInfo[] = [];
  for (const [key, resource] of cache) {
    const info: QueryInfo = {
      key,
      state: String(resource.state),
      loading: Boolean(resource.loading),
      data: toDevtoolsValue(resource.data),
    };
    if (resource.status !== undefined) info.status = resource.status;
    if (resource.error != null) info.error = toDevtoolsValue(resource.error);
    if (resource.lastUpdated !== undefined) info.lastUpdated = resource.lastUpdated;
    if (resource.loadMore !== undefined) {
      info.infinite = true;
      info.page = resource.page;
      info.hasMore = resource.hasMore;
    }
    out.push(info);
  }
  return out;
}

/**
 * Describe `Store({...})` / `$form({...})` handles.
 *
 * A handle's state lives in one reactive atom (`__store_3_10`), which is why
 * these show up in the State tab as unreadable machine names. Naming the
 * declaration site and the methods turns that back into something an author
 * recognises.
 */
export function describeStores(
  stores: ReadonlyMap<string, StoreHandle>,
  readAtom: (atom: string) => unknown,
): StoreInfo[] {
  const out: StoreInfo[] = [];
  for (const [key, handle] of stores) {
    const atom = handle.__atom;
    const flavour = atom.startsWith("__form_") ? "form" : "store";
    const loc = /^(\d+):(\d+)$/.exec(key);
    out.push({
      atom,
      flavour,
      source: loc ? { line: Number(loc[1]), column: Number(loc[2]) } : undefined,
      methods: Object.keys(handle.__methods ?? {}).sort(),
      value: toDevtoolsValue(readAtom(atom)),
    });
  }
  return out.sort((a, b) => a.atom.localeCompare(b.atom));
}

/* -------------------------------------------------------------------------- */
/*  Routes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Statically collect the route patterns a program declares.
 *
 * The router discovers patterns *dynamically* — a pattern only becomes known
 * once its arm matches — so a Routes tab built from observation can only ever
 * show where you have already been. Walking the AST for `$router({ … })` arms
 * (including nested `layout` / `routes` maps) gives the full map up front,
 * which is what makes "click a route to navigate there" possible.
 */
export function collectRoutePatterns(program: Program): string[] {
  const patterns = new Set<string>();

  const collectFromObject = (node: unknown, prefix: string): void => {
    const obj = node as { kind?: string; properties?: Array<{ key: string; value: unknown; spread?: boolean }> };
    if (obj?.kind !== "Object" || !Array.isArray(obj.properties)) return;
    for (const prop of obj.properties) {
      if (prop.spread) continue;
      if (prop.key === "default" || prop.key === "*") continue;
      const full = `${prefix}${prop.key}`;
      // A layout arm nests its children under `routes: { … }`; the arm itself
      // is a prefix match, so record both it and every child path.
      const value = prop.value as { kind?: string; properties?: Array<{ key: string; value: unknown; spread?: boolean }> };
      const nested = value?.kind === "Object"
        ? value.properties?.find((p) => p.key === "routes" && (p.value as { kind?: string })?.kind === "Object")
        : undefined;
      patterns.add(full);
      if (nested) collectFromObject(nested.value, full);
    }
  };

  walk(program, ({ node }) => {
    if (node.kind !== "Invoke") return;
    const callee = node.callee;
    const isRouterCall =
      (callee.kind === "StateRef" && callee.name === "router") ||
      (callee.kind === "Identifier" && callee.name === "Router");
    if (!isRouterCall) return;
    const first = node.arguments[0];
    if (first) collectFromObject(first, "");
  });

  return [...patterns].sort();
}

/* -------------------------------------------------------------------------- */
/*  Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

/** Merge the runtime's several error channels into one structured list. */
export function describeDiagnostics(input: {
  parse: ReadonlyArray<{ line: number; column: number; message: string }>;
  warnings?: ReadonlyArray<{ line: number; column: number; message: string }>;
  effects?: ReadonlyArray<string>;
  src?: ReadonlyArray<string>;
}): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const error of input.parse) {
    // Schema violations arrive on the same channel as parse errors but read
    // very differently ("unknown prop" vs "unexpected token"); splitting them
    // lets the Source tab filter one without hiding the other.
    const kind = /unknown prop|expects|arity|enum|not a component|unknown component/i.test(error.message)
      ? "schema"
      : "parse";
    out.push({ line: error.line, column: error.column, message: error.message, kind, severity: "error" });
  }
  for (const warning of input.warnings ?? []) {
    out.push({ line: warning.line, column: warning.column, message: warning.message, kind: "schema", severity: "warning" });
  }
  for (const message of input.effects ?? []) {
    out.push({ line: 0, column: 0, message, kind: "effect", severity: "error" });
  }
  for (const message of input.src ?? []) {
    out.push({ line: 0, column: 0, message, kind: "src", severity: "error" });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Program shape                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Outline of a program's top-level declarations — components, effects,
 * actions, hooks, state atoms, imports.
 *
 * This is the map the Source tab uses to jump around, and the answer to "what
 * does this program even contain?" for a streamed program nobody has read.
 */
export function outlineProgram(statements: ReadonlyArray<Statement>): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  for (const stmt of statements) {
    const loc = (stmt as { loc?: { line: number; column: number } }).loc;
    const line = loc?.line ?? 0;
    const column = loc?.column ?? 0;
    switch (stmt.kind) {
      case "ComponentDeclaration":
        out.push({ kind: "component", name: stmt.name, line, column, exported: stmt.exported });
        break;
      case "EffectDeclaration":
        out.push({ kind: "effect", name: stmt.name, line, column });
        break;
      case "ActionDeclaration":
        out.push({ kind: "action", name: stmt.name, line, column });
        break;
      case "HookDeclaration":
        out.push({ kind: "hook", name: stmt.name, line, column });
        break;
      case "Import":
        out.push({ kind: "import", name: stmt.source, line, column });
        break;
      case "Assignment":
        out.push({
          kind: stmt.isState ? "state" : "binding",
          name: stmt.identifier,
          line,
          column,
          exported: stmt.exported,
        });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * JSON text of a state snapshot, for the export / time-travel features.
 * Returns `null` when the snapshot holds something that cannot round-trip,
 * so a caller never writes a half-valid file.
 */
export function snapshotToJson(snapshot: Record<string, unknown>): string | null {
  return toJsonText(snapshot);
}
