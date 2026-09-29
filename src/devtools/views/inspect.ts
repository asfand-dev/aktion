/**
 * Inspector — the component tree beside everything about one instance: its
 * props (editable, with overrides), per-instance state, owned effects, the DOM
 * it produced with its box model, computed styles and theme variables, what a
 * screen reader announces, and where it is written in the program.
 */

import { h, type Child, type VNode } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";
import { can, type ViewContext, type ViewDefinition } from "../context.js";
import type { ComponentPropRecord, DevtoolsValue, InstanceDetail, InstanceNode } from "../protocol.js";
import { effectAggregates } from "../model.js";
import { componentNameFromKey } from "../tree.js";
import { parseEditedValue } from "../serialize.js";
import {
  a11ySummary, COMPUTED_GROUPS, computedGroup, cssPath, cssVariables, describeElement, measureBox, type BoxModel,
} from "../overlay.js";
import { announce, auditAccessibility, tabOrder } from "../a11y.js";
import { icon } from "../ui/icons.js";
import {
  button, chip, emptyState, field, fmtMs, iconButton, note, searchField, spacer, stat, statGrid, tabs, viewbar, kv, filterChip,
} from "../ui/kit.js";
import { split } from "../ui/layout.js";
import { setAtPath, valueTree } from "../ui/value.js";
import { codeView, highlightLines } from "../ui/code.js";
import { atomChip, noApp, openSource, paneSize, setPaneSize, unsupported } from "./common.js";

/* -------------------------------------------------------------------------- */
/*  Tree projection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The nodes the tree shows. With a filter: a flat list of matches. With the
 * Library toggle off: only user components, each re-parented to its nearest
 * kept ancestor so the hierarchy survives instead of collapsing to a list.
 */
export function visibleNodes(ctx: Pick<ViewContext, "ui">, nodes: ReadonlyArray<InstanceNode>): InstanceNode[] {
  const filter = ctx.ui.inspectFilter.trim().toLowerCase();
  if (filter) {
    return nodes
      .filter((node) => node.name.toLowerCase().includes(filter) || node.instanceKey.toLowerCase().includes(filter) || (node.explicitKey ?? "").toLowerCase().includes(filter))
      .map((node) => ({ ...node, depth: 0, parentKey: null }));
  }
  if (ctx.ui.inspectShowLibrary) return [...nodes];
  const kept = new Set<string>();
  for (const node of nodes) if (node.kind === "user") kept.add(node.instanceKey);
  const byKey = new Map(nodes.map((node) => [node.instanceKey, node]));
  const out: InstanceNode[] = [];
  const depthOf = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== "user") continue;
    let parent = node.parentKey;
    let guard = 0;
    while (parent !== null && !kept.has(parent) && guard++ < 200) parent = byKey.get(parent)?.parentKey ?? null;
    const depth = parent === null ? 0 : (depthOf.get(parent) ?? 0) + 1;
    depthOf.set(node.instanceKey, depth);
    out.push({ ...node, parentKey: parent, depth });
  }
  return out;
}

interface TreeRow {
  node: InstanceNode;
  hasChildren: boolean;
  collapsed: boolean;
}

function treeRows(ctx: ViewContext, nodes: ReadonlyArray<InstanceNode>): TreeRow[] {
  const parents = new Set<string>();
  for (const node of nodes) if (node.parentKey) parents.add(node.parentKey);
  const rows: TreeRow[] = [];
  const hidden = new Set<string>();
  const filtering = ctx.ui.inspectFilter.trim() !== "";
  for (const node of nodes) {
    if (node.parentKey && (hidden.has(node.parentKey) || ctx.ui.inspectCollapsed.has(node.parentKey))) {
      hidden.add(node.instanceKey);
      continue;
    }
    const hasChildren = !filtering && parents.has(node.instanceKey);
    rows.push({ node, hasChildren, collapsed: hasChildren && ctx.ui.inspectCollapsed.has(node.instanceKey) });
  }
  return rows;
}

function heatClass(count: number): string {
  if (count >= 20) return "heat-3";
  if (count >= 8) return "heat-2";
  if (count >= 3) return "heat-1";
  return "";
}

/* -------------------------------------------------------------------------- */
/*  Tree pane                                                                  */
/* -------------------------------------------------------------------------- */

