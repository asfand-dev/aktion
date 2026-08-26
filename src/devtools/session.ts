/**
 * Aktion DevTools — session export.
 *
 * One JSON file holding everything the panel captured: the program, the state,
 * every event, and the totals. It is what you attach to a bug report, and what a
 * future replay tool would consume — which is why it carries the raw protocol
 * records rather than the panel's formatted rows.
 *
 * Lives in its own module because two places offer it (the Timeline tab's button
 * and the command palette) and neither should own it.
 */

import type { TabContext } from "./context.js";

/** The whole session as pretty-printed JSON. */
export function exportSessionJson(ctx: TabContext): string {
  const { model } = ctx;
  const payload = {
    exportedAt: new Date().toISOString(),
    protocolVersion: ctx.hook.protocolVersion,
    libraryVersion: ctx.hook.libraryVersion,
    app: ctx.app ? { id: ctx.app.id, label: ctx.app.label } : null,
    program: safeProgram(ctx),
    diagnostics: typeof ctx.app?.getDiagnostics === "function" ? ctx.app.getDiagnostics() : [],
    stats: typeof ctx.app?.getStats === "function" ? ctx.app.getStats() : null,
    route: typeof ctx.app?.getRoute === "function" ? ctx.app.getRoute() : null,
    state: model.state,
    totals: model.totals,
    commits: model.commits,
    effects: model.effects,
    network: model.network,
    routes: model.routes,
    emits: model.emits,
    errors: model.errors,
    logs: model.logs,
    longTasks: model.longTasks,
    // The program history is the one thing that cannot be reconstructed from the
    // events, and it is exactly what a "it broke after my edit" report needs.
    programVersions: model.programHistory.map((version) => ({
      at: new Date(version.at).toISOString(),
      lines: version.lines,
      text: version.text,
    })),
  };
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    // A snapshot holding something unserialisable should still produce a usable
    // export of everything else.
    return JSON.stringify({ ...payload, state: "<unserialisable>" }, null, 2);
  }
}

function safeProgram(ctx: TabContext): string | null {
  try {
    return ctx.app?.getProgram() ?? null;
  } catch {
    return null;
  }
}
