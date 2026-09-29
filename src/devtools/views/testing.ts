/**
 * Testing — the QA workbench:
 *
 *   - **Record** — click through a flow, add assertions by pointing at the
 *     page, replay it step by step, and export a runnable Aktion test (program
 *     inlined, changed state asserted) or a Playwright spec.
 *   - **Scenarios** — named app setups (state + network rules + route) you can
 *     re-enter in one click: "empty cart", "API down", "admin on /settings".
 *   - **Coverage** — DSL line/function/branch coverage from the interpreter.
 *   - **Queries** — a Testing Library query playground with a pick-to-suggest.
 *   - **Chaos** — a seeded monkey test with input fuzzing; every run is
 *     reproducible and can be opened as a recording.
 *   - **Emulate** — network throttling, RTL, text scaling, test-id badges, theme.
 */

import { h, type Child } from "../core/vdom.js";
import { can, loadAppData, renderRootElement, saveAppData, type Scenario, type UiState, type ViewContext, type ViewDefinition } from "../context.js";
import {
  chooseQuery, generatePlaywrightTest, generateTest, playwrightLocator, queryExpression, queryLabel, replayStep, resolveQuery,
  type QueryStrategy, type RecordedStep,
} from "../recorder.js";
import { accessibleName, describeElement, implicitRole } from "../overlay.js";
import * as coverage from "../../runtime/coverage.js";
import { codeView, highlightLines } from "../ui/code.js";
import { icon, type IconName } from "../ui/icons.js";
import {
  button, card, chip, downloadText, emptyState, field, fmtAgo, fmtCount, fmtMs, iconButton, meter, note, plural, segmented, select,
  spacer, spinner, stat, statGrid, toggleSwitch, viewbar, truncateMiddle, type Tone,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { noApp, openSource, paneSize, setPaneSize, unsupported } from "./common.js";

function queryRoot(ctx: ViewContext): Element | ShadowRoot | null {
  return can(ctx.app, "getRenderRoot") ? ctx.app.getRenderRoot() : null;
}

/** The step's label without the verb its type chip already shows. */
export function stepText(step: RecordedStep): string {
  const label = step.label;
  const verbs = step.type === "assert" ? ["expect ", "assert "] : step.type === "key" ? ["press "] : [`${step.type} `];
  for (const verb of verbs) if (label.toLowerCase().startsWith(verb)) return label.slice(verb.length);
  return label;
}

function stepTone(step: RecordedStep): Tone {
  switch (step.type) {
    case "navigate": return "purple";
    case "assert": return "green";
    case "type": case "select": return "cyan";
    case "key": return "grey";
    default: return "blue";
  }
}

/* -------------------------------------------------------------------------- */
/*  Record                                                                     */
/* -------------------------------------------------------------------------- */

function changedAtoms(ctx: ViewContext, steps: ReadonlyArray<RecordedStep>): Array<{ name: string; value: unknown }> {
  const { app, model } = ctx;
  if (!app || steps.length === 0) return [];
  const since = steps[0]!.time - ctx.epochOffset;
  const reserved = new Set(can(app, "getStateMeta") ? app.getStateMeta().filter((m) => m.reserved || m.computed).map((m) => m.name) : []);
  const state = app.getState();
  const out: Array<{ name: string; value: unknown }> = [];
  for (const [root, changes] of model.atomLog) {
    if (reserved.has(root) || root.startsWith("__") || root === "route") continue;
    if (!changes.some((c) => c.time >= since)) continue;
    const value = state[root];
    try {
      if (JSON.stringify(value).length > 4000) continue;
    } catch {
      continue;
    }
    out.push({ name: root, value });
    if (out.length >= 12) break;
  }
  return out;
}

export function testSource(ctx: ViewContext, steps: ReadonlyArray<RecordedStep>): string {
  const { app, ui } = ctx;
  const title = `${app?.label ?? "app"}: recorded flow`;
  if (ui.testFormat === "playwright") {
    const mode = can(app, "getRoute") ? app.getRoute().mode : undefined;
    return generatePlaywrightTest(steps, { title, routerMode: mode });
  }
  return generateTest(steps, {
    title,
    program: app?.getProgram(),
    assertions: ui.testIncludeState ? changedAtoms(ctx, steps) : [],
  });
}

let replayToken = 0;

async function replayAll(ctx: ViewContext): Promise<void> {
  const { ui, app } = ctx;
  const steps = ctx.recordedSteps();
  if (!app || steps.length === 0) return;
  const token = (replayToken += 1);
  ui.replayResults = steps.map(() => null);
  for (let index = 0; index < steps.length; index += 1) {
    if (token !== replayToken) return;
    ui.replaying = index;
    ctx.refresh();
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 60 : 380));
    if (token !== replayToken) return;
    let result: { ok: boolean; message: string; element?: Element };
    try {
      result = await replayStep(
        steps[index]!,
        queryRoot(ctx),
        can(app, "navigate") ? (path) => app.navigate(path) : undefined,
        can(app, "getRoute") ? () => app.getRoute().path : undefined,
      );
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    ui.replayResults[index] = { ok: result.ok, message: result.message };
    if (result.element) ctx.highlightElement(result.element, { component: `Step ${index + 1}`, kind: steps[index]!.type }, true);
    if (!result.ok) {
      ui.replaying = null;
      ctx.toast(`Replay failed at step ${index + 1}: ${result.message}`, "bad");
      ctx.refresh();
      return;
    }
  }
  ui.replaying = null;
  ctx.toast(`Replayed ${plural(steps.length, "step")} — all passed`, "good");
  ctx.refresh();
}

function stopReplay(ctx: ViewContext): void {
  replayToken += 1;
  ctx.ui.replaying = null;
  ctx.refresh();
}

function pickAssertion(ctx: ViewContext, assertion: NonNullable<RecordedStep["assertion"]>): void {
  const root = queryRoot(ctx);
  ctx.overlay.startPicking({
    onPick: (element) => {
      const step = ctx.recorder.addAssertion(element, assertion, root);
      ctx.toast(`Added: ${step.label}`, "good");
      ctx.refresh();
    },
    onCancel: () => ctx.refresh(),
    labelFor: (element) => ({ component: `assert ${assertion}`, kind: describeElement(element) }),
  });
  ctx.refresh();
}