function renderTree(ctx: ViewContext, tree: ReadonlyArray<InstanceNode>): VNode {
  const { ui, model } = ctx;
  const nodes = visibleNodes(ctx, tree);
  const rows = treeRows(ctx, nodes);
  const selectedIndex = rows.findIndex((row) => row.node.instanceKey === ui.selectedInstance);
  const last = model.commits[model.commits.length - 1];
  const recent = last && ctx.now() - last.startTime < 1400
    ? new Set(last.components.filter((c) => c.phase !== "memo").map((c) => c.instanceKey))
    : new Set<string>();

  const select = (row: TreeRow | undefined): void => {
    if (!row) return;
    ctx.selectInstance(row.node.instanceKey, { reveal: false });
  };
  const toggle = (key: string): void => {
    if (ui.inspectCollapsed.has(key)) ui.inspectCollapsed.delete(key);
    else ui.inspectCollapsed.add(key);
    ctx.refresh();
  };

  let revealIndex: number | null = null;
  if (ui.inspectReveal) {
    const index = rows.findIndex((row) => row.node.instanceKey === ui.inspectReveal);
    if (index >= 0) revealIndex = index;
    ui.inspectReveal = null;
  }

  const matchCount = ui.inspectFilter.trim() ? nodes.length : null;
  return h("div", { class: "it-tree" },
    viewbar(
      button({ icon: "pick", label: ctx.overlay.isPicking ? "Picking…" : "Pick", active: ctx.overlay.isPicking, onClick: () => ctx.togglePicker(), kbd: "⇧ ⌥ C", tip: "Click an element on the page", testid: "inspect-pick" }),
      searchField({
        value: ui.inspectFilter,
        placeholder: "Find component…",
        meta: matchCount !== null ? `${matchCount}` : undefined,
        testid: "inspect-filter",
        onInput: (value) => { ui.inspectFilter = value; ctx.refresh(); },
        onKeyDown: (event) => {
          if (event.key === "Enter" && nodes[0]) {
            event.preventDefault();
            ctx.selectInstance(nodes[0].instanceKey, { reveal: false });
          }
        },
      }),
      spacer(),
      filterChip({ label: "Library", on: ui.inspectShowLibrary, onToggle: () => { ui.inspectShowLibrary = !ui.inspectShowLibrary; ctx.refresh(); }, tip: "Show built-in library components (Button, Card, …)", testid: "inspect-library" }),
      iconButton({ icon: "minimize", label: "Collapse all", size: "sm", onClick: () => { for (const node of tree) if (node.parentKey) ui.inspectCollapsed.add(node.parentKey); ctx.refresh(); } }),
      iconButton({ icon: "maximize", label: "Expand all", size: "sm", onClick: () => { ui.inspectCollapsed.clear(); ctx.refresh(); } }),
    ),
    virtualList({
      items: rows,
      rowHeight: ctx.rowHeight,
      rowKey: (row) => row.node.instanceKey,
      version: [ui.selectedInstance, ui.inspectCollapsed.size, last?.commitId, recent.size, ui.inspectShowLibrary],
      scrollTo: revealIndex ?? (selectedIndex >= 0 ? selectedIndex : null),
      role: "tree",
      ariaLabel: "Component tree",
      testid: "inspect-tree",
      empty: emptyState({
        icon: "inspect",
        title: ui.inspectFilter ? "No component matches" : "No component instances yet",
        body: ui.inspectFilter ? "Try another name, or clear the filter." : ui.inspectShowLibrary ? "Interact with the app, or force a render from the command palette." : "The program declares no function components — turn on Library to see built-ins.",
      }),
      onKeyDown: (event) => {
        const row = rows[selectedIndex];
        switch (event.key) {
          case "ArrowDown": event.preventDefault(); select(rows[Math.min(rows.length - 1, selectedIndex + 1)]); break;
          case "ArrowUp": event.preventDefault(); select(rows[Math.max(0, selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1)]); break;
          case "ArrowRight":
            if (row?.hasChildren && row.collapsed) { event.preventDefault(); toggle(row.node.instanceKey); }
            else if (row?.hasChildren) { event.preventDefault(); select(rows[selectedIndex + 1]); }
            break;
          case "ArrowLeft":
            if (row?.hasChildren && !row.collapsed) { event.preventDefault(); toggle(row.node.instanceKey); }
            else if (row?.node.parentKey) { event.preventDefault(); select(rows.find((r) => r.node.instanceKey === row.node.parentKey)); }
            break;
          case "Home": event.preventDefault(); select(rows[0]); break;
          case "End": event.preventDefault(); select(rows[rows.length - 1]); break;
          default: break;
        }
      },
      renderRow: (row) => {
        const { node } = row;
        const count = model.renderCounts.get(node.instanceKey) ?? 0;
        const selected = node.instanceKey === ui.selectedInstance;
        const flashing = recent.has(node.instanceKey);
        return h("div", {
          class: ["row", "it-row", selected ? "is-selected" : "", node.mounted === false ? "is-dim" : "", flashing ? `flash-${count % 2}` : ""],
          role: "treeitem",
          "aria-level": node.depth + 1,
          "aria-selected": selected,
          "aria-expanded": row.hasChildren ? !row.collapsed : undefined,
          "data-key": node.instanceKey,
          "data-dt": "tree-row",
          style: { paddingLeft: `${6 + node.depth * 14}px` },
          onClick: () => ctx.selectInstance(node.instanceKey, { reveal: false }),
          onMouseEnter: () => ctx.highlightInstance(node.instanceKey),
          onMouseLeave: () => ctx.highlightInstance(null),
        },
          h("button", {
            type: "button", tabindex: -1, "aria-hidden": "true",
            class: ["twist", row.hasChildren ? "" : "is-leaf", row.hasChildren && !row.collapsed ? "is-open" : ""],
            onClick: (event: MouseEvent) => { event.stopPropagation(); toggle(node.instanceKey); },
          }, icon("chevronRight", { size: 11 })),
          node.kind === "user" ? h("span", { class: "it-glyph" }, icon("puzzle", { size: 12 })) : null,
          h("span", { class: ["it-name", node.kind === "user" ? "is-user" : ""] }, node.name),
          node.explicitKey ? h("span", { class: "it-key" }, `key=${node.explicitKey.length > 14 ? `${node.explicitKey.slice(0, 13)}…` : node.explicitKey}`) : null,
          node.mounted === false ? h("span", { class: "it-flag", "data-tip": "No DOM node carries this instance's tag" }, "no dom") : null,
          h("span", { class: "meta" },
            count > 0 ? h("span", { class: ["it-count", heatClass(count)], "data-tip": `Rendered ${count}× this session` }, `×${count}`) : null,
            h("span", { class: "it-time" }, node.phase === "memo" ? "memo" : node.selfTime > 0 ? fmtMs(node.selfTime) : "")));
      },
    }));
}

/* -------------------------------------------------------------------------- */
/*  Detail pane                                                                */
/* -------------------------------------------------------------------------- */

function valueOf(value: DevtoolsValue): { ok: true; value: unknown } | { ok: false } {
  if (value.json === undefined) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(value.json) as unknown };
  } catch {
    return { ok: false };
  }
}

