/**
 * Aktion DevTools — the pure modules behind the 3.0 panel.
 *
 * Everything here is deterministic and DOM-light: the security scanner, web
 * vitals maths, request export (cURL / fetch / HAR), flame-chart and timeline
 * geometry, health and performance insights, session export/import, the
 * recorder's Playwright codegen and replay, accessibility structure helpers,
 * the value explorer and syntax highlighter, and the small helpers each view
 * exports. The panel-level behaviour lives in `devtools-panel.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERSION } from "../src/index.js";
import {
  checkHeaders, checkUrlSecrets, classifySecret, decodeJwt, isLocalHost, scanSecurity,
} from "../src/devtools/analysis/security.js";
import { computeCls, computeInp, emptyVitals, isDevtoolsNode, rate, type InteractionRecord } from "../src/devtools/analysis/vitals.js";
import { effectEventLabel } from "../src/devtools/views/timeline.js";
import { shellQuote, toCurl, toFetch, toHar } from "../src/devtools/analysis/har.js";
import { inclusiveTimes, layoutFlame, niceTicks, packLanes, tickLabel } from "../src/devtools/analysis/layout.js";
import { commitRate, healthIssues, performanceInsights } from "../src/devtools/analysis/insights.js";
import { bugReportMarkdown, exportSessionJson, importSessionJson, SESSION_FORMAT } from "../src/devtools/session.js";
import { emptyModel, type NetworkRequest } from "../src/devtools/model.js";
import {
  InteractionRecorder, generatePlaywrightTest, generateTest, playwrightLocator, replayStep, resolveQuery, type RecordedStep,
} from "../src/devtools/recorder.js";
import { a11yScore, accessibilityTree, announce, auditAccessibility, headingOutline, landmarks, tabOrder } from "../src/devtools/a11y.js";
import { findMatchingRule, newRule } from "../src/devtools/rules.js";
import { editSeed, flattenValue, getAtPath, parseLeafEdit, previewValue, setAtPath, valueType, withoutKey } from "../src/devtools/ui/value.js";
import { highlightLines, renderTokens } from "../src/devtools/ui/code.js";
import { richText } from "../src/devtools/ui/kit.js";
import { h, render as renderVdom } from "../src/devtools/core/vdom.js";
import { buildPath, firstMatch, patternParams, routeCoverage } from "../src/devtools/views/routes.js";
import { suggestForeground, toHex, wcagUrl } from "../src/devtools/views/a11y.js";
import { diffStats, foldDiff, lineDiff } from "../src/devtools/views/source.js";
import { cssVarName, isColorValue, nudgeValue, themeBlock } from "../src/devtools/views/theme.js";
import { FUZZ_STRINGS, seededRandom, stepText } from "../src/devtools/views/testing.js";
import { visibleFindings } from "../src/devtools/shell/effects.js";
import { contrastRatio } from "../src/devtools/a11y.js";
import type { CommitRecord, ComponentRenderRecord, RouteEvent } from "../src/devtools/protocol.js";

afterEach(() => {
  document.body.innerHTML = "";
});

/* ========================================================================== */
/*  Version                                                                    */
/* ========================================================================== */

describe("VERSION", () => {
  it("matches package.json, so the panel's About and status bar never lie", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});

/* ========================================================================== */
/*  Security                                                                   */
/* ========================================================================== */

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwt(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }): string {
  return `${base64Url(header)}.${base64Url(payload)}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
}

const HTTPS_PAGE = { href: "https://app.example.com/", protocol: "https:", hostname: "app.example.com", origin: "https://app.example.com" };

describe("security — detectors", () => {
  it("decodes a JWT's claims and says when it expired", () => {
    const token = jwt({ sub: "ada", iss: "lab", exp: 1_700_000_000 });
    const decoded = decodeJwt(token, 1_800_000_000_000);
    expect(decoded).toMatchObject({ alg: "HS256", sub: "ada", iss: "lab", expired: true });
    expect(decodeJwt("not.a.token")).toBeNull();
  });

  it("classifies credentials by value first, then by name", () => {
    expect(classifySecret("authToken", jwt({ sub: "x" })).kind).toBe("jwt");
    expect(classifySecret("stripe", `sk_live_${"a".repeat(24)}`).kind).toBe("api-key");
    expect(classifySecret("password", "correct-horse-battery").kind).toBe("secret-name");
    // Short or boolean-looking values under a secret-sounding name are not flagged.
    expect(classifySecret("remember_token", "true").kind).toBe("none");
    expect(classifySecret("theme", "dark").kind).toBe("none");
  });

  it("finds credentials in query strings but not in ordinary parameters", () => {
    expect(checkUrlSecrets("https://api.example.com/x?token=abc123")).toBe("token");
    expect(checkUrlSecrets("https://api.example.com/x?page=2&q=shoes")).toBeNull();
    expect(checkUrlSecrets(`https://api.example.com/x?t=${jwt({ sub: "x" })}`)).toBe("t");
    expect(checkUrlSecrets("https://api.example.com/x")).toBeNull();
  });

  it("recognises local development hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "app.localhost", "[::1]"]) expect(isLocalHost(host)).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
  });

  it("grades response headers against what an Aktion app needs", () => {
    const weak = checkHeaders({ "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'" }, null, true);
    const csp = weak.find((c) => c.header === "content-security-policy")!;
    expect(csp.status).toBe("warn");
    expect(csp.note).toContain("unsafe-inline");
    expect(csp.note).toContain("unsafe-eval");
    expect(weak.find((c) => c.header === "strict-transport-security")?.status).toBe("missing");

    const strong = checkHeaders({
      "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    }, null, true);
    for (const header of ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy"]) {
      expect(strong.find((c) => c.header === header)?.status, header).toBe("good");
    }
  });
});

