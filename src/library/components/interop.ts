/**
 * Third-party / imperative widget interop primitives.
 *
 *   Mount(...)        — a managed imperative-component host with a clean
 *                       lifecycle (setup → update → cleanup). Aktion owns the
 *                       host element; you fill it with a chart, map, editor,
 *                       payment element, … and react to prop changes.
 *   WebComponent(...) — render + hydrate ANY custom element / web component
 *                       with reactive attributes / properties and event hooks.
 *
 * Both mark their host with `data-rui-preserve` so the morph reconciler keeps
 * the live element and never touches the DOM the widget owns — only Aktion's
 * own attributes (class / inline `sx` style) keep flowing through.
 */

import type { ComponentSpec } from "../types.js";
import { el, asString } from "../utils.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Shallow structural equality for the `props` bag (Object.is per key). */
function shallowEqual(a: Record<string, unknown> | null, b: Record<string, unknown>): boolean {
  if (a === null) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/** Defer a callback to a microtask (after the reconcile pass attaches DOM). */
function defer(run: () => void): void {
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else void Promise.resolve().then(run);
}

const HOST_TAGS = new Set([
  "div", "span", "section", "article", "aside", "figure", "canvas", "p", "pre", "form",
]);

function resolveHostTag(input: unknown): string {
  const name = asString(input).trim().toLowerCase();
  return HOST_TAGS.has(name) ? name : "div";
}

interface MountState {
  started: boolean;
  instance: unknown;
  /** Latest widget props — read by the deferred setup + compared on update. */
  props: Record<string, unknown>;
  prevProps: Record<string, unknown> | null;
}

/* ------------------------------------------------------------------------ *
 * Mount — managed imperative component.
 * ------------------------------------------------------------------------ */
export const Mount: ComponentSpec = {
  name: "Mount",
  description:
    "First-class host for an imperative / third-party widget that owns its " +
    "own DOM (chart, map, editor, payment element, captcha, video SDK). " +
    "Aktion creates the host element; `setup(node, props)` runs once after it " +
    "attaches and returns an instance handle, `update(instance, props)` runs " +
    "when `props` change (shallow-compared), and `cleanup(instance)` runs on " +
    "unmount. The host is preserved across re-renders so the widget is never " +
    "rebuilt. Apply layout with `sx`.",
  props: [
    { name: "setup", type: "callable", required: true, description: "`(node, props) => instance` — runs once after the host attaches; return value is the instance handle passed to `update`/`cleanup`." },
    { name: "update", type: "callable", optional: true, description: "`(instance, props) => void` — runs when `props` change (shallow-compared)." },
    { name: "cleanup", type: "callable", optional: true, description: "`(instance) => void` — runs when the component leaves the tree (destroy/teardown)." },
    { name: "props", type: "object", optional: true, description: "Reactive prop bag handed to `setup`/`update`. Bind `$state` here to drive the widget." },
    { name: "tag", type: "string", optional: true, enum: ["div", "span", "section", "article", "aside", "figure", "canvas", "p", "pre", "form"], description: "Host element tag (default \"div\")." },
  ],
  render: (_node, props, helpers) => {
    const host = el(resolveHostTag(props.tag) as keyof HTMLElementTagNameMap, {
      class: "rui-mount",
      "data-rui-preserve": "",
    });
    const widgetProps = asRecord(props.props);
    const slot = helpers.useInstanceState<MountState>("rui-mount", {
      started: false,
      instance: undefined,
      props: widgetProps,
      prevProps: null,
    });
    const state = slot.get();
    state.prevProps = state.props;
    state.props = widgetProps;

    if (!state.started) {
      state.started = true;
      defer(() => {
        try {
          state.instance = typeof props.setup === "function"
            ? (props.setup as (node: Node, p: Record<string, unknown>) => unknown)(host, state.props)
            : undefined;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[aktion] Mount setup threw", err);
        }
        if (props.cleanup != null) {
          helpers.registerDisposer(() => {
            defer(() => {
              try {
                if (typeof props.cleanup === "function") {
                  (props.cleanup as (instance: unknown) => void)(state.instance);
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error("[aktion] Mount cleanup threw", err);
              }
            });
          }, "rui-mount-cleanup");
        }
      });
      return host;
    }

    // Re-render: run `update` only when the props bag actually changed. It is
    // deferred to a microtask (like setup) so it runs AFTER the reconcile pass
    // — that keeps it off the render-guard path and lets it safely react.
    if (
      state.instance !== undefined &&
      typeof props.update === "function" &&
      !shallowEqual(state.prevProps, widgetProps)
    ) {
      const update = props.update as (instance: unknown, p: Record<string, unknown>) => void;
      const instance = state.instance;
      defer(() => {
        try {
          update(instance, widgetProps);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[aktion] Mount update threw", err);
        }
      });
    }
    return host;
  },
};

/* ------------------------------------------------------------------------ *
 * WebComponent — native custom-element bridge.
 * ------------------------------------------------------------------------ */

const CUSTOM_ELEMENT_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

function resolveCustomTag(input: unknown): string {
  const name = asString(input).trim().toLowerCase();
  return CUSTOM_ELEMENT_RE.test(name) ? name : "div";
}

function applyAttributes(node: Element, attributes: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (/^on/i.test(key)) continue;
    if (value === null || value === undefined || value === false) {
      node.removeAttribute(key);
      continue;
    }
    node.setAttribute(key, value === true ? "" : String(value));
  }
}

function applyProperties(node: Element, properties: Record<string, unknown>): void {
  const target = node as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(properties)) {
    try { target[key] = value; } catch { /* read-only property */ }
  }
}

