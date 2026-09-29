/**
 * Aktion DevTools — design system.
 *
 * Everything the panel paints comes from the tokens at the top of this file, so
 * the dark and light themes, the two densities, and reduced motion are each a
 * single block of overrides rather than a second stylesheet. The panel lives in
 * its own shadow root and starts from `all: initial`, so nothing the host page
 * sets — a global `font-size`, a `* { box-sizing }`, a reset — can leak in.
 *
 * View-specific rules live next to their view (`views/*.ts` export a `css`
 * string) and are concatenated after these, so a view can lean on the tokens
 * without the shared sheet knowing it exists.
 */

export const tokens = /* css */ `
:host {
  all: initial;
  display: block;
  position: fixed;
  z-index: 2147483000;
  /* style only: layout containment would make the host the containing block
     for the fixed-position layer, pinning menus, dialogs and the launcher to
     the panel's box instead of the viewport. */
  contain: style;
  color-scheme: dark;

  --dt-font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  --dt-mono: ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace;
  --dt-fs: 12px;
  --dt-fs-sm: 11px;
  --dt-fs-xs: 10px;
  --dt-fs-md: 13px;
  --dt-fs-lg: 15px;
  --dt-fs-mono: 11.5px;
  --dt-row: 26px;
  --dt-control: 26px;
  --dt-gap: 8px;

  --dt-r-xs: 4px;
  --dt-r-sm: 6px;
  --dt-r: 8px;
  --dt-r-lg: 11px;
  --dt-r-xl: 14px;

  --dt-bg: #0c0e14;
  --dt-bg-elev: #12151d;
  --dt-bg-elev-2: #1a1e29;
  --dt-bg-sunken: #08090e;
  --dt-bg-hover: rgba(255, 255, 255, 0.045);
  --dt-bg-active: rgba(255, 255, 255, 0.085);
  --dt-bg-selected: rgba(139, 123, 255, 0.15);
  --dt-bg-selected-strong: rgba(139, 123, 255, 0.26);
  --dt-border: rgba(255, 255, 255, 0.065);
  --dt-border-strong: rgba(255, 255, 255, 0.115);
  --dt-border-focus: rgba(139, 123, 255, 0.75);

  --dt-text: #e8eaf0;
  --dt-text-2: #a7aec0;
  --dt-text-3: #7d869a;
  --dt-text-4: #525a6c;

  --dt-accent: #8b7bff;
  --dt-accent-2: #38bdf8;
  --dt-accent-text: #b6adff;
  --dt-accent-soft: rgba(139, 123, 255, 0.14);
  --dt-accent-grad: linear-gradient(135deg, #6366f1 0%, #8b7bff 50%, #38bdf8 100%);
  --dt-on-accent: #ffffff;

  --dt-green: #3ddc97;
  --dt-green-soft: rgba(61, 220, 151, 0.13);
  --dt-amber: #f7b955;
  --dt-amber-soft: rgba(247, 185, 85, 0.14);
  --dt-red: #ff6b76;
  --dt-red-soft: rgba(255, 107, 118, 0.14);
  --dt-blue: #62a8ff;
  --dt-blue-soft: rgba(98, 168, 255, 0.14);
  --dt-cyan: #3fd3ea;
  --dt-cyan-soft: rgba(63, 211, 234, 0.13);
  --dt-purple: #bb8fff;
  --dt-purple-soft: rgba(187, 143, 255, 0.14);
  --dt-pink: #ff79c9;
  --dt-pink-soft: rgba(255, 121, 201, 0.13);
  --dt-orange: #ff9458;
  --dt-orange-soft: rgba(255, 148, 88, 0.14);
  --dt-teal: #2ed3b7;
  --dt-teal-soft: rgba(46, 211, 183, 0.13);
  --dt-grey: #8a93a7;
  --dt-grey-soft: rgba(138, 147, 167, 0.14);

  /* one colour per event kind, used identically by every view */
  --dt-k-commit: var(--dt-accent);
  --dt-k-state: var(--dt-purple);
  --dt-k-effect: var(--dt-green);
  --dt-k-network: var(--dt-cyan);
  --dt-k-route: var(--dt-pink);
  --dt-k-emit: var(--dt-amber);
  --dt-k-log: var(--dt-grey);
  --dt-k-error: var(--dt-red);
  --dt-k-interaction: var(--dt-blue);
  --dt-k-longtask: var(--dt-orange);

  --dt-syn-kw: #c792ea;
  --dt-syn-str: #b5e089;
  --dt-syn-num: #f9a66c;
  --dt-syn-state: #82b1ff;
  --dt-syn-comp: #ffd479;
  --dt-syn-fn: #7fd8ff;
  --dt-syn-com: #5f6a83;
  --dt-syn-punc: #8c95aa;
  --dt-syn-op: #89ddff;
  --dt-syn-prop: #e3b3ff;
  --dt-syn-bool: #ff9cac;

  --dt-shadow-lg: 0 32px 80px -16px rgba(0, 0, 0, 0.65), 0 12px 32px -10px rgba(0, 0, 0, 0.45);
  --dt-shadow-md: 0 16px 40px -12px rgba(0, 0, 0, 0.6), 0 4px 12px -4px rgba(0, 0, 0, 0.35);
  --dt-shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.35);
  --dt-inset-hi: inset 0 1px 0 rgba(255, 255, 255, 0.045);

  --dt-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dt-fast: 110ms;
  --dt-med: 180ms;
}

:host([data-theme="light"]) {
  color-scheme: light;
  --dt-bg: #ffffff;
  --dt-bg-elev: #f7f8fb;
  --dt-bg-elev-2: #eef0f5;
  --dt-bg-sunken: #f2f4f8;
  --dt-bg-hover: rgba(15, 23, 42, 0.045);
  --dt-bg-active: rgba(15, 23, 42, 0.085);
  --dt-bg-selected: rgba(101, 82, 255, 0.11);
  --dt-bg-selected-strong: rgba(101, 82, 255, 0.2);
  --dt-border: rgba(15, 23, 42, 0.08);
  --dt-border-strong: rgba(15, 23, 42, 0.14);
  --dt-border-focus: rgba(101, 82, 255, 0.7);
  --dt-text: #101522;
  --dt-text-2: #475165;
  --dt-text-3: #677084;
  --dt-text-4: #a3aabb;
  --dt-accent: #6552ff;
  --dt-accent-2: #0ea5e9;
  --dt-accent-text: #5341f0;
  --dt-accent-soft: rgba(101, 82, 255, 0.1);
  --dt-green: #0c9467;
  --dt-green-soft: rgba(12, 148, 103, 0.1);
  --dt-amber: #a8660b;
  --dt-amber-soft: rgba(217, 139, 22, 0.13);
  --dt-red: #dc3545;
  --dt-red-soft: rgba(220, 53, 69, 0.1);
  --dt-blue: #2563eb;
  --dt-blue-soft: rgba(37, 99, 235, 0.1);
  --dt-cyan: #0b8ba3;
  --dt-cyan-soft: rgba(11, 139, 163, 0.1);
  --dt-purple: #7c4ddb;
  --dt-purple-soft: rgba(124, 77, 219, 0.1);
  --dt-pink: #c02d86;
  --dt-pink-soft: rgba(192, 45, 134, 0.1);
  --dt-orange: #c2500a;
  --dt-orange-soft: rgba(194, 80, 10, 0.1);
  --dt-teal: #0f8a78;
  --dt-teal-soft: rgba(15, 138, 120, 0.1);
  --dt-grey: #667085;
  --dt-grey-soft: rgba(102, 112, 133, 0.12);
  --dt-syn-kw: #8a3ad6;
  --dt-syn-str: #2f7d1a;
  --dt-syn-num: #b45309;
  --dt-syn-state: #1d5fd8;
  --dt-syn-comp: #9a5b00;
  --dt-syn-fn: #0b7285;
  --dt-syn-com: #8a94a6;
  --dt-syn-punc: #5b667a;
  --dt-syn-op: #0b7ea0;
  --dt-syn-prop: #9b3fb8;
  --dt-syn-bool: #c0264e;
  --dt-shadow-lg: 0 28px 70px -16px rgba(15, 23, 42, 0.28), 0 10px 26px -10px rgba(15, 23, 42, 0.16);
  --dt-shadow-md: 0 14px 36px -12px rgba(15, 23, 42, 0.26), 0 4px 10px -4px rgba(15, 23, 42, 0.1);
  --dt-shadow-sm: 0 1px 4px rgba(15, 23, 42, 0.12);
  --dt-inset-hi: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

:host([data-density="compact"]) {
  --dt-fs: 11.5px;
  --dt-fs-sm: 10.5px;
  --dt-fs-mono: 11px;
  --dt-row: 22px;
  --dt-control: 24px;
  --dt-gap: 6px;
}

:host([data-motion="reduced"]) *,
:host([data-motion="reduced"]) *::before,
:host([data-motion="reduced"]) *::after {
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}
@media (prefers-reduced-motion: reduce) {
  :host(:not([data-motion="full"])) *,
  :host(:not([data-motion="full"])) *::before,
  :host(:not([data-motion="full"])) *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
`;

