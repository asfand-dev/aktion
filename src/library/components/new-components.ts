/**
 * Tier 1–3 components: IconButton, CommandPalette, FilterChips, FieldRepeater,
 * VirtualList, QueryBuilder, DiffViewer, JsonTree, Gantt, Truncate, InlineEdit,
 * NotificationBell.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, valueAttr, renderIcon, sanitiseHref,
} from "../utils.js";
import {
  installDismissListeners, disposeDismissListeners, dialogKeydownHandler, wireDialogFocus,
} from "./_internal.js";
import { closeFloating, deferToPaint, syncFloatingPanel } from "../floating.js";
import { FIELD_SHELL_PROPS, withFieldShell } from "./forms-shared.js";
// The button vocabulary is imported, not restated. Two hand-copied arrays are
// what let IconButton advertise four variants while Button had seven, so
// `variant: "outline"` validated on one call and hard-failed on the next; a
// duplicated literal gives nothing to notice the next divergence. Same reason
// for `normaliseButtonSize`: the two copies had already drifted over whether
// `small` / `large` were accepted spellings.
import { BUTTON_VARIANTS, BUTTON_SIZES, normaliseButtonSize } from "./forms.js";

/**
 * Monotonic id source for label / `aria-controls` / `aria-activedescendant`
 * wiring. Components park the generated id in `useInstanceState` so it stays
 * stable across re-renders — a fresh id per render would churn the attribute
 * and break the reference for one frame.
 */
let uidSeq = 0;
const nextUid = (prefix: string): string => `${prefix}-${(uidSeq += 1).toString(36)}`;

/* ----------------------------------------------------------------------- *
 * Full-screen overlay promotion
 * ----------------------------------------------------------------------- */

/**
 * Inline neutralisation of the UA `[popover]` rules (border, padding,
 * background, `inset: 0`, `margin: auto`, `overflow: auto`). Applied with
 * `!important` because the UA sheet is what we are overriding.
 */
const TOP_LAYER_RESET: ReadonlyArray<readonly [string, string]> = [
  ["inset", "auto"],
  ["margin", "0"],
  ["padding", "0"],
  ["border", "0"],
  ["background", "transparent"],
  ["width", "0"],
  ["height", "0"],
  ["overflow", "visible"],
  ["color", "inherit"],
];

/**
 * Promote a centred-modal host into the browser top layer.
 *
 * `position: fixed` on the backdrop/panel is not enough on its own: any
 * ancestor with a `transform`, `filter` or `backdrop-filter` becomes their
 * containing block and re-anchors them (the stylesheet transforms cards on
 * hover, and the universal `animate` prop can transform any component). The top
 * layer escapes that and every clipping ancestor, and `showPopover()` does it
 * WITHOUT reparenting, so the morph reconciler still diffs the tree it rendered.
 *
 * Anchored popups go through `openFloating` (floating.ts) instead — they need
 * measured coordinates. A centred modal has no anchor: the geometry stays in
 * CSS and only the paint layer changes here.
 */
function promoteOverlay(hostEl: HTMLElement): void {
  const api = hostEl as HTMLElement & { showPopover?: () => void };
  if (typeof api.showPopover !== "function") return;
  if (hostEl.hasAttribute("popover")) return; // already promoted
  hostEl.setAttribute("popover", "manual");
  try {
    api.showPopover();
  } catch {
    // Detached node, or a popover that is already open — fall back to the
    // stylesheet's own `position: fixed` layering.
    hostEl.removeAttribute("popover");
    return;
  }
  for (const [prop, value] of TOP_LAYER_RESET) hostEl.style.setProperty(prop, value, "important");
}

function demoteOverlay(hostEl: HTMLElement | null | undefined): void {
  if (!hostEl || !hostEl.hasAttribute("popover")) return;
  try {
    (hostEl as HTMLElement & { hidePopover?: () => void }).hidePopover?.();
  } catch {
    /* already hidden */
  }
  hostEl.removeAttribute("popover");
  for (const [prop] of TOP_LAYER_RESET) hostEl.style.removeProperty(prop);
}

/* ----------------------------------------------------------------------- *
 * Prop readers
 * ----------------------------------------------------------------------- */

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

interface FieldDef {
  name: string;
  label: string;
  type: string;
  options?: unknown;
  operators?: unknown;
  placeholder?: string;
}

function readFields(raw: unknown): FieldDef[] {
  return asArray<unknown>(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry as {
        name?: unknown; label?: unknown; type?: unknown;
        options?: unknown; operators?: unknown; placeholder?: unknown;
      };
      const name = asString(obj.name ?? obj.label);
      return {
        name,
        label: asString(obj.label, name),
        type: (asString(obj.type, "text") || "text").trim().toLowerCase(),
        options: obj.options,
        operators: obj.operators,
        placeholder: asString(obj.placeholder) || undefined,
      };
    }
    const name = asString(entry);
    return { name, label: name, type: "text" };
  }).filter((f) => f.name !== "");
}

function readGanttTasks(raw: unknown): Array<{
  id: string; label: string; start: string; end: string; progress?: number; tone?: string;
}> {
  return readPlainObjects(raw).map((t, i) => ({
    id: asString(t.id, `task-${i}`),
    label: asString(t.label ?? t.name, `Task ${i + 1}`),
    start: asString(t.start),
    end: asString(t.end),
    progress: t.progress != null ? asNumber(t.progress, 0) : undefined,
    tone: asString(t.tone ?? t.status) || undefined,
  }));
}

/** `null` for anything the platform cannot parse — never a silent "now". */
function parseDate(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/* ----------------------------------------------------------------------- *
 * Diff
 * ----------------------------------------------------------------------- */

interface DiffRow {
  type: "same" | "add" | "remove" | "gap";
  text: string;
  leftNo?: number;
  rightNo?: number;
  /** Number of collapsed unchanged lines — `gap` rows only. */
  count?: number;
}

/**
 * The LCS table is O(n*m) cells. Beyond this budget we fall back to the cheap
 * positional comparison rather than allocating hundreds of megabytes for a
 * viewer that caps its own height anyway.
 */
const DIFF_CELL_BUDGET = 1_000_000;

/**
 * Line diff via longest common subsequence.
 *
 * The positional `a[i] === b[i]` comparison this replaces marked every line
 * after a single insertion as changed — worst exactly where a diff matters
 * (adding an import at the top of a file). Line numbers are carried on each row
 * so the viewer can label them without re-deriving the mapping.
 */
function diffLines(left: string, right: string): DiffRow[] {
  const a = left.split("\n");
  const b = right.split("\n");
  const out: DiffRow[] = [];
  const n = a.length;
  const m = b.length;

  if (n * m > DIFF_CELL_BUDGET) {
    const max = Math.max(n, m);
    for (let i = 0; i < max; i += 1) {
      const la = a[i];
      const lb = b[i];
      if (la === lb) {
        if (la !== undefined) out.push({ type: "same", text: la, leftNo: i + 1, rightNo: i + 1 });
      } else {
        if (la !== undefined) out.push({ type: "remove", text: la, leftNo: i + 1 });
        if (lb !== undefined) out.push({ type: "add", text: lb, rightNo: i + 1 });
      }
    }
    return out;
  }

  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = a[i] === b[j]
        ? (lcs[(i + 1) * width + (j + 1)] ?? 0) + 1
        : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + (j + 1)] ?? 0);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i]!, leftNo: i + 1, rightNo: j + 1 });
      i += 1;
      j += 1;
    } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + (j + 1)] ?? 0)) {
      out.push({ type: "remove", text: a[i]!, leftNo: i + 1 });
      i += 1;
    } else {
      out.push({ type: "add", text: b[j]!, rightNo: j + 1 });
      j += 1;
    }
  }
  while (i < n) { out.push({ type: "remove", text: a[i]!, leftNo: i + 1 }); i += 1; }
  while (j < m) { out.push({ type: "add", text: b[j]!, rightNo: j + 1 }); j += 1; }
  return out;
}

/** Collapse unchanged runs to `context` lines either side of each change. */
function collapseContext(rows: DiffRow[], context: number): DiffRow[] {
  if (context < 0) return rows;
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, idx) => {
    if (row.type === "same") return;
    const from = Math.max(0, idx - context);
    const to = Math.min(rows.length - 1, idx + context);
    for (let k = from; k <= to; k += 1) keep[k] = true;
  });
  const out: DiffRow[] = [];
  let hidden = 0;
  for (let idx = 0; idx < rows.length; idx += 1) {
    if (keep[idx]) {
      if (hidden > 0) {
        out.push({ type: "gap", text: "", count: hidden });
        hidden = 0;
      }
      out.push(rows[idx]!);
    } else {
      hidden += 1;
    }
  }
  if (hidden > 0) out.push({ type: "gap", text: "", count: hidden });
  return out;
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* ----------------------------------------------------------------------- *
 * Tier 1
 * ----------------------------------------------------------------------- */

