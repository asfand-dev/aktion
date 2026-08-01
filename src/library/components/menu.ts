/**
 * Dropdown menu primitives modeled after shadcn/ui.
 *
 *   DropdownMenu(trigger, items, side?, align?, label?, open?, onOpenChange?, disabled?)
 *   MenuItem(label, action?, icon?, shortcut?, variant?, disabled?, checked?, role?, keepOpen?)
 *   MenuSeparator()
 *   MenuLabel(label)
 *
 * `DropdownMenu` keeps its open/closed state in `helpers.useInstanceState`, so
 * unrelated state changes (typing into an input, ticking a checkbox, …) do not
 * collapse the menu mid-interaction — while an `open` prop that CHANGES still
 * wins, so an action can close the menu after deleting the row it belongs to.
 * Clicking the trigger toggles it; clicking a `MenuItem` runs its action and
 * closes (unless the item sets `keepOpen`); clicking outside or pressing Escape
 * closes without acting.
 *
 * Dismissal listeners are installed from the RENDER path, not only from the
 * toggle handlers, so a menu that is open on its first paint (`open: true`) is
 * dismissable too. They cover both the app's shadow root and the host document:
 * a click on the surrounding page never enters the shadow root's propagation
 * path, which used to leave the menu floating over the content just clicked.
 *
 * The trigger is rendered inside a `<span>` wrapper (not a nested `<button>`)
 * so user-provided triggers like `Button("Open")` or `Avatar(...)` remain valid
 * HTML. When that wrapper contains its own focusable control, the control is the
 * single tab stop and carries the `aria-haspopup` / `aria-expanded` state; only
 * a non-interactive trigger promotes the wrapper itself to `role="button"`.
 */

import { mapPositionalArgs, type ComponentSpec } from "../types.js";
import { el, asArray, asString, asBoolean, renderIcon } from "../utils.js";
import { applyUniversal } from "../sx.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";
import { closeFloating, deferToPaint, syncFloatingPanel } from "../floating.js";

const MENU_SIDES = ["bottom", "top", "left", "right"] as const;
const MENU_ALIGNS = ["start", "center", "end"] as const;
const MENU_VARIANTS = ["default", "danger"] as const;
const MENU_ITEM_ROLES = ["menuitem", "menuitemcheckbox", "menuitemradio"] as const;

/** Anything inside the trigger wrapper that is already a tab stop of its own. */
const TRIGGER_FOCUSABLE =
  "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** The open/closed channel: instance slot + optional `$`-binding + callback. */
interface OpenController {
  get: () => boolean;
  set: (next: boolean) => void;
}

/**
 * Reflect the open state onto the LIVE root and trigger.
 *
 * `data-state` matters as much as `data-open`: it is the trigger's own CSS hook
 * (the raised z-index while a menu is open) and it used to be written at render
 * time only. Because `useInstanceState.set` schedules no re-render, it then
 * stayed `"closed"` for the whole interaction and the rule never applied.
 */
function applyOpenAttrs(liveRoot: HTMLElement, open: boolean): void {
  liveRoot.setAttribute("data-open", open ? "true" : "false");
  const trigger = liveRoot.querySelector<HTMLElement>(".rui-dropdown-menu-trigger");
  if (!trigger) return;
  trigger.setAttribute("data-state", open ? "open" : "closed");
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  // The real tab stop may be the author's own control inside the wrapper, which
  // is where a screen reader reads the expanded state from.
  trigger.querySelector<HTMLElement>('[aria-haspopup="menu"]')
    ?.setAttribute("aria-expanded", open ? "true" : "false");
}

/**
 * Resolve the menu a click / keypress belongs to.
 *
 * `closest()` alone is not enough: on engines without the Popover API the
 * floating layer promotes the panel by REPARENTING it into a root-level
 * container, after which an item is no longer a descendant of its own menu — so
 * activating it left `data-open="true"` behind and the panel never closed. The
 * panel therefore records its owner's id and the lookup falls back to that.
 */
function dropdownRootOf(origin: Element): HTMLElement | null {
  const direct = origin.closest(".rui-dropdown-menu") as HTMLElement | null;
  if (direct) return direct;
  const owner = (origin.closest(".rui-dropdown-menu-content") as HTMLElement | null)
    ?.getAttribute("data-menu-root");
  if (!owner) return null;
  const scope = origin.getRootNode() as Document | ShadowRoot;
  return scope.querySelector<HTMLElement>(`.rui-dropdown-menu[data-menu-id="${owner}"]`);
}

