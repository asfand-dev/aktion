/**
 * Client-only export pipeline: renders a frame's clean Aktion program into an
 * offscreen `<aktion-app>` and captures it as PNG / JPEG / SVG. Also hosts
 * the thumbnail capture helper used by the editor shell. Never import this
 * module on the server — it touches `document` and the Aktion runtime.
 */
import { domToPng } from "modern-screenshot";
import type { DesignDocument, Frame } from "@/design/types";
import { exportProgram } from "@/design/codegen";
import { loadAktion, type SchemaIndex } from "@/design/schema";

type AktionAppElement = HTMLElement & { setResponse(program: string): void };

export interface ExportTarget {
  frame: Frame;
  doc: DesignDocument;
  schema: SchemaIndex;
}

/**
 * Local copy of the stable-frames settle poll (see waitForAktionRender in
 * AktionHost) — reimplemented here so the export lib never imports component
 * code (avoids a circular import with the editor shell).
 */
function settle(el: HTMLElement, timeoutMs = 1500): Promise<void> {
  // Timer-based polling, NOT requestAnimationFrame: rAF pauses entirely in
  // hidden/background tabs, which would hang this forever (its deadline check
  // only runs inside the callback).
  return new Promise((resolve) => {
    const start = performance.now();
    let stable = 0;
    const tick = () => {
      const rendered = (el.shadowRoot?.childElementCount ?? 0) > 0;
      stable = rendered ? stable + 1 : 0;
      if (stable >= 2 || performance.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  });
}

/**
 * Mount the frame's program in an offscreen, frame-sized container and wait
 * for the runtime to settle. Callers MUST invoke `cleanup()` when done.
 */
export async function renderFrameOffscreen(
  target: ExportTarget,
  options: { scale?: number } = {},
): Promise<{ el: HTMLElement; cleanup: () => void }> {
  void options; // Raster scale is applied at capture time, not at mount time.
  const { frame, doc, schema } = target;
  await loadAktion();

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${frame.width}px`;
  container.style.height = `${frame.height}px`;
  container.style.overflow = "hidden";
  // The frame's own background back-fills any area the program leaves bare.
  container.style.background = frame.background || "#ffffff";

  const app = document.createElement("aktion-app") as AktionAppElement;
  app.setAttribute("theme", doc.theme);
  app.setAttribute("margin", "0"); // edge-to-edge, matching the canvas
  app.style.display = "block";
  app.style.width = "100%";
  app.style.height = "100%";
  container.appendChild(app);
  document.body.appendChild(container);

  app.setResponse(exportProgram(frame, doc, schema));
  await settle(app);

  return { el: container, cleanup: () => container.remove() };
}

/**
 * Rasterization policy: web-font embedding walks every document stylesheet
 * and inlines each referenced font file (FontAwesome alone is ~1.5 MB across
 * several woff2 files), which blocks the main thread for minutes on large
 * frames. Aktion's default typography is the system-font stack, so raster
 * exports skip web-font embedding — only Font Awesome icon glyphs degrade.
 * A watchdog turns any residual hang into a clear error instead of a stuck
 * spinner.
 */
const CAPTURE_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Rasterize the frame by drawing the generated SVG (renderToString + runtime
 * CSS in a foreignObject) onto a canvas. This is the same browser mechanism
 * DOM-capture libraries use internally, but skips their expensive per-node
 * clone/style-diff pass, which stalls for minutes on shadow-DOM-heavy trees.
 */
async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  scale: number,
  format: "png" | "jpeg",
): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterization failed"));
      img.src = url;
    }),
    CAPTURE_TIMEOUT_MS,
    "Export",
  );
  // Let the embedded document settle briefly before drawing (timer-based —
  // rAF pauses in background tabs).
  await new Promise((r) => setTimeout(r, 60));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.92);
}

export async function exportFramePng(
  target: ExportTarget,
  scale = 2,
): Promise<string> {
  const svg = await exportFrameSvg(target);
  return rasterizeSvg(svg, target.frame.width, target.frame.height, scale, "png");
}

export async function exportFrameJpeg(
  target: ExportTarget,
  scale = 2,
): Promise<string> {
  const svg = await exportFrameSvg(target);
  return rasterizeSvg(svg, target.frame.width, target.frame.height, scale, "jpeg");
}

// ---------------------------------------------------------------------------
// SVG export — renderToString + the runtime's own stylesheet inside a
// foreignObject. Best-effort: the markup must be XHTML-ish for strict SVG
// consumers; browsers render it faithfully.
// ---------------------------------------------------------------------------

/** Runtime stylesheet, read once from a mounted app's shadow root. */
let runtimeCssCache: string | null = null;

async function collectRuntimeCss(theme: string): Promise<string> {
  if (runtimeCssCache !== null) return runtimeCssCache;
  await loadAktion();

  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-100000px";
  holder.style.top = "0";
  const app = document.createElement("aktion-app") as AktionAppElement;
  app.setAttribute("theme", theme);
  holder.appendChild(app);
  document.body.appendChild(holder);
  try {
    app.setResponse('$app(Text("css probe"))');
    await settle(app);
    const root = app.shadowRoot;
    const styles = Array.from(root?.querySelectorAll("style") ?? []);
    let css = styles
      .map((s) => s.textContent ?? "")
      .filter(Boolean)
      .join("\n");
    if (!css && root) {
      // Current runtimes attach their stylesheet via adoptedStyleSheets
      // (constructable stylesheets) instead of <style> tags — serialize it.
      const parts: string[] = [];
      for (const sheet of root.adoptedStyleSheets ?? []) {
        try {
          for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText);
        } catch {
          // Unreadable sheet — skip.
        }
      }
      css = parts.join("\n");
    }
    runtimeCssCache = css;
  } finally {
    holder.remove();
  }
  return runtimeCssCache ?? "";
}

export async function exportFrameSvg(target: ExportTarget): Promise<string> {
  const { frame, doc, schema } = target;
  const aktion = await loadAktion();
  const program = exportProgram(frame, doc, schema);

  const renderToString = (
    aktion as { renderToString?: (program: string) => unknown }
  ).renderToString;
  if (typeof renderToString !== "function") {
    throw new Error("This Aktion runtime does not support SVG export");
  }
  const rendered = await renderToString(program);
  let html = "";
  if (typeof rendered === "string") {
    html = rendered;
  } else if (rendered && typeof rendered === "object" && "html" in rendered) {
    html = String((rendered as { html: unknown }).html ?? "");
  }

  const css = await collectRuntimeCss(doc.theme);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" ` +
    `viewBox="0 0 ${frame.width} ${frame.height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${frame.width}px;height:${frame.height}px;overflow:hidden;background:${frame.background}">` +
    `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>` +
    toXhtml(html) +
    `</div></foreignObject></svg>`
  );
}

/**
 * renderToString emits HTML5 (unclosed void elements like <img> / <br>),
 * which the XML parser inside an SVG rejects. Round-trip through the DOM and
 * re-serialize as well-formed XHTML.
 */
function toXhtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const serializer = new XMLSerializer();
  return Array.from(parsed.body.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join("");
}

// ---------------------------------------------------------------------------
// Misc capture helpers
// ---------------------------------------------------------------------------

/**
 * Downscaled PNG capture of a live element — used for project thumbnails.
 * Skips web-font embedding and caps the runtime: thumbnails run alongside
 * autosave and must never stall the editor.
 */
export async function captureElementDataUrl(
  el: HTMLElement,
  maxWidth = 480,
): Promise<string> {
  const width = el.clientWidth;
  const scale = width > 0 ? Math.min(1, maxWidth / width) : 1;
  return withTimeout(domToPng(el, { scale, font: false }), 8_000, "Thumbnail");
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  if (/;base64$/i.test(header)) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}