export const base = /* css */ `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; }
svg.ic { flex: none; display: block; }
::selection { background: rgba(139, 123, 255, 0.35); }
:host([data-theme="light"]) ::selection { background: rgba(101, 82, 255, 0.22); }

* { scrollbar-width: thin; scrollbar-color: rgba(127, 134, 154, 0.35) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(127, 134, 154, 0.28);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background-color: rgba(127, 134, 154, 0.5); }
::-webkit-scrollbar-corner { background: transparent; }

.mono { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.num { font-variant-numeric: tabular-nums; }
.t2 { color: var(--dt-text-2); }
.t3 { color: var(--dt-text-3); }
.t4 { color: var(--dt-text-4); }
.grow { flex: 1 1 auto; min-width: 0; }
.nowrap { white-space: nowrap; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-flex { display: flex; align-items: center; gap: var(--dt-gap); min-width: 0; }
.col-flex { display: flex; flex-direction: column; gap: var(--dt-gap); min-width: 0; }
.wrap { flex-wrap: wrap; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.tone-green { color: var(--dt-green); }
.tone-amber { color: var(--dt-amber); }
.tone-red { color: var(--dt-red); }
.tone-blue { color: var(--dt-blue); }
.tone-cyan { color: var(--dt-cyan); }
.tone-purple { color: var(--dt-purple); }
.tone-pink { color: var(--dt-pink); }
.tone-orange { color: var(--dt-orange); }
.tone-accent { color: var(--dt-accent-text); }
.tone-grey { color: var(--dt-text-3); }
kbd, .kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 4px; border: 1px solid var(--dt-border-strong);
  border-bottom-width: 2px;
  background: var(--dt-bg-elev-2); color: var(--dt-text-2);
  font: 600 10px/1 var(--dt-font);
}
.dt-widget-error {
  padding: 12px; margin: 8px; border-radius: var(--dt-r);
  background: var(--dt-red-soft); color: var(--dt-red); font-size: var(--dt-fs-sm);
}
@keyframes dt-flash-0 { from { background-color: var(--dt-bg-selected-strong); } to { background-color: transparent; } }
@keyframes dt-flash-1 { from { background-color: var(--dt-bg-selected-strong); } to { background-color: transparent; } }
.flash-0 { animation: dt-flash-0 1100ms var(--dt-ease); }
.flash-1 { animation: dt-flash-1 1100ms var(--dt-ease); }
@keyframes dt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes dt-spin { to { transform: rotate(360deg); } }
@keyframes dt-in { from { opacity: 0; transform: translateY(4px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes dt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dt-shimmer { from { background-position: -200px 0; } to { background-position: 200px 0; } }
`;

/* -------------------------------------------------------------------------- */
/*  Shell                                                                      */
/* -------------------------------------------------------------------------- */

