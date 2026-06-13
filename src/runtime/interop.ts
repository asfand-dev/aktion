/**
 * Imperative / third-party interop runtime.
 *
 *   $script({ src, global? })  — load an external UMD/ESM script or stylesheet
 *                                once, return a reactive { ready, loading,
 *                                error, value } bag.
 *   $dom                       — a managed observer namespace ($dom.onResize /
 *                                onIntersect / onMutation / measure) so a
 *                                migration of resize/intersection/mutation
 *                                logic doesn't hand-roll listeners + teardown.
 *
 * Both follow the reactive-bag convention used by `src/runtime/realtime.ts`:
 * fields mutate in place and the runtime `notify()`s so the next render
 * observes the change, and every native resource is torn down via
 * `ctx.disposers` on replan / disconnect so a program never leaks a `<script>`
 * download, an observer, or a listener.
 */

import type { EvaluationContext } from "./evaluator.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/* -------------------------------------------------------------------------- */
/*  $script — external script / stylesheet loader                             */
/* -------------------------------------------------------------------------- */

export interface ScriptResource {
  /** `true` once the resource has finished loading successfully. */
  ready: boolean;
  /** `true` while the resource is still downloading / executing. */
  loading: boolean;
  /** The load error, or `null` on success. */
  error: unknown;
  /**
   * The resolved value. For a script with a `global`, this is
   * `window[global]` once loaded (e.g. `window.Stripe`); otherwise `true`.
   * `null` until ready.
   */
  value: unknown;
}

/** One in-flight / settled load shared across every `$script` of the same src. */
interface ScriptLoad {
  promise: Promise<unknown>;
  settled: boolean;
  value: unknown;
  error: unknown;
}

// Loads are de-duplicated per `src` for the lifetime of the document so two
// components asking for the same SDK share a single network request + tag.
const scriptLoads = new Map<string, ScriptLoad>();

function looksLikeStylesheet(src: string, as: string): boolean {
  if (as === "style" || as === "stylesheet" || as === "css") return true;
  return /\.css(\?|#|$)/i.test(src);
}

function loadStylesheet(src: string, attributes: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = src;
    for (const [key, val] of Object.entries(attributes)) {
      if (val == null || /^on/i.test(key)) continue;
      link.setAttribute(key, val === true ? "" : String(val));
    }
    link.addEventListener("load", () => resolve(true));
    link.addEventListener("error", () => reject(new Error(`[aktion] $script failed to load stylesheet: ${src}`)));
    document.head.appendChild(link);
  });
}

function loadScript(
  src: string,
  config: { global?: string; type?: string; attributes: Record<string, unknown> },
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const readValue = (): unknown => {
      if (!config.global) return true;
      const w = globalThis as unknown as Record<string, unknown>;
      return w[config.global] ?? true;
    };
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    if (config.type) script.type = config.type;
    for (const [key, val] of Object.entries(config.attributes)) {
      if (val == null || /^on/i.test(key)) continue;
      script.setAttribute(key, val === true ? "" : String(val));
    }
    script.addEventListener("load", () => resolve(readValue()));
    script.addEventListener("error", () => reject(new Error(`[aktion] $script failed to load: ${src}`)));
    document.head.appendChild(script);
  });
}

/**
 * `$script({ src, global?, type?, as?, attributes? })` — load an external
 * script (or stylesheet) exactly once, reactively gated on readiness. The
 * returned bag's `ready` flag flips to `true` (and `value` to `window[global]`)
 * when the resource finishes loading; reading any field subscribes the render.
 */
export function createScriptResource(config: unknown, ctx: EvaluationContext): ScriptResource {
  const cfg = asRecord(config);
  const src = typeof cfg.src === "string" ? cfg.src : "";
  const global = typeof cfg.global === "string" ? cfg.global : undefined;
  const type = typeof cfg.type === "string" ? cfg.type : undefined;
  const as = typeof cfg.as === "string" ? cfg.as.toLowerCase() : "";
  const attributes = asRecord(cfg.attributes);
  const notify = (): void => ctx.notify?.();

  const resource: ScriptResource = { ready: false, loading: false, error: null, value: null };

  if (!src) {
    resource.error = new Error("[aktion] $script requires a `src`.");
    return resource;
  }
  // No DOM (SSR / Node without a shim) — stay un-ready rather than throwing so
  // a server render falls back to the placeholder UI.
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return resource;
  }

  let load = scriptLoads.get(src);
  if (!load) {
    const promise = looksLikeStylesheet(src, as)
      ? loadStylesheet(src, attributes)
      : loadScript(src, { global, type, attributes });
    load = { promise, settled: false, value: null, error: null };
    promise.then(
      (value) => { load!.settled = true; load!.value = value; },
      (error) => { load!.settled = true; load!.error = error; },
    );
    scriptLoads.set(src, load);
  }

  if (load.settled) {
    if (load.error != null) {
      resource.error = load.error;
    } else {
      resource.ready = true;
      resource.value = global ? (globalThis as Record<string, unknown>)[global] ?? load.value : load.value;
    }
    return resource;
  }

  // Still loading — flip the bag + re-render once the shared load settles.
  resource.loading = true;
  let live = true;
  load.promise.then(
    (value) => {
      if (!live) return;
      resource.loading = false;
      resource.ready = true;
      resource.value = global ? (globalThis as Record<string, unknown>)[global] ?? value : value;
      notify();
    },
    (error) => {
      if (!live) return;
      resource.loading = false;
      resource.error = error;
      notify();
    },
  );
  ctx.disposers.push(() => { live = false; });
  return resource;
}

