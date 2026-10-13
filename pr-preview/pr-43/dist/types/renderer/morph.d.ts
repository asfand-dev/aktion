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
/**
 * Patch `container` so its children match `newRoot`. `newRoot` can be a
 * `DocumentFragment` (treated as a sibling list) or a single node (treated
 * as the sole child).
 */
export declare function morphChildren(container: Element, newRoot: Node): void;
/**
 * Reconcile a single live node against its freshly-rendered counterpart.
 * Returns the resulting node (either the patched `oldNode` or a freshly
 * inserted `newNode`).
 */
export declare function morphNode(oldNode: Node, newNode: Node): Node;