export const shell = /* css */ `
.dt {
  position: relative;
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--dt-bg);
  color: var(--dt-text);
  font: 400 var(--dt-fs)/1.45 var(--dt-font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow: hidden;
  border: 1px solid var(--dt-border-strong);
  box-shadow: var(--dt-shadow-lg);
}
:host([data-dock="float"]) .dt { border-radius: var(--dt-r-xl); animation: dt-in var(--dt-med) var(--dt-ease); }
:host([data-dock="float"]) .dt::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; z-index: 3; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(139, 123, 255, 0.55) 30%, rgba(56, 189, 248, 0.45) 70%, transparent);
}
:host([data-dock="right"]) .dt { border-width: 0 0 0 1px; }
:host([data-dock="left"]) .dt { border-width: 0 1px 0 0; }
:host([data-dock="bottom"]) .dt { border-width: 1px 0 0 0; }
:host([data-minimized]) .dt { display: none; }

/* ---- titlebar ---- */
.dt-titlebar {
  flex: none;
  display: flex; align-items: center; gap: 6px;
  height: 40px; padding: 0 6px 0 10px;
  border-bottom: 1px solid var(--dt-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.022), transparent 80%), var(--dt-bg);
  user-select: none;
}
:host([data-theme="light"]) .dt-titlebar { background: linear-gradient(180deg, #fbfbfd, #ffffff); }
:host([data-dock="float"]) .dt-titlebar { cursor: grab; }
:host([data-dock="float"]) .dt-titlebar.is-dragging { cursor: grabbing; }
.dt-brand { display: flex; align-items: center; gap: 7px; padding-right: 4px; white-space: nowrap; }
.dt-brand-name { font-weight: 650; font-size: var(--dt-fs-md); letter-spacing: -0.01em; }
.dt-brand-name span { font-weight: 450; color: var(--dt-text-2); }
.dt-sep-v { width: 1px; height: 18px; background: var(--dt-border-strong); margin: 0 4px; flex: none; }
.dt-crumb { display: flex; align-items: center; gap: 6px; min-width: 64px; flex: 0 1 auto; overflow: hidden; color: var(--dt-text-2); font-weight: 550; }
.dt-crumb .ic { color: var(--dt-text-3); }
.dt-crumb-title { color: var(--dt-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dt-crumb > .ic { flex: none; }
.dt-crumb-hint { color: var(--dt-text-3); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dt-appswitch {
  display: inline-flex; align-items: center; gap: 7px;
  height: 26px; max-width: 220px; padding: 0 8px 0 9px;
  border-radius: 7px; border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-elev); color: var(--dt-text);
  font-weight: 550; font-size: var(--dt-fs-sm);
  transition: border-color var(--dt-fast), background var(--dt-fast);
}
.dt-appswitch:hover { background: var(--dt-bg-elev-2); }
.dt-appswitch .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-appswitch .ic { color: var(--dt-text-3); }

.dt-status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--dt-green); box-shadow: 0 0 0 3px var(--dt-green-soft);
}
.dt-status-dot.t-amber { background: var(--dt-amber); box-shadow: 0 0 0 3px var(--dt-amber-soft); }
.dt-status-dot.t-red { background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.dt-status-dot.t-grey { background: var(--dt-text-4); box-shadow: none; }
.dt-status-dot.is-live { animation: dt-pulse 1.8s ease-in-out infinite; }

.dt-rec {
  display: inline-flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 9px; border-radius: 7px;
  border: 1px solid var(--dt-border-strong); background: var(--dt-bg-elev);
  font-weight: 550; font-size: var(--dt-fs-sm); color: var(--dt-text-2);
}
.dt-rec .rec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); animation: dt-pulse 1.6s ease-in-out infinite; }
.dt-rec.is-paused .rec-dot { background: var(--dt-text-4); box-shadow: none; animation: none; border-radius: 2px; }
.dt-rec:hover { color: var(--dt-text); background: var(--dt-bg-elev-2); }

.dt-cmdk {
  display: inline-flex; align-items: center; gap: 8px;
  /* Shrinks before the section title does, and never wraps its hint. */
  flex: 0 1 240px; height: 26px; padding: 0 6px 0 8px; min-width: 120px;
  border-radius: 7px; border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-sunken); color: var(--dt-text-3);
  font-size: var(--dt-fs-sm); white-space: nowrap;
}
.dt-cmdk:hover { color: var(--dt-text-2); border-color: var(--dt-border-focus); }
.dt-cmdk .grow { text-align: left; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dt-cmdk > .row-flex, .dt-cmdk > svg { flex: none; }

/* ---- body ---- */
.dt-main { flex: 1 1 auto; display: flex; min-height: 0; }
.dt-rail {
  flex: none; width: 46px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 0;
  border-right: 1px solid var(--dt-border);
  overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
  container-type: size;
  /* Scroll shadows: the covers scroll WITH the content (local), the shadows
     stay put (scroll), so a shadow shows only at an edge with more to see. */
  background:
    linear-gradient(var(--dt-bg) 40%, transparent) center top / 100% 22px no-repeat local,
    linear-gradient(transparent, var(--dt-bg) 60%) center bottom / 100% 22px no-repeat local,
    radial-gradient(farthest-side at 50% 0, rgba(0, 0, 0, 0.28), transparent) center top / 100% 9px no-repeat scroll,
    radial-gradient(farthest-side at 50% 100%, rgba(0, 0, 0, 0.28), transparent) center bottom / 100% 9px no-repeat scroll,
    var(--dt-bg);
}
/* Short panels get a tighter rail before anything has to scroll. */
@container (max-height: 700px) {
  .dt-rail-item { height: 30px; }
  .dt-rail-sep { margin: 3px 0; }
}
.dt-rail::-webkit-scrollbar { display: none; }
.dt-rail.is-wide { width: 176px; align-items: stretch; padding: 6px 6px; }
.dt-rail-sep { width: 20px; height: 1px; background: var(--dt-border-strong); margin: 5px 0; flex: none; }
.dt-rail.is-wide .dt-rail-sep { width: auto; margin: 6px 6px; }
.dt-rail-label { display: none; }
.dt-rail.is-wide .dt-rail-label { display: block; padding: 8px 8px 4px; font-size: var(--dt-fs-xs); font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }
.dt-rail-item {
  position: relative; flex: none;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 34px; height: 34px; border-radius: 9px;
  border: 0; background: transparent; color: var(--dt-text-3);
  transition: background var(--dt-fast), color var(--dt-fast);
}
.dt-rail.is-wide .dt-rail-item { width: auto; height: 30px; justify-content: flex-start; padding: 0 9px; }
.dt-rail-item:hover { background: var(--dt-bg-hover); color: var(--dt-text); }
.dt-rail-item:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.dt-rail-item.is-active { background: var(--dt-bg-selected); color: var(--dt-accent-text); }
.dt-rail-item.is-active::before {
  content: ""; position: absolute; left: -6px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0;
  background: var(--dt-accent-grad);
}
.dt-rail.is-wide .dt-rail-item.is-active::before { left: -6px; }
.dt-rail-item .name { display: none; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dt-rail.is-wide .dt-rail-item .name { display: block; flex: 1; text-align: left; }
.dt-rail-badge {
  position: absolute; top: 2px; right: 1px;
  min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px;
  font: 700 9px/15px var(--dt-font); text-align: center;
  background: var(--dt-bg-active); color: var(--dt-text-2);
  box-shadow: 0 0 0 2px var(--dt-bg);
  font-variant-numeric: tabular-nums;
}
.dt-rail.is-wide .dt-rail-badge { position: static; box-shadow: none; }
.dt-rail-badge.t-red { background: var(--dt-red); color: #fff; }
.dt-rail-badge.t-amber { background: var(--dt-amber); color: #1a1205; }
.dt-rail-badge.t-accent { background: var(--dt-accent); color: #fff; }
.dt-rail-dot { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--dt-red); box-shadow: 0 0 0 2px var(--dt-bg); }
.dt-rail-spacer { flex: 1 0 8px; }

.dt-content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; position: relative; background: var(--dt-bg); }
.dt-view { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; animation: dt-fade var(--dt-med) var(--dt-ease); }
.dt-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dt-pad { padding: 12px; }

/* ---- status bar ---- */
.dt-statusbar {
  flex: none;
  display: flex; align-items: center; gap: 14px;
  height: 25px; padding: 0 10px;
  border-top: 1px solid var(--dt-border);
  background: var(--dt-bg);
  color: var(--dt-text-3);
  font-size: var(--dt-fs-xs); font-weight: 500;
  white-space: nowrap; overflow: hidden;
}
.dt-sb-item { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; padding: 0; color: inherit; font: inherit; height: 100%; }
button.dt-sb-item:hover { color: var(--dt-text); }
.dt-sb-item .ic { opacity: 0.85; }
.dt-sb-item b { color: var(--dt-text-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.dt-sb-item.t-red, .dt-sb-item.t-red b { color: var(--dt-red); }
.dt-sb-item.t-amber, .dt-sb-item.t-amber b { color: var(--dt-amber); }
.dt-sb-item.t-green b { color: var(--dt-green); }

/* ---- resizing + docking ---- */
.dt-edge { position: absolute; z-index: 5; }
.dt-edge.n { top: -3px; left: 8px; right: 8px; height: 7px; cursor: ns-resize; }
.dt-edge.s { bottom: -3px; left: 8px; right: 8px; height: 7px; cursor: ns-resize; }
.dt-edge.e { right: -3px; top: 8px; bottom: 8px; width: 7px; cursor: ew-resize; }
.dt-edge.w { left: -3px; top: 8px; bottom: 8px; width: 7px; cursor: ew-resize; }
.dt-edge.ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
.dt-edge.nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.dt-edge.se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.dt-edge.sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
.dt-edge:hover::after, .dt-edge.is-active::after {
  content: ""; position: absolute; inset: 2px; border-radius: 3px; background: var(--dt-accent); opacity: 0.55;
}
.dt-edge.ne:hover::after, .dt-edge.nw:hover::after, .dt-edge.se:hover::after, .dt-edge.sw:hover::after { display: none; }

.dt-snap {
  position: fixed; z-index: 2147482999; pointer-events: none;
  border-radius: 12px; border: 2px solid rgba(139, 123, 255, 0.85);
  background: rgba(139, 123, 255, 0.12);
  box-shadow: 0 0 0 9999px rgba(8, 9, 14, 0.18);
  transition: all var(--dt-med) var(--dt-ease);
}

/* ---- launcher ---- */
.dt-launcher {
  position: fixed; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 14px 0 10px; border-radius: 19px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(14, 16, 24, 0.82);
  -webkit-backdrop-filter: blur(14px) saturate(1.5);
  backdrop-filter: blur(14px) saturate(1.5);
  color: #e8eaf0;
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  font: 600 12px/1 var(--dt-font);
  cursor: pointer; user-select: none;
  transition: transform var(--dt-med) var(--dt-ease), box-shadow var(--dt-med) var(--dt-ease), background var(--dt-fast);
  animation: dt-in var(--dt-med) var(--dt-ease);
}
.dt-launcher:hover { transform: translateY(-1px); background: rgba(20, 22, 32, 0.92); box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.55), 0 0 0 4px rgba(139, 123, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08); }
.dt-launcher:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(139, 123, 255, 0.7); }
.dt-launcher.is-dragging { cursor: grabbing; transform: scale(1.03); }
.dt-launcher .count { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
.dt-launcher .count.t-red { color: #ff8f98; }
.dt-launcher .count.t-amber { color: #ffd08a; }
.dt-launcher .hint { color: rgba(232, 234, 240, 0.5); font-weight: 500; }
`;

