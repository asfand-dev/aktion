/* ============================================================================
 * AKTION QUEST — the runtime
 * ----------------------------------------------------------------------------
 * A JSON-driven learning-game engine. Everything the player sees is described
 * by `games.json`; this file only knows how to *play* that description.
 *
 *   games.json  ->  Game  ->  Stage[]  ->  Challenge (one of 11 engines)
 *
 * Games may ship their own PixiJS + GSAP source (as strings) for backdrops,
 * celebrations and full arcade mini-games. Those strings are compiled with
 * `new Function` and handed a small, documented context object — see game.md.
 *
 * TRUST BOUNDARY: games.json is *code*, not data. Only load bundles you wrote
 * or reviewed, exactly as you would a <script> tag.
 * ========================================================================== */

const VERSION = "1.0.0";
const STORE_KEY = "aktion-quest-v1";

/* ============================================================================
 * 0. Tiny DOM helpers
 * ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") {
        // Custom properties need setProperty — Object.assign silently drops them.
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith("--")) el.style.setProperty(sk, String(sv));
          else el.style[sk] = sv;
        }
      }
      else if (k === "data") for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === "") continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const hexToNum = (hex) => parseInt(String(hex || "#ffffff").replace("#", "").padEnd(6, "0").slice(0, 6), 16);

/* ============================================================================
 * 1. Icon set  (stroke-first, inherits currentColor)
 * ========================================================================== */

const ICONS = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  star: '<path d="m12 3 2.6 5.6 6.4.8-4.7 4.4 1.2 6.2L12 17l-5.5 3 1.2-6.2L3 9.4l6.4-.8z"/>',
  heart: '<path d="M12 20s-7-4.5-7-9.5A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.5C19 15.5 12 20 12 20z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h7M8 11h7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  flame: '<path d="M12 2c2 4 6 5 6 9a6 6 0 0 1-12 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 2-8z"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 14 9 5 9-5M3 11l9 5 9-5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  code: '<path d="m9 18-6-6 6-6M15 6l6 6-6 6"/>',
  route: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M9 18h5a4 4 0 0 0 4-4V9"/>',
  cloud: '<path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.3 2A3.5 3.5 0 0 0 6.5 18z"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  paint: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.9-.8-1.4-.8-2.2 0-.7.6-1.3 1.3-1.3H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11.5" r="1"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  wand: '<path d="m15 4 5 5M3 21l12-12M14 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM20 13l.7 1.3L22 15l-1.3.7L20 17l-.7-1.3L18 15l1.3-.7z"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M10 17h4M9 21h6M12 13v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M3 20h18"/><rect x="5" y="12" width="3.5" height="6"/><rect x="10.5" y="8" width="3.5" height="10"/><rect x="16" y="4" width="3.5" height="14"/>',
  puzzle: '<path d="M10 3h4v2.5a1.5 1.5 0 1 0 3 0V3h4v4h-2.5a1.5 1.5 0 1 0 0 3H21v4h-2.5a1.5 1.5 0 1 0 0 3H21v4h-4v-2.5a1.5 1.5 0 1 0-3 0V21h-4v-4H5.5a1.5 1.5 0 1 0 0-3H3v-4h2.5a1.5 1.5 0 1 0 0-3H3V3h4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4z"/>',
  crown: '<path d="M3 8l3.5 3L12 5l5.5 6L21 8l-2 10H5z"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="m9 3 3 6 3-6"/>',
  refresh: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};
function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (cls) svg.setAttribute("class", cls);
  svg.innerHTML = ICONS[name] || ICONS.spark;
  return svg;
}

/* ============================================================================
 * 2. MiniGSAP — a shim used when the CDN is unreachable
 * ========================================================================== */

