/** Curated types for the components of src/library/components/feedback.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Avatar: {
    props: {
      size: "AvatarSize",
    },
  },
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
      size: "AvatarGroupSize",
    },
  },
  ChatBubble: {
    props: {
      onRetry: "() => void",
    },
  },
  HoverCard: {
    props: {
      width: "string",
      onOpenChange: "(open: boolean) => void",
    },
  },
  Kbd: {
    props: {
      size: "KbdSize",
    },
  },
  Popover: {
    props: {
      width: "string",
      onOpenChange: "(open: boolean) => void",
    },
  },
  ProgressRing: {
    props: {
      size: "ProgressRingSize | number",
    },
  },
  Rating: {
    props: {
      size: "RatingSize",
      icon: "\"star\" | \"heart\" | \"thumb\" | \"fire\" | \"bolt\" | (string & {})",
      onChange: "(value: number) => void",
    },
  },
  Switch: {
    props: {
      onChange: "(checked: boolean) => void",
    },
  },
  Toast: {
    props: {
      onClose: "() => void",
    },
  },
  ToggleGroup: {
    generics: [{ name: "V", default: "string | number | boolean", constraint: "string | number | boolean" }],
    types: {
      ToggleGroupValue: "export type ToggleGroupValue = string | number | boolean;",
      ToggleGroupItemObject: `export interface ToggleGroupItemObject<V extends ToggleGroupValue = ToggleGroupValue> {
  readonly value: V;
  readonly label?: string | number;
  readonly icon?: string;
  readonly disabled?: boolean;
}`,
      ToggleGroupItemTuple: "export type ToggleGroupItemTuple<V extends ToggleGroupValue = ToggleGroupValue> = readonly [value: V, label?: string | number, icon?: string, disabled?: boolean];",
      ToggleGroupItem: "export type ToggleGroupItem<V extends ToggleGroupValue = ToggleGroupValue> = V | ToggleGroupItemTuple<V> | ToggleGroupItemObject<V>;",
    },
    props: {
      items: "readonly (ToggleGroupItem<V> | readonly ToggleGroupValue[])[]",
      value: "V | readonly V[] | null",
      size: "ToggleGroupSize",
      onChange: "(value: V | V[]) => void",
    },
  },
  Tooltip: {
    props: {
      onOpenChange: "(open: boolean) => void",
    },
  },
} satisfies ComponentTypeTable;
