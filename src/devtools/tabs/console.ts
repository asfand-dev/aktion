/**
 * Console tab — captured logs, runtime diagnostics, errors, and a live REPL.
 *
 * Two halves that answer different questions.
 *
 * The **log** mirrors the page console (see `console-capture.ts`), which is
 * where the runtime's own diagnostics land — the "reactive $state write during
 * render" warning, a component whose render threw, a rejected handler. Those
 * messages are the single most direct explanation of most Aktion bugs, and they
 * are easy to miss in a page console full of everything else.
 *
 * The **REPL** evaluates an Aktion expression against the live program scope.
 * Not JavaScript: the same expression language the program is written in, with
 * the same bindings, so `$user.name`, `Util.range(0, 3)`, and `$todos.length`
 * all mean what they mean in the source. An assignment (`$count = 5`) writes
 * through the normal reactive path, so the app re-renders exactly as it would
 * from a button.
 */

import {
  FOCUS_KEY_ATTR, SCROLL_KEY_ATTR, button, chip, code, downloadText, faint,
  fmtClock, fmtCount, h, searchInput, section, spacer, textField, toggle, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import type { LogEntry } from "../model.js";
import type { LogLevel } from "../protocol.js";

const LEVELS: readonly LogLevel[] = ["log", "info", "warn", "error", "debug"];

const LEVEL_TONE: Record<string, string> = {
  log: "grey",
  info: "blue",
  warn: "amber",
  error: "red",
  debug: "purple",
};

export const consoleTab: TabDefinition = {
  id: "console",
  label: "Console",
  icon: "▤",
  hint: "Program + runtime console output, errors, and a live expression REPL",
  badge: (ctx) => {
    const problems = ctx.model.logs.filter((l) => l.level === "error").length + ctx.model.errors.length;
    return problems > 0 ? problems : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { model, ui } = ctx;

  const bar = toolbar(
    searchInput(ui.logFilter, (value) => {
      ui.logFilter = value;
      ctx.refresh();
    }, "Filter output…", { focusKey: "console-filter" }),
    h("div", { class: "filters" }, ...LEVELS.map((level) => {
      const count = model.logs.filter((entry) => entry.level === level).length;
      return toggle(
        count > 0 ? `${level} ${count}` : level,
        ui.logLevels.has(level),
        () => {
          if (ui.logLevels.has(level)) ui.logLevels.delete(level);
          else ui.logLevels.add(level);
          ctx.refresh();
        },
      );
    })),
    spacer(),
    toggle("Capture", ui.captureConsole, () => {
      ui.captureConsole = !ui.captureConsole;
      ctx.toast(ui.captureConsole ? "Console capture on" : "Console capture off");
      ctx.refresh();
    }, "Mirror the page console into this panel"),
    button("Export", () => downloadText("aktion-console.txt", exportLogs(ctx), "text/plain"), {
      title: "Download the captured output",
    }),
    button("Clear", () => {
      model.logs.length = 0;
      model.errors.length = 0;
      ctx.refresh();
    }),
  );

  const out: Node[] = [bar];

  if (model.errors.length > 0) out.push(renderRuntimeErrors(ctx));
  out.push(renderWatches(ctx));
  out.push(renderRepl(ctx));
  out.push(renderLogs(ctx));
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Logs                                                                       */
/* -------------------------------------------------------------------------- */

function renderLogs(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const filter = ui.logFilter.trim().toLowerCase();
  const rows = model.logs.filter((entry) => {
    if (!ui.logLevels.has(entry.level)) return false;
    if (filter !== "" && !entry.text.toLowerCase().includes(filter)) return false;
    return true;
  });

  if (rows.length === 0) {
    return section("Output", faint(
      model.logs.length === 0
        ? ui.captureConsole
          ? "Nothing logged yet. `console.log(...)` from the program appears here, along with every [aktion] diagnostic the runtime emits."
          : "Console capture is off."
        : "Nothing matches the active filters.",
    ));
  }

  const list = h("div", { class: "log-list" });
  for (const entry of rows.slice(-300).reverse()) {
    list.appendChild(renderLogRow(entry));
  }
  return section(`Output (${fmtCount(model.totals.logs)})`, list, { flush: true });
}

function renderLogRow(entry: LogEntry): HTMLElement {
  return h("div", { class: `console-row t-${entry.level}` },
    h("span", { class: "t" }, fmtClock(entry.time)),
    h("span", { class: "ph" }, chip(entry.level, LEVEL_TONE[entry.level] ?? "grey")),
    entry.origin === "runtime" ? chip("runtime", "purple", "Emitted by the Aktion runtime, not your program") : null,
    h("span", { class: "console-text" }, entry.text),
    entry.count > 1 ? h("span", { class: "console-count", title: `${entry.count} identical lines collapsed` }, `×${entry.count}`) : null,
    entry.stack ? h("details", { class: "console-stack" }, h("summary", {}, "stack"), h("pre", {}, entry.stack)) : null,
  );
}

/** Runtime failures the app survived, reported through the protocol. */
function renderRuntimeErrors(ctx: TabContext): HTMLElement {
  const { model } = ctx;
  return section(`Runtime errors (${model.errors.length})`, h("div", {}, ...model.errors.slice(-12).reverse().map((error) =>
    h("div", { class: "insight t-bad" },
      h("span", { class: "insight-ic" }, "✖"),
      h("span", {},
        chip(error.phase, "red"),
        " ",
        error.subject ? code(error.subject) : null,
        " ",
        error.message)))));
}

/* -------------------------------------------------------------------------- */
/*  REPL                                                                       */
/* -------------------------------------------------------------------------- */

function renderRepl(ctx: TabContext): HTMLElement {
  const { app, ui } = ctx;
  if (!can(app, "evaluateExpression")) {
    return section("Expression REPL", faint("This runtime does not support expression evaluation."));
  }

  const input = h("input", {
    class: "repl-input",
    placeholder: "$count + 1 · $user.name · Util.range(0, 3) · $count = 5",
    value: ui.replDraft,
    spellcheck: "false",
    // A stable key, so running an expression (which grows the history ABOVE the
    // input and changes the tree shape) keeps the caret in the input.
    [FOCUS_KEY_ATTR]: "repl",
  }) as HTMLInputElement;

  const run = (): void => {
    const source = input.value.trim();
    if (source === "") return;
    const result = app.evaluateExpression(source);
    ui.repl = [
      ...ui.repl.slice(-40),
      {
        input: source,
        ok: result.ok,
        output: result.ok ? (result.text ?? result.value?.preview ?? "undefined") : (result.error ?? "evaluation failed"),
        time: Date.now(),
      },
    ];
    ui.replHistory = [...ui.replHistory.filter((entry) => entry !== source), source].slice(-50);
    ui.replCursor = -1;
    ui.replDraft = "";
    ctx.refresh();
  };

  input.addEventListener("input", () => {
    ui.replDraft = input.value;
  });
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
      return;
    }
    // Up / Down walk the history, the way every REPL does. Without it, iterating
    // on an expression means retyping it.
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (ui.replHistory.length === 0) return;
      event.preventDefault();
      const last = ui.replHistory.length - 1;
      const current = ui.replCursor === -1 ? ui.replHistory.length : ui.replCursor;
      const next = event.key === "ArrowUp"
        ? Math.max(0, current - 1)
        : Math.min(ui.replHistory.length, current + 1);
      ui.replCursor = next > last ? -1 : next;
      input.value = ui.replCursor === -1 ? "" : ui.replHistory[ui.replCursor] ?? "";
      ui.replDraft = input.value;
    }
  });

  const history = h("div", { class: "repl-log", [SCROLL_KEY_ATTR]: "repl-log" });
  for (const entry of ui.repl.slice(-12)) {
    history.appendChild(h("div", { class: "repl-entry" },
      h("div", { class: "repl-in" },
        h("span", { class: "repl-caret" }, "›"),
        code(entry.input),
        spacer(),
        // Re-running is the most common next action after reading a result.
        button("↻", () => {
          ui.replDraft = entry.input;
          const result = app.evaluateExpression(entry.input);
          ui.repl = [...ui.repl.slice(-40), {
            input: entry.input,
            ok: result.ok,
            output: result.ok ? (result.text ?? result.value?.preview ?? "undefined") : (result.error ?? "evaluation failed"),
            time: Date.now(),
          }];
          ctx.refresh();
        }, { title: "Run this expression again" }),
        button("👁", () => {
          if (!ui.watches.includes(entry.input)) ui.watches = [...ui.watches, entry.input].slice(-20);
          ctx.persist();
          ctx.toast(`Watching ${entry.input}`);
          ctx.refresh();
        }, { title: "Watch this expression — it is re-evaluated on every render" })),
      h("div", { class: `repl-out ${entry.ok ? "" : "is-error"}` },
        h("span", { class: "repl-caret" }, entry.ok ? "‹" : "✖"),
        h("pre", {}, entry.output)),
    ));
  }

  return section("Expression REPL", [
    ui.repl.length > 0 ? history : null,
    h("div", { class: "repl-row" },
      h("span", { class: "repl-caret" }, "›"),
      input,
      button("Run", run, { title: "Evaluate against the live program scope (Enter)" }),
      ui.repl.length > 0
        ? button("Clear", () => {
            ui.repl = [];
            ctx.refresh();
          })
        : null),
    faint("Aktion expressions, not JavaScript — the same scope the program sees. `$atom = value` writes through the reactive pipeline. ↑ / ↓ walk history."),
  ]);
}