const EASES = {
  none: (t) => t,
  linear: (t) => t,
  "power1.in": (t) => t * t,
  "power1.out": (t) => 1 - (1 - t) ** 2,
  "power1.inOut": (t) => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  "power2.in": (t) => t ** 3,
  "power2.out": (t) => 1 - (1 - t) ** 3,
  "power2.inOut": (t) => (t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  "power3.out": (t) => 1 - (1 - t) ** 4,
  "power4.out": (t) => 1 - (1 - t) ** 5,
  "expo.out": (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  "sine.inOut": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  "back.out": (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  "elastic.out": (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1),
  "bounce.out": (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
};
const easeOf = (e) => (typeof e === "function" ? e : EASES[e] || EASES[String(e || "").split("(")[0]] || EASES["power2.out"]);

function makeMiniGsap() {
  const TRANSFORM = new Set(["x", "y", "scale", "scaleX", "scaleY", "rotation", "rotate"]);
  const active = new Set();
  let raf = 0;

  function tick(now) {
    raf = 0;
    for (const tw of [...active]) tw._step(now);
    if (active.size) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function tState(el) {
    if (!el.__gs) el.__gs = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    return el.__gs;
  }
  function flush(el) {
    const s = tState(el);
    el.style.transform = `translate3d(${s.x}px,${s.y}px,0) rotate(${s.rotation}deg) scale(${s.scaleX},${s.scaleY})`;
  }
  const isEl = (t) => t && t.nodeType === 1;

  function readProp(t, k) {
    if (isEl(t)) {
      if (TRANSFORM.has(k)) {
        const s = tState(t);
        if (k === "scale") return s.scaleX;
        if (k === "rotate") return s.rotation;
        return s[k] ?? 0;
      }
      if (k === "opacity" || k === "autoAlpha") return parseFloat(getComputedStyle(t).opacity) || 0;
      const v = parseFloat(getComputedStyle(t)[k]);
      return isNaN(v) ? 0 : v;
    }
    return typeof t[k] === "number" ? t[k] : 0;
  }
  function writeProp(t, k, v) {
    if (isEl(t)) {
      if (TRANSFORM.has(k)) {
        const s = tState(t);
        if (k === "scale") { s.scaleX = s.scaleY = v; }
        else if (k === "rotate" || k === "rotation") s.rotation = v;
        else s[k] = v;
        flush(t);
        return;
      }
      if (k === "opacity" || k === "autoAlpha") { t.style.opacity = String(v); if (k === "autoAlpha") t.style.visibility = v <= .001 ? "hidden" : "visible"; return; }
      t.style[k] = typeof v === "number" && !/^(zIndex|order|fontWeight|lineHeight|flex)$/.test(k) ? `${v}px` : v;
      return;
    }
    t[k] = v;
  }

  class Tween {
    constructor(targets, vars, fromVars) {
      this.targets = (Array.isArray(targets) ? targets : typeof targets === "string" ? $$(targets) : [targets]).filter(Boolean);
      this.vars = vars || {};
      this.dur = (this.vars.duration ?? .5) * 1000;
      this.delay = (this.vars.delay ?? 0) * 1000;
      this.ease = easeOf(this.vars.ease);
      this.stagger = (this.vars.stagger ?? 0) * 1000;
      this.reserved = new Set(["duration", "delay", "ease", "stagger", "onComplete", "onStart", "onUpdate", "repeat", "yoyo", "overwrite", "immediateRender", "paused"]);
      this.props = Object.keys(this.vars).filter((k) => !this.reserved.has(k));
      this.start = performance.now() + this.delay;
      this.tracks = this.targets.map((t, i) => {
        const from = {}, to = {};
        for (const k of this.props) {
          const target = typeof this.vars[k] === "function" ? this.vars[k](i, t) : this.vars[k];
          if (fromVars) { from[k] = typeof fromVars[k] === "function" ? fromVars[k](i, t) : (fromVars[k] ?? readProp(t, k)); to[k] = target; }
          else { from[k] = readProp(t, k); to[k] = target; }
          if (fromVars) writeProp(t, k, from[k]);
        }
        return { t, from, to, offset: this.stagger * i, done: false };
      });
      this.finished = false;
      if (this.vars.onStart) this.vars.onStart();
      active.add(this); kick();
    }
    _step(now) {
      let allDone = true;
      for (const tr of this.tracks) {
        if (tr.done) continue;
        const p = clamp((now - this.start - tr.offset) / (this.dur || 1), 0, 1);
        if (p < 0) { allDone = false; continue; }
        const e = this.ease(p);
        for (const k of this.props) writeProp(tr.t, k, tr.from[k] + (tr.to[k] - tr.from[k]) * e);
        if (p >= 1) tr.done = true; else allDone = false;
      }
      if (this.vars.onUpdate) this.vars.onUpdate();
      if (allDone && !this.finished) {
        this.finished = true; active.delete(this);
        if (this.vars.onComplete) this.vars.onComplete();
      }
    }
    kill() { this.finished = true; active.delete(this); }
  }

  class Timeline {
    constructor(defaults = {}) { this.defaults = defaults; this.cursor = 0; this.queue = []; }
    _at(pos) {
      if (pos == null) return this.cursor;
      if (typeof pos === "number") return pos * 1000;
      const m = String(pos).match(/^([-+])=([\d.]+)$/);
      if (m) return this.cursor + (m[1] === "-" ? -1 : 1) * parseFloat(m[2]) * 1000;
      if (pos === "<") return this.lastStart ?? 0;
      return this.cursor;
    }
    _push(kind, targets, vars, fromVars, pos) {
      const v = { ...this.defaults, ...vars };
      const at = this._at(pos);
      this.lastStart = at;
      const run = kind === "fromTo" ? () => new Tween(targets, v, fromVars)
        : kind === "from" ? () => miniFrom(targets, v)
        : () => new Tween(targets, v);
      this.queue.push(setTimeout(run, at));
      this.cursor = at + ((v.duration ?? .5) + (v.delay ?? 0) + (v.stagger ?? 0) * (Array.isArray(targets) ? targets.length : 0)) * 1000;
      return this;
    }
    to(t, v, pos) { return this._push("to", t, v, null, pos); }
    from(t, v, pos) { return this._push("from", t, v, null, pos); }
    fromTo(t, f, v, pos) { return this._push("fromTo", t, v, f, pos); }
    set(t, v, pos) { const at = this._at(pos); const id = setTimeout(() => miniSet(t, v), at); this.queue.push(id); return this; }
    call(fn, args, pos) { const at = this._at(pos); this.queue.push(setTimeout(() => fn?.(...(args || [])), at)); return this; }
    add(x, pos) { if (typeof x === "function") return this.call(x, [], pos); return this; }
    kill() { this.queue.forEach(clearTimeout); this.queue = []; }
  }
  function miniSet(targets, vars) {
    const list = Array.isArray(targets) ? targets : typeof targets === "string" ? $$(targets) : [targets];
    for (const t of list.filter(Boolean)) for (const [k, v] of Object.entries(vars)) {
      if (["duration", "delay", "ease", "stagger", "onComplete"].includes(k)) continue;
      writeProp(t, k, typeof v === "function" ? v(0, t) : v);
    }
  }
  function miniFrom(targets, vars) {
    const to = {};
    const list = Array.isArray(targets) ? targets : typeof targets === "string" ? $$(targets) : [targets];
    for (const t of list.filter(Boolean)) for (const k of Object.keys(vars)) {
      if (["duration", "delay", "ease", "stagger", "onComplete", "onStart", "onUpdate"].includes(k)) continue;
      to[k] = readProp(t, k);
    }
    return new Tween(targets, { ...to, duration: vars.duration, delay: vars.delay, ease: vars.ease, stagger: vars.stagger, onComplete: vars.onComplete }, vars);
  }

  return {
    __mini: true,
    to: (t, v) => new Tween(t, v),
    fromTo: (t, f, v) => new Tween(t, v, f),
    from: (t, v) => miniFrom(t, v),
    set: miniSet,
    timeline: (d) => new Timeline(d),
    delayedCall: (s, fn) => setTimeout(fn, s * 1000),
    killTweensOf: (targets) => {
      if (targets == null) { for (const tw of [...active]) tw.kill(); return; }
      const list = Array.isArray(targets) ? targets : [targets];
      for (const tw of [...active]) if (tw.targets.some((t) => list.includes(t))) tw.kill();
    },
    registerPlugin: () => {},
  };
}

/**
 * Entrance reveal. `gsap.from` starts an element at opacity 0, so if the frame
 * loop cannot run — a hidden tab throttles rAF to a crawl — the content stays
 * invisible until the tab is looked at again. When motion is off or unavailable,
 * snap straight to the final state instead of animating into it.
 */
const canAnimate = () => !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function reveal(targets, vars) {
  const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  if (!list.length) return;
  if (!canAnimate()) { FX.gsap.set(list, { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0 }); return; }
  FX.gsap.from(list, vars);
}

/* ============================================================================
 * 3. Library loader — PixiJS + GSAP, with CDN failover
 * ========================================================================== */

const FX = { pixi: null, gsap: null, ready: false, lite: false, app: null, layer: null, note: "" };

const CDN = {
  pixi: [
    "https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs",
    "https://unpkg.com/pixi.js@8.6.6/dist/pixi.min.mjs",
    "https://esm.sh/pixi.js@8.6.6",
  ],
  gsap: [
    "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js",
    "https://unpkg.com/gsap@3.12.5/index.js",
    "https://esm.sh/gsap@3.12.5",
  ],
};

async function loadFirst(urls) {
  for (const url of urls) {
    try { return await import(/* @vite-ignore */ url); } catch { /* next */ }
  }
  return null;
}

async function loadLibs(note) {
  note("linking gsap…");
  const g = await loadFirst(CDN.gsap);
  FX.gsap = g?.gsap || g?.default || (g && typeof g.to === "function" ? g : null) || makeMiniGsap();
  if (FX.gsap.__mini) FX.note += "gsap: local shim. ";

  note("spinning up pixi…");
  const p = await loadFirst(CDN.pixi);
  FX.pixi = p && (p.Application ? p : p.default) ? (p.Application ? p : p.default) : null;
  if (!FX.pixi?.Application) { FX.pixi = null; FX.lite = true; FX.note += "pixi: unavailable — arcade stages use their fallback. "; }
  FX.ready = true;
  return FX;
}

/** Boot the shared, full-window backdrop renderer. */
async function initBackdrop() {
  if (!FX.pixi) return null;
  const canvas = $("#fx");
  const app = new FX.pixi.Application();
  await app.init({
    canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: "webgl",
  });
  FX.app = app;
  FX.layer = new FX.pixi.Container();
  app.stage.addChild(FX.layer);
  return app;
}

/* ============================================================================
 * 4. Sandbox — running the PixiJS / GSAP source carried inside games.json
 * ========================================================================== */

/** Shared toolkit handed to every JSON-authored scene. */
function makeSceneKit(stage, size, palette) {
  const PIXI = FX.pixi;
  const colors = {
    g1: hexToNum(palette.g1), g2: hexToNum(palette.g2), g3: hexToNum(palette.g3),
    good: 0x34d399, bad: 0xfb7185, warn: 0xfbbf24, ink: 0xeaeeff, dim: 0x5b6488, bg: 0x05060f,
  };
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function text(str, opts = {}) {
    return new PIXI.Text({
      text: String(str),
      style: {
        fontFamily: opts.mono === false ? "Outfit, sans-serif" : "JetBrains Mono, monospace",
        fontSize: opts.size ?? 14,
        fontWeight: opts.weight ?? "500",
        fill: opts.color ?? colors.ink,
        align: opts.align ?? "left",
      },
    });
  }

  /** A rounded, glowing token — the workhorse of the arcade mini-games. */
  function chip(label, opts = {}) {
    const c = new PIXI.Container();
    const t = text(label, { size: opts.size ?? 14, color: opts.textColor ?? 0x04101a, weight: "700" });
    const padX = opts.padX ?? 14, padY = opts.padY ?? 9;
    const w = Math.max(opts.minWidth ?? 0, t.width + padX * 2);
    const hh = t.height + padY * 2;
    const g = new PIXI.Graphics();
    g.roundRect(-w / 2, -hh / 2, w, hh, opts.radius ?? 11).fill({ color: opts.color ?? colors.g1, alpha: opts.alpha ?? 1 });
    if (opts.stroke) g.roundRect(-w / 2, -hh / 2, w, hh, opts.radius ?? 11).stroke({ width: 1.5, color: opts.stroke, alpha: .9 });
    t.anchor.set(.5);
    c.addChild(g, t);
    c.chipWidth = w; c.chipHeight = hh; c.label = String(label);
    return c;
  }

  function glow(radius, color, alpha = .5) {
    const g = new PIXI.Graphics();
    for (let i = 6; i > 0; i--) g.circle(0, 0, radius * (i / 6)).fill({ color, alpha: alpha * (0.06 + (6 - i) * 0.02) });
    return g;
  }

  return { PIXI, gsap: FX.gsap, stage, colors, rand, pick, text, chip, glow, ...size };
}

/**
 * Stop every tween still pointed at a scene's display objects.
 *
 * A scene animates Pixi objects (`gsap.to(chip.scale, …)`); tearing the scene
 * down destroys those objects, and GSAP happily keeps writing to them on the
 * next frame — `chip.scale` is now null and the tween throws inside GSAP's own
 * ticker, where none of our try/catch can see it. Leaving an arcade stage while
 * anything was mid-animation used to do exactly that.
 */
function killSceneTweens(root) {
  const g = FX.gsap;
  if (!root || !g?.killTweensOf) return;
  (function walk(n) {
    try {
      g.killTweensOf(n);
      if (n.scale) g.killTweensOf(n.scale);
      if (n.position) g.killTweensOf(n.position);
    } catch {}
    for (const kid of n.children || []) walk(kid);
  })(root);
}

/**
 * Compile and run a JSON-authored scene.
 * `code` runs with (PIXI, gsap, ctx) in scope and may return { update, destroy }.
 */
function runScene(code, ctx, label = "scene") {
  if (!code || !FX.pixi) return { destroy() {} };
  const ticks = [], dies = [];
  ctx.onTick = (fn) => ticks.push(fn);
  ctx.onDestroy = (fn) => dies.push(fn);
  let ret = null;
  try {
    const fn = new Function("PIXI", "gsap", "ctx", `"use strict";\n${code}\n`);
    ret = fn(FX.pixi, FX.gsap, ctx) || null;
  } catch (err) {
    console.warn(`[aktion-quest] ${label} failed to compile/run:`, err);
    return { destroy() {} };
  }
  if (ret && typeof ret.update === "function") ticks.push(ret.update);
  if (ret && typeof ret.destroy === "function") dies.push(ret.destroy);

  const app = ctx.app || FX.app;
  const tickFn = (t) => { for (const f of ticks) { try { f(t.deltaTime ?? 1, t); } catch (e) { console.warn(`[aktion-quest] ${label} tick:`, e); } } };
  if (app && ticks.length) app.ticker.add(tickFn);

  return {
    destroy() {
      if (app && ticks.length) app.ticker.remove(tickFn);
      for (const f of dies) { try { f(); } catch {} }
      killSceneTweens(ctx.stage);
      try { ctx.stage?.removeChildren?.(); } catch {}
    },
  };
}

/* ============================================================================
 * 5. Backdrop presets — used when a game does not ship custom scene code
 * ========================================================================== */

const BACKDROPS = {
  starfield: `
    const stars = [];
    const n = ctx.params.count ?? 130;
    for (let i = 0; i < n; i++) {
      const g = new PIXI.Graphics();
      const r = ctx.rand(0.6, 2.1);
      g.circle(0, 0, r).fill({ color: i % 5 === 0 ? ctx.colors.g2 : ctx.colors.g1, alpha: ctx.rand(.15, .7) });
      g.x = ctx.rand(0, ctx.width); g.y = ctx.rand(0, ctx.height);
      g.vy = ctx.rand(.05, .35); g.tw = ctx.rand(0, Math.PI * 2);
      ctx.stage.addChild(g); stars.push(g);
    }
    ctx.onTick((dt) => {
      for (const s of stars) {
        s.y += s.vy * dt; s.tw += 0.03 * dt;
        s.alpha = 0.25 + Math.abs(Math.sin(s.tw)) * 0.55;
        if (s.y > ctx.height + 4) { s.y = -4; s.x = ctx.rand(0, ctx.width); }
      }
    });`,

  stream: `
    // Falling glyph columns — "the program streams in, top to bottom".
    const glyphs = "$ = ( ) { } [ ] => . , A B C".split(" ");
    const cols = [];
    const spacing = 74;
    for (let x = spacing / 2; x < ctx.width; x += spacing) {
      const c = new PIXI.Container(); c.x = x; ctx.stage.addChild(c);
      const items = [];
      for (let i = 0; i < 7; i++) {
        const t = ctx.text(ctx.pick(glyphs), { size: 13, color: i === 0 ? ctx.colors.g1 : ctx.colors.g3 });
        t.alpha = 0.05 + (7 - i) * 0.026; t.y = -i * 30; items.push(t); c.addChild(t);
      }
      c.speed = ctx.rand(.5, 1.6); c.y = ctx.rand(-ctx.height, 0); c.items = items;
      cols.push(c);
    }
    ctx.onTick((dt) => {
      for (const c of cols) {
        c.y += c.speed * dt * 1.6;
        if (c.y > ctx.height + 220) { c.y = -220; c.speed = ctx.rand(.5, 1.6); }
      }
    });`,

  orbit: `
    const core = new PIXI.Container();
    core.x = ctx.width * (ctx.params.cx ?? .78); core.y = ctx.height * (ctx.params.cy ?? .3);
    ctx.stage.addChild(core);
    core.addChild(ctx.glow(210, ctx.colors.g2, .8));
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const g = new PIXI.Graphics();
      const r = 90 + i * 62;
      g.circle(0, 0, r).stroke({ width: 1, color: i % 2 ? ctx.colors.g1 : ctx.colors.g3, alpha: .16 });
      core.addChild(g);
      const dot = new PIXI.Graphics();
      dot.circle(0, 0, 4).fill({ color: ctx.colors.g1, alpha: .85 });
      core.addChild(dot);
      rings.push({ dot, r, a: ctx.rand(0, 6.28), s: (i % 2 ? 1 : -1) * (0.004 + i * 0.002) });
    }
    ctx.onTick((dt) => {
      for (const r of rings) { r.a += r.s * dt; r.dot.x = Math.cos(r.a) * r.r; r.dot.y = Math.sin(r.a) * r.r; }
    });`,

  circuit: `
    const g = new PIXI.Graphics();
    ctx.stage.addChild(g);
    const pulses = [];
    const lanes = ctx.params.lanes ?? 9;
    for (let i = 0; i < lanes; i++) {
      const y = (ctx.height / lanes) * (i + .5);
      pulses.push({ x: ctx.rand(-ctx.width, 0), y, w: ctx.rand(90, 260), s: ctx.rand(1.2, 3.4), c: i % 3 === 0 ? ctx.colors.g2 : ctx.colors.g1 });
    }
    ctx.onTick((dt) => {
      g.clear();
      for (const p of pulses) {
        p.x += p.s * dt;
        if (p.x > ctx.width + p.w) { p.x = -p.w - ctx.rand(0, 400); p.y = ctx.rand(0, ctx.height); }
        g.moveTo(p.x, p.y).lineTo(p.x + p.w, p.y).stroke({ width: 1.6, color: p.c, alpha: .22 });
        g.circle(p.x + p.w, p.y, 2.6).fill({ color: p.c, alpha: .5 });
      }
    });`,

  bloom: `
    const blobs = [];
    for (let i = 0; i < (ctx.params.count ?? 5); i++) {
      const c = new PIXI.Container();
      c.addChild(ctx.glow(ctx.rand(150, 300), i % 2 ? ctx.colors.g2 : ctx.colors.g1, .9));
      c.x = ctx.rand(0, ctx.width); c.y = ctx.rand(0, ctx.height);
      c.vx = ctx.rand(-.25, .25); c.vy = ctx.rand(-.2, .2);
      ctx.stage.addChild(c); blobs.push(c);
    }
    ctx.onTick((dt) => {
      for (const b of blobs) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -200 || b.x > ctx.width + 200) b.vx *= -1;
        if (b.y < -200 || b.y > ctx.height + 200) b.vy *= -1;
      }
    });`,
};

let backdropHandle = null;
function setBackdrop(spec, palette) {
  backdropHandle?.destroy();
  backdropHandle = null;
  if (!FX.app || !FX.layer) return;
  FX.layer.removeChildren();
  const code = spec?.code || BACKDROPS[spec?.preset] || BACKDROPS.starfield;
  const stage = new FX.pixi.Container();
  FX.layer.addChild(stage);
  const ctx = makeSceneKit(stage, { width: window.innerWidth, height: window.innerHeight }, palette);
  ctx.app = FX.app;
  ctx.params = spec?.params || {};
  backdropHandle = runScene(code, ctx, "backdrop");
}

/* ============================================================================
 * 6. Sound — a three-oscillator blip synth (no assets)
 * ========================================================================== */

const Sfx = {
  ctx: null,
  on: true,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.on = false; } }
    if (this.ctx?.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur = .12, type = "sine", gain = .05, when = 0) {
    if (!this.on) return;
    const ac = this.ensure(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    const t0 = ac.currentTime + when;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + .02);
  },
  play(name) {
    if (!this.on) return;
    switch (name) {
      case "click": this.tone(520, .06, "triangle", .035); break;
      case "pick": this.tone(700, .07, "sine", .04); break;
      case "correct": [660, 880, 1320].forEach((f, i) => this.tone(f, .18, "sine", .05, i * .07)); break;
      case "wrong": this.tone(190, .18, "sawtooth", .04); this.tone(140, .22, "sine", .035, .06); break;
      case "stage": [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .22, "triangle", .045, i * .08)); break;
      case "win": [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, .3, "sine", .05, i * .1)); break;
      case "tick": this.tone(1200, .03, "square", .015); break;
      case "hint": this.tone(880, .1, "sine", .035); this.tone(1100, .12, "sine", .03, .07); break;
    }
  },
};

/* ============================================================================
 * 7. Aktion syntax highlighting
 * ========================================================================== */

const AK_KEYWORDS = new Set(["function", "return", "if", "else", "for", "of", "in", "while", "do", "switch", "case", "default",
  "break", "continue", "let", "const", "var", "new", "try", "catch", "finally", "throw", "typeof", "instanceof",
  "async", "await", "true", "false", "null", "undefined", "this"]);

function highlightAktion(src) {
  const s = String(src ?? "");
  const RX = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\$[A-Za-z_]\w*)|(\b\d[\w.]*)|([A-Za-z_]\w*)|([^\sA-Za-z_$\d]+)/g;
  let out = "", last = 0, m;
  while ((m = RX.exec(s))) {
    out += esc(s.slice(last, m.index));
    last = RX.lastIndex;
    const [tok, com, str, dollar, num, ident, punct] = m;
    if (com) out += `<span class="tk-m">${esc(com)}</span>`;
    else if (str) out += `<span class="tk-s">${esc(str)}</span>`;
    else if (dollar) out += `<span class="tk-b">${esc(dollar)}</span>`;
    else if (num) out += `<span class="tk-n">${esc(num)}</span>`;
    else if (ident) {
      const after = s.slice(RX.lastIndex).match(/^\s*(.)/)?.[1] || "";
      let cls = "";
      if (AK_KEYWORDS.has(ident)) cls = "tk-k";
      else if (after === ":") cls = "tk-r";
      else if (/^[A-Z]/.test(ident)) cls = "tk-c";
      else if (after === "(") cls = "tk-f";
      out += cls ? `<span class="${cls}">${esc(ident)}</span>` : esc(ident);
    } else if (punct) out += `<span class="tk-p">${esc(punct)}</span>`;
    else out += esc(tok);
  }
  out += esc(s.slice(last));
  return out;
}

function codeBlock(src, caption) {
  const el = h("div", { class: "code" + (caption ? " cap" : "") });
  if (caption) el.append(h("div", { class: "caption", text: caption }));
  el.insertAdjacentHTML("beforeend", highlightAktion(src));
  return el;
}

