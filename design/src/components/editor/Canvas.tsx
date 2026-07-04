"use client";
/**
 * The infinite canvas: renders frames in a pan/zoom world, intercepts all
 * pointer interaction (so live Aktion components never receive clicks in
 * edit mode), and implements selection, marquee, frame dragging/resizing,
 * node dragging, frame drawing, and drops from the palette/assets/OS.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import { useEditor, MIN_ZOOM, MAX_ZOOM } from "@/store/editor-store";
import { findFrame, findNode } from "@/design/document";
import type { SchemaIndex, ComponentInfo } from "@/design/schema";
import { getSchemaIndex } from "@/design/schema";
import { DEFAULT_CHILDREN, DEFAULT_PROPS } from "@/design/presets";
import type { Frame, PropValue } from "@/design/types";
import { toast } from "@/components/ui";
import {
  computeDropTarget,
  frameAtPoint,
  frameLocalPoint,
  hitTestNode,
  measureWrapper,
  nodeWrapper,
  resolveSelection,
  screenToWorld,
  worldToScreen,
  type DropIndicator,
} from "./canvas-utils";
import { FrameView } from "./FrameView";
import { SelectionOverlay, type ResizeEdge } from "./SelectionOverlay";

type PointerMode =
  | { kind: "idle" }
  | {
      kind: "pending";
      startX: number;
      startY: number;
      target:
        | { type: "background" }
        | { type: "frame"; id: string }
        | { type: "node"; id: string };
      additive: boolean;
    }
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "marquee"; startX: number; startY: number; x: number; y: number }
  | { kind: "frame-drag"; startX: number; startY: number; frameIds: string[] }
  | {
      kind: "node-drag";
      nodeId: string;
      label: string;
      /** Pointer offset inside the node box at grab time (world px). */
      grabDX: number;
      grabDY: number;
      /** Measured node size at grab time (world px). */
      width: number;
      height: number;
    }
  | { kind: "frame-draw"; startX: number; startY: number; x: number; y: number }
  | {
      kind: "frame-resize";
      frameId: string;
      edge: ResizeEdge;
      start: { x: number; y: number; w: number; h: number };
      startX: number;
      startY: number;
    }
  | {
      kind: "node-resize";
      nodeId: string;
      frameId: string;
      edge: ResizeEdge;
      /** Starting geometry in frame-local px (x/y only for absolute nodes). */
      start: { x: number; y: number; w: number; h: number };
      isAbsolute: boolean;
      startX: number;
      startY: number;
    };

