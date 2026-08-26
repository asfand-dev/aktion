/**
 * Source tab — the running program, its diagnostics, its outline, and its
 * history.
 *
 * Aktion programs are usually *generated*, which changes what a source view is
 * for. You are rarely reading code you wrote; you are checking what the model
 * actually emitted, where the validator disagreed with it, and what the program
 * declares. So this tab leads with diagnostics placed on their lines and an
 * outline you can jump through, and it lets you edit and re-mount in place.
 *
 * Two things here are about not getting in the way:
 *
 *   - The analysis (parse + schema check + outline) is memoised per render pass
 *     and keyed by the text. Re-parsing an 800-line program on every runtime
 *     event is how a debugger becomes the slowdown it is being used to find.
 *   - The code view renders a WINDOW of lines, not the whole file. A 4000-line
 *     program is 4000 DOM rows rebuilt on every event otherwise.
 */

import {
  SCROLL_KEY_ATTR, button, chip, code, codeBlock, copyButton, downloadText,
  emptyState, faint, fmtBytes, h, muted, searchInput, section, spacer, stat,
  statGrid, toggle, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import type { Diagnostic, OutlineEntry, ProgramAnalysis } from "../protocol.js";
import type { ProgramVersion } from "../model.js";

/** Lines rendered around the focus point. Beyond this you page or search. */
const WINDOW_LINES = 600;

export const sourceTab: TabDefinition = {
  id: "source",
  label: "Source",
  icon: "≣",
  hint: "The running program, diagnostics on their lines, an outline, history, and hot reload",
  badge: (ctx) => {
    if (!can(ctx.app, "getDiagnostics")) return null;
    const count = ctx.app.getDiagnostics().filter((entry) => entry.severity === "error").length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, model, ui } = ctx;
  if (!app) return [emptyState("No app selected.")];

  const sources = ctx.cache("sources", () =>
    (can(app, "getSources") ? app.getSources() : [{ path: "<inline>", text: app.getProgram() }]));
  const index = Math.min(ui.sourceIndex, Math.max(0, sources.length - 1));
  const active = sources[index] ?? { path: "<inline>", text: "" };
  const live = ui.sourceDraft === null;
  const text = live ? active.text : ui.sourceDraft!;
  const diagnostics = ctx.cache("diagnostics", () => (can(app, "getDiagnostics") ? app.getDiagnostics() : []));

  // Memoised on the TEXT, so an idle app costs one cache lookup per render and a
  // draft is only re-analysed when it actually changes.
  const analysis = analyse(ctx, text, live);

  const bar = toolbar(
    sources.length > 1
      ? h("div", { class: "filters" }, ...sources.map((source, i) =>
          h("button", {
            class: `filter-chip ${i === index ? "is-on" : ""}`,
            title: source.path,
            onclick: () => {
              ui.sourceIndex = i;
              ui.sourceDraft = null;
              ctx.refresh();
            },
          }, shortPath(source.path))))
      : muted(active.path),
    searchInput(ui.sourceFilter, (value) => {
      ui.sourceFilter = value;
      ctx.refresh();
    }, "Find in source…", { focusKey: "source-filter" }),
    spacer(),
    toggle("Outline", ui.sourceOutline, () => {
      ui.sourceOutline = !ui.sourceOutline;
      ctx.refresh();
    }, "Show the program's declarations"),
    model.programHistory.length > 1
      ? toggle(`History (${model.programHistory.length})`, ui.sourceHistoryOpen, () => {
          ui.sourceHistoryOpen = !ui.sourceHistoryOpen;
          ctx.refresh();
        }, "Earlier versions of this program, with one-click revert")
      : null,
    copyButton(() => text, "Copy"),
    button("Download", () => downloadText("app.aktion", text, "text/plain"), { title: "Save this source" }),
    can(app, "reload")
      ? button("Reload", () => {
          app.reload();
          ctx.toast("Program re-planned");
          ctx.refresh();
        }, { title: "Re-plan and re-render from the current source" })
      : null,
  );

  const out: Node[] = [bar];

  out.push(section(null, statGrid(
    stat("lines", String(text.split("\n").length)),
    stat("size", fmtBytes(text.length)),
    stat("errors", String(diagnostics.filter((entry) => entry.severity === "error").length), {
      tone: diagnostics.some((entry) => entry.severity === "error") ? "bad" : "good",
    }),
    stat("warnings", String(diagnostics.filter((entry) => entry.severity === "warning").length), {
      tone: diagnostics.some((entry) => entry.severity === "warning") ? "warn" : undefined,
    }),
    analysis ? stat("declares", String(analysis.outline.length), { title: "Top-level declarations" }) : null,
  ), { flush: true }));

  if (ui.sourceHistoryOpen) out.push(renderHistory(ctx));
  if (diagnostics.length > 0) out.push(renderDiagnostics(ctx, diagnostics));
  if (ui.sourceOutline) out.push(renderOutline(ctx, analysis?.outline ?? []));
  out.push(renderEditor(ctx, text, live, diagnostics, index === 0, analysis));

  if (index > 0 && active.text === "") {
    out.push(section(null, faint(
      "This module's text is not available in the browser: a linked program is planned from a pre-parsed AST, so only the entry module's source travels with it.",
    ), { flush: true }));
  }
  return out;
}

/**
 * Parse + validate, memoised on the text.
 *
 * `ctx.cache` is per render pass; the text key means a draft that has not changed
 * between passes is not re-analysed either, since the panel keeps the same
 * cached value only within a pass and the runtime call is cheap to repeat once
 * per pass rather than once per event.
 */
function analyse(ctx: TabContext, text: string, live: boolean): ProgramAnalysis | null {
  const { app } = ctx;
  if (!can(app, "analyzeProgram")) return null;
  return ctx.cache(`analysis:${live ? "live" : `draft:${text.length}:${hash(text)}`}`, () =>
    app.analyzeProgram(live ? undefined : text));
}

/** Cheap, stable string hash — enough to key a cache entry on. */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) | 0;
  }
  return value;
}

