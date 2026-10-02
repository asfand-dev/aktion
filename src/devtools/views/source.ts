/**
 * Source — the running program with its diagnostics on their lines, an
 * outline, find-in-source, version history with diff and one-click revert, and
 * an editor that validates the draft as you type and hot-swaps it on apply.
 *
 * Aktion programs are often generated, so this view is less "read the code
 * you wrote" and more "check what was emitted, where the validator disagreed,
 * and try a fix in place".
 */

import { h, type Child } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";
import { can, type ViewCommand, type ViewContext, type ViewDefinition } from "../context.js";
import type { Diagnostic, OutlineEntry, ProgramAnalysis } from "../protocol.js";
import { codeEditor, codeView, highlightLines, renderTokens, type LineMarker, type Tok } from "../ui/code.js";
import { icon } from "../ui/icons.js";
import {
  button, chip, downloadText, emptyState, fmtAgo, fmtBytes, iconButton, note, plural, searchField, segmented, spacer, viewbar, vsep, type Tone,
} from "../ui/kit.js";
import { split } from "../ui/layout.js";
import { noApp, paneSize, setPaneSize } from "./common.js";

/* -------------------------------------------------------------------------- */
/*  Diff                                                                       */
/* -------------------------------------------------------------------------- */

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
  /** 1-based line in the old text (for `same` / `del`). */
  oldLine?: number;
  /** 1-based line in the new text (for `same` / `add`). */
  newLine?: number;
}

/**
 * Line diff: common prefix and suffix are trimmed first (edits are local, so
 * this usually leaves a handful of lines), then an LCS over the middle. The
 * middle is capped so a pasted-over program degrades to "all removed, all
 * added" instead of allocating a quadratic table.
 */
export function lineDiff(before: string, after: string, cap = 1600): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const out: DiffLine[] = [];
  for (let i = 0; i < start; i += 1) out.push({ kind: "same", text: a[i]!, oldLine: i + 1, newLine: i + 1 });
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > cap * cap) {
    midA.forEach((text, i) => out.push({ kind: "del", text, oldLine: start + i + 1 }));
    midB.forEach((text, i) => out.push({ kind: "add", text, newLine: start + i + 1 }));
  } else {
    // LCS table, filled from the end so the walk below goes forwards.
    const n = midA.length;
    const m = midB.length;
    const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i]![j] = midA[i] === midB[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        out.push({ kind: "same", text: midA[i]!, oldLine: start + i + 1, newLine: start + j + 1 });
        i += 1;
        j += 1;
      } else if (j < m && (i >= n || table[i]![j + 1]! >= table[i + 1]![j]!)) {
        out.push({ kind: "add", text: midB[j]!, newLine: start + j + 1 });
        j += 1;
      } else {
        out.push({ kind: "del", text: midA[i]!, oldLine: start + i + 1 });
        i += 1;
      }
    }
  }
  for (let k = 0; k < a.length - endA; k += 1) out.push({ kind: "same", text: a[endA + k]!, oldLine: endA + k + 1, newLine: endB + k + 1 });
  return out;
}

export function diffStats(diff: ReadonlyArray<DiffLine>): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "del") removed += 1;
  }
  return { added, removed };
}

/** Collapse long runs of unchanged lines to `context` lines around each change. */
export function foldDiff(diff: ReadonlyArray<DiffLine>, context = 3): Array<DiffLine | { kind: "fold"; count: number }> {
  const keep = new Array<boolean>(diff.length).fill(false);
  diff.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k += 1) keep[k] = true;
  });
  const out: Array<DiffLine | { kind: "fold"; count: number }> = [];
  let folded = 0;
  diff.forEach((line, i) => {
    if (keep[i]) {
      if (folded > 0) { out.push({ kind: "fold", count: folded }); folded = 0; }
      out.push(line);
    } else {
      folded += 1;
    }
  });
  if (folded > 0) out.push({ kind: "fold", count: folded });
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Analysis                                                                   */
/* -------------------------------------------------------------------------- */

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) | 0;
  return value;
}

