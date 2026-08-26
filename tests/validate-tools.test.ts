/**
 * The `tools/validate-aktion*.mjs` CLIs.
 *
 * These had no coverage at all, and it cost: `validate-aktion-app.mjs` called
 * `linkProgram(entryPath, resolver)` when the signature is
 * `linkProgram(entrySource, entryPath, resolver)`. That parses the *path string*
 * as the program — a graph with no imports and no component calls — so the tool
 * printed `OK` and exited 0 for every input, including files that did not link.
 * A validator that cannot fail is worse than none, because its green is believed.
 *
 * The tests below are therefore mostly "does it actually reject bad input".
 * They spawn the real scripts, so they exercise argument parsing and the exit
 * code as well as the diagnostics.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appTool = join(repoRoot, "tools", "validate-aktion-app.mjs");
const fileTool = join(repoRoot, "tools", "validate-aktion.mjs");
const distDir = join(repoRoot, "dist");
const viteBin = join(repoRoot, "node_modules", "vite", "bin", "vite.js");

/**
 * The tools read the built bundles, so every test here used to be wrapped in
 * `describe.skipIf(!built)` — and that skip was the same disease as the bug the
 * file exists to prevent. `.github/workflows/test.yml` runs `npm ci && npm test`
 * with no build step and `dist/` is gitignored, so the guard was never false in
 * CI: it was ALWAYS false, and every test below was skipped on every push. A
 * validator that cannot fail is worse than none — and so is its test suite.
 *
 * Both bundles build in ~1s (`tests/lsp-server.test.ts` does the same for the LSP
 * bundle, for the same reason), so build them on demand instead of skipping. A
 * failed build throws with the build log rather than quietly disarming the file.
 */
