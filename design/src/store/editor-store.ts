"use client";
/**
 * The editor's central state: document, selection, camera, tools, history.
 * Every document mutation flows through `mutateDoc`, which snapshots the
 * previous document for undo and marks the project dirty for autosave.
 */
import { create } from "zustand";
import type {
  Camera,
  DesignDocument,
  DesignNode,
  Frame,
  NodeLayout,
  PropValue,
  ProjectDetail,
  SymbolDef,
} from "@/design/types";
import {
  childrenOfContainer,
  clone,
  cloneWithNewIds,
  createFrame,
  createInstance,
  createNode,
  createPage,
  createSymbolFromNode,
  deleteSymbol,
  detachInstance,
  findFrame,
  findNode,
  findPage,
  findSymbol,
  groupNodes,
  insertNode,
  moveNode,
  newDocument,
  removeNode,
  ungroupNode,
} from "@/design/document";
import { DEFAULT_GROUP_COMPONENT } from "@/design/presets";

export type Tool = "select" | "hand" | "frame";
export type SaveState = "saved" | "dirty" | "saving" | "error";
export type LeftTab = "layers" | "components" | "assets" | "ai";

const HISTORY_LIMIT = 100;

export interface DropTarget {
  /** Frame id or container node id. */
  containerId: string;
  index: number;
}

export interface EditorState {
  // Project
  projectId: string;
  projectName: string;
  role: "owner" | "editor" | "viewer";
  readOnly: boolean;
  document: DesignDocument;
  loaded: boolean;
  saveState: SaveState;
  /** Bumped on every document mutation — autosave and canvas re-gen key. */
  docRevision: number;

  // View
  activePageId: string;
  camera: Camera;
  tool: Tool;
  leftTab: LeftTab;
  showCode: boolean;

  // Selection & interaction
  selection: string[]; // node ids and/or frame ids
  hoveredId: string | null;
  /** Component name being dragged from the palette (null when none). */
  draggingComponent: string | null;
  /** Symbol id being dragged from the assets panel. */
  draggingSymbolId: string | null;
  dropTarget: DropTarget | null;

  // History
  past: DesignDocument[];
  future: DesignDocument[];
  clipboard: DesignNode[] | null;

  // -- Lifecycle -----------------------------------------------------------
  loadProject: (project: ProjectDetail) => void;
  setProjectName: (name: string) => void;
  setSaveState: (s: SaveState) => void;

  // -- View ----------------------------------------------------------------
  setCamera: (camera: Camera) => void;
  zoomAt: (screenX: number, screenY: number, factor: number, viewport: DOMRect) => void;
  zoomTo: (zoom: number, viewport?: DOMRect) => void;
  zoomToFit: (viewport: DOMRect) => void;
  setTool: (tool: Tool) => void;
  setLeftTab: (tab: LeftTab) => void;
  setShowCode: (show: boolean) => void;
  setActivePage: (pageId: string) => void;

  // -- Selection -----------------------------------------------------------
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  setHovered: (id: string | null) => void;
  setDraggingComponent: (name: string | null) => void;
  setDraggingSymbolId: (id: string | null) => void;
  setDropTarget: (target: DropTarget | null) => void;

  // -- Document mutation core ----------------------------------------------
  mutateDoc: (fn: (draft: DesignDocument) => void) => void;
  undo: () => void;
  redo: () => void;

  // -- Pages ----------------------------------------------------------------
  addPage: () => void;
  renamePage: (pageId: string, name: string) => void;
  removePage: (pageId: string) => void;

  // -- Frames ----------------------------------------------------------------
  addFrame: (name: string, x: number, y: number, width: number, height: number) => string;
  updateFrame: (frameId: string, patch: Partial<Omit<Frame, "id" | "children">>) => void;

