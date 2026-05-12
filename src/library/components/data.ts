/**
 * Data components: Table, Col, List, ListItem, StatCard.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString } from "../utils.js";

export const Col: ComponentSpec = {
  name: "Col",
  description: "Single column inside a Table.",
  props: [
    { name: "header", type: "string" },
    { name: "values", type: "any[]", description: "Column values (use array pluck like data.rows.title)" },
    { name: "format", type: "string", optional: true, enum: ["text", "number", "currency", "date"] },
  ],
  // Cols are read positionally inside Table.render — this render is a fallback.
  render: (_node, props) => {
    const wrapper = el("div", { class: "rui-col" });
    wrapper.append(el("strong", {}, [asString(props.header)]));
    return wrapper;
  },
};

export const Table: ComponentSpec = {
  name: "Table",
  description: "Tabular data view. Children must be Col components.",
  props: [
    { name: "columns", type: "Col[]" },
    { name: "caption", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const cols = asArray<{ args?: unknown[] }>(props.columns);
    const wrapper = el("div", { class: "rui-table-wrapper" });
    const table = el("table", { class: "rui-table" });

    const caption = asString(props.caption);
    if (caption) table.append(el("caption", { class: "rui-table-caption" }, [caption]));

    const thead = el("thead");
    const headRow = el("tr");
    for (const col of cols) {
      headRow.append(el("th", {}, [asString(col.args?.[0])]));
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = el("tbody");
    const columnValues = cols.map((col) => asArray(col.args?.[1]));
    const formats = cols.map((col) => asString(col.args?.[2], "text"));
    const rowCount = Math.max(0, ...columnValues.map((c) => c.length));

    for (let r = 0; r < rowCount; r += 1) {
      const tr = el("tr");
      columnValues.forEach((values, c) => {
        const cell = values[r];
        const format = formats[c] ?? "text";
        const td = el("td", { "data-format": format });
        if (cell !== null && typeof cell === "object" && (cell as { __kind?: string }).__kind === "Component") {
          td.append(helpers.renderNode(cell));
        } else {
          td.textContent = formatCell(cell, format);
        }
        tr.append(td);
      });
      tbody.append(tr);
    }

    if (rowCount === 0) {
      const emptyRow = el("tr");
      emptyRow.append(el("td", { colspan: String(cols.length || 1), class: "rui-table-empty" }, ["No data"]));
      tbody.append(emptyRow);
    }

    table.append(tbody);
    wrapper.append(table);
    return wrapper;
  },
};

export const ListItem: ComponentSpec = {
  name: "ListItem",
  description: "Single list item with optional title and description.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const li = el("li", { class: "rui-list-item" });
    const icon = asString(props.icon);
    if (icon) li.append(el("span", { class: "rui-list-icon" }, [icon]));
    const text = el("div", { class: "rui-list-text" });
    text.append(el("div", { class: "rui-list-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) text.append(el("div", { class: "rui-list-description" }, [desc]));
    li.append(text);
    return li;
  },
};

export const List: ComponentSpec = {
  name: "List",
  description: "Vertical list of ListItems.",
  props: [
    { name: "items", type: "ListItem[]" },
    { name: "ordered", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const tag = asString(props.ordered) === "true" ? "ol" : "ul";
    const root = el(tag as "ul", { class: "rui-list" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const StatCard: ComponentSpec = {
  name: "StatCard",
  description: "Single KPI card with label, value, optional delta, and optional icon.",
  props: [
    { name: "label", type: "string" },
    { name: "value", type: "string" },
    { name: "trend", type: "string", optional: true, enum: ["up", "down", "flat"] },
    { name: "delta", type: "string", optional: true, description: "Change vs previous period" },
    { name: "icon", type: "string", optional: true, description: "Optional emoji shown in a chip beside the label" },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-stat-card" });
    const icon = asString(props.icon);
    const labelRow = el("div", { class: "rui-stat-label-row" });
    if (icon) labelRow.append(el("span", { class: "rui-stat-icon" }, [icon]));
    labelRow.append(el("div", { class: "rui-stat-label" }, [asString(props.label)]));
    root.append(labelRow);
    root.append(el("div", { class: "rui-stat-value" }, [asString(props.value)]));
    const delta = asString(props.delta);
    const trend = asString(props.trend);
    if (delta || trend) {
      root.append(el("div", { class: "rui-stat-trend", "data-trend": trend || "flat" }, [delta || trendArrow(trend)]));
    }
    return root;
  },
};

function trendArrow(trend: string): string {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "—";
}

function formatCell(value: unknown, format: string): string {
  if (value === null || value === undefined) return "";
  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : asString(value);
    case "currency":
      return typeof value === "number"
        ? value.toLocaleString(undefined, { style: "currency", currency: "USD" })
        : asString(value);
    case "date":
      try {
        const d = new Date(asString(value));
        return Number.isNaN(d.getTime()) ? asString(value) : d.toLocaleDateString();
      } catch { return asString(value); }
    default:
      return asString(value);
  }
}
