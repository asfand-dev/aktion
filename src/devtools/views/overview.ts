/**
 * Overview — the health, cost, and shape of the inspected app on one screen,
 * with every number linking to the view that explains it.
 */

import { h, type Child } from "../core/vdom.js";
import { can, type ViewContext, type ViewDefinition } from "../context.js";
import { hotAtoms, networkStats } from "../model.js";
import { healthIssues, commitRate, type Insight } from "../analysis/insights.js";
import { rate } from "../analysis/vitals.js";
import { icon, logoMark, type IconName } from "../ui/icons.js";
import {
  button, chip, fmtBytes, fmtCount, fmtMs, fmtPct, keys, microBars, sparkline, stat, statGrid, card,
} from "../ui/kit.js";
import { noApp, openAtom, percentile } from "./common.js";

const TONE_ICON: Record<Insight["tone"], IconName> = { bad: "error", warn: "warning", info: "info", good: "checkCircle" };

function issueRow(ctx: ViewContext, issue: Insight): Child {
  return h("button", {
    key: issue.id,
    type: "button",
    class: ["ov-issue", `t-${issue.tone}`],
    "data-dt": "overview-issue",
    onClick: () => {
      if (issue.commitId !== undefined) {
        ctx.ui.selectedCommitId = issue.commitId;
        ctx.ui.profilerView = "flame";
      }
      if (issue.tab === "console" && issue.tone === "bad") ctx.ui.logLevels = new Set(["error"]);
      if (issue.tab) ctx.selectTab(issue.tab);
    },
  },
    h("span", { class: "ov-issue-ic" }, icon(TONE_ICON[issue.tone], { size: 15 })),
    h("span", { class: "ov-issue-text" },
      h("span", { class: "ov-issue-title" }, issue.title),
      h("span", { class: "ov-issue-detail" }, issue.detail),
      issue.fix ? h("span", { class: "ov-issue-fix" }, issue.fix) : null),
    issue.tab ? h("span", { class: "ov-issue-go" }, "Open", icon("arrowRight", { size: 12 })) : null);
}

function tip(n: number, title: string, body: string, action: () => void, glyph: IconName, combo?: string): Child {
  return h("button", { type: "button", class: "ov-tip", onClick: action },
    h("span", { class: "ov-tip-ic" }, icon(glyph, { size: 18 })),
    h("span", { class: "ov-tip-text" },
      h("span", { class: "ov-tip-title" }, h("span", { class: "ov-tip-n" }, String(n)), title),
      h("span", { class: "ov-tip-body" }, body),
      combo ? h("span", { class: "ov-tip-keys" }, keys(combo)) : null));
}

