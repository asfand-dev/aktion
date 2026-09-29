/**
 * Routes — the router's current state, every route the program declares (each
 * one navigable from the start, with a form for its `:params`), a match tester
 * that explains which arm a path would hit, session route coverage, and the
 * navigation history with a one-click journey replay.
 *
 * The declared list comes from a static walk of the `$router({ … })` arms, not
 * from observation: a router only discovers a pattern when it matches, so a
 * history-based view can only ever show where you have already been.
 */

import { h, type Child } from "../core/vdom.js";
import { can, type ViewContext, type ViewDefinition } from "../context.js";
import type { RouteEvent, RouteInfo } from "../protocol.js";
import { matchRoute } from "../../runtime/router.js";
import {
  button, card, chip, emptyState, field, fmtAgo, iconButton, kv, meter, note, spacer, viewbar, vsep, plural,
} from "../ui/kit.js";
import { dataTable, type Column } from "../ui/layout.js";
import { icon } from "../ui/icons.js";
import { noApp, unsupported } from "./common.js";

/** A `:param` / `*` segment of a declared pattern. */
interface PatternParam {
  name: string;
  wildcard: boolean;
}

export function patternParams(pattern: string): PatternParam[] {
  if (pattern === "*") return [{ name: "_", wildcard: true }];
  return pattern.split("/").flatMap((segment): PatternParam[] => {
    if (segment.startsWith(":") && segment.length > 1) return [{ name: segment.slice(1), wildcard: false }];
    if (segment === "*") return [{ name: "_", wildcard: true }];
    return [];
  });
}

/**
 * Build a concrete path from a pattern and param values, or `null` while a
 * required param is empty. Values are URI-encoded (the router decodes them).
 */
export function buildPath(pattern: string, values: Record<string, string>): string | null {
  if (pattern === "*") return values._ ? `/${values._.replace(/^\/+/, "")}` : "/";
  const out: string[] = [];
  for (const segment of pattern.split("/")) {
    if (segment.startsWith(":") && segment.length > 1) {
      const value = values[segment.slice(1)]?.trim();
      if (!value) return null;
      out.push(encodeURIComponent(value));
    } else if (segment === "*") {
      const rest = values._?.trim().replace(/^\/+/, "") ?? "";
      if (rest) out.push(rest);
    } else {
      out.push(segment);
    }
  }
  const path = out.join("/");
  return path.startsWith("/") ? path || "/" : `/${path}`;
}

/** The first declared arm matching `path`, in declaration order (how `$router` picks). */
export function firstMatch(declared: ReadonlyArray<string>, path: string): { pattern: string; params: Record<string, string> } | null {
  for (const pattern of declared) {
    const result = matchRoute(pattern, path);
    if (result.matched) return { pattern, params: { ...result.params } };
  }
  return null;
}

