/**
 * Network — every request the Aktion HTTP layer made, with a waterfall,
 * headers, payloads, and responses; copy as cURL / fetch or export a HAR; and
 * rules that mock, delay, fail, or flake any request without touching the
 * program — plus throttling presets.
 */

import { h, type Child } from "../core/vdom.js";
import { can, type ViewContext, type ViewDefinition, type UiState } from "../context.js";
import type { NetworkRequest } from "../model.js";
import { networkStats } from "../model.js";
import type { NetworkRule } from "../protocol.js";
import { findMatchingRule, newRule } from "../rules.js";
import { toCurl, toFetch, toHar } from "../analysis/har.js";
import { icon } from "../ui/icons.js";
import {
  button, chip, downloadText, emptyState, field, fmtBytes, fmtMs, iconButton, note, searchField, segmented, select, spacer, tabs, toggleSwitch, viewbar, vsep, truncateMiddle,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { valueTree } from "../ui/value.js";
import { isProblem, paneSize, requestStatusLabel, requestTone, setPaneSize, unsupported } from "./common.js";

type StatusFilter = UiState["networkStatus"];

function matchesStatus(request: NetworkRequest, filter: StatusFilter): boolean {
  switch (filter) {
    case "ok": return request.phase === "success" && (request.status ?? 0) < 300;
    case "redirect": return (request.status ?? 0) >= 300 && (request.status ?? 0) < 400;
    case "client": return (request.status ?? 0) >= 400 && (request.status ?? 0) < 500;
    case "server": return (request.status ?? 0) >= 500;
    case "failed": return request.phase === "error" || request.phase === "blocked";
    case "mocked": return request.phase === "mock" || request.rule !== undefined;
    case "pending": return request.phase === "pending";
    default: return true;
  }
}

function pathOf(url: string): { path: string; host: string } {
  try {
    const parsed = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost/");
    const sameOrigin = typeof location !== "undefined" && parsed.origin === location.origin;
    return { path: `${parsed.pathname}${parsed.search}`, host: sameOrigin ? "" : parsed.host };
  } catch {
    return { path: url, host: "" };
  }
}

function parseBody(text: string | undefined): { json: true; value: unknown } | { json: false } {
  if (!text) return { json: false };
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return { json: false };
  try {
    return { json: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { json: false };
  }
}

/* -------------------------------------------------------------------------- */
/*  Rules                                                                      */
/* -------------------------------------------------------------------------- */

function addRule(ctx: ViewContext, seed: Partial<NetworkRule>): NetworkRule {
  const rule = newRule(seed);
  ctx.ui.rules = [...ctx.ui.rules, rule];
  ctx.ui.showRules = true;
  ctx.pushRules();
  ctx.refresh();
  return rule;
}

function updateRule(ctx: ViewContext, id: string, patch: Partial<NetworkRule>): void {
  ctx.ui.rules = ctx.ui.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
  ctx.pushRules();
  ctx.refresh();
}

/** Seed a mock from a real response, then open its body for editing. */
export function mockRequest(ctx: ViewContext, request: NetworkRequest): void {
  const { path } = pathOf(request.url);
  const rule = addRule(ctx, {
    label: `mock ${path}`, pattern: path, method: request.method, action: "mock",
    status: request.status && request.status < 600 ? request.status : 200, body: request.responseBody ?? "",
  });
  const parsed = parseBody(request.responseBody);
  if (parsed.json) {
    ctx.editJson({
      title: `Mock response for ${request.method} ${path}`,
      value: parsed.value,
      hint: "The next matching request returns this instead of hitting the network. Refetch (or trigger the request again) to see it.",
      onSave: (value) => { updateRule(ctx, rule.id, { body: JSON.stringify(value) }); ctx.toast("Mock updated", "good"); },
    });
  } else {
    ctx.toast("Mock rule added — edit it under Rules", "good");
  }
}

const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function rulesPanel(ctx: ViewContext): Child {
  const { ui, model, app } = ctx;
  if (!can(app, "setNetworkRules")) return h("div", { class: "dt-pad" }, unsupported("DevTools request rules"));
  const rows = ui.rules.map((rule, index) => {
    const matches = model.network.filter((r) => findMatchingRule([{ ...rule, enabled: true, probability: undefined }], r.method, r.url) !== null).length;
    const tone = rule.action === "mock" ? "purple" : rule.action === "delay" ? "blue" : "red";
    return h("div", { key: rule.id, class: ["nw-rule", rule.enabled ? "" : "is-off"], "data-dt": "rule" },
      toggleSwitch({ checked: rule.enabled, onChange: (on) => updateRule(ctx, rule.id, { enabled: on }) }),
      select({
        value: rule.action, label: "Action", width: "96px",
        options: [{ value: "mock", label: "Mock" }, { value: "delay", label: "Delay" }, { value: "fail", label: "Fail" }, { value: "offline", label: "Offline" }],
        onChange: (value) => updateRule(ctx, rule.id, { action: value as NetworkRule["action"] }),
      }),
      select({
        value: (rule.method ?? "") as (typeof METHODS)[number], label: "Method", width: "82px",
        options: METHODS.map((m) => ({ value: m, label: m || "ANY" })),
        onChange: (value) => updateRule(ctx, rule.id, { method: value || undefined }),
      }),
      field({ value: rule.pattern, placeholder: "URL contains… (glob with *; empty = every request)", mono: true, label: "URL pattern", commitOnBlur: true, onCommit: (value) => updateRule(ctx, rule.id, { pattern: value.trim() }) }),
      rule.action === "mock" ? field({ value: String(rule.status ?? 200), type: "number", width: "70px", label: "Status", commitOnBlur: true, onCommit: (value) => updateRule(ctx, rule.id, { status: Number(value) || 200 }) }) : null,
      rule.action === "mock" ? button({ label: "Body", size: "sm", icon: "brackets", tip: "Edit the mocked response body", onClick: () => {
        const parsed = parseBody(rule.body);
        ctx.editJson({ title: `Mocked body — ${rule.pattern || "every request"}`, value: parsed.json ? parsed.value : rule.body ?? "", onSave: (value) => updateRule(ctx, rule.id, { body: typeof value === "string" ? value : JSON.stringify(value) }) });
      } }) : null,
      rule.action !== "offline" ? field({ value: String(rule.delayMs ?? 0), type: "number", width: "76px", label: "Delay ms", commitOnBlur: true, onCommit: (value) => updateRule(ctx, rule.id, { delayMs: Math.max(0, Number(value) || 0) }) }) : null,
      rule.action === "fail" || rule.action === "offline" ? select({
        value: String(rule.probability ?? 1), label: "How often", width: "92px",
        options: [{ value: "1", label: "Always" }, { value: "0.5", label: "50%" }, { value: "0.3", label: "30%" }, { value: "0.1", label: "10%" }],
        onChange: (value) => updateRule(ctx, rule.id, { probability: Number(value) >= 1 ? undefined : Number(value) }),
      }) : null,
      chip(`${matches} match${matches === 1 ? "" : "es"}`, matches > 0 ? tone : "grey", { tip: "Recorded requests this rule matches" }),
      iconButton({ icon: "chevronUp", label: "Move up", size: "sm", disabled: index === 0, onClick: () => { const list = [...ui.rules]; [list[index - 1], list[index]] = [list[index]!, list[index - 1]!]; ui.rules = list; ctx.pushRules(); ctx.refresh(); } }),
      iconButton({ icon: "trash", label: "Delete rule", size: "sm", danger: true, onClick: () => { ui.rules = ui.rules.filter((r) => r.id !== rule.id); ctx.pushRules(); ctx.refresh(); } }));
  });
  return h("div", { class: "nw-rules", "data-dt": "rules" },
    h("div", { class: "nw-rules-head" },
      h("span", { class: "section-title" }, icon("filter", { size: 12 }), `Request rules (${ui.rules.filter((r) => r.enabled).length} on)`),
      h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, "Evaluated in order; the first enabled match wins. Throttling applies after your rules."),
      spacer(),
      button({ label: "Mock", size: "sm", icon: "plus", onClick: () => addRule(ctx, { action: "mock", label: "mock" }) }),
      button({ label: "Delay", size: "sm", icon: "plus", onClick: () => addRule(ctx, { action: "delay", delayMs: 1500, label: "delay" }) }),
      button({ label: "Fail", size: "sm", icon: "plus", onClick: () => addRule(ctx, { action: "fail", label: "fail", message: "Request failed (DevTools rule)" }) }),
      ui.rules.length > 0 ? button({ label: "Remove all", size: "sm", variant: "danger", onClick: () => { ui.rules = []; ctx.pushRules(); ctx.toast("Rules cleared"); ctx.refresh(); } }) : null),
    rows.length === 0 ? h("div", { class: "hint", style: { padding: "0 12px 10px" } }, "No rules yet. Select a request and choose “Mock this response”, or add one above.") : h("div", { class: "nw-rule-list" }, ...rows));
}

/* -------------------------------------------------------------------------- */
/*  Detail                                                                     */
/* -------------------------------------------------------------------------- */

function detailPane(ctx: ViewContext, request: NetworkRequest): Child {
  const { ui, app } = ctx;
  const { path, host } = pathOf(request.url);
  const body = parseBody(request.responseBody);
  const payload = parseBody(request.requestBody);
  const pane = ui.networkPane;
  const kvTable = (record: Record<string, string> | undefined): Child => {
    const entries = Object.entries(record ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
    return entries.length === 0 ? h("div", { class: "hint" }, "None recorded.") : h("div", { class: "it-attrs" }, ...entries.map(([k, v]) => h("div", { key: k, class: "it-attr" }, h("span", { class: "it-attr-k" }, k), h("span", { class: "it-attr-v" }, v))));
  };
  let content: Child;
  switch (pane) {
    case "headers":
      content = h("div", { class: "stack" },
        h("div", {}, h("div", { class: "it-sub" }, "General"), h("div", { class: "it-attrs" },
          ...[["URL", request.url], ["Method", request.method], ["Status", String(request.status ?? request.phase)], ["Rule", request.rule ?? "—"]].map(([k, v]) => h("div", { key: k, class: "it-attr" }, h("span", { class: "it-attr-k" }, k!), h("span", { class: "it-attr-v" }, v!))))),
        h("div", {}, h("div", { class: "it-sub" }, "Request headers"), kvTable(request.requestHeaders)),
        h("div", {}, h("div", { class: "it-sub" }, "Response headers"), kvTable(request.responseHeaders)));
      break;
    case "payload":
      content = !request.requestBody
        ? h("div", { class: "hint" }, "No request body (GET/HEAD, or an empty payload).")
        : payload.json
          ? valueTree({ scope: `nw-req:${request.requestId}`, value: payload.value, expanded: ui.networkExpanded, rowHeight: ctx.rowHeight, inline: true, onToggle: (p) => { if (ui.networkExpanded.has(p)) ui.networkExpanded.delete(p); else ui.networkExpanded.add(p); ctx.refresh(); }, editing: null, setEditing: () => undefined, onCopy: (t, w) => ctx.copy(t, w) })
          : h("pre", { class: "pre is-wrap" }, request.requestBody);
      break;
    case "timing": {
      const total = request.duration ?? Math.max(0, ctx.now() - request.startTime);
      const injected = request.injectedDelay ?? 0;
      content = h("div", { class: "stack" },
        h("div", { class: "nw-timing" },
          injected > 0 ? h("span", { class: "nw-timing-delay", style: { flex: `${injected} 1 0` }, "data-tip": `DevTools delay ${fmtMs(injected)}` }, "delay") : null,
          h("span", { class: "nw-timing-wait", style: { flex: `${Math.max(0.001, total - injected)} 1 0` } }, request.phase === "pending" ? "waiting…" : "request")),
        h("div", { class: "it-attrs" },
          ...[
            ["Started", `+${fmtMs(request.startTime - (ctx.model.firstTime ?? request.startTime))} (session clock)`],
            ["Duration", fmtMs(request.duration)],
            ["Injected delay", injected ? fmtMs(injected) : "—"],
            ["Size", fmtBytes(request.responseSize)],
            ["Outcome", request.phase === "mock" ? "mocked by a DevTools rule" : request.phase],
          ].map(([k, v]) => h("div", { key: k, class: "it-attr" }, h("span", { class: "it-attr-k" }, k!), h("span", { class: "it-attr-v" }, v!)))));
      break;
    }
    default:
      content = request.phase === "pending"
        ? h("div", { class: "hint row-flex" }, h("span", { class: "spinner" }), "Still in flight…")
        : !request.responseBody
          ? h("div", { class: "hint" }, request.error ? "No response — the request failed." : "Empty response body.")
          : body.json && ui.networkResponseView === "tree"
            ? valueTree({ scope: `nw-res:${request.requestId}`, value: body.value, expanded: ui.networkExpanded, rowHeight: ctx.rowHeight, inline: true, onToggle: (p) => { if (ui.networkExpanded.has(p)) ui.networkExpanded.delete(p); else ui.networkExpanded.add(p); ctx.refresh(); }, editing: null, setEditing: () => undefined, onCopy: (t, w) => ctx.copy(t, w), testid: "response-tree" })
            : h("pre", { class: "pre is-wrap nw-raw" }, request.responseBody);
  }
  const queryKey = can(app, "getQueries") ? app.getQueries().find((q) => q.key.includes(path.split("?")[0] ?? path))?.key : undefined;
  return h("div", { class: "nw-detail", "data-dt": "request-detail" },
    h("div", { class: "pane-head nw-detail-head" },
      chip(requestStatusLabel(request), requestTone(request)),
      h("span", { class: "nw-method" }, request.method),
      h("span", { class: "pane-title mono", title: request.url }, truncateMiddle(path, 64)),
      host ? h("span", { class: "t3" }, host) : null,
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.selectedRequest = null; ctx.refresh(); } })),
    request.error ? note("error", request.error) : null,
    h("div", { class: "nw-actions" },
      button({ label: "Mock this response", size: "sm", icon: "wand", variant: "primary", testid: "mock-this", onClick: () => mockRequest(ctx, request) }),
      button({ label: "Fail it", size: "sm", icon: "offline", onClick: () => { addRule(ctx, { pattern: path, method: request.method, action: "fail", label: `fail ${path}`, message: "Request failed (DevTools rule)" }); ctx.toast("Matching requests will now fail", "warn"); } }),
      queryKey && can(app, "refetchQuery") ? button({ label: "Refetch", size: "sm", icon: "refresh", onClick: () => { app.refetchQuery(queryKey); ctx.toast("Refetching…"); } }) : null,
      spacer(),
      button({ label: "cURL", size: "sm", icon: "copy", tip: "Copy as cURL", onClick: () => ctx.copy(toCurl(request), "as cURL") }),
      button({ label: "fetch", size: "sm", icon: "copy", tip: "Copy as fetch()", onClick: () => ctx.copy(toFetch(request), "as fetch()") }),
      iconButton({ icon: "link", label: "Copy URL", size: "sm", onClick: () => ctx.copy(request.url, "the URL") })),
    tabs([
      { value: "response", label: "Response" },
      { value: "payload", label: "Payload" },
      { value: "headers", label: "Headers", count: Object.keys(request.requestHeaders ?? {}).length + Object.keys(request.responseHeaders ?? {}).length || null },
      { value: "timing", label: "Timing" },
    ], pane, (value) => { ui.networkPane = value; ctx.refresh(); }, {
      trailing: pane === "response" && body.json ? segmented([{ value: "tree", label: "Tree" }, { value: "raw", label: "Raw" }], ui.networkResponseView, (v) => { ui.networkResponseView = v; ctx.refresh(); }) : undefined,
    }),
    h("div", { class: "pane-body is-pad" }, content));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { ui, model, app } = ctx;
  const needle = ui.networkFilter.trim().toLowerCase();
  const all = model.network;
  const rows = all.filter((r) => (!ui.networkOnlyProblems || isProblem(r)) && matchesStatus(r, ui.networkStatus) && (!needle || `${r.method} ${r.url}`.toLowerCase().includes(needle)));
  const stats = networkStats(all);
  const t0 = rows.length > 0 ? Math.min(...rows.map((r) => r.startTime)) : 0;
  const t1 = rows.length > 0 ? Math.max(...rows.map((r) => r.endTime ?? ctx.now())) : 1;
  const span = Math.max(1, t1 - t0);
  const throttleActive = ui.throttle !== "none";

  const columns: Column<NetworkRequest>[] = [
    { key: "status", label: "Status", width: 72, sort: (r) => r.status ?? (r.phase === "pending" ? -1 : 999), render: (r) => chip(requestStatusLabel(r), requestTone(r)) },
    { key: "method", label: "Method", width: 64, sort: (r) => r.method, render: (r) => h("span", { class: "nw-method" }, r.method) },
    { key: "name", label: "Name", flex: 2.2, sort: (r) => r.url, render: (r) => {
      const { path, host } = pathOf(r.url);
      return h("span", { class: "nw-name" }, h("span", { class: "ellipsis mono" }, path), host ? h("span", { class: "t4 nw-host" }, host) : null, r.rule ? chip(r.phase === "mock" ? "mock" : "rule", "purple", { tip: `Rule: ${r.rule}` }) : null);
    } },
    { key: "size", label: "Size", width: 70, align: "right", sort: (r) => r.responseSize ?? 0, render: (r) => h("span", { class: "num t3" }, r.responseSize ? fmtBytes(r.responseSize) : "—") },
    { key: "time", label: "Time", width: 70, align: "right", sort: (r) => r.duration ?? Infinity, render: (r) => h("span", { class: ["num", (r.duration ?? 0) > 1000 ? "tone-amber" : "t2"] }, r.phase === "pending" ? h("span", { class: "spinner" }) : fmtMs(r.duration)) },
    { key: "waterfall", label: "Waterfall", flex: 1.6, render: (r) => {
      const start = ((r.startTime - t0) / span) * 100;
      const width = Math.max(0.6, (((r.endTime ?? ctx.now()) - r.startTime) / span) * 100);
      return h("span", { class: "nw-wf" }, h("span", { class: ["nw-wf-bar", `t-${requestTone(r)}`, r.phase === "pending" ? "is-pending" : ""], style: { left: `${Math.min(99, start)}%`, width: `${Math.min(100 - start, width)}%` } }));
    } },
  ];
  const selected = rows.find((r) => r.requestId === ui.selectedRequest) ?? all.find((r) => r.requestId === ui.selectedRequest) ?? null;
  const table = dataTable({
    columns, rows, rowKey: (r) => r.requestId, rowHeight: ctx.rowHeight,
    sort: ui.networkSort, onSort: (sort) => { ui.networkSort = sort; ctx.refresh(); },
    selected: ui.selectedRequest,
    onSelect: (r) => { ui.selectedRequest = r.requestId; ctx.refresh(); },
    rowClass: (r) => (isProblem(r) ? "is-error" : ""),
    stickToBottom: ui.networkSort === null,
    version: Math.floor(ctx.now() / 250),
    testid: "network-table",
    ariaLabel: "Requests",
    empty: all.length === 0
      ? emptyState({
          icon: "network", title: "No requests yet",
          body: ["Every ", h("code", {}, "$query"), ", ", h("code", {}, "$mutation"), ", and ", h("code", {}, "Http({…})"), " request the program makes while DevTools is open is recorded here. Requests from before it opened were not captured — the runtime records nothing until a panel is listening."],
          actions: can(ctx.app, "getQueries") && can(ctx.app, "refetchQuery") && ctx.app.getQueries().length > 0
            ? [button({ label: "Refetch cached queries", icon: "refresh", testid: "network-refetch", onClick: () => {
                const app = ctx.app!;
                const queries = app.getQueries!();
                for (const query of queries) app.refetchQuery!(query.key);
                ctx.toast(`Refetching ${queries.length} ${queries.length === 1 ? "query" : "queries"}`);
              } })]
            : undefined,
        })
      : emptyState({ icon: "filter", title: "No requests match the filters" }),
  });

  return h("div", { class: "nw", "data-dt": "network" },
    viewbar(
      searchField({ value: ui.networkFilter, placeholder: "Filter by URL or method…", onInput: (v) => { ui.networkFilter = v; ctx.refresh(); }, testid: "network-filter" }),
      segmented([
        { value: "all", label: "All", count: all.length || null },
        { value: "failed", label: "Failed", count: all.filter((r) => r.phase === "error" || r.phase === "blocked").length || null },
        { value: "client", label: "4xx" },
        { value: "server", label: "5xx" },
        { value: "mocked", label: "Mocked", count: stats.mocked || null },
      ], ui.networkStatus, (v) => { ui.networkStatus = v; ctx.refresh(); }, { label: "Status filter" }),
      spacer(),
      can(app, "setNetworkRules") ? select({
        value: ui.throttle, label: "Throttling", testid: "throttle",
        options: [
          { value: "none", label: "No throttling" },
          { value: "fast3g", label: "Fast 3G (+560ms)" },
          { value: "slow3g", label: "Slow 3G (+2s)" },
          { value: "flaky", label: "Flaky (30% fail)" },
          { value: "offline", label: "Offline" },
        ],
        onChange: (value) => { ui.throttle = value; ctx.pushRules(); ctx.toast(value === "none" ? "Throttling off" : `Throttling: ${value}`, value === "none" ? "info" : "warn"); ctx.refresh(); },
      }) : null,
      button({ label: `Rules${ui.rules.length ? ` (${ui.rules.filter((r) => r.enabled).length})` : ""}`, size: "sm", icon: "filter", active: ui.showRules, testid: "rules-toggle", onClick: () => { ui.showRules = !ui.showRules; ctx.refresh(); } }),
      vsep(),
      iconButton({ icon: "download", label: "Export HAR", onClick: () => { downloadText("aktion-network.har", toHar(all, { epochOffset: ctx.epochOffset, version: ctx.hook.libraryVersion }), "application/json"); ctx.toast("HAR exported", "good"); } }),
      iconButton({ icon: "trash", label: "Clear requests", onClick: () => { model.network.length = 0; model.revs.network += 1; model.rev += 1; ui.selectedRequest = null; ctx.refresh(); } })),
    !ctx.hook.options.captureNetwork ? note("warn", "Network capture is off — turn it back on in Settings → Instrumentation.") : null,
    throttleActive ? h("div", { class: "nw-banner" }, icon("gauge", { size: 13 }), `Throttling is on (${ui.throttle}). Every request is affected until you turn it off.`, spacer(), button({ label: "Turn off", size: "sm", onClick: () => { ui.throttle = "none"; ctx.pushRules(); ctx.refresh(); } })) : null,
    ui.showRules ? rulesPanel(ctx) : null,
    h("div", { class: "nw-summary" },
      h("span", {}, h("b", {}, String(stats.total)), " requests"),
      stats.pending > 0 ? h("span", { class: "tone-blue" }, h("b", {}, String(stats.pending)), " pending") : null,
      stats.failed > 0 ? h("span", { class: "tone-red" }, h("b", {}, String(stats.failed)), " failed") : null,
      h("span", {}, h("b", {}, fmtBytes(stats.bytes)), " transferred"),
      stats.total > 0 ? h("span", {}, "avg ", h("b", {}, fmtMs(stats.avgDuration))) : null,
      stats.slowest ? h("button", { type: "button", class: "link", onClick: () => { ui.selectedRequest = stats.slowest!.requestId; ctx.refresh(); } }, `slowest ${fmtMs(stats.slowest.duration)}`) : null),
    selected && ctx.width() >= 820
      ? split({ size: paneSize(ctx, "network.table", Math.round(ctx.width() * 0.56)), min: 320, onResize: (s) => setPaneSize(ctx, "network.table", s), first: table, second: detailPane(ctx, selected) })
      : selected
        ? split({ direction: "col", size: paneSize(ctx, "network.table.col", 220), min: 120, onResize: (s) => setPaneSize(ctx, "network.table.col", s), first: table, second: detailPane(ctx, selected) })
        : table);
}

