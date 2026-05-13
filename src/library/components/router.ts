/**
 * Hash-based routing components.
 *
 * - `Routes(items, default?)` — outlet that renders the matching `Route`.
 *   The match itself is computed inside the evaluator (so path parameters
 *   are scoped correctly to the matched page's content); by the time this
 *   component's `render` is reached, `node.args[0]` is the already-evaluated
 *   content of the matched page (or `null` if nothing matched).
 *
 * - `Route(path, content)` — declares a single page. When used standalone
 *   (no `Routes` parent) it simply renders its content, so the LLM-emitted
 *   page is still usable as a single-page layout.
 *
 * - `NavLink(label, to, variant?, exact?)` — anchor that triggers a hash
 *   navigation on click. Reflects `data-active="true"` when the current
 *   route matches `to` so the prompt can drive an active styling state
 *   without an extra `$variable`.
 */

import type { ComponentSpec } from "../types.js";
import type { ActionPayload } from "../../runtime/builtins.js";
import { asBoolean, asString, el, renderIcon } from "../utils.js";

export const Routes: ComponentSpec = {
  name: "Routes",
  description:
    "Router outlet: renders the matching Route based on the current hash path (`#/page`). " +
    "Children must be Route(path, content) entries. The optional `default` argument is the " +
    "path of the Route to render when no other path matches (useful for a 404/home fallback).",
  props: [
    {
      name: "items",
      type: "Route[]",
      description: "Array of Route(path, content) entries. The first match wins.",
    },
    {
      name: "default",
      type: "string",
      optional: true,
      description: "Path of the Route to fall back to when no entry matches (e.g. \"/\").",
    },
  ],
  render: (node, _props, helpers) => {
    // The evaluator has already resolved the match — `node.args[0]` is the
    // matched content (or `null`) and `node.args[1]` is the matched pattern.
    const content = node.args[0];
    const matchedPath = asString(node.args[1]);
    const outlet = el("div", {
      class: "rui-routes",
      "data-active-route": matchedPath || null,
    });
    if (content !== null && content !== undefined) {
      outlet.append(helpers.renderNode(content));
    }
    return outlet;
  },
};

export const Route: ComponentSpec = {
  name: "Route",
  description:
    "Declares a single page inside a Routes container. `path` supports literal segments " +
    "(\"/about\"), parameter segments (\"/users/:id\"), and a trailing wildcard (\"/docs/*\"). " +
    "Inside `content`, read path parameters via the `params` loop variable, e.g. `params.id`.",
  props: [
    {
      name: "path",
      type: "string",
      description: "Route pattern, e.g. \"/\", \"/about\", or \"/users/:id\".",
    },
    {
      name: "content",
      type: "Node",
      description: "Page UI rendered when this route is active.",
    },
  ],
  render: (_node, props, helpers) => {
    // When Route is used standalone (no Routes parent), just render its
    // content so the LLM-emitted page still works as a single-page layout.
    const content = props.content;
    const wrapper = el("div", { class: "rui-route" });
    if (content !== null && content !== undefined) {
      wrapper.append(helpers.renderNode(content));
    }
    return wrapper;
  },
};

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

    // Intercept the click so we can keep state changes synchronous instead of
    // waiting for the browser's hashchange event.
    anchor.onclick = (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      // Build the action payload manually so we go through the same action
      // pipeline as `@Navigate(...)` — keeps the runtime in one place.
      const payload: ActionPayload = {
        kind: "Action",
        steps: [{ kind: "Navigate", path: to }],
      };
      helpers.runAction(payload);
    };

    return anchor;
  },
};