function recordPane(ctx: ViewContext): Child {
  const { app, ui, recorder } = ctx;
  const steps = ctx.recordedSteps();
  const root = can(app, "getRenderRoot") ? app.getRenderRoot() : null;
  const recording = recorder.isRecording;
  const replaying = ui.replaying !== null;
  const source = steps.length > 0 ? ctx.memo("test.source", [steps.length, steps[steps.length - 1]?.time, ui.testFormat, ui.testIncludeState, ctx.model.revs.state], () => testSource(ctx, steps)) : "";
  // Mirrored on the UI state so automation (and `getUiState()`) can read the test.
  ui.generatedTest = source || null;
  const fileName = ui.testFormat === "playwright" ? "recorded.spec.ts" : "recorded.test.ts";

  const bar = h("div", { class: "ts-bar" },
    recording
      ? button({ label: "Stop", icon: "stop", variant: "danger", size: "sm", testid: "rec-stop", onClick: () => { recorder.stop(); ctx.toast(`Recorded ${plural(recorder.list().length, "step")}`); ctx.refresh(); } })
      : button({ label: steps.length > 0 ? "Resume recording" : "Record", icon: "record", variant: "primary", size: "sm", testid: "rec-start", disabled: !root, onClick: () => {
          const started = recorder.start(renderRootElement(app), () => ctx.refresh());
          ctx.toast(started ? "Recording — use the app; clicks, typing and navigation become steps" : "Could not attach to the app", started ? "info" : "bad");
          ctx.refresh();
        } }),
    button({ label: "Assert", icon: "assert", size: "sm", testid: "rec-assert", disabled: !root, tip: "Point at an element to assert on it", onClick: (event) => ctx.openMenu(event, [
      { kind: "label", label: "Assert that an element…" },
      { label: "is visible", icon: "eye", run: () => pickAssertion(ctx, "visible") },
      { label: "has its current text", icon: "type", run: () => pickAssertion(ctx, "text") },
      { label: "holds its current value", icon: "edit", run: () => pickAssertion(ctx, "value") },
      { label: "is checked / unchecked", icon: "check", run: () => pickAssertion(ctx, "checked") },
    ]) }),
    replaying
      ? button({ label: "Stop replay", icon: "stop", size: "sm", onClick: () => stopReplay(ctx) })
      : button({ label: "Replay", icon: "replay", size: "sm", testid: "rec-replay", disabled: steps.length === 0 || recording, tip: "Run the steps against the live app, one by one", onClick: () => void replayAll(ctx) }),
    steps.length > 0 ? iconButton({ icon: "trash", label: "Clear steps", size: "sm", danger: true, onClick: () => {
      const backup = [...steps];
      recorder.clear();
      ui.replayResults = [];
      ctx.toast("Steps cleared", "info", { action: { label: "Undo", run: () => { recorder.load(backup); ctx.refresh(); } } });
      ctx.refresh();
    } }) : null,
    recording ? h("span", { class: "ts-rec" }, h("span", { class: "ts-rec-dot" }), "REC") : null,
    spacer(),
    h("span", { class: "t3 num", style: { fontSize: "var(--dt-fs-sm)" } }, plural(steps.length, "step")));

  const list = steps.length === 0
    ? emptyState({
        icon: "record", title: "Record a flow, get a test",
        body: "Press Record and use the app. Clicks, typing, selects, checkboxes, keys and navigation become steps with the most robust query available (test id → role + name → label → text). Add assertions by pointing at the page, then replay or export.",
        actions: [button({ label: "Record", icon: "record", variant: "primary", disabled: !root, onClick: () => { recorder.start(renderRootElement(app), () => ctx.refresh()); ctx.refresh(); } })],
      })
    : h("ol", { class: "ts-steps", "data-dt": "rec-steps" }, ...steps.map((step, index) => {
        const result = ui.replayResults[index] ?? null;
        const active = ui.replaying === index;
        return h("li", { key: `${index}:${step.time}`, class: ["ts-step", active ? "is-active" : "", result ? (result.ok ? "is-ok" : "is-fail") : ""], "data-dt": "rec-step" },
          h("span", { class: "ts-step-n num" }, active ? spinner() : result ? icon(result.ok ? "check" : "close", { size: 12 }) : String(index + 1)),
          chip(step.type === "assert" ? `assert ${step.assertion ?? "visible"}` : step.type, stepTone(step)),
          h("span", { class: "ts-step-label ellipsis", title: step.label }, stepText(step)),
          step.query?.kind === "css" ? chip("brittle", "amber", { tip: "No test id, role, label or text — this step uses a CSS path. Add a data-testid for a stable test." }) : null,
          result && !result.ok ? h("span", { class: "ts-step-err ellipsis", title: result.message }, result.message) : null,
          h("span", { class: "ts-step-actions" },
            iconButton({ icon: "chevronUp", label: "Move up", size: "sm", disabled: index === 0, onClick: () => { recorder.move(index, index - 1); ctx.refresh(); } }),
            iconButton({ icon: "chevronDown", label: "Move down", size: "sm", disabled: index === steps.length - 1, onClick: () => { recorder.move(index, index + 1); ctx.refresh(); } }),
            iconButton({ icon: "close", label: "Remove step", size: "sm", onClick: () => { recorder.remove(index); ui.replayResults = []; ctx.refresh(); } })));
      }));

  const code = steps.length === 0 ? null : h("div", { class: "ts-code" },
    h("div", { class: "pane-head" },
      segmented([{ value: "aktion", label: "Aktion test" }, { value: "playwright", label: "Playwright" }], ui.testFormat, (value) => { ui.testFormat = value; ctx.persist(); ctx.refresh(); }, { label: "Test format", testid: "test-format" }),
      ui.testFormat === "aktion" ? toggleSwitch({ checked: ui.testIncludeState, label: "Assert changed state", onChange: (v) => { ui.testIncludeState = v; ctx.refresh(); } }) : null,
      spacer(),
      iconButton({ icon: "copy", label: "Copy the test", size: "sm", testid: "test-copy", onClick: () => ctx.copy(source, "the test") }),
      iconButton({ icon: "download", label: `Download ${fileName}`, size: "sm", onClick: () => downloadText(fileName, source, "text/typescript") })),
    h("div", { class: "ts-code-body" }, codeView({ lines: highlightLines(source), testid: "test-code", version: source })));

  const left = h("div", { class: "ts-left" }, bar, h("div", { class: "dt-scroll" }, list));
  if (!code) return left;
  return ctx.width() >= 820
    ? split({ size: paneSize(ctx, "test.record", Math.round(ctx.width() * 0.45)), min: 300, onResize: (s) => setPaneSize(ctx, "test.record", s), first: left, second: code })
    : split({ direction: "col", size: Math.round(ctx.height() * 0.45), min: 150, onResize: () => undefined, first: left, second: code });
}

/* -------------------------------------------------------------------------- */
/*  Scenarios                                                                  */
/* -------------------------------------------------------------------------- */

function ensureScenarios(ctx: ViewContext): void {
  const { app, ui } = ctx;
  if (!app || ui.scenariosFor === app.label) return;
  ui.scenariosFor = app.label;
  ui.scenarios = loadAppData<Scenario[]>(app.label, "scenarios", []);
}

function saveScenarios(ctx: ViewContext): void {
  if (ctx.app) saveAppData(ctx.app.label, "scenarios", ctx.ui.scenarios);
}

