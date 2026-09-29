/**
 * Aktion DevTools — insights.
 *
 * Numbers are not advice. Each rule here turns a measurement into a sentence
 * that names the component, the evidence, and the fix — "CartRow averages
 * 9.4ms across 40 instances; move the price formatting into a $memo" — and
 * points at the view that proves it. Thresholds are deliberately conservative:
 * an insight that cries wolf on a healthy app teaches people to ignore the
 * panel.
 */

import type { AppModel } from "../model.js";
import { componentAggregates } from "../model.js";
import type { Diagnostic } from "../protocol.js";
import type { TabId } from "../context.js";
import type { VitalsSnapshot } from "./vitals.js";

export type InsightTone = "bad" | "warn" | "info" | "good";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  fix?: string;
  /** Where the evidence is. */
  tab?: TabId;
  /** A component name to filter by, when the insight is about one. */
  component?: string;
  commitId?: number;
}

/** Commits per second over the most recent `window` commits (needs at least 5). */
export function commitRate(model: AppModel, window = 20): number {
  const recent = model.commits.slice(-window);
  if (recent.length < 5) return 0;
  const span = recent[recent.length - 1]!.startTime - recent[0]!.startTime;
  if (span <= 0) return 0;
  return (recent.length - 1) / (span / 1000);
}

/** Health issues for the Overview: errors first, then warnings, then hints. */
export function healthIssues(model: AppModel, diagnostics: ReadonlyArray<Diagnostic>): Insight[] {
  const out: Insight[] = [];
  const errorDiagnostics = diagnostics.filter((d) => d.severity === "error");
  if (errorDiagnostics.length > 0) {
    const first = errorDiagnostics[0]!;
    out.push({
      id: "program-errors", tone: "bad", tab: "source",
      title: `${errorDiagnostics.length} program error${errorDiagnostics.length === 1 ? "" : "s"}`,
      detail: `${first.line ? `Line ${first.line}: ` : ""}${first.message}`,
      fix: "Fix the first one first — later errors are often its echo.",
    });
  }
  if (model.errors.length > 0) {
    const last = model.errors[model.errors.length - 1]!;
    out.push({
      id: "runtime-errors", tone: "bad", tab: "console",
      title: `${model.errors.length} runtime error${model.errors.length === 1 ? "" : "s"}`,
      detail: `${last.phase}${last.subject ? ` · ${last.subject}` : ""}: ${last.message}`,
    });
  }
  let errorLogs = 0;
  let warnLogs = 0;
  let firstWarn = "";
  for (const log of model.logs) {
    if (log.level === "error") errorLogs += log.count;
    if (log.level === "warn") {
      warnLogs += log.count;
      if (!firstWarn) firstWarn = log.text;
    }
  }
  if (errorLogs > 0) out.push({ id: "console-errors", tone: "bad", tab: "console", title: `${errorLogs} console error${errorLogs === 1 ? "" : "s"}`, detail: "Logged by the program, the runtime, or an uncaught exception." });
  const failed = model.network.filter((r) => r.phase === "error" || r.phase === "blocked" || (r.status ?? 0) >= 400);
  if (failed.length > 0) {
    const last = failed[failed.length - 1]!;
    out.push({
      id: "failed-requests", tone: failed.some((r) => (r.status ?? 0) >= 500 || r.phase === "error") ? "bad" : "warn", tab: "network",
      title: `${failed.length} failed request${failed.length === 1 ? "" : "s"}`,
      detail: `${last.method} ${last.url} → ${last.status ?? last.error ?? last.phase}`,
    });
  }
  if (warnLogs > 0) {
    out.push({
      id: "warnings", tone: "warn", tab: "console",
      title: `${warnLogs} warning${warnLogs === 1 ? "" : "s"}`,
      detail: firstWarn.length > 160 ? `${firstWarn.slice(0, 160)}…` : firstWarn,
      fix: "Runtime warnings (prefixed [aktion]) are usually the direct explanation of a reactivity bug.",
    });
  }
  const rate = commitRate(model);
  if (rate > 30) {
    out.push({
      id: "commit-loop", tone: "bad", tab: "profiler",
      title: `Commits at ${rate.toFixed(0)}/s`,
      detail: "Something is writing state in a loop — an effect that writes what it reads, or an interval that is too fast.",
      fix: "Check the Effects view for a hot trigger and State → sort by activity for the atom being churned.",
    });
  }
  const slow = model.commits.filter((c) => !c.initial && c.duration > 16);
  if (slow.length >= 3) {
    const worst = slow.reduce((a, b) => (b.duration > a.duration ? b : a));
    out.push({
      id: "slow-commits", tone: "warn", tab: "profiler", commitId: worst.commitId,
      title: `${slow.length} commits over the 16ms frame budget`,
      detail: `Worst: commit #${worst.commitId} at ${worst.duration.toFixed(1)}ms.`,
      fix: "Open it in the flame chart to see which component spent the time.",
    });
  }
  return out;
}

