/** Curated types for the components of src/library/components/extras.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  BottomSheet: {
    props: {
      onClose: "() => void",
    },
  },
  Confetti: {
    props: {
      onDone: "() => void",
    },
  },
  ConfirmDialog: {
    props: {
      onConfirm: "() => void",
      onCancel: "() => void",
    },
  },
  Lottie: {
    props: {
      data: "Readonly<Record<string, unknown>> | { readonly v?: string; readonly fr?: number; readonly ip?: number; readonly op?: number; readonly w?: number; readonly h?: number; readonly nm?: string; readonly layers?: readonly unknown[]; readonly assets?: readonly unknown[] }",
      onComplete: "() => void",
      onError: "(reason: \"missing-library\" | \"load-failed\") => void",
    },
  },
  OrderSummary: {
    types: {
      OrderSummaryItem: "export interface OrderSummaryItem {\n  readonly label: string | number;\n  /** A number or numeric string is money-formatted; any other string (\"Free\") is shown verbatim. */\n  readonly amount: string | number;\n  /** Shown as \" ×N\" when > 0. */\n  readonly qty?: number;\n  /** Synonym of `qty`. */\n  readonly quantity?: number;\n}",
    },
    props: {
      items: "readonly OrderSummaryItem[]",
      currency: "\"$\" | \"€\" | \"£\" | \"USD\" | \"EUR\" | \"GBP\" | (string & {})",
    },
  },
  PresenceAvatars: {
    generics: [{ name: "Person", default: "PresenceAvatarsPerson", constraint: "PresenceAvatarsPerson" }],
    types: {
      PresenceAvatarsPerson: `export interface PresenceAvatarsPerson {
  /** Display name: tooltip, accessible name and initials fallback. */
  readonly name: string;
  /** Avatar image URL (http(s), data:image, blob or relative). A load error falls back to initials. */
  readonly src?: string;
  /** Shows the online dot and counts toward the "N of M people online" label. */
  readonly online?: boolean;
}`,
    },
    props: {
      people: "readonly Person[]",
      onClick: "(person: Person) => void",
    },
  },
  ScrollSpy: {
    types: {
      ScrollSpySection: "export interface ScrollSpySection {\n  /** Id of the target element, matched verbatim (the universal `id`/`anchor` prop only sets ids that start with a letter and contain letters, digits, `_` or `-`). */\n  readonly id: string;\n  readonly label: string;\n}",
    },
    props: {
      sections: "readonly ScrollSpySection[]",
      onChange: "(id: string) => void",
    },
  },
  Sheet: {
    props: {
      onClose: "() => void",
    },
  },
  SpeedDial: {
    types: {
      SpeedDialAction: "export interface SpeedDialAction {\n  /** Accessible name and tooltip of the mini-action button. */\n  readonly label: string;\n  /** Icon name (default \"circle\"). */\n  readonly icon?: string;\n  /** Runs on click; the dial then closes. */\n  readonly onClick?: () => void;\n  /** Synonym of `onClick` (used only when `onClick` is absent). */\n  readonly action?: () => void;\n}",
    },
    props: {
      actions: "readonly SpeedDialAction[]",
      onOpenChange: "(open: boolean) => void",
    },
  },
  Svg: {
    types: {
      SvgPreserveAspectRatioAlign: "export type SvgPreserveAspectRatioAlign = \"none\" | \"xMinYMin\" | \"xMidYMin\" | \"xMaxYMin\" | \"xMinYMid\" | \"xMidYMid\" | \"xMaxYMid\" | \"xMinYMax\" | \"xMidYMax\" | \"xMaxYMax\";",
    },
    props: {
      viewBox: "string",
      fill: "\"currentColor\" | \"none\" | (string & {})",
      stroke: "\"currentColor\" | \"none\" | (string & {})",
      preserveAspectRatio: "SvgPreserveAspectRatioAlign | `${SvgPreserveAspectRatioAlign} ${\"meet\" | \"slice\"}`",
    },
  },
  VariantSelector: {
    types: {
      VariantSelectorOption: "export type VariantSelectorOption =\n  | {\n      /** Value written to `value` / passed to onChange (stringified). */\n      readonly value: string | number;\n      /** Visible text (swatch tooltip / accessible name); defaults to `value`. */\n      readonly label?: string | number;\n      /** Swatch colour (CSS colour) for `kind: \"swatch\"`; defaults to `value`. */\n      readonly color?: string;\n      readonly disabled?: boolean;\n    }\n  | {\n      readonly value?: string | number;\n      readonly label: string | number;\n      readonly color?: string;\n      readonly disabled?: boolean;\n    };",
    },
    props: {
      options: "readonly (string | number | VariantSelectorOption)[]",
      value: "string | number | readonly (string | number)[]",
      onChange: "(value: string | string[]) => void",
    },
  },
} satisfies ComponentTypeTable;
