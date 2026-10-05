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
      // The pad's PNG data URL.
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
      // The same value `onChange` reports: `""` while the pad holds no signature.
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
} satisfies ComponentTypeTable;