const DRAG_THRESHOLD = 4;

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [schema, setSchema] = useState<SchemaIndex | null>(null);
  const [mode, setMode] = useState<PointerMode>({ kind: "idle" });
  const [spaceDown, setSpaceDown] = useState(false);
  const [measureTick, setMeasureTick] = useState(0);
  const [frameDragOffset, setFrameDragOffset] = useState<{
    ids: string[];
    x: number;
    y: number;
  } | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{
    frameId: string;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  /** Dashed outline shown where a free (absolute) drop would land, screen px. */
  const [freeDropPreview, setFreeDropPreview] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  /** Live geometry while resizing a node, frame-local px. */
  const [nodeResizeDraft, setNodeResizeDraft] = useState<{
    nodeId: string;
    frameId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    isAbsolute: boolean;
  } | null>(null);

  const doc = useEditor((s) => s.document);
  const docRevision = useEditor((s) => s.docRevision);
  const camera = useEditor((s) => s.camera);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  const activePageId = useEditor((s) => s.activePageId);
  const draggingComponent = useEditor((s) => s.draggingComponent);
  const draggingSymbolId = useEditor((s) => s.draggingSymbolId);
  const loaded = useEditor((s) => s.loaded);

  const page = useMemo(
    () => doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0],
    [doc, activePageId],
  );

  useEffect(() => {
    getSchemaIndex()
      .then(setSchema)
      .catch(() => toast("Failed to load the Aktion runtime", "error"));
  }, []);

  const bumpMeasure = useCallback(() => setMeasureTick((t) => t + 1), []);

  // Fit the view once everything is ready.
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || !loaded || !viewportRef.current) return;
    didFit.current = true;
    useEditor.getState().zoomToFit(viewportRef.current.getBoundingClientRect());
  }, [loaded]);

  // ---------------------------------------------------------------------
  // Space-bar pan + wheel zoom/pan
  // ---------------------------------------------------------------------

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useEditor.getState();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        state.zoomAt(e.clientX, e.clientY, factor, rect);
      } else {
        const { camera } = state;
        state.setCamera({
          ...camera,
          x: camera.x - e.deltaX,
          y: camera.y - e.deltaY,
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---------------------------------------------------------------------
  // Hit helpers
  // ---------------------------------------------------------------------

  const frameHostEl = useCallback((frameId: string): HTMLElement | null => {
    return (
      viewportRef.current?.querySelector<HTMLElement>(
        `[data-frame-host="${frameId}"]`,
      ) ?? null
    );
  }, []);

  /** Deepest node id + owning frame at a client point. */
  const hitAt = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { frame: Frame | null; nodeId: string | null } => {
      if (!viewportRef.current) return { frame: null, nodeId: null };
      const rect = viewportRef.current.getBoundingClientRect();
      const world = screenToWorld(clientX, clientY, rect, useEditor.getState().camera);
      const frame = frameAtPoint(page?.frames ?? [], world.x, world.y);
      if (!frame) return { frame: null, nodeId: null };
      const host = frameHostEl(frame.id);
      if (!host) return { frame, nodeId: null };
      const nodeId = hitTestNode(clientX, clientY, host);
      // Locked or hidden nodes are not selectable on canvas.
      if (nodeId) {
        const loc = findNode(doc, nodeId);
        if (!loc || loc.node.locked) return { frame, nodeId: null };
      }
      return { frame, nodeId };
    },
    [page, doc, frameHostEl],
  );

  // ---------------------------------------------------------------------
  // Pointer state machine
  // ---------------------------------------------------------------------

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button === 1 || spaceDown || tool === "hand") {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setMode({ kind: "pan", lastX: e.clientX, lastY: e.clientY });
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault(); // block focus/interaction inside live frames

    if (tool === "frame" && !readOnly) {
      const rect = viewportRef.current!.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect, camera);
      setMode({
        kind: "frame-draw",
        startX: world.x,
        startY: world.y,
        x: world.x,
        y: world.y,
      });
      return;
    }

    const { frame, nodeId } = hitAt(e.clientX, e.clientY);
    const state = useEditor.getState();

    if (nodeId && frame) {
      const resolved = resolveSelection(doc, nodeId, selection, e.metaKey || e.ctrlKey);
      if (!selection.includes(resolved)) state.select([resolved], e.shiftKey);
      setMode({
        kind: "pending",
        startX: e.clientX,
        startY: e.clientY,
        target: { type: "node", id: resolved },
        additive: e.shiftKey,
      });
      return;
    }

    if (frame) {
      if (!selection.includes(frame.id)) state.select([frame.id], e.shiftKey);
      setMode({
        kind: "pending",
        startX: e.clientX,
        startY: e.clientY,
        target: { type: "frame", id: frame.id },
        additive: e.shiftKey,
      });
      return;
    }

    setMode({
      kind: "pending",
      startX: e.clientX,
      startY: e.clientY,
      target: { type: "background" },
      additive: e.shiftKey,
    });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const state = useEditor.getState();

    switch (mode.kind) {
      case "idle": {
        // Hover highlight (throttled by React batching; cheap enough).
        const { nodeId, frame } = hitAt(e.clientX, e.clientY);
        state.setHovered(nodeId ?? frame?.id ?? null);
        return;
      }
      case "pan": {
        const { camera } = state;
        state.setCamera({
          ...camera,
          x: camera.x + (e.clientX - mode.lastX),
          y: camera.y + (e.clientY - mode.lastY),
        });
        setMode({ ...mode, lastX: e.clientX, lastY: e.clientY });
        return;
      }
      case "pending": {
        const dx = e.clientX - mode.startX;
        const dy = e.clientY - mode.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (mode.target.type === "background") {
          setMode({
            kind: "marquee",
            startX: mode.startX,
            startY: mode.startY,
            x: e.clientX,
            y: e.clientY,
          });
        } else if (mode.target.type === "frame") {
          if (readOnly) return;
          const current = useEditor.getState().selection;
          const frameIds = current.filter((id) => findFrame(doc, id));
          setMode({
            kind: "frame-drag",
            startX: mode.startX,
            startY: mode.startY,
            frameIds: frameIds.length ? frameIds : [mode.target.id],
          });
        } else {
          if (readOnly) return;
          const loc = findNode(doc, mode.target.id);
          if (!loc) return;
          // Measure the grabbed box so free placement keeps the grab point.
          const rect = viewportRef.current!.getBoundingClientRect();
          const cam = state.camera;
          const host = frameHostEl(loc.frame.id);
          const wrapper = host ? nodeWrapper(host, mode.target.id) : null;
          const box = wrapper ? measureWrapper(wrapper) : null;
          const startWorld = screenToWorld(mode.startX, mode.startY, rect, cam);
          const boxWorld = box
            ? screenToWorld(box.left, box.top, rect, cam)
            : { x: startWorld.x, y: startWorld.y };
          setMode({
            kind: "node-drag",
            nodeId: mode.target.id,
            label: loc.node.name ?? "Layer",
            grabDX: startWorld.x - boxWorld.x,
            grabDY: startWorld.y - boxWorld.y,
            width: box ? box.width / cam.zoom : 80,
            height: box ? box.height / cam.zoom : 40,
          });
        }
        return;
      }
      case "marquee":
        setMode({ ...mode, x: e.clientX, y: e.clientY });
        return;
      case "frame-drag": {
        const zoom = state.camera.zoom;
        setFrameDragOffset({
          ids: mode.frameIds,
          x: (e.clientX - mode.startX) / zoom,
          y: (e.clientY - mode.startY) / zoom,
        });
        return;
      }
      case "node-drag": {
        setCursorPos({ x: e.clientX, y: e.clientY });
        // Priority 1: a layout container under the pointer -> flow insertion.
        const resolution = resolveDrop(e.clientX, e.clientY, mode.nodeId, true);
        if (resolution) {
          setDropIndicator(resolution.indicator);
          setFreeDropPreview(null);
          state.setDropTarget({
            containerId: resolution.containerId,
            index: resolution.index,
          });
          return;
        }
        // Priority 2: over a frame -> Figma-style free placement preview.
        setDropIndicator(null);
        state.setDropTarget(null);
        const rect = viewportRef.current!.getBoundingClientRect();
        const world = screenToWorld(e.clientX, e.clientY, rect, state.camera);
        const frame = frameAtPoint(page?.frames ?? [], world.x, world.y);
        if (frame) {
          const topLeft = worldToScreen(
            world.x - mode.grabDX,
            world.y - mode.grabDY,
            rect,
            state.camera,
          );
          setFreeDropPreview({
            left: topLeft.x,
            top: topLeft.y,
            width: mode.width * state.camera.zoom,
            height: mode.height * state.camera.zoom,
          });
        } else {
          setFreeDropPreview(null);
        }
        return;
      }
      case "frame-draw": {
        const rect = viewportRef.current!.getBoundingClientRect();
        const world = screenToWorld(e.clientX, e.clientY, rect, state.camera);
        setMode({ ...mode, x: world.x, y: world.y });
        return;
      }
      case "frame-resize": {
        const zoom = state.camera.zoom;
        const dx = (e.clientX - mode.startX) / zoom;
        const dy = (e.clientY - mode.startY) / zoom;
        const { x, y, w, h } = mode.start;
        let nx = x;
        let ny = y;
        let nw = w;
        let nh = h;
        if (mode.edge.includes("e")) nw = Math.max(40, w + dx);
        if (mode.edge.includes("s")) nh = Math.max(40, h + dy);
        if (mode.edge.includes("w")) {
          nw = Math.max(40, w - dx);
          nx = x + (w - nw);
        }
        if (mode.edge.includes("n")) {
          nh = Math.max(40, h - dy);
          ny = y + (h - nh);
        }
        setResizeDraft({ frameId: mode.frameId, x: nx, y: ny, w: nw, h: nh });
        return;
      }
      case "node-resize": {
        const zoom = state.camera.zoom;
        const dx = (e.clientX - mode.startX) / zoom;
        const dy = (e.clientY - mode.startY) / zoom;
        const { x, y, w, h } = mode.start;
        let nx = x;
        let ny = y;
        let nw = w;
        let nh = h;
        if (mode.edge.includes("e")) nw = Math.max(16, w + dx);
        if (mode.edge.includes("s")) nh = Math.max(16, h + dy);
        if (mode.edge.includes("w")) {
          nw = Math.max(16, w - dx);
          if (mode.isAbsolute) nx = x + (w - nw);
        }
        if (mode.edge.includes("n")) {
          nh = Math.max(16, h - dy);
          if (mode.isAbsolute) ny = y + (h - nh);
        }
        setNodeResizeDraft({
          nodeId: mode.nodeId,
          frameId: mode.frameId,
          x: nx,
          y: ny,
          w: nw,
          h: nh,
          isAbsolute: mode.isAbsolute,
        });
        // Live preview straight on the rendered box (no program re-parse).
        const host = frameHostEl(mode.frameId);
        const wrapper = host ? nodeWrapper(host, mode.nodeId) : null;
        if (wrapper instanceof HTMLElement) {
          if (mode.isAbsolute) {
            wrapper.style.left = `${Math.round(nx)}px`;
            wrapper.style.top = `${Math.round(ny)}px`;
            wrapper.style.width = `${Math.round(nw)}px`;
            wrapper.style.height = `${Math.round(nh)}px`;
          } else {
            // Flow nodes: preview on the first rendered box child.
            const box = firstBoxChild(wrapper);
            if (box) {
              box.style.width = `${Math.round(nw)}px`;
              box.style.height = `${Math.round(nh)}px`;
            }
          }
        }
        return;
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const state = useEditor.getState();

    switch (mode.kind) {
      case "pending": {
        // A click without a drag: finalize selection.
        if (mode.target.type === "background") {
          if (!mode.additive) state.clearSelection();
        } else if (mode.target.type === "node") {
          const resolved = resolveSelection(
            doc,
            mode.target.id,
            state.selection,
            e.metaKey || e.ctrlKey,
          );
          state.select([resolved], mode.additive);
        } else {
          state.select([mode.target.id], mode.additive);
        }
        break;
      }
      case "marquee": {
        const rect = viewportRef.current!.getBoundingClientRect();
        const a = screenToWorld(mode.startX, mode.startY, rect, state.camera);
        const b = screenToWorld(mode.x, mode.y, rect, state.camera);
        const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        const hits = (page?.frames ?? [])
          .filter((f) => f.x < x2 && f.x + f.width > x1 && f.y < y2 && f.y + f.height > y1)
          .map((f) => f.id);
        if (hits.length) state.select(hits, e.shiftKey);
        else if (!e.shiftKey) state.clearSelection();
        break;
      }
      case "frame-drag": {
        if (frameDragOffset && (frameDragOffset.x !== 0 || frameDragOffset.y !== 0)) {
          const { ids, x, y } = frameDragOffset;
          state.mutateDoc((draft) => {
            for (const id of ids) {
              const hit = findFrame(draft, id);
              if (hit) {
                hit.frame.x = Math.round(hit.frame.x + x);
                hit.frame.y = Math.round(hit.frame.y + y);
              }
            }
          });
        }
        setFrameDragOffset(null);
        break;
      }
      case "node-drag": {
        const resolution = resolveDrop(e.clientX, e.clientY, mode.nodeId, true);
        if (resolution) {
          // Dropped into a layout container -> join its flow.
          state.moveNodeTo(mode.nodeId, resolution.containerId, resolution.index);
        } else {
          // Dropped on a frame -> Figma-style free placement.
          const rect = viewportRef.current!.getBoundingClientRect();
          const world = screenToWorld(e.clientX, e.clientY, rect, state.camera);
          const frame = frameAtPoint(page?.frames ?? [], world.x, world.y);
          if (frame) {
            const nodeId = mode.nodeId;
            const x = Math.round(world.x - frame.x - mode.grabDX);
            const y = Math.round(world.y - frame.y - mode.grabDY);
            state.mutateDoc((draft) => {
              const loc = findNode(draft, nodeId);
              if (!loc) return;
              const previous = loc.node.layout;
              if (loc.parent !== null || loc.frame.id !== frame.id) {
                // Re-home the node as a direct child of the target frame.
                const container = loc.parent ? loc.parent.children : loc.frame.children;
                container.splice(loc.index, 1);
                const target = draft.pages
                  .flatMap((p) => p.frames)
                  .find((f) => f.id === frame.id);
                if (!target) return;
                target.children.push(loc.node);
              }
              const moved = findNode(draft, nodeId);
              if (moved) {
                moved.node.layout = {
                  x,
                  y,
                  width: previous?.width,
                  height: previous?.height,
                };
              }
            });
          }
        }
        setDropIndicator(null);
        setFreeDropPreview(null);
        setCursorPos(null);
        break;
      }
      case "frame-draw": {
        const x = Math.round(Math.min(mode.startX, mode.x));
        const y = Math.round(Math.min(mode.startY, mode.y));
        const w = Math.round(Math.abs(mode.x - mode.startX));
        const h = Math.round(Math.abs(mode.y - mode.startY));
        const count = (page?.frames.length ?? 0) + 1;
        if (w > 40 && h > 40) {
          state.addFrame(`Frame ${count}`, x, y, w, h);
        } else {
          state.addFrame(`Frame ${count}`, Math.round(mode.startX), Math.round(mode.startY), 1280, 800);
        }
        state.setTool("select");
        break;
      }
      case "frame-resize": {
        if (resizeDraft) {
          state.updateFrame(resizeDraft.frameId, {
            x: Math.round(resizeDraft.x),
            y: Math.round(resizeDraft.y),
            width: Math.round(resizeDraft.w),
            height: Math.round(resizeDraft.h),
          });
        }
        setResizeDraft(null);
        break;
      }
      case "node-resize": {
        if (nodeResizeDraft) {
          const { nodeId, x, y, w, h, isAbsolute } = nodeResizeDraft;
          if (isAbsolute) {
            state.updateNodeLayout(nodeId, {
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(w),
              height: Math.round(h),
            });
          } else {
            // Flow node: size through its sx (merged, not replaced).
            const loc = findNode(state.document, nodeId);
            const sx =
              loc && typeof loc.node.props.sx === "object" &&
              loc.node.props.sx !== null && !Array.isArray(loc.node.props.sx)
                ? { ...(loc.node.props.sx as Record<string, unknown>) }
                : {};
            sx.w = `${Math.round(w)}px`;
            sx.h = `${Math.round(h)}px`;
            state.updateNodeProps(nodeId, { sx: sx as never });
          }
        }
        setNodeResizeDraft(null);
        break;
      }
    }
    setMode({ kind: "idle" });
  };

  // ---------------------------------------------------------------------
  // Drop-target resolution (node drags + palette/asset/symbol DnD)
  // ---------------------------------------------------------------------

  const resolveDrop = useCallback(
    (
      clientX: number,
      clientY: number,
      excludeId?: string | null,
      containersOnly = false,
    ) => {
      if (!schema || !viewportRef.current || !page) return null;
      const rect = viewportRef.current.getBoundingClientRect();
      const world = screenToWorld(clientX, clientY, rect, useEditor.getState().camera);
      const frame = frameAtPoint(page.frames, world.x, world.y);
      if (!frame) return null;
      const host = frameHostEl(frame.id);
      if (!host) return null;
      return computeDropTarget(
        clientX,
        clientY,
        frame,
        host,
        doc,
        schema,
        excludeId,
        containersOnly,
      );
    },
    [schema, page, doc, frameHostEl],
  );

  /** Frame + frame-local coordinates for a free (absolute) drop. */
  const resolveFreeDrop = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewportRef.current || !page) return null;
      const rect = viewportRef.current.getBoundingClientRect();
      const camera = useEditor.getState().camera;
      const world = screenToWorld(clientX, clientY, rect, camera);
      const frame = frameAtPoint(page.frames, world.x, world.y);
      if (!frame) return null;
      const local = frameLocalPoint(clientX, clientY, frame, rect, camera);
      return { frame, x: Math.round(local.x), y: Math.round(local.y) };
    },
    [page],
  );

  const updateDropIndicator = useCallback(
    (clientX: number, clientY: number, excludeId?: string | null) => {
      // Containers get flow-insertion indicators; frame body previews a free
      // drop marker at the pointer.
      const resolution = resolveDrop(clientX, clientY, excludeId, true);
      setDropIndicator(resolution?.indicator ?? null);
      useEditor
        .getState()
        .setDropTarget(
          resolution
            ? { containerId: resolution.containerId, index: resolution.index }
            : null,
        );
      if (resolution) {
        setFreeDropPreview(null);
        return;
      }
      const free = resolveFreeDrop(clientX, clientY);
      if (free && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const camera = useEditor.getState().camera;
        const topLeft = worldToScreen(
          free.frame.x + free.x,
          free.frame.y + free.y,
          rect,
          camera,
        );
        setFreeDropPreview({
          left: topLeft.x - 6,
          top: topLeft.y - 6,
          width: 12,
          height: 12,
        });
      } else {
        setFreeDropPreview(null);
      }
    },
    [resolveDrop, resolveFreeDrop],
  );

  const onDragOver = (e: ReactDragEvent) => {
    if (readOnly) return;
    const hasPayload =
      draggingComponent ||
      draggingSymbolId ||
      e.dataTransfer.types.includes("application/x-aktion-asset") ||
      e.dataTransfer.types.includes("Files");
    if (!hasPayload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    updateDropIndicator(e.clientX, e.clientY);
  };

  const onDragLeave = () => {
    setDropIndicator(null);
    setFreeDropPreview(null);
  };

  const onDrop = async (e: ReactDragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setDropIndicator(null);
    setFreeDropPreview(null);
    const state = useEditor.getState();
    state.setDropTarget(null);

    // Container under the pointer -> flow insertion; otherwise free placement
    // at the drop point (Figma semantics).
    const resolution = resolveDrop(e.clientX, e.clientY, null, true);
    const free = resolution ? null : resolveFreeDrop(e.clientX, e.clientY);
    const placement = resolution
      ? {
          target: { containerId: resolution.containerId, index: resolution.index },
          layout: undefined as undefined,
        }
      : free
        ? {
            target: { containerId: free.frame.id, index: 9999 },
            layout: { x: free.x, y: free.y },
          }
        : null;

    // 1. Palette component
    const componentName =
      e.dataTransfer.getData("application/x-aktion-component") || draggingComponent;
    if (componentName && schema) {
      if (!placement) {
        toast("Drop inside a frame", "info");
        return;
      }
      const info = schema.byName.get(componentName);
      state.insertComponent(
        componentName,
        defaultPropsFor(componentName, info),
        placement.target,
        placement.layout,
        DEFAULT_CHILDREN[componentName]?.(),
      );
      state.setDraggingComponent(null);
      return;
    }

    // 2. Symbol instance
    const symbolId =
      e.dataTransfer.getData("application/x-aktion-symbol") || draggingSymbolId;
    if (symbolId) {
      if (!placement) {
        toast("Drop inside a frame", "info");
        return;
      }
      state.insertSymbolInstance(symbolId, placement.target, placement.layout);
      state.setDraggingSymbolId(null);
      return;
    }

    // 3. Asset from the assets panel
    const assetJson = e.dataTransfer.getData("application/x-aktion-asset");
    if (assetJson) {
      if (!placement) return;
      try {
        const asset = JSON.parse(assetJson) as {
          url: string;
          name: string;
          width?: number;
        };
        state.insertComponent(
          "Image",
          placement.layout
            ? { src: asset.url, alt: asset.name }
            : { src: asset.url, alt: asset.name, sx: { w: "100%" } },
          placement.target,
          placement.layout
            ? { ...placement.layout, width: Math.min(asset.width ?? 320, 480) }
            : undefined,
        );
      } catch {
        // ignore malformed payloads
      }
      return;
    }

    // 4. OS file drop -> upload to assets, then insert
    if (e.dataTransfer.files.length > 0) {
      if (!placement) {
        toast("Drop images inside a frame", "info");
        return;
      }
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith("image/")) {
        toast("Only images can be dropped", "error");
        return;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/projects/${state.projectId}/assets`, {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        state.insertComponent(
          "Image",
          placement.layout
            ? { src: `/api/assets/${json.asset.id}`, alt: file.name }
            : { src: `/api/assets/${json.asset.id}`, alt: file.name, sx: { w: "100%" } },
          placement.target,
          placement.layout ? { ...placement.layout, width: 320 } : undefined,
        );
        toast("Image uploaded", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Upload failed", "error");
      }
    }
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const cursor =
    spaceDown || tool === "hand"
      ? mode.kind === "pan"
        ? "grabbing"
        : "grab"
      : tool === "frame"
        ? "crosshair"
        : "default";

  const marqueeRect =
    mode.kind === "marquee" && viewportRef.current
      ? (() => {
          const rect = viewportRef.current.getBoundingClientRect();
          return {
            left: Math.min(mode.startX, mode.x) - rect.left,
            top: Math.min(mode.startY, mode.y) - rect.top,
            width: Math.abs(mode.x - mode.startX),
            height: Math.abs(mode.y - mode.startY),
          };
        })()
      : null;

  const frameDrawRect =
    mode.kind === "frame-draw"
      ? {
          x: Math.min(mode.startX, mode.x),
          y: Math.min(mode.startY, mode.y),
          w: Math.abs(mode.x - mode.startX),
          h: Math.abs(mode.y - mode.startY),
        }
      : null;

  return (
    <div
      ref={viewportRef}
      className="canvas-surface relative h-full w-full overflow-hidden"
      style={{ cursor, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (mode.kind === "idle") useEditor.getState().setHovered(null);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* World layer */}
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {(page?.frames ?? []).map((frame) => {
          const draft =
            resizeDraft && resizeDraft.frameId === frame.id
              ? {
                  ...frame,
                  x: resizeDraft.x,
                  y: resizeDraft.y,
                  width: resizeDraft.w,
                  height: resizeDraft.h,
                }
              : frame;
          return (
            <FrameView
              key={frame.id}
              frame={draft}
              doc={doc}
              schema={schema}
              theme={doc.theme}
              dragOffset={
                frameDragOffset?.ids.includes(frame.id)
                  ? { x: frameDragOffset.x, y: frameDragOffset.y }
                  : null
              }
              onRenderTick={bumpMeasure}
            />
          );
        })}

        {/* Frame-draw preview */}
        {frameDrawRect && frameDrawRect.w > 2 && (
          <div
            className="absolute border border-accent bg-accent-muted"
            style={{
              left: frameDrawRect.x,
              top: frameDrawRect.y,
              width: frameDrawRect.w,
              height: frameDrawRect.h,
            }}
          />
        )}
      </div>

      {/* Screen-space overlay: selection, hover, labels, indicators */}
      <SelectionOverlay
        viewportRef={viewportRef}
        measureTick={measureTick}
        docRevision={docRevision}
        frameDragOffset={frameDragOffset}
        resizeDraft={resizeDraft}
        dropIndicator={dropIndicator}
        onFramePointerDown={(frameId, e) => {
          const state = useEditor.getState();
          if (!state.selection.includes(frameId)) state.select([frameId], e.shiftKey);
          setMode({
            kind: "pending",
            startX: e.clientX,
            startY: e.clientY,
            target: { type: "frame", id: frameId },
            additive: e.shiftKey,
          });
        }}
        onResizeStart={(frameId, edge, e) => {
          if (readOnly) return;
          const hit = findFrame(doc, frameId);
          if (!hit) return;
          setMode({
            kind: "frame-resize",
            frameId,
            edge,
            start: {
              x: hit.frame.x,
              y: hit.frame.y,
              w: hit.frame.width,
              h: hit.frame.height,
            },
            startX: e.clientX,
            startY: e.clientY,
          });
        }}
        onNodeResizeStart={(nodeId, edge, e) => {
          if (readOnly || !viewportRef.current) return;
          const loc = findNode(doc, nodeId);
          if (!loc) return;
          const host = frameHostEl(loc.frame.id);
          const wrapper = host ? nodeWrapper(host, nodeId) : null;
          const box = wrapper ? measureWrapper(wrapper) : null;
          if (!box) return;
          const rect = viewportRef.current.getBoundingClientRect();
          const cam = useEditor.getState().camera;
          const topLeft = screenToWorld(box.left, box.top, rect, cam);
          const isAbsolute = loc.node.layout !== undefined && loc.parent === null;
          setMode({
            kind: "node-resize",
            nodeId,
            frameId: loc.frame.id,
            edge,
            start: {
              x: isAbsolute && loc.node.layout ? loc.node.layout.x : topLeft.x - loc.frame.x,
              y: isAbsolute && loc.node.layout ? loc.node.layout.y : topLeft.y - loc.frame.y,
              w: box.width / cam.zoom,
              h: box.height / cam.zoom,
            },
            isAbsolute,
            startX: e.clientX,
            startY: e.clientY,
          });
        }}
      />

      {/* Free-placement drop preview */}
      {freeDropPreview && (
        <div
          className="pointer-events-none absolute z-20 rounded border-2 border-dashed border-accent bg-accent-muted"
          style={freeDropPreview}
        />
      )}

      {/* Marquee */}
      {marqueeRect && (
        <div
          className="pointer-events-none absolute z-20 border border-accent bg-accent-muted"
          style={marqueeRect}
        />
      )}

      {/* Node-drag ghost */}
      {mode.kind === "node-drag" && cursorPos && viewportRef.current && (
        <div
          className="pointer-events-none absolute z-30 rounded bg-bg-2 px-2 py-1 text-xs text-text-1 shadow-lg"
          style={{
            left: cursorPos.x - viewportRef.current.getBoundingClientRect().left + 12,
            top: cursorPos.y - viewportRef.current.getBoundingClientRect().top + 12,
          }}
        >
          {mode.label}
        </div>
      )}

      {/* Empty page hint */}
      {loaded && (page?.frames.length ?? 0) === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-text-2">This page is empty</p>
            <p className="mt-1 text-xs text-text-3">
              Press <kbd className="rounded bg-bg-3 px-1.5 py-0.5">F</kbd> and drag to
              draw a frame
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** First rendered element box under a display:contents wrapper. */
function firstBoxChild(wrapper: Element): HTMLElement | null {
  for (const child of Array.from(wrapper.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (getComputedStyle(child).display === "contents") {
      const nested = firstBoxChild(child);
      if (nested) return nested;
      continue;
    }
    return child;
  }
  return null;
}

/** Default props for a dropped component (mirrors the palette behavior). */
function defaultPropsFor(
  name: string,
  info: ComponentInfo | undefined,
): Record<string, PropValue> {
  const preset = DEFAULT_PROPS[name];
  if (preset && !info) return { ...preset };
  if (preset && info) {
    // Keep only props the live schema knows; remap a stray primary string to
    // the real positional slot so curated defaults survive library renames.
    const known = new Set(info.props.map((p) => p.name));
    const out: Record<string, PropValue> = {};
    for (const [key, value] of Object.entries(preset)) {
      if (known.has(key)) out[key] = value;
      else if (
        info.positional &&
        out[info.positional.name] === undefined &&
        typeof value === "string"
      ) {
        out[info.positional.name] = value;
      }
    }
    return out;
  }
  if (info?.positional && info.positional.type === "string") {
    return { [info.positional.name]: name };
  }
  return {};
}

export { MIN_ZOOM, MAX_ZOOM };