/* -------------------------------------------------------------------------- */
/*  Controls                                                                   */
/* -------------------------------------------------------------------------- */

export const controls = /* css */ `
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: var(--dt-control); padding: 0 10px;
  border-radius: var(--dt-r-sm);
  border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-elev);
  color: var(--dt-text);
  font-weight: 550; font-size: var(--dt-fs-sm);
  white-space: nowrap;
  box-shadow: var(--dt-inset-hi);
  transition: background var(--dt-fast), border-color var(--dt-fast), color var(--dt-fast), box-shadow var(--dt-fast), transform var(--dt-fast);
}
.btn:hover:not(:disabled) { background: var(--dt-bg-elev-2); border-color: var(--dt-border-strong); }
.btn:active:not(:disabled) { transform: translateY(0.5px); }
.btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.btn:disabled { opacity: 0.45; }
.btn .ic { color: var(--dt-text-2); }
.btn.is-primary {
  background: linear-gradient(180deg, #9384ff, #7663ff); border-color: rgba(255, 255, 255, 0.14); color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 6px 16px -6px rgba(118, 99, 255, 0.7);
}
.btn.is-primary .ic { color: #fff; }
.btn.is-primary:hover:not(:disabled) { background: linear-gradient(180deg, #9d90ff, #7f6dff); }
:host([data-theme="light"]) .btn.is-primary { background: linear-gradient(180deg, #7565ff, #5c48f5); }
.btn.is-ghost { background: transparent; border-color: transparent; box-shadow: none; color: var(--dt-text-2); }
.btn.is-ghost:hover:not(:disabled) { background: var(--dt-bg-hover); color: var(--dt-text); }
.btn.is-danger { color: var(--dt-red); }
.btn.is-danger .ic { color: var(--dt-red); }
.btn.is-danger:hover:not(:disabled) { background: var(--dt-red-soft); border-color: transparent; }
.btn.is-success { color: var(--dt-green); }
.btn.is-on { background: var(--dt-accent-soft); border-color: rgba(139, 123, 255, 0.45); color: var(--dt-accent-text); }
.btn.is-on .ic { color: var(--dt-accent-text); }
.btn.is-sm { height: 22px; padding: 0 8px; font-size: var(--dt-fs-xs); border-radius: 5px; gap: 5px; }
.btn.is-lg { height: 32px; padding: 0 14px; font-size: var(--dt-fs); border-radius: var(--dt-r); }
.btn .kbd { margin-left: 2px; }

.ibtn {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: var(--dt-control); height: var(--dt-control);
  border-radius: var(--dt-r-sm); border: 1px solid transparent;
  background: transparent; color: var(--dt-text-3);
  transition: background var(--dt-fast), color var(--dt-fast);
}
.ibtn:hover:not(:disabled) { background: var(--dt-bg-hover); color: var(--dt-text); }
.ibtn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.ibtn:disabled { opacity: 0.4; }
.ibtn.is-on { color: var(--dt-accent-text); background: var(--dt-accent-soft); }
.ibtn.is-danger:hover { color: var(--dt-red); background: var(--dt-red-soft); }
.ibtn.is-sm { width: 20px; height: 20px; border-radius: 5px; }
.ibtn.is-lg { width: 30px; height: 30px; }
.ibtn .dot { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--dt-red); }

.seg {
  display: inline-flex; align-items: center; gap: 2px; flex: none;
  padding: 2px; border-radius: 8px;
  background: var(--dt-bg-sunken); border: 1px solid var(--dt-border);
}
.seg button {
  display: inline-flex; align-items: center; gap: 6px;
  height: calc(var(--dt-control) - 4px); padding: 0 10px;
  border: 0; border-radius: 6px; background: transparent;
  color: var(--dt-text-3); font-weight: 550; font-size: var(--dt-fs-sm);
  white-space: nowrap;
  transition: background var(--dt-fast), color var(--dt-fast), box-shadow var(--dt-fast);
}
.seg button:hover { color: var(--dt-text); }
.seg button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.seg button.is-on { background: var(--dt-bg-elev-2); color: var(--dt-text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--dt-border-strong); }
:host([data-theme="light"]) .seg button.is-on { background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12), 0 0 0 1px var(--dt-border-strong); }
.seg .seg-count { font-size: var(--dt-fs-xs); color: var(--dt-text-3); font-variant-numeric: tabular-nums; }
.seg button.is-on .seg-count { color: var(--dt-accent-text); }

.tabs { display: flex; align-items: stretch; gap: 2px; border-bottom: 1px solid var(--dt-border); padding: 0 8px; flex: none; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button {
  position: relative; flex: none;
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 10px; border: 0; background: none;
  color: var(--dt-text-3); font-weight: 550; font-size: var(--dt-fs-sm); white-space: nowrap;
}
.tabs button:hover { color: var(--dt-text); }
.tabs button:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dt-border-focus); border-radius: 6px; }
.tabs button.is-on { color: var(--dt-text); }
.tabs button.is-on::after {
  content: ""; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px;
  background: var(--dt-accent-grad);
}
.tabs .tab-count { font-size: var(--dt-fs-xs); color: var(--dt-text-3); padding: 0 5px; border-radius: 8px; background: var(--dt-bg-active); font-variant-numeric: tabular-nums; }
.tabs .tab-count.t-red { background: var(--dt-red-soft); color: var(--dt-red); }
.tabs .tab-count.t-amber { background: var(--dt-amber-soft); color: var(--dt-amber); }

.input, .select, .textarea {
  height: var(--dt-control); padding: 0 8px;
  border-radius: var(--dt-r-sm); border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-sunken); color: var(--dt-text);
  font-size: var(--dt-fs-sm);
  transition: border-color var(--dt-fast), box-shadow var(--dt-fast);
  min-width: 0;
}
.input::placeholder, .textarea::placeholder { color: var(--dt-text-4); }
.input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--dt-border-focus); box-shadow: 0 0 0 3px var(--dt-accent-soft); }
.input.is-mono, .textarea.is-mono { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.input.is-invalid { border-color: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.textarea { height: auto; padding: 7px 8px; line-height: 1.5; resize: vertical; }
.select { padding-right: 24px; appearance: none; -webkit-appearance: none; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--dt-text-3) 50%), linear-gradient(135deg, var(--dt-text-3) 50%, transparent 50%);
  background-position: calc(100% - 13px) 50%, calc(100% - 9px) 50%;
  background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }

.search { position: relative; display: flex; align-items: center; min-width: 120px; flex: 0 1 240px; }
.search .ic { position: absolute; left: 8px; color: var(--dt-text-3); pointer-events: none; }
.search .input { width: 100%; padding-left: 27px; padding-right: 26px; }
.search .search-meta { position: absolute; right: 26px; font-size: var(--dt-fs-xs); color: var(--dt-text-3); pointer-events: none; font-variant-numeric: tabular-nums; }
.search .search-clear { position: absolute; right: 3px; }

.switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch .track {
  position: relative; flex: none; width: 28px; height: 16px; border-radius: 8px;
  background: var(--dt-bg-active); border: 1px solid var(--dt-border-strong);
  transition: background var(--dt-fast), border-color var(--dt-fast);
}
.switch .track::after {
  content: ""; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border-radius: 50%;
  background: var(--dt-text-2); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform var(--dt-med) var(--dt-ease), background var(--dt-fast);
}
.switch input:checked + .track { background: var(--dt-accent); border-color: transparent; }
.switch input:checked + .track::after { transform: translateX(12px); background: #fff; }
.switch input:focus-visible + .track { box-shadow: 0 0 0 2px var(--dt-border-focus); }
.switch .switch-label { font-weight: 500; }

.check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; user-select: none; }
.check input { accent-color: var(--dt-accent); width: 13px; height: 13px; margin: 0; }

.chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 18px; padding: 0 6px; border-radius: 5px;
  font: 600 10px/1 var(--dt-font); letter-spacing: 0.01em;
  background: var(--dt-grey-soft); color: var(--dt-text-2);
  white-space: nowrap; max-width: 100%;
}
.chip.is-mono { font-family: var(--dt-mono); font-weight: 500; font-size: 10.5px; }
.chip .ic { width: 11px; height: 11px; }
.chip.t-green { background: var(--dt-green-soft); color: var(--dt-green); }
.chip.t-amber { background: var(--dt-amber-soft); color: var(--dt-amber); }
.chip.t-red { background: var(--dt-red-soft); color: var(--dt-red); }
.chip.t-blue { background: var(--dt-blue-soft); color: var(--dt-blue); }
.chip.t-cyan { background: var(--dt-cyan-soft); color: var(--dt-cyan); }
.chip.t-purple { background: var(--dt-purple-soft); color: var(--dt-purple); }
.chip.t-pink { background: var(--dt-pink-soft); color: var(--dt-pink); }
.chip.t-orange { background: var(--dt-orange-soft); color: var(--dt-orange); }
.chip.t-teal { background: var(--dt-teal-soft); color: var(--dt-teal); }
.chip.t-accent { background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.chip.is-outline { background: transparent; box-shadow: inset 0 0 0 1px var(--dt-border-strong); color: var(--dt-text-2); }
button.chip { border: 0; cursor: pointer; }
button.chip:hover { filter: brightness(1.15); }

.fchip {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  height: 22px; padding: 0 8px; border-radius: 11px;
  border: 1px solid var(--dt-border-strong); background: transparent;
  color: var(--dt-text-3); font-weight: 550; font-size: var(--dt-fs-xs);
  transition: all var(--dt-fast);
}
.fchip:hover { color: var(--dt-text); border-color: var(--dt-text-4); }
.fchip.is-on { color: var(--dt-text); background: var(--dt-bg-active); border-color: transparent; }
.fchip .swatch { width: 7px; height: 7px; border-radius: 2px; }
.fchip .fcount { color: var(--dt-text-3); font-variant-numeric: tabular-nums; }
.fchip:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }

.badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px;
  font: 700 9.5px/1 var(--dt-font); font-variant-numeric: tabular-nums;
  background: var(--dt-bg-active); color: var(--dt-text-2);
}
.badge.t-red { background: var(--dt-red); color: #fff; }
.badge.t-amber { background: var(--dt-amber); color: #1b1305; }
.badge.t-accent { background: var(--dt-accent); color: #fff; }
.badge.t-green { background: var(--dt-green-soft); color: var(--dt-green); }

.swatch-sq { width: 12px; height: 12px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.35); }
.spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dt-border-strong); border-top-color: var(--dt-accent); animation: dt-spin 0.8s linear infinite; flex: none; }
`;

