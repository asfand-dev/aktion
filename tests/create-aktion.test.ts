/**
 * `create-aktion --lang aktion|ts|js` (guide §8.4.1). Each scaffold is created
 * by the real CLI, then compiled with the same frontends the Vite plugin uses
 * and driven like a user; the TypeScript sources are type-checked against the
 * committed `aktion-runtime/dsl` declarations.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAktionFile } from "../src/plugin/index.js";
import { cleanup, json, render, waitFor } from "../src/testing/index.js";
import type { AktionApp } from "../src/testing/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "create-aktion/index.mjs");
const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");

let work = "";
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "create-aktion-"));
});
afterAll(() => {
  cleanup();
  rmSync(work, { recursive: true, force: true });
});

function scaffold(name: string, args: string[]): { dir: string; status: number; output: string } {
  const run = spawnSync(process.execPath, [cli, name, "-y", ...args], { cwd: work, encoding: "utf8" });
  // eslint-disable-next-line no-control-regex
  const output = `${run.stdout}${run.stderr}`.replace(/\x1b\[[0-9;]*m/g, "");
  return { dir: join(work, name), status: run.status ?? 1, output };
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

type Todo = { id: number; title: string; isCompleted: boolean };

/** A tiny stateful fake of the /todos REST collection (as in the templates' own tests). */
function fakeApi(seed: Todo[]) {
  let items = seed.map((t) => ({ ...t }));
  let nextId = Math.max(0, ...items.map((t) => t.id)) + 1;
  return (url: string, init: { method: string; body?: unknown }) => {
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : (init.body ?? {});
    const id = Number(url.split("/").pop());
    if (method === "POST") {
      const created = { id: nextId++, title: (body as Todo).title, isCompleted: false };
      items = [...items, created];
      return json(created, 201);
    }
    if (method === "PATCH" || method === "PUT") {
      items = items.map((t) => (t.id === id ? { ...t, ...(body as Partial<Todo>) } : t));
      return json(items.find((t) => t.id === id) ?? null);
    }
    if (method === "DELETE") {
      items = items.filter((t) => t.id !== id);
      return json({ ok: true });
    }
    return json(items);
  };
}

describe("the --lang option", () => {
  it.each([
    ["aktion", "src/app.aktion"],
    ["ts", "src/app.aktion.ts"],
    ["typescript", "src/app.aktion.ts"],
    ["js", "src/app.aktion.js"],
  ])("--lang %s scaffolds the entry %s and mounts it from main.ts", (lang, entry) => {
    const { dir, status, output } = scaffold(`empty-${lang}`, ["--template", "empty", "--lang", lang]);
    expect(status, output).toBe(0);
    expect(existsSync(join(dir, entry))).toBe(true);
    expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toContain(`import app from "./${entry.slice(4)}"`);
    expect(output).toContain(`Edit ${entry}`);
    // One language per scaffold: no `.aktion` sources left behind in a TS / JS app.
    if (lang !== "aktion") expect(filesUnder(join(dir, "src")).filter((f) => f.endsWith(".aktion"))).toEqual([]);
  });

  it("the TypeScript layer ships the recommended tsconfig, ts-blank-space and the dts option", () => {
    const { dir } = scaffold("ts-config", ["--template", "todos-app", "--lang", "ts"]);
    const tsconfig = readFileSync(join(dir, "tsconfig.json"), "utf8");
    for (const option of ["allowImportingTsExtensions", "verbatimModuleSyntax", "erasableSyntaxOnly", "allowArbitraryExtensions", "allowJs", "rootDirs"]) {
      expect(tsconfig).toContain(`"${option}"`);
    }
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name: string;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("ts-config");
    expect(pkg.devDependencies["ts-blank-space"]).toBe("~0.9.0");
    expect(pkg.devDependencies.typescript).toBe("^5.9.0");
    expect(pkg.devDependencies.vitest).toBeDefined(); // merged from the template layer
    expect(pkg.scripts.typecheck).toBe("tsc");
    expect(readFileSync(join(dir, "vite.config.ts"), "utf8")).toContain("aktion({ dts: true })");
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".aktion-types");
  });

  it("refuses a template that has no variant in the language, and an unknown language", () => {
    const missing = scaffold("no-variant", ["--template", "dashboard", "--lang", "ts"]);
    expect(missing.status).toBe(1);
    expect(missing.output).toMatch(/no TypeScript \(\.aktion\.ts\) variant yet\. Available: empty, todos-app/);
    const unknown = scaffold("bad-lang", ["--lang", "rust"]);
    expect(unknown.status).toBe(1);
    expect(unknown.output).toContain('Unknown language "rust"');
  });
});

