/** Curated types for the components of src/library/components/data.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Col: {
    generics: [{ name: "Value", default: "unknown" }],
    props: {
      values: "readonly Value[]",
      render: "(value: Value, index: number, row: Record<string, unknown>) => AktionChild | readonly AktionChild[]",
      onClick: "(value: Value, index: number, row: Record<string, unknown>) => void",
      currency: "\"USD\" | \"EUR\" | \"GBP\" | \"CHF\" | (string & {})",
      width: "string",
      locale: "string",
      pinned: "\"left\"",
      minWidth: "`${number}px`",
      maxWidth: "`${number}px`",
    },
  },
  List: {
    types: {
      ListItemData: `export type ListItemData = {
  readonly description?: string | number;
  readonly meta?: string | number;
  readonly subtitle?: string | number;
  readonly hint?: string | number;
  readonly icon?: string;
  readonly tone?: ListItemTone;
  readonly active?: boolean;
  readonly selected?: boolean;
} & ({ readonly title: string | number } | { readonly label: string | number } | { readonly name: string | number } | { readonly text: string | number });`,
    },
    props: {
      items: "readonly (AktionNode<\"ListItem\"> | ListItemData | string | number | null | undefined)[]",
    },
  },
  ListItem: {
    props: {
      onClick: "() => void",
    },
  },
  Sparkline: {
    props: {
      values: "readonly (number | null | undefined)[]",
    },
  },
  StatCard: {
    props: {
      icon: "\"none\" | (string & {}) | false",
      spark: "readonly (number | null | undefined)[]",
      onClick: "() => void",
    },
  },
  Table: {
    props: {
      columns: "readonly (AktionNode<\"Col\"> | null | undefined)[]",
      maxHeight: "string",
      onRowClick: "(rowIndex: number, row: Record<string, unknown>) => void",
      locale: "string",
    },
  },
  Tree: {
    props: {
      onSelect: "(nodeId: string) => void",
      expandedIds: "readonly (string | number)[]",
      checkedIds: "readonly (string | number)[]",
      onCheck: "(checkedIds: string[]) => void",
    },
  },
  TreeNode: {
    props: {
      onClick: "() => void",
      onToggle: "(open: boolean) => void",
    },
  },
} satisfies ComponentTypeTable;
