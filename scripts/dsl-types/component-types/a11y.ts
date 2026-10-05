/** Curated types for the components of src/library/components/a11y.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  FocusTrap: {
    props: {
      child: "Children",
      onEscape: "() => void",
      autoFocus: "boolean | string",
    },
  },
  LiveRegion: {
    props: {
      text: "Children",
    },
  },
} satisfies ComponentTypeTable;