/** Route coverage for this session: which declared patterns were ever matched. */
export function routeCoverage(declared: ReadonlyArray<string>, history: ReadonlyArray<RouteEvent>, current: RouteInfo | null): { visited: Set<string>; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  for (const event of history) {
    const pattern = event.pattern ?? firstMatch(declared, event.to)?.pattern ?? null;
    if (pattern) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  if (current?.pattern && !counts.has(current.pattern)) counts.set(current.pattern, 1);
  return { visited: new Set(counts.keys()), counts };
}

/* ---- journey replay (one per app) ---------------------------------------- */

const journeys = new Map<string, { timer: ReturnType<typeof setTimeout>; index: number; total: number }>();

function stopJourney(appId: string): void {
  const journey = journeys.get(appId);
  if (journey) clearTimeout(journey.timer);
  journeys.delete(appId);
}

function replayJourney(ctx: ViewContext, paths: string[]): void {
  const app = ctx.app;
  if (!app || !can(app, "navigate") || paths.length === 0) return;
  stopJourney(app.id);
  const step = (index: number): void => {
    if (index >= paths.length) {
      journeys.delete(app.id);
      ctx.toast(`Replayed ${plural(paths.length, "navigation")}`, "good");
      ctx.refresh();
      return;
    }
    app.navigate!(paths[index]!);
    journeys.set(app.id, { timer: setTimeout(() => step(index + 1), 700), index, total: paths.length });
    ctx.refresh();
  };
  step(0);
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, model, ui } = ctx;
  if (!app) return noApp(ctx, "The Routes view", "routes");
  if (!can(app, "getRoute")) return h("div", { class: "dt-pad" }, unsupported("its router"));
  const route = app.getRoute();
  const canNavigate = can(app, "navigate");
  const history = model.routes;
  const { visited, counts } = routeCoverage(route.declared, history, route);
  const journey = journeys.get(app.id) ?? null;

  const navigate = (path: string): void => {
    if (!can(app, "navigate")) return;
    app.navigate(path);
    ctx.toast(`Navigated to ${path}`);
    ctx.refresh();
  };
  const goDraft = (): void => {
    const path = ui.routeDraft.trim();
    if (!path) return;
    navigate(path.startsWith("/") ? path : `/${path}`);
  };

  const draftMatch = ui.routeDraft.trim() ? firstMatch(route.declared, ui.routeDraft.trim()) : null;

  const bar = viewbar(
    h("span", { class: "rt-nav" },
      h("span", { class: "rt-nav-prefix mono" }, route.mode === "hash" ? "#" : route.basePath ?? ""),
      field({
        value: ui.routeDraft, placeholder: "/orders/42 — type a path, Enter to navigate", mono: true, label: "Path to navigate to", testid: "route-input",
        onInput: (value) => { ui.routeDraft = value; ctx.refresh(); },
        onCommit: () => goDraft(),
      })),
    button({ label: "Go", size: "sm", variant: "primary", icon: "arrowRight", disabled: !canNavigate || !ui.routeDraft.trim(), onClick: goDraft, tip: "Navigate through the app's router — its guard still applies" }),
    ui.routeDraft.trim()
      ? (draftMatch
          ? chip(["matches ", h("code", {}, draftMatch.pattern)], "green", { testid: "route-draft-match" })
          : chip(route.declared.length > 0 ? "no arm matches" : "no routes declared", "amber", { testid: "route-draft-match" }))
      : null,
    spacer(),
    history.length >= 2 && canNavigate
      ? (journey
          ? button({ label: `Stop replay (${journey.index + 1}/${journey.total})`, size: "sm", icon: "stop", onClick: () => { stopJourney(app.id); ctx.refresh(); } })
          : button({ label: "Replay journey", size: "sm", icon: "play", tip: "Walk the recorded navigations again, 0.7s apart", onClick: () => replayJourney(ctx, history.slice(-30).map((e) => e.to)) }))
      : null,
    vsep(),
    chip(route.mode, "blue", { tip: route.mode === "hash" ? "Hash routing — works on any static host" : "History routing — needs a server fallback to index.html" }),
    route.guarded ? chip("guarded", "amber", { icon: "lock", tip: "The program installed a navigation guard, so a navigation can be redirected or refused" }) : null,
  );

  const params = Object.entries(route.params);
  const current = card({
    title: "Current route", icon: "routes", testid: "route-current",
    actions: [iconButton({ icon: "copy", label: "Copy the URL", size: "sm", onClick: () => ctx.copy(typeof location !== "undefined" ? location.href : route.path, "the URL") })],
    body: h("div", { class: "stack" },
      h("div", { class: "rt-path mono", "data-dt": "route-path" }, route.path),
      kv([
        ["Matched arm", route.pattern ? h("code", {}, route.pattern) : chip("no match", "amber")],
        ["Params", params.length > 0
          ? h("span", { class: "chips" }, ...params.map(([key, value]) => chip([h("span", { class: "t3" }, `${key} `), value], "grey", { mono: true })))
          : h("span", { class: "t3" }, "none")],
        route.basePath ? ["Base path", h("code", {}, route.basePath)] : null,
        ["Navigations", String(model.totals.routes)],
      ])),
  });

  const coverage = route.declared.length > 0 ? visited.size / route.declared.length : 0;
  const declared = card({
    title: "Declared routes", icon: "list", testid: "route-declared",
    sub: route.declared.length > 0 ? `${visited.size} of ${route.declared.length} visited this session` : undefined,
    flush: true,
    body: route.declared.length === 0
      ? h("div", { class: "dt-pad" }, emptyState({ icon: "routes", title: "No routes declared", body: ["A single-page program declares none. Add a ", h("code", {}, "$router({ … })"), " with arms and they appear here, each navigable before you have linked to it."] }))
      : h("div", {},
          h("div", { class: "rt-cov" }, meter(coverage, coverage === 1 ? "green" : coverage >= 0.5 ? "cyan" : "amber"), h("span", { class: "t3 num" }, `${Math.round(coverage * 100)}% route coverage`)),
          h("div", { class: "rt-list" }, ...route.declared.map((pattern) => {
            const paramDefs = patternParams(pattern);
            const values = ui.routeParams[pattern] ?? {};
            const target = buildPath(pattern, values);
            const active = pattern === route.pattern;
            const visits = counts.get(pattern) ?? 0;
            return h("div", { key: pattern, class: ["rt-row", active ? "is-active" : "", visits === 0 ? "is-unvisited" : ""], "data-dt": "route-row" },
              h("span", { class: ["rt-dot", active ? "is-active" : visits > 0 ? "is-visited" : ""], "aria-hidden": "true" }),
              h("code", { class: "rt-pattern" }, pattern),
              ...paramDefs.map((param) => field({
                value: values[param.name] ?? "", placeholder: param.wildcard ? "rest/of/path" : param.name, mono: true, width: param.wildcard ? "130px" : "90px",
                label: `${pattern} — ${param.wildcard ? "wildcard" : `:${param.name}`}`,
                onInput: (value) => { ui.routeParams = { ...ui.routeParams, [pattern]: { ...values, [param.name]: value } }; ctx.refresh(); },
                onCommit: () => { const path = buildPath(pattern, ui.routeParams[pattern] ?? {}); if (path) navigate(path); },
              })),
              spacer(),
              active ? chip("active", "green") : visits > 0 ? h("span", { class: "t3 num", "data-tip": "Times matched this session" }, `×${visits}`) : h("span", { class: "t4" }, "not visited"),
              button({ label: "Go", size: "sm", variant: active ? "ghost" : "default", disabled: !canNavigate || target === null, tip: target ? `Navigate to ${target}` : "Fill in the parameters first", onClick: () => { if (target) navigate(target); } }));
          }))),
  });

  const unmatched = history.filter((event) => event.pattern == null && !firstMatch(route.declared, event.to));
  const insights: Child[] = [];
  if (unmatched.length > 0) {
    const sample = [...new Set(unmatched.slice(-3).map((e) => e.to))].join(", ");
    insights.push(note("warn", [`${plural(unmatched.length, "navigation")} matched no route arm (${sample}). Without a `, h("code", {}, "default:"), " arm the router renders nothing for those paths."], { testid: "route-unmatched" }));
  }
  if (route.declared.length > 0 && visited.size < route.declared.length && history.length > 0) {
    const missing = route.declared.filter((p) => !visited.has(p));
    insights.push(note("plain", [`Not visited yet: `, ...missing.slice(0, 6).flatMap((p, i) => [i > 0 ? ", " : "", h("code", {}, p)]), missing.length > 6 ? ` and ${missing.length - 6} more` : "", ". QA tip: every declared route should be exercised at least once."], { icon: "target" }));
  }

  const rows = [...history].reverse();
  const now = ctx.now();
  const columns: Column<RouteEvent>[] = [
    { key: "time", label: "When", width: 80, render: (row) => h("span", { class: "t3 num" }, fmtAgo(row.time, now)) },
    { key: "from", label: "From", flex: 1, render: (row) => h("code", { class: "ellipsis t2" }, row.from || "—") },
    { key: "to", label: "To", flex: 1.2, render: (row) => h("code", { class: "ellipsis" }, row.to) },
    { key: "pattern", label: "Matched", flex: 1, render: (row) => (row.pattern ? h("code", { class: "ellipsis tone-cyan" }, row.pattern) : chip("no match", "amber")) },
    { key: "params", label: "Params", flex: 1.2, render: (row) => {
      const entries = Object.entries(row.params ?? {});
      return entries.length > 0 ? h("span", { class: "chips is-nowrap" }, ...entries.map(([key, value]) => chip(`${key}=${value}`, "grey", { mono: true }))) : h("span", { class: "t4" }, "—");
    } },
    { key: "source", label: "Via", width: 100, render: (row) => chip(row.source ?? "?", row.source === "programmatic" ? "purple" : "blue") },
  ];
  const historyCard = card({
    title: "Navigation history", icon: "history", testid: "route-history", flush: true,
    sub: history.length > 0 ? `${history.length} recorded · double-click to revisit` : undefined,
    body: rows.length === 0
      ? h("div", { class: "rt-history-empty t3" }, icon("history", { size: 14 }), "No navigations yet — click a link in the app, or use Go above.")
      : h("div", { class: "rt-history", style: { height: `${Math.min(10, Math.max(3, rows.length)) * ctx.rowHeight + 30}px` } },
      dataTable({
        columns, rows, rowKey: (row) => `${row.time}:${row.to}`, rowHeight: ctx.rowHeight,
        onActivate: (row) => navigate(row.to),
        ariaLabel: "Navigation history", testid: "route-history-table",
        empty: emptyState({ icon: "history", title: "No navigations yet", body: "Click a link in the app, or use Go above." }),
      })),
  });

  return h("div", { class: "rt", "data-dt": "routes" },
    bar,
    h("div", { class: "dt-scroll" },
      h("div", { class: "rt-page" },
        insights.length > 0 ? h("div", { class: "stack" }, ...insights) : null,
        h("div", { class: "rt-grid" }, current, declared),
        historyCard)));
}

