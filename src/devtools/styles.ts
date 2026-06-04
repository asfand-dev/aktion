/**
 * Styles for the `<aktion-devtools>` panel. Injected once into the panel's
 * own shadow root so it is fully isolated from both the host page and the
 * inspected `<aktion-app>` — the inspector can never be restyled by the app
 * it is inspecting, and vice versa.
 */
export const devtoolsStyles = `
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