/**
 * Watch expressions: pinned expressions re-evaluated on every render.
 *
 * The REPL answers "what is it right now?". A watch answers "what is it doing?",
 * which is the question you actually have while clicking through a bug — and it
 * answers it without you touching the panel again.
 */
function renderWatches(ctx: TabContext): HTMLElement {
  const { app, ui } = ctx;
  const add = textField({
    focusKey: "watch-add",
    placeholder: "Watch an expression — $todos.length, $user.role …",
    onEnter: (value) => {
      const expr = value.trim();
      if (expr === "") return;
      if (!ui.watches.includes(expr)) ui.watches = [...ui.watches, expr].slice(-20);
      ctx.persist();
      ctx.refresh();
    },
  });

  const rows = ui.watches.map((expr) => {
    const result = can(app, "evaluateExpression") ? app.evaluateExpression(expr) : null;
    const text = result === null
      ? "no evaluator"
      : result.ok
        ? (result.value?.preview ?? "undefined")
        : (result.error ?? "failed");
    return h("div", { class: "watch-row" },
      h("span", { class: "watch-expr", title: expr }, expr),
      h("span", { class: `watch-val ${result?.ok === false ? "is-error" : ""}`, title: result?.text ?? text }, text),
      button("✕", () => {
        ui.watches = ui.watches.filter((entry) => entry !== expr);
        ctx.persist();
        ctx.refresh();
      }, { title: "Stop watching" }));
  });

  return section(`Watch (${ui.watches.length})`, [
    h("div", { class: "detail-head" }, add),
    ui.watches.length > 0
      ? h("div", {}, ...rows)
      : faint("Pin an expression here and it is re-evaluated on every render — the value updates as you use the app. Watches survive a page reload."),
  ]);
}

/* -------------------------------------------------------------------------- */

function exportLogs(ctx: TabContext): string {
  const lines = ctx.model.logs.map((entry) =>
    `${new Date(entry.time).toISOString()} [${entry.level}] ${entry.origin === "runtime" ? "(runtime) " : ""}${entry.text}${entry.count > 1 ? ` (×${entry.count})` : ""}`);
  for (const error of ctx.model.errors) {
    lines.push(`${new Date().toISOString()} [error] (${error.phase}) ${error.subject ?? ""} ${error.message}`);
  }
  return lines.join("\n");
}


