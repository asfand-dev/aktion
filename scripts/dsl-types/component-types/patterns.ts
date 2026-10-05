/** Curated types for the components of src/library/components/patterns.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  ActionStripe: {
    props: {
      onClick: "() => void",
    },
  },
  AppShell: {
    props: {
      onSidebarOpenChange: "(open: boolean) => void",
    },
  },
  Banner: {
    props: {
      onDismiss: "() => void",
      onClick: "() => void",
    },
  },
  DescriptionItem: {
    props: {
      value: "Children",
    },
  },
  DescriptionList: {
    props: {
      columns: "1 | 2",
    },
  },
  FeatureItem: {
    props: {
      onClick: "() => void",
    },
  },
  Hero: {
    props: {
      overlay: "number | `${number}`",
    },
  },
  KanbanBoard: {
    props: {
      onCardMove: "(cardTitle: string, toColumn: string, fromColumn: string) => void",
    },
  },
  KanbanCard: {
    props: {
      onClick: "() => void",
    },
  },
  MediaCard: {
    props: {
      ratio: "`${number}:${number}` | `${number}` | number",
      onClick: "() => void",
    },
  },
  Notification: {
    props: {
      onClick: "() => void",
      onDismiss: "() => void",
    },
  },
  PageHeader: {
    types: {
      PageHeaderCrumb: "export type PageHeaderCrumb = {\n  /** Router path (`/orders`); renders a `#/orders` link and navigates via the runtime router. */\n  readonly to?: string;\n  /** Second spelling of `to` — also a ROUTER path, not an external URL. */\n  readonly href?: string;\n  /** Third spelling of `to`. */\n  readonly path?: string;\n} & (\n  | {\n      /** Crumb text. */\n      readonly label: string | number;\n      readonly title?: string | number;\n    }\n  | {\n      /** Second spelling of `label` (read when `label` is absent). */\n      readonly title: string | number;\n    }\n);",
    },
    props: {
      breadcrumbs: "readonly (string | number | PageHeaderCrumb | AktionNode)[] | AktionNode<\"Breadcrumb\"> | false",
      status: "AktionNode<\"Badge\"> | AktionNode<\"Pill\"> | AktionNode<\"StatusDot\">",
      onCrumbClick: "(label: string, index: number) => void",
    },
  },
  PersonChip: {
    props: {
      onClick: "() => void",
    },
  },
  PricingCard: {
    props: {
      features: "readonly (string | { readonly label: string; readonly included?: boolean })[]",
    },
  },
  SidebarItem: {
    props: {
      onClick: "() => void",
    },
  },
  Stats: {
    types: {
      StatsItem: `export interface StatsItem {
  readonly label: string;
  readonly value: string | number;
  readonly hint?: string;
  /** Colours the value and sparkline; anything else renders unstyled. */
  readonly tone?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  /** Sparkline points; drawn when two or more are finite. */
  readonly spark?: readonly number[];
}`,
    },
    props: {
      items: "readonly (StatsItem | AktionNode<\"StatCard\">)[]",
      columns: "1 | 2 | 3 | 4 | 5 | 6",
    },
  },
  Tile: {
    props: {
      onClick: "() => void",
    },
  },
  TimelineItem: {
    props: {
      onClick: "() => void",
    },
  },
  Toolbar: {
    props: {
      onSearch: "(query: string) => void",
    },
  },
} satisfies ComponentTypeTable;
