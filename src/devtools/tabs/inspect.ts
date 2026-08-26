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
 */

import {
  button, chip, chipGroup, code, copyButton, defList, editableValue, emptyState,
  faint, fmtMs, h, muted, searchInput, section, spacer, stat, statGrid, table,
  toggle, toolbar, truncateMiddle, valueSpan,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { instanceAggregates } from "../model.js";
import { descendantsOf, shortInstanceLabel } from "../tree.js";
import {
  COMPUTED_GROUPS, a11ySummary, computedGroup, cssPath, cssVariables,
  describeElement, measureBox,
} from "../overlay.js";
import { auditAccessibility } from "../a11y.js";
import type { ComponentPropRecord, InstanceDetail, InstanceNode } from "../protocol.js";
import { parseEditedValue } from "../serialize.js";

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

  const nodes = app.getComponentTree();
  const aggregates = instanceAggregates(ctx.model.commits);
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];

  const bar = toolbar(
    button(
      ctx.overlay.isPicking ? "◎ Picking…" : "◎ Pick",
      () => togglePicker(ctx),
      {
        title: "Select an element on the page to inspect it (Esc to cancel)",
        active: ctx.overlay.isPicking,
      },
    ),
    searchInput(ui.inspectFilter, (value) => {
      ui.inspectFilter = value;
      ctx.refresh();
    }, "Filter components…"),
    toggle("Library", ui.inspectShowLibrary, () => {
      ui.inspectShowLibrary = !ui.inspectShowLibrary;
      ctx.refresh();
    }, "Show built-in library components as well as your own"),
    spacer(),
    muted(`${nodes.length} instance${nodes.length === 1 ? "" : "s"}`),
    button("Collapse all", () => {
      for (const node of nodes) {
        if (nodes.some((n) => n.parentKey === node.instanceKey)) ui.inspectCollapsed.add(node.instanceKey);
      }
      ctx.refresh();
    }, { title: "Collapse every subtree" }),
    button("Expand all", () => {
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

  out.push(renderTree(ctx, nodes, aggregates));

  if (ui.selectedInstance) {
    const detail = can(app, "getInstance") ? app.getInstance(ui.selectedInstance) : null;
    if (detail) out.push(...renderDetail(ctx, detail, nodes, aggregates));
    else {
      out.push(section("Selection", faint(
        "That instance is no longer in the tree — it unmounted, or the program was replanned.",
      )));
    }
  } else if (ui.selectedElement) {
    out.push(...renderElementOnly(ctx, ui.selectedElement));
  } else {
    out.push(section(null, faint("Select a component above, or use ◎ Pick to click one on the page."), { flush: true }));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Picker                                                                     */
/* -------------------------------------------------------------------------- */

function togglePicker(ctx: TabContext): void {
  if (ctx.overlay.isPicking) {
    ctx.overlay.stopPicking();
    ctx.refresh();
    return;
  }
  const app = ctx.app;
  ctx.overlay.startPicking({
    onPick: (element) => {
      ctx.ui.selectedElement = element;
      const key = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
      ctx.ui.selectedInstance = key;
      if (key) ctx.highlightInstance(key, true);
      else ctx.overlay.highlight(element, {}, true);
      ctx.ui.inspectPane = key ? "props" : "dom";
      ctx.selectTab("inspect");
    },
    onCancel: () => ctx.refresh(),
  });
  ctx.refresh();
}

/* -------------------------------------------------------------------------- */
/*  Tree                                                                       */
/* -------------------------------------------------------------------------- */

function renderTree(
  ctx: TabContext,
  nodes: ReadonlyArray<InstanceNode>,
  aggregates: ReturnType<typeof instanceAggregates>,
): HTMLElement {
  const { ui } = ctx;
  const filter = ui.inspectFilter.trim().toLowerCase();
  const wrap = h("div", { class: "tree comp-tree" });

  // A filter turns the tree into a flat result list: keeping the hierarchy would
  // mean showing unmatched ancestors, which reads as "these matched too".
  const visible = filter !== ""
    ? nodes.filter((node) =>
        node.name.toLowerCase().includes(filter) ||
        node.instanceKey.toLowerCase().includes(filter))
    : nodes.filter((node) => ui.inspectShowLibrary || node.kind === "user");

  const hasChildren = new Set(nodes.map((n) => n.parentKey).filter((k): k is string => k !== null));
  const hidden = new Set<string>();
  if (filter === "") {
    for (const node of visible) {
      if (!ui.inspectCollapsed.has(node.instanceKey)) continue;
      for (const key of descendantsOf(node.instanceKey, nodes)) hidden.add(key);
    }
  }

  let shown = 0;
  const minDepth = visible.reduce((min, n) => Math.min(min, n.depth), Number.MAX_SAFE_INTEGER);
  for (const node of visible) {
    if (hidden.has(node.instanceKey)) continue;
    shown += 1;
    const agg = aggregates.get(node.instanceKey);
    const collapsed = ui.inspectCollapsed.has(node.instanceKey);
    const expandable = hasChildren.has(node.instanceKey) && filter === "";
    const selected = ui.selectedInstance === node.instanceKey;
    const depth = filter === "" ? Math.max(0, node.depth - (minDepth === Number.MAX_SAFE_INTEGER ? 0 : minDepth)) : 0;

    const row = h(
      "div",
      {
        class: `row ct-row ${selected ? "is-selected" : ""} ${node.mounted === false ? "is-unmounted" : ""}`,
        style: `padding-left:${6 + depth * 13}px`,
        onclick: () => {
          ui.selectedInstance = node.instanceKey;
          ui.selectedElement = null;
          ctx.highlightInstance(node.instanceKey, true);
          ctx.refresh();
        },
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
      node.mounted === false ? chip("no dom", "amber", "No DOM node carries this instance's tag") : null,
      h("span", { class: "grow" }),
      node.propCount ? h("span", { class: "ct-meta" }, `${node.propCount}p`) : null,
      agg && agg.renders > 0
        ? h("span", { class: "ct-meta", title: `${agg.renders} render(s), ${agg.memo} memoized` }, `×${agg.renders}`)
        : null,
      h("span", { class: "ct-time" }, node.selfTime > 0 ? fmtMs(node.selfTime) : "—"),
    );
    wrap.appendChild(row);
  }

  if (shown === 0) {
    wrap.appendChild(h("div", { class: "empty" },
      filter ? "No component matches the filter." : "No component instances in the last commit."));
  }
  return section(null, wrap, { flush: true });
}

/* -------------------------------------------------------------------------- */
/*  Detail                                                                     */
/* -------------------------------------------------------------------------- */

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
      onclick: () => {
        ui.selectedInstance = ancestor;
        ctx.highlightInstance(ancestor, true);
        ctx.refresh();
      },
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
          }, { title: "Scroll the element into view" })
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
      stat("renders", String(agg?.renders ?? 0)),
      stat("memoized", String(agg?.memo ?? 0)),
      stat("self time", fmtMs(agg?.total)),
      stat("slowest", fmtMs(agg?.max)),
      stat("dom nodes", detail.domNodes !== undefined ? String(detail.domNodes) : "—"),
      stat("effects", String(detail.effects.length)),
    ),
  ], { flush: true });

  const panes: Array<{ value: typeof ui.inspectPane; label: string; title: string }> = [
    { value: "props", label: `Props${detail.props.length ? ` (${detail.props.length})` : ""}`, title: "Arguments this instance received" },
    { value: "hooks", label: `State${detail.hooks.length + detail.uiState.length ? ` (${detail.hooks.length + detail.uiState.length})` : ""}`, title: "Per-instance $state / $memo cells and library UI state" },
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
    ? section("Reads", h("div", { class: "chip-row" }, ...detail.deps.map((dep) =>
        h("button", {
          class: "chip blue is-link",
          title: `Show $${dep} in the State tab`,
          onclick: () => {
            ui.stateFilter = dep.split(".")[0] ?? dep;
            ctx.selectTab("state");
          },
        }, `$${dep}`))))
    : null;

  const kids = nodes.filter((n) => n.parentKey === detail.instanceKey);
  const children = kids.length > 0
    ? section(`Children (${kids.length})`, h("div", { class: "chip-row" }, ...kids.slice(0, 24).map((kid) =>
        h("button", {
          class: "chip grey is-link",
          onclick: () => {
            ui.selectedInstance = kid.instanceKey;
            ctx.highlightInstance(kid.instanceKey, true);
            ctx.refresh();
          },
          onmouseenter: () => ctx.highlightInstance(kid.instanceKey, false),
          onmouseleave: () => ctx.overlay.hideHover(),
        }, kid.name))))
    : null;

  return [header, tabs, ...body, deps, children].filter((n): n is HTMLElement => n != null);
}

