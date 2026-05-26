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
    "Reflects `data-active=\"true\"` when the current path matches `to` (set `exact=true` " +
    "to require exact equality instead of prefix matching).",
  props: [
    { name: "label", type: "string", description: "Visible link text." },
    { name: "to", type: "string", description: "Target route path, e.g. \"/about\"." },
    {
      name: "variant",
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
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label, "");
    const to = asString(props.to, "/");
    const variant = asString(props.variant, "default");
    const exact = asBoolean(props.exact, false);
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
      href: "#" + (to.startsWith("/") ? to : "/" + to),
    });

    const iconNode = renderIcon(props.icon, { className: "rui-nav-link-icon" });
    if (iconNode) anchor.append(iconNode);
    anchor.append(el("span", { class: "rui-nav-link-label" }, [label]));

    anchor.onclick = (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.navigate(to);
    };

    return anchor;
  },
};