  // -- Nodes ------------------------------------------------------------------
  insertComponent: (
    component: string,
    props: Record<string, PropValue>,
    target: DropTarget,
    layout?: NodeLayout,
    children?: DesignNode[],
  ) => string | null;
  insertSymbolInstance: (
    symbolId: string,
    target: DropTarget,
    layout?: NodeLayout,
  ) => string | null;
  /** Set or clear (null) a node's free placement within its frame. */
  updateNodeLayout: (nodeId: string, layout: NodeLayout | null) => void;
  /** Replace a frame's entire child tree (used by AI generation). */
  replaceFrameChildren: (frameId: string, children: DesignNode[]) => void;
  updateNodeProps: (nodeId: string, patch: Record<string, PropValue | undefined>) => void;
  updateNodeMeta: (
    nodeId: string,
    patch: Partial<Pick<DesignNode, "name" | "visible" | "locked">>,
  ) => void;
  renameSelection: (name: string) => void;
  moveNodeTo: (nodeId: string, containerId: string, index: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;

  // -- Symbols -----------------------------------------------------------------
  makeSymbol: (nodeId: string, name?: string) => void;
  detachSymbolInstance: (nodeId: string) => void;
  removeSymbol: (symbolId: string) => void;
  renameSymbol: (symbolId: string, name: string) => void;

  // -- Theme ---------------------------------------------------------------------
  setTheme: (theme: string) => void;
  /** Replace the grouped `$theme` brand overrides (null clears them). */
  setThemeTokens: (tokens: Record<string, PropValue> | null) => void;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

export const useEditor = create<EditorState>((set, get) => ({
  projectId: "",
  projectName: "",
  role: "viewer",
  readOnly: true,
  document: newDocument(),
  loaded: false,
  saveState: "saved",
  docRevision: 0,

  activePageId: "",
  camera: { x: 0, y: 0, zoom: 1 },
  tool: "select",
  leftTab: "layers",
  showCode: false,

  selection: [],
  hoveredId: null,
  draggingComponent: null,
  draggingSymbolId: null,
  dropTarget: null,

  past: [],
  future: [],
  clipboard: null,

  // -- Lifecycle -----------------------------------------------------------

  loadProject: (project) => {
    const doc = project.document?.pages?.length ? project.document : newDocument();
    set({
      projectId: project.id,
      projectName: project.name,
      role: project.role,
      readOnly: project.role === "viewer",
      document: doc,
      loaded: true,
      saveState: "saved",
      docRevision: 0,
      activePageId: doc.pages[0].id,
      selection: [],
      hoveredId: null,
      past: [],
      future: [],
    });
  },

  setProjectName: (name) => set({ projectName: name, saveState: "dirty" }),
  setSaveState: (saveState) => set({ saveState }),

  // -- View ----------------------------------------------------------------

  setCamera: (camera) => set({ camera }),

  zoomAt: (screenX, screenY, factor, viewport) => {
    const { camera } = get();
    const zoom = clampZoom(camera.zoom * factor);
    if (zoom === camera.zoom) return;
    // Keep the world point under the cursor stationary.
    const px = screenX - viewport.left;
    const py = screenY - viewport.top;
    const worldX = (px - camera.x) / camera.zoom;
    const worldY = (py - camera.y) / camera.zoom;
    set({
      camera: { x: px - worldX * zoom, y: py - worldY * zoom, zoom },
    });
  },

  zoomTo: (zoom, viewport) => {
    const { camera } = get();
    const clamped = clampZoom(zoom);
    if (!viewport) {
      set({ camera: { ...camera, zoom: clamped } });
      return;
    }
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const worldX = (cx - camera.x) / camera.zoom;
    const worldY = (cy - camera.y) / camera.zoom;
    set({ camera: { x: cx - worldX * clamped, y: cy - worldY * clamped, zoom: clamped } });
  },

  zoomToFit: (viewport) => {
    const { document: doc, activePageId } = get();
    const page = findPage(doc, activePageId);
    if (!page || page.frames.length === 0) {
      set({ camera: { x: viewport.width / 2 - 200, y: 80, zoom: 1 } });
      return;
    }
    const minX = Math.min(...page.frames.map((f) => f.x));
    const minY = Math.min(...page.frames.map((f) => f.y));
    const maxX = Math.max(...page.frames.map((f) => f.x + f.width));
    const maxY = Math.max(...page.frames.map((f) => f.y + f.height));
    const pad = 80;
    const zoom = clampZoom(
      Math.min(
        (viewport.width - pad * 2) / Math.max(1, maxX - minX),
        (viewport.height - pad * 2) / Math.max(1, maxY - minY),
        1.5,
      ),
    );
    set({
      camera: {
        x: (viewport.width - (maxX - minX) * zoom) / 2 - minX * zoom,
        y: (viewport.height - (maxY - minY) * zoom) / 2 - minY * zoom,
        zoom,
      },
    });
  },

  setTool: (tool) => set({ tool }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setShowCode: (showCode) => set({ showCode }),
  setActivePage: (activePageId) => set({ activePageId, selection: [], hoveredId: null }),

  // -- Selection -----------------------------------------------------------

  select: (ids, additive = false) =>
    set((s) => ({
      selection: additive
        ? Array.from(new Set([...s.selection, ...ids]))
        : ids,
    })),
  clearSelection: () => set({ selection: [] }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setDraggingComponent: (draggingComponent) => set({ draggingComponent }),
  setDraggingSymbolId: (draggingSymbolId) => set({ draggingSymbolId }),
  setDropTarget: (dropTarget) => set({ dropTarget }),

  // -- Document mutation core ----------------------------------------------

  mutateDoc: (fn) => {
    const { document: doc, past, readOnly } = get();
    if (readOnly) return;
    const draft = clone(doc);
    fn(draft);
    set({
      document: draft,
      past: [...past.slice(-HISTORY_LIMIT + 1), doc],
      future: [],
      saveState: "dirty",
      docRevision: get().docRevision + 1,
    });
  },

  undo: () => {
    const { past, future, document: doc } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      document: previous,
      past: past.slice(0, -1),
      future: [doc, ...future].slice(0, HISTORY_LIMIT),
      saveState: "dirty",
      docRevision: get().docRevision + 1,
      selection: [],
    });
  },

  redo: () => {
    const { past, future, document: doc } = get();
    if (future.length === 0) return;
    const [next, ...rest] = future;
    set({
      document: next,
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: rest,
      saveState: "dirty",
      docRevision: get().docRevision + 1,
      selection: [],
    });
  },

  // -- Pages ----------------------------------------------------------------

  addPage: () => {
    let newId = "";
    get().mutateDoc((draft) => {
      const page = createPage(`Page ${draft.pages.length + 1}`);
      draft.pages.push(page);
      newId = page.id;
    });
    if (newId) set({ activePageId: newId, selection: [] });
  },

  renamePage: (pageId, name) =>
    get().mutateDoc((draft) => {
      const page = findPage(draft, pageId);
      if (page) page.name = name;
    }),

  removePage: (pageId) => {
    const { document: doc, activePageId } = get();
    if (doc.pages.length <= 1) return;
    get().mutateDoc((draft) => {
      draft.pages = draft.pages.filter((p) => p.id !== pageId);
    });
    if (activePageId === pageId) {
      const remaining = get().document.pages;
      set({ activePageId: remaining[0].id, selection: [] });
    }
  },

  // -- Frames ----------------------------------------------------------------

  addFrame: (name, x, y, width, height) => {
    let id = "";
    const { activePageId } = get();
    get().mutateDoc((draft) => {
      const page = findPage(draft, activePageId);
      if (!page) return;
      const frame = createFrame(name, x, y, width, height);
      page.frames.push(frame);
      id = frame.id;
    });
    if (id) set({ selection: [id] });
    return id;
  },

  updateFrame: (frameId, patch) =>
    get().mutateDoc((draft) => {
      const hit = findFrame(draft, frameId);
      if (hit) Object.assign(hit.frame, patch);
    }),

  // -- Nodes ------------------------------------------------------------------

  insertComponent: (component, props, target, layout, children) => {
    let id: string | null = null;
    get().mutateDoc((draft) => {
      const node = createNode(component, clone(props), children ?? []);
      if (layout) node.layout = { ...layout };
      if (insertNode(draft, target.containerId, node, target.index)) id = node.id;
    });
    if (id) set({ selection: [id] });
    return id;
  },

  insertSymbolInstance: (symbolId, target, layout) => {
    let id: string | null = null;
    get().mutateDoc((draft) => {
      const symbol = findSymbol(draft, symbolId);
      if (!symbol) return;
      const instance = createInstance(symbol);
      if (layout) instance.layout = { ...layout };
      if (insertNode(draft, target.containerId, instance, target.index)) id = instance.id;
    });
    if (id) set({ selection: [id] });
    return id;
  },

  updateNodeLayout: (nodeId, layout) =>
    get().mutateDoc((draft) => {
      const loc = findNode(draft, nodeId);
      if (!loc) return;
      if (layout === null) delete loc.node.layout;
      else loc.node.layout = { ...layout };
    }),

  replaceFrameChildren: (frameId, children) => {
    get().mutateDoc((draft) => {
      const hit = findFrame(draft, frameId);
      if (!hit) return;
      hit.frame.children = clone(children);
    });
  },

  updateNodeProps: (nodeId, patch) =>
    get().mutateDoc((draft) => {
      const loc = findNode(draft, nodeId);
      if (!loc) return;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete loc.node.props[key];
        else loc.node.props[key] = value;
      }
    }),

  updateNodeMeta: (nodeId, patch) =>
    get().mutateDoc((draft) => {
      const loc = findNode(draft, nodeId);
      if (loc) Object.assign(loc.node, patch);
    }),

  renameSelection: (name) => {
    const { selection } = get();
    if (selection.length !== 1) return;
    const id = selection[0];
    get().mutateDoc((draft) => {
      const loc = findNode(draft, id);
      if (loc) {
        loc.node.name = name;
        return;
      }
      const frame = findFrame(draft, id);
      if (frame) frame.frame.name = name;
    });
  },

  moveNodeTo: (nodeId, containerId, index) =>
    get().mutateDoc((draft) => {
      moveNode(draft, nodeId, containerId, index);
    }),

  deleteSelection: () => {
    const { selection } = get();
    if (selection.length === 0) return;
    get().mutateDoc((draft) => {
      for (const id of selection) {
        if (!removeNode(draft, id)) {
          // Not a node — maybe a frame.
          for (const page of draft.pages) {
            page.frames = page.frames.filter((f) => f.id !== id);
          }
        }
      }
    });
    set({ selection: [], hoveredId: null });
  },

  duplicateSelection: () => {
    const { selection } = get();
    if (selection.length === 0) return;
    const newIds: string[] = [];
    get().mutateDoc((draft) => {
      for (const id of selection) {
        const loc = findNode(draft, id);
        if (loc) {
          const copy = cloneWithNewIds(loc.node);
          copy.name = `${loc.node.name} copy`;
          const container = loc.parent ? loc.parent.children : loc.frame.children;
          container.splice(loc.index + 1, 0, copy);
          newIds.push(copy.id);
          continue;
        }
        const hit = findFrame(draft, id);
        if (hit) {
          const copy = clone(hit.frame);
          copy.id = `f_${copy.id.slice(2)}${Date.now() % 997}`;
          const reid = (n: DesignNode) => {
            n.id = cloneWithNewIds(n).id;
          };
          copy.children = copy.children.map((c) => cloneWithNewIds(c));
          void reid;
          copy.name = `${hit.frame.name} copy`;
          copy.x = hit.frame.x + hit.frame.width + 60;
          hit.page.frames.push(copy);
          newIds.push(copy.id);
        }
      }
    });
    if (newIds.length) set({ selection: newIds });
  },

  copySelection: () => {
    const { selection, document: doc } = get();
    const nodes: DesignNode[] = [];
    for (const id of selection) {
      const loc = findNode(doc, id);
      if (loc) nodes.push(clone(loc.node));
    }
    if (nodes.length) set({ clipboard: nodes });
  },

  pasteClipboard: () => {
    const { clipboard, selection, document: doc, activePageId } = get();
    if (!clipboard || clipboard.length === 0) return;

    // Paste into the selected container, or the first frame of the page.
    let containerId: string | null = null;
    if (selection.length === 1) {
      const loc = findNode(doc, selection[0]);
      if (loc) {
        containerId =
          loc.node.children.length > 0 || loc.node.type === "component"
            ? loc.parent
              ? loc.parent.id
              : loc.frame.id
            : null;
      } else if (findFrame(doc, selection[0])) {
        containerId = selection[0];
      }
    }
    if (!containerId) {
      const page = findPage(doc, activePageId);
      containerId = page?.frames[0]?.id ?? null;
    }
    if (!containerId) return;

    const newIds: string[] = [];
    get().mutateDoc((draft) => {
      for (const node of clipboard) {
        const copy = cloneWithNewIds(node);
        // Offset freely-placed copies so they don't land invisibly on top of
        // the original.
        if (copy.layout) {
          copy.layout = { ...copy.layout, x: copy.layout.x + 16, y: copy.layout.y + 16 };
        }
        if (insertNode(draft, containerId!, copy)) newIds.push(copy.id);
      }
    });
    if (newIds.length) set({ selection: newIds });
  },

  groupSelection: () => {
    const { selection } = get();
    if (selection.length < 1) return;
    let groupId: string | null = null;
    get().mutateDoc((draft) => {
      const group = groupNodes(draft, selection, DEFAULT_GROUP_COMPONENT);
      if (group) groupId = group.id;
    });
    if (groupId) set({ selection: [groupId] });
  },

  ungroupSelection: () => {
    const { selection, document: doc } = get();
    if (selection.length !== 1) return;
    const loc = findNode(doc, selection[0]);
    if (!loc) return;
    const childIds = loc.node.children.map((c) => c.id);
    get().mutateDoc((draft) => {
      ungroupNode(draft, selection[0]);
    });
    set({ selection: childIds });
  },

  // -- Symbols -----------------------------------------------------------------

  makeSymbol: (nodeId, name) =>
    get().mutateDoc((draft) => {
      createSymbolFromNode(draft, nodeId, name);
    }),

  detachSymbolInstance: (nodeId) =>
    get().mutateDoc((draft) => {
      detachInstance(draft, nodeId);
    }),

  removeSymbol: (symbolId) =>
    get().mutateDoc((draft) => {
      deleteSymbol(draft, symbolId);
    }),

  renameSymbol: (symbolId, name) =>
    get().mutateDoc((draft) => {
      const symbol = findSymbol(draft, symbolId);
      if (symbol) symbol.name = name;
      // Refresh instance labels that still carry the old default name.
      for (const page of draft.pages) {
        for (const frame of page.frames) {
          const rename = (nodes: DesignNode[]) => {
            for (const n of nodes) {
              if (n.type === "instance" && n.symbolId === symbolId) n.name = name;
              rename(n.children);
            }
          };
          rename(frame.children);
        }
      }
    }),

  // -- Theme ---------------------------------------------------------------------

  setTheme: (theme) =>
    get().mutateDoc((draft) => {
      draft.theme = theme;
      if (draft.themeTokens && typeof draft.themeTokens.name === "string") {
        draft.themeTokens.name = theme;
      }
    }),

  setThemeTokens: (tokens) =>
    get().mutateDoc((draft) => {
      if (tokens === null || Object.keys(tokens).length === 0) {
        delete draft.themeTokens;
        return;
      }
      draft.themeTokens = clone(tokens) as typeof draft.themeTokens;
      if (typeof tokens.name === "string") draft.theme = tokens.name;
    }),
}));

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// ---------------------------------------------------------------------------
// Convenience selectors
// ---------------------------------------------------------------------------

export function useActivePage() {
  return useEditor((s) => s.document.pages.find((p) => p.id === s.activePageId) ?? s.document.pages[0]);
}

export function selectedNodes(state: EditorState): DesignNode[] {
  const out: DesignNode[] = [];
  for (const id of state.selection) {
    const loc = findNode(state.document, id);
    if (loc) out.push(loc.node);
  }
  return out;
}

export function selectedFrames(state: EditorState): Frame[] {
  const out: Frame[] = [];
  for (const id of state.selection) {
    const hit = findFrame(state.document, id);
    if (hit) out.push(hit.frame);
  }
  return out;
}

export function symbolsOf(doc: DesignDocument): SymbolDef[] {
  return doc.symbols;
}

export { findNode, findFrame, childrenOfContainer };