/** This menu's panel, wherever the floating layer has parked it. */
function menuPanelOf(liveRoot: HTMLElement): HTMLElement | null {
  const inside = liveRoot.querySelector<HTMLElement>(".rui-dropdown-menu-content");
  if (inside) return inside;
  const id = liveRoot.getAttribute("data-menu-id");
  if (!id) return null;
  const scope = liveRoot.getRootNode() as Document | ShadowRoot;
  return scope.querySelector<HTMLElement>(`.rui-dropdown-menu-content[data-menu-root="${id}"]`);
}

/** The menu's rows, in DOM order — including the `aria-disabled` ones. */
function menuItemsOf(liveRoot: HTMLElement): HTMLButtonElement[] {
  return Array.from(menuPanelOf(liveRoot)?.querySelectorAll<HTMLButtonElement>(".rui-menu-item") ?? []);
}

/**
 * Unavailable rows are marked with `aria-disabled`, never the native attribute
 * (see `menuItemButton`), so this is the only reliable test.
 */
const itemDisabled = (item: Element): boolean =>
  item.getAttribute("aria-disabled") === "true";

/** The element that owns the trigger's tab stop (for focus restoration). */
function triggerTabStop(liveRoot: HTMLElement): HTMLElement | null {
  const wrap = liveRoot.querySelector<HTMLElement>(".rui-dropdown-menu-trigger");
  if (!wrap) return null;
  return wrap.querySelector<HTMLElement>(TRIGGER_FOCUSABLE) ?? wrap;
}

/**
 * Page-level dismissal, in addition to the shared shadow-root listeners.
 *
 * `installDismissListeners` binds to `liveRoot.getRootNode()`, which for every
 * Aktion component is the host's ShadowRoot. A click on the surrounding page is
 * never in that propagation path, so the menu stayed open — usually floating
 * over the page content the user had just clicked.
 */
const PAGE_DISMISS = new WeakMap<HTMLElement, () => void>();

function installPageDismiss(liveRoot: HTMLElement, close: () => void): void {
  PAGE_DISMISS.get(liveRoot)?.();
  const doc = liveRoot.ownerDocument;
  // Held as a reference: the fallback path of the floating layer reparents the
  // panel into a root-level container, after which it is no longer a descendant.
  const panel = menuPanelOf(liveRoot);

  function onOutside(event: Event): void {
    // At document level `event.target` is retargeted to the shadow HOST, so
    // containment has to be tested on the composed path — otherwise every click
    // inside the app reads as an outside click.
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(liveRoot)) return;
    if (panel && path.includes(panel)) return;
    dispose();
    close();
  }
  function dispose(): void {
    doc.removeEventListener("click", onOutside, true);
    if (PAGE_DISMISS.get(liveRoot) === dispose) PAGE_DISMISS.delete(liveRoot);
  }

  PAGE_DISMISS.set(liveRoot, dispose);
  // Deferred so the click that opened the menu cannot immediately close it.
  setTimeout(() => {
    if (PAGE_DISMISS.get(liveRoot) !== dispose) return;
    doc.addEventListener("click", onOutside, true);
  }, 0);
}

/** Release every dismissal listener registered for a root. Idempotent. */
function releaseDismiss(liveRoot: HTMLElement): void {
  disposeDismissListeners(liveRoot);
  PAGE_DISMISS.get(liveRoot)?.();
}

function installDismiss(liveRoot: HTMLElement, ctl: OpenController): void {
  const close = (): void => {
    ctl.set(false);
    applyOpenAttrs(liveRoot, false);
    // Un-promote, or the panel stays in the top layer as an orphan that nothing
    // can dismiss.
    closeFloating(menuPanelOf(liveRoot));
    releaseDismiss(liveRoot);
  };
  installDismissListeners({ liveRoot, onDismiss: close });
  installPageDismiss(liveRoot, close);
}

/**
 * Walk up the live DOM and toggle the dropdown's open state, keeping the
 * persisted instance-state slot in sync. Modifies the DOM directly so the
 * interaction feels instant without waiting for a render tick.
 */
