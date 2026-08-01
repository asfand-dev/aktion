/**
 * Routing-related library components.
 *
 * In Aktion 0.5 routing is expressed with the
 * `Router({...})` call (see `src/runtime/router.ts` and the
 * `evaluateRouterCall` intercept in `runtime/evaluator.ts`). The legacy
 * `Routes(...)` outlet and `Route(...)` row components, and the
 * `$router = router { … }` block syntax, were removed in the 0.5
 * cleanup pass. The only routing-related component that still ships is
 * `NavLink`, which navigates via `helpers.router.navigate(to)`.
 */

import type { ComponentSpec } from "../types.js";
import { asBoolean, asString, el, renderIcon } from "../utils.js";

export const NavLink: ComponentSpec = {
  name: "NavLink",
  description:
    "Anchor that navigates to a route on click and stays in sync with the URL hash. " +
    "Reflects `data-active=\"true\"` (and `aria-current=\"page\"` for assistive tech) " +
    "when the current path matches `to` (set `exact=true` " +
    "to require exact equality instead of prefix matching).",
  props: [
    { name: "label", type: "string", description: "Visible link text." },
    { name: "to", type: "string", description: "Target route path, e.g. \"/about\"." },
    {
      name: "variant", aliases: ["tone"],
      type: "string",
      optional: true,
      enum: ["default", "primary", "ghost", "pill"],
      description: "Visual variant.",
    },
    {
      name: "exact",
      type: "boolean",
      optional: true,
      description: "Match the current path exactly (default: prefix match).",
    },
    {
      name: "icon",
      type: "string",
      optional: true,
      description: "Optional Font Awesome icon name shown before the label.",
    },
    {
      name: "prefetch",
      type: "callable",
      optional: true,
      description: "Called once on first hover/focus (warm a `$query` cache for the target route).",
    },
    {
      name: "disabled",
      type: "boolean",
      optional: true,
      description: "Grey out the link and make it unclickable / unfocusable (a route the user cannot enter yet).",
    },
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label, "");
    const to = asString(props.to, "/");
    const variant = asString(props.variant, "default");
    const exact = asBoolean(props.exact, false);
    const disabled = asBoolean(props.disabled, false);
    const router = helpers.router;
    const currentPath = router.getPath();

    const isActive = (() => {
      if (!currentPath) return false;
      if (exact) return currentPath === to;
      if (to === "/") return currentPath === "/";
      if (currentPath === to) return true;
      return currentPath.startsWith(to + "/");
    })();

    const anchor = el("a", {
      class: "rui-nav-link",
      "data-variant": variant,
      "data-active": isActive ? "true" : "false",
      // Expose the active route to assistive tech, not just CSS.
      "aria-current": isActive ? "page" : null,
      // A disabled link drops its href so it is neither activatable nor a tab
      // stop; `data-disabled` is the styling hook (and the house convention).
      "data-disabled": disabled ? "true" : null,
      "aria-disabled": disabled ? "true" : null,
      tabindex: disabled ? "-1" : null,
      href: disabled ? null : "#" + (to.startsWith("/") ? to : "/" + to),
    });

    const iconNode = renderIcon(props.icon, { className: "rui-nav-link-icon" });
    if (iconNode) anchor.append(iconNode);
    anchor.append(el("span", { class: "rui-nav-link-label" }, [label]));

    // Prefetch-on-hover (IV.7): fire the author's `prefetch` callable once on
    // the first pointer-enter / focus so a `$query` for the target route can
    // warm its cache before the user clicks (the click then renders instantly).
    //
    // Property handlers, not `addEventListener`: the morph reconciler keeps the
    // live anchor and copies `onpointerenter`/`onfocus` onto it, so the handler
    // always carries the current render's closure. A registered listener would
    // stay frozen on the mount-time props — warming the cache for a filter the
    // user has since changed. The once-only flag lives in instance state for
    // the same reason: a plain local resets on every render.
    if (!disabled && typeof props.prefetch === "function") {
      const warmedSlot = helpers.useInstanceState<boolean>("rui-navlink-warmed", false);
      const warm = (): void => {
        if (warmedSlot.get()) return;
        warmedSlot.set(true);
        helpers.invoke(props.prefetch, to);
      };
      anchor.onpointerenter = warm;
      anchor.onfocus = warm;
    }

    if (!disabled) {
      anchor.onclick = (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        router.navigate(to);
      };
    }

    return anchor;
  },
};