function analyse(ctx: ViewContext, text: string, live: boolean): ProgramAnalysis | null {
  const { app } = ctx;
  if (!can(app, "analyzeProgram")) return null;
  return ctx.memo(`source.analysis:${live ? "live" : "draft"}`, [app.id, live ? app.getProgram() : text.length, hash(text)], () => {
    try {
      return app.analyzeProgram(live ? undefined : text);
    } catch {
      return null;
    }
  });
}

function markersFor(diagnostics: ReadonlyArray<Diagnostic>): Map<number, LineMarker> {
  const markers = new Map<number, LineMarker>();
  for (const d of diagnostics) {
    if (d.line <= 0) continue;
    const existing = markers.get(d.line);
    if (existing && existing.severity === "error") continue;
    markers.set(d.line, { severity: d.severity === "error" ? "error" : "warn", message: d.message });
  }
  return markers;
}

let draftTimer: ReturnType<typeof setTimeout> | null = null;

function applyDraft(ctx: ViewContext, text: string): void {
  const { app, ui } = ctx;
  if (!can(app, "setProgram")) return;
  const analysis = can(app, "analyzeProgram") ? app.analyzeProgram(text) : null;
  const previous = app.getProgram();
  try {
    app.setProgram(text);
  } catch (error) {
    ctx.toast(`Could not apply: ${error instanceof Error ? error.message : String(error)}`, "bad");
    return;
  }
  ui.sourceDraft = null;
  const errors = analysis?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  ctx.toast(errors > 0 ? `Applied with ${plural(errors, "error")} — the app renders what it could plan` : "Applied — state was preserved across the swap", errors > 0 ? "warn" : "good", {
    action: { label: "Undo", run: () => { app.setProgram(previous); ctx.refresh(); } },
  });
  ctx.refresh();
}

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                    */
/* -------------------------------------------------------------------------- */

const OUTLINE_TONE: Record<string, Tone> = { component: "purple", effect: "blue", action: "green", hook: "amber", state: "cyan", binding: "grey", import: "grey" };

function focus(ctx: ViewContext, line: number | null): void {
  ctx.ui.sourceFocusLine = line;
  ctx.refresh();
}

function outlinePane(ctx: ViewContext, entries: ReadonlyArray<OutlineEntry>): Child {
  const q = ctx.ui.sourceFilter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.kind.includes(q)) : entries;
  if (entries.length === 0) return h("div", { class: "sr-empty t3" }, "Nothing declared at the top level.");
  const groups = new Map<string, OutlineEntry[]>();
  for (const entry of shown) groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), entry]);
  const order = ["component", "state", "action", "effect", "hook", "binding", "import"];
  const kinds = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return h("div", { class: "sr-outline", "data-dt": "source-outline" }, ...kinds.map((kind) => h("div", { key: kind, class: "sr-group" },
    h("div", { class: "sr-group-head" }, chip(kind, OUTLINE_TONE[kind] ?? "grey"), h("span", { class: "t3 num" }, String(groups.get(kind)!.length))),
    ...groups.get(kind)!.map((entry) => h("button", {
      key: `${entry.name}:${entry.line}`, type: "button", class: ["sr-item", ctx.ui.sourceFocusLine === entry.line ? "is-on" : ""],
      onClick: () => focus(ctx, entry.line),
    }, entry.kind === "effect" && entry.name.startsWith("__")
      ? h("span", { class: "mono ellipsis t3" }, "$effect(…)")
      : h("span", { class: "mono ellipsis" }, entry.kind === "state" ? `$${entry.name}` : entry.name), entry.exported ? chip("export", "green") : null, spacer(), h("span", { class: "t4 num" }, `L${entry.line}`))))));
}

