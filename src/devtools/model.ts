/**
 * Aktion DevTools — the frontend's derived model.
 *
 * The hook hands the panel a flat stream of protocol events. This module turns
 * that stream into the shapes the tabs actually render: merged network
 * requests, per-atom change counts, a commit history bounded for a session that
 * runs all afternoon, and the aggregates every tab would otherwise recompute
 * its own slightly-different version of.
 *
 * It is deliberately separate from the panel element: ingestion is pure data
 * work, so it can be unit-tested without a DOM and reused by any other
 * frontend (an extension panel, a headless recorder) that speaks the protocol.
 */

import type {
  CommitRecord,
  ComponentRenderRecord,
  DevtoolsEvent,
  EffectEvent,
  EmitEvent,
  ErrorEvent,
  LogEvent,
  NetworkEvent,
  RouteEvent,
  StateEvent,
} from "./protocol.js";

/* -------------------------------------------------------------------------- */
/*  Caps                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Retention caps. A DevTools session that quietly grows without bound is a
 * memory leak with a UI, and — worse for debugging — it changes the timings of
 * the very app it is measuring. Every list here is a ring.
 */
export const CAPS = {
  commits: 300,
  effects: 600,
  network: 300,
  routes: 200,
  emits: 200,
  logs: 500,
  errors: 200,
  /** State snapshots retained for time travel. */
  history: 60,
} as const;

/* -------------------------------------------------------------------------- */
/*  Derived shapes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One HTTP request, merged from its `start` event and its terminal event.
 *
 * The protocol reports the two halves separately (a request in flight is a
 * thing you need to see), but every view wants one row, so the merge happens
 * once here rather than in each tab.
 */
export interface NetworkRequest {
  requestId: string;
  method: string;
  url: string;
  /** `pending` until a terminal event arrives. */
  phase: "pending" | "success" | "error" | "mock" | "blocked";
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseSize?: number;
  error?: string;
  rule?: string;
  injectedDelay?: number;
}

/** One console line, as captured by the panel's console tap. */
export interface LogEntry {
  level: LogEvent["level"];
  /** Rendered arguments, joined for display. */
  text: string;
  /** Individual arguments, for the expanded view. */
  args: string[];
  origin: string;
  time: number;
  /** Consecutive duplicates are collapsed into one row with a count. */
  count: number;
  /** Capture-site stack, when the environment provides one. */
  stack?: string;
}

/** A state snapshot kept for time travel, tagged with what produced it. */
export interface HistoryEntry {
  /** Commit id when the snapshot came from a commit, else `null`. */
  commitId: number | null;
  time: number;
  changedPaths: string[];
  snapshot: Record<string, unknown>;
}

/** Per-app derived model the panel maintains from the event stream. */
export interface AppModel {
  commits: CommitRecord[];
  effects: EffectEvent[];
  network: NetworkRequest[];
  routes: RouteEvent[];
  emits: EmitEvent[];
  logs: LogEntry[];
  errors: ErrorEvent[];
  /** Latest full `$state` snapshot. */
  state: Record<string, unknown>;
  /** Atom (root) → timestamp of last change, for flash highlighting. */
  changed: Map<string, number>;
  /** Atom (root) → number of flushes that changed it (reactivity heat). */
  changeCounts: Map<string, number>;
  /** Bounded snapshot history for time travel. */
  history: HistoryEntry[];
  /** Timestamp of the first observed event (timeline zero). */
  firstTime: number | null;
  /** Timestamp of the most recent observed event. */
  lastTime: number;
  /** Totals since the session began, including events already trimmed away. */
  totals: {
    commits: number;
    effects: number;
    network: number;
    routes: number;
    emits: number;
    logs: number;
    errors: number;
    stateFlushes: number;
  };
}

export function emptyModel(): AppModel {
  return {
    commits: [],
    effects: [],
    network: [],
    routes: [],
    emits: [],
    logs: [],
    errors: [],
    state: {},
    changed: new Map(),
    changeCounts: new Map(),
    history: [],
    firstTime: null,
    lastTime: 0,
    totals: {
      commits: 0, effects: 0, network: 0, routes: 0,
      emits: 0, logs: 0, errors: 0, stateFlushes: 0,
    },
  };
}

/** Root atom name of a dotted path (`user.name` → `user`). */
export function rootOf(path: string): string {
  const dot = path.indexOf(".");
  return dot < 0 ? path : path.slice(0, dot);
}

/** Timestamp of any protocol event, whatever its kind calls the field. */
export function eventTime(event: DevtoolsEvent): number {
  switch (event.kind) {
    case "commit": return event.startTime;
    default: return (event as { time: number }).time;
  }
}

