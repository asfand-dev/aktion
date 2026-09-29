/**
 * Console — the program's output, the runtime's own diagnostics, and runtime
 * errors in one stream; pinned watch expressions; and a REPL that evaluates
 * Aktion expressions against the live program scope (writes go through the
 * reactive pipeline, so `$count = 5` is indistinguishable from a click).
 */

import { autofocus, h, type Child } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";
import { can, type ViewContext, type ViewDefinition, type ReplEntry } from "../context.js";
import type { LogLevel } from "../protocol.js";
import { icon, type IconName } from "../ui/icons.js";
import {
  button, chip, downloadText, emptyState, filterChip, fmtClock, iconButton, searchField, segmented, spacer, viewbar, vsep, toggleSwitch,
} from "../ui/kit.js";
import { split } from "../ui/layout.js";
import { valueTree } from "../ui/value.js";
import { noApp, paneSize, setPaneSize } from "./common.js";

interface Line {
  id: string;
  kind: "log" | "error" | "input" | "result";
  level: LogLevel | "input";
  time: number;
  text: string;
  origin: string;
  count: number;
  stack?: string;
  args?: string[];
  value?: unknown;
  hasValue?: boolean;
}

const LEVEL_ICON: Record<string, IconName> = { error: "error", warn: "warning", info: "info", debug: "bug", log: "dot", input: "chevronRight" };

function lines(ctx: ViewContext): Line[] {
  const { model, ui } = ctx;
  const out: Line[] = [];
  model.logs.forEach((log, i) => out.push({
    id: `l${i}:${log.time}`, kind: "log", level: log.level, time: log.time, text: log.text, origin: log.origin, count: log.count, stack: log.stack, args: log.args,
  }));
  model.errors.forEach((error, i) => out.push({
    id: `e${i}:${error.time}`, kind: "error", level: "error", time: error.time + ctx.epochOffset,
    text: `${error.phase} error${error.subject ? ` in ${error.subject}` : ""}: ${error.message}`, origin: "runtime", count: 1, stack: error.stack,
  }));
  ui.repl.forEach((entry: ReplEntry, i) => {
    out.push({ id: `r${i}:in`, kind: "input", level: "input", time: entry.time, text: entry.input, origin: "repl", count: 1 });
    out.push({ id: `r${i}:out`, kind: "result", level: entry.ok ? "log" : "error", time: entry.time + 0.001, text: entry.output, origin: "repl", count: 1, value: entry.value, hasValue: entry.hasValue });
  });
  return out.sort((a, b) => a.time - b.time);
}

function evaluate(ctx: ViewContext, source: string): void {
  const { app, ui } = ctx;
  if (!can(app, "evaluateExpression")) return;
  const text = source.trim();
  if (!text) return;
  const result = app.evaluateExpression(text);
  let value: unknown;
  let hasValue = false;
  if (result.ok && result.text !== undefined) {
    try {
      value = JSON.parse(result.text) as unknown;
      hasValue = typeof value === "object" && value !== null;
    } catch {
      hasValue = false;
    }
  }
  ui.repl = [...ui.repl.slice(-80), {
    input: text,
    ok: result.ok,
    output: result.ok ? result.value?.preview ?? "undefined" : result.error ?? "evaluation failed",
    value,
    hasValue,
    time: Date.now(),
  }];
  ui.replHistory = [...ui.replHistory.filter((h2) => h2 !== text), text].slice(-60);
  ui.replCursor = -1;
  ui.replDraft = "";
  ui.consoleSelected = null;
  ctx.refresh();
}

/** Completions for the token under the caret: `$` atoms, then namespaces. */
function completions(ctx: ViewContext, draft: string): string[] {
  const match = /(\$[A-Za-z_][\w.]*|\$)$/.exec(draft);
  if (!match) return [];
  const token = match[1]!;
  const atoms = Object.keys(ctx.model.state).map((name) => `$${name}`);
  const namespaces = ["$util.", "$router.", "$theme", "$toast."];
  return [...atoms, ...namespaces].filter((candidate) => candidate.startsWith(token) && candidate !== token).slice(0, 8);
}

