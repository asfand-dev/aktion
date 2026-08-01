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
import { el, asArray, asString, sanitiseHref, sanitiseImageSrc } from "../utils.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A `{...}` literal, as opposed to a class instance / DOM node / widget handle. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * How deep the `props` comparison walks. `Object.is` alone is useless here: the
 * DSL rebuilds every object/array literal on each evaluation, so
 * `props: { config: { series: $rows } }` compared false on every unrelated
 * keystroke and re-ran an expensive `setOption` on a chart or map. Walking a few
 * levels of plain literals catches that while still comparing widget handles,
 * class instances and DOM nodes by identity (where structural equality would be
 * both wrong and expensive).
 */
const COMPARE_DEPTH = 4;

function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameValue(a[i], b[i], depth - 1)) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    for (const key of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!sameValue(a[key], b[key], depth - 1)) return false;
    }
    return true;
  }
  return false;
}

/** Structural equality for the `props` bag (or an explicit `deps` list). */
function sameBag(a: unknown, b: unknown): boolean {
  return sameValue(a, b, COMPARE_DEPTH);
}

/** Defer a callback to a microtask (after the reconcile pass attaches DOM). */
function defer(run: () => void): void {
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else void Promise.resolve().then(run);
}

let HOST_SEQ = 0;

/** A selector-safe host identity, preferring the author's own `key:`. */
function hostKey(explicitKey: unknown, prefix: string): string {
  const authored = explicitKey == null ? "" : String(explicitKey);
  if (authored && /^[A-Za-z0-9_.:-]+$/.test(authored)) return authored;
  return `${prefix}-${(HOST_SEQ += 1)}`;
}

