/**
 * Advanced data components:
 *
 *   - DataGrid — Table with built-in sort, filter, row selection, pagination.
 *   - CalendarView — Month/week calendar grid distinct from DatePicker.
 *   - ActivityLog / AuditTrail — Timeline-like specialised feeds.
 *   - ComparisonTable — Generic feature/spec comparison table.
 *   - InfiniteList — Scroll-to-load list container.
 *
 * These are presentational + lightly stateful (using `useInstanceState` for
 * local UI state). State that should round-trip through the host is bound
 * via `$variables` exactly like every other component in the library.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon } from "../utils.js";

const COL_ALIGN = ["left", "center", "right"] as const;

interface ColDef {
  header: string;
  values: unknown[];
  format: string;
  align: string;
  sortable: boolean;
  filterable: boolean;
  key: string;
}

function readDataGridCols(raw: unknown): ColDef[] {
  return asArray<{ args?: unknown[] }>(raw).map((node, idx) => {
    const args = node.args ?? [];
    const header = asString(args[0]);
    return {
      header,
      values: asArray<unknown>(args[1]),
      format: asString(args[2], "text"),
      align: (COL_ALIGN as readonly string[]).includes(asString(args[3])) ? asString(args[3]) : "",
      sortable: asBoolean(args[4]),
      filterable: asBoolean(args[5]),
      key: header || `col-${idx}`,
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

function formatCellValue(value: unknown, format: string): string {
  if (value === null || value === undefined) return "";
  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : asString(value);
    case "currency":
      return typeof value === "number"
        ? value.toLocaleString(undefined, { style: "currency", currency: "USD" })
        : asString(value);
    case "date":
      try {
        const d = new Date(asString(value));
        return Number.isNaN(d.getTime()) ? asString(value) : d.toLocaleDateString();
      } catch { return asString(value); }
    default:
      return asString(value);
  }
}

export const DataGrid: ComponentSpec = {
  name: "DataGrid",
  description:
    "Advanced data table with sortable headers, per-column filter chips, " +
    "row selection (checkboxes), sticky header / first column, optional " +
    "pagination, an optional bulk-action toolbar slot, and click-to-act " +
    "rows. Columns are Col(header, values, format?, align?, sortable?, " +
    "filterable?) entries. Bind `$sort` (`{key, direction}` object), " +
    "`$selectedIds` (string[]), and `$page` (number) for full reactivity. " +
    "Use INSTEAD of `Table` when you need any of those interactions.",
  props: [
    { name: "columns", type: "Col[]", description: "Columns; pass sortable=true / filterable=true on each Col." },
    { name: "rowIds", type: "any[]", optional: true, description: "Stable id per row (used by `selectedIds`); defaults to row index." },
    { name: "caption", type: "string", optional: true },
    { name: "sort", type: "object", optional: true, description: "`{key, direction}` — pass a $variable for two-way binding" },
    { name: "selectedIds", type: "any[]", optional: true, description: "Array of selected row ids — bind a $variable" },
    { name: "selectable", type: "boolean", optional: true, description: "Render leading selection checkboxes" },
    { name: "page", type: "number", optional: true, description: "1-indexed current page — bind a $variable" },
    { name: "perPage", type: "number", optional: true, description: "Page size (default 20)" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no rows match (default `No results`)" },
    { name: "rowAction", type: "Action", optional: true, description: "Action fired when a row is clicked" },
    { name: "toolbar", type: "Node[]", optional: true, description: "Bulk-action toolbar shown above the table when any rows are selected" },
    { name: "density", type: "string", optional: true, enum: ["comfortable", "compact"] },
    { name: "striped", type: "boolean", optional: true },
    { name: "stickyHeader", type: "boolean", optional: true, description: "Pin the header row (default true)" },
    { name: "stickyFirstColumn", type: "boolean", optional: true, description: "Pin the first column horizontally" },
  ],
  render: (node, props, helpers) => {
    const cols = readDataGridCols(props.columns);
    const rowCount = Math.max(0, ...cols.map((c) => c.values.length));
    const rowIds = asArray<unknown>(props.rowIds);
    const idFor = (rowIdx: number): string => asString(rowIds[rowIdx] ?? rowIdx);
    const sortState = (props.sort && typeof props.sort === "object")
      ? (props.sort as { key?: unknown; direction?: unknown })
      : null;
    const sortKey = asString(sortState?.key);
    const sortDir = asString(sortState?.direction, "asc") === "desc" ? "desc" : "asc";
    const selectedIds = asArray<unknown>(props.selectedIds).map((v) => asString(v));
    const selectedSet = new Set(selectedIds);
    const selectable = asBoolean(props.selectable) || node.argMeta?.[4]?.stateRef !== undefined;
    const stickyHeader = props.stickyHeader === undefined ? true : asBoolean(props.stickyHeader);
    const stickyFirst = asBoolean(props.stickyFirstColumn);
    const density = asString(props.density, "comfortable");
    const striped = asBoolean(props.striped);

    // Filter chip state (per-column) — stored locally because filtering
    // happens client-side and we don't want each chip to allocate its own
    // $variable.
    const filterSlot = helpers.useInstanceState<Record<string, string>>("filters", {});
    const filters = filterSlot.get();

    // Compute a row-index ordering after applying filters + sort.
    const indices: number[] = [];
    for (let r = 0; r < rowCount; r += 1) {
      let keep = true;
      for (const c of cols) {
        if (!c.filterable) continue;
        const term = (filters[c.key] ?? "").trim().toLowerCase();
        if (!term) continue;
        const cell = c.values[r];
        if (!formatCellValue(cell, c.format).toLowerCase().includes(term)) {
          keep = false;
          break;
        }
      }
      if (keep) indices.push(r);
    }
    if (sortKey) {
      const sortCol = cols.find((c) => c.key === sortKey);
      if (sortCol && sortCol.sortable) {
        indices.sort((a, b) => {
          const cmp = compareCells(sortCol.values[a], sortCol.values[b], sortCol.format);
          return sortDir === "desc" ? -cmp : cmp;
        });
      }
    }

    const totalAfterFilter = indices.length;
    const perPage = Math.max(1, Math.floor(asNumber(props.perPage, 20)));
    const totalPages = Math.max(1, Math.ceil(totalAfterFilter / perPage));
    const rawPage = Math.max(1, Math.floor(asNumber(props.page, 1)));
    const page = Math.min(rawPage, totalPages);
    const visible = indices.slice((page - 1) * perPage, page * perPage);

    const wrapper = el("div", {
      class: "rui-data-grid",
      "data-density": density,
      "data-striped": striped ? "true" : "false",
      "data-sticky-header": stickyHeader ? "true" : "false",
      "data-sticky-first": stickyFirst ? "true" : "false",
    });

    const sortStateName = node.argMeta?.[3]?.stateRef;
    const selectedStateName = node.argMeta?.[4]?.stateRef;
    const pageStateName = node.argMeta?.[6]?.stateRef;

    // Bulk-action toolbar (shows when at least one row is selected).
    const toolbarChildren = asArray<unknown>(props.toolbar);
    if (selectedIds.length > 0 && toolbarChildren.length > 0) {
      const bar = el("div", { class: "rui-data-grid-bulk" });
      bar.append(el("span", { class: "rui-data-grid-bulk-count" }, [
        `${selectedIds.length} selected`,
      ]));
      const tools = el("div", { class: "rui-data-grid-bulk-tools" });
      for (const child of toolbarChildren) tools.append(helpers.renderNode(child));
      bar.append(tools);
      wrapper.append(bar);
    }

    const tableWrap = el("div", { class: "rui-data-grid-scroll" });
    const table = el("table", { class: "rui-data-grid-table" });
    const caption = asString(props.caption);
    if (caption) table.append(el("caption", { class: "rui-data-grid-caption" }, [caption]));

    const thead = el("thead");
    const headRow = el("tr");
    if (selectable) {
      const th = el("th", { class: "rui-data-grid-cell-select", scope: "col" });
      const allSelected = visible.length > 0 && visible.every((r) => selectedSet.has(idFor(r)));
      const cb = el("input", {
        type: "checkbox",
        class: "rui-data-grid-checkbox",
        "aria-label": "Select all rows on this page",
        checked: allSelected ? "" : null,
      }) as HTMLInputElement;
      if (selectedStateName) {
        cb.onclick = (event) => {
          const target = event.currentTarget as HTMLInputElement;
          const next = new Set(selectedIds);
          for (const r of visible) {
            const id = idFor(r);
            if (target.checked) next.add(id); else next.delete(id);
          }
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: selectedStateName, value: Array.from(next) }],
          });
        };
      }
      th.append(cb);
      headRow.append(th);
    }
    cols.forEach((col, c) => {
      const th = el("th", {
        scope: "col",
        "data-align": col.align || null,
        "data-sortable": col.sortable ? "true" : null,
        "data-active": col.sortable && col.key === sortKey ? "true" : null,
        "data-first": c === 0 ? "true" : null,
      });
      if (col.sortable && sortStateName) {
        const btn = el("button", {
          type: "button",
          class: "rui-data-grid-sort",
        });
        btn.append(el("span", {}, [col.header]));
        const dirIcon = col.key === sortKey
          ? (sortDir === "asc" ? "arrow-up-short-wide" : "arrow-down-wide-short")
          : "sort";
        const dirNode = renderIcon(dirIcon, { className: "rui-data-grid-sort-icon" });
        if (dirNode) btn.append(dirNode);
        btn.onclick = () => {
          const nextDir = col.key === sortKey && sortDir === "asc" ? "desc" : "asc";
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: sortStateName, value: { key: col.key, direction: nextDir } }],
          });
        };
        th.append(btn);
      } else {
        th.append(document.createTextNode(col.header));
      }
      headRow.append(th);
    });
    thead.append(headRow);

    // Filter row (only if any column is filterable)
    if (cols.some((c) => c.filterable)) {
      const filterRow = el("tr", { class: "rui-data-grid-filter-row" });
      if (selectable) filterRow.append(el("td", { class: "rui-data-grid-cell-select" }));
      cols.forEach((col) => {
        const td = el("td");
        if (col.filterable) {
          const input = el("input", {
            type: "search",
            class: "rui-data-grid-filter",
            placeholder: `Filter ${col.header}`,
            value: filters[col.key] ?? "",
          }) as HTMLInputElement;
          input.oninput = (event) => {
            const target = event.currentTarget as HTMLInputElement;
            const next = { ...filterSlot.get(), [col.key]: target.value };
            filterSlot.set(next);
            // Re-render the table body in place — cheap because we walk the
            // live DOM rather than triggering a full state-driven render.
            requestRebody();
          };
          td.append(input);
        }
        filterRow.append(td);
      });
      thead.append(filterRow);
    }
    table.append(thead);

    const tbody = el("tbody");
    table.append(tbody);

    const renderBody = (rows: number[]): void => {
      tbody.replaceChildren();
      if (rows.length === 0) {
        const emptyRow = el("tr");
        const span = (selectable ? 1 : 0) + Math.max(cols.length, 1);
        emptyRow.append(el("td", {
          colspan: String(span),
          class: "rui-data-grid-empty",
        }, [asString(props.emptyLabel, "No results")]));
        tbody.append(emptyRow);
        return;
      }
      for (const r of rows) {
        const id = idFor(r);
        const isSelected = selectedSet.has(id);
        const tr = el("tr", {
          "data-selected": isSelected ? "true" : null,
        });
        if (selectable) {
          const cellTd = el("td", { class: "rui-data-grid-cell-select" });
          const cb = el("input", {
            type: "checkbox",
            class: "rui-data-grid-checkbox",
            "aria-label": "Select row",
            checked: isSelected ? "" : null,
          }) as HTMLInputElement;
          if (selectedStateName) {
            cb.onclick = (event) => {
              event.stopPropagation();
              const target = event.currentTarget as HTMLInputElement;
              const next = new Set(selectedIds);
              if (target.checked) next.add(id); else next.delete(id);
              helpers.runAction({
                kind: "Action",
                steps: [{ kind: "Set", name: selectedStateName, value: Array.from(next) }],
              });
            };
          }
          cellTd.append(cb);
          tr.append(cellTd);
        }
        cols.forEach((col, c) => {
          const cellValue = col.values[r];
          const td = el("td", {
            "data-format": col.format,
            "data-align": col.align || null,
            "data-first": c === 0 ? "true" : null,
          });
          if (cellValue !== null && typeof cellValue === "object"
              && (cellValue as { __kind?: string }).__kind === "Component") {
            td.append(helpers.renderNode(cellValue));
          } else {
            td.textContent = formatCellValue(cellValue, col.format);
          }
          tr.append(td);
        });
        if (isActionPayload(props.rowAction)) {
          tr.setAttribute("data-clickable", "true");
          tr.onclick = (event) => {
            const target = event.target as Element | null;
            if (target?.closest("input,button,a,label,select,textarea")) return;
            helpers.runAction(props.rowAction);
          };
        }
        tbody.append(tr);
      }
    };

    const requestRebody = (): void => {
      const liveRoot = wrapper.isConnected ? wrapper : null;
      const liveTbody = liveRoot?.querySelector("tbody") ?? tbody;
      const localFilters = filterSlot.get();
      const filtered: number[] = [];
      for (let r = 0; r < rowCount; r += 1) {
        let keep = true;
        for (const c of cols) {
          if (!c.filterable) continue;
          const term = (localFilters[c.key] ?? "").trim().toLowerCase();
          if (!term) continue;
          const cell = c.values[r];
          if (!formatCellValue(cell, c.format).toLowerCase().includes(term)) {
            keep = false; break;
          }
        }
        if (keep) filtered.push(r);
      }
      if (sortKey) {
        const sortCol = cols.find((c) => c.key === sortKey);
        if (sortCol && sortCol.sortable) {
          filtered.sort((a, b) => {
            const cmp = compareCells(sortCol.values[a], sortCol.values[b], sortCol.format);
            return sortDir === "desc" ? -cmp : cmp;
          });
        }
      }
      const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
      // Re-render against the (possibly live) tbody so user input keeps focus.
      const swap = (target: HTMLElement) => {
        target.replaceChildren();
        for (const row of pageRows) {
          // Lightweight re-render — same logic as the initial render path.
          const id = idFor(row);
          const isSelected = selectedSet.has(id);
          const tr = el("tr", { "data-selected": isSelected ? "true" : null });
          if (selectable) {
            const cellTd = el("td", { class: "rui-data-grid-cell-select" });
            const cb = el("input", {
              type: "checkbox",
              class: "rui-data-grid-checkbox",
              checked: isSelected ? "" : null,
            }) as HTMLInputElement;
            cellTd.append(cb);
            tr.append(cellTd);
          }
          cols.forEach((col, c) => {
            const cellValue = col.values[row];
            const td = el("td", {
              "data-format": col.format,
              "data-align": col.align || null,
              "data-first": c === 0 ? "true" : null,
            });
            if (cellValue !== null && typeof cellValue === "object"
              && (cellValue as { __kind?: string }).__kind === "Component") {
              td.append(helpers.renderNode(cellValue));
            } else {
              td.textContent = formatCellValue(cellValue, col.format);
            }
            tr.append(td);
          });
          target.append(tr);
        }
        if (pageRows.length === 0) {
          const emptyRow = el("tr");
          const span = (selectable ? 1 : 0) + Math.max(cols.length, 1);
          emptyRow.append(el("td", {
            colspan: String(span),
            class: "rui-data-grid-empty",
          }, [asString(props.emptyLabel, "No results")]));
          target.append(emptyRow);
        }
      };
      swap(liveTbody as HTMLElement);
    };

    renderBody(visible);

    tableWrap.append(table);
    wrapper.append(tableWrap);

    // Footer pagination summary
    if (totalAfterFilter > perPage) {
      const footer = el("div", { class: "rui-data-grid-footer" });
      const startIdx = totalAfterFilter === 0 ? 0 : (page - 1) * perPage + 1;
      const endIdx = Math.min(totalAfterFilter, page * perPage);
      footer.append(el("span", { class: "rui-data-grid-footer-summary" }, [
        totalAfterFilter === 0 ? "No results" : `Showing ${startIdx}–${endIdx} of ${totalAfterFilter}`,
      ]));
      const buttons = el("div", { class: "rui-data-grid-footer-buttons" });
      const prev = el("button", {
        type: "button",
        class: "rui-data-grid-page-button",
        disabled: page <= 1 ? "" : null,
      }, ["‹ Prev"]);
      const next = el("button", {
        type: "button",
        class: "rui-data-grid-page-button",
        disabled: page >= totalPages ? "" : null,
      }, ["Next ›"]);
      if (pageStateName) {
        prev.onclick = () => {
          if (page <= 1) return;
          helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: pageStateName, value: page - 1 }] });
        };
        next.onclick = () => {
          if (page >= totalPages) return;
          helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: pageStateName, value: page + 1 }] });
        };
      }
      buttons.append(prev);
      buttons.append(el("span", { class: "rui-data-grid-page-current" }, [`${page} / ${totalPages}`]));
      buttons.append(next);
      footer.append(buttons);
      wrapper.append(footer);
    }
    return wrapper;
  },
};

/* ----------------------------------------------------------------------- *
 * CalendarView — month/week calendar grid
 * ----------------------------------------------------------------------- */