function captureScenario(ctx: ViewContext, name: string): Scenario | null {
  const { app, ui } = ctx;
  if (!app) return null;
  const skip = new Set(can(app, "getStateMeta") ? app.getStateMeta().filter((m) => m.reserved || m.computed).map((m) => m.name) : []);
  const state: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(app.getState())) {
    if (skip.has(key) || key.startsWith("__") || key === "route") continue;
    try {
      state[key] = JSON.parse(JSON.stringify(value)) as unknown;
    } catch {
      /* not serialisable — a scenario only carries data */
    }
  }
  return {
    id: `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `Scenario ${ui.scenarios.length + 1}`,
    createdAt: Date.now(),
    state,
    rules: ui.rules.filter((r) => !r.id.startsWith("__")).map((r) => ({ ...r })),
    route: can(app, "getRoute") ? app.getRoute().path : undefined,
  };
}

export function applyScenario(ctx: ViewContext, scenario: Scenario): void {
  const { app, ui } = ctx;
  if (!app) return;
  if (scenario.route && can(app, "navigate")) app.navigate(scenario.route);
  if (scenario.state && can(app, "hydrateState")) app.hydrateState(scenario.state);
  if (scenario.rules) {
    ui.rules = scenario.rules.map((rule) => ({ ...rule }));
    ctx.pushRules();
  }
  ctx.toast(`Scenario “${scenario.name}” applied`, "good");
  ctx.refresh();
}

function importScenarios(ctx: ViewContext): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as unknown;
        const list = (Array.isArray(parsed) ? parsed : (parsed as { scenarios?: unknown }).scenarios) as Scenario[] | undefined;
        if (!Array.isArray(list)) throw new Error("expected an array of scenarios");
        const valid = list.filter((s) => s && typeof s === "object" && typeof s.name === "string");
        ctx.ui.scenarios = [...ctx.ui.scenarios, ...valid.map((s) => ({ ...s, id: s.id ?? `sc-${Math.random().toString(36).slice(2, 8)}`, createdAt: s.createdAt ?? Date.now() }))];
        saveScenarios(ctx);
        ctx.toast(`Imported ${plural(valid.length, "scenario")}`, "good");
      } catch (error) {
        ctx.toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`, "bad");
      }
      ctx.refresh();
    });
  });
  input.click();
}

function scenariosPane(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  ensureScenarios(ctx);
  const save = (): void => {
    const scenario = captureScenario(ctx, ui.scenarioDraft);
    if (!scenario) return;
    ui.scenarios = [scenario, ...ui.scenarios];
    ui.scenarioDraft = "";
    saveScenarios(ctx);
    ctx.toast(`Saved “${scenario.name}”`, "good");
    ctx.refresh();
  };
  return h("div", { class: "dt-scroll" },
    h("div", { class: "ts-page" },
      card({
        title: "Save the current setup", icon: "scenario",
        sub: "State, network rules and route — one click to get back here",
        body: h("div", { class: "row-flex ts-save" },
          field({ value: ui.scenarioDraft, placeholder: "e.g. Empty cart, API down, Admin on /settings", label: "Scenario name", testid: "scenario-name", onInput: (v) => { ui.scenarioDraft = v; }, onCommit: save }),
          button({ label: "Save scenario", icon: "save", variant: "primary", size: "sm", testid: "scenario-save", disabled: !app, onClick: save })),
      }),
      ui.scenarios.length === 0
        ? emptyState({ icon: "scenario", title: "No scenarios yet", body: "Get the app into an interesting state — seeded data, a failing endpoint mocked in Network, a deep route — and save it. Scenarios persist per app in this browser and export as JSON for teammates." })
        : h("div", { class: "ts-scenarios", "data-dt": "scenarios" }, ...ui.scenarios.map((scenario) => {
            const atoms = Object.keys(scenario.state ?? {}).length;
            const rules = scenario.rules?.length ?? 0;
            return h("div", { key: scenario.id, class: "ts-scenario", "data-dt": "scenario" },
              h("div", { class: "ts-scenario-main" },
                h("div", { class: "ts-scenario-name" }, scenario.name),
                h("div", { class: "chips" },
                  scenario.route ? chip(scenario.route, "purple", { mono: true, icon: "routes" }) : null,
                  chip(plural(atoms, "atom"), "grey"),
                  rules > 0 ? chip(plural(rules, "network rule"), "amber", { icon: "network" }) : null,
                  h("span", { class: "t4", style: { fontSize: "var(--dt-fs-xs)" } }, fmtAgo(scenario.createdAt, Date.now())))),
              button({ label: "Apply", icon: "play", size: "sm", variant: "primary", testid: "scenario-apply", disabled: !app, onClick: () => applyScenario(ctx, scenario) }),
              iconButton({ icon: "more", label: "More", size: "sm", onClick: (event) => ctx.openMenu(event, [
                { label: "Update with current setup", icon: "refresh", run: () => { const next = captureScenario(ctx, scenario.name); if (next) { ui.scenarios = ui.scenarios.map((s) => (s.id === scenario.id ? { ...next, id: scenario.id } : s)); saveScenarios(ctx); ctx.toast("Scenario updated", "good"); ctx.refresh(); } } },
                { label: "Copy as JSON", icon: "copy", run: () => ctx.copy(JSON.stringify(scenario, null, 2), "the scenario") },
                { kind: "separator", label: "" },
                { label: "Delete", icon: "trash", danger: true, run: () => { ui.scenarios = ui.scenarios.filter((s) => s.id !== scenario.id); saveScenarios(ctx); ctx.toast(`Deleted “${scenario.name}”`, "info", { action: { label: "Undo", run: () => { ui.scenarios = [scenario, ...ui.scenarios]; saveScenarios(ctx); ctx.refresh(); } } }); ctx.refresh(); } },
              ]) }));
          })),
      h("div", { class: "row-flex" },
        spacer(),
        button({ label: "Import…", icon: "upload", size: "sm", variant: "ghost", onClick: () => importScenarios(ctx) }),
        ui.scenarios.length > 0 ? button({ label: "Export all", icon: "download", size: "sm", variant: "ghost", onClick: () => downloadText(`scenarios-${(app?.label ?? "app").replace(/[^\w.-]+/g, "_")}.json`, JSON.stringify({ format: "aktion-devtools-scenarios", version: 1, scenarios: ui.scenarios }, null, 2)) }) : null)));
}

/* -------------------------------------------------------------------------- */
/*  Coverage                                                                   */
/* -------------------------------------------------------------------------- */

function coverageMeter(label: string, metric: coverage.CoverageMetric): Child {
  const tone = metric.pct >= 80 ? "green" : metric.pct >= 50 ? "amber" : "red";
  return stat({
    label, value: `${Math.round(metric.pct)}%`, tone, foot: h("span", { class: "ts-cov-foot" }, meter(metric.pct / 100, tone === "green" ? "green" : tone === "amber" ? "amber" : "red"), `${metric.covered}/${metric.total}`),
  });
}