const setDropdownOpen = (
  origin: Element,
  next: boolean,
  ctl: OpenController,
): HTMLElement | null => {
  ctl.set(next);
  const liveRoot = dropdownRootOf(origin);
  if (!liveRoot) return null;
  applyOpenAttrs(liveRoot, next);
  syncFloatingLayer(liveRoot, next);
  // Any path that closes the menu also releases the dismissal listeners so we
  // don't accumulate stale listener pairs on the host shadow root.
  if (!next) releaseDismiss(liveRoot);
  return liveRoot;
};

/**
 * Promote the panel out of its clipping ancestry, or return it. Without this the
 * menu is amputated by any scrolling / `overflow: hidden` ancestor — a table
 * wrapper, a modal body, an accordion item, an InputGroup.
 *
 * Closing resolves the panel itself rather than going through
 * `syncFloatingPanel`, whose descendant lookup cannot see an already-reparented
 * panel and would therefore leave it promoted and visible for good.
 */
function syncFloatingLayer(liveRoot: HTMLElement, open: boolean): void {
  if (!open) {
    closeFloating(menuPanelOf(liveRoot));
    return;
  }
  syncFloatingPanel(
    liveRoot,
    true,
    ".rui-dropdown-menu-content",
    ".rui-dropdown-menu-trigger",
    { layer: "dropdown" },
  );
}

interface MenuItemNode {
  __kind?: string;
  name?: string;
  args?: unknown[];
  argMeta?: unknown[];
  universal?: Record<string, unknown>;
  explicitKey?: unknown;
}

const isMenuChild = (item: unknown, name: string): item is MenuItemNode => {
  if (!item || typeof item !== "object") return false;
  const node = item as MenuItemNode;
  return node.__kind === "Component" && node.name === name;
};

/* ------------------------------------------------------------------------ *
 * Item rendering — one implementation, shared by MenuItem's own render and by
 * DropdownMenu's plain-object item form.
 * ------------------------------------------------------------------------ */

interface MenuItemView {
  label: string;
  icon: unknown;
  shortcut: string;
  variant: string;
  disabled: boolean;
  /** `null` for a plain command item; a boolean makes it checkable. */
  checked: boolean | null;
  role: string;
  keepOpen: boolean;
}

function menuItemView(source: {
  label: unknown; icon?: unknown; shortcut?: unknown; variant?: unknown;
  disabled?: unknown; checked?: unknown; role?: unknown; keepOpen?: unknown;
}): MenuItemView {
  const role = asString(source.role, "menuitem");
  return {
    label: asString(source.label),
    icon: source.icon,
    shortcut: asString(source.shortcut),
    variant: asString(source.variant, "default"),
    disabled: asBoolean(source.disabled),
    checked: source.checked === undefined || source.checked === null ? null : asBoolean(source.checked),
    role: (MENU_ITEM_ROLES as readonly string[]).includes(role) ? role : "menuitem",
    keepOpen: asBoolean(source.keepOpen),
  };
}

function menuItemButton(view: MenuItemView): HTMLButtonElement {
  // A `checked` value implies a checkbox item unless the author asked for radio
  // semantics explicitly — `role="menuitem"` may not carry `aria-checked`.
  const role = view.role !== "menuitem"
    ? view.role
    : view.checked !== null ? "menuitemcheckbox" : "menuitem";
  const checkable = role !== "menuitem";
  const btn = el("button", {
    type: "button",
    class: "rui-menu-item",
    role,
    "data-variant": view.variant,
    // `aria-disabled` rather than the native attribute, which a WAI-ARIA menu
    // must not use: `disabled` takes the row out of the tab order and refuses
    // focus, so a keyboard / screen-reader user never learns that "Delete —
    // requires admin" exists at all. `aria-disabled` keeps it reachable and
    // announces it as present-but-unavailable; every activation path below
    // checks the flag, so the row still does nothing when clicked or Entered.
    "aria-disabled": view.disabled ? "true" : null,
    "data-disabled": view.disabled ? "true" : null,
    "aria-checked": checkable ? (view.checked === true ? "true" : "false") : null,
    "data-checked": view.checked === true ? "true" : null,
    // Read back by DropdownMenu: a toggle row must survive its own activation so
    // the user can flip several settings in a row.
    "data-keep-open": view.keepOpen ? "true" : null,
  }) as HTMLButtonElement;
  if (checkable) {
    btn.append(el("span", {
      class: "rui-menu-item-check",
      "aria-hidden": "true",
      // Sized inline (mirroring `.rui-menu-item-icon`) so the labels of a mixed
      // checked/unchecked group line up without depending on new CSS.
      style: "width:14px;display:inline-flex;justify-content:center",
    }, [view.checked === true ? "✓" : ""]));
  }
  const iconNode = renderIcon(view.icon, { className: "rui-menu-item-icon" });
  if (iconNode) btn.append(iconNode);
  btn.append(el("span", { class: "rui-menu-item-label" }, [view.label]));
  if (view.shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [view.shortcut]));
  return btn;
}

