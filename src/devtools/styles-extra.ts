/**
 * Styles for the tabs added in panel 0.6 — Overview, Inspect, Network, Console,
 * Routes, Data, Theme, Source, Test, Timeline, Settings — plus the chrome they
 * share.
 *
 * Split from `styles.ts` only for file size; the two are concatenated into one
 * stylesheet at import time. Conventions held across every tab, because a
 * debugger with fourteen tabs is only usable if they look like one tool:
 *
 *   - `.section` wraps a titled block; `.section.is-flush` drops its padding for
 *     a full-bleed list.
 *   - `.chip` is a label, `.filter-chip` is a toggle, `.icon-btn` is an action.
 *   - Monospace is reserved for things the author wrote: atoms, paths, code.
 *   - The tone classes (`t-good` / `t-warn` / `t-bad`) mean the same everywhere.
 */

export const devtoolsExtraStyles = `
/* ---- Shared layout ---- */
.sec-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.sec-head .section-title { margin: 0; }
.section.is-flush { padding: 0; }
.section.is-flush .sec-head { padding: 8px 10px 0; }
.grow { flex: 1 1 auto; min-width: 0; }
.pad-sm { padding: 8px 10px; }
.wrap { white-space: pre-wrap; word-break: break-word; }
.mono { font-family: var(--dt-mono); }
code.mono { background: var(--dt-bg-inset); padding: 0 3px; border-radius: 3px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px; }
.chip.is-link, .inline-link { cursor: pointer; appearance: none; border: none; }
.chip.is-link:hover { filter: brightness(1.25); }
.inline-link {
  background: none;
  color: var(--dt-accent);
  font: inherit;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11px;
  border-top: 1px solid var(--dt-border);
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
}
.banner.t-amber { border-left: 3px solid var(--dt-amber); }
.banner.t-red { border-left: 3px solid var(--dt-red); color: var(--dt-red); }
.banner.t-purple { border-left: 3px solid var(--dt-purple); }
.legend { display: flex; gap: 10px; padding: 4px 10px 8px; font-size: 10px; color: var(--dt-text-faint); }
.legend .sw { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 2px; background: var(--dt-blue); }
.legend .sw.is-initial { background: var(--dt-green); }
.legend .sw.is-full { background: var(--dt-amber); }
.swatch {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-right: 5px;
  border-radius: 3px;
  border: 1px solid var(--dt-border-strong);
  vertical-align: -1px;
}
.slider { flex: 1; accent-color: var(--dt-accent); }
.travel-row { display: flex; align-items: center; gap: 8px; }
.row-tail { display: inline-flex; align-items: center; gap: 4px; }

/* ---- Definition lists (detail panes) ---- */
.deflist {
  display: grid;
  grid-template-columns: minmax(90px, 34%) 1fr;
  gap: 2px 10px;
  font-size: 11px;
}
.deflist .dt { color: var(--dt-text-faint); font-family: var(--dt-mono); }
.deflist .dd { color: var(--dt-text); overflow-wrap: anywhere; }

/* ---- Disclosure ---- */
.disc { border-bottom: 1px solid var(--dt-border); }
.disc-head { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; font-size: 11px; }
.disc-head:hover { background: rgba(255,255,255,0.03); }
.disc-label { font-family: var(--dt-mono); }
.disc-body { padding: 0 10px 8px 24px; }

/* ---- Tables ---- */
.dt-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dt-bg-raised);
  white-space: nowrap;
}
.dt-table tbody tr.is-selected { background: var(--dt-accent-soft); }
.dt-table td { vertical-align: top; }

/* ---- Component tree (Inspect) ---- */
.comp-tree { max-height: 320px; overflow: auto; }
.ct-row { cursor: pointer; gap: 5px; min-height: var(--dt-row); }
.ct-row.is-selected { background: var(--dt-accent-soft); }
.ct-row.is-unmounted { opacity: 0.55; }
.ct-name { font-family: var(--dt-mono); color: var(--dt-text-dim); }
.ct-name.is-user { color: var(--dt-purple); font-weight: 600; }
.ct-key { font-size: 9.5px; color: var(--dt-text-faint); font-family: var(--dt-mono); }
.ct-meta { font-size: 9.5px; color: var(--dt-text-faint); font-variant-numeric: tabular-nums; }
.ct-time {
  flex: 0 0 52px;
  text-align: right;
  font-family: var(--dt-mono);
  font-size: 10px;
  color: var(--dt-text-faint);
}

/* ---- Detail header + breadcrumbs ---- */
.crumbs { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; margin-bottom: 6px; }
.crumb {
  appearance: none;
  background: none;
  border: none;
  color: var(--dt-text-faint);
  font: 500 10.5px var(--dt-mono);
  cursor: pointer;
  padding: 0;
}
.crumb:hover { color: var(--dt-accent); }
.crumb.is-current { color: var(--dt-text); font-weight: 700; cursor: default; }
.crumb-sep { color: var(--dt-text-faint); font-size: 10px; }
.detail-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.detail-title { font-weight: 700; font-size: 12.5px; }

/* ---- Prop / slot rows ---- */
.prop-list { display: flex; flex-direction: column; }
.prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
  min-height: var(--dt-row);
}
.prop-row.is-overridden { background: rgba(240,179,94,0.08); }
.prop-row.is-add { gap: 5px; padding-top: 6px; }
.prop-name { font-family: var(--dt-mono); color: var(--dt-purple); flex: 0 0 auto; }
.v.is-editable { cursor: text; border-bottom: 1px dashed var(--dt-border-strong); }
.v.is-editable:hover { border-bottom-color: var(--dt-accent); }
.v.is-readonly { opacity: 0.75; }

/* ---- Box model ---- */
.bm-wrap { padding: 6px 0; font-size: 9.5px; font-family: var(--dt-mono); }
.bm {
  position: relative;
  padding: 15px;
  text-align: center;
  border: 1px dashed var(--dt-border-strong);
  border-radius: 3px;
}
.bm-label {
  position: absolute;
  top: 1px;
  left: 4px;
  font-size: 8.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--dt-text-faint);
}
.bm-t { position: absolute; top: 1px; left: 50%; transform: translateX(-50%); }
.bm-b { position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%); }
.bm-l { position: absolute; left: 3px; top: 50%; transform: translateY(-50%); }
.bm-r { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); }
.bm-margin { background: rgba(246,178,107,0.16); }
.bm-border { background: rgba(255,229,153,0.16); }
.bm-padding { background: rgba(147,196,125,0.16); }
.bm-content {
  background: rgba(111,168,220,0.22);
  padding: 10px 6px;
  color: var(--dt-text);
  border: 1px solid var(--dt-border);
  border-radius: 3px;
}

/* ---- Code ---- */
.code-block {
  font-family: var(--dt-mono);
  font-size: 10.5px;
  line-height: 1.5;
  max-height: 340px;
  overflow: auto;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
}
.code-line { display: flex; gap: 8px; padding: 0 4px; white-space: pre; }
.code-line:hover { background: rgba(255,255,255,0.04); }
.code-line.is-focus { background: var(--dt-accent-soft); }
.code-line.has-marker.t-bad { background: rgba(248,113,113,0.12); }
.code-line.has-marker.t-warn { background: rgba(240,179,94,0.12); }
.code-gutter {
  flex: 0 0 34px;
  text-align: right;
  color: var(--dt-text-faint);
  user-select: none;
  border-right: 1px solid var(--dt-border);
  padding-right: 5px;
}
.code-line.has-marker .code-gutter { color: var(--dt-red); font-weight: 700; }
.code-text { flex: 1; color: var(--dt-text); }
.code-pre {
  margin: 0;
  padding: 7px 9px;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  color: var(--dt-text);
}
.source-editor {
  width: 100%;
  min-height: 260px;
  resize: vertical;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  line-height: 1.5;
  padding: 8px;
  background: var(--dt-bg-inset);
  color: var(--dt-text);
  border: 1px solid var(--dt-border-strong);
  border-radius: 6px;
  tab-size: 2;
}
.source-editor:focus { outline: none; border-color: var(--dt-accent); }

/* ---- Outline ---- */
.outline { display: flex; flex-direction: column; max-height: 200px; overflow: auto; }
.outline-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: var(--dt-text);
  font: 500 11px var(--dt-sans);
  padding: 2px;
  cursor: pointer;
  text-align: left;
}
.outline-row:hover { background: rgba(255,255,255,0.04); }

/* ---- Network ---- */
.wf-track {
  position: relative;
  display: block;
  height: 8px;
  min-width: 60px;
  background: var(--dt-bg-inset);
  border-radius: 4px;
  overflow: hidden;
}
.wf-bar { position: absolute; top: 0; height: 100%; border-radius: 4px; background: var(--dt-blue); }
.wf-bar.t-red { background: var(--dt-red); }
.wf-bar.t-purple { background: var(--dt-purple); }
.wf-bar.t-cyan { background: var(--dt-cyan); }
.rule-list { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.rule {
  border: 1px solid var(--dt-border);
  border-radius: 7px;
  background: var(--dt-bg-inset);
  padding: 6px;
}
.rule.is-off { opacity: 0.55; }
.rule-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rule-body { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.rule-body-input {
  flex: 1 1 260px;
  min-height: 54px;
  resize: vertical;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  padding: 5px 6px;
  background: var(--dt-bg);
  color: var(--dt-text);
  border: 1px solid var(--dt-border);
  border-radius: 5px;
}
.rule-body-input:focus { outline: none; border-color: var(--dt-accent); }

/* ---- Console ---- */
.log-list { display: flex; flex-direction: column; }
.console-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 2px 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-wrap: wrap;
}
.console-row:hover { background: rgba(255,255,255,0.03); }
.console-row.t-error { background: rgba(248,113,113,0.08); }
.console-row.t-warn { background: rgba(240,179,94,0.07); }
.console-row .t { flex: 0 0 74px; font-family: var(--dt-mono); font-size: 9.5px; color: var(--dt-text-faint); }
.console-row .ph { flex: 0 0 52px; }
.console-text { flex: 1; font-family: var(--dt-mono); white-space: pre-wrap; word-break: break-word; }
.console-count {
  flex: 0 0 auto;
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  color: var(--dt-text-faint);
}
.console-stack { flex: 0 0 100%; font-size: 10px; color: var(--dt-text-faint); }
.console-stack pre { margin: 3px 0 0; white-space: pre-wrap; font-family: var(--dt-mono); }

/* ---- REPL ---- */
.repl-log { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; max-height: 200px; overflow: auto; }
.repl-entry { border-left: 2px solid var(--dt-border); padding-left: 6px; }
.repl-in, .repl-out { display: flex; gap: 6px; font-size: 11px; align-items: baseline; }
.repl-out pre {
  margin: 0;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dt-green);
}
.repl-out.is-error pre { color: var(--dt-red); }
.repl-caret { color: var(--dt-text-faint); font-family: var(--dt-mono); }
.repl-row { display: flex; align-items: center; gap: 6px; }
.repl-input {
  flex: 1;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  color: var(--dt-text);
  font-family: var(--dt-mono);
  font-size: 11px;
  padding: 4px 7px;
}
.repl-input:focus { outline: none; border-color: var(--dt-accent); }

/* ---- Routes ---- */
.route-list { display: flex; flex-direction: column; }
.route-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.route-row.is-active { background: rgba(90,209,155,0.09); }

/* ---- Data ---- */
.data-row { border-bottom: 1px solid var(--dt-border); }
.data-head { display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; }
.data-head:hover { background: rgba(255,255,255,0.03); }
.data-body { padding: 0 10px 8px 24px; display: flex; flex-direction: column; gap: 6px; }

/* ---- Theme tokens ---- */
.token-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px; }
.token-row {
  border: 1px solid var(--dt-border);
  border-radius: 7px;
  background: var(--dt-bg-inset);
  padding: 5px 7px;
}
.token-row.is-overridden { border-color: var(--dt-amber); }
.token-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.token-name { font-family: var(--dt-mono); font-size: 10.5px; color: var(--dt-text); }
.token-body { display: flex; align-items: center; gap: 5px; }
.token-input {
  flex: 1;
  min-width: 0;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  border-radius: 5px;
  color: var(--dt-text);
  font-family: var(--dt-mono);
  font-size: 10.5px;
  padding: 2px 5px;
}
.token-input:focus { outline: none; border-color: var(--dt-accent); }
.token-picker {
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--dt-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}
.contrast-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px; }
.contrast-sample {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--dt-border-strong);
  font-weight: 700;
  font-size: 11px;
}
.contrast-label { flex: 0 0 110px; }

/* ---- Test tab ---- */
.step-list { display: flex; flex-direction: column; }
.step-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.step-index {
  flex: 0 0 18px;
  text-align: right;
  color: var(--dt-text-faint);
  font-family: var(--dt-mono);
  font-size: 10px;
}
.step-label { font-family: var(--dt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-query { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; }
.match-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
  cursor: pointer;
}
.match-row:hover { background: rgba(255,255,255,0.04); }
.match-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- Timeline list ---- */
.tlist { display: flex; flex-direction: column; }
.tlist-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  border-left: 2px solid transparent;
}
.tlist-row.is-link { cursor: pointer; }
.tlist-row:hover { background: rgba(255,255,255,0.035); }
.tlist-row.t-red { border-left-color: var(--dt-red); }
.tlist-row.t-amber { border-left-color: var(--dt-amber); }
.tlist-row.t-green { border-left-color: var(--dt-green); }
.tlist-row.t-blue { border-left-color: var(--dt-blue); }
.tlist-row.t-purple { border-left-color: var(--dt-purple); }
.tlist-row.t-cyan { border-left-color: var(--dt-cyan); }
.tlist-row.t-grey { border-left-color: var(--dt-grey); }
.tlist-time {
  flex: 0 0 60px;
  text-align: right;
  font-family: var(--dt-mono);
  font-size: 9.5px;
  color: var(--dt-text-faint);
}
.tlist-kind { flex: 0 0 68px; }
.tlist-label { flex: 0 0 32%; font-family: var(--dt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tlist-detail { flex: 1; color: var(--dt-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tlist-dur { font-family: var(--dt-mono); font-size: 10px; color: var(--dt-text-faint); }
.tlist-gap { font-family: var(--dt-mono); font-size: 9.5px; color: var(--dt-amber); }

/* ---- Settings ---- */
.switch-list { display: flex; flex-direction: column; gap: 6px; }
.switch-row { display: flex; align-items: flex-start; gap: 8px; }
.switch-hint { flex: 1; font-size: 10.5px; color: var(--dt-text-faint); line-height: 1.45; }

/* ---- Overview quick links ---- */
.quick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.quick {
  appearance: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 7px 9px;
  border: 1px solid var(--dt-border);
  border-radius: 7px;
  background: var(--dt-bg-inset);
  cursor: pointer;
  font-family: var(--dt-sans);
}
.quick:hover { border-color: var(--dt-accent); }
.quick-title { font-size: 11.5px; font-weight: 700; color: var(--dt-text); }
.quick-hint { font-size: 10px; color: var(--dt-text-faint); line-height: 1.4; }

/* ---- Insight interactions ---- */
.insight.is-link { cursor: pointer; }
.insight.is-link:hover { border-color: var(--dt-accent); }
.insight.is-selected { border-color: var(--dt-accent); background: var(--dt-accent-soft); }
.insight.t-good { border-color: rgba(90,209,155,0.35); }

/* ---- Effect timeline lanes ---- */
.tl-row { cursor: pointer; }
.tl-row.is-selected { background: var(--dt-accent-soft); }
.tl-dot.amber { background: var(--dt-amber); }
.tl-dot.cyan { background: var(--dt-cyan); }

/* ---- Flamegraph reason column ---- */
.flame-reason {
  flex: 0 0 28%;
  font-size: 9.5px;
  color: var(--dt-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Button tones ---- */
.icon-btn.t-good { color: var(--dt-green); border-color: rgba(90,209,155,0.4); }
.icon-btn.t-warn { color: var(--dt-amber); border-color: rgba(240,179,94,0.4); }
.icon-btn.t-amber { color: var(--dt-amber); border-color: rgba(240,179,94,0.4); }
.icon-btn.t-purple { color: var(--dt-purple); border-color: rgba(192,140,240,0.4); }
.icon-btn.t-bad { color: var(--dt-red); border-color: rgba(248,113,113,0.4); }
.icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ---- Bar rows ---- */
.bar-row.is-link { cursor: pointer; }
.bar-row.is-link:hover .bar-row-label { color: var(--dt-accent); }
.bar-row-fill.t-bad { background: var(--dt-red); }
.bar-row-fill.t-warn { background: var(--dt-amber); }
`;

