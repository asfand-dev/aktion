/**
 * Advanced chart components built on the same SVG primitives as `charts.ts`:
 *
 *   - Gauge       — half-doughnut indicator for KPIs and thresholds.
 *   - Heatmap     — color-intensity grid (calendar / matrix style).
 *   - RadarChart  — multi-axis polygon for skills, comparisons, scorecards.
 *   - ScatterChart — XY scatter for correlations and distributions.
 *   - Histogram   — frequency distribution from raw numbers.
 *
 * The primitives (SVG factory, legend, tick drawing, label planner, the
 * screen-reader table) live in `charts.ts` and are imported here rather than
 * duplicated — the duplicate copies had already drifted apart, which is how
 * Histogram ended up without the label-overlap handling BarChart has.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asNumber, asBoolean } from "../utils.js";
import {
  AXIS_CAPTION_PX,
  CHART_A11Y_PROPS,
  EMPTY_TEXT,
  LOADING_TEXT,
  type SeriesData,
  cellText,
  chartLabel,
  chartPlaceholder,
  chartTable,
  colorAt,
  createSvg,
  drawAxes,
  drawAxisCaptions,
  drawValueTicks,
  drawXAxisLabels,
  formatNumeric,
  legend,
  makeActivatable,
  nameChart,
  planLabels,
  readChartA11y,
  readChartHeight,
  readSeries,
  resolveTone,
  seriesColor,
  svgEl,
  tickGutter,
  truncateToWidth,
} from "./charts.js";

/* ----------------------------------------------------------------------- *
 * Gauge
 * ----------------------------------------------------------------------- */

interface Threshold {
  value: number;
  tone: string;
}

