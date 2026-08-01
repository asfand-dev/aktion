/**
 * Chart components: Series (data definition), BarChart, LineChart, PieChart.
 *
 * The charts are rendered as inline SVG so they work inside the shadow root
 * without any external dependency.
 *
 * Everything under "Shared chart primitives" at the bottom of the file is
 * exported and reused by `advanced-charts.ts`. The two files used to carry
 * their own copies of the SVG factory, legend, tick drawing and label planner,
 * which is why the label-overlap fix landed in one file and not the other.
 */

import type { ComponentSpec, PropSpec } from "../types.js";
import { el, asArray, asString, asNumber, asBoolean } from "../utils.js";

export const PALETTE: readonly string[] = [
  "var(--rui-chart-1, #6366f1)",
  "var(--rui-chart-2, #10b981)",
  "var(--rui-chart-3, #f59e0b)",
  "var(--rui-chart-4, #ef4444)",
  "var(--rui-chart-5, #06b6d4)",
  "var(--rui-chart-6, #8b5cf6)",
];

export const colorAt = (index: number): string => PALETTE[index % PALETTE.length] ?? PALETTE[0]!;

/** Tone tokens the charts accept. */
export const CHART_TONES = ["primary", "success", "warning", "danger", "info"] as const;

/**
 * Resolve a `tone` prop to a known token before it is interpolated into a
 * `var(--rui-color-…)` reference. The schema validator only enum-checks string
 * *literals*, so a tone that arrives from a `$variable` or an expression never
 * reaches that check — and the interpolated value lands in an inline `style`
 * attribute, where a `;` would open a second declaration.
 */
export function resolveTone(raw: unknown, fallback = "primary"): string {
  const token = asString(raw).trim().toLowerCase();
  return (CHART_TONES as readonly string[]).includes(token) ? token : fallback;
}

/** Placeholder copy for the two async states every chart can be in. */
export const EMPTY_TEXT = "No data";
export const LOADING_TEXT = "Loading…";

/**
 * The accessibility controls every chart shares. Read them with
 * `readChartA11y` and apply them with `nameChart` (both below, in "Shared
 * chart primitives").
 *
 * Spread these at the END of a chart's `props` array: the evaluator binds
 * positional arguments in declaration order, so inserting them any earlier
 * would silently rebind every documented call signature.
 */
export const CHART_A11Y_PROPS: readonly PropSpec[] = [
  {
    name: "ariaLabel",
    type: "string",
    optional: true,
    aliases: ["alt"],
    description:
      "Accessible name for the graphic, overriding the generated one — the way " +
      "to name a chart that has no visible `title`",
  },
  {
    name: "decorative",
    type: "boolean",
    optional: true,
    description:
      "Take the graphic out of the accessibility tree. Only for a chart that " +
      "repeats information already present in the surrounding text",
  },
];

export const Series: ComponentSpec = {
  name: "Series",
  description:
    "Named data series for charts. Used inside BarChart, LineChart, " +
    "PieChart, RadarChart and ScatterChart — the chart reads the series " +
    "definition itself, so a Series is never placed on its own. Pass " +
    "`values` for numeric charts, `points` for ScatterChart, and `color` " +
    "to override this series' palette slot.",
  props: [
    { name: "name", type: "string" },
    {
      name: "values",
      type: "number[]",
      optional: true,
      description: "One value per x-axis label (ScatterChart also accepts its {x, y} points here)",
    },
    {
      name: "color",
      type: "string",
      optional: true,
      description: "Override the palette colour for this series (any CSS colour or var())",
    },
    {
      name: "points",
      type: "{x: number, y: number, label?: string}[]",
      optional: true,
      description: "XY points for ScatterChart — the explicit alternative to passing them as `values`",
    },
  ],
  render: (_node, props) => {
    // Charts read their Series out of `node.args` (see `readSeries`) and never
    // render the child, so reaching this path means the Series was written
    // outside a chart's `series` prop. That used to emit an invisible empty
    // span and the data just disappeared; say so instead.
    const name = asString(props.name) || "Series";
    return el("span", { class: "rui-chart-empty rui-series", "data-name": name }, [
      `Series "${name}" is not inside a chart — pass it to a chart's \`series\` prop.`,
    ]);
  },
};

export interface SeriesData {
  name: string;
  values: number[];
  /** Author-supplied override for this series' palette colour. */
  color?: string;
}

export const readSeries = (raw: unknown[]): SeriesData[] => {
  return raw.map((s, i) => {
    const node = s as { args?: unknown[] };
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const values = asArray<unknown>(node.args?.[1]).map((v) => asNumber(v));
    const color = asString(node.args?.[2]).trim();
    return color ? { name, values, color } : { name, values };
  });
};

/** The part of a series the legend and colour lookup need. */
export interface SeriesStyle {
  name: string;
  color?: string;
}

/** A series' own colour when it declares one, its palette slot otherwise. */
export const seriesColor = (series: SeriesStyle, index: number): string =>
  series.color || colorAt(index);

