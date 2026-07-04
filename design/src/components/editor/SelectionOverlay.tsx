"use client";
/**
 * Screen-space overlay above the canvas world: frame name labels, selection
 * and hover outlines (measured live from the Aktion shadow DOM), frame resize
 * handles, size badges, and drop indicators. The overlay itself ignores
 * pointer events; only labels and handles opt back in.
 */
import { useMemo, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useEditor } from "@/store/editor-store";
import { findFrame, findNode } from "@/design/document";
import {
  measureWrapper,
  nodeWrapper,
  worldToScreen,
  type ClientRectBox,
  type DropIndicator,
} from "./canvas-utils";

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: Array<{ edge: ResizeEdge; x: number; y: number; cursor: string }> = [
  { edge: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { edge: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { edge: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { edge: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { edge: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { edge: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { edge: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { edge: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

interface OverlayBox {
  id: string;
  rect: { left: number; top: number; width: number; height: number };
  kind: "frame" | "node";
  name: string;
}

export function SelectionOverlay({
  viewportRef,
  measureTick,
  docRevision,
  frameDragOffset,
  resizeDraft,
  dropIndicator,
  onFramePointerDown,
  onResizeStart,
  onNodeResizeStart,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  measureTick: number;
  docRevision: number;
  frameDragOffset: { ids: string[]; x: number; y: number } | null;
  resizeDraft: { frameId: string; x: number; y: number; w: number; h: number } | null;
  dropIndicator: DropIndicator | null;
  onFramePointerDown: (frameId: string, e: ReactPointerEvent) => void;
  onResizeStart: (frameId: string, edge: ResizeEdge, e: ReactPointerEvent) => void;
  onNodeResizeStart: (nodeId: string, edge: ResizeEdge, e: ReactPointerEvent) => void;
}) {
  const doc = useEditor((s) => s.document);
  const camera = useEditor((s) => s.camera);
  const selection = useEditor((s) => s.selection);
  const hoveredId = useEditor((s) => s.hoveredId);
  const activePageId = useEditor((s) => s.activePageId);
  const readOnly = useEditor((s) => s.readOnly);

  const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
  const viewportEl = viewportRef.current;
  const viewportRect = viewportEl?.getBoundingClientRect() ?? null;

  // Convert a client rect to overlay (viewport-local) coordinates.
  const toLocal = (rect: ClientRectBox) =>
    viewportRect
      ? {
          left: rect.left - viewportRect.left,
          top: rect.top - viewportRect.top,
          width: rect.width,
          height: rect.height,
        }
      : rect;

  const frameScreenRect = (frameId: string) => {
    if (!viewportRect || !page) return null;
    let frame = page.frames.find((f) => f.id === frameId);
    if (!frame) return null;
    let { x, y, width, height } = frame;
    if (resizeDraft && resizeDraft.frameId === frameId) {
      x = resizeDraft.x;
      y = resizeDraft.y;
      width = resizeDraft.w;
      height = resizeDraft.h;
    }
    if (frameDragOffset?.ids.includes(frameId)) {
      x += frameDragOffset.x;
      y += frameDragOffset.y;
    }
    const tl = worldToScreen(x, y, viewportRect, camera);
    return {
      left: tl.x,
      top: tl.y,
      width: width * camera.zoom,
      height: height * camera.zoom,
    };
  };

  // measureTick/docRevision are re-measure triggers, not data deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boxes = useMemo<OverlayBox[]>(() => {
    if (!viewportEl || !viewportRect || !page) return [];
    const out: OverlayBox[] = [];
    for (const id of selection) {
      const frameHit = findFrame(doc, id);
      if (frameHit) {
        const rect = frameScreenRect(id);
        if (rect) out.push({ id, rect, kind: "frame", name: frameHit.frame.name });
        continue;
      }
      const loc = findNode(doc, id);
      if (!loc) continue;
      const host = viewportEl.querySelector<HTMLElement>(
        `[data-frame-host="${loc.frame.id}"]`,
      );
      if (!host) continue;
      const wrapper = nodeWrapper(host, id);
      const measured = wrapper ? measureWrapper(wrapper) : null;
      if (measured) {
        out.push({ id, rect: toLocal(measured), kind: "node", name: loc.node.name });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, doc, camera, measureTick, docRevision, frameDragOffset, resizeDraft, page, viewportEl]);

  // Hover outline (skip when already selected).
  const hoverBox = useMemo(() => {
    if (!hoveredId || selection.includes(hoveredId) || !viewportEl || !page) return null;
    const frameHit = findFrame(doc, hoveredId);
    if (frameHit) {
      const rect = frameScreenRect(hoveredId);
      return rect ? { rect } : null;
    }
    const loc = findNode(doc, hoveredId);
    if (!loc) return null;
    const host = viewportEl.querySelector<HTMLElement>(
      `[data-frame-host="${loc.frame.id}"]`,
    );
    if (!host) return null;
    const wrapper = nodeWrapper(host, hoveredId);
    const measured = wrapper ? measureWrapper(wrapper) : null;
    return measured ? { rect: toLocal(measured) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId, selection, doc, camera, measureTick, docRevision, page, viewportEl]);

  if (!viewportRect || !page) return null;

  const singleFrameSelected =
    selection.length === 1 && boxes.length === 1 && boxes[0].kind === "frame"
      ? boxes[0]
      : null;

  const singleNodeSelected =
    selection.length === 1 && boxes.length === 1 && boxes[0].kind === "node"
      ? boxes[0]
      : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Frame name labels */}
      {page.frames.map((frame) => {
        const rect = frameScreenRect(frame.id);
        if (!rect) return null;
        const selected = selection.includes(frame.id);
        return (
          <div
            key={frame.id}
            className={
              "pointer-events-auto absolute cursor-move select-none truncate text-[11px] " +
              (selected ? "text-accent" : "text-text-3 hover:text-text-2")
            }
            style={{
              left: rect.left,
              top: rect.top - 18,
              maxWidth: Math.max(60, rect.width),
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onFramePointerDown(frame.id, e);
            }}
          >
            {frame.name}
          </div>
        );
      })}

      {/* Hover outline */}
      {hoverBox && (
        <div
          className="absolute border border-accent/70"
          style={hoverBox.rect}
        />
      )}

      {/* Selection outlines */}
      {boxes.map((box) => (
        <div key={box.id}>
          <div
            className="absolute border-[1.5px] border-accent"
            style={box.rect}
          />
          {box.kind === "node" && (
            <div
              className="absolute rounded-sm bg-accent px-1 py-px text-[10px] font-medium text-white"
              style={{
                left: box.rect.left,
                top: Math.max(0, box.rect.top - 16),
              }}
            >
              {box.name}
            </div>
          )}
        </div>
      ))}

      {/* Size badge + resize handles for a single selected frame */}
      {singleFrameSelected && (
        <>
          <div
            className="absolute -translate-x-1/2 rounded-sm bg-accent px-1.5 py-px text-[10px] font-medium text-white"
            style={{
              left: singleFrameSelected.rect.left + singleFrameSelected.rect.width / 2,
              top: singleFrameSelected.rect.top + singleFrameSelected.rect.height + 6,
            }}
          >
            {Math.round(
              (resizeDraft?.frameId === singleFrameSelected.id
                ? resizeDraft.w
                : findFrame(doc, singleFrameSelected.id)?.frame.width) ?? 0,
            )}
            {" × "}
            {Math.round(
              (resizeDraft?.frameId === singleFrameSelected.id
                ? resizeDraft.h
                : findFrame(doc, singleFrameSelected.id)?.frame.height) ?? 0,
            )}
          </div>
          {!readOnly &&
            HANDLES.map((h) => (
              <div
                key={h.edge}
                className="pointer-events-auto absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-white"
                style={{
                  left: singleFrameSelected.rect.left + singleFrameSelected.rect.width * h.x,
                  top: singleFrameSelected.rect.top + singleFrameSelected.rect.height * h.y,
                  cursor: h.cursor,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onResizeStart(singleFrameSelected.id, h.edge, e);
                }}
              />
            ))}
        </>
      )}

      {/* Resize handles for a single selected node (any component) */}
      {singleNodeSelected && !readOnly && (
        <>
          <div
            className="absolute -translate-x-1/2 rounded-sm bg-accent px-1.5 py-px text-[10px] font-medium text-white"
            style={{
              left: singleNodeSelected.rect.left + singleNodeSelected.rect.width / 2,
              top: singleNodeSelected.rect.top + singleNodeSelected.rect.height + 6,
            }}
          >
            {Math.round(singleNodeSelected.rect.width / camera.zoom)}
            {" × "}
            {Math.round(singleNodeSelected.rect.height / camera.zoom)}
          </div>
          {HANDLES.map((h) => (
            <div
              key={h.edge}
              className="pointer-events-auto absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-white"
              style={{
                left: singleNodeSelected.rect.left + singleNodeSelected.rect.width * h.x,
                top: singleNodeSelected.rect.top + singleNodeSelected.rect.height * h.y,
                cursor: h.cursor,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onNodeResizeStart(singleNodeSelected.id, h.edge, e);
              }}
            />
          ))}
        </>
      )}

      {/* Drop indicator */}
      {dropIndicator && (
        <div
          className={
            "drop-indicator absolute " +
            (dropIndicator.kind === "line"
              ? "bg-accent"
              : "border-2 border-dashed border-accent bg-accent-muted")
          }
          style={toLocal(dropIndicator.rect)}
        />
      )}
    </div>
  );
}