/**
 * The `{label, onClick, …}` object form. `ContextMenu` accepts and documents it
 * (editors.ts), and the validator only checks prop names — never array element
 * types — so the same spelling reached DropdownMenu, fell through to
 * `renderNode`, and produced an empty text node: a menu box with nothing in it,
 * no error and no warning.
 */
function objectMenuItem(raw: unknown): { view: MenuItemView; action: unknown } | "separator" | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.__kind !== undefined) return null; // a component node, handled above
  if (r.separator === true || asString(r.type) === "separator") return "separator";
  const label = asString(r.label ?? r.title ?? r.text);
  if (!label) return null;
  return {
    view: menuItemView({ ...r, label }),
    action: r.onClick ?? r.action,
  };
}

/**
 * Attach the menu's close wiring to an item button, preserving whatever click
 * handler the item already carries. Reading the item's `args` by index instead
 * of rendering it dropped `sx` / `key` and every other universal prop, and a
 * nested array of MenuItems escaped the wiring entirely so those items fired
 * their action but left the menu open.
 */
function wireMenuItem(rendered: Node, ctl: OpenController): void {
  if (!(rendered instanceof HTMLElement)) return;
  if (!rendered.classList.contains("rui-menu-item")) return;
  const inner = rendered.onclick;
  const keepOpen = rendered.getAttribute("data-keep-open") === "true";
  rendered.onclick = (event) => {
    const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
    if (!origin) return;
    const item = origin.closest(".rui-menu-item") as HTMLElement | null;
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    if (!keepOpen) setDropdownOpen(item, false, ctl);
    inner?.call(item as unknown as GlobalEventHandlers, event);
  };
}

/** Flatten nested item arrays (`[MenuLabel(…), $users.map(…)]`). */
function flattenItems(raw: unknown, depth = 4): unknown[] {
  const out: unknown[] = [];
  for (const entry of asArray<unknown>(raw)) {
    if (Array.isArray(entry) && depth > 0) out.push(...flattenItems(entry, depth - 1));
    else out.push(entry);
  }
  return out;
}

let menuIdSeq = 0;

