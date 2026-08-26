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
  autoId,
  el, asArray, asColumnNodes, asString, asBoolean, asNumber, renderIcon, fillTableCell,
  isComponentNode, sanitiseCssLength, sanitiseHref, sanitiseImageSrc, valueAttr,
} from "../utils.js";
import { closeFloating, deferToPaint, isFloating, openFloating, updateFloating } from "../floating.js";
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
  return asColumnNodes<{ args?: unknown[] }>(raw).map((node, idx) => {
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
  config.order = normalizeOrder(config.order, config.pinned);
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
  config.order = normalizeOrder(config.order, config.pinned);
  return config;
}

/**
 * Hoist every pinned key above every unpinned one, preserving the relative order
 * within each group.
 *
 * `order` is the single source of truth for BOTH the table's column sequence and
 * the settings panel's row sequence, so "pinned columns come first" has to be a
 * property of the list itself rather than something each reader re-derives. That
 * makes pin/unpin a MOVE: a stable partition drops a newly pinned key at the
 * bottom of the pinned group (it was already below all of them) and a newly
 * unpinned key at the top of the unpinned group, which is exactly where the user
 * watches the row travel to.
 *
 * `effectiveCols` used to promise "pinned first" in its doc comment and simply
 * not do it — it filtered `order` and nothing more — so pinning a column stuck it
 * to the viewport edge without moving it, and a pinned column could sit visually
 * to the right of an unpinned one.
 */
function normalizeOrder(order: string[], pinned: Set<string>): string[] {
  const head: string[] = [];
  const tail: string[] = [];
  for (const key of order) (pinned.has(key) ? head : tail).push(key);
  return [...head, ...tail];
}

/**
 * Fold the CURRENT column set back into a stored configuration.
 *
 * `initColumnConfig` runs once per instance (it is the `useInstanceState`
 * seed), so a grid whose `columns` array grows later — a new `Col` appended by
 * the author, a column that only exists once data arrives — kept an `order`
 * that never mentioned the new key, and `effectiveCols` drops any key it does
 * not find in `order`: the column silently never rendered. Unknown keys are
 * appended (author order), keys that no longer exist are forgotten so a stale
 * `localStorage` payload cannot keep resurrecting them.
 */
function reconcileColumnConfig(cols: ColDef[], config: ColumnConfig): ColumnConfig {
  const keys = cols.map((c) => c.key);
  const known = new Set(keys);
  const kept = config.order.filter((k) => known.has(k));
  const added = keys.filter((k) => !kept.includes(k));
  if (added.length === 0 && kept.length === config.order.length) return config;
  const prune = (set: Set<string>): Set<string> => new Set([...set].filter((k) => known.has(k)));
  const widths: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.widths)) { if (known.has(k)) widths[k] = v; }
  for (const c of cols) { if (!(c.key in widths) && c.width) widths[c.key] = c.width; }
  const nextPinned = prune(config.pinned);
  return {
    order: normalizeOrder([...kept, ...added], nextPinned),
    hidden: prune(config.hidden),
    pinned: nextPinned,
    widths,
  };
}

/**
 * The display-order list of visible columns.
 *
 * Pinned columns lead because `order` itself is kept partitioned — see
 * `normalizeOrder`. Nothing here re-sorts.
 */
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
 * Column geometry
 * ----------------------------------------------------------------------- */

/** Must match `.rui-data-grid-cell-select` / `-cell-rownum` in the stylesheet. */
const LEAD_SELECT_WIDTH = 36;
const LEAD_ROWNUM_WIDTH = 42;

/**
 * Sticky-offset keys for the two leading cells. The `@@` prefix keeps them clear
 * of a column key, which is an author-supplied header string.
 */
const LEAD_SELECT_KEY = "@@select";
const LEAD_ROWNUM_KEY = "@@rownum";

/**
 * Escape a value for use inside an `[attr="…"]` selector.
 *
 * Column keys are author strings (a `Col`'s header), so a header carrying a
 * quote or a backslash — `Size ("GB")` — produced an invalid selector and threw
 * on every resize / repaint that looked a column up by key.
 */