function problemsPane(ctx: ViewContext, diagnostics: ReadonlyArray<Diagnostic>): Child {
  if (diagnostics.length === 0) return h("div", { class: "sr-empty" }, note("good", "No parse, schema, or budget problems."));
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  return h("div", { class: "sr-problems", "data-dt": "source-problems" },
    ...diagnostics.slice(0, 200).map((d, i) => h("button", {
      key: i, type: "button", class: ["sr-problem", d.severity === "error" ? "is-error" : "is-warn"], onClick: () => focus(ctx, d.line > 0 ? d.line : null),
    },
      icon(d.severity === "error" ? "error" : "warning", { size: 13 }),
      h("span", { class: "sr-problem-text" }, h("span", {}, d.message), h("span", { class: "sr-problem-meta" }, chip(d.kind, d.kind === "schema" ? "purple" : "grey"), d.line > 0 ? `line ${d.line}${d.column > 0 ? `:${d.column}` : ""}` : "no location")))),
    errors > 0 ? h("div", { class: "sr-empty t3" }, "A program with errors still renders what it could plan — fix the first error; the rest are often consequences of it.") : null);
}

function historyPane(ctx: ViewContext): Child {
  const { app, model, ui } = ctx;
  const versions = [...model.programHistory].reverse();
  if (versions.length === 0) return h("div", { class: "sr-empty t3" }, "Versions are recorded as the program commits.");
  const current = app?.getProgram() ?? "";
  return h("div", { class: "sr-history", "data-dt": "source-history" }, ...versions.map((version, i) => {
    const index = model.programHistory.length - 1 - i;
    const isCurrent = version.text === current;
    const stats = isCurrent ? null : ctx.memo(`source.diffstat:${index}`, [version.text.length, current.length, hash(version.text), hash(current)], () => diffStats(lineDiff(version.text, current)));
    return h("div", { key: `${version.at}:${index}`, class: ["sr-version", ui.sourceDiff === index ? "is-on" : ""] },
      h("div", { class: "sr-version-top" },
        h("span", { class: "sr-version-time" }, new Date(version.at).toLocaleTimeString()),
        isCurrent ? chip("running", "green") : null,
        spacer(),
        h("span", { class: "t4", style: { fontSize: "var(--dt-fs-xs)" } }, fmtAgo(version.at, Date.now()))),
      h("div", { class: "sr-version-meta t3" }, `${version.lines} lines · ${fmtBytes(version.text.length)}`,
        stats ? h("span", { class: "sr-diffstat", "data-tip": "What the running program changed since this version" }, h("span", { class: "tone-green" }, `+${stats.added}`), " ", h("span", { class: "tone-red" }, `−${stats.removed}`)) : null),
      isCurrent ? null : h("div", { class: "row-flex sr-version-actions" },
        button({ label: ui.sourceDiff === index ? "Hide diff" : "Diff", size: "sm", variant: "ghost", icon: "diff", onClick: () => { ui.sourceDiff = ui.sourceDiff === index ? null : index; ctx.refresh(); } }),
        button({ label: "Edit from here", size: "sm", variant: "ghost", icon: "edit", onClick: () => { ui.sourceDraft = version.text; ui.sourceDiff = null; ctx.toast("Loaded into the editor — apply to mount it"); ctx.refresh(); } }),
        can(app, "setProgram") ? button({ label: "Revert", size: "sm", icon: "undo", onClick: () => { app.setProgram(version.text); ui.sourceDraft = null; ui.sourceDiff = null; ctx.toast("Reverted to the earlier version", "good"); ctx.refresh(); } }) : null));
  }));
}

/* -------------------------------------------------------------------------- */
/*  Diff view                                                                  */
/* -------------------------------------------------------------------------- */

