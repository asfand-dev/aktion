/**
 * Advanced data components:
 *
 *   - DataGrid — Table with built-in sort, filter, row selection, pagination.
 *   - CalendarView — Month/week calendar grid distinct from DatePicker.
 *   - ActivityLog — Timeline-like specialised feeds.
 *   - ComparisonTable — Generic feature/spec comparison table.
 *   - InfiniteList — Scroll-to-load list container.
 *
 * These are presentational + lightly stateful (using `useInstanceState` for
 * local UI state). State that should round-trip through the host is bound
 * via `$variables` exactly like every other component in the library.
 *
 * Two rules run through the whole file, both dictated by the morph
 * reconciler — it keeps the LIVE node across re-renders and throws the
 * freshly-rendered one away:
 *
 *   1. Handlers are property assignments (`node.onclick = …`, which morph
 *      copies onto the kept node) and each handler resolves the element it
 *      acts on from `event.currentTarget`, never from a render-time variable.
 *   2. A `useInstanceState` write does not schedule a render, so the DOM it
 *      affects is repainted through the SAME builder the render path uses,
 *      against the live subtree. There is deliberately no second
 *      "lightweight" builder anywhere in this file: that duplication is what
 *      silently dropped DataGrid's selection and row-click handlers as soon
 *      as anyone typed in a filter box.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, fillTableCell,
  isComponentNode, sanitiseCssLength, sanitiseHref, sanitiseImageSrc, valueAttr,
} from "../utils.js";
import { deferToPaint } from "../floating.js";
// One formatter for both grids. It lived here as a second copy, and the copies
// drifted the moment `Col(currency:)` arrived — the same column rendered EUR in
// a `Table` and USD in a `DataGrid`.
import { formatCell, currencyCode } from "./data.js";

const COL_ALIGN = ["left", "center", "right"] as const;

/**
 * Visually-hidden live region. Inline rather than stylesheet-dependent: the
 * announcement has to work in a host that ships its own theme.
 */
const SR_ONLY =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;" +
  "overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0";

interface ColDef {
  header: string;
  values: unknown[];
  format: string;
  align: string;
  sortable: boolean;
  filterable: boolean;
  /** `(value, index) => Component|string|array` per-cell renderer. */
  render: unknown;
  /** `(value, index) => void` per-cell click handler. */
  onClick: unknown;
  key: string;
  /** CSS width cap, already sanitised. */
  width: string;
  /** `"true"`/`"false"` when the column said something, `null` when it did not. */
  wrap: string | null;
  headerTooltip: string;
  /** This column's formatter, bound to its own `currency`. */
  fmt: (value: unknown, format: string) => string;
  /** Col-level initially-hidden flag. */
  initiallyHidden: boolean;
  /** Col-level pin position (`"left"` or `""`). */
  pinned: string;
  /** Col-level resize override (true/false/undefined for grid default). */
  resizable: boolean | undefined;
  /** CSS min-width for resize, already sanitised. */
  minWidth: string;
  /** CSS max-width for resize, already sanitised. */
  maxWidth: string;
}

function readDataGridCols(raw: unknown): ColDef[] {
  return asArray<{ args?: unknown[] }>(raw).map((node, idx) => {
    const args = node.args ?? [];
    const header = asString(args[0]);
    const currency = currencyCode(args[8]);
    const rawWrap = args[10];
    const rawResizable = args[15];
    return {
      header,
      values: asArray<unknown>(args[1]),
      format: asString(args[2], "text"),
      align: (COL_ALIGN as readonly string[]).includes(asString(args[3])) ? asString(args[3]) : "",
      sortable: asBoolean(args[4]),
      filterable: asBoolean(args[5]),
      render: args[6],
      onClick: args[7],
      key: header || `col-${idx}`,
      width: sanitiseCssLength(args[9], ""),
      wrap: rawWrap === undefined || rawWrap === null ? null : asBoolean(rawWrap) ? "true" : "false",
      headerTooltip: asString(args[11]),
      // Filtering, sorting and the CSV export all read through this, so a money
      // column exports and sorts on exactly the string the user can see.
      fmt: (value: unknown, format: string): string => formatCell(value, format, currency),
      initiallyHidden: asBoolean(args[13]),
      pinned: asString(args[14]) === "left" ? "left" : "",
      resizable: rawResizable === undefined || rawResizable === null ? undefined : asBoolean(rawResizable),
      minWidth: sanitiseCssLength(args[16], ""),
      maxWidth: sanitiseCssLength(args[17], ""),
    };
  });
}

function compareCells(a: unknown, b: unknown, format: string): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (format === "number" || format === "currency") {
    return asNumber(a, 0) - asNumber(b, 0);
  }
  if (format === "date") {
    const ta = new Date(asString(a)).getTime();
    const tb = new Date(asString(b)).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  }
  return asString(a).localeCompare(asString(b));
}

/**
 * Escape one CSV field per RFC 4180 (quote when it contains `,`/`"`/newline),
 * and neutralise spreadsheet formula injection (CWE-1236).
 *
 * Excel / LibreOffice / Google Sheets treat a cell starting with `=`, `+`,
 * `-`, `@`, TAB, or CR as a live formula, so grid data that came from an
 * untrusted source (an LLM response, an API payload) can execute in the
 * spreadsheet of whoever opens the export — `=cmd|'/c calc'!A1`, or a
 * `=WEBSERVICE(...)`/`=HYPERLINK(...)` call that exfiltrates the other cells.
 * A leading apostrophe forces the cell to be read as text.
 */
function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

/** Build a CSV string from the grid columns + the visible row indices (VIII.5). */
function buildDataGridCsv(cols: ColDef[], indices: number[]): string {
  const header = cols.map((c) => csvField(c.header)).join(",");
  const rows = indices.map((r) =>
    cols.map((c) => csvField(c.fmt(c.values[r], c.format))).join(","),
  );
  return [header, ...rows].join("\r\n");
}

/**
 * Reduce an author-supplied export filename to a safe basename. A DSL-supplied
 * name reaches the `download` attribute, and the browser uses it to name a file
 * on disk — so path separators, traversal segments, control characters, and a
 * leading dot are stripped, and the `.csv` extension is enforced so the export
 * cannot be presented to the user as an executable.
 */
function csvFilename(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const base = raw.replace(/[\u0000-\u001f\u007f]/g, "").split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!cleaned) return "data.csv";
  return /\.csv$/i.test(cleaned) ? cleaned : `${cleaned}.csv`;
}

/** Trigger a client-side CSV download via a temporary object URL. */
function downloadCsv(csv: string, filename: string): void {
  try {
    if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof document === "undefined") return;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch { /* download blocked — noop */ }
}

/** `{key, direction}` as the author may have supplied it (both untyped). */
interface SortInput { key?: unknown; direction?: unknown }

/** Everything the grid derives from props + local state for one paint. */
interface GridModel {
  /** Original row indices after filtering + sorting. */
  indices: number[];
  total: number;
  perPage: number;
  totalPages: number;
  page: number;
  /** Original row indices on the current page. */
  visible: number[];
  sortKey: string;
  sortDir: "asc" | "desc";
  selected: Set<string>;
}

/* ----------------------------------------------------------------------- *
 * Persistence — read / write column configuration to localStorage
 * ----------------------------------------------------------------------- */

const STORAGE_VERSION = 1;

interface PersistedGridConfig {
  v: number;
  order?: string[];
  hidden?: string[];
  pinned?: string[];
  widths?: Record<string, string>;
}

