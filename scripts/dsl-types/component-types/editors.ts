/** Curated types for the components of src/library/components/editors.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  CodeEditor: {
    props: {
      minHeight: "string",
      onChange: "(source: string) => void",
      maxHeight: "string",
      onSave: "(source: string) => void",
    },
  },
  ColorPicker: {
    props: {
      value: "string",
      onChange: "(color: string) => void",
    },
  },
  ContextMenu: {
    types: {
      ContextMenuItemData: `export interface ContextMenuItemData {
  readonly label: string | number;
  /** Runs when the row is activated (after the menu closes). Not called for disabled rows. */
  readonly action?: () => void;
  readonly icon?: string;
  /** Trailing shortcut hint, e.g. "⌘C". */
  readonly shortcut?: string;
  readonly variant?: MenuItemVariant;
  /** Row stays focusable (aria-disabled) but does nothing. */
  readonly disabled?: boolean;
  readonly separator?: false;
}`,
      ContextMenuSeparatorData: `export interface ContextMenuSeparatorData {
  readonly separator: true;
}`,
    },
    props: {
      items: "readonly (AktionNode<\"MenuItem\"> | AktionNode<\"MenuSeparator\"> | ContextMenuItemData | ContextMenuSeparatorData | null | undefined)[]",
      onOpenChange: "(open: boolean) => void",
    },
  },
  RichTextEditor: {
    props: {
      minHeight: "string",
      onChange: "(html: string) => void",
      maxHeight: "string",
    },
  },
} satisfies ComponentTypeTable;
