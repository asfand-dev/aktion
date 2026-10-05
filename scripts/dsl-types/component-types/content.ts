/** Curated types for the components of src/library/components/content.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  BadgeList: {
    props: {
      // An empty or missing label renders no pill but keeps its index, so
      // `tones` / `icons` stay aligned with `labels` as written.
      labels: "readonly (string | number | null | undefined)[]",
      tones: "readonly (BadgeListTone | null | undefined)[]",
      icons: "readonly (string | null | undefined)[]",
    },
  },
  Callout: {
    props: {
      icon: "string | number | false",
      onDismiss: "() => void",
    },
  },
  CodeBlock: {
    types: {
      CodeBlockLanguage: "export type CodeBlockLanguage = \"aktion\" | \"js\" | \"jsx\" | \"ts\" | \"tsx\" | \"javascript\" | \"typescript\" | \"mjs\" | \"cjs\" | \"py\" | \"python\" | \"css\" | \"scss\" | \"less\" | \"json\" | \"jsonc\" | \"html\" | \"xml\" | \"svg\" | \"vue\" | (string & {});",
    },
    props: {
      language: "CodeBlockLanguage",
    },
  },
  Icon: {
    props: {
      color: "string",
    },
  },
  Image: {
    props: {
      ratio: "AspectRatioValue",
      onClick: "() => void",
    },
  },
  Text: {
    props: {
      style: "string",
    },
  },
  TextContent: {
    props: {
      style: "string",
    },
  },
} satisfies ComponentTypeTable;