/* -------------------------------------------------------------------------- */
/*  Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

export const layout = /* css */ `
.viewbar {
  flex: none;
  display: flex; align-items: center; gap: 6px; row-gap: 6px;
  flex-wrap: wrap;
  min-height: 40px; padding: 6px 10px;
  border-bottom: 1px solid var(--dt-border);
}
/* Wrap rather than clip: a narrow docked panel keeps every control reachable. */
.viewbar > * { flex-shrink: 0; }
.viewbar > .search, .viewbar > .input { flex-shrink: 1; min-width: 120px; }
.viewbar.is-sub { min-height: 34px; padding: 4px 10px; background: var(--dt-bg-elev); }
.viewbar .vb-title { font-weight: 650; font-size: var(--dt-fs-md); white-space: nowrap; }
.vb-sep { width: 1px; align-self: stretch; margin: 4px 2px; background: var(--dt-border-strong); flex: none; }

.split { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; position: relative; }
.split.is-col { flex-direction: column; }
.split > .pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.split > .pane.is-first { flex: none; }
.split > .pane.is-second { flex: 1 1 auto; }
.gutter { flex: none; position: relative; z-index: 2; background: var(--dt-border); }
.split:not(.is-col) > .gutter { width: 1px; cursor: col-resize; }
.split.is-col > .gutter { height: 1px; cursor: row-resize; }
.gutter::after { content: ""; position: absolute; inset: -4px; }
.split:not(.is-col) > .gutter::after { inset: 0 -4px; }
.split.is-col > .gutter::after { inset: -4px 0; }
.gutter:hover, .gutter.is-active { background: var(--dt-accent); }

.card {
  background: var(--dt-bg-elev);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-r-lg);
  box-shadow: var(--dt-inset-hi);
  min-width: 0;
}
.card.is-pad { padding: 12px; }
.card-head { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 12px; border-bottom: 1px solid var(--dt-border); }
.card-head.is-bare { border-bottom: 0; padding-bottom: 0; }
.card-title { font-weight: 650; font-size: var(--dt-fs); display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.card-title .ic { color: var(--dt-text-3); }
.card-sub { color: var(--dt-text-3); font-size: var(--dt-fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-body { padding: 12px; min-width: 0; }
.card-body.is-flush { padding: 0; }

.section { padding: 12px 12px 4px; }
.section + .section { border-top: 1px solid var(--dt-border); }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; min-height: 22px; }
.section-title { font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--dt-text-3); white-space: nowrap; display: flex; align-items: center; gap: 6px; }

.grid-cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.grid-stats { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); }

.stat {
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 11px 9px; border-radius: var(--dt-r);
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border);
  box-shadow: var(--dt-inset-hi);
  min-width: 0; text-align: left; color: inherit;
}
button.stat { cursor: pointer; transition: border-color var(--dt-fast), background var(--dt-fast); }
button.stat:hover { border-color: var(--dt-border-strong); background: var(--dt-bg-elev-2); }
.stat-label { font-size: var(--dt-fs-xs); font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; color: var(--dt-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
.stat-value { font-size: 18px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.2; }
.stat-value small { font-size: 11px; font-weight: 550; color: var(--dt-text-3); margin-left: 2px; letter-spacing: 0; }
.stat-foot { font-size: var(--dt-fs-xs); color: var(--dt-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-main { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; min-width: 0; }
.stat .spark { flex: none; opacity: 0.9; line-height: 0; margin-bottom: 3px; }
.stat.t-green .stat-value { color: var(--dt-green); }
.stat.t-amber .stat-value { color: var(--dt-amber); }
.stat.t-red .stat-value { color: var(--dt-red); }
.stat.t-accent .stat-value { color: var(--dt-accent-text); }

.empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  gap: 8px; padding: 36px 20px; color: var(--dt-text-3); flex: 1 1 auto; min-height: 160px;
}
.empty-art {
  width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center;
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong); color: var(--dt-text-3);
  box-shadow: var(--dt-inset-hi), 0 8px 24px -12px rgba(0, 0, 0, 0.5); margin-bottom: 4px;
}
.empty-title { color: var(--dt-text); font-weight: 650; font-size: var(--dt-fs-md); }
.empty-body { max-width: 380px; line-height: 1.55; }
.empty-actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }

.kv { display: grid; grid-template-columns: minmax(90px, max-content) 1fr; gap: 5px 14px; font-size: var(--dt-fs-sm); align-items: baseline; }
.kv > dt { color: var(--dt-text-3); white-space: nowrap; margin: 0; }
.kv > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--dt-text); }

.note {
  display: flex; gap: 9px; align-items: flex-start;
  padding: 9px 11px; border-radius: var(--dt-r);
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border);
  color: var(--dt-text-2); font-size: var(--dt-fs-sm); line-height: 1.5;
}
.note .ic { margin-top: 1px; color: var(--dt-text-3); }
.note.t-info { background: var(--dt-blue-soft); border-color: transparent; }
.note.t-info .ic { color: var(--dt-blue); }
.note.t-warn { background: var(--dt-amber-soft); border-color: transparent; }
.note.t-warn .ic { color: var(--dt-amber); }
.note.t-error { background: var(--dt-red-soft); border-color: transparent; }
.note.t-error .ic { color: var(--dt-red); }
.note.t-good { background: var(--dt-green-soft); border-color: transparent; }
.note.t-good .ic { color: var(--dt-green); }
.note.t-accent { background: var(--dt-accent-soft); border-color: transparent; }
.note.t-accent .ic { color: var(--dt-accent-text); }
.note b { color: var(--dt-text); font-weight: 650; }

.meter { position: relative; height: 6px; border-radius: 3px; background: var(--dt-bg-active); overflow: hidden; flex: 1 1 auto; min-width: 30px; }
.meter > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--dt-accent-grad); transition: width var(--dt-med) var(--dt-ease); }
.meter.t-green > span { background: var(--dt-green); }
.meter.t-amber > span { background: var(--dt-amber); }
.meter.t-red > span { background: var(--dt-red); }
.meter.t-cyan > span { background: var(--dt-cyan); }

.barlist { display: flex; flex-direction: column; gap: 6px; }
.barlist-row { display: grid; grid-template-columns: minmax(80px, 38%) 1fr 64px; align-items: center; gap: 10px; font-size: var(--dt-fs-sm); padding: 2px 4px; border-radius: 5px; border: 0; background: none; color: inherit; text-align: left; }
button.barlist-row:hover { background: var(--dt-bg-hover); }
.barlist-row .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.barlist-row .val { text-align: right; color: var(--dt-text-3); font-variant-numeric: tabular-nums; }

.pad-sm { padding: 8px; }
.gap-lg { gap: 14px; }
.mt { margin-top: 10px; }
.hint { color: var(--dt-text-3); font-size: var(--dt-fs-sm); line-height: 1.5; }
.hint code, .note code, .empty-body code { font-family: var(--dt-mono); font-size: 0.95em; padding: 1px 4px; border-radius: 4px; background: var(--dt-bg-active); color: var(--dt-text); }
.link { color: var(--dt-accent-text); background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-decoration: none; }
.link:hover { text-decoration: underline; }
`;

