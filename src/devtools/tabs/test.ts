/**
 * Test tab — five tools that turn "it broke" into something you can commit.
 *
 *   - **Record** — click through the bug, get a runnable
 *     `aktion-runtime/test` test that reproduces it, with the program inlined
 *     and the final state asserted.
 *   - **A11y** — audit the rendered tree: names, labels, contrast, focus order,
 *     ARIA wiring. Every finding highlights its element and names the fix.
 *   - **Coverage** — DSL coverage. `.aktion` files compile to a `JSON.parse` of
 *     their AST, so V8 sees one executed line however much DSL is behind it;
 *     real coverage has to come from the interpreter, and this is the switch.
 *   - **Queries** — a Testing Library query playground. Type a role or a label,
 *     see what matches, highlighted in the page. This is how you find out that
 *     `getByRole("button", { name: "Save" })` matches three things.
 *   - **Chaos** — click random controls a few hundred times and report what
 *     threw. A cheap fuzz pass over a generated UI finds real crashes.
 */

import {
  button, chip, chipGroup, code, copyButton, downloadText, faint, fmtCount,
  fmtMs, fmtPct, h, muted, searchInput, section, spacer, stat, statGrid, table,
  toolbar, truncateMiddle,
} from "../ui.js";
import { can, renderRootElement, type TabContext, type TabDefinition } from "../context.js";
import { auditAccessibility, groupFindings, type A11yFinding } from "../a11y.js";
import { generateSnapshotTest, generateTest, queryLabel } from "../recorder.js";
import { accessibleName, implicitRole } from "../overlay.js";
import * as coverage from "../../runtime/coverage.js";

