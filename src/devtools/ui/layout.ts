/**
 * Aktion DevTools — split panes and data tables.
 */

import { h, type Child, type Key, type VElement } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";
import { icon } from "./icons.js";

/* -------------------------------------------------------------------------- */
/*  Split pane                                                                 */
/* -------------------------------------------------------------------------- */

export interface SplitOptions {
  /** `row`: side by side (default). `col`: stacked. */
  direction?: "row" | "col";
  /** Size of the first pane in px. */
  size: number;
  min?: number;
  max?: number;
  /** Called once, when a drag or key-resize ends, with the final size. */
  onResize: (size: number) => void;
  first: Child;
  second: Child;
  testid?: string;
  label?: string;
}

/**
 * Two panes and a draggable gutter.
 *
 * The drag writes the pane's size straight to its style and reports the final
 * value once, on release — re-rendering the panel sixty times a second for a
 * drag would make resizing the one janky interaction in the tool.
 */
export function split(options: SplitOptions): VElement {
  const col = options.direction === "col";
  const min = options.min ?? 140;
  const max = options.max ?? 4000;
  const clamp = (n: number): number => Math.round(Math.max(min, Math.min(max, n)));
  const size = clamp(options.size);
  return h(
    "div",
    { class: ["split", col ? "is-col" : ""], "data-dt": options.testid },
    h("div", {
      class: "pane is-first",
      style: col ? { height: `${size}px`, maxHeight: "calc(100% - 60px)" } : { width: `${size}px`, maxWidth: "calc(100% - 140px)" },
    }, options.first),
    h("div", {
      class: "gutter",
      role: "separator",
      tabindex: 0,
      "aria-orientation": col ? "horizontal" : "vertical",
      "aria-label": options.label ?? "Resize panes",
      "aria-valuenow": size,
      "aria-valuemin": min,
      "aria-valuemax": max,
      onPointerDown: (event: PointerEvent) => {
        if (event.button !== 0) return;
        const gutter = event.currentTarget as HTMLElement;
        const pane = gutter.previousElementSibling as HTMLElement | null;
        if (!pane) return;
        event.preventDefault();
        const start = col ? event.clientY : event.clientX;
        const initial = col ? pane.getBoundingClientRect().height : pane.getBoundingClientRect().width;
        let current = initial;
        gutter.classList.add("is-active");
        try { gutter.setPointerCapture(event.pointerId); } catch { /* not supported */ }
        const move = (e: PointerEvent): void => {
          current = clamp(initial + ((col ? e.clientY : e.clientX) - start));
          if (col) pane.style.height = `${current}px`;
          else pane.style.width = `${current}px`;
        };
        const up = (): void => {
          gutter.classList.remove("is-active");
          gutter.removeEventListener("pointermove", move);
          gutter.removeEventListener("pointerup", up);
          gutter.removeEventListener("pointercancel", up);
          if (current !== initial) options.onResize(current);
        };
        gutter.addEventListener("pointermove", move);
        gutter.addEventListener("pointerup", up);
        gutter.addEventListener("pointercancel", up);
      },
      onKeyDown: (event: KeyboardEvent) => {
        const step = event.shiftKey ? 64 : 16;
        const back = col ? "ArrowUp" : "ArrowLeft";
        const forward = col ? "ArrowDown" : "ArrowRight";
        if (event.key === back) { event.preventDefault(); options.onResize(clamp(size - step)); }
        else if (event.key === forward) { event.preventDefault(); options.onResize(clamp(size + step)); }
      },
    }),
    h("div", { class: "pane is-second" }, options.second),
  );
}

/* -------------------------------------------------------------------------- */
/*  Data table                                                                 */
/* -------------------------------------------------------------------------- */

export interface Column<T> {
  key: string;
  label: string;
  /** Fixed width in px; omit for a flexible column. */
  width?: number;
  flex?: number;
  align?: "left" | "right";
  sort?: (row: T) => number | string;
  render: (row: T, index: number) => Child;
  tip?: string;
}

export interface SortState {
  key: string;
  dir: 1 | -1;
}

export interface TableOptions<T> {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => Key;
  rowHeight: number;
  sort?: SortState | null;
  onSort?: (sort: SortState) => void;
  selected?: Key | null;
  onSelect?: (row: T, index: number) => void;
  /** Enter / double-click. */
  onActivate?: (row: T) => void;
  rowClass?: (row: T) => string;
  version?: unknown;
  empty?: Child;
  stickToBottom?: boolean;
  testid?: string;
  ariaLabel?: string;
  onHover?: (row: T | null) => void;
  onContextMenu?: (row: T, event: MouseEvent) => void;
}

