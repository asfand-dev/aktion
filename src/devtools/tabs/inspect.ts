/**
 * Inspect tab — the component tree and the element inspector.
 *
 * This is the tab that answers "what am I looking at, and why does it look like
 * that?". It joins three views of the same thing:
 *
 *   - the **component tree** the renderer built (instances, not DOM nodes),
 *   - the **props, hooks, and UI state** each instance holds — all editable, so
 *     you can change one component's state without touching the program, and
 *   - the **DOM** it produced: box model, attributes, computed styles, the
 *     `--rui-*` theme variables actually in effect, and the accessibility
 *     properties a screen reader would announce.
 *
 * The element picker closes the loop in the other direction: click anything on
 * the page and land on its row in the tree.
 *
 * Layout adapts to the panel: wide enough and the tree sits beside the detail so
 * selecting a component does not scroll the tree out of view; narrow, they
 * stack. That is not decoration — the stacked layout is genuinely worse to use,
 * and it was the first thing that made this tab feel clumsy.
 */

import {
  SCROLL_KEY_ATTR, button, chip, chipGroup, code, copyButton, defList,
  editableValue, emptyState, faint, fmtMs, h, muted, searchInput, section,
  spacer, stat, statGrid, table, textField, toggle, toolbar, truncateMiddle,
  valueSpan,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { instanceAggregates } from "../model.js";
import { shortInstanceLabel } from "../tree.js";
import {
  COMPUTED_GROUPS, a11ySummary, computedGroup, cssPath, cssVariables,
  describeElement, measureBox,
} from "../overlay.js";
import { auditAccessibility } from "../a11y.js";
import type { ComponentPropRecord, InstanceDetail, InstanceNode } from "../protocol.js";
import { parseEditedValue } from "../serialize.js";

/** Below this panel width the tree and the detail stack instead of splitting. */
const SPLIT_MIN_WIDTH = 700;

/* -------------------------------------------------------------------------- */

export const inspectTab: TabDefinition = {
  id: "inspect",
  label: "Inspect",
  icon: "◎",
  hint: "Component tree, live props / state editing, and DOM inspection",
  badge: (ctx) => {
    const overrides = can(ctx.app, "listPropOverrides") ? ctx.app.listPropOverrides().length : 0;
    return overrides > 0 ? overrides : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  if (!can(app, "getComponentTree")) {
    return [emptyState(
      "This app does not expose a component tree.",
      "The inspector needs a runtime built with DevTools protocol 2 or newer.",
    )];
  }

  // One tree + one aggregate pass per render, however many places want them.
  const nodes = ctx.cache("tree", () => app.getComponentTree());
  const aggregates = ctx.cache("instanceAggregates", () => instanceAggregates(ctx.model.commits));
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];
  const visible = visibleNodes(ctx, nodes);

  const bar = toolbar(
    button(
      ctx.overlay.isPicking ? "◎ Picking… (Esc)" : "◎ Pick",
      () => ctx.togglePicker(),
      {
        title: "Select an element on the page to inspect it — Ctrl+Shift+P, Esc to cancel",
        active: ctx.overlay.isPicking,
      },
    ),
    searchInput(ui.inspectFilter, (value) => {
      ui.inspectFilter = value;
      ctx.refresh();
    }, "Filter components…", { focusKey: "inspect-filter" }),
    toggle("Library", ui.inspectShowLibrary, () => {
      ui.inspectShowLibrary = !ui.inspectShowLibrary;
      ctx.refresh();
    }, "Show built-in library components as well as your own"),
    toggle("Highlight", ui.highlightUpdates, () => {
      ui.highlightUpdates = !ui.highlightUpdates;
      if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes();
      ctx.toast(ui.highlightUpdates ? "Outlining components as they re-render" : "Highlighting off");
      ctx.refresh();
    }, "Outline components on the page as they re-render"),
    spacer(),
    muted(`${visible.length}${visible.length === nodes.length ? "" : ` / ${nodes.length}`} instance${nodes.length === 1 ? "" : "s"}`),
    button("⊟", () => {
      for (const node of nodes) {
        if (nodes.some((other) => other.parentKey === node.instanceKey)) ui.inspectCollapsed.add(node.instanceKey);
      }
      ctx.refresh();
    }, { title: "Collapse every subtree" }),
    button("⊞", () => {
      ui.inspectCollapsed.clear();
      ctx.refresh();
    }, { title: "Expand every subtree" }),
  );

  const out: Node[] = [bar];

  if (overrides.length > 0) {
    out.push(section(null, h("div", { class: "banner t-amber" },
      h("span", {}, `${overrides.length} prop override${overrides.length === 1 ? "" : "s"} active — the UI is showing DevTools values, not the program's.`),
      spacer(),
      button("Clear all", () => {
        if (!can(app, "clearPropOverride")) return;
        for (const entry of overrides) app.clearPropOverride(entry.instanceKey, entry.prop);
        ctx.toast("Overrides cleared");
        ctx.refresh();
      }, { tone: "amber" }),
    ), { flush: true }));
  }

  const tree = renderTree(ctx, visible, aggregates);
  const detail = renderDetailPane(ctx, nodes, aggregates);

  // Side by side when there is room; stacked otherwise.
  if (ctx.width() >= SPLIT_MIN_WIDTH) {
    out.push(h("div", { class: "split" },
      h("div", { class: "split-left", [SCROLL_KEY_ATTR]: "inspect-tree" }, tree),
      h("div", { class: "split-right", [SCROLL_KEY_ATTR]: "inspect-detail" }, ...detail)));
  } else {
    out.push(h("div", { class: "tree-wrap", [SCROLL_KEY_ATTR]: "inspect-tree" }, tree));
    out.push(...detail);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Tree                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The rows to show, with depth re-derived from the *visible* ancestors.
 *
 * Hiding library components must not flatten the hierarchy: a user component
 * nested three library components deep is still nested, and indenting it at zero
 * makes siblings and children indistinguishable. Each visible node is therefore
 * re-parented to its nearest visible ancestor, and its depth recomputed from
 * that chain.
 */
export function visibleNodes(ctx: TabContext, nodes: ReadonlyArray<InstanceNode>): InstanceNode[] {
  const { ui } = ctx;
  const filter = ui.inspectFilter.trim().toLowerCase();

  // A filter turns the tree into a flat result list: keeping the hierarchy would
  // mean showing unmatched ancestors, which reads as "these matched too".
  if (filter !== "") {
    return nodes
      .filter((node) =>
        node.name.toLowerCase().includes(filter) ||
        node.instanceKey.toLowerCase().includes(filter))
      .map((node) => ({ ...node, depth: 0, parentKey: null }));
  }
  if (ui.inspectShowLibrary) return [...nodes];

  const byKey = new Map(nodes.map((node) => [node.instanceKey, node]));
  const keep = (node: InstanceNode): boolean => node.kind === "user";
  const nearestKeptAncestor = (node: InstanceNode): InstanceNode | null => {
    let current = node.parentKey ? byKey.get(node.parentKey) ?? null : null;
    let guard = 0;
    while (current && guard++ < 200) {
      if (keep(current)) return current;
      current = current.parentKey ? byKey.get(current.parentKey) ?? null : null;
    }
    return null;
  };

  const depths = new Map<string, number>();
  const out: InstanceNode[] = [];
  for (const node of nodes) {
    if (!keep(node)) continue;
    const parent = nearestKeptAncestor(node);
    const depth = parent ? (depths.get(parent.instanceKey) ?? 0) + 1 : 0;
    depths.set(node.instanceKey, depth);
    out.push({ ...node, depth, parentKey: parent?.instanceKey ?? null });
  }
  return out;
}

function renderTree(
  ctx: TabContext,
  visible: ReadonlyArray<InstanceNode>,
  aggregates: ReturnType<typeof instanceAggregates>,
): HTMLElement {
  const { ui } = ctx;
  const wrap = h("div", { class: "tree comp-tree", tabindex: "0" });

  const hasChildren = new Set(visible.map((node) => node.parentKey).filter((key): key is string => key !== null));
  // Hide the descendants of a collapsed node, using the VISIBLE parent chain so
  // collapsing works the same with library components hidden.
  const hidden = new Set<string>();
  const byParent = new Map<string, InstanceNode[]>();
  for (const node of visible) {
    if (node.parentKey === null) continue;
    const bucket = byParent.get(node.parentKey);
    if (bucket) bucket.push(node);
    else byParent.set(node.parentKey, [node]);
  }
  const hideSubtree = (key: string): void => {
    for (const child of byParent.get(key) ?? []) {
      if (hidden.has(child.instanceKey)) continue;
      hidden.add(child.instanceKey);
      hideSubtree(child.instanceKey);
    }
  };
  for (const node of visible) {
    if (ui.inspectCollapsed.has(node.instanceKey)) hideSubtree(node.instanceKey);
  }

  const rows = visible.filter((node) => !hidden.has(node.instanceKey));
  // Keyboard navigation over exactly the rows on screen: ↑/↓ move, ←/→
  // collapse/expand, Enter focuses the detail. A tree you can only click is
  // slower than the list it replaced.
  wrap.addEventListener("keydown", (event: KeyboardEvent) => {
    const index = rows.findIndex((node) => node.instanceKey === ui.selectedInstance);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) selectRow(ctx, next.instanceKey);
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const node = rows[index];
      if (!node) return;
      event.preventDefault();
      if (event.key === "ArrowRight") ui.inspectCollapsed.delete(node.instanceKey);
      else ui.inspectCollapsed.add(node.instanceKey);
      ctx.refresh();
    }
  });

  let revealRow: HTMLElement | null = null;
  for (const node of rows) {
    const agg = aggregates.get(node.instanceKey);
    const collapsed = ui.inspectCollapsed.has(node.instanceKey);
    const expandable = hasChildren.has(node.instanceKey);
    const selected = ui.selectedInstance === node.instanceKey;

    const row = h(
      "div",
      {
        class: `row ct-row ${selected ? "is-selected" : ""} ${node.mounted === false ? "is-unmounted" : ""}`,
        style: `padding-left:${6 + node.depth * 13}px`,
        title: node.instanceKey,
        onclick: () => selectRow(ctx, node.instanceKey),
        onmouseenter: () => ctx.highlightInstance(node.instanceKey, false),
        onmouseleave: () => ctx.overlay.hideHover(),
      },
      h("span", {
        class: `twist ${expandable ? "" : "is-leaf"}`,
        onclick: expandable
          ? (event: Event) => {
              event.stopPropagation();
              if (collapsed) ui.inspectCollapsed.delete(node.instanceKey);
              else ui.inspectCollapsed.add(node.instanceKey);
              ctx.refresh();
            }
          : undefined,
      }, expandable ? (collapsed ? "▸" : "▾") : "·"),
      h("span", { class: `ct-name ${node.kind === "user" ? "is-user" : ""}` }, node.name),
      node.explicitKey ? h("span", { class: "ct-key" }, `key=${truncateMiddle(node.explicitKey, 16)}`) : null,
      node.phase === "memo" ? chip("memo", "grey", "Skipped by memoization in the last commit") : null,
      node.mounted === false ? chip("no dom", "amber", "Renders a fragment with no host element, so there is nothing to highlight") : null,
      h("span", { class: "grow" }),
      node.propCount ? h("span", { class: "ct-meta", title: `${node.propCount} props` }, `${node.propCount}p`) : null,
      agg && agg.renders > 0
        ? h("span", { class: "ct-meta", title: `${agg.renders} render(s), ${agg.memo} memoized` }, `×${agg.renders}`)
        : null,
      h("span", { class: "ct-time" }, node.selfTime > 0 ? fmtMs(node.selfTime) : "—"),
    );
    if (ui.inspectReveal === node.instanceKey) revealRow = row;
    wrap.appendChild(row);
  }

  // A selection made in another tab may be far down a long tree. Scroll to it
  // once, after the rows are in the document, then forget the request.
  if (revealRow) {
    const target = revealRow;
    ui.inspectReveal = null;
    queueMicrotask(() => {
      if (target.isConnected) target.scrollIntoView({ block: "nearest" });
    });
  } else if (ui.inspectReveal !== null && rows.length > 0) {
    // The instance is not in the tree at all (it unmounted, or the commit it
    // came from is gone). Drop the request rather than retrying every render.
    ui.inspectReveal = null;
  }

  if (rows.length === 0) {
    wrap.appendChild(h("div", { class: "empty" },
      h("p", {}, ui.inspectFilter ? "No component matches the filter." : "No component instances yet."),
      ui.inspectFilter
        ? h("p", { class: "faint" }, "Clear the filter, or search by instance key.")
        : !ui.inspectShowLibrary
          ? h("p", { class: "faint" }, "This program declares no `function` components — turn on “Library” to see the built-ins it uses.")
          : h("p", { class: "faint" }, "Interact with the app, or press Force render on the Overview tab.")));
  }
  return wrap;
}

function selectRow(ctx: TabContext, instanceKey: string): void {
  ctx.ui.selectedInstance = instanceKey;
  ctx.ui.selectedElement = null;
  ctx.highlightInstance(instanceKey, true);
  ctx.refresh();
}

/* -------------------------------------------------------------------------- */
/*  Detail                                                                     */
/* -------------------------------------------------------------------------- */

function renderDetailPane(
  ctx: TabContext,
  nodes: ReadonlyArray<InstanceNode>,
  aggregates: ReturnType<typeof instanceAggregates>,
): Node[] {
  const { app, ui } = ctx;
  if (ui.selectedInstance) {
    const detail = can(app, "getInstance") ? app.getInstance(ui.selectedInstance) : null;
    if (detail) return renderDetail(ctx, detail, nodes, aggregates);
    return [section("Selection", [
      faint("That instance is no longer in the tree — it unmounted, or the program was replanned."),
      h("div", { class: "detail-head" }, button("Clear selection", () => {
        ui.selectedInstance = null;
        ctx.overlay.clear();
        ctx.refresh();
      })),
    ])];
  }
  if (ui.selectedElement) return renderElementOnly(ctx, ui.selectedElement);
  return [section(null, [
    faint("Select a component on the left, or use ◎ Pick to click one on the page."),
    h("div", { class: "detail-head" },
      button("◎ Pick an element", () => ctx.togglePicker(), { tone: "good" }),
      nodes.length > 0
        ? button(`Select ${nodes[0]!.name}`, () => selectRow(ctx, nodes[0]!.instanceKey), { title: "Select the root component" })
        : null),
  ], { flush: true })];
}

function renderDetail(
  ctx: TabContext,
  detail: InstanceDetail,
  nodes: ReadonlyArray<InstanceNode>,
  aggregates: ReturnType<typeof instanceAggregates>,
): Node[] {
  const { app, ui } = ctx;
  const agg = aggregates.get(detail.instanceKey);
  const element = can(app, "nodeForInstance") ? app.nodeForInstance(detail.instanceKey) : null;

  const crumbs = h("div", { class: "crumbs" });
  for (const ancestor of detail.ancestors) {
    crumbs.appendChild(h("button", {
      class: "crumb",
      title: ancestor,
      onclick: () => selectRow(ctx, ancestor),
      onmouseenter: () => ctx.highlightInstance(ancestor, false),
      onmouseleave: () => ctx.overlay.hideHover(),
    }, shortInstanceLabel(ancestor).replace(/[@=].*$/, "")));
    crumbs.appendChild(h("span", { class: "crumb-sep" }, "›"));
  }
  crumbs.appendChild(h("span", { class: "crumb is-current" }, detail.name));

  const header = section(null, [
    crumbs,
    h("div", { class: "detail-head" },
      h("span", { class: "detail-title" }, detail.name),
      chip(detail.kind, detail.kind === "user" ? "purple" : "grey"),
      detail.source ? code(`L${detail.source.line}:${detail.source.column}`) : null,
      spacer(),
      element
        ? button("Scroll to", () => {
            element.scrollIntoView({ block: "center", behavior: "smooth" });
            ctx.highlightInstance(detail.instanceKey, true);
          }, { title: "Scroll the element into view and highlight it" })
        : null,
      can(app, "remountInstance")
        ? button("Remount", () => {
            app.remountInstance(detail.instanceKey);
            ctx.toast(`Remounted ${detail.name}`);
            ctx.refresh();
          }, { title: "Drop this instance's memo, hooks, and UI state so it mounts fresh" })
        : null,
      copyButton(() => detail.instanceKey, "Copy key"),
    ),
    statGrid(
      stat("renders", String(agg?.renders ?? 0), { title: "Times this instance's body actually ran" }),
      stat("memoized", String(agg?.memo ?? 0), { title: "Times it was skipped because nothing it reads changed" }),
      stat("self time", fmtMs(agg?.total), { title: "Total body time across those renders" }),
      stat("slowest", fmtMs(agg?.max)),
      stat("dom nodes", detail.domNodes !== undefined ? String(detail.domNodes) : "—"),
      stat("effects", String(detail.effects.length)),
    ),
  ], { flush: true });

  const paneCounts = {
    props: detail.props.length,
    hooks: detail.hooks.length + detail.uiState.length,
  };
  const panes: Array<{ value: typeof ui.inspectPane; label: string; title: string }> = [
    { value: "props", label: `Props${paneCounts.props ? ` ${paneCounts.props}` : ""}`, title: "Arguments this instance received" },
    { value: "hooks", label: `State${paneCounts.hooks ? ` ${paneCounts.hooks}` : ""}`, title: "Per-instance $state / $memo cells and library UI state" },
    { value: "dom", label: "DOM", title: "Box model, attributes, and markup" },
    { value: "styles", label: "Styles", title: "Computed styles and theme variables in effect" },
    { value: "a11y", label: "A11y", title: "Role, accessible name, and ARIA wiring" },
    { value: "source", label: "Source", title: "Where this instance is written in the program" },
  ];
  const tabs = section(null, chipGroup(panes, ui.inspectPane, (value) => {
    ui.inspectPane = value;
    ctx.refresh();
  }), { flush: true });

  const body: Node[] = [];
  switch (ui.inspectPane) {
    case "props": body.push(...renderProps(ctx, detail)); break;
    case "hooks": body.push(...renderComponentState(ctx, detail)); break;
    case "dom": body.push(...renderDom(ctx, detail, element)); break;
    case "styles": body.push(...renderStyles(ctx, element)); break;
    case "a11y": body.push(...renderA11y(ctx, element)); break;
    case "source": body.push(...renderSource(ctx, detail)); break;
  }

  const deps = detail.deps.length > 0
    ? section("Reads", [
        h("div", { class: "chip-row" }, ...detail.deps.map((dep) =>
          h("button", {
            class: "chip blue is-link",
            title: `Show $${dep} in the State tab`,
            onclick: () => {
              ui.stateFilter = dep.split(".")[0] ?? dep;
              ctx.selectTab("state");
            },
          }, `$${dep}`))),
        faint("These are the reactive paths this body read last render — its memo dependencies. A change to any of them re-renders it."),
      ])
    : null;

  const kids = nodes.filter((node) => node.parentKey === detail.instanceKey);
  const children = kids.length > 0
    ? section(`Children (${kids.length})`, h("div", { class: "chip-row" }, ...kids.slice(0, 24).map((kid) =>
        h("button", {
          class: "chip grey is-link",
          onclick: () => selectRow(ctx, kid.instanceKey),
          onmouseenter: () => ctx.highlightInstance(kid.instanceKey, false),
          onmouseleave: () => ctx.overlay.hideHover(),
        }, kid.name))))
    : null;

  return [header, tabs, ...body, deps, children].filter((node): node is HTMLElement => node != null);
}

/* ---- props ------------------------------------------------------------- */

function renderProps(ctx: TabContext, detail: InstanceDetail): Node[] {
  const { app } = ctx;
  const editable = can(app, "setPropOverride");
  if (detail.props.length === 0 && (detail.overrides?.length ?? 0) === 0) {
    return [section("Props", [
      faint("This instance received no arguments."),
      editable ? renderAddOverride(ctx, detail) : null,
    ].filter((node): node is HTMLElement => node != null))];
  }

  return [
    section("Props", [
      h("div", { class: "prop-list" }, ...detail.props.map((prop) => renderPropRow(ctx, detail, prop, editable))),
      editable ? renderAddOverride(ctx, detail) : null,
      editable
        ? faint("A $-bound prop writes the atom. Any other prop takes a DevTools override that lasts until you clear it.")
        : faint("This runtime does not support prop overrides."),
    ].filter((node): node is HTMLElement => node != null)),
  ];
}

function renderPropRow(
  ctx: TabContext,
  detail: InstanceDetail,
  prop: ComponentPropRecord,
  editable: boolean,
): HTMLElement {
  const { app } = ctx;
  const readOnly = prop.value.json === undefined;

  const commit = (next: unknown): void => {
    if (prop.stateRef && app) {
      // The atom is the source of truth for a `$`-bound prop; overriding the
      // prop instead would be silently reverted by the next commit.
      app.setState(prop.stateRef, next);
      ctx.toast(`$${prop.stateRef} updated`);
    } else if (can(app, "setPropOverride")) {
      app.setPropOverride(detail.instanceKey, prop.name, next);
      ctx.toast(`${detail.name}.${prop.name} overridden`);
    }
    ctx.refresh();
  };

  return h(
    "div",
    { class: `prop-row ${prop.overridden ? "is-overridden" : ""}` },
    h("span", { class: "prop-name" }, prop.name),
    prop.stateRef ? chip(`$${prop.stateRef}`, "blue", "Two-way bound: editing this writes the atom") : null,
    prop.overridden ? chip("override", "amber", "Value forced by DevTools") : null,
    h("span", { class: "grow" }),
    readOnly || !editable
      ? valueSpan(prop.value, {
          title: readOnly
            ? "This value cannot be edited — it is a function, a live resource, or a DOM node"
            : undefined,
        })
      : editableValue(prop.value, commit, { focusKey: `${detail.instanceKey}:${prop.name}` }),
    prop.value.json !== undefined ? copyButton(() => prop.value.json ?? "", "⧉") : null,
    prop.overridden && can(app, "clearPropOverride")
      ? button("↺", () => {
          app.clearPropOverride(detail.instanceKey, prop.name);
          ctx.toast(`${prop.name} restored`);
          ctx.refresh();
        }, { title: "Restore the program's value" })
      : null,
  );
}

/**
 * Add an override for a prop the call site never passed.
 *
 * This is how you try `variant: "danger"` or `sx: { padding: 24 }` on a live
 * component without editing the program — the props list can only show what was
 * passed, and the interesting experiment is usually something that was not.
 */
function renderAddOverride(ctx: TabContext, detail: InstanceDetail): HTMLElement {
  let name = "";
  let value = "";
  const apply = (): void => {
    const prop = name.trim();
    if (prop === "" || !can(ctx.app, "setPropOverride")) return;
    ctx.app.setPropOverride(detail.instanceKey, prop, parseEditedValue(value));
    ctx.toast(`${detail.name}.${prop} overridden`);
    ctx.refresh();
  };
  return h("div", { class: "prop-row is-add" },
    h("span", { class: "prop-name faint" }, "＋"),
    textField({
      focusKey: `${detail.instanceKey}:new-prop-name`,
      placeholder: "prop name",
      width: "120px",
      onInput: (next) => { name = next; },
    }),
    textField({
      focusKey: `${detail.instanceKey}:new-prop-value`,
      placeholder: 'value — "danger", 12, true, { "gap": 8 }',
      onInput: (next) => { value = next; },
      onEnter: apply,
    }),
    button("Override", apply, { title: "Force this prop on the selected instance" }),
  );
}

/* ---- hooks + UI state --------------------------------------------------- */

function renderComponentState(ctx: TabContext, detail: InstanceDetail): Node[] {
  const { app } = ctx;
  const out: Node[] = [];

  if (detail.hooks.length > 0) {
    out.push(section("Hooks — $state / $memo cells", [
      h("div", { class: "prop-list" }, ...detail.hooks.map((hook) => h("div", { class: "prop-row" },
        h("span", { class: "prop-name mono", title: "Hooks are matched by call order, so the slot index is the address" }, `[${hook.slot}]`),
        chip(hook.kind, hook.kind === "state" ? "green" : "grey"),
        h("span", { class: "grow" }),
        hook.editable && can(app, "setInstanceHook")
          ? editableValue(hook.value, (next) => {
              const ok = app.setInstanceHook(detail.instanceKey, hook.slot, next);
              ctx.toast(ok ? `slot ${hook.slot} updated` : `slot ${hook.slot} is read-only`, ok ? "good" : "warn");
              ctx.refresh();
            }, { focusKey: `${detail.instanceKey}:hook:${hook.slot}` })
          : valueSpan(hook.value, {
              title: hook.kind === "memo"
                ? "A $memo is recomputed from its deps — edit what it reads instead"
                : "read-only",
            }),
      ))),
      faint("These are this instance's own cells. Two instances of the same component hold different ones."),
    ]));
  }

  if (detail.uiState.length > 0) {
    out.push(section("Component UI state", [
      h("div", { class: "prop-list" }, ...detail.uiState.map((slot) => h("div", { class: "prop-row" },
        h("span", { class: "prop-name mono" }, slot.key),
        h("span", { class: "grow" }),
        slot.editable && can(app, "setInstanceUiState")
          ? editableValue(slot.value, (next) => {
              const ok = app.setInstanceUiState(detail.instanceKey, slot.key, next);
              ctx.toast(ok ? `${slot.key} updated` : `${slot.key} no longer exists`, ok ? "good" : "warn");
              ctx.refresh();
            }, { focusKey: `${detail.instanceKey}:ui:${slot.key}` })
          : valueSpan(slot.value),
      ))),
      faint("The slots a library component keeps for itself — a Tabs' active pane, a Popover's open flag, a DataGrid's sort. They never appear in $state."),
    ]));
  }

  if (detail.effects.length > 0) {
    out.push(section(`Effects owned by this instance (${detail.effects.length})`,
      h("div", { class: "chip-row" }, ...detail.effects.map((key) =>
        h("button", {
          class: "chip purple is-link",
          title: "Open in the Effects tab",
          onclick: () => {
            ctx.ui.selectedEffect = key;
            ctx.selectTab("effects");
          },
        }, key.slice(key.lastIndexOf("::") + 2))))));
  }

  if (out.length === 0) {
    out.push(section("State", faint(
      "This instance holds no per-instance state. A library component only allocates a slot when it needs one, and a user component only when it calls $state / $memo.",
    )));
  }
  return out;
}

/* ---- DOM --------------------------------------------------------------- */

function renderDom(ctx: TabContext, detail: InstanceDetail, element: Element | null): Node[] {
  if (!element) {
    return [section("DOM", faint(
      "No DOM node carries this instance's tag. Either it renders a fragment (Show / Async / Lazy with no host), or DOM tagging is off in Settings.",
    ))];
  }
  return [
    section("Element", [
      h("div", { class: "detail-head" },
        code(describeElement(element)),
        spacer(),
        copyButton(() => cssPath(element, null), "Copy selector"),
        copyButton(() => element.outerHTML, "Copy HTML"),
        button("Log", () => {
          // eslint-disable-next-line no-console
          console.log("[aktion-devtools] selected element", element);
          ctx.toast("Logged to the page console");
        }, { title: "console.log the live element so you can poke at it" }),
      ),
      boxModelDiagram(element),
    ]),
    section("Attributes", attributeTable(element)),
    section("Markup", h("pre", { class: "code-pre" }, detail.html ?? element.outerHTML)),
  ];
}

/**
 * The classic nested box-model diagram: margin → border → padding → content,
 * each labelled with its measured values.
 */
function boxModelDiagram(element: Element): HTMLElement {
  const box = measureBox(element);
  if (!box) return faint("This element has no layout to measure.");
  const side = (value: number): string => (value === 0 ? "-" : String(Math.round(value * 100) / 100));
  const ring = (name: string, sides: { top: number; right: number; bottom: number; left: number }, inner: HTMLElement): HTMLElement =>
    h("div", { class: `bm bm-${name}` },
      h("span", { class: "bm-label" }, name),
      h("span", { class: "bm-t" }, side(sides.top)),
      h("span", { class: "bm-r" }, side(sides.right)),
      h("span", { class: "bm-b" }, side(sides.bottom)),
      h("span", { class: "bm-l" }, side(sides.left)),
      inner);
  const content = h("div", { class: "bm bm-content" },
    `${Math.round(box.content.width)} × ${Math.round(box.content.height)}`);
  return h("div", { class: "bm-wrap" },
    ring("margin", box.margin, ring("border", box.border, ring("padding", box.padding, content))));
}

function attributeTable(element: Element): HTMLElement {
  const attrs = [...element.attributes]
    // The instance tags are ours, not the program's — showing them as if the
    // author wrote them would be misleading.
    .filter((attr) => attr.name !== "data-aktion-instance" && attr.name !== "data-aktion-owner")
    .map((attr) => ({ name: attr.name, value: attr.value }));
  if (attrs.length === 0) return faint("No attributes.");
  return table(
    [
      { key: "name", label: "Attribute", render: (row) => code(row.name) },
      { key: "value", label: "Value", render: (row) => h("span", { class: "mono wrap" }, row.value === "" ? " " : row.value) },
    ],
    attrs,
  );
}

/* ---- styles ------------------------------------------------------------ */

function renderStyles(ctx: TabContext, element: Element | null): Node[] {
  if (!element) return [section("Styles", faint("Select an element with a DOM node to read its computed styles."))];
  const filter = ctx.ui.computedFilter.trim().toLowerCase();
  const out: Node[] = [
    section(null, toolbar(
      searchInput(ctx.ui.computedFilter, (value) => {
        ctx.ui.computedFilter = value;
        ctx.refresh();
      }, "Filter properties…", { focusKey: "computed-filter" }),
    ), { flush: true }),
  ];

  for (const group of COMPUTED_GROUPS) {
    const rows = computedGroup(element, group.props)
      .filter(([prop, value]) => filter === "" || prop.includes(filter) || value.toLowerCase().includes(filter));
    if (rows.length === 0) continue;
    out.push(section(group.title, defList(rows.map(([prop, value]) => [prop, h("span", { class: "mono" }, value)]))));
  }

  const vars = cssVariables(element).filter(([name, value]) =>
    filter === "" || name.includes(filter) || value.toLowerCase().includes(filter));
  if (vars.length > 0) {
    out.push(section(`Theme variables in effect (${vars.length})`, [
      defList(vars.slice(0, 80).map(([name, value]) => [
        name,
        h("span", { class: "mono" },
          isColor(value) ? h("span", { class: "swatch", style: `background:${value}` }) : null,
          value),
      ])),
      h("div", { class: "detail-head" },
        faint("These are the resolved --rui-* custom properties."),
        spacer(),
        button("Edit tokens", () => ctx.selectTab("theme"), { title: "Open the Theme tab" })),
    ]));
  }

  if (out.length === 1) out.push(section(null, faint("No computed properties match the filter."), { flush: true }));
  return out;
}

function isColor(value: string): boolean {
  return /^(#|rgb|hsl|color\()/i.test(value.trim());
}

/* ---- a11y -------------------------------------------------------------- */

function renderA11y(ctx: TabContext, element: Element | null): Node[] {
  if (!element) return [section("Accessibility", faint("Select an element with a DOM node."))];
  const summary = a11ySummary(element);
  // The audit walks DESCENDANTS of its root, so auditing `element` would never
  // report a problem with `element` itself — which is the most likely place to
  // find one. Audit its parent and keep the findings that point at this subtree.
  const audit = auditAccessibility(element.parentElement ?? element, { limit: 500 });
  const own = audit.findings.filter((f) => f.element === element || element.contains(f.element));

  return [
    section("Accessibility properties", summary.length > 0
      ? defList(summary.map(([key, value]) => [key, h("span", { class: "mono" }, value)]))
      : faint("No ARIA attributes, role, or accessible name.")),
    section(`Findings in this subtree (${own.length})`, [
      own.length === 0
        ? h("div", { class: "insight t-good" }, h("span", { class: "insight-ic" }, "✓"), h("span", {}, "No accessibility problems found here."))
        : h("div", {}, ...own.slice(0, 12).map((finding) =>
            h("div", { class: `insight t-${finding.impact === "critical" || finding.impact === "serious" ? "bad" : "warn"}` },
              h("span", { class: "insight-ic" }, finding.impact === "critical" ? "✖" : "▲"),
              h("span", {},
                h("b", {}, `${finding.rule}: `),
                finding.message,
                " ",
                faint(finding.help)),
              spacer(),
              button("Show", () => ctx.overlay.highlight(finding.element, {}, true), { title: "Highlight the element" })))),
      h("div", { class: "detail-head" },
        spacer(),
        button("Audit the whole app", () => {
          ctx.ui.testPane = "a11y";
          ctx.ui.a11yRequested = true;
          ctx.selectTab("test");
        }, { title: "Run the full audit in the Test tab" })),
    ]),
  ];
}

/* ---- source ------------------------------------------------------------ */

function renderSource(ctx: TabContext, detail: InstanceDetail): Node[] {
  const { app } = ctx;
  if (!detail.source || !app) {
    return [section("Source", faint("This instance carries no source position (it may come from a compiled program)."))];
  }
  const program = app.getProgram();
  const lines = program.split("\n");
  const line = detail.source.line;
  const from = Math.max(0, line - 6);
  const to = Math.min(lines.length, line + 5);
  const excerpt = h("div", { class: "code-block" });
  for (let i = from; i < to; i += 1) {
    excerpt.appendChild(h("div", { class: `code-line ${i + 1 === line ? "is-focus" : ""}` },
      h("span", { class: "code-gutter" }, String(i + 1)),
      h("span", { class: "code-text" }, lines[i] ?? "")));
  }
  return [
    section(`Source — line ${line}, column ${detail.source.column}`, [
      excerpt,
      h("div", { class: "detail-head" },
        spacer(),
        button("Open in Source tab", () => {
          ctx.ui.sourceFocusLine = line;
          ctx.selectTab("source");
        }, { title: "Jump to this line in the full program" })),
    ]),
  ];
}

/* ---- element-only selection -------------------------------------------- */

/**
 * A picked node that belongs to no component instance — a text wrapper, a node
 * from the host page, or an element rendered by a preserved third-party widget.
 * Everything DOM-side still applies, so show that rather than nothing.
 */
function renderElementOnly(ctx: TabContext, element: Element): Node[] {
  return [
    section(null, [
      h("div", { class: "detail-head" },
        h("span", { class: "detail-title" }, describeElement(element)),
        chip("no component", "amber", "This node was not produced by an Aktion component"),
        spacer(),
        button("Clear", () => {
          ctx.ui.selectedElement = null;
          ctx.overlay.clear();
          ctx.refresh();
        }, { title: "Clear the selection" })),
      faint("This element is not tagged with a component instance — it may be a text host, a preserved widget's internals, or part of the host page."),
    ], { flush: true }),
    section("Element", boxModelDiagram(element)),
    section("Attributes", attributeTable(element)),
    ...renderStyles(ctx, element),
  ];
}
