/** Curated types for the components of src/library/components/chat.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  ActionLink: {
    props: {
      onClick: "() => unknown",
    },
  },
  FollowUpBlock: {
    props: {
      items: "readonly (AktionNode<\"FollowUpItem\"> | FollowUpItemData | string)[]",
      onSelect: "(message: string, label: string) => unknown",
    },
  },
  ListBlock: {
    props: {
      items: "readonly (AktionNode | string | number)[]",
    },
  },
  SectionBlock: {
    props: {
      level: "2 | 3 | 4 | 5 | 6",
    },
  },
} satisfies ComponentTypeTable;
