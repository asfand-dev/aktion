/**
 * Chart components: Series (data definition), BarChart, LineChart, PieChart.
 *
 * The charts are rendered as inline SVG so they work inside the shadow root
 * without any external dependency.
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

export const Series: ComponentSpec = {
  name: "Series",
  description: "Named data series for charts. Used inside BarChart, LineChart, PieChart.",
  props: [
    { name: "name", type: "string" },
    { name: "values", type: "number[]" },
  ],
  render: (_node, props) => {
    return el("span", { class: "rui-series", "data-name": asString(props.name) });
  },
};

interface SeriesData {
  name: string;
  values: number[];
}

const readSeries = (raw: unknown[]): SeriesData[] => {
  return raw.map((s, i) => {
    const node = s as { args?: unknown[] };
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const values = asArray<unknown>(node.args?.[1]).map((v) => asNumber(v));
    return { name, values };
  });
};

export const BarChart: ComponentSpec = {
  name: "BarChart",
  description: "Vertical bar chart. `labels` define the x-axis, `series` define grouped bars.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "series", type: "Series[]" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const labels = asArray<unknown>(props.labels).map((l) => asString(l));
    const series = readSeries(asArray<unknown>(props.series));
    const root = el("div", { class: "rui-chart rui-bar-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));

    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const svg = createSvg(640, 240);
    const padding = { left: 40, right: 12, top: 12, bottom: 32 };
    const innerWidth = 640 - padding.left - padding.right;
    const innerHeight = 240 - padding.top - padding.bottom;

    drawAxes(svg, padding, innerWidth, innerHeight, max);

    const groupCount = labels.length;
    const groupWidth = innerWidth / Math.max(groupCount, 1);
    const seriesCount = series.length;
    const barWidth = (groupWidth * 0.7) / Math.max(seriesCount, 1);

    series.forEach((s, sIdx) => {
      s.values.forEach((value, gIdx) => {
        const barHeight = (value / max) * innerHeight;
        const x = padding.left + gIdx * groupWidth + groupWidth * 0.15 + sIdx * barWidth;
        const y = padding.top + innerHeight - barHeight;
        const rect = svgEl("rect", {
          x: String(x),
          y: String(y),
          width: String(barWidth - 2),
          height: String(barHeight),
          fill: colorAt(sIdx),
          rx: "2",
        });
        rect.append(svgEl("title", {}, [`${s.name}: ${value}`]));
        svg.append(rect);
      });
    });

    labels.forEach((label, i) => {
      const x = padding.left + (i + 0.5) * groupWidth;
      svg.append(svgEl("text", {
        x: String(x),
        y: String(padding.top + innerHeight + 18),
        "text-anchor": "middle",
        class: "rui-chart-label",
      }, [label]));
    });

    root.append(svg);
    if (series.length > 0) root.append(legend(series));
    return root;
  },
};

export const LineChart: ComponentSpec = {
  name: "LineChart",
  description: "Line chart. `labels` define the x-axis, each Series is a line.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "series", type: "Series[]" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const labels = asArray<unknown>(props.labels).map((l) => asString(l));
    const series = readSeries(asArray<unknown>(props.series));
    const root = el("div", { class: "rui-chart rui-line-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));

    const all = series.flatMap((s) => s.values);
    const max = Math.max(1, ...all);
    const min = Math.min(0, ...all);
    const svg = createSvg(640, 240);
    const padding = { left: 40, right: 12, top: 12, bottom: 32 };
    const innerWidth = 640 - padding.left - padding.right;
    const innerHeight = 240 - padding.top - padding.bottom;

    drawAxes(svg, padding, innerWidth, innerHeight, max, min);

    const stepX = innerWidth / Math.max(labels.length - 1, 1);
    series.forEach((s, sIdx) => {
      const points = s.values.map((value, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + innerHeight - ((value - min) / (max - min || 1)) * innerHeight;
        return [x, y] as const;
      });
      const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      svg.append(svgEl("path", {
        d,
        fill: "none",
        stroke: colorAt(sIdx),
        "stroke-width": "2",
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }));
      points.forEach(([x, y]) => {
        svg.append(svgEl("circle", {
          cx: String(x),
          cy: String(y),
          r: "3",
          fill: colorAt(sIdx),
        }));
      });
    });

    labels.forEach((label, i) => {
      const x = padding.left + i * stepX;
      svg.append(svgEl("text", {
        x: String(x),
        y: String(padding.top + innerHeight + 18),
        "text-anchor": "middle",
        class: "rui-chart-label",
      }, [label]));
    });

    root.append(svg);
    if (series.length > 0) root.append(legend(series));
    return root;
  },
};

export const PieChart: ComponentSpec = {
  name: "PieChart",
  description: "Pie/Donut chart. Each segment maps to a label/value pair.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "values", type: "number[]" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const labels = asArray<unknown>(props.labels).map((l) => asString(l));
    const values = asArray<unknown>(props.values).map((v) => asNumber(v));
    const root = el("div", { class: "rui-chart rui-pie-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));

    const total = values.reduce((acc, v) => acc + v, 0) || 1;
    const svg = createSvg(240, 240);
    const cx = 120, cy = 120, r = 90;
    let angle = -Math.PI / 2;

    values.forEach((value, i) => {
      const slice = (value / total) * Math.PI * 2;
      const next = angle + slice;
      const large = slice > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(next);
      const y2 = cy + r * Math.sin(next);
      const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
      const segment = svgEl("path", {
        d: path,
        fill: colorAt(i),
        stroke: "var(--rui-color-bg, #fff)",
        "stroke-width": "2",
      });
      segment.append(svgEl("title", {}, [`${labels[i] ?? ""}: ${value}`]));
      svg.append(segment);
      angle = next;
    });

    root.append(svg);
    root.append(legend(labels.map((name, i) => ({ name, values: [values[i] ?? 0] }))));
    return root;
  },
};

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

function drawAxes(
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
      x: String(padding.left - 6),
      y: String(y + 3),
      "text-anchor": "end",
      class: "rui-chart-tick",
    }, [String(Math.round((min + (max - min) * ratio) * 10) / 10)]));
  }
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
