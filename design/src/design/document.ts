/**
 * Pure(ish) operations over the design document tree. Mutating helpers are
 * intended to run against a cloned draft inside store actions (the store
 * snapshots the document for undo before applying a mutation).
 */
import { customAlphabet } from "nanoid";
import type {
  DesignDocument,
  DesignNode,
  Frame,
  NodeLocation,
  PageDef,
  SymbolDef,
} from "./types";

const nano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

export const createId = (prefix: string) => `${prefix}_${nano()}`;

export function createNode(
  component: string,
  props: DesignNode["props"] = {},
  children: DesignNode[] = [],
  name?: string,
): DesignNode {
  return {
    id: createId("n"),
    type: "component",
    name: name ?? component,
    component,
    props,
    children,
    visible: true,
    locked: false,
  };
}

export function createFrame(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Frame {
  return {
    id: createId("f"),
    name,
    x,
    y,
    width,
    height,
    background: "#ffffff",
    children: [],
  };
}

export function createPage(name: string): PageDef {
  return { id: createId("p"), name, frames: [] };
}

export function newDocument(): DesignDocument {
  const page = createPage("Page 1");
  const frame = createFrame("Frame 1", 0, 0, 1280, 800);
  page.frames.push(frame);
  return { version: 1, theme: "light", pages: [page], symbols: [] };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Deep-clone a node giving every node in the subtree a fresh id. */
export function cloneWithNewIds(node: DesignNode): DesignNode {
  const copy = clone(node);
  const reid = (n: DesignNode) => {
    n.id = createId("n");
    n.children.forEach(reid);
  };
  reid(copy);
  return copy;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function findPage(doc: DesignDocument, pageId: string): PageDef | null {
  return doc.pages.find((p) => p.id === pageId) ?? null;
}

export function findFrame(
  doc: DesignDocument,
  frameId: string,
): { frame: Frame; page: PageDef } | null {
  for (const page of doc.pages) {
    const frame = page.frames.find((f) => f.id === frameId);
    if (frame) return { frame, page };
  }
  return null;
}

export function findSymbol(doc: DesignDocument, symbolId: string): SymbolDef | null {
  return doc.symbols.find((s) => s.id === symbolId) ?? null;
}

/** Depth-first search for a node anywhere in the document. */
export function findNode(doc: DesignDocument, nodeId: string): NodeLocation | null {
  for (const page of doc.pages) {
    for (const frame of page.frames) {
      const hit = findInChildren(frame.children, null, nodeId);
      if (hit) return { ...hit, frame, page };
    }
  }
  return null;
}

function findInChildren(
  children: DesignNode[],
  parent: DesignNode | null,
  nodeId: string,
): { node: DesignNode; parent: DesignNode | null; index: number } | null {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.id === nodeId) return { node: child, parent, index: i };
    const nested = findInChildren(child.children, child, nodeId);
    if (nested) return nested;
  }
  return null;
}

/** The children array a node lives in (frame root or parent node). */
export function containerOf(
  doc: DesignDocument,
  loc: NodeLocation,
): DesignNode[] {
  return loc.parent ? loc.parent.children : loc.frame.children;
}

/** Resolve a container id (frame id or node id) to its children array. */
export function childrenOfContainer(
  doc: DesignDocument,
  containerId: string,
): DesignNode[] | null {
  const frame = findFrame(doc, containerId);
  if (frame) return frame.frame.children;
  const loc = findNode(doc, containerId);
  return loc ? loc.node.children : null;
}

export function walkNodes(
  children: DesignNode[],
  fn: (node: DesignNode, parent: DesignNode | null, depth: number) => void,
  parent: DesignNode | null = null,
  depth = 0,
): void {
  for (const node of children) {
    fn(node, parent, depth);
    walkNodes(node.children, fn, node, depth + 1);
  }
}

export function isDescendant(ancestor: DesignNode, id: string): boolean {
  for (const child of ancestor.children) {
    if (child.id === id || isDescendant(child, id)) return true;
  }
  return false;
}

export function countNodes(doc: DesignDocument): number {
  let count = 0;
  for (const page of doc.pages)
    for (const frame of page.frames) walkNodes(frame.children, () => count++);
  return count;
}

// ---------------------------------------------------------------------------
// Mutations (call on a cloned draft)
// ---------------------------------------------------------------------------

/**
 * Insert a node into a container (frame id or parent node id) at `index`
 * (append when omitted / out of range). Returns false when the container
 * doesn't exist.
 */
export function insertNode(
  doc: DesignDocument,
  containerId: string,
  node: DesignNode,
  index?: number,
): boolean {
  const children = childrenOfContainer(doc, containerId);
  if (!children) return false;
  const at =
    index === undefined || index < 0 || index > children.length
      ? children.length
      : index;
  children.splice(at, 0, node);
  return true;
}

export function removeNode(doc: DesignDocument, nodeId: string): DesignNode | null {
  const loc = findNode(doc, nodeId);
  if (!loc) return null;
  const children = containerOf(doc, loc);
  children.splice(loc.index, 1);
  return loc.node;
}

/**
 * Move a node into a new container at `index`. Refuses moves into the node's
 * own subtree. Returns false when either side is missing or the move is
 * illegal.
 */
export function moveNode(
  doc: DesignDocument,
  nodeId: string,
  containerId: string,
  index: number,
): boolean {
  const loc = findNode(doc, nodeId);
  if (!loc) return false;
  if (nodeId === containerId) return false;
  if (isDescendant(loc.node, containerId)) return false;

  const source = containerOf(doc, loc);
  const target = childrenOfContainer(doc, containerId);
  if (!target) return false;

  source.splice(loc.index, 1);
  // Removing from the same array before inserting shifts later indices left.
  const at =
    source === target && loc.index < index
      ? Math.min(index - 1, target.length)
      : Math.min(index, target.length);
  target.splice(Math.max(0, at), 0, loc.node);
  // Free placement only applies to direct frame children — a node moved into
  // a layout container joins its flow.
  if (!findFrame(doc, containerId)) delete loc.node.layout;
  return true;
}

/** Wrap the given sibling nodes (same container) in a new group container. */
export function groupNodes(
  doc: DesignDocument,
  nodeIds: string[],
  groupComponent = "Column",
): DesignNode | null {
  if (nodeIds.length === 0) return null;
  const first = findNode(doc, nodeIds[0]);
  if (!first) return null;
  const container = containerOf(doc, first);

  const members = container.filter((n) => nodeIds.includes(n.id));
  if (members.length !== nodeIds.length) return null; // not all siblings

  const insertAt = container.findIndex((n) => nodeIds.includes(n.id));
  const group = createNode(groupComponent, { gap: "md" }, members, "Group");
  const remaining = container.filter((n) => !nodeIds.includes(n.id));
  container.length = 0;
  container.push(...remaining);
  container.splice(Math.min(insertAt, container.length), 0, group);
  return group;
}

/** Replace a group node with its children in place. */
export function ungroupNode(doc: DesignDocument, nodeId: string): boolean {
  const loc = findNode(doc, nodeId);
  if (!loc || loc.node.children.length === 0) return false;
  const container = containerOf(doc, loc);
  container.splice(loc.index, 1, ...loc.node.children);
  return true;
}

/**
 * Turn a node into a reusable symbol: the master tree moves into
 * `doc.symbols` and the node is replaced by an instance referencing it.
 */
export function createSymbolFromNode(
  doc: DesignDocument,
  nodeId: string,
  name?: string,
): SymbolDef | null {
  const loc = findNode(doc, nodeId);
  if (!loc) return null;
  if (loc.node.type === "instance") return null;

  const symbol: SymbolDef = {
    id: createId("s"),
    name: name ?? loc.node.name,
    root: cloneWithNewIds(loc.node),
  };
  doc.symbols.push(symbol);

  const instance: DesignNode = {
    id: loc.node.id, // keep the id so selection survives
    type: "instance",
    name: symbol.name,
    symbolId: symbol.id,
    props: {},
    children: [],
    visible: loc.node.visible,
    locked: loc.node.locked,
  };
  const container = containerOf(doc, loc);
  container.splice(loc.index, 1, instance);
  return symbol;
}

export function createInstance(symbol: SymbolDef): DesignNode {
  return {
    id: createId("n"),
    type: "instance",
    name: symbol.name,
    symbolId: symbol.id,
    props: {},
    children: [],
    visible: true,
    locked: false,
  };
}

/** Replace an instance with a detached deep copy of its symbol master. */
export function detachInstance(doc: DesignDocument, nodeId: string): boolean {
  const loc = findNode(doc, nodeId);
  if (!loc || loc.node.type !== "instance" || !loc.node.symbolId) return false;
  const symbol = findSymbol(doc, loc.node.symbolId);
  if (!symbol) return false;
  const detached = cloneWithNewIds(symbol.root);
  detached.name = loc.node.name;
  const container = containerOf(doc, loc);
  container.splice(loc.index, 1, detached);
  return true;
}

/** Delete a symbol and detach (inline) every instance of it. */
export function deleteSymbol(doc: DesignDocument, symbolId: string): boolean {
  const symbol = findSymbol(doc, symbolId);
  if (!symbol) return false;
  for (const page of doc.pages) {
    for (const frame of page.frames) {
      const instances: string[] = [];
      walkNodes(frame.children, (n) => {
        if (n.type === "instance" && n.symbolId === symbolId) instances.push(n.id);
      });
      for (const id of instances) detachInstance(doc, id);
    }
  }
  doc.symbols = doc.symbols.filter((s) => s.id !== symbolId);
  return true;
}
