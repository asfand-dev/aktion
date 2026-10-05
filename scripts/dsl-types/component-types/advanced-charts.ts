/** Curated types for the components of src/library/components/advanced-charts.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Gauge: {
    types: {
      GaugeThreshold: "export type GaugeThreshold = { readonly value: number; readonly tone?: GaugeTone } | { readonly at: number; readonly tone?: GaugeTone };",
    },
    props: {
      thresholds: "readonly GaugeThreshold[]",
    },
  },
  Heatmap: {
    props: {
      xLabels: "readonly (string | number)[]",
      yLabels: "readonly (string | number)[]",
      onCellClick: "(value: number, xLabel: string, yLabel: string) => void",
    },
  },
  Histogram: {
    types: {
      HistogramBin: "export interface HistogramBin { readonly label: string | number; readonly count: number }",
    },
    props: {
      bins: "readonly HistogramBin[]",
      height: "number | `${number}px`",
      onBinClick: "(binLabel: string, count: number, binIndex: number) => void",
    },
  },
  RadarChart: {
    props: {
      axes: "readonly (string | number)[]",
      size: "number | `${number}px`",
    },
  },
  ScatterChart: {
    props: {
      height: "number | `${number}px`",
      onPointClick: "(x: number, y: number, label: string, seriesName: string) => void",
    },
  },
} satisfies ComponentTypeTable;
