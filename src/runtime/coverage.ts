/**
 * Code coverage for Aktion programs.
 * ==================================
 *
 * `.aktion` files compile to a module that does nothing but `JSON.parse` a
 * serialized AST, so V8 and Istanbul see one executed line no matter how much
 * DSL sits behind it. A program's real coverage is a property of the
 * *interpreter*: which AST nodes did the evaluator actually reach?
 *
 * This module answers that. It records executed nodes against the static shape
 * of the program and reports per-file **lines**, **functions** and **branches**
 * in the same terms Istanbul/lcov use, so an Aktion app can carry a coverage
 * gate next to its JavaScript.
 *
 *   import { coverage } from "aktion-runtime/test";
 *
 *   coverage.start();
 *   const screen = renderCompiled(app);
 *   … drive the app …
 *   const report = coverage.report();
 *   expect(report.summary.lines.pct).toBeGreaterThanOrEqual(95);
 *   writeFileSync("coverage/aktion.lcov", coverage.toLcov(report));
 *
 * Design notes
 * ------------
 * **Off costs one property read.** The recorder hangs off the
 * `EvaluationContext` (`ctx.coverage`), so every hook is `if (ctx.coverage)`.
 * Nothing is allocated, imported or branched on in a normal render.
 *
 * **Attribution is exact, not heuristic.** After the linker merges a multi-file
 * graph, `loc.line` alone is ambiguous — every module has a line 42. Nodes carry
 * `loc.source` (an index into `Program.sources`) and the scope on the context
 * maps those indices to per-file accumulators, so a hit lands in the file its
 * author wrote it in even while two different programs are mounted side by side.
 *
 * **What "a line" means.** The denominator is the set of lines carrying a node
 * the evaluator can reach — not every line of the file. Blank lines, comments,
 * closing braces and object-literal keys are not executable and are therefore
 * absent from the report entirely, exactly as an instrumented JS file omits
 * them. Coverage percentages are over instrumented lines.
 *
 * **Known limits**, stated because a coverage number that hides them is worse
 * than none: values folded at plan time by `evaluateLiteral` (the initial value
 * of `$x = 1`) are attributed to the declaration, and `Literal`, `Member`,
 * `Object` and `Array` nodes carry no `loc` from the parser, so a line holding
 * only those is not instrumented.
 */

import { walk } from "../parser/index.js";
import type { Program, SourceLocation, Statement, Expression } from "../parser/types.js";
import { moduleLocalBaseName } from "../compiler/linker.js";

/* -------------------------------------------------------------------------- */
/*  Report shapes                                                              */
/* -------------------------------------------------------------------------- */

/** Covered / total with a percentage, for one metric of one file. */
export interface CoverageMetric {
  covered: number;
  total: number;
  /** `covered / total * 100`, rounded to 2dp. `100` when there is nothing to cover. */
  pct: number;
}

