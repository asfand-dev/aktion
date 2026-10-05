/** Curated types for the components of src/library/components/editors.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  CodeEditor: {
    props: {
      onChange: "(source: string) => unknown",
      onSave: "(source: string) => unknown",
      optional: "boolean | string",
    },
  },
  ColorPicker: {
    props: {
      value: "string",
      onChange: "(color: string) => unknown",
      optional: "boolean | string",
    },
  },
  ContextMenu: {
    types: {
      ContextMenuItemData: `export interface ContextMenuItemData {
  /** Row text. An object without a label is ignored. */
  readonly label: string | number;
  /** Runs when the row is activated (after the menu closes, unless \`keepOpen\`). Not called for disabled rows. */
  readonly onClick?: () => void;
  /** Synonym of \`onClick\` (used only when \`onClick\` is absent). */
  readonly action?: () => void;
  readonly icon?: string;
  /** Trailing shortcut hint, e.g. "⌘C". */
  readonly shortcut?: string;
  readonly variant?: MenuItemVariant;
  /** Synonym of \`variant\` (used only when \`variant\` is absent). */
  readonly tone?: MenuItemVariant;
  /** Row stays focusable (aria-disabled) but does nothing. */
  readonly disabled?: boolean;
  /** Makes the row checkable (\`menuitemcheckbox\`, unless \`role\` says radio) and shows this state. */
  readonly checked?: boolean;
  readonly role?: MenuItemRole;
  /** Leave the menu open after the row is activated (a toggle flipped several times). */
  readonly keepOpen?: boolean;
  readonly separator?: false;
}`,
      ContextMenuSeparatorData: `export interface ContextMenuSeparatorData {
  readonly separator: true;
}`,
    },
    props: {
      // `false` / `null` / `undefined` are skipped (a conditional row); any other
      // component node is ignored at runtime, so the types refuse it.
      items: "readonly (AktionNode<\"MenuItem\"> | AktionNode<\"MenuSeparator\"> | ContextMenuItemData | ContextMenuSeparatorData | false | null | undefined)[]",
      onOpenChange: "(open: boolean) => unknown",
    },
  },
  RichTextEditor: {
    props: {
      onChange: "(html: string) => unknown",
      optional: "boolean | string",
    },
  },
} satisfies ComponentTypeTable;