export const DropdownMenu: ComponentSpec = {
  name: "DropdownMenu",
  description:
    "Click-triggered dropdown menu. Click the trigger to toggle, click a " +
    "MenuItem to run its action and close, click outside or press Escape to " +
    "close without acting; ArrowUp/ArrowDown/Home/End and typeahead move " +
    "between items. Items may be MenuItem / MenuSeparator / MenuLabel nodes, " +
    "nested arrays of them, or plain `{label, onClick, icon?, shortcut?, " +
    "disabled?, checked?, separator?}` objects. Bind a `$variable` to `open` " +
    "for two-way control, or watch `onOpenChange(isOpen)`.",
  props: [
    { name: "trigger", type: "Node", description: "Clickable trigger element (typically a Button or Avatar)" },
    { name: "items", type: "(MenuItem | MenuSeparator | MenuLabel)[]" },
    { name: "side", type: "string", optional: true, enum: MENU_SIDES, description: "Where the menu opens relative to the trigger (default \"bottom\")" },
    { name: "align", type: "string", optional: true, enum: MENU_ALIGNS, description: "How the menu aligns along the trigger edge (default \"start\")" },
    { name: "label", type: "string", optional: true, description: "Optional ARIA label for the menu" },
    { name: "open", type: "boolean", optional: true, description: "Open state — bind a `$variable` for two-way control (an action can then close the menu); a plain `true` pre-opens it" },
    { name: "onOpenChange", type: "callable", optional: true, description: "(isOpen) => … fired whenever the menu opens or closes (lazy-load contents, keep a row highlighted, log usage)" },
    { name: "disabled", type: "boolean", optional: true, description: "Disable the trigger entirely (read-only or in-flight record)" },
  ],
  render: (node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    // `open` is authoritative when it is $-bound; otherwise the user's toggle
    // lives in an instance slot stamped with the prop it started from, so an
    // author-driven change still wins but an unrelated commit cannot slam the
    // menu shut mid-interaction.
    const openRef = node.argMeta?.[5]?.stateRef;
    const propOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<{ prop: boolean; value: boolean } | null>("rui-dropdown-open", null);
    const stored = openSlot.get();
    const followProp = !stored || stored.prop !== propOpen;
    if (followProp) openSlot.set({ prop: propOpen, value: propOpen });
    const isOpen = !disabled && (openRef || followProp ? propOpen : stored!.value);

    const ctl: OpenController = {
      get: () => openSlot.get()?.value ?? propOpen,
      set: (next) => {
        const current = openSlot.get();
        // Several close paths can fire for one logical close (item click, then
        // the dismiss listener); only a real transition is worth announcing.
        if (current && current.value === next) return;
        openSlot.set({ prop: propOpen, value: next });
        if (openRef) helpers.setState(openRef, next);
        helpers.invoke(props.onOpenChange, next);
      },
    };

    // Stable per-instance id: it names the label groups below, and it is how a
    // reparented panel finds its way back to this root (see `dropdownRootOf`).
    const idSlot = helpers.useInstanceState<string>("rui-dropdown-id", "");
    if (!idSlot.get()) idSlot.set(`rui-menu-${(menuIdSeq += 1)}`);
    const menuId = idSlot.get();

    const root = el("div", {
      class: "rui-dropdown-menu",
      "data-menu-id": menuId,
      "data-open": isOpen ? "true" : "false",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start"),
      "data-disabled": disabled ? "true" : null,
    });

    // Render the user's trigger directly (Button, Avatar, IconButton, …) and
    // wrap it in a span so we don't nest <button> inside <button> (invalid HTML,
    // and silently swallows clicks in some browsers).
    const triggerWrap = el("span", {
      class: "rui-dropdown-menu-trigger",
      "data-state": isOpen ? "open" : "closed",
      "aria-expanded": isOpen ? "true" : "false",
      "aria-disabled": disabled ? "true" : null,
    });
    triggerWrap.append(helpers.renderNode(props.trigger));
    // Exactly one tab stop for one control: when the author's trigger is itself
    // focusable it owns the tab stop and the ARIA state; only a non-interactive
    // trigger (Avatar, Text, an icon) promotes the wrapper to a button.
    const innerControl = triggerWrap.querySelector<HTMLElement>(TRIGGER_FOCUSABLE);
    if (innerControl) {
      innerControl.setAttribute("aria-haspopup", "menu");
      innerControl.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (disabled) innerControl.setAttribute("aria-disabled", "true");
    } else {
      triggerWrap.setAttribute("role", "button");
      triggerWrap.setAttribute("aria-haspopup", "menu");
      if (!disabled) triggerWrap.setAttribute("tabindex", "0");
    }

    /** Open (or close) from the trigger, optionally taking focus into the menu. */
    const toggleFrom = (origin: Element, next: boolean, moveFocus: boolean): void => {
      const liveRoot = setDropdownOpen(origin, next, ctl);
      if (!liveRoot) return;
      if (!next) return;
      installDismiss(liveRoot, ctl);
      // Keyboard opens move focus into the menu (a pointer open leaves it on the
      // trigger, matching every other menu implementation).
      if (!moveFocus) return;
      // Land on something actionable when there is one — an `aria-disabled` row
      // is reachable by arrow key, but it is a dead landing spot on open.
      const items = menuItemsOf(liveRoot);
      (items.find((item) => !itemDisabled(item)) ?? items[0])?.focus();
    };

    // Property-based handlers so the morph reconciler can copy the latest
    // closure (with up-to-date `ctl`) onto kept DOM. `addEventListener` would
    // leak fresh listeners onto every detached re-render snapshot.
    if (!disabled) {
      triggerWrap.onclick = (event) => {
        event.stopPropagation();
        const origin = (event.currentTarget ?? event.target) as Element;
        toggleFrom(origin, !ctl.get(), false);
      };
      triggerWrap.onkeydown = (event) => {
        const e = event as KeyboardEvent;
        const origin = (e.currentTarget ?? e.target) as Element;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleFrom(origin, !ctl.get(), true);
          return;
        }
        if (e.key === "ArrowDown" && !ctl.get()) {
          e.preventDefault();
          toggleFrom(origin, true, true);
          return;
        }
        if (e.key === "Escape" && ctl.get()) {
          e.preventDefault();
          setDropdownOpen(origin, false, ctl);
        }
      };
    }
    root.append(triggerWrap);

    const content = el("div", {
      class: "rui-dropdown-menu-content",
      role: "menu",
      "aria-label": asString(props.label) || null,
      "data-menu-root": menuId,
    });

    // A `role="menu"` may only contain menuitems (and groups of them), so a
    // MenuLabel opens a `role="group"` that the following items join and a
    // separator closes again. That keeps the label as the group's accessible
    // name instead of a stray non-menuitem child.
    let group: HTMLElement | null = null;
    const target = (): HTMLElement => group ?? content;
    const separator = (): HTMLElement =>
      el("div", { class: "rui-menu-separator", role: "separator" });

    // Flattened first: a nested array (`$users.map(u => MenuItem(…))`) used to
    // fall through to `renderNode`, which rendered those items through their
    // standalone path — they fired their action but never closed the menu.
    flattenItems(props.items).forEach((raw, index) => {
      if (isMenuChild(raw, "MenuItem")) {
        // Rendered through MenuItem's own spec so the universal channel and
        // `key:` survive, then wired for close — instead of re-reading `args`.
        const itemProps = mapPositionalArgs(MenuItem, raw.args ?? []);
        const rendered = MenuItem.render(raw as Parameters<typeof MenuItem.render>[0], itemProps, helpers);
        if (raw.universal) applyUniversal(rendered, raw.universal);
        if (raw.explicitKey != null && rendered instanceof Element && !rendered.hasAttribute("data-rui-key")) {
          rendered.setAttribute("data-rui-key", String(raw.explicitKey));
        }
        wireMenuItem(rendered, ctl);
        target().append(rendered);
        return;
      }
      if (isMenuChild(raw, "MenuSeparator")) {
        group = null;
        content.append(separator());
        return;
      }
      if (isMenuChild(raw, "MenuLabel")) {
        const labelId = `${menuId}-label-${index}`;
        // `display: contents` keeps the panel's own flex column (and its `gap`)
        // in charge of the rows, so grouping is purely semantic.
        group = el("div", {
          class: "rui-menu-group",
          role: "group",
          "aria-labelledby": labelId,
          style: "display:contents",
        });
        group.append(el("div", {
          class: "rui-menu-label",
          id: labelId,
          role: "presentation",
        }, [asString((raw.args ?? [])[0])]));
        content.append(group);
        return;
      }
      const plain = objectMenuItem(raw);
      if (plain === "separator") {
        group = null;
        content.append(separator());
        return;
      }
      if (plain) {
        const btn = menuItemButton(plain.view);
        if (!plain.view.disabled) {
          btn.onclick = () => { helpers.invoke(plain.action); };
        }
        wireMenuItem(btn, ctl);
        target().append(btn);
        return;
      }
      // Fallback: arbitrary child nodes (Link, Switch, …) so the LLM can nest
      // controls in a menu. Wrapped in `role="none"` so they do not masquerade
      // as menu items in the accessibility tree.
      const custom = el("div", { class: "rui-menu-custom", role: "none", style: "display:contents" });
      custom.append(helpers.renderNode(raw));
      target().append(custom);
    });

    // Keyboard model for `role="menu"` (X.3). Items are real buttons, so
    // Enter/Space activate natively; this adds the navigation the role implies.
    content.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const origin = (e.currentTarget ?? e.target) as HTMLElement | null;
      const live = origin ? dropdownRootOf(origin) : null;
      if (!live) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDropdownOpen(live, false, ctl);
        triggerTabStop(live)?.focus?.();
        return;
      }
      if (e.key === "Tab") {
        // Tab leaves the menu; close first so the panel is not left floating
        // over whatever the user lands on.
        setDropdownOpen(live, false, ctl);
        return;
      }
      // Unavailable rows stay in the ring: announcing one as
      // present-but-unavailable is only useful if the user can reach it.
      const items = menuItemsOf(live);
      if (items.length === 0) return;
      const doc = live.getRootNode() as Document | ShadowRoot;
      const active = doc.activeElement as HTMLElement | null;
      const idx = items.indexOf((active?.closest(".rui-menu-item") ?? null) as HTMLButtonElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx <= 0 ? items.length : idx) - 1]?.focus();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
        return;
      }
      // Typeahead: jump to the next item whose label starts with the character.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      // Never steal a character from a control the menu is hosting — the
      // `role="none"` fallback below lets authors nest an input or a Switch.
      const from = e.target as HTMLElement | null;
      if (from?.closest(".rui-menu-custom") || from?.isContentEditable) return;
      const ch = e.key.toLowerCase();
      for (let i = 1; i <= items.length; i += 1) {
        const candidate = items[(Math.max(idx, 0) + i) % items.length]!;
        const text = candidate.querySelector(".rui-menu-item-label")?.textContent ?? "";
        if (!text.trim().toLowerCase().startsWith(ch)) continue;
        e.preventDefault();
        candidate.focus();
        return;
      }
    };
    root.append(content);

    // Positioning and dismissal are driven from the RENDER path, not only from
    // the toggle handlers: a menu that is open on its first paint (`open: true`,
    // or a $-bound `open` flipped by an action) got neither, so nothing could
    // dismiss it and the panel stayed trapped in its clipping ancestor.
    //
    // The mounted root is only reachable after paint — on a re-render the
    // reconciler keeps the previous node and discards this one, hence the slot.
    const liveSlot = helpers.useInstanceState<HTMLElement | null>("rui-dropdown-live", null);
    deferToPaint(() => {
      const live = root.isConnected ? root : liveSlot.get();
      if (!live?.isConnected) return;
      liveSlot.set(live);
      applyOpenAttrs(live, isOpen);
      syncFloatingLayer(live, isOpen);
      // Re-installed each render so the listeners always hold this render's
      // `onOpenChange` / binding rather than the mount-time closure.
      if (isOpen) installDismiss(live, ctl);
      else releaseDismiss(live);
    });
    return root;
  },
};

