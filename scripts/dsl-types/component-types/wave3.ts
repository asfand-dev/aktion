/** Curated types for the components of src/library/components/wave3.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Cart: {
    types: {
      CartItem: "export interface CartItem {\n  /** Passed to `onQty` / `onRemove` (as a string). */\n  readonly id: string | number;\n  readonly name: string;\n  /** Unit price, formatted with `currency`. */\n  readonly price: number;\n  readonly qty: number;\n  /** Thumbnail URL. */\n  readonly image?: string;\n  /** Caps the + stepper (available stock). */\n  readonly max?: number;\n}",
    },
    props: {
      items: "readonly CartItem[]",
      onQty: "(id: string, qty: number) => void",
      onRemove: "(id: string) => void",
      currency: "string",
    },
  },
  LiveCursor: {
    props: {
      color: "string",
    },
  },
  QRCode: {
    props: {
      color: "string",
      background: "\"transparent\" | (string & {})",
    },
  },
  ReactionPicker: {
    types: {
      ReactionPickerReaction: "export interface ReactionPickerReaction {\n  readonly emoji: string;\n  /** Shown when > 0. */\n  readonly count?: number;\n  /** Pressed state (`aria-pressed`). */\n  readonly active?: boolean;\n  /** Tooltip and accessible name (\"You and 2 others\"). */\n  readonly label?: string;\n}",
    },
    props: {
      reactions: "readonly ReactionPickerReaction[]",
      onReact: "(emoji: string) => void",
    },
  },
  TabBar: {
    types: {
      TabBarItem: "export interface TabBarItem {\n  /** Compared with `active` and passed to `onChange` (as a string). */\n  readonly id: string | number;\n  readonly label: string;\n  /** Font Awesome icon name. */\n  readonly icon?: string;\n  readonly badge?: string | number;\n  /** A leading \"/\" is a router path (`#/path`); anything else is a sanitised URL. */\n  readonly href?: string;\n  readonly disabled?: boolean;\n}",
    },
    props: {
      items: "readonly TabBarItem[]",
      onChange: "(id: string) => void",
    },
  },
} satisfies ComponentTypeTable;
