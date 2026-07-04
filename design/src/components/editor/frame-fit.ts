"use client";
/**
 * Fit a frame's height to its rendered content. Used after AI generation,
 * .aktion imports, and template insertion — and exposed in the inspector —
 * so content below the fold is never silently clipped.
 */
import { useEditor } from "@/store/editor-store";

const MIN_FRAME_HEIGHT = 200;
const SETTLE_TIMEOUT_MS = 4000;

/**
 * Rendered content height of a frame in world px. The frame root is a fixed
 * `height: Npx; overflow: clip` box, so `scrollHeight` reports the full
 * content when it overflows; when content is shorter we union the children's
 * boxes instead (both unaffected by the canvas scale transform, since
 * scrollHeight/offset metrics are layout px).
 */
export function measureFrameContentHeight(frameId: string): number | null {
  const host = document.querySelector<HTMLElement>(`[data-frame-host="${frameId}"]`);
  const root = host
    ?.querySelector("aktion-app")
    ?.shadowRoot?.querySelector<HTMLElement>("[data-frame-root]");
  if (!root) return null;

  const overflowing = root.scrollHeight > root.clientHeight + 1;
  if (overflowing) return root.scrollHeight;

  // Content shorter than the frame: measure the deepest child bottom.
  let bottom = 0;
  const rootTop = root.getBoundingClientRect().top;
  const scale = root.clientHeight > 0 ? root.getBoundingClientRect().height / root.clientHeight : 1;
  const visit = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const rect = child.getBoundingClientRect();
      if (rect.height > 0 || rect.width > 0) {
        bottom = Math.max(bottom, (rect.bottom - rootTop) / (scale || 1));
      }
      if (getComputedStyle(child).display === "contents") visit(child);
    }
  };
  visit(root);
  return bottom > 0 ? Math.ceil(bottom) : null;
}

/**
 * Wait for the frame's runtime render to settle, then resize the frame to
 * its content height (plus a little breathing room when growing). Returns
 * the applied height, or null when nothing changed / frame missing.
 */
export async function fitFrameHeightToContent(
  frameId: string,
  options: { padding?: number } = {},
): Promise<number | null> {
  const padding = options.padding ?? 0;

  // Poll until two consecutive measurements agree (images/fonts settling).
  const start = performance.now();
  let previous = -1;
  let height: number | null = null;
  for (;;) {
    await new Promise((r) => setTimeout(r, 180));
    height = measureFrameContentHeight(frameId);
    if (height !== null && Math.abs(height - previous) <= 2) break;
    previous = height ?? -1;
    if (performance.now() - start > SETTLE_TIMEOUT_MS) break;
  }
  if (height === null) return null;

  const state = useEditor.getState();
  const frame = state.document.pages
    .flatMap((p) => p.frames)
    .find((f) => f.id === frameId);
  if (!frame || state.readOnly) return null;

  const target = Math.max(MIN_FRAME_HEIGHT, Math.round(height + padding));
  if (Math.abs(target - frame.height) < 8) return null;
  state.updateFrame(frameId, { height: target });
  return target;
}
