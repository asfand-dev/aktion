/**
 * Overview tab — the landing page: is anything wrong, and where do I look?
 *
 * A panel with fourteen tabs needs a front door. This one answers three
 * questions in order of urgency: what is broken right now (diagnostics, errors,
 * failed requests), what is expensive (render cost, hot atoms), and what is
 * this app made of (counts, route, theme). Every number is a link to the tab
 * that explains it.
 */

import {
  barRow, button, chip, code, faint, fmtBytes, fmtCount, fmtMs, fmtPct, h,
  insightList, muted, section, spacer, stat, statGrid, toolbar, truncateMiddle,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { hotAtoms, networkStats } from "../model.js";

export const overviewTab: TabDefinition = {
  id: "overview",
  label: "Overview",
  icon: "⚡",
  hint: "Health, cost, and shape of the inspected app",
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, model } = ctx;
  if (!app) {
    return [h("div", { class: "empty" },
      h("p", {}, "No Aktion app detected on this page."),
      h("p", { class: "faint" }, "Mount an ", code("<aktion-app>"), " and it will appear here."),
      h("p", { class: "faint" }, "Already mounted? The panel asks every app on the page to attach when it opens; if this app was created later, it registers itself on its next render."))];
  }

  const stats = can(app, "getStats") ? app.getStats() : null;
  const diagnostics = can(app, "getDiagnostics") ? app.getDiagnostics() : [];
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const net = networkStats(model.network);
  const lastCommit = model.commits[model.commits.length - 1];
  const totalRender = model.commits.reduce((sum, commit) => sum + commit.duration, 0);
  const rendered = model.commits.reduce((sum, commit) => sum + commit.rendered, 0);
  const memoized = model.commits.reduce((sum, commit) => sum + commit.memoized, 0);
  const logErrors = model.logs.filter((entry) => entry.level === "error").length;
  const warnings = model.logs.filter((entry) => entry.level === "warn").length;

  const bar = toolbar(
    muted(app.label),
    chip(`protocol v${ctx.hook.protocolVersion}`, "grey"),
    spacer(),
    can(app, "reload")
      ? button("Reload program", () => {
          app.reload();
          ctx.toast("Program re-planned");
        }, { title: "Re-plan and re-render from the current source" })
      : null,
    button("Force render", () => {
      app.forceRender();
      ctx.toast("Full re-render requested");
    }, { title: "Re-render the whole tree, bypassing memoization" }),
  );

  const out: Node[] = [bar];

  /* ---- health ---- */
  const problems: Array<{ tone: string; icon: string; text: Node }> = [];
  if (errors.length > 0) {
    problems.push({
      tone: "bad",
      icon: "✖",
      text: h("span", {},
        `${errors.length} program error${errors.length === 1 ? "" : "s"}: `,
        code(truncateMiddle(errors[0]!.message, 90)),
        " ",
        linkTo(ctx, "source", "open Source")),
    });
  }
  if (model.errors.length > 0) {
    problems.push({
      tone: "bad",
      icon: "✖",
      text: h("span", {},
        `${model.errors.length} runtime error${model.errors.length === 1 ? "" : "s"} during this session. `,
        linkTo(ctx, "console", "open Console")),
    });
  }
  if (logErrors > 0) {
    problems.push({
      tone: "bad",
      icon: "▤",
      text: h("span", {}, `${logErrors} console error${logErrors === 1 ? "" : "s"}. `, linkTo(ctx, "console", "open Console")),
    });
  }
  if (net.failed > 0) {
    problems.push({
      tone: "bad",
      icon: "⇅",
      text: h("span", {}, `${net.failed} request${net.failed === 1 ? "" : "s"} failed. `, linkTo(ctx, "network", "open Network")),
    });
  }
  if (warnings > 0) {
    problems.push({
      tone: "warn",
      icon: "▲",
      text: h("span", {}, `${warnings} runtime warning${warnings === 1 ? "" : "s"} — these are usually the direct explanation of a reactivity bug. `, linkTo(ctx, "console", "open Console")),
    });
  }
  const rate = commitRate(ctx);
  if (rate > 30) {
    problems.push({
      tone: "bad",
      icon: "⚠",
      text: h("span", {}, `Commits are arriving at ${rate.toFixed(0)}/s — something is writing state in a loop. `, linkTo(ctx, "profiler", "open Profiler")),
    });
  }
  if (problems.length === 0) {
    problems.push({ tone: "good", icon: "✓", text: h("span", {}, "No errors, failed requests, or runtime warnings in this session.") });
  }
  out.push(section("Health", insightList(problems)));

  /* ---- session ---- */
  out.push(section("Session", statGrid(
    stat("commits", fmtCount(model.totals.commits), {
      title: "Render commits observed",
      onClick: () => ctx.selectTab("profiler"),
    }),
    stat("render time", fmtMs(totalRender), { onClick: () => ctx.selectTab("profiler") }),
    stat("last commit", fmtMs(lastCommit?.duration), {
      tone: (lastCommit?.duration ?? 0) >= 16 ? "warn" : undefined,
      onClick: () => ctx.selectTab("profiler"),
    }),
    stat("memoized", fmtPct(memoized, rendered + memoized), {
      tone: rendered + memoized > 0 && memoized / (rendered + memoized) < 0.2 ? "warn" : "good",
      onClick: () => ctx.selectTab("profiler"),
    }),
    stat("effects", fmtCount(model.totals.effects), { onClick: () => ctx.selectTab("effects") }),
    stat("requests", fmtCount(model.totals.network), { onClick: () => ctx.selectTab("network") }),
    stat("navigations", fmtCount(model.totals.routes), { onClick: () => ctx.selectTab("routes") }),
    stat("state flushes", fmtCount(model.totals.stateFlushes), { onClick: () => ctx.selectTab("state") }),
  )));

  /* ---- shape ---- */
  if (stats) {
    out.push(section("App", statGrid(
      stat("instances", fmtCount(stats.instances), {
        title: "Live component instances",
        onClick: () => ctx.selectTab("inspect"),
      }),
      stat("dom nodes", fmtCount(stats.domNodes), {
        title: `${fmtCount(stats.elements)} elements`,
        tone: stats.domNodes > 5000 ? "warn" : undefined,
      }),
      stat("atoms", fmtCount(stats.atoms), { onClick: () => ctx.selectTab("state") }),
      stat("effects", fmtCount(stats.effects), { onClick: () => ctx.selectTab("effects") }),
      stat("queries", fmtCount(stats.queries), { onClick: () => ctx.selectTab("data") }),
      stat("stores", fmtCount(stats.stores), { onClick: () => ctx.selectTab("data") }),
      stat("program", fmtBytes(stats.programBytes), { onClick: () => ctx.selectTab("source") }),
      stats.heapBytes !== undefined ? stat("js heap", fmtBytes(stats.heapBytes), { title: "performance.memory.usedJSHeapSize" }) : null,
    )));
  }

  /* ---- context ---- */
  const route = can(app, "getRoute") ? app.getRoute() : null;
  const theme = can(app, "getTheme") ? app.getTheme() : null;
  if (route || theme) {
    out.push(section("Context", h("div", { class: "kv" },
      route ? h("span", {}, "route ", h("b", { class: "mono" }, route.path)) : null,
      route?.pattern ? h("span", {}, "pattern ", h("b", { class: "mono" }, route.pattern)) : null,
      route ? h("span", {}, "mode ", h("b", {}, route.mode)) : null,
      theme ? h("span", {}, "theme ", h("b", {}, theme.name)) : null,
      theme && theme.devtoolsOverrides.length > 0
        ? chip(`${theme.devtoolsOverrides.length} token override${theme.devtoolsOverrides.length === 1 ? "" : "s"}`, "amber")
        : null,
      can(app, "listPropOverrides") && app.listPropOverrides().length > 0
        ? chip(`${app.listPropOverrides().length} prop override(s)`, "amber")
        : null)));
  }

  /* ---- hot atoms ---- */
  const hot = hotAtoms(model.commits, 5);
  if (hot.length > 0) {
    const max = Math.max(...hot.map(([, count]) => count));
    out.push(section("What drives re-renders", h("div", {}, ...hot.map(([path, count]) =>
      barRow(code(path), count / max, `${fmtCount(count)} commit${count === 1 ? "" : "s"}`, {
        onClick: () => {
          ctx.ui.stateFilter = path.split(".")[0] ?? path;
          ctx.selectTab("state");
        },
      })))));
  }

  out.push(section("Where to look", h("div", { class: "quick-grid" },
    quickLink(ctx, "inspect", "◎ Inspect", "Pick an element, edit its props and state"),
    quickLink(ctx, "state", "◆ State", "Read and write reactive state, travel back in time"),
    quickLink(ctx, "profiler", "▲ Profiler", "Find what re-renders and why"),
    quickLink(ctx, "network", "⇅ Network", "Requests, and rules to mock or delay them"),
    quickLink(ctx, "console", "▤ Console", "Runtime diagnostics and an expression REPL"),
    quickLink(ctx, "test", "✓ Test", "Record a test, audit a11y, measure coverage"),
  )));

  if (!ctx.hook.options.captureProps || !ctx.hook.options.tagDom) {
    out.push(section(null, faint(
      "Some instrumentation is off, so the inspector will show less than it can. Settings has the switches.",
    ), { flush: true }));
  }
  return out;
}

function commitRate(ctx: TabContext): number {
  const window = ctx.model.commits.slice(-20);
  if (window.length < 5) return 0;
  const span = (window[window.length - 1]!.startTime - window[0]!.startTime) / 1000;
  return span > 0 ? window.length / span : 0;
}

function linkTo(ctx: TabContext, tab: Parameters<TabContext["selectTab"]>[0], label: string): HTMLElement {
  return h("button", { class: "inline-link", onclick: () => ctx.selectTab(tab) }, label);
}

function quickLink(
  ctx: TabContext,
  tab: Parameters<TabContext["selectTab"]>[0],
  title: string,
  hint: string,
): HTMLElement {
  return h("button", { class: "quick", onclick: () => ctx.selectTab(tab) },
    h("span", { class: "quick-title" }, title),
    h("span", { class: "quick-hint" }, hint));
}