function readPersistedConfig(key: string): PersistedGridConfig | null {
  try {
    const raw = localStorage.getItem(`aktion-datagrid-${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedGridConfig;
    if (!parsed || typeof parsed !== "object" || parsed.v !== STORAGE_VERSION) return null;
    return parsed;
  } catch { return null; }
}

function persistConfig(key: string, config: PersistedGridConfig): void {
  try {
    localStorage.setItem(`aktion-datagrid-${key}`, JSON.stringify(config));
  } catch { /* storage full or blocked */ }
}

/* ----------------------------------------------------------------------- *
 * Column configuration — ordering, visibility, pinning, widths
 * ----------------------------------------------------------------------- */

interface ColumnConfig {
  order: string[];
  hidden: Set<string>;
  pinned: Set<string>;
  widths: Record<string, string>;
}

/** Merge column spec defaults with user overrides and optional persisted state. */
function initColumnConfig(
  cols: ColDef[],
  persisted: PersistedGridConfig | null,
): ColumnConfig {
  const defaultOrder = cols.map((c) => c.key);
  const config: ColumnConfig = {
    order: defaultOrder,
    hidden: new Set(cols.filter((c) => c.initiallyHidden).map((c) => c.key)),
    pinned: new Set(cols.filter((c) => c.pinned === "left").map((c) => c.key)),
    widths: {},
  };
  for (const c of cols) { if (c.width) config.widths[c.key] = c.width; }
  if (!persisted) return config;
  if (persisted.order) {
    const colKeys = new Set(defaultOrder);
    const validOrder = persisted.order.filter((k) => colKeys.has(k));
    const missing = defaultOrder.filter((k) => !validOrder.includes(k));
    config.order = [...validOrder, ...missing];
  }
  if (persisted.hidden) config.hidden = new Set(persisted.hidden.filter((k) => cols.some((c) => c.key === k)));
  if (persisted.pinned) config.pinned = new Set(persisted.pinned.filter((k) => cols.some((c) => c.key === k)));
  if (persisted.widths) {
    for (const [k, v] of Object.entries(persisted.widths)) {
      const sanitised = sanitiseCssLength(v, "");
      if (sanitised && cols.some((c) => c.key === k)) config.widths[k] = sanitised;
    }
  }
  return config;
}

/** Produce the display-order list of visible columns, pinned first. */
function effectiveCols(cols: ColDef[], config: ColumnConfig): ColDef[] {
  const byKey = new Map(cols.map((c) => [c.key, c]));
  return config.order
    .filter((k) => !config.hidden.has(k) && byKey.has(k))
    .map((k) => byKey.get(k)!);
}

function configToStorage(config: ColumnConfig): PersistedGridConfig {
  return {
    v: STORAGE_VERSION,
    order: config.order,
    hidden: Array.from(config.hidden),
    pinned: Array.from(config.pinned),
    widths: config.widths,
  };
}

/* ----------------------------------------------------------------------- *
 * Scroll arrows — overlay buttons for horizontal scrollability
 * ----------------------------------------------------------------------- */

function installScrollArrows(scrollEl: HTMLElement): void {
  const left = el("button", {
    type: "button",
    class: "rui-data-grid-scroll-arrow rui-data-grid-scroll-arrow-left",
    "aria-label": "Scroll left",
    "aria-hidden": "true",
    tabindex: "-1",
  });
  const lIcon = renderIcon("chevron-left", { className: "rui-data-grid-scroll-arrow-icon" });
  if (lIcon) left.append(lIcon); else left.textContent = "‹";

  const right = el("button", {
    type: "button",
    class: "rui-data-grid-scroll-arrow rui-data-grid-scroll-arrow-right",
    "aria-label": "Scroll right",
    "aria-hidden": "true",
    tabindex: "-1",
  });
  const rIcon = renderIcon("chevron-right", { className: "rui-data-grid-scroll-arrow-icon" });
  if (rIcon) right.append(rIcon); else right.textContent = "›";

  const STEP = 200;
  left.onclick = () => scrollEl.scrollBy({ left: -STEP, behavior: "smooth" });
  right.onclick = () => scrollEl.scrollBy({ left: STEP, behavior: "smooth" });

  scrollEl.append(left, right);

  const sync = (): void => {
    const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
    const overflows = scrollWidth > clientWidth + 1;
    left.style.display = overflows && scrollLeft > 1 ? "" : "none";
    right.style.display = overflows && scrollLeft < scrollWidth - clientWidth - 1 ? "" : "none";
  };
  sync();
  scrollEl.addEventListener("scroll", sync, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(sync);
    ro.observe(scrollEl);
  }
}

export const DataGrid: ComponentSpec = {
  name: "DataGrid",
  description:
    "Advanced data table with sortable headers, per-column filter chips, " +
    "row selection (checkboxes), sticky header / first column, optional " +
    "pagination, an optional bulk-action toolbar slot, and click-to-act " +
    "rows. Columns are Col(header, values, format?, align?, sortable?, " +
    "filterable?) entries. Sorting, selection and pagination work on their " +
    "own; bind `$sort` (`{key, direction}` object), `$selectedIds` " +
    "(string[]) and `$page` (number) when the host needs to read or drive " +
    "them, or use `onSort` / `onSelectionChange` for server-side work. " +
    "Use `loading` / `error` for query states. " +
    "Set `columnMenu=true` to let the user hide, reorder, and pin columns. " +
    "Set `resizable=true` to let the user drag column borders to resize. " +
    "Pass `persistKey` to save the user's column layout to localStorage. " +
    "Set `wrapCells=false` for single-line cells with ellipsis + hover tooltip. " +
    "Use INSTEAD of `Table` when you need any of those interactions.",
  props: [
    { name: "columns", type: "Col[]", description: "Columns; pass sortable=true / filterable=true on each Col." },
    { name: "rowIds", type: "any[]", optional: true, description: "Stable id per row (used by `selectedIds` and as the row's morph key); defaults to row index." },
    { name: "caption", type: "string", optional: true },
    { name: "sort", type: "object", optional: true, description: "`{key, direction}` — pass a $variable for two-way binding" },
    { name: "selectedIds", type: "any[]", optional: true, description: "Array of selected row ids — bind a $variable" },
    { name: "selectable", type: "boolean", optional: true, description: "Render leading selection checkboxes" },
    { name: "page", type: "number", optional: true, description: "1-indexed current page — bind a $variable" },
    { name: "perPage", type: "number", optional: true, description: "Page size (default 20)" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no rows match (default `No results`)" },
    { name: "onRowClick", type: "callable", optional: true, aliases: ["rowAction"], description: "Callable fired when a row is clicked. Receives (rowIndex, row, rowId) where `row` is header-keyed." },
    { name: "toolbar", type: "Node[]", optional: true, description: "Bulk-action toolbar shown above the table when any rows are selected" },
    { name: "density", type: "string", optional: true, enum: ["comfortable", "compact"] },
    { name: "striped", type: "boolean", optional: true },
    { name: "stickyHeader", type: "boolean", optional: true, description: "Pin the header row (default true). Constrains the grid's height to `maxHeight` so there is something to scroll." },
    { name: "stickyFirstColumn", type: "boolean", optional: true, description: "Pin the first column horizontally" },
    { name: "exportable", type: "boolean", optional: true, description: "Show an Export CSV button that downloads the filtered rows" },
    { name: "exportFilename", type: "string", optional: true, description: "CSV download filename (default `data.csv`)" },
    { name: "loading", type: "boolean", optional: true, description: "Show a loading row instead of the empty message while rows are in flight" },
    { name: "error", type: "string", optional: true, description: "Failure message shown instead of the rows (takes precedence over `loading`)" },
    { name: "loadingLabel", type: "string", optional: true, description: "Label for the loading row (default `Loading…`)" },
    { name: "maxHeight", type: "string", optional: true, description: "Scroll-area height cap, e.g. `70vh` / `480px`. Applied when `stickyHeader` is on (default `70vh`) — without it the header has no scrollport to stick to." },
    { name: "allowOverflow", type: "boolean", optional: true, description: "Let cell content (menus, popovers) escape the scroll box instead of clipping it. Disables the sticky header." },
    { name: "onSort", type: "callable", optional: true, description: "Callable fired with (columnKey, direction) when a header is activated — use for server-side sorting" },
    { name: "onSelectionChange", type: "callable", optional: true, description: "Callable fired with the array of selected row ids" },
    { name: "perPageOptions", type: "number[]", optional: true, description: "Page sizes offered in a footer dropdown, e.g. [20, 50, 100]" },
    { name: "onPerPageChange", type: "callable", optional: true, description: "Callable fired with the newly chosen page size" },
    // Slots 26–33: advanced column management features. All optional.
    { name: "persistKey", type: "string", optional: true, description: "localStorage key — when set, column widths, order, visibility, and pinning survive page refreshes. Each table should use a unique key." },
    { name: "resizable", type: "boolean", optional: true, description: "Let the user drag column header borders to resize columns. Double-click a handle to auto-fit." },
    { name: "columnMenu", type: "boolean", optional: true, description: "Show a column settings button for hiding, reordering, and pinning columns." },
    { name: "globalSearch", type: "string", optional: true, description: "Global search term that filters across all columns — bind a $variable for two-way control." },
    { name: "onGlobalSearch", type: "callable", optional: true, description: "Callable fired with the search term when the global search input changes." },
    { name: "wrapCells", type: "boolean", optional: true, description: "Default cell content wrapping. `false` = single line with ellipsis and hover tooltip; `true` = allow wrapping. Per-column `Col(wrap:)` overrides." },
    { name: "rowNumbers", type: "boolean", optional: true, description: "Show a leading row-number column." },
    { name: "highlightOnHover", type: "boolean", optional: true, description: "Highlight rows on mouse hover (default true)." },
  ],
  render: (node, props, helpers) => {
    const allCols = readDataGridCols(props.columns);
    const rowCount = Math.max(0, ...allCols.map((c) => c.values.length));
    const rowIds = asArray<unknown>(props.rowIds);
    const idFor = (rowIdx: number): string => asString(rowIds[rowIdx] ?? rowIdx);

    const sortStateName = node.argMeta?.[3]?.stateRef;
    const selectedStateName = node.argMeta?.[4]?.stateRef;
    const pageStateName = node.argMeta?.[6]?.stateRef;
    const perPageStateName = node.argMeta?.[7]?.stateRef;
    const globalSearchStateName = node.argMeta?.[29]?.stateRef;

    const selectable = asBoolean(props.selectable) || selectedStateName !== undefined;
    const allowOverflow = asBoolean(props.allowOverflow);
    const stickyHeader = allowOverflow
      ? false
      : (props.stickyHeader === undefined ? true : asBoolean(props.stickyHeader));
    const stickyFirst = asBoolean(props.stickyFirstColumn);
    const density = asString(props.density, "comfortable");
    const striped = asBoolean(props.striped);
    const loading = asBoolean(props.loading);
    const errorText = asString(props.error);
    const emptyLabel = asString(props.emptyLabel, "No results");
    const loadingLabel = asString(props.loadingLabel, "Loading…");
    const perPageOptions = asArray<unknown>(props.perPageOptions)
      .map((v) => Math.floor(asNumber(v, 0)))
      .filter((n) => n > 0);

    // New advanced feature props
    const persistKey = asString(props.persistKey);
    const gridResizable = asBoolean(props.resizable);
    const columnMenuEnabled = asBoolean(props.columnMenu);
    const showRowNumbers = asBoolean(props.rowNumbers);
    const highlightOnHover = props.highlightOnHover === undefined ? true : asBoolean(props.highlightOnHover);
    const wrapCellsProp = props.wrapCells;
    const wrapCellsDefault: string | null =
      wrapCellsProp === undefined || wrapCellsProp === null
        ? null
        : asBoolean(wrapCellsProp) ? "true" : "false";

    // --- instance state -------------------------------------------------
    const filterSlot = helpers.useInstanceState<Record<string, string>>("filters", {});
    const sortSlot = helpers.useInstanceState<SortInput | null>("sort", null);
    const selectedSlot = helpers.useInstanceState<string[] | null>("selected", null);
    const pageSlot = helpers.useInstanceState<number | null>("page", null);
    const perPageSlot = helpers.useInstanceState<number | null>("perPage", null);
    const globalSearchSlot = helpers.useInstanceState<string>("globalSearch", "");

    const persisted = persistKey ? readPersistedConfig(persistKey) : null;
    const colConfigSlot = helpers.useInstanceState<ColumnConfig>(
      "colConfig",
      initColumnConfig(allCols, persisted),
    );
    const colConfigPanelOpen = helpers.useInstanceState<boolean>("colConfigOpen", false);

    const getColConfig = (): ColumnConfig => colConfigSlot.get();
    const updateColConfig = (patch: Partial<ColumnConfig>): void => {
      const current = getColConfig();
      const next = { ...current, ...patch };
      colConfigSlot.set(next);
      if (persistKey) persistConfig(persistKey, configToStorage(next));
    };

    /** Visible columns in display order. */
    const cols = effectiveCols(allCols, getColConfig());

    const readSort = (): { key: string; dir: "asc" | "desc" } => {
      const fromProps = props.sort && typeof props.sort === "object" ? props.sort as SortInput : null;
      const src = sortStateName ? fromProps : (sortSlot.get() ?? fromProps);
      return {
        key: asString(src?.key),
        dir: asString(src?.direction, "asc") === "desc" ? "desc" : "asc",
      };
    };
    const readSelected = (): string[] => {
      const src = selectedStateName ? props.selectedIds : (selectedSlot.get() ?? props.selectedIds);
      return asArray<unknown>(src).map((v) => asString(v));
    };
    const readPerPage = (): number => {
      const local = perPageStateName ? null : perPageSlot.get();
      return Math.max(1, Math.floor(asNumber(local ?? props.perPage, 20)));
    };
    const readGlobalSearch = (): string => {
      if (globalSearchStateName) return asString(props.globalSearch).trim().toLowerCase();
      return (globalSearchSlot.get() || asString(props.globalSearch)).trim().toLowerCase();
    };

    /** Recompute everything from props + the current local state. */
    const readModel = (): GridModel => {
      const filters = filterSlot.get();
      const { key: sortKey, dir: sortDir } = readSort();
      const gSearch = readGlobalSearch();
      const indices: number[] = [];
      for (let r = 0; r < rowCount; r += 1) {
        let keep = true;
        // Per-column filters
        for (const c of allCols) {
          if (!c.filterable) continue;
          const term = (filters[c.key] ?? "").trim().toLowerCase();
          if (!term) continue;
          if (!c.fmt(c.values[r], c.format).toLowerCase().includes(term)) {
            keep = false;
            break;
          }
        }
        // Global search: match against any column
        if (keep && gSearch) {
          let gMatch = false;
          for (const c of allCols) {
            if (c.fmt(c.values[r], c.format).toLowerCase().includes(gSearch)) {
              gMatch = true;
              break;
            }
          }
          if (!gMatch) keep = false;
        }
        if (keep) indices.push(r);
      }
      if (sortKey) {
        const sortCol = allCols.find((c) => c.key === sortKey);
        if (sortCol && sortCol.sortable) {
          indices.sort((a, b) => {
            const cmp = compareCells(sortCol.values[a], sortCol.values[b], sortCol.format);
            return sortDir === "desc" ? -cmp : cmp;
          });
        }
      }
      const total = indices.length;
      const perPage = readPerPage();
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const rawPageSrc = pageStateName ? props.page : (pageSlot.get() ?? props.page);
      const rawPage = Math.max(1, Math.floor(asNumber(rawPageSrc, 1)));
      const page = Math.min(rawPage, totalPages);
      return {
        indices,
        total,
        perPage,
        totalPages,
        page,
        visible: indices.slice((page - 1) * perPage, page * perPage),
        sortKey,
        sortDir,
        selected: new Set(readSelected()),
      };
    };

    const wrapper = el("div", {
      class: "rui-data-grid",
      "data-density": density,
      "data-striped": striped ? "true" : "false",
      "data-sticky-header": stickyHeader ? "true" : "false",
      "data-sticky-first": stickyFirst ? "true" : "false",
      "data-allow-overflow": allowOverflow ? "true" : null,
      "data-highlight-hover": highlightOnHover ? "true" : "false",
      "data-nowrap": wrapCellsDefault === "false" ? "true" : null,
    });

    const liveScope = (origin: Element | null | undefined): Element =>
      origin?.closest(".rui-data-grid") ?? wrapper;

    const bodyOf = (scope: Element): HTMLElement | null =>
      scope.querySelector<HTMLElement>(".rui-data-grid-table > tbody");

    /* ---- builders (one per region, shared by render + live repaint) ---- */

    const buildColTh = (col: ColDef, colIdx: number, config: ColumnConfig, pinnedOff: number): HTMLElement => {
      const colWidth = config.widths[col.key] || col.width;
      const isPinned = config.pinned.has(col.key);
      const colResizable = col.resizable !== undefined ? col.resizable : gridResizable;
      const th = el("th", {
        scope: "col",
        "data-col-key": col.key,
        "data-align": col.align || null,
        "data-sortable": col.sortable ? "true" : null,
        "data-first": colIdx === 0 ? "true" : null,
        "data-wrap": col.wrap,
        "data-pinned": isPinned ? "true" : null,
        title: col.headerTooltip || null,
        style: buildCellStyle(colWidth, isPinned, pinnedOff),
      });
      if (col.sortable) {
        const btn = el("button", { type: "button", class: "rui-data-grid-sort" });
        btn.append(el("span", {}, [col.header]));
        btn.onclick = (event) => writeSort(col.key, event.currentTarget as Element);
        th.append(btn);
      } else {
        th.append(document.createTextNode(col.header));
      }
      if (colResizable) {
        const handle = el("div", {
          class: "rui-data-grid-resize-handle",
          "data-resize-col": col.key,
        });
        const minW = parsePx(col.minWidth) || 50;
        const maxW = parsePx(col.maxWidth) || 2000;
        const colKey = col.key;

        const applySizeToCells = (scope: Element, key: string, px: string): void => {
          scope.querySelectorAll<HTMLElement>(
            `.rui-data-grid-table tbody td[data-col-key="${key}"]`,
          ).forEach((td) => {
            td.style.width = px;
            td.style.maxWidth = px;
            td.style.minWidth = px;
          });
        };

        handle.onmousedown = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const liveTh = (event.currentTarget as Element).parentElement as HTMLElement;
          if (!liveTh) return;
          const startX = event.clientX;
          const startW = liveTh.getBoundingClientRect().width;
          const liveHandle = event.currentTarget as HTMLElement;
          liveHandle.classList.add("rui-data-grid-resize-active");
          const onMove = (ev: MouseEvent): void => {
            const delta = ev.clientX - startX;
            const newW = Math.max(minW, Math.min(maxW, startW + delta));
            const px = `${Math.round(newW)}px`;
            liveTh.style.width = px;
            liveTh.style.maxWidth = px;
            liveTh.style.minWidth = px;
            applySizeToCells(liveScope(liveTh), colKey, px);
          };
          const onUp = (): void => {
            liveHandle.classList.remove("rui-data-grid-resize-active");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            const finalW = `${Math.round(liveTh.getBoundingClientRect().width)}px`;
            const cfg = getColConfig();
            updateColConfig({ widths: { ...cfg.widths, [colKey]: finalW } });
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        };

        handle.ondblclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const liveTh = (event.currentTarget as Element).parentElement as HTMLElement;
          if (!liveTh) return;
          const scope = liveScope(liveTh);
          let maxContent = liveTh.scrollWidth;
          scope.querySelectorAll<HTMLElement>(
            `.rui-data-grid-table tbody td[data-col-key="${colKey}"]`,
          ).forEach((td) => {
            maxContent = Math.max(maxContent, td.scrollWidth);
          });
          const fitW = Math.max(minW, Math.min(maxW, maxContent + 8));
          const px = `${fitW}px`;
          liveTh.style.width = px;
          liveTh.style.maxWidth = px;
          liveTh.style.minWidth = px;
          applySizeToCells(scope, colKey, px);
          const cfg = getColConfig();
          updateColConfig({ widths: { ...cfg.widths, [colKey]: px } });
        };

        th.append(handle);
      }
      return th;
    };

    const buildFilterTd = (col: ColDef, filters: Record<string, string>, isPinned: boolean, pinnedOff: number): HTMLElement => {
      const td = el("td", {
        "data-col-key": col.key,
        "data-pinned": isPinned ? "true" : null,
        style: isPinned ? `position:sticky;left:${pinnedOff}px` : null,
      });
      if (col.filterable) {
        const input = el("input", {
          type: "search",
          class: "rui-data-grid-filter",
          placeholder: `Filter ${col.header}`,
          "aria-label": `Filter ${col.header}`,
          value: valueAttr(filters[col.key]),
        });
        input.oninput = (event) => {
          const target = event.currentTarget as HTMLInputElement;
          filterSlot.set({ ...filterSlot.get(), [col.key]: target.value });
          writePage(1);
          repaint(target);
        };
        td.append(input);
      }
      return td;
    };

    const syncColumns = (scope: Element): void => {
      const config = getColConfig();
      const visCols = effectiveCols(allCols, config);

      const headRow = scope.querySelector<HTMLElement>(".rui-data-grid-table > thead > tr:first-child");
      if (headRow) {
        headRow.querySelectorAll("th[data-col-key]").forEach((n) => n.remove());
        const menuCell = headRow.querySelector(".rui-data-grid-col-menu-cell") as Element | null;
        let pinnedOff = 0;
        visCols.forEach((col, c) => {
          const th = buildColTh(col, c, config, pinnedOff);
          headRow.insertBefore(th, menuCell);
          if (config.pinned.has(col.key)) pinnedOff += parsePx(config.widths[col.key] || col.width) || 150;
        });
      }

      const filterRow = scope.querySelector<HTMLElement>(".rui-data-grid-filter-row");
      if (filterRow) {
        filterRow.querySelectorAll("td[data-col-key]").forEach((n) => n.remove());
        const menuTd = columnMenuEnabled
          ? filterRow.querySelector(".rui-data-grid-col-menu-cell") as Element | null
          : null;
        const filters = filterSlot.get();
        let filterPinOff = 0;
        for (const col of visCols) {
          const isPinned = config.pinned.has(col.key);
          filterRow.insertBefore(buildFilterTd(col, filters, isPinned, filterPinOff), menuTd);
          if (isPinned) filterPinOff += parsePx(config.widths[col.key] || col.width) || 150;
        }
      }
    };

    const buildRows = (target: HTMLElement, m: GridModel): void => {
      target.replaceChildren();
      const config = getColConfig();
      const visCols = effectiveCols(allCols, config);
      const leadCols = (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0);
      const span = leadCols + Math.max(visCols.length, 1) + (columnMenuEnabled ? 1 : 0);
      const placeholder = (extraClass: string, children: Array<Node | string>): void => {
        const tr = el("tr");
        tr.append(el("td", {
          colspan: String(span),
          class: `rui-data-grid-empty${extraClass ? ` ${extraClass}` : ""}`,
        }, children));
        target.append(tr);
      };
      if (errorText) {
        placeholder("rui-data-grid-error", [errorText]);
        return;
      }
      if (m.visible.length === 0) {
        if (loading) {
          const spin = renderIcon("spinner", { className: "rui-data-grid-spin" });
          placeholder("rui-data-grid-loading", [spin, loadingLabel].filter(Boolean) as Array<Node | string>);
        } else {
          placeholder("", [emptyLabel]);
        }
        return;
      }
      for (let vi = 0; vi < m.visible.length; vi += 1) {
        const r = m.visible[vi]!;
        const id = idFor(r);
        const isSelected = m.selected.has(id);
        const tr = el("tr", {
          "data-rui-key": id,
          "data-row-id": id,
          "data-selected": isSelected ? "true" : null,
        });
        if (selectable) {
          const cellTd = el("td", { class: "rui-data-grid-cell-select" });
          const cb = el("input", {
            type: "checkbox",
            class: "rui-data-grid-checkbox",
            "aria-label": "Select row",
            checked: isSelected ? "" : null,
          });
          cb.onclick = (event) => {
            event.stopPropagation();
            const target2 = event.currentTarget as HTMLInputElement;
            const rowEl = target2.closest("tr");
            const rowId = rowEl?.getAttribute("data-row-id") ?? id;
            const next = new Set(readSelected());
            if (target2.checked) next.add(rowId); else next.delete(rowId);
            writeSelection(Array.from(next), target2);
          };
          cellTd.append(cb);
          tr.append(cellTd);
        }
        if (showRowNumbers) {
          const numTd = el("td", { class: "rui-data-grid-cell-rownum" });
          numTd.textContent = String((m.page - 1) * m.perPage + vi + 1);
          tr.append(numTd);
        }
        const rowObj: Record<string, unknown> = {};
        for (const cc of allCols) rowObj[cc.key] = cc.values[r];

        let pinnedOffset = 0;
        visCols.forEach((col, c) => {
          const colWidth = config.widths[col.key] || col.width;
          const isPinned = config.pinned.has(col.key);
          const cellWrap = col.wrap ?? wrapCellsDefault;
          const td = el("td", {
            "data-format": col.format,
            "data-align": col.align || null,
            "data-first": c === 0 ? "true" : null,
            "data-wrap": cellWrap,
            "data-pinned": isPinned ? "true" : null,
            style: buildCellStyle(colWidth, isPinned, pinnedOffset),
          });
          td.setAttribute("data-col-key", col.key);
          fillTableCell(td, col, col.values[r], r, helpers, col.fmt, rowObj);
          if (cellWrap === "false" && !col.render && !isComponentNode(col.values[r])) {
            const text = td.textContent ?? "";
            if (text) td.title = text;
          }
          tr.append(td);
          if (isPinned) pinnedOffset += parsePx(colWidth) || 150;
        });
        if (columnMenuEnabled) tr.append(el("td", { class: "rui-data-grid-col-menu-cell" }));
        if (typeof props.onRowClick === "function") {
          tr.setAttribute("data-clickable", "true");
          tr.tabIndex = 0;
          const fire = (event: Event): boolean => {
            const target2 = event.target as Element | null;
            if (target2?.closest("input,button,a,label,select,textarea")) return false;
            helpers.invoke(props.onRowClick, r, rowObj, id);
            return true;
          };
          tr.onclick = (event) => { fire(event); };
          tr.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (fire(event)) event.preventDefault();
          };
        }
        target.append(tr);
      }
    };

    const syncHeader = (scope: Element, m: GridModel): void => {
      scope.querySelectorAll<HTMLElement>(".rui-data-grid-table thead th[data-col-key]").forEach((th) => {
        const key = th.getAttribute("data-col-key") ?? "";
        const col = allCols.find((c) => c.key === key);
        if (!col?.sortable) return;
        const active = key === m.sortKey;
        if (active) th.setAttribute("data-active", "true"); else th.removeAttribute("data-active");
        th.setAttribute("aria-sort", active ? (m.sortDir === "asc" ? "ascending" : "descending") : "none");
        const btn = th.querySelector(".rui-data-grid-sort");
        if (!btn) return;
        const icon = renderIcon(
          active ? (m.sortDir === "asc" ? "arrow-up-short-wide" : "arrow-down-wide-short") : "sort",
          { className: "rui-data-grid-sort-icon" },
        );
        if (!icon) return;
        const prev = btn.querySelector(".rui-data-grid-sort-icon");
        if (prev) prev.replaceWith(icon); else btn.append(icon);
      });
    };

    const applySelection = (scope: Element, selected: Set<string>): void => {
      let onPage = 0;
      let selectedOnPage = 0;
      scope.querySelectorAll<HTMLElement>(".rui-data-grid-table > tbody > tr[data-row-id]").forEach((tr) => {
        const on = selected.has(tr.getAttribute("data-row-id") ?? "");
        onPage += 1;
        if (on) selectedOnPage += 1;
        if (on) tr.setAttribute("data-selected", "true"); else tr.removeAttribute("data-selected");
        const cb = tr.querySelector<HTMLInputElement>("input.rui-data-grid-checkbox");
        if (!cb) return;
        cb.checked = on;
        if (on) cb.setAttribute("checked", ""); else cb.removeAttribute("checked");
      });
      const all = scope.querySelector<HTMLInputElement>("thead .rui-data-grid-checkbox");
      if (all) {
        const every = onPage > 0 && selectedOnPage === onPage;
        const some = selectedOnPage > 0 && !every;
        all.checked = every;
        if (every) all.setAttribute("checked", ""); else all.removeAttribute("checked");
        all.indeterminate = some;
        all.setAttribute("aria-checked", some ? "mixed" : every ? "true" : "false");
        if (some) all.setAttribute("data-indeterminate", "true"); else all.removeAttribute("data-indeterminate");
      }
      const bulk = scope.querySelector<HTMLElement>(".rui-data-grid-bulk");
      if (bulk) {
        const count = selected.size;
        const label = bulk.querySelector(".rui-data-grid-bulk-count");
        if (label) label.textContent = `${count} selected`;
        bulk.hidden = count === 0;
        bulk.style.display = count === 0 ? "none" : "";
      }
    };

    const syncFooter = (scope: Element, m: GridModel): void => {
      const footer = scope.querySelector<HTMLElement>(".rui-data-grid-footer");
      if (!footer) return;
      const summary = footer.querySelector(".rui-data-grid-footer-summary");
      if (summary) {
        const start = m.total === 0 ? 0 : (m.page - 1) * m.perPage + 1;
        const end = Math.min(m.total, m.page * m.perPage);
        summary.textContent = m.total === 0 ? emptyLabel : `Showing ${start}–${end} of ${m.total}`;
      }
      const buttons = scope.querySelector<HTMLElement>(".rui-data-grid-footer-buttons");
      if (buttons) {
        const paged = m.totalPages > 1;
        buttons.hidden = !paged;
        buttons.style.display = paged ? "" : "none";
        const [prev, next] = Array.from(
          buttons.querySelectorAll<HTMLButtonElement>(".rui-data-grid-page-button"),
        );
        const setDisabled = (btn: HTMLButtonElement | undefined, off: boolean): void => {
          if (!btn) return;
          btn.disabled = off;
          if (off) btn.setAttribute("disabled", ""); else btn.removeAttribute("disabled");
        };
        setDisabled(prev, m.page <= 1);
        setDisabled(next, m.page >= m.totalPages);
        const current = buttons.querySelector(".rui-data-grid-page-current");
        if (current) current.textContent = `${m.page} / ${m.totalPages}`;
      }
      const select = footer.querySelector<HTMLSelectElement>(".rui-data-grid-per-page");
      if (select && select.value !== String(m.perPage)) select.value = String(m.perPage);
    };

    const syncStatus = (scope: Element, m: GridModel): void => {
      const region = scope.querySelector(".rui-data-grid-status");
      if (!region) return;
      const next = errorText
        ? errorText
        : loading
          ? loadingLabel
          : `${m.total} ${m.total === 1 ? "result" : "results"}`;
      if (region.textContent !== next) region.textContent = next;
    };

    const repaint = (origin: Element | null, m: GridModel = readModel()): void => {
      const scope = liveScope(origin);
      syncColumns(scope);
      const body = bodyOf(scope);
      if (body) buildRows(body, m);
      syncHeader(scope, m);
      applySelection(scope, m.selected);
      syncFooter(scope, m);
      syncStatus(scope, m);
    };

    /* ---- writes ------------------------------------------------------- */

    const writePage = (next: number): void => {
      if (pageStateName) helpers.setState(pageStateName, next);
      else pageSlot.set(next);
    };

    const writeSort = (key: string, origin: Element | null): void => {
      const cur = readSort();
      const direction = cur.key === key && cur.dir === "asc" ? "desc" : "asc";
      if (sortStateName) helpers.setState(sortStateName, { key, direction });
      else sortSlot.set({ key, direction });
      helpers.invoke(props.onSort, key, direction);
      repaint(origin);
    };

    const writeSelection = (next: string[], origin: Element | null): void => {
      if (selectedStateName) helpers.setState(selectedStateName, next);
      else selectedSlot.set(next);
      helpers.invoke(props.onSelectionChange, next);
      applySelection(liveScope(origin), new Set(next));
    };

    /* ---- static structure -------------------------------------------- */

    const toolbarChildren = asArray<unknown>(props.toolbar);
    if (toolbarChildren.length > 0) {
      const bar = el("div", { class: "rui-data-grid-bulk" });
      bar.append(el("span", { class: "rui-data-grid-bulk-count" }, ["0 selected"]));
      const tools = el("div", { class: "rui-data-grid-bulk-tools" });
      for (const child of toolbarChildren) tools.append(helpers.renderNode(child));
      bar.append(tools);
      wrapper.append(bar);
    }

    // Combined toolbar row: global search + export
    const hasToolbar = asBoolean(props.exportable)
      || typeof props.globalSearch === "string" || globalSearchStateName;
    if (hasToolbar) {
      const toolbarRow = el("div", { class: "rui-data-grid-toolbar" });

      // Global search
      if (typeof props.globalSearch === "string" || globalSearchStateName) {
        const searchWrap = el("div", { class: "rui-data-grid-global-search" });
        const searchIcon = renderIcon("magnifying-glass", { className: "rui-data-grid-search-icon" });
        if (searchIcon) searchWrap.append(searchIcon);
        const searchInput = el("input", {
          type: "search",
          class: "rui-data-grid-search-input",
          placeholder: "Search all columns…",
          "aria-label": "Search all columns",
          value: valueAttr(readGlobalSearch()),
        });
        searchInput.oninput = (event) => {
          const target = event.currentTarget as HTMLInputElement;
          const term = target.value;
          if (globalSearchStateName) helpers.setState(globalSearchStateName, term);
          else globalSearchSlot.set(term);
          helpers.invoke(props.onGlobalSearch, term);
          writePage(1);
          repaint(target);
        };
        searchWrap.append(searchInput);
        toolbarRow.append(searchWrap);
      }

      const toolbarActions = el("div", { class: "rui-data-grid-toolbar-actions" });

      if (asBoolean(props.exportable)) {
        const btn = el("button", { type: "button", class: "rui-data-grid-export" });
        const icon = renderIcon("download", { className: "rui-data-grid-export-icon" });
        if (icon) btn.append(icon);
        btn.append(el("span", {}, ["Export CSV"]));
        btn.onclick = () => {
          const csv = buildDataGridCsv(cols, readModel().indices);
          downloadCsv(csv, asString(props.exportFilename, "data.csv") || "data.csv");
        };
        toolbarActions.append(btn);
      }

      toolbarRow.append(toolbarActions);
      wrapper.append(toolbarRow);
    }

    wrapper.append(el("span", {
      class: "rui-data-grid-status",
      role: "status",
      "aria-live": "polite",
      style: SR_ONLY,
    }));

    const tableWrap = el("div", { class: "rui-data-grid-scroll" });
    if (allowOverflow) {
      tableWrap.style.overflow = "visible";
      wrapper.style.overflowX = "auto";
    } else {
      const cap = sanitiseCssLength(props.maxHeight, stickyHeader ? "70vh" : "");
      if (cap) tableWrap.style.maxHeight = cap;
    }
    const table = el("table", { class: "rui-data-grid-table" });
    if (loading) table.setAttribute("aria-busy", "true");
    const caption = asString(props.caption);
    if (caption) table.append(el("caption", { class: "rui-data-grid-caption" }, [caption]));

    const thead = el("thead");
    const headRow = el("tr");
    if (selectable) {
      const th = el("th", { class: "rui-data-grid-cell-select", scope: "col" });
      const cb = el("input", {
        type: "checkbox",
        class: "rui-data-grid-checkbox",
        "aria-label": "Select all rows on this page",
      });
      cb.onclick = (event) => {
        const target = event.currentTarget as HTMLInputElement;
        const scope = liveScope(target);
        const next = new Set(readSelected());
        scope.querySelectorAll<HTMLElement>(".rui-data-grid-table > tbody > tr[data-row-id]").forEach((tr) => {
          const id = tr.getAttribute("data-row-id") ?? "";
          if (target.checked) next.add(id); else next.delete(id);
        });
        writeSelection(Array.from(next), target);
      };
      th.append(cb);
      headRow.append(th);
    }
    if (showRowNumbers) {
      headRow.append(el("th", {
        class: "rui-data-grid-cell-rownum",
        scope: "col",
      }, ["#"]));
    }

    const config = getColConfig();
    let pinnedOffset = 0;
    cols.forEach((col, c) => {
      const th = buildColTh(col, c, config, pinnedOffset);
      headRow.append(th);
      if (config.pinned.has(col.key)) pinnedOffset += parsePx(config.widths[col.key] || col.width) || 150;
    });

    // Column menu icon — sits as the last header cell
    if (columnMenuEnabled) {
      const menuTh = el("th", {
        class: "rui-data-grid-col-menu-cell",
        scope: "col",
      });
      const menuWrap = el("div", { class: "rui-data-grid-col-menu-wrap" });
      const menuBtn = el("button", {
        type: "button",
        class: "rui-data-grid-col-menu-btn",
        "aria-label": "Column settings",
        "aria-expanded": "false",
      });
      const gearIcon = renderIcon("sliders", { className: "rui-data-grid-col-menu-icon" });
      if (gearIcon) menuBtn.append(gearIcon);

      const panel = el("div", {
        class: "rui-data-grid-col-panel",
        style: "display:none",
      });

      const closePanel = (): void => {
        colConfigPanelOpen.set(false);
        const liveWrap = wrapper.querySelector(".rui-data-grid-col-menu-wrap");
        const livePanel = liveWrap?.querySelector(".rui-data-grid-col-panel") as HTMLElement | null;
        const liveBtn = liveWrap?.querySelector(".rui-data-grid-col-menu-btn") as HTMLElement | null;
        if (livePanel) livePanel.style.display = "none";
        if (liveBtn) liveBtn.setAttribute("aria-expanded", "false");
      };

      const rebuildColPanel = (panelEl: HTMLElement): void => {
        panelEl.replaceChildren();
        const cfg0 = getColConfig();
        const panelHead = el("div", { class: "rui-data-grid-col-panel-head" });
        panelHead.append(el("span", { class: "rui-data-grid-col-panel-title" }, ["Columns"]));
        const actions = el("span", { style: "display:flex;align-items:center;gap:4px" });
        const resetBtn = el("button", {
          type: "button",
          class: "rui-data-grid-col-panel-reset",
        }, ["Reset"]);
        resetBtn.onclick = (ev) => {
          ev.stopPropagation();
          colConfigSlot.set(initColumnConfig(allCols, null));
          if (persistKey) {
            try { localStorage.removeItem(`aktion-datagrid-${persistKey}`); } catch { /* noop */ }
          }
          rebuildColPanel(panelEl);
          repaint(ev.currentTarget as Element);
        };
        const closeBtn = el("button", {
          type: "button",
          class: "rui-data-grid-col-panel-close",
          "aria-label": "Close column settings",
        }, ["\u00D7"]);
        closeBtn.onclick = (ev) => { ev.stopPropagation(); closePanel(); };
        actions.append(resetBtn, closeBtn);
        panelHead.append(actions);
        panelEl.append(panelHead);

        const list = el("div", { class: "rui-data-grid-col-panel-list" });
        let dragSrcKey: string | null = null;

        for (const key of cfg0.order) {
          const colDef = allCols.find((cd) => cd.key === key);
          if (!colDef) continue;
          const isHidden = cfg0.hidden.has(key);
          const isPinnedCol = cfg0.pinned.has(key);

          const row = el("div", {
            class: "rui-data-grid-col-panel-row",
            draggable: "true",
            "data-col-key": key,
          });

          row.append(el("span", {
            class: "rui-data-grid-col-panel-handle",
            "aria-hidden": "true",
          }, ["⠿"]));

          const cb = el("input", {
            type: "checkbox",
            class: "rui-data-grid-col-panel-cb",
            checked: isHidden ? null : "",
            "aria-label": `Show ${colDef.header}`,
          });
          cb.onclick = (ev) => {
            ev.stopPropagation();
            const target2 = ev.currentTarget as HTMLInputElement;
            const cfg = getColConfig();
            const nextHidden = new Set(cfg.hidden);
            if (target2.checked) nextHidden.delete(key); else nextHidden.add(key);
            updateColConfig({ hidden: nextHidden });
            repaint(target2);
          };
          row.append(cb);

          row.append(el("span", {
            class: "rui-data-grid-col-panel-label",
          }, [colDef.header]));

          const pinBtn = el("button", {
            type: "button",
            class: "rui-data-grid-col-panel-pin",
            "aria-label": isPinnedCol ? `Unpin ${colDef.header}` : `Pin ${colDef.header}`,
            "data-active": isPinnedCol ? "true" : null,
          });
          const pinIcon = renderIcon("thumbtack", { className: "rui-data-grid-col-panel-pin-icon" });
          if (pinIcon) pinBtn.append(pinIcon);
          pinBtn.onclick = (ev) => {
            ev.stopPropagation();
            const cfg = getColConfig();
            const nextPinned = new Set(cfg.pinned);
            if (isPinnedCol) nextPinned.delete(key); else nextPinned.add(key);
            updateColConfig({ pinned: nextPinned });
            rebuildColPanel(panelEl);
            repaint(ev.currentTarget as Element);
          };
          row.append(pinBtn);

          row.ondragstart = (ev) => {
            dragSrcKey = key;
            (ev.currentTarget as HTMLElement).classList.add("rui-data-grid-col-dragging");
            if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
          };
          row.ondragend = (ev) => {
            (ev.currentTarget as HTMLElement).classList.remove("rui-data-grid-col-dragging");
            dragSrcKey = null;
            list.querySelectorAll(".rui-data-grid-col-dragover").forEach((e) =>
              e.classList.remove("rui-data-grid-col-dragover"));
          };
          row.ondragover = (ev) => {
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
          };
          row.ondragenter = (ev) => {
            ev.preventDefault();
            (ev.currentTarget as HTMLElement).classList.add("rui-data-grid-col-dragover");
          };
          row.ondragleave = (ev) => {
            (ev.currentTarget as HTMLElement).classList.remove("rui-data-grid-col-dragover");
          };
          row.ondrop = (ev) => {
            ev.preventDefault();
            (ev.currentTarget as HTMLElement).classList.remove("rui-data-grid-col-dragover");
            const dropKey = (ev.currentTarget as HTMLElement).getAttribute("data-col-key");
            if (!dragSrcKey || !dropKey || dragSrcKey === dropKey) return;
            const cfg = getColConfig();
            const order = [...cfg.order];
            const srcIdx = order.indexOf(dragSrcKey);
            const dstIdx = order.indexOf(dropKey);
            if (srcIdx < 0 || dstIdx < 0) return;
            order.splice(srcIdx, 1);
            order.splice(dstIdx, 0, dragSrcKey);
            updateColConfig({ order });
            rebuildColPanel(panelEl);
            repaint(ev.currentTarget as Element);
          };

          list.append(row);
        }
        panelEl.append(list);
      };

      menuBtn.onclick = (event) => {
        event.stopPropagation();
        const isOpen = !colConfigPanelOpen.get();
        colConfigPanelOpen.set(isOpen);
        const live = (event.currentTarget as Element).closest(".rui-data-grid-col-menu-wrap");
        const livePanel = live?.querySelector(".rui-data-grid-col-panel") as HTMLElement | null;
        if (livePanel) {
          livePanel.style.display = isOpen ? "" : "none";
          (event.currentTarget as HTMLElement).setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
        if (isOpen && livePanel) rebuildColPanel(livePanel);
      };
      menuWrap.append(menuBtn);

      menuWrap.onmousedown = (ev) => ev.stopPropagation();
      panel.onclick = (ev) => ev.stopPropagation();

      const closeOnOutside = (event: MouseEvent): void => {
        if (!colConfigPanelOpen.get()) return;
        const path = event.composedPath?.() ?? [];
        for (const node of path) {
          if (node instanceof Element && node.classList?.contains("rui-data-grid-col-menu-wrap")) return;
        }
        closePanel();
      };
      if (typeof document !== "undefined") {
        document.addEventListener("mousedown", closeOnOutside);
        helpers.registerDisposer(() => document.removeEventListener("mousedown", closeOnOutside), "col-menu-outside");
      }

      menuWrap.append(panel);
      menuTh.append(menuWrap);
      headRow.append(menuTh);
    }

    thead.append(headRow);

    if (cols.some((c) => c.filterable)) {
      const filters = filterSlot.get();
      const filterRow = el("tr", { class: "rui-data-grid-filter-row" });
      if (selectable) filterRow.append(el("td", { class: "rui-data-grid-cell-select" }));
      if (showRowNumbers) filterRow.append(el("td", { class: "rui-data-grid-cell-rownum" }));
      let filterPinOff = 0;
      for (const col of cols) {
        const isPinned = config.pinned.has(col.key);
        filterRow.append(buildFilterTd(col, filters, isPinned, filterPinOff));
        if (isPinned) filterPinOff += parsePx(config.widths[col.key] || col.width) || 150;
      }
      if (columnMenuEnabled) filterRow.append(el("td", { class: "rui-data-grid-col-menu-cell" }));
      thead.append(filterRow);
    }
    table.append(thead);

    const tbody = el("tbody");
    table.append(tbody);
    tableWrap.append(table);
    wrapper.append(tableWrap);

    // Scroll arrows for horizontal overflow
    if (!allowOverflow) {
      deferToPaint(() => {
        const live = tableWrap.isConnected ? tableWrap : null;
        if (live) installScrollArrows(live);
      });
    }

    const model = readModel();

    if (perPageOptions.length > 0 || rowCount > model.perPage) {
      const footer = el("div", { class: "rui-data-grid-footer" });
      footer.append(el("span", { class: "rui-data-grid-footer-summary" }));
      if (perPageOptions.length > 0) {
        const select = el("select", {
          class: "rui-data-grid-per-page",
          "aria-label": "Rows per page",
        });
        for (const size of perPageOptions) {
          select.append(el("option", { value: String(size) }, [`${size} / page`]));
        }
        select.onchange = (event) => {
          const target = event.currentTarget as HTMLSelectElement;
          const size = Math.max(1, Math.floor(asNumber(target.value, model.perPage)));
          if (perPageStateName) helpers.setState(perPageStateName, size);
          else perPageSlot.set(size);
          helpers.invoke(props.onPerPageChange, size);
          writePage(1);
          repaint(target);
        };
        footer.append(select);
      }
      const buttons = el("div", { class: "rui-data-grid-footer-buttons" });
      const prev = el("button", { type: "button", class: "rui-data-grid-page-button" }, ["‹ Prev"]);
      const next = el("button", { type: "button", class: "rui-data-grid-page-button" }, ["Next ›"]);
      const step = (delta: number) => (event: Event): void => {
        const target = event.currentTarget as Element;
        const m = readModel();
        const to = m.page + delta;
        if (to < 1 || to > m.totalPages) return;
        writePage(to);
        repaint(target);
      };
      prev.onclick = step(-1);
      next.onclick = step(1);
      buttons.append(prev);
      buttons.append(el("span", { class: "rui-data-grid-page-current" }));
      buttons.append(next);
      footer.append(buttons);
      wrapper.append(footer);
    }

    repaint(null, model);
    return wrapper;
  },
};

/* ----------------------------------------------------------------------- *
 * DataGrid helpers — cell styles, pixel parsing
 * ----------------------------------------------------------------------- */

function buildCellStyle(width: string, pinned: boolean, pinnedOffset: number): string | null {
  const parts: string[] = [];
  if (width) {
    parts.push(`width:${width};max-width:${width};min-width:${width}`);
  }
  if (pinned) {
    parts.push(`position:sticky;left:${pinnedOffset}px`);
  }
  return parts.length > 0 ? parts.join(";") : null;
}

function parsePx(value: string): number {
  if (!value) return 0;
  const match = /^(\d+(?:\.\d+)?)px$/i.exec(value.trim());
  return match ? Number(match[1]) : 0;
}

/* ----------------------------------------------------------------------- *
 * CalendarView — month/week calendar grid
 * ----------------------------------------------------------------------- */

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  tone?: string;
  time?: string;
}

function readCalendarEvents(raw: unknown): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  asArray<unknown>(raw).forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") return;
    const e = entry as { id?: unknown; date?: unknown; title?: unknown; tone?: unknown; time?: unknown };
    const date = asString(e.date);
    if (!date) return;
    out.push({
      // Events need an identity for `onEventClick` to be actionable; fall back
      // to a positional id so an author who omits `id` still gets a handle.
      id: asString(e.id) || `${date}#${idx}`,
      date,
      title: asString(e.title),
      tone: asString(e.tone, "primary"),
      time: asString(e.time),
    });
  });
  return out;
}