function coveragePane(ctx: ViewContext): Child {
  const { app } = ctx;
  const enabled = coverage.isEnabled();
  let report: coverage.CoverageReport | null = null;
  try {
    report = coverage.report();
  } catch {
    report = null;
  }
  const controls = h("div", { class: "ts-bar" },
    enabled
      ? button({ label: "Stop", icon: "stop", size: "sm", variant: "danger", onClick: () => { coverage.stop(); ctx.toast("Coverage stopped"); ctx.refresh(); } })
      : button({ label: "Start coverage", icon: "play", size: "sm", variant: "primary", testid: "coverage-start", onClick: () => {
          coverage.start();
          if (can(app, "reload")) app.reload();
          ctx.toast("Coverage on — the program was re-planned so its whole shape is measured", "good");
          ctx.refresh();
        } }),
    button({ label: "Reset", icon: "undo", size: "sm", onClick: () => { coverage.reset(); ctx.toast("Coverage reset"); ctx.refresh(); } }),
    enabled ? h("span", { class: "ts-rec is-green" }, h("span", { class: "ts-rec-dot" }), "measuring") : chip("off", "grey"),
    spacer(),
    report && report.files.length > 0 ? iconButton({ icon: "copy", label: "Copy summary", size: "sm", onClick: () => ctx.copy(coverage.formatSummary(report!), "the summary") }) : null,
    report && report.files.length > 0 ? button({ label: "LCOV", icon: "download", size: "sm", variant: "ghost", tip: "Download an lcov.info for your coverage tooling", onClick: () => downloadText("aktion.lcov", coverage.toLcov(report!), "text/plain") }) : null);
  if (!report || report.files.length === 0) {
    return h("div", { class: "ts-left" }, controls, h("div", { class: "dt-scroll" }, emptyState({
      icon: "target",
      title: enabled ? "Nothing measured yet" : "Measure which parts of the program run",
      body: enabled
        ? "Use the app — every line, function and branch the interpreter executes is counted."
        : ".aktion files compile to one JSON.parse of their AST, so V8 coverage sees a single executed line no matter how much DSL ran. This measures the program itself: lines, functions, and every branch arm.",
    })));
  }
  const files = report.files;
  const gaps = files.flatMap((file) => file.uncoveredLines.slice(0, 60).map((line) => ({ path: file.path, line })));
  const neverRun = files.flatMap((file) => file.functions.filter((f) => f.hits === 0).map((f) => ({ ...f, path: file.path })));
  const halfBranches = files.flatMap((file) => file.branches.filter((b) => b.arms.some((a) => a === 0) && b.arms.some((a) => a > 0)).map((b) => ({ ...b, path: file.path })));
  const columns: Column<coverage.FileCoverageReport>[] = [
    { key: "path", label: "File", flex: 2, render: (f) => h("span", { class: "mono ellipsis", title: f.path }, truncateMiddle(f.path, 48)) },
    { key: "lines", label: "Lines", width: 110, align: "right", sort: (f) => f.summary.lines.pct, render: (f) => pctCell(f.summary.lines) },
    { key: "functions", label: "Functions", width: 110, align: "right", sort: (f) => f.summary.functions.pct, render: (f) => pctCell(f.summary.functions) },
    { key: "branches", label: "Branches", width: 110, align: "right", sort: (f) => f.summary.branches.pct, render: (f) => pctCell(f.summary.branches) },
  ];
  return h("div", { class: "ts-left" }, controls,
    h("div", { class: "dt-scroll" },
      h("div", { class: "ts-page" },
        statGrid(
          coverageMeter("Lines", report.summary.lines),
          coverageMeter("Functions", report.summary.functions),
          coverageMeter("Branches", report.summary.branches),
          stat({ label: "Files", value: String(files.length) })),
        card({
          title: "Files", icon: "file", flush: true,
          body: h("div", { style: { height: `${Math.min(8, files.length) * ctx.rowHeight + 32}px`, display: "flex", flexDirection: "column" } },
            dataTable({ columns, rows: files, rowKey: (f) => f.path, rowHeight: ctx.rowHeight, ariaLabel: "Coverage by file" })),
        }),
        neverRun.length > 0 ? card({
          title: "Functions never called", icon: "zap", sub: plural(neverRun.length, "function"),
          body: h("div", { class: "chips" }, ...neverRun.slice(0, 40).map((f) => chip(`${f.name} · L${f.line}`, "amber", { mono: true, onClick: () => openSource(ctx, f.line), tip: "Open in Source" }))),
        }) : null,
        halfBranches.length > 0 ? card({
          title: "Branches with an untaken arm", icon: "split", sub: plural(halfBranches.length, "branch"),
          body: h("div", { class: "chips" }, ...halfBranches.slice(0, 40).map((b) => chip(`${b.kind} · L${b.line} · ${b.arms.map((a) => (a > 0 ? "✓" : "✗")).join("")}`, "amber", { mono: true, onClick: () => openSource(ctx, b.line), tip: "Arms taken ✓ / never taken ✗ — open in Source" }))),
        }) : null,
        gaps.length > 0 ? card({
          title: "Lines never executed", icon: "code", sub: plural(gaps.length, "line"),
          body: h("div", { class: "chips" }, ...gaps.slice(0, 80).map((g) => chip(`L${g.line}`, "grey", { mono: true, onClick: () => openSource(ctx, g.line), tip: `${g.path} — open in Source` }))),
        }) : null)));
}

