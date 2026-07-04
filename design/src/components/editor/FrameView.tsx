"use client";
/**
 * One artboard on the canvas: an absolutely-positioned host div containing a
 * live `<aktion-app>` rendering the frame's generated program (editor mode,
 * with data-node-id wrappers). Rendering is fully managed imperatively so the
 * element instance survives program updates and Aktion's reconciler can
 * preserve DOM state.
 */
import { memo, useEffect, useMemo, useRef } from "react";
import type { DesignDocument, Frame } from "@/design/types";
import type { SchemaIndex } from "@/design/schema";
import { loadAktion } from "@/design/schema";
import { frameProgram } from "@/design/codegen";

interface AktionAppElement extends HTMLElement {
  setResponse(text: string): void;
}

export interface FrameViewProps {
  frame: Frame;
  doc: DesignDocument;
  schema: SchemaIndex | null;
  theme: string;
  /** Visual-only translation applied while the frame is being dragged. */
  dragOffset: { x: number; y: number } | null;
  /** Called (rAF-debounced) whenever the shadow DOM re-renders. */
  onRenderTick: () => void;
}

export const FrameView = memo(function FrameView({
  frame,
  doc,
  schema,
  theme,
  dragOffset,
  onRenderTick,
}: FrameViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<AktionAppElement | null>(null);
  const tickRef = useRef(onRenderTick);
  tickRef.current = onRenderTick;

  const program = useMemo(() => {
    if (!schema) return null;
    return frameProgram(frame, doc, schema, { editor: true });
  }, [frame, doc, schema]);

  // Create the aktion-app element once (when the runtime + schema are ready).
  useEffect(() => {
    if (!schema) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let raf = 0;

    (async () => {
      await loadAktion();
      if (cancelled || !hostRef.current || appRef.current) return;
      const el = document.createElement("aktion-app") as AktionAppElement;
      el.setAttribute("theme", theme);
      // Zero the runtime's default 20px app margin: the artboard box must
      // align exactly with the frame host for hit-testing and free placement.
      el.setAttribute("margin", "0");
      el.style.display = "block";
      el.style.width = "100%";
      el.style.height = "100%";
      hostRef.current.appendChild(el);
      appRef.current = el;
      if (program) el.setResponse(program);

      // Re-measure overlays whenever the shadow DOM changes.
      if (el.shadowRoot) {
        observer = new MutationObserver(() => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => tickRef.current());
        });
        observer.observe(el.shadowRoot, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
      tickRef.current();
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(raf);
      appRef.current?.remove();
      appRef.current = null;
    };
    // The element is created once per mount; program/theme sync below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // Sync program text.
  useEffect(() => {
    if (appRef.current && program) appRef.current.setResponse(program);
  }, [program]);

  // Sync theme.
  useEffect(() => {
    appRef.current?.setAttribute("theme", theme);
  }, [theme]);

  return (
    <div
      data-frame-host={frame.id}
      className="absolute"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        background: frame.background,
        transform: dragOffset
          ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
          : undefined,
        boxShadow: "0 2px 14px rgba(0,0,0,0.4)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {frame.children.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md border border-dashed border-black/20 px-4 py-2 text-sm text-black/40">
            Drag components here
          </span>
        </div>
      )}
    </div>
  );
});
