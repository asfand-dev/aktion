/**
 * Tier 1–3 components: IconButton, CommandPalette, FilterChips, FieldRepeater,
 * VirtualList, QueryBuilder, DiffViewer, JsonTree, Gantt, Truncate, InlineEdit,
 * NotificationBell.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
} from "../utils.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";

const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const BUTTON_SIZES = ["xs", "sm", "md", "lg", "xl", "small", "normal", "large"] as const;

function normaliseButtonSize(value: unknown): string {
  const v = asString(value).trim().toLowerCase();
  if (v === "xs" || v === "extra-small") return "xs";
  if (v === "small" || v === "sm") return "sm";
  if (v === "large" || v === "lg") return "lg";
  if (v === "xl" || v === "extra-large") return "xl";
  if (v === "normal" || v === "md" || v === "") return "md";
  if (v === "xs" || v === "sm" || v === "md" || v === "lg" || v === "xl") return v;
  return "md";
}

function readChipList(raw: unknown): Array<{ label: string; value: string }> {
  return asArray<unknown>(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry as { label?: unknown; value?: unknown };
      const value = asString(obj.value ?? obj.label);
      return { value, label: asString(obj.label, value) };
    }
    const value = asString(entry);
    return { value, label: value };
  }).filter((c) => c.label !== "");
}

function readPlainObjects(raw: unknown): Record<string, unknown>[] {
  return asArray<unknown>(raw).filter(
    (e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e),
  ) as Record<string, unknown>[];
}

type CommandItem = { label: string; value: string; group?: string; shortcut?: string; action?: unknown };

function readCommandItems(raw: unknown): CommandItem[] {
  return asArray<unknown>(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry as CommandItem;
      const value = asString(obj.value ?? obj.label);
      return {
        value,
        label: asString(obj.label, value),
        group: asString(obj.group) || undefined,
        shortcut: asString(obj.shortcut) || undefined,
        action: obj.action,
      };
    }
    const value = asString(entry);
    return { value, label: value };
  }).filter((i) => i.label !== "");
}

function readFields(raw: unknown): Array<{ name: string; label: string; type?: string }> {
  return asArray<unknown>(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry as { name?: unknown; label?: unknown; type?: unknown };
      const name = asString(obj.name ?? obj.label);
      return { name, label: asString(obj.label, name), type: asString(obj.type, "text") || "text" };
    }
    const name = asString(entry);
    return { name, label: name, type: "text" };
  }).filter((f) => f.name !== "");
}

function readGanttTasks(raw: unknown): Array<{
  id: string; label: string; start: string; end: string; progress?: number;
}> {
  return readPlainObjects(raw).map((t, i) => ({
    id: asString(t.id, `task-${i}`),
    label: asString(t.label ?? t.name, `Task ${i + 1}`),
    start: asString(t.start),
    end: asString(t.end),
    progress: t.progress != null ? asNumber(t.progress, 0) : undefined,
  }));
}

function parseIsoDate(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? Date.now() : t;
}

function diffLines(left: string, right: string): Array<{ type: "same" | "add" | "remove"; text: string }> {
  const a = left.split("\n");
  const b = right.split("\n");
  const max = Math.max(a.length, b.length);
  const out: Array<{ type: "same" | "add" | "remove"; text: string }> = [];
  for (let i = 0; i < max; i++) {
    const la = a[i];
    const lb = b[i];
    if (la === lb) {
      if (la !== undefined) out.push({ type: "same", text: la });
    } else {
      if (la !== undefined) out.push({ type: "remove", text: la });
      if (lb !== undefined) out.push({ type: "add", text: lb });
    }
  }
  return out;
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildJsonTree(data: unknown, expanded: boolean, depth = 0): HTMLElement {
  const root = el("div", { class: "rui-json-tree-node", "data-depth": String(depth) });
  if (data === null || typeof data !== "object") {
    root.append(el("span", { class: "rui-json-tree-leaf" }, [jsonPreview(data)]));
    return root;
  }
  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);
  const open = expanded || depth < 1;
  const toggle = el("button", {
    type: "button",
    class: "rui-json-tree-toggle",
    "aria-expanded": open ? "true" : "false",
  }, [open ? "▼" : "▶", isArray ? ` Array(${entries.length})` : ` Object`]);
  const children = el("div", { class: "rui-json-tree-children", "data-open": open ? "true" : "false" });
  if (open) {
    for (const [key, val] of entries) {
      const row = el("div", { class: "rui-json-tree-row" });
      row.append(el("span", { class: "rui-json-tree-key" }, [`${key}: `]));
      if (val !== null && typeof val === "object") {
        row.append(buildJsonTree(val, expanded, depth + 1));
      } else {
        row.append(el("span", { class: "rui-json-tree-leaf" }, [jsonPreview(val)]));
      }
      children.append(row);
    }
  }
  toggle.onclick = () => {
    const next = children.getAttribute("data-open") !== "true";
    children.setAttribute("data-open", next ? "true" : "false");
    toggle.setAttribute("aria-expanded", next ? "true" : "false");
    toggle.firstChild!.textContent = next ? "▼" : "▶";
    if (next && children.childElementCount === 0) {
      for (const [key, val] of entries) {
        const row = el("div", { class: "rui-json-tree-row" });
        row.append(el("span", { class: "rui-json-tree-key" }, [`${key}: `]));
        if (val !== null && typeof val === "object") {
          row.append(buildJsonTree(val, expanded, depth + 1));
        } else {
          row.append(el("span", { class: "rui-json-tree-leaf" }, [jsonPreview(val)]));
        }
        children.append(row);
      }
    }
  };
  root.append(toggle, children);
  return root;
}

/* ----------------------------------------------------------------------- *
 * Tier 1
 * ----------------------------------------------------------------------- */

