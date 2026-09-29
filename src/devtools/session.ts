/**
 * Aktion DevTools — session export, import, and bug reports.
 *
 * One JSON file holds everything the panel captured: the program, the state,
 * every event, and the totals. It is what a QA engineer attaches to a ticket —
 * and, new in protocol 3, what a developer IMPORTS back into the panel to
 * inspect that session offline: the timeline, the commits, the requests, and
 * the state history, exactly as they happened on the other machine.
 */

import type { AktionDevtoolsHook, DevtoolsAppRecord } from "./hook.js";
import { emptyModel, type AppModel, type NetworkRequest } from "./model.js";
import type { CommitRecord, EffectEvent, EmitEvent, ErrorEvent, RouteEvent } from "./protocol.js";
import type { RecordedStep } from "./recorder.js";

/** What an export needs — a structural subset of the view context. */
export interface SessionSource {
  model: AppModel;
  hook: Pick<AktionDevtoolsHook, "protocolVersion" | "libraryVersion">;
  app: DevtoolsAppRecord | null;
}

export const SESSION_FORMAT = "aktion-devtools-session";

/** The whole session as pretty-printed JSON. */
export function exportSessionJson(ctx: SessionSource, extras: { steps?: ReadonlyArray<RecordedStep>; note?: string } = {}): string {
  const { model } = ctx;
  const payload = {
    format: SESSION_FORMAT,
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    protocolVersion: ctx.hook.protocolVersion,
    libraryVersion: ctx.hook.libraryVersion,
    environment: environment(),
    app: ctx.app ? { id: ctx.app.id, label: ctx.app.label } : null,
    note: extras.note,
    program: safe(() => ctx.app?.getProgram() ?? null, null),
    diagnostics: safe(() => (typeof ctx.app?.getDiagnostics === "function" ? ctx.app.getDiagnostics() : []), []),
    stats: safe(() => (typeof ctx.app?.getStats === "function" ? ctx.app.getStats() : null), null),
    route: safe(() => (typeof ctx.app?.getRoute === "function" ? ctx.app.getRoute() : null), null),
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
    history: model.history,
    steps: extras.steps ?? [],
    // The program history cannot be reconstructed from the events, and it is
    // exactly what an "it broke after my edit" report needs.
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
    return JSON.stringify({ ...payload, state: "<unserialisable>", history: [] }, null, 2);
  }
}

