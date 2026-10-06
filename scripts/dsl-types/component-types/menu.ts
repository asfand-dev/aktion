/** Curated types for the components of src/library/components/menu.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  DropdownMenu: {
    types: {
      DropdownMenuItemFields: `export interface DropdownMenuItemFields {
  readonly onClick?: () => void;
  /** Alias of \`onClick\`. */
  readonly action?: () => void;
  /** Alias of \`onClick\`. */
  readonly onclick?: () => void;
  readonly icon?: AktionIconName;
  readonly shortcut?: string | number;
  readonly variant?: MenuItemVariant;
  /** Alias of \`variant\`. */
  readonly tone?: MenuItemVariant;
  readonly disabled?: boolean;
  readonly checked?: boolean | null;
  readonly role?: MenuItemRole;
  readonly keepOpen?: boolean;
  readonly separator?: false;
}`,
      DropdownMenuItemData: "export type DropdownMenuItemData = DropdownMenuItemFields & ({ readonly label: string | number } | { readonly title: string | number } | { readonly text: string | number });",
      DropdownMenuSeparatorData: "export type DropdownMenuSeparatorData = { readonly separator: true } | { readonly type: \"separator\" };",
      DropdownMenuLeaf: "export type DropdownMenuLeaf = AktionNode | DropdownMenuItemData | DropdownMenuSeparatorData | null | undefined;",
      // Nested arrays flatten to any depth.
      DropdownMenuEntry: "export type DropdownMenuEntry = DropdownMenuLeaf | readonly DropdownMenuEntry[];",
    },
    props: {
      items: "readonly DropdownMenuEntry[]",
      onOpenChange: "(open: boolean) => unknown",
    },
  },
  MenuItem: {
    props: {
      icon: "AktionIconName",
      onClick: "() => unknown",
    },
  },
} satisfies ComponentTypeTable;