function diffView(ctx: ViewContext, before: string, after: string, title: Child, actions: Child[] = []): Child {
  const diff = ctx.memo("source.diff", [hash(before), hash(after), before.length, after.length], () => lineDiff(before, after));
  const folded = foldDiff(diff);
  const stats = diffStats(diff);
  const tokenCache = new Map<string, Tok[]>();
  const tokens = (text: string): Tok[] => {
    let cached = tokenCache.get(text);
    if (!cached) { cached = highlightLines(text)[0] ?? []; tokenCache.set(text, cached); }
    return cached;
  };
  return h("div", { class: "sr-diff", "data-dt": "source-diff" },
    h("div", { class: "pane-head" }, icon("diff", { size: 14 }), h("span", { class: "pane-title" }, title),
      h("span", { class: "tone-green num" }, `+${stats.added}`), h("span", { class: "tone-red num" }, `−${stats.removed}`), spacer(), ...actions),
    stats.added + stats.removed === 0
      ? h("div", { class: "dt-pad" }, emptyState({ icon: "check", title: "No differences" }))
      : virtualList({
          items: folded, rowHeight: 19, rowKey: (_row, i) => i, className: "code", version: [hash(before), hash(after)], ariaLabel: "Diff",
          renderRow: (row) => row.kind === "fold"
            ? h("div", { class: "sr-fold" }, `⋯ ${plural(row.count, "unchanged line")}`)
            : h("div", { class: ["code-line", "sr-dl", `is-${row.kind}`] },
                h("span", { class: "sr-dl-no" }, row.oldLine ? String(row.oldLine) : ""),
                h("span", { class: "sr-dl-no" }, row.newLine ? String(row.newLine) : ""),
                h("span", { class: "sr-dl-sign" }, row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "),
                h("span", { class: "code-text" }, ...renderTokens(tokens(row.text)), row.text === "" ? " " : null)),
        }));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, model, ui } = ctx;
  if (!app) return noApp(ctx, "The Source view", "source");
  const sources = ctx.cache("source.sources", () => (can(app, "getSources") ? app.getSources() : [{ path: "<inline>", text: app.getProgram() }]));
  const index = Math.min(ui.sourceIndex, Math.max(0, sources.length - 1));
  const active = sources[index] ?? { path: "<inline>", text: "" };
  const editing = ui.sourceDraft !== null;
  const text = editing ? ui.sourceDraft! : active.text;
  const liveDiagnostics = ctx.cache("source.diagnostics", () => (can(app, "getDiagnostics") ? app.getDiagnostics() : []));
  const analysis = analyse(ctx, text, !editing && index === 0);
  const diagnostics = editing ? analysis?.diagnostics ?? [] : liveDiagnostics;
  const markers = ctx.memo("source.markers", [diagnostics], () => markersFor(diagnostics));
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const lines = ctx.memo("source.lines", [hash(text), text.length], () => highlightLines(text));
  const query = ui.sourceFilter.trim().toLowerCase();
  const hits = ctx.memo("source.hits", [hash(text), query], () => (query ? text.split("\n").map((line, i) => (line.toLowerCase().includes(query) ? i + 1 : 0)).filter(Boolean) : []));
  const hitIndex = ui.sourceFocusLine !== null ? hits.indexOf(ui.sourceFocusLine) : -1;
  const jump = (delta: number): void => {
    if (hits.length === 0) return;
    const next = hitIndex < 0 ? (delta > 0 ? hits.find((l) => l > (ui.sourceFocusLine ?? 0)) ?? hits[0]! : hits[hits.length - 1]!) : hits[(hitIndex + delta + hits.length) % hits.length]!;
    focus(ctx, next);
  };
  const canEdit = can(app, "setProgram") && index === 0;
  const sidebarMode = ui.sourceSidebar ?? (diagnostics.length > 0 ? "problems" : "outline");

  const bar = viewbar(
    sources.length > 1
      ? segmented(sources.map((s, i) => ({ value: String(i), label: s.path.split("/").pop() ?? s.path, tip: s.path })), String(index), (v) => { ui.sourceIndex = Number(v); ui.sourceDraft = null; ctx.refresh(); }, { label: "Module" })
      : h("span", { class: "sr-file mono" }, icon("file", { size: 13 }), active.path === "<inline>" ? "program.aktion" : active.path),
    searchField({
      value: ui.sourceFilter, placeholder: "Find in source…", width: "200px", testid: "source-search",
      meta: query ? `${hitIndex >= 0 ? hitIndex + 1 : 0}/${hits.length}` : undefined,
      onInput: (v) => { ui.sourceFilter = v; const first = v.trim() ? text.split("\n").findIndex((l) => l.toLowerCase().includes(v.trim().toLowerCase())) : -1; ui.sourceFocusLine = first >= 0 ? first + 1 : ui.sourceFocusLine; ctx.refresh(); },
      onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); jump(event.shiftKey ? -1 : 1); } },
    }),
    query ? iconButton({ icon: "chevronUp", label: "Previous match", size: "sm", disabled: hits.length === 0, onClick: () => jump(-1) }) : null,
    query ? iconButton({ icon: "chevronDown", label: "Next match", size: "sm", disabled: hits.length === 0, onClick: () => jump(1) }) : null,
    spacer(),
    h("span", { class: "sr-status" },
      errors > 0 ? chip(plural(errors, "error"), "red", { icon: "error", onClick: () => { ui.sourceSidebar = "problems"; ui.sourceOutline = true; ctx.refresh(); } }) : null,
      warnings > 0 ? chip(plural(warnings, "warning"), "amber", { icon: "warning" }) : null,
      errors === 0 && warnings === 0 && (analysis || !editing) ? chip(editing ? "valid" : "no problems", "green", { icon: "check" }) : null),
    vsep(),
    editing
      ? [
          button({ label: "Discard", size: "sm", variant: "ghost", testid: "source-discard", onClick: () => { ui.sourceDraft = null; ctx.refresh(); } }),
          button({ label: errors > 0 ? "Apply anyway" : "Apply", size: "sm", variant: errors > 0 ? "danger" : "primary", icon: "play", kbd: "⌘ S", testid: "source-apply", disabled: !can(app, "setProgram"), onClick: () => applyDraft(ctx, ui.sourceDraft ?? text) }),
        ]
      : [
          // Edit the RUNNABLE program (`getProgram()`): for a compiled mount
          // the module text shown here may be TypeScript, or only the entry
          // of a linked graph, and applying either would not run.
          canEdit ? button({ label: "Edit", size: "sm", icon: "edit", testid: "source-edit", onClick: () => { ui.sourceDraft = app.getProgram(); ui.sourceDiff = null; ctx.refresh(); } }) : null,
          iconButton({ icon: "copy", label: "Copy source", size: "sm", onClick: () => ctx.copy(text, "the source") }),
          iconButton({ icon: "download", label: "Download", size: "sm", onClick: () => downloadText(active.path === "<inline>" ? "app.aktion" : active.path.split("/").pop() ?? "app.aktion", text, "text/plain") }),
          can(app, "reload") ? iconButton({ icon: "refresh", label: "Reload (re-plan and re-render)", size: "sm", onClick: () => { app.reload(); ctx.toast("Program re-planned"); } }) : null,
        ],
    iconButton({ icon: "panel", label: ui.sourceOutline ? "Hide sidebar" : "Show sidebar", size: "sm", active: ui.sourceOutline, onClick: () => { ui.sourceOutline = !ui.sourceOutline; ctx.refresh(); } }));

  let main: Child;
  const diffIndex = ui.sourceDiff;
  if (!editing && diffIndex !== null && model.programHistory[diffIndex]) {
    const version = model.programHistory[diffIndex]!;
    main = diffView(ctx, version.text, active.text, ["Changes since ", new Date(version.at).toLocaleTimeString()], [
      iconButton({ icon: "close", label: "Close diff", size: "sm", onClick: () => { ui.sourceDiff = null; ctx.refresh(); } }),
    ]);
  } else if (editing) {
    const changed = ui.sourceDraft !== active.text;
    const showDiff = ui.sourceShowDraftDiff;
    main = h("div", { class: "sr-edit" },
      h("div", { class: "sr-edit-bar" },
        h("span", { class: "sr-edit-dot" }), "Editing",
        h("span", { class: "t3" }, changed ? "— unsaved changes" : "— no changes yet"),
        spacer(),
        changed ? button({ label: showDiff ? "Back to editor" : "Review changes", size: "sm", variant: "ghost", icon: "diff", onClick: () => { ui.sourceShowDraftDiff = !showDiff; ctx.refresh(); } }) : null,
        h("span", { class: "t4", style: { fontSize: "var(--dt-fs-xs)" } }, "⌘/Ctrl+S apply · Esc discard")),
      showDiff && changed
        ? diffView(ctx, active.text, ui.sourceDraft!, "Draft vs running program")
        : codeEditor({
            key: `editor:${index}`,
            value: ui.sourceDraft!,
            markers,
            testid: "source-editor",
            label: "Program source (editing)",
            onChange: (next) => {
              ui.sourceDraft = next;
              if (draftTimer) clearTimeout(draftTimer);
              draftTimer = setTimeout(() => { draftTimer = null; ctx.refresh(); }, 260);
            },
            onSubmit: (next) => applyDraft(ctx, next),
            onCancel: () => { ui.sourceDraft = null; ctx.refresh(); },
          }));
  } else if (!text) {
    main = h("div", { class: "dt-pad" }, emptyState({ icon: "source", title: index > 0 ? "Module text unavailable" : "No program text", body: index > 0 ? "A linked program is planned from a pre-parsed AST, so only the entry module's source travels with it to the browser." : undefined }));
  } else {
    main = h("div", { class: "sr-code" }, codeView({
      lines, markers, focusLine: ui.sourceFocusLine, search: ui.sourceFilter, lens: true, testid: "source-code",
      version: [hash(text), markers.size],
      onLineClick: (line) => { ui.sourceFocusLine = line; ctx.refresh(); },
    }));
  }

  if (!ui.sourceOutline) return h("div", { class: "sr", "data-dt": "source" }, bar, main);
  const width = ctx.width();
  const sideWidth = width >= 520 ? Math.min(paneSize(ctx, "source.side", width >= 900 ? 260 : 200), Math.round(width * 0.45)) : width;
  const compactTabs = sideWidth < 260;
  const sidebar = h("div", { class: "sr-side" },
    h("div", { class: "sr-side-head" },
      segmented([
        { value: "outline", label: compactTabs ? icon("list", { size: 13 }) : "Outline", tip: "Outline", count: analysis?.outline.length || null },
        { value: "problems", label: compactTabs ? icon("warning", { size: 13 }) : "Problems", tip: "Problems", count: diagnostics.length || null },
        { value: "history", label: compactTabs ? icon("history", { size: 13 }) : "History", tip: "History", count: model.programHistory.length > 1 ? model.programHistory.length : null },
      ], sidebarMode, (v) => { ui.sourceSidebar = v; ctx.refresh(); }, { label: "Sidebar", testid: "source-sidebar" })),
    h("div", { class: "sr-side-body" },
      sidebarMode === "problems" ? problemsPane(ctx, diagnostics) : sidebarMode === "history" ? historyPane(ctx) : outlinePane(ctx, analysis?.outline ?? [])));
  return h("div", { class: "sr", "data-dt": "source" }, bar,
    width >= 520
      ? split({ size: sideWidth, min: 160, max: 480, onResize: (s) => setPaneSize(ctx, "source.side", s), first: sidebar, second: main })
      : split({ direction: "col", size: 170, min: 90, onResize: () => undefined, first: sidebar, second: main }));
}