describe("security — scanSecurity", () => {
  function root(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  it("flags sanitiser escapes in the live DOM", () => {
    const report = scanSecurity({
      root: root(`
        <a href="javascript:alert(1)">x</a>
        <div onclick="steal()">y</div>
        <iframe src="about:blank"></iframe>
        <a href="https://elsewhere.example.org" target="_blank">z</a>
        <form action="http://forms.example.org/post"></form>
        <input type="password" autocomplete="off">
      `),
      requests: [],
      profile: null,
      location: HTTPS_PAGE,
    });
    const rules = new Set(report.findings.map((f) => f.rule));
    for (const rule of ["script-url", "inline-handler", "iframe-sandbox", "target-blank", "form-insecure-action", "password-autocomplete"]) {
      expect(rules.has(rule), rule).toBe(true);
    }
    expect(report.findings.find((f) => f.rule === "script-url")?.element?.tagName).toBe("A");
    expect(report.examined).toBeGreaterThan(0);
  });

  it("reads transport, storage, and program reach", () => {
    const requests: NetworkRequest[] = [
      { requestId: "1", method: "GET", url: "http://api.example.org/users?token=abc", phase: "success", startTime: 0, status: 200 },
      { requestId: "2", method: "GET", url: "https://metrics.example.net/p", phase: "success", startTime: 1, status: 200, requestHeaders: { Authorization: "Bearer x" } },
      { requestId: "3", method: "GET", url: "https://app.example.com/api/me", phase: "error", startTime: 2, error: "failed" },
    ];
    const report = scanSecurity({
      root: null,
      requests,
      profile: {
        policy: "all", hostGlobals: [{ name: "fetch", risk: "medium", line: 3, column: 1, count: 2 }],
        dynamicCode: [{ what: "eval", line: 7, column: 3 }], escapeHatches: [], endpoints: [], openUrls: [], emits: [], storage: [],
      },
      location: HTTPS_PAGE,
      storage: { local: [["authToken", jwt({ sub: "ada" })]], session: [], cookies: [["session_id", "abc123"]] },
    });
    const rules = new Set(report.findings.map((f) => f.rule));
    for (const rule of ["mixed-content", "secret-in-url", "third-party-credentials", "third-party-origins", "storage-secret", "cookie-not-httponly", "policy-all", "dynamic-code", "host-global"]) {
      expect(rules.has(rule), rule).toBe(true);
    }
    // Findings are sorted worst-first and the counts add up.
    const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
    for (let i = 1; i < report.findings.length; i += 1) {
      expect(order[report.findings[i]!.severity]).toBeGreaterThanOrEqual(order[report.findings[i - 1]!.severity]);
    }
    expect(Object.values(report.counts).reduce((a, b) => a + b, 0)).toBe(report.findings.length);
    expect(report.score).toBeLessThan(60);
    // Origins: first-party last, failures counted.
    const own = report.origins.find((o) => o.origin === "https://app.example.com")!;
    expect(own).toMatchObject({ firstParty: true, failed: 1 });
    expect(report.origins[0]!.firstParty).toBe(false);
    expect(report.storage[0]).toMatchObject({ key: "authToken", kind: "jwt" });
  });

  it("scores a clean page at 100 and says so", () => {
    const report = scanSecurity({ root: root(`<a href="/docs" rel="noopener">docs</a>`), requests: [], profile: { policy: "safe", hostGlobals: [], dynamicCode: [], escapeHatches: [], endpoints: [], openUrls: [], emits: [], storage: [] }, location: HTTPS_PAGE, storage: { local: [], session: [], cookies: [] }, headers: {}, cspMeta: "default-src 'self'; object-src 'none'; frame-ancestors 'self'" });
    // Only header advisories can remain; no DOM, transport, storage, or program findings.
    expect(report.findings.filter((f) => f.category !== "headers")).toEqual([]);
    expect(report.secureContext).toBe(true);
  });

  it("reports CSP violations the browser raised", () => {
    const report = scanSecurity({
      root: null, requests: [], profile: null, location: HTTPS_PAGE,
      violations: [{ time: 1, directive: "style-src-elem", blocked: "inline", source: "", disposition: "enforce" }],
    });
    const finding = report.findings.find((f) => f.rule === "csp-violation")!;
    expect(finding.severity).toBe("medium");
    expect(finding.fix).toContain("unsafe-inline");
  });
});

/* ========================================================================== */
/*  Web vitals                                                                 */
/* ========================================================================== */

function interaction(duration: number, id = duration): InteractionRecord {
  return { id, type: "click", target: "button", start: id, duration, inputDelay: 1, processing: duration - 2, presentation: 1 };
}

describe("web vitals", () => {
  it("rates against the Core Web Vitals thresholds", () => {
    expect(rate("inp", 120)).toBe("good");
    expect(rate("inp", 350)).toBe("needs-improvement");
    expect(rate("inp", 900)).toBe("poor");
    expect(rate("cls", 0.05)).toBe("good");
    expect(rate("lcp", null)).toBe("unknown");
  });

  it("computes INP as the worst interaction, skipping one outlier per 50", () => {
    expect(computeInp([])).toBeNull();
    expect(computeInp([interaction(40), interaction(300), interaction(90)])!.value).toBe(300);
    // 120 interactions: two outliers are ignored, so the third-worst defines INP.
    const many = Array.from({ length: 117 }, (_, i) => interaction(20 + (i % 10), i + 10));
    many.push(interaction(900, 1), interaction(800, 2), interaction(210, 3));
    expect(computeInp(many)!.value).toBe(210);
  });

  it("computes CLS from the worst session window", () => {
    expect(computeCls([])).toBe(0);
    // Two bursts separated by more than a second: the larger burst wins.
    const shifts = [
      { time: 0, value: 0.05, sources: [] }, { time: 400, value: 0.05, sources: [] },
      { time: 3000, value: 0.2, sources: [] }, { time: 3500, value: 0.1, sources: [] },
    ];
    expect(computeCls(shifts)).toBeCloseTo(0.3, 5);
    // A window closes after five seconds even without a gap.
    const steady = Array.from({ length: 12 }, (_, i) => ({ time: i * 900, value: 0.01, sources: [] }));
    expect(computeCls(steady)).toBeLessThan(0.12 - 1e-9 + 0.0001);
  });

  it("does not count clicks on the DevTools panel as the app's interactions", () => {
    const panel = document.createElement("aktion-devtools");
    const shadowRoot = panel.attachShadow({ mode: "open" });
    const inside = document.createElement("button");
    shadowRoot.appendChild(inside);
    document.body.appendChild(panel);
    const app = document.createElement("button");
    document.body.appendChild(app);
    expect(isDevtoolsNode(inside)).toBe(true);
    expect(isDevtoolsNode(panel)).toBe(true);
    expect(isDevtoolsNode(app)).toBe(false);
    expect(isDevtoolsNode(null)).toBe(false);
  });

  it("starts empty with nothing marked supported", () => {
    const vitals = emptyVitals();
    expect(vitals.inp).toBeNull();
    expect(Object.values(vitals.supported).every((v) => v === false)).toBe(true);
  });
});

/* ========================================================================== */
/*  Request export                                                             */
/* ========================================================================== */

describe("request export", () => {
  const post: NetworkRequest = {
    requestId: "r1", method: "post", url: "https://api.example.com/users?page=2",
    phase: "success", startTime: 100, duration: 42, status: 201,
    requestHeaders: { "Content-Type": "application/json", Authorization: "Bearer it's" },
    requestBody: `{"name":"Ada"}`, responseHeaders: { "content-type": "application/json" }, responseBody: `{"id":1}`, responseSize: 8,
  };

  it("quotes for a POSIX shell", () => {
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("plain-value_1.2")).toBe("plain-value_1.2");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it("emits a cURL command with method, headers, and body", () => {
    // One flag and its value per continued line — the shape people paste into tickets.
    expect(toCurl(post).split(" \\\n  ")).toEqual([
      "curl 'https://api.example.com/users?page=2'",
      "-X POST",
      "-H 'Content-Type: application/json'",
      `-H 'Authorization: Bearer it'\\''s'`,
      `--data-raw '{"name":"Ada"}'`,
    ]);
    expect(toCurl({ method: "GET", url: "https://x.dev/a" })).toBe("curl https://x.dev/a");
  });

  it("emits a fetch call that reproduces the request", () => {
    const code = toFetch(post);
    expect(code).toContain(`await fetch("https://api.example.com/users?page=2"`);
    expect(code).toContain(`"method": "POST"`);
    expect(code).toContain(`"body": "{\\"name\\":\\"Ada\\"}"`);
  });

  it("builds a HAR 1.2 document with wall-clock times", () => {
    const har = JSON.parse(toHar([post, { ...post, requestId: "r2", phase: "mock", rule: "mock users", status: 200 }], { epochOffset: 1_700_000_000_000, pageTitle: "Lab" })) as {
      log: { version: string; pages: Array<{ title: string }>; entries: Array<{ startedDateTime: string; request: { method: string; queryString: Array<{ name: string; value: string }>; postData?: { text: string } }; response: { status: number; content: { text: string } }; _aktionMocked?: boolean; _aktionRule?: string }> };
    };
    expect(har.log.version).toBe("1.2");
    expect(har.log.pages[0]!.title).toBe("Lab");
    const [first, second] = har.log.entries;
    expect(first!.startedDateTime).toBe(new Date(1_700_000_000_100).toISOString());
    expect(first!.request.method).toBe("POST");
    expect(first!.request.queryString).toEqual([{ name: "page", value: "2" }]);
    expect(first!.request.postData?.text).toBe(`{"name":"Ada"}`);
    expect(first!.response).toMatchObject({ status: 201, content: { text: `{"id":1}` } });
    expect(second!._aktionMocked).toBe(true);
    expect(second!._aktionRule).toBe("mock users");
  });
});

/* ========================================================================== */
/*  Chart geometry                                                             */
/* ========================================================================== */

function record(instanceKey: string, name: string, kind: "user" | "library", selfTime: number, phase: ComponentRenderRecord["phase"] = "update"): ComponentRenderRecord {
  return { instanceKey, name, kind, phase, selfTime, depth: instanceKey.split("/").length - 2, reason: "state dependency changed" } as ComponentRenderRecord;
}

describe("flame chart layout", () => {
  const ROOT = "$/0#App@1:0";
  const LIST = `${ROOT}/0#List@2:0`;
  const ITEM = `${LIST}/0#Item@3:0`;
  const TEXT = `${ITEM}>0#Text@4:0`;

  it("adds a user component's children to its own body time", () => {
    const layout = layoutFlame({ components: [record(ROOT, "App", "user", 1), record(LIST, "List", "user", 2), record(ITEM, "Item", "user", 3)] });
    const byName = new Map(layout.nodes.map((n) => [n.name, n]));
    expect(byName.get("Item")!.total).toBe(3);
    expect(byName.get("List")!.total).toBe(5);
    expect(byName.get("App")!.total).toBe(6);
    expect(byName.get("App")!.self).toBe(1);
    // Children start after the parent's own body.
    expect(byName.get("List")!.start).toBe(1);
    expect(layout.total).toBe(6);
    expect(layout.maxDepth).toBe(2);
  });

  it("treats a library component's time as already inclusive", () => {
    const layout = layoutFlame({ components: [record(ITEM, "Item", "user", 1), record(TEXT, "Text", "library", 4)] });
    const text = layout.nodes.find((n) => n.name === "Text")!;
    const item = layout.nodes.find((n) => n.name === "Item")!;
    expect(text.total).toBe(4);
    expect(item.total).toBe(5);
  });

  it("draws a memoised instance at its last known width, marked estimated", () => {
    const first = layoutFlame({ components: [record(ROOT, "App", "user", 1), record(LIST, "List", "user", 6)] });
    const widths = inclusiveTimes(first);
    const second = layoutFlame({ components: [record(ROOT, "App", "user", 1), record(LIST, "List", "user", 0, "memo")] }, widths);
    const list = second.nodes.find((n) => n.name === "List")!;
    expect(list.total).toBe(6);
    expect(list.estimated).toBe(true);
    expect(list.self).toBe(0);
    expect(inclusiveTimes(second).has(LIST)).toBe(false);
  });

  it("packs overlapping spans into the fewest lanes", () => {
    const { lanes, count } = packLanes([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 11, end: 20 }, { start: 16, end: 18 }]);
    expect(count).toBe(2);
    expect(lanes).toEqual([0, 1, 0, 1]);
    // A gap keeps touching spans apart.
    expect(packLanes([{ start: 0, end: 10 }, { start: 10, end: 20 }], 8, 1).count).toBe(2);
    // Overflow shares the lane that frees first instead of growing forever.
    expect(packLanes(Array.from({ length: 5 }, () => ({ start: 0, end: 5 })), 2).count).toBe(2);
  });

  it("chooses round axis ticks and labels them for the span", () => {
    expect(niceTicks(0, 1000, 8)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(tickLabel(1500, 10_000)).toBe("1.5s");
    expect(tickLabel(42, 500)).toBe("42ms");
    expect(tickLabel(1.234, 5)).toBe("1.23ms");
  });
});

/* ========================================================================== */
/*  Insights                                                                   */
/* ========================================================================== */

function commit(commitId: number, startTime: number, duration: number, components: ComponentRenderRecord[] = [], extra: Partial<CommitRecord> = {}): CommitRecord {
  return { kind: "commit", appId: "a", commitId, startTime, duration, components, initial: commitId === 1, fullRender: false, ...extra } as CommitRecord;
}

describe("insights", () => {
  it("measures the commit rate over recent commits", () => {
    const model = emptyModel();
    expect(commitRate(model)).toBe(0);
    for (let i = 0; i < 11; i += 1) model.commits.push(commit(i + 1, i * 10, 1));
    // 10 intervals over 100ms → 100 commits per second.
    expect(commitRate(model)).toBeCloseTo(100, 5);
  });

  it("orders health issues errors-first and names a commit loop", () => {
    const model = emptyModel();
    model.errors.push({ kind: "error", appId: "a", phase: "handler", message: "Boom", time: 1 } as never);
    model.logs.push({ level: "warn", text: "[aktion] heads up", args: [], origin: "program", time: 2, count: 3 });
    model.network.push({ requestId: "1", method: "GET", url: "/api", phase: "success", startTime: 0, status: 503 });
    for (let i = 0; i < 12; i += 1) model.commits.push(commit(i + 1, i * 5, 1));
    const issues = healthIssues(model, [{ line: 4, column: 1, message: "Unknown component Buttn", kind: "schema", severity: "error" }]);
    expect(issues.map((i) => i.id)).toEqual(["program-errors", "runtime-errors", "failed-requests", "warnings", "commit-loop"]);
    expect(issues[0]!.detail).toContain("Line 4");
    expect(issues.find((i) => i.id === "failed-requests")!.tone).toBe("bad");
    expect(issues.find((i) => i.id === "warnings")!.title).toBe("3 warnings");
  });

  it("finds slow components and never-memoised ones", () => {
    const model = emptyModel();
    for (let i = 0; i < 14; i += 1) {
      model.commits.push(commit(i + 1, i * 100, 12, [
        record("$/0#Slow@1:0", "Slow", "user", 11),
        record("$/1#Chatty@2:0", "Chatty", "user", 0.2),
      ]));
    }
    const insights = performanceInsights(model);
    expect(insights.some((i) => i.id === "slow:Slow")).toBe(true);
    expect(insights.some((i) => i.id === "unmemo:Chatty")).toBe(true);
  });
});

/* ========================================================================== */
/*  Sessions                                                                   */
/* ========================================================================== */

describe("session export and import", () => {
  function source(): Parameters<typeof exportSessionJson>[0] {
    const model = emptyModel();
    model.commits.push(commit(1, 5, 2, [record("$/0#App@1:0", "App", "user", 1)]));
    model.network.push({ requestId: "1", method: "GET", url: "/api/users", phase: "success", startTime: 6, status: 200, duration: 30 });
    model.state = { count: 3 };
    model.logs.push({ level: "error", text: "Boom", args: ["Boom"], origin: "program", time: 7, count: 1 });
    model.routes.push({ kind: "route", appId: "a", from: "/", to: "/todos", pattern: "/todos", time: 8 } as RouteEvent);
    model.programHistory.push({ text: `$app(Text("x"))`, at: Date.now(), lines: 1 });
    return {
      model,
      hook: { protocolVersion: 3, libraryVersion: "9.9.9" },
      app: { id: "app-1", label: "Lab", element: document.createElement("div"), getState: () => ({ count: 3 }), setState: () => undefined, getProgram: () => `$app(Text("x"))`, forceRender: () => undefined },
    };
  }

  it("round-trips everything the timeline needs", () => {
    const steps: RecordedStep[] = [{ type: "click", query: { kind: "role", value: "button", name: "Add" }, label: "click button \"Add\"", time: 1 }];
    const text = exportSessionJson(source(), { steps, note: "repro" });
    const parsed = JSON.parse(text) as { format: string; libraryVersion: string; app: { label: string } };
    expect(parsed.format).toBe(SESSION_FORMAT);
    expect(parsed.libraryVersion).toBe("9.9.9");

    const imported = importSessionJson(text, "bug-123.json");
    expect(imported.label).toContain("Lab");
    expect(imported.program).toBe(`$app(Text("x"))`);
    expect(imported.model.commits).toHaveLength(1);
    expect(imported.model.network[0]!.url).toBe("/api/users");
    expect(imported.model.routes[0]!.to).toBe("/todos");
    expect(imported.model.state).toEqual({ count: 3 });
    expect(imported.steps).toEqual(steps);
    expect(imported.note).toBe("repro");
  });

  it("refuses a file that is not a session", () => {
    expect(() => importSessionJson(`{"hello":"world"}`)).toThrow();
    expect(() => importSessionJson("not json")).toThrow();
  });

  it("writes a bug report with environment, errors, failed requests, and steps", () => {
    const ctx = source();
    ctx.model.network.push({ requestId: "2", method: "POST", url: "/api/orders", phase: "success", startTime: 9, status: 500, duration: 12 });
    const report = bugReportMarkdown(ctx, { steps: [{ type: "click", query: { kind: "text", value: "Add" }, label: "click text \"Add\"", time: 1 }], vitals: ["INP 40ms"] });
    expect(report).toContain("Boom");
    // Only the failing request is listed: a report is about what went wrong.
    expect(report).toContain("| POST | `/api/orders` | 500 | 12ms |");
    expect(report).not.toContain("/api/users");
    expect(report).toContain("click text");
    expect(report).toContain("INP 40ms");
  });
});

/* ========================================================================== */
/*  Rules                                                                      */
/* ========================================================================== */

describe("network rule probability", () => {
  it("applies a flaky rule only on the fraction of requests it names", () => {
    const rules = [newRule({ pattern: "/api", action: "fail", probability: 0.3 })];
    expect(findMatchingRule(rules, "GET", "/api/users", () => 0.1)).not.toBeNull();
    expect(findMatchingRule(rules, "GET", "/api/users", () => 0.9)).toBeNull();
    // A rule without a probability always applies.
    expect(findMatchingRule([newRule({ pattern: "/api", action: "delay" })], "GET", "/api/x", () => 0.99)).not.toBeNull();
  });
});

/* ========================================================================== */
/*  Recorder: Playwright, resolution, replay, route assertions                 */
/* ========================================================================== */

describe("recorder — Playwright codegen", () => {
  const steps: RecordedStep[] = [
    { type: "click", query: { kind: "role", value: "button", name: "Todos" }, label: "click button \"Todos\"", time: 1 },
    { type: "assert", assertion: "route", value: "/todos", label: "route is /todos", time: 2 },
    { type: "type", query: { kind: "label", value: "Email" }, value: "ada@example.com", label: "type", time: 3 },
    { type: "check", query: { kind: "testid", value: "terms" }, label: "check", time: 4 },
    { type: "assert", assertion: "text", query: { kind: "text", value: "Saved" }, value: "Saved", label: "expect", time: 5 },
    { type: "navigate", value: "/settings", label: "navigate to /settings", time: 6 },
  ];

  it("maps every strategy to a Playwright locator", () => {
    expect(playwrightLocator({ kind: "role", value: "button", name: "Save" })).toBe(`page.getByRole("button", { name: "Save", exact: true })`);
    expect(playwrightLocator({ kind: "testid", value: "x" })).toBe(`page.getByTestId("x")`);
    expect(playwrightLocator({ kind: "css", value: ".a > b" })).toBe(`page.locator(".a > b")`);
  });

  it("emits a runnable spec, with route assertions for hash and history routers", () => {
    const hash = generatePlaywrightTest(steps, { title: "flow", url: "http://localhost:5173/", routerMode: "hash" });
    expect(hash).toContain(`import { test, expect } from "@playwright/test";`);
    expect(hash).toContain(`await page.getByRole("button", { name: "Todos", exact: true }).click();`);
    expect(hash).toContain(`await expect(page).toHaveURL(new RegExp("#\\\\/todos$"));`);
    expect(hash).toContain(`await page.getByLabel("Email", { exact: true }).fill("ada@example.com");`);
    expect(hash).toContain(`await page.getByTestId("terms").check();`);
    expect(hash).toContain(`await expect(page.getByText("Saved", { exact: true })).toContainText("Saved");`);
    expect(hash).toContain(`location.hash = path`);
    const history = generatePlaywrightTest(steps, { routerMode: "history", url: "http://localhost/" });
    expect(history).toContain(`new RegExp("\\\\/todos$")`);
    expect(history).toContain("page.goto(");
    // The generated route pattern really matches the URL it describes.
    expect(new RegExp("#\\/todos$").test("http://localhost:5173/#/todos")).toBe(true);
  });

  it("asserts the route in the Aktion test too", () => {
    const code = generateTest(steps.slice(0, 2), { program: `$app(Text("x"))` });
    expect(code).toContain(`expect(screen.route).toBe("/todos");`);
  });
});

describe("recorder — navigation caused by an interaction", () => {
  it("records the navigation as a route assertion, not a replayed navigate", () => {
    const recorder = new InteractionRecorder();
    const root = document.createElement("div");
    document.body.appendChild(root);
    recorder.start(root, () => undefined);
    recorder.addStep({ type: "click", query: { kind: "text", value: "Todos" }, label: "click text \"Todos\"" });
    recorder.addStep({ type: "navigate", value: "/todos", label: "navigate to /todos" });
    // The hash router's second event for the same path is dropped.
    recorder.addStep({ type: "navigate", value: "/todos", label: "navigate to /todos" });
    recorder.stop();
    const steps = recorder.list();
    expect(steps.map((s) => s.type)).toEqual(["click", "assert"]);
    expect(steps[1]).toMatchObject({ assertion: "route", value: "/todos" });
  });

  it("keeps a navigation nobody clicked for as a navigate step", () => {
    const recorder = new InteractionRecorder();
    recorder.start(document.body, () => undefined);
    recorder.addStep({ type: "navigate", value: "/deep/link", label: "navigate to /deep/link" });
    recorder.stop();
    expect(recorder.list()[0]!.type).toBe("navigate");
  });
});

describe("recorder — resolution and replay", () => {
  function fixture(): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = `
      <button>Save</button><button aria-label="Close">×</button>
      <label for="email">Email</label><input id="email" type="email">
      <input type="checkbox" id="terms" data-testid="terms">
      <div><span>Saved</span></div>
      <p>Saved draft</p>`;
    document.body.appendChild(root);
    return root;
  }

  it("resolves queries with Testing Library semantics", () => {
    const root = fixture();
    expect(resolveQuery(root, { kind: "role", value: "button" })).toHaveLength(2);
    expect(resolveQuery(root, { kind: "role", value: "button", name: "Close" })).toHaveLength(1);
    expect(resolveQuery(root, { kind: "label", value: "Email" })[0]!.id).toBe("email");
    expect(resolveQuery(root, { kind: "testid", value: "terms" })).toHaveLength(1);
    // Exact text, deepest element only: the <span>, not its wrapper, not "Saved draft".
    const saved = resolveQuery(root, { kind: "text", value: "Saved" });
    expect(saved.map((el) => el.tagName)).toEqual(["SPAN"]);
    expect(resolveQuery(root, { kind: "css", value: "::bad(" })).toEqual([]);
  });

  it("replays clicks, typing, checks, and assertions like a user", async () => {
    const root = fixture();
    let clicked = 0;
    root.querySelector("button")!.addEventListener("click", () => { clicked += 1; });
    let typed = "";
    root.querySelector("#email")!.addEventListener("input", (e) => { typed = (e.target as HTMLInputElement).value; });

    expect((await replayStep({ type: "click", query: { kind: "role", value: "button", name: "Save" }, label: "", time: 0 }, root)).ok).toBe(true);
    expect(clicked).toBe(1);
    expect((await replayStep({ type: "type", query: { kind: "label", value: "Email" }, value: "ada@example.com", label: "", time: 0 }, root)).ok).toBe(true);
    expect(typed).toBe("ada@example.com");
    expect((await replayStep({ type: "check", query: { kind: "testid", value: "terms" }, label: "", time: 0 }, root)).ok).toBe(true);
    expect((root.querySelector("#terms") as HTMLInputElement).checked).toBe(true);
    expect((await replayStep({ type: "assert", assertion: "value", query: { kind: "label", value: "Email" }, value: "ada@example.com", label: "", time: 0 }, root)).ok).toBe(true);
    const wrong = await replayStep({ type: "assert", assertion: "text", query: { kind: "text", value: "Saved" }, value: "Deleted", label: "", time: 0 }, root);
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toContain("Deleted");
    const missing = await replayStep({ type: "click", query: { kind: "text", value: "Nope" }, label: "", time: 0 }, root);
    expect(missing).toMatchObject({ ok: false });
  });

  it("checks a route assertion against the live router, waiting a beat for it", async () => {
    let path = "/";
    setTimeout(() => { path = "/todos"; }, 40);
    const ok = await replayStep({ type: "assert", assertion: "route", value: "/todos", label: "", time: 0 }, null, undefined, () => path);
    expect(ok.ok).toBe(true);
    const bad = await replayStep({ type: "assert", assertion: "route", value: "/nowhere", label: "", time: 0 }, null, undefined, () => path);
    expect(bad).toMatchObject({ ok: false, message: "expected route /nowhere, got /todos" });
    expect((await replayStep({ type: "assert", assertion: "route", value: "/", label: "", time: 0 }, null)).ok).toBe(false);
  });
});

/* ========================================================================== */
/*  Accessibility structure                                                    */
/* ========================================================================== */

describe("accessibility structure", () => {
  function page(html: string): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it("walks the tab order the way Tab does", () => {
    const root = page(`
      <button id="a">A</button>
      <button id="b" tabindex="2">B</button>
      <button id="c" disabled>C</button>
      <a id="d">no href</a>
      <a id="e" href="/x">E</a>
      <input id="f" type="hidden">
      <span id="g" tabindex="-1">G</span>
      <button id="h" tabindex="1">H</button>`);
    expect(tabOrder(root).map((el) => el.id)).toEqual(["h", "b", "a", "e"]);
  });

  it("lists landmarks and a heading outline with skipped levels", () => {
    const root = page(`
      <header>h</header><nav aria-label="Primary">n</nav><main><h1>Title</h1><h3>Skipped</h3><h4>Next</h4></main>
      <section>unlabelled region is not a landmark</section><section aria-label="Filters">f</section>`);
    expect(landmarks(root).map((l) => l.label)).toEqual(["banner", "navigation “Primary”", "main", "region “Filters”"]);
    const outline = headingOutline(root);
    expect(outline.map((h2) => [h2.level, h2.skipped])).toEqual([[1, false], [3, true], [4, false]]);
  });

  it("builds the accessibility tree and says what a screen reader announces", () => {
    const root = page(`<div><button aria-expanded="false">Menu</button><div aria-hidden="true"><button>Hidden</button></div><input type="checkbox" aria-label="Remember me" checked></div>`);
    const tree = accessibilityTree(root);
    const flat: string[] = [];
    const walk = (nodes: typeof tree): void => { for (const n of nodes) { flat.push(`${n.role}:${n.name}`); walk(n.children); } };
    walk(tree);
    expect(flat).toContain("button:Menu");
    expect(flat).toContain("checkbox:Remember me");
    expect(flat.some((entry) => entry.includes("Hidden"))).toBe(false);
    expect(announce(root.querySelector("button")!)).toBe("“Menu”, button, collapsed");
    expect(announce(root.querySelector("input")!)).toBe("“Remember me”, checkbox, checked");
  });

  it("scores audits by distinct failing rules, not raw counts", () => {
    const root = page(`<img src="a.png"><img src="b.png"><img src="c.png"><button></button>`);
    const { findings } = auditAccessibility(root);
    const score = a11yScore(findings);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(50);
    expect(a11yScore([])).toBe(100);
    for (const finding of findings) expect(finding.wcag?.length ?? 0).toBeGreaterThan(0);
  });

  it("numbers findings with the same filter the page markers use", () => {
    const findings = [
      { impact: "serious", category: "names" }, { impact: "minor", category: "keyboard" }, { impact: "serious", category: "forms" },
    ];
    expect(visibleFindings(findings, { a11yImpacts: new Set(["serious"]), a11yCategory: "all" })).toHaveLength(2);
    expect(visibleFindings(findings, { a11yImpacts: new Set(["serious", "minor"]), a11yCategory: "forms" })).toEqual([findings[2]]);
  });
});

describe("contrast helpers", () => {
  it("suggests the nearest passing foreground in the same hue", () => {
    const grey = { r: 150, g: 150, b: 150 };
    const white = { r: 255, g: 255, b: 255 };
    const fix = suggestForeground(grey, white, 4.5)!;
    expect(fix.ratio).toBeGreaterThanOrEqual(4.5);
    const parsed = { r: parseInt(fix.hex.slice(1, 3), 16), g: parseInt(fix.hex.slice(3, 5), 16), b: parseInt(fix.hex.slice(5, 7), 16) };
    expect(parsed.r).toBeLessThan(150);
    expect(contrastRatio(parsed, white)).toBeCloseTo(fix.ratio, 5);
    // Already passing: returned unchanged.
    expect(suggestForeground({ r: 0, g: 0, b: 0 }, white, 4.5)!.hex).toBe("#000000");
  });

  it("formats hex and links WCAG criteria to the Understanding docs", () => {
    expect(toHex({ r: 255, g: 8.4, b: -3 })).toBe("#ff0800");
    expect(wcagUrl("1.4.3")).toBe("https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html");
    expect(wcagUrl("9.9.9")).toBeNull();
  });
});

/* ========================================================================== */
/*  Routes helpers                                                             */
/* ========================================================================== */

describe("timeline labels", () => {
  it("says what an effect is for, then where it lives", () => {
    expect(effectEventLabel({ label: "effect @ L16:C1", triggers: "[\"every(3000)\"]" })).toBe("every 3s · L16");
    expect(effectEventLabel({ label: "effect @ L17:C1", triggers: "[$count]" })).toBe("on $count · L17");
    expect(effectEventLabel({ label: "Card::pulse", triggers: "" })).toBe("Card::pulse");
  });
});

describe("routes helpers", () => {
  it("reads a pattern's parameters", () => {
    expect(patternParams("/users/:id/posts/:postId")).toEqual([{ name: "id", wildcard: false }, { name: "postId", wildcard: false }]);
    expect(patternParams("/docs/*")).toEqual([{ name: "_", wildcard: true }]);
    expect(patternParams("/about")).toEqual([]);
  });

  it("builds a concrete path, encoding values, and waits for every param", () => {
    expect(buildPath("/users/:id", { id: "a b" })).toBe("/users/a%20b");
    expect(buildPath("/users/:id", {})).toBeNull();
    expect(buildPath("/docs/*", { _: "guide/intro" })).toBe("/docs/guide/intro");
    expect(buildPath("/", {})).toBe("/");
  });

  it("finds the arm the router would pick, in declaration order", () => {
    expect(firstMatch(["/", "/users/:id", "*"], "/users/7")).toEqual({ pattern: "/users/:id", params: { id: "7" } });
    expect(firstMatch(["/", "*"], "/nowhere")!.pattern).toBe("*");
    expect(firstMatch(["/a"], "/b")).toBeNull();
  });

  it("measures route coverage from history and the current route", () => {
    const history = [{ kind: "route", appId: "a", from: "/", to: "/users/3", time: 1 } as RouteEvent];
    const { visited, counts } = routeCoverage(["/", "/users/:id", "/about"], history, { path: "/", pattern: "/", params: {}, mode: "hash", guarded: false, declared: [] });
    expect([...visited].sort()).toEqual(["/", "/users/:id"]);
    expect(counts.get("/users/:id")).toBe(1);
  });
});

/* ========================================================================== */
/*  Source diff                                                                */
/* ========================================================================== */

describe("source diff", () => {
  it("diffs by line, keeping unchanged context", () => {
    const diff = lineDiff("a\nb\nc\nd", "a\nB\nc\nd\ne");
    expect(diff.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "add:B", "del:b", "same:c", "same:d", "add:e"]);
    expect(diffStats(diff)).toEqual({ added: 2, removed: 1 });
    // Line numbers refer to each side.
    expect(diff.find((l) => l.text === "e")).toMatchObject({ newLine: 5 });
    expect(diff.find((l) => l.text === "b")).toMatchObject({ oldLine: 2 });
  });

  it("reports nothing for identical text and degrades gracefully when huge", () => {
    expect(diffStats(lineDiff("x\ny", "x\ny"))).toEqual({ added: 0, removed: 0 });
    const before = Array.from({ length: 60 }, (_, i) => `a${i}`).join("\n");
    const after = Array.from({ length: 60 }, (_, i) => `b${i}`).join("\n");
    expect(diffStats(lineDiff(before, after, 10))).toEqual({ added: 60, removed: 60 });
  });

  it("folds long unchanged runs around the changes", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 20", "LINE 20");
    const folded = foldDiff(lineDiff(before, after), 2);
    const folds = folded.filter((row) => row.kind === "fold");
    expect(folds).toHaveLength(2);
    expect(folded.filter((row) => row.kind !== "fold")).toHaveLength(2 + 2 + 2);
  });
});

