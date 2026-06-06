/**
 * Minimal DOM reconciler ("morph").
 *
 * The renderer used to discard the whole subtree on every state change and
 * recreate it from scratch (`replaceChildren(newTree)`). That works for static
 * UIs but destroys any state the browser owns on the live DOM:
 *
 *   - text-input value, selection, IME composition
 *   - scroll position of a long list
 *   - <details>.open after the user clicked the summary
 *   - focus on a typed input (email/number/url, where setSelectionRange
 *     throws and the cursor jumps to the start)
 *
 * `morphChildren(container, newRoot)` walks the live DOM in parallel with the
 * freshly-rendered DOM, keeps as many existing nodes as possible, and only
 * patches what changed. The result is a React-like reconciliation pass that
 * keeps form fields stable while still letting the renderer rebuild the
 * tree every tick.
 *
 * Two contracts the rest of the runtime relies on:
 *
 *   1. Event handlers are attached as DOM properties (`el.onclick = fn`)
 *      rather than via `addEventListener`. This lets the morph copy the
 *      fresh closure (`newEl.onclick`) onto the kept node (`oldEl.onclick`)
 *      without leaking the previous listener.
 *   2. Components that own UI state across re-renders (e.g. `Tabs` active
 *      pane) use `helpers.useInstanceState(...)`. The morph just reuses
 *      the existing DOM; whatever attribute values land in the fresh tree
 *      are the ones that get applied.
 */

// Every event-handler property that a component might assign with
// `el.onX = fn`. The morph copies these from the freshly-rendered node onto
// the kept node so the closure stays current across re-renders. A handler
// type that is missing here keeps its STALE closure forever once the node is
// reused — so this list has to track every `on*` property the renderer or a
// library component actually sets (e.g. `VirtualList` sets `onscroll`,
// `ContextMenu` sets `oncontextmenu`). Listing extra entries is harmless:
// for an event nobody wired up, both sides read `null` and the sync is a
// no-op.
const EVENT_PROPS = [
  // Pointer / click
  "onclick",
  "ondblclick",
  "oncontextmenu",
  "onmousedown",
  "onmouseup",
  "onmousemove",
  "onmouseenter",
  "onmouseleave",
  "onmouseover",
  "onmouseout",
  "onpointerdown",
  "onpointerup",
  "onpointermove",
  "onpointerenter",
  "onpointerleave",
  "onpointercancel",
  // Scroll / wheel
  "onscroll",
  "onwheel",
  // Drag & drop
  "ondrag",
  "ondragstart",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondrop",
  // Touch
  "ontouchstart",
  "ontouchmove",
  "ontouchend",
  "ontouchcancel",
  // Form / input
  "oninput",
  "onchange",
  "onsubmit",
  "onreset",
  "oninvalid",
  "ontoggle",
  // Keyboard
  "onkeydown",
  "onkeyup",
  "onkeypress",
  // Focus
  "onfocus",
  "onblur",
  // Media / misc
  "onerror",
] as const;

type EventHandlerKey = (typeof EVENT_PROPS)[number];

/**
 * Patch `container` so its children match `newRoot`. `newRoot` can be a
 * `DocumentFragment` (treated as a sibling list) or a single node (treated
 * as the sole child).
 */
export function morphChildren(container: Element, newRoot: Node): void {
  const newChildren: Node[] =
    newRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? Array.from(newRoot.childNodes)
      : [newRoot];
  reconcileChildren(container, newChildren);
}

/**
 * Reconcile a single live node against its freshly-rendered counterpart.
 * Returns the resulting node (either the patched `oldNode` or a freshly
 * inserted `newNode`).
 */
export function morphNode(oldNode: Node, newNode: Node): Node {
  if (oldNode === newNode) return oldNode;
  if (oldNode.nodeType !== newNode.nodeType) {
    return replaceNode(oldNode, newNode);
  }
  if (oldNode.nodeType === Node.TEXT_NODE) {
    if (oldNode.textContent !== newNode.textContent) {
      oldNode.textContent = newNode.textContent;
    }
    return oldNode;
  }
  if (oldNode.nodeType !== Node.ELEMENT_NODE) {
    return oldNode;
  }
  const oldEl = oldNode as Element;
  const newEl = newNode as Element;
  if (oldEl.tagName !== newEl.tagName) {
    return replaceNode(oldEl, newEl);
  }
  patchElement(oldEl, newEl);
  return oldEl;
}

function replaceNode(oldNode: Node, newNode: Node): Node {
  oldNode.parentNode?.replaceChild(newNode, oldNode);
  return newNode;
}

function patchElement(oldEl: Element, newEl: Element): void {
  syncAttributes(oldEl, newEl);
  syncEventHandlers(oldEl, newEl);
  // Reconcile children FIRST so that <select>.value can resolve against
  // its freshly-patched <option>s, and so descendant inputs are stable
  // before we apply any parent-level form-state updates.
  reconcileChildren(oldEl, Array.from(newEl.childNodes));
  syncFormState(oldEl, newEl);
}