const ISO_MONTH_OR_DAY = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/**
 * Parse `YYYY-MM` / `YYYY-MM-DD` as a LOCAL date.
 *
 * `new Date("2026-07-06")` is UTC midnight, which is the *previous* day in
 * every negative-offset timezone — enough to shift a week strip by a whole
 * week once `startOfWeek` reads the local components back out.
 */
function parseLocalIso(raw: string): Date | null {
  const m = ISO_MONTH_OR_DAY.exec(raw.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
}

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = out.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "27 Jul – 2 Aug 2026" — a week strip spans two months more often than not. */
function rangeLabel(first: Date, last: Date): string {
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  const head = first.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const tail = last.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${head} – ${tail}`;
}

const CAL_EVENT_BUTTON = "border:0;font-family:inherit;cursor:pointer;width:100%";
const CAL_MORE_BUTTON = "border:0;background:none;font:inherit;font-size:11px;cursor:pointer;color:inherit;text-align:left";
const CAL_DISABLED_DAY = "opacity:0.45;cursor:default";
const CAL_AVATAR = "width:100%;height:100%;border-radius:50%;object-fit:cover;display:block";

export const CalendarView: ComponentSpec = {
  name: "CalendarView",
  description:
    "Full-month or week calendar grid for scheduling apps — distinct from " +
    "the form-input `DatePicker`. Pass events as an array of " +
    "`{date: 'YYYY-MM-DD', title, tone?, time?, id?}` objects. Bind `value` " +
    "to a `$variable` for the selected date (ISO string) and `month` for the " +
    "visible month; the built-in ‹ / › / Today controls write both. Use " +
    "`view=\"week\"` for a single-week strip. `firstDay=1` (Monday) " +
    "matches most business apps. `onEventClick` makes the event chips " +
    "clickable, `min` / `max` / `disabledDates` block days.",
  props: [
    { name: "value", type: "string", optional: true, description: "Selected ISO date (YYYY-MM-DD); bind a $variable" },
    { name: "month", type: "string", optional: true, description: "Visible month — ISO date or YYYY-MM. Bind a $variable to follow the prev/next controls (defaults to `value`, else today)" },
    { name: "events", type: "object[]", optional: true, description: "Array of {date, title, tone?, time?, id?} objects" },
    { name: "view", type: "string", optional: true, enum: ["month", "week"] },
    { name: "firstDay", type: "number", optional: true, description: "0=Sunday, 1=Monday (default 1)" },
    { name: "onSelect", type: "callable", optional: true, description: "Callable fired when a day is clicked; receives the ISO date string" },
    { name: "onMonthChange", type: "callable", optional: true, aliases: ["onNavigate"], description: "Callable fired when the prev/next/today controls move the grid; receives the new anchor ISO date" },
    { name: "onEventClick", type: "callable", optional: true, description: "Callable fired with (eventId, event) when an event chip is clicked; makes the chips real buttons" },
    { name: "maxEventsPerDay", type: "number", optional: true, description: "Event chips per day before a `+N more` toggle (default 3)" },
    { name: "min", type: "string", optional: true, description: "Earliest selectable ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest selectable ISO date" },
    { name: "disabledDates", type: "string[]", optional: true, description: "ISO dates that cannot be selected (blackout days)" },
    { name: "hideNav", type: "boolean", optional: true, description: "Hide the built-in prev / next / today controls" },
  ],
  render: (node, props, helpers) => {
    const view = asString(props.view, "month");
    const events = readCalendarEvents(props.events);
    const today = new Date();
    const todayIso = formatIsoDate(today);
    const weekStartsOn = ((asNumber(props.firstDay, 1) % 7) + 7) % 7;
    const maxEvents = Math.max(1, Math.floor(asNumber(props.maxEventsPerDay, 3)));

    const valueStateName = node.argMeta?.[0]?.stateRef;
    const monthStateName = node.argMeta?.[1]?.stateRef;

    // Selection: `value` owns it whenever anything owns it. Only when nothing
    // does (no binding, no literal) does the component keep its own, so a
    // click can never contradict a value the program is computing.
    const selectionSlot = helpers.useInstanceState<string>("selected", "");
    const uncontrolled = !valueStateName && !asString(props.value);
    const valueRaw = uncontrolled ? selectionSlot.get() : asString(props.value);
    const valueIso = /^\d{4}-\d{2}-\d{2}$/.test(valueRaw) ? valueRaw : "";

    // Anchor: what the grid is scrolled to. Navigation writes here — through
    // `month`'s binding when there is one, otherwise into instance state.
    const navSlot = helpers.useInstanceState<string>("anchor", "");
    const localNav = monthStateName ? "" : navSlot.get();
    const anchorRaw = localNav || asString(props.month) || asString(props.value);
    const anchorDate = parseLocalIso(anchorRaw) ?? (anchorRaw ? new Date(anchorRaw) : today);
    const refDate = Number.isNaN(anchorDate.getTime()) ? today : anchorDate;

    const minIso = asString(props.min).slice(0, 10);
    const maxIso = asString(props.max).slice(0, 10);
    const blackout = new Set(asArray<unknown>(props.disabledDates).map((d) => asString(d).slice(0, 10)));
    const isDisabled = (iso: string): boolean =>
      (minIso !== "" && iso < minIso) || (maxIso !== "" && iso > maxIso) || blackout.has(iso);

    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      const key = evt.date.slice(0, 10);
      const list = eventsByDate.get(key) ?? [];
      list.push(evt);
      eventsByDate.set(key, list);
    }

    // Which day owns the single tab stop, and which day has its overflowing
    // events expanded. Both are pure UI state, so both live in instance slots.
    const focusSlot = helpers.useInstanceState<string>("focus", "");
    const expandedSlot = helpers.useInstanceState<string>("expanded", "");

    const eventClickable = typeof props.onEventClick === "function";

    const root = el("div", { class: "rui-calendar", "data-view": view });

    const liveScope = (origin: Element | null | undefined): Element =>
      origin?.closest(".rui-calendar") ?? root;

    /** The 7 (week) or 35–42 (month) days on screen for a given anchor. */
    const cellsFor = (ref: Date): Array<{ date: Date; inMonth: boolean }> => {
      const out: Array<{ date: Date; inMonth: boolean }> = [];
      if (view === "week") {
        const start = startOfWeek(ref, weekStartsOn);
        for (let i = 0; i < 7; i += 1) {
          const d = addDays(start, i);
          out.push({ date: d, inMonth: d.getMonth() === ref.getMonth() });
        }
        return out;
      }
      const firstOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const lastOfMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const gridStart = startOfWeek(firstOfMonth, weekStartsOn);
      const totalDays = Math.ceil((lastOfMonth.getDate() + ((firstOfMonth.getDay() - weekStartsOn + 7) % 7)) / 7) * 7;
      for (let i = 0; i < totalDays; i += 1) {
        const d = addDays(gridStart, i);
        out.push({ date: d, inMonth: d.getMonth() === ref.getMonth() });
      }
      return out;
    };

    /* ---- navigation --------------------------------------------------- */

    const navigateTo = (iso: string, origin: Element | null): void => {
      if (monthStateName) helpers.setState(monthStateName, iso);
      else navSlot.set(iso);
      helpers.invoke(props.onMonthChange, iso);
      const ref = parseLocalIso(iso);
      if (ref) applyView(liveScope(origin), ref);
    };

    const shiftAnchor = (delta: number): string => {
      if (view === "week") return formatIsoDate(addDays(startOfWeek(refDate, weekStartsOn), delta * 7));
      return formatIsoDate(new Date(refDate.getFullYear(), refDate.getMonth() + delta, 1));
    };

    /* ---- selection ---------------------------------------------------- */

    const applySelected = (scope: Element, iso: string): void => {
      scope.querySelectorAll<HTMLElement>(".rui-calendar-day").forEach((cell) => {
        const on = cell.getAttribute("data-date") === iso;
        cell.setAttribute("data-selected", on ? "true" : "false");
        cell.setAttribute("aria-selected", on ? "true" : "false");
      });
    };

    const selectDay = (iso: string, origin: Element | null): void => {
      if (isDisabled(iso)) return;
      if (valueStateName) helpers.setState(valueStateName, iso);
      else if (uncontrolled) selectionSlot.set(iso);
      helpers.invoke(props.onSelect, iso);
      // Only repaint the highlight when this component (or its binding) owns
      // the value; a literal `value` prop is the program's business.
      if (valueStateName || uncontrolled) applySelected(liveScope(origin), iso);
    };

    /* ---- keyboard (standard date-grid pattern) ------------------------ */

    const setRoving = (scope: Element, iso: string): void => {
      focusSlot.set(iso);
      scope.querySelectorAll<HTMLElement>(".rui-calendar-day").forEach((cell) => {
        cell.tabIndex = cell.getAttribute("data-date") === iso ? 0 : -1;
      });
    };

    const moveFocus = (origin: HTMLElement, target: Date): void => {
      const iso = formatIsoDate(target);
      const scope = liveScope(origin);
      const focusIn = (): boolean => {
        const cell = scope.querySelector<HTMLElement>(`.rui-calendar-day[data-date="${iso}"]`);
        if (!cell) return false;
        setRoving(scope, iso);
        cell.focus();
        return true;
      };
      if (focusIn()) return;
      // Off the rendered range: page the grid to that date, then land on it.
      navigateTo(iso, origin);
      focusIn();
    };

    /* ---- builders ----------------------------------------------------- */

    const fillDayEvents = (
      container: HTMLElement,
      dayEvents: CalendarEvent[],
      iso: string,
      expanded: boolean,
    ): void => {
      container.replaceChildren();
      const shown = expanded ? dayEvents : dayEvents.slice(0, maxEvents);
      for (const evt of shown) {
        const attrs = {
          class: "rui-calendar-event",
          "data-tone": evt.tone ?? "primary",
          "data-event-id": evt.id,
          title: evt.time ? `${evt.time} — ${evt.title}` : evt.title,
        };
        if (!eventClickable) {
          container.append(el("span", attrs, [evt.title]));
          continue;
        }
        const chip = el("button", { ...attrs, type: "button", style: CAL_EVENT_BUTTON }, [evt.title]);
        chip.onclick = (event) => {
          // The chip sits inside the day cell, whose own handler would
          // otherwise swallow the click and just select the day.
          event.stopPropagation();
          helpers.invoke(props.onEventClick, evt.id, {
            id: evt.id, date: evt.date, title: evt.title, time: evt.time, tone: evt.tone,
          });
        };
        container.append(chip);
      }
      if (!expanded && dayEvents.length > maxEvents) {
        const more = el("button", {
          type: "button",
          class: "rui-calendar-event-more",
          style: CAL_MORE_BUTTON,
        }, [`+${dayEvents.length - maxEvents} more`]);
        more.onclick = (event) => {
          event.stopPropagation();
          expandedSlot.set(iso);
          const live = (event.currentTarget as Element).closest(".rui-calendar-day-events");
          if (live) fillDayEvents(live as HTMLElement, dayEvents, iso, true);
        };
        container.append(more);
      }
    };

    const buildGrid = (grid: HTMLElement, ref: Date): void => {
      grid.replaceChildren();
      const cells = cellsFor(ref);
      const expanded = expandedSlot.get();
      // Resolve the single tab stop: last focused day, else the selection,
      // else today, else the first selectable day on screen.
      const isoList = cells.map((c) => formatIsoDate(c.date));
      const enabled = (iso: string): boolean => !isDisabled(iso);
      const rovingIso = [focusSlot.get(), valueIso, todayIso].find((iso) => iso && isoList.includes(iso) && enabled(iso))
        ?? isoList.find((iso, i) => cells[i]!.inMonth && enabled(iso))
        ?? isoList[0]
        ?? "";
      let row: HTMLElement | null = null;
      cells.forEach((cell, i) => {
        if (i % 7 === 0) {
          // `display: contents` keeps the 7-column CSS grid intact while
          // giving assistive tech the rows `role="grid"` requires.
          row = el("div", { class: "rui-calendar-row", role: "row", style: "display:contents" });
          grid.append(row);
        }
        const iso = isoList[i]!;
        const disabled = isDisabled(iso);
        const dayCell = el("div", {
          class: "rui-calendar-day",
          role: "gridcell",
          "data-date": iso,
          "data-in-month": cell.inMonth ? "true" : "false",
          "data-today": iso === todayIso ? "true" : "false",
          "data-selected": iso === valueIso ? "true" : "false",
          "data-disabled": disabled ? "true" : null,
          "aria-selected": iso === valueIso ? "true" : "false",
          "aria-current": iso === todayIso ? "date" : null,
          "aria-disabled": disabled ? "true" : null,
          "aria-label": cell.date.toLocaleDateString(undefined, {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          }),
          tabindex: iso === rovingIso ? "0" : "-1",
          style: disabled ? CAL_DISABLED_DAY : null,
        });
        dayCell.append(el("span", { class: "rui-calendar-daynumber" }, [String(cell.date.getDate())]));
        const dayEvents = eventsByDate.get(iso) ?? [];
        if (dayEvents.length > 0) {
          const evts = el("div", { class: "rui-calendar-day-events" });
          fillDayEvents(evts, dayEvents, iso, expanded === iso);
          dayCell.append(evts);
        }
        if (!disabled) {
          dayCell.onclick = (event) => {
            const origin = event.currentTarget as HTMLElement;
            setRoving(liveScope(origin), iso);
            selectDay(iso, origin);
          };
        }
        dayCell.onkeydown = (event) => {
          const origin = event.currentTarget as HTMLElement;
          const from = parseLocalIso(origin.getAttribute("data-date") ?? "") ?? cell.date;
          let target: Date | null = null;
          switch (event.key) {
            case "ArrowLeft": target = addDays(from, -1); break;
            case "ArrowRight": target = addDays(from, 1); break;
            case "ArrowUp": target = addDays(from, -7); break;
            case "ArrowDown": target = addDays(from, 7); break;
            case "Home": target = startOfWeek(from, weekStartsOn); break;
            case "End": target = addDays(startOfWeek(from, weekStartsOn), 6); break;
            case "PageUp": target = new Date(from.getFullYear(), from.getMonth() - 1, from.getDate()); break;
            case "PageDown": target = new Date(from.getFullYear(), from.getMonth() + 1, from.getDate()); break;
            case "Enter":
            case " ":
              event.preventDefault();
              if (!disabled) selectDay(formatIsoDate(from), origin);
              return;
            default: return;
          }
          event.preventDefault();
          moveFocus(origin, target);
        };
        (row ?? grid).append(dayCell);
      });
    };

    /** Repaint the parts that depend on the anchor: the title and the grid. */
    const applyView = (scope: Element, ref: Date): void => {
      const cells = cellsFor(ref);
      const title = scope.querySelector(".rui-calendar-title");
      if (title) {
        title.textContent = view === "week" && cells.length > 0
          ? rangeLabel(cells[0]!.date, cells[cells.length - 1]!.date)
          : ref.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      }
      const grid = scope.querySelector<HTMLElement>(".rui-calendar-grid");
      if (grid) {
        buildGrid(grid, ref);
        const label = title?.textContent ?? "";
        if (label) grid.setAttribute("aria-label", label);
      }
    };

    /* ---- static structure -------------------------------------------- */

    const header = el("div", { class: "rui-calendar-header" });
    header.append(el("div", { class: "rui-calendar-title" }));
    if (!asBoolean(props.hideNav)) {
      // The stylesheet has always reserved this slot
      // (`justify-content: space-between`); nothing ever filled it, so the
      // calendar could not be browsed at all.
      const nav = el("div", { class: "rui-calendar-nav" });
      const navButton = (label: string, aria: string, onActivate: (origin: Element) => void): HTMLElement => {
        const btn = el("button", {
          type: "button",
          class: "rui-data-grid-page-button rui-calendar-nav-button",
          "aria-label": aria,
        }, [label]);
        btn.onclick = (event) => onActivate(event.currentTarget as Element);
        return btn;
      };
      nav.append(navButton("‹", view === "week" ? "Previous week" : "Previous month",
        (origin) => navigateTo(shiftAnchor(-1), origin)));
      nav.append(navButton("Today", "Today", (origin) => navigateTo(todayIso, origin)));
      nav.append(navButton("›", view === "week" ? "Next week" : "Next month",
        (origin) => navigateTo(shiftAnchor(1), origin)));
      header.append(nav);
    }
    root.append(header);

    const weekRow = el("div", { class: "rui-calendar-weekrow", "aria-hidden": "true" });
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i += 1) {
      const label = dayLabels[(weekStartsOn + i) % 7] ?? "";
      weekRow.append(el("div", { class: "rui-calendar-weekday" }, [label]));
    }
    root.append(weekRow);

    root.append(el("div", { class: "rui-calendar-grid", "data-view": view, role: "grid" }));
    applyView(root, refDate);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ActivityLog — activity / audit feeds
 * ----------------------------------------------------------------------- */

interface FeedEntry {
  title: string;
  description: string;
  actor: string;
  avatarSrc: string;
  href: string;
  time: string;
  icon: string;
  tone: string;
  meta: string;
}

function readFeedEntries(raw: unknown): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const entry of asArray<unknown>(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    out.push({
      title: asString(e.title),
      description: asString(e.description),
      actor: asString(e.actor),
      avatarSrc: asString(e.avatarSrc),
      href: asString(e.href),
      time: asString(e.time),
      icon: asString(e.icon),
      tone: asString(e.tone, "default"),
      meta: asString(e.meta),
    });
  }
  return out;
}