/* ========================================================================== */
/*  Theme helpers                                                              */
/* ========================================================================== */

describe("theme helpers", () => {
  it("names the CSS variable a token becomes", () => {
    expect(cssVarName("colorBgSubtle")).toBe("--rui-color-bg-subtle");
    expect(cssVarName("radius")).toBe("--rui-radius");
  });

  it("recognises colour values", () => {
    for (const v of ["#fff", "#112233", "rgb(1, 2, 3)", "hsl(0 0% 0%)", "oklch(0.7 0.1 200)"]) expect(isColorValue(v), v).toBe(true);
    for (const v of ["12px", "system-ui", "#zzzzzz"]) expect(isColorValue(v), v).toBe(false);
  });

  it("nudges numbers in their own unit", () => {
    expect(nudgeValue("12px", 1)).toBe("13px");
    expect(nudgeValue("12px", -10)).toBe("2px");
    expect(nudgeValue("1.5rem", 1)).toBe("1.6rem");
    expect(nudgeValue("0.5", -1)).toBe("0.4");
    expect(nudgeValue("auto", 1)).toBeNull();
  });

  it("writes a $theme block for the edits, or for every token", () => {
    const theme = { name: "light", tokens: { colorBg: "#fff", radius: "8px" }, scriptOverrides: [], devtoolsOverrides: ["radius"], available: [] };
    expect(themeBlock(theme, true)).toBe(`$theme({\n  radius: "8px",\n})`);
    expect(themeBlock(theme, false)).toBe(`$theme({\n  colorBg: "#fff",\n  radius: "8px",\n})`);
  });
});