export const IconButton: ComponentSpec = {
  name: "IconButton",
  description:
    "Icon-only button with an accessible label. Use for toolbars, table row actions, and compact controls.",
  props: [
    { name: "icon", type: "string", description: "Font Awesome icon name" },
    { name: "label", type: "string", description: "Accessible label (visually hidden)" },
    { name: "action", type: "Action", optional: true },
    { name: "variant", type: "string", optional: true, enum: BUTTON_VARIANTS },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const btn = el("button", {
      class: "rui-icon-button",
      type: "button",
      "data-variant": asString(props.variant, "ghost"),
      "data-size": normaliseButtonSize(props.size),
      "aria-label": asString(props.label),
      title: asString(props.label),
      disabled: asBoolean(props.disabled) ? "" : null,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-icon-button-icon" });
    if (iconNode) btn.append(iconNode);
    btn.onclick = () => {
      if (isActionPayload(props.action)) helpers.runAction(props.action);
    };
    return btn;
  },
};

export const CommandPalette: ComponentSpec = {
  name: "CommandPalette",
  description:
    "Cmd-K style searchable command list. Pass `items` as `{label, value, group?, shortcut?, action?}` objects.",
  props: [
    { name: "items", type: "any[]" },
    { name: "open", type: "boolean", optional: true, description: "Whether the palette is visible (default true)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "shortcut", type: "string", optional: true, description: "Hint label, e.g. Cmd+K" },
  ],
  render: (_node, props, helpers) => {
    const items = readCommandItems(props.items);
    const openSlot = helpers.useInstanceState<boolean>("open", props.open === undefined ? true : asBoolean(props.open));
    const filterSlot = helpers.useInstanceState<string>("filter", "");
    const isOpen = openSlot.get();

    const host = el("div", { class: "rui-command-palette", "data-open": isOpen ? "true" : "false" });
    if (!isOpen) return host;

    const backdrop = el("div", { class: "rui-command-palette-backdrop" });
    const shell = el("div", { class: "rui-command-palette-panel", role: "dialog", "aria-modal": "true" });
    const header = el("div", { class: "rui-command-palette-header" });
    const search = el("input", {
      type: "text",
      class: "rui-command-palette-input",
      placeholder: asString(props.placeholder, "Search commands…"),
      value: filterSlot.get(),
      autocomplete: "off",
    }) as HTMLInputElement;
    header.append(search);
    const shortcut = asString(props.shortcut);
    if (shortcut) header.append(el("span", { class: "rui-command-palette-shortcut" }, [shortcut]));
    shell.append(header);

    const list = el("div", { class: "rui-command-palette-list", role: "listbox" });
    const paintList = (filter: string): void => {
      list.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === ""
        ? items
        : items.filter((i) =>
            i.label.toLowerCase().includes(lower) ||
            i.value.toLowerCase().includes(lower) ||
            (i.group ?? "").toLowerCase().includes(lower),
          );
      let lastGroup = "";
      for (const item of matches.slice(0, 50)) {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          list.append(el("div", { class: "rui-command-palette-group" }, [lastGroup]));
        }
        const row = el("button", {
          type: "button",
          class: "rui-command-palette-item",
          role: "option",
          "data-value": item.value,
        }, [item.label]);
        if (item.shortcut) row.append(el("span", { class: "rui-command-palette-item-kbd" }, [item.shortcut]));
        row.onclick = (event) => {
          event.stopPropagation();
          if (isActionPayload(item.action)) helpers.runAction(item.action);
          openSlot.set(false);
          filterSlot.set("");
          host.setAttribute("data-open", "false");
          disposeDismissListeners(shell);
        };
        list.append(row);
      }
      if (matches.length === 0) {
        list.append(el("div", { class: "rui-command-palette-empty" }, ["No commands found"]));
      }
    };
    paintList(filterSlot.get());
    shell.append(list);

    backdrop.onclick = () => {
      openSlot.set(false);
      host.setAttribute("data-open", "false");
      disposeDismissListeners(shell);
    };
    host.append(backdrop, shell);

    search.oninput = (event) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      filterSlot.set(value);
      paintList(value);
    };
    search.onkeydown = (event) => {
      if ((event as KeyboardEvent).key === "Escape") {
        openSlot.set(false);
        host.setAttribute("data-open", "false");
        disposeDismissListeners(shell);
      }
    };
    setTimeout(() => search.focus(), 0);
    installDismissListeners({
      liveRoot: shell,
      key: "command-palette",
      onDismiss: () => {
        openSlot.set(false);
        host.setAttribute("data-open", "false");
      },
    });
    return host;
  },
};

export const FilterChips: ComponentSpec = {
  name: "FilterChips",
  description: "Removable filter chips with an optional clear-all control.",
  props: [
    { name: "chips", type: "any[]", description: "Array of strings or {label, value} objects" },
    { name: "onRemove", type: "Action", optional: true, description: "Receives the removed chip value via @Js" },
    { name: "onClear", type: "Action", optional: true },
  ],
  render: (_node, props, helpers) => {
    const chips = readChipList(props.chips);
    const root = el("div", { class: "rui-filter-chips" });
    const row = el("div", { class: "rui-filter-chips-row" });
    for (const chip of chips) {
      const pill = el("span", { class: "rui-filter-chip", "data-value": chip.value });
      pill.append(el("span", { class: "rui-filter-chip-label" }, [chip.label]));
      const remove = el("button", {
        type: "button",
        class: "rui-filter-chip-remove",
        "aria-label": `Remove ${chip.label}`,
      });
      const xIcon = renderIcon("xmark", { className: "rui-filter-chip-remove-icon" });
      if (xIcon) remove.append(xIcon);
      remove.onclick = () => {
        if (isActionPayload(props.onRemove)) helpers.runAction(props.onRemove);
      };
      pill.append(remove);
      row.append(pill);
    }
    root.append(row);
    if (chips.length > 0 && isActionPayload(props.onClear)) {
      const clear = el("button", { type: "button", class: "rui-filter-chips-clear" }, ["Clear all"]);
      clear.onclick = () => helpers.runAction(props.onClear);
      root.append(clear);
    }
    return root;
  },
};

export const FieldRepeater: ComponentSpec = {
  name: "FieldRepeater",
  description:
    "Dynamic list of field groups. Pass `items` as row objects and `fields` as `{name, label, type?}` definitions.",
  props: [
    { name: "items", type: "any[]" },
    { name: "fields", type: "any[]" },
    { name: "onAdd", type: "Action", optional: true },
    { name: "onRemove", type: "Action", optional: true },
    { name: "addLabel", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const rows = readPlainObjects(props.items);
    const fields = readFields(props.fields);
    const root = el("div", { class: "rui-field-repeater" });
    rows.forEach((row, index) => {
      const card = el("div", { class: "rui-field-repeater-row", "data-index": String(index) });
      const grid = el("div", { class: "rui-field-repeater-grid" });
      for (const field of fields) {
        const wrap = el("label", { class: "rui-field-repeater-field" });
        wrap.append(el("span", { class: "rui-field-repeater-label" }, [field.label]));
        const input = el("input", {
          class: "rui-input",
          type: field.type === "number" ? "number" : "text",
          name: `${field.name}-${index}`,
          value: asString(row[field.name]),
          readonly: "",
        });
        wrap.append(input);
        grid.append(wrap);
      }
      card.append(grid);
      if (isActionPayload(props.onRemove)) {
        const remove = el("button", {
          type: "button",
          class: "rui-field-repeater-remove",
          "aria-label": "Remove row",
        }, ["Remove"]);
        remove.onclick = () => helpers.runAction(props.onRemove);
        card.append(remove);
      }
      root.append(card);
    });
    if (isActionPayload(props.onAdd)) {
      const add = el("button", {
        type: "button",
        class: "rui-field-repeater-add rui-button",
        "data-variant": "secondary",
      }, [asString(props.addLabel, "Add row")]);
      add.onclick = () => helpers.runAction(props.onAdd);
      root.append(add);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Tier 2
 * ----------------------------------------------------------------------- */

export const VirtualList: ComponentSpec = {
  name: "VirtualList",
  description:
    "Windowed vertical list for large datasets. Pass pre-rendered nodes as `items` " +
    "or plain row objects plus a `renderItem` component node per row.",
  props: [
    { name: "items", type: "any[]" },
    { name: "itemHeight", type: "number", optional: true, description: "Fixed row height in px (default 40)" },
    { name: "renderItem", type: "Node", optional: true, description: "Template node rendered per data row" },
  ],
  render: (_node, props, helpers) => {
    const itemHeight = Math.max(24, asNumber(props.itemHeight, 40));
    const rawItems = asArray<unknown>(props.items);
    const viewport = el("div", { class: "rui-virtual-list" });
    const scrollEl = el("div", { class: "rui-virtual-list-scroller" });
    const spacer = el("div", { class: "rui-virtual-list-spacer" });
    const windowEl = el("div", { class: "rui-virtual-list-window" });

    const total = rawItems.length;
    spacer.style.height = `${total * itemHeight}px`;
    spacer.style.position = "relative";
    windowEl.style.position = "absolute";
    windowEl.style.top = "0";
    windowEl.style.left = "0";
    windowEl.style.right = "0";
    scrollEl.style.maxHeight = `${Math.min(Math.max(total, 1), 12) * itemHeight}px`;
    scrollEl.style.overflow = "auto";

    const renderSlice = (startIndex: number): void => {
      windowEl.replaceChildren();
      const viewHeight = scrollEl.clientHeight || itemHeight * 12;
      const visible = Math.ceil(viewHeight / itemHeight) + 2;
      const start = Math.max(0, startIndex);
      const end = Math.min(total, start + visible);
      windowEl.style.transform = `translateY(${start * itemHeight}px)`;
      for (let i = start; i < end; i++) {
        const entry = rawItems[i];
        if (props.renderItem) {
          windowEl.append(helpers.renderNode(entry ?? props.renderItem));
        } else if (entry && typeof entry === "object" && (entry as { __kind?: string }).__kind) {
          windowEl.append(helpers.renderNode(entry));
        } else {
          const row = el("div", { class: "rui-virtual-list-item", style: `height:${itemHeight}px` });
          row.append(el("span", {}, [asString(entry)]));
          windowEl.append(row);
        }
      }
    };

    scrollEl.onscroll = () => {
      const start = Math.floor(scrollEl.scrollTop / itemHeight);
      renderSlice(start);
    };
    renderSlice(0);
    scrollEl.append(spacer, windowEl);
    viewport.append(scrollEl);
    return viewport;
  },
};

export const QueryBuilder: ComponentSpec = {
  name: "QueryBuilder",
  description:
    "Visual filter builder. Pass `fields` as `{name, label, type?}` and bind `value` to a rule array.",
  props: [
    { name: "fields", type: "any[]" },
    { name: "value", type: "any[]", optional: true },
    { name: "onChange", type: "Action", optional: true },
  ],
  render: (node, props, helpers) => {
    const fields = readFields(props.fields);
    const rules = readPlainObjects(props.value);
    const stateRef = node.argMeta?.[1]?.stateRef;
    const root = el("div", { class: "rui-query-builder" });

    const paint = (current: Record<string, unknown>[]): void => {
      root.replaceChildren();
      current.forEach((rule, index) => {
        const row = el("div", { class: "rui-query-builder-row", "data-index": String(index) });
        const fieldSelect = el("select", { class: "rui-select rui-query-builder-field" });
        for (const f of fields) {
          fieldSelect.append(el("option", { value: f.name }, [f.label]));
        }
        fieldSelect.value = asString(rule.field ?? fields[0]?.name);
        const opSelect = el("select", { class: "rui-select rui-query-builder-op" }, []);
        for (const op of ["equals", "contains", "gt", "lt"]) {
          opSelect.append(el("option", { value: op }, [op]));
        }
        opSelect.value = asString(rule.op, "equals");
        const valueInput = el("input", {
          class: "rui-input rui-query-builder-value",
          value: asString(rule.value),
        });
        row.append(fieldSelect, opSelect, valueInput);
        const remove = el("button", { type: "button", class: "rui-query-builder-remove" }, ["×"]);
        remove.onclick = () => {
          const next = current.filter((_, i) => i !== index);
          if (stateRef) helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: stateRef, value: next }] });
          else if (isActionPayload(props.onChange)) helpers.runAction(props.onChange);
          paint(next);
        };
        row.append(remove);
        root.append(row);
      });
      const add = el("button", { type: "button", class: "rui-query-builder-add" }, ["Add rule"]);
      add.onclick = () => {
        const next = [...current, { field: fields[0]?.name ?? "", op: "equals", value: "" }];
        if (stateRef) helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: stateRef, value: next }] });
        else if (isActionPayload(props.onChange)) helpers.runAction(props.onChange);
        paint(next);
      };
      root.append(add);
    };

    paint(rules.length > 0 ? rules : [{ field: fields[0]?.name ?? "", op: "equals", value: "" }]);
    return root;
  },
};