export const sourceView: ViewDefinition = {
  id: "source",
  label: "Source",
  icon: "source",
  group: "app",
  hint: "Program text, diagnostics, outline, history, live editing",
  keywords: "source code program aktion edit hot reload diagnostics outline history diff revert",
  badge: (ctx) => {
    if (!can(ctx.app, "getDiagnostics")) return null;
    const count = ctx.app.getDiagnostics().filter((d) => d.severity === "error").length;
    return count > 0 ? { value: count, tone: "red" } : null;
  },
  render,
  commands: (ctx) => {
    const app = ctx.app;
    if (!app) return [];
    const out: ViewCommand[] = [
      { id: "source:edit", label: "Edit the program", icon: "edit", run: () => { ctx.ui.sourceDraft = app.getProgram(); ctx.selectTab("source"); } },
    ];
    if (can(app, "reload")) out.push({ id: "source:reload", label: "Reload the program (re-plan)", icon: "refresh", run: () => { app.reload(); ctx.toast("Program re-planned"); } });
    if (can(app, "analyzeProgram")) {
      const outline = ctx.cache("source.palette-outline", () => app.analyzeProgram().outline);
      for (const entry of outline.slice(0, 200)) {
        out.push({ id: `source:goto:${entry.kind}:${entry.name}:${entry.line}`, label: entry.kind === "effect" && entry.name.startsWith("__") ? `Go to the $effect on line ${entry.line}` : `Go to ${entry.kind} ${entry.kind === "state" ? "$" : ""}${entry.name}`, icon: "code", run: () => { ctx.ui.sourceFocusLine = entry.line; ctx.ui.sourceDraft = null; ctx.selectTab("source"); } });
      }
    }
    return out;
  },
  css: /* css */ `
.sr { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sr-file { display: inline-flex; align-items: center; gap: 6px; font-size: var(--dt-fs-sm); color: var(--dt-text-2); }
.sr-status { display: inline-flex; gap: 5px; }
.sr-code, .sr-edit, .sr-diff { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--dt-bg-0); }
.sr-edit-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 5px 12px; font-size: var(--dt-fs-sm); font-weight: 600; border-bottom: 1px solid var(--dt-border); background: var(--dt-amber-soft); }
.sr-edit-bar .t3 { font-weight: 400; }
.sr-edit-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dt-amber); }
.sr-side { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--dt-bg-1); }
.sr-side-head { flex: none; padding: 7px 8px; border-bottom: 1px solid var(--dt-border); }
.sr-side-head .seg { width: 100%; }
.sr-side-head .seg > button { flex: 1 1 0; justify-content: center; }
.sr-side-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.sr-empty { padding: 12px; font-size: var(--dt-fs-sm); }
.sr-outline { padding: 4px 0 10px; }
.sr-group-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px 3px; }
.sr-item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 10px 3px 18px; font-size: var(--dt-fs-sm); cursor: pointer; }
.sr-item:hover { background: var(--dt-bg-hover); }
.sr-item.is-on { background: var(--dt-accent-soft); }
.sr-item:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: -2px; }
.sr-problems { display: flex; flex-direction: column; }
.sr-problem { all: unset; box-sizing: border-box; display: flex; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--dt-border); cursor: pointer; font-size: var(--dt-fs-sm); line-height: 1.45; }
.sr-problem:hover { background: var(--dt-bg-hover); }
.sr-problem > svg { flex: none; margin-top: 2px; }
.sr-problem.is-error > svg { color: var(--dt-red); }
.sr-problem.is-warn > svg { color: var(--dt-amber); }
.sr-problem-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.sr-problem-meta { display: flex; align-items: center; gap: 6px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.sr-history { display: flex; flex-direction: column; }
.sr-version { padding: 9px 10px; border-bottom: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 4px; }
.sr-version.is-on { background: var(--dt-accent-soft); }
.sr-version-top { display: flex; align-items: center; gap: 6px; }
.sr-version-time { font-weight: 600; font-size: var(--dt-fs-sm); font-variant-numeric: tabular-nums; }
.sr-version-meta { font-size: var(--dt-fs-xs); display: flex; gap: 8px; }
.sr-diffstat { font-family: var(--dt-mono); }
.sr-version-actions { flex-wrap: wrap; gap: 2px; margin-left: -6px; }
.sr-dl { display: grid; grid-template-columns: 38px 38px 16px 1fr; }
.sr-dl-no { color: var(--dt-text-4); text-align: right; padding-right: 6px; font-size: 11px; user-select: none; }
.sr-dl-sign { color: var(--dt-text-3); user-select: none; }
.sr-dl.is-add { background: color-mix(in srgb, var(--dt-green) 14%, transparent); }
.sr-dl.is-add .sr-dl-sign { color: var(--dt-green); }
.sr-dl.is-del { background: color-mix(in srgb, var(--dt-red) 14%, transparent); }
.sr-dl.is-del .sr-dl-sign { color: var(--dt-red); }
.sr-fold { height: 19px; display: flex; align-items: center; padding-left: 92px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); background: var(--dt-bg-1); }
`,
};