export const testTab: TabDefinition = {
  id: "test",
  label: "Test",
  icon: "✓",
  hint: "Record interactions as tests, audit accessibility, measure DSL coverage, fuzz the UI",
  badge: (ctx) => {
    const steps = ctx.recordedSteps().length;
    if (steps > 0) return steps;
    const findings = ctx.ui.a11yRun?.findings.length ?? 0;
    return findings > 0 ? findings : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { ui } = ctx;
  const bar = toolbar(
    chipGroup(
      [
        { value: "record" as const, label: "Record", title: "Record interactions and generate a test" },
        { value: "a11y" as const, label: "A11y", title: "Audit the rendered tree for accessibility problems" },
        { value: "coverage" as const, label: "Coverage", title: "DSL coverage for the running program" },
        { value: "queries" as const, label: "Queries", title: "Try Testing Library queries against the live app" },
        { value: "chaos" as const, label: "Chaos", title: "Click random controls and report what breaks" },
      ],
      ui.testPane,
      (value) => {
        ui.testPane = value;
        ctx.refresh();
      },
    ),
    spacer(),
  );

  switch (ui.testPane) {
    case "record": return [bar, ...renderRecorder(ctx)];
    case "a11y": return [bar, ...renderA11y(ctx)];
    case "coverage": return [bar, ...renderCoverage(ctx)];
    case "queries": return [bar, ...renderQueries(ctx)];
    case "chaos": return [bar, ...renderChaos(ctx)];
  }
}

/* -------------------------------------------------------------------------- */
/*  Recorder                                                                   */
/* -------------------------------------------------------------------------- */

function renderRecorder(ctx: TabContext): Node[] {
  const { app, recorder, ui } = ctx;
  const steps = recorder.list();
  const root = renderRootElement(app);

  const controls = section(null, h("div", { class: "detail-head" },
    recorder.isRecording
      ? button("■ Stop", () => {
          recorder.stop();
          ctx.toast(`Recorded ${recorder.list().length} step(s)`);
          ctx.refresh();
        }, { tone: "warn", title: "Stop capturing" })
      : button("● Record", () => {
          const started = recorder.start(root, () => ctx.refresh());
          ctx.toast(started ? "Recording — interact with the app" : "Could not attach to the app", started ? "good" : "bad");
          ctx.refresh();
        }, { tone: "good", title: "Capture clicks, typing, and navigation", disabled: root === null }),
    steps.length > 0
      ? button("Clear", () => {
          recorder.clear();
          ui.generatedTest = null;
          ctx.refresh();
        })
      : null,
    spacer(),
    recorder.isRecording ? chip("recording", "red") : null,
    muted(`${steps.length} step${steps.length === 1 ? "" : "s"}`),
  ), { flush: true });

  const list = steps.length > 0
    ? section("Steps", h("div", { class: "step-list" }, ...steps.map((step, index) =>
        h("div", { class: "step-row" },
          h("span", { class: "step-index" }, String(index + 1)),
          chip(step.type, step.type === "navigate" ? "purple" : "blue"),
          h("span", { class: "step-label" }, step.label),
          spacer(),
          step.query
            ? h("span", { class: "step-query", title: `Query strategy: ${step.query.kind}` },
                step.query.kind === "css" ? chip("brittle", "amber", "No test id, role, label, or text to match on") : chip(step.query.kind, "grey"),
                faint(queryLabel(step.query)))
            : null,
          button("✕", () => {
            recorder.remove(index);
            ctx.refresh();
          }, { title: "Drop this step" })))))
    : section(null, faint(
        "Press Record, then use the app. Clicks, typing, selects, Enter/Escape, and navigations are captured; typing is coalesced into one step per field.",
      ), { flush: true });

  const generated = ui.generatedTest
    ? section("Generated test", [
        h("pre", { class: "code-pre" }, ui.generatedTest),
        h("div", { class: "detail-head" },
          spacer(),
          copyButton(() => ui.generatedTest ?? "", "Copy"),
          button("Download", () => downloadText("recorded.test.ts", ui.generatedTest ?? "", "text/plain")),
          button("Close", () => {
            ui.generatedTest = null;
            ctx.refresh();
          })),
      ])
    : null;

  const actions = section(null, h("div", { class: "detail-head" },
    button("Generate test", () => {
      if (!app) return;
      ui.generatedTest = generateTest(steps, {
        program: app.getProgram(),
        title: "reproduces the recorded interaction",
        assertions: assertableState(ctx),
      });
      ctx.refresh();
    }, { title: "Emit a runnable test for the recorded steps", disabled: steps.length === 0 }),
    button("Snapshot test", () => {
      if (!app) return;
      ui.generatedTest = generateSnapshotTest(app.getProgram(), ctx.model.state, {
        title: "renders the recorded snapshot",
      });
      ctx.refresh();
    }, { title: "Emit a test asserting the current state and rendered HTML" }),
    spacer(),
    faint("Queries follow Testing Library priority: test id, role + name, label, placeholder, text."),
  ), { flush: true });

  return [controls, list, actions, generated].filter((node): node is HTMLElement => node != null);
}

/**
 * Pick the atoms worth asserting.
 *
 * Everything is too much (a 40-atom app produces an unreadable test) and
 * nothing is useless. The atoms that CHANGED during the session are the ones
 * the interaction was about, which is exactly what the test should pin.
 */
function assertableState(ctx: TabContext): Array<{ name: string; value: unknown }> {
  const changed = [...ctx.model.changeCounts.keys()].filter((name) => name !== "route");
  return changed
    .slice(0, 6)
    .map((name) => ({ name, value: ctx.model.state[name] }))
    .filter((entry) => entry.value !== undefined && typeof entry.value !== "function");
}

/* -------------------------------------------------------------------------- */
/*  A11y                                                                       */
/* -------------------------------------------------------------------------- */

function renderA11y(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  const root = renderRootElement(app);

  const runAudit = (): void => {
    if (!root) return;
    const result = auditAccessibility(root);
    ui.a11yRun = { ...result, at: Date.now() };
    ui.a11ySelected = null;
    ctx.toast(`${result.findings.length} finding(s) across ${result.examined} elements`);
    ctx.refresh();
  };

  const controls = section(null, h("div", { class: "detail-head" },
    button("Run audit", runAudit, { tone: "good", disabled: root === null }),
    ui.a11yRun
      ? button("Clear", () => {
          ui.a11yRun = null;
          ctx.refresh();
        })
      : null,
    spacer(),
    ui.a11yRun ? muted(`${ui.a11yRun.examined} elements examined`) : null,
  ), { flush: true });

  if (!ui.a11yRun) {
    return [controls, section(null, faint(
      "Audits the rendered tree for the failures a generated UI actually produces: icon buttons with no name, fields labelled only by a placeholder, heading ladders with holes, text below the contrast minimum, focusable content inside aria-hidden.",
    ), { flush: true })];
  }

  const { findings, truncated } = ui.a11yRun;
  const groups = groupFindings(findings);
  const critical = findings.filter((f) => f.impact === "critical").length;
  const serious = findings.filter((f) => f.impact === "serious").length;

  const summary = section("Summary", [
    statGrid(
      stat("findings", String(findings.length), { tone: findings.length === 0 ? "good" : undefined }),
      stat("critical", String(critical), { tone: critical > 0 ? "bad" : "good" }),
      stat("serious", String(serious), { tone: serious > 0 ? "bad" : undefined }),
      stat("rules hit", String(groups.length)),
    ),
    truncated ? faint("The tree was larger than the audit cap, so only the first 4000 elements were examined.") : null,
  ]);

  if (findings.length === 0) {
    return [controls, summary, section(null, h("div", { class: "insight t-good" },
      h("span", { class: "insight-ic" }, "✓"),
      h("span", {}, "No accessibility problems found in the rendered tree.")), { flush: true })];
  }

  const byRule = section("By rule", table(
    [
      { key: "rule", label: "Rule", sort: (row) => row.rule, render: (row) => code(row.rule) },
      {
        key: "impact",
        label: "Impact",
        sort: (row) => row.impact,
        render: (row) => chip(row.impact, row.impact === "critical" || row.impact === "serious" ? "red" : row.impact === "moderate" ? "amber" : "grey"),
      },
      { key: "count", label: "Count", numeric: true, sort: (row) => row.count, render: (row) => String(row.count) },
      { key: "help", label: "Fix", render: (row) => faint(row.first.help) },
    ],
    groups,
  ));

  const list = section(`Findings (${findings.length})`, h("div", {}, ...findings.slice(0, 60).map((finding, index) =>
    renderFinding(ctx, finding, index))));

  const exportButton = section(null, h("div", { class: "detail-head" },
    spacer(),
    copyButton(() => exportFindings(findings), "Copy report"),
    button("Download", () => downloadText("aktion-a11y.txt", exportFindings(findings), "text/plain")),
  ), { flush: true });

  return [controls, summary, byRule, list, exportButton];
}

function renderFinding(ctx: TabContext, finding: A11yFinding, index: number): HTMLElement {
  const selected = ctx.ui.a11ySelected === index;
  const tone = finding.impact === "critical" || finding.impact === "serious" ? "bad" : "warn";
  return h("div", {
    class: `insight t-${tone} is-link ${selected ? "is-selected" : ""}`,
    onmouseenter: () => ctx.overlay.highlight(finding.element, {}, false),
    onmouseleave: () => ctx.overlay.hideHover(),
    onclick: () => {
      ctx.ui.a11ySelected = selected ? null : index;
      ctx.overlay.highlight(finding.element, {}, true);
      finding.element.scrollIntoView({ block: "center", behavior: "smooth" });
      // Jump to the owning component so the fix has a place to be made.
      if (can(ctx.app, "instanceForNode")) {
        const key = ctx.app.instanceForNode(finding.element);
        if (key) ctx.selectInstance(key);
      }
      ctx.refresh();
    },
  },
    h("span", { class: "insight-ic" }, finding.impact === "critical" ? "✖" : "▲"),
    h("span", {},
      chip(finding.rule, "grey"),
      finding.detail ? chip(finding.detail, "amber") : null,
      " ",
      finding.message,
      " ",
      faint(finding.help)));
}

function exportFindings(findings: ReadonlyArray<A11yFinding>): string {
  return findings
    .map((finding) => `[${finding.impact}] ${finding.rule}: ${finding.message}\n  fix: ${finding.help}`)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/*  Coverage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * DSL coverage.
 *
 * The recorder lives on `globalThis` (see `runtime/coverage.ts`), so the panel
 * and the runtime share one session even though they ship as separate bundles.
 * Starting it needs a re-plan, because the static shape of a program is
 * registered at plan time — so this offers the reload rather than pretending a
 * mid-flight start would measure the whole program.
 */
function renderCoverage(ctx: TabContext): Node[] {
  const { app } = ctx;
  const enabled = coverage.isEnabled();

  const controls = section(null, h("div", { class: "detail-head" },
    enabled
      ? button("■ Stop", () => {
          coverage.stop();
          ctx.toast("Coverage stopped");
          ctx.refresh();
        }, { tone: "warn" })
      : button("● Start", () => {
          coverage.start();
          if (can(app, "reload")) app.reload();
          ctx.toast("Coverage started — program re-planned so its shape is registered");
          ctx.refresh();
        }, { tone: "good" }),
    button("Reset", () => {
      coverage.reset();
      ctx.toast("Coverage reset");
      ctx.refresh();
    }),
    spacer(),
    enabled ? chip("recording", "green") : chip("off", "grey"),
  ), { flush: true });

  let report: coverage.CoverageReport | null = null;
  try {
    report = coverage.report();
  } catch {
    report = null;
  }

  if (!report || report.files.length === 0) {
    return [controls, section(null, faint(
      enabled
        ? "Nothing measured yet. Interact with the app — every line, function, and branch the interpreter executes is recorded."
        : "Coverage is off. Start it to measure which lines, functions, and branches of the program actually run.",
    ), { flush: true })];
  }

  const total = report.summary;
  const summary = section("Summary", statGrid(
    stat("lines", fmtPct(total.lines.covered, total.lines.total), {
      tone: total.lines.pct >= 80 ? "good" : total.lines.pct >= 50 ? undefined : "warn",
      title: `${total.lines.covered} of ${total.lines.total}`,
    }),
    stat("functions", fmtPct(total.functions.covered, total.functions.total), {
      title: `${total.functions.covered} of ${total.functions.total}`,
    }),
    stat("branches", fmtPct(total.branches.covered, total.branches.total), {
      title: `${total.branches.covered} of ${total.branches.total}`,
    }),
    stat("files", String(report.files.length)),
  ));

  const files = section("Files", table(
    [
      { key: "path", label: "File", sort: (row) => row.path, render: (row) => code(truncateMiddle(row.path, 40)) },
      { key: "lines", label: "Lines", numeric: true, sort: (row) => row.summary.lines.pct, render: (row) => coverageCell(row.summary.lines) },
      { key: "functions", label: "Functions", numeric: true, sort: (row) => row.summary.functions.pct, render: (row) => coverageCell(row.summary.functions) },
      { key: "branches", label: "Branches", numeric: true, sort: (row) => row.summary.branches.pct, render: (row) => coverageCell(row.summary.branches) },
    ],
    report.files,
  ));

  const uncovered = report.files.flatMap((file) =>
    file.uncoveredLines.slice(0, 12).map((line) => ({ path: file.path, line })));
  const gaps = uncovered.length > 0
    ? section("Never executed", h("div", { class: "chip-row" }, ...uncovered.slice(0, 40).map((entry) =>
        h("button", {
          class: "chip amber is-link",
          title: `${entry.path} line ${entry.line}`,
          onclick: () => {
            ctx.ui.sourceFocusLine = entry.line;
            ctx.selectTab("source");
          },
        }, `L${entry.line}`))))
    : null;

  const exportRow = section(null, h("div", { class: "detail-head" },
    spacer(),
    copyButton(() => coverage.formatSummary(report!), "Copy summary"),
    button("Download LCOV", () => downloadText("aktion.lcov", coverage.toLcov(report!), "text/plain")),
  ), { flush: true });

  return [controls, summary, files, gaps, exportRow].filter((node): node is HTMLElement => node != null);
}

function coverageCell(metric: { covered: number; total: number; pct: number }): HTMLElement {
  const tone = metric.pct >= 80 ? "green" : metric.pct >= 50 ? "amber" : "red";
  return h("span", {},
    chip(`${Math.round(metric.pct)}%`, tone),
    faint(` ${metric.covered}/${metric.total}`));
}

/* -------------------------------------------------------------------------- */
/*  Query playground                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Run a Testing Library-style query against the live app and show what matches.
 *
 * Implemented with the same rules the testing library uses (role including
 * implicit roles, accessible name, label text, test id) so what you find here is
 * what `getByRole(...)` will find in a test. The most useful outcome is
 * discovering that a query matches three elements — which is the error you would
 * otherwise hit only in CI.
 */
function renderQueries(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  const root = renderRootElement(app);
  const kinds = [
    { value: "role" as const, label: "byRole", title: "Match by ARIA role (including implicit roles)" },
    { value: "text" as const, label: "byText", title: "Match by visible text" },
    { value: "label" as const, label: "byLabel", title: "Match a form control by its label" },
    { value: "testid" as const, label: "byTestId", title: "Match data-testid" },
    { value: "css" as const, label: "css", title: "Raw CSS selector" },
  ];

  const bar = toolbar(
    chipGroup(kinds, ui.queryProbeKind, (value) => {
      ui.queryProbeKind = value;
      ctx.refresh();
    }),
    searchInput(ui.queryProbe, (value) => {
      ui.queryProbe = value;
      ctx.refresh();
    }, ui.queryProbeKind === "role" ? "button" : ui.queryProbeKind === "css" ? ".rui-card > button" : "Save"),
  );

  if (!root) return [bar, faint("No render root to query.")];
  const matches = ui.queryProbe.trim() === "" ? [] : runProbe(root, ui.queryProbeKind, ui.queryProbe.trim());

  const results = ui.queryProbe.trim() === ""
    ? section(null, faint("Type a query to see what it matches. Hover a result to highlight it in the page."), { flush: true })
    : section(`Matches (${matches.length})`, [
        matches.length === 0
          ? h("div", { class: "insight t-warn" },
              h("span", { class: "insight-ic" }, "▲"),
              h("span", {}, "Nothing matched. In a test, getBy* throws here and queryBy* returns null."))
          : matches.length > 1
            ? h("div", { class: "insight t-warn" },
                h("span", { class: "insight-ic" }, "▲"),
                h("span", {}, `${matches.length} elements match. getBy* throws on multiple matches — use getAllBy*, or narrow with { name: … }.`))
            : h("div", { class: "insight t-good" },
                h("span", { class: "insight-ic" }, "✓"),
                h("span", {}, "Exactly one match — this query is safe in a test.")),
        h("div", {}, ...matches.slice(0, 30).map((element) => h("div", {
          class: "match-row",
          onmouseenter: () => ctx.overlay.highlight(element, {}, false),
          onmouseleave: () => ctx.overlay.hideHover(),
          onclick: () => {
            ctx.overlay.highlight(element, {}, true);
            if (can(app, "instanceForNode")) {
              const key = app.instanceForNode(element);
              if (key) ctx.selectInstance(key);
            }
          },
        },
          code(element.tagName.toLowerCase()),
          chip(element.getAttribute("role") ?? implicitRole(element) ?? "—", "grey"),
          h("span", { class: "match-name" }, accessibleName(element) || faint("(no accessible name)")),
        ))),
        h("div", { class: "detail-head" },
          spacer(),
          copyButton(() => queryCode(ui.queryProbeKind, ui.queryProbe.trim(), matches.length), "Copy query")),
      ]);

  return [bar, results];
}

function runProbe(root: Element, kind: string, value: string): Element[] {
  const all = [...root.querySelectorAll("*")];
  const needle = value.toLowerCase();
  switch (kind) {
    case "role":
      return all.filter((element) => {
        const role = element.getAttribute("role") ?? implicitRole(element);
        return role !== null && role.toLowerCase() === needle;
      });
    case "text":
      return all.filter((element) => {
        // Only elements whose OWN text matches, so a match does not also report
        // every ancestor that contains it.
        const own = [...element.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        return own !== "" && own.includes(needle);
      });
    case "label":
      return all.filter((element) => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return false;
        return accessibleName(element).toLowerCase().includes(needle);
      });
    case "testid":
      return all.filter((element) => (element.getAttribute("data-testid") ?? "").toLowerCase() === needle);
    case "css":
      try {
        return [...root.querySelectorAll(value)];
      } catch {
        return [];
      }
    default:
      return [];
  }
}

function queryCode(kind: string, value: string, matches: number): string {
  const all = matches > 1 ? "All" : "";
  switch (kind) {
    case "role": return `screen.get${all}ByRole(${JSON.stringify(value)})`;
    case "text": return `screen.get${all}ByText(${JSON.stringify(value)})`;
    case "label": return `screen.get${all}ByLabelText(${JSON.stringify(value)})`;
    case "testid": return `screen.get${all}ByTestId(${JSON.stringify(value)})`;
    default: return `screen.container.shadowRoot!.querySelector(${JSON.stringify(value)})`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Chaos                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A bounded monkey test: click random interactive elements and report what
 * broke.
 *
 * Deliberately crude, and deliberately useful. A generated UI is full of paths
 * nobody has clicked; a few hundred random clicks reliably surfaces the handler
 * that throws on an empty list. Destructive-looking controls are skipped by name
 * so the pass does not spend its clicks deleting the data you are debugging.
 */
const DESTRUCTIVE = /delete|remove|clear|reset|sign\s*out|log\s*out|revoke|cancel account/i;

function renderChaos(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  const root = renderRootElement(app);

  const run = async (clicks: number): Promise<void> => {
    if (!root) return;
    ui.fuzzRunning = true;
    ctx.refresh();
    const startErrors = ctx.model.errors.length;
    const startLogErrors = ctx.model.logs.filter((entry) => entry.level === "error").length;
    const started = performance.now();
    let performed = 0;

    for (let i = 0; i < clicks; i += 1) {
      const targets = [...root.querySelectorAll<HTMLElement>(
        "button, a[href], [role=\"button\"], [role=\"tab\"], [role=\"menuitem\"], input[type=\"checkbox\"], input[type=\"radio\"], summary",
      )].filter((element) => {
        if ((element as HTMLButtonElement).disabled) return false;
        const label = accessibleName(element);
        return !DESTRUCTIVE.test(label);
      });
      if (targets.length === 0) break;
      const target = targets[Math.floor(Math.random() * targets.length)]!;
      try {
        target.click();
        performed += 1;
      } catch {
        // A throwing click is exactly what we are looking for; the console
        // capture records it, and we keep going.
      }
      // Yield so the app can render between clicks — a synchronous burst would
      // exercise one render, not `clicks` of them.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    const newErrors = [
      ...ctx.model.errors.slice(startErrors).map((error) => `${error.phase}: ${error.message}`),
      ...ctx.model.logs
        .filter((entry) => entry.level === "error")
        .slice(startLogErrors)
        .map((entry) => entry.text),
    ];
    ui.fuzzRun = {
      clicks: performed,
      errors: [...new Set(newErrors)],
      atoms: [...ctx.model.changeCounts.keys()],
      durationMs: performance.now() - started,
      at: Date.now(),
    };
    ui.fuzzRunning = false;
    ctx.toast(newErrors.length === 0 ? `${performed} clicks, no errors` : `${newErrors.length} error(s) found`, newErrors.length === 0 ? "good" : "bad");
    ctx.refresh();
  };

  const controls = section(null, h("div", { class: "detail-head" },
    button("Run 50", () => void run(50), { disabled: root === null || ui.fuzzRunning }),
    button("Run 200", () => void run(200), { disabled: root === null || ui.fuzzRunning }),
    ui.fuzzRunning ? chip("running", "amber") : null,
    spacer(),
    faint("Controls whose name reads destructive (delete, clear, sign out) are skipped."),
  ), { flush: true });

  if (!ui.fuzzRun) {
    return [controls, section(null, faint(
      "Clicks random controls with a render between each, then reports every runtime error and console error that appeared. Time-travel back from the State tab if a run leaves the app somewhere odd.",
    ), { flush: true })];
  }

  const run1 = ui.fuzzRun;
  return [
    controls,
    section("Result", statGrid(
      stat("clicks", fmtCount(run1.clicks)),
      stat("errors", String(run1.errors.length), { tone: run1.errors.length > 0 ? "bad" : "good" }),
      stat("duration", fmtMs(run1.durationMs)),
      stat("atoms touched", String(run1.atoms.length)),
    )),
    run1.errors.length > 0
      ? section("Errors", h("div", {}, ...run1.errors.slice(0, 20).map((error) =>
          h("div", { class: "insight t-bad" },
            h("span", { class: "insight-ic" }, "✖"),
            h("span", {}, error)))))
      : section(null, h("div", { class: "insight t-good" },
          h("span", { class: "insight-ic" }, "✓"),
          h("span", {}, "No errors during the run.")), { flush: true }),
  ];
}
