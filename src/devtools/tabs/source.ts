/**
 * Source tab — the running program, its diagnostics, and its outline.
 *
 * Aktion programs are usually *generated*, which changes what a source view is
 * for. You are rarely reading code you wrote; you are checking what the model
 * actually emitted, where the validator disagreed with it, and what the program
 * declares. So this tab leads with diagnostics placed on their lines and an
 * outline you can jump through, and it lets you edit and re-mount in place —
 * the fastest way to test "would it work if that prop were spelled right?".
 */

import {
  button, chip, code, codeBlock, copyButton, downloadText, emptyState, faint,
  fmtBytes, h, muted, section, spacer, stat, statGrid, toggle, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import type { Diagnostic, OutlineEntry } from "../protocol.js";

export const sourceTab: TabDefinition = {
  id: "source",
  label: "Source",
  icon: "≣",
  hint: "The running program, diagnostics on their lines, an outline, and hot reload",
  badge: (ctx) => {
    if (!can(ctx.app, "getDiagnostics")) return null;
    const count = ctx.app.getDiagnostics().filter((d) => d.severity === "error").length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  if (!app) return [emptyState("No app selected.")];

  const sources = can(app, "getSources") ? app.getSources() : [{ path: "<inline>", text: app.getProgram() }];
  const index = Math.min(ui.sourceIndex, Math.max(0, sources.length - 1));
  const active = sources[index] ?? { path: "<inline>", text: "" };
  const live = ui.sourceDraft === null;
  const text = live ? active.text : ui.sourceDraft!;
  const diagnostics = can(app, "getDiagnostics") ? app.getDiagnostics() : [];

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
    spacer(),
    toggle("Outline", ui.sourceOutline, () => {
      ui.sourceOutline = !ui.sourceOutline;
      ctx.refresh();
    }, "Show the program's declarations"),
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
    stat("errors", String(diagnostics.filter((d) => d.severity === "error").length), {
      tone: diagnostics.some((d) => d.severity === "error") ? "bad" : "good",
    }),
    stat("warnings", String(diagnostics.filter((d) => d.severity === "warning").length), {
      tone: diagnostics.some((d) => d.severity === "warning") ? "warn" : undefined,
    }),
  ), { flush: true }));

  // The outline (and the draft's validity) comes from the runtime's own parser
  // via `analyzeProgram`, so the panel never carries a second parser that could
  // disagree with the one that mounts the program.
  const analysis = can(app, "analyzeProgram") ? app.analyzeProgram(live ? undefined : text) : null;

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

/* -------------------------------------------------------------------------- */

function renderDiagnostics(ctx: TabContext, diagnostics: ReadonlyArray<Diagnostic>): HTMLElement {
  return section(`Diagnostics (${diagnostics.length})`, h("div", {}, ...diagnostics.slice(0, 40).map((diagnostic) =>
    h("div", {
      class: `insight t-${diagnostic.severity === "error" ? "bad" : "warn"} is-link`,
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
        diagnostic.message)))));
}

/**
 * The program outline: components, effects, actions, hooks, atoms, imports.
 *
 * Reflects the DRAFT while editing, not the running program — you want the
 * outline of what you are about to mount.
 */
function renderOutline(ctx: TabContext, entries: ReadonlyArray<OutlineEntry>): HTMLElement {
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
  return section(`Outline (${entries.length})`, h("div", { class: "outline" },
    ...entries.map((entry) => h("button", {
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
  analysis: { diagnostics: Diagnostic[]; ok: boolean } | null,
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
    const view = codeBlock(text, {
      lineNumbers: true,
      markers,
      focusLine: ui.sourceFocusLine,
      onLineClick: (line) => {
        ui.sourceFocusLine = line;
        ctx.refresh();
      },
    });
    // Scroll the focused line into view after the panel has laid out.
    if (ui.sourceFocusLine !== null) {
      queueMicrotask(() => {
        view.querySelector(".code-line.is-focus")?.scrollIntoView({ block: "center" });
      });
    }
    return section("Program", view, {
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

  const area = h("textarea", { class: "source-editor", spellcheck: "false" }) as HTMLTextAreaElement;
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

  return section("Program (editing)", [
    area,
    errorBanner,
    h("div", { class: "detail-head" },
      status,
      faint("State is preserved across the diff, exactly as it is for a streamed update."),
      spacer(),
      button("Cancel", () => {
        ui.sourceDraft = null;
        ctx.refresh();
      }),
      button("Apply", () => {
        if (!can(app, "setProgram")) return;
        app.setProgram(ui.sourceDraft ?? text);
        ui.sourceDraft = null;
        ctx.toast("Program re-mounted");
        ctx.refresh();
      }, { tone: "good", title: "Mount this program" })),
  ]);
}

/** Last two path segments, so a long module path stays readable in a chip. */
function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}