/**
 * Styles for the chrome added in the reliability/UX pass: the command palette,
 * the shortcut sheet, the first-run tips, the Inspect split layout, watch rows,
 * and the state diff.
 *
 * Kept in a second string only so neither block becomes unreadable; both are
 * concatenated into the one stylesheet the panel adopts.
 */
export const devtoolsPaletteStyles = `
/* ---- Command palette + shortcut sheet ---- */
.pal-host { position: absolute; inset: 0; z-index: 5; }
.pal-host[hidden] { display: none; }
.pal-scrim {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 48px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
}
.pal-box {
  width: min(460px, 92%);
  max-height: 70%;
  display: flex;
  flex-direction: column;
  background: var(--dt-bg-raised);
  border: 1px solid var(--dt-border-strong);
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.pal-box.is-help { padding: 12px 14px; gap: 8px; }
.pal-title { font-weight: 700; font-size: 12.5px; }
.pal-input {
  border: none;
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
  color: var(--dt-text);
  font: 500 13px var(--dt-sans);
  padding: 9px 11px;
}
.pal-input:focus { outline: none; border-bottom-color: var(--dt-accent); }
.pal-list { overflow: auto; padding: 4px; }
.pal-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--dt-text);
  font: 500 11.5px var(--dt-sans);
  padding: 5px 8px;
  cursor: pointer;
}
.pal-row.is-active { background: var(--dt-accent-soft); }
.pal-group {
  flex: 0 0 auto;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--dt-text-faint);
  min-width: 54px;
}
.pal-label { flex: 1; }
.pal-hint { font-family: var(--dt-mono); font-size: 10px; color: var(--dt-text-faint); }
.pal-empty { padding: 12px; font-size: 11px; color: var(--dt-text-faint); }
.pal-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-top: 1px solid var(--dt-border);
  font-size: 10px;
  color: var(--dt-text-faint);
}

/* ---- First-run tips ---- */
.tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--dt-accent);
  border-radius: 8px;
  background: var(--dt-accent-soft);
}
.tips-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 11.5px; }
.tips-list { display: flex; flex-direction: column; gap: 4px; }
.tip-row {
  appearance: none;
  display: flex;
  align-items: baseline;
  gap: 7px;
  background: none;
  border: none;
  text-align: left;
  color: var(--dt-text);
  font: 500 11px var(--dt-sans);
  padding: 2px 0;
  cursor: pointer;
}
.tip-row:hover .tip-action { color: var(--dt-accent); text-decoration: underline; }
.tip-num {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border-strong);
  font-size: 9px;
  font-weight: 700;
}
.tip-action { font-weight: 700; }
.tip-why { color: var(--dt-text-dim); }

/* ---- Inspect split layout (wide panel) ---- */
.split { display: grid; grid-template-columns: minmax(220px, 40%) minmax(0, 1fr); min-height: 0; }
.split > .split-left { border-right: 1px solid var(--dt-border); min-width: 0; overflow: auto; max-height: 520px; }
.split > .split-right { min-width: 0; overflow: auto; max-height: 520px; }
.split .comp-tree { max-height: none; }

/* ---- Watch expressions ---- */
.watch-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.watch-expr { flex: 0 0 40%; font-family: var(--dt-mono); color: var(--dt-purple); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.watch-val { flex: 1; font-family: var(--dt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.watch-val.is-error { color: var(--dt-red); }

/* ---- State diff ---- */
.diff-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.diff-mark { flex: 0 0 14px; text-align: center; font-family: var(--dt-mono); font-weight: 700; }
.diff-row.is-added .diff-mark { color: var(--dt-green); }
.diff-row.is-removed .diff-mark { color: var(--dt-red); }
.diff-row.is-changed .diff-mark { color: var(--dt-amber); }
.diff-path { flex: 0 0 34%; font-family: var(--dt-mono); color: var(--dt-text); overflow: hidden; text-overflow: ellipsis; }
.diff-old { color: var(--dt-red); font-family: var(--dt-mono); text-decoration: line-through; opacity: .8; }
.diff-arrow { color: var(--dt-text-faint); }
.diff-new { color: var(--dt-green); font-family: var(--dt-mono); }
.diff-empty { padding: 8px 0; color: var(--dt-text-faint); font-size: 11px; }

/* ---- Break-on-change marker ---- */
.brk {
  appearance: none;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 10px;
  color: var(--dt-text-faint);
  padding: 0 2px;
}
.brk.is-on { color: var(--dt-red); }
.brk:hover { color: var(--dt-red); }

/* ---- Program history ---- */
.ver-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.ver-when { flex: 0 0 96px; font-family: var(--dt-mono); font-size: 10px; color: var(--dt-text-faint); }
.ver-meta { flex: 1; color: var(--dt-text-dim); }

/* ---- Keyboard hint chips in a toolbar ---- */
kbd {
  font-family: var(--dt-mono);
  font-size: 9.5px;
  padding: 1px 4px;
  border: 1px solid var(--dt-border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--dt-bg-inset);
  color: var(--dt-text-dim);
}
`;

