/**
 * Advanced chart components built on the same SVG primitives as `charts.ts`:
 *
 *   - AreaChart   — line chart with a filled area beneath each series.
 *   - Gauge       — half-doughnut indicator for KPIs and thresholds.
 *   - Heatmap     — color-intensity grid (calendar / matrix style).
 *   - RadarChart  — multi-axis polygon for skills, comparisons, scorecards.
 *   - ScatterChart — XY scatter for correlations and distributions.
 *   - Histogram   — frequency distribution from raw numbers.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asNumber } from "../utils.js";

const PALETTE: readonly string[] = [
  "var(--rui-chart-1, #6366f1)",
  "var(--rui-chart-2, #10b981)",
  "var(--rui-chart-3, #f59e0b)",
  "var(--rui-chart-4, #ef4444)",
  "var(--rui-chart-5, #06b6d4)",
  "var(--rui-chart-6, #8b5cf6)",
];

const colorAt = (index: number): string => PALETTE[index % PALETTE.length] ?? PALETTE[0]!;

interface SeriesData {
  name: string;
  values: number[];
}

function readSeries(raw: unknown[]): SeriesData[] {
  return raw.map((s, i) => {
    const node = s as { args?: unknown[] };
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const values = asArray<unknown>(node.args?.[1]).map((v) => asNumber(v));
    return { name, values };
  });
}

function createSvg(width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "rui-chart-svg");
  svg.setAttribute("role", "img");
  return svg;
}

function svgEl(
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

function legend(series: SeriesData[]): HTMLElement {
  const root = el("div", { class: "rui-chart-legend" });
  series.forEach((s, i) => {
    const item = el("span", { class: "rui-chart-legend-item" });
    item.append(el("span", { class: "rui-chart-legend-swatch", style: `background:${colorAt(i)}` }));
    item.append(el("span", {}, [s.name]));
    root.append(item);
  });
  return root;
}

/* ----------------------------------------------------------------------- *
 * AreaChart
 * ----------------------------------------------------------------------- */

