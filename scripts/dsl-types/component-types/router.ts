/** Curated types for the components of src/library/components/router.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  NavLink: {
    props: {
      icon: "AktionIconName",
      prefetch: "(to: string) => unknown",
    },
  },
} satisfies ComponentTypeTable;