/**
 * Styles for the scroll containers introduced by the reliability pass. Kept
 * separate from the palette block only to keep each string readable; all three
 * are concatenated into one stylesheet.
 */
export const devtoolsScrollStyles = `
/* A keyed scroll region: bounded height so the surrounding page keeps its
   shape, and a preserved offset across re-renders (see SCROLL_KEY_ATTR). */
.tree-wrap { max-height: 340px; overflow: auto; }
:host(.dock-bottom) .tree-wrap { max-height: 240px; }
[data-dt-scroll] { scrollbar-width: thin; }
[data-dt-scroll]::-webkit-scrollbar { width: 9px; height: 9px; }
[data-dt-scroll]::-webkit-scrollbar-thumb {
  background: var(--dt-border-strong);
  border-radius: 6px;
  border: 2px solid var(--dt-bg);
}
`;

/** Styles for search hits and the code window's paging affordances. */
export const devtoolsCodeStyles = `
.code-line.is-hit { background: rgba(240, 179, 94, 0.10); }
.code-text mark {
  background: var(--dt-amber);
  color: #10121a;
  border-radius: 2px;
  padding: 0 1px;
}
`;

/** Bounded list regions, so a long table cannot push a detail pane off-screen. */
export const devtoolsListStyles = `
.list-wrap { max-height: 300px; overflow: auto; }
:host(.dock-bottom) .list-wrap { max-height: 200px; }
.log-list, .tlist { max-height: 420px; overflow: auto; }
:host(.dock-bottom) .log-list, :host(.dock-bottom) .tlist { max-height: 240px; }
`;
