/** Curated types for the components of src/library/components/canvas.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  DrawingCanvas: {
    props: {
      color: "string",
      background: "\"transparent\" | (string & {})",
      value: "string",
      onChange: "(strokeCount: number) => void",
      onEnd: "(pngDataUrl: string, strokeCount: number) => void",
      optional: "true | string",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  SignaturePad: {
    props: {
      color: "string",
      background: "\"transparent\" | (string & {})",
      value: "string",
      onChange: "(pngDataUrl: string, strokeCount: number) => void",
      optional: "true | string",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
} satisfies ComponentTypeTable;