/* -------------------------------------------------------------------------- */
/*  Lists, trees, tables                                                       */
/* -------------------------------------------------------------------------- */

export const lists = /* css */ `
.vlist { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; outline: none; overscroll-behavior: contain; }
.vlist:focus-visible { box-shadow: inset 0 0 0 1px var(--dt-border-focus); }
.vlist-sizer { position: relative; width: 100%; }
.vlist-window { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }

.row {
  display: flex; align-items: center; gap: 6px;
  height: var(--dt-row); padding: 0 10px 0 8px; margin: 0 4px;
  border-radius: 6px; color: var(--dt-text-2);
  white-space: nowrap; cursor: default; user-select: none;
  position: relative;
}
.row:hover { background: var(--dt-bg-hover); }
.row.is-selected { background: var(--dt-bg-selected); color: var(--dt-text); }
.vlist:focus .row.is-selected { background: var(--dt-bg-selected-strong); }
.row.is-dim { opacity: 0.55; }
.row .twist {
  flex: none; width: 16px; height: 16px; display: grid; place-items: center;
  color: var(--dt-text-4); border: 0; background: none; padding: 0; border-radius: 4px;
  transition: transform var(--dt-fast) var(--dt-ease), color var(--dt-fast);
}
.row .twist:hover { color: var(--dt-text); background: var(--dt-bg-active); }
.row .twist.is-open { transform: rotate(90deg); }
.row .twist.is-leaf { visibility: hidden; }
.row .guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dt-border); }
.row .meta { margin-left: auto; display: flex; align-items: center; gap: 8px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); font-variant-numeric: tabular-nums; flex: none; }

.table { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.thead {
  flex: none; display: flex; align-items: center;
  height: 28px; padding: 0 4px 0 12px; gap: 0;
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-bg-elev);
  color: var(--dt-text-3); font-size: var(--dt-fs-xs); font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase;
  user-select: none;
}
.th { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 0; white-space: nowrap; overflow: hidden; border: 0; background: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; height: 100%; }
button.th:hover { color: var(--dt-text); }
.th.is-num, .td.is-num { justify-content: flex-end; text-align: right; }
.th .ic { width: 10px; height: 10px; }
.trow {
  display: flex; align-items: center;
  height: var(--dt-row); padding: 0 4px 0 12px;
  border-bottom: 1px solid transparent;
  color: var(--dt-text-2); cursor: default; user-select: none;
}
.trow:nth-child(even) { background: rgba(127, 127, 127, 0.028); }
.trow:hover { background: var(--dt-bg-hover); }
.trow.is-selected { background: var(--dt-bg-selected); color: var(--dt-text); }
.vlist:focus .trow.is-selected { background: var(--dt-bg-selected-strong); }
.trow.is-error { color: var(--dt-red); }
.trow.is-warn { color: var(--dt-amber); }
.td { display: flex; align-items: center; gap: 6px; padding: 0 8px 0 0; white-space: nowrap; overflow: hidden; min-width: 0; }
.td > .ellipsis { flex: 1 1 auto; }
`;

/* -------------------------------------------------------------------------- */
/*  Values, code                                                               */
/* -------------------------------------------------------------------------- */

