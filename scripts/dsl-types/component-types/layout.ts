/** Curated types for the components of src/library/components/layout.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Accordion: {
    props: {
      items: "readonly (AktionNode<\"AccordionItem\"> | AktionNode<\"Fragment\"> | null | undefined)[]",
      onChange: "(title: string, open: boolean) => void",
    },
  },
  AccordionItem: {
    props: {
      onToggle: "(open: boolean) => void",
    },
  },
  AspectRatio: {
    types: {
      AspectRatioValue: "export type AspectRatioValue = number | `${number}:${number}` | `${number}`;",
    },
    props: {
      ratio: "AspectRatioValue",
    },
  },
  Box: {
    props: {
      maxWidth: "string",
      radius: "\"none\" | \"sm\" | \"md\" | \"lg\" | \"pill\"",
    },
  },
  Card: {
    props: {
      onClick: "() => void",
    },
  },
  CardHeader: {
    props: {
      level: "2 | 3 | 4 | 5 | 6",
    },
  },
  Center: {
    props: {
      minHeight: "string",
    },
  },
  Grid: {
    props: {
      columns: "number | Responsive<number>",
      minChildWidth: "string",
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
      size: "\"sm\" | \"md\" | \"lg\" | \"xl\" | \"full\"",
      onClose: "() => void",
      onRequestClose: "() => void",
    },
  },
  ScrollArea: {
    props: {
      maxHeight: "string",
      height: "string",
    },
  },
  StackItem: {
    props: {
      basis: "\"auto\" | \"0\" | 0 | (string & {})",
      minWidth: "string",
      maxWidth: "string",
    },
  },
  Steps: {
    types: {
      StepsItemStatus: "export type StepsItemStatus = \"pending\" | \"active\" | \"complete\" | \"error\";",
      StepsItemData: "export interface StepsItemData {\n  /** Step heading. */\n  readonly title: string | number;\n  /** Secondary line under the title; null/omitted renders none. */\n  readonly details?: string | number | null;\n  /** Explicit state; wins over `complete` / `active`. */\n  readonly status?: StepsItemStatus | null;\n  /** Marks a finished step (used when `status` is absent or unrecognised). */\n  readonly complete?: boolean | null;\n  /** Marks the current step (used when neither `status` nor `complete` applies). */\n  readonly active?: boolean | null;\n}",
    },
    props: {
      items: "readonly (StepsItemData | string | number)[]",
    },
  },
  Tabs: {
    props: {
      onChange: "(value: string) => void",
    },
  },
} satisfies ComponentTypeTable;
