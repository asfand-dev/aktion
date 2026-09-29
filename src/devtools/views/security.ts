/**
 * Security — follows Aktion's trust model rather than a generic checklist: what
 * the trusted program text can reach (policy, host globals, dynamic code,
 * escape hatches, endpoints), whether the sanitiser guarantees hold in the live
 * DOM, what actually went over the wire (origins, mixed content, secrets in
 * URLs), tokens sitting in script-readable storage, and — on request — the
 * page's response headers and CSP, plus live CSP violation reports.
 */

import { h, type Child } from "../core/vdom.js";
import { can, renderRootElement, type UiState, type ViewContext, type ViewDefinition } from "../context.js";
import {
  readPageStorage, scanSecurity, type SecurityCategory, type SecurityFinding, type SecurityReport, type Severity,
} from "../analysis/security.js";
import { cssPath } from "../overlay.js";
import { inlineCode } from "../analysis/markdown.js";
import { icon, type IconName } from "../ui/icons.js";
import {
  button, card, chip, downloadText, emptyState, filterChip, fmtAgo, fmtBytes, iconButton, note, plural, richText, scoreRing, segmented,
  spacer, spinner, viewbar, type Tone,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { noApp, openSource, paneSize, setPaneSize } from "./common.js";

const SEVERITIES: ReadonlyArray<Severity> = ["high", "medium", "low", "info"];
const SEVERITY_TONE: Record<Severity, Tone> = { high: "red", medium: "orange", low: "amber", info: "blue" };
const CATEGORY: Record<SecurityCategory, { label: string; icon: IconName; blurb: string }> = {
  program: { label: "Program", icon: "code", blurb: "What the trusted program text can reach" },
  dom: { label: "Rendered output", icon: "layers", blurb: "Whether the sanitiser guarantees hold in the live DOM" },
  transport: { label: "Transport", icon: "network", blurb: "What actually went over the wire" },
  storage: { label: "Storage", icon: "data", blurb: "Credentials readable by any script on this origin" },
  headers: { label: "Headers", icon: "server", blurb: "The page's response headers" },
  csp: { label: "CSP", icon: "lock", blurb: "Content-Security-Policy violations" },
};

/* -------------------------------------------------------------------------- */
/*  Scanning                                                                   */
/* -------------------------------------------------------------------------- */

function cspMeta(): string | null {
  try {
    return document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.getAttribute("content") ?? null;
  } catch {
    return null;
  }
}

export function runScan(ctx: ViewContext, options: { quiet?: boolean } = {}): SecurityReport | null {
  const { app, ui, model } = ctx;
  const profile = can(app, "getSecurityProfile") ? safeProfile(() => app.getSecurityProfile()) : null;
  const report = scanSecurity({
    root: renderRootElement(app),
    requests: model.network,
    profile,
    location: typeof location !== "undefined" ? { href: location.href, protocol: location.protocol, hostname: location.hostname, origin: location.origin } : null,
    storage: readPageStorage(),
    headers: ui.securityHeaders,
    cspMeta: cspMeta(),
    violations: ctx.cspViolations,
  });
  ui.securityRun = report;
  if (ui.securitySelected && !report.findings.some((f) => f.id === ui.securitySelected)) ui.securitySelected = null;
  if (!options.quiet) {
    ctx.toast(report.counts.high > 0
      ? `${plural(report.counts.high, "high-severity finding")} — score ${report.score}`
      : `Scan complete — score ${report.score}, ${plural(report.findings.length, "finding")}`,
    report.counts.high > 0 ? "bad" : report.counts.medium > 0 ? "warn" : "good");
  }
  return report;
}

function safeProfile<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/** Fetch the page's own response headers (HEAD, same origin, no cache). */
export async function fetchPageHeaders(): Promise<Record<string, string>> {
  const response = await fetch(location.href, { method: "HEAD", cache: "no-store", credentials: "same-origin", redirect: "follow" });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return headers;
}

function checkHeaders(ctx: ViewContext): void {
  const { ui } = ctx;
  if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) {
    ui.securityHeadersState = "error";
    ui.securityHeadersError = "Headers can only be read from a page served over http(s).";
    ctx.refresh();
    return;
  }
  ui.securityHeadersState = "loading";
  ui.securityHeadersError = null;
  ctx.refresh();
  fetchPageHeaders().then((headers) => {
    ui.securityHeaders = headers;
    ui.securityHeadersState = "idle";
    runScan(ctx, { quiet: true });
    ctx.toast(`Read ${Object.keys(headers).length} response headers`, "good");
    ctx.refresh();
  }, (error: unknown) => {
    ui.securityHeadersState = "error";
    ui.securityHeadersError = error instanceof Error ? error.message : String(error);
    ctx.refresh();
  });
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                    */
/* -------------------------------------------------------------------------- */

function reportMarkdown(ctx: ViewContext, report: SecurityReport): string {
  const lines = [
    `# Security report — ${ctx.app?.label ?? "app"}`,
    "",
    `Score **${report.score}/100** · ${report.counts.high} high · ${report.counts.medium} medium · ${report.counts.low} low · ${report.counts.info} info`,
    `Page ${report.pageOrigin || "(unknown)"} · ${report.secureContext ? "secure context" : "NOT a secure context"} · policy \`${report.profile?.policy ?? "?"}\` · ${new Date(report.at).toISOString()}`,
    "",
  ];
  for (const category of Object.keys(CATEGORY) as SecurityCategory[]) {
    const items = report.findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    lines.push(`## ${CATEGORY[category].label}`, "");
    for (const finding of items) {
      lines.push(`### [${finding.severity}] ${finding.title}`, "", finding.detail, "", `**Fix:** ${finding.fix}`);
      if (finding.evidence) lines.push("", `Evidence: ${inlineCode(finding.evidence)}`);
      if (finding.line) lines.push(`Line ${finding.line}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function reportJson(ctx: ViewContext, report: SecurityReport): string {
  return JSON.stringify({
    app: ctx.app?.label, at: new Date(report.at).toISOString(), score: report.score, counts: report.counts,
    pageOrigin: report.pageOrigin, secureContext: report.secureContext, policy: report.profile?.policy,
    findings: report.findings.map((f) => ({ ...f, element: f.element ? cssPath(f.element) : undefined })),
    origins: report.origins, storage: report.storage, headers: report.headers,
  }, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Findings pane                                                              */
/* -------------------------------------------------------------------------- */

function findingDetail(ctx: ViewContext, finding: SecurityFinding): Child {
  const { app, ui } = ctx;
  const owner = finding.element && can(app, "instanceForNode") ? app.instanceForNode(finding.element) : null;
  return h("div", { class: "sc-detail", "data-dt": "security-detail" },
    h("div", { class: "pane-head" },
      h("span", { class: `sc-dot t-${SEVERITY_TONE[finding.severity]}` }),
      h("span", { class: "pane-title" }, ...richText(finding.title)),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.securitySelected = null; ctx.highlightElement(null, undefined, true); ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      h("div", { class: "chips" },
        chip(finding.severity, SEVERITY_TONE[finding.severity]),
        chip(CATEGORY[finding.category].label, "grey", { icon: CATEGORY[finding.category].icon }),
        chip(finding.rule, "grey", { mono: true, outline: true })),
      h("div", { class: "sc-text" }, ...richText(finding.detail)),
      note("accent", [h("strong", {}, "Fix. "), ...richText(finding.fix)], { icon: "wand" }),
      finding.evidence ? h("div", {}, h("div", { class: "it-sub row-flex" }, "Evidence", spacer(), iconButton({ icon: "copy", size: "sm", label: "Copy evidence", onClick: () => ctx.copy(finding.evidence!, "the evidence") })), h("code", { class: "sc-evidence" }, finding.evidence)) : null,
      h("div", { class: "row-flex sc-actions" },
        finding.line ? button({ label: `Open line ${finding.line}`, size: "sm", icon: "code", onClick: () => openSource(ctx, finding.line) }) : null,
        finding.element ? button({ label: "Show element", size: "sm", icon: "target", onClick: () => { ctx.highlightElement(finding.element!, { component: finding.rule }, true); try { finding.element!.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* detached */ } } }) : null,
        owner ? button({ label: "Inspect component", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(owner, { reveal: true }) }) : null,
        finding.requestId ? button({ label: "Open request", size: "sm", icon: "network", onClick: () => { ui.selectedRequest = finding.requestId!; ctx.selectTab("network"); } }) : null,
        finding.storageKey ? button({ label: "Open in Data", size: "sm", icon: "data", onClick: () => { ui.dataPane = "storage"; ui.storageSelected = finding.storageKey!; ctx.selectTab("data"); } }) : null)));
}

function visibleSecurity(report: SecurityReport, ui: UiState): SecurityFinding[] {
  return report.findings.filter((f) => ui.securitySeverities.has(f.severity) && (ui.securityCategory === "all" || f.category === ui.securityCategory));
}

function findingsPane(ctx: ViewContext, report: SecurityReport): Child {
  const { ui } = ctx;
  const findings = visibleSecurity(report, ui);
  const selected = report.findings.find((f) => f.id === ui.securitySelected) ?? null;
  const categories = (Object.keys(CATEGORY) as SecurityCategory[]).filter((c) => report.findings.some((f) => f.category === c));
  const summary = h("div", { class: "sc-summary", "data-dt": "security-summary" },
    scoreRing(report.score, { size: 58, label: "Security score" }),
    h("div", { class: "sc-summary-text" },
      h("div", { class: "sc-summary-title" }, report.findings.length === 0 ? "No findings" : plural(report.findings.length, "finding")),
      h("div", { class: "t3" },
        report.secureContext ? h("span", { class: "tone-green sc-ctx" }, icon("lock", { size: 11 }), "secure context") : h("span", { class: "tone-red sc-ctx" }, icon("unlock", { size: 11 }), "not a secure context"),
        ` · policy “${report.profile?.policy ?? "unknown"}” · ${report.examined} elements · ${fmtAgo(report.at, Date.now())}`)),
    h("div", { class: "sc-sevs" }, ...SEVERITIES.map((severity) => filterChip({
      label: severity, count: report.counts[severity], on: ui.securitySeverities.has(severity), swatch: `var(--dt-${SEVERITY_TONE[severity]})`, testid: `security-sev-${severity}`,
      onToggle: () => { if (ui.securitySeverities.has(severity)) ui.securitySeverities.delete(severity); else ui.securitySeverities.add(severity); ctx.refresh(); },
    }))));
  const filters = categories.length > 1 ? h("div", { class: "sc-filters" },
    filterChip({ label: "All", on: ui.securityCategory === "all", onToggle: () => { ui.securityCategory = "all"; ctx.refresh(); } }),
    ...categories.map((c) => filterChip({ label: CATEGORY[c].label, count: report.findings.filter((f) => f.category === c).length, on: ui.securityCategory === c, onToggle: () => { ui.securityCategory = ui.securityCategory === c ? "all" : c; ctx.refresh(); } }))) : null;

  const grouped: Child[] = [];
  for (const category of Object.keys(CATEGORY) as SecurityCategory[]) {
    const items = findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    grouped.push(h("div", { key: category, class: "sc-group" },
      h("div", { class: "sc-group-head" }, icon(CATEGORY[category].icon, { size: 13 }), h("span", {}, CATEGORY[category].label), h("span", { class: "t3" }, CATEGORY[category].blurb), spacer(), h("span", { class: "sc-count num" }, String(items.length))),
      ...items.map((finding) => h("button", {
        key: finding.id, type: "button", class: ["sc-item", finding.id === ui.securitySelected ? "is-selected" : ""], "data-dt": "security-finding",
        onClick: () => { ui.securitySelected = finding.id; if (finding.element) ctx.highlightElement(finding.element, { component: finding.rule }, true); ctx.refresh(); },
        onMouseEnter: finding.element ? () => ctx.highlightElement(finding.element!, { component: finding.rule }) : undefined,
        onMouseLeave: finding.element ? () => ctx.highlightElement(null) : undefined,
      },
        h("span", { class: `sc-dot t-${SEVERITY_TONE[finding.severity]}` }),
        h("span", { class: "sc-item-title ellipsis" }, ...richText(finding.title)),
        finding.evidence ? h("span", { class: "sc-item-ev mono ellipsis" }, finding.evidence) : null,
        finding.line ? h("span", { class: "sc-line mono" }, `L${finding.line}`) : null))));
  }
  const list = h("div", { class: "sc-left" },
    summary, filters,
    h("div", { class: "dt-scroll" }, report.findings.length === 0
      ? emptyState({ icon: "checkCircle", title: "Nothing flagged", body: "No risky program constructs, sanitiser escapes, transport problems, or exposed tokens were found. Check the response headers too — they are only read on request." })
      : grouped.length === 0 ? emptyState({ icon: "filter", title: "No finding matches the filters" }) : h("div", { class: "sc-groups" }, ...grouped)));
  if (!selected) return list;
  const detail = findingDetail(ctx, selected);
  return ctx.width() >= 780
    ? split({ size: paneSize(ctx, "security.findings", Math.round(ctx.width() * 0.52)), min: 320, onResize: (s) => setPaneSize(ctx, "security.findings", s), first: list, second: detail })
    : split({ direction: "col", size: Math.round(ctx.height() * 0.45), min: 160, onResize: () => undefined, first: list, second: detail });
}

/* -------------------------------------------------------------------------- */
/*  Program pane                                                               */
/* -------------------------------------------------------------------------- */

function lineChip(ctx: ViewContext, line: number): Child {
  return h("button", { type: "button", class: "sc-line is-link mono", "data-tip": "Open in Source", onClick: () => openSource(ctx, line) }, `L${line}`);
}

function programPane(ctx: ViewContext, report: SecurityReport): Child {
  const profile = report.profile;
  if (!profile) return h("div", { class: "dt-pad" }, note("info", "This runtime does not expose a static security profile of the program. Upgrade aktion-runtime to see what the program text can reach."));
  const policyTone: Tone = profile.policy === "all" ? "amber" : "green";
  const riskTone: Record<string, Tone> = { high: "red", medium: "orange", low: "grey" };
  const list = <T,>(items: ReadonlyArray<T>, render: (item: T) => Child, empty: string): Child =>
    items.length === 0 ? h("div", { class: "t3 sc-empty" }, empty) : h("div", { class: "sc-rows" }, ...items.map((item, i) => h("div", { key: i, class: "sc-row" }, render(item))));
  return h("div", { class: "dt-scroll" },
    h("div", { class: "sc-grid" },
      card({
        title: "Global access policy", icon: "lock", testid: "security-policy",
        body: h("div", { class: "stack" },
          h("div", { class: "row-flex" }, chip(profile.policy, policyTone, { mono: true }), h("span", { class: "t2" }, profile.policy === "all" ? "Program text can reach every host global." : profile.policy === "safe" ? "Only the safe allow-list of globals resolves." : "A custom allow-list is in force.")),
          profile.policyNames && profile.policyNames.length > 0 ? h("div", { class: "chips" }, ...profile.policyNames.slice(0, 40).map((name) => chip(name, "grey", { mono: true }))) : null,
          profile.policy === "all" ? note("plain", ["Right for program text you wrote. For LLM-generated, user-editable, or database-loaded text call ", h("code", {}, "setGlobalAccessPolicy(\"safe\")"), " before mounting."]) : null),
      }),
      card({
        title: "Host globals", icon: "globe", sub: plural(profile.hostGlobals.length, "name"),
        body: list(profile.hostGlobals, (g) => [chip(g.risk, riskTone[g.risk] ?? "grey"), h("code", { class: "grow" }, g.name), h("span", { class: "t3 num" }, `×${g.count}`), lineChip(ctx, g.line)], "The program names no host globals."),
      }),
      card({
        title: "Dynamic code", icon: "zap", sub: profile.dynamicCode.length > 0 ? h("span", { class: "tone-red" }, plural(profile.dynamicCode.length, "site")) : "none",
        body: list(profile.dynamicCode, (d) => [chip("high", "red"), h("code", { class: "grow" }, d.what), lineChip(ctx, d.line)], "No eval, Function, or string timers."),
      }),
      card({
        title: "Escape hatches", icon: "puzzle", sub: plural(profile.escapeHatches.length, "use"),
        body: list(profile.escapeHatches, (e) => [h("code", { class: "grow" }, `${e.component}(…)`), e.dynamic ? chip("dynamic", "amber") : chip("static", "grey"), lineChip(ctx, e.line)], "No HTMLTag, Styles, Svg, or Markdown."),
      }),
      card({
        title: "Endpoints", icon: "server", sub: plural(profile.endpoints.length, "call site"),
        body: list(profile.endpoints, (e) => [chip(e.method ?? e.via, "blue", { mono: true }), h("code", { class: "grow ellipsis", title: e.url }, e.url), e.dynamic ? chip("computed", "amber") : null, lineChip(ctx, e.line)], "No network calls in the program text."),
      }),
      card({
        title: "Leaves the app", icon: "external", sub: `${profile.openUrls.length} windows · ${profile.emits.length} events`,
        body: h("div", { class: "stack" },
          list(profile.openUrls, (o) => [h("code", { class: "grow" }, o.via), o.target ? h("code", { class: "t3 ellipsis" }, o.target) : null, o.dynamic ? chip("computed URL", "amber") : null, lineChip(ctx, o.line)], "Opens no windows."),
          list(profile.emits, (e) => [chip("emit", "purple"), h("code", { class: "grow" }, e.name), lineChip(ctx, e.line)], "Emits no events to the host.")),
      }),
      card({
        title: "Storage access", icon: "data", sub: plural(profile.storage.length, "operation"),
        body: list(profile.storage, (s) => [chip(s.op, "grey", { mono: true }), h("code", { class: "grow" }, s.key), lineChip(ctx, s.line)], "The program touches no browser storage."),
      })));
}

/* -------------------------------------------------------------------------- */
/*  Network / storage / headers                                                */
/* -------------------------------------------------------------------------- */

function networkPane(ctx: ViewContext, report: SecurityReport): Child {
  const columns: Column<SecurityReport["origins"][number]>[] = [
    { key: "origin", label: "Origin", flex: 3, render: (o) => h("span", { class: "row-flex" }, icon(o.secure ? "lock" : "unlock", { size: 12, className: o.secure ? "tone-green" : "tone-red" }), h("span", { class: "mono ellipsis" }, o.origin)) },
    { key: "party", label: "Party", width: 100, render: (o) => chip(o.firstParty ? "first-party" : "third-party", o.firstParty ? "grey" : "purple") },
    { key: "creds", label: "Credentials", width: 100, render: (o) => (o.credentials ? chip("sent", o.firstParty ? "grey" : "amber", { tip: "Requests carried cookies or an Authorization header" }) : h("span", { class: "t4" }, "—")) },
    { key: "requests", label: "Requests", width: 80, align: "right", sort: (o) => o.requests, render: (o) => h("span", { class: "num" }, String(o.requests)) },
    { key: "failed", label: "Failed", width: 70, align: "right", render: (o) => h("span", { class: ["num", o.failed > 0 ? "tone-red" : "t4"] }, String(o.failed)) },
  ];
  const violations = ctx.cspViolations;
  return h("div", { class: "dt-scroll" },
    h("div", { class: "sc-page" },
      card({
        title: "Origins contacted", icon: "globe", flush: true, sub: `${report.origins.length} origins · ${report.origins.filter((o) => !o.firstParty).length} third-party`,
        body: h("div", { style: { height: `${Math.min(10, Math.max(2, report.origins.length)) * ctx.rowHeight + 32}px`, display: "flex", flexDirection: "column" } },
          dataTable({ columns, rows: report.origins, rowKey: (o) => o.origin, rowHeight: ctx.rowHeight, ariaLabel: "Origins", testid: "security-origins", empty: emptyState({ icon: "network", title: "No requests yet" }) })),
      }),
      card({
        title: "CSP violations", icon: "lock", testid: "security-csp", sub: violations.length > 0 ? h("span", { class: "tone-red" }, plural(violations.length, "report")) : "none while the panel was open",
        body: violations.length === 0
          ? h("div", { class: "t3" }, "The browser reports blocked resources as they happen (securitypolicyviolation). Nothing has been blocked so far.")
          : h("div", { class: "sc-rows" }, ...[...violations].reverse().slice(0, 100).map((v, i) => h("div", { key: i, class: "sc-row" },
              chip(v.disposition === "report" ? "report-only" : "blocked", v.disposition === "report" ? "amber" : "red"),
              h("code", {}, v.directive),
              h("span", { class: "mono ellipsis grow", title: v.blocked }, v.blocked || "(inline)"),
              v.source ? h("span", { class: "t3 mono ellipsis" }, v.source) : null))),
      })));
}

function storagePane(ctx: ViewContext, report: SecurityReport): Child {
  const { ui } = ctx;
  const risky = report.storage.filter((s) => s.kind !== "none");
  const columns: Column<SecurityReport["storage"][number]>[] = [
    { key: "area", label: "Area", width: 90, render: (s) => chip(s.area === "local" ? "local" : s.area === "session" ? "session" : "cookie", "grey") },
    { key: "key", label: "Key", flex: 2, render: (s) => h("span", { class: "mono ellipsis" }, s.key) },
    { key: "kind", label: "Looks like", width: 120, render: (s) => (s.kind === "none" ? h("span", { class: "t4" }, "—") : chip(s.kind, s.kind === "private-key" || s.kind === "api-key" ? "red" : "amber", { icon: "key" })) },
    { key: "jwt", label: "Token", flex: 2, render: (s) => (s.jwt ? h("span", { class: "row-flex" }, chip(s.jwt.alg ?? "?", s.jwt.alg === "none" ? "red" : "grey", { mono: true }), s.jwt.exp ? h("span", { class: s.jwt.expired ? "tone-red" : "t3" }, s.jwt.expired ? "expired" : `expires ${new Date(s.jwt.exp * 1000).toLocaleString()}`) : h("span", { class: "tone-amber" }, "never expires"), s.jwt.sub ? h("span", { class: "t3 ellipsis" }, `sub ${s.jwt.sub}`) : null) : h("span", { class: "t4" }, "—")) },
    { key: "size", label: "Size", width: 70, align: "right", render: (s) => h("span", { class: "num t3" }, fmtBytes(s.size)) },
  ];
  return h("div", { class: "sc-left" },
    risky.length > 0
      ? h("div", { class: "sc-callout" }, note("warn", [`${plural(risky.length, "credential")} in script-readable storage. Any XSS — or any third-party script — can read ${risky.length === 1 ? "it" : "them"}. Session tokens belong in `, h("code", {}, "HttpOnly; Secure; SameSite"), " cookies set by the server."]))
      : h("div", { class: "sc-callout" }, note("good", "No credentials in localStorage, sessionStorage, or script-visible cookies.")),
    dataTable({
      columns, rows: report.storage, rowKey: (s) => `${s.area}:${s.key}`, rowHeight: ctx.rowHeight, ariaLabel: "Storage entries", testid: "security-storage",
      onActivate: (s) => { ui.dataPane = "storage"; ui.storageKind = s.area === "cookie" ? "cookies" : s.area; ui.storageSelected = s.key; ctx.selectTab("data"); },
      empty: emptyState({ icon: "data", title: "Storage is empty" }),
    }));
}

function headersPane(ctx: ViewContext, report: SecurityReport): Child {
  const { ui } = ctx;
  const loading = ui.securityHeadersState === "loading";
  const intro = h("div", { class: "sc-callout row-flex" },
    button({ label: report.headers ? "Re-check headers" : "Check response headers", variant: report.headers ? "default" : "primary", size: "sm", icon: loading ? undefined : "server", disabled: loading, testid: "security-headers-check", onClick: () => checkHeaders(ctx) }),
    loading ? spinner() : null,
    h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, "Sends one same-origin HEAD request for this page. Nothing is sent anywhere else."));
  if (ui.securityHeadersState === "error") {
    return h("div", { class: "dt-scroll" }, intro, h("div", { class: "sc-page" }, note("error", ["Could not read headers: ", ui.securityHeadersError ?? "unknown error"])));
  }
  if (!report.headers) {
    return h("div", { class: "dt-scroll" }, intro, h("div", { class: "sc-page" }, emptyState({ icon: "server", title: "Headers not checked yet", body: "CSP, HSTS, X-Content-Type-Options, framing protection, Referrer-Policy, Permissions-Policy and COOP are graded against what an Aktion app actually needs." })));
  }
  const tone: Record<string, Tone> = { good: "green", warn: "amber", missing: "red", info: "blue" };
  return h("div", { class: "dt-scroll" }, intro,
    h("div", { class: "sc-page" },
      h("div", { class: "sc-headers" }, ...report.headers.map((check) => h("div", { key: check.header, class: ["sc-header", `is-${check.status}`], "data-dt": "security-header" },
        h("div", { class: "sc-header-top" }, chip(check.status, tone[check.status] ?? "grey"), h("code", { class: "sc-header-name" }, check.header)),
        check.value ? h("code", { class: "sc-header-value" }, check.value) : h("span", { class: "t4" }, "not set"),
        h("div", { class: "sc-header-note" }, check.note))))));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "Security", "security");
  if (ui.securityRequested || !ui.securityRun) {
    ui.securityRequested = false;
    runScan(ctx, { quiet: true });
  }
  const report = ui.securityRun!;
  let body: Child;
  switch (ui.securityPane) {
    case "program": body = programPane(ctx, report); break;
    case "network": body = networkPane(ctx, report); break;
    case "storage": body = storagePane(ctx, report); break;
    case "headers": body = headersPane(ctx, report); break;
    default: body = findingsPane(ctx, report);
  }
  const risky = report.storage.filter((s) => s.kind !== "none").length;
  return h("div", { class: "sc", "data-dt": "security" },
    viewbar(
      segmented([
        { value: "findings", label: "Findings", icon: "warning", count: report.findings.length || null },
        { value: "program", label: "Program", icon: "code" },
        { value: "network", label: "Origins", icon: "globe", count: report.origins.length || null },
        { value: "storage", label: "Storage", icon: "key", count: risky || null },
        { value: "headers", label: "Headers", icon: "server", count: report.headers ? report.headers.filter((c) => c.status === "missing" || c.status === "warn").length || null : null },
      ], ui.securityPane, (value) => { ui.securityPane = value; ctx.refresh(); }, { label: "Security view", testid: "security-panes" }),
      spacer(),
      button({ label: "Re-scan", size: "sm", icon: "refresh", testid: "security-rescan", tip: `Last scan ${fmtAgo(report.at, Date.now())}`, onClick: () => { runScan(ctx); ctx.refresh(); } }),
      iconButton({ icon: "download", label: "Export report", size: "sm", onClick: (event: MouseEvent) => ctx.openMenu(event, [
        { label: "Copy as Markdown", icon: "copy", run: () => ctx.copy(reportMarkdown(ctx, report), "the report") },
        { label: "Download JSON", icon: "download", run: () => downloadText(`security-${app.label.replace(/[^\w.-]+/g, "_")}.json`, reportJson(ctx, report)) },
        { label: "Download Markdown", icon: "file", run: () => downloadText(`security-${app.label.replace(/[^\w.-]+/g, "_")}.md`, reportMarkdown(ctx, report), "text/markdown") },
      ]) })),
    body);
}

export const securityView: ViewDefinition = {
  id: "security",
  label: "Security",
  icon: "security",
  group: "quality",
  hint: "Program reach, sanitiser escapes, transport, storage, headers, CSP",
  keywords: "security xss csp headers hsts jwt token secrets mixed content origins third-party policy eval sandbox",
  badge: (ctx) => {
    const high = ctx.ui.securityRun?.counts.high ?? 0;
    return high > 0 ? { value: high, tone: "red" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "security:scan", label: "Run security scan", icon: "security", keywords: "audit xss", run: () => { ctx.ui.securityRequested = true; ctx.ui.securityPane = "findings"; ctx.selectTab("security"); } },
    { id: "security:headers", label: "Check response headers (CSP, HSTS…)", icon: "server", run: () => { ctx.ui.securityPane = "headers"; ctx.selectTab("security"); checkHeaders(ctx); } },
  ],
  css: /* css */ `
.sc { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sc-left { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.sc-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sc-summary { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.sc-summary-text { display: flex; flex-direction: column; gap: 3px; min-width: 160px; }
.sc-summary-title { font-size: 15px; font-weight: 650; }
.sc-summary-text .t3 { font-size: var(--dt-fs-sm); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.sc-sevs { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.sc-ctx { display: inline-flex; align-items: center; gap: 4px; }
.sc-filters { flex: none; display: flex; gap: 5px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.sc-groups { display: flex; flex-direction: column; padding: 6px 0 12px; }
.sc-group + .sc-group { margin-top: 6px; }
.sc-group-head { display: flex; align-items: center; gap: 7px; padding: 8px 14px 4px; font-size: var(--dt-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dt-text-2); }
.sc-group-head .t3 { text-transform: none; letter-spacing: 0; font-weight: 400; }
.sc-count { font-size: var(--dt-fs-xs); background: var(--dt-bg-active); border-radius: 99px; padding: 1px 7px; color: var(--dt-text-2); }
.sc-item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 9px; width: 100%; min-height: 32px; padding: 5px 14px; cursor: pointer; font-size: var(--dt-fs-sm); }
.sc-item:hover { background: var(--dt-bg-hover); }
.sc-item:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: -2px; }
.sc-item.is-selected { background: var(--dt-accent-soft); }
.sc-item-title { flex: 1 1 auto; color: var(--dt-text); }
.sc-item-ev { flex: 0 1 38%; color: var(--dt-text-3); font-size: var(--dt-fs-xs); text-align: right; }
.sc-line { font-size: var(--dt-fs-xs); color: var(--dt-text-3); border: 1px solid var(--dt-border); border-radius: 4px; padding: 1px 5px; flex: none; background: none; }
.sc-line.is-link { cursor: pointer; font-family: var(--dt-mono); }
.sc-line.is-link:hover { color: var(--dt-accent-text); border-color: var(--dt-accent); }
.sc-dot { width: 9px; height: 9px; border-radius: 3px; flex: none; background: var(--dt-text-4); }
.sc-dot.t-red { background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.sc-dot.t-orange { background: var(--dt-orange); }
.sc-dot.t-amber { background: var(--dt-amber); }
.sc-dot.t-blue { background: var(--dt-blue); }
.sc-text { font-size: var(--dt-fs-md); line-height: 1.55; }
.sc-evidence { display: block; padding: 7px 9px; border-radius: var(--dt-r-sm); background: var(--dt-bg-2); font-size: var(--dt-fs-sm); overflow-wrap: anywhere; white-space: pre-wrap; }
.sc-actions { flex-wrap: wrap; }
.sc-grid { padding: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.sc-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.sc-rows { display: flex; flex-direction: column; }
.sc-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); min-width: 0; }
.sc-row:last-child { border-bottom: 0; }
.sc-empty { font-size: var(--dt-fs-sm); }
.sc-callout { flex: none; padding: 10px 12px; border-bottom: 1px solid var(--dt-border); gap: 10px; }
.sc-headers { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
.sc-header { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); border-left-width: 3px; }
.sc-header.is-good { border-left-color: var(--dt-green); }
.sc-header.is-warn { border-left-color: var(--dt-amber); }
.sc-header.is-missing { border-left-color: var(--dt-red); }
.sc-header.is-info { border-left-color: var(--dt-blue); }
.sc-header-top { display: flex; align-items: center; gap: 8px; }
.sc-header-name { font-weight: 650; }
.sc-header-value { font-size: var(--dt-fs-xs); color: var(--dt-text-2); overflow-wrap: anywhere; max-height: 5.5em; overflow: auto; }
.sc-header-note { font-size: var(--dt-fs-sm); color: var(--dt-text-2); line-height: 1.45; }
`,
};