export const values = /* css */ `
.v { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); white-space: pre; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.v.t-string { color: var(--dt-syn-str); }
.v.t-number, .v.t-bigint { color: var(--dt-syn-num); }
.v.t-boolean { color: var(--dt-syn-bool); }
.v.t-null, .v.t-undefined { color: var(--dt-text-3); font-style: italic; }
.v.t-function { color: var(--dt-syn-fn); font-style: italic; }
.v.t-object, .v.t-array, .v.t-map, .v.t-set { color: var(--dt-text-2); }
.v.t-date, .v.t-regexp { color: var(--dt-syn-kw); }
.v.t-error { color: var(--dt-red); }
.v.t-node { color: var(--dt-syn-comp); }
.v.t-store, .v.t-resource, .v.t-socket { color: var(--dt-syn-state); }
.vk { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-prop); white-space: nowrap; flex: none; }
.vk.is-index { color: var(--dt-text-3); }
.vsep { color: var(--dt-text-4); font-family: var(--dt-mono); flex: none; }
.v.is-editable { cursor: text; border-radius: 4px; padding: 0 3px; margin: 0 -3px; }
.v.is-editable:hover { background: var(--dt-bg-active); box-shadow: inset 0 0 0 1px var(--dt-border-strong); }
.v-edit {
  height: 20px; flex: 1 1 auto; min-width: 60px; padding: 0 5px;
  border-radius: 4px; border: 1px solid var(--dt-border-focus);
  background: var(--dt-bg-sunken); color: var(--dt-text);
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono);
  box-shadow: 0 0 0 3px var(--dt-accent-soft);
}
.v-edit:focus { outline: none; }
.v-edit.is-invalid { border-color: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.v-tag { font-size: 9.5px; font-weight: 650; padding: 1px 5px; border-radius: 4px; background: var(--dt-bg-active); color: var(--dt-text-3); flex: none; letter-spacing: 0.02em; }
.v-tag.t-accent { background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.v-tag.t-amber { background: var(--dt-amber-soft); color: var(--dt-amber); }
.v-tag.t-purple { background: var(--dt-purple-soft); color: var(--dt-purple); }
.v-tag.t-cyan { background: var(--dt-cyan-soft); color: var(--dt-cyan); }
.v-tag.t-green { background: var(--dt-green-soft); color: var(--dt-green); }
.v-tag.t-red { background: var(--dt-red-soft); color: var(--dt-red); }
.v-actions { display: none; align-items: center; gap: 2px; margin-left: 4px; }
.row:hover .v-actions, .row.is-selected .v-actions { display: inline-flex; }

.code {
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 19px;
  background: var(--dt-bg-sunken); color: var(--dt-text);
  tab-size: 2; -moz-tab-size: 2;
}
.code-line { display: flex; height: 19px; white-space: pre; }
.code-line:hover { background: rgba(127, 127, 127, 0.05); }
.code-line.is-focus { background: var(--dt-accent-soft); }
.code-line.is-hit { background: rgba(247, 185, 85, 0.08); }
.code-line.is-error { background: var(--dt-red-soft); }
.code-line.is-warn { background: var(--dt-amber-soft); }
.code-gutter {
  flex: none; width: 48px; padding-right: 12px; text-align: right;
  color: var(--dt-text-4); user-select: none; position: sticky; left: 0; z-index: 1;
  background: var(--dt-bg-sunken); font-variant-numeric: tabular-nums;
}
.code-line.is-focus .code-gutter { background: color-mix(in srgb, var(--dt-accent) 14%, var(--dt-bg-sunken)); }
.code-line.is-error .code-gutter { background: color-mix(in srgb, var(--dt-red) 14%, var(--dt-bg-sunken)); }
.code-line.is-warn .code-gutter { background: color-mix(in srgb, var(--dt-amber) 14%, var(--dt-bg-sunken)); }
/* Long lines scroll horizontally: the window is as wide as the longest line
   (measured in ch by the code view) instead of pinned to the viewport. */
.code-scroll { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.code-scroll > .vlist > .vlist-sizer > .vlist-window { right: auto; min-width: 100%; width: calc(var(--code-cols, 0) * 1ch + 120px); }
.code-line.is-focus .code-gutter { color: var(--dt-accent-text); }
.code-gutter .mark { position: absolute; left: 6px; top: 6px; width: 7px; height: 7px; border-radius: 50%; }
.code-gutter .mark.t-error { background: var(--dt-red); }
.code-gutter .mark.t-warn { background: var(--dt-amber); }
.code-text { flex: 1 1 auto; padding-right: 16px; min-width: 0; }
.code-text mark { background: rgba(247, 185, 85, 0.35); color: inherit; border-radius: 2px; }
.code-diag { margin-left: 18px; font-family: var(--dt-font); font-size: var(--dt-fs-xs); padding: 0 6px; border-radius: 4px; }
.code-diag.t-error { color: var(--dt-red); background: var(--dt-red-soft); }
.code-diag.t-warn { color: var(--dt-amber); background: var(--dt-amber-soft); }
.tok-kw { color: var(--dt-syn-kw); }
.tok-str { color: var(--dt-syn-str); }
.tok-num { color: var(--dt-syn-num); }
.tok-state { color: var(--dt-syn-state); }
.tok-comp { color: var(--dt-syn-comp); }
.tok-fn { color: var(--dt-syn-fn); }
.tok-com { color: var(--dt-syn-com); font-style: italic; }
.tok-punc { color: var(--dt-syn-punc); }
.tok-op { color: var(--dt-syn-op); }
.tok-prop { color: var(--dt-syn-prop); }
.tok-bool { color: var(--dt-syn-bool); }
.tok-tpl { color: var(--dt-syn-str); }
.pre {
  margin: 0; padding: 10px 12px; overflow: auto;
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 1.55;
  white-space: pre; color: var(--dt-text);
  background: var(--dt-bg-sunken); border-radius: var(--dt-r); border: 1px solid var(--dt-border);
  tab-size: 2;
}
.pre.is-wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
`;

/* -------------------------------------------------------------------------- */
/*  Floating layers: menus, tooltips, palette, toasts, dialogs                  */
/* -------------------------------------------------------------------------- */