function syncAttributes(oldEl: Element, newEl: Element): void {
  const oldAttrs = oldEl.attributes;
  for (let i = oldAttrs.length - 1; i >= 0; i -= 1) {
    const attr = oldAttrs[i]!;
    if (newEl.hasAttribute(attr.name)) continue;
    // `<details>.open` is user-toggleable. Never strip it just because the
    // fresh render didn't emit it (it usually never does — the LLM only
    // sets the initial value via the `open` prop).
    if (attr.name === "open" && oldEl.tagName === "DETAILS") continue;
    oldEl.removeAttribute(attr.name);
  }
  const newAttrs = newEl.attributes;
  for (let i = 0; i < newAttrs.length; i += 1) {
    const attr = newAttrs[i]!;
    if (oldEl.getAttribute(attr.name) !== attr.value) {
      oldEl.setAttribute(attr.name, attr.value);
    }
  }
}

function syncEventHandlers(oldEl: Element, newEl: Element): void {
  // Property-based events (e.g. `el.onclick = fn`) are copied verbatim from
  // the freshly-rendered node onto the kept node so the closure captures
  // the latest props / actions. Listeners registered via addEventListener
  // are not transferable — see this module's header.
  for (const key of EVENT_PROPS) {
    const fresh = (newEl as unknown as Record<EventHandlerKey, unknown>)[key];
    const current = (oldEl as unknown as Record<EventHandlerKey, unknown>)[key];
    if (fresh === current) continue;
    (oldEl as unknown as Record<EventHandlerKey, unknown>)[key] = (fresh ?? null) as unknown;
  }
}

function syncFormState(oldEl: Element, newEl: Element): void {
  if (oldEl instanceof HTMLInputElement && newEl instanceof HTMLInputElement) {
    syncInput(oldEl, newEl);
    return;
  }
  if (oldEl instanceof HTMLTextAreaElement && newEl instanceof HTMLTextAreaElement) {
    syncTextArea(oldEl, newEl);
    return;
  }
  if (oldEl instanceof HTMLSelectElement && newEl instanceof HTMLSelectElement) {
    if (!isFocused(oldEl) && oldEl.value !== newEl.value) {
      oldEl.value = newEl.value;
    }
    return;
  }
  // <details>.open is intentionally treated as user-owned state — see the
  // attribute pass above; the property never gets touched here.
}

function syncInput(oldEl: HTMLInputElement, newEl: HTMLInputElement): void {
  if (oldEl.type === "checkbox" || oldEl.type === "radio") {
    const desired = newEl.hasAttribute("checked") || newEl.checked;
    if (oldEl.checked !== desired && !isFocused(oldEl)) {
      oldEl.checked = desired;
    }
    return;
  }
  // For text-like inputs, only overwrite `.value` when the user isn't
  // actively focused (otherwise we'd nuke an in-flight keystroke / IME
  // composition). When focused, two-way binding has already pushed the
  // freshest characters into the DOM property anyway.
  const desired = newEl.getAttribute("value") ?? newEl.value ?? "";
  if (!isFocused(oldEl) && oldEl.value !== desired) {
    oldEl.value = desired;
  }
}

function syncTextArea(oldEl: HTMLTextAreaElement, newEl: HTMLTextAreaElement): void {
  const desired = newEl.value ?? newEl.textContent ?? "";
  if (!isFocused(oldEl) && oldEl.value !== desired) {
    oldEl.value = desired;
  }
}

function isFocused(el: Element): boolean {
  const root = el.getRootNode();
  if (root instanceof ShadowRoot || root instanceof Document) {
    return root.activeElement === el;
  }
  return el.ownerDocument?.activeElement === el;
}

function reconcileChildren(parent: Element, newChildren: Node[]): void {
  // Index live keyed elements so we can reuse them even when a sibling
  // shifts position (e.g. the LLM reorders a list).
  const keyedOld = new Map<string, Element>();
  for (const child of Array.from(parent.childNodes)) {
    const key = keyFor(child);
    if (key) keyedOld.set(key, child as Element);
  }

  let cursorIndex = 0;
  for (const newChild of newChildren) {
    const live = parent.childNodes[cursorIndex] ?? null;
    const newKey = keyFor(newChild);

    if (newKey && keyedOld.has(newKey)) {
      const matched = keyedOld.get(newKey)!;
      keyedOld.delete(newKey);
      if (matched !== live) {
        parent.insertBefore(matched, live);
      }
      morphNode(matched, newChild);
      cursorIndex += 1;
      continue;
    }

    if (!live) {
      parent.appendChild(newChild);
      cursorIndex += 1;
      continue;
    }

    const liveKey = keyFor(live);
    if (liveKey && (!newKey || liveKey !== newKey)) {
      // The live child is keyed and we still need it for a later slot.
      // Park it: insert the new (unkeyed) child before it.
      parent.insertBefore(newChild, live);
      cursorIndex += 1;
      continue;
    }

    morphNode(live, newChild);
    cursorIndex += 1;
  }

  // Drop any leftover live children that the new tree no longer wants —
  // including keyed ones that were never reclaimed.
  while (parent.childNodes.length > newChildren.length) {
    const surplus = parent.childNodes[parent.childNodes.length - 1]!;
    parent.removeChild(surplus);
  }
}

function keyFor(node: Node): string | null {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  if (el.id) return `#${el.id}`;
  const dataKey = el.getAttribute("data-rui-key");
  if (dataKey) return `@${dataKey}`;
  return null;
}