interface CalendarEvent {
  date: string;
  title: string;
  tone?: string;
  time?: string;
}

function readCalendarEvents(raw: unknown): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const entry of asArray<unknown>(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { date?: unknown; title?: unknown; tone?: unknown; time?: unknown };
    const date = asString(e.date);
    if (!date) continue;
    out.push({
      date,
      title: asString(e.title),
      tone: asString(e.tone, "primary"),
      time: asString(e.time),
    });
  }
  return out;
}

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = out.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const CalendarView: ComponentSpec = {
  name: "CalendarView",
  description:
    "Full-month or week calendar grid for scheduling apps — distinct from " +
    "the form-input `DatePicker`. Pass events as an array of " +
    "`{date: 'YYYY-MM-DD', title, tone?, time?}` objects. Bind `value` " +
    "to a `$variable` for the selected date (ISO string). Use " +
    "`view=\"week\"` for a single-week strip. `firstDay=1` (Monday) " +
    "matches most business apps.",
  props: [
    { name: "value", type: "string", optional: true, description: "Selected ISO date (YYYY-MM-DD); bind a $variable" },
    { name: "month", type: "string", optional: true, description: "Reference month — ISO date or YYYY-MM (defaults to today)" },
    { name: "events", type: "object[]", optional: true, description: "Array of {date, title, tone?, time?} objects" },
    { name: "view", type: "string", optional: true, enum: ["month", "week"] },
    { name: "firstDay", type: "number", optional: true, description: "0=Sunday, 1=Monday (default 1)" },
    { name: "onSelect", type: "Action", optional: true, description: "Action fired when a day is clicked (write to a $variable via @Set if needed)" },
  ],
  render: (node, props, helpers) => {
    const view = asString(props.view, "month");
    const events = readCalendarEvents(props.events);
    const valueRaw = asString(props.value);
    const monthRaw = asString(props.month, valueRaw);
    const today = new Date();
    let refDate = new Date(NaN);
    if (monthRaw) {
      const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(monthRaw);
      if (m) {
        refDate = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
      } else {
        const d = new Date(monthRaw);
        if (!Number.isNaN(d.getTime())) refDate = d;
      }
    }
    if (Number.isNaN(refDate.getTime())) refDate = today;
    const weekStartsOn = ((asNumber(props.firstDay, 1) % 7) + 7) % 7;
    const valueIso = valueRaw && /^\d{4}-\d{2}-\d{2}$/.test(valueRaw) ? valueRaw : "";
    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      const key = evt.date.slice(0, 10);
      const list = eventsByDate.get(key) ?? [];
      list.push(evt);
      eventsByDate.set(key, list);
    }
    const onSelectState = node.argMeta?.[0]?.stateRef;
    const root = el("div", { class: "rui-calendar", "data-view": view });
    const header = el("div", { class: "rui-calendar-header" });
    const monthLabel = refDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    header.append(el("div", { class: "rui-calendar-title" }, [monthLabel]));
    root.append(header);

    const weekRow = el("div", { class: "rui-calendar-weekrow" });
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i += 1) {
      const label = dayLabels[(weekStartsOn + i) % 7] ?? "";
      weekRow.append(el("div", { class: "rui-calendar-weekday" }, [label]));
    }
    root.append(weekRow);

    const cells: { date: Date; inMonth: boolean }[] = [];
    if (view === "week") {
      const anchor = valueIso ? new Date(valueIso) : refDate;
      const start = startOfWeek(anchor, weekStartsOn);
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        cells.push({ date: d, inMonth: d.getMonth() === refDate.getMonth() });
      }
    } else {
      const firstOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const lastOfMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      const gridStart = startOfWeek(firstOfMonth, weekStartsOn);
      const totalDays = Math.ceil((lastOfMonth.getDate() + ((firstOfMonth.getDay() - weekStartsOn + 7) % 7)) / 7) * 7;
      for (let i = 0; i < totalDays; i += 1) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        cells.push({ date: d, inMonth: d.getMonth() === refDate.getMonth() });
      }
    }

    const grid = el("div", { class: "rui-calendar-grid", "data-view": view });
    const todayIso = formatIsoDate(today);
    for (const cell of cells) {
      const iso = formatIsoDate(cell.date);
      const isToday = iso === todayIso;
      const isSelected = iso === valueIso;
      const cellEvents = eventsByDate.get(iso) ?? [];
      const dayBtn = el("button", {
        type: "button",
        class: "rui-calendar-day",
        "data-in-month": cell.inMonth ? "true" : "false",
        "data-today": isToday ? "true" : "false",
        "data-selected": isSelected ? "true" : "false",
        "aria-label": cell.date.toDateString(),
      });
      dayBtn.append(el("span", { class: "rui-calendar-daynumber" }, [String(cell.date.getDate())]));
      if (cellEvents.length > 0) {
        const evts = el("div", { class: "rui-calendar-day-events" });
        const visibleEvents = cellEvents.slice(0, 3);
        for (const evt of visibleEvents) {
          const chip = el("span", {
            class: "rui-calendar-event",
            "data-tone": evt.tone ?? "primary",
            title: evt.time ? `${evt.time} — ${evt.title}` : evt.title,
          }, [evt.title]);
          evts.append(chip);
        }
        if (cellEvents.length > 3) {
          evts.append(el("span", { class: "rui-calendar-event-more" }, [
            `+${cellEvents.length - 3} more`,
          ]));
        }
        dayBtn.append(evts);
      }
      dayBtn.onclick = () => {
        if (onSelectState) {
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: onSelectState, value: iso }],
          });
        }
        if (isActionPayload(props.onSelect)) helpers.runAction(props.onSelect);
      };
      grid.append(dayBtn);
    }
    root.append(grid);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ActivityLog / AuditTrail — Timeline siblings
 * ----------------------------------------------------------------------- */