export interface CoverageSummary {
  lines: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

/** Which construct a branch record came from. */
export type BranchKind = "if" | "ternary" | "logical" | "switch";

export interface FunctionReport {
  /** Declared name, or `(anonymous)` for a lambda. */
  name: string;
  line: number;
  column: number;
  hits: number;
}

export interface BranchReport {
  kind: BranchKind;
  line: number;
  column: number;
  /**
   * Times each path was taken. `if`/`ternary`: `[consequent, alternate]`.
   * `logical`: `[short-circuited, right-hand side evaluated]`. `switch`: one
   * entry per case in declaration order, `default` last when present.
   */
  arms: number[];
}

export interface FileCoverageReport {
  /** Module path as the linker recorded it (absolute, matching `Program.sources`). */
  path: string;
  /** Hits per instrumented line. Lines with `0` were never executed. */
  lines: Record<number, number>;
  /** Instrumented lines that never executed, ascending — the actionable list. */
  uncoveredLines: number[];
  functions: FunctionReport[];
  branches: BranchReport[];
  summary: CoverageSummary;
}

export interface CoverageReport {
  files: FileCoverageReport[];
  summary: CoverageSummary;
  /** Schema version, so a shard written by an older build is recognisable. */
  readonly version: 1;
}

/* -------------------------------------------------------------------------- */
/*  Internal accumulators                                                      */
/* -------------------------------------------------------------------------- */

interface FileAccumulator {
  path: string;
  /** line -> hits. Seeded with 0 for every instrumented line. */
  lines: Map<number, number>;
  /** `line:column` -> function record. */
  functions: Map<string, { name: string; line: number; column: number; hits: number }>;
  /** `line:column` -> branch record. */
  branches: Map<string, { kind: BranchKind; line: number; column: number; arms: number[] }>;
}

/**
 * The per-context view of the recorder: local `loc.source` index -> file.
 * Attached to an `EvaluationContext` while coverage is on.
 */
export interface CoverageScope {
  files: FileAccumulator[];
}

/** Fallback path for a program with no `sources` and no caller-supplied path. */
export const INLINE_SOURCE_PATH = "<inline>";

/**
 * The recorder lives on `globalThis`, not in module scope.
 *
 * `aktion-runtime` and `aktion-runtime/test` ship as separate self-contained
 * bundles, so an app that imports both loads two copies of this module. With
 * module-level state, `coverage.start()` called through the test entry would flip
 * a flag the *element's* evaluator never reads, and every report would come back
 * empty — the failure is silent, which is the worst kind. A versioned global key
 * (the same approach `src/devtools/hook.ts` uses for its hook) makes all copies
 * share one session.
 */
const STORE_KEY = "__AKTION_COVERAGE_V1__";

interface CoverageStore {
  enabled: boolean;
  /** Accumulators keyed by module path, so repeated mounts merge. */
  accumulators: Map<string, FileAccumulator>;
  /** Programs whose static shape is already registered, keyed by statements array. */
  registered: WeakSet<Statement[]>;
}

function store(): CoverageStore {
  const holder = globalThis as unknown as Record<string, CoverageStore | undefined>;
  let existing = holder[STORE_KEY];
  if (!existing) {
    existing = { enabled: false, accumulators: new Map(), registered: new WeakSet() };
    holder[STORE_KEY] = existing;
  }
  return existing;
}

function accumulatorFor(path: string): FileAccumulator {
  const { accumulators } = store();
  let acc = accumulators.get(path);
  if (!acc) {
    acc = { path, lines: new Map(), functions: new Map(), branches: new Map() };
    accumulators.set(path, acc);
  }
  return acc;
}

const key = (line: number, column: number): string => `${line}:${column}`;

/* -------------------------------------------------------------------------- */
/*  Static registration (the denominator)                                      */
/* -------------------------------------------------------------------------- */

/** Node kinds that introduce a callable body — the "functions" of a program. */
function functionName(node: Statement | Expression): string | null {
  switch (node.kind) {
    case "ComponentDeclaration":
    case "ActionDeclaration":
    case "HookDeclaration":
      // In a linked program the declaration carries the linker's private symbol
      // (`__a1_Panel`). Report the name the author wrote — the mangling is an
      // implementation detail of module scoping, and its numeric part changes
      // when an unrelated import is added.
      return moduleLocalBaseName(node.name) ?? (node.name || "(anonymous)");
    case "EffectDeclaration":
      // Effects are named `__effect_L12_C3` by the parser; the location is
      // already in the record, so show the construct instead of the mangling.
      return "effect";
    case "Lambda":
      return "(anonymous)";
    default:
      return null;
  }
}

/** How many paths a branching node has, or `null` when it does not branch. */
function branchShape(node: Statement | Expression): { kind: BranchKind; arms: number } | null {
  switch (node.kind) {
    case "IfStatement":
      // Two paths even without an `else` — the implicit fall-through is a path
      // a test can miss, which is the whole point of counting it.
      return { kind: "if", arms: 2 };
    case "Ternary":
      return { kind: "ternary", arms: 2 };
    case "Binary":
      return node.operator === "&&" || node.operator === "||" || node.operator === "??"
        ? { kind: "logical", arms: 2 }
        : null;
    case "SwitchStatement":
      return { kind: "switch", arms: Math.max(node.cases.length, 1) };
    default:
      return null;
  }
}

/**
 * Record the static shape of `program` so its unexecuted lines, functions and
 * branches appear in the report, and return the scope the evaluator records
 * against.
 *
 * Idempotent per program: re-planning the same AST (a re-render, a hot edit
 * replay) neither double-counts the denominator nor loses accumulated hits.
 *
 * @param program - A parsed or linked program.
 * @param path - Path for a program without `sources` (a single-file or
 *   string-mounted program). Defaults to {@link INLINE_SOURCE_PATH}.
 */
export function registerProgram(program: Program, path?: string): CoverageScope {
  const sources = program.sources ?? [path ?? INLINE_SOURCE_PATH];
  const files = sources.map((source) => accumulatorFor(source));

  const { registered } = store();
  if (registered.has(program.statements)) return { files };
  registered.add(program.statements);

  walk(program, ({ node }) => {
    const loc = (node as { loc?: SourceLocation }).loc;
    if (!loc) return;
    const file = files[loc.source ?? 0] ?? files[0]!;
    // A `Block` is not a statement, and its `loc` is the BRACE that opens it —
    // which for an `else` arm is the `} else {` line and for nothing else is a
    // line of its own. The evaluator runs a block's statements, never the block,
    // so instrumenting it added a line to the denominator that no test could ever
    // hit: every program using a braced `if/else` was capped below 100% lines with
    // no way to see why. An instrumented JavaScript file does not count that line
    // either, and the statements INSIDE the block are instrumented as themselves.
    if (node.kind !== "Block" && !file.lines.has(loc.line)) file.lines.set(loc.line, 0);

    const fnName = functionName(node);
    if (fnName !== null) {
      const k = key(loc.line, loc.column);
      if (!file.functions.has(k)) {
        file.functions.set(k, { name: fnName, line: loc.line, column: loc.column, hits: 0 });
      }
    }

    const branch = branchShape(node);
    if (branch) {
      const k = key(loc.line, loc.column);
      if (!file.branches.has(k)) {
        file.branches.set(k, {
          kind: branch.kind,
          line: loc.line,
          column: loc.column,
          arms: new Array<number>(branch.arms).fill(0),
        });
      }
    }
  });

  return { files };
}

/* -------------------------------------------------------------------------- */
/*  Hot-path recorders — called from the evaluator                             */
/* -------------------------------------------------------------------------- */

/**
 * Note that the node at `loc` executed. Called from the evaluator's expression
 * and statement dispatch; every call site is already guarded by
 * `if (ctx.coverage)`, so this never runs in a normal render.
 */
export function recordLine(scope: CoverageScope, loc: SourceLocation): void {
  const file = scope.files[loc.source ?? 0];
  if (!file) return;
  file.lines.set(loc.line, (file.lines.get(loc.line) ?? 0) + 1);
}

/** Note that a component / action / hook / effect / lambda body ran. */
export function recordFunction(scope: CoverageScope, loc: SourceLocation | undefined): void {
  if (!loc) return;
  const file = scope.files[loc.source ?? 0];
  if (!file) return;
  const record = file.functions.get(key(loc.line, loc.column));
  if (record) record.hits += 1;
}

/**
 * Note which path a branching node took.
 *
 * @param arm - `0` for the consequent / short-circuit, `1` for the alternate /
 *   evaluated right-hand side, or the case index for a `switch`.
 */
export function recordBranch(
  scope: CoverageScope,
  loc: SourceLocation | undefined,
  arm: number,
): void {
  if (!loc) return;
  const file = scope.files[loc.source ?? 0];
  if (!file) return;
  const record = file.branches.get(key(loc.line, loc.column));
  if (!record) return;
  if (arm >= 0 && arm < record.arms.length) record.arms[arm] = record.arms[arm]! + 1;
}

/* -------------------------------------------------------------------------- */
/*  Session control                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Turn recording on. Programs mounted after this call are instrumented; a
 * program already mounted is instrumented from its next plan.
 */
export function start(): void {
  store().enabled = true;
}

/** Turn recording off. Collected data is kept — call {@link reset} to drop it. */
export function stop(): void {
  store().enabled = false;
}

/** Whether new mounts will be instrumented. */
export function isEnabled(): boolean {
  return store().enabled;
}

/** Drop every accumulated measurement and every registration. */
export function reset(): void {
  store().accumulators.clear();
}

/* -------------------------------------------------------------------------- */
/*  Reporting                                                                  */
/* -------------------------------------------------------------------------- */

function metric(covered: number, total: number): CoverageMetric {
  return {
    covered,
    total,
    pct: total === 0 ? 100 : Math.round((covered / total) * 10_000) / 100,
  };
}

function addMetric(into: CoverageMetric, part: CoverageMetric): void {
  into.covered += part.covered;
  into.total += part.total;
}

export interface ReportOptions {
  /**
   * Keep only the files whose path satisfies this predicate — the summary is
   * computed over what survives.
   *
   * Needed because not every program a suite mounts is production code. A test
   * that compiles a throwaway program to exercise one helper registers that
   * program as a file too, and dozens of trivially-100% scaffolding entries
   * would both bury the real files and skew the totals. Filter to your source
   * root: `report({ filter: (p) => p.includes("/src/") })`.
   */
  filter?: (path: string) => boolean;
}

/** Snapshot everything recorded so far, per file plus an overall summary. */
export function report(options: ReportOptions = {}): CoverageReport {
  const files: FileCoverageReport[] = [];
  const totals: CoverageSummary = {
    lines: metric(0, 0),
    functions: metric(0, 0),
    branches: metric(0, 0),
  };

  const selected = [...store().accumulators.values()]
    .filter((acc) => (options.filter ? options.filter(acc.path) : true))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const acc of selected) {
    const lineEntries = [...acc.lines.entries()].sort((a, b) => a[0] - b[0]);
    const lines: Record<number, number> = {};
    const uncoveredLines: number[] = [];
    let coveredLines = 0;
    for (const [line, hits] of lineEntries) {
      lines[line] = hits;
      if (hits > 0) coveredLines += 1;
      else uncoveredLines.push(line);
    }

    const functions = [...acc.functions.values()].sort(
      (a, b) => a.line - b.line || a.column - b.column,
    );
    const branches = [...acc.branches.values()].sort(
      (a, b) => a.line - b.line || a.column - b.column,
    );

    const armTotal = branches.reduce((n, b) => n + b.arms.length, 0);
    const armCovered = branches.reduce((n, b) => n + b.arms.filter((h) => h > 0).length, 0);

    const summary: CoverageSummary = {
      lines: metric(coveredLines, lineEntries.length),
      functions: metric(functions.filter((f) => f.hits > 0).length, functions.length),
      branches: metric(armCovered, armTotal),
    };
    addMetric(totals.lines, summary.lines);
    addMetric(totals.functions, summary.functions);
    addMetric(totals.branches, summary.branches);

    files.push({
      path: acc.path,
      lines,
      uncoveredLines,
      functions: functions.map((f) => ({ ...f })),
      branches: branches.map((b) => ({ ...b, arms: [...b.arms] })),
      summary,
    });
  }