/* ========================================================================== */
/*  Testing helpers                                                            */
/* ========================================================================== */

describe("testing helpers", () => {
  it("replays the same chaos sequence for the same seed", () => {
    const a = seededRandom(1234);
    const b = seededRandom(1234);
    const c = seededRandom(1235);
    const seqA = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("fuzzes with the inputs that break real apps", () => {
    expect(FUZZ_STRINGS).toContain("");
    expect(FUZZ_STRINGS.some((s) => s.length >= 500)).toBe(true);
    expect(FUZZ_STRINGS.some((s) => /<img|<svg/.test(s))).toBe(true);
    expect(FUZZ_STRINGS.some((s) => /[؀-ۿ]/.test(s))).toBe(true);
  });

  it("drops the verb its chip already shows", () => {
    expect(stepText({ type: "click", label: "click button \"Save\"", time: 0 })).toBe("button \"Save\"");
    expect(stepText({ type: "assert", assertion: "route", label: "route is /x", time: 0 })).toBe("route is /x");
    expect(stepText({ type: "assert", assertion: "visible", label: "expect text \"Hi\" to be visible", time: 0 })).toBe("text \"Hi\" to be visible");
    expect(stepText({ type: "key", key: "Enter", label: "press Enter on textbox", time: 0 })).toBe("Enter on textbox");
  });
});

/* ========================================================================== */
/*  Value explorer + highlighter                                               */
/* ========================================================================== */

describe("value explorer helpers", () => {
  it("types, previews, and seeds edits", () => {
    expect(valueType(null)).toBe("null");
    expect(valueType([1])).toBe("array");
    expect(valueType(new Map())).toBe("map");
    expect(previewValue({ a: 1, b: "two", c: [1, 2], d: 4 })).toBe(`{a: 1, b: "two", c: Array(2), …}`);
    expect(previewValue([1, 2, 3, 4, 5])).toBe("(5) [1, 2, 3, 4, …]");
    expect(editSeed("text")).toBe("text");
    expect(editSeed({ a: 1 })).toBe(`{"a":1}`);
  });

  it("keeps a string a string when the edit looks like JSON", () => {
    expect(parseLeafEdit("42", "old")).toBe("42");
    expect(parseLeafEdit(`"quoted"`, "old")).toBe("quoted");
    expect(parseLeafEdit("42", 1)).toBe(42);
    expect(parseLeafEdit("true", false)).toBe(true);
  });

  it("edits immutably by path", () => {
    const root = { user: { tags: ["a", "b"] } };
    const next = setAtPath(root, ["user", "tags", "1"], "B") as typeof root;
    expect(next.user.tags).toEqual(["a", "B"]);
    expect(root.user.tags).toEqual(["a", "b"]);
    expect(withoutKey({ a: 1, b: 2 }, "a")).toEqual({ b: 2 });
    expect(withoutKey(["x", "y"], "0")).toEqual(["y"]);
    expect(getAtPath(next, "user.tags.1")).toBe("B");
    expect(getAtPath(next, "user.nope.deep")).toBeUndefined();
  });

  it("flattens only what is expanded, paging big containers", () => {
    const value = { a: { b: 1 }, list: Array.from({ length: 5 }, (_, i) => i) };
    expect(flattenValue(value, { expanded: new Set() }).map((r) => r.path)).toEqual(["a", "list"]);
    const open = flattenValue(value, { expanded: new Set(["list"]), pageSize: 3 });
    expect(open.map((r) => r.path)).toEqual(["a", "list", "list.0", "list.1", "list.2", "list::more"]);
    expect(open.at(-1)!.hidden).toBe(2);
    // The filter matches descendants, so a container with a hit stays.
    expect(flattenValue(value, { expanded: new Set(), filter: "b" }).map((r) => r.path)).toEqual(["a"]);
  });
});

describe("syntax highlighter", () => {
  const kinds = (line: ReadonlyArray<{ t: string; v: string }>): string[] => line.filter((tok) => tok.t).map((tok) => `${tok.t}:${tok.v}`);

  it("colours atoms, components, strings, keys, and comments", () => {
    const [first, second] = highlightLines(`$count = 0 // start\nCard({ title: "Hi" })`);
    expect(kinds(first!)).toEqual(expect.arrayContaining(["state:$count", "num:0", "com:// start"]));
    expect(kinds(second!)).toEqual(expect.arrayContaining(["comp:Card", "prop:title", "str:\"Hi\""]));
  });

  it("keeps nested template interpolation balanced across lines", () => {
    const lines = highlightLines("Text(`a ${ $n + `b ${ $m }` } c`)\n$after = 1");
    expect(lines).toHaveLength(2);
    expect(kinds(lines[1]!)).toContain("state:$after");
    const text = lines[0]!.map((tok) => tok.v).join("");
    expect(text).toBe("Text(`a ${ $n + `b ${ $m }` } c`)");
  });

  it("marks search hits without losing token colours", () => {
    const host = document.createElement("div");
    renderVdom(host, [h("div", {}, ...renderTokens(highlightLines(`const label = "Save"`)[0]!, "save"))]);
    expect(host.querySelector("mark")?.textContent).toBe("Save");
    expect(host.querySelector("mark .tok-str, mark span")).toBeTruthy();
  });

  it("renders backtick spans as inline code", () => {
    const host = document.createElement("div");
    renderVdom(host, [h("p", {}, ...richText("Use `label:` on the field, not `placeholder:`."))]);
    expect([...host.querySelectorAll("code")].map((c) => c.textContent)).toEqual(["label:", "placeholder:"]);
    expect(richText("an unmatched ` stays")).toEqual(["an unmatched ` stays"]);
  });
});