export const IconButton: ComponentSpec = {
  name: "IconButton",
  description:
    "Icon-only button with an accessible label. Use for toolbars, table row actions, and compact controls. " +
    "`active` makes it a toggle (reflected as `aria-pressed`), `loading` shows a spinner and blocks clicks, " +
    "and `href` renders it as a link instead of a button.",
  props: [
    { name: "icon", type: "string", description: "Font Awesome icon name" },
    { name: "label", type: "string", required: true, description: "Accessible label — the control's only name, so never omit it" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
    { name: "variant", type: "string", optional: true, aliases: ["tone"], enum: BUTTON_VARIANTS, description: "Same vocabulary as `Button` — `primary`/`default`, `secondary`, `outline`, `ghost` (the default here), `link`, `danger`" },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES, description: "Size token `xs|sm|md|lg|xl` (default `md`)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "active", type: "boolean", optional: true, aliases: ["pressed", "selected"], description: "Toggle state — adds `aria-pressed` for assistive tech" },
    { name: "loading", type: "boolean", optional: true, description: "Show a spinner and ignore clicks" },
    { name: "type", type: "string", optional: true, enum: ["button", "submit", "reset"], description: "HTML button type (default `button`)" },
    { name: "href", type: "string", optional: true, description: "Render as a link (sanitised) so middle-click and ctrl-click work" },
  ],
  render: (_node, props, helpers) => {
    const loading = asBoolean(props.loading);
    const disabled = asBoolean(props.disabled) || loading;
    // An icon-only control's label IS its accessible name, and `asString`
    // returns "" for an omitted prop — which used to ship `aria-label=""`, i.e.
    // a button that announces as just "button". Fall back to the icon name.
    const name = asString(props.label).trim() || asString(props.icon).trim().replace(/[-_]/g, " ");
    const active = props.active === undefined ? null : asBoolean(props.active);
    const href = asString(props.href).trim();
    const shared = {
      class: "rui-icon-button",
      "data-variant": asString(props.variant, "ghost"),
      "data-size": normaliseButtonSize(props.size),
      "data-active": active === null ? null : active ? "true" : "false",
      "data-loading": loading ? "true" : null,
      // Deliberately no `title`: several AT/browser pairs announce a title that
      // duplicates the accessible name twice. Use `Tooltip` for a hover hint.
      "aria-label": name || null,
    };
    const iconNode = loading
      ? renderIcon("spinner", { className: "rui-icon-button-spinner" })
      : renderIcon(props.icon, { className: "rui-icon-button-icon" });

    if (href) {
      const link = el("a", {
        ...shared,
        href: sanitiseHref(href),
        "aria-disabled": disabled ? "true" : null,
      });
      if (iconNode) link.append(iconNode);
      link.onclick = (event) => {
        if (disabled) { event.preventDefault(); return; }
        helpers.invoke(props.onClick);
      };
      return link;
    }

    const btn = el("button", {
      ...shared,
      type: asString(props.type, "button"),
      "aria-pressed": active === null ? null : active ? "true" : "false",
      "aria-busy": loading ? "true" : null,
      disabled: disabled ? "" : null,
    });
    if (iconNode) btn.append(iconNode);
    btn.onclick = () => {
      if (loading) return;
      helpers.invoke(props.onClick);
    };
    return btn;
  },
};

/** `open` is the second declared prop, so a `$state`-bound flag lands here. */
const PALETTE_OPEN_ARG = 1;
const PALETTE_PANEL_SELECTOR = ".rui-command-palette-panel";

export const CommandPalette: ComponentSpec = {
  name: "CommandPalette",
  description:
    "Cmd-K style searchable command list. Pass `items` as `{label, value, group?, shortcut?, action?}` objects. " +
    "Arrow keys move the selection, Enter runs it, Escape closes. Bind `open` to a `$variable` (or pass " +
    "`onClose`) so dismissing the palette is written back — otherwise the next re-render re-opens it.",
  props: [
    { name: "items", type: "any[]" },
    { name: "open", type: "boolean", optional: true, description: "Whether the palette is visible (default true)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "shortcut", type: "string", optional: true, description: "Hint label, e.g. Cmd+K" },
    { name: "onSelect", type: "callable", optional: true, description: "Receives the selected item's `value`" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onOpenChange"], description: "Called with `false` whenever the palette is dismissed" },
    { name: "loading", type: "boolean", optional: true, description: "Show a pending state instead of the empty row" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when nothing matches (default \"No commands found\")" },
    { name: "label", type: "string", optional: true, description: "Accessible name for the dialog (default \"Command palette\")" },
    { name: "maxResults", type: "number", optional: true, description: "Rows rendered before the list is truncated (default 50)" },
  ],
  render: (node, props, helpers) => {
    const items = readCommandItems(props.items);
    const loading = asBoolean(props.loading);
    const maxResults = Math.max(1, Math.floor(asNumber(props.maxResults, 50)));
    // The palette is "controlled" whenever the script supplies an `open` prop
    // (so `open: $atom` updates visibility on every change) and "uncontrolled"
    // otherwise (the internal slot tracks open/closed for demo programs).
    const propProvided = props.open !== undefined;
    const propOpen = propProvided ? asBoolean(props.open) : true;
    const openSlot = helpers.useInstanceState<boolean>("open", propOpen);
    if (propProvided && openSlot.get() !== propOpen) openSlot.set(propOpen);
    const filterSlot = helpers.useInstanceState<string>("filter", "");
    const activeSlot = helpers.useInstanceState<number>("active", 0);
    const idSlot = helpers.useInstanceState<string>("id", nextUid("rui-cmd"));
    const isOpen = propProvided ? propOpen : openSlot.get();
    // Read the DECLARED slot, never `argMeta.find(m => m?.stateRef)` — the
    // latter finds the first `$`-bound prop and would write the dismissal into
    // whatever that happened to be (`items`).
    const stateRef = node.argMeta?.[PALETTE_OPEN_ARG]?.stateRef;
    const listId = `${idSlot.get()}-list`;
    const optionId = (index: number): string => `${idSlot.get()}-opt-${index}`;

    const host = el("div", { class: "rui-command-palette", "data-open": isOpen ? "true" : "false" });
    // Focus moves into the panel on open and back to the trigger on close.
    // Installed once per live instance (re-render snapshots bail on
    // `isConnected`), watching `data-open` on the live root.
    wireDialogFocus(host, PALETTE_PANEL_SELECTOR, helpers);

    /** Every dismissal path funnels through here. */
    const closePalette = (origin: Element | null): void => {
      openSlot.set(false);
      filterSlot.set("");
      activeSlot.set(0);
      const liveHost = (origin?.closest(".rui-command-palette") ?? null) as HTMLElement | null;
      const liveShell = liveHost?.querySelector<HTMLElement>(PALETTE_PANEL_SELECTOR) ?? null;
      liveHost?.setAttribute("data-open", "false");
      disposeDismissListeners(liveShell ?? undefined);
      demoteOverlay(liveHost);
      // Without writing the visibility back, a controlled palette is rebuilt
      // from the unchanged `open` prop on the very next re-render and pops
      // straight back over the page the command navigated to.
      if (stateRef) helpers.setState(stateRef, false);
      helpers.invoke(props.onClose, false);
    };

    if (!isOpen) return host;

    const backdrop = el("div", { class: "rui-command-palette-backdrop" });
    const shell = el("div", {
      class: "rui-command-palette-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": asString(props.label, "Command palette"),
    });
    const header = el("div", { class: "rui-command-palette-header" });
    const search = el("input", {
      type: "text",
      class: "rui-command-palette-input",
      placeholder: asString(props.placeholder, "Search commands…"),
      value: filterSlot.get(),
      autocomplete: "off",
      // Combobox semantics: the input keeps focus and names the active row
      // through `aria-activedescendant`, which is what makes arrow-key
      // selection audible to a screen reader.
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": listId,
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
    }) as HTMLInputElement;
    header.append(search);
    const shortcut = asString(props.shortcut);
    if (shortcut) header.append(el("span", { class: "rui-command-palette-shortcut" }, [shortcut]));
    shell.append(header);

    const list = el("div", {
      class: "rui-command-palette-list",
      role: "listbox",
      id: listId,
      "aria-busy": loading ? "true" : null,
    });

    const matchesFor = (filter: string): CommandItem[] => {
      const lower = filter.trim().toLowerCase();
      if (lower === "") return items;
      return items.filter((i) =>
        i.label.toLowerCase().includes(lower) ||
        i.value.toLowerCase().includes(lower) ||
        (i.group ?? "").toLowerCase().includes(lower));
    };

    const runItem = (row: HTMLElement, item: CommandItem): void => {
      helpers.invoke(item.action);
      helpers.invoke(props.onSelect, item.value);
      closePalette(row);
    };

    const paintList = (target: HTMLElement, filter: string): void => {
      target.replaceChildren();
      if (loading) {
        // Text-free so there is nothing to translate: an in-flight search must
        // not claim the thing being searched for does not exist.
        const pending = el("div", { class: "rui-command-palette-empty", role: "status" });
        const spin = renderIcon("spinner", { className: "rui-command-palette-spinner" });
        if (spin) pending.append(spin);
        target.append(pending);
        target.setAttribute("aria-busy", "true");
        return;
      }
      target.removeAttribute("aria-busy");
      const matches = matchesFor(filter);
      const shown = matches.slice(0, maxResults);
      const active = Math.max(0, Math.min(activeSlot.get(), shown.length - 1));
      activeSlot.set(active);
      let lastGroup = "";
      shown.forEach((item, index) => {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          target.append(el("div", { class: "rui-command-palette-group" }, [lastGroup]));
        }
        // A `div` rather than a `button`: `role="option"` rows must not be tab
        // stops (focus stays in the combobox input), and a non-focusable row
        // also lets the shared dialog Tab-trap keep focus inside the panel.
        const row = el("div", {
          class: "rui-command-palette-item",
          role: "option",
          id: optionId(index),
          "data-value": item.value,
          "data-index": String(index),
          "data-active": index === active ? "true" : null,
          "aria-selected": index === active ? "true" : "false",
        }, [item.label]);
        if (item.shortcut) row.append(el("span", { class: "rui-command-palette-item-kbd" }, [item.shortcut]));
        row.onclick = (event) => {
          event.stopPropagation();
          runItem(event.currentTarget as HTMLElement, item);
        };
        target.append(row);
      });
      if (matches.length === 0) {
        target.append(el("div", { class: "rui-command-palette-empty" }, [
          asString(props.emptyLabel, "No commands found"),
        ]));
      } else if (matches.length > shown.length) {
        // Numeric on purpose — surfaces the truncation in any language.
        target.append(el("div", { class: "rui-command-palette-footer" }, [
          `${shown.length} / ${matches.length}`,
        ]));
      }
    };
    paintList(list, filterSlot.get());
    search.setAttribute("aria-activedescendant", list.children.length > 0 ? optionId(activeSlot.get()) : "");
    shell.append(list);

    backdrop.onclick = (event) => closePalette(event.currentTarget as Element);
    host.append(backdrop, shell);

    /** Move the roving selection and keep `aria-activedescendant` in step. */
    const setActive = (input: HTMLElement, rows: HTMLElement[], index: number): void => {
      if (rows.length === 0) return;
      const next = ((index % rows.length) + rows.length) % rows.length;
      rows.forEach((row, i) => {
        if (i === next) row.setAttribute("data-active", "true");
        else row.removeAttribute("data-active");
        row.setAttribute("aria-selected", i === next ? "true" : "false");
      });
      const target = rows[next]!;
      activeSlot.set(Number(target.getAttribute("data-index") ?? next));
      input.setAttribute("aria-activedescendant", target.id);
      target.scrollIntoView?.({ block: "nearest" });
    };

    search.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      const liveList = target.closest(PALETTE_PANEL_SELECTOR)
        ?.querySelector(".rui-command-palette-list") as HTMLElement | null;
      filterSlot.set(target.value);
      activeSlot.set(0);
      if (!liveList) return;
      paintList(liveList, target.value);
      const rows = Array.from(liveList.querySelectorAll<HTMLElement>(".rui-command-palette-item"));
      if (rows.length > 0) setActive(target, rows, 0);
      else target.setAttribute("aria-activedescendant", "");
    };
    // Escape and the Tab trap live on the host (`dialogKeydownHandler`), so this
    // only owns list navigation — handling Escape here as well would close the
    // palette twice and fire `onClose` twice.
    search.onkeydown = (event) => {
      const kev = event as KeyboardEvent;
      const input = (kev.currentTarget ?? kev.target) as HTMLElement;
      const liveList = input.closest(PALETTE_PANEL_SELECTOR)
        ?.querySelector(".rui-command-palette-list") as HTMLElement | null;
      const rows = liveList
        ? Array.from(liveList.querySelectorAll<HTMLElement>(".rui-command-palette-item"))
        : [];
      if (rows.length === 0) return;
      const current = Math.max(0, rows.findIndex((r) => r.getAttribute("data-active") === "true"));
      if (kev.key === "ArrowDown") { kev.preventDefault(); setActive(input, rows, current + 1); return; }
      if (kev.key === "ArrowUp") { kev.preventDefault(); setActive(input, rows, current - 1); return; }
      if (kev.key === "Home") { kev.preventDefault(); setActive(input, rows, 0); return; }
      if (kev.key === "End") { kev.preventDefault(); setActive(input, rows, rows.length - 1); return; }
      if (kev.key === "Enter") {
        kev.preventDefault();
        rows[current]?.click();
      }
    };
    host.onkeydown = dialogKeydownHandler(PALETTE_PANEL_SELECTOR, (origin) => closePalette(origin));

    // Outside-click / Escape listeners and the top-layer promotion both need a
    // MOUNTED node: installing them during render attached them to the detached
    // fragment (so the listeners never saw a page click) and leaked a dead
    // registration per re-render. `shell.isConnected` is the discriminator —
    // morph appends the freshly rendered panel when the palette opens and
    // discards it on a re-render where the live panel is kept.
    deferToPaint(() => {
      if (!shell.isConnected) return;
      const liveHost = shell.closest(".rui-command-palette") as HTMLElement | null;
      if (!liveHost || liveHost.getAttribute("data-open") !== "true") return;
      promoteOverlay(liveHost);
      const handle = installDismissListeners({
        liveRoot: shell,
        key: "command-palette",
        onDismiss: () => closePalette(shell),
      });
      helpers.registerDisposer(() => {
        handle.dispose();
        demoteOverlay(liveHost);
      }, "rui-command-palette");
    });
    return host;
  },
};

/**
 * `FilterPill` is the *toggleable* filter control — a pill you click to switch
 * a filter on and off, reflecting state via `aria-pressed` and `data-active`.
 * Complements `FilterChips`, which shows filters that are ALREADY applied and
 * can be individually removed (each chip carries an ✕). Use `FilterPill` for
 * the filter bar itself, `FilterChips` for the applied-filter summary.
 */
export const FilterPill: ComponentSpec = {
  name: "FilterPill",
  description:
    "Toggleable filter pill — click to switch a filter on/off. Reflects " +
    "state through `active` (and `aria-pressed` for assistive tech), with an " +
    "optional leading `icon` and trailing `count`. Use for filter bars; use " +
    "`FilterChips` to show already-applied filters that can be removed.",
  props: [
    { name: "label", type: "string", positional: true },
    { name: "active", type: "boolean", optional: true, aliases: ["selected", "pressed"] },
    { name: "count", type: "number", optional: true, description: "Optional trailing match count" },
    { name: "icon", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onToggle", type: "callable", optional: true, aliases: ["onClick", "action"], description: "Receives the next active state" },
  ],
  render: (_node, props, helpers) => {
    const active = asBoolean(props.active);
    const disabled = asBoolean(props.disabled);
    const root = el("button", {
      type: "button",
      class: "rui-filter-pill",
      "data-active": active ? "true" : "false",
      "aria-pressed": active ? "true" : "false",
      disabled: disabled ? true : null,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-filter-pill-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-filter-pill-label" }, [asString(props.label)]));
    if (props.count !== null && props.count !== undefined && asString(props.count) !== "") {
      root.append(el("span", { class: "rui-filter-pill-count" }, [asString(asNumber(props.count, 0))]));
    }
    if (!disabled) root.onclick = () => helpers.invoke(props.onToggle, !active);
    return root;
  },
};

export const FilterChips: ComponentSpec = {
  name: "FilterChips",
  description:
    "Removable filter chips with an optional clear-all control. Set `max` to collapse the tail into a " +
    "\"+N\" chip, and `disabled` to freeze the row while a filtered query is in flight.",
  props: [
    { name: "chips", type: "any[]", description: "Array of strings or {label, value} objects" },
    { name: "onRemove", type: "callable", optional: true, description: "Receives the removed chip value as an argument" },
    { name: "onClear", type: "callable", optional: true },
    { name: "clearLabel", type: "string", optional: true, description: "Text of the clear-all control (default \"Clear all\")" },
    { name: "max", type: "number", optional: true, description: "Chips shown before the rest collapse into a \"+N\" chip" },
    { name: "disabled", type: "boolean", optional: true, description: "Block removal while a request is in flight" },
  ],
  render: (_node, props, helpers) => {
    const chips = readChipList(props.chips);
    const disabled = asBoolean(props.disabled);
    const max = props.max != null ? Math.max(1, Math.floor(asNumber(props.max, 0))) : null;
    const shown = max != null ? chips.slice(0, max) : chips;
    const overflow = chips.length - shown.length;
    const root = el("div", { class: "rui-filter-chips", "data-disabled": disabled ? "true" : null });
    const row = el("div", { class: "rui-filter-chips-row" });
    // Removing a chip destroys the focused button; without an announcement a
    // screen-reader user gets no confirmation that anything happened.
    const status = el("div", {
      class: "rui-filter-chips-status rui-visually-hidden",
      role: "status",
      "aria-live": "polite",
    });
    for (const chip of shown) {
      const pill = el("span", { class: "rui-filter-chip", "data-value": chip.value });
      pill.append(el("span", { class: "rui-filter-chip-label" }, [chip.label]));
      const remove = el("button", {
        type: "button",
        class: "rui-filter-chip-remove",
        "aria-label": `Remove ${chip.label}`,
        disabled: disabled ? "" : null,
      });
      const xIcon = renderIcon("xmark", { className: "rui-filter-chip-remove-icon" });
      if (xIcon) remove.append(xIcon);
      if (!disabled) {
        remove.onclick = (event) => {
          const origin = (event.currentTarget ?? event.target) as HTMLElement;
          const liveRoot = origin.closest(".rui-filter-chips") as HTMLElement | null;
          const buttons = liveRoot
            ? Array.from(liveRoot.querySelectorAll<HTMLElement>(".rui-filter-chip-remove"))
            : [];
          const at = buttons.indexOf(origin);
          helpers.invoke(props.onRemove, chip.value);
          // The re-render that drops the chip removes the focused button, which
          // resets focus to <body> — a keyboard user then has to tab in from the
          // top of the page for every filter they want to clear.
          deferToPaint(() => {
            if (!liveRoot?.isConnected) return;
            const live = liveRoot.querySelector<HTMLElement>(".rui-filter-chips-status");
            if (live) live.textContent = `${chip.label} removed`;
            const next = Array.from(liveRoot.querySelectorAll<HTMLElement>(".rui-filter-chip-remove"));
            if (next.length === 0) {
              liveRoot.querySelector<HTMLElement>(".rui-filter-chips-clear")?.focus?.();
              return;
            }
            const target = next[Math.min(at < 0 ? 0 : at, next.length - 1)] ?? next[0]!;
            target.focus?.();
          });
        };
      }
      pill.append(remove);
      row.append(pill);
    }
    if (overflow > 0) {
      row.append(el("span", {
        class: "rui-filter-chip",
        "data-overflow": "true",
      }, [`+${overflow}`]));
    }
    root.append(row, status);
    if (chips.length > 0 && typeof props.onClear === "function") {
      const clear = el("button", {
        type: "button",
        class: "rui-filter-chips-clear",
        disabled: disabled ? "" : null,
      }, [asString(props.clearLabel, "Clear all")]);
      if (!disabled) clear.onclick = () => helpers.invoke(props.onClear);
      root.append(clear);
    }
    return root;
  },
};

/** Native input types a repeater field may ask for; anything else is text. */
const REPEATER_INPUT_TYPES = new Set([
  "text", "number", "email", "tel", "url", "password", "search", "color",
  "date", "time", "datetime-local", "month", "week",
]);

/** `items` is the first declared prop, so `FieldRepeater($rows, …)` binds here. */
const REPEATER_ITEMS_ARG = 0;

export const FieldRepeater: ComponentSpec = {
  name: "FieldRepeater",
  description:
    "Dynamic list of field groups (invoice lines, recipients, key/value pairs). Pass `items` as row objects " +
    "and `fields` as `{name, label, type?, options?, placeholder?}` definitions — `type` accepts the native " +
    "input types plus `checkbox`, `textarea` and `select` (with `options`). Bind `items` to a `$variable` " +
    "for two-way capture, or read edits from `onChange(index, field, value, rows)`.",
  props: [
    { name: "items", type: "any[]" },
    { name: "fields", type: "any[]" },
    { name: "onAdd", type: "callable", optional: true },
    { name: "onRemove", type: "callable", optional: true, description: "Receives the removed row's 0-indexed position" },
    { name: "addLabel", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "Receives `(index, fieldName, value, rows)` on every edit" },
    { name: "removeLabel", type: "string", optional: true, description: "Text of the per-row remove control (default \"Remove\")" },
    { name: "min", type: "number", optional: true, description: "Rows that can never be removed (default 0)" },
    { name: "max", type: "number", optional: true, description: "Maximum rows — \"Add row\" is disabled at the cap" },
  ],
  render: (node, props, helpers) => {
    const rows = readPlainObjects(props.items);
    const fields = readFields(props.fields);
    const itemsRef = node.argMeta?.[REPEATER_ITEMS_ARG]?.stateRef;
    const minRows = Math.max(0, Math.floor(asNumber(props.min, 0)));
    const maxRows = props.max != null ? Math.max(1, Math.floor(asNumber(props.max, 1))) : Infinity;
    const removeText = asString(props.removeLabel, "Remove");
    const root = el("div", { class: "rui-field-repeater" });

    /**
     * Write one cell back. The row index comes from the LIVE card's
     * `data-index`, not the render-time loop variable, so a handler morph
     * copied onto a kept node still edits the row the user is looking at.
     */
    const commitCell = (origin: HTMLElement, fieldName: string, value: unknown): void => {
      const card = origin.closest(".rui-field-repeater-row") as HTMLElement | null;
      const parsed = Number(card?.getAttribute("data-index"));
      const index = Number.isFinite(parsed) ? parsed : -1;
      if (index < 0) return;
      const current = readPlainObjects(props.items);
      const next = current.map((r, i) => (i === index ? { ...r, [fieldName]: value } : r));
      if (itemsRef) helpers.setState(itemsRef, next);
      helpers.invoke(props.onChange, index, fieldName, value, next);
    };

    const buildControl = (field: FieldDef, row: Record<string, unknown>, index: number): HTMLElement => {
      const name = `${field.name}-${index}`;
      const cell = row[field.name];
      if (field.type === "textarea") {
        const area = el("textarea", {
          class: "rui-textarea",
          name,
          rows: "2",
          placeholder: field.placeholder ?? null,
        }) as HTMLTextAreaElement;
        area.value = asString(cell);
        area.oninput = (event) => {
          const live = (event.currentTarget ?? event.target) as HTMLTextAreaElement;
          commitCell(live, field.name, live.value);
        };
        return area;
      }
      if (field.type === "select") {
        const select = el("select", { class: "rui-select", name }) as HTMLSelectElement;
        for (const opt of readChipList(field.options)) {
          select.append(el("option", { value: opt.value }, [opt.label]));
        }
        select.value = asString(cell);
        select.onchange = (event) => {
          const live = (event.currentTarget ?? event.target) as HTMLSelectElement;
          commitCell(live, field.name, live.value);
        };
        return select;
      }
      if (field.type === "checkbox") {
        const box = el("input", {
          class: "rui-checkbox-input",
          type: "checkbox",
          name,
          // Only assert `checked` when the row actually carries a truthy value —
          // an always-present attribute is what morph reads as a deliberate
          // assertion and would fight the user's own clicks.
          checked: asBoolean(cell) ? "" : null,
        }) as HTMLInputElement;
        box.onchange = (event) => {
          const live = (event.currentTarget ?? event.target) as HTMLInputElement;
          commitCell(live, field.name, live.checked);
        };
        return box;
      }
      const input = el("input", {
        class: "rui-input",
        type: REPEATER_INPUT_TYPES.has(field.type) ? field.type : "text",
        name,
        placeholder: field.placeholder ?? null,
        // `valueAttr`, not `asString`: a row that simply has no value for this
        // field must not assert `value=""`, or morph wipes what the user typed
        // on the next unrelated re-render.
        value: valueAttr(cell),
      }) as HTMLInputElement;
      input.oninput = (event) => {
        const live = (event.currentTarget ?? event.target) as HTMLInputElement;
        commitCell(live, field.name, live.value);
      };
      return input;
    };

    rows.forEach((row, index) => {
      const card = el("div", { class: "rui-field-repeater-row", "data-index": String(index) });
      const grid = el("div", { class: "rui-field-repeater-grid" });
      for (const field of fields) {
        const wrap = el("label", { class: "rui-field-repeater-field" });
        wrap.append(el("span", { class: "rui-field-repeater-label" }, [field.label]));
        wrap.append(buildControl(field, row, index));
        grid.append(wrap);
      }
      card.append(grid);
      if (typeof props.onRemove === "function" && rows.length > minRows) {
        // Every button used to share the name "Remove row", so an AT rotor
        // listed five identical entries for five line items.
        const hint = asString(row[fields[0]?.name ?? ""]).trim();
        const remove = el("button", {
          type: "button",
          class: "rui-field-repeater-remove",
          "aria-label": hint ? `${removeText} ${index + 1}: ${hint}` : `${removeText} ${index + 1}`,
        }, [removeText]);
        remove.onclick = (event) => {
          const origin = (event.currentTarget ?? event.target) as HTMLElement;
          const card2 = origin.closest(".rui-field-repeater-row") as HTMLElement | null;
          const parsed = Number(card2?.getAttribute("data-index"));
          helpers.invoke(props.onRemove, Number.isFinite(parsed) ? parsed : index);
        };
        card.append(remove);
      }
      root.append(card);
    });
    if (typeof props.onAdd === "function") {
      const atCap = rows.length >= maxRows;
      const add = el("button", {
        type: "button",
        class: "rui-field-repeater-add rui-button",
        "data-variant": "secondary",
        disabled: atCap ? "" : null,
      }, [asString(props.addLabel, "Add row")]);
      if (!atCap) add.onclick = () => helpers.invoke(props.onAdd);
      root.append(add);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Tier 2
 * ----------------------------------------------------------------------- */

/** Render an `empty` / placeholder prop that may be a node or a plain string. */
function renderPlaceholder(
  value: unknown,
  className: string,
  helpers: { renderNode: (node: unknown) => Node },
): HTMLElement {
  const box = el("div", { class: className });
  if (value && typeof value === "object") box.append(helpers.renderNode(value));
  else box.append(document.createTextNode(asString(value)));
  return box;
}

export const VirtualList: ComponentSpec = {
  name: "VirtualList",
  description:
    "Windowed vertical list for large datasets. Pass pre-rendered nodes as `items` " +
    "or plain row objects plus a `renderItem` lambda (`row => Node`) invoked per row. " +
    "Every row is boxed at `itemHeight` so the virtualization maths matches the real layout.",
  props: [
    { name: "items", type: "any[]" },
    { name: "itemHeight", type: "number", optional: true, description: "Fixed row height in px (default 40)" },
    { name: "renderItem", type: "callable", optional: true, description: "Lambda `(row, index) => Node` rendered per data row" },
    { name: "height", type: "number", optional: true, description: "Viewport height in px (default 12 rows)" },
    { name: "onItemClick", type: "callable", optional: true, description: "Receives the clicked row and its index" },
    { name: "empty", type: "any", optional: true, description: "Node or text shown when `items` is empty" },
    { name: "loading", type: "boolean", optional: true, description: "Show a pending state instead of the empty state" },
  ],
  render: (_node, props, helpers) => {
    const itemHeight = Math.max(24, asNumber(props.itemHeight, 40));
    const rawItems = asArray<unknown>(props.items);
    const total = rawItems.length;
    const loading = asBoolean(props.loading);
    const clickable = typeof props.onItemClick === "function";
    // The live scroll offset is browser-owned state morph never touches, so a
    // window rebuilt at 0 leaves the user parked in front of an empty box.
    const scrollSlot = helpers.useInstanceState<number>("scrollTop", 0);
    const viewport = el("div", { class: "rui-virtual-list" });

    if (total === 0 && (loading || props.empty !== undefined)) {
      const box = loading
        ? el("div", { class: "rui-virtual-list-empty", role: "status", "aria-busy": "true" })
        : renderPlaceholder(props.empty, "rui-virtual-list-empty", helpers);
      if (loading) {
        const spin = renderIcon("spinner", { className: "rui-virtual-list-spinner" });
        if (spin) box.append(spin);
      }
      viewport.append(box);
      return viewport;
    }

    const scrollEl = el("div", { class: "rui-virtual-list-scroller" });
    const spacer = el("div", { class: "rui-virtual-list-spacer" });
    const windowEl = el("div", { class: "rui-virtual-list-window" });

    spacer.style.height = `${total * itemHeight}px`;
    spacer.style.position = "relative";
    windowEl.style.position = "absolute";
    windowEl.style.top = "0";
    windowEl.style.left = "0";
    windowEl.style.right = "0";
    const viewportHeight = props.height != null
      ? Math.max(itemHeight, asNumber(props.height, 480))
      : Math.min(Math.max(total, 1), 12) * itemHeight;
    scrollEl.style.maxHeight = `${viewportHeight}px`;
    scrollEl.style.overflow = "auto";

    const renderRow = (entry: unknown, index: number): HTMLElement => {
      // Every row is boxed at `itemHeight` — node rows used to be appended raw,
      // so a 90px Card sat in a 40px slot and the spacer, the translate and the
      // scrollbar all disagreed with the painted layout.
      const row = el("div", {
        class: "rui-virtual-list-item",
        style: `height:${itemHeight}px`,
        "data-index": String(index),
        role: clickable ? "button" : null,
        tabindex: clickable ? "0" : null,
      });
      if (typeof props.renderItem === "function") {
        let produced: unknown;
        try {
          produced = (props.renderItem as (row: unknown, i: number) => unknown)(entry, index);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[aktion] VirtualList renderItem threw", err);
          produced = null;
        }
        if (produced != null) row.append(helpers.renderNode(produced));
      } else if (entry && typeof entry === "object") {
        row.append(helpers.renderNode(entry));
      } else {
        row.append(el("span", {}, [asString(entry)]));
      }
      if (clickable) {
        const fire = (origin: HTMLElement): void => {
          const at = Number(origin.getAttribute("data-index"));
          const idx = Number.isFinite(at) ? at : index;
          helpers.invoke(props.onItemClick, rawItems[idx], idx);
        };
        row.onclick = (event) => fire(event.currentTarget as HTMLElement);
        row.onkeydown = (event) => {
          const kev = event as KeyboardEvent;
          if (kev.key !== "Enter" && kev.key !== " ") return;
          kev.preventDefault();
          fire((kev.currentTarget ?? kev.target) as HTMLElement);
        };
      }
      return row;
    };

    let lastStart = -1;
    const renderSlice = (winNode: HTMLElement, scroller: HTMLElement, force = false): void => {
      const viewHeight = scroller.clientHeight || viewportHeight;
      const visible = Math.ceil(viewHeight / itemHeight) + 2;
      const scrollTop = Number.isFinite(scroller.scrollTop) ? scroller.scrollTop : 0;
      const start = Math.max(0, Math.floor(scrollTop / itemHeight));
      // Momentum scrolling fires dozens of events per second; rebuilding ~14
      // subtrees for each one drops frames on exactly the datasets
      // virtualization exists to smooth out.
      if (!force && start === lastStart) return;
      lastStart = start;
      const end = Math.min(total, start + visible);
      winNode.replaceChildren();
      winNode.style.transform = `translateY(${start * itemHeight}px)`;
      for (let i = start; i < end; i += 1) winNode.append(renderRow(rawItems[i], i));
    };

    // Read scrollTop + window from the LIVE event target so virtualization keeps
    // working after a morph re-render swaps the captured nodes (the handler is
    // copied onto the on-page scroller, and `currentTarget` is that real node).
    scrollEl.onscroll = (ev) => {
      const liveScroller = (ev?.currentTarget ?? ev?.target ?? scrollEl) as HTMLElement;
      const liveWindow = liveScroller.querySelector<HTMLElement>(".rui-virtual-list-window");
      scrollSlot.set(Number.isFinite(liveScroller.scrollTop) ? liveScroller.scrollTop : 0);
      if (liveWindow) renderSlice(liveWindow, liveScroller);
    };
    // Seed from the persisted offset, not the literal 0.
    const seeded = scrollSlot.get();
    if (seeded > 0) {
      const visible = Math.ceil(viewportHeight / itemHeight) + 2;
      const start = Math.max(0, Math.floor(seeded / itemHeight));
      lastStart = start;
      windowEl.style.transform = `translateY(${start * itemHeight}px)`;
      for (let i = start; i < Math.min(total, start + visible); i += 1) {
        windowEl.append(renderRow(rawItems[i], i));
      }
    } else {
      renderSlice(windowEl, scrollEl, true);
    }
    scrollEl.append(spacer, windowEl);
    viewport.append(scrollEl);

    deferToPaint(() => {
      // Only the render whose nodes were actually mounted owns the observer;
      // morph discards the rest, and re-registering under the same disposer key
      // from a discarded snapshot would tear down the working one.
      if (!scrollEl.isConnected) return;
      if (seeded > 0 && scrollEl.scrollTop === 0) scrollEl.scrollTop = seeded;
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => renderSlice(windowEl, scrollEl, true));
      try {
        ro.observe(scrollEl);
      } catch {
        return;
      }
      helpers.registerDisposer(() => ro.disconnect(), "rui-virtual-list-resize");
    });
    return viewport;
  },
};

export const VirtualGrid: ComponentSpec = {
  name: "VirtualGrid",
  description:
    "Windowed 2-D grid for very large collections (galleries, tiles, " +
    "thumbnails). Only the visible rows of cells are mounted. Pass " +
    "pre-rendered nodes (or plain values) as `items`; set `columns`, " +
    "`itemHeight`, and `gap`. Prefer `minItemWidth` over a fixed `columns` " +
    "count so the grid reflows on narrow screens (XI.3).",
  props: [
    { name: "items", type: "any[]" },
    { name: "columns", type: "number", optional: true, description: "Cells per row (default 4)" },
    { name: "itemHeight", type: "number", optional: true, description: "Row height in px (default 120)" },
    { name: "gap", type: "number", optional: true, description: "Gap between cells in px (default 8)" },
    { name: "height", type: "number", optional: true, description: "Viewport height in px (default 480)" },
    { name: "minItemWidth", type: "number", optional: true, description: "Minimum cell width in px — the grid auto-fills and reflows instead of forcing `columns`" },
    { name: "onItemClick", type: "callable", optional: true, description: "Receives the clicked item and its index" },
    { name: "empty", type: "any", optional: true, description: "Node or text shown when `items` is empty" },
    { name: "loading", type: "boolean", optional: true, description: "Show a pending state instead of the empty state" },
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(12, Math.floor(asNumber(props.columns, 4))));
    const itemHeight = Math.max(24, asNumber(props.itemHeight, 120));
    const gap = Math.max(0, asNumber(props.gap, 8));
    const height = Math.max(120, asNumber(props.height, 480));
    const minItemWidth = props.minItemWidth != null
      ? Math.max(40, Math.floor(asNumber(props.minItemWidth, 160)))
      : null;
    const items = asArray<unknown>(props.items);
    const total = items.length;
    const rowStride = itemHeight + gap;
    const loading = asBoolean(props.loading);
    const clickable = typeof props.onItemClick === "function";
    const scrollSlot = helpers.useInstanceState<number>("scrollTop", 0);

    const viewport = el("div", { class: "rui-virtual-grid" });
    if (total === 0 && (loading || props.empty !== undefined)) {
      const box = loading
        ? el("div", { class: "rui-virtual-grid-empty", role: "status", "aria-busy": "true" })
        : renderPlaceholder(props.empty, "rui-virtual-grid-empty", helpers);
      if (loading) {
        const spin = renderIcon("spinner", { className: "rui-virtual-grid-spinner" });
        if (spin) box.append(spin);
      }
      viewport.append(box);
      return viewport;
    }

    const scrollEl = el("div", { class: "rui-virtual-grid-scroller", style: `max-height:${height}px;overflow:auto` });
    const spacer = el("div", { class: "rui-virtual-grid-spacer", style: "position:relative" });
    // `auto-fill` + `minmax` keeps a 6-column desktop grid from crushing itself
    // into 55px cells on a phone; the fixed-`columns` template stays available
    // for authors who really want an exact count.
    const template = minItemWidth != null
      ? `repeat(auto-fill,minmax(min(${minItemWidth}px,100%),1fr))`
      : `repeat(${columns},minmax(0,1fr))`;
    const windowEl = el("div", {
      class: "rui-virtual-grid-window",
      style: `position:absolute;left:0;right:0;top:0;display:grid;grid-template-columns:${template};gap:${gap}px`,
    });

    /** The column count the browser actually resolved (auto-fill reflows). */
    const measureColumns = (winNode: HTMLElement): number => {
      if (minItemWidth == null || typeof getComputedStyle !== "function") return columns;
      const tracks = getComputedStyle(winNode).gridTemplateColumns;
      if (!tracks || tracks === "none") return columns;
      const count = tracks.trim().split(/\s+/).filter(Boolean).length;
      return count > 0 ? count : columns;
    };

    const renderCell = (entry: unknown, index: number): HTMLElement => {
      const cell = el("div", {
        class: "rui-virtual-grid-cell",
        style: `height:${itemHeight}px`,
        "data-index": String(index),
        role: clickable ? "button" : null,
        tabindex: clickable ? "0" : null,
      });
      if (entry && typeof entry === "object") cell.append(helpers.renderNode(entry));
      else cell.append(el("span", {}, [asString(entry)]));
      if (clickable) {
        const fire = (origin: HTMLElement): void => {
          const at = Number(origin.getAttribute("data-index"));
          const idx = Number.isFinite(at) ? at : index;
          helpers.invoke(props.onItemClick, items[idx], idx);
        };
        cell.onclick = (event) => fire(event.currentTarget as HTMLElement);
        cell.onkeydown = (event) => {
          const kev = event as KeyboardEvent;
          if (kev.key !== "Enter" && kev.key !== " ") return;
          kev.preventDefault();
          fire((kev.currentTarget ?? kev.target) as HTMLElement);
        };
      }
      return cell;
    };

    let lastFirstRow = -1;
    const fillWindow = (
      winNode: HTMLElement,
      scroller: HTMLElement | null,
      scrollTop: number,
      force = false,
    ): void => {
      const cols = measureColumns(winNode);
      const rowCount = Math.ceil(total / cols);
      // `rowCount` rows have only `rowCount - 1` inter-row gaps — reserving one
      // after the last row left permanent dead space at the bottom.
      const spacerHeight = Math.max(0, rowCount * rowStride - gap);
      const liveSpacer = scroller?.querySelector<HTMLElement>(".rui-virtual-grid-spacer") ?? spacer;
      liveSpacer.style.height = `${spacerHeight}px`;
      const offset = Number.isFinite(scrollTop) ? scrollTop : 0;
      const firstRow = Math.max(0, Math.floor(offset / rowStride) - 1);
      if (!force && firstRow === lastFirstRow) return;
      lastFirstRow = firstRow;
      const visibleRows = Math.ceil(height / rowStride) + 2;
      const lastRow = Math.min(rowCount, firstRow + visibleRows);
      winNode.replaceChildren();
      winNode.style.transform = `translateY(${firstRow * rowStride}px)`;
      for (let r = firstRow; r < lastRow; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const idx = r * cols + c;
          if (idx >= total) break;
          winNode.append(renderCell(items[idx], idx));
        }
      }
    };

    // Read scrollTop + window from the LIVE event target so virtualization keeps
    // working after a morph re-render swaps the captured nodes (the handler is
    // copied onto the on-page scroller, and `currentTarget` is that real node).
    scrollEl.onscroll = (ev) => {
      const liveScroller = (ev?.currentTarget ?? ev?.target ?? scrollEl) as HTMLElement;
      const liveWindow = liveScroller.querySelector<HTMLElement>(".rui-virtual-grid-window");
      scrollSlot.set(Number.isFinite(liveScroller.scrollTop) ? liveScroller.scrollTop : 0);
      if (liveWindow) fillWindow(liveWindow, liveScroller, liveScroller.scrollTop);
    };
    fillWindow(windowEl, null, scrollSlot.get(), true);
    scrollEl.append(spacer, windowEl);
    viewport.append(scrollEl);

    deferToPaint(() => {
      if (!scrollEl.isConnected) return;
      const seeded = scrollSlot.get();
      if (seeded > 0 && scrollEl.scrollTop === 0) scrollEl.scrollTop = seeded;
      // A reflow changes the resolved column count, which changes the row maths.
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => fillWindow(windowEl, scrollEl, scrollEl.scrollTop, true));
      try {
        ro.observe(scrollEl);
      } catch {
        return;
      }
      helpers.registerDisposer(() => ro.disconnect(), "rui-virtual-grid-resize");
    });
    return viewport;
  },
};

/* ----------------------------------------------------------------------- *
 * QueryBuilder
 * ----------------------------------------------------------------------- */

/** Human-readable option text — users should never be shown "gt"/"lt". */
const OPERATOR_LABELS: Record<string, string> = {
  equals: "equals",
  notEquals: "does not equal",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  before: "before",
  after: "after",
  between: "between",
  in: "is one of",
  notIn: "is not one of",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  isTrue: "is true",
  isFalse: "is false",
};

const OPERATORS_BY_TYPE: Record<string, readonly string[]> = {
  text: ["equals", "notEquals", "contains", "notContains", "startsWith", "endsWith", "isEmpty", "isNotEmpty"],
  number: ["equals", "notEquals", "gt", "gte", "lt", "lte", "between"],
  date: ["equals", "before", "after", "between"],
  "datetime-local": ["equals", "before", "after", "between"],
  boolean: ["isTrue", "isFalse"],
  enum: ["in", "notIn", "equals", "notEquals"],
  select: ["in", "notIn", "equals", "notEquals"],
};

interface OperatorDef { value: string; label: string; type?: string }

function readOperators(raw: unknown): OperatorDef[] {
  return asArray<unknown>(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry as { value?: unknown; op?: unknown; label?: unknown; type?: unknown };
      const value = asString(obj.value ?? obj.op ?? obj.label);
      return {
        value,
        label: asString(obj.label, OPERATOR_LABELS[value] ?? value),
        type: asString(obj.type) || undefined,
      };
    }
    const value = asString(entry);
    return { value, label: OPERATOR_LABELS[value] ?? value };
  }).filter((o) => o.value !== "");
}

const QUERY_VALUE_TYPES = new Set(["number", "date", "time", "datetime-local", "month", "week"]);
/** `value` is the second declared prop, so `{ value: $rules }` binds here. */
const QUERY_VALUE_ARG = 1;

export const QueryBuilder: ComponentSpec = {
  name: "QueryBuilder",
  description:
    "Visual AND/OR filter builder. Pass `fields` as `{name, label, type?, operators?}` and bind `value` to a " +
    "rule array of `{field, op, value, combinator?}`. Every rule after the first carries an AND/OR " +
    "combinator; operators default to a sensible set per field `type` and can be overridden globally " +
    "(`operators`) or per field.",
  props: [
    { name: "fields", type: "any[]" },
    { name: "value", type: "any[]", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "Receives the next rule array" },
    { name: "operators", type: "any[]", optional: true, description: "Operator tokens or `{value, label, type?}` objects — `type` scopes them to matching fields" },
    { name: "disabled", type: "boolean", optional: true, description: "Freeze the builder while a query is in flight" },
    { name: "maxRules", type: "number", optional: true, description: "Maximum number of rules (default unlimited)" },
  ],
  render: (node, props, helpers) => {
    const fields = readFields(props.fields);
    const disabled = asBoolean(props.disabled);
    const maxRules = props.maxRules != null ? Math.max(1, Math.floor(asNumber(props.maxRules, 1))) : Infinity;
    const globalOperators = readOperators(props.operators);
    const stateRef = node.argMeta?.[QUERY_VALUE_ARG]?.stateRef;
    const incoming = readPlainObjects(props.value);
    // The working list lives in instance state, not just in the DOM: with a
    // derived `value` (no `$state` path) there is nothing to re-render from, so
    // an imperatively painted row was reconciled away by the next morph pass
    // while `onChange` had already reported it.
    const seedSlot = helpers.useInstanceState<string>("seed", "");
    const rulesSlot = helpers.useInstanceState<Record<string, unknown>[]>("rules", incoming);
    const seed = jsonPreview(incoming);
    if (seedSlot.get() !== seed) {
      seedSlot.set(seed);
      rulesSlot.set(incoming);
    }
    const root = el("div", { class: "rui-query-builder", "data-disabled": disabled ? "true" : null });

    const operatorsFor = (field: FieldDef | undefined): OperatorDef[] => {
      const own = readOperators(field?.operators);
      if (own.length > 0) return own;
      if (globalOperators.length > 0) {
        const scoped = globalOperators.filter((o) => !o.type || o.type === field?.type);
        if (scoped.length > 0) return scoped;
      }
      const tokens = OPERATORS_BY_TYPE[field?.type ?? "text"] ?? OPERATORS_BY_TYPE.text!;
      return tokens.map((t) => ({ value: t, label: OPERATOR_LABELS[t] ?? t }));
    };

    const commit = (origin: Element, next: Record<string, unknown>[]): void => {
      rulesSlot.set(next);
      seedSlot.set(jsonPreview(next));
      if (stateRef) helpers.setState(stateRef, next);
      else helpers.invoke(props.onChange, next);
      const liveRoot = origin.closest(".rui-query-builder") as HTMLElement | null;
      if (liveRoot) paint(liveRoot, next);
    };

    const paint = (container: HTMLElement, current: Record<string, unknown>[]): void => {
      container.replaceChildren();
      current.forEach((rule, index) => {
        const row = el("div", { class: "rui-query-builder-row", "data-index": String(index) });
        const position = index + 1;

        if (index > 0) {
          // The AND/OR combinator the description (and the generated prompt)
          // promised — previously the UI was flat and implicitly AND.
          const combinator = el("select", {
            class: "rui-select rui-query-builder-combinator",
            "aria-label": `Combine rule ${position} with`,
            disabled: disabled ? "" : null,
          }) as HTMLSelectElement;
          combinator.append(el("option", { value: "and" }, ["AND"]));
          combinator.append(el("option", { value: "or" }, ["OR"]));
          combinator.value = asString(rule.combinator, "and").toLowerCase() === "or" ? "or" : "and";
          if (!disabled) {
            combinator.onchange = (event) => {
              const live = (event.currentTarget ?? event.target) as HTMLSelectElement;
              const next = current.map((r, i) => (i === index ? { ...r, combinator: live.value } : r));
              commit(live, next);
            };
          }
          row.append(combinator);
        }

        const activeField = fields.find((f) => f.name === asString(rule.field)) ?? fields[0];
        const fieldSelect = el("select", {
          class: "rui-select rui-query-builder-field",
          "aria-label": `Rule ${position} field`,
          disabled: disabled ? "" : null,
        }) as HTMLSelectElement;
        for (const f of fields) fieldSelect.append(el("option", { value: f.name }, [f.label]));
        fieldSelect.value = asString(rule.field ?? activeField?.name);

        const ops = operatorsFor(activeField);
        const opSelect = el("select", {
          class: "rui-select rui-query-builder-op",
          "aria-label": `Rule ${position} operator`,
          disabled: disabled ? "" : null,
        }, []) as HTMLSelectElement;
        for (const op of ops) opSelect.append(el("option", { value: op.value }, [op.label]));
        const currentOp = asString(rule.op, ops[0]?.value ?? "equals");
        opSelect.value = ops.some((o) => o.value === currentOp) ? currentOp : (ops[0]?.value ?? "equals");

        const valueInput = el("input", {
          class: "rui-input rui-query-builder-value",
          type: QUERY_VALUE_TYPES.has(activeField?.type ?? "text") ? activeField!.type : "text",
          "aria-label": `Rule ${position} value`,
          disabled: disabled ? "" : null,
          value: valueAttr(rule.value),
        }) as HTMLInputElement;

        if (!disabled) {
          // Every control commits: without these the component could only ever
          // emit the default rule, so the query it rendered and the query it
          // reported were unrelated.
          fieldSelect.onchange = (event) => {
            const live = (event.currentTarget ?? event.target) as HTMLSelectElement;
            const nextField = fields.find((f) => f.name === live.value);
            const allowed = operatorsFor(nextField);
            const next = current.map((r, i) => (i === index
              ? {
                ...r,
                field: live.value,
                op: allowed.some((o) => o.value === asString(r.op)) ? r.op : (allowed[0]?.value ?? "equals"),
              }
              : r));
            commit(live, next);
          };
          opSelect.onchange = (event) => {
            const live = (event.currentTarget ?? event.target) as HTMLSelectElement;
            const next = current.map((r, i) => (i === index ? { ...r, op: live.value } : r));
            commit(live, next);
          };
          valueInput.oninput = (event) => {
            const live = (event.currentTarget ?? event.target) as HTMLInputElement;
            const next = current.map((r, i) => (i === index ? { ...r, value: live.value } : r));
            commit(live, next);
          };
        }

        row.append(fieldSelect, opSelect, valueInput);
        const remove = el("button", {
          type: "button",
          class: "rui-query-builder-remove",
          "aria-label": `Remove rule ${position}`,
          disabled: disabled ? "" : null,
        }, ["×"]);
        if (!disabled) {
          remove.onclick = (event) => {
            const live = (event.currentTarget ?? event.target) as HTMLElement;
            const next = current
              .filter((_, i) => i !== index)
              .map((r, i) => (i === 0 ? { ...r, combinator: undefined } : r));
            commit(live, next);
          };
        }
        row.append(remove);
        container.append(row);
      });

      const atCap = current.length >= maxRules;
      const add = el("button", {
        type: "button",
        class: "rui-query-builder-add",
        disabled: disabled || atCap ? "" : null,
      }, ["Add rule"]);
      if (!disabled && !atCap) {
        add.onclick = (event) => {
          const live = (event.currentTarget ?? event.target) as HTMLElement;
          const first = fields[0];
          const next = [...current, {
            field: first?.name ?? "",
            op: operatorsFor(first)[0]?.value ?? "equals",
            value: "",
            ...(current.length > 0 ? { combinator: "and" } : {}),
          }];
          commit(live, next);
        };
      }
      container.append(add);
    };

    // No phantom seed rule: a rendered-but-uncommitted row made the visible
    // count one ahead of the array, so "Add rule" produced two and ✕ appeared
    // to do nothing. An empty value renders just the "Add rule" affordance.
    paint(root, rulesSlot.get());
    return root;
  },
};

export const DiffViewer: ComponentSpec = {
  name: "DiffViewer",
  description:
    "Side-by-side or unified diff of two text blobs, aligned by a line-level LCS diff so an inserted line " +
    "does not mark the rest of the file as changed. Set `leftTitle`/`rightTitle` to label the columns, " +
    "`lineNumbers` to number them, and `contextLines` to collapse unchanged runs.",
  props: [
    { name: "left", type: "string" },
    { name: "right", type: "string" },
    { name: "mode", type: "string", optional: true, enum: ["split", "unified"], description: "Default split" },
    { name: "leftTitle", type: "string", optional: true, description: "Header for the left column (e.g. \"Before\")" },
    { name: "rightTitle", type: "string", optional: true, description: "Header for the right column (e.g. \"After\")" },
    { name: "lineNumbers", type: "boolean", optional: true, description: "Show original line numbers" },
    { name: "contextLines", type: "number", optional: true, description: "Unchanged lines kept around each change (others collapse)" },
    { name: "maxHeight", type: "number", optional: true, description: "Scroller height in px (default 320)" },
  ],
  render: (_node, props) => {
    const left = asString(props.left);
    const right = asString(props.right);
    const mode = asString(props.mode, "split");
    const lineNumbers = asBoolean(props.lineNumbers);
    const context = props.contextLines != null
      ? Math.max(0, Math.floor(asNumber(props.contextLines, 3)))
      : -1;
    // Always emitted, so the documented 320px default survives the move to a
    // single split-view scroll container (the old per-pane cap lived only in
    // `.rui-diff-viewer-pane`, which the paired-cell layout no longer uses).
    const maxHeight = Math.max(40, Math.floor(asNumber(props.maxHeight, 320)));
    const rows = collapseContext(diffLines(left, right), context);
    const root = el("div", { class: "rui-diff-viewer", "data-mode": mode });
    const heightStyle = `max-height:${maxHeight}px;overflow:auto`;

    const numberCell = (value: number | undefined): HTMLElement | null => (lineNumbers
      ? el("span", { class: "rui-diff-line-num", "aria-hidden": "true" }, [value != null ? String(value) : ""])
      : null);
    const gapLabel = (count: number | undefined): string => `⋯ ${count ?? 0} ⋯`;

    if (mode === "unified") {
      const body = el("pre", { class: "rui-diff-viewer-unified", style: heightStyle });
      for (const row of rows) {
        if (row.type === "gap") {
          body.append(el("div", { class: "rui-diff-line rui-diff-line-gap" }, [gapLabel(row.count)]));
          continue;
        }
        const line = el("div", { class: `rui-diff-line rui-diff-line-${row.type}` });
        const num = numberCell(row.type === "add" ? row.rightNo : row.leftNo);
        if (num) line.append(num);
        const marker = row.type === "add" ? "+ " : row.type === "remove" ? "- " : "  ";
        line.append(el("span", { class: "rui-diff-line-text" }, [marker + row.text]));
        body.append(line);
      }
      root.append(body);
      return root;
    }

    // Split view: ONE scroll container holding paired cells, so row N on the
    // left always sits beside row N on the right (two independently scrolling
    // `<pre>` blobs went permanently off-by-one after the first insertion) and
    // every changed line is marked instead of dumped as plain text.
    const panes = el("div", { class: "rui-diff-viewer-panes", style: heightStyle });
    const leftTitle = asString(props.leftTitle);
    const rightTitle = asString(props.rightTitle);
    if (leftTitle || rightTitle) {
      panes.append(el("div", { class: "rui-diff-viewer-title", "data-side": "left" }, [leftTitle]));
      panes.append(el("div", { class: "rui-diff-viewer-title", "data-side": "right" }, [rightTitle]));
    }
    const cell = (side: "left" | "right", row: DiffRow, filled: boolean): HTMLElement => {
      const classes = ["rui-diff-viewer-cell", "rui-diff-line"];
      if (!filled) classes.push("rui-diff-viewer-filler");
      else if (side === "left" && row.type === "remove") classes.push("rui-diff-line-remove");
      else if (side === "right" && row.type === "add") classes.push("rui-diff-line-add");
      const box = el("div", { class: classes.join(" "), "data-side": side });
      if (!filled) return box;
      const num = numberCell(side === "left" ? row.leftNo : row.rightNo);
      if (num) box.append(num);
      box.append(el("span", { class: "rui-diff-line-text" }, [row.text]));
      return box;
    };
    for (const row of rows) {
      if (row.type === "gap") {
        panes.append(el("div", {
          class: "rui-diff-line rui-diff-line-gap",
          // Inline so the collapsed marker spans both grid columns without
          // depending on a stylesheet rule.
          style: "grid-column:1/-1",
        }, [gapLabel(row.count)]));
        continue;
      }
      panes.append(cell("left", row, row.type !== "add"));
      panes.append(cell("right", row, row.type !== "remove"));
    }
    root.append(panes);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * JsonTree
 * ----------------------------------------------------------------------- */

/** Hard ceiling so deep (or hostile) payloads can never blow the stack. */
const JSON_TREE_MAX_DEPTH = 16;

export const JsonTree: ComponentSpec = {
  name: "JsonTree",
  description:
    "Expandable JSON tree viewer for objects and arrays. Arrow keys walk the tree, Enter/Space toggles a " +
    "branch. Cycles render as `[Circular]`, so a normalised store or a parent back-reference is safe to inspect.",
  props: [
    { name: "data", type: "any" },
    { name: "expanded", type: "boolean", optional: true, description: "Expand all nodes (default: first level only)" },
    { name: "expandedDepth", type: "number", optional: true, description: "Levels open by default (default 1)" },
    { name: "maxHeight", type: "number", optional: true, description: "Scroll the tree beyond this height in px" },
  ],
  render: (_node, props, helpers) => {
    const expandAll = asBoolean(props.expanded);
    const defaultDepth = props.expandedDepth != null
      ? Math.max(0, Math.floor(asNumber(props.expandedDepth, 1)))
      : (expandAll ? JSON_TREE_MAX_DEPTH : 1);
    const maxHeight = props.maxHeight != null
      ? Math.max(40, Math.floor(asNumber(props.maxHeight, 320)))
      : null;
    // Expansion state used to live only in DOM attributes, so morph reset the
    // inspector on every unrelated re-render (a polling page snapped it shut
    // every tick). Keyed by the node's path so the fresh tree is already
    // rendered in the shape the user left it.
    const openSlot = helpers.useInstanceState<Record<string, boolean>>("open", {});
    const idSlot = helpers.useInstanceState<string>("id", nextUid("rui-json"));
    const treeId = idSlot.get();

    const root = el("div", {
      class: "rui-json-tree",
      role: "tree",
      "aria-label": "JSON",
      style: maxHeight != null ? `max-height:${maxHeight}px;overflow:auto` : null,
    });

    const isOpen = (path: string, depth: number): boolean => {
      const stored = openSlot.get()[path];
      return stored === undefined ? depth < defaultDepth : stored;
    };
    const setOpen = (path: string, value: boolean): void => {
      openSlot.set({ ...openSlot.get(), [path]: value });
    };

    const entriesOf = (data: object): ReadonlyArray<readonly [string, unknown]> => (Array.isArray(data)
      ? (data as unknown[]).map((v, i) => [String(i), v] as const)
      : (Object.entries(data as Record<string, unknown>) as ReadonlyArray<readonly [string, unknown]>));

    const summaryOf = (data: object, count: number): string => (Array.isArray(data)
      ? ` Array(${count})`
      // Collapsed objects used to render a bare "Object", so an empty branch
      // looked identical to one with 40 keys.
      : ` Object(${count})`);

    /**
     * Stable per-path id for the `aria-controls` target. Derived from the path
     * rather than `depth + path.length`, which collided for any two siblings
     * whose keys were the same length (`$/ab` and `$/cd`) and pointed the row's
     * `aria-controls` at the wrong branch.
     */
    const childIds = new Map<string, string>();
    const childrenIdFor = (path: string): string => {
      let id = childIds.get(path);
      if (id === undefined) {
        id = `${treeId}-c${childIds.size}`;
        childIds.set(path, id);
      }
      return id;
    };

    const appendChildren = (
      container: HTMLElement,
      entries: ReadonlyArray<readonly [string, unknown]>,
      depth: number,
      path: string,
      ancestors: ReadonlyArray<object>,
    ): void => {
      for (const [key, value] of entries) {
        container.append(buildNode(value, key, depth + 1, `${path}/${key}`, ancestors));
      }
    };

    function buildNode(
      data: unknown,
      key: string | null,
      depth: number,
      path: string,
      ancestors: ReadonlyArray<object>,
    ): HTMLElement {
      // `role="none"` on the wrapper: an unroled div between the tree/group and
      // its `treeitem` breaks the ARIA ownership chain, so AT reported orphaned
      // tree items. Presentational, so the row is owned by the nearest role.
      const node = el("div", {
        class: "rui-json-tree-node", role: "none",
        "data-depth": String(depth), "data-path": path,
      });
      const keyPrefix = key === null ? "" : `${key}: `;
      const leafRow = (text: string): HTMLElement => {
        const row = el("div", {
          class: "rui-json-tree-row",
          role: "treeitem",
          "aria-level": String(depth + 1),
          "data-path": path,
          tabindex: "-1",
        });
        if (keyPrefix) row.append(el("span", { class: "rui-json-tree-key" }, [keyPrefix]));
        row.append(el("span", { class: "rui-json-tree-leaf" }, [text]));
        return row;
      };

      if (data === null || typeof data !== "object") {
        node.append(leafRow(jsonPreview(data)));
        return node;
      }
      // Cycle detection walks the ANCESTOR chain, not a global visited set, so
      // the same object appearing twice in a list still renders twice.
      if (ancestors.includes(data)) {
        node.append(leafRow("[Circular]"));
        return node;
      }
      if (depth >= JSON_TREE_MAX_DEPTH) {
        node.append(leafRow("…"));
        return node;
      }

      const entries = entriesOf(data);
      const open = isOpen(path, depth);
      const childrenId = childrenIdFor(path);
      const row = el("div", {
        class: "rui-json-tree-row",
        role: "treeitem",
        "aria-level": String(depth + 1),
        "aria-expanded": open ? "true" : "false",
        "aria-controls": childrenId,
        "data-path": path,
        tabindex: depth === 0 ? "0" : "-1",
      });
      const toggle = el("button", {
        type: "button",
        class: "rui-json-tree-toggle",
        tabindex: "-1",
        // The row owns the tree semantics; the button is the visual affordance.
        "aria-hidden": "true",
      }, [
        el("span", { class: "rui-json-tree-toggle-glyph" }, [open ? "▼" : "▶"]),
      ]);
      row.append(toggle);
      if (keyPrefix) row.append(el("span", { class: "rui-json-tree-key" }, [keyPrefix]));
      row.append(el("span", { class: "rui-json-tree-summary" }, [summaryOf(data, entries.length)]));

      const children = el("div", {
        class: "rui-json-tree-children",
        role: "group",
        id: childrenId,
        "data-open": open ? "true" : "false",
      });
      const chain = [...ancestors, data];
      if (open) appendChildren(children, entries, depth, path, chain);

      row.onclick = (event) => {
        toggleRow((event.currentTarget ?? event.target) as HTMLElement, entries, depth, path, chain);
      };
      node.append(row, children);
      return node;
    }

    /** Flip a branch on the LIVE row resolved from the event. */
    const toggleRow = (
      liveRow: HTMLElement,
      entries: ReadonlyArray<readonly [string, unknown]>,
      depth: number,
      path: string,
      chain: ReadonlyArray<object>,
    ): void => {
      const node = liveRow.parentElement;
      const children = node
        ? Array.from(node.children).find((c) => c.classList.contains("rui-json-tree-children")) as HTMLElement | undefined
        : undefined;
      if (!children) return;
      const next = children.getAttribute("data-open") !== "true";
      setOpen(path, next);
      children.setAttribute("data-open", next ? "true" : "false");
      liveRow.setAttribute("aria-expanded", next ? "true" : "false");
      const glyph = liveRow.querySelector(".rui-json-tree-toggle-glyph");
      if (glyph) glyph.textContent = next ? "▼" : "▶";
      if (next && children.childElementCount === 0) {
        appendChildren(children, entries, depth, path, chain);
      } else if (!next) {
        // Collapse: drop the rendered rows so re-opening rebuilds them against
        // the latest data (and keeps the DOM small for big trees).
        children.replaceChildren();
      }
    };

    const visibleRows = (treeRoot: HTMLElement): HTMLElement[] =>
      Array.from(treeRoot.querySelectorAll<HTMLElement>(".rui-json-tree-row"))
        .filter((r) => !r.closest('.rui-json-tree-children[data-open="false"]'));

    const focusRow = (rows: HTMLElement[], index: number): void => {
      if (rows.length === 0) return;
      const clamped = Math.max(0, Math.min(index, rows.length - 1));
      rows.forEach((r, i) => r.setAttribute("tabindex", i === clamped ? "0" : "-1"));
      rows[clamped]!.focus?.();
    };

    root.onkeydown = (event) => {
      const kev = event as KeyboardEvent;
      const treeRoot = (kev.currentTarget ?? kev.target) as HTMLElement;
      const target = kev.target as HTMLElement | null;
      const active = target?.closest?.(".rui-json-tree-row") as HTMLElement | null;
      const rows = visibleRows(treeRoot);
      const at = active ? rows.indexOf(active) : -1;
      switch (kev.key) {
        case "ArrowDown": kev.preventDefault(); focusRow(rows, at + 1); return;
        case "ArrowUp": kev.preventDefault(); focusRow(rows, at < 0 ? 0 : at - 1); return;
        case "Home": kev.preventDefault(); focusRow(rows, 0); return;
        case "End": kev.preventDefault(); focusRow(rows, rows.length - 1); return;
        case "Enter":
        case " ":
          if (!active?.hasAttribute("aria-expanded")) return;
          kev.preventDefault();
          active.click();
          return;
        case "ArrowRight":
          kev.preventDefault();
          if (active?.getAttribute("aria-expanded") === "false") active.click();
          else focusRow(rows, at + 1);
          return;
        case "ArrowLeft": {
          kev.preventDefault();
          if (active?.getAttribute("aria-expanded") === "true") { active.click(); return; }
          const parentRow = active?.parentElement?.parentElement?.previousElementSibling as HTMLElement | null;
          if (parentRow?.classList.contains("rui-json-tree-row")) focusRow(rows, rows.indexOf(parentRow));
          else focusRow(rows, at - 1);
          return;
        }
        default:
      }
    };

    root.append(buildNode(props.data, null, 0, "$", []));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Gantt
 * ----------------------------------------------------------------------- */

const GANTT_WARNED = new Set<string>();

function warnGanttDates(id: string, start: string, end: string): void {
  const key = `${id}|${start}|${end}`;
  if (GANTT_WARNED.has(key)) return;
  GANTT_WARNED.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[aktion] Gantt task "${id}" has unparseable dates (start: "${start}", end: "${end}") — ` +
    "expected ISO strings like 2026-03-01. The bar was skipped.",
  );
}

export const Gantt: ComponentSpec = {
  name: "Gantt",
  description:
    "Simple Gantt chart. Pass `tasks` as `{id, label, start, end, progress?, tone?}` with ISO date strings; " +
    "`progress` accepts either a 0-1 fraction or a 0-100 percentage, and `tone` colours the bar " +
    "(`success`, `warning`, `danger`, …). Set `axis` for a date scale and `today` for a now marker.",
  props: [
    { name: "tasks", type: "any[]" },
    { name: "startDate", type: "string", optional: true },
    { name: "endDate", type: "string", optional: true },
    { name: "axis", type: "boolean", optional: true, description: "Render a date axis above the bars" },
    { name: "ticks", type: "number", optional: true, description: "Axis tick count (default 5, implies `axis`)" },
    { name: "today", type: "boolean | string", optional: true, description: "Draw a marker line at now, or at the given ISO date" },
    { name: "onTaskClick", type: "callable", optional: true, description: "Receives the clicked task's id" },
  ],
  render: (_node, props, helpers) => {
    const tasks = readGanttTasks(props.tasks);
    const parsed = tasks.map((task) => {
      const start = parseDate(task.start);
      const end = parseDate(task.end);
      if (start === null || end === null) warnGanttDates(task.id, task.start, task.end);
      // Tolerate a task whose dates arrived the wrong way round rather than
      // painting a negative-width bar.
      const lo = start !== null && end !== null ? Math.min(start, end) : start ?? end;
      const hi = start !== null && end !== null ? Math.max(start, end) : end ?? start;
      return { task, start: lo, end: hi, valid: start !== null && end !== null };
    });
    const starts = parsed.filter((p) => p.start !== null).map((p) => p.start as number);
    const ends = parsed.filter((p) => p.end !== null).map((p) => p.end as number);
    let rangeStart = props.startDate
      ? parseDate(asString(props.startDate)) ?? (starts.length ? Math.min(...starts) : Date.now())
      : (starts.length ? Math.min(...starts) : Date.now());
    let rangeEnd = props.endDate
      ? parseDate(asString(props.endDate)) ?? (ends.length ? Math.max(...ends) : rangeStart + 86_400_000)
      : (ends.length ? Math.max(...ends) : rangeStart + 86_400_000);
    // An inverted range used to collapse `span` to 1ms and produce widths of
    // millions of percent; normalise instead of trusting the order.
    if (rangeEnd < rangeStart) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    if (rangeEnd === rangeStart) rangeEnd = rangeStart + 86_400_000;
    const span = rangeEnd - rangeStart;
    const pctOf = (time: number): number => ((time - rangeStart) / span) * 100;

    const root = el("div", { class: "rui-gantt" });
    const tickCount = props.ticks != null ? Math.max(2, Math.min(12, Math.floor(asNumber(props.ticks, 5)))) : 5;
    const wantsAxis = asBoolean(props.axis) || props.ticks != null;
    const formatTick = (time: number): string => {
      try {
        return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      } catch {
        return new Date(time).toISOString().slice(0, 10);
      }
    };
    const todayTime = props.today === undefined || props.today === false
      ? null
      : (typeof props.today === "string" ? parseDate(props.today) : Date.now());

    if (wantsAxis) {
      const axis = el("div", { class: "rui-gantt-axis", "aria-hidden": "true" });
      axis.append(el("div", { class: "rui-gantt-label" }));
      const ticks = el("div", { class: "rui-gantt-axis-ticks" });
      for (let i = 0; i < tickCount; i += 1) {
        const at = rangeStart + (span * i) / (tickCount - 1);
        ticks.append(el("div", {
          class: "rui-gantt-tick",
          style: `left:${(i / (tickCount - 1)) * 100}%`,
        }, [formatTick(at)]));
      }
      axis.append(ticks);
      root.append(axis);
    }

    const track = el("div", { class: "rui-gantt-track", role: "list" });
    const clickable = typeof props.onTaskClick === "function";
    for (const entry of parsed) {
      const { task } = entry;
      // `progress` has no documented unit, so the obvious 0-1 fraction rendered
      // as a sub-1% sliver. Treat anything in (0, 1] as a fraction.
      const progressPct = task.progress == null
        ? null
        : (task.progress > 0 && task.progress <= 1 ? task.progress * 100 : task.progress);
      // The bars are decorative divs whose only annotation used to be a
      // `title` — which AT does not expose on a plain div. The row carries the
      // whole schedule as text instead.
      const summary = entry.valid
        ? `${task.label}: ${task.start} → ${task.end}${progressPct != null ? `, ${Math.round(progressPct)}%` : ""}`
        : `${task.label}: dates unavailable`;
      const row = el("div", {
        class: "rui-gantt-row",
        role: "listitem",
        "data-task-id": task.id,
        "data-invalid": entry.valid ? null : "true",
        "aria-label": summary,
      });
      row.append(el("div", { class: "rui-gantt-label" }, [task.label]));
      const barWrap = el("div", { class: "rui-gantt-bars" });
      if (entry.valid && entry.start !== null && entry.end !== null) {
        const rawStart = pctOf(entry.start);
        const rawEnd = pctOf(entry.end);
        // Fully outside the visible window: no bar (an unclamped negative
        // `left` used to paint across the label column).
        if (rawEnd > 0 && rawStart < 100) {
          const startPct = Math.max(0, Math.min(100, rawStart));
          const widthPct = Math.max(Math.min(100 - startPct, rawEnd - startPct), 1);
          const bar = el("div", {
            class: "rui-gantt-bar",
            style: `left:${startPct}%;width:${widthPct}%`,
            "data-tone": task.tone ?? null,
            "aria-hidden": "true",
          });
          if (progressPct != null) {
            bar.append(el("div", {
              class: "rui-gantt-bar-progress",
              style: `width:${Math.min(100, Math.max(0, progressPct))}%`,
            }));
          }
          barWrap.append(bar);
        }
      }
      if (todayTime != null) {
        const at = pctOf(todayTime);
        if (at >= 0 && at <= 100) {
          barWrap.append(el("div", { class: "rui-gantt-today", style: `left:${at}%`, "aria-hidden": "true" }));
        }
      }
      row.append(barWrap);
      if (clickable) {
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        const fire = (origin: HTMLElement): void => {
          helpers.invoke(props.onTaskClick, origin.getAttribute("data-task-id") ?? task.id);
        };
        row.onclick = (event) => fire(event.currentTarget as HTMLElement);
        row.onkeydown = (event) => {
          const kev = event as KeyboardEvent;
          if (kev.key !== "Enter" && kev.key !== " ") return;
          kev.preventDefault();
          fire((kev.currentTarget ?? kev.target) as HTMLElement);
        };
      }
      track.append(row);
    }
    root.append(track);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Tier 3
 * ----------------------------------------------------------------------- */

/** `expanded` is the fifth declared prop, so `expanded: $flag` binds here. */
const TRUNCATE_EXPANDED_ARG = 4;

export const Truncate: ComponentSpec = {
  name: "Truncate",
  description:
    "Clamp long text (or a `child` node) with an expand control. The toggle hides itself when the content " +
    "already fits, and `expanded` + `onToggle` make the state controllable for \"expand all\" flows.",
  props: [
    { name: "text", type: "string" },
    { name: "maxLines", type: "number", optional: true, description: "Lines before clamping (default 3)" },
    { name: "expandLabel", type: "string", optional: true },
    { name: "collapseLabel", type: "string", optional: true, description: "Text of the collapse control (default \"Show less\")" },
    { name: "expanded", type: "boolean", optional: true, description: "Controlled expansion state — bind to a $variable" },
    { name: "onToggle", type: "callable", optional: true, description: "Receives the next expanded state" },
    { name: "child", aliases: ["children"], type: "Node", optional: true, description: "Formatted content to clamp instead of `text`" },
  ],
  render: (node, props, helpers) => {
    const maxLines = Math.max(1, Math.floor(asNumber(props.maxLines, 3)));
    const controlled = props.expanded !== undefined;
    const propExpanded = controlled ? asBoolean(props.expanded) : false;
    const expandedSlot = helpers.useInstanceState<boolean>("expanded", propExpanded);
    if (controlled && expandedSlot.get() !== propExpanded) expandedSlot.set(propExpanded);
    const overflowSlot = helpers.useInstanceState<boolean | null>("overflow", null);
    const idSlot = helpers.useInstanceState<string>("id", nextUid("rui-truncate"));
    const stateRef = node.argMeta?.[TRUNCATE_EXPANDED_ARG]?.stateRef;
    const expanded = controlled ? propExpanded : expandedSlot.get();
    const expandText = asString(props.expandLabel, "Show more");
    const collapseText = asString(props.collapseLabel, "Show less");
    const bodyId = idSlot.get();

    // The clamp itself lives in CSS keyed off `data-expanded`; only the line
    // count is inline, so a theme can restyle either state (an inline
    // `overflow: hidden` + line-clamp beat every stylesheet rule).
    const root = el("div", {
      class: "rui-truncate",
      "data-expanded": expanded ? "true" : "false",
      "data-overflow": overflowSlot.get() === null ? null : String(overflowSlot.get()),
      style: `--rui-truncate-lines:${maxLines}`,
    });
    const body = el("p", { class: "rui-truncate-text", id: bodyId });
    if (props.child !== undefined && props.child !== null) body.append(helpers.renderNode(props.child));
    else body.append(document.createTextNode(asString(props.text)));

    const toggle = el("button", {
      type: "button",
      class: "rui-truncate-toggle",
      "aria-expanded": expanded ? "true" : "false",
      "aria-controls": bodyId,
      // Hidden only once we have measured that the text fits — never on a
      // guess, or a genuinely clamped paragraph loses its only affordance.
      hidden: overflowSlot.get() === false ? "" : null,
    }, [expanded ? collapseText : expandText]);
    toggle.onclick = (event) => {
      // Walk to the live `.rui-truncate` root; the closure-captured nodes are
      // detached once morph reuses the kept DOM.
      const liveToggle = event.currentTarget as HTMLElement;
      const liveRoot = liveToggle.closest(".rui-truncate") as HTMLElement | null;
      if (!liveRoot) return;
      const next = liveRoot.getAttribute("data-expanded") !== "true";
      expandedSlot.set(next);
      liveRoot.setAttribute("data-expanded", next ? "true" : "false");
      liveToggle.setAttribute("aria-expanded", next ? "true" : "false");
      liveToggle.textContent = next ? collapseText : expandText;
      if (stateRef) helpers.setState(stateRef, next);
      helpers.invoke(props.onToggle, next);
    };
    root.append(body, toggle);

    /** True when the browser is actually clamping this element right now. */
    const clampActive = (target: HTMLElement): boolean => {
      if (typeof getComputedStyle !== "function") return false;
      const cs = getComputedStyle(target);
      const clamp = cs.getPropertyValue("-webkit-line-clamp")
        || (cs as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp
        || "";
      return clamp.trim() !== "" && clamp.trim() !== "none";
    };
    const applyOverflow = (liveRoot: HTMLElement): void => {
      const liveBody = liveRoot.querySelector<HTMLElement>(".rui-truncate-text");
      const liveToggle = liveRoot.querySelector<HTMLElement>(".rui-truncate-toggle");
      if (!liveBody || !liveToggle) return;
      // Expanded text is never clamped, so measuring it would "prove" it fits
      // and hide the collapse control — leaving the user stuck open.
      if (liveRoot.getAttribute("data-expanded") === "true") return;
      if (!clampActive(liveBody)) return;
      const overflows = liveBody.scrollHeight - liveBody.clientHeight > 1;
      overflowSlot.set(overflows);
      liveRoot.setAttribute("data-overflow", overflows ? "true" : "false");
      if (overflows) liveToggle.removeAttribute("hidden");
      else liveToggle.setAttribute("hidden", "");
    };
    deferToPaint(() => {
      if (!root.isConnected) return; // discarded snapshot — the live render owns this
      applyOverflow(root);
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => applyOverflow(root));
      try {
        ro.observe(root);
      } catch {
        return;
      }
      helpers.registerDisposer(() => ro.disconnect(), "rui-truncate-resize");
    });
    return root;
  },
};

/** Input types an inline edit may ask for; `textarea` renders a multi-line box. */
const INLINE_EDIT_TYPES = new Set([
  "text", "number", "email", "tel", "url", "password", "search", "color",
  "date", "time", "datetime-local", "month", "week",
]);

export const InlineEdit: ComponentSpec = {
  name: "InlineEdit",
  description:
    "Click-to-edit inline field. Enter or blur commits (only when the value actually changed), Escape " +
    "discards. Pass `type: \"textarea\"` for multi-line, `placeholder` so an empty field still has an " +
    "affordance, and `error`/`required` to surface a rejected save.",
  props: [
    { name: "value", type: "string" },
    { name: "label", type: "string", optional: true },
    { name: "onSave", type: "callable", optional: true, description: "Receives the committed draft string" },
    { name: "placeholder", type: "string", optional: true, description: "Shown when the value is empty (also names the trigger)" },
    { name: "type", type: "string", optional: true, description: "Input type, or `textarea` for multi-line" },
    { name: "onCancel", type: "callable", optional: true, description: "Called when the edit is discarded with Escape" },
    // `label` is declared above so `InlineEdit(value, label, onSave)` keeps its
    // documented positional order; the rest of the field-shell contract
    // (disabled / hint / error / required / onBlur / onFocus) comes from the
    // shared list so it cannot drift from the other inputs.
    ...FIELD_SHELL_PROPS.filter((p) => p.name !== "label"),
  ],
  render: (node, props, helpers) => {
    const editingSlot = helpers.useInstanceState<boolean>("editing", false);
    const draftSlot = helpers.useInstanceState<string>("draft", asString(props.value));
    const idSlot = helpers.useInstanceState<string>("id", nextUid("rui-inline-edit"));
    const stateRef = node.argMeta?.[0]?.stateRef;
    const disabled = asBoolean(props.disabled);
    const current = asString(props.value);
    const placeholder = asString(props.placeholder);
    const labelText = asString(props.label);
    const inputId = idSlot.get();
    const editing = editingSlot.get() && !disabled;
    const multiline = asString(props.type).trim().toLowerCase() === "textarea";
    const controlName = labelText || placeholder || "Edit";

    const root = el("div", {
      class: "rui-inline-edit",
      "data-editing": editing ? "true" : "false",
      "data-disabled": disabled ? "true" : null,
    });

    // An empty value used to render a nameless ~18px sliver — exactly the case
    // (filling in a blank field) inline editing exists for.
    const displayText = current || placeholder || "—";
    const display = el("button", {
      type: "button",
      class: "rui-inline-edit-display",
      id: `${inputId}-display`,
      "data-empty": current === "" ? "true" : null,
      disabled: disabled ? "" : null,
      "aria-label": labelText ? `${labelText}: ${displayText}` : null,
    }, [displayText]);

    const controlAttrs = {
      class: "rui-inline-edit-input rui-input",
      id: inputId,
      name: inputId,
      placeholder: placeholder || null,
      "aria-label": controlName,
      required: asBoolean(props.required) ? "" : null,
      "aria-invalid": asString(props.error) ? "true" : null,
      disabled: disabled ? "" : null,
    };
    let input: HTMLInputElement | HTMLTextAreaElement;
    if (multiline) {
      const area = el("textarea", { ...controlAttrs, rows: "3" }) as HTMLTextAreaElement;
      area.value = editing ? draftSlot.get() : current;
      input = area;
    } else {
      const type = asString(props.type, "text").trim().toLowerCase();
      input = el("input", {
        ...controlAttrs,
        type: INLINE_EDIT_TYPES.has(type) ? type : "text",
        // `valueAttr` keeps "unset" distinct from "empty" for the morph
        // reconciler; while editing the draft is the asserted value.
        value: editing ? draftSlot.get() : valueAttr(props.value),
      }) as HTMLInputElement;
    }

    const resolveLive = (origin: Element): {
      root: HTMLElement; input: HTMLInputElement | HTMLTextAreaElement;
    } | null => {
      const liveRoot = origin.closest(".rui-inline-edit") as HTMLElement | null;
      const liveInput = liveRoot?.querySelector(".rui-inline-edit-input") as
        HTMLInputElement | HTMLTextAreaElement | null;
      if (!liveRoot || !liveInput) return null;
      return { root: liveRoot, input: liveInput };
    };

    const commit = (origin: Element): void => {
      // Re-entry guard: committing hides the focused input, and the browser
      // blurs an element that becomes `display: none` — which re-entered here
      // and fired a SECOND save (two PATCHes for one Enter press).
      if (!editingSlot.get()) return;
      const live = resolveLive(origin);
      editingSlot.set(false);
      live?.root.setAttribute("data-editing", "false");
      const draft = draftSlot.get();
      // Merely focusing and leaving a field is not an edit: an unconditional
      // write produced phantom saves, "saved" toasts and audit entries.
      if (draft === current) return;
      if (stateRef) helpers.setState(stateRef, draft);
      helpers.invoke(props.onSave, draft);
    };

    const cancel = (origin: Element): void => {
      if (!editingSlot.get()) return;
      const live = resolveLive(origin);
      // Restore the draft and clear `editing` BEFORE hiding the input: hiding
      // blurs it, and blur runs `commit` — which now sees editing=false and a
      // pristine draft, so Escape discards instead of saving.
      draftSlot.set(current);
      editingSlot.set(false);
      if (live) {
        live.root.setAttribute("data-editing", "false");
        live.input.value = current;
      }
      helpers.invoke(props.onCancel);
    };

    if (!disabled) {
      display.onclick = (event) => {
        const live = resolveLive(event.currentTarget as Element);
        draftSlot.set(current);
        editingSlot.set(true);
        if (live) {
          live.root.setAttribute("data-editing", "true");
          live.input.value = current;
          setTimeout(() => live.input.focus(), 0);
        }
      };
      input.oninput = (event) => {
        const live = (event.currentTarget ?? event.target) as HTMLInputElement | HTMLTextAreaElement;
        draftSlot.set(live.value);
      };
      input.onkeydown = (event) => {
        const kev = event as KeyboardEvent;
        const origin = (kev.currentTarget ?? kev.target) as Element;
        // Enter in a textarea inserts a newline; commit with Ctrl/Cmd+Enter.
        if (kev.key === "Enter" && (!multiline || kev.metaKey || kev.ctrlKey)) {
          kev.preventDefault();
          commit(origin);
          return;
        }
        if (kev.key === "Escape") {
          kev.preventDefault();
          cancel(origin);
        }
      };
      input.onblur = (event) => {
        const origin = (event.currentTarget ?? event.target) as HTMLElement;
        helpers.invoke(props.onBlur, (origin as HTMLInputElement).value);
        commit(origin);
      };
      input.onfocus = (event) => {
        const origin = (event.currentTarget ?? event.target) as HTMLElement;
        helpers.invoke(props.onFocus, (origin as HTMLInputElement).value);
      };
    }

    root.append(display, input);
    return withFieldShell(root, props);
  },
};

/* NotificationBell floating-panel wiring ---------------------------------- *
 *
 * The panel used to be a `position: absolute` child of the bell wrapper, which
 * meant every clipping ancestor amputated it — and a bell almost always lives
 * in exactly the worst place for that: a header/toolbar row, a sidebar rail, a
 * table cell, a sheet body. `side`/`align` reproduce the old
 * `top: calc(100% + 6px); right: 0` geometry (open below, right edges flush);
 * `align` follows the component's own `align` prop because the CSS fallback
 * hardcodes `right: 0`.
 */
const BELL_PANEL_SELECTOR = ".rui-notification-bell-panel";
const BELL_TRIGGER_SELECTOR = ".rui-notification-bell-trigger";
const bellFloatingOpts = (align: string): Parameters<typeof syncFloatingPanel>[4] => ({
  side: "bottom",
  align: align === "left" ? "start" : "end",
  layer: "dropdown",
});

export const NotificationBell: ComponentSpec = {
  name: "NotificationBell",
  description:
    "Bell icon with unread count badge and dropdown notification list. Pass `items` as " +
    "`{title, message?, time?, href?, unread?}` objects; `onItemClick` receives the clicked item and " +
    "`onMarkAllRead` renders a footer control. Arrow keys walk the list, Escape closes.",
  props: [
    { name: "count", type: "number", optional: true },
    { name: "items", type: "any[]", optional: true, description: "{title, message?, time?, href?, unread?} objects" },
    { name: "onOpen", type: "callable", optional: true },
    { name: "onItemClick", type: "callable", optional: true, description: "Receives the clicked notification object and its index" },
    { name: "onMarkAllRead", type: "callable", optional: true, description: "Renders a \"mark all read\" footer control" },
    { name: "align", type: "string", optional: true, enum: ["left", "right"], description: "Which edge the panel aligns to (default right)" },
    { name: "loading", type: "boolean", optional: true, description: "Show a pending state instead of the empty message" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown with no notifications (default \"No notifications\")" },
    { name: "label", type: "string", optional: true, description: "Accessible name for the bell (default \"Notifications\")" },
    { name: "markAllLabel", type: "string", optional: true, description: "Text of the mark-all-read control" },
    { name: "maxCount", type: "number", optional: true, description: "Badge cap before it renders as \"N+\" (default 99)" },
  ],
  render: (_node, props, helpers) => {
    const count = Math.max(0, Math.floor(asNumber(props.count, 0)));
    const maxCount = Math.max(1, Math.floor(asNumber(props.maxCount, 99)));
    const items = readPlainObjects(props.items);
    const loading = asBoolean(props.loading);
    const align = asString(props.align, "right");
    const labelText = asString(props.label, "Notifications");
    const openSlot = helpers.useInstanceState<boolean>("open", false);
    const isOpen = openSlot.get();
    const clickable = typeof props.onItemClick === "function";

    const root = el("div", {
      class: "rui-notification-bell",
      "data-open": isOpen ? "true" : "false",
      "data-align": align === "left" ? "left" : "right",
    });
    const trigger = el("button", {
      type: "button",
      class: "rui-notification-bell-trigger",
      "aria-expanded": isOpen ? "true" : "false",
      // The panel is a menu, so `aria-haspopup` must say so.
      "aria-haspopup": "menu",
      // The icon is `aria-hidden`, so without this the trigger announced as a
      // bare "button" with no hint of what it opens or how many are unread.
      "aria-label": count > 0 ? `${labelText}, ${count} unread` : labelText,
    });
    const bell = renderIcon("bell", { className: "rui-notification-bell-icon" });
    if (bell) trigger.append(bell);
    if (count > 0) {
      trigger.append(el("span", {
        class: "rui-notification-bell-badge",
        // The count is already in the trigger's name; announcing the badge too
        // would double it.
        "aria-hidden": "true",
      }, [count > maxCount ? `${maxCount}+` : String(count)]));
    }
    root.append(trigger);
    // Count changes while the page is open are otherwise never announced.
    root.append(el("div", {
      class: "rui-notification-bell-status rui-visually-hidden",
      role: "status",
      "aria-live": "polite",
    }, [count > 0 ? `${labelText}: ${count}` : ""]));

    const panel = el("div", {
      class: "rui-notification-bell-panel",
      role: "menu",
      "aria-label": labelText,
      "aria-busy": loading ? "true" : null,
    });
    if (loading) {
      const pending = el("div", { class: "rui-notification-bell-empty", role: "status" });
      const spin = renderIcon("spinner", { className: "rui-notification-bell-spinner" });
      if (spin) pending.append(spin);
      panel.append(pending);
    } else if (items.length === 0) {
      panel.append(el("div", { class: "rui-notification-bell-empty" }, [
        asString(props.emptyLabel, "No notifications"),
      ]));
    } else {
      items.forEach((item, index) => {
        const href = asString(item.href).trim();
        const unread = asBoolean(item.unread);
        const shared = {
          class: "rui-notification-bell-item",
          role: "menuitem",
          tabindex: "-1",
          "data-index": String(index),
          "data-unread": unread ? "true" : null,
        };
        // Rows are real controls now: a notification list you cannot open is
        // just a list of things you cannot reach.
        const row = href
          ? el("a", { ...shared, href: sanitiseHref(href) })
          : el(clickable ? "button" : "div", { ...shared, ...(clickable ? { type: "button" } : {}) });
        row.append(el("div", { class: "rui-notification-bell-item-title" }, [asString(item.title)]));
        const msg = asString(item.message);
        if (msg) row.append(el("div", { class: "rui-notification-bell-item-message" }, [msg]));
        const time = asString(item.time);
        if (time) row.append(el("div", { class: "rui-notification-bell-item-time" }, [time]));
        if (unread) row.append(el("span", { class: "rui-visually-hidden" }, ["unread"]));
        if (clickable || href) {
          row.onclick = (event) => {
            const origin = (event.currentTarget ?? event.target) as HTMLElement;
            const at = Number(origin.getAttribute("data-index"));
            const idx = Number.isFinite(at) ? at : index;
            helpers.invoke(props.onItemClick, items[idx], idx);
          };
        }
        panel.append(row);
      });
    }
    if (typeof props.onMarkAllRead === "function") {
      const footer = el("div", { class: "rui-notification-bell-footer" });
      const markAll = el("button", {
        type: "button",
        class: "rui-notification-bell-mark",
        role: "menuitem",
        tabindex: "-1",
      }, [asString(props.markAllLabel, "Mark all read")]);
      markAll.onclick = () => helpers.invoke(props.onMarkAllRead);
      footer.append(markAll);
      panel.append(footer);
    }

    /** Roving arrow navigation over the panel's menu items. */
    const focusItem = (livePanel: HTMLElement, index: number): void => {
      const rows = Array.from(livePanel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (rows.length === 0) return;
      const next = ((index % rows.length) + rows.length) % rows.length;
      rows.forEach((r, i) => r.setAttribute("tabindex", i === next ? "0" : "-1"));
      rows[next]!.focus?.();
    };
    panel.onkeydown = (event) => {
      const kev = event as KeyboardEvent;
      const livePanel = (kev.currentTarget ?? kev.target) as HTMLElement;
      const rows = Array.from(livePanel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      const at = rows.indexOf((kev.target as HTMLElement)?.closest?.('[role="menuitem"]') as HTMLElement);
      if (kev.key === "ArrowDown") { kev.preventDefault(); focusItem(livePanel, at + 1); return; }
      if (kev.key === "ArrowUp") { kev.preventDefault(); focusItem(livePanel, at < 0 ? rows.length - 1 : at - 1); return; }
      if (kev.key === "Home") { kev.preventDefault(); focusItem(livePanel, 0); return; }
      if (kev.key === "End") { kev.preventDefault(); focusItem(livePanel, rows.length - 1); return; }
      if (kev.key !== "Escape") return;
      const liveRoot = livePanel.closest(".rui-notification-bell") as HTMLElement | null;
      if (!liveRoot) return;
      kev.preventDefault();
      openSlot.set(false);
      liveRoot.setAttribute("data-open", "false");
      liveRoot.querySelector(BELL_TRIGGER_SELECTOR)?.setAttribute("aria-expanded", "false");
      closeFloating(liveRoot.querySelector<HTMLElement>(BELL_PANEL_SELECTOR));
      disposeDismissListeners(liveRoot);
      liveRoot.querySelector<HTMLElement>(BELL_TRIGGER_SELECTOR)?.focus?.();
    };
    root.append(panel);

    const openBell = (liveTrigger: HTMLElement, next: boolean): void => {
      const liveRoot = liveTrigger.closest(".rui-notification-bell") as HTMLElement | null;
      if (!liveRoot) return;
      openSlot.set(next);
      liveRoot.setAttribute("data-open", next ? "true" : "false");
      liveTrigger.setAttribute("aria-expanded", next ? "true" : "false");
      // Promote the panel out of its clipping ancestry (or hand it back on
      // close). Done before `onOpen` fires so the panel is already placed if the
      // callback goes on to mutate state and trigger a re-render.
      syncFloatingPanel(liveRoot, next, BELL_PANEL_SELECTOR, BELL_TRIGGER_SELECTOR,
        bellFloatingOpts(align));
      if (!next) {
        disposeDismissListeners(liveRoot);
        return;
      }
      helpers.invoke(props.onOpen);
      installDismissListeners({
        liveRoot,
        key: "notification-bell",
        onDismiss: () => {
          openSlot.set(false);
          liveRoot.setAttribute("data-open", "false");
          liveTrigger.setAttribute("aria-expanded", "false");
          // Outside-click / Escape closes too, so it must un-promote as well —
          // otherwise the panel is left orphaned in the top layer, invisible
          // to `data-open` yet still painted above everything.
          closeFloating(liveRoot.querySelector<HTMLElement>(BELL_PANEL_SELECTOR));
        },
      });
    };

    trigger.onclick = (event) => {
      event.stopPropagation();
      // Resolve the *live* DOM nodes from the event target so this handler keeps
      // working after the morph reconciler copies it onto the kept DOM (the
      // closure-captured `root`/`trigger` reference the freshly-built fragment,
      // which is detached after morph).
      openBell(event.currentTarget as HTMLElement, !openSlot.get());
    };
    trigger.onkeydown = (event) => {
      const kev = event as KeyboardEvent;
      if (kev.key !== "ArrowDown" && kev.key !== "ArrowUp") return;
      kev.preventDefault();
      const liveTrigger = (kev.currentTarget ?? kev.target) as HTMLElement;
      if (!openSlot.get()) openBell(liveTrigger, true);
      const livePanel = liveTrigger.closest(".rui-notification-bell")
        ?.querySelector<HTMLElement>(BELL_PANEL_SELECTOR);
      if (livePanel) focusItem(livePanel, kev.key === "ArrowDown" ? 0 : -1);
    };

    // A re-render that lands while the bell is open normally keeps the live
    // panel (morph reuses it, and the floating layer keeps it positioned), but
    // if morph decides to replace the subtree the replacement arrives already
    // `data-open="true"` and unpromoted. Positioning needs live layout, so defer
    // one paint and bail out on the detached snapshots morph discards.
    if (isOpen) {
      deferToPaint(() => {
        if (!root.isConnected) return;
        if (root.getAttribute("data-open") !== "true") return;
        syncFloatingPanel(root, true, BELL_PANEL_SELECTOR, BELL_TRIGGER_SELECTOR,
          bellFloatingOpts(align));
      });
    }
    return root;
  },
};