/* -------------------------------------------------------------------------- */

function renderDiagnostics(ctx: TabContext, diagnostics: ReadonlyArray<Diagnostic>): HTMLElement {
  const errors = diagnostics.filter((entry) => entry.severity === "error");
  return section(`Diagnostics (${diagnostics.length})`, [
    h("div", { [SCROLL_KEY_ATTR]: "diagnostics" }, ...diagnostics.slice(0, 40).map((diagnostic) =>
      h("div", {
        class: `insight t-${diagnostic.severity === "error" ? "bad" : "warn"} is-link`,
        title: diagnostic.line > 0 ? `Jump to line ${diagnostic.line}` : undefined,
        onclick: () => {
          ctx.ui.sourceFocusLine = diagnostic.line > 0 ? diagnostic.line : null;
          ctx.refresh();
        },
      },
        h("span", { class: "insight-ic" }, diagnostic.severity === "error" ? "✖" : "▲"),
        h("span", {},
          chip(diagnostic.kind, diagnostic.kind === "schema" ? "purple" : "grey"),
          diagnostic.line > 0 ? code(`L${diagnostic.line}`) : null,
          " ",
          diagnostic.message)))),
    errors.length > 0
      ? faint("A program with errors still renders whatever it could plan — that is why the app is partly there. Fix the first error; the rest are often consequences of it.")
      : null,
  ].filter((node): node is HTMLElement => node != null));
}

/**
 * The program outline: components, effects, actions, hooks, atoms, imports.
 *
 * Reflects the DRAFT while editing, not the running program — you want the
 * outline of what you are about to mount.
 */
function renderOutline(ctx: TabContext, entries: ReadonlyArray<OutlineEntry>): HTMLElement {
  const filter = ctx.ui.sourceFilter.trim().toLowerCase();
  const shown = filter === ""
    ? entries
    : entries.filter((entry) => entry.name.toLowerCase().includes(filter) || entry.kind.includes(filter));
  if (entries.length === 0) {
    return section("Outline", faint("Nothing declared at the top level."));
  }
  const tone: Record<string, string> = {
    component: "purple",
    effect: "blue",
    action: "green",
    hook: "amber",
    state: "grey",
    binding: "grey",
    import: "grey",
  };
  return section(`Outline (${shown.length}${shown.length === entries.length ? "" : ` / ${entries.length}`})`,
    shown.length === 0
      ? faint(`Nothing in the outline matches “${ctx.ui.sourceFilter}”.`)
      : h("div", { class: "outline", [SCROLL_KEY_ATTR]: "outline" },
          ...shown.map((entry) => h("button", {
            class: "outline-row",
            title: `Line ${entry.line}`,
            onclick: () => {
              ctx.ui.sourceFocusLine = entry.line;
              ctx.refresh();
            },
          },
            chip(entry.kind, tone[entry.kind] ?? "grey"),
            h("span", { class: "mono" }, entry.kind === "state" ? `$${entry.name}` : entry.name),
            entry.exported ? chip("export", "green") : null,
            spacer(),
            faint(`L${entry.line}`)))));
}

