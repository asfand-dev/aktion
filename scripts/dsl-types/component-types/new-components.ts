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
      onSelect: "(value: string) => void",
      onClose: "(open: false) => void",
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
      onAdd: "() => void",
      onRemove: "(index: number) => void",
      onChange: "(index: number, field: string, value: string | boolean, rows: Record<string, unknown>[]) => void",
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
      onRemove: "(value: string) => void",
      onClear: "() => void",
    },
  },
  FilterPill: {
    props: {
      onToggle: "(active: boolean) => void",
    },
  },
  Gantt: {
    types: {
      GanttTaskTone: "export type GanttTaskTone = \"success\" | \"warning\" | \"danger\" | \"info\" | \"muted\";",
      GanttTask: `export interface GanttTask {
  readonly id?: string | number;
  readonly label?: string | number;
  readonly start: string;
  readonly end: string;
  readonly progress?: number;
  readonly tone?: GanttTaskTone;
}`,
    },
    props: {
      tasks: "readonly GanttTask[]",
      startDate: "string",
      endDate: "string",
      today: "boolean | string",
      onTaskClick: "(id: string) => void",
    },
  },
  IconButton: {
    props: {
      onClick: "() => void",
    },
  },
  InlineEdit: {
    types: {
      InlineEditInputType: "export type InlineEditInputType = \"text\" | \"number\" | \"email\" | \"tel\" | \"url\" | \"password\" | \"search\" | \"color\" | \"date\" | \"time\" | \"datetime-local\" | \"month\" | \"week\" | \"textarea\";",
    },
    props: {
      onSave: "(value: string) => void",
      type: "InlineEditInputType",
      onCancel: "() => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
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
      onOpen: "() => void",
      onItemClick: "(item: Item, index: number) => void",
      onMarkAllRead: "() => void",
    },
  },
  QueryBuilder: {
    types: {
      QueryBuilderOperator: "export type QueryBuilderOperator = \"equals\" | \"notEquals\" | \"contains\" | \"notContains\" | \"startsWith\" | \"endsWith\" | \"gt\" | \"gte\" | \"lt\" | \"lte\" | \"before\" | \"after\" | \"between\" | \"in\" | \"notIn\" | \"isEmpty\" | \"isNotEmpty\" | \"isTrue\" | \"isFalse\" | (string & {});",
      QueryBuilderFieldType: "export type QueryBuilderFieldType = \"text\" | \"number\" | \"date\" | \"datetime-local\" | \"time\" | \"month\" | \"week\" | \"boolean\" | \"enum\" | \"select\" | (string & {});",
      QueryBuilderOperatorDef: `export interface QueryBuilderOperatorDef {
  readonly value: QueryBuilderOperator;
  readonly label?: string | number;
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
      onChange: "(rules: QueryBuilderRule[]) => void",
      operators: "readonly (QueryBuilderOperator | QueryBuilderOperatorDef)[]",
    },
  },
  Truncate: {
    props: {
      onToggle: "(expanded: boolean) => void",
      child: "Children",
    },
  },
  VirtualGrid: {
    generics: [{ name: "Item", default: "Children", constraint: "Children" }],
    props: {
      items: "readonly Item[]",
      onItemClick: "(item: Item, index: number) => void",
      empty: "Children",
    },
  },
  VirtualList: {
    generics: [{ name: "Item", default: "unknown" }],
    props: {
      items: "readonly Item[]",
      renderItem: "(row: Item, index: number) => Children",
      onItemClick: "(row: Item, index: number) => void",
      empty: "Children",
    },
  },
} satisfies ComponentTypeTable;
