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
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appTool = join(repoRoot, "tools", "validate-aktion-app.mjs");
const fileTool = join(repoRoot, "tools", "validate-aktion.mjs");

// The tools read the built bundles. Skip rather than fail when the working tree
// has not been built — `npm run build` is not a precondition of `npm test`.
const built =
  existsSync(join(repoRoot, "dist", "language.js")) && existsSync(join(repoRoot, "dist", "plugin.js"));

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

describe.skipIf(!built)("tools/validate-aktion-app.mjs", () => {
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

describe.skipIf(!built)("tools/validate-aktion.mjs", () => {
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
