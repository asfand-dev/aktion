#!/usr/bin/env node
/**
 * Validate a MULTI-MODULE Aktion app: link the import graph from an entry file,
 * then schema-check the merged program against the component library. Modules
 * may be written in `.aktion`, `.aktion.js` or `.aktion.ts` — each is compiled
 * by the same frontend the Vite plugin uses, so the JavaScript-semantics rules
 * (E1xx / W2xx) and TypeScript erasure errors are reported here too.
 *
 * `tools/validate-aktion.mjs` handles single, self-contained programs. An app
 * split across `import`ed modules needs the linker first, otherwise every
 * imported name reads as an unknown identifier.
 *
 * Usage:
 *   node tools/validate-aktion-app.mjs path/to/app.aktion
 *   node tools/validate-aktion-app.mjs --alias @acme/ui=libs/ui/src app.aktion
 *   node tools/validate-aktion-app.mjs --root ../shared app.aktion
 *
 * Module resolution matches the Vite plugin's exactly — same `createNodeResolver`,
 * same `aktion.config.json` discovery — so an import this tool accepts is one the
 * build accepts. `--alias`/`--root` are merged over anything the config declares.
 *
 * Prints `Lnn: message` for each link or schema problem. Exits non-zero on any
 * error; warnings are reported but do not fail the run.
 *
 * Reads the built DOM-free surface (`dist/language.js`) and the Node plugin entry
 * (`dist/plugin.js`) — run `npm run build` first if either is missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolvePath(here, "../dist/language.js");
const pluginBundle = resolvePath(here, "../dist/plugin.js");

for (const [path, script] of [
  [bundle, "npm run build:language"],
  [pluginBundle, "npm run build:plugin"],
]) {
  if (!existsSync(path)) {
    console.error(`${path} not found. Run \`${script}\` (or \`npm run build\`) first.`);
    process.exit(2);
  }
}

const { linkProgram, validateProgramSchema, defaultLibrary, defaultFrontends, getLintWarnings } =
  await import(pathToFileURL(bundle).href);
const { createNodeResolver, loadAktionConfig, mergeResolveOptions, tryLoadTypeScriptFrontend } = await import(
  pathToFileURL(pluginBundle).href
);
// `.aktion.ts` modules need `ts-blank-space`; without it each one reports what
// to install instead of failing the whole run.
const frontends = { ...defaultFrontends, typescript: await tryLoadTypeScriptFrontend() };

// ---- arguments -------------------------------------------------------------
// `--alias name=dir` and `--root dir` are repeatable; everything else is the entry.
const argv = process.argv.slice(2);
const cliAlias = {};
const cliRoots = [];
let entry = null;

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--alias") {
    const pair = argv[++i] ?? "";
    const eq = pair.indexOf("=");
    if (eq < 1) {
      console.error(`usage: --alias <prefix>=<dir> (got "${pair}")`);
      process.exit(2);
    }
    cliAlias[pair.slice(0, eq)] = resolvePath(pair.slice(eq + 1));
  } else if (arg === "--root") {
    cliRoots.push(resolvePath(argv[++i] ?? ""));
  } else if (entry === null) {
    entry = arg;
  } else {
    console.error("usage: node tools/validate-aktion-app.mjs [--alias p=dir] [--root dir] <entry.aktion>");
    process.exit(2);
  }
}

if (entry === null) {
  console.error("usage: node tools/validate-aktion-app.mjs [--alias p=dir] [--root dir] <entry.aktion>");
  process.exit(2);
}

const entryPath = resolvePath(entry);
if (!existsSync(entryPath)) {
  console.log(`${entry}: READ ERROR: no such file`);
  process.exit(1);
}

// The entry's own directory is the default root; a config file (or --root) widens
// it. Confinement is what stops a crafted `../../../../etc/passwd` from being read.
const resolution = mergeResolveOptions(loadAktionConfig(entryPath), {
  alias: cliAlias,
  roots: cliRoots,
});
const resolver = createNodeResolver({ ...resolution, root: dirname(entryPath) });

let result;
let entrySource;
try {
  entrySource = readFileSync(entryPath, "utf8");
  // Three arguments: the entry's SOURCE, its path, and the resolver. Passing only
  // (path, resolver) type-checks at runtime but parses the *path string* as the
  // program — a graph with no imports, no components and therefore no findings,
  // which reports OK for every input including a file that does not link at all.
  result = linkProgram(entrySource, entryPath, resolver, { frontends });
} catch (e) {
  console.log(`LINK ERROR: ${e && e.message ? e.message : String(e)}`);
  process.exit(1);
}

let errorCount = 0;
let warningCount = 0;

const report = (line, severity, message) => {
  if (severity === "warning") warningCount += 1;
  else errorCount += 1;
  console.log(`L${line ?? 0}: ${severity}: ${message}`);
};

for (const d of result.diagnostics ?? []) {
  report(d.line, d.severity ?? "error", d.message);
}
for (const e of result.program?.errors ?? []) {
  report(e.line, "error", e.message);
}

if (result.program) {
  for (const e of validateProgramSchema(result.program, defaultLibrary)) {
    report(e.line, "error", e.message);
  }

  // The lint pass takes SOURCE, not a Program — so it runs over the entry and
  // every module the linker loaded, on the Aktion text each module's frontend
  // parsed (`LinkResult.modules[i].aktionSource`): for a `.aktion.ts` module
  // that is the type-erased text, same lines and columns as the file.
  //
  // It used to run over `printProgram(result.program)` instead, and that was
  // silently vacuous. Three things went wrong at once, and each on its own was
  // enough to swallow every finding in every imported module:
  //
  //   1. the printed text does not re-parse — the formatter emits object
  //      shorthand (`{state}`) where the parser demands `key: value`;
  //   2. `getLintWarnings` returns `[]` for source it cannot parse rather than
  //      reporting that it could not, so (1) reads as "nothing to report";
  //   3. `await` is printed as the internal marker `@__rui_await__(…)`, which no
  //      lint rule matches — so even a clean re-parse would miss the one warning
  //      that fires most often in real code.
  //
  // Linting each module's own text is better than fixing the round-trip anyway:
  // the line numbers point at what the author wrote, and the message can name
  // the file. The linker already read every module, so nothing is re-read.
  for (const module of result.modules ?? []) {
    const where = module.path === entryPath ? "" : `${module.path}: `;
    for (const w of getLintWarnings(module.aktionSource, defaultLibrary)) {
      report(w.line, "warning", `${where}${w.message}`);
    }
  }
}

if (errorCount === 0 && warningCount === 0) {
  console.log(`${entry}: OK`);
} else {
  console.log(`\n${errorCount} error(s), ${warningCount} warning(s)`);
}
process.exit(errorCount > 0 ? 1 : 0);
