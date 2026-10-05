/** Curated types for the components of src/library/components/marketing.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  BrowserFrame: {
    props: {
      height: "string",
    },
  },
  CodeWindow: {
    props: {
      code: "string | AktionNode<\"CodeBlock\">",
      language: "\"aktion\" | \"js\" | \"jsx\" | \"ts\" | \"tsx\" | \"javascript\" | \"typescript\" | \"mjs\" | \"cjs\" | \"py\" | \"python\" | \"css\" | \"scss\" | \"less\" | \"json\" | \"jsonc\" | \"html\" | \"xml\" | \"svg\" | \"vue\" | \"bash\" | \"md\" | \"yaml\" | \"sql\" | (string & {})",
      height: "string",
      maxHeight: "string",
    },
  },
  CountdownTimer: {
    props: {
      to: "string | number | Date",
      onEnd: "() => void",
    },
  },
  Display: {
    props: {
      size: "\"hero\" | \"xl\" | \"lg\"",
    },
  },
  FloatingActionButton: {
    props: {
      onClick: "() => void",
    },
  },
  Heading: {
    props: {
      level: "1 | 2 | 3 | 4 | 5 | 6 | (number & {})",
      size: "\"section\" | \"lg\" | \"md\" | \"sm\"",
    },
  },
  OverlayItem: {
    props: {
      offset: "string",
    },
  },
  ProductCard: {
    props: {
      onAdd: "() => void",
      onClick: "() => void",
    },
  },
  QuantityStepper: {
    props: {
      onChange: "(value: number) => void",
    },
  },
  RelativeTime: {
    props: {
      value: "string | number | Date",
    },
  },
  Section: {
    props: {
      width: "\"sm\" | \"md\" | \"lg\" | \"xl\" | \"full\"",
    },
  },
  SegmentedControl: {
    types: {
      SegmentedControlOption: "export interface SegmentedControlOption {\n  /** Emitted (stringified) to onChange and the bound $variable; also the label when `label` is omitted. */\n  readonly value: string | number;\n  readonly label?: string | number;\n  /** Font Awesome icon name. */\n  readonly icon?: string;\n  readonly disabled?: boolean;\n}",
    },
    props: {
      options: "readonly (string | number | SegmentedControlOption)[]",
      onChange: "(value: string) => void",
    },
  },
  Swatch: {
    props: {
      background: "string",
      foreground: "string",
      onClick: "(name: string) => void",
    },
  },
  TableOfContents: {
    types: {
      TableOfContentsItem: "export interface TableOfContentsItem {\n  readonly label: string | number;\n  /** `#fragment` scrolls to the matching id inside the app; other safe URLs navigate normally. */\n  readonly href: string;\n  /** Indent level 1–4 (clamped; default 1). */\n  readonly level?: 1 | 2 | 3 | 4 | (number & {});\n}",
    },
    props: {
      items: "readonly TableOfContentsItem[]",
      onSelect: "(href: string) => void",
    },
  },
  Terminal: {
    props: {
      height: "string",
      maxHeight: "string",
    },
  },
  ThemeToggle: {
    props: {
      light: "Exclude<BuiltInThemeName, `${string}dark${string}`>",
      dark: "Extract<BuiltInThemeName, `${string}dark${string}`>",
    },
  },
} satisfies ComponentTypeTable;