describe.each(["aktion", "ts", "js"])("the %s scaffolds run", (lang) => {
  const entryOf = (dir: string): string =>
    join(dir, lang === "aktion" ? "src/app.aktion" : `src/app.aktion.${lang}`);

  it("empty renders its hello-world tree", async () => {
    const { dir } = scaffold(`run-empty-${lang}`, ["--template", "empty", "--lang", lang]);
    const compiled = compileAktionFile(entryOf(dir), { root: join(dir, "src") });
    const screen = render("");
    (screen.container as unknown as AktionApp).mountCompiled(compiled);
    expect(await screen.findByText("Hello, Aktion", { exact: false })).toBeTruthy();
  });

  it("todos-app loads, adds, toggles and deletes against a fake API", async () => {
    const { dir } = scaffold(`run-todos-${lang}`, ["--template", "todos-app", "--lang", lang]);
    const compiled = compileAktionFile(entryOf(dir), { root: join(dir, "src") });
    const screen = render("", {
      fetch: fakeApi([
        { id: 1, title: "Buy oat milk", isCompleted: false },
        { id: 2, title: "Walk the dog", isCompleted: true },
      ]),
    });
    (screen.container as unknown as AktionApp).mountCompiled(compiled);
    // The TS / JS rows also name each checkbox after its todo (a visually hidden
    // label), so a title can match twice.
    expect((await screen.findAllByText("Buy oat milk", { exact: false })).length).toBeGreaterThan(0);

    await screen.user.type(screen.getByPlaceholderText("What needs doing?"), "Write tests");
    await screen.click("Add");
    expect((await screen.findAllByText("Write tests", { exact: false })).length).toBeGreaterThan(0);

    await screen.user.click(screen.shadowRoot.querySelector("#done-1") as HTMLInputElement);
    await waitFor(() => screen.requests.some((r) => r.method === "PATCH"));

    await screen.user.click(screen.shadowRoot.querySelector('button[aria-label="Delete"]') as HTMLButtonElement);
    await waitFor(() => screen.queryAllByText("Buy oat milk").length === 0);
    expect(screen.requests.map((r) => r.method)).toEqual(expect.arrayContaining(["GET", "POST", "PATCH", "DELETE"]));
  });
});

describe("the TypeScript scaffolds type-check", () => {
  it.each(["empty", "todos-app"])("%s", (template) => {
    const { dir } = scaffold(`tsc-${template}`, ["--template", template, "--lang", "ts"]);
    // `aktion-runtime/dsl` → the committed declarations, beside a stand-in for
    // the runtime module they take `CompiledProgram` from (no build needed).
    const stage = join(dir, ".stage");
    mkdirSync(join(stage, "dsl"), { recursive: true });
    mkdirSync(join(stage, "compiler"), { recursive: true });
    writeFileSync(join(stage, "dsl/index.d.ts"), readFileSync(join(repoRoot, "src/dsl/index.d.ts"), "utf8"));
    writeFileSync(
      join(stage, "compiler/runtime.d.ts"),
      "export interface CompiledProgram { readonly __aktionCompiled: 1; readonly program: unknown; readonly source: string; readonly path: string; readonly sourcesContent?: readonly string[] }\n",
    );
    // The Aktion modules themselves (host code and tests need the built package).
    const files = filesUnder(join(dir, "src"))
      .filter((f) => f.endsWith(".aktion.ts") || f === "types.ts")
      .map((f) => join(dir, "src", f));
    writeFileSync(
      join(dir, "tsconfig.check.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: { types: [], paths: { "aktion-runtime/dsl": ["./.stage/dsl/index.d.ts"] } },
        files,
        include: [],
      }),
    );
    const run = spawnSync(process.execPath, [tscBin, "-p", join(dir, "tsconfig.check.json")], { encoding: "utf8" });
    expect(`${run.stdout}${run.stderr}`).toBe("");
    expect(run.status).toBe(0);
  }, 60_000);
});