/* -------------------------------------------------------------------------- */
/*  $dom — managed observer namespace                                         */
/* -------------------------------------------------------------------------- */

/** A disposer returned by an observer helper; calling it stops observing. */
export type DomDisposer = () => void;

export interface DomMeasurement {
  /** The element's bounding rectangle (`getBoundingClientRect()`). */
  rect: DOMRect | { width: number; height: number; top: number; left: number; right: number; bottom: number };
  /** Scroll position + scrollable size of the element. */
  scroll: { top: number; left: number; width: number; height: number };
  /** Current viewport size. */
  viewport: { width: number; height: number };
}

export interface DomManager {
  onResize: (node: unknown, callback: unknown) => DomDisposer;
  onIntersect: (node: unknown, callback: unknown, options?: unknown) => DomDisposer;
  onMutation: (node: unknown, callback: unknown, options?: unknown) => DomDisposer;
  measure: (node: unknown) => DomMeasurement | null;
}

const noopDisposer: DomDisposer = () => {};

function asElement(node: unknown): Element | null {
  return node instanceof Element ? node : null;
}

function asCallback(callback: unknown): ((...args: unknown[]) => void) | null {
  return typeof callback === "function" ? (callback as (...args: unknown[]) => void) : null;
}

/**
 * Build the `$dom` observer manager for a context. Every observer it creates
 * is registered on `ctx.disposers`, so a replan / disconnect tears them all
 * down automatically — callers never have to remember to disconnect.
 */
export function createDomManager(ctx: EvaluationContext): DomManager {
  const notify = (): void => ctx.notify?.();

  /** Track + auto-dispose a native resource; return a one-shot disposer. */
  const track = (stop: () => void): DomDisposer => {
    let done = false;
    const dispose = (): void => {
      if (done) return;
      done = true;
      try { stop(); } catch { /* already gone */ }
    };
    ctx.disposers.push(dispose);
    return dispose;
  };

  return {
    onResize(node, callback) {
      const el = asElement(node);
      const cb = asCallback(callback);
      if (!el || !cb || typeof ResizeObserver === "undefined") return noopDisposer;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.contentRect;
          try { cb({ width: box.width, height: box.height, entry }); } catch { /* user cb */ }
        }
        notify();
      });
      observer.observe(el);
      return track(() => observer.disconnect());
    },

    onIntersect(node, callback, options) {
      const el = asElement(node);
      const cb = asCallback(callback);
      if (!el || !cb || typeof IntersectionObserver === "undefined") return noopDisposer;
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          try { cb(entry); } catch { /* user cb */ }
        }
        notify();
      }, asRecord(options));
      observer.observe(el);
      return track(() => observer.disconnect());
    },

    onMutation(node, callback, options) {
      const el = asElement(node);
      const cb = asCallback(callback);
      if (!el || !cb || typeof MutationObserver === "undefined") return noopDisposer;
      const opts = asRecord(options);
      const observer = new MutationObserver((mutations) => {
        try { cb(mutations); } catch { /* user cb */ }
        notify();
      });
      observer.observe(el, {
        childList: opts.childList !== false,
        attributes: opts.attributes !== false,
        subtree: opts.subtree === true,
        characterData: opts.characterData === true,
      });
      return track(() => observer.disconnect());
    },

    measure(node) {
      const el = asElement(node);
      if (!el) return null;
      const rect = typeof el.getBoundingClientRect === "function"
        ? el.getBoundingClientRect()
        : { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
      const html = el as unknown as {
        scrollTop?: number; scrollLeft?: number; scrollWidth?: number; scrollHeight?: number;
      };
      return {
        rect,
        scroll: {
          top: html.scrollTop ?? 0,
          left: html.scrollLeft ?? 0,
          width: html.scrollWidth ?? 0,
          height: html.scrollHeight ?? 0,
        },
        viewport: {
          width: typeof window !== "undefined" ? window.innerWidth : 0,
          height: typeof window !== "undefined" ? window.innerHeight : 0,
        },
      };
    },
  };
}
