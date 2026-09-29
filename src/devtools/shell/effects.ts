/**
 * Aktion DevTools — page-level side effects of view state.
 *
 * Some view state changes the page, not the panel: audit markers drawn over
 * the app, the keyboard tab-order path, landmark outlines, test-id badges, a
 * colour-vision simulation filter on the app element, RTL, and text scaling.
 * Re-applying those on every panel render would thrash the page's DOM, so each
 * one is keyed by a signature and only re-applied when its inputs change —
 * and every one remembers the exact value it replaced so turning it off (or
 * closing the panel) puts the page back precisely as it was.
 */

import type { DevtoolsAppRecord } from "../hook.js";
import type { NetworkRule } from "../protocol.js";
import { can, renderRootElement, type UiState, type ViewContext } from "../context.js";
import { landmarks, tabOrder } from "../a11y.js";
import type { OverlayMarker } from "../overlay.js";

/** Network presets, applied after the user's own rules (so an explicit mock still wins). */
export const THROTTLE_RULES: Record<UiState["throttle"], NetworkRule[]> = {
  none: [],
  fast3g: [{ id: "__throttle", label: "Fast 3G", pattern: "", enabled: true, action: "delay", delayMs: 560 }],
  slow3g: [{ id: "__throttle", label: "Slow 3G", pattern: "", enabled: true, action: "delay", delayMs: 2000 }],
  offline: [{ id: "__throttle", label: "Offline", pattern: "", enabled: true, action: "offline", message: "Failed to fetch (DevTools: offline)" }],
  flaky: [{ id: "__throttle", label: "Flaky network", pattern: "", enabled: true, action: "fail", probability: 0.3, delayMs: 250, message: "Network error (DevTools: flaky network, 30% of requests fail)" }],
};

/** Colour-vision simulation matrices (Machado et al. 2009, severity 1.0). */
const VISION_MATRICES: Record<string, string> = {
  protanopia: "0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0",
  deuteranopia: "0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0",
  tritanopia: "1.256 -0.077 -0.179 0 0  -0.078 0.931 0.148 0 0  0.005 0.691 0.304 0 0  0 0 0 1 0",
  achromatopsia: "0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0",
};

const FILTER_HOST_ID = "aktion-devtools-vision-filters";