function pctCell(metric: coverage.CoverageMetric): Child {
  const tone = metric.pct >= 80 ? "tone-green" : metric.pct >= 50 ? "tone-amber" : "tone-red";
  return h("span", { class: "num" }, h("span", { class: tone }, `${Math.round(metric.pct)}%`), h("span", { class: "t4" }, ` ${metric.covered}/${metric.total}`));
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                    */
/* -------------------------------------------------------------------------- */

const PROBE_KINDS: ReadonlyArray<{ value: UiState["queryProbeKind"]; label: string; placeholder: string }> = [
  { value: "role", label: "Role", placeholder: "button" },
  { value: "label", label: "Label", placeholder: "Email" },
  { value: "text", label: "Text", placeholder: "Save" },
  { value: "testid", label: "Test id", placeholder: "submit-order" },
  { value: "css", label: "CSS", placeholder: ".rui-card > button" },
];

function probeQuery(ui: UiState): QueryStrategy | null {
  const value = ui.queryProbe.trim();
  if (!value) return null;
  return { kind: ui.queryProbeKind, value, name: ui.queryProbeKind === "role" && ui.queryProbeName.trim() ? ui.queryProbeName.trim() : undefined };
}

function queriesPane(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  const root = queryRoot(ctx);
  const query = probeQuery(ui);
  const matches = query ? resolveQuery(root, query) : [];
  const kind = PROBE_KINDS.find((k) => k.value === ui.queryProbeKind) ?? PROBE_KINDS[0]!;
  const suggest = (): void => {
    ctx.overlay.startPicking({
      onPick: (element) => {
        const best = chooseQuery(element, root);
        ui.queryProbeKind = best.kind === "placeholder" ? "label" : best.kind;
        ui.queryProbe = best.value;
        ui.queryProbeName = best.name ?? "";
        if (best.kind === "placeholder") { ui.queryProbeKind = "css"; ui.queryProbe = `[placeholder="${best.value}"]`; }
        ctx.toast(`Suggested: ${queryLabel(best)}`, "good");
        ctx.refresh();
      },
      onCancel: () => ctx.refresh(),
      labelFor: (element) => ({ component: queryLabel(chooseQuery(element, root)), kind: "best query" }),
    });
  };
  const verdict = !query ? null : matches.length === 0
    ? note("warn", ["Nothing matches. ", h("code", {}, "getBy*"), " throws here and ", h("code", {}, "queryBy*"), " returns null."], { testid: "query-verdict" })
    : matches.length > 1
      ? note("warn", [`${matches.length} elements match — `, h("code", {}, "getBy*"), " throws on multiple matches. Narrow it (role + name) or use ", h("code", {}, "getAllBy*"), "."], { testid: "query-verdict" })
      : note("good", "Exactly one match — safe to use in a test.", { testid: "query-verdict" });
  return h("div", { class: "ts-left" },
    h("div", { class: "ts-bar is-wrap" },
      segmented(PROBE_KINDS.map((k) => ({ value: k.value, label: k.label })), ui.queryProbeKind, (value) => { ui.queryProbeKind = value; ctx.refresh(); }, { label: "Query type", testid: "query-kind" }),
      field({ value: ui.queryProbe, placeholder: kind.placeholder, mono: true, width: "180px", label: "Query", testid: "query-input", onInput: (v) => { ui.queryProbe = v; ctx.refresh(); } }),
      ui.queryProbeKind === "role" ? field({ value: ui.queryProbeName, placeholder: "accessible name (optional)", width: "190px", label: "Accessible name", onInput: (v) => { ui.queryProbeName = v; ctx.refresh(); } }) : null,
      button({ label: "Pick to suggest", icon: "pick", size: "sm", disabled: !root, tip: "Point at an element — get the most robust query for it", onClick: suggest }),
      spacer(),
      query ? h("span", { class: "t3 num" }, plural(matches.length, "match", "matches")) : null),
    h("div", { class: "dt-scroll" },
      h("div", { class: "ts-page" },
        !root ? unsupported("its render root") : null,
        !query ? emptyState({ icon: "search", title: "Find elements the way a test does", body: "Role queries match implicit roles (a <button> is a button) and exact accessible names — the same rules Testing Library and Playwright use, so what you find here is what your test will find." }) : null,
        verdict,
        query ? h("div", { class: "ts-code-snippets" },
          h("div", { class: "ts-snippet" }, h("span", { class: "t3" }, "Aktion test"), h("code", {}, queryExpression(query)), iconButton({ icon: "copy", size: "sm", label: "Copy", onClick: () => ctx.copy(queryExpression(query), "the query") })),
          h("div", { class: "ts-snippet" }, h("span", { class: "t3" }, "Playwright"), h("code", {}, playwrightLocator(query)), iconButton({ icon: "copy", size: "sm", label: "Copy", onClick: () => ctx.copy(playwrightLocator(query), "the locator") }))) : null,
        matches.length > 0 ? h("div", { class: "ts-matches", "data-dt": "query-matches" }, ...matches.slice(0, 50).map((element, i) => h("div", {
          key: i, class: "ts-match",
          onMouseEnter: () => ctx.highlightElement(element, { component: `match ${i + 1}` }),
          onMouseLeave: () => ctx.highlightElement(null),
          onClick: () => {
            ctx.highlightElement(element, { component: `match ${i + 1}` }, true);
            const key = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
            if (key) ctx.selectInstance(key, { reveal: true });
          },
        },
          h("span", { class: "ts-match-n num" }, String(i + 1)),
          h("code", { class: "tone-cyan" }, element.tagName.toLowerCase()),
          (() => {
            const role = element.getAttribute("role") ?? implicitRole(element);
            return role === element.tagName.toLowerCase() ? null : chip(role ?? "no role", role ? "grey" : "amber");
          })(),
          h("span", { class: "ellipsis" }, accessibleName(element) || h("span", { class: "t4" }, "(no accessible name)"))))) : null)));
}

/* -------------------------------------------------------------------------- */
/*  Chaos                                                                      */
/* -------------------------------------------------------------------------- */

const DESTRUCTIVE = /delete|remove|trash|discard|archive|clear|reset|sign\s*out|log\s*out|logout|revoke|destroy|drop|erase|purge|unsubscribe|cancel (account|subscription)/i;
const TARGETS = "button, a[href], [role=\"button\"], [role=\"tab\"], [role=\"menuitem\"], [role=\"switch\"], [role=\"checkbox\"], input[type=\"checkbox\"], input[type=\"radio\"], summary, select";
const TEXT_FIELDS = "input:not([type]), input[type=\"text\"], input[type=\"search\"], input[type=\"email\"], input[type=\"number\"], input[type=\"url\"], input[type=\"tel\"], input[type=\"password\"], textarea";

/** Edge-case inputs that break real apps: empty, huge, unicode, markup, injection, numbers. */
export const FUZZ_STRINGS: ReadonlyArray<string> = [
  "", " ", "0", "-1", "1e309", "NaN", "null", "undefined", "3.14159",
  "999999999999999999999", "'", "\"", "\\", "${1+1}", "{{7*7}}",
  "<b>bold</b>", "<img src=x onerror=alert(1)>", "\"><svg onload=alert(1)>", "javascript:alert(1)",
  "Robert'); DROP TABLE users;--", "😀👍🏽🇩🇪", "مرحبا بالعالم", "Ｆｕｌｌｗｉｄｔｈ", "​‍", "a".repeat(500),
  "   padded   ", "line one\nline two", "user@example.com", "https://example.com/?a=1&b=2",
];

/** Small, fast, seedable PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(element) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

/**
 * Guard the page while chaos runs: links that would leave the document, form
 * submissions nobody handled, new windows and blocking dialogs are all
 * neutralised — the run exercises the app, not the browser.
 */
function guardPage(onBlocked: (what: string) => void): () => void {
  const win = window as unknown as { open: typeof window.open; alert: typeof window.alert; confirm: typeof window.confirm; prompt: typeof window.prompt };
  const saved = { open: win.open, alert: win.alert, confirm: win.confirm, prompt: win.prompt };
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented) return;
    const anchor = event.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#") && anchor.target !== "_blank") return;
    event.preventDefault();
    onBlocked(`link → ${href}`);
  };
  const onSubmit = (event: Event): void => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    onBlocked("unhandled form submit");
  };
  window.addEventListener("click", onClick);
  window.addEventListener("submit", onSubmit);
  win.open = ((url?: string | URL) => { onBlocked(`window.open(${String(url ?? "")})`); return null; }) as typeof window.open;
  win.alert = () => { onBlocked("alert()"); };
  win.confirm = () => { onBlocked("confirm() → declined"); return false; };
  win.prompt = () => { onBlocked("prompt() → cancelled"); return null; };
  return () => {
    window.removeEventListener("click", onClick);
    window.removeEventListener("submit", onSubmit);
    win.open = saved.open;
    win.alert = saved.alert;
    win.confirm = saved.confirm;
    win.prompt = saved.prompt;
  };
}