function render(ctx: ViewContext): Child {
  const { app, ui, model } = ctx;
  if (!app && !ctx.imported && model.logs.length === 0) return noApp(ctx, "The Console", "console");
  const all = ctx.memo("con:lines", [model.revs.log, model.revs.error, ui.repl.length], () => lines(ctx));
  const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, log: 0, debug: 0 };
  for (const line of all) if ((line.kind === "log" || line.kind === "error") && line.level !== "input") counts[line.level] += line.count;
  const needle = ui.logFilter.trim().toLowerCase();
  const visible = all.filter((line) => {
    if (line.kind === "input" || line.kind === "result") return !needle || line.text.toLowerCase().includes(needle);
    if (!ui.logLevels.has(line.level as LogLevel)) return false;
    if (ui.logOrigin !== "all" && line.origin !== ui.logOrigin) return false;
    return !needle || line.text.toLowerCase().includes(needle);
  });
  const selected = visible.find((line) => line.id === ui.consoleSelected) ?? null;
  const toggleLevel = (level: LogLevel): void => {
    if (ui.logLevels.has(level)) ui.logLevels.delete(level);
    else ui.logLevels.add(level);
    ctx.refresh();
  };
  const onlyLevel = (level: LogLevel): void => {
    ui.logLevels = new Set([level]);
    ctx.refresh();
  };

  const list = virtualList({
    items: visible,
    rowHeight: ctx.rowHeight,
    rowKey: (line) => line.id,
    stickToBottom: true,
    version: [ui.consoleSelected, model.rev, ui.repl.length],
    testid: "console-list",
    role: "log",
    ariaLabel: "Console output",
    empty: emptyState({
      icon: "console",
      title: all.length === 0 ? (ui.captureConsole ? "Nothing logged yet" : "Console capture is off") : "Nothing matches the filters",
      body: all.length === 0 ? ["Program ", h("code", {}, "console.log(…)"), " output, every ", h("code", {}, "[aktion]"), " runtime diagnostic, and uncaught errors land here. Try an expression below."] : undefined,
    }),
    renderRow: (line) => h("div", {
      class: ["con-row", `lv-${line.level}`, line.kind === "input" ? "is-input" : "", line.kind === "result" ? "is-result" : "", selected?.id === line.id ? "is-selected" : ""],
      "data-dt": "console-row",
      onClick: () => { ui.consoleSelected = selected?.id === line.id ? null : line.id; ctx.refresh(); },
    },
      h("span", { class: "con-ic" }, icon(line.kind === "result" ? (line.level === "error" ? "error" : "chevronLeft") : LEVEL_ICON[line.level] ?? "dot", { size: 12 })),
      h("span", { class: "con-time" }, fmtClock(line.time)),
      line.origin === "runtime" ? chip("runtime", "purple") : null,
      h("span", { class: ["con-text", line.kind === "input" || line.kind === "result" ? "mono" : ""] }, line.text.split("\n")[0]),
      line.count > 1 ? h("span", { class: "badge" }, `×${line.count}`) : null,
      line.stack || (line.text.includes("\n")) || line.hasValue ? h("span", { class: "con-more" }, icon("chevronRight", { size: 11 })) : null),
  });

  const detail = selected ? h("div", { class: "con-detail", "data-dt": "console-detail" },
    h("div", { class: "pane-head" },
      h("span", { class: ["con-ic", `lv-${selected.level}`] }, icon(LEVEL_ICON[selected.level] ?? "dot", { size: 13 })),
      h("span", { class: "pane-title" }, selected.kind === "result" ? "Result" : selected.kind === "input" ? "Expression" : selected.level),
      h("span", { class: "t3" }, fmtClock(selected.time)),
      spacer(),
      iconButton({ icon: "copy", label: "Copy", size: "sm", onClick: () => ctx.copy(selected.stack ? `${selected.text}\n${selected.stack}` : selected.text, "the message") }),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.consoleSelected = null; ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      selected.hasValue
        ? valueTree({ scope: `repl:${selected.id}`, value: selected.value, expanded: ui.replExpanded, rowHeight: ctx.rowHeight, inline: true, onToggle: (p) => { if (ui.replExpanded.has(p)) ui.replExpanded.delete(p); else ui.replExpanded.add(p); ctx.refresh(); }, editing: null, setEditing: () => undefined, onCopy: (t, w) => ctx.copy(t, w) })
        : h("pre", { class: "pre is-wrap" }, selected.text),
      selected.args && selected.args.length > 1 ? h("div", {}, h("div", { class: "it-sub" }, `Arguments (${selected.args.length})`), h("div", { class: "it-attrs" }, ...selected.args.map((arg, i) => h("div", { key: i, class: "it-attr" }, h("span", { class: "it-attr-k" }, String(i)), h("span", { class: "it-attr-v" }, arg))))) : null,
      selected.stack ? h("div", {}, h("div", { class: "it-sub" }, "Stack"), h("pre", { class: "pre con-stack" }, selected.stack)) : null)) : null;

  const suggestions = completions(ctx, ui.replDraft);
  const canEval = can(app, "evaluateExpression");
  const repl = h("div", { class: "con-repl" },
    suggestions.length > 0 ? h("div", { class: "con-suggest", role: "listbox" }, ...suggestions.map((s) => h("button", {
      key: s, type: "button", class: "con-suggest-item", role: "option",
      onClick: () => { ui.replDraft = ui.replDraft.replace(/(\$[A-Za-z_][\w.]*|\$)$/, s); ctx.refresh(); },
    }, s))) : null,
    h("span", { class: "con-prompt" }, icon("chevronRight", { size: 14 })),
    h("input", {
      class: "con-input",
      "data-dt": "repl",
      value: ui.replDraft,
      placeholder: canEval ? "$count + 1   ·   $user.name   ·   $count = 5   ·   $todos.filter(t => !t.done).length" : "This runtime cannot evaluate expressions",
      disabled: !canEval || undefined,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": "Evaluate an Aktion expression",
      ref: ui.tab === "console" ? autofocus() : undefined,
      onInput: (event: Event) => { ui.replDraft = (event.target as HTMLInputElement).value; if (/\$[\w.]*$/.test(ui.replDraft)) ctx.refresh(); },
      onKeyDown: (event: KeyboardEvent) => {
        const input = event.target as HTMLInputElement;
        if (event.key === "Enter") {
          event.preventDefault();
          evaluate(ctx, input.value);
        } else if (event.key === "Tab" && suggestions.length > 0) {
          event.preventDefault();
          ui.replDraft = input.value.replace(/(\$[A-Za-z_][\w.]*|\$)$/, suggestions[0]!);
          ctx.refresh();
        } else if (event.key === "ArrowUp" && ui.replHistory.length > 0) {
          event.preventDefault();
          ui.replCursor = ui.replCursor < 0 ? ui.replHistory.length - 1 : Math.max(0, ui.replCursor - 1);
          ui.replDraft = ui.replHistory[ui.replCursor] ?? "";
          ctx.refresh();
        } else if (event.key === "ArrowDown" && ui.replCursor >= 0) {
          event.preventDefault();
          ui.replCursor = ui.replCursor + 1 >= ui.replHistory.length ? -1 : ui.replCursor + 1;
          ui.replDraft = ui.replCursor < 0 ? "" : ui.replHistory[ui.replCursor] ?? "";
          ctx.refresh();
        } else if (event.key === "l" && event.ctrlKey) {
          event.preventDefault();
          ui.repl = [];
          ctx.refresh();
        }
      },
    }),
    button({ label: "Run", size: "sm", variant: "primary", disabled: !canEval, onClick: () => evaluate(ctx, ui.replDraft), kbd: "↵" }),
    iconButton({ icon: "eye", label: "Watch this expression", size: "sm", disabled: !ui.replDraft.trim(), onClick: () => {
      const expr = ui.replDraft.trim();
      if (!expr || ui.watches.includes(expr)) return;
      ui.watches = [...ui.watches, expr].slice(-20);
      ctx.persist();
      ctx.toast(`Watching ${expr}`, "good");
    } }));

  const watches = ui.watches.length > 0 && canEval ? h("div", { class: "con-watches", "data-dt": "watches" },
    h("span", { class: "section-title" }, icon("eye", { size: 12 }), "Watch"),
    ...ui.watches.map((expr) => {
      const result = app!.evaluateExpression!(expr);
      return h("span", { key: expr, class: ["con-watch", result.ok ? "" : "is-error"] },
        h("code", {}, expr), h("span", { class: "t4" }, "="),
        h("span", { class: ["v", result.ok ? `t-${result.value?.type ?? "undefined"}` : "t-error"] }, result.ok ? result.value?.preview ?? "undefined" : result.error ?? "failed"),
        h("button", { type: "button", class: "ibtn is-sm", "aria-label": `Stop watching ${expr}`, onClick: () => { ui.watches = ui.watches.filter((w) => w !== expr); ctx.persist(); ctx.refresh(); } }, icon("close", { size: 10 })));
    })) : null;

  return h("div", { class: "con", "data-dt": "console" },
    viewbar(
      filterChip({ label: "Errors", on: ui.logLevels.has("error"), count: counts.error, swatch: "var(--dt-red)", onToggle: () => toggleLevel("error"), tip: "Double-click to show only errors", testid: "lvl-error" }),
      filterChip({ label: "Warnings", on: ui.logLevels.has("warn"), count: counts.warn, swatch: "var(--dt-amber)", onToggle: () => toggleLevel("warn"), testid: "lvl-warn" }),
      filterChip({ label: "Info", on: ui.logLevels.has("info"), count: counts.info, swatch: "var(--dt-blue)", onToggle: () => toggleLevel("info") }),
      filterChip({ label: "Log", on: ui.logLevels.has("log"), count: counts.log, swatch: "var(--dt-grey)", onToggle: () => toggleLevel("log") }),
      filterChip({ label: "Debug", on: ui.logLevels.has("debug"), count: counts.debug, swatch: "var(--dt-purple)", onToggle: () => toggleLevel("debug") }),
      ui.logLevels.size < 5 ? button({ label: "All levels", size: "sm", variant: "ghost", onClick: () => { ui.logLevels = new Set(["log", "info", "warn", "error", "debug"]); ctx.refresh(); } }) : null,
      counts.error > 0 && ui.logLevels.size !== 1 ? button({ label: "Only errors", size: "sm", variant: "ghost", onClick: () => onlyLevel("error") }) : null,
      spacer(),
      segmented([{ value: "all", label: "All" }, { value: "program", label: "App" }, { value: "runtime", label: "Runtime" }], ui.logOrigin, (v) => { ui.logOrigin = v; ctx.refresh(); }, { label: "Origin" }),
      searchField({ value: ui.logFilter, placeholder: "Filter output…", onInput: (v) => { ui.logFilter = v; ctx.refresh(); }, width: "170px", testid: "console-filter" }),
      vsep(),
      toggleSwitch({ checked: ui.captureConsole, label: "Capture", onChange: (on) => { ui.captureConsole = on; ctx.persist(); ctx.toast(on ? "Capturing console output" : "Console capture off"); ctx.refresh(); } }),
      iconButton({ icon: "download", label: "Export as text", onClick: () => downloadText("aktion-console.txt", all.map((l) => `${new Date(l.time).toISOString()} [${l.level}] (${l.origin}) ${l.text}${l.count > 1 ? ` (×${l.count})` : ""}${l.stack ? `\n${l.stack}` : ""}`).join("\n"), "text/plain") }),
      iconButton({ icon: "trash", label: "Clear the console", onClick: () => { model.logs.length = 0; model.errors.length = 0; model.revs.log += 1; model.revs.error += 1; model.rev += 1; ui.repl = []; ui.consoleSelected = null; ctx.refresh(); } })),
    watches,
    h("div", { class: "con-body" },
      detail && ctx.width() >= 860
        ? split({ size: paneSize(ctx, "console.list", Math.round(ctx.width() * 0.6)), min: 320, onResize: (s) => setPaneSize(ctx, "console.list", s), first: list, second: detail })
        : detail
          ? split({ direction: "col", size: paneSize(ctx, "console.list.col", Math.round(ctx.height() * 0.35)), min: 100, onResize: (s) => setPaneSize(ctx, "console.list.col", s), first: list, second: detail })
          : list),
    repl);
}

