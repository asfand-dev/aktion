"use client";
/** Global keyboard shortcuts for the editor. */
import { useEffect } from "react";
import { useEditor } from "@/store/editor-store";
import { findNode } from "@/design/document";

export function useEditorShortcuts(options: { onSaveNow: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;

      const state = useEditor.getState();
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (meta && key === "z") {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (meta && key === "s") {
        e.preventDefault();
        options.onSaveNow();
        return;
      }
      if (meta && key === "d") {
        e.preventDefault();
        state.duplicateSelection();
        return;
      }
      if (meta && key === "c") {
        state.copySelection();
        return;
      }
      if (meta && key === "v") {
        state.pasteClipboard();
        return;
      }
      if (meta && key === "g") {
        e.preventDefault();
        if (e.shiftKey) state.ungroupSelection();
        else state.groupSelection();
        return;
      }
      if (meta && e.altKey && key === "k") {
        e.preventDefault();
        if (state.selection.length === 1) state.makeSymbol(state.selection[0]);
        return;
      }
      if (meta && key === "0") {
        e.preventDefault();
        state.zoomTo(1, canvasRect());
        return;
      }
      if (!meta && e.shiftKey && e.key === "!") {
        // Shift+1 on most layouts
        const rect = canvasRect();
        if (rect) state.zoomToFit(rect);
        return;
      }
      if (meta) return;

      switch (key) {
        case "delete":
        case "backspace":
          e.preventDefault();
          state.deleteSelection();
          return;
        case "escape":
          state.clearSelection();
          state.setTool("select");
          return;
        case "v":
          state.setTool("select");
          return;
        case "h":
          state.setTool("hand");
          return;
        case "f":
          state.setTool("frame");
          return;
        case "arrowleft":
        case "arrowright":
        case "arrowup":
        case "arrowdown": {
          // Nudge selected frames and freely-placed nodes.
          const step = e.shiftKey ? 10 : 1;
          const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
          const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
          if (state.selection.length === 0) return;
          e.preventDefault();
          state.mutateDoc((draft) => {
            const selected = new Set(state.selection);
            for (const page of draft.pages) {
              for (const frame of page.frames) {
                if (selected.has(frame.id)) {
                  frame.x += dx;
                  frame.y += dy;
                }
                for (const node of frame.children) {
                  if (selected.has(node.id) && node.layout) {
                    node.layout.x += dx;
                    node.layout.y += dy;
                  }
                }
              }
            }
          });
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options]);
}

function canvasRect(): DOMRect | undefined {
  return document.querySelector(".canvas-surface")?.getBoundingClientRect();
}