function propsPane(ctx: ViewContext, detail: InstanceDetail): Child {
  const { app, ui } = ctx;
  const canOverride = can(app, "setPropOverride");
  const rows = detail.props.map((prop: ComponentPropRecord) => {
    const parsed = valueOf(prop.value);
    const scope = `prop:${detail.instanceKey}:${prop.name}`;
    const editable = parsed.ok && (canOverride || prop.stateRef !== undefined);
    const tags = h("span", { class: "it-prop-tags" },
      prop.stateRef ? chip(`$${prop.stateRef}`, "purple", { mono: true, tip: "Two-way bound: editing writes the atom", onClick: () => { ui.stateFilter = prop.stateRef!.split(".")[0] ?? ""; ctx.selectTab("state"); } }) : null,
      prop.overridden ? chip("override", "amber", { tip: "The UI is showing a DevTools value, not the program's" }) : null,
      prop.overridden && can(app, "clearPropOverride")
        ? iconButton({ icon: "undo", label: `Restore ${prop.name}`, size: "sm", onClick: () => { app.clearPropOverride(detail.instanceKey, prop.name); ctx.toast(`${prop.name} restored`); ctx.refresh(); } })
        : null);
    const body = parsed.ok
      ? valueTree({
          scope,
          value: { [prop.name]: parsed.value },
          expanded: ui.propsExpanded,
          onToggle: (path) => { if (ui.propsExpanded.has(path)) ui.propsExpanded.delete(path); else ui.propsExpanded.add(path); ctx.refresh(); },
          rowHeight: ctx.rowHeight,
          inline: true,
          editable: () => editable,
          editing: ui.edit,
          setEditing: (edit) => { ui.edit = edit; ctx.refresh(); },
          editJson: (_path, value) => ctx.editJson({
            title: `Override ${detail.name}.${prop.name}`,
            value,
            onSave: (next) => write([], next),
          }),
          onCopy: (text, what) => ctx.copy(text, what),
          onEdit: (path, next) => write(path.split(".").slice(1), next),
          decorate: (row) => (row.depth === 0 ? tags : null),
          testid: "prop-tree",
        })
      : h("div", { class: "row it-opaque" },
          h("span", { class: "vk" }, prop.name), h("span", { class: "vsep" }, ":"),
          h("span", { class: `v t-${prop.value.type}`, title: "Functions, resources and DOM nodes cannot be edited" }, prop.value.preview),
          h("span", { class: "grow" }), tags);

    function write(rest: string[], next: unknown): void {
      if (!parsed.ok) return;
      if (prop.stateRef) {
        const path = [prop.stateRef, ...rest].join(".");
        app!.setState(path, next);
        ctx.toast(`$${path} updated`, "good");
      } else if (can(app, "setPropOverride")) {
        const full = rest.length === 0 ? next : setAtPath(parsed.value, rest, next);
        app.setPropOverride(detail.instanceKey, prop.name, full);
        ctx.toast(`${detail.name}.${prop.name} overridden`, "good", {
          action: can(app, "clearPropOverride") ? { label: "Undo", run: () => { app.clearPropOverride(detail.instanceKey, prop.name); ctx.refresh(); } } : undefined,
        });
      }
      ctx.refresh();
    }
    return h("div", { key: prop.name, class: "it-prop" }, body);
  });

  const draft = ui.overrideDraft;
  const adder = canOverride
    ? h("div", { class: "it-add" },
        icon("plus", { size: 12 }),
        field({ value: draft.name, placeholder: "prop", width: "120px", mono: true, onInput: (v) => { draft.name = v; }, label: "Prop name" }),
        field({ value: draft.value, placeholder: '"danger", 12, true, { "gap": 8 }', mono: true, onInput: (v) => { draft.value = v; }, label: "Value", onCommit: () => apply() }),
        button({ label: "Override", size: "sm", onClick: () => apply(), testid: "override-apply" }))
    : null;
  function apply(): void {
    const name = draft.name.trim();
    if (!name || !can(app, "setPropOverride")) return;
    app.setPropOverride(detail.instanceKey, name, parseEditedValue(draft.value));
    ctx.toast(`${detail.name}.${name} overridden`, "good");
    ui.overrideDraft = { name: "", value: "" };
    ctx.refresh();
  }
  return h("div", { class: "stack" },
    detail.props.length === 0 ? h("div", { class: "hint" }, "This instance received no arguments.") : h("div", { class: "it-props" }, ...rows),
    adder,
    h("div", { class: "hint" }, canOverride
      ? ["A ", h("code", {}, "$"), "-bound prop writes its atom. Any other prop takes an override that lasts until you restore it."]
      : "This runtime does not support prop overrides."));
}

