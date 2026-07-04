"use client";
/**
 * Debounced autosave: PATCHes the document (+ name) whenever the store marks
 * it dirty, throttles thumbnail capture, warns before closing with unsaved
 * changes, and exposes a manual "save now" flush for ⌘S.
 */
import { useCallback, useEffect, useRef } from "react";
import { useEditor } from "@/store/editor-store";
import { api } from "@/lib/api";
import { toast } from "@/components/ui";

const SAVE_DEBOUNCE_MS = 1200;
const THUMBNAIL_MIN_INTERVAL_MS = 20_000;

export function useAutosave(): { saveNow: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const lastThumbnailAt = useRef(0);

  const save = useCallback(async () => {
    const state = useEditor.getState();
    if (state.readOnly || !state.loaded || !state.projectId) return;
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    state.setSaveState("saving");

    let thumbnail: string | undefined;
    if (Date.now() - lastThumbnailAt.current > THUMBNAIL_MIN_INTERVAL_MS) {
      thumbnail = await captureThumbnail();
      if (thumbnail) lastThumbnailAt.current = Date.now();
    }

    try {
      await api.patch(`/api/projects/${state.projectId}`, {
        name: state.projectName,
        document: state.document,
        ...(thumbnail ? { thumbnail } : {}),
      });
      // Only mark saved if nothing changed while the request was in flight.
      const after = useEditor.getState();
      if (after.saveState === "saving") after.setSaveState("saved");
    } catch (err) {
      useEditor.getState().setSaveState("error");
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void save();
      }
    }
  }, []);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void save();
  }, [save]);

  // Debounce on every dirty transition.
  useEffect(() => {
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.readOnly) return;
      const becameDirty =
        state.saveState === "dirty" &&
        (prev.saveState !== "dirty" ||
          state.docRevision !== prev.docRevision ||
          state.projectName !== prev.projectName);
      if (!becameDirty) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [save]);

  // Warn before closing with unsaved changes + best-effort flush.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useEditor.getState();
      if (state.readOnly || state.saveState === "saved") return;
      // Best-effort keepalive flush (no thumbnail — keep the payload small).
      try {
        fetch(`/api/projects/${state.projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.projectName, document: state.document }),
          keepalive: true,
        });
      } catch {
        // ignore
      }
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { saveNow };
}

/** Capture a small PNG of the first frame for the dashboard card. */
async function captureThumbnail(): Promise<string | undefined> {
  try {
    const host = document.querySelector<HTMLElement>("[data-frame-host]");
    if (!host) return undefined;
    const { captureElementDataUrl } = await import("@/lib/export");
    const dataUrl = await captureElementDataUrl(host, 480);
    // Keep well under the API's 400 KB cap.
    return dataUrl && dataUrl.length < 380_000 ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}