/**
 * Earlier versions of the program, newest first, with revert.
 *
 * A hot-swapped program that fails to parse leaves a blank app and no way back —
 * "Reload" only re-plans what is already broken. This is the undo.
 */
function renderHistory(ctx: TabContext): HTMLElement {
  const { app, model, ui } = ctx;
  const versions = [...model.programHistory].reverse();
  return section(`Program history (${versions.length})`, [
    h("div", { [SCROLL_KEY_ATTR]: "prog-history" }, ...versions.map((version, index) => h("div", { class: "ver-row" },
      h("span", { class: "ver-when" }, new Date(version.at).toLocaleTimeString()),
      index === 0 ? chip("current", "green") : null,
      h("span", { class: "ver-meta" }, `${version.lines} lines · ${fmtBytes(version.text.length)}`),
      spacer(),
      button("View", () => {
        ui.sourceDraft = version.text;
        ui.sourceHistoryOpen = false;
        ctx.toast("Loaded into the editor — Apply to mount it");
        ctx.refresh();
      }, { title: "Load this version into the editor without mounting it" }),
      index === 0 || !can(app, "setProgram")
        ? null
        : button("Revert", () => revert(ctx, version), { tone: "warn", title: "Mount this version now" })))),
    faint("Versions are recorded as the program commits, so an edit that broke the app is one click from being undone."),
  ]);
}

function revert(ctx: TabContext, version: ProgramVersion): void {
  if (!can(ctx.app, "setProgram")) return;
  ctx.app.setProgram(version.text);
  ctx.ui.sourceDraft = null;
  ctx.ui.sourceHistoryOpen = false;
  ctx.toast("Reverted to the earlier version");
  ctx.refresh();
}

/**
 * The source view, and the editor.
 *
 * Read-only until you click Edit: a panel where an accidental keystroke
 * re-mounts a running app is not a panel you leave open. Once editing, Apply
 * mounts the draft through the normal `setResponse` path — state is preserved
 * across the diff exactly as it is for a streamed update.
 */