function statePane(ctx: ViewContext, detail: InstanceDetail): Child {
  const { app, ui } = ctx;
  const hooks = detail.hooks.map((hook) => {
    const parsed = valueOf(hook.value);
    const canWrite = hook.editable && can(app, "setInstanceHook") && parsed.ok;
    return h("div", { key: `h${hook.slot}`, class: "it-prop" },
      parsed.ok
        ? valueTree({
            scope: `hook:${detail.instanceKey}:${hook.slot}`,
            value: { [`[${hook.slot}]`]: parsed.value },
            expanded: ui.propsExpanded,
            onToggle: (path) => { if (ui.propsExpanded.has(path)) ui.propsExpanded.delete(path); else ui.propsExpanded.add(path); ctx.refresh(); },
            rowHeight: ctx.rowHeight,
            inline: true,
            editable: () => canWrite,
            editing: ui.edit,
            setEditing: (edit) => { ui.edit = edit; ctx.refresh(); },
            onCopy: (text, what) => ctx.copy(text, what),
            onEdit: (path, next) => {
              const rest = path.split(".").slice(1);
              const full = rest.length === 0 ? next : setAtPath(parsed.value, rest, next);
              const ok = can(app, "setInstanceHook") && app.setInstanceHook(detail.instanceKey, hook.slot, full);
              ctx.toast(ok ? `Slot ${hook.slot} updated` : `Slot ${hook.slot} is read-only`, ok ? "good" : "warn");
              ctx.refresh();
            },
            decorate: (row) => (row.depth === 0 ? chip(hook.kind, hook.kind === "state" ? "green" : hook.kind === "memo" ? "blue" : "grey", { tip: hook.kind === "memo" ? "Recomputed from its deps — edit what it reads instead" : undefined }) : null),
          })
        : h("div", { class: "row" }, h("span", { class: "vk is-index" }, `[${hook.slot}]`), h("span", { class: "vsep" }, ":"), h("span", { class: `v t-${hook.value.type}` }, hook.value.preview), spacer(), chip(hook.kind)));
  });
  const uiState = detail.uiState.map((slot) => {
    const parsed = valueOf(slot.value);
    const canWrite = slot.editable && can(app, "setInstanceUiState") && parsed.ok;
    return h("div", { key: `u${slot.key}`, class: "it-prop" },
      parsed.ok
        ? valueTree({
            scope: `ui:${detail.instanceKey}:${slot.key}`,
            value: { [slot.key]: parsed.value },
            expanded: ui.propsExpanded,
            onToggle: (path) => { if (ui.propsExpanded.has(path)) ui.propsExpanded.delete(path); else ui.propsExpanded.add(path); ctx.refresh(); },
            rowHeight: ctx.rowHeight,
            inline: true,
            editable: () => canWrite,
            editing: ui.edit,
            setEditing: (edit) => { ui.edit = edit; ctx.refresh(); },
            onEdit: (path, next) => {
              const rest = path.split(".").slice(1);
              const full = rest.length === 0 ? next : setAtPath(parsed.value, rest, next);
              const ok = can(app, "setInstanceUiState") && app.setInstanceUiState(detail.instanceKey, slot.key, full);
              ctx.toast(ok ? `${slot.key} updated` : `${slot.key} no longer exists`, ok ? "good" : "warn");
              ctx.refresh();
            },
          })
        : h("div", { class: "row" }, h("span", { class: "vk" }, slot.key), h("span", { class: "vsep" }, ":"), h("span", { class: `v t-${slot.value.type}` }, slot.value.preview)));
  });
  return h("div", { class: "stack" },
    h("div", {},
      h("div", { class: "it-sub" }, "Hooks", h("span", { class: "t3" }, " — $state / $memo / $ref cells, by call order")),
      hooks.length > 0 ? h("div", { class: "it-props" }, ...hooks) : h("div", { class: "hint" }, "No per-instance hooks.")),
    detail.uiState.length > 0 ? h("div", {},
      h("div", { class: "it-sub" }, "Component UI state", h("span", { class: "t3" }, " — a Tabs' active pane, a Popover's open flag, a DataGrid's sort")),
      h("div", { class: "it-props" }, ...uiState)) : null,
    h("div", {},
      h("div", { class: "it-sub" }, "Reads", h("span", { class: "t3" }, " — reactive paths this body read last render (its memo dependencies)")),
      detail.deps.length > 0 ? h("div", { class: "chips" }, ...detail.deps.map((dep) => atomChip(ctx, dep))) : h("div", { class: "hint" }, detail.kind === "user" ? "This body read no reactive state." : "Library components are tracked through the user component that renders them.")));
}

function effectsPane(ctx: ViewContext, detail: InstanceDetail): Child {
  const { app, model } = ctx;
  if (detail.effects.length === 0) return h("div", { class: "hint" }, "No effects are mounted under this instance.");
  const mounted = can(app, "getEffects") ? ctx.cache("effects", () => app.getEffects()) : [];
  const aggregates = new Map(effectAggregates(model.effects).map((agg) => [agg.effectKey, agg]));
  return h("div", { class: "it-effects" }, ...detail.effects.map((key) => {
    const info = mounted.find((effect) => effect.effectKey === key);
    const agg = aggregates.get(key);
    return h("div", { key, class: "card is-pad it-effect" },
      h("div", { class: "row-flex" },
        icon("effects", { size: 14 }),
        h("button", { type: "button", class: "link", onClick: () => { ctx.ui.selectedEffect = key; ctx.ui.effectView = "mounted"; ctx.selectTab("effects"); } }, info?.label ?? key.split("::").pop() ?? key),
        spacer(),
        agg ? chip(`${agg.runs} run${agg.runs === 1 ? "" : "s"}`, "blue") : null,
        agg && agg.errors > 0 ? chip(`${agg.errors} error${agg.errors === 1 ? "" : "s"}`, "red") : null,
        can(app, "runEffect") ? button({ label: "Run now", size: "sm", icon: "play", onClick: () => { const ok = app.runEffect(key); ctx.toast(ok ? "Effect ran" : "Effect is no longer mounted", ok ? "good" : "warn"); } }) : null),
      info ? h("div", { class: "it-effect-meta" },
        h("span", { class: "mono t2" }, info.triggers),
        info.stateDeps.length > 0 ? h("div", { class: "chips" }, ...info.stateDeps.map((dep) => atomChip(ctx, dep, "green"))) : null,
        info.intervals.length > 0 ? chip(`every ${info.intervals.join(", ")}ms`, "cyan") : null) : null);
  }));
}

function boxModel(box: BoxModel): Child {
  const side = (n: number): string => (n === 0 ? "–" : String(Math.round(n * 100) / 100));
  const layer = (name: string, s: BoxModel["margin"], inner: Child): Child => h("div", { class: `bm bm-${name}` },
    h("span", { class: "bm-label" }, name),
    h("span", { class: "bm-top" }, side(s.top)),
    h("span", { class: "bm-left" }, side(s.left)),
    inner,
    h("span", { class: "bm-right" }, side(s.right)),
    h("span", { class: "bm-bottom" }, side(s.bottom)));
  return h("div", { class: "bm-wrap", "data-dt": "box-model" },
    layer("margin", box.margin,
      layer("border", box.border,
        layer("padding", box.padding,
          h("div", { class: "bm-content" }, `${Math.round(box.content.width * 100) / 100} × ${Math.round(box.content.height * 100) / 100}`)))));
}