export const AreaChart: ComponentSpec = {
  name: "AreaChart",
  description:
    "Filled line chart — same shape as `LineChart` but each series renders " +
    "with a soft area beneath it. Use for trends with cumulative emphasis " +
    "(traffic, revenue, signups), stacked metrics, and time-series KPIs.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "series", type: "Series[]" },
    { name: "title", type: "string", optional: true },
    { name: "stacked", type: "boolean", optional: true },
  ],
  render: (_node, props) => {
    const labels = asArray<unknown>(props.labels).map((l) => asString(l));
    const series = readSeries(asArray<unknown>(props.series));
    const stacked = props.stacked === true;
    const root = el("div", { class: "rui-chart rui-area-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));

    const width = 640;
    const height = 240;
    const padding = { left: 40, right: 12, top: 12, bottom: 40 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    // For stacked mode, accumulate values per x-position.
    const pointCount = Math.max(labels.length, ...series.map((s) => s.values.length), 1);
    const stackedValues: number[][] = series.map(() => Array(pointCount).fill(0));
    if (stacked) {
      for (let i = 0; i < pointCount; i += 1) {
        let acc = 0;
        series.forEach((s, sIdx) => {
          acc += s.values[i] ?? 0;
          stackedValues[sIdx]![i] = acc;
        });
      }
    }
    const peak = stacked
      ? stackedValues.reduce((m, arr) => Math.max(m, ...arr), 0)
      : series.reduce((m, s) => Math.max(m, ...s.values), 0);
    const max = Math.max(1, peak);
    const svg = createSvg(width, height);
    drawHorizontalGrid(svg, padding, innerWidth, innerHeight, max);

    const xFor = (i: number): number => padding.left + i * (innerWidth / Math.max(pointCount - 1, 1));
    series.forEach((s, sIdx) => {
      const values = stacked ? stackedValues[sIdx]! : s.values;
      const baseline = stacked && sIdx > 0 ? stackedValues[sIdx - 1]! : null;
      const points = values.map((value, i) => {
        const x = xFor(i);
        const y = padding.top + innerHeight - (value / max) * innerHeight;
        return [x, y] as const;
      });
      if (points.length === 0) return;
      let areaPath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      if (baseline) {
        const baselinePoints = baseline.map((value, i) => {
          const x = xFor(i);
          const y = padding.top + innerHeight - (value / max) * innerHeight;
          return [x, y] as const;
        });
        areaPath += " " + baselinePoints.slice().reverse().map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
      } else {
        const first = points[0]!;
        const last = points[points.length - 1]!;
        areaPath += ` L${last[0].toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${first[0].toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;
      }
      svg.append(svgEl("path", {
        d: areaPath,
        fill: colorAt(sIdx),
        "fill-opacity": "0.2",
        stroke: "none",
      }));
      const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      svg.append(svgEl("path", {
        d: linePath,
        fill: "none",
        stroke: colorAt(sIdx),
        "stroke-width": "2",
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }));
    });

    drawXLabels(svg, labels, padding, innerWidth, innerHeight);
    root.append(svg);
    if (series.length > 0) root.append(legend(series));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Gauge
 * ----------------------------------------------------------------------- */

export const Gauge: ComponentSpec = {
  name: "Gauge",
  description:
    "Half-doughnut gauge indicator for a single value between `min` and " +
    "`max`. The inner value is auto-formatted from the value (override " +
    "via `label`). Pass `caption`, `tone`, and `size` for visual " +
    "treatment. Use for KPI thresholds (uptime %, score, capacity, NPS, " +
    "page-speed).",
  props: [
    { name: "value", type: "number" },
    { name: "min", type: "number", optional: true, description: "Lower bound (default 0)" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "caption", type: "string", optional: true, description: "Small caption below the gauge" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "label", type: "string", optional: true, description: "Inner label override (defaults to auto-formatted value)" },
  ],
  render: (_node, props) => {
    const min = asNumber(props.min, 0);
    const max = Math.max(min + 1, asNumber(props.max, 100));
    const value = Math.max(min, Math.min(max, asNumber(props.value, min)));
    const pct = (value - min) / (max - min);
    const tone = asString(props.tone, "primary");
    const size = asString(props.size, "md");
    const px = size === "lg" ? 220 : size === "sm" ? 140 : 180;
    const half = px / 2;
    const stroke = size === "lg" ? 18 : size === "sm" ? 10 : 14;
    const r = half - stroke;
    const root = el("div", {
      class: "rui-gauge",
      "data-tone": tone,
      "data-size": size,
    });
    const svg = createSvg(px, half + stroke + 4);
    const cx = half;
    const cy = half;
    const startX = cx - r;
    const startY = cy;
    const endX = cx + r;
    const endY = cy;
    svg.append(svgEl("path", {
      d: `M${startX},${startY} A${r},${r} 0 0 1 ${endX},${endY}`,
      fill: "none",
      stroke: "var(--rui-color-border, #e2e8f0)",
      "stroke-width": String(stroke),
      "stroke-linecap": "round",
    }));
    if (pct > 0) {
      const angle = Math.PI * pct;
      const x = cx - r * Math.cos(angle);
      const y = cy - r * Math.sin(angle);
      // The gauge is only the upper half of a circle, so the foreground
      // arc never exceeds 180°. `large-arc-flag` is therefore always 0 —
      // setting it to 1 makes the SVG renderer take the long way round
      // and draw the missing portion instead of the filled portion.
      svg.append(svgEl("path", {
        d: `M${startX},${startY} A${r},${r} 0 0 1 ${x.toFixed(2)},${y.toFixed(2)}`,
        fill: "none",
        stroke: `var(--rui-color-${tone}, ${colorAt(0)})`,
        "stroke-width": String(stroke),
        "stroke-linecap": "round",
        class: "rui-gauge-arc",
      }));
    }
    root.append(svg);
    const autoLabel = formatGaugeValue(value, min, max);
    const label = asString(props.label) || autoLabel;
    root.append(el("div", { class: "rui-gauge-value" }, [label]));
    const caption = asString(props.caption);
    if (caption) root.append(el("div", { class: "rui-gauge-caption" }, [caption]));
    return root;
  },
};

function formatGaugeValue(value: number, min: number, max: number): string {
  const isPercentLike = min === 0 && max === 100;
  if (isPercentLike) {
    return value % 1 === 0 ? `${value}%` : `${value.toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (value % 1 === 0) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}

/* ----------------------------------------------------------------------- *
 * Heatmap
 * ----------------------------------------------------------------------- */

export const Heatmap: ComponentSpec = {
  name: "Heatmap",
  description:
    "Color-intensity matrix grid (calendar-style or correlation-style). " +
    "Pass `xLabels`, `yLabels`, and a `values` array of arrays (rows × " +
    "columns). Each cell's color intensity scales with the value relative " +
    "to the global max. Use for activity heatmaps, schedule density, " +
    "correlation matrices.",
  props: [
    { name: "xLabels", type: "string[]" },
    { name: "yLabels", type: "string[]" },
    { name: "values", type: "number[][]", description: "Matrix indexed by row (y), then column (x)" },
    { name: "title", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
  ],
  render: (_node, props) => {
    const xLabels = asArray<unknown>(props.xLabels).map((l) => asString(l));
    const yLabels = asArray<unknown>(props.yLabels).map((l) => asString(l));
    const valueRows: number[][] = asArray<unknown>(props.values).map((row) =>
      asArray<unknown>(row).map((v) => asNumber(v, 0)));
    const tone = asString(props.tone, "primary");
    const max = Math.max(1, ...valueRows.flat());
    const root = el("div", { class: "rui-heatmap", "data-tone": tone });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const tableWrap = el("div", { class: "rui-heatmap-table" });
    const headerRow = el("div", { class: "rui-heatmap-row rui-heatmap-row-header" });
    headerRow.append(el("div", { class: "rui-heatmap-cell rui-heatmap-corner" }));
    for (const x of xLabels) {
      headerRow.append(el("div", { class: "rui-heatmap-cell rui-heatmap-xlabel" }, [x]));
    }
    tableWrap.append(headerRow);
    valueRows.forEach((row, rIdx) => {
      const rowEl = el("div", { class: "rui-heatmap-row" });
      rowEl.append(el("div", { class: "rui-heatmap-cell rui-heatmap-ylabel" }, [yLabels[rIdx] ?? String(rIdx + 1)]));
      row.forEach((value, cIdx) => {
        const intensity = max > 0 ? value / max : 0;
        const cell = el("div", {
          class: "rui-heatmap-cell rui-heatmap-value",
          style: `background:color-mix(in srgb, var(--rui-color-${tone}, ${colorAt(0)}) ${Math.round(intensity * 90 + 5)}%, transparent);`,
          title: `${xLabels[cIdx] ?? cIdx + 1} · ${yLabels[rIdx] ?? rIdx + 1}: ${value}`,
        });
        cell.append(el("span", {}, [String(value)]));
        rowEl.append(cell);
      });
      tableWrap.append(rowEl);
    });
    root.append(tableWrap);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * RadarChart
 * ----------------------------------------------------------------------- */

export const RadarChart: ComponentSpec = {
  name: "RadarChart",
  description:
    "Polygon chart with one axis per category. Use for skill maps, " +
    "scorecards, capability comparisons, and any multi-dimensional " +
    "snapshot. Each Series renders as a filled polygon — overlapping is " +
    "expected for comparisons.",
  props: [
    { name: "axes", type: "string[]", description: "Category labels — one per radial axis" },
    { name: "series", type: "Series[]" },
    { name: "max", type: "number", optional: true, description: "Outer ring value (default = max across series)" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const axes = asArray<unknown>(props.axes).map((a) => asString(a));
    const series = readSeries(asArray<unknown>(props.series));
    const n = Math.max(axes.length, 3);
    const root = el("div", { class: "rui-chart rui-radar-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const max = Math.max(1, asNumber(props.max, series.flatMap((s) => s.values).reduce((m, v) => Math.max(m, v), 1)));
    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 24;
    const svg = createSvg(size, size);
    const rings = 4;
    for (let i = 1; i <= rings; i += 1) {
      const radius = (r / rings) * i;
      const points: string[] = [];
      for (let j = 0; j < n; j += 1) {
        const angle = (Math.PI * 2 * j) / n - Math.PI / 2;
        points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
      }
      svg.append(svgEl("polygon", {
        points: points.join(" "),
        fill: "none",
        stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
        "stroke-width": "1",
      }));
    }
    for (let j = 0; j < n; j += 1) {
      const angle = (Math.PI * 2 * j) / n - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      svg.append(svgEl("line", {
        x1: String(cx),
        y1: String(cy),
        x2: x.toFixed(1),
        y2: y.toFixed(1),
        stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
        "stroke-width": "1",
      }));
      const labelX = cx + (r + 16) * Math.cos(angle);
      const labelY = cy + (r + 16) * Math.sin(angle);
      svg.append(svgEl("text", {
        x: labelX.toFixed(1),
        y: labelY.toFixed(1),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        class: "rui-chart-label",
        "font-size": "13",
        "font-weight": "500",
      }, [axes[j] ?? ""]));
    }
    series.forEach((s, sIdx) => {
      const points: string[] = [];
      for (let j = 0; j < n; j += 1) {
        const value = s.values[j] ?? 0;
        const ratio = Math.max(0, Math.min(1, value / max));
        const angle = (Math.PI * 2 * j) / n - Math.PI / 2;
        const x = cx + r * ratio * Math.cos(angle);
        const y = cy + r * ratio * Math.sin(angle);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      svg.append(svgEl("polygon", {
        points: points.join(" "),
        fill: colorAt(sIdx),
        "fill-opacity": "0.2",
        stroke: colorAt(sIdx),
        "stroke-width": "2",
        "stroke-linejoin": "round",
      }));
    });
    root.append(svg);
    if (series.length > 0) root.append(legend(series));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ScatterChart
 * ----------------------------------------------------------------------- */

interface ScatterPoint {
  x: number;
  y: number;
  label: string;
}

function readScatterSeries(raw: unknown[]): { name: string; points: ScatterPoint[] }[] {
  return raw.map((entry, i) => {
    const node = entry as { args?: unknown[] };
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const points = asArray<unknown>(node.args?.[1]).map((p) => {
      if (Array.isArray(p)) {
        return { x: asNumber(p[0], 0), y: asNumber(p[1], 0), label: asString(p[2]) };
      }
      if (p && typeof p === "object") {
        const r = p as Record<string, unknown>;
        return { x: asNumber(r.x, 0), y: asNumber(r.y, 0), label: asString(r.label) };
      }
      return { x: 0, y: 0, label: "" };
    });
    return { name, points };
  });
}

export const ScatterChart: ComponentSpec = {
  name: "ScatterChart",
  description:
    "XY scatter plot — one dot per data point, optionally grouped by " +
    "series. Pass each `Series(name, points)` with points as " +
    "`{x, y, label?}` objects or `[x, y, label?]` tuples. Use for " +
    "correlations, distributions, and \"price vs. rating\" style charts.",
  props: [
    { name: "series", type: "Series[]" },
    { name: "xLabel", type: "string", optional: true },
    { name: "yLabel", type: "string", optional: true },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const series = readScatterSeries(asArray<unknown>(props.series));
    const root = el("div", { class: "rui-chart rui-scatter-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const width = 640;
    const height = 280;
    const padding = { left: 50, right: 16, top: 16, bottom: 40 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = series.flatMap((s) => s.points);
    if (points.length === 0) {
      root.append(el("div", { class: "rui-chart-empty" }, ["No points"]));
      return root;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const xRange = maxX - minX || 1;
    const yRange = maxY - minY || 1;
    const svg = createSvg(width, height);
    drawHorizontalGrid(svg, padding, innerWidth, innerHeight, maxY, minY);
    // x-axis
    svg.append(svgEl("line", {
      x1: String(padding.left),
      y1: String(padding.top + innerHeight),
      x2: String(padding.left + innerWidth),
      y2: String(padding.top + innerHeight),
      stroke: "var(--rui-color-border, #e2e8f0)",
    }));
    series.forEach((s, sIdx) => {
      s.points.forEach((pt) => {
        const cx = padding.left + ((pt.x - minX) / xRange) * innerWidth;
        const cy = padding.top + innerHeight - ((pt.y - minY) / yRange) * innerHeight;
        const circle = svgEl("circle", {
          cx: cx.toFixed(1),
          cy: cy.toFixed(1),
          r: "7",
          fill: colorAt(sIdx),
          "fill-opacity": "0.8",
          stroke: "#fff",
          "stroke-width": "1.5",
        });
        circle.append(svgEl("title", {}, [pt.label || `${pt.x}, ${pt.y}`]));
        svg.append(circle);
      });
    });
    if (asString(props.xLabel)) {
      svg.append(svgEl("text", {
        x: String(padding.left + innerWidth / 2),
        y: String(height - 6),
        "text-anchor": "middle",
        class: "rui-chart-label",
        "font-size": "14",
        "font-weight": "500",
      }, [asString(props.xLabel)]));
    }
    if (asString(props.yLabel)) {
      const labelX = 14;
      const labelY = padding.top + innerHeight / 2;
      svg.append(svgEl("text", {
        x: String(labelX),
        y: String(labelY),
        "text-anchor": "middle",
        transform: `rotate(-90, ${labelX}, ${labelY})`,
        class: "rui-chart-label",
        "font-size": "14",
        "font-weight": "500",
      }, [asString(props.yLabel)]));
    }
    root.append(svg);
    const seriesData: SeriesData[] = series.map((s) => ({ name: s.name, values: s.points.map((p) => p.y) }));
    if (seriesData.length > 0) root.append(legend(seriesData));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Histogram
 * ----------------------------------------------------------------------- */

export const Histogram: ComponentSpec = {
  name: "Histogram",
  description:
    "Frequency distribution from raw numeric values. Pass `values` " +
    "directly (the component bins them automatically) or pre-computed " +
    "`bins` of `{label, count}` objects. Use for response-time histograms, " +
    "score distributions, age buckets.",
  props: [
    { name: "values", type: "number[]", optional: true, description: "Raw observations (binned automatically)" },
    { name: "bins", type: "object[]", optional: true, description: "Pre-computed {label, count} entries (overrides `values`)" },
    { name: "binCount", type: "number", optional: true, description: "Number of bins when computing from `values` (default 10)" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    let bins: { label: string; count: number }[] = [];
    if (Array.isArray(props.bins) && (props.bins as unknown[]).length > 0) {
      bins = (props.bins as unknown[]).map((entry) => {
        const r = (entry ?? {}) as { label?: unknown; count?: unknown };
        return { label: asString(r.label), count: asNumber(r.count, 0) };
      });
    } else {
      const values = asArray<unknown>(props.values).map((v) => asNumber(v, NaN)).filter((n) => Number.isFinite(n));
      if (values.length > 0) {
        const binCount = Math.max(2, Math.min(50, Math.floor(asNumber(props.binCount, 10))));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        const step = span / binCount;
        const counts = new Array(binCount).fill(0);
        for (const v of values) {
          let idx = Math.floor((v - min) / step);
          if (idx >= binCount) idx = binCount - 1;
          if (idx < 0) idx = 0;
          counts[idx] += 1;
        }
        bins = counts.map((count, i) => {
          const a = min + i * step;
          const b = a + step;
          return { label: `${formatBinLabel(a)}–${formatBinLabel(b)}`, count };
        });
      }
    }
    const root = el("div", { class: "rui-chart rui-histogram" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    if (bins.length === 0) {
      root.append(el("div", { class: "rui-chart-empty" }, ["No data"]));
      return root;
    }
    const width = 640;
    const height = 240;
    const padding = { left: 40, right: 12, top: 16, bottom: 50 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const max = Math.max(1, ...bins.map((b) => b.count));
    const slot = innerWidth / bins.length;
    const svg = createSvg(width, height);
    drawHorizontalGrid(svg, padding, innerWidth, innerHeight, max);
    bins.forEach((bin, i) => {
      const x = padding.left + i * slot + slot * 0.1;
      const barWidth = slot * 0.8;
      const barHeight = (bin.count / max) * innerHeight;
      const y = padding.top + innerHeight - barHeight;
      const rect = svgEl("rect", {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: barWidth.toFixed(1),
        height: barHeight.toFixed(1),
        fill: colorAt(0),
        rx: "2",
      });
      rect.append(svgEl("title", {}, [`${bin.label}: ${bin.count}`]));
      svg.append(rect);
      svg.append(svgEl("text", {
        x: (x + barWidth / 2).toFixed(1),
        y: String(padding.top + innerHeight + 22),
        "text-anchor": "middle",
        class: "rui-chart-label",
        "font-size": "12",
      }, [bin.label]));
    });
    root.append(svg);
    return root;
  },
};

function formatBinLabel(value: number): string {
  if (!Number.isFinite(value)) return "?";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

/* ----------------------------------------------------------------------- *
 * Shared chart helpers
 * ----------------------------------------------------------------------- */

function drawHorizontalGrid(
  svg: SVGSVGElement,
  padding: { left: number; right: number; top: number; bottom: number },
  innerWidth: number,
  innerHeight: number,
  max: number,
  min = 0,
): void {
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const ratio = i / ticks;
    const y = padding.top + innerHeight - ratio * innerHeight;
    svg.append(svgEl("line", {
      x1: String(padding.left),
      x2: String(padding.left + innerWidth),
      y1: String(y),
      y2: String(y),
      stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
    }));
    svg.append(svgEl("text", {
      x: String(padding.left - 8),
      y: String(y + 5),
      "text-anchor": "end",
      class: "rui-chart-tick",
      "font-size": "14",
    }, [String(Math.round((min + (max - min) * ratio) * 10) / 10)]));
  }
}

function drawXLabels(
  svg: SVGSVGElement,
  labels: ReadonlyArray<string>,
  padding: { left: number; right: number; top: number; bottom: number },
  innerWidth: number,
  innerHeight: number,
): void {
  if (labels.length === 0) return;
  const slot = innerWidth / Math.max(labels.length - 1, 1);
  labels.forEach((label, i) => {
    const x = padding.left + i * slot;
    svg.append(svgEl("text", {
      x: String(x),
      y: String(padding.top + innerHeight + 20),
      "text-anchor": "middle",
      class: "rui-chart-label",
      "font-size": "14",
    }, [label]));
  });
}