interface WebComponentState {
  bound: boolean;
  /** Latest event handlers — the bound listeners always read the current set. */
  handlers: Record<string, unknown>;
  node: Element | null;
}

export const WebComponent: ComponentSpec = {
  name: "WebComponent",
  description:
    "Render and hydrate any native custom element / web component with " +
    "reactive `attributes`, JS `properties`, and `on` event hooks. Use to " +
    "drop a third-party web component (`<stripe-pricing-table>`, " +
    "`<model-viewer>`, a design-system element) into an Aktion app. The " +
    "element is preserved across re-renders; attribute changes flow through " +
    "reactively and listeners stay current. Invalid (hyphen-less) tag names " +
    "fall back to a `div`.",
  props: [
    { name: "tag", type: "string", positional: true, required: true, description: "Custom-element tag name (must contain a hyphen, e.g. \"stripe-pricing-table\")." },
    { name: "attributes", type: "object", optional: true, aliases: ["attrs"], description: "Reactive attribute map. `$state` values update the element on change; `on*` keys are ignored." },
    { name: "properties", type: "object", optional: true, aliases: ["props"], description: "JS properties assigned on the element (for components that take rich, non-string props)." },
    { name: "on", type: "object", optional: true, aliases: ["events"], description: "Event map `{ eventName: handler }` bound once to the live element (handlers stay current across re-renders)." },
    { name: "children", type: "Node[]", optional: true, description: "Light-DOM child nodes / text to slot inside the element." },
  ],
  render: (_node, props, helpers) => {
    const tag = resolveCustomTag(props.tag);
    const node = el(tag as keyof HTMLElementTagNameMap, {
      class: "rui-web-component",
      "data-rui-preserve": "",
    });
    applyAttributes(node, asRecord(props.attributes));
    applyProperties(node, asRecord(props.properties));

    const children = Array.isArray(props.children) ? props.children : props.children != null ? [props.children] : [];
    for (const child of children) {
      if (child == null) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : helpers.renderNode(child));
    }

    const handlers = asRecord(props.on);
    const slot = helpers.useInstanceState<WebComponentState>("rui-web-component", {
      bound: false,
      handlers,
      node: null,
    });
    const state = slot.get();
    state.handlers = handlers; // keep the latest closures for the bound listeners

    if (!state.bound) {
      state.bound = true;
      defer(() => {
        state.node = node;
        for (const eventName of Object.keys(handlers)) {
          node.addEventListener(eventName, (event: Event) => {
            const fn = state.handlers[eventName];
            if (typeof fn === "function") helpers.invoke(fn, event);
          });
        }
      });
    } else if (state.node) {
      // Re-render: push attribute / property updates onto the LIVE element
      // (the fresh `node` here is discarded by the preserve-aware morph).
      applyAttributes(state.node, asRecord(props.attributes));
      applyProperties(state.node, asRecord(props.properties));
    }

    return node;
  },
};
