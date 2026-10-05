/** Curated types for the components of src/library/components/layout.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Accordion: {
    props: {
      items: "readonly (AktionNode<\"AccordionItem\"> | AktionNode<\"Fragment\"> | null | undefined)[]",
      onChange: "(title: string, open: boolean) => unknown",
    },
  },
  AccordionItem: {
    props: {
      onToggle: "(open: boolean) => unknown",
    },
  },
  AspectRatio: {
    types: {
      AspectRatioValue: "export type AspectRatioValue = number | `${number}:${number}` | `${number}/${number}` | `${number}`;",
    },
    props: {
      ratio: "AspectRatioValue",
    },
  },
  Card: {
    props: {
      onClick: "() => unknown",
    },
  },
  CardHeader: {
    props: {
      level: "2 | 3 | 4 | 5 | 6",
    },
  },
  Grid: {
    props: {
      columns: "number | Responsive<number>",
    },
  },
  GridItem: {
    types: {
      GridItemSpan: "export type GridItemSpan = number | `${number}` | `${number}/${number}` | \"auto\" | \"fit\" | \"auto-fit\" | \"full\" | \"100%\";",
    },
    props: {
      span: "GridItemSpan",
      spanAt: "Responsive<GridItemSpan>",
    },
  },
  Modal: {
    props: {
      onClose: "() => unknown",
      onRequestClose: "() => unknown",
    },
  },
  StackItem: {
    props: {
      basis: "\"auto\" | \"0\" | number | (string & {})",
    },
  },
  Steps: {
    types: {
      StepsItemStatus: "export type StepsItemStatus = \"pending\" | \"active\" | \"complete\" | \"error\";",
      StepsItemData: "export interface StepsItemData {\n  /** Step heading. */\n  readonly title: string | number;\n  /** Secondary line under the title; null/omitted renders none. */\n  readonly details?: string | number | null;\n  /** Explicit state; wins over `complete` / `active`. */\n  readonly status?: StepsItemStatus | null;\n  /** Marks a finished step (used when `status` is absent or unrecognised). */\n  readonly complete?: boolean | null;\n  /** Marks the current step (used when neither `status` nor `complete` applies). */\n  readonly active?: boolean | null;\n}",
    },
    props: {
      // A string is a title-only step and a node renders as-is; `false` /
      // `null` / `undefined` are skipped (a conditional step).
      items: "readonly (StepsItemData | AktionNode | string | number | false | null | undefined)[]",
    },
  },
  TabItem: {
    props: {
      icon: "AktionIconName",
    },
  },
  Tabs: {
    props: {
      // `false` / `null` / `undefined` are skipped (a conditional tab).
      items: "readonly (AktionNode<\"TabItem\"> | false | null | undefined)[]",
      onChange: "(value: string) => unknown",
    },
  },
} satisfies ComponentTypeTable;