let chaosToken = 0;

async function runChaos(ctx: ViewContext, seedInput?: number): Promise<void> {
  const { ui, model } = ctx;
  const root = queryRoot(ctx);
  if (!root || ui.fuzzRunning) return;
  const token = (chaosToken += 1);
  const seed = seedInput ?? ((Math.random() * 2 ** 31) >>> 0);
  const rand = seededRandom(seed);
  ui.fuzzRunning = true;
  ui.chaosSeed = String(seed);
  ctx.refresh();
  const startErrors = model.errors.length;
  const startLogs = model.logs.filter((e) => e.level === "error").length;
  const beforeCounts = new Map(model.changeCounts);
  const blocked: string[] = [];
  const restore = guardPage((what) => { if (blocked.length < 50) blocked.push(what); });
  const trail: string[] = [];
  const steps: RecordedStep[] = [];
  const started = performance.now();
  let performed = 0;
  try {
    for (let i = 0; i < ui.chaosClicks; i += 1) {
      if (token !== chaosToken) break;
      let candidates: HTMLElement[] = [];
      let fields: Array<HTMLInputElement | HTMLTextAreaElement> = [];
      try {
        candidates = [...root.querySelectorAll<HTMLElement>(TARGETS)].filter((el) => !(el as HTMLButtonElement).disabled && !DESTRUCTIVE.test(accessibleName(el)) && el.isConnected);
        if (ui.chaosTyping) fields = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXT_FIELDS)].filter((el) => !el.disabled && !el.readOnly);
      } catch {
        break;
      }
      const typing = fields.length > 0 && rand() < 0.3;
      if (!typing && candidates.length === 0) break;
      try {
        if (typing) {
          const target = fields[Math.floor(rand() * fields.length)]!;
          const value = FUZZ_STRINGS[Math.floor(rand() * FUZZ_STRINGS.length)]!;
          const query = chooseQuery(target, root);
          target.focus();
          setFieldValue(target, value);
          trail.push(`type ${JSON.stringify(value.length > 30 ? `${value.slice(0, 27)}…` : value)} into ${queryLabel(query)}`);
          steps.push({ type: "type", query, value, time: Date.now(), label: `type ${JSON.stringify(value.slice(0, 40))} into ${queryLabel(query)}` });
        } else {
          const target = candidates[Math.floor(rand() * candidates.length)]!;
          const query = chooseQuery(target, root);
          if (target instanceof HTMLSelectElement) {
            const options = [...target.options].filter((o) => !o.disabled);
            const option = options[Math.floor(rand() * options.length)];
            if (option) {
              target.value = option.value;
              target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
              target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
              trail.push(`select ${JSON.stringify(option.value)} in ${queryLabel(query)}`);
              steps.push({ type: "select", query, value: option.value, time: Date.now(), label: `select ${JSON.stringify(option.value)} in ${queryLabel(query)}` });
            }
          } else {
            target.click();
            trail.push(`click ${queryLabel(query)}`);
            steps.push({ type: "click", query, time: Date.now(), label: `click ${queryLabel(query)}` });
          }
        }
        performed += 1;
      } catch {
        /* a throwing handler is exactly what we are looking for — the error tap records it */
      }
      if (i % 5 === 4) ctx.refresh();
      // Yield so the app renders between actions — one synchronous burst would
      // exercise one render, not `clicks` of them.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    restore();
  }
  const errors = [
    ...model.errors.slice(startErrors).map((e) => `${e.phase}: ${e.message}`),
    ...model.logs.filter((e) => e.level === "error").slice(startLogs).map((e) => e.text),
  ];
  let injected = false;
  try {
    injected = root.querySelector("[onerror], [onload], script, svg[onload]") !== null;
  } catch {
    injected = false;
  }
  if (injected) errors.push("security: a fuzz payload was rendered as live markup (an element with an inline handler or a <script> appeared) — check the Security view");
  const atoms = [...model.changeCounts.entries()].filter(([name, count]) => (beforeCounts.get(name) ?? 0) !== count).map(([name]) => name);
  ui.fuzzRun = { clicks: performed, errors: [...new Set(errors)], atoms, durationMs: performance.now() - started, at: Date.now(), trail, steps, seed, blocked };
  ui.fuzzRunning = false;
  ctx.toast(errors.length === 0 ? `${performed} actions, no errors` : `${plural(new Set(errors).size, "problem")} found in ${performed} actions`, errors.length === 0 ? "good" : "bad");
  ctx.refresh();
}

