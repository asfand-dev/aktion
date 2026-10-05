/** Curated types for the components of src/library/components/marketing.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  CodeWindow: {
    props: {
      code: "string | number | AktionNode<\"CodeBlock\">",
      language: "\"aktion\" | \"js\" | \"jsx\" | \"ts\" | \"tsx\" | \"javascript\" | \"typescript\" | \"mjs\" | \"cjs\" | \"py\" | \"python\" | \"css\" | \"scss\" | \"less\" | \"json\" | \"jsonc\" | \"html\" | \"xml\" | \"svg\" | \"vue\" | \"bash\" | \"md\" | \"yaml\" | \"sql\" | (string & {})",
    },
  },
  CountdownTimer: {
    props: {
      // null / "" while the target is still loading: the cells show `--`.
      to: "string | number | Date | null",
      onEnd: "() => unknown",
    },
  },
  FloatingActionButton: {
    props: {
      icon: "AktionIconName",
      onClick: "() => unknown",
    },
  },
  Heading: {
    props: {
      level: "1 | 2 | 3 | 4 | 5 | 6 | (number & {})",
    },
  },
  LogoChip: {
    props: {
      icon: "AktionIconName",
    },
  },
  ProductCard: {
    props: {
      price: "string | number | AktionNode",
      onAdd: "() => unknown",
      onClick: "() => unknown",
    },
  },
  QuantityStepper: {
    props: {
      onChange: "(value: number) => unknown",
    },
  },
  RelativeTime: {
    props: {
      value: "string | number | Date",
    },
  },
  SegmentedControl: {
    generics: [{ name: "V", default: "string | number", constraint: "string | number" }],
    types: {
      SegmentedControlOption: "export interface SegmentedControlOption<V extends string | number = string | number> {\n  /** Emitted, with its type, to onChange and the bound $variable; also the label when `label` is omitted. */\n  readonly value: V;\n  readonly label?: string | number;\n  /** Font Awesome icon name. */\n  readonly icon?: AktionIconName;\n  readonly disabled?: boolean;\n}",
    },
    props: {
      options: "readonly (V | SegmentedControlOption<V>)[]",
      value: "V | null",
      onChange: "(value: V) => unknown",
    },
  },
  Swatch: {
    props: {
      background: "string",
      foreground: "string",
      onClick: "(name: string) => unknown",
    },
  },
  TableOfContents: {
    types: {
      TableOfContentsItem: "export interface TableOfContentsItem {\n  readonly label: string | number;\n  /** `#fragment` scrolls to the matching id inside the app; other safe URLs navigate normally. */\n  readonly href: string;\n  /** Indent level 1–4 (clamped; default 1). */\n  readonly level?: 1 | 2 | 3 | 4 | (number & {});\n}",
    },
    props: {
      items: "readonly TableOfContentsItem[]",
      onSelect: "(href: string) => unknown",
    },
  },
  ThemeToggle: {
    props: {
      // Any theme name: the toggle compares the host's theme with these two.
      light: "BuiltInThemeName | (string & {})",
      dark: "BuiltInThemeName | (string & {})",
    },
  },
} satisfies ComponentTypeTable;