export const layers = /* css */ `
.dt-layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483001;
  /* The layer is a sibling of the frame, so it does not inherit the frame's
     type — without this the palette, menus and dialogs fall back to the
     browser's default serif. */
  color: var(--dt-text);
  font: 400 var(--dt-fs)/1.45 var(--dt-font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.dt-layer > * { pointer-events: auto; }

.tooltip {
  position: fixed; z-index: 10; pointer-events: none;
  max-width: 320px; padding: 6px 9px; border-radius: 7px;
  background: #1c2030; color: #eef0f6; border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--dt-shadow-md);
  font: 500 11px/1.45 var(--dt-font);
  animation: dt-in 120ms var(--dt-ease);
}
:host([data-theme="light"]) .tooltip { background: #1f2433; }
.tooltip .kbd { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.18); color: #dfe3ee; margin-left: 6px; }
.tooltip .tip-sub { display: block; color: #a4abbd; font-weight: 400; margin-top: 2px; }

.menu {
  position: fixed; z-index: 20; min-width: 180px; max-width: 320px; max-height: 70vh; overflow-y: auto;
  padding: 5px; border-radius: 10px;
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong);
  box-shadow: var(--dt-shadow-md);
  animation: dt-in 130ms var(--dt-ease);
}
.menu-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  height: 28px; padding: 0 9px; border-radius: 6px; border: 0; background: none;
  color: var(--dt-text); font-size: var(--dt-fs-sm); text-align: left; white-space: nowrap;
}
.menu-item .ic { color: var(--dt-text-3); }
.menu-item:hover, .menu-item.is-active, .menu-item:focus-visible { background: var(--dt-bg-selected); outline: none; }
.menu-item.is-danger { color: var(--dt-red); }
.menu-item.is-danger .ic { color: var(--dt-red); }
.menu-item .menu-kbd { margin-left: auto; color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.menu-item.is-checked::after { content: ""; margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: var(--dt-accent); }
.menu-item:disabled { opacity: 0.45; }
.menu-sep { height: 1px; margin: 4px 2px; background: var(--dt-border); }
.menu-label { padding: 6px 9px 3px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }

.scrim {
  position: fixed; inset: 0; z-index: 30;
  background: rgba(6, 7, 12, 0.46);
  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  animation: dt-fade 140ms var(--dt-ease);
  display: flex; align-items: flex-start; justify-content: center;
}
:host([data-theme="light"]) .scrim { background: rgba(15, 23, 42, 0.18); }
.palette {
  margin-top: min(12vh, 90px); width: min(600px, calc(100vw - 32px));
  display: flex; flex-direction: column; max-height: min(520px, 76vh);
  border-radius: 14px; overflow: hidden;
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong);
  box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(139, 123, 255, 0.1);
  animation: dt-in 160ms var(--dt-ease);
}
.palette-input { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 14px; border-bottom: 1px solid var(--dt-border); }
.palette-input .ic { color: var(--dt-accent-text); }
.palette-input input { flex: 1; height: 100%; border: 0; background: none; outline: none; font-size: 14px; color: var(--dt-text); }
.palette-input input::placeholder { color: var(--dt-text-4); }
.palette-list { display: flex; flex-direction: column; overflow: hidden; padding: 6px; flex: 1 1 auto; min-height: 0; }
.palette-group { padding: 8px 10px 4px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }
.palette-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  height: 34px; padding: 0 10px; border-radius: 8px; border: 0; background: none;
  color: var(--dt-text); text-align: left; font-size: var(--dt-fs);
}
.palette-item .pi-icon { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; background: var(--dt-bg-active); color: var(--dt-text-2); flex: none; }
.palette-item .pi-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-item .pi-label mark { background: none; color: var(--dt-accent-text); font-weight: 700; }
.palette-item .pi-group { color: var(--dt-text-3); font-size: var(--dt-fs-sm); white-space: nowrap; }
.palette-item .pi-hint { color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.palette-item.is-active { background: var(--dt-bg-selected); }
.palette-item.is-active .pi-icon { background: var(--dt-accent); color: #fff; }
.palette-foot { display: flex; align-items: center; gap: 14px; height: 34px; padding: 0 14px; border-top: 1px solid var(--dt-border); color: var(--dt-text-3); font-size: var(--dt-fs-xs); background: var(--dt-bg); }
.palette-foot span { display: inline-flex; align-items: center; gap: 5px; }
.palette-empty { padding: 28px; text-align: center; color: var(--dt-text-3); }

.dialog {
  margin-top: min(10vh, 80px); width: min(560px, calc(100vw - 32px)); max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 14px; background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong);
  box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7);
  animation: dt-in 160ms var(--dt-ease);
}
.dialog-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }
.dialog-title { font-size: var(--dt-fs-lg); font-weight: 650; }
.dialog-body { padding: 4px 16px 16px; overflow-y: auto; }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--dt-border); background: var(--dt-bg); }
.shortcut-grid { display: grid; grid-template-columns: 1fr auto; gap: 7px 18px; align-items: center; font-size: var(--dt-fs-sm); }
.shortcut-grid .keys { display: inline-flex; gap: 3px; justify-content: flex-end; }
.shortcut-group { grid-column: 1 / -1; margin-top: 8px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }

.toasts { position: absolute; right: 12px; bottom: 36px; z-index: 40; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 9px; max-width: 380px;
  padding: 9px 10px 9px 12px; border-radius: 10px;
  background: var(--dt-bg-elev-2); border: 1px solid var(--dt-border-strong); color: var(--dt-text);
  box-shadow: var(--dt-shadow-md); font-size: var(--dt-fs-sm); font-weight: 500;
  animation: dt-in 180ms var(--dt-ease);
}
.toast .ic { color: var(--dt-accent-text); }
.toast.t-good .ic { color: var(--dt-green); }
.toast.t-bad .ic { color: var(--dt-red); }
.toast.t-warn .ic { color: var(--dt-amber); }
.toast .toast-action { margin-left: 6px; }
`;

/* -------------------------------------------------------------------------- */
/*  Widgets: canvas, editor, value tree, rings                                 */
/* -------------------------------------------------------------------------- */

export const widgets = /* css */ `
.vrow { overflow: hidden; }
.vlist-empty:empty { display: none; }
.vtree { padding: 4px 0; }
.vtree.is-inline { padding: 2px 0; outline: none; }
.vtree .row { gap: 5px; }
mark.hl { background: rgba(247, 185, 85, 0.3); color: inherit; border-radius: 2px; padding: 0 1px; }

.cv { position: relative; width: 100%; outline: none; user-select: none; touch-action: none; }
.cv:focus-visible { box-shadow: inset 0 0 0 1px var(--dt-border-focus); border-radius: 6px; }
.cv-canvas { position: absolute; inset: 0; display: block; }
.cv-tip {
  position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none;
  max-width: 340px; padding: 7px 10px; border-radius: 8px;
  background: #1c2030; color: #eef0f6; border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--dt-shadow-md);
  font: 500 11px/1.5 var(--dt-font); white-space: nowrap;
}
.cv-tip > div { overflow: hidden; text-overflow: ellipsis; }

.editor {
  position: relative; flex: 1 1 auto; min-height: 220px; overflow: hidden;
  background: var(--dt-bg-sunken); border-top: 1px solid var(--dt-border);
  --ed-pad: 10px; --ed-gutter: 52px;
}
.editor-gutter {
  position: absolute; left: 0; top: 0; bottom: 0; width: var(--ed-gutter);
  padding: var(--ed-pad) 12px var(--ed-pad) 0; overflow: hidden;
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 19px;
  color: var(--dt-text-4); text-align: right; user-select: none;
  border-right: 1px solid var(--dt-border);
}
.editor-num { position: relative; height: 19px; font-variant-numeric: tabular-nums; }
.editor-num .mark { position: absolute; left: 6px; top: 6px; width: 7px; height: 7px; border-radius: 50%; }
.editor-num .mark.t-error { background: var(--dt-red); }
.editor-num .mark.t-warn { background: var(--dt-amber); }
.editor-layer, .editor-input {
  position: absolute; top: 0; bottom: 0; left: var(--ed-gutter); right: 0; margin: 0;
  padding: var(--ed-pad) 16px var(--ed-pad) 12px;
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 19px;
  white-space: pre; tab-size: 2; -moz-tab-size: 2; letter-spacing: 0;
  overflow: auto; border: 0; background: transparent;
}
.editor-layer { pointer-events: none; color: var(--dt-text); overflow: hidden; }
.editor-line { height: 19px; }
.editor-line.is-error { background: var(--dt-red-soft); }
.editor-line.is-warn { background: var(--dt-amber-soft); }
.editor-input { color: transparent; caret-color: var(--dt-text); resize: none; outline: none; z-index: 1; }
.editor-input::selection { background: rgba(139, 123, 255, 0.32); color: transparent; }

.score-ring { position: relative; display: inline-grid; place-items: center; flex: none; }
.score-ring svg { position: absolute; inset: 0; }
.score-num { position: relative; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
`;

/** The shared sheet: tokens → base → shell → controls → layout → lists → values → widgets → layers. */
export const sharedStyles = [tokens, base, shell, controls, layout, lists, values, widgets, layers].join("\n");