function attrSelectorValue(raw: string): string {
  const escaper = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
  if (typeof escaper === "function") return escaper(raw);
  return raw.replace(/["\\]/g, "\\$&");
}

/**
 * State the grid derives from the LIVE DOM rather than from props: whether the
 * scroll port overflows horizontally, which edge it is parked at, and how tall
 * the header band is.
 *
 * It has to round-trip through `useInstanceState` instead of living only as
 * attributes on the node, because the morph reconciler strips any attribute the
 * freshly-rendered tree does not also carry — an imperative
 * `setAttribute("data-overflow-x")` would survive exactly until the next
 * unrelated re-render, at which point the scroll arrows would vanish until the
 * user happened to scroll again.
 */
interface ScrollHintState {
  overflows: boolean;
  atStart: boolean;
  atEnd: boolean;
  /** Height of the header's label row, in px (0 = not measured yet). */
  headHeight: number;
}

const INITIAL_HINT: ScrollHintState = { overflows: false, atStart: true, atEnd: true, headHeight: 0 };

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
    "Set `columnMenu=true` to let the user hide, reorder, and pin columns — the " +
    "button is pinned to the top-right of the header and stays put while the " +
    "grid scrolls sideways, without taking a column of its own. Pinning MOVES a " +
    "column to the front of the table and above a divider in the panel; drag and " +
    "arrow-key reordering both stay inside their own group, so the only way " +
    "across that divider is the pin. The last visible column cannot be hidden. " +
    "To drive the panel from your own toolbar, bind `columnMenuOpen` (with " +
    "`onColumnMenuOpenChange`), point `columnMenuAnchor` at your button and set " +
    "`columnMenuButton: false` — the panel keeps working, it just loses the " +
    "in-header icon. `columnMenuTitle` / `columnMenuDescription` / " +
    "`columnMenuResetLabel` take translated strings. " +
    "Set `resizable=true` to let the user drag column borders to resize; the " +
    "first drag pins the columns at the widths they are already rendered at and " +
    "switches to a fixed layout, so a narrowed column truncates instead of " +
    "pushing its neighbours around. " +
    "`scrollArrows=false` turns off the small chevrons that appear in the " +
    "header band when there are columns to scroll to. " +
    "Pass `persistKey` to save the user's column layout to localStorage — give " +
    "each grid its own key, and prefix it per app when several apps share an " +
    "origin; the key is mirrored onto the grid as `data-persist-key`. " +
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
    // Slots 26–34: advanced column management features. All optional.
    // APPEND-ONLY: positional args are resolved by index, so a new prop goes at
    // the END of this list — inserting one silently re-points every prop after it.
    { name: "persistKey", type: "string", optional: true, description: "localStorage key — when set, column widths, order, visibility, and pinning survive page refreshes. Each table needs its own key, prefixed per app where several apps share an origin: two grids on one key fight over a single saved layout. Mirrored onto the grid element as `data-persist-key` so the slot is visible in DevTools." },
    { name: "resizable", type: "boolean", optional: true, description: "Let the user drag column header borders to resize columns. Double-click a handle (or press Home on it) to auto-fit. The first drag switches the table to a fixed layout so resized cells truncate instead of overflowing." },
    { name: "columnMenu", type: "boolean", optional: true, description: "Show a column settings button for hiding, reordering, and pinning columns. Overlays the top-right of the header instead of occupying a column, so cell widths are unaffected." },
    { name: "globalSearch", type: "string", optional: true, description: "Global search term that filters across all columns — bind a $variable for two-way control." },
    { name: "onGlobalSearch", type: "callable", optional: true, description: "Callable fired with the search term when the global search input changes." },
    { name: "wrapCells", type: "boolean", optional: true, description: "Default cell content wrapping. `false` = single line with ellipsis and hover tooltip; `true` = allow wrapping. Per-column `Col(wrap:)` overrides." },
    { name: "rowNumbers", type: "boolean", optional: true, description: "Show a leading row-number column." },
    { name: "highlightOnHover", type: "boolean", optional: true, description: "Highlight rows on mouse hover (default true)." },
    { name: "scrollArrows", type: "boolean", optional: true, description: "Show small chevron buttons in the header band while there are columns hidden to the left / right (default true). They sit in the header, never over a data cell." },
    { name: "columnMenuOpen", type: "boolean", optional: true, description: "Open state of the column-settings panel — bind a `$variable` for two-way control, so an external button can open it. Leave unset to let the built-in trigger own the state." },
    { name: "onColumnMenuOpenChange", type: "callable", optional: true, aliases: ["oncolumnmenuopenchange"], description: "Called with the new boolean whenever the column-settings panel opens or closes — including via Escape, the × button, or an outside click." },
    { name: "columnMenuButton", type: "boolean", optional: true, description: "Render the built-in column-settings trigger in the header (default true). Set `false` when an external control opens the panel, which keeps the panel and its configuration without the in-header icon." },
    { name: "columnMenuAnchor", type: "string", optional: true, description: "CSS selector for the element the panel should hang off, e.g. `\"#table-settings\"`. Defaults to the built-in trigger; required when `columnMenuButton` is `false`, or the panel has nothing to anchor to." },
    { name: "columnMenuTitle", type: "string", optional: true, description: "Heading of the column-settings panel (default \"Table settings\"). Pass a translated string in a localised app." },
    { name: "columnMenuDescription", type: "string", optional: true, description: "Sub-heading under the panel title (default \"Manage column visibility and order\"). Pass `\"\"` to drop the line." },
    { name: "columnMenuResetLabel", type: "string", optional: true, description: "Label of the panel's reset action (default \"Reset to default\")." },
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
    const scrollArrows = props.scrollArrows === undefined ? true : asBoolean(props.scrollArrows);
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
    /** Last-known column panel node — it may have been reparented (see findLive). */
    const livePanelSlot = helpers.useInstanceState<HTMLElement | null>("livePanel", null);
    /**
     * Widths the grid measured for itself, kept apart from `config.widths` (which
     * is the author's `Col(width:)` plus anything the user dragged, and the only
     * half that persists). Fixed table layout needs a number for every column;
     * these are the numbers the browser itself came up with on the first paint,
     * so switching layout modes is invisible.
     */
    const autoWidthSlot = helpers.useInstanceState<Record<string, string>>("autoWidths", {});
    const hintSlot = helpers.useInstanceState<ScrollHintState>("scrollHint", INITIAL_HINT);
    /** Measured `left` per sticky column, keyed by column key (see LEAD_*_KEY). */
    const stickyLeftSlot = helpers.useInstanceState<Record<string, number>>("stickyLeft", {});
    /** The mounted viewport + its ResizeObserver — only reachable after paint. */
    const liveViewSlot = helpers.useInstanceState<HTMLElement | null>("liveViewport", null);
    const observerSlot = helpers.useInstanceState<{ ro: ResizeObserver; node: HTMLElement } | null>("resizeObserver", null);

    const getColConfig = (): ColumnConfig => {
      const stored = colConfigSlot.get();
      const merged = reconcileColumnConfig(allCols, stored);
      // A write here is safe mid-render: `useInstanceState.set` never schedules
      // a render, it only updates the cell the next read sees.
      if (merged !== stored) colConfigSlot.set(merged);
      return merged;
    };
    const updateColConfig = (patch: Partial<ColumnConfig>): void => {
      const current = getColConfig();
      const next = { ...current, ...patch };
      // Re-partitioned centrally rather than at each call site: pin, unpin and
      // reorder all funnel through here, and every one of them can break the
      // "pinned keys lead" invariant that `order` carries for both the table and
      // the settings panel.
      next.order = normalizeOrder(next.order, next.pinned);
      colConfigSlot.set(next);
      if (persistKey) persistConfig(persistKey, configToStorage(next));
    };

    /** Visible columns in display order. */
    const cols = effectiveCols(allCols, getColConfig());

    const isColResizable = (col: ColDef): boolean =>
      col.resizable === undefined ? gridResizable : col.resizable;
    /**
     * Any resizable column puts the whole table into fixed layout.
     *
     * This is the difference between a resize that works and one that only looks
     * like it does. Under the default `table-layout: auto` a column's used width
     * is never smaller than its content's min-content width, so dragging a
     * border inwards left the column where it was, pushed the inline
     * `width`/`max-width` past the content, and the content spilled across the
     * neighbouring cell. Fixed layout makes the declared width authoritative and
     * the overflow clip (below) turns the excess into an ellipsis.
     */
    const fixedLayout = allCols.some(isColResizable);

    /** The width this column should render at, or `""` for "let the browser pick". */
    const widthFor = (col: ColDef, config: ColumnConfig): string =>
      config.widths[col.key] || autoWidthSlot.get()[col.key] || "";

    /**
     * Fixed layout is only safe once every visible column has a number; until
     * then the browser would share the table evenly between them, which is not
     * what any of these grids look like. So the first paint runs in auto layout,
     * `measureColumns` records what the browser chose, and the render after that
     * flips the flag — the two look identical.
     */
    const layoutMeasured = fixedLayout && cols.length > 0
      && cols.every((c) => widthFor(c, getColConfig()) !== "");

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
      "data-resizable": fixedLayout ? "true" : null,
      // Emitted from state, never only imperatively: morph strips attributes the
      // fresh tree omits (see ScrollHintState).
      "data-fixed-layout": layoutMeasured ? "true" : null,
      "data-col-menu": columnMenuEnabled ? "true" : null,
      // Which localStorage slot this grid's column layout is saved under, mirrored
      // so it is inspectable: two grids that share a key silently fight over one
      // layout, and without this the key is invisible in the DOM and in DevTools.
      "data-persist-key": persistKey || null,
    });

    /**
     * The grid this event came from. Falls back to the last-mounted viewport
     * before the render-time `wrapper`, which after the first render is a
     * detached copy the reconciler threw away — a handler that resolved to it
     * would repaint nothing.
     *
     * The resolved root is REMEMBERED, and that is what makes the column panel
     * work. The panel is promoted into the top layer while open, and where the
     * `popover` API is missing the floating layer falls back to REPARENTING it
     * out of the grid (Safari < 17, Firefox < 125, and every DOM implementation
     * used by a test runner). Its checkboxes, pin buttons and drag handlers then
     * hand `repaint` an origin whose `closest(".rui-data-grid")` is null, and
     * with `liveViewSlot` not yet filled the chain ended at the detached
     * `wrapper` — so hiding, pinning or reordering a column wrote the new config
     * and repainted nothing, silently, with the table unchanged in front of the
     * user. The button that opens the panel IS inside the grid, so by the time
     * the panel can be clicked the root has already been recorded.
     */
    const liveRootSlot = helpers.useInstanceState<Element | null>("liveRoot", null);
    const liveScope = (origin: Element | null | undefined): Element => {
      const found = origin?.closest(".rui-data-grid")
        ?? liveViewSlot.get()?.closest(".rui-data-grid");
      if (found?.isConnected) {
        liveRootSlot.set(found);
        return found;
      }

      const remembered = liveRootSlot.get();
      return remembered?.isConnected ? remembered : wrapper;
    };

    const bodyOf = (scope: Element): HTMLElement | null =>
      scope.querySelector<HTMLElement>(".rui-data-grid-table > tbody");

    /**
     * Inline style for a cell that may be pinned. The `left` comes from the last
     * measurement (see `syncStickyOffsets`) so a re-render paints the pinned
     * block in the right place immediately, rather than snapping into position a
     * frame later.
     */
    const stickyStyle = (key: string, pinned: boolean): string | null => {
      if (!pinned) return null;
      const left = stickyLeftSlot.get()[key];
      return left === undefined ? "position:sticky" : `position:sticky;left:${Math.round(left)}px`;
    };

    /* ---- builders (one per region, shared by render + live repaint) ---- */

    /**
     * The `<col>` element for a key, in the live table.
     *
     * A width lives in exactly one place — the column element — so a resize can
     * neither leave the header and the body disagreeing nor forget the filter
     * row (which the previous per-`td` write did: it only touched `tbody`, so
     * every filter box stayed at its old width and the whole row skewed).
     */
    const liveColEl = (scope: Element, key: string): HTMLElement | null =>
      scope.querySelector<HTMLElement>(
        `.rui-data-grid-table > colgroup > col[data-col-key="${attrSelectorValue(key)}"]`,
      );

    const buildColGroup = (visCols: ColDef[], config: ColumnConfig): HTMLElement => {
      const group = el("colgroup");
      if (selectable) {
        group.append(el("col", { class: "rui-data-grid-col-lead", style: `width:${LEAD_SELECT_WIDTH}px` }));
      }
      if (showRowNumbers) {
        group.append(el("col", { class: "rui-data-grid-col-lead", style: `width:${LEAD_ROWNUM_WIDTH}px` }));
      }
      for (const col of visCols) {
        const w = widthFor(col, config);
        group.append(el("col", { "data-col-key": col.key, style: w ? `width:${w}` : null }));
      }
      // Slack absorber. Under fixed layout a table asked to fill 100% shares any
      // leftover space out over ALL columns proportionally — so dragging one
      // border would quietly widen every other column, and the column you were
      // dragging would not end up at the width you dropped it at. A final
      // width-less column takes the leftover instead, and collapses to zero the
      // moment the columns are wide enough to need scrolling.
      if (fixedLayout) group.append(el("col", { class: "rui-data-grid-col-filler" }));
      return group;
    };

    /**
     * `<td>`/`<th>` counterpart of the filler `<col>`.
     *
     * `role="presentation"` as well as `aria-hidden`: this cell exists purely to
     * give the layout somewhere to put its leftover pixels, so it must not be
     * reported as a seventh column to a screen reader — nor to a test that counts
     * the columns.
     */
    const fillerCell = (tag: "th" | "td"): HTMLElement =>
      el(tag, { class: "rui-data-grid-filler", "aria-hidden": "true", role: "presentation" });

    /**
     * One edge chevron. Deliberately small and parked in the header band: the
     * brief was an indicator that does not sit on top of the data, and the header
     * is the one row of the table whose content is a short label with padding
     * either side of it.
     */
    const buildScrollArrow = (side: "left" | "right"): HTMLElement => {
      const btn = el("button", {
        type: "button",
        class: `rui-data-grid-scroll-arrow rui-data-grid-scroll-arrow-${side}`,
        "aria-label": side === "left" ? "Scroll columns left" : "Scroll columns right",
        // Redundant with the (focusable, arrow-key scrollable) scroll port, so
        // it stays out of the tab order and out of the accessibility tree.
        "aria-hidden": "true",
        tabindex: "-1",
      });
      const icon = renderIcon(side === "left" ? "chevron-left" : "chevron-right", {
        className: "rui-data-grid-scroll-arrow-icon",
      });
      if (icon) btn.append(icon); else btn.textContent = side === "left" ? "‹" : "›";
      btn.onclick = (event) => {
        event.stopPropagation();
        const view = (event.currentTarget as Element).closest(".rui-data-grid-viewport");
        const scroller = view?.querySelector<HTMLElement>(".rui-data-grid-scroll");
        if (!scroller) return;
        // Most of a screenful, so a click always reveals something new but never
        // skips a column whole.
        const step = Math.max(120, Math.round(scroller.clientWidth * 0.75));
        scroller.scrollBy({ left: side === "left" ? -step : step, behavior: "smooth" });
      };
      return btn;
    };

    const commitWidth = (key: string, px: string): void => {
      const cfg = getColConfig();
      updateColConfig({ widths: { ...cfg.widths, [key]: px } });
    };

    const buildColTh = (col: ColDef, colIdx: number, config: ColumnConfig, isLast: boolean): HTMLElement => {
      const isPinned = config.pinned.has(col.key);
      const th = el("th", {
        scope: "col",
        "data-col-key": col.key,
        "data-align": col.align || null,
        "data-sortable": col.sortable ? "true" : null,
        "data-first": colIdx === 0 ? "true" : null,
        "data-last": isLast ? "true" : null,
        "data-wrap": col.wrap,
        "data-pinned": isPinned ? "true" : null,
        title: col.headerTooltip || null,
        style: stickyStyle(col.key, isPinned),
      });
      if (col.sortable) {
        const btn = el("button", { type: "button", class: "rui-data-grid-sort" });
        btn.append(el("span", {}, [col.header]));
        btn.onclick = (event) => writeSort(col.key, event.currentTarget as Element);
        th.append(btn);
      } else {
        th.append(document.createTextNode(col.header));
      }
      if (isColResizable(col)) {
        const colKey = col.key;
        const minW = parsePx(col.minWidth) || 50;
        const maxW = parsePx(col.maxWidth) || 2000;
        const handle = el("div", {
          class: "rui-data-grid-resize-handle",
          "data-resize-col": colKey,
          role: "separator",
          "aria-orientation": "vertical",
          "aria-label": `Resize ${col.header}`,
          tabindex: "0",
        });

        /**
         * Column width from the live header cell — the only trustworthy source.
         * Pins every column at its rendered width first, so the drag starts from
         * a layout where a declared width is actually authoritative.
         */
        const currentWidth = (handleEl: Element): number => {
          freezeColumnWidths(liveScope(handleEl));
          const liveTh = handleEl.parentElement as HTMLElement | null;
          return liveTh ? liveTh.getBoundingClientRect().width : minW;
        };
        const setWidth = (handleEl: Element, next: number): string => {
          const px = `${Math.round(Math.max(minW, Math.min(maxW, next)))}px`;
          const colEl = liveColEl(liveScope(handleEl), colKey);
          if (colEl) colEl.style.width = px;
          return px;
        };
        /**
         * Widest rendered content in the column. `scrollWidth` on a clipped cell
         * reports the FULL content box, which is exactly what auto-fit wants —
         * and why the cells have to be `overflow: hidden` for this to work.
         */
        const autoFitWidth = (handleEl: Element): number => {
          const scope = liveScope(handleEl);
          freezeColumnWidths(scope);
          const liveTh = handleEl.parentElement as HTMLElement | null;
          let widest = liveTh ? liveTh.scrollWidth : 0;
          scope.querySelectorAll<HTMLElement>(
            `.rui-data-grid-table > tbody > tr > td[data-col-key="${attrSelectorValue(colKey)}"]`,
          ).forEach((td) => { widest = Math.max(widest, td.scrollWidth); });
          return widest + 2;
        };

        // Pointer events rather than mouse events, so the same code drives a touch
        // drag. The move/up pair goes on the DOCUMENT, not on the handle: the
        // pointer leaves a 12px handle immediately, and `setPointerCapture` is a
        // best-effort optimisation that can refuse (a synthetic pointer, a
        // pointerId that is no longer active) — with the listeners on the handle
        // alone, a drag that lost the capture silently stopped tracking.
        handle.onpointerdown = (event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const liveHandle = event.currentTarget as HTMLElement;
          const startX = event.clientX;
          const startW = currentWidth(liveHandle);
          const pointerId = event.pointerId;
          liveHandle.classList.add("rui-data-grid-resize-active");
          try { liveHandle.setPointerCapture(pointerId); } catch { /* not capturable */ }
          let last = `${Math.round(startW)}px`;
          const onMove = (ev: PointerEvent): void => {
            last = setWidth(liveHandle, startW + (ev.clientX - startX));
          };
          const onUp = (): void => {
            liveHandle.classList.remove("rui-data-grid-resize-active");
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            try { liveHandle.releasePointerCapture(pointerId); } catch { /* already released */ }
            commitWidth(colKey, last);
          };
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
          document.addEventListener("pointercancel", onUp);
        };

        handle.ondblclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const liveHandle = event.currentTarget as HTMLElement;
          commitWidth(colKey, setWidth(liveHandle, autoFitWidth(liveHandle)));
        };

        // Resizing has to be reachable without a pointer (WCAG 2.1.1).
        handle.onkeydown = (event) => {
          const liveHandle = event.currentTarget as HTMLElement;
          const step = event.shiftKey ? 48 : 12;
          if (event.key === "ArrowLeft") {
            commitWidth(colKey, setWidth(liveHandle, currentWidth(liveHandle) - step));
          } else if (event.key === "ArrowRight") {
            commitWidth(colKey, setWidth(liveHandle, currentWidth(liveHandle) + step));
          } else if (event.key === "Home" || event.key === "Enter") {
            commitWidth(colKey, setWidth(liveHandle, autoFitWidth(liveHandle)));
          } else {
            return;
          }
          event.preventDefault();
        };

        th.append(handle);
      }
      return th;
    };

    const buildFilterTd = (col: ColDef, filters: Record<string, string>, isPinned: boolean): HTMLElement => {
      const td = el("td", {
        "data-col-key": col.key,
        "data-pinned": isPinned ? "true" : null,
        style: stickyStyle(col.key, isPinned),
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

    /**
     * Everything about the header that a repaint could have to rebuild: which
     * columns are shown, in what order, pinned or not, and how wide.
     */
    const columnSignature = (config: ColumnConfig, visCols: ColDef[]): string => [
      config.order.join(""),
      [...config.hidden].sort().join(""),
      [...config.pinned].sort().join(""),
      visCols.map((c) => `${c.key}=${widthFor(c, config)}`).join(""),
    ].join("");

    /**
     * Rebuild the header + filter rows, but ONLY when the column layout actually
     * changed.
     *
     * This guard is load-bearing, not an optimisation. `repaint` runs on every
     * filter keystroke, and an unconditional rebuild destroyed and recreated the
     * very `<input>` the user was typing into — so the caret jumped out after the
     * first character and the filter was unusable. The signature is stored on the
     * node (and re-emitted by the next render from the same state), so a keystroke
     * finds it unchanged and leaves the live inputs alone.
     */
    const syncColumns = (scope: Element): void => {
      const config = getColConfig();
      const visCols = effectiveCols(allCols, config);
      const signature = columnSignature(config, visCols);
      if (scope.getAttribute("data-col-sig") === signature) return;
      scope.setAttribute("data-col-sig", signature);

      const table = scope.querySelector<HTMLElement>(".rui-data-grid-table");
      const group = table?.querySelector<HTMLElement>(":scope > colgroup");
      if (table && group) group.replaceWith(buildColGroup(visCols, config));

      const headRow = scope.querySelector<HTMLElement>(".rui-data-grid-table > thead > tr:first-child");
      if (headRow) {
        headRow.querySelectorAll("th[data-col-key]").forEach((n) => n.remove());
        const filler = headRow.querySelector(".rui-data-grid-filler");
        visCols.forEach((col, c) => {
          headRow.insertBefore(buildColTh(col, c, config, c === visCols.length - 1), filler);
        });
      }

      const filterRow = scope.querySelector<HTMLElement>(".rui-data-grid-filter-row");
      if (filterRow) {
        filterRow.querySelectorAll("td[data-col-key]").forEach((n) => n.remove());
        const filler = filterRow.querySelector(".rui-data-grid-filler");
        const filters = filterSlot.get();
        for (const col of visCols) {
          filterRow.insertBefore(buildFilterTd(col, filters, config.pinned.has(col.key)), filler);
        }
      }
    };

    /**
     * Re-measure the `left` offset of every sticky (pinned) cell from the live
     * header and store it, so the next render can emit it inline.
     *
     * The offsets used to be summed from the DECLARED widths with a flat 150px
     * guess for any column that had none, so two pinned columns overlapped
     * unless the author happened to declare widths — and the leading
     * checkbox / row-number cells were left out of the sum entirely, so a pinned
     * column slid in underneath them. Position within a row is identical for the
     * header, the filter row and every body row, so one measured plan drives all
     * three.
     */
    const syncStickyOffsets = (scope: Element): void => {
      const config = getColConfig();
      if (config.pinned.size === 0) return;
      const headRow = scope.querySelector<HTMLElement>(".rui-data-grid-table > thead > tr:first-child");
      if (!headRow) return;
      const leadCount = (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0);
      const next: Record<string, number> = {};
      const plan: Array<number | null> = [];
      let offset = 0;
      (Array.from(headRow.children) as HTMLElement[]).forEach((cell, index) => {
        // Leading checkbox / row-number cells travel with the pinned block, or
        // the first pinned column scrolls in over the top of them.
        const isLead = index < leadCount;
        const key = isLead
          ? (index === 0 && selectable ? LEAD_SELECT_KEY : LEAD_ROWNUM_KEY)
          : cell.getAttribute("data-col-key");
        if (!key || !(isLead || cell.getAttribute("data-pinned") === "true")) {
          plan.push(null);
          return;
        }
        next[key] = offset;
        plan.push(offset);
        offset += cell.getBoundingClientRect().width;
      });
      stickyLeftSlot.set(next);
      const apply = (row: Element): void => {
        const rowCells = Array.from(row.children) as HTMLElement[];
        plan.forEach((left, index) => {
          const cell = rowCells[index];
          if (!cell) return;
          if (left === null) {
            cell.style.removeProperty("left");
            return;
          }
          cell.style.position = "sticky";
          cell.style.left = `${Math.round(left)}px`;
        });
      };
      scope.querySelectorAll(".rui-data-grid-table > thead > tr").forEach(apply);
      scope.querySelectorAll(".rui-data-grid-table > tbody > tr").forEach(apply);
    };

    const buildRows = (target: HTMLElement, m: GridModel): void => {
      target.replaceChildren();
      const config = getColConfig();
      const visCols = effectiveCols(allCols, config);
      const leadCols = (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0);
      const span = leadCols + Math.max(visCols.length, 1) + (fixedLayout ? 1 : 0);
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
        const leadPinned = config.pinned.size > 0;
        if (selectable) {
          const cellTd = el("td", {
            class: "rui-data-grid-cell-select",
            "data-pinned": leadPinned ? "true" : null,
            style: stickyStyle(LEAD_SELECT_KEY, leadPinned),
          });
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
          const numTd = el("td", {
            class: "rui-data-grid-cell-rownum",
            "data-pinned": leadPinned ? "true" : null,
            style: stickyStyle(LEAD_ROWNUM_KEY, leadPinned),
          });
          numTd.textContent = String((m.page - 1) * m.perPage + vi + 1);
          tr.append(numTd);
        }
        const rowObj: Record<string, unknown> = {};
        for (const cc of allCols) rowObj[cc.key] = cc.values[r];

        visCols.forEach((col, c) => {
          const isPinned = config.pinned.has(col.key);
          const cellWrap = col.wrap ?? wrapCellsDefault;
          const td = el("td", {
            "data-format": col.format,
            "data-align": col.align || null,
            "data-first": c === 0 ? "true" : null,
            "data-last": c === visCols.length - 1 ? "true" : null,
            "data-wrap": cellWrap,
            "data-pinned": isPinned ? "true" : null,
            style: stickyStyle(col.key, isPinned),
          });
          td.setAttribute("data-col-key", col.key);
          fillTableCell(td, col, col.values[r], r, helpers, col.fmt, rowObj);
          if (cellWrap === "false" && !col.render && !isComponentNode(col.values[r])) {
            const text = td.textContent ?? "";
            if (text) td.title = text;
          }
          tr.append(td);
        });
        if (fixedLayout) tr.append(fillerCell("td"));
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

    /**
     * Record what the browser is doing with the scroll port: does it overflow
     * sideways, which edge is it parked at, how tall is the header band. Drives
     * the scroll arrows, the fade at each scrollable edge, and the vertical
     * placement of both the arrows and the column-menu button.
     *
     * Writes the numbers into instance state as well as onto the node, so the
     * next render re-emits them (morph strips attributes the fresh tree omits).
     */
    const syncScrollHint = (view: HTMLElement): void => {
      const scroller = view.querySelector<HTMLElement>(".rui-data-grid-scroll");
      if (!scroller) return;
      const headRow = view.querySelector<HTMLElement>(".rui-data-grid-table > thead > tr:first-child");
      const headHeight = headRow ? Math.round(headRow.getBoundingClientRect().height) : 0;
      const slack = scroller.scrollWidth - scroller.clientWidth;
      const overflows = slack > 1;
      const left = scroller.scrollLeft;
      const next: ScrollHintState = {
        overflows,
        atStart: !overflows || left <= 1,
        atEnd: !overflows || left >= slack - 1,
        headHeight: headHeight || hintSlot.get().headHeight,
      };
      const prev = hintSlot.get();
      hintSlot.set(next);
      if (
        prev.overflows === next.overflows && prev.atStart === next.atStart
        && prev.atEnd === next.atEnd && prev.headHeight === next.headHeight
        && view.hasAttribute("data-measured")
      ) return;
      applyHint(view, next);
    };

    /** The one place hint state becomes DOM, shared by render and the live sync. */
    const applyHint = (view: HTMLElement, hint: ScrollHintState): void => {
      view.setAttribute("data-measured", "true");
      const flag = (name: string, on: boolean): void => {
        if (on) view.setAttribute(name, "true"); else view.removeAttribute(name);
      };
      flag("data-overflow-x", hint.overflows);
      flag("data-at-start", hint.atStart);
      flag("data-at-end", hint.atEnd);
      if (hint.headHeight > 0) view.style.setProperty("--rui-dg-head-h", `${hint.headHeight}px`);
      const scroller = view.querySelector<HTMLElement>(".rui-data-grid-scroll");
      // A scroll port that can only be reached with a pointer fails WCAG 2.1.1;
      // making it focusable lets the arrow keys scroll it. Only while it actually
      // overflows, so a grid that fits adds no stray tab stop.
      if (!scroller) return;
      if (hint.overflows) scroller.setAttribute("tabindex", "0");
      else scroller.removeAttribute("tabindex");
    };

    /**
     * Freeze the columns at the widths they are currently rendered at and switch
     * the table to fixed layout. Called at the START of a resize interaction, not
     * on load.
     *
     * Doing it on load looked tidier and was wrong twice over: the first paint
     * happens before the webfont has swapped in, so every column was measured
     * against the fallback face and came out a few pixels narrow — enough to
     * truncate "Hibernating" in a column that had always fit — and it imposed a
     * layout change on grids nobody ever resizes. Measuring on the first drag
     * instead means the numbers come from a settled layout, and the flip is
     * invisible because the widths it pins are the ones already on screen.
     */
    const freezeColumnWidths = (scope: Element): void => {
      if (!fixedLayout) return;
      const config = getColConfig();
      const auto = { ...autoWidthSlot.get() };
      let changed = false;
      scope.querySelectorAll<HTMLElement>(
        ".rui-data-grid-table > thead > tr:first-child > th[data-col-key]",
      ).forEach((th) => {
        const key = th.getAttribute("data-col-key") ?? "";
        if (!key || config.widths[key] || auto[key]) return;
        // Ceil, not round: half a pixel short of the content is a truncated cell.
        const width = Math.ceil(th.getBoundingClientRect().width);
        if (width <= 0) return;
        auto[key] = `${width}px`;
        changed = true;
        const colEl = liveColEl(scope, key);
        if (colEl) colEl.style.width = `${width}px`;
      });
      if (!changed) return;
      autoWidthSlot.set(auto);
      const grid = scope.closest(".rui-data-grid") ?? scope;
      grid.setAttribute("data-fixed-layout", "true");
      // The signature the header was built with no longer describes it.
      grid.setAttribute(
        "data-col-sig",
        columnSignature(getColConfig(), effectiveCols(allCols, getColConfig())),
      );
    };

    /**
     * Paint one grid subtree. `scope` is explicit because the two callers mean
     * different trees: a handler acts on the LIVE grid, while the end of `render`
     * acts on the fresh copy it is about to hand to the reconciler. Resolving the
     * render-time call through `liveScope` instead would fill the live tree and
     * hand back an empty one — which the reconciler then faithfully applied,
     * blanking every row.
     */
    const paint = (scope: Element, m: GridModel): void => {
      syncColumns(scope);
      const body = bodyOf(scope);
      if (body) buildRows(body, m);
      syncHeader(scope, m);
      applySelection(scope, m.selected);
      syncFooter(scope, m);
      syncStatus(scope, m);
      // Measurement only means anything against a laid-out tree. During a render
      // `scope` is the detached fresh copy, so the post-paint pass below owns it.
      const view = scope.querySelector<HTMLElement>(".rui-data-grid-viewport");
      if (view?.isConnected) {
        syncStickyOffsets(scope);
        syncScrollHint(view);
      }
    };

    const repaint = (origin: Element | null, m: GridModel = readModel()): void =>
      paint(liveScope(origin), m);

    /**
     * Re-establish an OPEN column panel after a re-render, assigned by the column
     * menu below when it exists.
     *
     * The panel is promoted into the top layer while open, and promotion lives in
     * attributes the freshly-rendered tree does not carry (`popover`, the measured
     * `style`) — so a re-render triggered by anything else, a five-second refetch
     * included, dropped the panel out of the top layer and left it collapsed
     * behind the table. Re-opening it after paint is what makes it survive.
     */
    let restoreColMenu: (() => void) | null = null;

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

    /**
     * A NON-scrolling frame around the scroll port.
     *
     * Everything that has to stay put while the columns scroll under it — the two
     * scroll arrows, the column-settings button, the edge fades — is a child of
     * this element rather than of the scroller. An absolutely-positioned child of
     * a scroll container is positioned against its *content*, so the arrows used
     * to travel out of view with the first column the moment you scrolled, which
     * is precisely when they were needed.
     */
    const hint = hintSlot.get();
    const viewport = el("div", {
      class: "rui-data-grid-viewport",
      "data-overflow-x": hint.overflows ? "true" : null,
      "data-at-start": hint.atStart ? "true" : null,
      "data-at-end": hint.atEnd ? "true" : null,
      style: hint.headHeight > 0 ? `--rui-dg-head-h:${hint.headHeight}px` : null,
    });
    const tableWrap = el("div", {
      class: "rui-data-grid-scroll",
      tabindex: hint.overflows ? "0" : null,
    });
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
    table.append(buildColGroup(cols, getColConfig()));

    const thead = el("thead");
    const headRow = el("tr");
    if (selectable) {
      const leadPinned = getColConfig().pinned.size > 0;
      const th = el("th", {
        class: "rui-data-grid-cell-select",
        scope: "col",
        "data-pinned": leadPinned ? "true" : null,
        style: stickyStyle(LEAD_SELECT_KEY, leadPinned),
      });
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
      const leadPinned = getColConfig().pinned.size > 0;
      headRow.append(el("th", {
        class: "rui-data-grid-cell-rownum",
        scope: "col",
        "data-pinned": leadPinned ? "true" : null,
        style: stickyStyle(LEAD_ROWNUM_KEY, leadPinned),
      }, ["#"]));
    }

    const config = getColConfig();
    cols.forEach((col, c) => {
      headRow.append(buildColTh(col, c, config, c === cols.length - 1));
    });
    if (fixedLayout) headRow.append(fillerCell("th"));

    /*
     * Column settings — an OVERLAY on the header, not a column of its own.
     *
     * It used to be a real `<th>` plus one empty `<td>` per row, which cost every
     * grid a 32px column: `width: 100%` then had 32px less to share out, so the
     * last column's cells were narrower than the header suggested and the whole
     * table sat visibly off its own grid. As a `position: absolute` child of the
     * (non-scrolling) viewport it takes part in no layout at all, stays put while
     * the columns scroll under it, and only ever covers the header band — never a
     * data cell. The header's last cell reserves room for it in CSS via
     * `[data-col-menu]`, which under fixed layout does not change any width.
     */
    if (columnMenuEnabled) {
      // Per-instance: two grids with column menus on one page must not emit the
      // same DOM id, or their handles' `aria-describedby` both resolve to the first.
      const reorderHintId = `${autoId(helpers, "rui-data-grid-col")}-reorder-hint`;
      // Overridable because these are the only user-facing strings the grid
      // invents for itself, and a localised app has no other way to translate
      // them. `columnMenuDescription: ""` removes the line rather than defaulting.
      const columnMenuTitle = asString(props.columnMenuTitle) || "Table settings";
      const columnMenuSubtitle = props.columnMenuDescription === undefined
        ? "Manage column visibility and order"
        : asString(props.columnMenuDescription);
      const columnMenuResetLabel = asString(props.columnMenuResetLabel) || "Reset to default";

      /**
       * External control of the panel.
       *
       * `columnMenuOpen` is a normal two-way binding: the slot below is the source
       * of truth, the bound `$variable` is mirrored into it on every render, and
       * every open/close writes back to both the variable and `onColumnMenuOpenChange`.
       * Leaving the prop off keeps the old behaviour exactly — the built-in trigger
       * owns the state and nothing is written anywhere.
       *
       * `argMeta` is indexed by the prop's position in THIS spec's `props` array, so
       * the slot is looked up by name rather than written as a literal: a literal
       * would silently re-point the moment a prop is added above it, and this list
       * is explicitly append-only for exactly that reason.
       */
      const openSlotIndex = DataGrid.props.findIndex((pr) => pr.name === "columnMenuOpen");
      const openStateName = openSlotIndex >= 0
        ? node.argMeta?.[openSlotIndex]?.stateRef
        : undefined;
      const openControlled = props.columnMenuOpen !== undefined;
      // The panel is anchored to the built-in trigger unless the author names
      // another element; with the trigger hidden there is nothing else to hang off.
      const columnMenuAnchor = asString(props.columnMenuAnchor);
      const showMenuButton = props.columnMenuButton === undefined
        ? true
        : asBoolean(props.columnMenuButton);
      if (openControlled) colConfigPanelOpen.set(asBoolean(props.columnMenuOpen));

      /**
       * Single exit for every state change, so the write-back cannot be forgotten.
       *
       * Idempotent on purpose: `restoreColMenu` re-opens the panel after EVERY
       * paint (promotion into the top layer does not survive reconciliation), and
       * without this guard each of those would fire `onColumnMenuOpenChange` again
       * and write the bound variable — a render loop in any app that repaints on it.
       */
      const reportOpen = (next: boolean): void => {
        if (colConfigPanelOpen.get() === next) return;
        colConfigPanelOpen.set(next);
        if (openStateName) helpers.setState(openStateName, next);
        helpers.invoke(props.onColumnMenuOpenChange, next);
      };
      const menuWrap = el("div", { class: "rui-data-grid-col-menu" });
      const menuBtn = el("button", {
        type: "button",
        class: "rui-data-grid-col-menu-btn",
        "aria-label": "Column settings",
        "aria-haspopup": "dialog",
        "aria-expanded": colConfigPanelOpen.get() ? "true" : "false",
      });
      const gearIcon = renderIcon("sliders", { className: "rui-data-grid-col-menu-icon" });
      if (gearIcon) menuBtn.append(gearIcon); else menuBtn.textContent = "☰";
      // Hidden, not absent. The button is still the fallback anchor and still owns
      // `aria-expanded`, so the panel keeps working when the author supplies no
      // `columnMenuAnchor` — it just stops taking space in the header band.
      if (!showMenuButton) menuWrap.setAttribute("data-hidden", "true");

      // Visibility is an ATTRIBUTE, not an inline `display`: the floating layer
      // promotes this panel with the popover API, and `[popover]` is
      // `display: none` until shown — an inline `display: none` would win and the
      // panel would open into nothing.
      const panel = el("div", {
        class: "rui-data-grid-col-panel",
        role: "dialog",
        "aria-label": "Column settings",
        "data-open": colConfigPanelOpen.get() ? "true" : "false",
      });

      /**
       * The live button + panel. On the popover path the panel is still a child
       * of the menu; on the reparenting fallback the floating layer has moved it
       * out of the grid entirely, so the last-known node is remembered instead of
       * re-queried.
       */
      const findLive = (origin: Element | null): { btn: HTMLElement | null; panel: HTMLElement | null } => {
        const menu = liveScope(origin).querySelector(".rui-data-grid-col-menu");
        const inPlace = menu?.querySelector<HTMLElement>(".rui-data-grid-col-panel") ?? null;
        const remembered = livePanelSlot.get();
        const live = inPlace ?? (remembered?.isConnected ? remembered : null);
        if (live) livePanelSlot.set(live);
        return {
          btn: menu?.querySelector<HTMLElement>(".rui-data-grid-col-menu-btn") ?? null,
          panel: live,
        };
      };

      const closePanel = (origin?: Element | null): void => {
        reportOpen(false);
        colConfigPanelOpen.set(false);
        const live = findLive(origin ?? null);
        if (live.panel) {
          closeFloating(live.panel);
          live.panel.setAttribute("data-open", "false");
        }
        live.btn?.setAttribute("aria-expanded", "false");
      };

      const rebuildColPanel = (panelEl: HTMLElement): void => {
        panelEl.replaceChildren();
        const cfg0 = getColConfig();
        const panelHead = el("div", { class: "rui-data-grid-col-panel-head" });
        const heading = el("span", { class: "rui-data-grid-col-panel-heading" });
        heading.append(el("span", { class: "rui-data-grid-col-panel-title" }, [columnMenuTitle]));
        if (columnMenuSubtitle) {
          heading.append(el("span", { class: "rui-data-grid-col-panel-subtitle" }, [columnMenuSubtitle]));
        }
        panelHead.append(heading);
        const resetBtn = el("button", {
          type: "button",
          class: "rui-data-grid-col-panel-reset",
        });
        const resetIcon = renderIcon("rotate-left", { className: "rui-data-grid-col-panel-reset-icon" });
        if (resetIcon) resetBtn.append(resetIcon);
        resetBtn.append(el("span", {}, [columnMenuResetLabel]));
        resetBtn.onclick = (ev) => {
          ev.stopPropagation();
          colConfigSlot.set(initColumnConfig(allCols, null));
          // Also forget the widths the grid measured for itself, so the table goes
          // back to auto layout and re-derives them from the container it is in
          // NOW rather than the one it was in when resizing first started.
          autoWidthSlot.set({});
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
        closeBtn.onclick = (ev) => { ev.stopPropagation(); closePanel(ev.currentTarget as Element); };
        panelHead.append(closeBtn);
        panelEl.append(panelHead);

        const list = el("div", { class: "rui-data-grid-col-panel-list" });

        /**
         * Column reordering — pointer-driven, with the list displacing live under
         * the cursor.
         *
         * This replaced HTML5 drag-and-drop, which was unusable here on four counts:
         *
         *  1. Drop semantics were direction-dependent. The commit spliced the key out
         *     and re-inserted it AT the target's index, but removing it first shifts
         *     every later index down by one — so dropping on a row landed the column
         *     AFTER it when dragging down and BEFORE it when dragging up. Same
         *     gesture, same target, two different results, and no way to tell which
         *     you were about to get.
         *  2. The only feedback was a 2px `border-top` on the hovered row, which
         *     therefore pointed at the wrong gap half the time AND reflowed the list
         *     by 2px every time it moved.
         *  3. `dragenter` / `dragleave` bubble from the row's own children (handle,
         *     checkbox, label, pin), so sweeping across a row toggled that highlight
         *     several times per row — the "not smooth" part.
         *  4. `dragstart` never called `dataTransfer.setData`, which Firefox requires
         *     before it will start a drag at all.
         *
         * The replacement tracks the pointer directly: `toIndex` is derived from how
         * far the row has travelled in whole row-heights, the dragged row follows the
         * cursor, and the rows it passes slide out of its way — so the gap you see is
         * exactly where the column lands, identically in both directions. Pointer
         * capture keeps the gesture alive over the panel's edges (it lives in the top
         * layer, promoted out of the grid), which native DnD could not do reliably
         * across that boundary.
         */
        interface ColDragState {
          key: string;
          rows: HTMLElement[];
          fromIndex: number;
          toIndex: number;
          rowH: number;
          startY: number;
          startScroll: number;
          pointerId: number;
          node: HTMLElement;
          active: boolean;
          lastY: number;
          /** Inclusive row-index bounds of the group the drag started in. */
          groupStart: number;
          groupEnd: number;
        }
        let colDrag: ColDragState | null = null;
        // Below this the gesture is still a click, so the checkbox and pin button
        // keep working and a twitchy mouse does not reorder anything.
        const DRAG_THRESHOLD = 4;

        /**
         * Where the dragged row currently sits, in whole row-heights travelled,
         * clamped to its own group so a drag can never cross the pinned divider.
         */
        const dragTargetIndex = (d: ColDragState, dy: number): number => {
          const raw = d.fromIndex + Math.round(dy / d.rowH);
          return Math.max(d.groupStart, Math.min(d.groupEnd, raw));
        };

        /** Lay the list out for "the dragged row is at `toIndex`". */
        const applyDragOffsets = (d: ColDragState, dy: number): void => {
          d.node.style.transform = `translateY(${dy}px)`;
          for (const [i, r] of d.rows.entries()) {
            if (i === d.fromIndex) continue;
            let shift = 0;
            if (d.fromIndex < d.toIndex && i > d.fromIndex && i <= d.toIndex) shift = -d.rowH;
            else if (d.fromIndex > d.toIndex && i >= d.toIndex && i < d.fromIndex) shift = d.rowH;
            r.style.transform = shift === 0 ? "" : `translateY(${shift}px)`;
          }
        };

        /** Drop every inline style the drag added, committing nothing. */
        const clearDragStyles = (d: ColDragState): void => {
          for (const r of d.rows) {
            r.style.transform = "";
            r.classList.remove("rui-data-grid-col-dragging", "rui-data-grid-col-shifting");
          }
          list.classList.remove("rui-data-grid-col-reordering");
        };

        /**
         * Edge auto-scroll. The panel is capped to the viewport by the floating
         * layer, so on a short window a grid with a handful of columns already
         * overflows — without this you simply cannot drag a column past the edge
         * of what is on screen. Scrolling also moves the rows under a stationary
         * cursor, so each step re-derives the offsets from the new scrollTop (the
         * same term pointermove adds) rather than assuming the pointer moved.
         */
        const AUTO_SCROLL_ZONE = 28;
        const AUTO_SCROLL_STEP = 12;
        let autoScrollRaf = 0;
        let autoScrollDir = 0;
        const stopAutoScroll = (): void => {
          if (autoScrollRaf !== 0) cancelAnimationFrame(autoScrollRaf);
          autoScrollRaf = 0;
          autoScrollDir = 0;
        };
        const stepAutoScroll = (): void => {
          autoScrollRaf = 0;
          const d = colDrag;
          // `isConnected` is the unmount guard: if the grid goes away mid-drag
          // nothing else stops this loop, and it would keep scheduling frames
          // against a detached panel for the life of the page.
          if (!d || !d.active || autoScrollDir === 0 || !panelEl.isConnected) { stopAutoScroll(); return; }
          const before = panelEl.scrollTop;
          panelEl.scrollTop = before + (autoScrollDir * AUTO_SCROLL_STEP);
          if (panelEl.scrollTop !== before) {
            const dy = (d.lastY - d.startY) + (panelEl.scrollTop - d.startScroll);
            d.toIndex = dragTargetIndex(d, dy);
            applyDragOffsets(d, dy);
          }
          autoScrollRaf = requestAnimationFrame(stepAutoScroll);
        };
        const updateAutoScroll = (clientY: number): void => {
          const box = panelEl.getBoundingClientRect();
          const dir = clientY < box.top + AUTO_SCROLL_ZONE ? -1
            : clientY > box.bottom - AUTO_SCROLL_ZONE ? 1 : 0;
          autoScrollDir = dir;
          if (dir !== 0 && autoScrollRaf === 0 && typeof requestAnimationFrame === "function") {
            autoScrollRaf = requestAnimationFrame(stepAutoScroll);
          }
        };

        const endColDrag = (commit: boolean, origin: Element | null): void => {
          const d = colDrag;
          colDrag = null;
          stopAutoScroll();
          if (!d) return;
          try { d.node.releasePointerCapture(d.pointerId); } catch { /* already gone */ }
          if (!d.active) return;
          clearDragStyles(d);
          if (!commit || d.toIndex === d.fromIndex) return;
          const cfg = getColConfig();
          const order = [...cfg.order];
          const srcIdx = order.indexOf(d.key);
          if (srcIdx < 0) return;
          // Splice out first, then insert at `toIndex` — `toIndex` is already an
          // index into the list WITHOUT the dragged row, because that is exactly
          // what the displaced rows on screen were showing.
          order.splice(srcIdx, 1);
          order.splice(d.toIndex, 0, d.key);
          updateColConfig({ order });
          rebuildColPanel(panelEl);
          repaint(origin);
        };

        /**
         * The half-open row range of the group `index` belongs to.
         *
         * Pinned and unpinned columns are two separate lists that happen to share
         * one scroll box, and the divider between them is a real boundary: dragging
         * across it would mean "pin this column", which is the pin button's job and
         * not something a stray 40px of travel should decide. Both the pointer drag
         * and the arrow keys clamp to this range, so the only way across is the pin.
         */
        const groupBounds = (index: number): { start: number; end: number } => {
          const pinnedCount = cfg0.order.filter((k) => cfg0.pinned.has(k)).length;
          return index < pinnedCount
            ? { start: 0, end: pinnedCount - 1 }
            : { start: pinnedCount, end: cfg0.order.length - 1 };
        };

        /**
         * Put focus back on one control of `key`'s row after a rebuild.
         *
         * `rebuildColPanel` calls `replaceChildren`, which throws away the element
         * the user was standing on — focus lands on the body, and from there Escape
         * never reaches the panel's own handler, so the panel could not be
         * dismissed after hiding a column.
         *
         * Matched by attribute value rather than interpolated into a selector: a
         * column header is arbitrary user text and would need CSS escaping.
         */
        const refocusRow = (key: string, childSelector: string): void => {
          for (const r of panelEl.querySelectorAll<HTMLElement>(".rui-data-grid-col-panel-row")) {
            if (r.getAttribute("data-col-key") !== key) continue;
            r.querySelector<HTMLElement>(childSelector)?.focus();
            return;
          }
        };

        /** Move one column by `delta` places within its group, keeping focus on its handle. */
        const nudgeColumn = (key: string, delta: number, origin: Element | null): void => {
          const cfg = getColConfig();
          const order = [...cfg.order];
          const from = order.indexOf(key);
          const to = from + delta;
          if (from < 0) return;
          const bounds = groupBounds(from);
          if (to < bounds.start || to > bounds.end) return;
          order.splice(from, 1);
          order.splice(to, 0, key);
          updateColConfig({ order });
          rebuildColPanel(panelEl);
          repaint(origin);
          refocusRow(key, ".rui-data-grid-col-panel-handle");
        };

        // Hiding is refused rather than merely discouraged once one column is left:
        // a grid with every column hidden renders a header of nothing over rows of
        // nothing, and the only way back is the panel the user just emptied.
        const visibleCount = cfg0.order.filter((k) => !cfg0.hidden.has(k)).length;
        let dividerDrawn = false;

        for (const key of cfg0.order) {
          const colDef = allCols.find((cd) => cd.key === key);
          if (!colDef) continue;
          const isHidden = cfg0.hidden.has(key);
          const isPinnedCol = cfg0.pinned.has(key);
          const isLastVisible = !isHidden && visibleCount <= 1;

          // The divider is drawn ONCE, before the first unpinned row, and only when
          // both groups exist — a rule above the first row or below the last would
          // read as a panel border rather than as a boundary.
          if (!isPinnedCol && !dividerDrawn && cfg0.pinned.size > 0) {
            dividerDrawn = true;
            list.append(el("div", {
              class: "rui-data-grid-col-panel-divider",
              role: "separator",
              "aria-label": "Pinned columns above",
            }));
          }

          const row = el("div", {
            class: "rui-data-grid-col-panel-row",
            "data-col-key": key,
            "data-pinned": isPinnedCol ? "true" : "false",
          });

          // The handle is a real button, not an aria-hidden glyph: reordering was
          // pointer-only, so a keyboard or screen-reader user could hide and pin
          // columns but never move one. Arrow keys on the handle do the same job.
          const handle = el("button", {
            type: "button",
            class: "rui-data-grid-col-panel-handle",
            "aria-label": `Reorder ${colDef.header}`,
            "aria-describedby": reorderHintId,
          }, ["⠿"]);
          handle.onkeydown = (ev) => {
            const delta = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
            if (delta === 0) return;
            ev.preventDefault();
            ev.stopPropagation();
            nudgeColumn(key, delta, ev.currentTarget as Element);
          };
          row.append(handle);

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
            // `updateColConfig` re-partitions `order`, so the row MOVES across the
            // divider on its own — both here and in the table behind the panel.
            updateColConfig({ pinned: nextPinned });
            rebuildColPanel(panelEl);
            repaint(ev.currentTarget as Element);
            refocusRow(key, ".rui-data-grid-col-panel-pin");
          };
          row.append(pinBtn);

          const cb = el("input", {
            type: "checkbox",
            class: "rui-data-grid-col-panel-cb",
            checked: isHidden ? null : "",
            // Disabled rather than silently ignored: a checkbox that does nothing
            // when clicked reads as broken, whereas a greyed one says why it cannot
            // move. The title carries the reason for a pointer user.
            disabled: isLastVisible ? "" : null,
            title: isLastVisible ? "At least one column must stay visible" : null,
            "aria-label": `Show ${colDef.header}`,
          });
          cb.onclick = (ev) => {
            ev.stopPropagation();
            const target2 = ev.currentTarget as HTMLInputElement;
            const cfg = getColConfig();
            const nextHidden = new Set(cfg.hidden);
            if (target2.checked) {
              nextHidden.delete(key);
            } else if (cfg.order.filter((k) => !cfg.hidden.has(k)).length <= 1) {
              // Belt and braces for the `disabled` above: a click can still arrive
              // from a script, and an empty grid is unrecoverable from its own UI.
              target2.checked = true;
              return;
            } else {
              nextHidden.add(key);
            }
            updateColConfig({ hidden: nextHidden });
            // Rebuilt because the guard is cross-row: hiding the second-to-last
            // column has to disable the checkbox of a DIFFERENT row.
            rebuildColPanel(panelEl);
            repaint(target2);
            refocusRow(key, ".rui-data-grid-col-panel-cb");
          };
          row.append(cb);

          row.onpointerdown = (ev) => {
            if (ev.button !== 0) return;
            const from = ev.target as Element | null;
            // A press that starts on the checkbox or the pin must stay a click.
            if (from?.closest?.("input, button:not(.rui-data-grid-col-panel-handle)")) return;
            // Touch keeps the list scrollable: only the handle starts a drag there,
            // and only the handle opts out of the browser's own panning.
            if (ev.pointerType === "touch" && !from?.closest?.(".rui-data-grid-col-panel-handle")) return;
            const node = ev.currentTarget as HTMLElement;
            const rows = [...list.querySelectorAll<HTMLElement>(".rui-data-grid-col-panel-row")];
            const fromIndex = rows.indexOf(node);
            if (fromIndex < 0) return;
            colDrag = {
              key,
              rows,
              fromIndex,
              toIndex: fromIndex,
              rowH: node.getBoundingClientRect().height,
              startY: ev.clientY,
              startScroll: panelEl.scrollTop,
              pointerId: ev.pointerId,
              node,
              active: false,
              lastY: ev.clientY,
              groupStart: groupBounds(fromIndex).start,
              groupEnd: groupBounds(fromIndex).end,
            };
            try { node.setPointerCapture(ev.pointerId); } catch { /* capture unsupported */ }
          };
          row.onpointermove = (ev) => {
            const d = colDrag;
            if (!d || d.pointerId !== ev.pointerId) return;
            // The panel is the scroll box, so a scroll mid-drag moves the rows under
            // a cursor that has not moved — count it as travel or the row lags.
            const dy = (ev.clientY - d.startY) + (panelEl.scrollTop - d.startScroll);
            if (!d.active) {
              if (Math.abs(dy) < DRAG_THRESHOLD) return;
              d.active = true;
              list.classList.add("rui-data-grid-col-reordering");
              d.node.classList.add("rui-data-grid-col-dragging");
              for (const r of d.rows) if (r !== d.node) r.classList.add("rui-data-grid-col-shifting");
            }
            ev.preventDefault();
            d.lastY = ev.clientY;
            d.toIndex = dragTargetIndex(d, dy);
            applyDragOffsets(d, dy);
            updateAutoScroll(ev.clientY);
          };
          row.onpointerup = (ev) => {
            if (!colDrag || colDrag.pointerId !== ev.pointerId) return;
            endColDrag(true, ev.currentTarget as Element);
          };
          row.onpointercancel = (ev) => {
            if (!colDrag || colDrag.pointerId !== ev.pointerId) return;
            endColDrag(false, ev.currentTarget as Element);
          };
          // Losing capture for any other reason (the row being replaced, the
          // browser taking the pointer back) would otherwise strand the drag
          // mid-gesture with the rows still displaced and no way to finish it.
          // Our own release inside `endColDrag` fires this too, but it has
          // already cleared `colDrag` by then, so the re-entry is a no-op.
          row.onlostpointercapture = (ev) => {
            if (!colDrag || colDrag.pointerId !== ev.pointerId) return;
            endColDrag(false, ev.currentTarget as Element);
          };
          row.onkeydown = (ev) => {
            if (ev.key !== "Escape" || !colDrag) return;
            // Abandon the drag without closing the whole panel.
            ev.stopPropagation();
            endColDrag(false, ev.currentTarget as Element);
          };

          list.append(row);
        }
        panelEl.append(list);
        const footer = el("div", { class: "rui-data-grid-col-panel-footer" });
        footer.append(resetBtn);
        panelEl.append(footer);
        panelEl.append(el("span", {
          id: reorderHintId,
          class: "rui-data-grid-col-panel-hint",
        }, ["Press the up and down arrow keys to move this column within its group."]));
      };

      /**
       * The element the panel hangs off.
       *
       * Searched from the grid's own root and then from the document, because an
       * external trigger is by definition NOT inside the grid: in a shadow-DOM app
       * both live in the same shadow root (which `document.querySelector` cannot
       * see), while a light-DOM host puts it in the document. Falls back to the
       * built-in button whenever the selector matches nothing, so a typo degrades
       * to the old placement instead of dropping the panel in the corner.
       */
      const resolveMenuAnchor = (fallback: HTMLElement): HTMLElement => {
        // A hidden trigger measures 0x0, which would drop the panel in the page's
        // top-left corner. The grid's own viewport is the honest fallback: the
        // panel still lands on the table it configures.
        const base = showMenuButton ? fallback : ((viewport as HTMLElement) ?? fallback);
        if (!columnMenuAnchor) return base;
        const scope = liveScope(fallback);
        const root = scope.getRootNode?.() as ParentNode | null;
        for (const where of [root, scope, typeof document === "undefined" ? null : document]) {
          if (!where) continue;
          try {
            const found = where.querySelector?.(columnMenuAnchor);
            if (found instanceof HTMLElement) return found;
          } catch { /* an invalid selector is the author's typo, not a crash */ }
        }
        return base;
      };

      const openPanel = (origin: Element | null): void => {
        const live = findLive(origin);
        if (!live.panel || !live.btn) return;
        reportOpen(true);
        colConfigPanelOpen.set(true);
        // `data-open` first: a hidden panel measures 0×0, which would defeat both
        // the flip decision and the height cap in the floating layer.
        live.panel.setAttribute("data-open", "true");
        live.btn.setAttribute("aria-expanded", "true");
        rebuildColPanel(live.panel);
        // Promoted out of every clipping ancestor. The panel hangs off the header
        // band of a scroll box inside (usually) an `overflow: hidden` card, so in
        // place it was amputated on two counts.
        openFloating(live.panel, {
          anchor: resolveMenuAnchor(live.btn),
          side: "bottom",
          align: "end",
          offset: 4,
          layer: "dropdown",
          maxHeight: "viewport",
        });
      };

      // Called after every paint: promotion is not expressible in the rendered
      // tree, so an open panel has to be put back into the top layer once the
      // reconciler has finished with it.
      restoreColMenu = () => {
        const live = findLive(null);
        if (!colConfigPanelOpen.get()) {
          // A bound `columnMenuOpen` that flipped to false has to close a panel the
          // user never touched. Promotion lives outside the rendered tree, so the
          // reconciler cannot take it down on its own.
          if (live.panel && isFloating(live.panel)) {
            closeFloating(live.panel);
            live.panel.setAttribute("data-open", "false");
            live.btn?.setAttribute("aria-expanded", "false");
          }
          return;
        }
        if (!live.panel || !live.btn) return;
        if (isFloating(live.panel)) updateFloating(live.panel);
        else openPanel(live.btn);
      };

      menuBtn.onclick = (event) => {
        event.stopPropagation();
        const origin = event.currentTarget as Element;
        if (colConfigPanelOpen.get()) closePanel(origin);
        else openPanel(origin);
      };
      menuBtn.onkeydown = (event) => {
        if (event.key !== "Escape" || !colConfigPanelOpen.get()) return;
        event.stopPropagation();
        closePanel(event.currentTarget as Element);
      };
      menuWrap.append(menuBtn);

      menuWrap.onmousedown = (ev) => ev.stopPropagation();
      panel.onclick = (ev) => ev.stopPropagation();
      panel.onkeydown = (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        const live = findLive(event.currentTarget as Element);
        closePanel(event.currentTarget as Element);
        live.btn?.focus();
      };

      const closeOnOutside = (event: MouseEvent): void => {
        if (!colConfigPanelOpen.get()) return;
        const path = event.composedPath?.() ?? [];
        for (const node of path) {
          if (!(node instanceof Element)) continue;
          // Both classes, because a promoted panel is no longer a descendant of
          // the menu on the reparenting fallback path.
          if (node.classList?.contains("rui-data-grid-col-menu")
            || node.classList?.contains("rui-data-grid-col-panel")) return;
        }
        closePanel();
      };
      if (typeof document !== "undefined") {
        document.addEventListener("mousedown", closeOnOutside);
        helpers.registerDisposer(() => {
          document.removeEventListener("mousedown", closeOnOutside);
          closeFloating(livePanelSlot.get());
        }, "col-menu-outside");
      }

      // Built as part of the RENDER, not only on open. The rows are ordinary
      // children, so the reconciler keeps them in step; building them only in the
      // click handler meant the next re-render found a panel the fresh tree said
      // was empty and dutifully emptied it.
      rebuildColPanel(panel);
      menuWrap.append(panel);
      viewport.append(menuWrap);
    }

    thead.append(headRow);

    if (cols.some((c) => c.filterable)) {
      const filters = filterSlot.get();
      const leadPinned = config.pinned.size > 0;
      const filterRow = el("tr", { class: "rui-data-grid-filter-row" });
      if (selectable) {
        filterRow.append(el("td", {
          class: "rui-data-grid-cell-select",
          "data-pinned": leadPinned ? "true" : null,
          style: stickyStyle(LEAD_SELECT_KEY, leadPinned),
        }));
      }
      if (showRowNumbers) {
        filterRow.append(el("td", {
          class: "rui-data-grid-cell-rownum",
          "data-pinned": leadPinned ? "true" : null,
          style: stickyStyle(LEAD_ROWNUM_KEY, leadPinned),
        }));
      }
      for (const col of cols) {
        filterRow.append(buildFilterTd(col, filters, config.pinned.has(col.key)));
      }
      if (fixedLayout) filterRow.append(fillerCell("td"));
      thead.append(filterRow);
    }
    table.append(thead);

    const tbody = el("tbody");
    table.append(tbody);
    tableWrap.append(table);
    viewport.append(tableWrap);

    /*
     * Scroll affordances. Rendered as part of the tree rather than appended after
     * paint: the reconciler drops any live child the fresh tree does not also
     * carry, so imperatively-added arrows survived exactly one render and then
     * disappeared for good. Which edge (if either) is shown is pure CSS off the
     * viewport's `data-at-start` / `data-at-end` flags.
     */
    if (scrollArrows && !allowOverflow) {
      viewport.append(buildScrollArrow("left"), buildScrollArrow("right"));
    }

    wrapper.append(viewport);

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

    paint(wrapper, model);

    /*
     * Everything that needs a laid-out tree.
     *
     * On the first render this very `viewport` is the one that gets mounted; on
     * every later one the reconciler kept the previous node and threw this copy
     * away — hence the instance slot, which is also what lets the observer
     * survive (and be disconnected) across re-renders.
     */
    deferToPaint(() => {
      const live = viewport.isConnected ? viewport : liveViewSlot.get();
      if (!live?.isConnected) return;
      liveViewSlot.set(live);
      syncStickyOffsets(live.closest(".rui-data-grid") ?? live);
      syncScrollHint(live);
      restoreColMenu?.();

      const scroller = live.querySelector<HTMLElement>(".rui-data-grid-scroll");
      if (!scroller) return;
      // A property assignment, not `addEventListener`: the reconciler copies
      // `onscroll` from the fresh node onto the kept one, so re-renders replace
      // the handler instead of stacking a new one on every tick.
      scroller.onscroll = () => syncScrollHint(live);

      const existing = observerSlot.get();
      if (existing && existing.node !== live) {
        existing.ro.disconnect();
        observerSlot.set(null);
      }
      if (observerSlot.get() || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => syncScrollHint(live));
      try {
        ro.observe(scroller);
        const table = live.querySelector(".rui-data-grid-table");
        // The port and the content resize independently: a narrowed pane changes
        // one, a new column changes the other, and either can start or stop the
        // overflow.
        if (table) ro.observe(table);
      } catch { /* detached — the scroll handler still keeps up */ }
      observerSlot.set({ ro, node: live });
      helpers.registerDisposer(() => {
        ro.disconnect();
        observerSlot.set(null);
      }, "rui-data-grid-observer");
    });

    return wrapper;
  },
};

/* ----------------------------------------------------------------------- *
 * DataGrid helpers — pixel parsing
 * ----------------------------------------------------------------------- */

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