interface FeedOptions {
  variant: string;
  emptyLabel: string;
  loading: boolean;
  loaderLabel: string;
  onItemClick: unknown;
  helpers: RenderHelpers;
}

const FEED_TITLE_BUTTON =
  "border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left";

function renderFeed(klass: string, items: FeedEntry[], opts: FeedOptions): HTMLElement {
  const root = el("ol", { class: klass, "data-variant": opts.variant });
  const clickable = typeof opts.onItemClick === "function";
  items.forEach((entry, idx) => {
    const li = el("li", {
      class: `${klass}-item`,
      "data-tone": entry.tone,
      "data-clickable": clickable || entry.href ? "true" : null,
    });
    const marker = el("span", { class: `${klass}-marker` });
    // `avatarSrc` was parsed and documented but never rendered — an author
    // passing `avatarSrc: user.photoUrl` got generic icon discs.
    const avatar = sanitiseImageSrc(entry.avatarSrc);
    if (avatar) {
      marker.append(el("img", { class: `${klass}-avatar`, src: avatar, alt: "", style: CAL_AVATAR }));
    } else {
      const iconNode = renderIcon(entry.icon, { className: `${klass}-icon` });
      if (iconNode) marker.append(iconNode);
    }
    li.append(marker);
    const body = el("div", { class: `${klass}-body` });
    const head = el("div", { class: `${klass}-head` });
    if (entry.actor) head.append(el("span", { class: `${klass}-actor` }, [entry.actor]));
    // An activity entry almost always points at the thing that changed, so the
    // title is the affordance: a link when the entry carries an `href`, a
    // button when the feed has an `onItemClick`, plain text otherwise.
    if (entry.href) {
      head.append(el("a", {
        class: `${klass}-title`,
        href: sanitiseHref(entry.href),
      }, [entry.title]));
    } else if (clickable) {
      const btn = el("button", {
        type: "button",
        class: `${klass}-title`,
        style: FEED_TITLE_BUTTON,
      }, [entry.title]);
      btn.onclick = () => opts.helpers.invoke(opts.onItemClick, idx, entry);
      head.append(btn);
    } else {
      head.append(el("span", { class: `${klass}-title` }, [entry.title]));
    }
    if (entry.time) head.append(el("span", { class: `${klass}-time` }, [entry.time]));
    body.append(head);
    if (entry.description) {
      body.append(el("p", { class: `${klass}-description` }, [entry.description]));
    }
    if (entry.meta) {
      body.append(el("span", { class: `${klass}-meta` }, [entry.meta]));
    }
    li.append(body);
    root.append(li);
  });
  if (items.length === 0 && !opts.loading) {
    root.append(el("li", { class: `${klass}-empty` }, [opts.emptyLabel]));
  }
  if (opts.loading) {
    const li = el("li", { class: `${klass}-loading`, role: "status", "aria-live": "polite" });
    const spin = renderIcon("spinner", { className: `${klass}-spin` });
    if (spin) li.append(spin);
    li.append(el("span", {}, [opts.loaderLabel]));
    root.append(li);
  }
  return root;
}

