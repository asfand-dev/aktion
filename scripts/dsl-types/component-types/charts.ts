/** Curated types for the components of src/library/components/charts.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  BarChart: {
    props: {
      labels: "readonly (string | number)[]",
      height: "number | `${number}` | `${number}px`",
      onBarClick: "(label: string, value: number, seriesName: string) => void",
    },
  },
  LineChart: {
    types: {
      LineChartRow: "export interface LineChartRow {\n  /** x-axis label of this row. */\n  readonly x?: string | number;\n  /** Read as the x-axis label when `x` is absent. */\n  readonly label?: string | number;\n  /** Every other key is one line; numbers and numeric strings plot, text / null leave a gap. */\n  readonly [key: string]: string | number | null | undefined;\n}",
    },
    props: {
      labels: "readonly (string | number)[]",
      data: "readonly LineChartRow[]",
      height: "number | `${number}` | `${number}px`",
      onPointClick: "(label: string, value: number, seriesName: string) => void",
    },
  },
  PieChart: {
    props: {
      labels: "readonly (string | number)[]",
      size: "number | `${number}` | `${number}px`",
      onSliceClick: "(label: string, value: number, share: number) => void",
    },
  },
  Series: {
    types: {
      SeriesPoint: `export type SeriesPoint =
  | { readonly x: number; readonly y: number; readonly label?: string | number }
  | readonly [x: number, y: number, label?: string | number];`,
    },
    props: {
      values: "readonly number[] | readonly SeriesPoint[]",
      color: "string",
      points: "readonly SeriesPoint[]",
    },
  },
} satisfies ComponentTypeTable;
