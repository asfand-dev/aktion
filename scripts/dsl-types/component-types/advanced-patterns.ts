/** Curated types for the components of src/library/components/advanced-patterns.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Drawer: {
    props: {
      onClose: "() => void",
    },
  },
  InboxPanel: {
    types: {
      InboxPanelItem: "export interface InboxPanelItem {\n  /** Headline of the notification row. */\n  readonly title: string | number;\n  /** Body text (omitted when empty). */\n  readonly message?: string | number;\n  /** Relative or absolute timestamp (omitted when empty). */\n  readonly time?: string | number;\n  /** Font Awesome icon shown in the coloured disc. Omit it and the row shows no icon (InboxPanel does not apply Notification's `bell` default). */\n  readonly icon?: string;\n  readonly tone?: NotificationTone;\n  /** Groups the row under the Unread heading and highlights it. */\n  readonly unread?: boolean;\n  /** Avatar URL, shown instead of `icon`. */\n  readonly avatarSrc?: string;\n  /** Fired (no arguments) when the row is clicked or activated with Enter / Space. */\n  readonly onClick?: () => void;\n  /** Alias of `onClick` (read only when `onClick` is absent). */\n  readonly action?: () => void;\n  /** Buttons rendered inside the row; their clicks do not trigger `onClick`. */\n  readonly actions?: Children;\n}",
    },
    props: {
      items: "readonly InboxPanelItem[]",
      onMarkAllRead: "() => void",
    },
  },
  MasonryGrid: {
    props: {
      columns: "number | Responsive<number>",
    },
  },
  OnboardingChecklist: {
    types: {
      OnboardingChecklistItem: "export interface OnboardingChecklistItem {\n  readonly title: string | number;\n  readonly description?: string | number;\n  /** Marks the step complete; progress and `onComplete` are derived from it. */\n  readonly done?: boolean;\n  /** Fired (no arguments) by the step's button; the button exists only when this is a function. */\n  readonly onClick?: () => void;\n  /** Alias of `onClick` (read only when `onClick` is absent). */\n  readonly action?: () => void;\n  /** Button label (default \"Start\", or \"Review\" for a done step). */\n  readonly cta?: string | number;\n}",
    },
    props: {
      items: "readonly OnboardingChecklistItem[]",
      onDismiss: "() => void",
      onComplete: "() => void",
    },
  },
  ResizablePanels: {
    props: {
      onResize: "(primaryPercent: number) => void",
    },
  },
  Spotlight: {
    props: {
      onClose: "() => void",
      target: "string",
    },
  },
  Tour: {
    types: {
      TourStep: `export interface TourStep {
  readonly title: string | number;
  readonly description?: string | number;
  /** CSS selector shown on the card as "Target: …" for reference (not highlighted). */
  readonly target?: string;
}`,
    },
    props: {
      steps: "readonly (TourStep | string)[]",
      current: "number",
      onOpenChange: "(open: false) => void",
      onComplete: "() => void",
      onSkip: "(stepIndex: number) => void",
    },
  },
} satisfies ComponentTypeTable;