export const ActivityLog: ComponentSpec = {
  name: "ActivityLog",
  description:
    "Purpose-built feed of user/system activity. Each entry has `actor`, " +
    "`title`, `description?`, `time?`, `icon?`, `avatarSrc?`, `tone?`, " +
    "`href?`, and optional `meta` (IP, browser, request id). An entry's " +
    "`href` renders its title as a link; `onItemClick` makes every title a " +
    "button. Use `variant=\"audit\"` to render `meta` in monospace for " +
    "security/admin trails. Pass items as `{actor, title, description, time, " +
    "icon, tone, avatarSrc, href, meta}` objects.",
  props: [
    { name: "items", type: "object[]" },
    // Kept to what the stylesheet actually does: it used to promise a whole
    // "monospace voice with meta column" and delivered a monospace meta chip.
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: ["default", "audit"], description: "audit = monospace `meta` styling for security/admin trails" },
    { name: "emptyLabel", type: "string", optional: true, description: "Message shown when `items` is empty (default `No activity yet`)" },
    { name: "onItemClick", type: "callable", optional: true, description: "Callable fired with (index, item) when an entry title is activated" },
    { name: "loading", type: "boolean", optional: true, description: "Append a loading row while older activity is being fetched" },
    { name: "loaderLabel", type: "string", optional: true, description: "Label for the loading row (default `Loading activity…`)" },
  ],
  render: (_node, props, helpers) => {
    const variant = asString(props.variant, "default");
    const klass = variant === "audit" ? "rui-audit-trail" : "rui-activity-log";
    return renderFeed(klass, readFeedEntries(props.items), {
      variant,
      emptyLabel: asString(props.emptyLabel, "No activity yet"),
      loading: asBoolean(props.loading),
      loaderLabel: asString(props.loaderLabel, "Loading activity…"),
      onItemClick: props.onItemClick,
      helpers,
    });
  },
};