/* ---- props ------------------------------------------------------------- */

function renderProps(ctx: TabContext, detail: InstanceDetail): Node[] {
  const { app } = ctx;
  const editable = can(app, "setPropOverride");
  if (detail.props.length === 0 && (detail.overrides?.length ?? 0) === 0) {
    return [section("Props", faint("This instance received no arguments."))];
  }

  const rows = detail.props.map((prop) => renderPropRow(ctx, detail, prop, editable));
  const addRow = editable ? renderAddOverride(ctx, detail) : null;

  return [
    section("Props", [
      h("div", { class: "prop-list" }, ...rows),
      addRow,
      editable
        ? faint("Editing a $-bound prop writes the atom. Editing any other prop installs a DevTools override that lasts until you clear it.")
        : faint("This runtime does not support prop overrides."),
    ]),
  ];
}

function renderPropRow(
  ctx: TabContext,
  detail: InstanceDetail,
  prop: ComponentPropRecord,
  editable: boolean,
): HTMLElement {
  const { app } = ctx;
  const canWriteAtom = can(app, "setState");
  const readOnly = prop.value.json === undefined;

  const commit = (next: unknown): void => {
    if (prop.stateRef && canWriteAtom) {
      // The atom is the source of truth for a `$`-bound prop; overriding the
      // prop instead would be silently reverted by the next commit.
      app!.setState(prop.stateRef, next);
      ctx.toast(`$${prop.stateRef} = ${JSON.stringify(next)}`);
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
    prop.stateRef ? chip(`$${prop.stateRef}`, "blue", "Two-way bound to this reactive path") : null,
    prop.overridden ? chip("override", "amber", "Value forced by DevTools") : null,
    h("span", { class: "grow" }),
    readOnly || !editable
      ? valueSpan(prop.value, { title: readOnly ? "This value cannot be edited (function, resource, or DOM node)" : undefined })
      : editableValue(prop.value, commit),
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
  const nameInput = h("input", { class: "search", placeholder: "prop name", style: "max-width:120px" }) as HTMLInputElement;
  const valueInput = h("input", { class: "search", placeholder: 'value (JSON, e.g. "danger" or 12)' }) as HTMLInputElement;
  const apply = (): void => {
    const name = nameInput.value.trim();
    if (name === "" || !can(ctx.app, "setPropOverride")) return;
    ctx.app.setPropOverride(detail.instanceKey, name, parseEditedValue(valueInput.value));
    ctx.toast(`${detail.name}.${name} overridden`);
    ctx.refresh();
  };
  valueInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") apply();
  });
  return h("div", { class: "prop-row is-add" },
    h("span", { class: "prop-name faint" }, "＋"),
    nameInput,
    valueInput,
    button("Override", apply, { title: "Force this prop on the selected instance" }),
  );
}

