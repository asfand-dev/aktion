/** Curated types for the components of src/library/components/canvas.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  DrawingCanvas: {
    props: {
      color: "string",
      background: "\"transparent\" | (string & {})",
      value: "string",
      onChange: "(strokeCount: number) => unknown",
      onEnd: "(pngDataUrl: string, strokeCount: number) => unknown",
      // The pad's PNG data URL.
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
    },
  },
  SignaturePad: {
    props: {
      color: "string",
      background: "\"transparent\" | (string & {})",
      value: "string",
      onChange: "(pngDataUrl: string, strokeCount: number) => unknown",
      // The same value `onChange` reports: `""` while the pad holds no signature.
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
    },
  },
} satisfies ComponentTypeTable;