/* ----------------------------------------------------------------------- *
 * ComparisonTable — generic counterpart of PricingTable
 * ----------------------------------------------------------------------- */

const CMP_STICKY_CELL = "position:sticky;left:0;z-index:1;background:var(--rui-color-surface, var(--rui-color-bg))";

export const ComparisonTable: ComponentSpec = {
  name: "ComparisonTable",
  description:
    "Feature/spec comparison table — generic counterpart of `PricingTable`. " +
    "Pass `columns` (e.g. plan/product names) and `rows` of " +
    "`{label, values}` where `values` aligns 1-to-1 with `columns`. " +
    "Each value can be a boolean (✓/—), a string, or a node. Rows sharing a " +
    "`group` are kept together under one group header.",
  props: [
    { name: "columns", type: "string[]", description: "Column headers" },
    { name: "rows", type: "object[]", description: "Array of {label, values, hint?, group?} entries" },
    { name: "highlightColumn", type: "number", optional: true, description: "0-indexed column to visually emphasise" },
    { name: "featureLabel", type: "string", optional: true, description: "Header of the first (row-label) column — default `Feature`" },
    { name: "caption", type: "string", optional: true, aliases: ["ariaLabel"], description: "Table caption; also its accessible name" },
    { name: "stickyFirstColumn", type: "boolean", optional: true, description: "Keep the feature labels visible while the plan columns scroll horizontally" },
  ],
  render: (_node, props, helpers) => {
    const columns = asArray<unknown>(props.columns).map((c) => asString(c));
    const rows = asArray<unknown>(props.rows).map((entry) => {
      const r = (entry ?? {}) as { label?: unknown; values?: unknown; hint?: unknown; group?: unknown };
      return {
        label: asString(r.label),
        values: asArray<unknown>(r.values),
        hint: asString(r.hint),
        group: asString(r.group),
      };
    });
    const highlightIdx = Math.floor(asNumber(props.highlightColumn, -1));
    const stickyFirst = asBoolean(props.stickyFirstColumn);
    const root = el("div", {
      class: "rui-comparison-table",
      "data-sticky-first": stickyFirst ? "true" : null,
    });
    // The stylesheet clips this box (`overflow: hidden`) and only restores
    // horizontal scrolling under 640px, so a wide table lost its rightmost
    // columns on desktop with no way to reach them.
    root.style.overflowX = "auto";
    const table = el("table");
    const caption = asString(props.caption);
    if (caption) table.append(el("caption", { class: "rui-comparison-table-caption" }, [caption]));
    const thead = el("thead");
    const headRow = el("tr");
    const featureTh = el("th", {
      scope: "col",
      class: "rui-comparison-table-feature",
    }, [asString(props.featureLabel, "Feature")]);
    if (stickyFirst) featureTh.setAttribute("style", `${CMP_STICKY_CELL};z-index:2`);
    headRow.append(featureTh);
    columns.forEach((col, c) => {
      headRow.append(el("th", {
        scope: "col",
        "data-highlight": c === highlightIdx ? "true" : null,
      }, [col]));
    });
    thead.append(headRow);
    table.append(thead);

    // Group rows by first appearance so a group that arrives in two chunks
    // (easy when merging two data sources) renders as ONE section instead of
    // repeating its header and splitting the group in half.
    const buckets = new Map<string, typeof rows>();
    for (const row of rows) {
      const bucket = buckets.get(row.group);
      if (bucket) bucket.push(row);
      else buckets.set(row.group, [row]);
    }
    const ordered = Array.from(buckets.values()).flat();

    const tbody = el("tbody");
    let currentGroup = "";
    for (const row of ordered) {
      if (row.group && row.group !== currentGroup) {
        currentGroup = row.group;
        const groupRow = el("tr", { class: "rui-comparison-table-group" });
        groupRow.append(el("td", { colspan: String(columns.length + 1) }, [row.group]));
        tbody.append(groupRow);
      }
      const tr = el("tr");
      const labelCell = el("td", { class: "rui-comparison-table-feature" });
      if (stickyFirst) labelCell.setAttribute("style", CMP_STICKY_CELL);
      labelCell.append(el("div", { class: "rui-comparison-table-feature-label" }, [row.label]));
      if (row.hint) labelCell.append(el("div", { class: "rui-comparison-table-feature-hint" }, [row.hint]));
      tr.append(labelCell);
      for (let c = 0; c < columns.length; c += 1) {
        const value = row.values[c];
        const td = el("td", { "data-highlight": c === highlightIdx ? "true" : null });
        if (value === true) {
          // The ✓/— glyph pair, not an icon with a dead text fallback:
          // `renderIcon` never returns null for a constant name, so the old
          // fallback could not run — and if the registry ever failed to
          // resolve `circle-check` the cell would have read "circle-check".
          td.append(el("span", { class: "rui-comparison-yes" }, ["✓"]));
        } else if (value === false || value === null || value === undefined) {
          td.append(el("span", { class: "rui-comparison-no" }, ["—"]));
        } else if (isComponentNode(value)) {
          // Both `Component` and `UserComponent` — a cell built from the
          // author's own `function Cell(p) { … }` used to print
          // "[object Object]".
          td.append(helpers.renderNode(value));
        } else {
          td.textContent = asString(value);
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    root.append(table);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * InfiniteList — scroll-to-load list
 * ----------------------------------------------------------------------- */

/** What the live sentinel observer is currently watching. */
interface SentinelWatch {
  node: HTMLElement | null;
  observer: IntersectionObserver | null;
  /** `rootMargin|threshold` — a change means the observer must be rebuilt. */
  key: string;
}

export const InfiniteList: ComponentSpec = {
  name: "InfiniteList",
  description:
    "Vertical list that fires `onLoadMore` when the user scrolls near the " +
    "bottom. Pass already-rendered child nodes as `items`; wire `onLoadMore` " +
    "to an `action` that awaits a `$mutation` or `$query` (e.g. " +
    "`await loadMore.invoke()`) and appends to the bound state. Use " +
    "`loading=true` to show the spinner row, `hasMore=false` to suppress " +
    "further loads, and `error` + `onRetry` when a page fails.",
  props: [
    { name: "items", type: "Node[]", description: "Already-rendered child nodes" },
    { name: "onLoadMore", type: "callable", optional: true, description: "Callable fired when the sentinel scrolls into view" },
    { name: "loading", type: "boolean", optional: true },
    { name: "hasMore", type: "boolean", optional: true, description: "Default true — set false to hide the sentinel" },
    { name: "loaderLabel", type: "string", optional: true, description: "Label rendered while loading (default `Loading…`)" },
    { name: "error", type: "string", optional: true, description: "Failure message shown instead of the loader, with a Retry button" },
    { name: "onRetry", type: "callable", optional: true, description: "Callable fired by the Retry button (defaults to `onLoadMore`)" },
    { name: "emptyLabel", type: "string", optional: true, description: "Message shown when there are no items (default `No results`)" },
    { name: "rootMargin", type: "string", optional: true, description: "Prefetch distance for the scroll sentinel (default `200px`)" },
    { name: "threshold", type: "number", optional: true, description: "Fraction of the sentinel that must be visible, 0–1 (default 0)" },
    { name: "retryLabel", type: "string", optional: true, description: "Label for the retry button (default `Retry`)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-infinite-list" });
    const list = el("div", { class: "rui-infinite-list-body" });
    const items = asArray(props.items);
    for (const child of items) list.append(helpers.renderNode(child));
    root.append(list);
    const hasMore = props.hasMore === undefined ? true : asBoolean(props.hasMore);
    const loading = asBoolean(props.loading);
    const errorText = asString(props.error);
    const loaderLabel = asString(props.loaderLabel, "Loading…");
    const canLoad = typeof props.onLoadMore === "function";

    if (items.length === 0 && !loading && !errorText) {
      root.append(el("div", { class: "rui-infinite-list-empty" }, [asString(props.emptyLabel, "No results")]));
    }

    const rootMargin = sanitiseCssLength(props.rootMargin, "200px");
    const threshold = Math.min(1, Math.max(0, asNumber(props.threshold, 0)));
    const watchSlot = helpers.useInstanceState<SentinelWatch>("sentinel-watch", {
      node: null, observer: null, key: "",
    });

    if (hasMore || loading || errorText) {
      // `role="status"` on the sentinel: it is the only thing that says a page
      // is loading, that a page failed, or that new items arrived.
      const sentinel = el("div", {
        class: "rui-infinite-list-sentinel",
        role: "status",
        "aria-live": "polite",
        "aria-busy": loading ? "true" : null,
      });
      if (errorText) {
        sentinel.append(el("span", { class: "rui-infinite-list-error" }, [errorText]));
        if (typeof props.onRetry === "function" || canLoad) {
          const retry = el("button", {
            type: "button",
            class: "rui-infinite-list-load-more",
          }, [asString(props.retryLabel, "Retry")]);
          retry.onclick = () => helpers.invoke(props.onRetry ?? props.onLoadMore);
          sentinel.append(retry);
        }
      } else if (canLoad) {
        // The button stays mounted (and merely disabled) while loading. The
        // old code replaced it with the spinner, so a keyboard user who
        // pressed Enter lost focus to <body> mid-load.
        const btn = el("button", {
          type: "button",
          class: "rui-infinite-list-load-more",
          disabled: loading ? "" : null,
          "aria-disabled": loading ? "true" : null,
        });
        if (loading) {
          const spin = renderIcon("spinner", { className: "rui-infinite-list-spin" });
          if (spin) btn.append(spin);
        }
        btn.append(el("span", {}, [loading ? loaderLabel : "Load more"]));
        btn.onclick = () => { if (!loading) helpers.invoke(props.onLoadMore); };
        sentinel.append(btn);
      } else if (loading) {
        const spin = renderIcon("spinner", { className: "rui-infinite-list-spin" });
        if (spin) sentinel.append(spin);
        sentinel.append(el("span", {}, [loaderLabel]));
      }
      root.append(sentinel);

      const wantObserver = hasMore && !loading && !errorText && canLoad
        && typeof IntersectionObserver !== "undefined";
      const callback = props.onLoadMore;
      const key = `${rootMargin}|${threshold}`;
      // Observing `sentinel` directly is the bug this defers around: morph
      // keeps the LIVE sentinel and discards this one, so the observer would
      // watch a detached node — while the keyed disposer tore down the
      // observer that was still watching the live one. Resolve the mounted
      // node after paint and keep it in instance state, so every later render
      // re-finds it instead of losing the feature after the first load.
      deferToPaint(() => {
        const watch = watchSlot.get();
        const live = sentinel.isConnected
          ? sentinel
          : (watch.node?.isConnected ? watch.node : null);
        if (!live) {
          if (watch.observer) {
            watch.observer.disconnect();
            watchSlot.set({ node: null, observer: null, key: "" });
          }
          return;
        }
        if (!wantObserver) {
          // Stop watching while a page is in flight or at the end of the
          // data, but remember the node so the next render can re-observe it.
          watch.observer?.disconnect();
          watchSlot.set({ node: live, observer: null, key: "" });
          return;
        }
        if (watch.observer && watch.node === live && watch.key === key) return;
        watch.observer?.disconnect();
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              helpers.invoke(callback);
              break;
            }
          }
        }, { rootMargin, threshold });
        observer.observe(live);
        watchSlot.set({ node: live, observer, key });
        helpers.registerDisposer(() => observer.disconnect(), "infinite-observer");
      });
    }
    return root;
  },
};