export const DiffViewer: ComponentSpec = {
  name: "DiffViewer",
  description: "Side-by-side or unified diff of two text blobs.",
  props: [
    { name: "left", type: "string" },
    { name: "right", type: "string" },
    { name: "mode", type: "string", optional: true, enum: ["split", "unified"], description: "Default split" },
  ],
  render: (_node, props) => {
    const left = asString(props.left);
    const right = asString(props.right);
    const mode = asString(props.mode, "split");
    const root = el("div", { class: "rui-diff-viewer", "data-mode": mode });

    if (mode === "unified") {
      const body = el("pre", { class: "rui-diff-viewer-unified" });
      for (const line of diffLines(left, right)) {
        body.append(el("div", { class: `rui-diff-line rui-diff-line-${line.type}` }, [
          (line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  ") + line.text,
        ]));
      }
      root.append(body);
      return root;
    }

    const panes = el("div", { class: "rui-diff-viewer-panes" });
    const leftPane = el("pre", { class: "rui-diff-viewer-pane rui-diff-viewer-left" }, [left]);
    const rightPane = el("pre", { class: "rui-diff-viewer-pane rui-diff-viewer-right" }, [right]);
    panes.append(leftPane, rightPane);
    root.append(panes);
    return root;
  },
};

export const JsonTree: ComponentSpec = {
  name: "JsonTree",
  description: "Expandable JSON tree viewer for objects and arrays.",
  props: [
    { name: "data", type: "any" },
    { name: "expanded", type: "boolean", optional: true, description: "Expand all nodes (default: first level only)" },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-json-tree" });
    root.append(buildJsonTree(props.data, asBoolean(props.expanded)));
    return root;
  },
};

export const Gantt: ComponentSpec = {
  name: "Gantt",
  description:
    "Simple Gantt chart. Pass `tasks` as `{id, label, start, end, progress?}` ISO date strings.",
  props: [
    { name: "tasks", type: "any[]" },
    { name: "startDate", type: "string", optional: true },
    { name: "endDate", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const tasks = readGanttTasks(props.tasks);
    const starts = tasks.map((t) => parseIsoDate(t.start));
    const ends = tasks.map((t) => parseIsoDate(t.end));
    const rangeStart = props.startDate
      ? parseIsoDate(asString(props.startDate))
      : (starts.length ? Math.min(...starts) : Date.now());
    const rangeEnd = props.endDate
      ? parseIsoDate(asString(props.endDate))
      : (ends.length ? Math.max(...ends) : rangeStart + 86_400_000);
    const span = Math.max(rangeEnd - rangeStart, 1);

    const root = el("div", { class: "rui-gantt" });
    const track = el("div", { class: "rui-gantt-track" });
    for (const task of tasks) {
      const row = el("div", { class: "rui-gantt-row" });
      row.append(el("div", { class: "rui-gantt-label" }, [task.label]));
      const barWrap = el("div", { class: "rui-gantt-bars" });
      const startPct = ((parseIsoDate(task.start) - rangeStart) / span) * 100;
      const widthPct = Math.max(
        ((parseIsoDate(task.end) - parseIsoDate(task.start)) / span) * 100,
        2,
      );
      const bar = el("div", {
        class: "rui-gantt-bar",
        style: `left:${startPct}%;width:${widthPct}%`,
        title: `${task.start} → ${task.end}`,
      });
      if (task.progress != null) {
        bar.append(el("div", {
          class: "rui-gantt-bar-progress",
          style: `width:${Math.min(100, Math.max(0, task.progress))}%`,
        }));
      }
      barWrap.append(bar);
      row.append(barWrap);
      track.append(row);
    }
    root.append(track);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Tier 3
 * ----------------------------------------------------------------------- */

export const Truncate: ComponentSpec = {
  name: "Truncate",
  description: "Clamp long text with an expand control.",
  props: [
    { name: "text", type: "string" },
    { name: "maxLines", type: "number", optional: true, description: "Lines before clamping (default 3)" },
    { name: "expandLabel", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const maxLines = Math.max(1, Math.floor(asNumber(props.maxLines, 3)));
    const expandedSlot = helpers.useInstanceState<boolean>("expanded", false);
    const root = el("div", { class: "rui-truncate", "data-expanded": expandedSlot.get() ? "true" : "false" });
    const body = el("p", {
      class: "rui-truncate-text",
      style: expandedSlot.get() ? "" : `display:-webkit-box;-webkit-line-clamp:${maxLines};-webkit-box-orient:vertical;overflow:hidden`,
    }, [asString(props.text)]);
    const toggle = el("button", {
      type: "button",
      class: "rui-truncate-toggle",
    }, [expandedSlot.get() ? "Show less" : asString(props.expandLabel, "Show more")]);
    toggle.onclick = () => {
      const next = !expandedSlot.get();
      expandedSlot.set(next);
      body.style.cssText = next
        ? ""
        : `display:-webkit-box;-webkit-line-clamp:${maxLines};-webkit-box-orient:vertical;overflow:hidden`;
      toggle.textContent = next ? "Show less" : asString(props.expandLabel, "Show more");
      root.setAttribute("data-expanded", next ? "true" : "false");
    };
    root.append(body, toggle);
    return root;
  },
};

export const InlineEdit: ComponentSpec = {
  name: "InlineEdit",
  description: "Click-to-edit inline field with save on Enter or blur.",
  props: [
    { name: "value", type: "string" },
    { name: "label", type: "string", optional: true },
    { name: "onSave", type: "Action", optional: true },
  ],
  render: (node, props, helpers) => {
    const editingSlot = helpers.useInstanceState<boolean>("editing", false);
    const draftSlot = helpers.useInstanceState<string>("draft", asString(props.value));
    const stateRef = node.argMeta?.[0]?.stateRef;
    const root = el("div", { class: "rui-inline-edit", "data-editing": editingSlot.get() ? "true" : "false" });
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-inline-edit-label" }, [label]));

    const display = el("button", {
      type: "button",
      class: "rui-inline-edit-display",
    }, [asString(props.value)]);
    const input = el("input", {
      class: "rui-inline-edit-input rui-input",
      value: draftSlot.get(),
    }) as HTMLInputElement;

    const commit = (): void => {
      editingSlot.set(false);
      root.setAttribute("data-editing", "false");
      if (stateRef) {
        helpers.runAction({
          kind: "Action",
          steps: [{ kind: "Set", name: stateRef, value: draftSlot.get() }],
        });
      }
      if (isActionPayload(props.onSave)) helpers.runAction(props.onSave);
    };

    display.onclick = () => {
      draftSlot.set(asString(props.value));
      editingSlot.set(true);
      root.setAttribute("data-editing", "true");
      setTimeout(() => input.focus(), 0);
    };
    input.oninput = (event) => draftSlot.set((event.currentTarget as HTMLInputElement).value);
    input.onkeydown = (event) => {
      if ((event as KeyboardEvent).key === "Enter") commit();
      if ((event as KeyboardEvent).key === "Escape") {
        editingSlot.set(false);
        root.setAttribute("data-editing", "false");
      }
    };
    input.onblur = () => commit();

    root.append(display, input);
    return root;
  },
};

export const NotificationBell: ComponentSpec = {
  name: "NotificationBell",
  description: "Bell icon with unread count badge and dropdown notification list.",
  props: [
    { name: "count", type: "number", optional: true },
    { name: "items", type: "any[]", optional: true, description: "{title, message?, time?} objects" },
    { name: "onOpen", type: "Action", optional: true },
  ],
  render: (_node, props, helpers) => {
    const count = Math.max(0, Math.floor(asNumber(props.count, 0)));
    const items = readPlainObjects(props.items);
    const openSlot = helpers.useInstanceState<boolean>("open", false);
    const isOpen = openSlot.get();

    const root = el("div", { class: "rui-notification-bell", "data-open": isOpen ? "true" : "false" });
    const trigger = el("button", {
      type: "button",
      class: "rui-notification-bell-trigger",
      "aria-expanded": isOpen ? "true" : "false",
      "aria-haspopup": "true",
    });
    const bell = renderIcon("bell", { className: "rui-notification-bell-icon" });
    if (bell) trigger.append(bell);
    if (count > 0) {
      trigger.append(el("span", { class: "rui-notification-bell-badge" }, [
        count > 99 ? "99+" : String(count),
      ]));
    }
    root.append(trigger);

    const panel = el("div", { class: "rui-notification-bell-panel", role: "menu" });
    if (items.length === 0) {
      panel.append(el("div", { class: "rui-notification-bell-empty" }, ["No notifications"]));
    } else {
      for (const item of items) {
        const row = el("div", { class: "rui-notification-bell-item" });
        row.append(el("div", { class: "rui-notification-bell-item-title" }, [asString(item.title)]));
        const msg = asString(item.message);
        if (msg) row.append(el("div", { class: "rui-notification-bell-item-message" }, [msg]));
        const time = asString(item.time);
        if (time) row.append(el("div", { class: "rui-notification-bell-item-time" }, [time]));
        panel.append(row);
      }
    }
    root.append(panel);

    trigger.onclick = (event) => {
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      root.setAttribute("data-open", next ? "true" : "false");
      trigger.setAttribute("aria-expanded", next ? "true" : "false");
      if (next) {
        if (isActionPayload(props.onOpen)) helpers.runAction(props.onOpen);
        installDismissListeners({
          liveRoot: root,
          key: "notification-bell",
          onDismiss: () => {
            openSlot.set(false);
            root.setAttribute("data-open", "false");
            trigger.setAttribute("aria-expanded", "false");
          },
        });
      } else {
        disposeDismissListeners(root);
      }
    };
    return root;
  },
};
