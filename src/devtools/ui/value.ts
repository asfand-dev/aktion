/**
 * Aktion DevTools — the value explorer.
 *
 * One tree for every value the panel shows: reactive state, component props,
 * response bodies, query data, REPL results. Having one implementation is the
 * point — a value that is editable in the State view behaves identically in the
 * Inspector, and a large array is virtualised everywhere, not just in the view
 * someone happened to profile.
 *
 * Editing is structural, not just leaf-level: a leaf edits in place (Enter
 * commits, Escape cancels, blur commits); an object or array can gain a key,
 * lose one, or be replaced wholesale as JSON. Every write is expressed as
 * `onEdit(path, nextValue)` against the nearest editable ancestor, so the
 * caller only ever implements one operation — and for reactive state that one
 * operation already goes through the same pipeline a real event handler uses.
 */

import { autofocus, h, type Child, type VElement, type VNode } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";
import { parseEditedValue } from "../serialize.js";
import { icon } from "./icons.js";

/** The one inline edit in progress, panel-wide. */
export interface EditState {
  scope: string;
  path: string;
  draft: string;
  /** `leaf` edits a value; `key` names a new object key. */
  mode: "leaf" | "key";
}

export interface ValueRow {
  path: string;
  key: string;
  depth: number;
  value: unknown;
  type: string;
  expandable: boolean;
  open: boolean;
  isIndex: boolean;
  /** Synthetic rows: "… N more", "+ add". */
  special?: "more" | "add";
  /** For `more` rows: how many children are hidden. */
  hidden?: number;
  /** For `more`/`add` rows: the container path. */
  container?: string;
  containerType?: string;
}

export interface ValueTreeOptions {
  /** Scope id, unique per tree on screen (`state`, `props:<key>`). */
  scope: string;
  /** Root value. Its children are the top-level rows. */
  value: unknown;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  rowHeight: number;
  /** May this path be written? Leaves AND containers are asked. */
  editable?: (path: string, depth: number) => boolean;
  onEdit?: (path: string, value: unknown) => void;
  /** Extra per-row content (heat bars, chips, buttons). */
  decorate?: (row: ValueRow) => Child;
  /** Row → extra classes (e.g. a flash class). */
  rowClass?: (row: ValueRow) => string;
  /** Case-insensitive filter on top-level keys and leaf values. */
  filter?: string;
  editing: EditState | null;
  setEditing: (edit: EditState | null) => void;
  /** Replace a container with JSON the user typed (opens the shell dialog). */
  editJson?: (path: string, value: unknown) => void;
  selected?: string | null;
  onSelect?: (path: string | null) => void;
  onCopy?: (text: string, what: string) => void;
  /** Children shown per container before a "show more" row. */
  pageSize?: number;
  /** Per-container expanded page counts (caller-owned so it survives renders). */
  pages?: Map<string, number>;
  onMore?: (container: string) => void;
  testid?: string;
  empty?: Child;
  /** Render inline (no virtualisation) — for short values inside a card. */
  inline?: boolean;
  version?: unknown;
}

/* -------------------------------------------------------------------------- */
/*  Flattening                                                                 */
/* -------------------------------------------------------------------------- */

export function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  return typeof value;
}

/** Children of a value as `[key, value]`, never throwing on exotic objects. */
export function entriesOf(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v]);
  if (value instanceof Map) return [...value.entries()].map(([k, v]) => [String(k), v]);
  if (value instanceof Set) return [...value.values()].map((v, i) => [String(i), v]);
  if (value !== null && typeof value === "object") {
    try {
      return Object.keys(value as object).map((k) => {
        let v: unknown;
        try { v = (value as Record<string, unknown>)[k]; } catch { v = "[getter threw]"; }
        return [k, v];
      });
    } catch {
      return [];
    }
  }
  return [];
}

function isContainer(value: unknown): boolean {
  const t = valueType(value);
  return t === "object" || t === "array" || t === "map" || t === "set";
}