interface FeedEntry {
  title: string;
  description: string;
  actor: string;
  avatarSrc: string;
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
      time: asString(e.time),
      icon: asString(e.icon),
      tone: asString(e.tone, "default"),
      meta: asString(e.meta),
    });
  }
  return out;
}

function renderFeed(klass: string, items: FeedEntry[]): HTMLElement {
  const root = el("ol", { class: klass });
  for (const entry of items) {
    const li = el("li", { class: `${klass}-item`, "data-tone": entry.tone });
    const marker = el("span", { class: `${klass}-marker` });
    const iconNode = renderIcon(entry.icon, { className: `${klass}-icon` });
    if (iconNode) marker.append(iconNode);
    li.append(marker);
    const body = el("div", { class: `${klass}-body` });
    const head = el("div", { class: `${klass}-head` });
    if (entry.actor) head.append(el("span", { class: `${klass}-actor` }, [entry.actor]));
    head.append(el("span", { class: `${klass}-title` }, [entry.title]));
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
  }
  return root;
}

export const ActivityLog: ComponentSpec = {
  name: "ActivityLog",
  description:
    "Purpose-built feed of user/system activity. Each entry has `actor`, " +
    "`title`, `description?`, `time?`, `icon?`, `tone?`. Use INSTEAD of " +
    "Timeline when the feed represents who did what, when (audit logs, " +
    "comments, change history). Pass items as `{actor, title, description, " +
    "time, icon, tone, avatarSrc}` objects.",
  props: [
    { name: "items", type: "object[]" },
  ],
  render: (_node, props) => renderFeed("rui-activity-log", readFeedEntries(props.items)),
};