export const BarChart: ComponentSpec = {
  name: "BarChart",
  description:
    "Bar chart. `labels` define the category axis, `series` define the bars. " +
    "Pass `stacked: true` to stack the series instead of grouping them, " +
    "`horizontal: true` when the category names are too long for a vertical " +
    "axis, and `onBarClick(label, value, seriesName)` for drill-down.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "series", type: "Series[]" },
    { name: "title", type: "string", optional: true },
    { name: "stacked", type: "boolean", optional: true, description: "Stack the series on top of each other instead of grouping them side by side" },
    { name: "horizontal", type: "boolean", optional: true, description: "Draw the bars left-to-right — the readable layout for long category names" },
    { name: "xAxisLabel", type: "string", optional: true, description: "Caption for the category axis" },
    { name: "yAxisLabel", type: "string", optional: true, description: "Caption for the value axis (e.g. \"Revenue (EUR)\")" },
    { name: "showLegend", type: "boolean", optional: true, description: "Render the series legend (default true)" },
    { name: "height", type: "number", optional: true, description: "Plot height in px (default 240)" },
    { name: "loading", type: "boolean", optional: true, description: "Render a loading placeholder instead of the plot" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there is no data (default \"No data\")" },
    { name: "onBarClick", type: "callable", optional: true, description: "(label, value, seriesName) => void, fired when a bar is activated" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props, helpers) => {
    const labels = asArray<unknown>(props.labels).map((l) => asString(l));
    const series = readSeries(asArray<unknown>(props.series));
    const title = asString(props.title);
    const a11y = readChartA11y(props, typeof props.onBarClick === "function");
    const stacked = asBoolean(props.stacked);
    const horizontal = asBoolean(props.horizontal);
    const showLegend = props.showLegend == null ? true : asBoolean(props.showLegend);
    const onBarClick = props.onBarClick;
    const root = el("div", { class: "rui-chart rui-bar-chart" });
    if (title) root.append(el("div", { class: "rui-chart-title" }, [title]));
    if (asBoolean(props.loading)) return chartPlaceholder(root, LOADING_TEXT, true);
    if (!series.some((s) => s.values.length > 0)) {
      return chartPlaceholder(root, asString(props.emptyText) || EMPTY_TEXT, false);
    }

    // Bars are indexed by category, so the category count has to cover the
    // longest series. Deriving it from `labels` alone placed every value past
    // the last label outside the viewBox, where it silently vanished.
    const groupCount = Math.max(labels.length, ...series.map((s) => s.values.length));
    const categories = Array.from({ length: groupCount }, (_, i) => labels[i] ?? `#${i + 1}`);
    const stackTotals = categories.map((_, gIdx) =>
      series.reduce((acc, s) => acc + Math.max(0, s.values[gIdx] ?? 0), 0));
    const max = stacked
      ? Math.max(1, ...stackTotals)
      : Math.max(1, ...series.flatMap((s) => s.values));

    const xAxisLabel = asString(props.xAxisLabel);
    const yAxisLabel = asString(props.yAxisLabel);
    const width = 640;
    const height = readChartHeight(props.height, 240);
    const valueGutter = tickGutter(0, max);
    const svg = horizontal
      ? renderHorizontalBars({
        width, height, categories, series, stacked, max,
        categoryGutter: Math.max(48, Math.min(180, longestLabelPx(categories, 18) + 12)),
        valueGutter, xAxisLabel, yAxisLabel, helpers, onBarClick,
      })
      : renderVerticalBars({
        width, height, categories, series, stacked, max,
        valueGutter, xAxisLabel, yAxisLabel, helpers, onBarClick,
      });
    nameChart(svg, a11y, chartLabel(
      horizontal ? "Horizontal bar chart" : "Bar chart",
      title,
      `${series.length} series across ${categories.length} categories.`,
    ));
    if (height !== 240) svg.setAttribute("style", `max-height:${height}px`);

    root.append(svg);
    if (!a11y.decorative) {
      root.append(chartTable(
        title || "Bar chart data",
        categories,
        series.map((s) => ({
          label: s.name,
          cells: categories.map((_, i) => cellText(s.values[i])),
        })),
      ));
    }
    if (showLegend && series.length > 0) root.append(legend(series));
    return root;
  },
};

interface BarLayout {
  width: number;
  height: number;
  categories: string[];
  series: SeriesData[];
  stacked: boolean;
  max: number;
  valueGutter: number;
  categoryGutter?: number;
  xAxisLabel: string;
  yAxisLabel: string;
  helpers: { invoke: (callable: unknown, ...args: unknown[]) => void };
  onBarClick: unknown;
}

function renderVerticalBars(layout: BarLayout): SVGSVGElement {
  const {
    width, height, categories, series, stacked, max, valueGutter,
    xAxisLabel, yAxisLabel, helpers, onBarClick,
  } = layout;
  const padding = {
    left: valueGutter + (yAxisLabel ? AXIS_CAPTION_PX : 0),
    right: 12,
    top: 12,
    bottom: 0,
  };
  const innerWidth = width - padding.left - padding.right;
  const labelPlan = planLabels(categories, innerWidth);
  padding.bottom = labelPlan.bottomPadding + (xAxisLabel ? AXIS_CAPTION_PX : 0);
  const innerHeight = height - padding.top - padding.bottom;
  const svg = createSvg(width, height);

  drawAxes(svg, padding, innerWidth, innerHeight, max);

  const groupWidth = innerWidth / Math.max(categories.length, 1);
  const barWidth = stacked
    ? groupWidth * 0.7
    : (groupWidth * 0.7) / Math.max(series.length, 1);
  // Stacked bars grow upward from the previous series' top edge.
  const stackTop = categories.map(() => 0);

  series.forEach((s, sIdx) => {
    categories.forEach((label, gIdx) => {
      const raw = s.values[gIdx];
      if (raw === undefined) return;
      const value = stacked ? Math.max(0, raw) : raw;
      const barHeight = Math.max(0, (value / max) * innerHeight);
      const x = stacked
        ? padding.left + gIdx * groupWidth + groupWidth * 0.15
        : padding.left + gIdx * groupWidth + groupWidth * 0.15 + sIdx * barWidth;
      const base = padding.top + innerHeight - stackTop[gIdx]!;
      const y = base - barHeight;
      if (stacked) stackTop[gIdx] = stackTop[gIdx]! + barHeight;
      const rect = svgEl("rect", {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: Math.max(barWidth - 2, 1).toFixed(1),
        height: barHeight.toFixed(1),
        fill: seriesColor(s, sIdx),
        rx: "2",
      });
      rect.append(svgEl("title", {}, [`${s.name} — ${label}: ${raw}`]));
      if (typeof onBarClick === "function") {
        makeActivatable(rect, `${s.name} — ${label}: ${raw}`, () => {
          helpers.invoke(onBarClick, label, raw, s.name);
        });
      }
      svg.append(rect);
    });
  });

  drawXAxisLabels(svg, categories, padding, innerHeight, labelPlan,
    (i) => padding.left + (i + 0.5) * groupWidth);
  drawAxisCaptions(svg, padding, innerWidth, innerHeight, height, xAxisLabel, yAxisLabel);
  return svg;
}

function renderHorizontalBars(layout: BarLayout): SVGSVGElement {
  const {
    width, height, categories, series, stacked, max, valueGutter,
    categoryGutter = 60, xAxisLabel, yAxisLabel, helpers, onBarClick,
  } = layout;
  // The axes swap roles in horizontal mode — categories run down the left edge
  // and values along the bottom — so each caption's gutter swaps with it.
  // Reserving them the vertical way round drew the rotated caption on top of
  // the category labels.
  const padding = {
    left: categoryGutter + (xAxisLabel ? AXIS_CAPTION_PX : 0),
    right: Math.max(16, valueGutter / 2),
    top: 12,
    bottom: 28 + (yAxisLabel ? AXIS_CAPTION_PX : 0),
  };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const svg = createSvg(width, height);

  drawValueTicks(svg, padding, innerWidth, innerHeight, max);

  const rowHeight = innerHeight / Math.max(categories.length, 1);
  const barHeight = stacked
    ? rowHeight * 0.7
    : (rowHeight * 0.7) / Math.max(series.length, 1);
  const stackLeft = categories.map(() => 0);
  const categoryChars = Math.max(4, Math.floor((categoryGutter - 10) / APPROX_CHAR_PX));

  categories.forEach((label, gIdx) => {
    const rowTop = padding.top + gIdx * rowHeight;
    const display = truncateLabel(label, categoryChars);
    const text = svgEl("text", {
      x: (padding.left - 8).toFixed(1),
      y: (rowTop + rowHeight / 2 + 3).toFixed(1),
      "text-anchor": "end",
      class: "rui-chart-label",
    }, [display]);
    if (display !== label) text.append(svgEl("title", {}, [label]));
    svg.append(text);
  });

  series.forEach((s, sIdx) => {
    categories.forEach((label, gIdx) => {
      const raw = s.values[gIdx];
      if (raw === undefined) return;
      const value = stacked ? Math.max(0, raw) : raw;
      const barWidth = Math.max(0, (value / max) * innerWidth);
      const rowTop = padding.top + gIdx * rowHeight;
      const y = stacked
        ? rowTop + rowHeight * 0.15
        : rowTop + rowHeight * 0.15 + sIdx * barHeight;
      const x = padding.left + stackLeft[gIdx]!;
      if (stacked) stackLeft[gIdx] = stackLeft[gIdx]! + barWidth;
      const rect = svgEl("rect", {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: barWidth.toFixed(1),
        height: Math.max(barHeight - 2, 1).toFixed(1),
        fill: seriesColor(s, sIdx),
        rx: "2",
      });
      rect.append(svgEl("title", {}, [`${s.name} — ${label}: ${raw}`]));
      if (typeof onBarClick === "function") {
        makeActivatable(rect, `${s.name} — ${label}: ${raw}`, () => {
          helpers.invoke(onBarClick, label, raw, s.name);
        });
      }
      svg.append(rect);
    });
  });

  // The axes swap roles in horizontal mode: the categories run down the left
  // edge and the values along the bottom, so the captions swap with them.
  drawAxisCaptions(svg, padding, innerWidth, innerHeight, height, yAxisLabel, xAxisLabel);
  return svg;
}

export const LineChart: ComponentSpec = {
  name: "LineChart",
  description:
    "Line chart. `labels` define the x-axis, each Series is a line. As a " +
    "shortcut you can pass `data=[{x: \"Jan\", revenue: 12, signups: 4}, …]` " +
    "and the labels + series will be derived automatically (one line per " +
    "non-`x` numeric key; a row that omits a key leaves a gap in that line). " +
    "Use `data` when the dataset is already row-shaped; use `series` when " +
    "you have explicit Series objects.",
  props: [
    { name: "labels", type: "string[]", optional: true },
    { name: "series", type: "Series[]", optional: true },
    { name: "data", type: "{x: string, [key: string]: number}[]", optional: true, description: "Row-shaped data — labels and series are auto-derived" },
    { name: "title", type: "string", optional: true },
    { name: "filled", type: "boolean", optional: true, description: "Fill the area beneath each line (area-chart style)" },
    { name: "stacked", type: "boolean", optional: true, description: "Stack series when filled=true" },
    { name: "yMin", type: "number", optional: true, description: "Pin the bottom of the value axis (default 0 or the data minimum)" },
    { name: "yMax", type: "number", optional: true, description: "Pin the top of the value axis (default the data maximum)" },
    { name: "xAxisLabel", type: "string", optional: true, description: "Caption for the x axis" },
    { name: "yAxisLabel", type: "string", optional: true, description: "Caption for the value axis (e.g. \"requests/sec\")" },
    { name: "showLegend", type: "boolean", optional: true, description: "Render the series legend (default true)" },
    { name: "height", type: "number", optional: true, description: "Plot height in px (default 240)" },
    { name: "loading", type: "boolean", optional: true, description: "Render a loading placeholder instead of the plot" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there is no data (default \"No data\")" },
    { name: "onPointClick", type: "callable", optional: true, description: "(label, value, seriesName) => void, fired when a data point is activated" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props, helpers) => {
    let labels = asArray<unknown>(props.labels).map((l) => asString(l));
    let series: LineSeries[] = readSeries(asArray<unknown>(props.series));
    // Row-shaped shorthand: pull labels from `x` and one Series per other key.
    const rows = asArray<unknown>(props.data);
    if (rows.length > 0 && (labels.length === 0 || series.length === 0)) {
      const derived = deriveRowSeries(rows);
      if (labels.length === 0) labels = derived.labels;
      if (series.length === 0) series = derived.series;
    }
    const title = asString(props.title);
    const a11y = readChartA11y(props, typeof props.onPointClick === "function");
    const filled = asBoolean(props.filled);
    const stacked = asBoolean(props.stacked);
    const showLegend = props.showLegend == null ? true : asBoolean(props.showLegend);
    const onPointClick = props.onPointClick;
    const root = el("div", { class: "rui-chart rui-line-chart" });
    if (title) root.append(el("div", { class: "rui-chart-title" }, [title]));
    if (asBoolean(props.loading)) return chartPlaceholder(root, LOADING_TEXT, true);
    if (!series.some((s) => s.values.some((v) => v !== null && v !== undefined))) {
      return chartPlaceholder(root, asString(props.emptyText) || EMPTY_TEXT, false);
    }

    const pointCount = Math.max(labels.length, ...series.map((s) => s.values.length), 1);
    const stackedValues: number[][] = series.map(() => Array(pointCount).fill(0));
    if (filled && stacked) {
      for (let i = 0; i < pointCount; i += 1) {
        let acc = 0;
        series.forEach((s, sIdx) => {
          acc += s.values[i] ?? 0;
          stackedValues[sIdx]![i] = acc;
        });
      }
    }

    const all = filled && stacked
      ? stackedValues.flat()
      : series.flatMap((s) => s.values).filter((v): v is number => v !== null && v !== undefined);
    const yMin = props.yMin == null ? null : asNumber(props.yMin);
    const yMax = props.yMax == null ? null : asNumber(props.yMax);
    const min = yMin ?? (filled && stacked ? 0 : Math.min(0, ...all));
    let max = yMax ?? Math.max(1, ...all);
    if (max <= min) max = min + 1;

    const xAxisLabel = asString(props.xAxisLabel);
    const yAxisLabel = asString(props.yAxisLabel);
    const width = 640;
    const height = readChartHeight(props.height, 240);
    const padding = {
      left: tickGutter(min, max) + (yAxisLabel ? AXIS_CAPTION_PX : 0),
      right: 12,
      top: 12,
      bottom: 0,
    };
    const innerWidth = width - padding.left - padding.right;
    // Labels and points must share one x-scale: sizing the label plan from
    // `labels.length` while plotting from `pointCount` put every tick label
    // under the wrong point as soon as a series was longer than `labels`.
    const labelPlan = planLabels(labels, innerWidth, pointCount);
    padding.bottom = labelPlan.bottomPadding + (xAxisLabel ? AXIS_CAPTION_PX : 0);
    const innerHeight = height - padding.top - padding.bottom;
    const svg = createSvg(width, height);
    nameChart(svg, a11y, chartLabel(
      filled ? "Area chart" : "Line chart",
      title,
      `${series.length} series across ${pointCount} points.`,
    ));
    if (height !== 240) svg.setAttribute("style", `max-height:${height}px`);

    drawAxes(svg, padding, innerWidth, innerHeight, max, min);

    const stepX = innerWidth / Math.max(pointCount - 1, 1);
    const xForPoint = (i: number): number => padding.left + i * stepX;
    const yFor = (value: number): number =>
      padding.top + innerHeight - ((value - min) / (max - min)) * innerHeight;

    series.forEach((s, sIdx) => {
      const stroke = seriesColor(s, sIdx);
      const values: (number | null)[] = filled && stacked ? stackedValues[sIdx]! : s.values;
      const baseline = filled && stacked && sIdx > 0 ? stackedValues[sIdx - 1]! : null;
      const points = values.map((value, i) =>
        value === null || value === undefined ? null : [xForPoint(i), yFor(value), i] as const);
      // A missing value breaks the line rather than dragging it to zero, so
      // each contiguous run is drawn (and filled) on its own.
      const runs = splitRuns(points);
      if (filled) {
        for (const run of runs) {
          if (run.length === 0) continue;
          let area = run.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          if (baseline) {
            area += " " + run.slice().reverse()
              .map(([x, , i]) => `L${x.toFixed(1)},${yFor(baseline[i] ?? 0).toFixed(1)}`)
              .join(" ") + " Z";
          } else {
            const floor = (padding.top + innerHeight).toFixed(1);
            const first = run[0]!;
            const last = run[run.length - 1]!;
            area += ` L${last[0].toFixed(1)},${floor} L${first[0].toFixed(1)},${floor} Z`;
          }
          svg.append(svgEl("path", { d: area, fill: stroke, "fill-opacity": "0.2", stroke: "none" }));
        }
      }
      for (const run of runs) {
        if (run.length === 0) continue;
        const d = run.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        svg.append(svgEl("path", {
          d,
          fill: "none",
          stroke,
          "stroke-width": "2",
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }));
      }
      // Individual dots are noise on a dense line — but they are also the only
      // click / focus target, so keep them whenever a handler is wired up.
      const clickable = typeof onPointClick === "function";
      if (s.values.length > 30 && !clickable) return;
      for (const point of points) {
        if (!point) continue;
        const [x, y, i] = point;
        const raw = s.values[i];
        const dot = svgEl("circle", {
          cx: x.toFixed(1),
          cy: y.toFixed(1),
          r: clickable ? "4" : "3",
          fill: stroke,
        });
        const description = `${s.name} — ${labels[i] ?? `#${i + 1}`}: ${raw}`;
        dot.append(svgEl("title", {}, [description]));
        if (clickable) {
          makeActivatable(dot, description, () => {
            helpers.invoke(onPointClick, labels[i] ?? `#${i + 1}`, raw, s.name);
          });
        }
        svg.append(dot);
      }
    });

    drawXAxisLabels(svg, labels, padding, innerHeight, labelPlan, xForPoint);
    drawAxisCaptions(svg, padding, innerWidth, innerHeight, height, xAxisLabel, yAxisLabel);

    root.append(svg);
    if (!a11y.decorative) {
      root.append(chartTable(
        title || "Line chart data",
        Array.from({ length: pointCount }, (_, i) => labels[i] ?? `#${i + 1}`),
        series.map((s) => ({
          label: s.name,
          cells: Array.from({ length: pointCount }, (_, i) => cellText(s.values[i])),
        })),
      ));
    }
    if (showLegend && series.length > 0) root.append(legend(series));
    return root;
  },
};

/** LineChart tolerates gaps, so its values are nullable. */
interface LineSeries {
  name: string;
  values: (number | null)[];
  color?: string;
}

/**
 * Derive labels + one series per numeric column from row-shaped `data`.
 *
 * Values are written at the ROW INDEX, never appended: a row that omits a key
 * used to shift every later value of that series one x-position to the left,
 * so a sparse column silently reported the wrong month for every point. Holes
 * stay `null` so the line breaks instead of dropping to zero.
 */
function deriveRowSeries(rows: unknown[]): { labels: string[]; series: LineSeries[] } {
  const labels: string[] = [];
  const byKey = new Map<string, (number | null)[]>();
  rows.forEach((raw) => {
    const row = raw as Record<string, unknown> | null;
    if (!row || typeof row !== "object") return;
    const rowIndex = labels.length;
    labels.push(asString(row.x ?? row.label ?? ""));
    for (const [k, v] of Object.entries(row)) {
      if (k === "x" || k === "label") continue;
      // `asNumber(v)` falls back to 0, so the old NaN guard never fired and a
      // text column ("region") became a flat zero line with a legend entry.
      const num = asNumber(v, NaN);
      if (!Number.isFinite(num)) continue;
      let values = byKey.get(k);
      if (!values) {
        values = [];
        byKey.set(k, values);
      }
      while (values.length < rowIndex) values.push(null);
      values[rowIndex] = num;
    }
  });
  const series = [...byKey.entries()].map(([name, values]) => {
    while (values.length < labels.length) values.push(null);
    return { name, values };
  });
  return { labels, series };
}

/** Split a point list on its gaps so each contiguous run draws on its own. */
function splitRuns<T>(points: ReadonlyArray<T | null>): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    if (point === null) {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export const PieChart: ComponentSpec = {
  name: "PieChart",
  description:
    "Pie / Donut chart. Each segment maps to a label/value pair. Pass " +
    "`donut: true` (or an `innerRadius` fraction) for a donut. Numeric " +
    "labels are rendered on every segment by default — set " +
    "`showValues: false` to hide them, or `valueFormat: \"percent\"` " +
    "to show the share instead of the raw value.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "values", type: "number[]" },
    { name: "title", type: "string", optional: true },
    { name: "showValues", type: "boolean", optional: true, description: "Render numeric labels on each slice (default true)" },
    { name: "valueFormat", type: "string", optional: true, enum: ["value", "percent", "both"], description: "How to format the on-segment label (default \"value\")" },
    { name: "donut", type: "boolean", optional: true, description: "Cut a hole in the middle (default innerRadius 0.6)" },
    { name: "innerRadius", type: "number", optional: true, description: "Hole size as a fraction of the radius, 0–0.9 (implies donut)" },
    { name: "size", type: "number", optional: true, description: "Diameter in px (default 240)" },
    { name: "showLegend", type: "boolean", optional: true, description: "Render the label legend (default true)" },
    { name: "legendPosition", type: "string", optional: true, enum: ["bottom", "right"], description: "Where the legend sits relative to the pie (default \"bottom\")" },
    { name: "loading", type: "boolean", optional: true, description: "Render a loading placeholder instead of the pie" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there is no positive value (default \"No data\")" },
    { name: "onSliceClick", type: "callable", optional: true, description: "(label, value, share) => void, fired when a slice is activated" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props, helpers) => {
    const labels = asArray<unknown>(props.labels).map((l) => asString(l));
    const values = asArray<unknown>(props.values).map((v) => asNumber(v));
    const title = asString(props.title);
    const a11y = readChartA11y(props, typeof props.onSliceClick === "function");
    const showValues = props.showValues == null ? true : asBoolean(props.showValues);
    const showLegend = props.showLegend == null ? true : asBoolean(props.showLegend);
    const legendRight = asString(props.legendPosition).toLowerCase() === "right";
    const fmtToken = asString(props.valueFormat, "value").toLowerCase();
    const valueFormat: "value" | "percent" | "both" =
      fmtToken === "percent" ? "percent" : fmtToken === "both" ? "both" : "value";
    const onSliceClick = props.onSliceClick;
    const root = el("div", { class: "rui-chart rui-pie-chart" });
    const titleEl = title ? el("div", { class: "rui-chart-title" }, [title]) : null;
    if (titleEl) root.append(titleEl);
    if (asBoolean(props.loading)) return chartPlaceholder(root, LOADING_TEXT, true);

    // Zero / negative entries cannot be drawn as a slice. They used to still
    // consume a palette index and a legend row, so every legend swatch after
    // the first non-positive value pointed at a slice that wasn't there.
    const slices = labels
      .map((name, i) => ({ name, value: values[i] ?? 0 }))
      .filter((s) => s.value > 0);
    if (slices.length === 0) {
      return chartPlaceholder(root, asString(props.emptyText) || EMPTY_TEXT, false);
    }

    const size = Math.max(120, Math.min(640, readChartHeight(props.size, 240)));
    const hole = readInnerRadius(props.innerRadius, asBoolean(props.donut));
    const total = slices.reduce((acc, s) => acc + s.value, 0);
    const svg = createSvg(size, size);
    nameChart(svg, a11y, chartLabel(
      hole > 0 ? "Donut chart" : "Pie chart",
      title,
      `${slices.length} segments totalling ${formatNumeric(total)}.`,
    ));
    // `.rui-chart-svg` stretches to the container width and clamps the height,
    // which centred a 240px pie inside hundreds of px of dead space. With the
    // legend on the right the pie becomes a sized row item instead.
    svg.setAttribute("style", `max-width:${size}px;max-height:${size}px;` +
      (legendRight ? `flex:0 1 ${size}px;min-width:0` : "margin-inline:auto"));
    const cx = size / 2, cy = size / 2, r = size / 2 - 30;
    const innerR = r * hole;
    // Minimum slice (in fraction of total) for which we still render an
    // inline label. Tiny slivers would overlap and clutter the chart, so
    // we drop them and rely on the legend / hover title instead.
    const MIN_LABEL_FRACTION = 0.05;
    let angle = -Math.PI / 2;

    slices.forEach((slice, i) => {
      const fraction = slice.value / total;
      const sweep = fraction * Math.PI * 2;
      const next = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const segment = svgEl("path", {
        d: arcPath(cx, cy, r, innerR, angle, next, large),
        fill: colorAt(i),
        stroke: "var(--rui-color-surface, #fff)",
        "stroke-width": "2",
      });
      const description = `${slice.name}: ${slice.value} (${(fraction * 100).toFixed(1)}%)`;
      segment.append(svgEl("title", {}, [description]));
      if (typeof onSliceClick === "function") {
        makeActivatable(segment, description, () => {
          helpers.invoke(onSliceClick, slice.name, slice.value, fraction);
        });
      }
      svg.append(segment);

      if (showValues && fraction >= MIN_LABEL_FRACTION) {
        const mid = angle + sweep / 2;
        // Sit the label between the hole and the rim so it reads as centred
        // inside the slice for both the pie and the donut geometry.
        const labelR = innerR > 0 ? (innerR + r) / 2 : r * 0.62;
        const lx = cx + labelR * Math.cos(mid);
        const ly = cy + labelR * Math.sin(mid);
        // Soft shadow text first (paint-order: stroke fill keeps the
        // outline behind the glyph) so labels stay legible on any color.
        svg.append(svgEl("text", {
          x: lx.toFixed(1),
          y: ly.toFixed(1),
          class: "rui-pie-chart-value",
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "paint-order": "stroke",
          stroke: "rgba(15, 23, 42, 0.55)",
          "stroke-width": "3",
          "stroke-linejoin": "round",
          fill: "#fff",
        }, [formatSliceLabel(slice.value, fraction, valueFormat)]));
      }
      angle = next;
    });

    if (legendRight) {
      // Inline so the layout works without a stylesheet hook — an attribute
      // nothing selects would be dead output.
      root.setAttribute("style", "flex-direction:row;align-items:center;flex-wrap:wrap");
      // The title is a flex item too once the root is a row; keep its own line.
      titleEl?.setAttribute("style", "flex:1 0 100%");
    }
    root.append(svg);
    if (!a11y.decorative) {
      root.append(chartTable(
        title || "Pie chart data",
        ["Value", "Share"],
        labels.map((name, i) => {
          const value = values[i] ?? 0;
          return {
            label: name,
            cells: [cellText(values[i]), value > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%"],
          };
        }),
      ));
    }
    if (showLegend) {
      const list = legend(slices.map((s) => ({ name: s.name, values: [s.value] })));
      if (legendRight) list.setAttribute("style", "flex-direction:column;flex:1 1 120px");
      root.append(list);
    }
    return root;
  },
};

/** Wedge (`innerR === 0`) or annulus segment path. */
function arcPath(
  cx: number, cy: number, r: number, innerR: number,
  from: number, to: number, large: number,
): string {
  // A full turn's start and end points coincide, and SVG omits an arc segment
  // whose endpoints are equal — so a lone 100% slice drew nothing at all.
  if (to - from >= Math.PI * 2 - 1e-6) return fullCirclePath(cx, cy, r, innerR);
  const x1 = cx + r * Math.cos(from), y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to), y2 = cy + r * Math.sin(to);
  if (innerR <= 0) {
    return `M${cx.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} ` +
      `A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
  }
  const ix1 = cx + innerR * Math.cos(to), iy1 = cy + innerR * Math.sin(to);
  const ix2 = cx + innerR * Math.cos(from), iy2 = cy + innerR * Math.sin(from);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} ` +
    `L${ix1.toFixed(1)},${iy1.toFixed(1)} ` +
    `A${innerR.toFixed(1)},${innerR.toFixed(1)} 0 ${large} 0 ${ix2.toFixed(1)},${iy2.toFixed(1)} Z`;
}

/**
 * Disc (or ring) for the single-slice case. Two stitched wedges would also
 * fill correctly but their radial edges would be stroked as a visible seam;
 * the inner circle runs the opposite way so the nonzero fill rule leaves the
 * donut hole empty.
 */
function fullCirclePath(cx: number, cy: number, r: number, innerR: number): string {
  const ring = (radius: number, sweep: number): string => {
    const left = (cx - radius).toFixed(1), right = (cx + radius).toFixed(1);
    const y = cy.toFixed(1), rad = radius.toFixed(1);
    return `M${left},${y} A${rad},${rad} 0 1 ${sweep} ${right},${y} ` +
      `A${rad},${rad} 0 1 ${sweep} ${left},${y} Z`;
  };
  return innerR > 0 ? `${ring(r, 1)} ${ring(innerR, 0)}` : ring(r, 1);
}

/** `innerRadius` as a fraction of the outer radius; `donut` implies 0.6. */
function readInnerRadius(raw: unknown, donut: boolean): number {
  if (raw == null) return donut ? 0.6 : 0;
  const value = asNumber(raw, 0);
  // Tolerate a percentage (60) as well as a fraction (0.6).
  const fraction = value > 1 ? value / 100 : value;
  if (!Number.isFinite(fraction) || fraction <= 0) return donut ? 0.6 : 0;
  return Math.min(0.9, fraction);
}

function formatSliceLabel(
  value: number,
  fraction: number,
  format: "value" | "percent" | "both",
): string {
  const pct = `${Math.round(fraction * 100)}%`;
  const num = formatNumeric(value);
  if (format === "percent") return pct;
  if (format === "both") return `${num} (${pct})`;
  return num;
}

/* ----------------------------------------------------------------------- *
 * Shared chart primitives (also imported by advanced-charts.ts)
 * ----------------------------------------------------------------------- */

export function formatNumeric(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Exact text for a data-table cell — `—` for a value the series never had. */
export function cellText(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

/**
 * Clamp an author-supplied chart height / size (px) to something renderable.
 * Accepts `320` and `"320px"`; anything unparseable keeps the default.
 */
export function readChartHeight(raw: unknown, fallback: number): number {
  if (raw == null) return fallback;
  const parsed = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  const value = asNumber(parsed, fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(80, Math.min(1200, Math.round(value)));
}

/** Render a placeholder branch (loading / empty) into a chart root. */
export function chartPlaceholder(root: HTMLElement, message: string, busy: boolean): HTMLElement {
  if (busy) root.setAttribute("aria-busy", "true");
  root.append(el("div", { class: "rui-chart-empty" }, [message]));
  return root;
}

/**
 * Accessible name for a chart SVG.
 *
 * `role="img"` prunes everything inside the element from the a11y tree —
 * including the `<title>` tooltip on every bar — so without a name of its own
 * the chart is announced as a bare "image" and conveys nothing. The numbers
 * stay reachable through the visually-hidden table `chartTable` emits.
 */
export function chartLabel(kind: string, title: string, detail = ""): string {
  const head = title ? `${kind}: ${title}` : kind;
  return detail ? `${head}. ${detail}` : head;
}

export interface ChartA11y {
  /** Author-supplied accessible name, or `""` when they did not pass one. */
  name: string;
  decorative: boolean;
}

/**
 * Read the shared a11y props.
 *
 * `interactive` is the escape valve for `decorative`: an activatable shape is
 * given `tabindex="0"`, and a focusable node inside an `aria-hidden` subtree is
 * a worse defect than the unnamed graphic we started from. A chart wired to a
 * click handler is not decoration, so the flag is ignored for one.
 */
export function readChartA11y(props: Record<string, unknown>, interactive = false): ChartA11y {
  return {
    name: asString(props.ariaLabel).trim(),
    decorative: asBoolean(props.decorative) && !interactive,
  };
}

/**
 * Name a chart graphic — or take it out of the a11y tree entirely.
 *
 * `role="img"` prunes the element's contents, so an unnamed chart is announced
 * as a bare "image" AND its per-shape `<title>` tooltips become unreachable.
 * There is no case where that combination is right: either the graphic carries
 * information and needs a name, or it is decoration and should be hidden.
 */
export function nameChart(svg: SVGSVGElement, a11y: ChartA11y, generated: string): void {
  if (a11y.decorative) {
    svg.removeAttribute("role");
    svg.setAttribute("aria-hidden", "true");
    return;
  }
  svg.setAttribute("aria-label", a11y.name || generated);
}

/**
 * Screen-reader (and keyboard) fallback for an SVG chart: the same data as a
 * real table, visually hidden. This is the only path to the underlying numbers
 * for a non-pointer user, since SVG `<title>` tooltips are hover-only.
 */
export function chartTable(
  caption: string,
  columns: ReadonlyArray<string>,
  rows: ReadonlyArray<{ label: string; cells: ReadonlyArray<string> }>,
  rowHeader = "",
): HTMLElement {
  const wrap = el("div", { class: "rui-visually-hidden" });
  const table = el("table");
  table.append(el("caption", {}, [caption]));
  const head = el("tr");
  head.append(el("th", { scope: "col" }, [rowHeader]));
  for (const column of columns) head.append(el("th", { scope: "col" }, [column]));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  const tbody = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    tr.append(el("th", { scope: "row" }, [row.label]));
    for (const cell of row.cells) tr.append(el("td", {}, [cell]));
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

/**
 * Make an SVG shape (or a grid cell) activatable by pointer AND keyboard.
 *
 * The handlers are assigned as DOM properties — never `addEventListener` — so
 * the morph reconciler copies this render's closure onto the node it keeps
 * instead of freezing the first render's loop variables.
 */
export function makeActivatable(node: Element, label: string, fire: () => void): void {
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", label);
  // `cursor` is a presentation attribute on SVG shapes; HTML callers put it in
  // their own `style` (they already build one).
  if (node.namespaceURI === "http://www.w3.org/2000/svg") node.setAttribute("cursor", "pointer");
  const handlers = node as unknown as {
    onclick: ((event: Event) => void) | null;
    onkeydown: ((event: KeyboardEvent) => void) | null;
  };
  handlers.onclick = () => fire();
  handlers.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    fire();
  };
}

export interface LabelPlan {
  /** Render every Nth label (1 = all of them). */
  step: number;
  /** Rotate labels -45° when horizontal space per label is too tight. */
  rotated: boolean;
  /** Truncate each label to this many characters; full label stays in <title>. */
  maxChars: number;
  /** Reserved height under the chart so rotated labels are not clipped. */
  bottomPadding: number;
}

// Pixel budget assumptions for label sizing. These are deliberately conservative
// — the chart is rendered as SVG so we cannot measure text without a layout
// pass, but treating each character as ~7px wide tracks reality for the
// chart label font (~11px sans-serif) closely enough for layout decisions.
export const APPROX_CHAR_PX = 7;
// Y-axis ticks use the smaller `.rui-chart-tick` size (~10.5px).
const TICK_CHAR_PX = 6;
const AXIS_TICKS = 4;
/** Room reserved for a rotated y-axis / centred x-axis caption. */
export const AXIS_CAPTION_PX = 18;
// Below this per-label slot, even rotated labels are too tight; we thin them
// by showing every Nth label and keep the rest discoverable via hover titles.
const MIN_ROTATED_SLOT_PX = 12;

/** Widest formatted label, in px, for a conservative gutter estimate. */
export function longestLabelPx(labels: ReadonlyArray<string>, maxChars = 40): number {
  const longest = labels.reduce((max, l) => Math.max(max, Math.min(l.length, maxChars)), 0);
  return longest * APPROX_CHAR_PX;
}

/**
 * Left gutter wide enough for the widest y-axis tick. A fixed 40px gutter
 * clipped the leading digits off anything above ~5 characters, which any
 * revenue figure is.
 */
export function tickGutter(min: number, max: number): number {
  let chars = 0;
  for (let i = 0; i <= AXIS_TICKS; i += 1) {
    chars = Math.max(chars, formatNumeric(min + (max - min) * (i / AXIS_TICKS)).length);
  }
  return Math.max(32, Math.min(96, Math.ceil(chars * TICK_CHAR_PX) + 10));
}

/**
 * Plan the x-axis labels. `slotCount` is the number of x positions the chart
 * actually plots (which can exceed `labels.length`), so the spacing estimate
 * matches the geometry the labels are drawn against.
 */
export function planLabels(
  labels: ReadonlyArray<string>,
  innerWidth: number,
  slotCount = labels.length,
): LabelPlan {
  if (labels.length === 0) {
    return { step: 1, rotated: false, maxChars: 32, bottomPadding: 32 };
  }
  const slot = innerWidth / Math.max(slotCount, 1);
  const longest = labels.reduce((max, l) => Math.max(max, l.length), 0);
  // Horizontal fit: enough room to print without rotating.
  if (longest * APPROX_CHAR_PX + 4 <= slot) {
    return { step: 1, rotated: false, maxChars: longest, bottomPadding: 32 };
  }
  // Otherwise rotate. If still too tight after rotating, drop every Nth label.
  const step = slot < MIN_ROTATED_SLOT_PX ? Math.max(1, Math.ceil(MIN_ROTATED_SLOT_PX / slot)) : 1;
  // Cap label characters by the bottom padding we are willing to spend. The
  // 50px budget renders ~14 chars after the 45° rotation flattens to ~70%.
  const maxChars = Math.min(longest, 14);
  return { step, rotated: true, maxChars, bottomPadding: 60 };
}

export function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return label.slice(0, Math.max(maxChars - 1, 1)) + "…";
}

/** Truncate to whatever fits `availablePx` at the chart-label font size. */
export function truncateToWidth(label: string, availablePx: number): string {
  return truncateLabel(label, Math.max(2, Math.floor(availablePx / APPROX_CHAR_PX)));
}

export function drawXAxisLabels(
  svg: SVGSVGElement,
  labels: ReadonlyArray<string>,
  padding: { left: number; right: number; top: number; bottom: number },
  innerHeight: number,
  plan: LabelPlan,
  xFor: (index: number) => number,
): void {
  const baseY = padding.top + innerHeight + (plan.rotated ? 14 : 18);
  labels.forEach((label, i) => {
    if (i % plan.step !== 0) return;
    const x = xFor(i);
    const display = truncateLabel(label, plan.maxChars);
    const attrs: Record<string, string> = {
      x: String(x),
      y: String(baseY),
      class: "rui-chart-label",
      "text-anchor": plan.rotated ? "end" : "middle",
    };
    if (plan.rotated) {
      attrs.transform = `rotate(-45, ${x}, ${baseY})`;
    }
    const text = svgEl("text", attrs, [display]);
    if (display !== label) {
      // Preserve the full label as a hover tooltip when we had to truncate.
      text.append(svgEl("title", {}, [label]));
    }
    svg.append(text);
  });
}

/** Axis unit captions ("Revenue (EUR)" / "requests/sec"). */
export function drawAxisCaptions(
  svg: SVGSVGElement,
  padding: { left: number; right: number; top: number; bottom: number },
  innerWidth: number,
  innerHeight: number,
  height: number,
  xAxisLabel: string,
  yAxisLabel: string,
): void {
  if (xAxisLabel) {
    svg.append(svgEl("text", {
      x: (padding.left + innerWidth / 2).toFixed(1),
      y: (height - 4).toFixed(1),
      "text-anchor": "middle",
      class: "rui-chart-label",
      "font-weight": "500",
    }, [xAxisLabel]));
  }
  if (yAxisLabel) {
    const x = 12;
    const y = padding.top + innerHeight / 2;
    svg.append(svgEl("text", {
      x: String(x),
      y: String(y),
      "text-anchor": "middle",
      transform: `rotate(-90, ${x}, ${y})`,
      class: "rui-chart-label",
      "font-weight": "500",
    }, [yAxisLabel]));
  }
}

export function createSvg(width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "rui-chart-svg");
  // Callers MUST follow up with `nameChart` — with `role="img"` and no name the
  // chart is announced as an unnamed image and its contents are pruned.
  svg.setAttribute("role", "img");
  return svg;
}

export function svgEl(
  tag: string,
  attrs: Record<string, string>,
  children?: ReadonlyArray<Node | string>,
): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (children) {
    for (const child of children) {
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}

/** Horizontal gridlines + y-axis tick values. */
export function drawAxes(
  svg: SVGSVGElement,
  padding: { left: number; right: number; top: number; bottom: number },
  innerWidth: number,
  innerHeight: number,
  max: number,
  min = 0,
): void {
  for (let i = 0; i <= AXIS_TICKS; i += 1) {
    const ratio = i / AXIS_TICKS;
    const y = padding.top + innerHeight - ratio * innerHeight;
    svg.append(svgEl("line", {
      x1: String(padding.left),
      x2: String(padding.left + innerWidth),
      y1: String(y),
      y2: String(y),
      stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
    }));
    svg.append(svgEl("text", {
      x: String(padding.left - 6),
      y: String(y + 3),
      "text-anchor": "end",
      class: "rui-chart-tick",
    }, [formatNumeric(min + (max - min) * ratio)]));
  }
}

/** Vertical gridlines + x-axis tick values (horizontal bars, scatter plots). */
export function drawValueTicks(
  svg: SVGSVGElement,
  padding: { left: number; right: number; top: number; bottom: number },
  innerWidth: number,
  innerHeight: number,
  max: number,
  min = 0,
): void {
  const baseline = padding.top + innerHeight;
  for (let i = 0; i <= AXIS_TICKS; i += 1) {
    const ratio = i / AXIS_TICKS;
    const x = padding.left + ratio * innerWidth;
    svg.append(svgEl("line", {
      x1: String(x),
      x2: String(x),
      y1: String(padding.top),
      y2: String(baseline),
      stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
    }));
    svg.append(svgEl("text", {
      x: String(x),
      y: String(baseline + 16),
      "text-anchor": "middle",
      class: "rui-chart-tick",
    }, [formatNumeric(min + (max - min) * ratio)]));
  }
}

export function legend(series: ReadonlyArray<SeriesStyle>): HTMLElement {
  const root = el("div", { class: "rui-chart-legend" });
  series.forEach((s, i) => {
    const item = el("span", { class: "rui-chart-legend-item" });
    item.append(el("span", {
      class: "rui-chart-legend-swatch",
      style: `background:${seriesColor(s, i)}`,
    }));
    item.append(el("span", {}, [s.name]));
    root.append(item);
  });
  return root;
}