/** Trim an array to its last `limit` entries, in place. */
function cap<T>(list: T[], limit: number): void {
  if (list.length > limit) list.splice(0, list.length - limit);
}

/* -------------------------------------------------------------------------- */
/*  Ingestion                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fold one event into the model.
 *
 * `fromBuffer` marks events replayed from the hook's backfill buffer when the
 * panel opens: those must not steal the user's pinned commit selection or
 * flash rows as if they had just happened.
 */
export function ingest(model: AppModel, event: DevtoolsEvent, fromBuffer = false): void {
  const time = eventTime(event);
  if (model.firstTime === null || time < model.firstTime) model.firstTime = time;
  if (time > model.lastTime) model.lastTime = time;

  switch (event.kind) {
    case "commit":
      ingestCommit(model, event);
      break;
    case "state":
      ingestState(model, event, fromBuffer);
      break;
    case "effect":
      model.effects.push(event);
      model.totals.effects += 1;
      cap(model.effects, CAPS.effects);
      break;
    case "network":
      ingestNetwork(model, event);
      break;
    case "route":
      model.routes.push(event);
      model.totals.routes += 1;
      cap(model.routes, CAPS.routes);
      break;
    case "emit":
      model.emits.push(event);
      model.totals.emits += 1;
      cap(model.emits, CAPS.emits);
      break;
    case "log":
      ingestLog(model, {
        level: event.level,
        text: event.args.join(" "),
        args: event.args,
        origin: event.origin,
        time: event.time,
        count: event.count ?? 1,
      });
      break;
    case "error":
      model.errors.push(event);
      model.totals.errors += 1;
      cap(model.errors, CAPS.errors);
      break;
  }
}

function ingestCommit(model: AppModel, event: CommitRecord): void {
  model.commits.push(event);
  model.totals.commits += 1;
  cap(model.commits, CAPS.commits);
  if (event.snapshot) {
    model.history.push({
      commitId: event.commitId,
      time: event.startTime,
      changedPaths: event.changedPaths,
      snapshot: event.snapshot,
    });
    cap(model.history, CAPS.history);
  }
}

function ingestState(model: AppModel, event: StateEvent, fromBuffer: boolean): void {
  model.state = event.snapshot;
  model.totals.stateFlushes += 1;
  for (const path of event.changedPaths) {
    const root = rootOf(path);
    // A replayed event's timestamp is in the past, so recording it as "changed
    // now" would flash rows that changed minutes ago the moment you open the
    // panel. Counts still accumulate — those are history, not a highlight.
    if (!fromBuffer) model.changed.set(root, event.time);
    model.changeCounts.set(root, (model.changeCounts.get(root) ?? 0) + 1);
  }
}

function ingestNetwork(model: AppModel, event: NetworkEvent): void {
  if (event.phase === "start") {
    model.network.push({
      requestId: event.requestId,
      method: event.method,
      url: event.url,
      phase: "pending",
      startTime: event.time,
      requestHeaders: event.requestHeaders,
      requestBody: event.requestBody,
    });
    model.totals.network += 1;
    cap(model.network, CAPS.network);
    return;
  }
  // Terminal event: merge onto the pending row when it is still in the ring,
  // otherwise synthesise a row so a long-running request whose start was
  // trimmed away still reports its outcome.
  const existing = model.network.find((r) => r.requestId === event.requestId);
  const target: NetworkRequest = existing ?? {
    requestId: event.requestId,
    method: event.method,
    url: event.url,
    phase: "pending",
    startTime: event.time - (event.duration ?? 0),
  };
  target.phase = event.phase;
  target.endTime = event.time;
  target.duration = event.duration;
  target.status = event.status;
  target.responseHeaders = event.responseHeaders;
  target.responseBody = event.responseBody;
  target.responseSize = event.responseSize;
  target.error = event.error;
  target.rule = event.rule;
  target.injectedDelay = event.injectedDelay;
  if (!existing) {
    model.network.push(target);
    model.totals.network += 1;
    cap(model.network, CAPS.network);
  }
}

/**
 * Add a console line, collapsing an immediate repeat into a count.
 *
 * A render loop logging the same line 400 times should read as
 * `"tick" ×400`, not scroll the one message you were looking for off the top.
 */
export function ingestLog(model: AppModel, entry: LogEntry): void {
  const last = model.logs[model.logs.length - 1];
  model.totals.logs += 1;
  if (last && last.level === entry.level && last.text === entry.text && last.origin === entry.origin) {
    last.count += entry.count;
    last.time = entry.time;
    return;
  }
  model.logs.push(entry);
  cap(model.logs, CAPS.logs);
}