export interface ImportedSession {
  label: string;
  model: AppModel;
  program: string | null;
  exportedAt: string | null;
  environment: Record<string, unknown> | null;
  steps: RecordedStep[];
  note?: string;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Rebuild a model from an exported session. Tolerant by design: a file from an
 * older panel (no `format` field) or a truncated one imports what it has.
 */
export function importSessionJson(text: string, fileName = "session.json"): ImportedSession {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("Not a session file: expected a JSON object.");
  if (raw.format !== undefined && raw.format !== SESSION_FORMAT) throw new Error(`Not an Aktion DevTools session (format "${String(raw.format)}").`);
  if (!Array.isArray(raw.commits) && !Array.isArray(raw.network) && !raw.state) {
    throw new Error("Not an Aktion DevTools session: no commits, requests, or state.");
  }
  const model = emptyModel();
  model.commits = asArray<CommitRecord>(raw.commits);
  model.effects = asArray<EffectEvent>(raw.effects);
  model.network = asArray<NetworkRequest>(raw.network);
  model.routes = asArray<RouteEvent>(raw.routes);
  model.emits = asArray<EmitEvent>(raw.emits);
  model.errors = asArray<ErrorEvent>(raw.errors);
  model.logs = asArray(raw.logs);
  model.longTasks = asArray(raw.longTasks);
  model.history = asArray(raw.history);
  model.state = raw.state && typeof raw.state === "object" ? (raw.state as Record<string, unknown>) : {};
  if (raw.totals && typeof raw.totals === "object") model.totals = { ...model.totals, ...(raw.totals as AppModel["totals"]) };
  const versions = asArray<{ at?: string; text?: string; lines?: number }>(raw.programVersions);
  model.programHistory = versions
    .filter((v) => typeof v.text === "string")
    .map((v) => ({ text: v.text!, at: v.at ? Date.parse(v.at) || Date.now() : Date.now(), lines: v.lines ?? v.text!.split("\n").length }));
  for (const commit of model.commits) {
    for (const record of commit.components ?? []) {
      if (record.phase !== "memo") model.renderCounts.set(record.instanceKey, (model.renderCounts.get(record.instanceKey) ?? 0) + 1);
    }
  }
  const times = [
    ...model.commits.map((c) => c.startTime),
    ...model.effects.map((e) => e.time),
    ...model.network.map((r) => r.startTime),
    ...model.routes.map((r) => r.time),
    ...model.errors.map((e) => e.time),
  ].filter((t) => Number.isFinite(t));
  model.firstTime = times.length > 0 ? Math.min(...times) : null;
  model.lastTime = times.length > 0 ? Math.max(...times) : 0;
  model.rev += 1;
  const app = raw.app as { label?: string } | null;
  const program = typeof raw.program === "string" ? raw.program : model.programHistory[model.programHistory.length - 1]?.text ?? null;
  if (program && model.programHistory.length === 0) model.programHistory.push({ text: program, at: Date.now(), lines: program.split("\n").length });
  return {
    label: `${app?.label ?? "Imported app"} · ${fileName}`,
    model,
    program,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
    environment: raw.environment && typeof raw.environment === "object" ? (raw.environment as Record<string, unknown>) : null,
    steps: asArray<RecordedStep>(raw.steps),
    note: typeof raw.note === "string" ? raw.note : undefined,
  };
}

/**
 * A bug report a person can paste into a ticket: what happened, where, and the
 * evidence — errors, failed requests, the steps that reproduce it — in Markdown.
 */
export function bugReportMarkdown(ctx: SessionSource, extras: { steps?: ReadonlyArray<RecordedStep>; title?: string; vitals?: string[] } = {}): string {
  const { model } = ctx;
  const env = environment();
  const lines: string[] = [];
  lines.push(`## ${extras.title ?? `Bug report — ${ctx.app?.label ?? "Aktion app"}`}`);
  lines.push("");
  lines.push("**Environment**");
  lines.push("");
  lines.push(`- URL: ${String(env.url ?? "")}`);
  lines.push(`- Browser: ${String(env.userAgent ?? "")}`);
  lines.push(`- Viewport: ${String(env.viewport ?? "")} @${String(env.devicePixelRatio ?? 1)}x`);
  lines.push(`- Aktion runtime: ${ctx.hook.libraryVersion} (DevTools protocol ${ctx.hook.protocolVersion})`);
  const route = safe(() => (typeof ctx.app?.getRoute === "function" ? ctx.app.getRoute().path : null), null);
  if (route) lines.push(`- Route: \`${route}\``);
  lines.push(`- Captured: ${new Date().toISOString()}`);
  if (extras.steps && extras.steps.length > 0) {
    lines.push("", "**Steps to reproduce**", "");
    extras.steps.forEach((step, i) => lines.push(`${i + 1}. ${step.label}`));
  }
  const errors = model.errors.slice(-10);
  const errorLogs = model.logs.filter((l) => l.level === "error").slice(-10);
  if (errors.length > 0 || errorLogs.length > 0) {
    lines.push("", "**Errors**", "", "```");
    for (const error of errors) lines.push(`[${error.phase}] ${error.subject ? `${error.subject}: ` : ""}${error.message}`);
    for (const log of errorLogs) lines.push(`[console.error] ${log.text}${log.count > 1 ? ` (×${log.count})` : ""}`);
    lines.push("```");
  }
  const warnings = model.logs.filter((l) => l.level === "warn").slice(-6);
  if (warnings.length > 0) {
    lines.push("", "**Warnings**", "", "```");
    for (const log of warnings) lines.push(log.text.length > 300 ? `${log.text.slice(0, 300)}…` : log.text);
    lines.push("```");
  }
  const failed = model.network.filter((r) => r.phase === "error" || r.phase === "blocked" || (r.status ?? 0) >= 400).slice(-10);
  if (failed.length > 0) {
    lines.push("", "**Failed requests**", "", "| Method | URL | Status | Time |", "| --- | --- | --- | --- |");
    for (const request of failed) {
      lines.push(`| ${request.method} | \`${request.url.replace(/\|/g, "\\|")}\` | ${request.status ?? request.error ?? request.phase} | ${request.duration !== undefined ? `${Math.round(request.duration)}ms` : "—"} |`);
    }
  }
  if (extras.vitals && extras.vitals.length > 0) {
    lines.push("", "**Performance**", "");
    for (const line of extras.vitals) lines.push(`- ${line}`);
  }
  lines.push("", "**State at capture**", "", "```json");
  let state: string;
  try {
    state = JSON.stringify(model.state, null, 2);
  } catch {
    state = "<unserialisable>";
  }
  lines.push(state.length > 4000 ? `${state.slice(0, 4000)}\n… (truncated — attach the session file for the full state)` : state);
  lines.push("```", "", "_Generated by Aktion DevTools. Attach the exported session (.json) to replay this in the panel._");
  return lines.join("\n");
}

function environment(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  return {
    url: typeof location !== "undefined" ? location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    language: typeof navigator !== "undefined" ? navigator.language : "",
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    colorScheme: typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
