/** Curated types for the components of src/library/components/new-components.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  CommandPalette: {
    types: {
      CommandPaletteItem: `export interface CommandPaletteItem {
  readonly label: string | number;
  readonly value?: string | number;
  readonly group?: string | number;
  readonly shortcut?: string | number;
  readonly action?: () => void;
}`,
    },
    props: {
      items: "readonly (CommandPaletteItem | string | number)[]",
      onSelect: "(value: string) => unknown",
      onClose: "(open: false) => unknown",
    },
  },
  FieldRepeater: {
    generics: [{ name: "Item", default: "Record<string, unknown>", constraint: "object" }],
    types: {
      FieldRepeaterFieldType: "export type FieldRepeaterFieldType = \"text\" | \"number\" | \"email\" | \"tel\" | \"url\" | \"password\" | \"search\" | \"color\" | \"date\" | \"time\" | \"datetime-local\" | \"month\" | \"week\" | \"checkbox\" | \"textarea\" | \"select\";",
      FieldRepeaterOption: "export type FieldRepeaterOption = string | number | { readonly label: string | number; readonly value?: string | number };",
      FieldRepeaterField: `export interface FieldRepeaterField<Row extends object = Record<string, unknown>> {
  readonly name: (keyof Row & string) | (string & {});
  readonly label?: string | number;
  readonly type?: FieldRepeaterFieldType;
  readonly options?: readonly FieldRepeaterOption[];
  readonly placeholder?: string | number;
}`,
    },
    props: {
      items: "readonly Item[]",
      fields: "readonly (FieldRepeaterField<Item> | (keyof Item & string) | (string & {}))[]",
      onAdd: "() => unknown",
      onRemove: "(index: number) => unknown",
      onChange: "(index: number, field: string, value: string | boolean, rows: Record<string, unknown>[]) => unknown",
    },
  },
  FilterChips: {
    types: {
      FilterChipsChip: `export interface FilterChipsChip {
  readonly label: string | number;
  readonly value?: string | number;
}`,
    },
    props: {
      chips: "readonly (FilterChipsChip | string | number)[]",
      onRemove: "(value: string) => unknown",
      onClear: "() => unknown",
    },
  },
  FilterPill: {
    props: {
      onToggle: "(active: boolean) => unknown",
    },
  },
  Gantt: {
    types: {
      GanttTaskTone: "export type GanttTaskTone = \"success\" | \"warning\" | \"danger\" | \"info\" | \"muted\";",
      GanttTask: `export interface GanttTask {
  readonly id?: string | number;
  readonly label?: string | number;
  /** Read as the bar label when \`label\` is absent. */
  readonly name?: string | number;
  readonly start: string;
  readonly end: string;
  readonly progress?: number;
  readonly tone?: GanttTaskTone;
  /** Read as the tone when \`tone\` is absent. */
  readonly status?: GanttTaskTone;
}`,
    },
    props: {
      tasks: "readonly GanttTask[]",
      startDate: "string",
      endDate: "string",
      onTaskClick: "(id: string) => unknown",
    },
  },
  IconButton: {
    props: {
      onClick: "() => unknown",
    },
  },
  InlineEdit: {
    types: {
      InlineEditInputType: "export type InlineEditInputType = \"text\" | \"number\" | \"email\" | \"tel\" | \"url\" | \"password\" | \"search\" | \"color\" | \"date\" | \"time\" | \"datetime-local\" | \"month\" | \"week\" | \"textarea\";",
    },
    props: {
      onSave: "(value: string) => unknown",
      type: "InlineEditInputType",
      onCancel: "() => unknown",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
    },
  },
  JsonTree: {
    props: {
      data: "unknown",
    },
  },
  NotificationBell: {
    generics: [{ name: "Item", default: "NotificationBellItem", constraint: "NotificationBellItem" }],
    types: {
      NotificationBellItem: `export interface NotificationBellItem {
  readonly title: string | number;
  readonly message?: string | number;
  readonly time?: string | number;
  readonly href?: string;
  readonly unread?: boolean;
}`,
    },
    props: {
      items: "readonly Item[]",
      onOpen: "() => unknown",
      onItemClick: "(item: Item, index: number) => unknown",
      onMarkAllRead: "() => unknown",
    },
  },
  QueryBuilder: {
    types: {
      QueryBuilderOperator: "export type QueryBuilderOperator = \"equals\" | \"notEquals\" | \"contains\" | \"notContains\" | \"startsWith\" | \"endsWith\" | \"gt\" | \"gte\" | \"lt\" | \"lte\" | \"before\" | \"after\" | \"between\" | \"in\" | \"notIn\" | \"isEmpty\" | \"isNotEmpty\" | \"isTrue\" | \"isFalse\" | (string & {});",
      QueryBuilderFieldType: "export type QueryBuilderFieldType = \"text\" | \"number\" | \"date\" | \"datetime-local\" | \"time\" | \"month\" | \"week\" | \"boolean\" | \"enum\" | \"select\" | (string & {});",
      QueryBuilderOperatorDef: `export interface QueryBuilderOperatorDef {
  readonly value: QueryBuilderOperator;
  readonly label?: string | number;
  /** Scopes the operator to fields of this \`type\` (compared case-insensitively). */
  readonly type?: QueryBuilderFieldType;
}`,
      QueryBuilderField: `export interface QueryBuilderField {
  readonly name: string;
  readonly label?: string | number;
  readonly type?: QueryBuilderFieldType;
  readonly operators?: readonly (QueryBuilderOperator | QueryBuilderOperatorDef)[];
}`,
      QueryBuilderRule: `export interface QueryBuilderRule {
  readonly field?: string;
  readonly op?: QueryBuilderOperator;
  readonly value?: string | number;
  readonly combinator?: "and" | "or";
}`,
    },
    props: {
      fields: "readonly (QueryBuilderField | string)[]",
      value: "readonly QueryBuilderRule[]",
      onChange: "(rules: QueryBuilderRule[]) => unknown",
      operators: "readonly (QueryBuilderOperator | QueryBuilderOperatorDef)[]",
    },
  },
  Truncate: {
    props: {
      onToggle: "(expanded: boolean) => unknown",
      child: "Children",
    },
  },
  VirtualGrid: {
    generics: [{ name: "Item", default: "Children", constraint: "Children" }],
    props: {
      items: "readonly Item[]",
      onItemClick: "(item: Item, index: number) => unknown",
      empty: "Children",
    },
  },
  VirtualList: {
    generics: [{ name: "Item", default: "unknown" }],
    props: {
      items: "readonly Item[]",
      renderItem: "(row: Item, index: number) => Children",
      onItemClick: "(row: Item, index: number) => unknown",
      empty: "Children",
    },
  },
} satisfies ComponentTypeTable;