function domPane(ctx: ViewContext, element: Element | null, detail: InstanceDetail | null): Child {
  if (!element) return note("info", "No DOM node carries this instance's tag — it renders a fragment (Show, Async, Lazy…), or DOM tagging is off in Settings.");
  const box = measureBox(element);
  const attrs = [...element.attributes].filter((attr) => !attr.name.startsWith("data-aktion"));
  return h("div", { class: "stack" },
    h("div", { class: "row-flex wrap" },
      h("code", { class: "it-el" }, describeElement(element)),
      spacer(),
      button({ label: "Copy selector", size: "sm", icon: "copy", onClick: () => ctx.copy(cssPath(element), "the selector") }),
      button({ label: "Copy HTML", size: "sm", icon: "code", onClick: () => ctx.copy(element.outerHTML, "the HTML") }),
      button({ label: "Log", size: "sm", icon: "console", tip: "Log the element to the browser console as $aktion", onClick: () => {
        (globalThis as unknown as { $aktion?: unknown }).$aktion = element;
        // eslint-disable-next-line no-console
        console.log("[aktion-devtools] selected element ($aktion):", element);
        ctx.toast("Logged to the browser console as $aktion", "good");
      } })),
    box ? boxModel(box) : h("div", { class: "hint" }, "This element has no layout to measure."),
    h("div", {},
      h("div", { class: "it-sub" }, `Attributes (${attrs.length})`),
      attrs.length === 0 ? h("div", { class: "hint" }, "No attributes.") : h("div", { class: "it-attrs" }, ...attrs.map((attr) =>
        h("div", { key: attr.name, class: "it-attr" }, h("span", { class: "it-attr-k" }, attr.name), h("span", { class: "it-attr-v" }, attr.value || '""'))))),
    detail?.html ? h("div", {},
      h("div", { class: "it-sub" }, "Rendered markup", detail.domNodes ? h("span", { class: "t3" }, ` — ${detail.domNodes} nodes`) : null),
      h("pre", { class: "pre is-wrap it-html" }, detail.html)) : null);
}