/** Drop every recorded event, keeping the current state snapshot. */
export function clearModel(model: AppModel): void {
  model.commits.length = 0;
  model.effects.length = 0;
  model.network.length = 0;
  model.routes.length = 0;
  model.emits.length = 0;
  model.logs.length = 0;
  model.errors.length = 0;
  model.history.length = 0;
  model.changed.clear();
  model.changeCounts.clear();
  model.firstTime = null;
  model.lastTime = 0;
}

/* -------------------------------------------------------------------------- */
/*  Aggregates                                                                 */
/* -------------------------------------------------------------------------- */

/** Per-component-name totals across a commit range. */
export interface ComponentAggregate {
  name: string;
  kind: string;
  /** Renders where the body actually ran. */
  renders: number;
  /** Renders skipped by memoization. */
  memo: number;
  /** Total self time in ms. */
  total: number;
  /** Slowest single render, in ms. */
  max: number;
  /** Distinct instances observed. */
  instances: number;
}

export function componentAggregates(commits: ReadonlyArray<CommitRecord>): ComponentAggregate[] {
  const aggs = new Map<string, ComponentAggregate & { keys: Set<string> }>();
  for (const commit of commits) {
    for (const record of commit.components) {
      let agg = aggs.get(record.name);
      if (!agg) {
        agg = { name: record.name, kind: record.kind, renders: 0, memo: 0, total: 0, max: 0, instances: 0, keys: new Set() };
        aggs.set(record.name, agg);
      }
      agg.keys.add(record.instanceKey);
      if (record.phase === "memo") agg.memo += 1;
      else {
        agg.renders += 1;
        agg.total += record.selfTime;
        if (record.selfTime > agg.max) agg.max = record.selfTime;
      }
    }
  }
  return [...aggs.values()].map(({ keys, ...agg }) => ({ ...agg, instances: keys.size }));
}

/** Per-instance totals, for the inspector's "why is this slow?" column. */
export function instanceAggregates(
  commits: ReadonlyArray<CommitRecord>,
): Map<string, { renders: number; memo: number; total: number; max: number; last?: ComponentRenderRecord }> {
  const out = new Map<string, { renders: number; memo: number; total: number; max: number; last?: ComponentRenderRecord }>();
  for (const commit of commits) {
    for (const record of commit.components) {
      let agg = out.get(record.instanceKey);
      if (!agg) {
        agg = { renders: 0, memo: 0, total: 0, max: 0 };
        out.set(record.instanceKey, agg);
      }
      agg.last = record;
      if (record.phase === "memo") agg.memo += 1;
      else {
        agg.renders += 1;
        agg.total += record.selfTime;
        if (record.selfTime > agg.max) agg.max = record.selfTime;
      }
    }
  }
  return out;
}

/** State paths that triggered the most commits, most first. */
export function hotAtoms(commits: ReadonlyArray<CommitRecord>, limit = 10): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    for (const path of commit.changedPaths) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** Per-effect totals across the retained event window. */
export interface EffectAggregate {
  effectKey: string;
  label: string;
  triggers: string;
  instanceKey: string | null;
  mounts: number;
  runs: number;
  cleanups: number;
  errors: number;
  total: number;
  max: number;
  lastReason: string;
  lastTime: number;
}

export function effectAggregates(events: ReadonlyArray<EffectEvent>): EffectAggregate[] {
  const aggs = new Map<string, EffectAggregate>();
  for (const event of events) {
    let agg = aggs.get(event.effectKey);
    if (!agg) {
      agg = {
        effectKey: event.effectKey,
        label: event.label,
        triggers: event.triggers,
        instanceKey: event.instanceKey,
        mounts: 0, runs: 0, cleanups: 0, errors: 0, total: 0, max: 0,
        lastReason: event.reason,
        lastTime: event.time,
      };
      aggs.set(event.effectKey, agg);
    }
    agg.lastTime = event.time;
    switch (event.phase) {
      case "mount": agg.mounts += 1; break;
      case "run":
        agg.runs += 1;
        agg.total += event.duration ?? 0;
        if ((event.duration ?? 0) > agg.max) agg.max = event.duration ?? 0;
        agg.lastReason = event.reason;
        break;
      case "cleanup": agg.cleanups += 1; break;
      case "error": agg.errors += 1; break;
      default: break;
    }
  }
  return [...aggs.values()];
}