/* ---- hooks + UI state --------------------------------------------------- */

function renderComponentState(ctx: TabContext, detail: InstanceDetail): Node[] {
  const { app } = ctx;
  const out: Node[] = [];

  if (detail.hooks.length > 0) {
    out.push(section("Hooks — $state / $memo cells", h("div", { class: "prop-list" },
      ...detail.hooks.map((hook) => h("div", { class: "prop-row" },
        h("span", { class: "prop-name mono" }, `[${hook.slot}]`),
        chip(hook.kind, hook.kind === "state" ? "green" : "grey"),
        h("span", { class: "grow" }),
        hook.editable && can(app, "setInstanceHook")
          ? editableValue(hook.value, (next) => {
              const ok = app.setInstanceHook(detail.instanceKey, hook.slot, next);
              ctx.toast(ok ? `slot ${hook.slot} updated` : `slot ${hook.slot} is read-only`, ok ? "good" : "warn");
              ctx.refresh();
            })
          : valueSpan(hook.value, { title: hook.kind === "memo" ? "A $memo is recomputed from its deps — edit the deps instead" : "read-only" }),
      )),
    )));
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
            })
          : valueSpan(slot.value),
      ))),
      faint("These are the slots a library component keeps for itself — a Tabs' active pane, a Popover's open flag, a DataGrid's sort. They never appear in $state."),
    ]));
  }

  if (detail.effects.length > 0) {
    out.push(section(`Effects owned by this instance (${detail.effects.length})`,
      h("div", { class: "chip-row" }, ...detail.effects.map((key) =>
        h("button", {
          class: "chip purple is-link",
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
      { key: "value", label: "Value", render: (row) => h("span", { class: "mono wrap" }, row.value === "" ? " " : row.value) },
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
      }, "Filter properties…"),
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
      faint("These are the resolved --rui-* custom properties. Change them live in the Theme tab."),
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
    section(`Findings in this subtree (${own.length})`, own.length === 0
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
            button("Show", () => ctx.overlay.highlight(finding.element, {}, true), { title: "Highlight the element" }))))),
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