function stylesPane(ctx: ViewContext, element: Element | null): Child {
  if (!element) return h("div", { class: "hint" }, "Select an element with a DOM node to read its computed styles.");
  const ui = ctx.ui;
  const filter = ui.computedFilter.trim().toLowerCase();
  const groups = COMPUTED_GROUPS.map((group) => ({
    title: group.title,
    rows: computedGroup(element, group.props).filter(([prop, value]) => !filter || prop.includes(filter) || value.toLowerCase().includes(filter)),
  })).filter((group) => group.rows.length > 0);
  const vars = cssVariables(element).filter(([name, value]) => !filter || name.includes(filter) || value.toLowerCase().includes(filter)).slice(0, 120);
  const isColor = (value: string): boolean => /^(#|rgb|hsl|color\(|oklch|lab\()/i.test(value);
  return h("div", { class: "stack" },
    searchField({ value: ui.computedFilter, placeholder: "Filter properties…", onInput: (v) => { ui.computedFilter = v; ctx.refresh(); }, width: "100%" }),
    ...groups.map((group) => h("div", { key: group.title },
      h("div", { class: "it-sub" }, group.title),
      h("div", { class: "it-css" }, ...group.rows.map(([prop, value]) => h("div", { key: prop, class: "it-css-row" },
        h("span", { class: "it-css-k" }, prop),
        isColor(value) ? h("span", { class: "swatch-sq", style: { background: value } }) : null,
        h("span", { class: "it-css-v" }, value)))))),
    groups.length === 0 ? h("div", { class: "hint" }, "No computed properties match.") : null,
    h("div", {},
      h("div", { class: "it-sub row-flex" }, `Theme variables in effect (${vars.length})`, spacer(), button({ label: "Edit tokens", size: "sm", variant: "ghost", icon: "theme", onClick: () => ctx.selectTab("theme") })),
      vars.length === 0 ? h("div", { class: "hint" }, "No --rui-* variables reach this element.") : h("div", { class: "it-css" }, ...vars.map(([name, value]) => h("div", { key: name, class: "it-css-row" },
        h("span", { class: "it-css-k tone-purple" }, name),
        isColor(value) ? h("span", { class: "swatch-sq", style: { background: value } }) : null,
        h("span", { class: "it-css-v" }, value))))));
}

function a11yPane(ctx: ViewContext, element: Element | null): Child {
  if (!element) return h("div", { class: "hint" }, "Select an element with a DOM node.");
  const summary = a11ySummary(element);
  const root = element.parentElement ?? element;
  const findings = ctx.memo(`it:a11y:${ctx.ui.selectedInstance}`, [ctx.model.revs.commit, element], () =>
    auditAccessibility(root, { limit: 600 }).findings.filter((f) => f.element === element || element.contains(f.element)));
  const order = ctx.memo("it:taborder", [ctx.model.revs.commit], () => {
    const r = element.getRootNode() as ShadowRoot;
    return tabOrder(r.firstElementChild ?? null);
  });
  const position = order.indexOf(element);
  return h("div", { class: "stack" },
    h("div", { class: "it-announce", "data-dt": "announce" },
      h("div", { class: "it-announce-label" }, icon("a11y", { size: 13 }), "A screen reader announces"),
      h("div", { class: "it-announce-text" }, announce(element))),
    kv([
      ...summary.map(([k, v]) => [k, h("code", {}, v)] as const),
      ["tab order", position >= 0 ? `stop ${position + 1} of ${order.length}` : "not in the tab order"] as const,
    ]),
    h("div", {},
      h("div", { class: "it-sub row-flex" }, `Findings in this subtree (${findings.length})`, spacer(),
        button({ label: "Audit the whole app", size: "sm", variant: "ghost", icon: "a11y", onClick: () => { ctx.ui.a11yRequested = true; ctx.selectTab("a11y"); } })),
      findings.length === 0
        ? note("good", "No accessibility problems found here.")
        : h("div", { class: "stack" }, ...findings.slice(0, 12).map((finding, i) => h("div", {
            key: `${finding.rule}${i}`, class: ["it-finding", `t-${finding.impact}`],
            onMouseEnter: () => ctx.highlightElement(finding.element),
            onMouseLeave: () => ctx.highlightElement(null),
          },
            h("div", { class: "row-flex" }, chip(finding.impact, finding.impact === "critical" || finding.impact === "serious" ? "red" : finding.impact === "moderate" ? "amber" : "grey"), h("b", {}, finding.rule), finding.wcag ? h("span", { class: "t3" }, `WCAG ${finding.wcag.join(", ")}`) : null),
            h("div", {}, finding.message),
            h("div", { class: "t3" }, finding.help))))));
}

function sourcePane(ctx: ViewContext, detail: InstanceDetail): Child {
  const line = detail.source?.line;
  if (!line || !ctx.app) return h("div", { class: "hint" }, "This instance carries no source position (it may come from a compiled program).");
  const program = ctx.app.getProgram();
  const lines = ctx.memo("it:lines", [program], () => highlightLines(program));
  const from = Math.max(1, line - 6);
  const to = Math.min(lines.length, line + 8);
  return h("div", { class: "stack" },
    h("div", { class: "row-flex" }, h("span", { class: "t2" }, `Line ${line}, column ${detail.source?.column ?? 0}`), spacer(),
      button({ label: "Open in Source", size: "sm", icon: "source", onClick: () => openSource(ctx, line) })),
    h("div", { class: "it-code" }, codeView({ lines: lines.slice(from - 1, to), firstLine: from, focusLine: line, inline: true, onLineClick: (n) => openSource(ctx, n) })));
}

function renderDetail(ctx: ViewContext, tree: ReadonlyArray<InstanceNode>): Child {
  const { app, ui, model } = ctx;
  const key = ui.selectedInstance;
  if (!key && !ui.selectedElement) {
    return emptyState({
      icon: "cursor",
      title: "Select a component",
      body: "Choose one in the tree, or pick any element on the page to jump to the component that rendered it.",
      actions: [
        button({ label: "Pick an element", icon: "pick", variant: "primary", onClick: () => ctx.togglePicker() }),
        tree[0] ? button({ label: `Select ${tree[0].name}`, onClick: () => ctx.selectInstance(tree[0]!.instanceKey, { reveal: false }) }) : null,
      ],
    });
  }
  if (!key && ui.selectedElement) {
    const element = ui.selectedElement;
    const pane = ui.inspectPane === "styles" || ui.inspectPane === "a11y" ? ui.inspectPane : "dom";
    return h("div", { class: "it-detail" },
      h("div", { class: "pane-head" }, h("span", { class: "pane-title" }, describeElement(element)), chip("no component", "amber"), spacer(),
        button({ label: "Clear", size: "sm", variant: "ghost", onClick: () => { ui.selectedElement = null; ctx.overlay.clear(); ctx.refresh(); } })),
      tabs([{ value: "dom", label: "DOM" }, { value: "styles", label: "Styles" }, { value: "a11y", label: "Accessibility" }], pane, (value) => { ui.inspectPane = value; ctx.refresh(); }),
      h("div", { class: "pane-body is-pad" },
        note("plain", "This element was not rendered by a tracked component (host page markup, or an unmanaged widget)."),
        pane === "dom" ? domPane(ctx, element, null) : pane === "styles" ? stylesPane(ctx, element) : a11yPane(ctx, element)));
  }
  const detail = can(app, "getInstance") ? ctx.cache(`instance:${key}`, () => app.getInstance(key!)) : null;
  if (!detail) {
    return emptyState({
      icon: "inspect",
      title: "That instance is gone",
      body: "It unmounted, or the program was re-planned.",
      actions: [button({ label: "Clear selection", onClick: () => { ui.selectedInstance = null; ctx.overlay.clear(); ctx.refresh(); } })],
    });
  }
  const element = can(app, "nodeForInstance") ? app.nodeForInstance(key!) : null;
  const renders = model.renderCounts.get(key!) ?? 0;
  let memoCount = 0;
  let slowest = 0;
  for (const commit of model.commits) {
    for (const record of commit.components) {
      if (record.instanceKey !== key) continue;
      if (record.phase === "memo") memoCount += 1;
      else if (record.selfTime > slowest) slowest = record.selfTime;
    }
  }
  const node = tree.find((n) => n.instanceKey === key);
  const hooksCount = detail.hooks.length + detail.uiState.length;
  const pane = ui.inspectPane;

  const crumbs = h("nav", { class: "it-crumbs", "aria-label": "Ancestors" },
    ...detail.ancestors.slice(-6).map((ancestor) => [
      h("button", {
        type: "button", class: "it-crumb",
        onClick: () => ctx.selectInstance(ancestor, { reveal: false }),
        onMouseEnter: () => ctx.highlightInstance(ancestor),
        onMouseLeave: () => ctx.highlightInstance(null),
      }, componentNameFromKey(ancestor)),
      icon("chevronRight", { size: 10 }),
    ]),
    h("span", { class: "it-crumb is-current" }, detail.name));

  let body: Child;
  switch (pane) {
    case "hooks": body = statePane(ctx, detail); break;
    case "effects": body = effectsPane(ctx, detail); break;
    case "dom": body = domPane(ctx, element, detail); break;
    case "styles": body = stylesPane(ctx, element); break;
    case "a11y": body = a11yPane(ctx, element); break;
    case "source": body = sourcePane(ctx, detail); break;
    default: body = propsPane(ctx, detail);
  }

  return h("div", { class: "it-detail", "data-dt": "inspect-detail" },
    h("div", { class: "it-head" },
      detail.ancestors.length > 0 ? crumbs : null,
      h("div", { class: "it-title" },
        h("h2", {}, detail.name),
        chip(detail.kind, detail.kind === "user" ? "accent" : "grey"),
        detail.explicitKey ? chip(`key=${detail.explicitKey}`, "grey", { mono: true }) : null,
        detail.source ? h("button", { type: "button", class: "link mono", onClick: () => openSource(ctx, detail.source!.line), "data-tip": "Open in Source" }, `L${detail.source.line}:${detail.source.column}`) : null,
        !detail.mounted ? chip("not in DOM", "amber") : null,
        spacer(),
        element ? iconButton({ icon: "target", label: "Scroll into view", onClick: () => { element.scrollIntoView({ behavior: "smooth", block: "center" }); ctx.highlightInstance(key, true); } }) : null,
        can(app, "remountInstance") ? iconButton({ icon: "refresh", label: "Remount (reset its state)", onClick: () => { app.remountInstance(key!); ctx.toast(`Remounted ${detail.name}`, "good"); } }) : null,
        iconButton({ icon: "copy", label: "Copy the instance key", onClick: () => ctx.copy(key!, "the instance key") }),
        iconButton({ icon: "more", label: "More actions", onClick: (event) => ctx.openMenu(event, [
          { label: "Copy props as JSON", icon: "brackets", run: () => ctx.copy(JSON.stringify(Object.fromEntries(detail.props.map((p) => [p.name, p.value.json ? JSON.parse(p.value.json) as unknown : p.value.preview])), null, 2), "the props") },
          ...(element ? [{ label: "Copy CSS selector", icon: "hash" as const, run: () => ctx.copy(cssPath(element), "the selector") }] : []),
          ...(element ? [{ label: "Store element as $aktion", icon: "console" as const, run: () => { (globalThis as unknown as { $aktion?: unknown }).$aktion = element; ctx.toast("Available in the browser console as $aktion", "good"); } }] : []),
          { label: "Force a full re-render", icon: "refresh", run: () => app?.forceRender() },
          ...(can(app, "listPropOverrides") && app.listPropOverrides().length > 0 && can(app, "clearPropOverride")
            ? [{ kind: "separator" as const, label: "" }, { label: "Clear every prop override", icon: "undo" as const, danger: true, run: () => { for (const entry of app.listPropOverrides()) app.clearPropOverride(entry.instanceKey, entry.prop); ctx.toast("Overrides cleared"); } }]
            : []),
        ]) })),
      statGrid(
        stat({ label: "Renders", value: String(renders), tone: renders >= 20 ? "amber" : undefined }),
        stat({ label: "Memo hits", value: String(memoCount) }),
        stat({ label: "Last", value: node && node.selfTime > 0 ? fmtMs(node.selfTime) : "—" }),
        stat({ label: "Slowest", value: slowest > 0 ? fmtMs(slowest) : "—", tone: slowest >= 16 ? "red" : slowest >= 8 ? "amber" : undefined }),
        stat({ label: "DOM nodes", value: detail.domNodes !== undefined ? String(detail.domNodes) : "—" }))),
    tabs([
      { value: "props", label: "Props", count: detail.props.length },
      { value: "hooks", label: "State", count: hooksCount },
      { value: "effects", label: "Effects", count: detail.effects.length },
      { value: "dom", label: "DOM" },
      { value: "styles", label: "Styles" },
      { value: "a11y", label: "Accessibility" },
      { value: "source", label: "Source" },
    ], pane, (value) => { ui.inspectPane = value; ctx.refresh(); }, { label: "Instance detail" }),
    h("div", { class: "pane-body is-pad", key: `${key}:${pane}` }, body));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app } = ctx;
  if (!app) return noApp(ctx, "The Inspector", "inspect");
  if (!can(app, "getComponentTree")) return h("div", { class: "dt-pad" }, unsupported("a component tree"));
  const tree = ctx.cache("tree", () => app.getComponentTree());
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];
  const wide = ctx.width() >= 720;
  return h("div", { class: "it", "data-dt": "inspect" },
    overrides.length > 0
      ? h("div", { class: "it-banner" }, icon("warning", { size: 14 }),
          h("span", { class: "grow" }, `${overrides.length} prop override${overrides.length === 1 ? "" : "s"} active — the UI is showing DevTools values, not the program's.`),
          can(app, "clearPropOverride") ? button({ label: "Clear all", size: "sm", onClick: () => { for (const entry of overrides) app.clearPropOverride(entry.instanceKey, entry.prop); ctx.toast("Overrides cleared"); ctx.refresh(); } }) : null)
      : null,
    split({
      direction: wide ? "row" : "col",
      size: paneSize(ctx, wide ? "inspect.tree" : "inspect.tree.col", wide ? 340 : 240),
      min: wide ? 220 : 120,
      onResize: (size) => setPaneSize(ctx, wide ? "inspect.tree" : "inspect.tree.col", size),
      first: renderTree(ctx, tree),
      second: renderDetail(ctx, tree),
      label: "Resize the component tree",
    }));
}

