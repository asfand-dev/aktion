/**
 * Dropdown menu primitives modeled after shadcn/ui.
 *
 *   DropdownMenu(trigger, items, side?, align?, label?)
 *   MenuItem(label, action?, icon?, shortcut?, variant?, disabled?)
 *   MenuSeparator()
 *   MenuLabel(label)
 *
 * `DropdownMenu` keeps its open/closed state persistent across re-renders via
 * `helpers.useInstanceState`, so unrelated state changes (typing into an
 * input, ticking a checkbox, …) do not collapse the menu mid-interaction.
 * Clicking the trigger toggles it; clicking a `MenuItem` runs its action and
 * closes; clicking anywhere outside the menu also closes (handled by an
 * outside-click listener attached lazily to the host shadow root on open).
 *
 * The trigger is rendered inside a `<span>` wrapper (not a nested `<button>`)
 * so that user-provided triggers like `Button("Open")` or `Avatar(...)`
 * remain valid HTML and receive clicks reliably.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asBoolean, renderIcon } from "../utils.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";

const MENU_SIDES = ["bottom", "top", "left", "right"] as const;
const MENU_ALIGNS = ["start", "center", "end"] as const;
const MENU_VARIANTS = ["default", "danger"] as const;

/**
 * Walk up the live DOM and toggle the dropdown's open state, keeping the
 * persisted instance-state slot in sync. Modifies the DOM directly so the
 * interaction feels instant without waiting for a render tick.
 */
const setDropdownOpen = (
  origin: Element,
  next: boolean,
  openSlot: { set: (value: boolean) => void },
): HTMLElement | null => {
  openSlot.set(next);
  const liveRoot = origin.closest(".rui-dropdown-menu") as HTMLElement | null;
  if (!liveRoot) return null;
  liveRoot.setAttribute("data-open", next ? "true" : "false");
  const trigger = liveRoot.querySelector(".rui-dropdown-menu-trigger");
  trigger?.setAttribute("aria-expanded", next ? "true" : "false");
  // Any path that closes the menu also releases the dismissal listeners so
  // we don't accumulate stale listener pairs on the host shadow root.
  if (!next) disposeDismissListeners(liveRoot);
  return liveRoot;
};

const installOutsideClickClose = (
  liveRoot: HTMLElement,
  openSlot: { set: (value: boolean) => void },
): void => {
  installDismissListeners({
    liveRoot,
    onDismiss: () => {
      openSlot.set(false);
      liveRoot.setAttribute("data-open", "false");
      liveRoot.querySelector(".rui-dropdown-menu-trigger")
        ?.setAttribute("aria-expanded", "false");
    },
  });
};

interface MenuItemNode {
  __kind?: string;
  name?: string;
  args?: unknown[];
  argMeta?: unknown[];
}

const isMenuChild = (item: unknown, name: string): item is MenuItemNode => {
  if (!item || typeof item !== "object") return false;
  const node = item as MenuItemNode;
  return node.__kind === "Component" && node.name === name;
};