function render(ctx: ViewContext): Child {
  const { app, model, ui, vitals } = ctx;
  if (!app && !ctx.imported) {
    return h("div", { class: "dt-scroll" },
      h("div", { class: "ov-welcome" },
        h("div", { class: "ov-welcome-mark" }, logoMark(44)),
        h("h2", {}, "Aktion DevTools"),
        h("p", {}, "Inspect components, edit state live, profile renders, trace network, audit accessibility and security, and record tests — for every ", h("code", {}, "<aktion-app>"), " on the page."),
        noApp(ctx, "Overview")));
  }
  const diagnostics = can(app, "getDiagnostics") ? ctx.cache("diagnostics", () => app.getDiagnostics()) : [];
  const issues = ctx.memo("ov:issues", [model.rev, diagnostics.length], () => healthIssues(model, diagnostics));
  const stats = can(app, "getStats") ? ctx.cache("stats", () => app.getStats()) : null;
  const route = can(app, "getRoute") ? ctx.cache("route", () => app.getRoute()) : null;
  const theme = can(app, "getTheme") ? ctx.cache("theme", () => app.getTheme()) : null;
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];

  const commits = model.commits;
  const durations = commits.map((c) => c.duration);
  const recent = durations.slice(-40);
  const nonInitial = commits.filter((c) => !c.initial);
  const avg = nonInitial.length > 0 ? nonInitial.reduce((sum, c) => sum + c.duration, 0) / nonInitial.length : commits[0]?.duration ?? 0;
  const p95 = percentile(nonInitial.map((c) => c.duration), 95);
  let memo = 0;
  let rendered = 0;
  for (const commit of commits) {
    memo += commit.memoized;
    rendered += commit.rendered;
  }
  const memoShare = rendered + memo > 0 ? memo / (rendered + memo) : 0;
  const net = networkStats(model.network);
  const rateNow = commitRate(model);
  const bad = issues.filter((i) => i.tone === "bad").length;
  const warn = issues.filter((i) => i.tone === "warn").length;
  const statusTone = bad > 0 ? "red" : warn > 0 ? "amber" : "green";
  const statusText = bad > 0 ? `${bad} problem${bad === 1 ? "" : "s"}` : warn > 0 ? `${warn} warning${warn === 1 ? "" : "s"}` : "Healthy";
  const inpRating = rate("inp", vitals.inp?.value);
  const label = app?.label ?? "Imported session";

  const hero = h("section", { class: "ov-hero", "data-dt": "overview-hero" },
    h("div", { class: "ov-hero-main" },
      h("div", { class: "ov-hero-title" },
        h("span", { class: ["ov-pulse", `t-${statusTone}`] }),
        h("h2", {}, label),
        chip(statusText, statusTone === "green" ? "green" : statusTone === "amber" ? "amber" : "red")),
      h("div", { class: "ov-hero-meta" },
        h("span", {}, icon("box", { size: 12 }), `Aktion ${ctx.hook.libraryVersion}`),
        h("span", {}, icon("link", { size: 12 }), `protocol ${ctx.hook.protocolVersion}`),
        route ? h("span", {}, icon("routes", { size: 12 }), h("code", {}, route.path), route.pattern && route.pattern !== route.path ? h("span", { class: "t4" }, ` · ${route.pattern}`) : null) : null,
        theme ? h("span", {}, icon("theme", { size: 12 }), theme.name) : null,
        overrides.length > 0 ? chip(`${overrides.length} prop override${overrides.length === 1 ? "" : "s"}`, "amber", { onClick: () => ctx.selectTab("inspect") }) : null,
        theme && theme.devtoolsOverrides.length > 0 ? chip(`${theme.devtoolsOverrides.length} token override${theme.devtoolsOverrides.length === 1 ? "" : "s"}`, "amber", { onClick: () => ctx.selectTab("theme") }) : null)),
    h("div", { class: "ov-hero-actions" },
      button({ label: "Pick element", icon: "pick", onClick: () => ctx.togglePicker(), kbd: "⇧ ⌥ C", tip: "Click anything on the page to inspect its component" }),
      button({ label: ui.highlightUpdates ? "Stop highlighting" : "Highlight renders", icon: "scan", active: ui.highlightUpdates, testid: "ov-scan", onClick: () => { ui.highlightUpdates = !ui.highlightUpdates; if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes(); ctx.persist(); ctx.refresh(); }, tip: "Outline components on the page as they re-render" }),
      button({ label: "Run audits", icon: "security", onClick: () => { ui.a11yRequested = true; ui.securityRequested = true; ctx.selectTab("a11y"); }, tip: "Accessibility + security audits" }),
      button({ label: "Record a test", icon: "record", onClick: () => { ui.testPane = "record"; ctx.selectTab("test"); } })));

  const tips = ui.tipsDismissed ? null : card({
    title: "Get started", icon: "sparkles", testid: "overview-tips",
    actions: [button({ label: "Dismiss", variant: "ghost", size: "sm", onClick: () => { ui.tipsDismissed = true; ctx.persist(); ctx.refresh(); } })],
    body: h("div", { class: "ov-tips" },
      tip(1, "Pick an element", "Click anything in the app to jump to the component that rendered it — then edit its props.", () => ctx.togglePicker(), "pick", "⇧ ⌥ C"),
      tip(2, "Watch it re-render", "Outlines every component as it repaints, with render counts. The fastest way to find wasted work.", () => { ui.highlightUpdates = true; ctx.persist(); ctx.refresh(); }, "scan"),
      tip(3, "Change state live", "Every $atom is editable. Time-travel back through commits and diff any two.", () => ctx.selectTab("state"), "state"),
      tip(4, "Everything, one keystroke away", "The command palette finds sections, actions, components, atoms, and routes.", () => ctx.openPalette(), "command", "⌘ K")),
  });

  const perf = statGrid(
    stat({ label: "Commits", value: fmtCount(model.totals.commits), foot: rateNow > 0 ? `${rateNow.toFixed(1)}/s now` : "since open", icon: "zap", onClick: () => ctx.selectTab("profiler"), spark: recent.length > 1 ? microBars(recent, { width: 56, height: 18, highlight: (v) => (v > 16 ? "var(--dt-red)" : null) }) : null, testid: "ov-commits" }),
    stat({ label: "Avg commit", value: fmtMs(avg), foot: `p95 ${fmtMs(p95)}`, tone: avg >= 16 ? "red" : avg >= 8 ? "amber" : undefined, icon: "gauge", onClick: () => ctx.selectTab("profiler") }),
    stat({ label: "Memoised", value: fmtPct(memoShare), foot: `${fmtCount(memo)} skipped renders`, tone: rendered + memo > 0 && memoShare < 0.2 && commits.length > 3 ? "amber" : undefined, icon: "layers", onClick: () => { ui.profilerView = "why"; ctx.selectTab("profiler"); } }),
    stat({ label: "Frame rate", value: vitals.fps === null ? "—" : String(vitals.fps), unit: vitals.fps === null ? undefined : "fps", tone: vitals.fps === null ? undefined : vitals.fps >= 55 ? "green" : vitals.fps >= 30 ? "amber" : "red", spark: vitals.fpsSamples.length > 1 ? sparkline(vitals.fpsSamples.slice(-40).map(([, v]) => v), { width: 56, height: 18, color: "var(--dt-green)", max: 60 }) : null, icon: "activity", onClick: () => { ui.profilerView = "vitals"; ctx.selectTab("profiler"); } }),
    stat({ label: "INP", value: vitals.inp ? fmtMs(vitals.inp.value) : "—", foot: vitals.inp ? inpRating.replace("-", " ") : "interact to measure", tone: inpRating === "good" ? "green" : inpRating === "poor" ? "red" : inpRating === "needs-improvement" ? "amber" : undefined, icon: "cursor", onClick: () => { ui.profilerView = "vitals"; ctx.selectTab("profiler"); } }),
    stat({ label: "Requests", value: fmtCount(model.totals.network), foot: net.failed > 0 ? `${net.failed} failed` : net.pending > 0 ? `${net.pending} pending` : `avg ${fmtMs(net.avgDuration)}`, tone: net.failed > 0 ? "red" : undefined, icon: "network", onClick: () => ctx.selectTab("network") }),
  );

  const shape = stats
    ? statGrid(
        stat({ label: "Instances", value: fmtCount(stats.instances), icon: "inspect", onClick: () => ctx.selectTab("inspect") }),
        stat({ label: "DOM nodes", value: fmtCount(stats.domNodes), foot: `${fmtCount(stats.elements)} elements`, tone: stats.domNodes > 5000 ? "amber" : undefined, icon: "tree" }),
        stat({ label: "Atoms", value: fmtCount(stats.atoms), icon: "state", onClick: () => ctx.selectTab("state") }),
        stat({ label: "Effects", value: fmtCount(stats.effects), icon: "effects", onClick: () => ctx.selectTab("effects") }),
        stat({ label: "Queries", value: fmtCount(stats.queries), foot: `${stats.stores} stores`, icon: "data", onClick: () => ctx.selectTab("data") }),
        stat({ label: "Program", value: fmtBytes(stats.programBytes), foot: stats.heapBytes ? `heap ${fmtBytes(stats.heapBytes)}` : undefined, icon: "source", onClick: () => ctx.selectTab("source") }),
      )
    : null;

  const hot = ctx.memo("ov:hot", [model.revs.commit], () => hotAtoms(commits, 6));
  const maxHot = hot[0]?.[1] ?? 1;

  const watches = ui.watches.length > 0 && can(app, "evaluateExpression")
    ? card({
        title: "Watching", icon: "eye",
        actions: [button({ label: "Manage", size: "sm", variant: "ghost", onClick: () => ctx.selectTab("console") })],
        body: h("div", { class: "ov-watches" }, ...ui.watches.map((expr) => {
          const result = app.evaluateExpression(expr);
          return h("div", { key: expr, class: "ov-watch" },
            h("code", { class: "ov-watch-expr" }, expr),
            h("span", { class: ["v", result.ok ? `t-${result.value?.type ?? "undefined"}` : "t-error", "ellipsis"] }, result.ok ? result.value?.preview ?? "undefined" : result.error ?? "failed"));
        })),
      })
    : null;

  return h("div", { class: "dt-scroll", "data-dt": "overview" },
    h("div", { class: "ov" },
      hero,
      tips,
      h("div", { class: "ov-grid" },
        h("div", { class: "ov-col" },
          card({
            title: "Health", icon: "checkCircle", testid: "overview-health",
            sub: issues.length === 0 ? "No errors, failed requests, or warnings" : undefined,
            flush: true,
            body: issues.length === 0
              ? h("div", { class: "ov-healthy" }, icon("checkCircle", { size: 18 }), "Everything looks healthy in this session.")
              : h("div", { class: "ov-issues" }, ...issues.map((issue) => issueRow(ctx, issue))),
          }),
          card({ title: "Performance", icon: "gauge", body: perf }),
          shape ? card({ title: "App shape", icon: "box", body: shape }) : null),
        h("div", { class: "ov-col" },
          card({
            title: "Render activity", icon: "activity",
            sub: commits.length > 0 ? `last ${Math.min(commits.length, 80)} commits` : undefined,
            actions: [button({ label: "Profile", size: "sm", variant: "ghost", icon: "arrowRight", onClick: () => ctx.selectTab("profiler") })],
            body: commits.length === 0
              ? h("div", { class: "hint" }, "Interact with the app — every commit shows up here.")
              : h("div", { class: "ov-activity" },
                  microBars(durations.slice(-80), { width: 360, height: 64, highlight: (v) => (v > 16 ? "var(--dt-red)" : v > 8 ? "var(--dt-amber)" : null) }),
                  h("div", { class: "ov-activity-legend" },
                    h("span", {}, h("i", { style: { background: "var(--dt-accent)" } }), "within budget"),
                    h("span", {}, h("i", { style: { background: "var(--dt-amber)" } }), "> 8ms"),
                    h("span", {}, h("i", { style: { background: "var(--dt-red)" } }), "> 16ms (dropped frame)"))),
          }),
          card({
            title: "What drives re-renders", icon: "state",
            body: hot.length === 0
              ? h("div", { class: "hint" }, "No state-driven commits yet. Change something in the app.")
              : h("div", { class: "barlist" }, ...hot.map(([path, count]) => h("button", {
                  key: path, type: "button", class: "barlist-row", onClick: () => openAtom(ctx, path),
                  "data-tip": `Open $${path} in State`,
                },
                  h("span", { class: "lbl mono tone-purple" }, `$${path}`),
                  h("span", { class: "meter" }, h("span", { style: { width: `${Math.max(4, (count / maxHot) * 100)}%` } })),
                  h("span", { class: "val" }, `${count} commit${count === 1 ? "" : "s"}`)))),
          }),
          watches))));
}

