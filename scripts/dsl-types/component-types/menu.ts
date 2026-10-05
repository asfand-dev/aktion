/** Curated types for the components of src/library/components/menu.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  DropdownMenu: {
    types: {
      DropdownMenuItemFields: `export interface DropdownMenuItemFields {
  readonly onClick?: () => void;
  readonly action?: () => void;
  readonly icon?: string;
  readonly shortcut?: string | number;
  readonly variant?: MenuItemVariant;
  readonly disabled?: boolean;
  readonly checked?: boolean | null;
  readonly role?: MenuItemRole;
  readonly keepOpen?: boolean;
  readonly separator?: false;
}`,
      DropdownMenuItemData: "export type DropdownMenuItemData = DropdownMenuItemFields & ({ readonly label: string | number } | { readonly title: string | number } | { readonly text: string | number });",
      DropdownMenuSeparatorData: "export type DropdownMenuSeparatorData = { readonly separator: true } | { readonly type: \"separator\" };",
      DropdownMenuLeaf: "export type DropdownMenuLeaf = AktionNode | DropdownMenuItemData | DropdownMenuSeparatorData | null | undefined;",
      DropdownMenuEntry: "export type DropdownMenuEntry = DropdownMenuLeaf | readonly (DropdownMenuLeaf | readonly (DropdownMenuLeaf | readonly (DropdownMenuLeaf | readonly DropdownMenuLeaf[])[])[])[];",
    },
    props: {
      items: "readonly DropdownMenuEntry[]",
      onOpenChange: "(open: boolean) => void",
    },
  },
  MenuItem: {
    props: {
      onClick: "() => void",
    },
  },
} satisfies ComponentTypeTable;