export const Gauge: ComponentSpec = {
  name: "Gauge",
  description:
    "Half-doughnut gauge indicator for a single value between `min` and " +
    "`max`. The inner value renders as a plain number — pass `unit` (\"%\", " +
    "\"ms\", \"pts\") or `format: \"percent\"` for a suffix, or `label` to " +
    "override the text entirely. Pass `thresholds: [{value, tone}]` to band " +
    "the track and recolour the arc as the value crosses each band. Use for " +
    "KPI thresholds (uptime %, score, capacity, NPS, page-speed).",
  props: [
    { name: "value", type: "number" },
    { name: "min", type: "number", optional: true, description: "Lower bound (default 0)" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Inner label override (defaults to the formatted value)" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "caption", type: "string", optional: true, description: "Small caption below the gauge" },
    { name: "unit", type: "string", optional: true, aliases: ["suffix"], description: "Suffix appended to the value (\"%\", \"ms\", \"pts\")" },
    { name: "format", type: "string", optional: true, enum: ["number", "percent", "compact"], description: "Number formatting for the inner label (default \"number\")" },
    { name: "thresholds", type: "{value: number, tone: string}[]", optional: true, description: "Bands drawn on the track; the highest one the value passes colours the arc" },
    { name: "showRange", type: "boolean", optional: true, description: "Print the min / max end labels so the scale is readable" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props) => {
    const a11y = readChartA11y(props);
    const min = asNumber(props.min, 0);
    const max = Math.max(min + 1, asNumber(props.max, 100));
    const value = Math.max(min, Math.min(max, asNumber(props.value, min)));
    const pct = (value - min) / (max - min);
    const thresholds = readThresholds(props.thresholds, min, max);
    // The band the value currently sits in owns the arc colour, so a capacity
    // gauge turns amber at 80 and red at 95 without re-authoring `tone`.
    const crossed = thresholds.filter((t) => value >= t.value);
    const tone = crossed.length > 0 ? crossed[crossed.length - 1]!.tone : resolveTone(props.tone);
    const size = asString(props.size, "md");
    const showRange = asBoolean(props.showRange);
    const px = size === "lg" ? 220 : size === "sm" ? 140 : 180;
    const half = px / 2;
    const stroke = size === "lg" ? 18 : size === "sm" ? 10 : 14;
    const r = half - stroke;
    const root = el("div", {
      // `rui-chart` supplies the card frame every sibling chart gets; without
      // it a Gauge next to a BarChart rendered as an unframed transparent block.
      class: "rui-chart rui-gauge",
      "data-tone": tone,
      "data-size": size,
    });
    const svg = createSvg(px, half + stroke + (showRange ? 22 : 4));
    // The value is already rendered as text below, so the graphic is always
    // decorative — hiding it (and dropping `role="img"` with it) beats
    // announcing an unnamed image. The root carries the value instead.
    nameChart(svg, { name: "", decorative: true }, "");
    const cx = half;
    const cy = half;
    const startX = cx - r;
    const startY = cy;
    const endX = cx + r;
    const endY = cy;
    const track = `M${startX},${startY} A${r},${r} 0 0 1 ${endX},${endY}`;
    svg.append(svgEl("path", {
      d: track,
      fill: "none",
      stroke: "var(--rui-color-border, #e2e8f0)",
      "stroke-width": String(stroke),
      "stroke-linecap": "round",
    }));
    // Threshold bands sit on the track, under the value arc.
    thresholds.forEach((threshold, i) => {
      const from = (threshold.value - min) / (max - min);
      const to = i + 1 < thresholds.length
        ? (thresholds[i + 1]!.value - min) / (max - min)
        : 1;
      if (to <= from) return;
      const [x1, y1] = arcPoint(cx, cy, r, from);
      const [x2, y2] = arcPoint(cx, cy, r, to);
      svg.append(svgEl("path", {
        d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
        fill: "none",
        stroke: `var(--rui-color-${threshold.tone}, ${colorAt(0)})`,
        "stroke-width": String(stroke),
        "stroke-opacity": "0.22",
        "stroke-linecap": "butt",
      }));
    });
    if (pct > 0) {
      // The arc is drawn full-length and revealed with `stroke-dasharray`,
      // which is what `.rui-gauge-arc`'s transition animates. Rebuilding the
      // path `d` per render (the previous approach) can never animate — `d`
      // is not a transitionable property.
      const arcLength = Math.PI * r;
      svg.append(svgEl("path", {
        d: track,
        fill: "none",
        stroke: `var(--rui-color-${tone}, ${colorAt(0)})`,
        "stroke-width": String(stroke),
        "stroke-linecap": "round",
        "stroke-dasharray": `${(arcLength * pct).toFixed(2)} ${(arcLength + 1).toFixed(2)}`,
        class: "rui-gauge-arc",
      }));
    }
    if (showRange) {
      const baseY = cy + stroke / 2 + 14;
      svg.append(svgEl("text", {
        x: String(Math.max(2, startX - stroke / 2)),
        y: baseY.toFixed(1),
        "text-anchor": "start",
        class: "rui-chart-tick",
      }, [formatNumeric(min)]));
      svg.append(svgEl("text", {
        x: String(Math.min(px - 2, endX + stroke / 2)),
        y: baseY.toFixed(1),
        "text-anchor": "end",
        class: "rui-chart-tick",
      }, [formatNumeric(max)]));
    }
    root.append(svg);
    const unit = asString(props.unit).trim();
    const format = asString(props.format, "number").toLowerCase();
    const autoLabel = formatGaugeValue(value, format, unit);
    const label = asString(props.label) || autoLabel;
    const caption = asString(props.caption);
    // `decorative` means "do not announce the graphic". The arc is already
    // `aria-hidden`, so here it drops the meter semantics as well and leaves
    // the value + caption as the plain visible text they are — hiding those
    // would remove on-screen text from the a11y tree, which is a worse defect.
    if (!a11y.decorative) {
      root.setAttribute("role", "meter");
      root.setAttribute("aria-valuenow", String(value));
      root.setAttribute("aria-valuemin", String(min));
      root.setAttribute("aria-valuemax", String(max));
      root.setAttribute("aria-valuetext", label);
      root.setAttribute("aria-label", a11y.name || caption || asString(props.label) || "Gauge");
    }
    root.append(el("div", { class: "rui-gauge-value" }, [label]));
    if (caption) root.append(el("div", { class: "rui-gauge-caption" }, [caption]));
    return root;
  },
};

/** Point on the gauge's upper semicircle at `fraction` (0 = left, 1 = right). */
function arcPoint(cx: number, cy: number, r: number, fraction: number): [number, number] {
  const angle = Math.PI * Math.max(0, Math.min(1, fraction));
  return [cx - r * Math.cos(angle), cy - r * Math.sin(angle)];
}

function readThresholds(raw: unknown, min: number, max: number): Threshold[] {
  return asArray<unknown>(raw)
    .map((entry) => {
      const r = (entry ?? {}) as { value?: unknown; at?: unknown; tone?: unknown };
      return {
        value: asNumber(r.value ?? r.at, NaN),
        tone: resolveTone(r.tone, "warning"),
      };
    })
    .filter((t) => Number.isFinite(t.value) && t.value > min && t.value <= max)
    .sort((a, b) => a.value - b.value);
}

/**
 * Format the gauge's inner label. A `%` is appended only when the author asks
 * for one: inferring it from a 0-100 range labelled every Lighthouse score,
 * NPS figure and risk score as a percentage of nothing.
 */
function formatGaugeValue(value: number, format: string, unit: string): string {
  const num = format === "compact" ? formatNumeric(value) : plainNumber(value);
  const suffix = unit || (format === "percent" ? "%" : "");
  if (!suffix) return num;
  // Word units read as "72 pts"; symbols sit flush ("72%").
  return /^[a-z]/i.test(suffix) ? `${num} ${suffix}` : `${num}${suffix}`;
}

function plainNumber(value: number): string {
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (value % 1 === 0) return String(value);
  // Two decimals, trailing zeros trimmed. Rounding to one decimal turned the
  // canonical `Gauge(99.95, 0, 100)` uptime reading into a perfect "100.0%".
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/* ----------------------------------------------------------------------- *
 * Heatmap
 * ----------------------------------------------------------------------- */

export const Heatmap: ComponentSpec = {
  name: "Heatmap",
  description:
    "Color-intensity matrix grid (calendar-style or correlation-style). " +
    "Pass `xLabels`, `yLabels`, and a `values` array of arrays (rows × " +
    "columns). Cell intensity scales across the data range — pin it with " +
    "`min`/`max` when two heatmaps must be comparable (or for a -1..1 " +
    "correlation matrix). Set `showValues: false` for a GitHub-style " +
    "colour-only grid. Use for activity heatmaps, schedule density, " +
    "correlation matrices.",
  props: [
    { name: "xLabels", type: "string[]" },
    { name: "yLabels", type: "string[]" },
    { name: "values", type: "number[][]", description: "Matrix indexed by row (y), then column (x)" },
    { name: "title", type: "string", optional: true },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "showValues", type: "boolean", optional: true, description: "Print the number inside each cell (default true)" },
    { name: "min", type: "number", optional: true, description: "Value mapped to the lightest cell (default 0 or the data minimum)" },
    { name: "max", type: "number", optional: true, description: "Value mapped to the most saturated cell (default the data maximum)" },
    { name: "valueFormat", type: "string", optional: true, enum: ["value", "compact", "percent"], description: "How cell numbers are formatted (default \"value\")" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there is no data (default \"No data\")" },
    { name: "onCellClick", type: "callable", optional: true, description: "(value, xLabel, yLabel) => void, fired when a cell is activated" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props, helpers) => {
    const xLabels = asArray<unknown>(props.xLabels).map((l) => asString(l));
    const yLabels = asArray<unknown>(props.yLabels).map((l) => asString(l));
    const valueRows: number[][] = asArray<unknown>(props.values).map((row) =>
      asArray<unknown>(row).map((v) => asNumber(v, 0)));
    // `tone` is interpolated into an inline `style`, and the validator only
    // enum-checks string literals — a tone from a `$variable` would otherwise
    // reach the declaration unchecked.
    const tone = resolveTone(props.tone);
    const showValues = props.showValues == null ? true : asBoolean(props.showValues);
    const valueFormat = asString(props.valueFormat, "value").toLowerCase();
    const onCellClick = props.onCellClick;
    const title = asString(props.title);
    const root = el("div", { class: "rui-chart rui-heatmap", "data-tone": tone });
    if (title) root.append(el("div", { class: "rui-chart-title" }, [title]));
    if (!valueRows.some((row) => row.length > 0)) {
      return chartPlaceholder(root, asString(props.emptyText) || EMPTY_TEXT, false);
    }

    const flat = valueRows.flat();
    const domainMin = props.min == null ? Math.min(0, ...flat) : asNumber(props.min, 0);
    const domainMax = props.max == null ? Math.max(1, ...flat) : asNumber(props.max, 1);
    const span = domainMax - domainMin || 1;
    // The stylesheet sizes the grid from `--rui-heatmap-cols`; nothing set it,
    // so every matrix was forced into 7 data columns and wider ones wrapped
    // into phantom rows.
    const cols = Math.max(1, xLabels.length, ...valueRows.map((row) => row.length));
    // A grid of bare divs is unreadable to assistive tech; the table roles cost
    // nothing and make the matrix navigable. `grid` (not `table`) is the role
    // that permits focusable cells, so it is used when cells are activatable.
    const clickable = typeof onCellClick === "function";
    const a11y = readChartA11y(props, clickable);
    const tableWrap = el("div", {
      class: "rui-heatmap-table",
      style: `--rui-heatmap-cols:${cols}`,
    });
    if (a11y.decorative) {
      tableWrap.setAttribute("aria-hidden", "true");
    } else {
      tableWrap.setAttribute("role", clickable ? "grid" : "table");
      // A table/grid with no name is announced as an anonymous table: the
      // `.rui-chart-title` above it is a sibling, not a label, so nothing tied
      // the matrix to what it is a matrix OF.
      const rows = valueRows.length;
      tableWrap.setAttribute("aria-label", a11y.name || chartLabel(
        "Heatmap",
        title,
        // Spoken aloud, so it is worth being grammatical about a 1×N matrix.
        `${rows} row${rows === 1 ? "" : "s"} by ${cols} column${cols === 1 ? "" : "s"}.`,
      ));
    }
    const cellRole = clickable ? "gridcell" : "cell";
    const headerRow = el("div", { class: "rui-heatmap-row rui-heatmap-row-header", role: "row" });
    headerRow.append(el("div", { class: "rui-heatmap-cell rui-heatmap-corner", role: "columnheader" }));
    for (let c = 0; c < cols; c += 1) {
      headerRow.append(el("div", {
        class: "rui-heatmap-cell rui-heatmap-xlabel",
        role: "columnheader",
      }, [xLabels[c] ?? ""]));
    }
    tableWrap.append(headerRow);
    valueRows.forEach((row, rIdx) => {
      const yLabel = yLabels[rIdx] ?? String(rIdx + 1);
      const rowEl = el("div", { class: "rui-heatmap-row", role: "row" });
      rowEl.append(el("div", {
        class: "rui-heatmap-cell rui-heatmap-ylabel",
        role: "rowheader",
      }, [yLabel]));
      for (let cIdx = 0; cIdx < cols; cIdx += 1) {
        const value = row[cIdx];
        const xLabel = xLabels[cIdx] ?? String(cIdx + 1);
        if (value === undefined) {
          // Pad short rows so the remaining columns stay aligned.
          rowEl.append(el("div", { class: "rui-heatmap-cell", role: cellRole }));
          continue;
        }
        const intensity = Math.max(0, Math.min(1, (value - domainMin) / span));
        const background =
          `background:color-mix(in srgb, var(--rui-color-${tone}, ${colorAt(0)}) ` +
          `${Math.round(intensity * 90 + 5)}%, transparent);`;
        const cell = el("div", {
          class: "rui-heatmap-cell rui-heatmap-value",
          style: clickable ? `${background}cursor:pointer;` : background,
          title: `${xLabel} · ${yLabel}: ${value}`,
          role: cellRole,
        });
        if (showValues) cell.append(el("span", {}, [formatCellValue(value, valueFormat)]));
        if (clickable) {
          makeActivatable(cell, `${xLabel} · ${yLabel}: ${value}`, () => {
            helpers.invoke(onCellClick, value, xLabel, yLabel);
          });
          // Keep the grid semantics — `role="button"` would drop the cell out
          // of the matrix for screen-reader table navigation.
          cell.setAttribute("role", cellRole);
        }
        rowEl.append(cell);
      }
      tableWrap.append(rowEl);
    });
    root.append(tableWrap);
    return root;
  },
};

function formatCellValue(value: number, format: string): string {
  if (format === "compact") return formatNumeric(value);
  if (format === "percent") return `${Math.round(value)}%`;
  return String(value);
}

/* ----------------------------------------------------------------------- *
 * RadarChart
 * ----------------------------------------------------------------------- */

export const RadarChart: ComponentSpec = {
  name: "RadarChart",
  description:
    "Polygon chart with one axis per category (at least three). Use for " +
    "skill maps, scorecards, capability comparisons, and any " +
    "multi-dimensional snapshot. Each Series renders as a filled polygon — " +
    "overlapping is expected for comparisons. Set `showValues: true` to " +
    "print the number at each vertex.",
  props: [
    { name: "axes", type: "string[]", description: "Category labels — one per radial axis (minimum 3)" },
    { name: "series", type: "Series[]" },
    { name: "max", type: "number", optional: true, description: "Outer ring value (default = max across series)" },
    { name: "title", type: "string", optional: true },
    { name: "size", type: "number", optional: true, description: "Diameter in px (default 280) — raise it for long axis names" },
    { name: "showDots", type: "boolean", optional: true, description: "Draw a marker at each vertex (default true)" },
    { name: "showValues", type: "boolean", optional: true, description: "Print each series value next to its vertex" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there is no data (default \"No data\")" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props) => {
    const axes = asArray<unknown>(props.axes).map((a) => asString(a));
    const series = readSeries(asArray<unknown>(props.series));
    const title = asString(props.title);
    const a11y = readChartA11y(props);
    const showDots = props.showDots == null ? true : asBoolean(props.showDots);
    const showValues = asBoolean(props.showValues);
    const root = el("div", { class: "rui-chart rui-radar-chart" });
    if (title) root.append(el("div", { class: "rui-chart-title" }, [title]));
    // Padding a 1- or 2-axis chart out to a triangle invented axes the data
    // never described and pinned them at the centre.
    if (axes.length < 3) {
      return chartPlaceholder(root, "A radar chart needs at least 3 axes", false);
    }
    if (!series.some((s) => s.values.length > 0)) {
      return chartPlaceholder(root, asString(props.emptyText) || EMPTY_TEXT, false);
    }

    const n = axes.length;
    const size = Math.max(160, Math.min(640, readChartHeight(props.size, 280)));
    // The ring is square but the axis names stick out sideways, so the viewBox
    // is wider than tall. A square viewBox left ~8px for the left and right
    // labels, which truncated a scorecard's category names to one character.
    const vbWidth = Math.round(size * 1.45);
    const cx = vbWidth / 2;
    const cy = size / 2;
    const r = size / 2 - 26;
    const max = Math.max(1, asNumber(props.max, series.flatMap((s) => s.values).reduce((m, v) => Math.max(m, v), 1)));
    const svg = createSvg(vbWidth, size);
    nameChart(svg, a11y, chartLabel("Radar chart", title,
      `${series.length} series across ${n} axes: ${axes.join(", ")}.`));
    svg.setAttribute("style", `max-width:${vbWidth}px;max-height:${size}px;margin-inline:auto`);
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
      const labelX = cx + (r + 14) * Math.cos(angle);
      const labelY = cy + (r + 14) * Math.sin(angle);
      // Centre-anchoring every label pushed the left and right extremes
      // outside the viewBox, where the SVG viewport clipped them. Anchor by
      // side and truncate to the room that actually remains.
      const cos = Math.cos(angle);
      const anchor = cos > 0.15 ? "start" : cos < -0.15 ? "end" : "middle";
      const available = anchor === "start"
        ? vbWidth - labelX - 2
        : anchor === "end"
          ? labelX - 2
          : Math.min(labelX, vbWidth - labelX) * 2 - 2;
      const label = axes[j] ?? "";
      const display = truncateToWidth(label, available);
      const text = svgEl("text", {
        x: labelX.toFixed(1),
        y: labelY.toFixed(1),
        "text-anchor": anchor,
        "dominant-baseline": "middle",
        class: "rui-chart-label",
        "font-size": "13",
        "font-weight": "500",
      }, [display]);
      if (display !== label) text.append(svgEl("title", {}, [label]));
      svg.append(text);
    }
    series.forEach((s, sIdx) => {
      const color = seriesColor(s, sIdx);
      const vertices: Array<{ x: number; y: number; value: number; axis: string }> = [];
      for (let j = 0; j < n; j += 1) {
        const value = s.values[j];
        // A series shorter than `axes` used to plot the missing axes at the
        // centre, which reads as a real score of zero.
        if (value === undefined) continue;
        const ratio = Math.max(0, Math.min(1, value / max));
        const angle = (Math.PI * 2 * j) / n - Math.PI / 2;
        vertices.push({
          x: cx + r * ratio * Math.cos(angle),
          y: cy + r * ratio * Math.sin(angle),
          value,
          axis: axes[j] ?? "",
        });
      }
      if (vertices.length < 2) return;
      const points = vertices.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ");
      const complete = vertices.length === n;
      const shape = svgEl(complete ? "polygon" : "polyline", {
        points,
        fill: complete ? color : "none",
        "fill-opacity": "0.2",
        stroke: color,
        "stroke-width": "2",
        "stroke-linejoin": "round",
        // An open dashed outline signals "this series does not cover every
        // axis" rather than silently describing a different shape.
        ...(complete ? {} : { "stroke-dasharray": "5 4" }),
      });
      shape.append(svgEl("title", {}, [
        complete ? s.name : `${s.name} (${vertices.length} of ${n} axes)`,
      ]));
      svg.append(shape);
      if (showDots || showValues) {
        for (const vertex of vertices) {
          if (showDots) {
            const dot = svgEl("circle", {
              cx: vertex.x.toFixed(1),
              cy: vertex.y.toFixed(1),
              r: "3.5",
              fill: color,
            });
            dot.append(svgEl("title", {}, [`${s.name} — ${vertex.axis}: ${vertex.value}`]));
            svg.append(dot);
          }
          if (showValues) {
            svg.append(svgEl("text", {
              x: vertex.x.toFixed(1),
              y: (vertex.y - 7).toFixed(1),
              "text-anchor": "middle",
              class: "rui-chart-tick",
            }, [formatNumeric(vertex.value)]));
          }
        }
      }
    });
    root.append(svg);
    if (!a11y.decorative) {
      root.append(chartTable(
        title || "Radar chart data",
        axes,
        series.map((s) => ({
          label: s.name,
          cells: axes.map((_, j) => cellText(s.values[j])),
        })),
      ));
    }
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

function readScatterSeries(raw: unknown[]): { name: string; points: ScatterPoint[]; color?: string }[] {
  return raw.map((entry, i) => {
    const node = entry as { args?: unknown[] };
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const color = asString(node.args?.[2]).trim();
    // Points arrive either in the explicit `points` slot or — the documented
    // `Series(name, points)` form — positionally in the `values` slot.
    const raw2 = node.args?.[3] ?? node.args?.[1];
    const points = asArray<unknown>(raw2).map((p) => {
      if (Array.isArray(p)) {
        return { x: asNumber(p[0], 0), y: asNumber(p[1], 0), label: asString(p[2]) };
      }
      if (p && typeof p === "object") {
        const r = p as Record<string, unknown>;
        return { x: asNumber(r.x, 0), y: asNumber(r.y, 0), label: asString(r.label) };
      }
      return { x: 0, y: 0, label: "" };
    });
    return color ? { name, points, color } : { name, points };
  });
}

export const ScatterChart: ComponentSpec = {
  name: "ScatterChart",
  description:
    "XY scatter plot — one dot per data point, optionally grouped by " +
    "series. Pass each `Series(name, points)` with points as " +
    "`{x, y, label?}` objects or `[x, y, label?]` tuples. Tune " +
    "`pointSize` / `pointOpacity` for dense distributions and pin " +
    "`xMin`/`xMax`/`yMin`/`yMax` when two plots must share a scale. Use for " +
    "correlations, distributions, and \"price vs. rating\" style charts.",
  props: [
    { name: "series", type: "Series[]" },
    { name: "xLabel", type: "string", optional: true },
    { name: "yLabel", type: "string", optional: true },
    { name: "title", type: "string", optional: true },
    { name: "pointSize", type: "number", optional: true, description: "Dot radius in px (default 7 — lower it for dense plots)" },
    { name: "pointOpacity", type: "number", optional: true, description: "Dot fill opacity 0–1 (default 0.8)" },
    { name: "xMin", type: "number", optional: true, description: "Pin the left of the x axis (default the data minimum)" },
    { name: "xMax", type: "number", optional: true, description: "Pin the right of the x axis (default the data maximum)" },
    { name: "yMin", type: "number", optional: true, description: "Pin the bottom of the y axis (default the data minimum)" },
    { name: "yMax", type: "number", optional: true, description: "Pin the top of the y axis (default the data maximum)" },
    { name: "height", type: "number", optional: true, description: "Plot height in px (default 280)" },
    { name: "showLegend", type: "boolean", optional: true, description: "Render the series legend (default true)" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there are no points (default \"No points\")" },
    { name: "onPointClick", type: "callable", optional: true, description: "(x, y, label, seriesName) => void, fired when a point is activated" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props, helpers) => {
    const series = readScatterSeries(asArray<unknown>(props.series));
    const title = asString(props.title);
    const showLegend = props.showLegend == null ? true : asBoolean(props.showLegend);
    const onPointClick = props.onPointClick;
    const a11y = readChartA11y(props, typeof onPointClick === "function");
    const root = el("div", { class: "rui-chart rui-scatter-chart" });
    if (title) root.append(el("div", { class: "rui-chart-title" }, [title]));
    const points = series.flatMap((s) => s.points);
    if (points.length === 0) {
      return chartPlaceholder(root, asString(props.emptyText) || "No points", false);
    }
    const xLabel = asString(props.xLabel);
    const yLabel = asString(props.yLabel);
    const width = 640;
    const height = readChartHeight(props.height, 280);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = props.xMin == null ? Math.min(...xs) : asNumber(props.xMin);
    const maxXRaw = props.xMax == null ? Math.max(...xs) : asNumber(props.xMax);
    const minY = props.yMin == null ? Math.min(...ys) : asNumber(props.yMin);
    const maxYRaw = props.yMax == null ? Math.max(...ys) : asNumber(props.yMax);
    const maxX = maxXRaw > minX ? maxXRaw : minX + 1;
    const maxY = maxYRaw > minY ? maxYRaw : minY + 1;
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const padding = {
      left: tickGutter(minY, maxY) + (yLabel ? AXIS_CAPTION_PX : 0),
      right: 16,
      top: 16,
      bottom: 24 + (xLabel ? AXIS_CAPTION_PX : 0),
    };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const svg = createSvg(width, height);
    nameChart(svg, a11y, chartLabel("Scatter plot", title,
      `${points.length} points across ${series.length} series` +
      `${xLabel || yLabel ? `, ${xLabel || "x"} against ${yLabel || "y"}` : ""}.`));
    if (height !== 280) svg.setAttribute("style", `max-height:${height}px`);
    drawAxes(svg, padding, innerWidth, innerHeight, maxY, minY);
    // Without x ticks the x coordinate of every dot is unreadable: the axis
    // was a bare rule with only an optional axis TITLE under it.
    drawValueTicks(svg, padding, innerWidth, innerHeight, maxX, minX);
    svg.append(svgEl("line", {
      x1: String(padding.left),
      y1: String(padding.top + innerHeight),
      x2: String(padding.left + innerWidth),
      y2: String(padding.top + innerHeight),
      stroke: "var(--rui-color-border, #e2e8f0)",
    }));
    const pointSize = Math.max(1, Math.min(24, asNumber(props.pointSize, 7)));
    const pointOpacity = Math.max(0.05, Math.min(1, asNumber(props.pointOpacity, 0.8)));
    series.forEach((s, sIdx) => {
      const color = seriesColor(s, sIdx);
      s.points.forEach((pt) => {
        const cx = padding.left + ((pt.x - minX) / xRange) * innerWidth;
        const cy = padding.top + innerHeight - ((pt.y - minY) / yRange) * innerHeight;
        const circle = svgEl("circle", {
          cx: cx.toFixed(1),
          cy: cy.toFixed(1),
          r: String(pointSize),
          fill: color,
          "fill-opacity": String(pointOpacity),
          // The dots sit on the chart card, whose background is
          // `--rui-color-surface`; a literal #fff haloed every point in dark mode.
          stroke: "var(--rui-color-surface, #fff)",
          "stroke-width": "1.5",
        });
        const description = pt.label || `${s.name}: ${pt.x}, ${pt.y}`;
        circle.append(svgEl("title", {}, [description]));
        if (typeof onPointClick === "function") {
          makeActivatable(circle, description, () => {
            helpers.invoke(onPointClick, pt.x, pt.y, pt.label, s.name);
          });
        }
        svg.append(circle);
      });
    });
    drawAxisCaptions(svg, padding, innerWidth, innerHeight, height, xLabel, yLabel);
    root.append(svg);
    if (!a11y.decorative) {
      root.append(chartTable(
        title || "Scatter plot data",
        [xLabel || "x", yLabel || "y", "Label"],
        series.flatMap((s) => s.points.map((pt, i) => ({
          label: `${s.name} #${i + 1}`,
          cells: [String(pt.x), String(pt.y), pt.label || "—"],
        }))),
      ));
    }
    const seriesData: SeriesData[] = series.map((s) => ({
      name: s.name,
      values: s.points.map((p) => p.y),
      ...(s.color ? { color: s.color } : {}),
    }));
    if (showLegend && seriesData.length > 0) root.append(legend(seriesData));
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
    "directly (the component bins them automatically, `binCount` bins) or " +
    "pre-computed `bins` of `{label, count}` objects. Use for " +
    "response-time histograms, score distributions, age buckets.",
  props: [
    { name: "values", type: "number[]", optional: true, description: "Raw observations (binned automatically)" },
    // `binCount` precedes `bins` so the documented `Histogram(values, binCount)`
    // call binds where the prompt says it does. It used to land in `bins`,
    // fail the array check, and be discarded without a diagnostic.
    { name: "binCount", type: "number", optional: true, description: "Number of bins when computing from `values` (default 10)" },
    { name: "bins", type: "object[]", optional: true, description: "Pre-computed {label, count} entries (overrides `values`)" },
    { name: "title", type: "string", optional: true },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"], description: "Bar colour token (default the first palette colour)" },
    { name: "xLabel", type: "string", optional: true, description: "Caption for the value axis (e.g. \"ms\")" },
    { name: "yLabel", type: "string", optional: true, description: "Caption for the frequency axis (e.g. \"requests\")" },
    { name: "height", type: "number", optional: true, description: "Plot height in px (default 240)" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when there is no data (default \"No data\")" },
    { name: "loading", type: "boolean", optional: true, description: "Render a loading placeholder instead of the plot" },
    { name: "onBinClick", type: "callable", optional: true, description: "(binLabel, count, binIndex) => void, fired when a bar is activated" },
    ...CHART_A11Y_PROPS,
  ],
  render: (_node, props, helpers) => {
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
    const title = asString(props.title);
    const tone = resolveTone(props.tone, "");
    const onBinClick = props.onBinClick;
    const a11y = readChartA11y(props, typeof onBinClick === "function");
    const root = el("div", { class: "rui-chart rui-histogram" });
    if (title) root.append(el("div", { class: "rui-chart-title" }, [title]));
    if (asBoolean(props.loading)) return chartPlaceholder(root, LOADING_TEXT, true);
    if (bins.length === 0) {
      return chartPlaceholder(root, asString(props.emptyText) || EMPTY_TEXT, false);
    }
    const xLabel = asString(props.xLabel);
    const yLabel = asString(props.yLabel);
    const width = 640;
    const height = readChartHeight(props.height, 240);
    const max = Math.max(1, ...bins.map((b) => b.count));
    const labels = bins.map((b) => b.label);
    const padding = {
      left: 40 + (yLabel ? AXIS_CAPTION_PX : 0),
      right: 12,
      top: 16,
      bottom: 0,
    };
    const innerWidth = width - padding.left - padding.right;
    // Bin range labels ("1,250–2,500") are long and there can be up to 50 of
    // them; the shared planner rotates, truncates and thins them instead of
    // smearing every label over its neighbours.
    const labelPlan = planLabels(labels, innerWidth);
    padding.bottom = labelPlan.bottomPadding + (xLabel ? AXIS_CAPTION_PX : 0);
    const innerHeight = height - padding.top - padding.bottom;
    const slot = innerWidth / bins.length;
    const fill = tone ? `var(--rui-color-${tone}, ${colorAt(0)})` : colorAt(0);
    const svg = createSvg(width, height);
    nameChart(svg, a11y, chartLabel("Histogram", title, `${bins.length} bins.`));
    if (height !== 240) svg.setAttribute("style", `max-height:${height}px`);
    drawAxes(svg, padding, innerWidth, innerHeight, max);
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
        fill,
        rx: "2",
      });
      rect.append(svgEl("title", {}, [`${bin.label}: ${bin.count}`]));
      if (typeof onBinClick === "function") {
        makeActivatable(rect, `${bin.label}: ${bin.count}`, () => {
          helpers.invoke(onBinClick, bin.label, bin.count, i);
        });
      }
      svg.append(rect);
    });
    drawXAxisLabels(svg, labels, padding, innerHeight, labelPlan,
      (i) => padding.left + i * slot + slot / 2);
    drawAxisCaptions(svg, padding, innerWidth, innerHeight, height, xLabel, yLabel);
    root.append(svg);
    if (!a11y.decorative) {
      root.append(chartTable(
        title || "Histogram data",
        labels,
        [{ label: yLabel || "Count", cells: bins.map((b) => String(b.count)) }],
      ));
    }
    return root;
  },
};

function formatBinLabel(value: number): string {
  if (!Number.isFinite(value)) return "?";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 10) return value.toFixed(0);
  return value.toFixed(1);
}