export const overviewView: ViewDefinition = {
  id: "overview",
  label: "Overview",
  icon: "overview",
  group: "home",
  hint: "Health, cost, and shape of the app",
  keywords: "home summary health dashboard start",
  badge: (ctx) => {
    const errors = ctx.model.errors.length;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "tips", label: "Show the getting-started tips", icon: "sparkles", run: () => { ctx.ui.tipsDismissed = false; ctx.persist(); ctx.selectTab("overview"); } },
  ],
  css: /* css */ `
.ov { padding: 14px; display: flex; flex-direction: column; gap: 12px; max-width: 1400px; }
.ov-hero {
  position: relative; overflow: hidden;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 16px 16px 16px 18px; border-radius: var(--dt-r-lg);
  border: 1px solid var(--dt-border-strong);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(99, 102, 241, 0.22), transparent 55%),
    radial-gradient(90% 120% at 100% 0%, rgba(56, 189, 248, 0.14), transparent 60%),
    var(--dt-bg-elev);
  box-shadow: var(--dt-inset-hi);
}
:host([data-theme="light"]) .ov-hero {
  background: radial-gradient(120% 140% at 0% 0%, rgba(99, 102, 241, 0.12), transparent 55%), radial-gradient(90% 120% at 100% 0%, rgba(56, 189, 248, 0.1), transparent 60%), var(--dt-bg-elev);
}
.ov-hero-main { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.ov-hero-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ov-hero-title h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-pulse { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--dt-green); box-shadow: 0 0 0 4px var(--dt-green-soft); animation: dt-pulse 2s ease-in-out infinite; }
.ov-pulse.t-amber { background: var(--dt-amber); box-shadow: 0 0 0 4px var(--dt-amber-soft); }
.ov-pulse.t-red { background: var(--dt-red); box-shadow: 0 0 0 4px var(--dt-red-soft); }
.ov-hero-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
.ov-hero-meta > span { display: inline-flex; align-items: center; gap: 5px; }
.ov-hero-meta code { font-family: var(--dt-mono); color: var(--dt-text-2); }
.ov-hero-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; align-items: start; }
.ov-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ov-issues { display: flex; flex-direction: column; }
.ov-issue {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
  padding: 10px 12px; border: 0; border-bottom: 1px solid var(--dt-border); background: none; color: inherit;
}
.ov-issue:last-child { border-bottom: 0; }
.ov-issue:hover { background: var(--dt-bg-hover); }
.ov-issue-ic { flex: none; margin-top: 1px; }
.ov-issue.t-bad .ov-issue-ic { color: var(--dt-red); }
.ov-issue.t-warn .ov-issue-ic { color: var(--dt-amber); }
.ov-issue.t-info .ov-issue-ic { color: var(--dt-blue); }
.ov-issue.t-good .ov-issue-ic { color: var(--dt-green); }
.ov-issue-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ov-issue-title { font-weight: 650; color: var(--dt-text); }
.ov-issue-detail { color: var(--dt-text-2); font-size: var(--dt-fs-sm); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ov-issue-fix { color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
.ov-issue-go { flex: none; display: inline-flex; align-items: center; gap: 4px; color: var(--dt-accent-text); font-size: var(--dt-fs-sm); font-weight: 600; opacity: 0; transition: opacity var(--dt-fast); }
.ov-issue:hover .ov-issue-go, .ov-issue:focus-visible .ov-issue-go { opacity: 1; }
.ov-healthy { display: flex; align-items: center; gap: 10px; padding: 14px 12px; color: var(--dt-green); font-weight: 600; }
.ov-tips { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
.ov-tip-keys { margin-top: 4px; display: flex; }
.ov-tip {
  display: flex; align-items: flex-start; gap: 10px; text-align: left; padding: 11px 12px; border-radius: var(--dt-r);
  border: 1px solid var(--dt-border); background: var(--dt-bg); color: inherit;
  transition: border-color var(--dt-fast), transform var(--dt-fast), background var(--dt-fast);
}
.ov-tip:hover { border-color: rgba(139, 123, 255, 0.5); background: var(--dt-bg-elev-2); transform: translateY(-1px); }
.ov-tip-ic { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.ov-tip-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ov-tip-title { font-weight: 650; display: flex; align-items: center; gap: 6px; }
.ov-tip-n { font-size: 10px; font-weight: 800; width: 16px; height: 16px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--dt-bg-active); color: var(--dt-text-2); }
.ov-tip-body { color: var(--dt-text-3); font-size: var(--dt-fs-sm); line-height: 1.45; }
.ov-activity { display: flex; flex-direction: column; gap: 8px; }
.ov-activity svg { width: 100%; height: 64px; }
.ov-activity-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: var(--dt-fs-xs); color: var(--dt-text-3); }
.ov-activity-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ov-activity-legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.ov-watches { display: flex; flex-direction: column; gap: 6px; }
.ov-watch { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ov-watch-expr { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-welcome { max-width: 560px; margin: 36px auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ov-welcome h2 { margin: 6px 0 0; font-size: 22px; letter-spacing: -0.02em; }
.ov-welcome p { margin: 0; color: var(--dt-text-2); line-height: 1.6; }
.ov-welcome-mark { width: 72px; height: 72px; border-radius: 20px; display: grid; place-items: center; background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong); box-shadow: 0 16px 40px -16px rgba(99, 102, 241, 0.6); }
`,
};