function buildBundle(config: string): void {
  // Build into a scratch dir inside `dist/` and MOVE the results in, `.js` last.
  // Other test files run in sibling workers and probe `dist/language.js` with
  // `existsSync` before importing it; rollup writes that 1.7 MB bundle in place,
  // so a mid-write probe would see the path exist and import a truncated module.
  // `renameSync` within one filesystem is atomic: the file is absent or complete.
  mkdirSync(distDir, { recursive: true });
  const stage = mkdtempSync(join(distDir, "test-build-"));
  try {
    execFileSync(process.execPath, [viteBin, "build", "--config", config, "--outDir", stage], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    const produced = readdirSync(stage);
    const isModule = (f: string): boolean => f.endsWith(".js") || f.endsWith(".cjs");
    for (const name of [...produced.filter((f) => !isModule(f)), ...produced.filter(isModule)]) {
      renameSync(join(stage, name), join(distDir, name));
    }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`failed to build ${config}:\n${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

beforeAll(() => {
  if (!existsSync(join(distDir, "language.js"))) buildBundle("vite.language.config.ts");
  if (!existsSync(join(distDir, "plugin.js"))) buildBundle("vite.plugin.config.ts");
}, 120_000);

interface Run {
  status: number;
  output: string;
}

function run(tool: string, args: string[]): Run {
  try {
    const output = execFileSync(process.execPath, [tool, ...args], { encoding: "utf8" });
    return { status: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("tools/validate-aktion-app.mjs", () => {
  let dir: string;
  let libSrc: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aktion-validate-"));
    libSrc = join(dir, "libs", "ui", "src");
    mkdirSync(join(dir, "app", "src"), { recursive: true });
    mkdirSync(libSrc, { recursive: true });

    writeFileSync(
      join(libSrc, "chrome.aktion"),
      'export function Shared() {\n  return Badge("shared", {variant: "success"})\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "app", "src", "good.aktion"),
      'import { Shared } from "@acme/ui/chrome.aktion"\n$app(Column([Shared()]))\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "app", "src", "missing-import.aktion"),
      'import { x } from "./nope.aktion"\n$app(Text(x))\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "app", "src", "unknown-component.aktion"),
      '$app(Column([NoSuchComponent("x")]))\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "app", "src", "syntax-error.aktion"),
      "$app(Column([\nexport function oops( {\n",
      "utf8",
    );
    writeFileSync(join(dir, "aktion.config.json"), JSON.stringify({ alias: { "@acme/ui": "./libs/ui/src" } }), "utf8");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("fails on an unresolvable import", () => {
    const { status, output } = run(appTool, [join(dir, "app", "src", "missing-import.aktion")]);
    expect(output).toMatch(/Cannot resolve import "\.\/nope\.aktion"/);
    expect(status).toBe(1);
  });

  it("warns on an unknown component without failing the run", () => {
    const { status, output } = run(appTool, [join(dir, "app", "src", "unknown-component.aktion")]);
    expect(output).toMatch(/warning: Unknown component <NoSuchComponent>/);
    expect(status).toBe(0);
  });

  it("fails on a syntax error", () => {
    const { status } = run(appTool, [join(dir, "app", "src", "syntax-error.aktion")]);
    expect(status).toBe(1);
  });

  it("passes a program that links through an aktion.config.json alias", () => {
    const { status, output } = run(appTool, [join(dir, "app", "src", "good.aktion")]);
    expect(output).toMatch(/OK/);
    expect(status).toBe(0);
  });

  it("accepts the same alias on the command line", () => {
    // `--alias` is what a repository without a config file (or a one-off check)
    // uses; it must agree with the config-file path above.
    const { status, output } = run(appTool, [
      "--alias",
      `@acme/ui=${libSrc}`,
      join(dir, "app", "src", "good.aktion"),
    ]);
    expect(output).toMatch(/OK/);
    expect(status).toBe(0);
  });

  it("rejects a malformed --alias", () => {
    const { status, output } = run(appTool, ["--alias", "no-equals-sign", join(dir, "app", "src", "good.aktion")]);
    expect(output).toMatch(/--alias <prefix>=<dir>/);
    expect(status).toBe(2);
  });

  it("reports a missing entry file instead of printing OK", () => {
    const { status, output } = run(appTool, [join(dir, "app", "src", "not-here.aktion")]);
    expect(output).toMatch(/READ ERROR/);
    expect(status).toBe(1);
  });
});

describe("tools/validate-aktion.mjs", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aktion-validate-single-"));
    writeFileSync(join(dir, "ok.aktion"), '$app(Column([Button("Save", {variant: "primary"})]))\n', "utf8");
    writeFileSync(join(dir, "unknown.aktion"), '$app(Column([Nope("x")]))\n', "utf8");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("passes a clean single-file program", () => {
    const { status, output } = run(fileTool, [join(dir, "ok.aktion")]);
    expect(output).toMatch(/OK/);
    expect(status).toBe(0);
  });

  it("warns on an unknown component", () => {
    const { output } = run(fileTool, [join(dir, "unknown.aktion")]);
    expect(output).toMatch(/warning: Unknown component <Nope>/);
  });
});

/**
 * The lint pass runs over EVERY module, not just the entry.
 *
 * `validate-aktion-app.mjs` used to lint `printProgram(result.program)` — the
 * merged graph printed back to source — and that was silently vacuous. Three
 * things went wrong at once, any one of them enough on its own: the printed text
 * does not re-parse (the formatter emits `{state}` shorthand where the parser
 * demands `key: value`), `getLintWarnings` answers unparseable source with `[]`
 * rather than saying it could not parse, and `await` prints as the internal
 * marker `@__rui_await__`, which no lint rule matches. So the tool printed `OK`
 * for a consumed `await` anywhere in the app — imported module OR entry file.
 * It now lints the entry plus every module in `result.dependencies`, each read
 * from its own file, and prefixes a non-entry finding with the module's path.
 *
 * These are end-to-end CLI tests on purpose. All three lint rules worked in
 * isolation the whole time; the defect was in what the CLI handed them, so only
 * running the real script over a real multi-file app on disk can catch it.
 *
 * The fixture lives in one flat temp directory because the tool confines module
 * resolution to the entry's own directory — that confinement is what stops a
 * crafted `../../../../etc/passwd` import from being read.
 */
describe("tools/validate-aktion-app.mjs — every module in the graph is linted", () => {
  let dir: string;

  const AWAIT_WARNING = /The result of `await` is the PROMISE/;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aktion-validate-graph-"));

    // The consumed `await` sits on line 3 of a 5-line module while every entry is
    // 2 lines long, so an `L3` in the output can only have come from the module —
    // a line number counted over the merged graph could not land there.
    writeFileSync(
      join(dir, "await-lib.aktion"),
      [
        "// The clipboard shape that shipped broken in two real apps.",
        "export function copyValue(value) {",
        "  const ok = await $util.copy(value)",
        '  return Badge(ok ? "copied" : "failed", {tone: "success"})',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(dir, "await-entry.aktion"),
      'import { copyValue } from "./await-lib.aktion"\n$app(Column([copyValue("x")]))\n',
      "utf8",
    );

    writeFileSync(
      join(dir, "single-await.aktion"),
      [
        "function Copy() {",
        '  const ok = await $util.copy("x")',
        '  return Text(ok ? "yes" : "no")',
        "}",
        "$app(Column([Copy()]))",
        "",
      ].join("\n"),
      "utf8",
    );

    // A clean three-module chain: the new per-file lint pass must not invent
    // findings for a name a module imports rather than declares.
    writeFileSync(
      join(dir, "clean-atoms.aktion"),
      'export function StatusBadge(label) {\n  return Badge(label, {tone: "success"})\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "clean-panel.aktion"),
      'import { StatusBadge } from "./clean-atoms.aktion"\n' +
        "export function Panel(title) {\n" +
        '  return Card([Heading(title, {level: 2}), StatusBadge("ready")])\n' +
        "}\n",
      "utf8",
    );
    writeFileSync(
      join(dir, "clean-entry.aktion"),
      'import { Panel } from "./clean-panel.aktion"\n$app(Column([Panel("Overview")]))\n',
      "utf8",
    );

    writeFileSync(
      join(dir, "unknown-lib.aktion"),
      'export function Widget() {\n  return NoSuchComponent("x")\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "unknown-entry.aktion"),
      'import { Widget } from "./unknown-lib.aktion"\n$app(Column([Widget()]))\n',
      "utf8",
    );

    writeFileSync(
      join(dir, "schema-lib.aktion"),
      'export function Widget() {\n  return Badge("hi", {nopeProp: true})\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "schema-entry.aktion"),
      'import { Widget } from "./schema-lib.aktion"\n$app(Column([Widget()]))\n',
      "utf8",
    );

    // One warning and one error in the same module, to pin the exit code on the
    // ERROR count rather than on "did anything get reported".
    writeFileSync(
      join(dir, "mixed-lib.aktion"),
      [
        "export function Widget(value) {",
        "  const ok = await $util.copy(value)",
        '  return Badge(ok ? "y" : "n", {nopeProp: true})',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(dir, "mixed-entry.aktion"),
      'import { Widget } from "./mixed-lib.aktion"\n$app(Column([Widget("x")]))\n',
      "utf8",
    );

    // A diamond: entry → {left, right} → shared. The linker loads `shared` once,
    // and the CLI keeps its own `linted` set, so the finding must appear once.
    writeFileSync(
      join(dir, "diamond-shared.aktion"),
      'export function copyValue(value) {\n  const ok = await $util.copy(value)\n  return Badge(ok ? "y" : "n", {tone: "success"})\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "diamond-left.aktion"),
      'import { copyValue } from "./diamond-shared.aktion"\nexport function Left() {\n  return Column([copyValue("left")])\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "diamond-right.aktion"),
      'import { copyValue } from "./diamond-shared.aktion"\nexport function Right() {\n  return Column([copyValue("right")])\n}\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "diamond-entry.aktion"),
      'import { Left } from "./diamond-left.aktion"\nimport { Right } from "./diamond-right.aktion"\n$app(Column([Left(), Right()]))\n',
      "utf8",
    );
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reports a consumed `await` in an IMPORTED module, naming that file and its line", () => {
    // The regression itself: a clean entry, a broken import. This printed `OK`.
    const { status, output } = run(appTool, [join(dir, "await-entry.aktion")]);
    expect(output).toMatch(AWAIT_WARNING);
    // The path is what makes the finding actionable — a line number alone points
    // into a file the author never wrote.
    expect(output).toContain(`${join(dir, "await-lib.aktion")}: `);
    expect(output).toMatch(/^L3: warning: /m);
    // `/OK/` alone could match a random temp-path suffix; the tool prints the
    // all-clear as its own trailing `<entry>: OK` line.
    expect(output).not.toMatch(/: OK$/m);
    expect(status).toBe(0);
  });

  it("still reports a consumed `await` in a single-module program, unprefixed", () => {
    // The entry was never linted either (`@__rui_await__` matched no rule), so
    // this is not just a no-regression check. Entry findings carry no path: the
    // file is the one named on the command line.
    const { status, output } = run(appTool, [join(dir, "single-await.aktion")]);
    expect(output).toMatch(/^L2: warning: The result of `await` is the PROMISE/m);
    expect(output).not.toContain("single-await.aktion: The result");
    expect(status).toBe(0);
  });

  it("prints OK for a clean multi-module program", () => {
    // Guards the other direction: linting each file separately must not flag a
    // component one module imports from another.
    const { status, output } = run(appTool, [join(dir, "clean-entry.aktion")]);
    expect(output).toMatch(/clean-entry\.aktion: OK$/m);
    // Every finding is printed as `L<n>: <severity>: …`; matching the shape
    // rather than the words keeps a temp path that happens to spell "error" out.
    expect(output.split("\n").filter((line) => /^L\d+: /.test(line))).toEqual([]);
    expect(status).toBe(0);
  });

  it("attributes an unknown component to the module that contains it", () => {
    const { status, output } = run(appTool, [join(dir, "unknown-entry.aktion")]);
    expect(output).toMatch(/warning: .*Unknown component <NoSuchComponent>/);
    expect(output).toContain(`${join(dir, "unknown-lib.aktion")}: `);
    // An unknown component is a WARNING, not an error — it can legitimately be a
    // component the host page registers. It must not fail the run.
    expect(status).toBe(0);
  });

  it("fails with exit 1 on a schema error inside an imported module", () => {
    // Schema errors come from the merged program, so this half worked before the
    // fix; it is here to hold the error/warning split in place. Note the message
    // is NOT path-prefixed — `validateProgramSchema` returns no module origin.
    const { status, output } = run(appTool, [join(dir, "schema-entry.aktion")]);
    expect(output).toMatch(/error: Unknown prop "nopeProp" on <Badge>/);
    expect(status).toBe(1);
  });

  it("exits 0 for warnings alone and 1 as soon as there is one error", () => {
    const warnOnly = run(appTool, [join(dir, "await-entry.aktion")]);
    expect(warnOnly.output).toMatch(/0 error\(s\), 1 warning\(s\)/);
    expect(warnOnly.status).toBe(0);

    const withError = run(appTool, [join(dir, "mixed-entry.aktion")]);
    expect(withError.output).toMatch(/1 error\(s\), 1 warning\(s\)/);
    expect(withError.status).toBe(1);
  });

  it("reports a shared module's finding once when two modules import it", () => {
    const { status, output } = run(appTool, [join(dir, "diamond-entry.aktion")]);
    const hits = output.split("\n").filter((line) => line.includes("diamond-shared.aktion"));
    expect(hits).toHaveLength(1);
    expect(output).toMatch(/0 error\(s\), 1 warning\(s\)/);
    expect(status).toBe(0);
  });
});