/** Very small inline markup: `code`, **bold**, *emph*, and blank-line paragraphs. */
function prose(md) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>");
  const blocks = String(md || "").trim().split(/\n{2,}/);
  return blocks.map((b) => {
    if (/^[-•]\s/m.test(b) && b.split("\n").every((l) => /^[-•]\s/.test(l.trim()) || !l.trim())) {
      return `<ul>${b.split("\n").filter((l) => l.trim()).map((l) => `<li>${inline(l.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${inline(b).replace(/\n/g, "<br/>")}</p>`;
  }).join("");
}

/* ============================================================================
 * 8. Infographics — declarative diagrams, animated in on reveal
 * ========================================================================== */

const INFOGRAPHICS = {
  flow(spec) {
    const box = h("div", { class: "ig-flow" + (spec.direction === "down" ? " down" : "") });
    (spec.nodes || []).forEach((n, i) => {
      if (i) box.append(h("div", { class: "ig-arrow" }, icon("arrow")));
      box.append(h("div", { class: "ig-node" + (n.accent ? " accent" : "") },
        h("b", { text: n.label }), n.note && h("span", { text: n.note })));
    });
    return box;
  },
  compare(spec) {
    const box = h("div", { class: "ig-compare" });
    for (const col of spec.columns || []) {
      const kind = col.kind === "bad" ? "bad" : col.kind === "good" ? "good" : "";
      const el = h("div", { class: "ig-col " + kind },
        h("div", { class: "h" }, icon(kind === "bad" ? "x" : kind === "good" ? "check" : "info"), col.title || (kind === "bad" ? "Wrong" : "Right")),
        h("pre", { html: highlightAktion(col.code || "") }),
        col.note && h("div", { class: "note", text: col.note }));
      box.append(el);
    }
    return box;
  },
  anatomy(spec) {
    const wrap = h("div", { class: "ig-anatomy" });
    const line = h("div", { class: "line" });
    let rest = String(spec.code || "");
    const parts = spec.parts || [];
    const frag = document.createDocumentFragment();
    let cursor = 0;
    const marks = [];
    parts.forEach((p, i) => {
      const at = rest.indexOf(p.match, cursor);
      if (at < 0) return;
      marks.push({ at, len: p.match.length, i });
      cursor = at + p.match.length;
    });
    marks.sort((a, b) => a.at - b.at);
    let pos = 0;
    for (const mk of marks) {
      if (mk.at > pos) frag.append(document.createTextNode(rest.slice(pos, mk.at)));
      const sp = h("span", { class: "part", data: { i: String(mk.i) }, text: rest.slice(mk.at, mk.at + mk.len) });
      frag.append(sp);
      pos = mk.at + mk.len;
    }
    if (pos < rest.length) frag.append(document.createTextNode(rest.slice(pos)));
    line.append(frag);
    const legend = h("div", { class: "ig-legend" });
    parts.forEach((p, i) => {
      const row = h("div", { class: "row", data: { i: String(i) } },
        h("span", { class: "k", text: p.key || p.match }), h("span", { text: p.text || "" }));
      const on = (v) => {
        row.dataset.on = v ? "1" : "";
        $$(`.part[data-i="${i}"]`, wrap).forEach((el) => (el.dataset.on = v ? "1" : ""));
      };
      row.addEventListener("mouseenter", () => on(true));
      row.addEventListener("mouseleave", () => on(false));
      legend.append(row);
    });
    wrap.append(line, legend);
    return wrap;
  },
  layers(spec) {
    return h("div", { class: "ig-layers" }, (spec.layers || []).map((l) =>
      h("div", { class: "ig-layer" }, h("b", { text: l.label }), h("span", { text: l.note || "" }))));
  },
  timeline(spec) {
    return h("div", { class: "ig-timeline" }, (spec.steps || []).map((s) =>
      h("div", { class: "ig-step" }, h("b", { text: s.label }), h("span", { text: s.note || "" }))));
  },
  orbit(spec) {
    return h("div", { class: "ig-orbit" },
      h("div", { class: "ig-core", text: spec.core || "$" }),
      (spec.satellites || []).map((s) => h("div", { class: "ig-sat", html: `<b>${esc(s.label)}</b>${s.note ? " · " + esc(s.note) : ""}` })));
  },
  meter(spec) {
    return h("div", { class: "ig-meter" }, (spec.rows || []).map((r) =>
      h("div", { class: "m" },
        h("b", { text: r.label }),
        h("i", {}, h("em", { data: { pct: String(clamp(r.value ?? 0, 0, 100)) } })),
        h("span", { text: r.note ?? `${r.value}%` }))));
  },
  table(spec) {
    const t = h("table", { class: "ig-table" });
    if (spec.headers) t.append(h("thead", {}, h("tr", {}, spec.headers.map((x) => h("th", { text: x })))));
    t.append(h("tbody", {}, (spec.rows || []).map((r) => h("tr", {}, r.map((c) => h("td", { html: highlightAktion(String(c)) }))))));
    return t;
  },
};

function renderInfographic(spec) {
  if (!spec) return null;
  const build = INFOGRAPHICS[spec.type];
  if (!build) return null;
  const box = h("div", { class: "info" });
  if (spec.title) box.append(h("div", { class: "info-title", text: spec.title }));
  const inner = build(spec);
  box.append(inner);
  requestAnimationFrame(() => {
    const kids = $$(".ig-node,.ig-col,.ig-layer,.ig-step,.ig-sat,.ig-meter .m,.ig-table tbody tr,.ig-legend .row", box);
    if (kids.length) reveal(kids, { opacity: 0, y: 14, duration: .5, stagger: .05, ease: "power2.out" });
    // Percent widths animate via CSS so both the real GSAP and the shim behave.
    $$(".ig-meter em", box).forEach((em, i) => {
      em.style.transition = `width .9s ${.15 + i * .07}s cubic-bezier(.16,1,.3,1)`;
      requestAnimationFrame(() => (em.style.width = em.dataset.pct + "%"));
    });
  });
  return box;
}

/* ============================================================================
 * 9. Progress store
 * ========================================================================== */

const Store = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { this.data = null; }
    if (!this.data || this.data.v !== 1) {
      this.data = { v: 1, xp: 0, streak: 0, best: 0, games: {}, codex: [], sound: true, plays: 0 };
    }
    this.data.games ||= {}; this.data.codex ||= [];
    Sfx.on = this.data.sound !== false;
    return this.data;
  },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch {} },
  game(id) { return (this.data.games[id] ||= { cleared: [], stars: 0, bestXp: 0, done: false, plays: 0 }); },
  reset() { this.data = null; localStorage.removeItem(STORE_KEY); this.load(); },
  addCodex(entry, from) {
    if (!entry?.term) return false;
    if (this.data.codex.some((c) => c.term === entry.term)) return false;
    this.data.codex.push({ term: entry.term, def: entry.def, from });
    return true;
  },
};

const LEVELS = [0, 400, 900, 1600, 2500, 3600, 5000, 6600, 8500, 10800, 13500];
const RANKS = ["Initiate", "Apprentice", "Composer", "Reactor", "Streamer", "Architect", "Router", "Signalsmith", "Systems Adept", "Aktion Master", "Grandmaster"];
function levelOf(xp) {
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lvl = i + 1;
  const floor = LEVELS[lvl - 1] ?? 0;
  const next = LEVELS[lvl] ?? floor + 3000;
  return { lvl, floor, next, rank: RANKS[lvl - 1] || "Grandmaster", pct: clamp(((xp - floor) / (next - floor)) * 100, 0, 100) };
}

/* ============================================================================
 * 10. Challenge engines
 * ----------------------------------------------------------------------------
 * Every engine returns a controller:
 *   { el, ready(), check() -> bool, reveal(ok), solve(), destroy() }
 * ========================================================================== */

const ENGINES = {};

/* ---------- quiz / predict ---------- */
ENGINES.quiz = (c, host) => {
  const multi = !!c.multi;
  const answers = Array.isArray(c.answer) ? c.answer.map(String) : [String(c.answer)];
  const opts = c.shuffle === false ? [...c.options] : shuffle(c.options);
  const picked = new Set();
  const els = new Map();
  const body = h("div", { class: "chal-body" });

  opts.forEach((o, i) => {
    const key = String.fromCharCode(65 + i);
    const txt = h("div", { class: "txt" });
    if (o.code) txt.append(h("div", { class: "mono", html: highlightAktion(o.code) }));
    if (o.label) txt.append(h("b", { text: o.label }));
    if (o.detail) txt.append(h("small", { text: o.detail }));
    const btn = h("button", { class: "opt", type: "button" }, h("span", { class: "key", text: key }), txt);
    btn.addEventListener("click", () => {
      Sfx.play("pick");
      if (multi) { picked.has(o.id) ? picked.delete(o.id) : picked.add(o.id); }
      else { picked.clear(); picked.add(o.id); }
      for (const [id, el] of els) el.classList.toggle("sel", picked.has(id));
      host.onInput();
      FX.gsap.fromTo(btn, { scale: .97 }, { scale: 1, duration: .28, ease: "back.out" });
    });
    els.set(o.id, btn);
    body.append(btn);
  });

  return {
    el: body,
    hotkey(n) { const el = body.children[n - 1]; el?.click(); },
    ready: () => picked.size > 0,
    check: () => sameSet([...picked].map(String), answers),
    reveal() {
      for (const [id, el] of els) {
        el.disabled = true;
        const isRight = answers.includes(String(id));
        if (isRight) el.classList.add("right");
        else if (picked.has(id)) el.classList.add("wrong");
        else el.classList.add("dim");
      }
    },
    solve() { picked.clear(); answers.forEach((a) => picked.add(a)); },
    destroy() {},
  };
};

/* ---------- fill-blanks (code slots or tree slots) ---------- */
ENGINES["fill-blanks"] = (c, host) => {
  const answer = c.answer.map(String);
  const bankItems = shuffle(c.bank.map((b, i) => (typeof b === "string" ? { id: String(b), label: b } : { id: String(b.id ?? i), label: b.label })));
  const placed = new Array(answer.length).fill(null);
  let selected = null;

  const bank = h("div", { class: "bank" });
  const slots = [];
  const wrap = h("div", { class: "chal-body" });

  function chipEl(item, inSlot) {
    const el = h("div", { class: "chip", text: item.label, draggable: "true", data: { id: item.id } });
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (inSlot != null) { returnToBank(inSlot); return; }
      selected = selected?.id === item.id ? null : item;
      paintBank();
      Sfx.play("pick");
    });
    el.addEventListener("dragstart", (ev) => { selected = item; el.classList.add("dragging"); ev.dataTransfer.setData("text/plain", item.id); });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    return el;
  }
  function paintBank() {
    bank.innerHTML = "";
    for (const it of bankItems) {
      if (placed.includes(it.id)) continue;
      const el = chipEl(it, null);
      if (selected?.id === it.id) el.style.outline = "2px solid var(--g1)";
      bank.append(el);
    }
  }
  function place(idx, id) {
    const already = placed.indexOf(id);
    if (already >= 0) placed[already] = null;
    placed[idx] = id;
    selected = null;
    paint();
    Sfx.play("click");
    host.onInput();
  }
  function returnToBank(idx) { placed[idx] = null; paint(); host.onInput(); }
  function paint() {
    slots.forEach((s, i) => {
      s.innerHTML = "";
      s.classList.toggle("filled", !!placed[i]);
      if (placed[i]) {
        const it = bankItems.find((b) => b.id === placed[i]);
        s.append(chipEl(it, i));
      } else s.append(document.createTextNode(" "));
    });
    paintBank();
  }
  function makeSlot(i) {
    const s = h("span", { class: "slot", data: { i: String(i) } });
    s.addEventListener("click", () => { if (selected) place(i, selected.id); });
    s.addEventListener("dragover", (e) => { e.preventDefault(); s.classList.add("over"); });
    s.addEventListener("dragleave", () => s.classList.remove("over"));
    s.addEventListener("drop", (e) => { e.preventDefault(); s.classList.remove("over"); const id = e.dataTransfer.getData("text/plain"); if (id) place(i, id); });
    slots[i] = s;
    return s;
  }

  if (c.display === "tree") {
    const tree = h("div", { class: "tree" });
    (c.rows || []).forEach((r) => {
      const row = h("div", { class: "tree-row", style: { marginLeft: (r.depth || 0) * 22 + "px" } });
      if (r.depth) row.append(h("span", { class: "guide", text: "└─" }));
      if (r.label) row.append(h("span", { class: "lbl", html: highlightAktion(r.label) }));
      if (r.slot != null) row.append(makeSlot(r.slot));
      if (r.after) row.append(h("span", { class: "lbl", html: highlightAktion(r.after) }));
      tree.append(row);
    });
    wrap.append(tree);
  } else {
    const pre = h("div", { class: "slot-code" });
    const parts = String(c.template).split(/\{\{(\d+)\}\}/g);
    parts.forEach((p, i) => {
      if (i % 2 === 0) { if (p) pre.insertAdjacentHTML("beforeend", highlightAktion(p)); }
      else pre.append(makeSlot(Number(p)));
    });
    wrap.append(pre);
  }
  wrap.append(h("div", { style: { fontSize: "11px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: "800", marginTop: "4px" }, text: "Token bank — tap a token, then tap a slot" }));
  wrap.append(bank);
  paint();

  return {
    el: wrap,
    ready: () => placed.every((p) => p !== null),
    check: () => placed.every((p, i) => String(p) === answer[i]),
    reveal() {
      slots.forEach((s, i) => s.classList.add(String(placed[i]) === answer[i] ? "right" : "wrong"));
      $$(".chip", wrap).forEach((el) => (el.draggable = false));
    },
    solve() { answer.forEach((a, i) => (placed[i] = a)); paint(); },
    destroy() {},
  };
};

/* ---------- order-lines ---------- */
ENGINES["order-lines"] = (c, host) => {
  const answer = c.answer ? c.answer.map(String) : c.lines.map((l) => String(l.id));
  let order = shuffle(c.lines);
  if (order.map((l) => String(l.id)).join() === answer.join()) order = [...order.slice(1), order[0]];
  const list = h("div", { class: "lines" });
  let dragId = null;

  function paint() {
    list.innerHTML = "";
    order.forEach((l, i) => {
      const row = h("div", { class: "line-item", draggable: "true", data: { id: String(l.id) } },
        h("span", { class: "grip" }, h("i"), h("i"), h("i")),
        h("span", { class: "num", text: String(i + 1) }),
        h("span", { class: "code-txt", html: highlightAktion(l.code) }));
      const move = (d) => {
        const j = i + d;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        paint(); Sfx.play("click"); host.onInput();
      };
      const ctrls = h("span", { style: { display: "grid", gap: "3px", flex: "none" } },
        h("button", { class: "btn btn-sm", style: { padding: "1px 7px", fontSize: "10px", borderRadius: "6px" }, type: "button", text: "▲", onclick: () => move(-1) }),
        h("button", { class: "btn btn-sm", style: { padding: "1px 7px", fontSize: "10px", borderRadius: "6px" }, type: "button", text: "▼", onclick: () => move(1) }));
      row.append(ctrls);
      row.addEventListener("dragstart", () => { dragId = String(l.id); row.classList.add("dragging"); });
      row.addEventListener("dragend", () => { dragId = null; row.classList.remove("dragging"); });
      row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("over"); });
      row.addEventListener("dragleave", () => row.classList.remove("over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault(); row.classList.remove("over");
        if (!dragId) return;
        const from = order.findIndex((x) => String(x.id) === dragId);
        const to = i;
        if (from < 0 || from === to) return;
        const [it] = order.splice(from, 1);
        order.splice(to, 0, it);
        paint(); Sfx.play("click"); host.onInput();
      });
      list.append(row);
    });
  }
  paint();

  return {
    el: h("div", { class: "chal-body" }, list),
    ready: () => true,
    check: () => order.map((l) => String(l.id)).join() === answer.join(),
    reveal() {
      $$(".line-item", list).forEach((el, i) => el.classList.add(String(order[i].id) === answer[i] ? "right" : "wrong"));
    },
    solve() { order = answer.map((id) => c.lines.find((l) => String(l.id) === id)); paint(); },
    destroy() {},
  };
};

/* ---------- bug-hunt ---------- */
ENGINES["bug-hunt"] = (c, host) => {
  const answer = Number(c.answer);
  let sel = null;
  const pre = h("div", { class: "bug-code" });
  const spans = [];
  let idx = 0;
  const rx = /\[\[([\s\S]*?)\]\]/g;
  let last = 0, m;
  const src = String(c.code);
  while ((m = rx.exec(src))) {
    if (m.index > last) pre.insertAdjacentHTML("beforeend", highlightAktion(src.slice(last, m.index)));
    const i = idx++;
    const sp = h("span", { class: "span-pick", data: { i: String(i) }, html: highlightAktion(m[1]) });
    sp.addEventListener("click", () => {
      sel = i; Sfx.play("pick");
      spans.forEach((s) => s.classList.toggle("sel", s === sp));
      host.onInput();
      FX.gsap.fromTo(sp, { scale: 1.12 }, { scale: 1, duration: .3, ease: "back.out" });
    });
    spans.push(sp);
    pre.append(sp);
    last = rx.lastIndex;
  }
  if (last < src.length) pre.insertAdjacentHTML("beforeend", highlightAktion(src.slice(last)));

  const body = h("div", { class: "chal-body" }, pre,
    h("div", { class: "tip" }, icon("info"), "Tap the token that breaks the program."));

  return {
    el: body,
    ready: () => sel !== null,
    check: () => sel === answer,
    reveal() {
      spans.forEach((s, i) => { if (i === answer) s.classList.add("right"); else if (i === sel) s.classList.add("wrong"); });
      spans.forEach((s) => s.style.pointerEvents = "none");
      if (c.fixed) body.append(codeBlock(c.fixed, "the fix"));
    },
    solve() { sel = answer; },
    destroy() {},
  };
};

/* ---------- match-pairs ---------- */
ENGINES["match-pairs"] = (c, host) => {
  const pairs = c.pairs.map((p, i) => ({ id: "p" + i, left: p.left, right: p.right }));
  const rights = shuffle(pairs);
  const links = new Map(); // leftId -> rightId
  let activeLeft = null;
  const leftCol = h("div", { class: "match-col" });
  const rightCol = h("div", { class: "match-col" });
  const lEls = new Map(), rEls = new Map();

  const cell = (o, side) => {
    const el = h("button", { class: "match-item", type: "button" });
    if (o.mono) el.append(h("span", { class: "mono", html: highlightAktion(o.mono) }));
    if (o.label) el.append(h("span", { text: o.label }));
    if (o.note) el.append(h("small", { text: o.note }));
    return el;
  };
  pairs.forEach((p) => {
    const el = cell(p.left, "l");
    el.addEventListener("click", () => {
      if (links.has(p.id)) { const r = links.get(p.id); links.delete(p.id); rEls.get(r).classList.remove("paired"); repaint(); host.onInput(); return; }
      activeLeft = activeLeft === p.id ? null : p.id;
      repaint(); Sfx.play("pick");
    });
    lEls.set(p.id, el); leftCol.append(el);
  });
  rights.forEach((p) => {
    const el = cell(p.right, "r");
    el.addEventListener("click", () => {
      if (!activeLeft) return;
      for (const [l, r] of links) if (r === p.id) links.delete(l);
      links.set(activeLeft, p.id);
      activeLeft = null;
      repaint(); Sfx.play("click"); host.onInput();
      FX.gsap.fromTo(el, { scale: .93 }, { scale: 1, duration: .3, ease: "back.out" });
    });
    rEls.set(p.id, el); rightCol.append(el);
  });
  function repaint() {
    const nums = new Map();
    let n = 0;
    for (const [l, r] of links) { n++; nums.set(l, n); nums.set(r, n); }
    for (const [id, el] of lEls) {
      el.classList.toggle("sel", activeLeft === id);
      el.classList.toggle("paired", links.has(id));
      el.dataset.pair = nums.get(id) ? "#" + nums.get(id) : "";
    }
    for (const [id, el] of rEls) {
      const used = [...links.values()].includes(id);
      el.classList.toggle("paired", used);
      el.dataset.pair = nums.get(id) ? "#" + nums.get(id) : "";
      el.style.pointerEvents = used ? "none" : "";
    }
  }
  const body = h("div", { class: "chal-body" },
    h("div", { class: "match" }, leftCol, rightCol),
    h("div", { class: "tip" }, icon("info"), "Tap on the left, then its partner on the right. Tap a paired row to unlink."));

  return {
    el: body,
    ready: () => links.size === pairs.length,
    check: () => pairs.every((p) => links.get(p.id) === p.id),
    reveal() {
      for (const p of pairs) {
        const ok = links.get(p.id) === p.id;
        lEls.get(p.id).classList.add(ok ? "right" : "wrong");
        lEls.get(p.id).classList.remove("paired");
        rEls.get(p.id).classList.add(ok ? "right" : "wrong");
        rEls.get(p.id).classList.remove("paired");
      }
      $$(".match-item", body).forEach((e) => (e.style.pointerEvents = "none"));
    },
    solve() { links.clear(); pairs.forEach((p) => links.set(p.id, p.id)); repaint(); },
    destroy() {},
  };
};

/* ---------- sort-bins ---------- */
ENGINES["sort-bins"] = (c, host) => {
  const items = shuffle(c.items.map((it, i) => ({ id: "i" + i, label: it.label, bin: String(it.bin) })));
  const at = new Map(); // itemId -> binId
  let selected = null;
  const bank = h("div", { class: "bank" });
  const binsEl = h("div", { class: "bins" });
  const binDrops = new Map();

  function chipEl(it) {
    const el = h("div", { class: "chip", text: it.label, draggable: "true", data: { id: it.id } });
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (at.has(it.id)) { at.delete(it.id); paint(); host.onInput(); return; }
      selected = selected === it.id ? null : it.id;
      paint(); Sfx.play("pick");
    });
    el.addEventListener("dragstart", (ev) => { selected = it.id; ev.dataTransfer.setData("text/plain", it.id); el.classList.add("dragging"); });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    if (selected === it.id) el.style.outline = "2px solid var(--g1)";
    return el;
  }
  function paint() {
    bank.innerHTML = "";
    for (const [, d] of binDrops) d.innerHTML = "";
    for (const it of items) {
      const el = chipEl(it);
      const b = at.get(it.id);
      (b ? binDrops.get(b) : bank).append(el);
    }
  }
  for (const b of c.bins) {
    const drop = h("div", { class: "drop" });
    binDrops.set(String(b.id), drop);
    const box = h("div", { class: "bin" },
      h("div", { class: "bh", text: b.label }),
      b.hint && h("div", { class: "bs", text: b.hint }),
      drop);
    box.addEventListener("click", () => { if (selected) { at.set(selected, String(b.id)); selected = null; paint(); Sfx.play("click"); host.onInput(); } });
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
    box.addEventListener("dragleave", () => box.classList.remove("over"));
    box.addEventListener("drop", (e) => {
      e.preventDefault(); box.classList.remove("over");
      const id = e.dataTransfer.getData("text/plain");
      if (id) { at.set(id, String(b.id)); selected = null; paint(); host.onInput(); }
    });
    binsEl.append(box);
  }
  paint();
  const body = h("div", { class: "chal-body" }, bank, binsEl);

  return {
    el: body,
    ready: () => items.every((it) => at.has(it.id)),
    check: () => items.every((it) => at.get(it.id) === it.bin),
    reveal() {
      for (const it of items) {
        const el = $$(`.chip[data-id="${it.id}"]`, body)[0];
        el?.classList.add(at.get(it.id) === it.bin ? "right" : "wrong");
      }
      $$(".chip", body).forEach((e) => (e.style.pointerEvents = "none"));
    },
    solve() { items.forEach((it) => at.set(it.id, it.bin)); paint(); },
    destroy() {},
  };
};

/* ---------- switchboard ---------- */
ENGINES.switchboard = (c, host) => {
  const sws = c.switches.map((s, i) => ({ ...s, id: "s" + i, state: false }));
  const grid = h("div", { class: "switches" });
  const els = new Map();
  for (const s of sws) {
    const el = h("button", { class: "sw", type: "button" },
      h("span", { class: "knob" }),
      h("span", { class: "lbl", html: highlightAktion(s.label) + (s.detail ? `<small>${esc(s.detail)}</small>` : "") }));
    el.addEventListener("click", () => {
      s.state = !s.state; el.classList.toggle("on", s.state);
      Sfx.play(s.state ? "pick" : "click"); host.onInput();
      FX.gsap.fromTo(el, { scale: .98 }, { scale: 1, duration: .25, ease: "back.out" });
    });
    els.set(s.id, el); grid.append(el);
  }
  const body = h("div", { class: "chal-body" }, grid,
    h("div", { class: "tip" }, icon("info"), c.help || "Switch ON everything that is valid. Leave the rest OFF."));

  return {
    el: body,
    ready: () => true,
    check: () => sws.every((s) => s.state === !!s.on),
    reveal() {
      for (const s of sws) {
        const el = els.get(s.id);
        el.classList.add(s.state === !!s.on ? "right" : "wrong");
        el.classList.toggle("on", !!s.on);
        el.style.pointerEvents = "none";
      }
    },
    solve() { sws.forEach((s) => { s.state = !!s.on; els.get(s.id).classList.toggle("on", s.state); }); },
    destroy() {},
  };
};

/* ---------- sequence-tap ---------- */
ENGINES["sequence-tap"] = (c, host) => {
  const correct = c.order.map((o, i) => ({ id: "o" + i, label: typeof o === "string" ? o : o.label, note: o.note }));
  const shown = shuffle(correct);
  const taps = [];
  let dead = false;
  const grid = h("div", { class: "seq" });
  const track = h("div", { class: "seq-track" });
  const els = new Map();

  for (const it of shown) {
    const el = h("button", { class: "seq-item", type: "button", html: highlightAktion(it.label) });
    el.addEventListener("click", () => {
      if (dead || taps.includes(it.id)) return;
      const expected = correct[taps.length].id;
      taps.push(it.id);
      el.classList.add("tapped");
      el.dataset.n = String(taps.length);
      track.append(h("span", { class: "t", text: it.label }));
      if (it.id !== expected) {
        el.classList.add("wrong"); Sfx.play("wrong"); dead = true;
      } else Sfx.play("tick");
      host.onInput();
    });
    els.set(it.id, el); grid.append(el);
  }
  const body = h("div", { class: "chal-body" }, grid, track,
    h("div", { class: "tip" }, icon("info"), c.help || "Tap them in the order they must run."));

  return {
    el: body,
    ready: () => taps.length === correct.length || dead,
    check: () => !dead && taps.join() === correct.map((x) => x.id).join(),
    reveal() {
      correct.forEach((it, i) => {
        const el = els.get(it.id);
        el.style.pointerEvents = "none";
        el.classList.add("tapped");
        el.dataset.n = String(i + 1);
        el.classList.remove("wrong");
      });
      track.innerHTML = "";
      correct.forEach((it) => track.append(h("span", { class: "t", text: it.label })));
    },
    solve() { taps.length = 0; correct.forEach((x) => taps.push(x.id)); dead = false; },
    destroy() {},
  };
};

/* ---------- hotspot ---------- */

/**
 * Locate a substring inside already-highlighted markup and return its box,
 * relative to `root`. Percentage-positioned markers only line up at one
 * viewport width; anchoring to the token itself survives resize, rewrap and
 * font fallback — so `match` is the preferred way to place a hotspot.
 */
function rectOfMatch(root, needle, nth = 1) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(".hotpin") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  let text = "", n;
  while ((n = walker.nextNode())) { nodes.push({ node: n, start: text.length }); text += n.nodeValue; }
  let idx = -1;
  for (let k = 0; k < nth; k++) {
    idx = text.indexOf(needle, idx + 1);
    if (idx < 0) return null;
  }
  const end = idx + needle.length;
  const startEntry = [...nodes].reverse().find((e) => e.start <= idx);
  const endEntry = [...nodes].reverse().find((e) => e.start < end);
  if (!startEntry || !endEntry) return null;
  const range = document.createRange();
  try {
    range.setStart(startEntry.node, idx - startEntry.start);
    range.setEnd(endEntry.node, Math.min(end - endEntry.start, endEntry.node.nodeValue.length));
  } catch { return null; }
  const r = range.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { left: r.left - base.left + root.scrollLeft, top: r.top - base.top + root.scrollTop, width: r.width, height: r.height };
}

ENGINES.hotspot = (c, host) => {
  let sel = null;
  const box = h("div", { class: "hotspot", html: highlightAktion(c.code || "") });
  const els = [];
  const points = c.points || [];

  const marks = [];
  points.forEach((p, i) => {
    const mark = h("div", { class: "hot-mark", style: { display: "none" } });
    const el = h("button", { class: "hotpin", type: "button", title: p.tip || "", text: p.label || String(i + 1) });
    el.addEventListener("click", () => {
      sel = i; Sfx.play("pick");
      els.forEach((e, j) => (e.style.boxShadow = j === i ? "0 0 0 7px color-mix(in oklab, var(--g1) 30%, transparent)" : ""));
      marks.forEach((m, j) => (m.style.background = j === i ? "color-mix(in oklab, var(--g1) 34%, transparent)" : ""));
      host.onInput();
    });
    marks.push(mark); els.push(el);
    box.append(mark, el);
  });

  function place() {
    points.forEach((p, i) => {
      const el = els[i], mark = marks[i];
      const r = p.match ? rectOfMatch(box, p.match, p.nth ?? 1) : null;
      if (r) {
        Object.assign(mark.style, { display: "block", left: r.left - 2 + "px", top: r.top - 1 + "px", width: r.width + 4 + "px", height: r.height + 2 + "px" });
        // Pin above the token, clamped so the first line's pin stays inside the box.
        el.style.left = r.left + r.width / 2 + "px";
        el.style.top = Math.max(13, r.top - 5) + "px";
      } else {
        mark.style.display = "none";
        el.style.left = p.x ?? "50%";
        el.style.top = p.y ?? "50%";
      }
    });
  }
  const ro = new ResizeObserver(place);
  ro.observe(box);

  const body = h("div", { class: "chal-body" }, box,
    h("div", { class: "tip" }, icon("target"), c.help || "Click the marker on the part that answers the question."));
  return {
    el: body,
    // Markers can only be measured once the code block is in the document.
    mounted: place,
    ready: () => sel !== null,
    check: () => !!points[sel]?.correct,
    reveal() {
      els.forEach((e, i) => {
        e.style.animation = "none";
        e.style.pointerEvents = "none";
        const cls = points[i].correct ? "right" : i === sel ? "wrong" : "";
        if (cls) { e.classList.add(cls); marks[i].classList.add(cls); }
      });
    },
    solve() { sel = points.findIndex((p) => p.correct); },
    destroy() { ro.disconnect(); },
  };
};

/* ---------- type-code ---------- */
ENGINES["type-code"] = (c, host) => {
  const ed = h("div", { class: "editor" },
    h("div", { class: "bar" }, h("span", { class: "dots" }, h("i"), h("i"), h("i")), c.filename || "challenge.aktion"));
  const ta = h("textarea", { spellcheck: "false", placeholder: c.placeholder || "type your Aktion here…" });
  ta.value = c.starter || "";
  ta.addEventListener("input", () => host.onInput());
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("  ", s, ta.selectionEnd, "end"); }
    e.stopPropagation();
  });
  ed.append(ta);
  const diag = h("div", { class: "tips" });
  const body = h("div", { class: "chal-body" }, ed, diag);

  const norm = (s) => String(s).replace(/\s+/g, " ").replace(/\s*([(){}\[\],:;])\s*/g, "$1").replace(/["']/g, '"').trim();

  function validate() {
    const v = ta.value;
    const rules = c.validate || {};
    for (const r of rules.must || []) if (!new RegExp(r, "m").test(v)) return { ok: false, why: rules.mustWhy?.[(rules.must || []).indexOf(r)] || "Something required is still missing." };
    for (const r of rules.mustNot || []) if (new RegExp(r, "m").test(v)) return { ok: false, why: "There is still something in there that should not be." };
    if (c.solution && rules.exact !== false && !(rules.must || []).length) {
      if (norm(v) !== norm(c.solution)) return { ok: false, why: "Not quite — compare it against the shape in the brief." };
    }
    return { ok: true };
  }

  return {
    el: body,
    ready: () => ta.value.trim().length > 2,
    check() {
      const r = validate();
      if (!r.ok) { diag.innerHTML = ""; diag.append(h("div", { class: "tip danger" }, icon("warn"), r.why)); }
      return r.ok;
    },
    async reveal(ok) {
      ed.classList.add(ok ? "right" : "wrong");
      ta.readOnly = true;
      if (!ok && c.solution) body.append(codeBlock(c.solution, "one correct answer"));
      // Best-effort: run the real Aktion diagnostics over what the player typed.
      const diagnose = await Aktion.language();
      if (diagnose) {
        try {
          const list = diagnose(ta.value) || [];
          diag.innerHTML = "";
          if (!list.length) diag.append(h("div", { class: "tip" }, icon("check"), "The real Aktion validator reports no issues in your program."));
          else for (const d of list.slice(0, 4)) diag.append(h("div", { class: "tip warn" }, icon("warn"), `L${(d.range?.start?.line ?? d.line ?? 0) + 1}: ${d.message}`));
        } catch {}
      }
    },
    solve() { if (c.solution) ta.value = c.solution; },
    destroy() {},
  };
};

/* ---------- arcade (PixiJS mini-game supplied by the JSON) ---------- */
ENGINES.arcade = (c, host, stageCtx) => {
  const height = c.height || 340;
  const box = h("div", { class: "arcade", style: { height: height + "px" } });
  const hud = h("div", { class: "hudbar" },
    h("span", { class: "sc", text: "0" }), h("span", { class: "go", text: c.goal || "" }));
  let won = false, failed = false, handle = null, app = null, ro = null;

  if (!FX.pixi) {
    // Graceful degradation: play the author-provided fallback challenge instead.
    if (c.fallback) {
      const inner = buildChallenge(c.fallback, host, stageCtx);
      inner.el.prepend(h("div", { class: "tip warn" }, icon("warn"), "Graphics engine unavailable offline — here is the concept check instead."));
      return inner;
    }
    box.append(h("div", { class: "fallback" }, "This stage needs the graphics engine, which could not load. Press Check to continue."));
    return { el: box, ready: () => true, check: () => true, reveal() {}, solve() {}, destroy() {} };
  }

  const canvas = h("canvas");
  box.append(canvas, hud);

  const overlay = (title, msg, btn, cb) => {
    const ov = h("div", { class: "overlay" }, h("div", {},
      h("h5", { text: title }), h("p", { text: msg }),
      btn && h("button", { class: "btn btn-primary", type: "button", text: btn, onclick: () => { ov.remove(); cb?.(); } })));
    box.append(ov);
    FX.gsap.from(ov, { opacity: 0, duration: .3 });
    return ov;
  };

  (async () => {
    app = new FX.pixi.Application();
    const w = box.clientWidth || 520;
    await app.init({ canvas, width: w, height, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
    const stage = new FX.pixi.Container();
    app.stage.addChild(stage);
    // Pointer events over empty space — scenes rely on this for paddles/aiming.
    app.stage.eventMode = "static";
    app.stage.hitArea = new FX.pixi.Rectangle(0, 0, w, height);
    const ctx = makeSceneKit(stage, { width: w, height }, stageCtx.palette);
    ctx.app = app;
    ctx.el = box;
    ctx.params = c.params || {};
    ctx.state = {};
    ctx.api = {
      setScore: (n) => { hud.firstChild.textContent = String(n); },
      setGoal: (t) => { hud.lastChild.textContent = t; },
      win: (msg) => {
        if (won || failed) return;
        won = true; Sfx.play("correct"); host.onInput();
        overlay(msg || "Cleared!", c.winNote || "Press Check to bank the XP.", null);
      },
      fail: (msg) => {
        if (won || failed) return;
        failed = true; Sfx.play("wrong");
        overlay(msg || "Missed it", c.failNote || "Give it another run.", "Retry", () => { failed = false; restart(); });
      },
      reset: () => restart(),
    };
    ctx.api.setGoal(c.goal || "");
    handle = runScene(c.code, ctx, "arcade:" + (stageCtx.stageId || "?"));

    function restart() {
      handle?.destroy();
      stage.removeChildren();
      ctx.state = {};
      ctx.api.setScore(0);
      handle = runScene(c.code, ctx, "arcade-restart");
    }

    ro = new ResizeObserver(() => {
      const nw = box.clientWidth;
      if (nw && app?.renderer) {
        app.renderer.resize(nw, height);
        ctx.width = nw;
        app.stage.hitArea = new FX.pixi.Rectangle(0, 0, nw, height);
      }
    });
    ro.observe(box);
  })();

  const body = h("div", { class: "chal-body" }, box,
    c.note && h("div", { class: "tip" }, icon("info"), c.note));

  return {
    el: body,
    ready: () => won,
    check: () => won,
    reveal() { if (!won) overlay("Answer revealed", c.reveal || "Run it again any time from the world map.", null); },
    solve() { won = true; },
    destroy() {
      try {
        ro?.disconnect();
        handle?.destroy();                 // kills the scene's own tweens
        killSceneTweens(app?.stage);       // and anything the restart path left behind
        app?.destroy(true, { children: true });
      } catch {}
    },
  };
};

function buildChallenge(c, host, stageCtx) {
  const make = ENGINES[c.type];
  if (!make) {
    return { el: h("div", { class: "tip danger" }, icon("warn"), `Unknown challenge type "${c.type}".`), ready: () => true, check: () => true, reveal() {}, solve() {}, destroy() {} };
  }
  return make(c, host, stageCtx);
}

/* ============================================================================
 * 11. Optional bridges to the real Aktion runtime
 * ========================================================================== */

const Aktion = {
  _el: null, _lang: null,
  sources() { return (App.data?.config?.aktionSources) || ["../dist/aktion.js", "https://esm.sh/aktion-runtime@0.6.1"]; },
  langSources() { return (App.data?.config?.aktionLanguageSources) || ["../dist/language.js", "https://esm.sh/aktion-runtime@0.6.1/language"]; },
  async element() {
    if (this._el !== null) return this._el;
    if (App.data?.config?.livePreview === false) return (this._el = false);
    for (const url of this.sources()) {
      try { await import(/* @vite-ignore */ url); if (customElements.get("aktion-app")) return (this._el = true); } catch {}
    }
    return (this._el = false);
  },
  async language() {
    if (this._lang !== null) return this._lang;
    if (App.data?.config?.liveValidation === false) return (this._lang = false);
    for (const url of this.langSources()) {
      try { const m = await import(/* @vite-ignore */ url); if (m?.getDiagnostics) return (this._lang = m.getDiagnostics); } catch {}
    }
    return (this._lang = false);
  },
};

async function renderPreview(spec) {
  const wrap = h("div", { class: "preview-wrap" },
    h("div", { class: "bar" }, h("span", { class: "live" }), spec.caption || "live — rendered by the real Aktion runtime"));
  const ok = await Aktion.element();
  if (!ok) {
    wrap.append(h("div", { class: "nope" }, "The Aktion runtime is not reachable from here, so this preview stays code-only. Serve the game from the repo (so ../dist/aktion.js resolves) or go online to see it render."));
    wrap.append(codeBlock(spec.program, "the program"));
    return wrap;
  }
  const el = document.createElement("aktion-app");
  el.setAttribute("theme", spec.theme || "dark");
  el.setAttribute("margin", "12");
  wrap.append(el);
  requestAnimationFrame(() => { try { el.setResponse(spec.program); } catch (e) { console.warn("[aktion-quest] preview failed", e); } });
  return wrap;
}

/* ============================================================================
 * 12. Celebration FX
 * ========================================================================== */

function burst(x, y, palette, count = 34) {
  if (!FX.app || !FX.pixi) return;
  const PIXI = FX.pixi;
  const layer = new PIXI.Container();
  FX.app.stage.addChild(layer);
  const cols = [hexToNum(palette.g1), hexToNum(palette.g2), hexToNum(palette.g3), 0xffffff, 0xfbbf24];
  const bits = [];
  for (let i = 0; i < count; i++) {
    const g = new PIXI.Graphics();
    const c = cols[(Math.random() * cols.length) | 0];
    const size = 3 + Math.random() * 6;
    if (Math.random() < .5) g.circle(0, 0, size / 1.6).fill(c);
    else g.roundRect(-size / 2, -size / 2, size, size * 1.7, 2).fill(c);
    g.x = x; g.y = y;
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
    g.vx = Math.cos(a) * sp; g.vy = Math.sin(a) * sp - 3;
    g.spin = (Math.random() - .5) * .4;
    layer.addChild(g); bits.push(g);
  }
  let life = 0;
  const tick = (t) => {
    const dt = t.deltaTime;
    life += dt;
    for (const b of bits) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += .28 * dt; b.vx *= .99;
      b.rotation += b.spin * dt; b.alpha = clamp(1 - life / 78, 0, 1);
    }
    if (life > 80) { FX.app.ticker.remove(tick); layer.destroy({ children: true }); }
  };
  FX.app.ticker.add(tick);
}

function xpFloat(x, y, amount) {
  const el = h("div", { class: "xpfloat", text: `+${amount} XP`, style: { left: x + "px", top: y + "px" } });
  document.body.append(el);
  FX.gsap.fromTo(el, { opacity: 0, y: 0, scale: .6 }, { opacity: 1, y: -18, scale: 1, duration: .32, ease: "back.out" });
  FX.gsap.to(el, { opacity: 0, y: -86, duration: .9, delay: .45, ease: "power2.out", onComplete: () => el.remove() });
}

function toast(msg, kind = "") {
  const el = h("div", { class: "toast " + kind }, icon(kind === "ok" ? "check" : kind === "no" ? "x" : "info"), msg);
  $("#toasts").append(el);
  FX.gsap.from(el, { opacity: 0, x: 30, duration: .3, ease: "back.out" });
  setTimeout(() => FX.gsap.to(el, { opacity: 0, x: 30, duration: .25, onComplete: () => el.remove() }), 2600);
}

/* ============================================================================
 * 13. Application
 * ========================================================================== */

const App = {
  data: null,
  game: null,
  stageIdx: 0,
  ctrl: null,
  resolved: false,
  lastOk: false,
  run: null,
  screen: "boot",
};

function show(name) {
  App.screen = name;
  $$(".screen").forEach((s) => s.classList.toggle("is-active", s.id === "screen-" + name));
  const active = $("#screen-" + name);
  const sc = $(".scroll", active);
  if (sc) sc.scrollTop = 0;
  if (canAnimate()) FX.gsap.fromTo(active, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .42, ease: "power2.out" });
  else FX.gsap.set(active, { opacity: 1, y: 0 });
}

function applyPalette(p) {
  const r = document.documentElement.style;
  r.setProperty("--g1", p.g1); r.setProperty("--g2", p.g2); r.setProperty("--g3", p.g3);
}

const DEFAULT_PALETTE = { g1: "#5eead4", g2: "#a78bfa", g3: "#38bdf8" };
const paletteOf = (g) => ({ ...DEFAULT_PALETTE, ...(g?.palette || {}) });

/* ---------- HOME ---------- */

function gameStatus(g) {
  const rec = Store.data.games[g.id];
  const need = g.requires || [];
  const locked = need.some((id) => !Store.data.games[id]?.done);
  return { rec, locked, done: !!rec?.done, cleared: rec?.cleared?.length || 0, stars: rec?.stars || 0 };
}

function renderHome() {
  const d = App.data;
  $("#brand-sub").textContent = d.meta?.tagline || "learn by playing";
  if (d.meta?.blurb) $("#home-tagline").textContent = d.meta.blurb;

  const lv = levelOf(Store.data.xp);
  $("#hud-level").textContent = lv.lvl;
  $("#hud-xp").textContent = Store.data.xp.toLocaleString();
  $("#hud-streak").textContent = Store.data.best || 0;
  $("#rank-name").textContent = lv.rank;
  $("#rank-next").textContent = `${Store.data.xp - lv.floor} / ${lv.next - lv.floor} XP to Lv ${lv.lvl + 1}`;
  requestAnimationFrame(() => ($("#xp-fill").style.width = lv.pct + "%")); // CSS transition owns this

  const totalStages = d.games.reduce((n, g) => n + g.stages.length, 0);
  const doneStages = d.games.reduce((n, g) => n + (Store.data.games[g.id]?.cleared?.length || 0), 0);
  const pct = totalStages ? Math.round((doneStages / totalStages) * 100) : 0;
  $("#ring-pct").textContent = pct + "%";
  const circ = 2 * Math.PI * 35;
  requestAnimationFrame(() => $("#ring-fill").setAttribute("stroke-dashoffset", String(circ - (circ * pct) / 100)));
  $("#home-stats").textContent = `${doneStages} / ${totalStages} stages cleared · ${d.games.filter((g) => Store.data.games[g.id]?.done).length} / ${d.games.length} worlds complete · ${Store.data.codex.length} codex entries`;

  const rail = $("#badge-rail");
  rail.innerHTML = "";
  for (const g of d.games) {
    const st = gameStatus(g);
    const pin = h("div", { class: "badge-pin" + (st.done ? "" : " locked"), title: st.done ? `${g.badge?.name || g.title} — ${g.badge?.tagline || ""}` : `${g.title} — not earned yet` },
      icon(st.done ? (g.badge?.icon || g.icon || "medal") : "lock"));
    rail.append(pin);
  }

  const tracksEl = $("#tracks");
  tracksEl.innerHTML = "";
  const tracks = d.tracks?.length ? d.tracks : [{ id: "all", title: "All worlds", games: d.games.map((g) => g.id) }];
  for (const t of tracks) {
    const games = t.games.map((id) => d.games.find((g) => g.id === id)).filter(Boolean);
    if (!games.length) continue;
    const doneN = games.filter((g) => Store.data.games[g.id]?.done).length;
    tracksEl.append(h("div", { class: "track-head" },
      h("h2", { text: t.title }), h("div", { class: "line" }),
      h("span", { class: "count", text: `${doneN}/${games.length}` })));
    if (t.blurb) tracksEl.append(h("p", { style: { margin: "-6px 0 14px", color: "var(--muted)", fontSize: "13.5px", maxWidth: "640px", lineHeight: "1.6" }, text: t.blurb }));
    const cards = h("div", { class: "cards" });
    for (const g of games) cards.append(gameCard(g));
    tracksEl.append(cards);
  }
  requestAnimationFrame(() => {
    reveal($$(".gcard", tracksEl), { opacity: 0, y: 22, duration: .5, stagger: .04, ease: "power2.out" });
  });

  const next = firstIncomplete();
  $("#continue-label").textContent = next ? (Store.data.plays ? `Continue · ${next.title}` : `Start · ${next.title}`) : "Replay a world";
}

function gameCard(g) {
  const st = gameStatus(g);
  const p = paletteOf(g);
  const card = h("button", {
    class: "gcard" + (st.locked ? " locked" : ""), type: "button",
    style: { "--c1": p.g1, "--c2": p.g2 },
  });
  card.append(h("div", { class: "gicon" }, icon(g.icon || "spark")));
  card.append(h("h3", { text: g.title }));
  card.append(h("p", { text: g.subtitle || "" }));
  const pips = h("div", { class: "pips" });
  g.stages.forEach((s) => pips.append(h("i", { class: (st.rec?.cleared || []).includes(s.id) ? "on" : "" })));
  const stars = h("div", { class: "stars" });
  for (let i = 0; i < 3; i++) { const s = icon("star"); if (i < st.stars) s.classList.add("on"); s.setAttribute("fill", i < st.stars ? "currentColor" : "none"); stars.append(s); }
  card.append(h("div", { class: "meta" },
    h("span", { class: "diff", text: ["", "starter", "easy", "medium", "hard", "boss"][g.difficulty || 1] }),
    h("span", { text: `${g.stages.length} stages` }),
    g.estimateMin && h("span", { text: `~${g.estimateMin} min` }),
    h("div", { style: { flex: "1" } }), stars));
  card.append(pips);
  const barPct = g.stages.length ? ((st.rec?.cleared?.length || 0) / g.stages.length) * 100 : 0;
  card.append(h("div", { class: "bar" }, h("i", { style: { width: barPct + "%" } })));
  if (st.locked) {
    card.append(h("div", { class: "lock" }, icon("lock")));
    card.addEventListener("click", () => {
      const missing = (g.requires || []).filter((id) => !Store.data.games[id]?.done)
        .map((id) => App.data.games.find((x) => x.id === id)?.title).filter(Boolean);
      toast(`Finish ${missing.join(" & ")} first`, "no");
      FX.gsap.fromTo(card, { x: -6 }, { x: 0, duration: .4, ease: "elastic.out" });
    });
  } else {
    if (st.done) card.append(h("div", { class: "done" }, icon("check")));
    card.addEventListener("click", () => { Sfx.play("click"); openBrief(g); });
  }
  return card;
}

function firstIncomplete() {
  return App.data.games.find((g) => {
    const st = gameStatus(g);
    return !st.locked && !st.done;
  }) || App.data.games.find((g) => !gameStatus(g).locked);
}

/* ---------- BRIEF ---------- */

function openBrief(g) {
  App.game = g;
  const p = paletteOf(g);
  applyPalette(p);
  setBackdrop(g.backdrop, p);
  const st = gameStatus(g);
  const card = $("#brief-card");
  card.innerHTML = "";
  $("#brief-xp").textContent = Store.data.xp.toLocaleString();

  card.append(h("div", { class: "brief-top" },
    h("div", { class: "gicon" }, icon(g.icon || "spark")),
    h("div", {}, h("h2", { text: g.title }), h("p", { class: "tag", text: g.subtitle || "" }))));

  if (g.intro?.headline) card.append(h("h3", { style: { margin: "0 0 10px", fontSize: "19px", letterSpacing: "-.02em" }, text: g.intro.headline }));
  card.append(h("div", { class: "lede prose", html: prose(g.intro?.body || "") }));

  if (g.intro?.code) card.append(codeBlock(g.intro.code, g.intro.codeCaption || "what you will be able to write"));
  const ig = renderInfographic(g.intro?.infographic);
  if (ig) card.append(ig);

  if (g.intro?.objectives?.length) {
    card.append(h("div", { style: { fontSize: "11px", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: "800", margin: "22px 0 10px" }, text: "You will learn" }));
    card.append(h("ul", { class: "obj" }, g.intro.objectives.map((o, i) =>
      h("li", {}, h("span", { class: "n", text: String(i + 1) }), h("span", { html: prose(o).replace(/^<p>|<\/p>$/g, "") })))));
  }

  const startLabel = st.cleared && !st.done ? "Resume run" : st.done ? "Play again" : "Start";
  card.append(h("div", { class: "brief-foot" },
    h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => startRun(g) }, icon("play"), startLabel),
    h("button", { class: "btn btn-ghost", type: "button", onclick: goHome }, "Back"),
    h("span", { class: "fact", text: `${g.stages.length} stages · ${g.stages.reduce((n, s) => n + (s.xp || App.data.config?.xpPerStage || 100), 0)} XP on the table` })));

  requestAnimationFrame(() => {
    reveal($$(".brief-top,.lede,.code,.info,.obj li,.brief-foot", card), { opacity: 0, y: 18, duration: .5, stagger: .05, ease: "power2.out" });
  });
  show("brief");
}

/* ---------- PLAY ---------- */

function startRun(g) {
  App.game = g;
  App.stageIdx = 0;
  App.run = { xp: 0, correct: 0, wrong: 0, hints: 0, combo: 0, bestCombo: 0, startedAt: Date.now(), cleared: [], newCodex: [] };
  const rec = Store.game(g.id);
  rec.plays = (rec.plays || 0) + 1;
  Store.data.plays = (Store.data.plays || 0) + 1;
  Store.save();
  $("#play-title").textContent = g.title;
  show("play");
  renderStage();
}

const HEARTS = 3;
let hearts = HEARTS;

function renderStage() {
  const g = App.game;
  const s = g.stages[App.stageIdx];
  App.ctrl?.destroy?.();
  App.resolved = false;
  hearts = s.hearts ?? HEARTS;

  $("#play-sub").textContent = `stage ${App.stageIdx + 1} of ${g.stages.length} · ${s.title}`;
  const pips = $("#play-pips");
  pips.innerHTML = "";
  g.stages.forEach((_, i) => pips.append(h("div", { class: "pip " + (i < App.stageIdx ? "done" : i === App.stageIdx ? "now" : "") })));
  paintHearts();
  paintCombo();

  /* ---- teach column ---- */
  const teach = h("div", { class: "pane" });
  teach.append(h("div", { class: "pane-head" },
    icon(s.icon || g.icon || "book"),
    h("div", {}, h("div", { class: "kicker", text: s.kicker || "brief" }), h("h3", { text: s.title }))));
  const tb = h("div", { class: "pane-body teach" });
  if (s.goal) tb.append(h("p", { class: "goal", text: s.goal }));
  if (s.teach?.text) tb.append(h("div", { class: "prose", html: prose(s.teach.text) }));
  if (s.teach?.code) tb.append(codeBlock(s.teach.code.src ?? s.teach.code, s.teach.code.caption));
  const info = renderInfographic(s.teach?.infographic);
  if (info) tb.append(info);
  if (s.teach?.code2) tb.append(codeBlock(s.teach.code2.src ?? s.teach.code2, s.teach.code2.caption));
  if (s.teach?.tips?.length) {
    const tips = h("div", { class: "tips" });
    for (const t of s.teach.tips) {
      const kind = typeof t === "string" ? "" : t.kind || "";
      const text = typeof t === "string" ? t : t.text;
      tips.append(h("div", { class: "tip " + kind }, icon(kind === "warn" ? "warn" : kind === "danger" ? "x" : "info"), h("span", { html: prose(text).replace(/^<p>|<\/p>$/g, "") })));
    }
    tb.append(tips);
  }
  teach.append(tb);

  /* ---- challenge column ---- */
  const chal = h("div", { class: "pane" });
  chal.append(h("div", { class: "pane-head" },
    icon("target"),
    h("div", {}, h("div", { class: "kicker", text: (s.challenge.type || "").replace(/-/g, " ") }), h("h3", { text: s.challenge.title || "Your move" })),
    h("div", { style: { flex: "1" } }),
    h("span", { class: "diff", text: `${s.xp || App.data.config?.xpPerStage || 100} XP` })));
  const cb = h("div", { class: "pane-body" });
  cb.append(h("p", { class: "chal-prompt", html: prose(s.challenge.prompt).replace(/^<p>|<\/p>$/g, "") }));
  // Engines that render `code` themselves must not get a second copy above it —
  // for bug-hunt that duplicate even leaks the raw [[…]] span markers.
  const OWNS_CODE = new Set(["arcade", "bug-hunt", "hotspot"]);
  if (s.challenge.code && !OWNS_CODE.has(s.challenge.type)) cb.append(codeBlock(s.challenge.code, s.challenge.codeCaption || "read carefully"));

  const host = { onInput: () => syncCheck() };
  App.ctrl = buildChallenge(s.challenge, host, { palette: paletteOf(g), stageId: s.id });
  cb.append(App.ctrl.el);
  chal.append(cb);

  $("#col-teach").replaceChildren(teach);
  $("#col-chal").replaceChildren(chal);
  App.ctrl.mounted?.();   // engines that need real geometry measure here

  $("#feedback").className = "feedback";
  $("#feedback").innerHTML = "";
  const check = $("#btn-check");
  check.lastChild.textContent = "Check";
  $("#btn-hint").disabled = !(s.hints?.length);
  App.hintIdx = 0;
  syncCheck();

  reveal([teach, chal], { opacity: 0, y: 22, duration: .5, stagger: .08, ease: "power2.out" });

  // Optional per-stage pixi layer on the global backdrop.
  if (s.scene?.code && FX.app) {
    stageScene?.destroy();
    const st = new FX.pixi.Container();
    FX.layer.addChild(st);
    const ctx = makeSceneKit(st, { width: window.innerWidth, height: window.innerHeight }, paletteOf(g));
    ctx.app = FX.app; ctx.params = s.scene.params || {};
    stageScene = runScene(s.scene.code, ctx, "stage:" + s.id);
  }
}
let stageScene = null;

function syncCheck() {
  const btn = $("#btn-check");
  btn.disabled = !App.resolved && !App.ctrl?.ready?.();
}

function paintHearts() {
  const box = $("#play-hearts");
  box.innerHTML = "";
  for (let i = 0; i < HEARTS; i++) {
    const s = icon("heart");
    s.setAttribute("fill", i < hearts ? "currentColor" : "none");
    if (i >= hearts) s.classList.add("gone");
    box.append(s);
  }
}
function paintCombo() {
  const el = $("#play-combo");
  const n = App.run?.combo || 0;
  el.hidden = n < 2;
  $("#combo-n").textContent = "x" + Math.min(3, 1 + Math.floor(n / 2));
  el.classList.toggle("hot", n >= 4);
}

function feedback(kind, title, body) {
  const fb = $("#feedback");
  fb.className = "feedback show " + kind;
  fb.innerHTML = "";
  fb.append(icon(kind === "ok" ? "check" : kind === "no" ? "x" : "bulb"),
    h("span", {}, h("b", { text: title + " " }), h("span", { html: prose(body || "").replace(/^<p>|<\/p>$/g, "") })));
  FX.gsap.fromTo(fb, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: "power2.out" });
}

function onCheck(ev) {
  const s = App.game.stages[App.stageIdx];
  if (App.resolved) { nextStage(); return; }
  if (!App.ctrl.ready()) { toast("Give it an answer first", "no"); return; }

  const ok = App.ctrl.check();
  if (ok) {
    resolveStage(true, ev);
  } else {
    hearts--;
    App.run.combo = 0;
    App.run.wrong++;
    paintHearts(); paintCombo();
    Sfx.play("wrong");
    FX.gsap.fromTo($("#col-chal"), { x: -8 }, { x: 0, duration: .5, ease: "elastic.out" });
    if (hearts <= 0) {
      App.ctrl.solve?.();
      resolveStage(false, ev);
    } else {
      const nudge = s.nudges?.[Math.max(0, (s.hearts ?? HEARTS) - hearts - 1)] || s.hints?.[0] || "Re-read the brief on the left — the answer is in there.";
      feedback("no", "Not yet.", nudge);
    }
  }
}

function resolveStage(ok, ev) {
  const g = App.game, s = g.stages[App.stageIdx];
  if (App.resolved) return;                 // one resolution per stage, ever
  App.resolved = true;
  App.lastOk = ok;

  /* --- scoring first, and synchronously ---------------------------------
   * `reveal()` may await a dynamic import (the real Aktion language service),
   * and the player can press Continue while that is still in flight. Anything
   * behind that await would be skipped for the stage — so every state change
   * that affects progress happens here, before anything can yield.           */
  const base = s.xp || App.data.config?.xpPerStage || 100;
  const lost = (s.hearts ?? HEARTS) - hearts;
  const hintCost = (App.data.config?.hintCost ?? 15) * (App.hintIdx || 0);
  const mult = ok ? Math.min(3, 1 + Math.floor(App.run.combo / 2)) : 0;
  let gained = ok ? Math.max(Math.round(base * .25), Math.round(base * (1 - lost * .25)) - hintCost) : Math.round(base * .15);
  if (ok && mult > 1) gained = Math.round(gained * (1 + (mult - 1) * .25));

  if (ok) {
    App.run.combo++; App.run.correct++;
    App.run.bestCombo = Math.max(App.run.bestCombo, App.run.combo);
    Store.data.streak = (Store.data.streak || 0) + 1;
    Store.data.best = Math.max(Store.data.best || 0, Store.data.streak);
    Sfx.play("stage");
    const r = ev?.target?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight - 90, width: 0 };
    burst((r.left + r.width / 2) / 1, r.top, paletteOf(g), 40);
    xpFloat(r.left + (r.width || 0) / 2 - 30, r.top - 30, gained);
    feedback("ok", ok && lost === 0 ? "Clean hit." : "Correct.", s.explain);
  } else {
    Store.data.streak = 0;
    feedback("no", "Here is the answer.", s.explain);
  }

  App.run.xp += gained;
  Store.data.xp += gained;
  const rec = Store.game(g.id);
  if (ok && !rec.cleared.includes(s.id)) rec.cleared.push(s.id);
  if (!App.run.cleared.includes(s.id) && ok) App.run.cleared.push(s.id);
  if (ok && s.codex && Store.addCodex(s.codex, g.title)) App.run.newCodex.push(s.codex);
  Store.save();
  paintCombo();

  // --- presentation second; nothing below here may affect progress ---
  Promise.resolve(App.ctrl.reveal?.(ok)).catch((err) => console.warn("[aktion-quest] reveal:", err));

  // Post-answer expansion: explanation card, optional live preview, optional custom FX.
  const cb = $(".pane-body", $("#col-chal"));
  const box = h("div", { style: { marginTop: "16px" } });
  if (s.explain) {
    box.append(h("div", { class: "tip " + (ok ? "" : "warn"), style: { alignItems: "flex-start" } },
      icon(ok ? "check" : "bulb"), h("span", { class: "prose", style: { fontSize: "13.4px" }, html: prose(s.explain) })));
  }
  if (s.afterCode) box.append(codeBlock(s.afterCode.src ?? s.afterCode, s.afterCode.caption || "the shape to remember"));
  if (s.codex) box.append(h("div", { class: "tip" }, icon("book"), h("span", {}, h("b", { text: s.codex.term + " — " }), s.codex.def)));
  cb.append(box);
  reveal(box, { opacity: 0, y: 16, duration: .45, ease: "power2.out" });

  if (s.preview?.program) renderPreview(s.preview).then((el) => { cb.append(el); reveal(el, { opacity: 0, y: 14, duration: .4 }); });

  const fxCode = ok ? s.onCorrect?.code : s.onWrong?.code;
  if (fxCode && FX.app) {
    const st = new FX.pixi.Container();
    FX.app.stage.addChild(st);
    const ctx = makeSceneKit(st, { width: innerWidth, height: innerHeight }, paletteOf(g));
    ctx.app = FX.app; ctx.params = (ok ? s.onCorrect : s.onWrong).params || {};
    const hnd = runScene(fxCode, ctx, "celebrate");
    setTimeout(() => { hnd.destroy(); st.destroy({ children: true }); }, (ok ? s.onCorrect : s.onWrong).duration ?? 2600);
  }

  const btn = $("#btn-check");
  btn.lastChild.textContent = App.stageIdx + 1 >= g.stages.length ? "Finish world" : "Continue";
  btn.disabled = false;
  $("#btn-hint").disabled = true;
  requestAnimationFrame(() => $(".scroll", $("#screen-play")).scrollTo({ top: $(".scroll", $("#screen-play")).scrollHeight, behavior: "smooth" }));
}

function nextStage() {
  stageScene?.destroy(); stageScene = null;
  if (App.stageIdx + 1 >= App.game.stages.length) return finishRun();
  App.stageIdx++;
  renderStage();
  $(".scroll", $("#screen-play")).scrollTop = 0;
}

function onHint() {
  const s = App.game.stages[App.stageIdx];
  const hints = s.hints || [];
  if (App.hintIdx >= hints.length) { toast("No more hints on this one", "no"); return; }
  const cost = App.data.config?.hintCost ?? 15;
  feedback("", `Hint ${App.hintIdx + 1}/${hints.length} (−${cost} XP)`, hints[App.hintIdx]);
  App.hintIdx++;
  App.run.hints++;
  Sfx.play("hint");
  if (App.hintIdx >= hints.length) $("#btn-hint").disabled = true;
}

/* ---------- SUMMARY ---------- */

function finishRun() {
  const g = App.game, run = App.run;
  const total = g.stages.length;
  const acc = total ? run.correct / total : 0;
  const stars = acc >= .9 ? 3 : acc >= .7 ? 2 : 1;
  const rec = Store.game(g.id);
  rec.done = rec.cleared.length >= total;
  rec.stars = Math.max(rec.stars || 0, rec.done ? stars : 0);
  rec.bestXp = Math.max(rec.bestXp || 0, run.xp);
  Store.save();

  const p = paletteOf(g);
  const card = $("#summary-card");
  card.innerHTML = "";
  const mins = Math.max(1, Math.round((Date.now() - run.startedAt) / 60000));

  card.append(h("div", { style: { textAlign: "center", position: "relative" } },
    h("div", { class: "stars-big" }, [0, 1, 2].map((i) => { const s = icon("star"); if (i < stars) { s.classList.add("on"); s.setAttribute("fill", "currentColor"); } return s; })),
    h("h2", { style: { margin: "10px 0 4px", fontSize: "clamp(26px,4vw,36px)", letterSpacing: "-.03em" }, text: rec.done ? (g.outro?.headline || "World complete") : "Run complete" }),
    h("p", { class: "tag", style: { color: "var(--ink-2)", maxWidth: "540px", margin: "0 auto" }, text: rec.done ? (g.outro?.body || "") : "You cleared part of this world — replay it to finish the rest." })));

  if (rec.done && g.badge) {
    card.append(h("div", { class: "reward" },
      h("div", { class: "medal" }, icon(g.badge.icon || "medal")),
      h("div", {}, h("b", { text: `Badge unlocked — ${g.badge.name}` }), h("span", { text: g.badge.tagline || "" }))));
  }

  card.append(h("div", { class: "tally" },
    h("div", { class: "t" }, h("b", { text: "+" + run.xp }), h("span", { text: "XP earned" })),
    h("div", { class: "t" }, h("b", { text: `${run.correct}/${total}` }), h("span", { text: "stages" })),
    h("div", { class: "t" }, h("b", { text: "x" + Math.min(3, 1 + Math.floor(run.bestCombo / 2)) }), h("span", { text: "best combo" })),
    h("div", { class: "t" }, h("b", { text: mins + "m" }), h("span", { text: "time" }))));

  if (run.newCodex.length) {
    card.append(h("div", { style: { fontSize: "11px", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: "800", margin: "20px 0 10px" }, text: `${run.newCodex.length} new codex entries` }));
    card.append(h("div", { class: "codex-list" }, run.newCodex.map((c) =>
      h("div", { class: "codex-entry" }, h("h4", { text: c.term }), h("p", { text: c.def })))));
  }

  if (g.outro?.nextHint) card.append(h("div", { class: "tip", style: { marginTop: "18px" } }, icon("arrow"), g.outro.nextHint));

  const nextGame = App.data.games.find((x) => !gameStatus(x).locked && !Store.data.games[x.id]?.done && x.id !== g.id);
  card.append(h("div", { class: "brief-foot", style: { marginTop: "24px" } },
    nextGame && h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => { Sfx.play("click"); openBrief(nextGame); } }, icon("play"), `Next · ${nextGame.title}`),
    h("button", { class: "btn", type: "button", onclick: () => { startRun(g); } }, icon("refresh"), "Replay"),
    h("button", { class: "btn btn-ghost", type: "button", onclick: goHome }, "World map")));

  show("summary");
  Sfx.play("win");
  if (rec.done) {
    for (let i = 0; i < 5; i++) setTimeout(() => burst(innerWidth * (.2 + Math.random() * .6), innerHeight * (.25 + Math.random() * .3), p, 46), i * 220);
  }
  requestAnimationFrame(() => reveal($$(".stars-big svg,.reward,.tally .t,.codex-entry,.brief-foot .btn", card),
    { opacity: 0, y: 20, scale: .9, duration: .5, stagger: .06, ease: "back.out" }));
}

/* ---------- CODEX ---------- */

function openCodex() {
  const entries = Store.data.codex;
  const sheet = $("#sheet");
  sheet.innerHTML = "";
  sheet.append(h("button", { class: "icon-btn sheet-close", type: "button", onclick: closeSheet }, icon("x")));
  sheet.append(h("h3", { text: "Codex" }));
  sheet.append(h("p", { class: "sub", text: entries.length ? `${entries.length} concepts collected. Every stage you clear adds one.` : "Empty for now — clear stages to collect Aktion concepts here." }));
  if (entries.length) {
    sheet.append(h("div", { class: "codex-list" }, entries.map((c) =>
      h("div", { class: "codex-entry" }, h("h4", { text: c.term }), h("p", { text: c.def }), c.from && h("div", { class: "from", text: c.from })))));
  }
  openSheet();
}

function openSheet() {
  $("#scrim").classList.add("show");
  FX.gsap.fromTo($("#sheet"), { y: 26, opacity: 0, scale: .97 }, { y: 0, opacity: 1, scale: 1, duration: .4, ease: "back.out" });
}
function closeSheet() { $("#scrim").classList.remove("show"); }

function confirmSheet(title, body, onYes) {
  const sheet = $("#sheet");
  sheet.innerHTML = "";
  sheet.append(h("h3", { text: title }), h("p", { class: "sub", text: body }),
    h("div", { class: "sheet-actions" },
      h("button", { class: "btn btn-danger", type: "button", onclick: () => { closeSheet(); onYes(); } }, "Yes, do it"),
      h("button", { class: "btn btn-ghost", type: "button", onclick: closeSheet }, "Cancel")));
  openSheet();
}

/* ============================================================================
 * 14. Wiring
 * ========================================================================== */

/** Back to the world map — and back to the map's own colours and backdrop. */
function goHome() {
  stageScene?.destroy(); stageScene = null;
  App.ctrl?.destroy?.();
  App.ctrl = null;
  App.game = null;
  applyPalette(DEFAULT_PALETTE);
  setBackdrop(App.data.meta?.backdrop || { preset: "starfield" }, DEFAULT_PALETTE);
  renderHome();
  show("home");
}

function wire() {
  $("#btn-check").addEventListener("click", onCheck);
  $("#btn-hint").addEventListener("click", onHint);
  $("#btn-codex").addEventListener("click", () => { Sfx.play("click"); openCodex(); });
  $("#btn-quit").addEventListener("click", goHome);
  $$("[data-nav=home]").forEach((b) => b.addEventListener("click", goHome));
  $("#btn-continue").addEventListener("click", () => { const g = firstIncomplete(); if (g) { Sfx.play("click"); openBrief(g); } });
  $("#btn-random").addEventListener("click", () => {
    const open = App.data.games.filter((g) => !gameStatus(g).locked);
    if (open.length) openBrief(open[(Math.random() * open.length) | 0]);
  });
  $("#btn-sound").addEventListener("click", () => {
    Sfx.on = !Sfx.on;
    Store.data.sound = Sfx.on; Store.save();
    $("#btn-sound").classList.toggle("is-off", !Sfx.on);
    if (Sfx.on) Sfx.play("pick");
  });
  $("#btn-sound").classList.toggle("is-off", !Sfx.on);
  $("#btn-reset").addEventListener("click", () => confirmSheet("Reset all progress?",
    "Every world locks again, XP goes to zero and the codex empties. There is no undo.",
    () => { Store.reset(); renderHome(); toast("Progress reset", "ok"); }));
  $("#scrim").addEventListener("click", (e) => { if (e.target.id === "scrim") closeSheet(); });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("textarea,input")) return;
    if (App.screen !== "play") {
      if (e.key === "Escape") closeSheet();
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); $("#btn-check").click(); }
    else if (e.key.toLowerCase() === "h") $("#btn-hint").click();
    else if (/^[1-9]$/.test(e.key)) App.ctrl?.hotkey?.(Number(e.key));
    else if (e.key === "Escape") closeSheet();
  });

  window.addEventListener("resize", () => {
    if (App.game) setBackdrop(App.game.backdrop, paletteOf(App.game));
  }, { passive: true });

  document.addEventListener("pointerdown", () => Sfx.ensure(), { once: true });
}

/* ============================================================================
 * 15. Boot
 * ========================================================================== */

function bootNote(t) { const el = $("#boot-note"); if (el) el.textContent = t; }

function bootFail(msg, detail) {
  const box = $("#boot-error");
  box.hidden = false;
  box.innerHTML = `<b>${esc(msg)}</b><br/><br/>${detail}`;
  $(".boot-bar").style.display = "none";
  bootNote("halted");
}

async function boot() {
  Store.load();
  bootNote("loading the graphics stack");
  await loadLibs(bootNote);
  if (FX.note) console.info("[aktion-quest]", FX.note);

  bootNote("fetching games.json");
  let data;
  try {
    const res = await fetch(new URL("./games.json", import.meta.url), { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    if (window.AKTION_QUEST_GAMES) data = window.AKTION_QUEST_GAMES;
    else return bootFail("Could not load games.json", `
      <p>${esc(String(err))}</p>
      <p>Browsers block <code>fetch()</code> on <code>file://</code> URLs, so the arcade needs a plain HTTP server. From the repo root:</p>
      <p><code>npx vite game --port 5180</code> &nbsp;or&nbsp; <code>python3 -m http.server 5180</code></p>
      <p>then open <code>http://localhost:5180/game.html</code>.</p>`);
  }

  if (!data?.games?.length) return bootFail("games.json has no games", "<p>The bundle parsed but its <code>games</code> array is empty.</p>");

  // Basic authoring validation — surfaced in the console, never fatal.
  const problems = validateBundle(data);
  if (problems.length) console.warn("[aktion-quest] content warnings:\n" + problems.map((p) => " • " + p).join("\n"));

  App.data = data;
  document.title = `${data.meta?.title || "Aktion Quest"} — learn Aktion by playing`;
  bootNote("ready");

  await initBackdrop();
  applyPalette(DEFAULT_PALETTE);
  setBackdrop(data.meta?.backdrop || { preset: "starfield" }, DEFAULT_PALETTE);

  wire();
  renderHome();
  show("home");
  if (FX.lite) toast("Running without WebGL — arcade stages use their fallbacks", "no");
}

/** Cheap structural checks so a typo in games.json is loud, not silent. */
function validateBundle(data) {
  const out = [];
  const ids = new Set();
  // A scene that does not even parse is the single most expensive authoring
  // defect, because it fails silently at play time. Catch it at boot.
  const checkCode = (code, where) => {
    if (!code) return;
    try { new Function("PIXI", "gsap", "ctx", code); }
    catch (err) { out.push(`${where}: scene code does not parse — ${err.message}`); }
  };
  for (const g of data.games || []) {
    if (!g.id) out.push("a game has no id");
    if (ids.has(g.id)) out.push(`duplicate game id "${g.id}"`);
    ids.add(g.id);
    if (!g.stages?.length) out.push(`${g.id}: no stages`);
    for (const req of g.requires || []) if (!(data.games || []).some((x) => x.id === req)) out.push(`${g.id}: requires unknown game "${req}"`);
    checkCode(g.backdrop?.code, `${g.id}/backdrop`);
    if (g.backdrop?.preset && !BACKDROPS[g.backdrop.preset] && !g.backdrop.code) out.push(`${g.id}: unknown backdrop preset "${g.backdrop.preset}"`);
    if (g.icon && !ICONS[g.icon]) out.push(`${g.id}: unknown icon "${g.icon}"`);
    const sids = new Set();
    for (const s of g.stages || []) {
      const where = `${g.id}/${s.id || "?"}`;
      if (!s.id) out.push(`${g.id}: a stage has no id`);
      if (sids.has(s.id)) out.push(`${where}: duplicate stage id`);
      sids.add(s.id);
      checkCode(s.scene?.code, `${where}/scene`);
      checkCode(s.onCorrect?.code, `${where}/onCorrect`);
      checkCode(s.onWrong?.code, `${where}/onWrong`);
      if (s.icon && !ICONS[s.icon]) out.push(`${where}: unknown icon "${s.icon}"`);
      if (s.teach?.infographic && !INFOGRAPHICS[s.teach.infographic.type]) out.push(`${where}: unknown infographic type "${s.teach.infographic.type}"`);
      if (!s.explain) out.push(`${where}: no explain`);
      const c = s.challenge;
      if (!c) { out.push(`${where}: no challenge`); continue; }
      if (!ENGINES[c.type]) out.push(`${where}: unknown challenge type "${c.type}"`);
      if (!c.prompt) out.push(`${where}: challenge has no prompt`);
      if (c.type === "quiz") {
        const ids2 = (c.options || []).map((o) => String(o.id));
        for (const a of [].concat(c.answer ?? [])) if (!ids2.includes(String(a))) out.push(`${where}: answer "${a}" is not an option id`);
      }
      if (c.type === "fill-blanks") {
        const bank = (c.bank || []).map((b) => String(typeof b === "string" ? b : b.id));
        for (const a of c.answer || []) if (!bank.includes(String(a))) out.push(`${where}: answer token "${a}" is not in the bank`);
        const slots = c.display === "tree" ? (c.rows || []).filter((r) => r.slot != null).length : (String(c.template || "").match(/\{\{\d+\}\}/g) || []).length;
        if (slots !== (c.answer || []).length) out.push(`${where}: ${slots} slots but ${(c.answer || []).length} answers`);
      }
      if (c.type === "bug-hunt") {
        const n = (String(c.code || "").match(/\[\[/g) || []).length;
        if (!(c.answer >= 0 && c.answer < n)) out.push(`${where}: answer index ${c.answer} outside the ${n} marked spans`);
      }
      if (c.type === "sort-bins") {
        const bids = (c.bins || []).map((b) => String(b.id));
        for (const it of c.items || []) if (!bids.includes(String(it.bin))) out.push(`${where}: item "${it.label}" targets unknown bin "${it.bin}"`);
      }
      if (c.type === "switchboard") {
        if (!(c.switches || []).some((s2) => s2.on)) out.push(`${where}: switchboard has no correct (on: true) switch`);
      }
      if (c.type === "arcade") {
        if (!c.code) out.push(`${where}: arcade challenge has no code`);
        else {
          checkCode(c.code, where);
          if (!/api\s*\.\s*win\s*\(/.test(c.code)) out.push(`${where}: arcade code never calls ctx.api.win() — the stage would be unwinnable`);
        }
        if (!c.fallback) out.push(`${where}: arcade challenge has no fallback (players without WebGL get a freebie)`);
        else if (!ENGINES[c.fallback.type]) out.push(`${where}: arcade fallback has unknown type "${c.fallback.type}"`);
      }
    }
  }
  return out;
}

boot();

/* ============================================================================
 * 16. Self-test — every engine, solved by its own solve()
 * ----------------------------------------------------------------------------
 * `AktionQuest.selfTest()` from the console. Each fixture also doubles as a
 * minimal, known-good example of that challenge type.
 * ========================================================================== */

const FIXTURES = {
  quiz: { type: "quiz", prompt: "?", options: [{ id: "a", code: "$app(x)" }, { id: "b", code: "render(x)" }], answer: "a" },
  "fill-blanks": { type: "fill-blanks", prompt: "?", template: "{{0}}(Column([{{1}}(\"hi\")]))", bank: ["$app", "Text", "render"], answer: ["$app", "Text"] },
  "order-lines": { type: "order-lines", prompt: "?", lines: [{ id: "a", code: "$app(page)" }, { id: "b", code: "page = Column([])" }], answer: ["a", "b"] },
  "bug-hunt": { type: "bug-hunt", prompt: "?", code: "[[aktion]] = [[Column]]([])", answer: 0 },
  "match-pairs": { type: "match-pairs", prompt: "?", pairs: [{ left: { mono: "$http" }, right: { label: "a bag" } }, { left: { mono: "$app" }, right: { label: "the root" } }] },
  "sort-bins": { type: "sort-bins", prompt: "?", bins: [{ id: "b1", label: "Builtin" }, { id: "b2", label: "Component" }], items: [{ label: "$router", bin: "b1" }, { label: "Stack", bin: "b2" }] },
  switchboard: { type: "switchboard", prompt: "?", switches: [{ label: "$todos", on: true }, { label: "route.path", on: false }] },
  "sequence-tap": { type: "sequence-tap", prompt: "?", order: ["parse", "plan", "render"] },
  hotspot: { type: "hotspot", prompt: "?", code: "Input(\"a\", { value: $b })", points: [{ x: "20%", y: "40%", correct: false }, { x: "70%", y: "40%", correct: true }] },
  "type-code": { type: "type-code", prompt: "?", solution: "$app(Text(\"hi\"))", validate: { must: ["\\$app\\("] } },
};

async function selfTest() {
  const host = { onInput() {} };
  const ctx = { palette: DEFAULT_PALETTE, stageId: "selftest" };
  const results = [];
  for (const [type, fixture] of Object.entries(FIXTURES)) {
    let row = { type, ok: false, note: "" };
    try {
      const c = buildChallenge(fixture, host, ctx);
      document.body.append(Object.assign(c.el, { style: "position:fixed;left:-9999px;top:0" }));
      const before = c.check();
      c.solve();
      const after = c.check();
      row.ok = after === true && before === false;
      row.note = row.ok ? "solve() satisfies check()" : `before=${before} after=${after}`;
      c.destroy();
      c.el.remove();
    } catch (err) { row.note = String(err); }
    results.push(row);
  }
  const failed = results.filter((r) => !r.ok);
  console.table(results);
  console.log(failed.length ? `%c${failed.length} engine(s) failing` : "%call engines pass", `color:${failed.length ? "#fb7185" : "#34d399"};font-weight:700`);
  return results;
}

/**
 * Headless drill for every arcade scene in the bundle.
 *
 *   await AktionQuest.drillArcade()          // all of them
 *   await AktionQuest.drillArcade("first-light")
 *
 * Runs each scene off-screen, pumps `frames` ticks while sweeping a synthetic
 * pointer across the canvas, and reports: did any tick throw, did anything get
 * drawn, and did `ctx.api.win()` ever fire. A scene that throws on frame one, or
 * that can never be won, is invisible in normal play until a learner is stuck on
 * it — this is how you catch that before shipping.
 */
async function drillArcade(gameId, frames = 1200) {
  if (!FX.pixi) { console.warn("[aktion-quest] drillArcade needs PixiJS"); return []; }
  const rows = [];
  const games = (App.data?.games || []).filter((g) => !gameId || g.id === gameId);
  for (const g of games) {
    for (const s of g.stages || []) {
      if (s.challenge?.type !== "arcade") continue;
      const row = { game: g.id, stage: s.id, drew: 0, won: false, errors: 0, first: "" };
      const app = new FX.pixi.Application();
      const canvas = document.createElement("canvas");
      await app.init({ canvas, width: 520, height: s.challenge.height || 340, backgroundAlpha: 0, antialias: false });
      app.stop(); // we pump the ticker by hand
      app.stage.eventMode = "static";
      app.stage.hitArea = new FX.pixi.Rectangle(0, 0, 520, s.challenge.height || 340);
      const stage = new FX.pixi.Container();
      app.stage.addChild(stage);
      const ctx = makeSceneKit(stage, { width: 520, height: s.challenge.height || 340 }, paletteOf(g));
      ctx.app = app; ctx.params = s.challenge.params || {}; ctx.state = {}; ctx.el = canvas;
      ctx.api = { setScore() {}, setGoal() {}, win() { row.won = true; }, fail() {}, reset() {} };
      const ticks = [];
      ctx.onTick = (fn) => ticks.push(fn);
      ctx.onDestroy = () => {};
      try {
        const ret = new Function("PIXI", "gsap", "ctx", `"use strict";\n${s.challenge.code}\n`)(FX.pixi, FX.gsap, ctx);
        if (ret?.update) ticks.push(ret.update);
      } catch (err) { row.errors++; row.first = "compile: " + err.message; rows.push(row); app.destroy(true, { children: true }); continue; }
      const H = s.challenge.height || 340;
      // Everything the scene wired up a tap handler on — the auto-player's targets.
      const tappable = () => {
        const out = [];
        (function walk(node) {
          if (node.listenerCount && (node.listenerCount("pointertap") || node.listenerCount("pointerdown") || node.listenerCount("click"))) out.push(node);
          for (const kid of node.children || []) walk(kid);
        })(stage);
        return out;
      };
      let targets = [], cursor = 0;
      for (let f = 0; f < frames && !row.won; f++) {
        // Sweep the pointer over the whole canvas — paddle scenes track it,
        // and it keeps hover-driven scenes alive.
        const px = 40 + ((f * 6.7) % (520 - 80));
        const py = 30 + ((f * 3.1) % (H - 60));
        const at = { global: { x: px, y: py }, globalX: px, globalY: py, data: { global: { x: px, y: py } } };
        try { app.stage.emit("pointermove", { ...at, global: { x: px, y: H - 30 } }); } catch {}
        // Tap-driven scenes: cycle through every object that registered a handler.
        if (f % 9 === 0) {
          if (f % 90 === 0 || !targets.length) { targets = tappable(); cursor = 0; }
          const t = targets[cursor++ % Math.max(1, targets.length)];
          if (t) { try { t.emit("pointertap", at); t.emit("pointerdown", at); t.emit("pointerup", at); } catch {} }
          try { app.stage.emit("pointerdown", at); app.stage.emit("pointerup", at); } catch {}
        }
        for (const fn of ticks) {
          try { fn(1, { deltaTime: 1 }); }
          catch (err) { row.errors++; if (!row.first) row.first = `frame ${f}: ${err.message}`; }
        }
        // NB: do not drive gsap's root clock from here. Forcing `updateRoot` fights
        // the live ticker and completes tweens early, which destroys nodes the
        // scene is still using — it makes working scenes look broken.
        if (row.errors > 5) break;
      }
      row.drew = stage.children.length;
      row.taps = tappable().length;
      rows.push(row);
      killSceneTweens(app.stage);
      app.destroy(true, { children: true });
    }
  }
  console.table(rows);
  const broken = rows.filter((r) => r.errors || !r.drew);
  const unwon = rows.filter((r) => !r.errors && r.drew && !r.won);
  console.log(broken.length ? `%c${broken.length} arcade scene(s) BROKEN — they throw or draw nothing` : "%call arcade scenes run clean",
    `color:${broken.length ? "#fb7185" : "#34d399"};font-weight:700`);
  if (unwon.length) console.log(`%c${unwon.length} scene(s) the auto-player could not win — play these by hand: ${unwon.map((r) => r.game).join(", ")}`,
    "color:#fbbf24;font-weight:700");
  return rows;
}

/* Expose internals for debugging and for authoring tools. */
window.AktionQuest = { App, Store, FX, VERSION, highlightAktion, validateBundle, buildChallenge, ENGINES, FIXTURES, selfTest, drillArcade };