  return {
    files,
    summary: {
      lines: metric(totals.lines.covered, totals.lines.total),
      functions: metric(totals.functions.covered, totals.functions.total),
      branches: metric(totals.branches.covered, totals.branches.total),
    },
    version: 1,
  };
}

/**
 * Combine reports produced by separate runs — the shape a test runner needs when
 * each test file is isolated in its own worker and writes its own shard.
 *
 * Line and branch hit counts add; a function is covered if any run covered it.
 * Denominators are unioned, so a file measured by only one shard still reports
 * its full instrumented size.
 */
export function merge(
  reports: ReadonlyArray<CoverageReport>,
  options: ReportOptions = {},
): CoverageReport {
  const { accumulators } = store();
  const previous = new Map(accumulators);
  accumulators.clear();
  try {
    for (const input of reports) {
      for (const file of input.files) {
        const acc = accumulatorFor(file.path);
        for (const [line, hits] of Object.entries(file.lines)) {
          const n = Number(line);
          acc.lines.set(n, (acc.lines.get(n) ?? 0) + hits);
        }
        for (const fn of file.functions) {
          const k = key(fn.line, fn.column);
          const existing = acc.functions.get(k);
          if (existing) existing.hits += fn.hits;
          else acc.functions.set(k, { ...fn });
        }
        for (const branch of file.branches) {
          const k = key(branch.line, branch.column);
          const existing = acc.branches.get(k);
          if (existing) {
            for (let i = 0; i < branch.arms.length; i += 1) {
              existing.arms[i] = (existing.arms[i] ?? 0) + branch.arms[i]!;
            }
          } else {
            acc.branches.set(k, { ...branch, arms: [...branch.arms] });
          }
        }
      }
    }
    return report(options);
  } finally {
    accumulators.clear();
    for (const [path, acc] of previous) accumulators.set(path, acc);
  }
}

