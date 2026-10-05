/** Curated types for the components of src/library/components/feedback.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  AvatarGroup: {
    types: {
      AvatarGroupItem: `export interface AvatarGroupItem {
  readonly name?: string | number;
  readonly src?: string;
  readonly status?: AvatarStatus;
  readonly fallback?: AvatarFallback;
}`,
    },
    props: {
      items: "readonly (AktionNode<\"Avatar\"> | AvatarGroupItem | string)[]",
    },
  },
  ChatBubble: {
    props: {
      onRetry: "() => unknown",
    },
  },
  HoverCard: {
    props: {
      onOpenChange: "(open: boolean) => unknown",
    },
  },
  Popover: {
    props: {
      onOpenChange: "(open: boolean) => unknown",
    },
  },
  ProgressRing: {
    props: {
      icon: "AktionIconName",
    },
  },
  Rating: {
    props: {
      icon: "\"star\" | \"heart\" | \"thumb\" | \"fire\" | \"bolt\" | AktionIconName",
      onChange: "(value: number) => unknown",
    },
  },
  Switch: {
    props: {
      onChange: "(checked: boolean) => unknown",
    },
  },
  Toast: {
    props: {
      icon: "AktionIconName",
      onClose: "() => unknown",
    },
  },
  ToggleGroup: {
    generics: [{ name: "V", default: "string | number | boolean", constraint: "string | number | boolean" }],
    types: {
      ToggleGroupValue: "export type ToggleGroupValue = string | number | boolean;",
      ToggleGroupItemObject: `export interface ToggleGroupItemObject<V extends ToggleGroupValue = ToggleGroupValue> {
  readonly value: V;
  readonly label?: string | number;
  readonly icon?: AktionIconName;
  readonly disabled?: boolean;
}`,
      ToggleGroupItemTuple: "export type ToggleGroupItemTuple<V extends ToggleGroupValue = ToggleGroupValue> = readonly [value: V, label?: string | number, icon?: AktionIconName, disabled?: boolean];",
      ToggleGroupItem: "export type ToggleGroupItem<V extends ToggleGroupValue = ToggleGroupValue> = V | ToggleGroupItemTuple<V> | ToggleGroupItemObject<V>;",
    },
    props: {
      // The positional slot: a DOM id, or the item list itself
      // (`ToggleGroup(["Day", "Week"])` — the renderer reads it as `items`).
      id: "string | number | readonly (ToggleGroupItem<V> | readonly ToggleGroupValue[])[]",
      items: "readonly (ToggleGroupItem<V> | readonly ToggleGroupValue[])[]",
      value: "V | readonly V[] | null",
      onChange: "(value: V | V[]) => unknown",
    },
  },
  Tooltip: {
    props: {
      onOpenChange: "(open: boolean) => unknown",
    },
  },
} satisfies ComponentTypeTable;