export const routesView: ViewDefinition = {
  id: "routes",
  label: "Routes",
  icon: "routes",
  group: "inspect",
  hint: "Current route, declared arms, match tester, coverage, and history",
  keywords: "router navigate path params pattern history hash guard coverage journey",
  // Only a problem earns a badge: navigations that matched no arm.
  badge: (ctx) => {
    const unmatched = ctx.memo("routes.badge", [ctx.app?.id, ctx.model.revs.route], () => {
      const declared = can(ctx.app, "getRoute") ? ctx.app.getRoute().declared : [];
      return ctx.model.routes.filter((event) => event.pattern == null && !firstMatch(declared, event.to)).length;
    });
    return unmatched > 0 ? { value: unmatched, tone: "amber" } : null;
  },
  render,
  commands: (ctx) => {
    if (!can(ctx.app, "getRoute")) return [];
    const app = ctx.app;
    return app.getRoute().declared
      .filter((pattern) => patternParams(pattern).length === 0)
      .map((pattern) => ({
        id: `route:${pattern}`,
        label: `Navigate to ${pattern}`,
        icon: "routes" as const,
        keywords: "route go",
        run: () => { app.navigate?.(pattern); ctx.toast(`Navigated to ${pattern}`); },
      }));
  },
  css: /* css */ `
.rt { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.rt-nav { display: flex; align-items: center; flex: 1 1 320px; min-width: 200px; max-width: 520px; }
.rt-nav > .input { flex: 1 1 auto; border-top-left-radius: 0; border-bottom-left-radius: 0; }
.rt-nav-prefix { height: 26px; display: inline-flex; align-items: center; padding: 0 7px; border: 1px solid var(--dt-border-strong); border-right: 0; border-radius: var(--dt-r-sm) 0 0 var(--dt-r-sm); background: var(--dt-bg-2); color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
.rt-nav-prefix:empty { display: none; }
.rt-nav-prefix:empty + .input { border-radius: var(--dt-r-sm); }
.rt-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.rt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.rt-path { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; color: var(--dt-text); overflow-wrap: anywhere; }
.rt-cov { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); }
.rt-cov .meter { flex: 1 1 auto; }
.rt-list { display: flex; flex-direction: column; }
.rt-row { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 12px; border-bottom: 1px solid var(--dt-border); }
.rt-row:last-child { border-bottom: 0; }
.rt-row.is-active { background: var(--dt-accent-soft); }
.rt-row.is-unvisited .rt-pattern { color: var(--dt-text-2); }
.rt-pattern { font-size: var(--dt-fs-md); white-space: nowrap; }
.rt-dot { width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid var(--dt-text-4); flex: none; }
.rt-dot.is-visited { background: var(--dt-cyan); border-color: var(--dt-cyan); }
.rt-dot.is-active { background: var(--dt-green); border-color: var(--dt-green); box-shadow: 0 0 0 3px var(--dt-green-soft); }
.rt-history { display: flex; flex-direction: column; min-height: 96px; }
.rt-history-empty { display: flex; align-items: center; gap: 8px; padding: 14px 12px; font-size: var(--dt-fs-sm); }
.chips.is-nowrap { flex-wrap: nowrap; overflow: hidden; }
`,
};
