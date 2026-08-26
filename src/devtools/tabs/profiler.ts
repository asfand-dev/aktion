/**
 * Profiler tab — every commit, what rendered, and why.
 *
 * Three views over the same captured commits:
 *
 *   - **Commit** — the strip of commits, then a flamegraph of the selected one
 *     with each instance's phase, self time, and the reason it re-rendered.
 *   - **Ranked** — components sorted by total self time, with memo hit rates.
 *   - **Insights** — the same data turned into sentences that name a fix.
 *
 * The reason column is the part that matters. "Card rendered 240 times" is a
 * number; "Card re-rendered because `$filter` changed, 240 times, and was never
 * memoized" is a bug report.
 */

import {
  barRow, button, chip, chipGroup, code, copyButton, emptyState, faint, fmtCount,
  fmtMs, fmtPct, h, insightList, nextSort, section, spacer, stat, statGrid,
  table, toggle, toolbar,
} from "../ui.js";
import type { TabContext, TabDefinition } from "../context.js";
import { componentAggregates, hotAtoms } from "../model.js";
import type { CommitRecord, ComponentRenderRecord } from "../protocol.js";

export const profilerTab: TabDefinition = {
  id: "profiler",
  label: "Profiler",
  icon: "▲",
  hint: "Per-commit render timings, flamegraph, and memoization analysis",
  badge: (ctx) => (ctx.model.commits.length > 0 ? ctx.model.commits.length : null),
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { model, ui } = ctx;
  const commits = model.commits;

  const bar = toolbar(
    chipGroup(
      [
        { value: "commit" as const, label: "Commit", title: "Commit strip and flamegraph" },
        { value: "ranked" as const, label: "Ranked", title: "Components by total self time" },
        { value: "insights" as const, label: "Insights", title: "Detected render hot-spots" },
      ],
      ui.profilerView,
      (value) => {
        ui.profilerView = value;
        ctx.refresh();
      },
    ),
    spacer(),
    toggle("Flash", ui.flashOnCommit, () => {
      ui.flashOnCommit = !ui.flashOnCommit;
      ctx.refresh();
    }, "Outline the app element on every commit"),
    button("Clear", () => {
      model.commits.length = 0;
      ui.selectedCommitId = null;
      ctx.refresh();
    }, { title: "Drop recorded commits" }),
  );

  if (commits.length === 0) {
    return [bar, emptyState(
      "No commits recorded yet.",
      "Interact with the app — every render is captured while the panel is open.",
    )];
  }

  const out: Node[] = [bar, renderSummary(ctx)];
  if (ui.profilerView === "commit") {
    out.push(renderStrip(ctx));
    const selected = commits.find((c) => c.commitId === ui.selectedCommitId) ?? commits[commits.length - 1]!;
    out.push(renderCommitDetail(ctx, selected));
  } else if (ui.profilerView === "ranked") {
    out.push(renderRanked(ctx));
    out.push(renderHotAtoms(ctx));
  } else {
    out.push(renderInsights(ctx));
    out.push(renderHotAtoms(ctx));
  }
  return out;
}

/* -------------------------------------------------------------------------- */

function renderSummary(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const commits = model.commits;
  let total = 0, morph = 0, rendered = 0, memoized = 0, full = 0;
  let slowest: CommitRecord | null = null;
  for (const commit of commits) {
    total += commit.duration;
    morph += commit.morphTime ?? 0;
    rendered += commit.rendered;
    memoized += commit.memoized;
    if (commit.fullRender) full += 1;
    if (!slowest || commit.duration > slowest.duration) slowest = commit;
  }
  const first = commits[0];
  const last = commits[commits.length - 1];
  const span = first && last ? last.startTime - first.startTime : 0;
  const rate = span > 0 ? commits.length / (span / 1000) : 0;
  const memoShare = rendered + memoized > 0 ? memoized / (rendered + memoized) : 0;
  const domNodes = last?.domNodes;

  return section("Performance summary", statGrid(
    stat("commits", fmtCount(model.totals.commits)),
    stat("total render", fmtMs(total)),
    stat("avg / commit", fmtMs(commits.length > 0 ? total / commits.length : 0), {
      tone: total / Math.max(1, commits.length) >= 8 ? "warn" : undefined,
    }),
    slowest
      ? stat("slowest", fmtMs(slowest.duration), {
          tone: slowest.duration >= 16 ? "warn" : undefined,
          title: `Commit #${slowest.commitId} — click to inspect`,
          onClick: () => {
            ui.selectedCommitId = slowest!.commitId;
            ui.profilerView = "commit";
            ctx.refresh();
          },
        })
      : null,
    morph > 0
      ? stat("dom diff", fmtMs(morph), {
          title: "Time in the reconciler. A large share here means the tree is big, not that the program is slow.",
          tone: total > 0 && morph / total > 0.5 ? "warn" : undefined,
        })
      : null,
    stat("memoized", fmtPct(memoized, rendered + memoized), {
      tone: rendered + memoized > 0 && memoShare < 0.2 ? "warn" : "good",
      title: `${fmtCount(memoized)} skipped of ${fmtCount(rendered + memoized)} component evaluations`,
    }),
    stat("full renders", fmtCount(full), {
      tone: full > Math.max(1, commits.length * 0.5) ? "warn" : undefined,
      title: "Commits that bypassed memoization and re-evaluated the whole tree",
    }),
    rate > 0 ? stat("commit rate", `${rate.toFixed(1)}/s`, { tone: rate >= 30 ? "warn" : undefined }) : null,
    domNodes !== undefined ? stat("dom nodes", fmtCount(domNodes)) : null,
  ));
}