function ensureVisionFilters(): void {
  if (typeof document === "undefined" || document.getElementById(FILTER_HOST_ID)) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("id", FILTER_HOST_ID);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  const defs = document.createElementNS(ns, "defs");
  for (const [name, values] of Object.entries(VISION_MATRICES)) {
    const filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", `aktion-dt-vision-${name}`);
    filter.setAttribute("color-interpolation-filters", "linearRGB");
    const matrix = document.createElementNS(ns, "feColorMatrix");
    matrix.setAttribute("type", "matrix");
    matrix.setAttribute("values", values);
    filter.appendChild(matrix);
    defs.appendChild(filter);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

function visionFilter(mode: UiState["a11yVision"]): string {
  if (mode === "none") return "";
  if (mode === "blur") return "blur(2.4px)";
  if (mode === "low-contrast") return "contrast(0.45) brightness(1.15)";
  ensureVisionFilters();
  return `url(#aktion-dt-vision-${mode})`;
}

interface Saved {
  element: HTMLElement;
  filter?: string;
  dir?: string | null;
}

/** Per-panel bookkeeping; opaque to the shell. */
export interface EffectState {
  markersSig?: string;
  tabSig?: string;
  landmarkSig?: string;
  badgeSig?: string;
  visionSig?: string;
  dirSig?: string;
  scaleSig?: string;
  saved?: Saved;
  scale?: { app: DevtoolsAppRecord; base: Record<string, string>; userOverrides: Record<string, string> } | null;
}

const IMPACT_TONE: Record<string, OverlayMarker["tone"]> = { critical: "red", serious: "red", moderate: "amber", minor: "blue" };

/** Findings passing the impact + category filters, in audit order (the numbering source). */
export function visibleFindings<F extends { impact: string; category?: string }>(findings: ReadonlyArray<F>, ui: Pick<UiState, "a11yImpacts" | "a11yCategory">): F[] {
  return findings.filter((f) => ui.a11yImpacts.has(f.impact) && (ui.a11yCategory === "all" || f.category === ui.a11yCategory));
}

export function applySideEffects(raw: object, ctx: ViewContext): void {
  const state = raw as EffectState;
  const { ui, overlay, app, model } = ctx;
  const root = renderRootElement(app);
  const visible = !ui.minimized;

  /* ---- a11y issue markers ---- */
  const run = ui.a11yRun;
  const markersOn = visible && ui.a11yShowOnPage && run !== null;
  const markersSig = markersOn ? `${run!.at}|${[...ui.a11yImpacts].sort().join(",")}|${ui.a11yCategory}` : "";
  if (markersSig !== state.markersSig) {
    state.markersSig = markersSig;
    if (!markersOn) overlay.setMarkers([]);
    else {
      // Numbered exactly like the Accessibility view's list, so "marker 7" and
      // "finding #7" are the same problem.
      const findings = visibleFindings(run!.findings, ui).slice(0, 150);
      overlay.setMarkers(findings.map((finding, i) => ({ element: finding.element, label: String(i + 1), tone: IMPACT_TONE[finding.impact] ?? "grey" })));
    }
  }

  /* ---- tab order + landmarks (recomputed after commits: the DOM moved) ---- */
  const tabSig = visible && ui.a11yTabOrder && root ? `on|${model.revs.commit}` : "";
  if (tabSig !== state.tabSig) {
    state.tabSig = tabSig;
    overlay.setTabOrder(tabSig ? tabOrder(root) : null);
  }
  const landmarkSig = visible && ui.a11yLandmarks && root ? `on|${model.revs.commit}` : "";
  if (landmarkSig !== state.landmarkSig) {
    state.landmarkSig = landmarkSig;
    overlay.setLandmarks(landmarkSig ? landmarks(root).map((l) => ({ element: l.element, label: l.label })) : null);
  }

  /* ---- test ids ---- */
  const badgeSig = visible && ui.showTestIds && root ? `on|${model.revs.commit}` : "";
  if (badgeSig !== state.badgeSig) {
    state.badgeSig = badgeSig;
    if (!badgeSig || !root) overlay.setBadges(null);
    else {
      const items: Array<{ element: Element; text: string }> = [];
      try {
        for (const element of root.querySelectorAll("[data-testid], [data-test-id]")) {
          items.push({ element, text: element.getAttribute("data-testid") ?? element.getAttribute("data-test-id") ?? "" });
          if (items.length >= 300) break;
        }
      } catch {
        /* exotic DOM */
      }
      overlay.setBadges(items);
    }
  }

  /* ---- vision simulation + RTL on the app element ---- */
  const element = app?.element ?? null;
  if (state.saved && state.saved.element !== element) restoreElement(state);
  const visionSig = element ? `${app!.id}|${ui.a11yVision}` : "";
  if (visionSig !== state.visionSig) {
    state.visionSig = visionSig;
    if (element) {
      state.saved ??= { element };
      if (state.saved.filter === undefined) state.saved.filter = element.style.filter;
      const filter = visionFilter(ui.a11yVision);
      element.style.filter = filter ? [state.saved.filter, filter].filter(Boolean).join(" ") : state.saved.filter ?? "";
    }
  }
  const dirSig = element ? `${app!.id}|${ui.emulateDir}` : "";
  if (dirSig !== state.dirSig) {
    state.dirSig = dirSig;
    if (element) {
      state.saved ??= { element };
      if (state.saved.dir === undefined) state.saved.dir = element.getAttribute("dir");
      if (ui.emulateDir === "auto") {
        if (state.saved.dir === null) element.removeAttribute("dir");
        else element.setAttribute("dir", state.saved.dir ?? "");
      } else {
        element.setAttribute("dir", ui.emulateDir);
      }
    }
  }

  /* ---- text scaling via the font-size tokens ---- */
  const scaleSig = app && can(app, "getTheme") && can(app, "setThemeTokens") ? `${app.id}|${ui.emulateTextScale}` : "";
  if (scaleSig !== state.scaleSig) {
    state.scaleSig = scaleSig;
    applyTextScale(state, app, ui.emulateTextScale);
  }
}

function applyTextScale(state: EffectState, app: DevtoolsAppRecord | null, scale: number): void {
  const previous = state.scale;
  if (previous && (previous.app !== app || scale === 1)) {
    // Undo: drop every DevTools override, then put back the ones the user made.
    try {
      previous.app.clearThemeTokens?.();
      if (Object.keys(previous.userOverrides).length > 0) previous.app.setThemeTokens?.(previous.userOverrides);
    } catch {
      /* app gone */
    }
    state.scale = null;
  }
  if (!app || scale === 1 || !can(app, "getTheme") || !can(app, "setThemeTokens")) return;
  let base = state.scale?.base;
  let userOverrides = state.scale?.userOverrides;
  if (!base || !userOverrides) {
    const theme = app.getTheme();
    base = {};
    userOverrides = {};
    for (const [key, value] of Object.entries(theme.tokens)) {
      if (/^fontSize/i.test(key) && /^[\d.]+px$/.test(value.trim())) base[key] = value.trim();
      if (theme.devtoolsOverrides.includes(key)) userOverrides[key] = value;
    }
  }
  const scaled: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) scaled[key] = `${Math.round(Number.parseFloat(value) * scale * 10) / 10}px`;
  if (Object.keys(scaled).length > 0) app.setThemeTokens(scaled);
  state.scale = { app, base, userOverrides };
}

function restoreElement(state: EffectState): void {
  const saved = state.saved;
  if (!saved) return;
  if (saved.filter !== undefined) saved.element.style.filter = saved.filter;
  if (saved.dir !== undefined) {
    if (saved.dir === null) saved.element.removeAttribute("dir");
    else saved.element.setAttribute("dir", saved.dir);
  }
  state.saved = undefined;
  state.visionSig = undefined;
  state.dirSig = undefined;
}

/** Undo everything (the panel is going away). */
export function releaseSideEffects(raw: object, _app: DevtoolsAppRecord | null): void {
  const state = raw as EffectState;
  restoreElement(state);
  if (state.scale) applyTextScale(state, null, 1);
  state.markersSig = state.tabSig = state.landmarkSig = state.badgeSig = state.scaleSig = undefined;
}