function chaosPane(ctx: ViewContext): Child {
  const { ui, recorder } = ctx;
  const root = queryRoot(ctx);
  const run = ui.fuzzRun;
  const blocked = run?.blocked ?? [];
  const controls = h("div", { class: "ts-bar is-wrap" },
    ui.fuzzRunning
      ? button({ label: "Stop", icon: "stop", size: "sm", variant: "danger", onClick: () => { chaosToken += 1; ui.fuzzRunning = false; ctx.refresh(); } })
      : button({ label: "Unleash chaos", icon: "dice", size: "sm", variant: "primary", testid: "chaos-run", disabled: !root, onClick: () => void runChaos(ctx) }),
    select({
      value: String(ui.chaosClicks), label: "Actions per run", width: "110px",
      options: [{ value: "50", label: "50 actions" }, { value: "100", label: "100 actions" }, { value: "250", label: "250 actions" }, { value: "500", label: "500 actions" }],
      onChange: (v) => { ui.chaosClicks = Number(v); ctx.refresh(); },
    }),
    toggleSwitch({ checked: ui.chaosTyping, label: "Fuzz text inputs", onChange: (v) => { ui.chaosTyping = v; ctx.refresh(); } }),
    ui.fuzzRunning ? h("span", { class: "row-flex t3" }, spinner(), `running · seed ${ui.chaosSeed}`) : null,
    spacer(),
    h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, "Destructive controls (delete, clear, sign out…) are skipped; links, popups and dialogs are blocked."));
  if (!run) {
    return h("div", { class: "ts-left" }, controls, h("div", { class: "dt-scroll" }, emptyState({
      icon: "dice", title: "Monkey-test the UI",
      body: "Random clicks, selects and edge-case text (empty, 500 chars, emoji, RTL, markup, injection strings) with a render between each action. Every runtime and console error is reported, and every run is seeded — re-run it, or open it as a recording to replay and export as a test. Controls named like delete, remove, trash or sign out are never clicked.",
    })));
  }
  return h("div", { class: "ts-left" }, controls,
    h("div", { class: "dt-scroll" },
      h("div", { class: "ts-page" },
        statGrid(
          stat({ label: "Actions", value: fmtCount(run.clicks) }),
          stat({ label: "Problems", value: String(run.errors.length), tone: run.errors.length > 0 ? "red" : "green" }),
          stat({ label: "Duration", value: fmtMs(run.durationMs) }),
          stat({ label: "Atoms touched", value: String(run.atoms.length) }),
          stat({ label: "Seed", value: h("span", { class: "mono" }, String(run.seed ?? "—")), tip: "Re-running with the same seed repeats the same sequence" })),
        h("div", { class: "row-flex" },
          run.seed !== undefined ? button({ label: "Re-run this seed", icon: "replay", size: "sm", disabled: ui.fuzzRunning, onClick: () => void runChaos(ctx, run.seed) }) : null,
          run.steps && run.steps.length > 0 ? button({ label: "Open as recording", icon: "record", size: "sm", tip: "Load these actions into the recorder to replay, trim and export as a test", onClick: () => { recorder.load(run.steps!); ui.replayResults = []; ui.testPane = "record"; ctx.toast(`Loaded ${plural(run.steps!.length, "step")} into the recorder`, "good"); ctx.refresh(); } }) : null,
          spacer()),
        run.errors.length > 0
          ? card({ title: "Problems", icon: "error", testid: "chaos-errors", body: h("div", { class: "stack" }, ...run.errors.slice(0, 30).map((error) => note("error", h("span", { class: "mono" }, error)))) })
          : note("good", "No runtime or console errors surfaced during the run."),
        blocked.length > 0 ? card({ title: "Blocked side effects", icon: "lock", sub: "Neutralised so the run stays on the page", body: h("div", { class: "chips" }, ...[...new Set(blocked)].slice(0, 30).map((b) => chip(b, "grey", { mono: true }))) }) : null,
        card({
          title: "Trail", icon: "list", sub: `last ${Math.min(run.trail.length, 200)} actions`, flush: true,
          body: h("ol", { class: "ts-trail" }, ...run.trail.slice(-200).map((entry, i) => h("li", { key: i }, entry))),
        }))));
}

/* -------------------------------------------------------------------------- */
/*  Emulate                                                                    */
/* -------------------------------------------------------------------------- */

function emulatePane(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  const theme = can(app, "getTheme") ? app.getTheme() : null;
  const option = (title: string, iconName: IconName, description: string, control: Child): Child => h("div", { class: "ts-emu" },
    h("div", { class: "ts-emu-icon" }, icon(iconName, { size: 16 })),
    h("div", { class: "ts-emu-text" }, h("div", { class: "ts-emu-title" }, title), h("div", { class: "ts-emu-desc" }, description)),
    h("div", { class: "ts-emu-control" }, control));
  return h("div", { class: "dt-scroll" },
    h("div", { class: "ts-page is-narrow" },
      option("Network", "network", "Throttle or break every request the app makes. Mocks you set in Network still win.",
        segmented([
          { value: "none", label: "Online" }, { value: "fast3g", label: "Fast 3G" }, { value: "slow3g", label: "Slow 3G" },
          { value: "flaky", label: "Flaky" }, { value: "offline", label: "Offline" },
        ], ui.throttle, (value) => { ui.throttle = value; ctx.pushRules(); ctx.toast(value === "none" ? "Network back to normal" : `Network: ${value}`, value === "none" ? "good" : "warn"); ctx.refresh(); }, { label: "Network condition", testid: "emulate-network" })),
      option("Layout direction", "split", "Right-to-left exposes hard-coded left/right margins and icons that should mirror.",
        segmented([{ value: "auto", label: "Auto" }, { value: "ltr", label: "LTR" }, { value: "rtl", label: "RTL" }], ui.emulateDir, (value) => { ui.emulateDir = value; ctx.refresh(); }, { label: "Direction", testid: "emulate-dir" })),
      option("Text size", "type", "Scales the theme's font-size tokens. Check that nothing clips at 200%.",
        segmented([{ value: "1", label: "100%" }, { value: "1.25", label: "125%" }, { value: "1.5", label: "150%" }, { value: "2", label: "200%" }], String(ui.emulateTextScale), (value) => { ui.emulateTextScale = Number(value); ctx.refresh(); }, { label: "Text scale" })),
      theme && theme.available.length > 0 && can(app, "setThemeName")
        ? option("Theme", "theme", `Currently “${theme.name}”. Switch to check both palettes hold up.`,
            select({ value: theme.available.includes(theme.name) ? theme.name : theme.available[0]!, label: "Theme", options: theme.available.map((name) => ({ value: name, label: name })), onChange: (name) => { app.setThemeName(name); ctx.toast(`Theme: ${name}`); ctx.refresh(); } }))
        : null,
      option("Test ids", "tag", "Badge every element that carries data-testid, so you can see what tests can hold on to.",
        toggleSwitch({ checked: ui.showTestIds, testid: "emulate-testids", onChange: (v) => { ui.showTestIds = v; ctx.refresh(); } })),
      option("Vision", "vision", "Colour-blindness and low-vision simulations live in Accessibility → Vision.",
        button({ label: "Open", size: "sm", variant: "ghost", icon: "arrowRight", onClick: () => { ui.a11yPane = "vision"; ctx.selectTab("a11y"); } }))));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "Testing", "test");
  const steps = ctx.recordedSteps().length;
  let body: Child;
  switch (ui.testPane) {
    case "scenarios": body = scenariosPane(ctx); break;
    case "coverage": body = coveragePane(ctx); break;
    case "queries": body = queriesPane(ctx); break;
    case "chaos": body = chaosPane(ctx); break;
    case "emulate": body = emulatePane(ctx); break;
    default: body = recordPane(ctx);
  }
  ensureScenarios(ctx);
  const emulating = ui.throttle !== "none" || ui.emulateDir !== "auto" || ui.emulateTextScale !== 1 || ui.showTestIds;
  return h("div", { class: "ts", "data-dt": "testing" },
    viewbar(
      segmented([
        { value: "record", label: "Record", icon: "record", count: steps || null },
        { value: "scenarios", label: "Scenarios", icon: "scenario", count: ui.scenarios.length || null },
        { value: "coverage", label: "Coverage", icon: "target", count: coverage.isEnabled() ? "on" : null },
        { value: "queries", label: "Queries", icon: "search" },
        { value: "chaos", label: "Chaos", icon: "dice", count: ui.fuzzRun && ui.fuzzRun.errors.length > 0 ? ui.fuzzRun.errors.length : null },
        { value: "emulate", label: "Emulate", icon: "wand", count: emulating ? "on" : null },
      ], ui.testPane, (value) => { ui.testPane = value; ctx.refresh(); }, { label: "Testing tool", testid: "test-panes" }),
      spacer(),
      ctx.recorder.isRecording ? h("span", { class: "ts-rec" }, h("span", { class: "ts-rec-dot" }), "Recording") : null,
      ui.throttle !== "none" ? chip(ui.throttle, "amber", { icon: "network", tip: "Network emulation is on — click to go back online", onClick: () => { ui.throttle = "none"; ctx.pushRules(); ctx.refresh(); } }) : null),
    body);
}