/** Headline network numbers. */
export function networkStats(requests: ReadonlyArray<NetworkRequest>): {
  total: number;
  pending: number;
  failed: number;
  mocked: number;
  bytes: number;
  avgDuration: number;
  slowest: NetworkRequest | null;
} {
  let pending = 0, failed = 0, mocked = 0, bytes = 0, durationSum = 0, durationCount = 0;
  let slowest: NetworkRequest | null = null;
  for (const request of requests) {
    if (request.phase === "pending") pending += 1;
    if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400) failed += 1;
    if (request.phase === "mock") mocked += 1;
    bytes += request.responseSize ?? 0;
    if (request.duration !== undefined) {
      durationSum += request.duration;
      durationCount += 1;
      if (!slowest || request.duration > (slowest.duration ?? 0)) slowest = request;
    }
  }
  return {
    total: requests.length,
    pending,
    failed,
    mocked,
    bytes,
    avgDuration: durationCount > 0 ? durationSum / durationCount : 0,
    slowest,
  };
}

/**
 * A merged, chronological view of everything that happened — the Timeline tab.
 *
 * Debugging a "clicking Save does nothing" report means correlating a commit,
 * an effect run, a request, and a route change that all happened inside 40ms.
 * Reading four tabs and mentally interleaving them is the slow way to do it.
 */
export interface TimelineEntry {
  kind: DevtoolsEvent["kind"];
  time: number;
  /** Short label (`commit #12`, `GET /api/todos`). */
  label: string;
  /** Secondary detail (`count`, `304 · 12ms`). */
  detail: string;
  /** Colour tone for the marker. */
  tone: string;
  /** Duration in ms when the entry represents a span. */
  duration?: number;
  /** Instance / effect / request id this entry points at, for click-through. */
  ref?: string;
}

export function buildTimeline(model: AppModel, kinds: ReadonlySet<string>): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  if (kinds.has("commit")) {
    for (const commit of model.commits) {
      out.push({
        kind: "commit",
        time: commit.startTime,
        label: `commit #${commit.commitId}`,
        detail: commit.initial
          ? "initial mount"
          : commit.changedPaths.length > 0
            ? commit.changedPaths.join(", ")
            : "forced",
        tone: commit.fullRender ? "amber" : "blue",
        duration: commit.duration,
        ref: String(commit.commitId),
      });
    }
  }
  if (kinds.has("effect")) {
    for (const effect of model.effects) {
      out.push({
        kind: "effect",
        time: effect.time,
        label: effect.label,
        detail: `${effect.phase} · ${effect.reason}`,
        tone: effect.phase === "error" ? "red" : effect.phase === "run" ? "green" : "grey",
        duration: effect.duration,
        ref: effect.effectKey,
      });
    }
  }
  if (kinds.has("network")) {
    for (const request of model.network) {
      out.push({
        kind: "network",
        time: request.startTime,
        label: `${request.method} ${urlTail(request.url)}`,
        detail: request.phase === "pending"
          ? "pending"
          : `${request.status ?? request.phase}${request.duration !== undefined ? ` · ${Math.round(request.duration)}ms` : ""}`,
        tone: request.phase === "error" || request.phase === "blocked"
          ? "red"
          : request.phase === "mock" ? "purple" : "cyan",
        duration: request.duration,
        ref: request.requestId,
      });
    }
  }
  if (kinds.has("route")) {
    for (const route of model.routes) {
      out.push({
        kind: "route",
        time: route.time,
        label: `→ ${route.to}`,
        detail: route.pattern ? `matched ${route.pattern}` : "no match",
        tone: "purple",
        ref: route.to,
      });
    }
  }
  if (kinds.has("emit")) {
    for (const emitted of model.emits) {
      out.push({
        kind: "emit",
        time: emitted.time,
        label: `emit ${emitted.name}`,
        detail: emitted.detail.preview,
        tone: "green",
        ref: emitted.name,
      });
    }
  }
  if (kinds.has("log")) {
    for (const log of model.logs) {
      out.push({
        kind: "log",
        time: log.time,
        label: log.level,
        detail: log.count > 1 ? `${log.text} ×${log.count}` : log.text,
        tone: log.level === "error" ? "red" : log.level === "warn" ? "amber" : "grey",
      });
    }
  }
  if (kinds.has("error")) {
    for (const error of model.errors) {
      out.push({
        kind: "error",
        time: error.time,
        label: `${error.phase} error`,
        detail: error.message,
        tone: "red",
        ref: error.subject,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Last path segment of a URL, for compact labels. */
export function urlTail(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts.length > 0 ? `/${parts[parts.length - 1]}` : url;
}