/**
 * Render a report as lcov — the format `genhtml`, Sonar, Codecov and
 * `@vitest/coverage-*` all read, so DSL coverage merges with the JavaScript
 * report instead of living in a separate silo.
 */
export function toLcov(input: CoverageReport = report()): string {
  const out: string[] = [];
  for (const file of input.files) {
    out.push("TN:");
    out.push(`SF:${file.path}`);

    // lcov keys functions by NAME, so anonymous lambdas would all collide into
    // one record. Suffixing with the line keeps them distinct and readable.
    const names = new Map<string, string>();
    for (const fn of file.functions) {
      const k = key(fn.line, fn.column);
      const unique = `${fn.name}:${fn.line}`;
      names.set(k, unique);
      out.push(`FN:${fn.line},${unique}`);
    }
    for (const fn of file.functions) {
      out.push(`FNDA:${fn.hits},${names.get(key(fn.line, fn.column))}`);
    }
    out.push(`FNF:${file.summary.functions.total}`);
    out.push(`FNH:${file.summary.functions.covered}`);

    let block = 0;
    for (const branch of file.branches) {
      for (let i = 0; i < branch.arms.length; i += 1) {
        const hits = branch.arms[i]!;
        out.push(`BRDA:${branch.line},${block},${i},${hits === 0 ? "-" : hits}`);
      }
      block += 1;
    }
    out.push(`BRF:${file.summary.branches.total}`);
    out.push(`BRH:${file.summary.branches.covered}`);

    for (const [line, hits] of Object.entries(file.lines)) out.push(`DA:${line},${hits}`);
    out.push(`LF:${file.summary.lines.total}`);
    out.push(`LH:${file.summary.lines.covered}`);
    out.push("end_of_record");
  }
  return out.length > 0 ? `${out.join("\n")}\n` : "";
}