export const testingView: ViewDefinition = {
  id: "test",
  label: "Testing",
  icon: "test",
  group: "quality",
  hint: "Record & replay tests, scenarios, coverage, queries, chaos, emulation",
  keywords: "test record replay playwright vitest assertions scenario coverage lcov query getByRole chaos fuzz monkey throttle offline rtl",
  badge: (ctx) => {
    if (ctx.recorder.isRecording) return { value: "REC", tone: "red" };
    const errors = ctx.ui.fuzzRun?.errors.length ?? 0;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render,
  commands: (ctx) => { ensureScenarios(ctx); return [
    { id: "test:record", label: ctx.recorder.isRecording ? "Stop recording" : "Start recording a test", icon: "record", keywords: "record test", run: () => {
      if (ctx.recorder.isRecording) { ctx.recorder.stop(); ctx.refresh(); return; }
      ctx.recorder.start(renderRootElement(ctx.app), () => ctx.refresh());
      ctx.ui.testPane = "record";
      ctx.selectTab("test");
    } },
    { id: "test:chaos", label: "Run a chaos (monkey) test", icon: "dice", run: () => { ctx.ui.testPane = "chaos"; ctx.selectTab("test"); void runChaos(ctx); } },
    { id: "test:offline", label: ctx.ui.throttle === "offline" ? "Go back online" : "Emulate offline", icon: "offline", run: () => { ctx.ui.throttle = ctx.ui.throttle === "offline" ? "none" : "offline"; ctx.pushRules(); ctx.refresh(); } },
    { id: "test:slow3g", label: "Emulate slow 3G", icon: "network", run: () => { ctx.ui.throttle = "slow3g"; ctx.pushRules(); ctx.refresh(); } },
    { id: "test:rtl", label: ctx.ui.emulateDir === "rtl" ? "Back to left-to-right" : "Emulate right-to-left", icon: "split", run: () => { ctx.ui.emulateDir = ctx.ui.emulateDir === "rtl" ? "auto" : "rtl"; ctx.refresh(); } },
    { id: "test:testids", label: `${ctx.ui.showTestIds ? "Hide" : "Show"} test ids on the page`, icon: "tag", run: () => { ctx.ui.showTestIds = !ctx.ui.showTestIds; ctx.refresh(); } },
    ...ctx.ui.scenarios.slice(0, 20).map((scenario) => ({ id: `scenario:${scenario.id}`, label: `Apply scenario: ${scenario.name}`, icon: "scenario" as const, run: () => applyScenario(ctx, scenario) })),
  ]; },
  css: /* css */ `
.ts { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ts-left { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.ts-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--dt-border); min-height: 42px; }
.ts-bar.is-wrap { flex-wrap: wrap; }
.ts-rec { display: inline-flex; align-items: center; gap: 6px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; color: var(--dt-red); text-transform: uppercase; }
.ts-rec.is-green { color: var(--dt-green); }
.ts-rec-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 25%, transparent); animation: dt-pulse 1.3s ease-in-out infinite; }
@keyframes dt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.ts-steps { list-style: none; margin: 0; padding: 6px 0; counter-reset: step; }
.ts-step { display: flex; align-items: center; gap: 8px; padding: 5px 12px; min-height: 34px; font-size: var(--dt-fs-sm); border-left: 2px solid transparent; }
.ts-step:hover { background: var(--dt-bg-hover); }
.ts-step.is-active { background: var(--dt-accent-soft); border-left-color: var(--dt-accent); }
.ts-step.is-ok .ts-step-n { background: var(--dt-green); color: #fff; }
.ts-step.is-fail { background: var(--dt-red-soft); border-left-color: var(--dt-red); }
.ts-step.is-fail .ts-step-n { background: var(--dt-red); color: #fff; }
.ts-step-n { flex: none; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: var(--dt-bg-active); color: var(--dt-text-2); }
.ts-step-n .spinner { width: 12px; height: 12px; }
.ts-step-label { flex: 1 1 auto; min-width: 0; color: var(--dt-text); }
.ts-step-err { flex: 0 1 40%; color: var(--dt-red); font-size: var(--dt-fs-xs); }
.ts-step-actions { display: inline-flex; gap: 2px; opacity: 0; transition: opacity 120ms; }
.ts-step:hover .ts-step-actions, .ts-step:focus-within .ts-step-actions { opacity: 1; }
.ts-code { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ts-code-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--dt-bg-0); }
.ts-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.ts-page.is-narrow { max-width: 860px; }
.ts-save > .input { flex: 1 1 auto; }
.ts-scenarios { display: flex; flex-direction: column; gap: 8px; }
.ts-scenario { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); }
.ts-scenario:hover { border-color: var(--dt-border-strong); }
.ts-scenario-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ts-scenario-name { font-weight: 650; font-size: var(--dt-fs-md); }
.ts-cov-foot { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.ts-cov-foot .meter { width: 64px; }
.ts-code-snippets { display: flex; flex-direction: column; gap: 6px; }
.ts-snippet { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: var(--dt-r-sm); background: var(--dt-bg-2); font-size: var(--dt-fs-sm); }
.ts-snippet > .t3 { width: 84px; flex: none; font-size: var(--dt-fs-xs); }
.ts-snippet > code { flex: 1 1 auto; overflow-wrap: anywhere; }
.ts-matches { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r-md); overflow: hidden; }
.ts-match { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: var(--dt-fs-sm); cursor: pointer; border-bottom: 1px solid var(--dt-border); }
.ts-match:last-child { border-bottom: 0; }
.ts-match:hover { background: var(--dt-bg-hover); }
.ts-match-n { width: 20px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.ts-trail { margin: 0; padding: 8px 12px 8px 40px; max-height: 280px; overflow: auto; font: var(--dt-fs-xs)/1.7 var(--dt-mono); color: var(--dt-text-2); }
.ts-emu { display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); }
.ts-emu-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.ts-emu-title { font-weight: 650; font-size: var(--dt-fs-md); }
.ts-emu-desc { font-size: var(--dt-fs-sm); color: var(--dt-text-3); margin-top: 2px; }
@media (max-width: 640px) { .ts-emu { grid-template-columns: 34px 1fr; } .ts-emu-control { grid-column: 1 / -1; } }
`,
};
