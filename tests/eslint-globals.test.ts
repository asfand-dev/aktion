/**
 * `aktion-runtime/eslint`'s `globals` is a projection of the catalogues and the
 * DSL manifest that already describe every name the runtime injects. Like the
 * other editor-facing projections (`tests/language-catalogs-sync.test.ts`) it
 * can fall behind its sources, which here means `no-undef` starts reporting a
 * perfectly valid program — so the drift test fails first, and the corpus test
 * proves the object is complete against every real `.aktion` file in the repo.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Linter, type Linter as LinterTypes } from "eslint";
import tsParser from "@typescript-eslint/parser";
import aktionEslintPlugin, { globals } from "../src/eslint-api.js";
import { getComponentCatalog } from "../src/language/components.js";
import { builtinCatalog } from "../src/language/builtins.js";
import { namespaceCatalog } from "../src/language/namespaces.js";
import { parse } from "../src/parser/index.js";
import { walk } from "../src/parser/walk.js";
import type { DestructuringBinding } from "../src/parser/types.js";
import manifest from "../src/dsl/manifest.json";

describe("globals mirrors the catalogues and the manifest", () => {
  it("declares every library component", () => {
    const missing = getComponentCatalog().map((c) => c.name).filter((name) => !(name in globals));
    expect(missing).toEqual([]);
  });

  it("declares every `$`-builtin and `$`-namespace with its sigil", () => {
    const missing = [...builtinCatalog, ...namespaceCatalog].map((e) => e.sigil).filter((name) => !(name in globals));
    expect(missing).toEqual([]);
  });

  it("declares every injected name in the DSL manifest", () => {
    // `route`, `params`, `outlet`, `children`, `slots`, `cleanup`, the tracked
    // timers and the legacy `aktion` / `theme` roots.
    const missing = manifest.injected.filter((name) => !(name in globals));
    expect(missing).toEqual([]);
    expect(globals).toMatchObject({ route: "readonly", params: "readonly", setTimeout: "readonly" });
  });

  it("declares nothing the catalogues and the manifest do not", () => {
    const known = new Set<string>([
      ...getComponentCatalog().map((c) => c.name),
      ...builtinCatalog.map((e) => e.sigil),
      ...namespaceCatalog.map((e) => e.sigil),
      ...manifest.injected,
    ]);
    expect(Object.keys(globals).filter((name) => !known.has(name))).toEqual([]);
  });

  it("only uses access levels ESLint's flat config accepts, writable only for the legacy roots", () => {
    const writable = Object.entries(globals).filter(([, access]) => access === "writable").map(([name]) => name);
    expect(writable.sort()).toEqual(["aktion", "theme"]);
    expect(new Set(Object.values(globals))).toEqual(new Set(["readonly", "writable"]));
  });

  it("is the same record on the plugin object and in configs.recommended", () => {
    expect(aktionEslintPlugin.globals).toBe(globals);
    const block = aktionEslintPlugin.configs?.recommended;
    const virtualBlock = (block as LinterTypes.Config[]).find((c) => c.files?.[0] === "**/*.aktion/*.ts");
    expect(virtualBlock?.languageOptions?.globals).toEqual(globals);
  });
});

const root = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "site"]);

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith(".aktion")) out.push(full);
  }
}

describe("no-undef over every .aktion file with the plain recommended config", () => {
  /**
   * What `no-undef` still reports once `globals` is applied — and nothing else.
   * These are host globals a program reaches because the global-access policy
   * defaults to `"all"`; the consumer's environment provides them
   * (`languageOptions.globals`, e.g. the `globals` package's `browser` set), so
   * `aktion-runtime` deliberately does not declare them. The ES built-ins
   * (`Math`, `Promise`, …) come from ESLint's own `ecmaVersion`.
   */
  const HOST_GLOBALS = ["URL", "crypto", "document", "getComputedStyle", "navigator", "window"];

  const files: string[] = [];
  collect(root, files);
  files.sort();

  const config: LinterTypes.Config[] = [
    ...(aktionEslintPlugin.configs!.recommended as LinterTypes.Config[]),
    {
      files: ["**/*.aktion/*.ts"],
      languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
        parserOptions: { project: false, projectService: false },
      },
      rules: { "no-undef": "error" },
    },
  ];
  const verifyOptions = { filename: "app.aktion", filterCodeBlock: () => true };

  function patternNames(bindings: readonly DestructuringBinding[], out: Set<string>): void {
    for (const binding of bindings) {
      if (binding.name) out.add(binding.name);
      if (binding.pattern) patternNames(binding.pattern.bindings, out);
    }
  }

  /**
   * The names a program introduces with a keyword-less statement (`count = 0`,
   * `$todos = []`, `for (item of items)`). A JS linter cannot see those as
   * declarations, so `no-undef` reports them whatever `globals` holds; they are
   * the program's own bindings, not names the runtime injects, and the
   * keyword-bearing form (`let` / `const`) never produces them.
   */
  function keywordlessBindings(source: string): Set<string> {
    const names = new Set<string>();
    walk(parse(source), ({ node }) => {
      if (node.kind === "Assignment" && !node.declaration) names.add(node.isState ? `$${node.identifier}` : node.identifier);
      if (node.kind === "DestructureStatement" && !node.declaration) patternNames(node.bindings, names);
      if ((node.kind === "ForOfStatement" || node.kind === "ForInStatement") && !node.declaration) {
        names.add(node.item);
        if (node.kind === "ForOfStatement" && node.pattern) patternNames(node.pattern.bindings, names);
      }
    });
    return names;
  }

  function undeclared(source: string, cfg: LinterTypes.Config[]): Set<string> {
    const own = keywordlessBindings(source);
    const names = new Set<string>();
    for (const message of new Linter().verify(source, cfg, verifyOptions)) {
      if (message.ruleId !== "no-undef") continue;
      const name = /^'(.+)' is not defined/.exec(message.message)?.[1] ?? message.message;
      if (!own.has(name)) names.add(name);
    }
    return names;
  }

  it("found the whole corpus", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("leaves only the documented browser globals undeclared", () => {
    const names = new Set<string>();
    const parseFailures: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (parse(source).errors.length > 0) {
        parseFailures.push(relative(root, file));
        continue;
      }
      for (const name of undeclared(source, config)) names.add(name);
    }
    // A subset, not an equality: whether ESLint's own environment already knows
    // a host name such as `URL` varies between runs (it did between a local run
    // and CI), and that is not what this checks. What must never appear here is
    // a name the runtime injects.
    expect([...names].filter((name) => !HOST_GLOBALS.includes(name))).toEqual([]);
    expect(["document", "window"].filter((name) => !names.has(name))).toEqual([]);
    // A file this repo's own parser rejects is skipped (the validate sweep owns
    // those); the corpus must not quietly shrink to nothing.
    expect(parseFailures.length).toBeLessThan(files.length / 10);
  });

  it("would report the injected names without the globals block (the check measures something)", () => {
    const withoutGlobals = config.map((c) => (c.name === "aktion/recommended/rules" ? { ...c, languageOptions: { globals: {} } } : c));
    const names = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (parse(source).errors.length > 0) continue;
      for (const name of undeclared(source, withoutGlobals)) names.add(name);
    }
    for (const name of ["route", "Container", "$state"]) expect(names, name).toContain(name);
  });
});
