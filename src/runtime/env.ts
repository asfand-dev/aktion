/**
 * Reactive environment globals (suggestions-global VII.4).
 *
 * Exposes read-only reactive namespaces the UI can branch on without manual
 * listeners or host glue:
 *
 *   $viewport   — { width, height }
 *   $breakpoint — { width, active, sm, md, lg, xl }   (active = sm|md|lg|xl|base)
 *   $scroll     — { x, y, progress, direction }
 *   $media      — { prefersDark, prefersReducedMotion, online, pointer, ... }
 *   $mouse      — { x, y }
 *
 * Listeners are attached **lazily on first access** to the relevant namespace,
 * so a program that never reads them pays nothing. Updates are coalesced into
 * a single rAF-throttled `ctx.notify()` and only fire when a snapshot value
 * actually changed, so scroll/resize re-renders stay reasonable. All listeners
 * are torn down via `ctx.disposers` on replan/disconnect.
 */

import type { EvaluationContext } from "./evaluator.js";

const BP_MIN: Array<[string, number]> = [
  ["xl", 1280],
  ["lg", 1024],
  ["md", 768],
  ["sm", 640],
];

function breakpointName(width: number): string {
  for (const [name, min] of BP_MIN) if (width >= min) return name;
  return "base";
}

export interface EnvManager {
  readonly viewport: { width: number; height: number };
  readonly breakpoint: { width: number; active: string; sm: boolean; md: boolean; lg: boolean; xl: boolean };
  readonly scroll: { x: number; y: number; progress: number; direction: string };
  readonly media: { prefersDark: boolean; prefersReducedMotion: boolean; online: boolean; pointer: string; portrait: boolean };
  readonly mouse: { x: number; y: number };
}

export function createEnvManager(ctx: EvaluationContext): EnvManager {
  const hasWin = typeof window !== "undefined";

  // Coalesce many change events into one notify per frame.
  let notifyScheduled = false;
  const scheduleNotify = (): void => {
    if (notifyScheduled) return;
    notifyScheduled = true;
    const fire = (): void => { notifyScheduled = false; ctx.notify?.(); };
    if (hasWin && typeof requestAnimationFrame === "function") requestAnimationFrame(fire);
    else setTimeout(fire, 16);
  };

  // ---- snapshots -----------------------------------------------------------
  let vpW = hasWin ? window.innerWidth : 1024;
  let vpH = hasWin ? window.innerHeight : 768;
  let scX = 0, scY = 0, scProg = 0, scDir = "down";
  let mouseX = 0, mouseY = 0;

  // ---- lazy activation flags ----------------------------------------------
  let resizeOn = false, scrollOn = false, mouseOn = false, mediaOn = false;

  const activateResize = (): void => {
    if (resizeOn || !hasWin) return;
    resizeOn = true;
    let raf = 0;
    const onResize = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = window.innerWidth, h = window.innerHeight;
        if (w !== vpW || h !== vpH) {
          vpW = w; vpH = h;
          // width/height are part of the snapshot, so ANY dimension change
          // notifies (not just breakpoint crossings) — `$util.viewport.width`
          // readers must re-render. Still rAF-coalesced + change-gated above.
          scheduleNotify();
        }
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    ctx.disposers.push(() => { window.removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); });
  };

  const activateScroll = (): void => {
    if (scrollOn || !hasWin) return;
    scrollOn = true;
    activateResize(); // progress depends on viewport height
    let raf = 0;
    const compute = (): void => {
      raf = 0;
      const doc = document.documentElement;
      const y = window.scrollY || doc.scrollTop || 0;
      const x = window.scrollX || doc.scrollLeft || 0;
      const max = (doc.scrollHeight - doc.clientHeight) || 1;
      const prog = Math.round(Math.max(0, Math.min(1, y / max)) * 1000) / 1000;
      const dir = y > scY ? "down" : y < scY ? "up" : scDir;
      if (Math.round(y) !== Math.round(scY) || Math.round(x) !== Math.round(scX) || prog !== scProg || dir !== scDir) {
        scY = y; scX = x; scProg = prog; scDir = dir;
        scheduleNotify();
      }
    };
    const onScroll = (): void => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    ctx.disposers.push(() => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); });
  };

  const activateMouse = (): void => {
    if (mouseOn || !hasWin) return;
    mouseOn = true;
    let raf = 0, nx = 0, ny = 0;
    const onMove = (e: MouseEvent): void => {
      nx = e.clientX; ny = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (nx !== mouseX || ny !== mouseY) { mouseX = nx; mouseY = ny; scheduleNotify(); }
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    ctx.disposers.push(() => { window.removeEventListener("mousemove", onMove); if (raf) cancelAnimationFrame(raf); });
  };

  const mediaQueries: MediaQueryList[] = [];
  const activateMedia = (): void => {
    if (mediaOn || !hasWin || typeof window.matchMedia !== "function") return;
    mediaOn = true;
    const onChange = (): void => scheduleNotify();
    for (const q of ["(prefers-color-scheme: dark)", "(prefers-reduced-motion: reduce)", "(pointer: coarse)", "(orientation: portrait)"]) {
      try {
        const mql = window.matchMedia(q);
        if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
        else if (typeof mql.addListener === "function") mql.addListener(onChange);
        mediaQueries.push(mql);
      } catch { /* unsupported query */ }
    }
    const onLine = (): void => scheduleNotify();
    window.addEventListener("online", onLine);
    window.addEventListener("offline", onLine);
    ctx.disposers.push(() => {
      for (const mql of mediaQueries) {
        if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onChange);
        else if (typeof (mql as { removeListener?: (cb: () => void) => void }).removeListener === "function") (mql as { removeListener: (cb: () => void) => void }).removeListener(onChange);
      }
      window.removeEventListener("online", onLine);
      window.removeEventListener("offline", onLine);
    });
  };

  const mq = (q: string): boolean => {
    if (!hasWin || typeof window.matchMedia !== "function") return false;
    try { return window.matchMedia(q).matches; } catch { return false; }
  };

  return {
    get viewport() {
      activateResize();
      return { width: vpW, height: vpH };
    },
    get breakpoint() {
      activateResize();
      const active = breakpointName(vpW);
      return { width: vpW, active, sm: vpW >= 640, md: vpW >= 768, lg: vpW >= 1024, xl: vpW >= 1280 };
    },
    get scroll() {
      activateScroll();
      return { x: Math.round(scX), y: Math.round(scY), progress: scProg, direction: scDir };
    },
    get media() {
      activateMedia();
      return {
        prefersDark: mq("(prefers-color-scheme: dark)"),
        prefersReducedMotion: mq("(prefers-reduced-motion: reduce)"),
        online: hasWin && typeof navigator !== "undefined" ? navigator.onLine : true,
        pointer: mq("(pointer: coarse)") ? "coarse" : "fine",
        portrait: mq("(orientation: portrait)"),
      };
    },
    get mouse() {
      activateMouse();
      return { x: mouseX, y: mouseY };
    },
  };
}