export const consoleView: ViewDefinition = {
  id: "console",
  label: "Console",
  icon: "console",
  group: "activity",
  hint: "Logs, runtime diagnostics, errors, and a live REPL",
  keywords: "logs warnings errors repl evaluate expression watch console",
  badge: (ctx) => {
    let errors = ctx.model.errors.length;
    for (const log of ctx.model.logs) if (log.level === "error") errors += log.count;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "errors", label: "Show only errors", icon: "error", run: () => { ctx.ui.logLevels = new Set(["error"]); ctx.selectTab("console"); } },
    { id: "clear", label: "Clear the console", icon: "trash", run: () => { ctx.model.logs.length = 0; ctx.model.errors.length = 0; ctx.model.revs.log += 1; ctx.ui.repl = []; ctx.refresh(); } },
  ],
  css: /* css */ `
.con { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.con-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.con-row { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 12px; border-bottom: 1px solid var(--dt-border); color: var(--dt-text); font-size: var(--dt-fs-sm); cursor: default; min-width: 0; }
.con-row:hover { background: var(--dt-bg-hover); }
.con-row.is-selected { background: var(--dt-bg-selected); }
.con-row.lv-error { background: var(--dt-red-soft); color: var(--dt-red); }
.con-row.lv-warn { background: var(--dt-amber-soft); color: var(--dt-amber); }
.con-row.lv-debug { color: var(--dt-text-3); }
.con-row.is-input { color: var(--dt-syn-state); background: transparent; }
.con-row.is-result { color: var(--dt-text-2); background: transparent; }
.con-row.is-result.lv-error { color: var(--dt-red); }
.con-ic { flex: none; display: inline-flex; width: 14px; justify-content: center; }
.con-row.lv-info .con-ic { color: var(--dt-blue); }
.con-row.lv-log .con-ic { color: var(--dt-text-4); }
.con-time { flex: none; font-family: var(--dt-mono); font-size: 10.5px; color: var(--dt-text-4); font-variant-numeric: tabular-nums; }
.con-row.lv-error .con-time, .con-row.lv-warn .con-time { color: inherit; opacity: 0.7; }
.con-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.con-more { color: var(--dt-text-4); flex: none; }
.con-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.con-stack { font-size: 10.5px; max-height: 260px; }
.con-repl { position: relative; flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid var(--dt-border); background: var(--dt-bg-elev); }
.con-prompt { color: var(--dt-accent-text); display: inline-flex; }
.con-input { flex: 1; min-width: 0; height: 28px; border: 0; background: transparent; outline: none; color: var(--dt-text); font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.con-input::placeholder { color: var(--dt-text-4); }
.con-suggest { position: absolute; left: 34px; bottom: 100%; margin-bottom: 4px; min-width: 200px; padding: 4px; border-radius: 8px; background: var(--dt-bg-elev-2); border: 1px solid var(--dt-border-strong); box-shadow: var(--dt-shadow-md); display: flex; flex-direction: column; z-index: 5; }
.con-suggest-item { text-align: left; padding: 4px 8px; border-radius: 5px; border: 0; background: none; font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); }
.con-suggest-item:first-child, .con-suggest-item:hover { background: var(--dt-bg-selected); }
.con-watches { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); background: var(--dt-bg-elev); }
.con-watch { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px 2px 8px; border-radius: 6px; background: var(--dt-bg); border: 1px solid var(--dt-border); max-width: 360px; min-width: 0; }
.con-watch code { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); white-space: nowrap; }
.con-watch.is-error { border-color: var(--dt-red); }
`,
};