/** Performance insights across the retained commits. */
export function performanceInsights(model: AppModel, vitals?: VitalsSnapshot): Insight[] {
  const out: Insight[] = [];
  const commits = model.commits;
  if (commits.length === 0) return out;
  const aggregates = componentAggregates(commits);

  for (const agg of aggregates) {
    if (agg.renders === 0) continue;
    const avg = agg.total / agg.renders;
    if (avg >= 8) {
      out.push({
        id: `slow:${agg.name}`, tone: avg >= 16 ? "bad" : "warn", tab: "profiler", component: agg.name,
        title: `${agg.name} averages ${avg.toFixed(1)}ms per render`,
        detail: `${agg.renders} renders across ${agg.instances} instance${agg.instances === 1 ? "" : "s"}; slowest ${agg.max.toFixed(1)}ms.`,
        fix: "Move expensive derivations into a $memo, or split the component so the costly part re-renders less.",
      });
    }
  }
  for (const agg of aggregates) {
    if (agg.kind !== "user" || commits.length < 4) continue;
    if (agg.renders >= 12 && agg.memo === 0) {
      out.push({
        id: `unmemo:${agg.name}`, tone: "warn", tab: "profiler", component: agg.name,
        title: `${agg.name} re-rendered ${agg.renders}× and was never skipped`,
        detail: "It reads a $state path that changes on every commit, or receives a new object/array/lambda argument each render.",
        fix: "Read narrower paths ($user.name, not $user), and hoist constant arguments out of the render.",
      });
    }
  }
  let wasted = 0;
  let rendered = 0;
  for (const commit of commits) {
    for (const record of commit.components) {
      if (record.phase === "memo") continue;
      rendered += 1;
      if (record.reason === "full render") wasted += 1;
    }
  }
  if (rendered >= 50 && wasted / rendered > 0.35) {
    out.push({
      id: "wasted", tone: "warn", tab: "profiler",
      title: `${Math.round((wasted / rendered) * 100)}% of renders changed nothing`,
      detail: `${wasted} component renders ran only because a commit was forced (an async resolution, an effect, a timer), with identical arguments and no changed dependency.`,
      fix: "Forced commits skip memoisation. Batch async updates, and prefer $state writes over notify-style updates so the render gate can skip unchanged components.",
    });
  }
  const forced = commits.filter((c) => c.fullRender && !c.initial).length;
  if (forced >= 3 && forced / commits.length > 0.5) {
    out.push({
      id: "forced", tone: "info", tab: "profiler",
      title: `${forced} of ${commits.length} commits were full renders`,
      detail: "Full renders re-evaluate every component. They come from resource resolutions, effects, timers, and custom events.",
    });
  }
  const morphHeavy = commits.filter((c) => (c.morphTime ?? 0) > 0.6 * c.duration && c.duration > 4);
  if (morphHeavy.length >= 5) {
    out.push({
      id: "morph", tone: "warn", tab: "profiler",
      title: `${morphHeavy.length} commits spent most of their time diffing the DOM`,
      detail: "The program evaluated quickly, but reconciling the output took the time — the tree is large or reshapes a lot.",
      fix: "Paginate or virtualise long lists (DataGrid, VirtualList), and give list rows a stable `key:`.",
    });
  }
  const last = commits[commits.length - 1]!;
  if ((last.domNodes ?? 0) > 5000) {
    out.push({
      id: "dom-size", tone: (last.domNodes ?? 0) > 12000 ? "bad" : "warn", tab: "profiler",
      title: `${(last.domNodes ?? 0).toLocaleString("en-US")} DOM nodes`,
      detail: "Large DOMs make every layout, style recalculation, and reconcile slower.",
      fix: "Virtualise long lists and lazy-render hidden tabs and collapsed sections.",
    });
  }
  const rate = commitRate(model);
  if (rate > 30) {
    out.push({
      id: "loop", tone: "bad", tab: "effects",
      title: `Commits arriving at ${rate.toFixed(0)}/s`,
      detail: "Something is writing state in a loop.",
      fix: "Look for an effect whose body writes an atom it also triggers on.",
    });
  }
  if (vitals) {
    const slowInteractions = vitals.interactions.filter((i) => i.duration > 200);
    if (slowInteractions.length > 0) {
      const worst = slowInteractions.reduce((a, b) => (b.duration > a.duration ? b : a));
      const phase = worst.processing >= worst.inputDelay && worst.processing >= worst.presentation ? "processing (your handlers and the commit they trigger)" : worst.inputDelay >= worst.presentation ? "input delay (the main thread was busy before the handler could run)" : "presentation (layout and paint after the handlers)";
      out.push({
        id: "inp", tone: worst.duration > 500 ? "bad" : "warn", tab: "profiler",
        title: `${slowInteractions.length} interaction${slowInteractions.length === 1 ? "" : "s"} slower than 200ms`,
        detail: `Worst: ${worst.type} on ${worst.target || "an element"} took ${Math.round(worst.duration)}ms, mostly ${phase}.`,
        fix: "Keep handlers small and move heavy work off the input path (debounce, $util.defer, a worker).",
      });
    }
    const blocked = vitals.longTasks.filter((t) => t.duration > 50);
    if (blocked.length >= 3) {
      const scripts = blocked.flatMap((t) => t.scripts ?? []).sort((a, b) => b.duration - a.duration);
      out.push({
        id: "long-tasks", tone: "warn", tab: "profiler",
        title: `${blocked.length} long tasks blocked the main thread`,
        detail: scripts[0] ? `Top script: ${scripts[0].source} (${Math.round(scripts[0].duration)}ms).` : "A long task delays input handling and rendering for its whole duration.",
      });
    }
  }
  if (out.length === 0) {
    out.push({ id: "healthy", tone: "good", title: "No render hot-spots detected", detail: "Commits fit the frame budget, memoisation is working, and nothing is looping." });
  }
  const order: Record<InsightTone, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 12);
}