function renderStrip(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const max = Math.max(...model.commits.map((c) => c.duration), 0.001);
  const strip = h("div", { class: "commit-strip" });
  for (const commit of model.commits) {
    const height = Math.max(3, Math.round((commit.duration / max) * 52));
    strip.appendChild(h("div", {
      class: [
        "commit-bar",
        commit.initial ? "is-initial" : commit.fullRender ? "is-full" : "",
        commit.commitId === ui.selectedCommitId ? "is-selected" : "",
      ].filter(Boolean).join(" "),
      style: `height:${height}px`,
      title: `#${commit.commitId} · ${fmtMs(commit.duration)} · ${commit.rendered} rendered / ${commit.memoized} memoized`,
      onclick: () => {
        ui.selectedCommitId = commit.commitId;
        ctx.refresh();
      },
    }));
  }
  return section(null, [
    strip,
    h("div", { class: "legend" },
      h("span", {}, h("i", { class: "sw is-initial" }), "initial"),
      h("span", {}, h("i", { class: "sw is-full" }), "full render"),
      h("span", {}, h("i", { class: "sw" }), "incremental"),
    ),
  ], { flush: true });
}

function renderCommitDetail(ctx: TabContext, commit: CommitRecord): HTMLElement {
  const trigger = commit.initial
    ? "initial mount"
    : commit.changedPaths.length > 0
      ? commit.changedPaths.join(", ")
      : "forced (async / effect / timer)";

  const flame = h("div", {});
  if (commit.components.length === 0) {
    flame.appendChild(faint("No component instances in this commit (primitive root)."));
  } else {
    const maxSelf = Math.max(...commit.components.map((c) => c.selfTime), 0.001);
    const minDepth = Math.min(...commit.components.map((c) => c.depth));
    for (const record of commit.components) {
      flame.appendChild(renderFlameRow(ctx, record, maxSelf, minDepth));
    }
  }

  return section(`Commit #${commit.commitId}`, [
    h("div", { class: "kv" },
      h("span", {}, "duration ", h("b", { class: "mono" }, fmtMs(commit.duration))),
      commit.morphTime !== undefined ? h("span", {}, "dom diff ", h("b", { class: "mono" }, fmtMs(commit.morphTime))) : null,
      h("span", {}, "rendered ", h("b", {}, String(commit.rendered))),
      h("span", {}, "memoized ", h("b", {}, String(commit.memoized))),
      commit.domNodes !== undefined ? h("span", {}, "dom nodes ", h("b", {}, fmtCount(commit.domNodes))) : null,
      commit.fullRender ? chip("full render", "amber") : chip("incremental", "blue"),
    ),
    h("div", { class: "kv" }, h("span", {}, "trigger ", h("b", { class: "mono" }, trigger))),
    flame,
  ], {
    actions: [
      copyButton(() => JSON.stringify(commit, null, 2), "Copy JSON"),
    ],
  });
}

function renderFlameRow(
  ctx: TabContext,
  record: ComponentRenderRecord,
  maxSelf: number,
  minDepth: number,
): HTMLElement {
  const indent = (record.depth - minDepth) * 12;
  const width = record.phase === "memo" ? 22 : Math.max(6, Math.round((record.selfTime / maxSelf) * 100));
  const deps = record.deps && record.deps.length > 0 ? `\ndeps: ${record.deps.join(", ")}` : "";
  return h("div", { class: "flame-row", style: `padding-left:${indent}px` },
    h("div", { class: "flame-bar-wrap" },
      h("div", {
        class: `flame-bar p-${record.phase}`,
        style: `width:${width}%`,
        title: `${record.name} — ${record.phase} — ${fmtMs(record.selfTime)}\n${record.reason}${deps}\nClick to inspect this instance`,
        onclick: () => ctx.selectInstance(record.instanceKey),
        onmouseenter: () => ctx.highlightInstance(record.instanceKey, false),
        onmouseleave: () => ctx.overlay.hideHover(),
      }, `${record.kind === "user" ? "" : "▪ "}${record.name}`)),
    h("span", { class: "flame-reason" }, record.reason),
    h("span", { class: "flame-time" }, record.phase === "memo" ? "memo" : fmtMs(record.selfTime)),
  );
}