export const MenuItem: ComponentSpec = {
  name: "MenuItem",
  description:
    "Single item inside a DropdownMenu. Renders a button-style row with an " +
    "optional leading icon and trailing keyboard-shortcut hint. `onClick` " +
    "(legacy: `action`) runs when clicked and the menu closes afterwards — set " +
    "`keepOpen=true` for a toggle the user flips several times. Pass `checked` " +
    "for a checkbox item (or `role=\"menuitemradio\"` with `checked` for a " +
    "radio group, e.g. a sort direction or theme picker).",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable to execute on click" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown before the label" },
    { name: "shortcut", type: "string", optional: true, description: "Trailing keyboard-shortcut hint (e.g. \"⌘ K\")" },
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: MENU_VARIANTS, description: "Use \"danger\" for destructive actions" },
    { name: "disabled", type: "boolean", optional: true, description: "Unavailable action — the row stays visible and reachable by keyboard, is announced as disabled, and does nothing when activated" },
    { name: "checked", type: "boolean", optional: true, description: "Render as a checkable item showing this state (implies `role=\"menuitemcheckbox\"`)" },
    { name: "role", type: "string", optional: true, enum: MENU_ITEM_ROLES, description: "ARIA role — use \"menuitemradio\" with `checked` for a one-of-many group" },
    { name: "keepOpen", type: "boolean", optional: true, description: "Leave the menu open after this item is activated (toggles, multi-select)" },
  ],
  // Standalone render (when used outside a DropdownMenu): an inert button so
  // the structure still appears, but without the parent's open/close wiring.
  render: (_node, props, helpers) => {
    const view = menuItemView(props as Parameters<typeof menuItemView>[0]);
    const btn = menuItemButton(view);
    if (!view.disabled) {
      btn.onclick = () => {
        helpers.invoke(props.onClick);
      };
    }
    return btn;
  },
};

export const MenuSeparator: ComponentSpec = {
  name: "MenuSeparator",
  description: "Thin horizontal rule used inside a DropdownMenu to group items.",
  props: [],
  render: () => el("div", { class: "rui-menu-separator", role: "separator" }),
};

export const MenuLabel: ComponentSpec = {
  name: "MenuLabel",
  description:
    "Small uppercase section header inside a DropdownMenu. Use to group " +
    "related MenuItems (e.g. \"Account\", \"Workspace\", \"Danger zone\").",
  props: [{ name: "label", type: "string" }],
  render: (_node, props) =>
    el("div", { class: "rui-menu-label" }, [asString(props.label)]),
};