/** Depth-limited descendant search that crosses open shadow boundaries. */
function queryDeep(root: Document | ShadowRoot, selector: string, depth: number): Element | null {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  if (depth <= 0) return null;
  for (const candidate of Array.from(root.querySelectorAll("*"))) {
    // Only a custom element hosts a shadow root in practice (the app's own
    // `<aktion-app>` is one), so this keeps the walk cheap on a large host page.
    if (!candidate.tagName.includes("-")) continue;
    const shadow = (candidate as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (!shadow) continue;
    const hit = queryDeep(shadow, selector, depth - 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve the element that is really on the page for this instance.
 *
 * The reconciler keeps whatever element already occupies the slot and discards
 * the freshly-rendered one, so `rendered` is the mounted node on the first
 * render only. Both hosts therefore carry a stable `data-rui-key`, which the
 * preserve-aware *additive* attribute sync copies onto the incumbent — so the
 * live element is findable by that key even when it started life as some other
 * component's `<div>`. Returning null means the host is not on the page yet;
 * the caller must not initialise a widget against a detached node.
 */
function resolveHost(rendered: Element, key: string): Element | null {
  if (rendered.isConnected) return rendered;
  if (typeof document === "undefined") return null;
  return queryDeep(document, `[data-rui-key="${key}"]`, 4);
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
  /** Latest `deps` list, when the author supplied one. */
  deps: unknown[] | null;
  /** Latest `cleanup` / `onError` callables, read through the stable disposer. */
  cleanup: unknown;
  onError: unknown;
  /** The LIVE host the widget was set up against. */
  node: Element | null;
  /** Host tag this instance was set up with — a change forces a re-setup. */
  tag: string;
  /** Stable identity, stamped on the host as `data-rui-key`. */
  key: string;
  /**
   * The disposer, created once. `registerDisposer` runs the PREVIOUS cleanup
   * whenever the callback identity for a key changes, so a per-render closure
   * would destroy the widget on every re-render.
   */
  disposer: (() => void) | null;
}

/** Report a lifecycle failure to the author's `onError`, and to the console. */
function reportMountError(
  state: MountState,
  invoke: ((callable: unknown, ...args: unknown[]) => void) | null,
  stage: string,
  err: unknown,
): void {
  // eslint-disable-next-line no-console
  console.error(`[aktion] Mount ${stage} threw`, err);
  if (invoke && state.onError != null) invoke(state.onError, err, stage);
}

/**
 * Destroy the widget, reading the CURRENT `cleanup` off the instance slot.
 * Deferred like `setup` so teardown never runs inside a reconcile pass.
 */
function runMountCleanup(state: MountState): void {
  const cleanup = state.cleanup;
  const instance = state.instance;
  state.instance = undefined;
  state.node = null;
  state.started = false;
  if (typeof cleanup !== "function") return;
  defer(() => {
    try {
      (cleanup as (handle: unknown) => void)(instance);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] Mount cleanup threw", err);
    }
  });
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
    "when `props` change (or when `deps` change, if you pass them), and " +
    "`cleanup(instance)` runs on unmount. `onError(err, stage)` fires if " +
    "`setup`/`update` throws, so a failed map / payment element / captcha can " +
    "show a fallback. The host is preserved across re-renders so the widget is " +
    "never rebuilt. Apply layout with `sx`.",
  props: [
    { name: "setup", type: "callable", required: true, description: "`(node, props) => instance` — runs once after the host attaches; return value is the instance handle passed to `update`/`cleanup`." },
    { name: "update", type: "callable", optional: true, description: "`(instance, props) => void` — runs when `props` (or `deps`) change." },
    { name: "cleanup", type: "callable", optional: true, description: "`(instance) => void` — runs when the component leaves the tree (destroy/teardown)." },
    { name: "props", type: "object", optional: true, description: "Reactive prop bag handed to `setup`/`update`. Bind `$state` here to drive the widget." },
    { name: "tag", type: "string", optional: true, enum: ["div", "span", "section", "article", "aside", "figure", "canvas", "p", "pre", "form"], description: "Host element tag (default \"div\")." },
    { name: "deps", type: "any[]", optional: true, description: "Explicit dependency list gating `update`. Use when the `props` bag is rebuilt on every commit, or to force an update after an in-place mutation." },
    { name: "onError", type: "callable", optional: true, description: "`(err, stage) => void` — fired when `setup` or `update` throws (stage is \"setup\" / \"update\")." },
  ],
  render: (node, props, helpers) => {
    const tag = resolveHostTag(props.tag);
    const widgetProps = asRecord(props.props);
    const deps = props.deps === undefined ? null : asArray<unknown>(props.deps);
    const slot = helpers.useInstanceState<MountState>("rui-mount", {
      started: false,
      instance: undefined,
      props: widgetProps,
      prevProps: null,
      deps: null,
      cleanup: null,
      onError: null,
      node: null,
      tag: "",
      key: "",
      disposer: null,
    });
    const state = slot.get();
    if (!state.key) state.key = hostKey(node.explicitKey, "rui-mount");
    // Kept on the slot rather than captured: a `cleanup` (or `onError`) that
    // only resolves on a later render — behind a flag, or after an async import
    // — used to be read once inside the first render's microtask and then never
    // registered, leaking one live widget per visit.
    state.cleanup = props.cleanup;
    state.onError = props.onError;

    const host = el(tag as keyof HTMLElementTagNameMap, {
      class: "rui-mount",
      "data-rui-preserve": "",
      // Stable identity. Without it the reconciler matches the host purely by
      // sibling position, so a Mount that first appears on a later commit was
      // patched onto whatever element already sat in that slot while `setup` ran
      // against the detached fresh one. The key reaches the incumbent through
      // the preserve-aware additive attribute sync, which is what lets
      // `resolveHost` find the element the user is actually looking at.
      "data-rui-key": state.key,
    });

    // A reactive `tag` makes the reconciler REPLACE the element, orphaning the
    // widget that owned the removed node. Tear it down and set up again on the
    // new host instead of leaving a permanently blank box behind.
    if (state.tag && state.tag !== tag) runMountCleanup(state);
    state.tag = tag;

    // The disposer is registered unconditionally, with a STABLE identity, and
    // reads the current `cleanup` off the slot when it runs.
    if (!state.disposer) state.disposer = () => runMountCleanup(state);
    helpers.registerDisposer(state.disposer, "rui-mount-cleanup");

    if (!state.started) {
      state.prevProps = null;
      state.props = widgetProps;
      state.deps = deps;
      defer(() => {
        // `started` flips only once a CONNECTED host exists, so a commit whose
        // fresh host the reconciler discarded simply retries on the next one
        // rather than initialising the widget inside a detached div.
        if (state.started) return;
        const live = resolveHost(host, state.key);
        if (!live) return;
        state.started = true;
        state.node = live;
        // Adopted an incumbent element: its previous contents belong to the
        // component that rendered them, and the widget expects an empty host.
        if (live !== host) live.replaceChildren();
        try {
          state.instance = typeof props.setup === "function"
            ? (props.setup as (n: Node, p: Record<string, unknown>) => unknown)(live, state.props)
            : undefined;
        } catch (err) {
          reportMountError(state, helpers.invoke, "setup", err);
        }
      });
      return host;
    }

    state.prevProps = state.props;
    state.props = widgetProps;
    const prevDeps = state.deps;
    state.deps = deps;

    // Re-render: run `update` only when the inputs actually changed. It is
    // deferred to a microtask (like setup) so it runs AFTER the reconcile pass
    // — that keeps it off the render-guard path and lets it safely react.
    const changed = deps !== null
      ? !sameBag(prevDeps, deps)
      : !sameBag(state.prevProps, widgetProps);
    if (state.instance !== undefined && typeof props.update === "function" && changed) {
      const update = props.update as (instance: unknown, p: Record<string, unknown>) => void;
      const instance = state.instance;
      defer(() => {
        try {
          update(instance, widgetProps);
        } catch (err) {
          reportMountError(state, helpers.invoke, "update", err);
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

/** Tags already reported, so a re-render does not spam the console. */
const WARNED_TAGS = new Set<string>();

function resolveCustomTag(input: unknown): string {
  const name = asString(input).trim().toLowerCase();
  if (CUSTOM_ELEMENT_RE.test(name)) return name;
  // Silently degrading to a `div` that still receives the caller's attributes
  // and properties left the author with an empty box and no clue why — a
  // hyphen typo (`modelviewer`) is the common cause.
  if (name && !WARNED_TAGS.has(name)) {
    WARNED_TAGS.add(name);
    // eslint-disable-next-line no-console
    console.warn(
      `[aktion] WebComponent("${name}") is not a valid custom-element name ` +
      "(it must contain a hyphen) — rendering a <div> instead.",
    );
  }
  return "div";
}

/** Attributes whose value is a URL the browser will load or navigate to. */
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "poster", "ping"]);

function applyAttributes(node: Element, attributes: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (/^on/i.test(key)) continue;
    const lower = key.toLowerCase();
    // `srcdoc` is a whole HTML document; there is no safe way to accept one here.
    if (lower === "srcdoc") continue;
    if (value === null || value === undefined || value === false) {
      node.removeAttribute(key);
      continue;
    }
    if (URL_ATTRIBUTES.has(lower)) {
      const safe = lower === "src" || lower === "poster"
        ? sanitiseImageSrc(value)
        : sanitiseHref(value, "");
      if (safe) node.setAttribute(key, safe);
      else node.removeAttribute(key);
      continue;
    }
    node.setAttribute(key, value === true ? "" : String(value));
  }
}

/**
 * DOM properties that must never be assigned from a DSL-supplied `properties`
 * map. The point of `properties` is to hand structured values (objects,
 * arrays, functions) to a custom element's own API — but the map is applied
 * with `target[key] = value` on a real DOM node, so without a filter it also
 * reaches the node's *built-in* properties. `innerHTML` alone turns
 * `WebComponent("x", { properties: { innerHTML: "<img src=x onerror=…>" } })`
 * into script execution.
 *
 * Event-handler properties (`onclick`, …) are excluded separately by prefix:
 * assigning a string there is inert, but assigning a function would let a DSL
 * value run on a host-page event outside the runtime's handler plumbing.
 */
const BLOCKED_PROPERTIES = new Set([
  "innerhtml", "outerhtml", "insertadjacenthtml", "srcdoc", "src", "href",
  "action", "formaction", "style", "id", "attributes", "shadowroot",
  "contenteditable", "constructor", "__proto__", "prototype",
]);

function applyProperties(node: Element, properties: Record<string, unknown>): void {
  const target = node as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (lower.startsWith("on")) continue;
    if (BLOCKED_PROPERTIES.has(lower)) continue;
    try { target[key] = value; } catch { /* read-only property */ }
  }
}

interface WebComponentState {
  /** Event names already subscribed on `node` — re-diffed on every render. */
  bound: Set<string>;
  /** Latest event handlers — the bound listeners always read the current set. */
  handlers: Record<string, unknown>;
  /** The LIVE element, re-resolved after every commit. */
  node: Element | null;
  /** Stable identity, stamped on the element as `data-rui-key`. */
  key: string;
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
    { name: "children", aliases: ["child"], type: "Node[]", optional: true, description: "Light-DOM child nodes / text to slot inside the element." },
  ],
  render: (node, props, helpers) => {
    const tag = resolveCustomTag(props.tag);
    const handlers = asRecord(props.on);
    const attributes = asRecord(props.attributes);
    const properties = asRecord(props.properties);
    const slot = helpers.useInstanceState<WebComponentState>("rui-web-component", {
      bound: new Set<string>(),
      handlers,
      node: null,
      key: "",
    });
    const state = slot.get();
    state.handlers = handlers; // keep the latest closures for the bound listeners
    if (!state.key) state.key = hostKey(node.explicitKey, "rui-web-component");

    const element = el(tag as keyof HTMLElementTagNameMap, {
      class: "rui-web-component",
      "data-rui-preserve": "",
      // See Mount: a stable key is what makes the live element findable after
      // the reconciler has kept an incumbent and discarded this one.
      "data-rui-key": state.key,
    });
    applyAttributes(element, attributes);
    applyProperties(element, properties);

    const children = Array.isArray(props.children) ? props.children : props.children != null ? [props.children] : [];
    for (const child of children) {
      if (child == null) continue;
      element.append(typeof child === "string" ? document.createTextNode(child) : helpers.renderNode(child));
    }

    // Sync against the LIVE element after every commit, not just the first.
    // `state.node` used to be captured once in the first render's microtask, so
    // once the reconciler replaced the element (a reactive `tag`) every later
    // attribute push went to the removed node and the new one had no listeners
    // at all. Re-resolving also fixes a same-tick re-render, which previously
    // found `bound` already true while `node` was still null and dropped that
    // render's changes for good.
    defer(() => {
      const live = resolveHost(element, state.key);
      if (!live) return;
      if (state.node !== live) {
        // A replaced element carries none of the previous node's listeners.
        state.node = live;
        state.bound = new Set<string>();
      }
      // Diff the handler set: an `on` entry that only appears on a later render
      // (`...($enabled ? { checkout: f } : {})`) has to be subscribed then, or
      // its event is silently dropped for the rest of the session.
      for (const eventName of Object.keys(state.handlers)) {
        if (state.bound.has(eventName)) continue;
        state.bound.add(eventName);
        live.addEventListener(eventName, (event: Event) => {
          const fn = state.handlers[eventName];
          if (typeof fn === "function") helpers.invoke(fn, event);
        });
      }
      if (live !== element) {
        applyAttributes(live, attributes);
        applyProperties(live, properties);
      }
    });

    return element;
  },
};