function renderRanked(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const rows = componentAggregates(model.commits);
  const maxTotal = Math.max(...rows.map((r) => r.total), 0.001);

  return section("Components — ranked by self time", table(
    [
      { key: "name", label: "Component", sort: (r) => r.name, render: (r) => h("span", { class: "name" }, r.name) },
      { key: "kind", label: "Type", sort: (r) => r.kind, render: (r) => chip(r.kind, r.kind === "user" ? "purple" : "grey") },
      { key: "instances", label: "Inst", numeric: true, sort: (r) => r.instances, render: (r) => String(r.instances) },
      { key: "renders", label: "Renders", numeric: true, sort: (r) => r.renders, render: (r) => fmtCount(r.renders) },
      {
        key: "memo",
        label: "Memo",
        numeric: true,
        sort: (r) => r.memo,
        title: "Renders skipped by per-instance memoization",
        render: (r) => h("span", {}, fmtCount(r.memo),
          r.renders + r.memo > 0 ? faint(` ${fmtPct(r.memo, r.renders + r.memo)}`) : null),
      },
      {
        key: "total",
        label: "Total",
        numeric: true,
        sort: (r) => r.total,
        render: (r) => h("span", { class: "bar-cell" },
          h("span", { class: "barfill", style: `width:${Math.round((r.total / maxTotal) * 100)}%` }),
          h("span", {}, fmtMs(r.total))),
      },
      { key: "avg", label: "Avg", numeric: true, sort: (r) => (r.renders ? r.total / r.renders : 0), render: (r) => (r.renders ? fmtMs(r.total / r.renders) : "—") },
      { key: "max", label: "Max", numeric: true, sort: (r) => r.max, render: (r) => (r.renders ? fmtMs(r.max) : "—") },
    ],
    rows,
    {
      sort: ui.rankedSort,
      onSort: (key) => {
        ui.rankedSort = nextSort(ui.rankedSort, key, key === "name" || key === "kind" ? 1 : -1);
        ctx.refresh();
      },
      empty: "No component renders captured.",
    },
  ));
}

function renderHotAtoms(ctx: TabContext): HTMLElement {
  const rows = hotAtoms(ctx.model.commits, 8);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return section("Reactivity — state paths that triggered commits", rows.length > 0
    ? h("div", {}, ...rows.map(([path, count]) =>
        barRow(code(path), count / max, `${fmtCount(count)} commit${count === 1 ? "" : "s"}`, {
          title: `Filter the State tab to $${path}`,
          onClick: () => {
            ctx.ui.stateFilter = path.split(".")[0] ?? path;
            ctx.selectTab("state");
          },
        })))
    : faint("No state-driven commits yet (forced / initial only)."));
}

/**
 * Heuristic insights.
 *
 * Each rule is chosen to have a low false-positive rate on a real app and to
 * point at a specific fix; a panel that cries wolf gets ignored, and an insight
 * you cannot act on is just a statistic with an icon.
 */
function renderInsights(ctx: TabContext): HTMLElement {
  const { model } = ctx;
  const aggs = componentAggregates(model.commits);
  const items: Array<{ tone: string; icon: string; text: string }> = [];
  const commitCount = model.commits.length;

  for (const agg of aggs) {
    if (agg.renders === 0) continue;
    const avg = agg.total / agg.renders;
    if (avg >= 8) {
      items.push({
        tone: "warn",
        icon: "▲",
        text: `${agg.name} averages ${fmtMs(avg)} per render across ${agg.instances} instance(s) — move the expensive work into a $memo, or split the component so less of it re-runs.`,
      });
    }
    if (agg.kind === "user" && agg.renders >= 12 && agg.memo === 0 && commitCount >= 4) {
      items.push({
        tone: "warn",
        icon: "↻",
        text: `${agg.name} re-rendered ${fmtCount(agg.renders)}× and was never memoized — it reads a $state path that changes on every commit. Check what it reads in the Inspect tab.`,
      });
    }
  }

  const forced = model.commits.filter((c) => c.fullRender && !c.initial).length;
  if (forced >= 3) {
    items.push({
      tone: "warn",
      icon: "⛶",
      text: `${fmtCount(forced)} commits bypassed memoization entirely. A forced render comes from an explicit notify — an async resolution, a timer, or an effect — so every component re-ran regardless of its deps.`,
    });
  }

  const morphHeavy = model.commits.filter((c) => (c.morphTime ?? 0) > c.duration * 0.6).length;
  if (morphHeavy >= 5) {
    items.push({
      tone: "warn",
      icon: "⇄",
      text: `${fmtCount(morphHeavy)} commits spent most of their time in the DOM reconciler, not in your program. That is a tree-size problem — paginate, virtualise, or render fewer nodes.`,
    });
  }

  const rateWindow = model.commits.slice(-20);
  if (rateWindow.length >= 20) {
    const span = (rateWindow[rateWindow.length - 1]!.startTime - rateWindow[0]!.startTime) / 1000;
    if (span > 0 && rateWindow.length / span > 30) {
      items.push({
        tone: "bad",
        icon: "⚠",
        text: `Commits are arriving at ${(rateWindow.length / span).toFixed(0)}/s. Something is writing state in a loop — check the Effects tab for a hot trigger and the State tab's activity sort.`,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      tone: "good",
      icon: "✓",
      text: commitCount > 0
        ? "No render hot-spots detected. Component bodies are cheap and memoization is doing its job."
        : "Nothing captured yet.",
    });
  }

  return section("Insights", insightList(items.slice(0, 8)));
}