function cellStyle<T>(col: Column<T>): Record<string, string | number> {
  return col.width !== undefined ? { width: `${col.width}px`, flex: "none" } : { flex: `${col.flex ?? 1} 1 0`, minWidth: "0" };
}

/** Sort a copy with a stable comparator. Strings compare naturally ("item 2" < "item 10"). */
export function sortRows<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<Column<T>>, sort: SortState | null | undefined): ReadonlyArray<T> {
  if (!sort) return rows;
  const col = columns.find((c) => c.key === sort.key);
  if (!col?.sort) return rows;
  const read = col.sort;
  return rows
    .map((row, index) => ({ row, index, v: read(row) }))
    .sort((a, b) => {
      let cmp: number;
      if (typeof a.v === "number" && typeof b.v === "number") cmp = a.v - b.v;
      else cmp = String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
      return cmp !== 0 ? cmp * sort.dir : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * A virtualised, sortable, keyboard-navigable table.
 *
 * Every column with a `sort` reader is sortable — the first-generation panel
 * declared sort readers on six tables and wired up exactly one of them.
 */
export function dataTable<T>(options: TableOptions<T>): VElement {
  const rows = sortRows(options.rows, options.columns, options.sort);
  const selectedIndex = options.selected === undefined || options.selected === null
    ? -1
    : rows.findIndex((row) => options.rowKey(row) === options.selected);
  const move = (delta: number): void => {
    if (!options.onSelect || rows.length === 0) return;
    const next = Math.max(0, Math.min(rows.length - 1, (selectedIndex < 0 ? (delta > 0 ? -1 : rows.length) : selectedIndex) + delta));
    options.onSelect(rows[next]!, next);
  };
  return h(
    "div",
    { class: "table", "data-dt": options.testid, role: "grid", "aria-label": options.ariaLabel, "aria-rowcount": rows.length },
    h("div", { class: "thead", role: "row" },
      ...options.columns.map((col) => {
        const active = options.sort?.key === col.key;
        const sortable = col.sort !== undefined && options.onSort !== undefined;
        return h(
          sortable ? "button" : "div",
          {
            key: col.key,
            type: sortable ? "button" : undefined,
            role: "columnheader",
            class: ["th", col.align === "right" ? "is-num" : ""],
            style: cellStyle(col),
            "data-tip": col.tip,
            "aria-sort": active ? (options.sort!.dir === 1 ? "ascending" : "descending") : undefined,
            onClick: sortable
              ? () => options.onSort!(active ? { key: col.key, dir: options.sort!.dir === 1 ? -1 : 1 } : { key: col.key, dir: col.align === "right" ? -1 : 1 })
              : undefined,
          },
          col.label,
          active ? icon(options.sort!.dir === 1 ? "chevronUp" : "chevronDown", { size: 10 }) : null,
        );
      })),
    virtualList({
      items: rows,
      rowHeight: options.rowHeight,
      rowKey: (row) => options.rowKey(row),
      version: [options.version, options.selected, options.sort?.key, options.sort?.dir],
      stickToBottom: options.stickToBottom,
      scrollTo: selectedIndex >= 0 ? selectedIndex : null,
      empty: options.empty,
      role: "rowgroup",
      ariaLabel: options.ariaLabel,
      onKeyDown: (event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
        else if (event.key === "PageDown") { event.preventDefault(); move(10); }
        else if (event.key === "PageUp") { event.preventDefault(); move(-10); }
        else if (event.key === "Home") { event.preventDefault(); move(-rows.length); }
        else if (event.key === "End") { event.preventDefault(); move(rows.length); }
        else if (event.key === "Enter" && selectedIndex >= 0) { event.preventDefault(); options.onActivate?.(rows[selectedIndex]!); }
      },
      renderRow: (row, index) => {
        const key = options.rowKey(row);
        return h(
          "div",
          {
            class: ["trow", key === options.selected ? "is-selected" : "", options.rowClass?.(row) ?? ""],
            role: "row",
            "aria-selected": key === options.selected,
            "data-key": String(key),
            onClick: options.onSelect ? () => options.onSelect!(row, index) : undefined,
            onDblClick: options.onActivate ? () => options.onActivate!(row) : undefined,
            onMouseEnter: options.onHover ? () => options.onHover!(row) : undefined,
            onMouseLeave: options.onHover ? () => options.onHover!(null) : undefined,
            onContextMenu: options.onContextMenu
              ? (event: MouseEvent) => { event.preventDefault(); options.onContextMenu!(row, event); }
              : undefined,
          },
          ...options.columns.map((col) =>
            h("div", { key: col.key, role: "gridcell", class: ["td", col.align === "right" ? "is-num" : ""], style: cellStyle(col) }, col.render(row, index))),
        );
      },
    }),
  );
}