export const DropdownMenu: ComponentSpec = {
  name: "DropdownMenu",
  description:
    "Click-triggered dropdown menu. Click the trigger to toggle, click a " +
    "MenuItem to run its action and close, click outside or press Escape " +
    "to close without acting. Children must be MenuItem, MenuSeparator, " +
    "or MenuLabel entries.",
  props: [
    { name: "trigger", type: "Node", description: "Clickable trigger element (typically a Button or Avatar)" },
    { name: "items", type: "(MenuItem | MenuSeparator | MenuLabel)[]" },
    { name: "side", type: "string", optional: true, enum: MENU_SIDES, description: "Where the menu opens relative to the trigger (default \"bottom\")" },
    { name: "align", type: "string", optional: true, enum: MENU_ALIGNS, description: "How the menu aligns along the trigger edge (default \"start\")" },
    { name: "label", type: "string", optional: true, description: "Optional ARIA label for the menu" },
    { name: "open", type: "boolean", optional: true, description: "Initial open state — use to demo or pre-open the menu" },
  ],
  render: (_node, props, helpers) => {
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", initialOpen);
    const isOpen = openSlot.get();

    const root = el("div", {
      class: "rui-dropdown-menu",
      "data-open": isOpen ? "true" : "false",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start"),
    });

    // Render the user's trigger directly (Button, Avatar, IconButton, …)
    // and wrap it in a span so we don't nest <button> inside <button>
    // (which is invalid HTML and silently swallows clicks in some browsers).
    const triggerWrap = el("span", {
      class: "rui-dropdown-menu-trigger",
      "data-state": isOpen ? "open" : "closed",
      "aria-haspopup": "menu",
      "aria-expanded": isOpen ? "true" : "false",
      tabindex: "0",
    });
    triggerWrap.append(helpers.renderNode(props.trigger));
    // Property-based handlers so the morph reconciler can copy the latest
    // closure (with up-to-date `openSlot`) onto kept DOM. `addEventListener`
    // would leak fresh listeners onto every detached re-render snapshot.
    triggerWrap.onclick = (event) => {
      event.stopPropagation();
      const origin = (event.currentTarget ?? event.target) as Element;
      const next = !openSlot.get();
      const liveRoot = setDropdownOpen(origin, next, openSlot);
      if (next && liveRoot) installOutsideClickClose(liveRoot, openSlot);
    };
    triggerWrap.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const origin = (e.currentTarget ?? e.target) as Element;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const next = !openSlot.get();
        const liveRoot = setDropdownOpen(origin, next, openSlot);
        if (next && liveRoot) installOutsideClickClose(liveRoot, openSlot);
        return;
      }
      if (e.key === "Escape" && openSlot.get()) {
        e.preventDefault();
        setDropdownOpen(origin, false, openSlot);
      }
    };
    root.append(triggerWrap);

    const content = el("div", {
      class: "rui-dropdown-menu-content",
      role: "menu",
      "aria-label": asString(props.label) || null,
    });

    for (const raw of asArray<unknown>(props.items)) {
      if (isMenuChild(raw, "MenuItem")) {
        const args = raw.args ?? [];
        const label = asString(args[0]);
        const action = args[1];
        const icon = args[2];
        const shortcut = asString(args[3]);
        const variant = asString(args[4], "default");
        const disabled = asBoolean(args[5]);
        const btn = el("button", {
          type: "button",
          class: "rui-menu-item",
          role: "menuitem",
          "data-variant": variant,
          disabled: disabled ? "" : null,
        });
        const iconNode = renderIcon(icon, { className: "rui-menu-item-icon" });
        if (iconNode) btn.append(iconNode);
        btn.append(el("span", { class: "rui-menu-item-label" }, [label]));
        if (shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [shortcut]));
        if (!disabled) {
          btn.onclick = (event) => {
            const origin = (event.currentTarget ?? event.target) as Element;
            setDropdownOpen(origin, false, openSlot);
            helpers.invoke(action);
          };
        }
        content.append(btn);
        continue;
      }
      if (isMenuChild(raw, "MenuSeparator")) {
        content.append(el("div", { class: "rui-menu-separator", role: "separator" }));
        continue;
      }
      if (isMenuChild(raw, "MenuLabel")) {
        const label = asString((raw.args ?? [])[0]);
        content.append(el("div", { class: "rui-menu-label" }, [label]));
        continue;
      }
      // Fallback: render arbitrary child nodes (Link, Switch, …) so the LLM
      // can nest controls inside a menu when it needs to.
      content.append(helpers.renderNode(raw));
    }
    root.append(content);
    return root;
  },
};

export const MenuItem: ComponentSpec = {
  name: "MenuItem",
  description:
    "Single item inside a DropdownMenu. Renders a button-style row with an " +
    "optional leading icon and trailing keyboard-shortcut hint. `onClick` " +
    "(legacy: `action`) runs when clicked; the menu closes automatically " +
    "afterwards.",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable to execute on click" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown before the label" },
    { name: "shortcut", type: "string", optional: true, description: "Trailing keyboard-shortcut hint (e.g. \"⌘ K\")" },
    { name: "variant", type: "string", optional: true, enum: MENU_VARIANTS, description: "Use \"danger\" for destructive actions" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  // Standalone render (when used outside a DropdownMenu): an inert button so
  // the structure still appears, but without the parent's open/close wiring.
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const btn = el("button", {
      type: "button",
      class: "rui-menu-item",
      role: "menuitem",
      "data-variant": asString(props.variant, "default"),
      disabled: disabled ? "" : null,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-menu-item-icon" });
    if (iconNode) btn.append(iconNode);
    btn.append(el("span", { class: "rui-menu-item-label" }, [asString(props.label)]));
    const shortcut = asString(props.shortcut);
    if (shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [shortcut]));
    if (!disabled) {
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
