"use client";
/**
 * Canvas geometry: screen/world conversion, shadow-DOM hit-testing, and
 * drop-target computation. The editor renders each frame through an
 * `<aktion-app>` whose program wraps every design node in a
 * `display: contents` div carrying `data-node-id` — these helpers measure and
 * hit-test those wrappers.
 */
import type { Camera, DesignDocument, Frame } from "@/design/types";
import { findFrame, findNode } from "@/design/document";
import type { SchemaIndex } from "@/design/schema";

export interface ClientRectBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  viewport: DOMRect,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: (clientX - viewport.left - camera.x) / camera.zoom,
    y: (clientY - viewport.top - camera.y) / camera.zoom,
  };
}

export function worldToScreen(
  x: number,
  y: number,
  viewport: DOMRect,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: x * camera.zoom + camera.x,
    y: y * camera.zoom + camera.y,
  };
}

/** Frame under a world point (topmost = last in list). */
export function frameAtPoint(
  frames: Frame[],
  worldX: number,
  worldY: number,
): Frame | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (
      worldX >= f.x &&
      worldX <= f.x + f.width &&
      worldY >= f.y &&
      worldY <= f.y + f.height
    ) {
      return f;
    }
  }
  return null;
}

function shadowRootOf(frameHost: HTMLElement): ShadowRoot | null {
  const app = frameHost.querySelector("aktion-app");
  return (app as HTMLElement | null)?.shadowRoot ?? null;
}

/**
 * Deepest design node under the pointer inside a frame host, via
 * `elementsFromPoint` on the aktion shadow root.
 */
export function hitTestNode(
  clientX: number,
  clientY: number,
  frameHost: HTMLElement,
): string | null {
  const root = shadowRootOf(frameHost);
  if (!root || typeof root.elementsFromPoint !== "function") return null;
  const stack = root.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const wrapper = (el as Element).closest?.("[data-node-id]");
    if (wrapper) return wrapper.getAttribute("data-node-id");
  }
  return null;
}

