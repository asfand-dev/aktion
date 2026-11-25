import { Program, SourceLocation } from '../parser/types.js';
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
interface FileAccumulator {
    path: string;
    /** line -> hits. Seeded with 0 for every instrumented line. */
    lines: Map<number, number>;
    /** `line:column` -> function record. */
    functions: Map<string, {
        name: string;
        line: number;
        column: number;
        hits: number;
    }>;
    /** `line:column` -> branch record. */
    branches: Map<string, {
        kind: BranchKind;
        line: number;
        column: number;
        arms: number[];
    }>;
}
/**
 * The per-context view of the recorder: local `loc.source` index -> file.
 * Attached to an `EvaluationContext` while coverage is on.
 */
export interface CoverageScope {
    files: FileAccumulator[];
}
/** Fallback path for a program with no `sources` and no caller-supplied path. */
export declare const INLINE_SOURCE_PATH = "<inline>";
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
export declare function registerProgram(program: Program, path?: string): CoverageScope;
/**
 * Note that the node at `loc` executed. Called from the evaluator's expression
 * and statement dispatch; every call site is already guarded by
 * `if (ctx.coverage)`, so this never runs in a normal render.
 */
export declare function recordLine(scope: CoverageScope, loc: SourceLocation): void;
/** Note that a component / action / hook / effect / lambda body ran. */
export declare function recordFunction(scope: CoverageScope, loc: SourceLocation | undefined): void;
/**
 * Note which path a branching node took.
 *
 * @param arm - `0` for the consequent / short-circuit, `1` for the alternate /
 *   evaluated right-hand side, or the case index for a `switch`.
 */
export declare function recordBranch(scope: CoverageScope, loc: SourceLocation | undefined, arm: number): void;
/**
 * Turn recording on. Programs mounted after this call are instrumented; a
 * program already mounted is instrumented from its next plan.
 */
export declare function start(): void;
/** Turn recording off. Collected data is kept — call {@link reset} to drop it. */
export declare function stop(): void;
/** Whether new mounts will be instrumented. */
export declare function isEnabled(): boolean;
/** Drop every accumulated measurement and every registration. */
export declare function reset(): void;
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
export declare function report(options?: ReportOptions): CoverageReport;
/**
 * Combine reports produced by separate runs — the shape a test runner needs when
 * each test file is isolated in its own worker and writes its own shard.
 *
 * Line and branch hit counts add; a function is covered if any run covered it.
 * Denominators are unioned, so a file measured by only one shard still reports
 * its full instrumented size.
 */
export declare function merge(reports: ReadonlyArray<CoverageReport>, options?: ReportOptions): CoverageReport;
/**
 * Render a report as lcov — the format `genhtml`, Sonar, Codecov and
 * `@vitest/coverage-*` all read, so DSL coverage merges with the JavaScript
 * report instead of living in a separate silo.
 */
export declare function toLcov(input?: CoverageReport): string;
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
export declare const coverage: {
    start: typeof start;
    stop: typeof stop;
    reset: typeof reset;
    isEnabled: typeof isEnabled;
    report: typeof report;
    merge: typeof merge;
    toLcov: typeof toLcov;
    formatSummary: typeof formatSummary;
};
/** A one-line-per-file text table — what to print when a gate fails. */
export declare function formatSummary(input?: CoverageReport): string;
export {};