function matchesFilter(key: string, value: unknown, needle: string): boolean {
  if (key.toLowerCase().includes(needle)) return true;
  if (!isContainer(value)) return previewValue(value).toLowerCase().includes(needle);
  // A container matches when any descendant key or leaf does (bounded walk).
  let budget = 400;
  const visit = (v: unknown): boolean => {
    for (const [k, child] of entriesOf(v)) {
      if (budget-- <= 0) return false;
      if (k.toLowerCase().includes(needle)) return true;
      if (isContainer(child) ? visit(child) : previewValue(child).toLowerCase().includes(needle)) return true;
    }
    return false;
  };
  return visit(value);
}

export function flattenValue(value: unknown, options: {
  expanded: Set<string>;
  filter?: string;
  pageSize?: number;
  pages?: Map<string, number>;
  editable?: (path: string, depth: number) => boolean;
}): ValueRow[] {
  const rows: ValueRow[] = [];
  const pageSize = options.pageSize ?? 200;
  const needle = (options.filter ?? "").trim().toLowerCase();
  const walk = (container: unknown, prefix: string, depth: number, containerPath: string): void => {
    const entries = entriesOf(container);
    const limit = pageSize * (options.pages?.get(containerPath) ?? 1);
    const containerType = valueType(container);
    let shown = 0;
    for (const [key, child] of entries) {
      if (depth === 0 && needle && !matchesFilter(key, child, needle)) continue;
      if (shown >= limit) break;
      shown += 1;
      const path = prefix ? `${prefix}.${key}` : key;
      const expandable = isContainer(child) && entriesOf(child).length > 0;
      const open = expandable && options.expanded.has(path);
      rows.push({ path, key, depth, value: child, type: valueType(child), expandable, open, isIndex: containerType === "array" || containerType === "set" });
      if (open) walk(child, path, depth + 1, path);
    }
    const total = depth === 0 && needle ? shown : entries.length;
    if (total > shown) {
      rows.push({ path: `${containerPath}::more`, key: "", depth, value: null, type: "more", expandable: false, open: false, isIndex: false, special: "more", hidden: total - shown, container: containerPath });
    }
    if (options.editable && containerPath !== "" && (containerType === "object" || containerType === "array") && options.editable(containerPath, depth - 1)) {
      rows.push({ path: `${containerPath}::add`, key: "", depth, value: null, type: "add", expandable: false, open: false, isIndex: false, special: "add", container: containerPath, containerType });
    }
  };
  walk(value, "", 0, "");
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Previews                                                                   */
/* -------------------------------------------------------------------------- */

export function previewValue(value: unknown): string {
  const t = valueType(value);
  switch (t) {
    case "string": {
      const text = value as string;
      return JSON.stringify(text.length > 200 ? `${text.slice(0, 200)}…` : text);
    }
    case "number":
    case "boolean":
      return String(value);
    case "bigint": return `${String(value)}n`;
    case "null": return "null";
    case "undefined": return "undefined";
    case "function": {
      const name = (value as { name?: string }).name;
      return name ? `ƒ ${name}()` : "ƒ ()";
    }
    case "date": return (value as Date).toISOString();
    case "array": {
      const arr = value as unknown[];
      if (arr.length === 0) return "[]";
      const head = arr.slice(0, 4).map(shortPreview).join(", ");
      return `(${arr.length}) [${head}${arr.length > 4 ? ", …" : ""}]`;
    }
    case "map": return `Map(${(value as Map<unknown, unknown>).size})`;
    case "set": return `Set(${(value as Set<unknown>).size})`;
    case "object": {
      const entries = entriesOf(value);
      if (entries.length === 0) return "{}";
      const head = entries.slice(0, 3).map(([k, v]) => `${k}: ${shortPreview(v)}`).join(", ");
      return `{${head}${entries.length > 3 ? ", …" : ""}}`;
    }
    default: return String(value);
  }
}

function shortPreview(value: unknown): string {
  const t = valueType(value);
  if (t === "string") {
    const s = value as string;
    return JSON.stringify(s.length > 18 ? `${s.slice(0, 18)}…` : s);
  }
  if (t === "array") return `Array(${(value as unknown[]).length})`;
  if (t === "object") return "{…}";
  if (t === "function") return "ƒ";
  return previewValue(value);
}

/** Text a leaf editor opens with — strings unquoted, everything else as JSON. */
export function editSeed(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * What a leaf edit will write. A field that held a string stays a string even
 * when the new text looks like JSON — typing `42` into a name field means the
 * text "42", not the number. Anything else goes through the shared parser.
 */
export function parseLeafEdit(draft: string, original: unknown): unknown {
  if (typeof original === "string") {
    const trimmed = draft.trim();
    // An explicitly quoted string is still honoured, so `"a"b"` style escapes work.
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      try { return JSON.parse(trimmed); } catch { return draft; }
    }
    if (trimmed === "null") return null;
    return draft;
  }
  return parseEditedValue(draft);
}

/** Replace `path` (dotted, relative to `root`) with `next`, immutably. */
export function setAtPath(root: unknown, segments: ReadonlyArray<string>, next: unknown): unknown {
  if (segments.length === 0) return next;
  const [head, ...rest] = segments as [string, ...string[]];
  if (Array.isArray(root)) {
    const copy = root.slice();
    copy[Number(head)] = setAtPath(copy[Number(head)], rest, next);
    return copy;
  }
  const base = root !== null && typeof root === "object" ? root as Record<string, unknown> : {};
  return { ...base, [head]: setAtPath(base[head], rest, next) };
}

/** Container minus one key/index. */
export function withoutKey(container: unknown, key: string): unknown {
  if (Array.isArray(container)) return container.filter((_, i) => String(i) !== key);
  if (container !== null && typeof container === "object") {
    const copy = { ...(container as Record<string, unknown>) };
    delete copy[key];
    return copy;
  }
  return container;
}

export function getAtPath(root: unknown, path: string): unknown {
  if (path === "") return root;
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (current instanceof Map) current = current.get(segment);
    else current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function parentPath(path: string): { parent: string; key: string } {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? { parent: "", key: path } : { parent: path.slice(0, dot), key: path.slice(dot + 1) };
}

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                  */
/* -------------------------------------------------------------------------- */

const INDENT = 14;

function leafSpan(value: unknown, type: string, open: boolean): VElement {
  if (open && (type === "object" || type === "array")) {
    return h("span", { class: `v t-${type}` }, type === "array" ? `Array(${(value as unknown[]).length})` : `{${entriesOf(value).length}}`);
  }
  return h("span", { class: `v t-${type}`, title: type === "string" ? (value as string) : undefined }, previewValue(value));
}

function typeHint(draft: string, original: unknown): string {
  const parsed = parseLeafEdit(draft, original);
  const t = valueType(parsed);
  return t === "array" ? `array(${(parsed as unknown[]).length})` : t;
}

/** The explorer. Virtualised unless `inline`. */
export function valueTree(options: ValueTreeOptions): VNode {
  const rows = flattenValue(options.value, {
    expanded: options.expanded,
    filter: options.filter,
    pageSize: options.pageSize,
    pages: options.pages,
    editable: options.onEdit ? options.editable : undefined,
  });

  const canEdit = (path: string, depth: number): boolean => options.onEdit !== undefined && (options.editable?.(path, depth) ?? true);

  const commitLeaf = (row: ValueRow, draft: string): void => {
    options.setEditing(null);
    const next = parseLeafEdit(draft, row.value);
    if (Object.is(next, row.value)) return;
    options.onEdit?.(row.path, next);
  };

  const deleteRow = (row: ValueRow): void => {
    const { parent, key } = parentPath(row.path);
    if (parent === "") return;
    const container = getAtPath(options.value, parent);
    options.onEdit?.(parent, withoutKey(container, key));
  };

  const renderRow = (row: ValueRow): Child => {
    const indent = 6 + row.depth * INDENT;
    if (row.special === "more") {
      return h("div", { class: "row", style: { paddingLeft: `${indent + 16}px` } },
        h("button", {
          type: "button", class: "link", "data-dt": "value-more",
          onClick: () => options.onMore?.(row.container ?? ""),
        }, `Show ${Math.min(row.hidden ?? 0, options.pageSize ?? 200)} more… (${row.hidden} hidden)`));
    }
    if (row.special === "add") {
      const editingKey = options.editing?.scope === options.scope && options.editing.path === row.path && options.editing.mode === "key";
      const container = row.container ?? "";
      if (editingKey) {
        return h("div", { class: "row", style: { paddingLeft: `${indent + 16}px` } },
          h("input", {
            class: "v-edit", "data-dt": "value-add-key", placeholder: "new key — Enter to add",
            value: options.editing!.draft,
            ref: autofocus(),
            onInput: (event: Event) => { options.editing!.draft = (event.target as HTMLInputElement).value; },
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const name = options.editing!.draft.trim();
                options.setEditing(null);
                if (!name) return;
                const target = getAtPath(options.value, container);
                options.onEdit?.(container, { ...(target as Record<string, unknown>), [name]: null });
                options.expanded.add(container);
              } else if (event.key === "Escape") {
                event.preventDefault();
                options.setEditing(null);
              }
            },
            onBlur: () => options.setEditing(null),
          }));
      }
      return h("div", { class: "row is-dim", style: { paddingLeft: `${indent + 16}px` } },
        h("button", {
          type: "button", class: "link", "data-dt": "value-add",
          onClick: () => {
            const target = getAtPath(options.value, container);
            if (Array.isArray(target)) {
              options.onEdit?.(container, [...target, null]);
            } else {
              options.setEditing({ scope: options.scope, path: row.path, draft: "", mode: "key" });
            }
          },
        }, icon("plus", { size: 11 }), row.containerType === "array" ? " Add item" : " Add key"));
    }

    const editing = options.editing?.scope === options.scope && options.editing.path === row.path && options.editing.mode === "leaf";
    const editableHere = canEdit(row.path, row.depth);
    const leafEditable = editableHere && !row.expandable && row.type !== "function" && row.type !== "object" && row.type !== "array";
    const selected = options.selected === row.path;

    let valueNode: Child;
    if (editing) {
      const draft = options.editing!.draft;
      valueNode = [
        h("input", {
          class: "v-edit",
          "data-dt": "value-edit",
          "aria-label": `Edit ${row.path}`,
          value: draft,
          spellcheck: "false",
          ref: autofocus({ select: true }),
          onInput: (event: Event) => {
            // Kept in the edit record without a re-render: the input owns the text.
            options.editing!.draft = (event.target as HTMLInputElement).value;
            const hint = (event.target as HTMLElement).nextElementSibling;
            if (hint) hint.textContent = `→ ${typeHint(options.editing!.draft, row.value)}`;
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitLeaf(row, options.editing!.draft);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              options.setEditing(null);
            }
          },
          onBlur: (event: FocusEvent) => {
            const input = event.target as HTMLInputElement;
            // A blur caused by the edit being cancelled leaves nothing to commit.
            if (options.editing?.path === row.path && input.isConnected) commitLeaf(row, input.value);
          },
        }),
        h("span", { class: "v-tag" }, `→ ${typeHint(draft, row.value)}`),
      ];
    } else {
      const span = leafSpan(row.value, row.type, row.open);
      valueNode = leafEditable
        ? h("span", {
            class: `v t-${row.type} is-editable`,
            "data-dt": "value-leaf",
            title: "Click to edit · Enter commits · Esc cancels",
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              options.setEditing({ scope: options.scope, path: row.path, draft: editSeed(row.value), mode: "leaf" });
            },
          }, span.children)
        : span;
    }

    const actions: Child[] = [];
    if (!editing) {
      if (options.onCopy) {
        actions.push(h("button", {
          type: "button", class: "ibtn is-sm", "aria-label": `Copy ${row.path}`, "data-tip": "Copy value",
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            let text: string;
            try { text = typeof row.value === "string" ? row.value : JSON.stringify(row.value, null, 2) ?? String(row.value); }
            catch { text = previewValue(row.value); }
            options.onCopy!(text, row.path);
          },
        }, icon("copy", { size: 12 })));
      }
      if (editableHere && options.editJson && (row.type === "object" || row.type === "array")) {
        actions.push(h("button", {
          type: "button", class: "ibtn is-sm", "aria-label": `Edit ${row.path} as JSON`, "data-tip": "Edit as JSON", "data-dt": "value-edit-json",
          onClick: (event: MouseEvent) => { event.stopPropagation(); options.editJson!(row.path, row.value); },
        }, icon("brackets", { size: 12 })));
      }
      if (editableHere && row.depth > 0) {
        actions.push(h("button", {
          type: "button", class: "ibtn is-sm is-danger", "aria-label": `Delete ${row.path}`, "data-tip": row.isIndex ? "Remove item" : "Delete key", "data-dt": "value-delete",
          onClick: (event: MouseEvent) => { event.stopPropagation(); deleteRow(row); },
        }, icon("trash", { size: 12 })));
      }
    }

    return h(
      "div",
      {
        class: ["row", selected ? "is-selected" : "", options.rowClass?.(row) ?? ""],
        role: "treeitem",
        "aria-level": row.depth + 1,
        "aria-expanded": row.expandable ? row.open : undefined,
        "aria-selected": selected,
        "data-path": row.path,
        style: { paddingLeft: `${indent}px` },
        onClick: () => {
          options.onSelect?.(row.path);
          if (row.expandable && !options.onSelect) options.onToggle(row.path);
        },
        onDblClick: () => { if (row.expandable) options.onToggle(row.path); },
      },
      h("button", {
        type: "button",
        class: ["twist", row.expandable ? "" : "is-leaf", row.open ? "is-open" : ""],
        tabindex: -1,
        "aria-hidden": "true",
        onClick: (event: MouseEvent) => { event.stopPropagation(); if (row.expandable) options.onToggle(row.path); },
      }, icon("chevronRight", { size: 11 })),
      h("span", { class: ["vk", row.isIndex ? "is-index" : ""] }, row.key),
      h("span", { class: "vsep" }, ":"),
      valueNode,
      h("span", { class: "grow" }),
      options.decorate?.(row) ?? null,
      actions.length > 0 ? h("span", { class: "v-actions" }, ...actions) : null,
    );
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!options.onSelect || rows.length === 0) return;
    if (options.editing) return;
    const index = rows.findIndex((row) => row.path === options.selected);
    const current = index >= 0 ? rows[index]! : null;
    const go = (i: number): void => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (next && !next.special) options.onSelect!(next.path);
    };
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); go(index + 1); break;
      case "ArrowUp": event.preventDefault(); go(index < 0 ? rows.length - 1 : index - 1); break;
      case "ArrowRight":
        if (current?.expandable && !current.open) { event.preventDefault(); options.onToggle(current.path); }
        else if (current?.open) { event.preventDefault(); go(index + 1); }
        break;
      case "ArrowLeft":
        if (current?.open) { event.preventDefault(); options.onToggle(current.path); }
        else if (current && current.depth > 0) {
          event.preventDefault();
          const { parent } = parentPath(current.path);
          options.onSelect(parent);
        }
        break;
      case "Enter":
        if (current && !current.expandable && canEdit(current.path, current.depth) && current.type !== "function") {
          event.preventDefault();
          options.setEditing({ scope: options.scope, path: current.path, draft: editSeed(current.value), mode: "leaf" });
        }
        break;
      case "Home": event.preventDefault(); go(0); break;
      case "End": event.preventDefault(); go(rows.length - 1); break;
      default: break;
    }
  };

  if (options.inline) {
    return h(
      "div",
      { class: "vtree is-inline", role: "tree", "data-dt": options.testid, tabindex: options.onSelect ? 0 : undefined, onKeyDown },
      rows.length === 0 ? (options.empty ?? h("div", { class: "hint pad-sm" }, "Empty.")) : rows.map((row) => h("div", { key: row.path, class: "vrow", style: { height: `${options.rowHeight}px` } }, renderRow(row))),
    );
  }
  const selectedIndex = options.selected ? rows.findIndex((row) => row.path === options.selected) : -1;
  return virtualList({
    items: rows,
    rowHeight: options.rowHeight,
    rowKey: (row) => row.path,
    renderRow: (row) => renderRow(row),
    version: [options.version, options.editing?.path, options.editing?.mode, options.selected],
    scrollTo: selectedIndex >= 0 ? selectedIndex : null,
    role: "tree",
    testid: options.testid,
    className: "vtree",
    onKeyDown,
    focusable: true,
    empty: options.empty ?? h("div", { class: "hint pad-sm" }, "Empty."),
  });
}
