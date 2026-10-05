/** Curated types for the components of src/library/components/advanced-data.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  ActivityLog: {
    types: {
      ActivityLogItem: "export interface ActivityLogItem {\n  readonly title: string | number;\n  readonly actor?: string | number;\n  readonly description?: string | number;\n  /** Time label, e.g. `\"2h ago\"`. */\n  readonly time?: string;\n  /** Font Awesome icon name (or a literal glyph) for the marker; ignored when `avatarSrc` is set. */\n  readonly icon?: string;\n  /** Image URL rendered in the marker instead of the icon. */\n  readonly avatarSrc?: string;\n  readonly tone?: ActivityLogItemTone;\n  /** Renders the title as a link (takes precedence over `onItemClick`). */\n  readonly href?: string;\n  /** Secondary detail line (IP, browser, request id); monospace under `variant: \"audit\"`. */\n  readonly meta?: string | number;\n}",
      ActivityLogItemInfo: "export interface ActivityLogItemInfo {\n  readonly title: string;\n  readonly description: string;\n  readonly actor: string;\n  readonly avatarSrc: string;\n  readonly href: string;\n  readonly time: string;\n  readonly icon: string;\n  /** `\"default\"` when the item had no tone. */\n  readonly tone: string;\n  readonly meta: string;\n}",
      ActivityLogItemTone: "export type ActivityLogItemTone = \"default\" | \"primary\" | \"success\" | \"warning\" | \"danger\";",
    },
    props: {
      items: "readonly ActivityLogItem[]",
      onItemClick: "((index: number, item: ActivityLogItemInfo) => void)",
    },
  },
  CalendarView: {
    types: {
      CalendarViewWeekday: "export type CalendarViewWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;",
      CalendarViewEvent: "export interface CalendarViewEvent {\n  /** ISO day `YYYY-MM-DD`; only the first 10 characters are matched, so `YYYY-MM-DDTHH:mm` also works. Events without a date are skipped. */\n  readonly date: string;\n  readonly title: string | number;\n  /** Passed back to `onEventClick`; defaults to `${date}#${index}`. */\n  readonly id?: string | number;\n  /** Time label shown in the chip tooltip (`time — title`). */\n  readonly time?: string;\n  /** Chip colour (default `\"primary\"`). */\n  readonly tone?: CalendarViewEventTone;\n}",
      CalendarViewEventInfo: "export interface CalendarViewEventInfo {\n  readonly id: string;\n  readonly date: string;\n  readonly title: string;\n  /** `\"\"` when the event had no time. */\n  readonly time: string;\n  /** The event's tone, `\"primary\"` when it had none. */\n  readonly tone: string;\n}",
      CalendarViewEventTone: "export type CalendarViewEventTone = \"primary\" | \"success\" | \"warning\" | \"danger\" | \"info\";",
    },
    props: {
      value: "string",
      month: "string",
      events: "readonly CalendarViewEvent[]",
      firstDay: "CalendarViewWeekday",
      onSelect: "((date: string) => void)",
      onMonthChange: "((anchor: string) => void)",
      onEventClick: "((eventId: string, event: CalendarViewEventInfo) => void)",
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
      DataGridSort: "export interface DataGridSort {\n  /** Column key: the `Col` header, or `col-<index>` for a column whose header is empty. */\n  readonly key: string;\n  /** Sort direction; anything other than `\"desc\"` sorts ascending (default `\"asc\"`). */\n  readonly direction?: DataGridSortDirection;\n}",
    },
    props: {
      columns: "readonly (AktionNode<\"Col\"> | null | undefined)[]",
      rowIds: "readonly (string | number)[]",
      sort: "DataGridSort | null",
      selectedIds: "readonly string[]",
      onRowClick: "(rowIndex: number, row: Readonly<Record<string, unknown>>, rowId: string) => void",
      maxHeight: "string",
      onSort: "(columnKey: string, direction: DataGridSortDirection) => void",
      onSelectionChange: "(selectedIds: string[]) => void",
      onPerPageChange: "(perPage: number) => void",
      globalSearch: "string",
      onGlobalSearch: "(term: string) => void",
      onColumnMenuOpenChange: "(open: boolean) => void",
      columnMenuAnchor: "string",
    },
  },
  InfiniteList: {
    types: {
      InfiniteListRootMargin: "/** IntersectionObserver margin: 1–4 space-separated px / % lengths (CSS margin order). Any other unit throws. */\nexport type InfiniteListRootMargin =\n  | InfiniteListRootMarginLength\n  | `${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength}`\n  | `${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength}`\n  | `${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength} ${InfiniteListRootMarginLength}`;",
      InfiniteListRootMarginLength: "export type InfiniteListRootMarginLength = `${number}px` | `${number}%`;",
    },
    props: {
      onLoadMore: "(() => void)",
      onRetry: "(() => void)",
      rootMargin: "InfiniteListRootMargin",
    },
  },
} satisfies ComponentTypeTable;
