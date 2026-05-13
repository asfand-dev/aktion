/**
 * Data components: Table, Col, List, ListItem, StatCard, Tree, TreeNode.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import { el, asArray, asString, asBoolean, renderIcon } from "../utils.js";

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
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name" },
  ],
  render: (_node, props) => {
    const li = el("li", { class: "rui-list-item" });
    const iconNode = renderIcon(props.icon, { className: "rui-list-icon" });
    if (iconNode) li.append(iconNode);
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
    const tag = asBoolean(props.ordered) ? "ol" : "ul";
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
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a chip beside the label" },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-stat-card" });
    const labelRow = el("div", { class: "rui-stat-label-row" });
    const iconNode = renderIcon(props.icon, { className: "rui-stat-icon" });
    if (iconNode) labelRow.append(iconNode);
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

export const TreeNode: ComponentSpec = {
  name: "TreeNode",
  description:
    "Single node in a Tree view. When `children` is provided the node " +
    "renders as an expandable branch with a chevron; otherwise it renders " +
    "as a leaf. `action` fires on click. Use `active=true` to highlight " +
    "the current selection.",
  props: [
    { name: "label", type: "string" },
    { name: "children", type: "TreeNode[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon shown before the label" },
    { name: "expanded", type: "boolean", optional: true, description: "Whether the branch is open by default" },
    { name: "active", type: "boolean", optional: true, description: "Highlights the row as the current selection" },
    { name: "badge", type: "string", optional: true, description: "Trailing chip (count or status)" },
    { name: "action", type: "Action", optional: true, description: "Action fired when the row is clicked" },
  ],
  render: (_node, props, helpers) => {
    const children = asArray<unknown>(props.children);
    const hasChildren = children.length > 0;
    const expanded = asBoolean(props.expanded);
    const active = asBoolean(props.active);
    const isClickable = isActionPayload(props.action);

    const row = el(isClickable ? "button" : "div" as "div", {
      type: isClickable ? "button" : null,
      class: "rui-tree-node-row",
      role: "treeitem",
      "data-active": active ? "true" : "false",
      "aria-expanded": hasChildren ? (expanded ? "true" : "false") : null,
    });

    if (hasChildren) {
      const chevron = renderIcon("chevron-right", { className: "rui-tree-node-chevron" });
      if (chevron) row.append(chevron);
    } else {
      row.append(el("span", { class: "rui-tree-node-chevron-spacer", "aria-hidden": "true" }));
    }
    const iconNode = renderIcon(props.icon, { className: "rui-tree-node-icon" });
    if (iconNode) row.append(iconNode);
    row.append(el("span", { class: "rui-tree-node-label" }, [asString(props.label)]));
    const badge = asString(props.badge);
    if (badge) row.append(el("span", { class: "rui-tree-node-badge" }, [badge]));

    if (isClickable) {
      row.onclick = () => helpers.runAction(props.action);
    }

    if (!hasChildren) return row;

    // Branch: render as a <details> so expand/collapse is browser-native
    // (no extra state slot needed) and survives morph reconciliation.
    const details = el("details", { class: "rui-tree-node" }) as HTMLDetailsElement;
    if (expanded) details.setAttribute("open", "");
    const summary = el("summary", { class: "rui-tree-node-summary" });
    summary.append(row);
    // When the row is clickable, swallow the summary's default toggle so a
    // click on the label runs the action without expanding/collapsing. The
    // chevron still toggles because we wire it explicitly below.
    if (isClickable) {
      summary.onclick = (event) => {
        const target = event.target as Element | null;
        if (target?.closest(".rui-tree-node-chevron")) return;
        event.preventDefault();
      };
    }
    details.append(summary);

    const childList = el("div", { class: "rui-tree-node-children", role: "group" });
    for (const child of children) childList.append(helpers.renderNode(child));
    details.append(childList);
    return details;
  },
};

export const Tree: ComponentSpec = {
  name: "Tree",
  description:
    "Hierarchical tree view. Children must be TreeNode entries. Use for " +
    "file browsers, nested navigation, category pickers, and any " +
    "parent/child structure with arbitrary depth.",
  props: [{ name: "items", type: "TreeNode[]" }],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-tree", role: "tree" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
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
