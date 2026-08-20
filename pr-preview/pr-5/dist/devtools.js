var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";
const DEVTOOLS_PROTOCOL_VERSION = 1;
function hookGlobal() {
  return globalThis;
}
function getDevtoolsHook() {
  return hookGlobal()[HOOK_KEY];
}
function isDevtoolsActive() {
  const hook = getDevtoolsHook();
  return hook !== void 0 && hook.active;
}
function installDevtoolsHook(libraryVersion = "0.5.x") {
  const existing = getDevtoolsHook();
  if (existing) {
    existing.libraryVersion = libraryVersion;
    return existing;
  }
  const eventListeners = /* @__PURE__ */ new Set();
  const appListeners = /* @__PURE__ */ new Set();
  const apps = /* @__PURE__ */ new Map();
  const buffer = [];
  const hook = {
    aktion: true,
    protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    libraryVersion,
    apps,
    buffer,
    bufferLimit: 500,
    get active() {
      return eventListeners.size > 0 || appListeners.size > 0;
    },
    emit(event) {
      buffer.push(event);
      if (buffer.length > hook.bufferLimit) {
        buffer.splice(0, buffer.length - hook.bufferLimit);
      }
      for (const listener of [...eventListeners]) {
        try {
          listener(event);
        } catch (err) {
          console.error("[aktion-devtools] event listener threw", err);
        }
      }
    },
    registerApp(app) {
      apps.set(app.id, app);
      for (const listener of [...appListeners]) {
        try {
          listener("register", app);
        } catch (err) {
          console.error("[aktion-devtools] app listener threw", err);
        }
      }
    },
    unregisterApp(id) {
      const app = apps.get(id);
      if (!app) return;
      apps.delete(id);
      for (const listener of [...appListeners]) {
        try {
          listener("unregister", app);
        } catch (err) {
          console.error("[aktion-devtools] app listener threw", err);
        }
      }
    },
    subscribe(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeApps(listener) {
      appListeners.add(listener);
      return () => appListeners.delete(listener);
    }
  };
  hookGlobal()[HOOK_KEY] = hook;
  return hook;
}
const devtoolsStyles = `
:host {
  --dt-bg: #16181d;
  --dt-bg-raised: #1d2026;
  --dt-bg-inset: #101216;
  --dt-border: #2b2f38;
  --dt-border-strong: #3a3f4b;
  --dt-text: #e6e8ec;
  --dt-text-dim: #9aa0ab;
  --dt-text-faint: #6b7280;
  --dt-accent: #7c9cff;
  --dt-accent-soft: #2a3357;
  --dt-green: #5ad19b;
  --dt-blue: #6aa6ff;
  --dt-amber: #f0b35e;
  --dt-grey: #5b626f;
  --dt-red: #f87171;
  --dt-purple: #c08cf0;
  --dt-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --dt-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  all: initial;
  position: fixed;
  z-index: 2147483000;
  font-family: var(--dt-sans);
  color: var(--dt-text);
  contain: layout style;
}
:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; }

.panel {
  display: flex;
  flex-direction: column;
  width: 480px;
  height: 560px;
  max-width: 96vw;
  max-height: 92vh;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border-strong);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
}
.panel.is-collapsed { height: auto !important; }
.panel.is-collapsed .panel-body,
.panel.is-collapsed .tabs { display: none; }

/* ---- Header ---- */
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--dt-bg-raised);
  border-bottom: 1px solid var(--dt-border);
  cursor: grab;
  user-select: none;
}
.header.is-dragging { cursor: grabbing; }
.brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.brand .bolt { color: var(--dt-accent); font-size: 13px; }
.brand .ver { color: var(--dt-text-faint); font-weight: 500; font-size: 10px; }
.header .spacer { flex: 1; }

.app-select {
  appearance: none;
  background: var(--dt-bg-inset);
  color: var(--dt-text);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  padding: 3px 22px 3px 8px;
  font-size: 11px;
  font-family: var(--dt-sans);
  max-width: 150px;
  cursor: pointer;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3.5 5 6.5 8 3.5' stroke='%239aa0ab' fill='none' stroke-width='1.4'/></svg>");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.app-select:focus { outline: none; border-color: var(--dt-accent); }

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 24px;
  min-width: 24px;
  padding: 0 6px;
  background: var(--dt-bg-inset);
  color: var(--dt-text-dim);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  font-family: var(--dt-sans);
}
.icon-btn:hover { color: var(--dt-text); border-color: var(--dt-border-strong); }
.icon-btn.is-on { color: var(--dt-text); border-color: var(--dt-accent); }
.rec-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--dt-red);
}
.rec-dot.is-paused { background: var(--dt-text-faint); }

/* ---- Tabs ---- */
.tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  background: var(--dt-bg-raised);
  border-bottom: 1px solid var(--dt-border);
}
.tab {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dt-text-dim);
  padding: 6px 12px 8px;
  font-size: 12px;
  font-family: var(--dt-sans);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
}
.tab:hover { color: var(--dt-text); background: rgba(255,255,255,0.03); }
.tab.is-active { color: var(--dt-text); border-bottom-color: var(--dt-accent); font-weight: 600; }
.tab .count {
  margin-left: 5px;
  font-size: 10px;
  color: var(--dt-text-faint);
  font-variant-numeric: tabular-nums;
}

/* ---- Body ---- */
.panel-body {
  flex: 1;
  overflow: auto;
  background: var(--dt-bg);
}
.panel-body::-webkit-scrollbar { width: 10px; height: 10px; }
.panel-body::-webkit-scrollbar-thumb { background: var(--dt-border-strong); border-radius: 6px; border: 2px solid var(--dt-bg); }

.toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--dt-bg);
  border-bottom: 1px solid var(--dt-border);
}
.toolbar .grow { flex: 1; }
.search {
  flex: 1;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--dt-text);
  font-size: 11px;
  font-family: var(--dt-mono);
}
.search:focus { outline: none; border-color: var(--dt-accent); }
.muted { color: var(--dt-text-dim); font-size: 11px; }
.faint { color: var(--dt-text-faint); }
.empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--dt-text-faint);
  font-size: 12px;
}
.empty code { color: var(--dt-text-dim); font-family: var(--dt-mono); }

/* ---- State inspector tree ---- */
.tree { padding: 4px 0; }
.row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 10px 2px 0;
  font-family: var(--dt-mono);
  font-size: 11.5px;
  white-space: nowrap;
}
.row:hover { background: rgba(255,255,255,0.035); }
.row .twist {
  width: 14px;
  flex: 0 0 14px;
  color: var(--dt-text-faint);
  cursor: pointer;
  text-align: center;
  user-select: none;
}
.row .twist.is-leaf { visibility: hidden; }
.row .k { color: var(--dt-purple); }
.row .sep { color: var(--dt-text-faint); }
.row .v { color: var(--dt-text); cursor: text; }
.row .v.t-string { color: var(--dt-green); }
.row .v.t-number { color: var(--dt-amber); }
.row .v.t-boolean { color: var(--dt-blue); }
.row .v.t-null, .row .v.t-undefined { color: var(--dt-text-faint); font-style: italic; }
.row .v.t-object, .row .v.t-array, .row .v.t-function { color: var(--dt-text-dim); }
.row .tag {
  margin-left: 6px;
  font-size: 9px;
  font-family: var(--dt-sans);
  color: var(--dt-text-faint);
  border: 1px solid var(--dt-border);
  border-radius: 4px;
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.row.is-changed { background: var(--dt-accent-soft); animation: dt-flash 1.1s ease-out; }
@keyframes dt-flash {
  0% { background: rgba(124,156,255,0.55); }
  100% { background: transparent; }
}
.edit-input {
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-accent);
  border-radius: 4px;
  color: var(--dt-text);
  font-family: var(--dt-mono);
  font-size: 11.5px;
  padding: 0 4px;
  min-width: 80px;
}
.edit-input:focus { outline: none; }

/* ---- Profiler ---- */
.commit-strip {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 64px;
  padding: 8px 10px;
  background: var(--dt-bg-inset);
  border-bottom: 1px solid var(--dt-border);
  overflow-x: auto;
}
.commit-bar {
  flex: 0 0 9px;
  min-height: 3px;
  background: var(--dt-blue);
  border-radius: 2px 2px 0 0;
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.1s;
}
.commit-bar:hover { opacity: 1; }
.commit-bar.is-full { background: var(--dt-amber); }
.commit-bar.is-initial { background: var(--dt-green); }
.commit-bar.is-selected { opacity: 1; outline: 1.5px solid var(--dt-text); outline-offset: 1px; }

.section { padding: 10px; border-bottom: 1px solid var(--dt-border); }
.section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--dt-text-faint);
  margin: 0 0 7px;
  font-weight: 700;
}
.kv { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 6px; }
.kv span { font-size: 11px; color: var(--dt-text-dim); }
.kv b { color: var(--dt-text); font-weight: 600; }
.kv .mono { font-family: var(--dt-mono); }
.chip {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-family: var(--dt-mono);
}
.chip.green { background: rgba(90,209,155,0.16); color: var(--dt-green); }
.chip.blue { background: rgba(106,166,255,0.16); color: var(--dt-blue); }
.chip.amber { background: rgba(240,179,94,0.16); color: var(--dt-amber); }
.chip.grey { background: rgba(91,98,111,0.22); color: var(--dt-text-dim); }
.chip.red { background: rgba(248,113,113,0.16); color: var(--dt-red); }
.chip.purple { background: rgba(192,140,240,0.16); color: var(--dt-purple); }

/* flamegraph rows */
.flame-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1px 0;
  font-size: 11px;
}
.flame-bar-wrap { flex: 1; min-width: 0; }
.flame-bar {
  height: 16px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  color: #0c0e12;
  font-family: var(--dt-mono);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  min-width: 2px;
}
.flame-bar.p-mount { background: var(--dt-green); }
.flame-bar.p-update { background: var(--dt-blue); }
.flame-bar.p-memo { background: var(--dt-grey); color: var(--dt-text-dim); opacity: 0.8; }
.flame-time { flex: 0 0 56px; text-align: right; font-family: var(--dt-mono); color: var(--dt-text-dim); font-size: 10px; }
.flame-reason { font-size: 10px; color: var(--dt-text-faint); }

/* tables */
table.dt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
table.dt-table th {
  text-align: left;
  color: var(--dt-text-faint);
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--dt-border);
  position: sticky;
  top: 0;
  background: var(--dt-bg);
}
table.dt-table td {
  padding: 3px 6px;
  border-bottom: 1px solid rgba(43,47,56,0.5);
  font-variant-numeric: tabular-nums;
}
table.dt-table td.name { font-family: var(--dt-mono); color: var(--dt-text); }
table.dt-table td.num { text-align: right; font-family: var(--dt-mono); color: var(--dt-text-dim); }
table.dt-table tr:hover td { background: rgba(255,255,255,0.03); }
.bar-cell { position: relative; }
.bar-cell .barfill {
  position: absolute;
  left: 0; top: 2px; bottom: 2px;
  background: rgba(124,156,255,0.22);
  border-radius: 3px;
  z-index: 0;
}
.bar-cell span { position: relative; z-index: 1; }

/* ---- Effect timeline ---- */
.lane {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(43,47,56,0.5);
}
.lane .lane-name { font-family: var(--dt-mono); color: var(--dt-text); font-size: 11px; flex: 0 0 auto; }
.lane .lane-trig { font-family: var(--dt-mono); color: var(--dt-text-faint); font-size: 10px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lane .lane-stat { color: var(--dt-text-dim); font-size: 10px; font-variant-numeric: tabular-nums; }

.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(43,47,56,0.35);
}
.log-row:hover { background: rgba(255,255,255,0.03); }
.log-row .t { flex: 0 0 62px; text-align: right; font-family: var(--dt-mono); color: var(--dt-text-faint); font-size: 10px; }
.log-row .ph { flex: 0 0 64px; }
.log-row .lbl { font-family: var(--dt-mono); color: var(--dt-text-dim); }
.log-row .rsn { flex: 1; font-family: var(--dt-mono); color: var(--dt-text-faint); font-size: 10px; text-align: right; }

.filters { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
  color: var(--dt-text-faint);
  cursor: pointer;
  font-family: var(--dt-sans);
}
.filter-chip.is-on { color: var(--dt-text); border-color: var(--dt-border-strong); background: var(--dt-bg-raised); }

/* ---- Stat grid (perf / effect summaries) ---- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
  gap: 6px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 7px;
}
.stat.is-link { cursor: pointer; }
.stat.is-link:hover { border-color: var(--dt-accent); }
.stat-val {
  font-family: var(--dt-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--dt-text);
  font-variant-numeric: tabular-nums;
}
.stat-val.t-warn { color: var(--dt-amber); }
.stat-val.t-good { color: var(--dt-green); }
.stat-val.t-bad { color: var(--dt-red); }
.stat-label {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dt-text-faint);
}

/* ---- Horizontal bar rows (hot atoms) ---- */
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
}
.bar-row-label {
  flex: 0 0 34%;
  font-family: var(--dt-mono);
  color: var(--dt-purple);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-row-track {
  flex: 1;
  height: 10px;
  background: var(--dt-bg-inset);
  border-radius: 3px;
  overflow: hidden;
}
.bar-row-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--dt-accent-soft), var(--dt-accent));
  border-radius: 3px;
}
.bar-row-num {
  flex: 0 0 auto;
  font-family: var(--dt-mono);
  color: var(--dt-text-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

/* ---- Insights ---- */
.insights { display: flex; flex-direction: column; gap: 5px; }
.insight {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  font-size: 11px;
  line-height: 1.4;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
  color: var(--dt-text-dim);
}
.insight-ic { flex: 0 0 auto; font-weight: 700; }
.insight.t-warn { border-color: rgba(240,179,94,0.4); }
.insight.t-warn .insight-ic { color: var(--dt-amber); }
.insight.t-bad { border-color: rgba(248,113,113,0.4); }
.insight.t-bad .insight-ic { color: var(--dt-red); }
.insight.t-good .insight-ic { color: var(--dt-green); }

/* ---- Reactivity heat badge (state tree) ---- */
.row .grow { flex: 1; min-width: 8px; }
.heat { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; }
.heat-bar {
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: var(--dt-bg-inset);
  overflow: hidden;
}
.heat-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--dt-blue), var(--dt-amber));
}
.heat-num {
  font-family: var(--dt-mono);
  font-size: 9.5px;
  color: var(--dt-text-faint);
  min-width: 18px;
  text-align: right;
}

/* ---- Sortable table headers ---- */
table.dt-table th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
table.dt-table th.sortable:hover { color: var(--dt-text-dim); }

/* ---- Effect visual timeline ---- */
.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 4px;
}
.tl-axis {
  position: relative;
  flex: 0 0 120px;
  font-family: var(--dt-mono);
  font-size: 9px;
  color: var(--dt-text-faint);
}
.tl-axis-end { float: right; }
.tl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border-bottom: 1px solid rgba(43,47,56,0.4);
}
.tl-name {
  flex: 0 0 38%;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  color: var(--dt-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-track {
  position: relative;
  flex: 1;
  height: 16px;
  background: var(--dt-bg-inset);
  border-radius: 4px;
}
.tl-dot {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  margin-left: -4px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--dt-bg-inset);
}
.tl-dot.green { background: var(--dt-green); }
.tl-dot.blue { background: var(--dt-blue); }
.tl-dot.purple { background: var(--dt-purple); }
.tl-dot.grey { background: var(--dt-grey); }
.tl-dot.red { background: var(--dt-red); }

/* ---- Resize grip ---- */
.resize {
  position: absolute;
  width: 16px;
  height: 16px;
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--dt-border-strong) 50%, var(--dt-border-strong) 60%, transparent 60%, transparent 72%, var(--dt-border-strong) 72%, var(--dt-border-strong) 82%, transparent 82%);
  border-bottom-right-radius: 12px;
}
`;
const DEVTOOLS_UI_VERSION = "0.5";
const RESERVED_ATOMS = /* @__PURE__ */ new Set(["route"]);
const MAX_COMMITS = 200;
const MAX_EFFECT_EVENTS = 400;
const FLASH_MS = 1100;
function emptyModel() {
  return { commits: [], effects: [], state: {}, changed: /* @__PURE__ */ new Map(), changeCounts: /* @__PURE__ */ new Map(), firstTime: null };
}
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "style") node.setAttribute("style", String(v));
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
function valueType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function isExpandable(v) {
  const t = valueType(v);
  return (t === "object" || t === "array") && childEntries(v).length > 0;
}
function childEntries(v) {
  if (Array.isArray(v)) return v.map((item, i) => [String(i), item]);
  if (v && typeof v === "object") return Object.entries(v);
  return [];
}
function previewValue(v) {
  switch (valueType(v)) {
    case "string":
      return JSON.stringify(v);
    case "number":
    case "boolean":
      return String(v);
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "function":
      return "ƒ ()";
    case "array":
      return `Array(${v.length})`;
    case "object": {
      const keys = Object.keys(v);
      const head = keys.slice(0, 3).join(", ");
      return `{ ${head}${keys.length > 3 ? ", …" : ""} }`;
    }
    default:
      return String(v);
  }
}
function parseEdit(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function fmtMs(n) {
  if (!isFinite(n)) return "—";
  if (n >= 100) return `${n.toFixed(0)} ms`;
  if (n >= 10) return `${n.toFixed(1)} ms`;
  return `${n.toFixed(2)} ms`;
}
function fmtRel(ms) {
  if (ms >= 1e4) return `${(ms / 1e3).toFixed(1)} s`;
  return `${ms.toFixed(0)} ms`;
}
function fmtCount(n) {
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function fmtPct(num, den) {
  if (den <= 0) return "—";
  return `${Math.round(num / den * 100)}%`;
}
const PHASE_CHIP = {
  mount: "green",
  update: "blue",
  memo: "grey",
  run: "blue",
  cleanup: "purple",
  unmount: "grey",
  error: "red"
};
class AktionDevtoolsElement extends HTMLElement {
  constructor() {
    super(...arguments);
    __publicField(this, "hook", null);
    __publicField(this, "unsubEvents", null);
    __publicField(this, "unsubApps", null);
    __publicField(this, "models", /* @__PURE__ */ new Map());
    __publicField(this, "selectedAppId", null);
    __publicField(this, "tab", "state");
    __publicField(this, "paused", false);
    // State tab
    __publicField(this, "stateFilter", "");
    __publicField(this, "expanded", /* @__PURE__ */ new Set());
    __publicField(this, "editingPath", null);
    /** Sort atoms by change frequency (reactivity heat) instead of name. */
    __publicField(this, "stateSortByActivity", false);
    // Profiler tab
    __publicField(this, "selectedCommitId", null);
    __publicField(this, "flashOnCommit", false);
    /** Sort key + direction for the ranked-components table. */
    __publicField(this, "rankedSort", { key: "total", dir: -1 });
    // Effects tab
    __publicField(this, "phaseFilter", /* @__PURE__ */ new Set(["mount", "run", "cleanup", "unmount", "error"]));
    /** Group the effect timeline into per-effect lanes vs. a flat log. */
    __publicField(this, "effectView", "timeline");
    // chrome
    __publicField(this, "collapsed", false);
    __publicField(this, "renderScheduled", false);
    __publicField(this, "flashTimer", null);
    // skeleton refs
    __publicField(this, "root");
    __publicField(this, "panelEl");
    __publicField(this, "controlsEl");
    __publicField(this, "tabsEl");
    __publicField(this, "bodyEl");
  }
  connectedCallback() {
    if (!this.root) this.buildSkeleton();
    this.hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);
    for (const app of this.hook.apps.values()) this.adopt(app);
    if (!this.selectedAppId && this.hook.apps.size > 0) {
      this.selectedAppId = [...this.hook.apps.keys()][0];
    }
    for (const event of this.hook.buffer) this.ingest(
      event,
      /* fromBuffer */
      true
    );
    this.unsubEvents = this.hook.subscribe((event) => this.onEvent(event));
    this.unsubApps = this.hook.subscribeApps((action, app) => this.onApp(action, app));
    this.discoverApps();
    this.scheduleRender();
  }
  disconnectedCallback() {
    this.unsubEvents?.();
    this.unsubApps?.();
    this.unsubEvents = null;
    this.unsubApps = null;
    if (this.flashTimer) clearTimeout(this.flashTimer);
  }
  /* ---- public controller surface ---- */
  open() {
    this.hidden = false;
  }
  close() {
    this.hidden = true;
  }
  toggle() {
    this.hidden = !this.hidden;
  }
  selectApp(id) {
    this.selectedAppId = id;
    this.selectedCommitId = null;
    this.scheduleRender();
  }
  /** Test/inspection hook: the derived model for an app (or the selected one). */
  getModel(appId) {
    const id = appId ?? this.selectedAppId;
    return id ? this.models.get(id) ?? null : null;
  }
  /* ---- event ingestion ---- */
  ensureModel(appId) {
    let m = this.models.get(appId);
    if (!m) {
      m = emptyModel();
      this.models.set(appId, m);
    }
    return m;
  }
  /** Adopt an app: ensure a model and seed its current state snapshot. */
  adopt(app) {
    const m = this.ensureModel(app.id);
    try {
      m.state = app.getState();
    } catch {
    }
    return m;
  }
  /** Ask every `<aktion-app>` on the page to register with the hook. */
  discoverApps() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("aktion-app").forEach((el) => {
      try {
        el.connectDevtools?.();
      } catch {
      }
    });
  }
  onApp(action, app) {
    if (action === "register") {
      this.adopt(app);
      if (!this.selectedAppId) this.selectedAppId = app.id;
    } else if (this.selectedAppId === app.id) {
      const next = [...this.hook.apps.keys()].find((id) => id !== app.id) ?? null;
      this.selectedAppId = next;
    }
    this.scheduleRender();
  }
  onEvent(event) {
    if (this.paused) return;
    this.ingest(event, false);
    if (event.kind === "commit" && this.flashOnCommit && event.appId === this.selectedAppId) {
      this.flashApp(event.appId);
    }
    this.scheduleRender();
  }
  ingest(event, fromBuffer) {
    const model = this.ensureModel(event.appId);
    const t = eventTime(event);
    if (model.firstTime === null || t < model.firstTime) model.firstTime = t;
    switch (event.kind) {
      case "commit": {
        model.commits.push(event);
        if (model.commits.length > MAX_COMMITS) model.commits.shift();
        if (!fromBuffer || this.selectedCommitId === null) this.selectedCommitId = event.commitId;
        break;
      }
      case "state": {
        model.state = event.snapshot;
        for (const p of event.changedPaths) {
          const root = rootOf(p);
          model.changed.set(root, event.time);
          model.changeCounts.set(root, (model.changeCounts.get(root) ?? 0) + 1);
        }
        break;
      }
      case "effect": {
        model.effects.push(event);
        if (model.effects.length > MAX_EFFECT_EVENTS) model.effects.shift();
        break;
      }
    }
  }
  /* ---- render scheduling ---- */
  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      try {
        this.render();
      } catch (err) {
        console.error("[aktion-devtools] render failed", err);
      }
    });
  }
  currentApp() {
    if (!this.selectedAppId || !this.hook) return null;
    return this.hook.apps.get(this.selectedAppId) ?? null;
  }
  render() {
    if (this.hidden) return;
    if (this.tab === "state" && this.editingPath) {
      this.renderControls();
      this.renderTabs();
      return;
    }
    this.renderControls();
    this.renderTabs();
    this.renderBody();
  }
  /* ---- skeleton ---- */
  buildSkeleton() {
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = devtoolsStyles;
    this.controlsEl = h("div", { class: "controls", style: "display:flex;gap:6px;align-items:center;" });
    const header = h(
      "div",
      { class: "header" },
      h(
        "div",
        { class: "brand" },
        h("span", { class: "bolt" }, "⚡"),
        h("span", {}, "Aktion DevTools"),
        h("span", { class: "ver" }, `v${DEVTOOLS_UI_VERSION}`)
      ),
      h("div", { class: "spacer" }),
      this.controlsEl
    );
    this.makeDraggable(header);
    this.tabsEl = h("div", { class: "tabs" });
    this.bodyEl = h("div", { class: "panel-body" });
    const grip = h("div", { class: "resize", title: "Drag to resize" });
    this.makeResizable(grip);
    this.panelEl = h("div", { class: "panel" }, header, this.tabsEl, this.bodyEl, grip);
    this.root.append(style, this.panelEl);
    const w = 480, hgt = 560;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    this.style.left = `${Math.max(8, vw - w - 16)}px`;
    this.style.top = `${Math.max(8, vh - hgt - 16)}px`;
  }
  renderControls() {
    const apps = this.hook ? [...this.hook.apps.values()] : [];
    const select = h("select", {
      class: "app-select",
      title: "Inspected app",
      onchange: (e) => this.selectApp(e.target.value)
    });
    if (apps.length === 0) {
      select.appendChild(h("option", {}, "no app detected"));
      select.disabled = true;
    } else {
      for (const app of apps) {
        const opt = h("option", { value: app.id }, app.label);
        if (app.id === this.selectedAppId) opt.selected = true;
        select.appendChild(opt);
      }
    }
    const rec = h(
      "button",
      {
        class: `icon-btn ${this.paused ? "" : "is-on"}`,
        title: this.paused ? "Paused — click to resume recording" : "Recording — click to pause",
        onclick: () => {
          this.paused = !this.paused;
          this.scheduleRender();
        }
      },
      h("span", { class: `rec-dot ${this.paused ? "is-paused" : ""}` }),
      this.paused ? "Paused" : "Rec"
    );
    const collapse = h("button", {
      class: "icon-btn",
      title: this.collapsed ? "Expand" : "Collapse",
      onclick: () => {
        this.collapsed = !this.collapsed;
        this.panelEl.classList.toggle("is-collapsed", this.collapsed);
      }
    }, this.collapsed ? "▢" : "—");
    const close = h("button", { class: "icon-btn", title: "Close", onclick: () => this.close() }, "✕");
    this.controlsEl.replaceChildren(select, rec, collapse, close);
  }
  renderTabs() {
    const model = this.getModel();
    const defs = [
      ["state", "State", model ? Object.keys(model.state).length : 0],
      ["profiler", "Profiler", model ? model.commits.length : 0],
      ["effects", "Effects", model ? model.effects.length : 0]
    ];
    this.tabsEl.replaceChildren(
      ...defs.map(
        ([id, label, count]) => h(
          "button",
          {
            class: `tab ${this.tab === id ? "is-active" : ""}`,
            onclick: () => {
              this.tab = id;
              this.scheduleRender();
            }
          },
          label,
          h("span", { class: "count" }, String(count))
        )
      )
    );
  }
  renderBody() {
    const app = this.currentApp();
    const model = this.getModel();
    if (!app || !model) {
      this.bodyEl.replaceChildren(
        h(
          "div",
          { class: "empty" },
          h("p", {}, "No Aktion app detected on this page."),
          h("p", { class: "faint" }, "Mount an ", h("code", {}, "<aktion-app>"), " and it will appear here.")
        )
      );
      return;
    }
    if (this.tab === "state") this.renderStateTab(app, model);
    else if (this.tab === "profiler") this.renderProfilerTab(model);
    else this.renderEffectsTab(model);
  }
  /* ---------------------------------------------------------------------- */
  /*  State inspector                                                        */
  /* ---------------------------------------------------------------------- */
  renderStateTab(app, model) {
    const totalChanges = [...model.changeCounts.values()].reduce((a, b) => a + b, 0);
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h("input", {
        class: "search",
        placeholder: "Filter atoms…",
        value: this.stateFilter,
        oninput: (e) => {
          this.stateFilter = e.target.value;
          this.renderTreeOnly(app, model);
        }
      }),
      h("button", {
        class: `filter-chip ${this.stateSortByActivity ? "is-on" : ""}`,
        title: "Sort atoms by how often they change (reactivity heat)",
        onclick: () => {
          this.stateSortByActivity = !this.stateSortByActivity;
          this.renderTreeOnly(app, model);
        }
      }, "Sort by activity"),
      h("span", { class: "muted" }, `${Object.keys(model.state).length} atoms · ${fmtCount(totalChanges)} changes`)
    );
    const tree = h("div", { class: "tree" });
    this.fillTree(tree, app, model);
    this.bodyEl.replaceChildren(toolbar, tree);
  }
  /** Re-render only the tree (used by the filter box to keep its focus). */
  renderTreeOnly(app, model) {
    const tree = this.bodyEl.querySelector(".tree");
    if (!tree) return;
    tree.replaceChildren();
    this.fillTree(tree, app, model);
  }
  fillTree(tree, app, model) {
    const filter = this.stateFilter.trim().toLowerCase();
    const maxChanges = Math.max(1, ...model.changeCounts.values());
    const names = Object.keys(model.state).sort((a, b) => {
      if (this.stateSortByActivity) {
        const ca = model.changeCounts.get(a) ?? 0;
        const cb = model.changeCounts.get(b) ?? 0;
        if (cb !== ca) return cb - ca;
      }
      return a.localeCompare(b);
    });
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    let shown = 0;
    for (const name of names) {
      if (filter && !name.toLowerCase().includes(filter)) continue;
      shown += 1;
      this.appendRow(tree, app, model, name, name, model.state[name], 0, now, maxChanges);
    }
    if (shown === 0) {
      tree.appendChild(h("div", { class: "empty" }, filter ? "No atoms match the filter." : "No reactive state yet."));
    }
  }
  appendRow(container, app, model, path, key, value, depth, now, maxChanges) {
    const type = valueType(value);
    const expandable = isExpandable(value);
    const isOpen = this.expanded.has(path);
    const reserved = depth === 0 && RESERVED_ATOMS.has(key);
    const root = rootOf(path);
    const changedAt = model.changed.get(root);
    const justChanged = changedAt != null && now - changedAt < FLASH_MS;
    const changeCount = depth === 0 ? model.changeCounts.get(root) ?? 0 : 0;
    const twist = h("span", {
      class: `twist ${expandable ? "" : "is-leaf"}`,
      onclick: expandable ? () => {
        if (this.expanded.has(path)) this.expanded.delete(path);
        else this.expanded.add(path);
        this.renderTreeOnly(app, model);
      } : void 0
    }, expandable ? isOpen ? "▾" : "▸" : "•");
    const valueSpan = h("span", { class: `v t-${type}` }, expandable ? previewValue(value) : previewValue(value));
    const editable = !reserved && !expandable && type !== "function";
    if (editable) {
      valueSpan.title = "Click to edit";
      valueSpan.addEventListener("click", () => this.beginEdit(app, path, value, valueSpan));
    }
    const heat = changeCount > 0 ? h(
      "span",
      {
        class: "heat",
        title: `${changeCount} change${changeCount === 1 ? "" : "s"} this session`
      },
      h(
        "span",
        { class: "heat-bar" },
        h("span", { class: "heat-fill", style: `width:${Math.max(8, Math.round(changeCount / maxChanges * 100))}%` })
      ),
      h("span", { class: "heat-num" }, fmtCount(changeCount))
    ) : null;
    const row = h(
      "div",
      { class: `row ${justChanged ? "is-changed" : ""}`, style: `padding-left:${8 + depth * 14}px` },
      twist,
      h("span", { class: "k" }, key),
      h("span", { class: "sep" }, ": "),
      valueSpan,
      reserved ? h("span", { class: "tag" }, "reserved") : null,
      h("span", { class: "grow" }),
      heat
    );
    container.appendChild(row);
    if (expandable && isOpen) {
      for (const [childKey, childValue] of childEntries(value)) {
        this.appendRow(container, app, model, `${path}.${childKey}`, childKey, childValue, depth + 1, now, maxChanges);
      }
    }
  }
  beginEdit(app, path, value, valueSpan) {
    if (this.editingPath) return;
    this.editingPath = path;
    const initial = valueType(value) === "string" ? String(value) : previewValue(value);
    const input = h("input", { class: "edit-input", value: initial });
    const commit = (apply) => {
      if (this.editingPath !== path) return;
      this.editingPath = null;
      if (apply) {
        try {
          app.setState(path, parseEdit(input.value));
        } catch (err) {
          console.error("[aktion-devtools] edit failed", err);
        }
      }
      this.scheduleRender();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        commit(false);
      }
    });
    input.addEventListener("blur", () => commit(true));
    valueSpan.replaceWith(input);
    input.focus();
    input.select();
  }
  /* ---------------------------------------------------------------------- */
  /*  Render profiler                                                        */
  /* ---------------------------------------------------------------------- */
  renderProfilerTab(model) {
    this.currentApp();
    const last = model.commits[model.commits.length - 1];
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h(
        "span",
        { class: "muted" },
        `${model.commits.length} commit${model.commits.length === 1 ? "" : "s"}`,
        last ? ` · last ${fmtMs(last.duration)}` : ""
      ),
      h("div", { class: "grow" }),
      h("button", {
        class: `filter-chip ${this.flashOnCommit ? "is-on" : ""}`,
        title: "Outline the app element on every commit",
        onclick: () => {
          this.flashOnCommit = !this.flashOnCommit;
          this.scheduleRender();
        }
      }, "Flash on commit"),
      h("button", {
        class: "icon-btn",
        title: "Clear commits",
        onclick: () => {
          model.commits.length = 0;
          this.selectedCommitId = null;
          this.scheduleRender();
        }
      }, "Clear")
    );
    if (model.commits.length === 0) {
      this.bodyEl.replaceChildren(toolbar, h(
        "div",
        { class: "empty" },
        h("p", {}, "No commits recorded yet."),
        h("p", { class: "faint" }, "Interact with the app to capture renders.")
      ));
      return;
    }
    const maxDur = Math.max(...model.commits.map((c) => c.duration), 1e-3);
    const strip = h("div", { class: "commit-strip" });
    for (const c of model.commits) {
      const height = Math.max(3, Math.round(c.duration / maxDur * 52));
      strip.appendChild(h("div", {
        class: `commit-bar ${c.initial ? "is-initial" : c.fullRender ? "is-full" : ""} ${c.commitId === this.selectedCommitId ? "is-selected" : ""}`,
        style: `height:${height}px`,
        title: `#${c.commitId} · ${fmtMs(c.duration)} · ${c.rendered} rendered / ${c.memoized} memoized`,
        onclick: () => {
          this.selectedCommitId = c.commitId;
          this.scheduleRender();
        }
      }));
    }
    const selected = model.commits.find((c) => c.commitId === this.selectedCommitId) ?? last;
    const summary = this.renderPerfSummary(model);
    const insights = this.renderProfilerInsights(model);
    const hotAtoms = this.renderHotAtoms(model);
    const detail = this.renderCommitDetail(selected);
    const ranked = this.renderRankedComponents(model);
    const sections = [toolbar, summary, strip, insights, detail, hotAtoms, ranked].filter((n) => n != null);
    this.bodyEl.replaceChildren(...sections);
  }
  /** A compact grid of headline performance numbers for the session. */
  renderPerfSummary(model) {
    const commits = model.commits;
    const totalTime = commits.reduce((a, c) => a + c.duration, 0);
    const avg = commits.length ? totalTime / commits.length : 0;
    const slowest = commits.reduce((m, c) => !m || c.duration > m.duration ? c : m, null);
    let rendered = 0, memoized = 0, fullRenders = 0;
    for (const c of commits) {
      rendered += c.rendered;
      memoized += c.memoized;
      if (c.fullRender) fullRenders += 1;
    }
    const first = commits[0];
    const lastCommit = commits[commits.length - 1];
    const span = first && lastCommit ? lastCommit.startTime - first.startTime : 0;
    const rate = span > 0 ? commits.length / (span / 1e3) : 0;
    const stat = (label, value, opts = {}) => h(
      "div",
      { class: `stat ${opts.onclick ? "is-link" : ""}`, title: opts.title, onclick: opts.onclick },
      h("span", { class: `stat-val ${opts.tone ? `t-${opts.tone}` : ""}` }, value),
      h("span", { class: "stat-label" }, label)
    );
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Performance summary"),
      h(
        "div",
        { class: "stat-grid" },
        stat("commits", fmtCount(commits.length)),
        stat("total render", fmtMs(totalTime)),
        stat("avg / commit", fmtMs(avg), { tone: avg >= 8 ? "warn" : void 0 }),
        slowest ? stat("slowest", fmtMs(slowest.duration), {
          tone: slowest.duration >= 16 ? "warn" : void 0,
          title: `Commit #${slowest.commitId} — click to inspect`,
          onclick: () => {
            this.selectedCommitId = slowest.commitId;
            this.scheduleRender();
          }
        }) : stat("slowest", "—"),
        stat("memoized", fmtPct(memoized, rendered + memoized), {
          tone: rendered + memoized > 0 && memoized / (rendered + memoized) < 0.2 ? "warn" : "good",
          title: `${fmtCount(memoized)} skipped / ${fmtCount(rendered + memoized)} component evaluations`
        }),
        stat("full renders", fmtCount(fullRenders), {
          tone: fullRenders > Math.max(1, commits.length * 0.5) ? "warn" : void 0,
          title: "Commits that bypassed memoization and re-evaluated the whole tree"
        }),
        rate > 0 ? stat("commit rate", `${rate.toFixed(1)}/s`, { tone: rate >= 30 ? "warn" : void 0 }) : null
      )
    );
  }
  /**
   * Reactivity insight: which `$state` paths triggered the most commits.
   * Surfaces the "hot" atoms driving re-renders so an author can see what
   * their UI actually reacts to.
   */
  renderHotAtoms(model) {
    const counts = /* @__PURE__ */ new Map();
    for (const c of model.commits) {
      for (const p of c.changedPaths) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = Math.max(1, ...rows.map(([, n]) => n));
    const body = rows.length ? h("div", {}, ...rows.map(([path, n]) => h(
      "div",
      { class: "bar-row" },
      h("span", { class: "bar-row-label" }, path),
      h(
        "span",
        { class: "bar-row-track" },
        h("span", { class: "bar-row-fill", style: `width:${Math.round(n / max * 100)}%` })
      ),
      h("span", { class: "bar-row-num" }, `${fmtCount(n)} commit${n === 1 ? "" : "s"}`)
    ))) : h("div", { class: "faint", style: "font-size:11px" }, "No state-driven commits yet (forced / initial only).");
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Reactivity — state paths that triggered commits"),
      body
    );
  }
  /**
   * Heuristic insights: surface likely performance problems derived from the
   * captured commits (frequent re-renders, heavy bodies, low memoization).
   */
  renderProfilerInsights(model) {
    const aggs = /* @__PURE__ */ new Map();
    for (const commit of model.commits) {
      for (const c of commit.components) {
        let a = aggs.get(c.name);
        if (!a) {
          a = { name: c.name, kind: c.kind, renders: 0, memo: 0, total: 0, max: 0 };
          aggs.set(c.name, a);
        }
        if (c.phase === "memo") a.memo += 1;
        else {
          a.renders += 1;
          a.total += c.selfTime;
          a.max = Math.max(a.max, c.selfTime);
        }
      }
    }
    const insights = [];
    const commitCount = model.commits.length;
    for (const a of aggs.values()) {
      if (a.renders === 0) continue;
      const avg = a.total / a.renders;
      if (avg >= 8) {
        insights.push({ tone: "warn", icon: "▲", text: `${a.name} averages ${fmtMs(avg)} per render — consider splitting or memoizing its work.` });
      }
      if (a.kind === "user" && a.renders >= 12 && a.memo === 0 && commitCount >= 4) {
        insights.push({ tone: "warn", icon: "↻", text: `${a.name} re-rendered ${fmtCount(a.renders)}× and was never memoized — check its $state reads.` });
      }
    }
    const fullAfterInitial = model.commits.filter((c) => c.fullRender && !c.initial).length;
    if (fullAfterInitial >= 3) {
      insights.push({ tone: "warn", icon: "⛶", text: `${fmtCount(fullAfterInitial)} commits forced a full re-render (memoization disabled) — often async/timer/effect notifies.` });
    }
    if (insights.length === 0 && commitCount > 0) {
      insights.push({ tone: "good", icon: "✓", text: "No render hot-spots detected. Component bodies are cheap and memoization is doing its job." });
    }
    if (insights.length === 0) return null;
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Insights"),
      h("div", { class: "insights" }, ...insights.slice(0, 6).map((i) => h(
        "div",
        { class: `insight t-${i.tone}` },
        h("span", { class: "insight-ic" }, i.icon),
        h("span", {}, i.text)
      )))
    );
  }
  renderCommitDetail(commit) {
    const trigger = commit.initial ? "initial mount" : commit.changedPaths.length > 0 ? commit.changedPaths.join(", ") : "forced (async / effect / timer)";
    const meta = h(
      "div",
      { class: "kv" },
      h("span", {}, "commit ", h("b", {}, `#${commit.commitId}`)),
      h("span", {}, "duration ", h("b", { class: "mono" }, fmtMs(commit.duration))),
      h("span", {}, "rendered ", h("b", {}, String(commit.rendered))),
      h("span", {}, "memoized ", h("b", {}, String(commit.memoized))),
      h("span", {}, commit.fullRender ? h("span", { class: "chip amber" }, "full render") : h("span", { class: "chip blue" }, "incremental"))
    );
    const triggerLine = h(
      "div",
      { class: "kv" },
      h("span", {}, "trigger ", h("b", { class: "mono" }, trigger))
    );
    const flame = h("div", {});
    if (commit.components.length === 0) {
      flame.appendChild(h("div", { class: "faint", style: "font-size:11px" }, "No component instances in this commit (primitive root)."));
    } else {
      const maxSelf = Math.max(...commit.components.map((c) => c.selfTime), 1e-3);
      const minDepth = Math.min(...commit.components.map((c) => c.depth));
      for (const c of commit.components) {
        flame.appendChild(this.renderFlameRow(c, maxSelf, minDepth));
      }
    }
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Commit detail"),
      meta,
      triggerLine,
      flame
    );
  }
  renderFlameRow(c, maxSelf, minDepth) {
    const indent = (c.depth - minDepth) * 12;
    const widthPct = c.phase === "memo" ? 22 : Math.max(6, Math.round(c.selfTime / maxSelf * 100));
    const label = `${c.kind === "user" ? "" : "▪ "}${c.name}`;
    const bar = h("div", {
      class: `flame-bar p-${c.phase}`,
      style: `width:${widthPct}%`,
      title: `${c.name} — ${c.phase} — ${fmtMs(c.selfTime)}
${c.reason}${c.deps && c.deps.length ? `
deps: ${c.deps.join(", ")}` : ""}`
    }, label);
    return h(
      "div",
      { class: "flame-row", style: `padding-left:${indent}px` },
      h("div", { class: "flame-bar-wrap" }, bar),
      h("span", { class: "flame-time" }, c.phase === "memo" ? "memo" : fmtMs(c.selfTime))
    );
  }
  renderRankedComponents(model) {
    const aggs = /* @__PURE__ */ new Map();
    for (const commit of model.commits) {
      for (const c of commit.components) {
        let a = aggs.get(c.name);
        if (!a) {
          a = { name: c.name, kind: c.kind, renders: 0, memo: 0, total: 0, max: 0 };
          aggs.set(c.name, a);
        }
        if (c.phase === "memo") a.memo += 1;
        else {
          a.renders += 1;
          a.total += c.selfTime;
          a.max = Math.max(a.max, c.selfTime);
        }
      }
    }
    const sortKey = this.rankedSort.key;
    const dir = this.rankedSort.dir;
    const valueOf = (r) => {
      switch (sortKey) {
        case "name":
          return r.name;
        case "renders":
          return r.renders;
        case "memo":
          return r.memo;
        case "avg":
          return r.renders ? r.total / r.renders : 0;
        case "max":
          return r.max;
        default:
          return r.total;
      }
    };
    const rows = [...aggs.values()].sort((a, b) => {
      const va = valueOf(a), vb = valueOf(b);
      if (typeof va === "string" || typeof vb === "string") {
        return dir * String(va).localeCompare(String(vb));
      }
      return dir * (vb - va) * -1;
    });
    const maxTotal = Math.max(...rows.map((r) => r.total), 1e-3);
    const sortFor = (key) => () => {
      if (this.rankedSort.key === key) this.rankedSort.dir = this.rankedSort.dir === 1 ? -1 : 1;
      else this.rankedSort = { key, dir: key === "name" ? 1 : -1 };
      this.scheduleRender();
    };
    const arrow = (key) => sortKey === key ? dir === 1 ? " ▲" : " ▼" : "";
    const th = (key, label, right = false) => h("th", { class: "sortable", style: right ? "text-align:right" : "", onclick: sortFor(key) }, label + arrow(key));
    const table = h(
      "table",
      { class: "dt-table" },
      h("thead", {}, h(
        "tr",
        {},
        th("name", "Component"),
        h("th", {}, "Type"),
        th("renders", "Renders", true),
        th("memo", "Memo", true),
        th("total", "Total", true),
        th("avg", "Avg", true),
        th("max", "Max", true)
      )),
      h("tbody", {}, ...rows.map(
        (r) => h(
          "tr",
          {},
          h("td", { class: "name" }, r.name),
          h("td", {}, h("span", { class: `chip ${r.kind === "user" ? "purple" : "grey"}` }, r.kind)),
          h("td", { class: "num" }, String(r.renders)),
          h("td", { class: "num" }, String(r.memo)),
          h(
            "td",
            { class: "num bar-cell" },
            h("span", { class: "barfill", style: `width:${Math.round(r.total / maxTotal * 100)}%` }),
            h("span", {}, fmtMs(r.total))
          ),
          h("td", { class: "num" }, r.renders ? fmtMs(r.total / r.renders) : "—"),
          h("td", { class: "num" }, r.renders ? fmtMs(r.max) : "—")
        )
      ))
    );
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Components — ranked by self time"),
      rows.length ? table : h("div", { class: "faint", style: "font-size:11px" }, "No component renders captured.")
    );
  }
  /* ---------------------------------------------------------------------- */
  /*  Effect timeline                                                        */
  /* ---------------------------------------------------------------------- */
  renderEffectsTab(model) {
    const phases = ["mount", "run", "cleanup", "unmount", "error"];
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h("div", { class: "filters" }, ...phases.map(
        (p) => h("button", {
          class: `filter-chip ${this.phaseFilter.has(p) ? "is-on" : ""}`,
          onclick: () => {
            if (this.phaseFilter.has(p)) this.phaseFilter.delete(p);
            else this.phaseFilter.add(p);
            this.scheduleRender();
          }
        }, p)
      )),
      h("div", { class: "grow" }),
      h("button", {
        class: `filter-chip ${this.effectView === "timeline" ? "is-on" : ""}`,
        title: "Toggle the visual timeline",
        onclick: () => {
          this.effectView = this.effectView === "timeline" ? "log" : "timeline";
          this.scheduleRender();
        }
      }, this.effectView === "timeline" ? "Timeline" : "Log"),
      h("button", {
        class: "icon-btn",
        title: "Clear effect events",
        onclick: () => {
          model.effects.length = 0;
          this.scheduleRender();
        }
      }, "Clear")
    );
    if (model.effects.length === 0) {
      this.bodyEl.replaceChildren(toolbar, h(
        "div",
        { class: "empty" },
        h("p", {}, "No effects observed yet."),
        h("p", { class: "faint" }, "Effects appear as they mount, run, and clean up.")
      ));
      return;
    }
    const summary = this.renderEffectSummary(model);
    const insights = this.renderEffectInsights(model);
    const viz = this.effectView === "timeline" ? this.renderEffectTimeline(model) : this.renderEffectLog(model);
    const sections = [toolbar, summary, insights, this.renderEffectLanes(model), viz].filter((n) => n != null);
    this.bodyEl.replaceChildren(...sections);
  }
  /** Headline counters for the effect session. */
  renderEffectSummary(model) {
    const keys = /* @__PURE__ */ new Set();
    let runs = 0, total = 0, cleanups = 0, errors = 0;
    for (const e of model.effects) {
      keys.add(e.effectKey);
      if (e.phase === "run") {
        runs += 1;
        total += e.duration ?? 0;
      } else if (e.phase === "cleanup") cleanups += 1;
      else if (e.phase === "error") errors += 1;
    }
    const stat = (label, value, tone) => h(
      "div",
      { class: "stat" },
      h("span", { class: `stat-val ${tone ? `t-${tone}` : ""}` }, value),
      h("span", { class: "stat-label" }, label)
    );
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Effect summary"),
      h(
        "div",
        { class: "stat-grid" },
        stat("effects", fmtCount(keys.size)),
        stat("runs", fmtCount(runs)),
        stat("total run", fmtMs(total)),
        stat("avg run", fmtMs(runs ? total / runs : 0)),
        stat("cleanups", fmtCount(cleanups)),
        stat("errors", fmtCount(errors), errors > 0 ? "bad" : "good")
      )
    );
  }
  /** Re-run thrash + error detection for effects. */
  renderEffectInsights(model) {
    const aggs = /* @__PURE__ */ new Map();
    for (const e of model.effects) {
      let a = aggs.get(e.effectKey);
      if (!a) {
        a = { label: e.label, runs: 0, errors: 0, total: 0 };
        aggs.set(e.effectKey, a);
      }
      if (e.phase === "run") {
        a.runs += 1;
        a.total += e.duration ?? 0;
      } else if (e.phase === "error") a.errors += 1;
    }
    const insights = [];
    for (const a of aggs.values()) {
      if (a.errors > 0) {
        insights.push({ tone: "bad", icon: "✖", text: `${a.label} threw ${fmtCount(a.errors)}× — check the effect body.` });
      }
      if (a.runs >= 20) {
        insights.push({ tone: "warn", icon: "↻", text: `${a.label} ran ${fmtCount(a.runs)}× — a hot trigger; confirm its dependency list is intentional.` });
      } else if (a.runs >= 1 && a.total / Math.max(1, a.runs) >= 6) {
        insights.push({ tone: "warn", icon: "▲", text: `${a.label} averages ${fmtMs(a.total / a.runs)} per run — heavy work in an effect body.` });
      }
    }
    if (insights.length === 0) return null;
    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Insights"),
      h("div", { class: "insights" }, ...insights.slice(0, 6).map((i) => h(
        "div",
        { class: `insight t-${i.tone}` },
        h("span", { class: "insight-ic" }, i.icon),
        h("span", {}, i.text)
      )))
    );
  }
  /**
   * A visual, time-positioned timeline: one lane per effect, with a marker
   * for every event placed along a shared time axis and coloured by phase.
   * Makes overlapping runs, cleanup→run pairing, and bursts obvious at a
   * glance in a way the chronological log can't.
   */
  renderEffectTimeline(model) {
    const base = model.firstTime ?? 0;
    const last = model.effects.reduce((m, e) => Math.max(m, e.time), base);
    const span = Math.max(1, last - base);
    const order = [];
    const byKey = /* @__PURE__ */ new Map();
    for (const e of model.effects) {
      let lane = byKey.get(e.effectKey);
      if (!lane) {
        lane = { label: e.label, instance: e.instanceKey != null, events: [] };
        byKey.set(e.effectKey, lane);
        order.push(e.effectKey);
      }
      lane.events.push(e);
    }
    const wrap = h("div", { class: "section", style: "padding:0" });
    wrap.appendChild(h(
      "div",
      { class: "tl-head" },
      h("span", { class: "section-title", style: "margin:0" }, `Timeline · ${fmtRel(span)} span`),
      h("span", { class: "tl-axis" }, "0", h("span", { class: "tl-axis-end" }, fmtRel(span)))
    ));
    for (const key of order) {
      const lane = byKey.get(key);
      const track = h("div", { class: "tl-track" });
      for (const e of lane.events) {
        if (!this.phaseFilter.has(e.phase)) continue;
        const leftPct = (e.time - base) / span * 100;
        track.appendChild(h("span", {
          class: `tl-dot ${PHASE_CHIP[e.phase] ?? "grey"}`,
          style: `left:${Math.min(99, Math.max(0, leftPct))}%`,
          title: `${e.phase} · ${e.reason}${e.duration != null ? ` · ${fmtMs(e.duration)}` : ""} · ${fmtRel(e.time - base)}`
        }));
      }
      wrap.appendChild(h(
        "div",
        { class: "tl-row" },
        h(
          "span",
          { class: "tl-name" },
          lane.label,
          lane.instance ? h("span", { class: "chip purple", style: "margin-left:5px" }, "inst") : null
        ),
        track
      ));
    }
    return wrap;
  }
  renderEffectLanes(model) {
    const lanes = /* @__PURE__ */ new Map();
    for (const e of model.effects) {
      let lane = lanes.get(e.effectKey);
      if (!lane) {
        lane = { key: e.effectKey, label: e.label, triggers: e.triggers, runs: 0, total: 0, lastReason: e.reason, instance: e.instanceKey != null };
        lanes.set(e.effectKey, lane);
      }
      if (e.phase === "run") {
        lane.runs += 1;
        lane.total += e.duration ?? 0;
        lane.lastReason = e.reason;
      }
    }
    const list = [...lanes.values()].sort((a, b) => b.runs - a.runs);
    const wrap = h("div", { class: "section", style: "padding:0" });
    wrap.appendChild(h("p", { class: "section-title", style: "padding:8px 10px 0" }, `Effects (${list.length})`));
    for (const lane of list) {
      wrap.appendChild(h(
        "div",
        { class: "lane" },
        h("span", { class: "lane-name" }, lane.label),
        lane.instance ? h("span", { class: "chip purple", style: "flex:0 0 auto" }, "instance") : null,
        h("span", { class: "lane-trig" }, lane.triggers),
        h("span", { class: "lane-stat" }, `${lane.runs} run${lane.runs === 1 ? "" : "s"} · ${fmtMs(lane.total)}`)
      ));
    }
    return wrap;
  }
  renderEffectLog(model) {
    const base = model.firstTime ?? 0;
    const filtered = model.effects.filter((e) => this.phaseFilter.has(e.phase));
    const rows = filtered.slice(-250).reverse();
    const wrap = h("div", { class: "section", style: "padding:0;border-bottom:none" });
    wrap.appendChild(h("p", { class: "section-title", style: "padding:8px 10px 0" }, "Timeline"));
    if (rows.length === 0) {
      wrap.appendChild(h("div", { class: "faint", style: "font-size:11px;padding:0 10px 10px" }, "No events match the active filters."));
      return wrap;
    }
    for (const e of rows) {
      wrap.appendChild(h(
        "div",
        { class: "log-row" },
        h("span", { class: "t" }, fmtRel(e.time - base)),
        h("span", { class: "ph" }, h("span", { class: `chip ${PHASE_CHIP[e.phase] ?? "grey"}` }, e.phase)),
        h("span", { class: "lbl" }, e.label),
        h(
          "span",
          { class: "rsn" },
          e.reason,
          e.phase === "run" && e.duration != null ? ` · ${fmtMs(e.duration)}` : "",
          e.phase === "cleanup" && e.cleanups != null ? ` · ${e.cleanups}×` : "",
          e.error ? ` · ${e.error}` : ""
        )
      ));
    }
    return wrap;
  }
  /* ---------------------------------------------------------------------- */
  /*  Highlight + drag/resize                                                */
  /* ---------------------------------------------------------------------- */
  flashApp(appId) {
    const app = this.hook?.apps.get(appId);
    if (!app) return;
    const el = app.element;
    const prev = el.style.outline;
    el.style.outline = "2px solid rgba(124,156,255,0.9)";
    el.style.outlineOffset = "1px";
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      el.style.outline = prev;
      el.style.outlineOffset = "";
    }, 140);
  }
  makeDraggable(handle) {
    let startX = 0, startY = 0, originLeft = 0, originTop = 0, dragging = false;
    const onDown = (e) => {
      if (e.target.closest("button, select, input")) return;
      dragging = true;
      handle.classList.add("is-dragging");
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      e.preventDefault();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    const onMove = (e) => {
      if (!dragging) return;
      this.style.left = `${Math.max(0, originLeft + (e.clientX - startX))}px`;
      this.style.top = `${Math.max(0, originTop + (e.clientY - startY))}px`;
    };
    const onUp = () => {
      dragging = false;
      handle.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    handle.addEventListener("mousedown", onDown);
  }
  makeResizable(grip) {
    let startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    const onDown = (e) => {
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.panelEl.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      e.preventDefault();
      e.stopPropagation();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    const onMove = (e) => {
      if (!resizing) return;
      this.panelEl.style.width = `${Math.max(320, startW + (e.clientX - startX))}px`;
      this.panelEl.style.height = `${Math.max(240, startH + (e.clientY - startY))}px`;
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    grip.addEventListener("mousedown", onDown);
  }
}
__publicField(AktionDevtoolsElement, "tagName", "aktion-devtools");
function eventTime(event) {
  if (event.kind === "commit") return event.startTime;
  if (event.kind === "state") return event.time;
  return event.time;
}
function rootOf(path) {
  const dot = path.indexOf(".");
  return dot < 0 ? path : path.slice(0, dot);
}
function defineDevtoolsElement() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(AktionDevtoolsElement.tagName)) {
    customElements.define(AktionDevtoolsElement.tagName, AktionDevtoolsElement);
  }
}
function mountDevtools(options = {}) {
  const hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);
  defineDevtoolsElement();
  const element = document.createElement(AktionDevtoolsElement.tagName);
  (options.container ?? document.body).appendChild(element);
  if (options.appId) element.selectApp(options.appId);
  if (options.open === false) element.close();
  return {
    element,
    hook,
    open: () => element.open(),
    close: () => element.close(),
    toggle: () => element.toggle(),
    selectApp: (id) => element.selectApp(id),
    destroy: () => element.remove()
  };
}
function isDevtoolsInstalled() {
  return getDevtoolsHook() !== void 0;
}
defineDevtoolsElement();
export {
  AktionDevtoolsElement,
  DEVTOOLS_PROTOCOL_VERSION,
  HOOK_KEY,
  defineDevtoolsElement,
  getDevtoolsHook,
  installDevtoolsHook,
  isDevtoolsActive,
  isDevtoolsInstalled,
  mountDevtools
};
//# sourceMappingURL=devtools.js.map