/** Locate a node's wrapper element inside a frame host. */
export function nodeWrapper(
  frameHost: HTMLElement,
  nodeId: string,
): Element | null {
  const root = shadowRootOf(frameHost);
  return root?.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`) ?? null;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

/**
 * Bounding client rect of a node wrapper. Freely-placed nodes have a real
 * positioned box (measure it directly); flow nodes use `display: contents`
 * carriers, so we union their rendered children's boxes (recursing through
 * nested contents wrappers).
 */
export function measureWrapper(wrapper: Element): ClientRectBox | null {
  if (getComputedStyle(wrapper).display !== "contents") {
    const r = wrapper.getBoundingClientRect();
    return r.width > 0 || r.height > 0
      ? { left: r.left, top: r.top, width: r.width, height: r.height }
      : null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let found = false;

  const visit = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const display = getComputedStyle(child).display;
      if (display === "contents") {
        visit(child);
        continue;
      }
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      found = true;
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
  };
  visit(wrapper);
  if (!found) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Figma-style progressive selection: normal click selects the top-level
 * child of the frame containing the hit; clicking again inside an
 * already-selected container descends one level. Meta/Ctrl-click selects the
 * deepest node directly.
 */
export function resolveSelection(
  doc: DesignDocument,
  deepestId: string,
  currentSelection: string[],
  deep: boolean,
): string {
  if (deep) return deepestId;
  const loc = findNode(doc, deepestId);
  if (!loc) return deepestId;

  // Ancestor chain from top-level (direct frame child) down to the hit node.
  const chain: string[] = [];
  let cursor = loc.node.id;
  chain.unshift(cursor);
  let parent = loc.parent;
  while (parent) {
    chain.unshift(parent.id);
    const parentLoc = findNode(doc, parent.id);
    parent = parentLoc?.parent ?? null;
  }

  // If some ancestor (or the node) is already selected, step one level deeper
  // below the deepest selected ancestor.
  for (let i = chain.length - 1; i >= 0; i--) {
    if (currentSelection.includes(chain[i])) {
      return chain[Math.min(i + 1, chain.length - 1)];
    }
  }
  return chain[0];
}

export interface DropIndicator {
  /** Line/box in client coordinates. */
  rect: ClientRectBox;
  kind: "line" | "inside";
}

export interface DropResolution {
  containerId: string;
  index: number;
  indicator: DropIndicator;
}

/**
 * Compute where a drop at the pointer would insert: the nearest ancestor
 * container that accepts children (or the frame root), and an index derived
 * from sibling midpoints along the container's flex axis.
 *
 * With `containersOnly` the frame root does NOT count as a target — callers
 * use a null result to fall back to Figma-style free placement.
 */
export function computeDropTarget(
  clientX: number,
  clientY: number,
  frame: Frame,
  frameHost: HTMLElement,
  doc: DesignDocument,
  schema: SchemaIndex,
  excludeId?: string | null,
  containersOnly = false,
): DropResolution | null {
  const hitId = hitTestNode(clientX, clientY, frameHost);

  // Walk up until we find a container that accepts children.
  let containerId = frame.id;
  if (hitId) {
    let cursorId: string | null = hitId;
    while (cursorId) {
      const loc = findNode(doc, cursorId);
      if (!loc) break;
      const { node } = loc;
      const excluded =
        excludeId != null && (node.id === excludeId || isWithin(doc, node.id, excludeId));
      if (
        !excluded &&
        node.type === "component" &&
        !node.locked &&
        node.component &&
        schema.byName.get(node.component)?.acceptsChildren
      ) {
        containerId = node.id;
        break;
      }
      cursorId = loc.parent?.id ?? null;
    }
  }

  if (containersOnly && containerId === frame.id) return null;

  if (excludeId && containerId !== frame.id && isWithin(doc, containerId, excludeId)) {
    return null;
  }

  // Children of the resolved container + the container's own client box.
  const isFrameTarget = containerId === frame.id;
  const children = isFrameTarget
    ? frame.children
    : findNode(doc, containerId)?.node.children ?? [];

  let containerRect: ClientRectBox;
  let horizontal = false;
  if (isFrameTarget) {
    containerRect = frameHost.getBoundingClientRect();
  } else {
    const wrapper = nodeWrapper(frameHost, containerId);
    const measured = wrapper ? measureWrapper(wrapper) : null;
    if (!measured) return null;
    containerRect = measured;
    horizontal = containerIsHorizontal(wrapper!);
  }

  // Find the insertion index from visible child midpoints.
  let index = children.length;
  let indicator: DropIndicator = {
    kind: children.length === 0 ? "inside" : "line",
    rect: containerRect,
  };

  const childBoxes = children
    .map((child) => ({
      id: child.id,
      box: (() => {
        const w = nodeWrapper(frameHost, child.id);
        return w ? measureWrapper(w) : null;
      })(),
    }))
    .filter((c): c is { id: string; box: ClientRectBox } => c.box !== null);

  if (childBoxes.length > 0) {
    index = childBoxes.length;
    for (let i = 0; i < childBoxes.length; i++) {
      const { box } = childBoxes[i];
      const mid = horizontal ? box.left + box.width / 2 : box.top + box.height / 2;
      const pointer = horizontal ? clientX : clientY;
      if (pointer < mid) {
        index = i;
        break;
      }
    }
    // Map the visible index back to the true child index (hidden children
    // have no boxes but still occupy array slots).
    if (index < childBoxes.length) {
      const anchor = childBoxes[index];
      const trueIndex = children.findIndex((c) => c.id === anchor.id);
      const box = anchor.box;
      indicator = {
        kind: "line",
        rect: horizontal
          ? { left: box.left - 2, top: box.top, width: 3, height: box.height }
          : { left: box.left, top: box.top - 2, width: box.width, height: 3 },
      };
      index = trueIndex;
    } else {
      const last = childBoxes[childBoxes.length - 1].box;
      index = children.length;
      indicator = {
        kind: "line",
        rect: horizontal
          ? { left: last.left + last.width - 1, top: last.top, width: 3, height: last.height }
          : { left: last.left, top: last.top + last.height - 1, width: last.width, height: 3 },
      };
    }
  }

  return { containerId, index, indicator };
}

function containerIsHorizontal(wrapper: Element): boolean {
  // The wrapper is display:contents — inspect its first rendered child.
  for (const child of Array.from(wrapper.children)) {
    const cs = getComputedStyle(child);
    if (cs.display === "contents") {
      const nested = containerIsHorizontal(child);
      return nested;
    }
    if (cs.display.includes("flex")) return cs.flexDirection.startsWith("row");
    if (cs.display.includes("grid")) return false;
    return false;
  }
  return false;
}

function isWithin(doc: DesignDocument, id: string, ancestorId: string): boolean {
  if (id === ancestorId) return true;
  let loc = findNode(doc, id);
  while (loc?.parent) {
    if (loc.parent.id === ancestorId) return true;
    loc = findNode(doc, loc.parent.id);
  }
  return false;
}

/** True when the id belongs to a frame (vs a node). */
export function isFrameId(doc: DesignDocument, id: string): boolean {
  return findFrame(doc, id) !== null;
}

/** Pointer position in frame-local pixels (for free placement). */
export function frameLocalPoint(
  clientX: number,
  clientY: number,
  frame: Frame,
  viewport: DOMRect,
  camera: Camera,
): { x: number; y: number } {
  const world = screenToWorld(clientX, clientY, viewport, camera);
  return { x: world.x - frame.x, y: world.y - frame.y };
}