export const AuditTrail: ComponentSpec = {
  name: "AuditTrail",
  description:
    "Dense audit trail of system events. Same shape as `ActivityLog` but " +
    "rendered with a monospace voice and metadata column (`meta`) — use " +
    "for security logs, admin actions, and compliance dashboards.",
  props: [
    { name: "items", type: "object[]" },
  ],
  render: (_node, props) => renderFeed("rui-audit-trail", readFeedEntries(props.items)),
};

/* ----------------------------------------------------------------------- *
 * ComparisonTable — generic counterpart of PricingTable
 * ----------------------------------------------------------------------- */

export const ComparisonTable: ComponentSpec = {
  name: "ComparisonTable",
  description:
    "Feature/spec comparison table — generic counterpart of `PricingTable`. " +
    "Pass `columns` (e.g. plan/product names) and `rows` of " +
    "`{label, values}` where `values` aligns 1-to-1 with `columns`. " +
    "Each value can be a boolean (✓/—), a string, or a node.",
  props: [
    { name: "columns", type: "string[]", description: "Column headers" },
    { name: "rows", type: "object[]", description: "Array of {label, values, hint?, group?} entries" },
    { name: "highlightColumn", type: "number", optional: true, description: "0-indexed column to visually emphasise" },
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
    const root = el("div", { class: "rui-comparison-table" });
    const table = el("table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.append(el("th", { scope: "col", class: "rui-comparison-table-feature" }, ["Feature"]));
    columns.forEach((col, c) => {
      headRow.append(el("th", {
        scope: "col",
        "data-highlight": c === highlightIdx ? "true" : null,
      }, [col]));
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = el("tbody");
    let currentGroup = "";
    for (const row of rows) {
      if (row.group && row.group !== currentGroup) {
        currentGroup = row.group;
        const groupRow = el("tr", { class: "rui-comparison-table-group" });
        groupRow.append(el("td", { colspan: String(columns.length + 1) }, [row.group]));
        tbody.append(groupRow);
      }
      const tr = el("tr");
      const labelCell = el("td", { class: "rui-comparison-table-feature" });
      labelCell.append(el("div", { class: "rui-comparison-table-feature-label" }, [row.label]));
      if (row.hint) labelCell.append(el("div", { class: "rui-comparison-table-feature-hint" }, [row.hint]));
      tr.append(labelCell);
      for (let c = 0; c < columns.length; c += 1) {
        const value = row.values[c];
        const td = el("td", { "data-highlight": c === highlightIdx ? "true" : null });
        if (value === true) {
          const icon = renderIcon("circle-check", { className: "rui-comparison-yes" });
          if (icon) td.append(icon);
          else td.textContent = "✓";
        } else if (value === false || value === null || value === undefined) {
          td.append(el("span", { class: "rui-comparison-no" }, ["—"]));
        } else if (value && typeof value === "object" && (value as { __kind?: string }).__kind === "Component") {
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

export const InfiniteList: ComponentSpec = {
  name: "InfiniteList",
  description:
    "Vertical list that fires `onLoadMore` when the user scrolls near the " +
    "bottom. Pass already-rendered child nodes as `items`; the runtime is " +
    "responsible for appending more items into the bound state from the " +
    "Action (typically a `@Run(load_more)` Mutation). Use `loading=true` " +
    "to show the spinner row, `hasMore=false` to suppress further loads.",
  props: [
    { name: "items", type: "Node[]", description: "Already-rendered child nodes" },
    { name: "onLoadMore", type: "Action", optional: true, description: "Action fired when the sentinel scrolls into view" },
    { name: "loading", type: "boolean", optional: true },
    { name: "hasMore", type: "boolean", optional: true, description: "Default true — set false to hide the sentinel" },
    { name: "loaderLabel", type: "string", optional: true, description: "Label rendered while loading (default `Loading…`)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-infinite-list" });
    const list = el("div", { class: "rui-infinite-list-body" });
    for (const child of asArray(props.items)) list.append(helpers.renderNode(child));
    root.append(list);
    const hasMore = props.hasMore === undefined ? true : asBoolean(props.hasMore);
    const loading = asBoolean(props.loading);
    if (hasMore) {
      const sentinel = el("div", { class: "rui-infinite-list-sentinel" });
      if (loading) {
        const spin = renderIcon("spinner", { className: "rui-infinite-list-spin" });
        if (spin) sentinel.append(spin);
        sentinel.append(el("span", {}, [asString(props.loaderLabel, "Loading…")]));
      } else if (isActionPayload(props.onLoadMore)) {
        const btn = el("button", {
          type: "button",
          class: "rui-infinite-list-load-more",
        }, ["Load more"]);
        btn.onclick = () => helpers.runAction(props.onLoadMore);
        sentinel.append(btn);
      }
      root.append(sentinel);
      // Lightweight IntersectionObserver fallback — fires the load action
      // when the sentinel enters the viewport. Cleaned up automatically
      // when the list is unmounted.
      if (!loading && isActionPayload(props.onLoadMore) && typeof IntersectionObserver !== "undefined") {
        const action = props.onLoadMore;
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              helpers.runAction(action);
              break;
            }
          }
        });
        observer.observe(sentinel);
        helpers.registerDisposer(() => observer.disconnect(), "infinite-observer");
      }
    }
    return root;
  },
};
