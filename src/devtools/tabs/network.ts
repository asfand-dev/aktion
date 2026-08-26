/**
 * Network tab — every request the Aktion HTTP layer made, and the rules that
 * let you change what happens next time.
 *
 * The list half is what you expect: method, path, status, duration, size, a
 * waterfall, and a detail pane with headers and bodies.
 *
 * The rules half is the interesting one. A rule matches by URL (substring or
 * `*` glob) and then delays, mocks, fails, or blackholes the request. That
 * turns three of the hardest things to test — a slow endpoint, a 500, an
 * offline device — into a checkbox, with no server, no program edit, and no
 * `if (import.meta.env.DEV)` branch left behind in the source.
 */

import {
  barRow, button, chip, chipGroup, code, copyButton, defList, emptyState, faint,
  fmtBytes, fmtCount, fmtMs, h, muted, searchInput, section, spacer, stat,
  statGrid, table, toggle, toolbar, truncateMiddle, urlHost, urlPath,
  waterfallBar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { networkStats, type NetworkRequest } from "../model.js";
import { findMatchingRule, newRule } from "../rules.js";
import type { NetworkRule } from "../protocol.js";

export const networkTab: TabDefinition = {
  id: "network",
  label: "Network",
  icon: "⇅",
  hint: "HTTP requests, response bodies, and request mocking / latency injection",
  badge: (ctx) => {
    const stats = networkStats(ctx.model.network);
    if (stats.failed > 0) return stats.failed;
    return stats.total > 0 ? stats.total : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { model, ui } = ctx;
  const stats = networkStats(model.network);
  const activeRules = ui.rules.filter((rule) => rule.enabled).length;

  const bar = toolbar(
    searchInput(ui.networkFilter, (value) => {
      ui.networkFilter = value;
      ctx.refresh();
    }, "Filter by URL or method…"),
    toggle("Problems", ui.networkOnlyProblems, () => {
      ui.networkOnlyProblems = !ui.networkOnlyProblems;
      ctx.refresh();
    }, "Only failures, blocks, and 4xx/5xx responses"),
    spacer(),
    toggle(
      activeRules > 0 ? `Rules (${activeRules})` : "Rules",
      ui.showRules,
      () => {
        ui.showRules = !ui.showRules;
        ctx.refresh();
      },
      "Delay, mock, or fail matching requests",
    ),
    button("Clear", () => {
      model.network.length = 0;
      ui.selectedRequest = null;
      ctx.refresh();
    }, { title: "Drop recorded requests" }),
  );

  const out: Node[] = [bar];

  if (!ctx.hook.options.captureNetwork) {
    out.push(section(null, h("div", { class: "banner t-amber" },
      h("span", {}, "Network capture is off — turn it back on in Settings."),
    ), { flush: true }));
  }

  if (ui.showRules) out.push(renderRules(ctx));

  if (model.network.length === 0) {
    out.push(emptyState(
      "No requests captured yet.",
      "Every $query, $mutation, and Http({...}) call the program makes is recorded here.",
    ));
    return out;
  }

  out.push(section("Summary", statGrid(
    stat("requests", fmtCount(model.totals.network)),
    stat("pending", fmtCount(stats.pending), { tone: stats.pending > 0 ? "warn" : undefined }),
    stat("failed", fmtCount(stats.failed), { tone: stats.failed > 0 ? "bad" : "good" }),
    stats.mocked > 0 ? stat("mocked", fmtCount(stats.mocked), { tone: "warn" }) : null,
    stat("avg", fmtMs(stats.avgDuration)),
    stats.slowest
      ? stat("slowest", fmtMs(stats.slowest.duration), {
          title: `${stats.slowest.method} ${stats.slowest.url}`,
          onClick: () => {
            ui.selectedRequest = stats.slowest!.requestId;
            ctx.refresh();
          },
        })
      : null,
    stat("transferred", fmtBytes(stats.bytes)),
  )));

  out.push(renderList(ctx));

  const selected = model.network.find((r) => r.requestId === ui.selectedRequest);
  if (selected) out.push(...renderDetail(ctx, selected));

  const endpoints = endpointBreakdown(model.network);
  if (endpoints.length > 1) {
    const max = Math.max(...endpoints.map((e) => e.total));
    out.push(section("Slowest endpoints", h("div", {}, ...endpoints.slice(0, 8).map((entry) =>
      barRow(
        code(`${entry.method} ${truncateMiddle(entry.path, 44)}`),
        entry.total / max,
        `${fmtCount(entry.count)}× · ${fmtMs(entry.total / entry.count)} avg`,
        { tone: entry.failures > 0 ? "bad" : undefined, title: entry.failures > 0 ? `${entry.failures} failed` : undefined },
      )))));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  List                                                                       */
/* -------------------------------------------------------------------------- */

function renderList(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const filter = ui.networkFilter.trim().toLowerCase();
  const rows = model.network.filter((request) => {
    if (filter !== "" && !`${request.method} ${request.url}`.toLowerCase().includes(filter)) return false;
    if (ui.networkOnlyProblems) {
      const failed = request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400;
      if (!failed) return false;
    }
    return true;
  });

  const first = rows.reduce((min, r) => Math.min(min, r.startTime), Number.MAX_SAFE_INTEGER);
  const last = rows.reduce((max, r) => Math.max(max, r.endTime ?? r.startTime), 0);
  const span = Math.max(1, last - first);

  return section(null, table(
    [
      {
        key: "status",
        label: "Status",
        render: (row) => statusChip(row),
        sort: (row) => row.status ?? (row.phase === "pending" ? 0 : 999),
      },
      { key: "method", label: "Method", sort: (row) => row.method, render: (row) => code(row.method) },
      {
        key: "url",
        label: "Path",
        sort: (row) => row.url,
        render: (row) => h("span", { title: row.url },
          truncateMiddle(urlPath(row.url), 46),
          urlHost(row.url) ? faint(` ${urlHost(row.url)}`) : null,
          row.rule ? chip(row.rule, "purple", "Matched a DevTools rule") : null),
      },
      {
        key: "size",
        label: "Size",
        numeric: true,
        sort: (row) => row.responseSize ?? 0,
        render: (row) => fmtBytes(row.responseSize),
      },
      {
        key: "time",
        label: "Time",
        numeric: true,
        sort: (row) => row.duration ?? 0,
        render: (row) => h("span", {},
          row.duration !== undefined ? fmtMs(row.duration) : faint("…"),
          row.injectedDelay ? faint(` +${row.injectedDelay}ms`) : null),
      },
      {
        key: "waterfall",
        label: "Waterfall",
        render: (row) => waterfallBar(
          (row.startTime - first) / span,
          Math.max(0.01, (row.duration ?? 0) / span),
          row.phase === "error" || row.phase === "blocked" ? "red" : row.phase === "mock" ? "purple" : "cyan",
          `${fmtMs(row.duration)} starting at +${Math.round(row.startTime - first)}ms`,
        ),
      },
    ],
    rows,
    {
      rowClass: (row) => (row.requestId === ui.selectedRequest ? "is-selected" : ""),
      onRowClick: (row) => {
        ui.selectedRequest = row.requestId === ui.selectedRequest ? null : row.requestId;
        ctx.refresh();
      },
      empty: filter === "" ? "No requests match the current filters." : `Nothing matches "${filter}".`,
    },
  ), { flush: true });
}

function statusChip(request: NetworkRequest): HTMLElement {
  if (request.phase === "pending") return chip("pending", "grey");
  if (request.phase === "blocked") return chip("blocked", "purple", "Blocked by a DevTools rule");
  if (request.phase === "error") return chip("failed", "red", request.error);
  const status = request.status ?? 0;
  const tone = status >= 500 ? "red" : status >= 400 ? "amber" : status >= 300 ? "blue" : "green";
  return chip(String(status || "?"), request.phase === "mock" ? "purple" : tone, request.phase === "mock" ? "Mocked by a DevTools rule" : undefined);
}

/* -------------------------------------------------------------------------- */
/*  Detail                                                                     */
/* -------------------------------------------------------------------------- */

function renderDetail(ctx: TabContext, request: NetworkRequest): Node[] {
  const { ui } = ctx;
  const panes: Array<{ value: typeof ui.networkPane; label: string; title: string }> = [
    { value: "response", label: "Response", title: "Response body" },
    { value: "request", label: "Request", title: "Request body" },
    { value: "headers", label: "Headers", title: "Request and response headers" },
    { value: "timing", label: "Timing", title: "When it ran and what it cost" },
  ];

  const head = section(null, [
    h("div", { class: "detail-head" },
      statusChip(request),
      code(request.method),
      h("span", { class: "mono wrap", title: request.url }, truncateMiddle(request.url, 80)),
      spacer(),
      copyButton(() => request.url, "Copy URL"),
      copyButton(() => asCurl(request), "Copy as curl"),
      can(ctx.app, "setNetworkRules")
        ? button("Mock this", () => {
            const rule = newRule({
              pattern: urlPath(request.url),
              method: request.method,
              action: "mock",
              status: request.status ?? 200,
              body: request.responseBody ?? "",
              label: `mock ${urlPath(request.url)}`,
            });
            ui.rules = [...ui.rules, rule];
            ui.showRules = true;
            pushRules(ctx);
            ctx.toast("Rule added — edit the body below");
            ctx.refresh();
          }, { title: "Create a rule that replays this response for matching requests" })
        : null,
    ),
    request.error ? h("div", { class: "banner t-red" }, request.error) : null,
  ], { flush: true });

  const tabs = section(null, chipGroup(panes, ui.networkPane, (value) => {
    ui.networkPane = value;
    ctx.refresh();
  }), { flush: true });

  let body: Node;
  switch (ui.networkPane) {
    case "response":
      body = request.responseBody
        ? h("pre", { class: "code-pre" }, request.responseBody)
        : faint(request.phase === "pending" ? "Still in flight." : "Empty response body.");
      break;
    case "request":
      body = request.requestBody
        ? h("pre", { class: "code-pre" }, request.requestBody)
        : faint("No request body (GET / HEAD, or an empty payload).");
      break;
    case "headers":
      body = h("div", {},
        section("Request headers", headerList(request.requestHeaders)),
        section("Response headers", headerList(request.responseHeaders)));
      break;
    case "timing":
      body = defList([
        ["started", `+${Math.round(request.startTime)}ms (page clock)`],
        ["duration", fmtMs(request.duration)],
        ["injected delay", request.injectedDelay ? `${request.injectedDelay}ms (DevTools rule)` : "none"],
        ["status", request.status !== undefined ? String(request.status) : request.phase],
        ["size", fmtBytes(request.responseSize)],
        ["rule", request.rule ?? "none"],
      ]);
      break;
  }

  return [head, tabs, section(null, body, { flush: true })];
}

function headerList(headers: Record<string, string> | undefined): Node {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return faint("None recorded.");
  return defList(entries.sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => [
    key,
    h("span", { class: "mono wrap" }, value),
  ]));
}

/** A copy-pasteable curl command, for reproducing a request outside the app. */
function asCurl(request: NetworkRequest): string {
  const parts = [`curl -X ${request.method} ${JSON.stringify(request.url)}`];
  for (const [key, value] of Object.entries(request.requestHeaders ?? {})) {
    parts.push(`  -H ${JSON.stringify(`${key}: ${value}`)}`);
  }
  if (request.requestBody) parts.push(`  --data ${JSON.stringify(request.requestBody)}`);
  return parts.join(" \\\n");
}

/* -------------------------------------------------------------------------- */
/*  Rules                                                                      */
/* -------------------------------------------------------------------------- */

function renderRules(ctx: TabContext): HTMLElement {
  const { app, ui } = ctx;
  if (!can(app, "setNetworkRules")) {
    return section("Request rules", faint("This runtime does not support DevTools request rules."));
  }

  const rows = ui.rules.map((rule) => renderRule(ctx, rule));
  return section("Request rules", [
    faint("Rules are evaluated in order; the first enabled match wins. A pattern is a URL substring, or a glob with * wildcards. An empty pattern matches everything."),
    h("div", { class: "rule-list" }, ...rows),
    h("div", { class: "detail-head" },
      button("＋ Delay", () => addRule(ctx, "delay"), { title: "Add latency to matching requests" }),
      button("＋ Mock", () => addRule(ctx, "mock"), { title: "Answer matching requests with a canned response" }),
      button("＋ Fail", () => addRule(ctx, "fail"), { title: "Fail matching requests" }),
      button("＋ Offline", () => addRule(ctx, "offline"), { title: "Blackhole every request" }),
      spacer(),
      ui.rules.length > 0
        ? button("Remove all", () => {
            ui.rules = [];
            pushRules(ctx);
            ctx.toast("Rules cleared");
            ctx.refresh();
          }, { tone: "warn" })
        : null),
  ]);
}

function addRule(ctx: TabContext, action: NetworkRule["action"]): void {
  // A delay rule is useless at 0ms, so that one seeds a visible default; the
  // others deliberately start with no injected latency.
  const seed: Partial<NetworkRule> = action === "offline"
    ? { action, pattern: "*", label: "offline", message: "Failed to fetch (DevTools offline mode)" }
    : action === "delay"
      ? { action, delayMs: 1000 }
      : { action };
  ctx.ui.rules = [...ctx.ui.rules, newRule(seed)];
  pushRules(ctx);
  ctx.refresh();
}

function renderRule(ctx: TabContext, rule: NetworkRule): HTMLElement {
  const { ui } = ctx;
  const update = (patch: Partial<NetworkRule>): void => {
    ui.rules = ui.rules.map((entry) => (entry.id === rule.id ? { ...entry, ...patch } : entry));
    pushRules(ctx);
    ctx.refresh();
  };
  const field = (
    placeholder: string,
    value: string,
    onCommit: (value: string) => void,
    width = "150px",
  ): HTMLInputElement => {
    const input = h("input", { class: "search", placeholder, value, style: `max-width:${width}` }) as HTMLInputElement;
    input.addEventListener("change", () => onCommit(input.value));
    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") onCommit(input.value);
    });
    return input;
  };

  // How many recorded requests this rule would claim: a rule that matches
  // nothing looks identical to a rule that is not working.
  const matches = ctx.model.network.filter((request) =>
    findMatchingRule([rule], request.method, request.url) !== null).length;

  return h("div", { class: `rule ${rule.enabled ? "" : "is-off"}` },
    h("div", { class: "rule-head" },
      toggle(rule.enabled ? "on" : "off", rule.enabled, () => update({ enabled: !rule.enabled })),
      chip(rule.action, rule.action === "mock" ? "purple" : rule.action === "delay" ? "blue" : "red"),
      field("URL pattern (empty = all)", rule.pattern, (value) => update({ pattern: value }), "220px"),
      field("method", rule.method ?? "", (value) => update({ method: value.trim() === "" ? undefined : value.trim().toUpperCase() }), "80px"),
      spacer(),
      muted(`${matches} match${matches === 1 ? "" : "es"}`),
      button("✕", () => {
        ui.rules = ui.rules.filter((entry) => entry.id !== rule.id);
        pushRules(ctx);
        ctx.refresh();
      }, { title: "Remove this rule" })),
    h("div", { class: "rule-body" },
      rule.action !== "offline"
        ? field("delay ms", String(rule.delayMs ?? 0), (value) => update({ delayMs: Number(value) || 0 }), "90px")
        : null,
      rule.action === "mock"
        ? field("status", String(rule.status ?? 200), (value) => update({ status: Number(value) || 200 }), "80px")
        : null,
      rule.action === "mock"
        ? (() => {
            const area = h("textarea", {
              class: "rule-body-input",
              placeholder: '{"items": []}  — JSON, or plain text',
            }) as HTMLTextAreaElement;
            area.value = rule.body ?? "";
            area.addEventListener("change", () => update({ body: area.value }));
            return area;
          })()
        : null,
      rule.action === "fail" || rule.action === "offline"
        ? field("error message", rule.message ?? "", (value) => update({ message: value }), "260px")
        : null,
    ),
  );
}

/** Install the current rule list on the app. */
function pushRules(ctx: TabContext): void {
  if (!can(ctx.app, "setNetworkRules")) return;
  ctx.app.setNetworkRules(ctx.ui.rules);
}

/* -------------------------------------------------------------------------- */

/** Per-endpoint totals for the "slowest endpoints" breakdown. */
function endpointBreakdown(requests: ReadonlyArray<NetworkRequest>): Array<{
  method: string;
  path: string;
  count: number;
  total: number;
  failures: number;
}> {
  const map = new Map<string, { method: string; path: string; count: number; total: number; failures: number }>();
  for (const request of requests) {
    const path = urlPath(request.url);
    const key = `${request.method} ${path}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { method: request.method, path, count: 0, total: 0, failures: 0 };
      map.set(key, entry);
    }
    entry.count += 1;
    entry.total += request.duration ?? 0;
    if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400) entry.failures += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