export const inspectView: ViewDefinition = {
  id: "inspect",
  label: "Inspector",
  icon: "inspect",
  group: "inspect",
  hint: "Component tree, live props and state, DOM, styles",
  keywords: "components tree element picker props hooks dom styles box model accessibility",
  badge: (ctx) => {
    const n = can(ctx.app, "listPropOverrides") ? ctx.app.listPropOverrides().length : 0;
    return n > 0 ? { value: n, tone: "amber" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "library", label: ctx.ui.inspectShowLibrary ? "Hide library components" : "Show library components", icon: "layers", run: () => { ctx.ui.inspectShowLibrary = !ctx.ui.inspectShowLibrary; ctx.selectTab("inspect"); } },
    { id: "collapse", label: "Collapse the component tree", icon: "minimize", run: () => { ctx.ui.inspectCollapsed.clear(); ctx.selectTab("inspect"); } },
  ],
  css: /* css */ `
.it { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.it-banner { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--dt-amber-soft); color: var(--dt-amber); font-size: var(--dt-fs-sm); font-weight: 550; border-bottom: 1px solid var(--dt-border); }
.it-tree { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.it-row .it-glyph { color: var(--dt-accent-text); opacity: 0.85; display: inline-flex; }
.it-name { color: var(--dt-text-2); overflow: hidden; text-overflow: ellipsis; }
.it-name.is-user { color: var(--dt-text); font-weight: 650; }
.row.is-selected .it-name { color: var(--dt-text); }
.it-key { font-family: var(--dt-mono); font-size: 10px; color: var(--dt-syn-str); background: var(--dt-bg-active); padding: 0 5px; border-radius: 4px; flex: none; }
.it-flag { font-size: 9.5px; color: var(--dt-amber); font-weight: 650; flex: none; }
.it-count { font-size: 9.5px; font-weight: 700; padding: 0 5px; border-radius: 6px; background: var(--dt-bg-active); color: var(--dt-text-3); }
.it-count.heat-1 { background: var(--dt-green-soft); color: var(--dt-green); }
.it-count.heat-2 { background: var(--dt-amber-soft); color: var(--dt-amber); }
.it-count.heat-3 { background: var(--dt-red-soft); color: var(--dt-red); }
.it-time { min-width: 44px; text-align: right; }
.it-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.it-head { flex: none; padding: 10px 12px 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--dt-border); }
.it-head .grid-stats { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); }
.it-head .stat { padding: 7px 9px; }
.it-head .stat-value { font-size: 14px; }
.it-crumbs { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; color: var(--dt-text-4); }
.it-crumb { border: 0; background: none; padding: 1px 5px; border-radius: 4px; color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
button.it-crumb:hover { background: var(--dt-bg-hover); color: var(--dt-text); }
.it-crumb.is-current { color: var(--dt-text); font-weight: 600; }
.it-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.it-title h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.it-props { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r); background: var(--dt-bg-sunken); padding: 3px 0; }
.it-prop .row { margin: 0 3px; }
.it-prop-tags { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; }
.it-opaque { margin: 0 3px; }
.it-add { display: flex; align-items: center; gap: 6px; color: var(--dt-text-3); }
.it-add .input:nth-child(3) { flex: 1; }
.it-sub { font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-3); margin: 2px 0 6px; }
.it-sub .t3 { text-transform: none; letter-spacing: 0; font-weight: 450; }
.it-effects { display: flex; flex-direction: column; gap: 8px; }
.it-effect-meta { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.it-el { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-comp); }
.it-attrs, .it-css { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r); overflow: hidden; }
.it-attr, .it-css-row { display: flex; gap: 10px; align-items: center; padding: 4px 10px; font-family: var(--dt-mono); font-size: var(--dt-fs-mono); border-bottom: 1px solid var(--dt-border); min-width: 0; }
.it-attr:last-child, .it-css-row:last-child { border-bottom: 0; }
.it-attr-k, .it-css-k { color: var(--dt-syn-prop); flex: none; min-width: 120px; }
.it-attr-v, .it-css-v { color: var(--dt-text); overflow-wrap: anywhere; min-width: 0; }
.it-html { max-height: 220px; }
.it-code { border: 1px solid var(--dt-border); border-radius: var(--dt-r); overflow: hidden; }
.it-announce { padding: 12px; border-radius: var(--dt-r); background: linear-gradient(135deg, var(--dt-accent-soft), transparent 70%), var(--dt-bg-elev); border: 1px solid var(--dt-border-strong); }
.it-announce-label { display: flex; align-items: center; gap: 6px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-accent-text); margin-bottom: 4px; }
.it-announce-text { font-size: var(--dt-fs-md); font-weight: 550; }
.it-finding { padding: 9px 11px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-sm); }
.it-finding.t-critical, .it-finding.t-serious { border-left: 3px solid var(--dt-red); }
.it-finding.t-moderate { border-left: 3px solid var(--dt-amber); }
.bm-wrap { display: flex; justify-content: center; padding: 6px 0; font-family: var(--dt-mono); font-size: 10px; }
.bm { position: relative; padding: 18px 26px; border: 1px dashed rgba(127, 127, 127, 0.45); border-radius: 4px; text-align: center; }
.bm-margin { background: rgba(255, 155, 90, 0.14); }
.bm-border { background: rgba(255, 206, 102, 0.2); border-style: solid; border-color: rgba(255, 206, 102, 0.55); }
.bm-padding { background: rgba(92, 206, 148, 0.16); }
.bm-content { padding: 8px 16px; background: rgba(98, 160, 255, 0.22); border: 1px solid rgba(98, 160, 255, 0.5); border-radius: 3px; color: var(--dt-text); font-weight: 600; white-space: nowrap; }
.bm-label { position: absolute; left: 6px; top: 3px; color: var(--dt-text-3); font-family: var(--dt-font); font-size: 9.5px; }
.bm-top { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); }
.bm-bottom { position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); }
.bm-left { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); }
.bm-right { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); }
.bm-top, .bm-bottom, .bm-left, .bm-right { color: var(--dt-text-2); }
.bm-margin > .bm-label { left: 6px; }
`,
};
