#!/usr/bin/env node
/**
 * Generate the two assets the JetBrains plugin ships but does not author:
 *
 *   server/server.mjs                        — the bundled Aktion language server
 *   textmate/bundles/aktion/…                — the TextMate grammar for colouring
 *
 * Run by the Gradle `syncAssets` task before `prepareSandbox` / `buildPlugin`,
 * so a plugin build can never ship a grammar or a server that disagrees with the
 * runtime. Both output folders are generated — do not hand-edit them, and do not
 * commit them (see .gitignore).
 *
 * WHY A SECOND GRAMMAR (this one differs from editors/vscode's)
 * ------------------------------------------------------------
 * `editors/vscode/scripts/gen-grammar.mjs` produces a *thin overlay* grammar: it
 * `include`s VS Code's built-in `source.ts` and only adds the Aktion-specific
 * scopes on top. That is the right call there — Aktion is a strict subset of
 * TypeScript, and VS Code always has the TypeScript grammar available.
 *
 * IntelliJ's TextMate support ships its own bundle set, and whether `source.ts`
 * resolves depends on the IDE and the user's enabled bundles. A grammar that
 * relied on it would silently lose comments, strings, and numbers in the IDEs
 * where it does not. So this grammar is SELF-CONTAINED — it carries its own
 * comment/string/number/keyword patterns — and still tries `source.ts` last, so
 * where TypeScript *is* available we gain its extra fidelity for free.
 *
 * The vocabulary (keywords, atoms, `$`-builtins) is read from the runtime's own
 * `grammarSpec` + `builtinCatalog`, exactly like the VS Code generator, so adding
 * a builtin colours it in both editors with no hand-editing anywhere.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const repoRoot = resolve(pluginRoot, "../..");
const lspRoot = resolve(repoRoot, "editors/lsp");

/* -------------------------------------------------------------------------- */
/*  1. The language server                                                    */
/* -------------------------------------------------------------------------- */

