/** Curated types for the components of src/library/components/content.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  BadgeList: {
    props: {
      labels: "readonly (string | number)[]",
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
      width: "string",
      height: "string",
    },
  },
  Container: {
    props: {
      maxWidth: "string",
    },
  },
  Icon: {
    props: {
      size: "\"xs\" | \"sm\" | \"md\" | \"lg\" | \"xl\"",
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