export const networkView: ViewDefinition = {
  id: "network",
  label: "Network",
  icon: "network",
  group: "activity",
  hint: "Requests, responses, mocking, throttling",
  keywords: "http requests fetch query mutation mock offline delay rules har curl throttle flaky",
  badge: (ctx) => {
    const failed = ctx.model.network.filter(isProblem).length;
    if (failed > 0) return { value: failed, tone: "red" };
    return ctx.ui.throttle !== "none" ? { value: "!", tone: "amber" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "offline", label: ctx.ui.throttle === "offline" ? "Go back online" : "Simulate offline", icon: "offline", run: () => { ctx.ui.throttle = ctx.ui.throttle === "offline" ? "none" : "offline"; ctx.pushRules(); ctx.toast(ctx.ui.throttle === "offline" ? "Offline — every request fails" : "Back online"); } },
    { id: "slow3g", label: "Throttle to Slow 3G", icon: "gauge", run: () => { ctx.ui.throttle = "slow3g"; ctx.pushRules(); ctx.toast("Slow 3G"); } },
    { id: "flaky", label: "Make the network flaky (30% fail)", icon: "dice", run: () => { ctx.ui.throttle = "flaky"; ctx.pushRules(); ctx.toast("Flaky network on"); } },
    { id: "har", label: "Export network as HAR", icon: "download", run: () => downloadText("aktion-network.har", toHar(ctx.model.network, { epochOffset: ctx.epochOffset }), "application/json") },
  ],
  css: /* css */ `
.nw { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.nw > .note { margin: 8px 10px 0; }
.nw-banner { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--dt-amber-soft); color: var(--dt-amber); font-size: var(--dt-fs-sm); font-weight: 550; }
.nw-summary { flex: none; display: flex; align-items: center; gap: 14px; padding: 5px 12px; font-size: var(--dt-fs-sm); color: var(--dt-text-3); border-bottom: 1px solid var(--dt-border); }
.nw-summary b { color: var(--dt-text); font-variant-numeric: tabular-nums; }
.nw-method { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); font-weight: 650; color: var(--dt-text-2); }
.nw-name { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; }
.nw-host { flex: none; font-size: var(--dt-fs-xs); }
.nw-wf { position: relative; display: block; width: 100%; height: 8px; border-radius: 4px; background: rgba(127, 127, 127, 0.08); }
.nw-wf-bar { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--dt-cyan); min-width: 3px; }
.nw-wf-bar.t-red { background: var(--dt-red); }
.nw-wf-bar.t-amber { background: var(--dt-amber); }
.nw-wf-bar.t-purple { background: var(--dt-purple); }
.nw-wf-bar.t-blue { background: var(--dt-blue); }
.nw-wf-bar.t-grey { background: var(--dt-text-4); }
.nw-wf-bar.is-pending { background: repeating-linear-gradient(90deg, var(--dt-blue) 0 6px, transparent 6px 10px); }
.nw-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.nw-detail > .note { margin: 8px 12px 0; }
.nw-actions { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px; flex-wrap: wrap; }
.nw-raw { max-height: none; }
.nw-timing { display: flex; gap: 2px; height: 22px; border-radius: 6px; overflow: hidden; font-size: var(--dt-fs-xs); font-weight: 650; }
.nw-timing > span { display: flex; align-items: center; justify-content: center; color: #fff; min-width: 40px; }
.nw-timing-delay { background: var(--dt-amber); color: #1b1305 !important; }
.nw-timing-wait { background: var(--dt-cyan); }
.nw-rules { flex: none; border-bottom: 1px solid var(--dt-border); background: var(--dt-bg-elev); max-height: 46%; overflow: auto; }
.nw-rules-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex-wrap: wrap; }
.nw-rule-list { display: flex; flex-direction: column; gap: 6px; padding: 0 12px 10px; }
.nw-rule { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: var(--dt-r); background: var(--dt-bg); border: 1px solid var(--dt-border); }
.nw-rule > .input:not([type="number"]) { flex: 1 1 200px; }
.nw-rule.is-off { opacity: 0.55; }
`,
};
