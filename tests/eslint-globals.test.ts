/**
 * `aktion-runtime/eslint`'s `aktionGlobals` is built from `src/dsl/manifest.json`
 * alone (so the eslint bundle does not carry the component library); this file
 * compares it with the catalogues and the runtime. Three layers guard it:
 *
 *   1. the first describe block compares it with the catalogues and the manifest
 *      lists, which only checks the record against its own inputs;
 *   2. `tests/dsl-types.test.ts` checks the manifest against what the runtime
 *      binds (every `injected` and `hostGlobals` name, and the component and
 *      `$`-name lists);
 *   3. the runtime probe below, which asks the runtime which names it resolves
 *      and requires `no-undef` to know every one. It only tries names that exist
 *      on the test realm's `globalThis` (`Object.getOwnPropertyNames`), such as
 *      `structuredClone`; it cannot notice a new injected binding that is not a
 *      global (a route-style name, a component, a `$`-builtin), which layers 1
 *      and 2 cover.
 *
 * The corpus sweep then runs `no-undef` over every real `.aktion` file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Linter, type Linter as LinterTypes } from "eslint";
import tsParser from "@typescript-eslint/parser";
import aktionEslintPlugin, { aktionGlobals } from "../src/eslint-api.js";
import { render, cleanup, flush } from "../src/testing/index.js";
import { setGlobalAccessPolicy } from "../src/runtime/evaluator.js";
import { getComponentCatalog } from "../src/language/components.js";
import { builtinCatalog } from "../src/language/builtins.js";
import { namespaceCatalog } from "../src/language/namespaces.js";
import { parse } from "../src/parser/index.js";
import { walk } from "../src/parser/walk.js";
import type { DestructuringBinding } from "../src/parser/types.js";
import manifest from "../src/dsl/manifest.json";

describe("aktionGlobals mirrors the catalogues and the manifest", () => {
  it("declares every library component", () => {
    const missing = getComponentCatalog().map((c) => c.name).filter((name) => !(name in aktionGlobals));
    expect(missing).toEqual([]);
  });

  it("declares every `$`-builtin and `$`-namespace with its sigil", () => {
    const missing = [...builtinCatalog, ...namespaceCatalog].map((e) => e.sigil).filter((name) => !(name in aktionGlobals));
    expect(missing).toEqual([]);
  });

  it("declares every injected name in the DSL manifest", () => {
    // `route`, `params`, `outlet`, `children`, `slots`, `cleanup`, the tracked
    // timers and the legacy `aktion` / `theme` roots.
    const missing = manifest.injected.filter((name) => !(name in aktionGlobals));
    expect(missing).toEqual([]);
    expect(aktionGlobals).toMatchObject({ route: "readonly", params: "readonly", setTimeout: "readonly" });
  });

  it("declares the host names the generated globals.d.ts declares", () => {
    expect(manifest.hostGlobals).toEqual(["atob", "btoa", "console", "structuredClone"]);
    const missing = manifest.hostGlobals.filter((name) => !(name in aktionGlobals));
    expect(missing).toEqual([]);
  });

  it("declares nothing the catalogues and the manifest do not", () => {
    const known = new Set<string>([
      ...getComponentCatalog().map((c) => c.name),
      ...builtinCatalog.map((e) => e.sigil),
      ...namespaceCatalog.map((e) => e.sigil),
      ...manifest.injected,
      ...manifest.hostGlobals,
    ]);
    expect(Object.keys(aktionGlobals).filter((name) => !known.has(name))).toEqual([]);
  });

  it("only uses access levels ESLint's flat config accepts, writable only for the legacy roots", () => {
    const writable = Object.entries(aktionGlobals).filter(([, access]) => access === "writable").map(([name]) => name);
    expect(writable.sort()).toEqual(["aktion", "theme"]);
    expect(new Set(Object.values(aktionGlobals))).toEqual(new Set(["readonly", "writable"]));
  });

  it("is the same record on the plugin object and in configs.recommended", () => {
    expect(aktionEslintPlugin.globals).toBe(aktionGlobals);
    const block = aktionEslintPlugin.configs?.recommended;
    const virtualBlock = (block as LinterTypes.Config[]).find((c) => c.files?.[0] === "**/*.aktion/*.ts");
    expect(virtualBlock?.languageOptions?.globals).toEqual(aktionGlobals);
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
   * What `no-undef` may still report once `aktionGlobals` is applied — and
   * nothing else. These are host globals a program reaches through the
   * global-access policy (`"all"` by default); the consumer's environment
   * provides them (`languageOptions.globals`, e.g. the `globals` package's
   * `browser` set), so `aktion-runtime` deliberately does not declare them. The
   * ES built-ins (`Math`, `Promise`, …) come from ESLint's own `ecmaVersion`.
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
   * declarations, so `no-undef` reports them whatever `aktionGlobals` holds; they are
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
      // A program binding keyword-less names equal to an injected one (`aktion`,
      // `slots`, `$query`, `$form` each occur once in this corpus) must not hide
      // that name from the report, or a gap in `aktionGlobals` would go unseen.
      if (!own.has(name) || name in aktionGlobals) names.add(name);
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
    // A subset, not an equality: the first CI run did not report `URL` although
    // local runs on Node 22.23.3, 24.19.0 and 24.21.0 (CI's version) all did
    // with the same ESLint 10.12.0, and the cause is unknown. What must never
    // appear here is a name the runtime injects.
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

describe("every name the runtime resolves is known to no-undef", () => {
  afterEach(() => {
    cleanup();
    setGlobalAccessPolicy("all");
  });

  async function boundNames(candidates: readonly string[], policy: "safe" | readonly string[]): Promise<string[]> {
    setGlobalAccessPolicy(policy as never);
    // A name the runtime cannot resolve evaluates to `null`; `== null` is the probe.
    const screen = render(`$app(Text(JSON.stringify([${candidates.map((name) => `${name} == null`).join(", ")}])))`);
    await flush();
    await flush();
    const root = screen.shadowRoot.cloneNode(true) as ShadowRoot;
    root.querySelectorAll("style").forEach((s) => s.remove());
    const unresolved = JSON.parse((root.textContent ?? "").trim()) as boolean[];
    cleanup();
    return candidates.filter((_, index) => unresolved[index] === false);
  }

  const lintConfig: LinterTypes.Config[] = [
    ...(aktionEslintPlugin.configs!.recommended as LinterTypes.Config[]),
    {
      files: ["**/*.aktion/*.ts"],
      languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module", parserOptions: { project: false, projectService: false } },
      rules: { "no-undef": "error" },
    },
  ];

  it("no-undef reports none of the globals the runtime binds under an empty host policy", async () => {
    // With `setGlobalAccessPolicy([])` no host global passes the policy, so of
    // the candidates only the runtime's curated standard library names (`Math`,
    // `JSON`, `structuredClone`, …) still resolve. Candidates are every
    // identifier-shaped name on the test realm's global object, so this covers
    // runtime-bound names that are also globals, not new route-style bindings,
    // components or `$`-builtins.
    const candidates = Object.getOwnPropertyNames(globalThis).filter(
      (name) => /^[A-Za-z_][\w]*$/.test(name) && parse(`$app(Text(String(${name} == null)))`).errors.length === 0,
    );
    const bound = await boundNames(candidates, []);
    expect(bound, "the probe must see the runtime's own names").toEqual(expect.arrayContaining(["Math", "JSON", "structuredClone"]));

    const source = `[${bound.join(", ")}];`;
    const reported = new Set(
      new Linter()
        .verify(source, lintConfig, { filename: "app.aktion", filterCodeBlock: () => true })
        .filter((message) => message.ruleId === "no-undef")
        .map((message) => /^'(.+)' is not defined/.exec(message.message)?.[1]),
    );
    expect([...reported]).toEqual([]);
  });

  it("the host names in the manifest are really granted by the safe policy", async () => {
    const bound = await boundNames(manifest.hostGlobals, "safe");
    expect(bound).toEqual(manifest.hostGlobals);
  });
});