/**
 * The same `coverage` namespace `aktion-runtime/test` exposes, re-exported here
 * so a Node-side reporter can use one identical API.
 *
 * Reach for `aktion-runtime/coverage` wherever there is no DOM — a Vitest
 * `globalSetup`, a merge script, CI glue. `aktion-runtime/test` pulls in the
 * `<aktion-app>` element and throws `HTMLElement is not defined` outside a
 * browser-like environment. Both views share one session (the recorder lives on
 * `globalThis`), so starting it from a test and reporting from a teardown works.
 */
export const coverage = {
  start,
  stop,
  reset,
  isEnabled,
  report,
  merge,
  toLcov,
  formatSummary,
};

/** A one-line-per-file text table — what to print when a gate fails. */
export function formatSummary(input: CoverageReport = report()): string {
  const rows = input.files.map((file) => ({
    name: file.path.split("/").slice(-2).join("/"),
    lines: `${file.summary.lines.pct.toFixed(2)}% (${file.summary.lines.covered}/${file.summary.lines.total})`,
    functions: `${file.summary.functions.pct.toFixed(2)}%`,
    branches: `${file.summary.branches.pct.toFixed(2)}%`,
    uncovered: file.uncoveredLines.slice(0, 12).join(",") + (file.uncoveredLines.length > 12 ? ",…" : ""),
  }));
  const width = Math.max(4, ...rows.map((r) => r.name.length));
  const header = `${"file".padEnd(width)}  lines                 funcs    branch   uncovered lines`;
  const body = rows.map(
    (r) => `${r.name.padEnd(width)}  ${r.lines.padEnd(20)}  ${r.functions.padEnd(7)}  ${r.branches.padEnd(7)}  ${r.uncovered}`,
  );
  const s = input.summary;
  const footer = `ALL: lines ${s.lines.pct.toFixed(2)}% (${s.lines.covered}/${s.lines.total}) · functions ${s.functions.pct.toFixed(2)}% (${s.functions.covered}/${s.functions.total}) · branches ${s.branches.pct.toFixed(2)}% (${s.branches.covered}/${s.branches.total})`;
  return [header, ...body, "", footer].join("\n");
}
