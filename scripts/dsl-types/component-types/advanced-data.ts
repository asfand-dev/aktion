/** Curated types for the components of src/library/components/advanced-data.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  ActivityLog: {
    // The author's own entry type flows to `onItemClick`, which receives that
    // very object — extra fields (an `id`) included.
    generics: [{ name: "Item", default: "ActivityLogItem", constraint: "ActivityLogItem" }],
    types: {
      ActivityLogItem: "export interface ActivityLogItem {\n  readonly title: string | number;\n  readonly actor?: string | number;\n  readonly description?: string | number;\n  /** Time label, e.g. `\"2h ago\"`. */\n  readonly time?: string;\n  /** Font Awesome icon name (or a literal glyph) for the marker; ignored when `avatarSrc` is set. */\n  readonly icon?: AktionIconName;\n  /** Image URL rendered in the marker instead of the icon. */\n  readonly avatarSrc?: string;\n  readonly tone?: ActivityLogItemTone;\n  /** Renders the title as a link (takes precedence over `onItemClick`, which a link never fires). */\n  readonly href?: string;\n  /** Secondary detail line (IP, browser, request id); monospace under `variant: \"audit\"`. */\n  readonly meta?: string | number;\n}",
      ActivityLogItemTone: "export type ActivityLogItemTone = \"default\" | \"primary\" | \"success\" | \"warning\" | \"danger\";",
      // An empty literal (`ActivityLog([], …)`) infers `Item = never`, which
      // would make every read of the callback's `item` an error.
      ActivityLogItemOf: "/** The entry type `onItemClick` receives: the inferred one, or `ActivityLogItem` when nothing was inferred (an empty list). */\nexport type ActivityLogItemOf<T> = [T] extends [never] ? ActivityLogItem : T;",
    },
    props: {
      // Entries that are not objects are skipped (they still count for `index`).
      items: "readonly (Item | null | undefined)[]",
      onItemClick: "((index: number, item: ActivityLogItemOf<Item>) => unknown)",
    },
  },
  CalendarView: {
    // As ActivityLog: `onEventClick` hands back the author's own event object.
    generics: [{ name: "Item", default: "CalendarViewEvent", constraint: "CalendarViewEvent" }],
    types: {
      CalendarViewWeekday: "export type CalendarViewWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;",
      CalendarViewEvent: "export interface CalendarViewEvent {\n  /** ISO day `YYYY-MM-DD`; only the first 10 characters are matched, so `YYYY-MM-DDTHH:mm` also works. Events without a date are skipped. */\n  readonly date: string;\n  readonly title: string | number;\n  /** Passed to `onEventClick` (as a string) as its first argument; defaults to `${date}#${index}`. */\n  readonly id?: string | number;\n  /** Time label shown in the chip tooltip (`time — title`). */\n  readonly time?: string;\n  /** Chip colour (default `\"primary\"`). */\n  readonly tone?: CalendarViewEventTone;\n}",
      CalendarViewEventTone: "export type CalendarViewEventTone = \"primary\" | \"success\" | \"warning\" | \"danger\" | \"info\";",
      CalendarViewEventOf: "/** The event type `onEventClick` receives: the inferred one, or `CalendarViewEvent` when nothing was inferred (an empty list). */\nexport type CalendarViewEventOf<T> = [T] extends [never] ? CalendarViewEvent : T;",
    },
    props: {
      value: "string",
      month: "string",
      // Entries that are not objects are skipped (they still count for the default id).
      events: "readonly (Item | null | undefined)[]",
      firstDay: "CalendarViewWeekday",
      onSelect: "((date: string) => unknown)",
      onMonthChange: "((anchor: string) => unknown)",
      onEventClick: "((eventId: string, event: CalendarViewEventOf<Item>) => unknown)",
      min: "string",
      max: "string",
    },
  },
  ComparisonTable: {
    types: {
      ComparisonTableValue: "/** One comparison cell: `true` → ✓, `false` / null / undefined → —, a component node renders, anything else is shown as text. */\nexport type ComparisonTableValue = AktionChild | boolean;",
      ComparisonTableRow: "export interface ComparisonTableRow {\n  /** Feature label (first column). */\n  readonly label: string | number;\n  /** One value per entry of `columns`, in the same order. */\n  readonly values: readonly ComparisonTableValue[];\n  /** Secondary line under the label. */\n  readonly hint?: string | number;\n  /** Rows sharing a group are kept together under one group header row. */\n  readonly group?: string | number;\n}",
    },
    props: {
      columns: "readonly (string | number)[]",
      rows: "readonly ComparisonTableRow[]",
    },
  },
  DataGrid: {
    types: {
      DataGridSortDirection: "export type DataGridSortDirection = \"asc\" | \"desc\";",
      DataGridSort: "export interface DataGridSort {\n  /** Column key: the `Col` header, or `col-<index>` for a column whose header is empty or repeats an earlier column's. */\n  readonly key: string;\n  /** Sort direction; anything other than `\"desc\"` sorts ascending (default `\"asc\"`). */\n  readonly direction?: DataGridSortDirection;\n}",
    },
    props: {
      columns: "readonly (AktionNode<\"Col\"> | null | undefined)[]",
      rowIds: "readonly (string | number)[]",
      sort: "DataGridSort | null",
      selectedIds: "readonly string[]",
      onRowClick: "(rowIndex: number, row: Readonly<Record<string, unknown>>, rowId: string) => unknown",
      onSort: "(columnKey: string, direction: DataGridSortDirection) => unknown",
      onSelectionChange: "(selectedIds: string[]) => unknown",
      onPerPageChange: "(perPage: number) => unknown",
      globalSearch: "string",
      onGlobalSearch: "(term: string) => unknown",
      onColumnMenuOpenChange: "(open: boolean) => unknown",
      columnMenuAnchor: "string",
    },
  },
  InfiniteList: {
    types: {
      InfiniteListRootMargin: "/** IntersectionObserver margin: a number of px, or 1–4 space-separated px / % lengths (CSS margin order). Any other unit falls back to the default `200px`. */\nexport type InfiniteListRootMargin =\n  | number\n  | InfiniteListRootMarginLength\n  | `${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength}`\n  | `${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength}`\n  | `${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength}`;",
      InfiniteListRootMarginLength: "export type InfiniteListRootMarginLength = `${number}px` | `${number}%`;",
    },
    props: {
      onLoadMore: "(() => unknown)",
      onRetry: "(() => unknown)",
      rootMargin: "InfiniteListRootMargin",
    },
  },
} satisfies ComponentTypeTable;
