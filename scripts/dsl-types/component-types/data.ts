/** Curated types for the components of src/library/components/data.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Col: {
    generics: [{ name: "Value", default: "unknown" }],
    props: {
      values: "readonly Value[]",
      render: "(value: Value, index: number, row: Record<string, unknown>) => AktionChild | readonly AktionChild[]",
      onClick: "(value: Value, index: number, row: Record<string, unknown>) => unknown",
      currency: "\"USD\" | \"EUR\" | \"GBP\" | \"CHF\" | (string & {})",
      locale: "string",
    },
  },
  List: {
    types: {
      ListItemData: `export type ListItemData = {
  readonly description?: string | number;
  readonly meta?: string | number;
  readonly subtitle?: string | number;
  readonly hint?: string | number;
  readonly icon?: AktionIconName;
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
      icon: "AktionIconName",
      onClick: "() => unknown",
    },
  },
  Sparkline: {
    props: {
      values: "readonly (number | null | undefined)[]",
    },
  },
  StatCard: {
    props: {
      icon: "\"none\" | AktionIconName | false",
      spark: "readonly (number | null | undefined)[]",
      onClick: "() => unknown",
    },
  },
  Table: {
    props: {
      columns: "readonly (AktionNode<\"Col\"> | null | undefined)[]",
      onRowClick: "(rowIndex: number, row: Record<string, unknown>) => unknown",
      locale: "string",
    },
  },
  Tree: {
    props: {
      onSelect: "(nodeId: string) => unknown",
      expandedIds: "readonly (string | number)[]",
      checkedIds: "readonly (string | number)[]",
      onCheck: "(checkedIds: string[]) => unknown",
    },
  },
  TreeNode: {
    props: {
      icon: "AktionIconName",
      onClick: "() => unknown",
      onToggle: "(open: boolean) => unknown",
    },
  },
} satisfies ComponentTypeTable;