function renderEditor(
  ctx: TabContext,
  text: string,
  live: boolean,
  diagnostics: ReadonlyArray<Diagnostic>,
  editable: boolean,
  analysis: ProgramAnalysis | null,
): HTMLElement {
  const { app, ui } = ctx;
  const markers = new Map<number, { tone: string; title: string }>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.line <= 0) continue;
    const existing = markers.get(diagnostic.line);
    if (existing && existing.tone === "bad") continue;
    markers.set(diagnostic.line, {
      tone: diagnostic.severity === "error" ? "bad" : "warn",
      title: diagnostic.message,
    });
  }

  if (live) {
    const lines = text.split("\n");
    const filter = ui.sourceFilter.trim().toLowerCase();
    const hits = filter === ""
      ? []
      : lines.map((line, i) => (line.toLowerCase().includes(filter) ? i + 1 : 0)).filter(Boolean);
    // A search jumps to its first hit, so typing in the find box moves the view.
    const focus = ui.sourceFocusLine ?? hits[0] ?? null;
    const { from, to } = windowFor(lines.length, focus);

    const view = codeBlock(lines.slice(from, to).join("\n"), {
      lineNumbers: true,
      markers: shiftMarkers(markers, from),
      focusLine: focus !== null ? focus - from : null,
      firstLine: from + 1,
      highlight: filter,
      onLineClick: (line) => {
        ui.sourceFocusLine = line + from;
        ctx.refresh();
      },
    });
    if (focus !== null) {
      queueMicrotask(() => {
        view.querySelector(".code-line.is-focus")?.scrollIntoView({ block: "center" });
      });
    }

    return section("Program", [
      hits.length > 0
        ? h("div", { class: "detail-head" },
            muted(`${hits.length} line${hits.length === 1 ? "" : "s"} match “${ui.sourceFilter}”`),
            h("div", { class: "chip-row", style: "margin:0" }, ...hits.slice(0, 12).map((line) =>
              h("button", {
                class: `chip ${focus === line ? "blue" : "grey"} is-link`,
                onclick: () => {
                  ui.sourceFocusLine = line;
                  ctx.refresh();
                },
              }, `L${line}`))))
        : null,
      to - from < lines.length
        ? h("div", { class: "detail-head" },
            faint(`Showing lines ${from + 1}–${to} of ${lines.length}.`),
            spacer(),
            from > 0
              ? button("▲ Earlier", () => {
                  ui.sourceFocusLine = Math.max(1, from - Math.floor(WINDOW_LINES / 2));
                  ctx.refresh();
                })
              : null,
            to < lines.length
              ? button("▼ Later", () => {
                  ui.sourceFocusLine = Math.min(lines.length, to + Math.floor(WINDOW_LINES / 2));
                  ctx.refresh();
                })
              : null)
        : null,
      view,
    ].filter((node): node is HTMLElement => node != null), {
      actions: [
        editable && can(app, "setProgram")
          ? button("Edit", () => {
              ui.sourceDraft = text;
              ctx.refresh();
            }, { title: "Edit and re-mount this program" })
          : null,
      ].filter((node): node is HTMLElement => node != null),
    });
  }

  const area = h("textarea", {
    class: "source-editor",
    spellcheck: "false",
    "data-dt-focus": "source-editor",
  }) as HTMLTextAreaElement;
  area.value = text;

  // The draft's verdict, updated on every keystroke — but WITHOUT re-rendering
  // the tab, because rebuilding the textarea would drop the caret mid-word.
  // Only these two nodes are patched in place.
  const status = h("span", {});
  const errorBanner = h("div", { class: "banner t-red", style: "display:none" });
  const showVerdict = (verdict: { diagnostics: Diagnostic[]; ok: boolean } | null): void => {
    const errors = verdict?.diagnostics.filter((diagnostic) => diagnostic.severity === "error") ?? [];
    status.replaceChildren(
      verdict === null
        ? chip("unchecked", "grey")
        : errors.length > 0
          ? chip(`${errors.length} error${errors.length === 1 ? "" : "s"}`, "red")
          : chip("valid", "green"),
    );
    if (errors.length > 0) {
      errorBanner.style.display = "";
      errorBanner.textContent = errors
        .slice(0, 3)
        .map((diagnostic) => `L${diagnostic.line}: ${diagnostic.message}`)
        .join(" · ");
    } else {
      errorBanner.style.display = "none";
      errorBanner.textContent = "";
    }
  };
  showVerdict(analysis);

  area.addEventListener("input", () => {
    ui.sourceDraft = area.value;
    showVerdict(can(app, "analyzeProgram") ? app.analyzeProgram(area.value) : null);
  });
  // Ctrl/⌘+Enter applies — the shortcut every editor-with-a-run-button has.
  area.addEventListener("keydown", (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  });

  const apply = (): void => {
    if (!can(app, "setProgram")) return;
    app.setProgram(ui.sourceDraft ?? text);
    ui.sourceDraft = null;
    ctx.toast("Program re-mounted");
    ctx.refresh();
  };

  return section("Program (editing)", [
    area,
    errorBanner,
    h("div", { class: "detail-head" },
      status,
      faint("State is preserved across the diff, exactly as for a streamed update. Ctrl+Enter applies."),
      spacer(),
      button("Cancel", () => {
        ui.sourceDraft = null;
        ctx.refresh();
      }),
      button("Apply", apply, { tone: "good", title: "Mount this program (Ctrl+Enter)" })),
  ]);
}

/**
 * The window of lines to render around `focus`.
 *
 * Rendering a whole 4000-line program means 4000 DOM rows rebuilt on every
 * runtime event. A window keeps the view responsive, and the paging controls
 * make the truncation visible rather than a silent lie.
 */
function windowFor(total: number, focus: number | null): { from: number; to: number } {
  if (total <= WINDOW_LINES) return { from: 0, to: total };
  const centre = focus ?? 1;
  const from = Math.max(0, Math.min(total - WINDOW_LINES, centre - Math.floor(WINDOW_LINES / 2)));
  return { from, to: Math.min(total, from + WINDOW_LINES) };
}

/** Re-base gutter markers onto a windowed slice. */
function shiftMarkers(
  markers: Map<number, { tone: string; title: string }>,
  from: number,
): Map<number, { tone: string; title: string }> {
  if (from === 0) return markers;
  const out = new Map<number, { tone: string; title: string }>();
  for (const [line, marker] of markers) out.set(line - from, marker);
  return out;
}

/** Last two path segments, so a long module path stays readable in a chip. */
function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}