async function bundleServer() {
  const built = resolve(lspRoot, "dist/server.mjs");
  if (!existsSync(built)) {
    // Build it rather than failing: a fresh clone should be able to run
    // `./gradlew buildPlugin` without a separate manual step.
    console.log("editors/lsp/dist/server.mjs missing — building it…");
    const { default: process_ } = await import("node:child_process");
    const result = process_.spawnSync(process.execPath, ["esbuild.mjs"], {
      cwd: lspRoot,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(
        "Failed to build editors/lsp. Run `npm install` at the repo root first " +
          "(the bundler comes from the root devDependencies).",
      );
    }
  }

  const outDir = resolve(pluginRoot, "server");
  await mkdir(outDir, { recursive: true });
  await copyFile(built, resolve(outDir, "server.mjs"));

  const { size } = await readFile(built).then((b) => ({ size: b.byteLength }));
  console.log(`Bundled language server → server/server.mjs (${Math.round(size / 1024)} kB)`);
}

/* -------------------------------------------------------------------------- */
/*  2. The TextMate bundle                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the language surface from the repo's built DOM-free entry, falling
 * back to bundling the TypeScript source — the same two-step the VS Code
 * generators use, so this works before a root `npm run build`.
 */
async function loadSurface() {
  const built = resolve(repoRoot, "dist/language.js");
  if (existsSync(built)) {
    const mod = await import(pathToFileURL(built).href);
    if (Array.isArray(mod.builtinCatalog) && mod.grammarSpec) return mod;
  }
  const { build } = await import("esbuild");
  const out = resolve(here, ".sync-assets.tmp.mjs");
  await build({
    entryPoints: [resolve(repoRoot, "src/language-api.ts")],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  try {
    return await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  } finally {
    await rm(out, { force: true });
    await rm(`${out}.map`, { force: true });
  }
}

function buildGrammar(surface) {
  const { grammarSpec, builtinCatalog } = surface;
  const builtins = builtinCatalog.map((b) => b.name).join("|");
  const keywords = grammarSpec.keywords.join("|");
  const atoms = grammarSpec.atoms.join("|");

  return {
    $schema:
      "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    name: "Aktion",
    scopeName: "source.aktion",
    fileTypes: ["aktion"],
    comment:
      "GENERATED by editors/jetbrains/scripts/sync-assets.mjs — do not edit by hand. " +
      "Self-contained (IntelliJ cannot be relied on to have source.ts), with source.ts " +
      "included last for extra fidelity where it is available.",
    patterns: [
      { include: "#comments" },
      { include: "#strings" },
      { include: "#aktion-builtin" },
      { include: "#aktion-state" },
      { include: "#aktion-component-call" },
      { include: "#keywords" },
      { include: "#constants" },
      { include: "#numbers" },
      { include: "#operators" },
      // TypeScript last: our scopes win, and where `source.ts` is registered it
      // picks up everything we did not model (regex literals, decorators, …).
      { include: "source.ts" },
    ],
    repository: {
      comments: {
        patterns: [
          {
            name: "comment.block.documentation.aktion",
            begin: "/\\*\\*",
            end: "\\*/",
          },
          { name: "comment.block.aktion", begin: "/\\*", end: "\\*/" },
          { name: "comment.line.double-slash.aktion", match: "//.*$" },
        ],
      },
      strings: {
        patterns: [
          {
            name: "string.template.aktion",
            begin: "`",
            end: "`",
            patterns: [
              { name: "constant.character.escape.aktion", match: "\\\\." },
              {
                name: "meta.template.expression.aktion",
                begin: "\\$\\{",
                end: "\\}",
                patterns: [{ include: "$self" }],
              },
            ],
          },
          {
            name: "string.quoted.double.aktion",
            begin: '"',
            end: '"',
            patterns: [{ name: "constant.character.escape.aktion", match: "\\\\." }],
          },
          {
            name: "string.quoted.single.aktion",
            begin: "'",
            end: "'",
            patterns: [{ name: "constant.character.escape.aktion", match: "\\\\." }],
          },
        ],
      },
      "aktion-builtin": {
        comment: "Runtime $-builtins (hooks, factories, namespaces) — from builtinCatalog.",
        match: `\\$(?:${builtins})\\b`,
        name: "support.function.builtin.aktion",
      },
      "aktion-state": {
        comment: "Reactive state references like $count, $user — the `$` sigil is the marker.",
        match: "\\$[A-Za-z_][A-Za-z0-9_]*",
        name: "variable.language.aktion.state",
      },
      "aktion-component-call": {
        comment: "PascalCase component invocations like Card( / Button(.",
        match: "\\b([A-Z][A-Za-z0-9_]*)(?=\\s*\\()",
        captures: { 1: { name: "entity.name.type.component.aktion" } },
      },
      keywords: {
        comment: "Language keywords + reserved handles — from grammarSpec.keywords.",
        match: `\\b(?:${keywords})\\b`,
        name: "keyword.control.aktion",
      },
      constants: {
        match: `\\b(?:${atoms})\\b`,
        name: "constant.language.aktion",
      },
      numbers: {
        patterns: [
          { name: "constant.numeric.hex.aktion", match: "\\b0[xX][0-9a-fA-F_]+n?\\b" },
          { name: "constant.numeric.binary.aktion", match: "\\b0[bB][01_]+n?\\b" },
          { name: "constant.numeric.octal.aktion", match: "\\b0[oO][0-7_]+n?\\b" },
          {
            name: "constant.numeric.decimal.aktion",
            match: "\\b[0-9][0-9_]*(?:\\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?n?\\b",
          },
        ],
      },
      operators: {
        patterns: [
          { name: "keyword.operator.aktion", match: "\\.\\.\\.|=>|\\?\\.|\\?\\?|===|!==|==|!=|<=|>=|&&|\\|\\||\\+\\+|--|[-+*/%!<>=?:]" },
        ],
      },
    },
  };
}

/**
 * IntelliJ reads TextMate bundles in the VS Code extension layout, so the bundle
 * is shaped exactly like one: a `package.json` declaring the grammar and the
 * language configuration.
 */
function buildBundleManifest(version) {
  return {
    name: "aktion-textmate",
    displayName: "Aktion",
    description: "TextMate grammar for the Aktion DSL. Generated — do not edit.",
    version,
    engines: { vscode: "*" },
    contributes: {
      languages: [
        {
          id: "aktion",
          aliases: ["Aktion"],
          extensions: [".aktion"],
          configuration: "./language-configuration.json",
        },
      ],
      grammars: [
        {
          language: "aktion",
          scopeName: "source.aktion",
          path: "./syntaxes/aktion.tmLanguage.json",
        },
      ],
    },
  };
}

async function writeBundle(surface, version) {
  const bundleDir = resolve(pluginRoot, "textmate/bundles/aktion");
  await mkdir(resolve(bundleDir, "syntaxes"), { recursive: true });

  const grammar = buildGrammar(surface);
  await writeFile(
    resolve(bundleDir, "syntaxes/aktion.tmLanguage.json"),
    `${JSON.stringify(grammar, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(bundleDir, "package.json"),
    `${JSON.stringify(buildBundleManifest(version), null, 2)}\n`,
    "utf8",
  );

  // Reuse the VS Code extension's language configuration verbatim: comment
  // toggling, brace matching, and the `$`-inclusive word pattern should behave
  // identically in both editors, and there is no reason to maintain two.
  await copyFile(
    resolve(repoRoot, "editors/vscode/language-configuration.json"),
    resolve(bundleDir, "language-configuration.json"),
  );

  console.log(
    `Generated TextMate bundle → textmate/bundles/aktion ` +
      `(${surface.builtinCatalog.length} builtins, ${surface.grammarSpec.keywords.length} keywords)`,
  );
}

/* -------------------------------------------------------------------------- */

async function main() {
  const pluginVersion = (await readFile(resolve(pluginRoot, "gradle.properties"), "utf8"))
    .split("\n")
    .find((line) => line.startsWith("pluginVersion"))
    ?.split("=")[1]
    ?.trim() ?? "0.0.0";

  await bundleServer();
  await writeBundle(await loadSurface(), pluginVersion);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
