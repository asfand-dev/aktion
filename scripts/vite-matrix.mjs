#!/usr/bin/env node
/**
 * Run the Aktion Vite plugin (`dist/plugin.js`) against each supported Vite
 * major: `node scripts/vite-matrix.mjs [5 6 7 8]` (default: all four).
 *
 * For every major it installs that Vite into a cached temp directory and checks,
 * on a project mixing `.aktion`, `.aktion.ts` and `.aktion.js` modules:
 *
 *   - `vite build` links the whole graph;
 *   - Vite's own TypeScript transform (esbuild in 5–7, oxc in 8) leaves the
 *     plugin's output for `.aktion.ts` ids alone, in build and in dev;
 *   - the dev server's dependency scan reports nothing — it reads `.aktion.ts`
 *     as TypeScript and would choke on the types-only `aktion-runtime/dsl`;
 *   - editing a `.aktion.ts` dependency sends an HMR update;
 *   - a `?raw` import of an Aktion module gives its text, not a program;
 *   - host code importing a named export of one fails the build (Vite 5–7
 *     with the plugin's explanation, Vite 8 with Rolldown's own error), and
 *     the dev server's module carries a stand-in for it.
 *
 * With `AKTION_VITE_MATRIX_CONTROL=1` it also runs each major WITHOUT the
 * plugin's `config()` hook and requires the dependency scan to fail there —
 * the proof that the scan check is not vacuous.
 *
 * Needs `npm run build:plugin` first, and network access the first time a
 * major is installed. The `vite-matrix` job in `.github/workflows/test.yml`
 * runs it once per major.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginBundle = join(repoRoot, "dist/plugin.js");
if (!existsSync(pluginBundle)) {
  console.error("dist/plugin.js not found. Run `npm run build:plugin` first.");
  process.exit(2);
}

const majors = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["5", "6", "7", "8"];

/** The project under test — written fresh for every major. */
const PROJECT = {
  // The dev server's dependency scan starts from the HTML entry.
  "index.html": '<!doctype html><html><body><aktion-app></aktion-app><script type="module" src="/src/main.js"></script></body></html>\n',
  // Host code imports a `.aktion.ts` entry directly: that is the file the
  // scanner reads as TypeScript, `aktion-runtime/dsl` import and all.
  "src/main.js": 'import app from "./app.aktion";\nimport typed from "./typed.aktion.ts";\nexport default [app, typed];\n',
  "src/typed.aktion.ts":
    'import { Column, Text } from "aktion-runtime/dsl"\nimport { label } from "./format.aktion.js"\nexport default $app(Column([Text(label(1))]))\n',
  "src/app.aktion": 'import { Counter } from "./counter.aktion.ts"\n$app(Counter({ title: "Count" }))\n',
  "src/counter.aktion.ts": [
    'import { Button, Column, Text } from "aktion-runtime/dsl"',
    'import { $count, increment } from "./store.aktion.ts"',
    'import { label } from "./format.aktion.js"',
    "type Props = { title: string }",
    "export function Counter({ title }: Props) {",
    "  return Column([",
    '    Text(title + ": " + label($count)),',
    '    Button("Go", { onClick: () => increment(2) }),',
    "  ])",
    "}",
    "",
  ].join("\n"),
  "src/store.aktion.ts": "export let $count: number = 0\nexport function increment(step: number = 1): void {\n  $count = $count + step\n}\n",
  "src/format.aktion.js": 'export function label(n) {\n  return "n=" + n\n}\n',
  // `?raw` asks Vite for the file's text, not the compiled program.
  "src/raw.js": 'import text from "./store.aktion.ts?raw";\nexport default text;\n',
  // Host code gets an Aktion module's default export only.
  "src/named.js": 'import { increment } from "./store.aktion.ts";\nexport default increment;\n',
};

function installVite(major) {
  const dir = join(tmpdir(), `aktion-vite-matrix-${major}`);
  if (!existsSync(join(dir, "node_modules/vite/package.json"))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `vite-${major}`, private: true, type: "module" }));
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", `vite@^${major}.0.0`], { cwd: dir, stdio: "inherit" });
  }
  return dir;
}

function writeProject() {
  // Real path: the watcher reports changes under the resolved spelling.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "aktion-vite-project-")));
  for (const [name, text] of Object.entries(PROJECT)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  // The package as a consumer has it, so `aktion-runtime/dsl` resolves through
  // the real `exports` map (types only) — what trips the dependency scanner.
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(repoRoot, join(root, "node_modules/aktion-runtime"), "dir");
  return root;
}

/** `aktion()` without its `config` hook — the control run that proves the `optimizeDeps` exclusion is needed. */
function withoutConfigHook(plugin) {
  const { config: _config, ...rest } = plugin;
  return rest;
}

async function check(major, { control = false } = {}) {
  const vite = await import(pathToFileURL(join(installVite(major), "node_modules/vite/dist/node/index.js")).href);
  const { default: aktion } = await import(pathToFileURL(pluginBundle).href);
  const root = writeProject();
  const problems = [];
  const logger = {
    info() {},
    warn(m) { problems.push(`warn: ${m}`); },
    warnOnce(m) { problems.push(`warn: ${m}`); },
    error(m) { problems.push(`error: ${m}`); },
    clearScreen() {},
    hasErrorLogged: () => false,
    hasWarned: false,
  };
  const generated = "// Generated by the Aktion Vite plugin";
  const seen = {};
  const probe = {
    name: "post-probe",
    enforce: "post",
    transform(code, id) {
      if (/\.aktion(\.[jt]s)?(?:$|\?)/.test(id)) seen[basename(id.split("?")[0])] = code;
      return null;
    },
  };
  // The emitted module imports `defineCompiledProgram` from "aktion-runtime";
  // point that at the source so only `dist/plugin.js` has to be built.
  const alias = [{ find: /^aktion-runtime$/, replacement: join(repoRoot, "src/compiler/runtime.ts") }];
  const failures = [];
  try {
    await vite.build({
      root,
      configFile: false,
      logLevel: "silent",
      customLogger: logger,
      plugins: [aktion(), probe],
      resolve: { alias },
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: join(root, "src/main.js"), preserveEntrySignatures: "strict" },
      },
    });
    const entry = seen["app.aktion"] ?? "";
    if (!entry.startsWith(generated)) failures.push("build: the entry was re-processed after the plugin");
    for (const file of ["store.aktion.ts", "format.aktion.js", "counter.aktion.ts"]) {
      if (!entry.includes(JSON.stringify(file).slice(1, -1))) failures.push(`build: ${file} is not in the linked program`);
    }

    const quiet = { ...logger, warn() {}, warnOnce() {}, error() {} };
    const buildOf = (input, { expectError = false } = {}) =>
      vite.build({
        root,
        configFile: false,
        logLevel: "silent",
        // The failing build logs its own error before rejecting.
        customLogger: expectError ? quiet : logger,
        plugins: [aktion()],
        resolve: { alias },
        build: { write: false, minify: false, rollupOptions: { input: join(root, input), preserveEntrySignatures: "strict" } },
      });
    const codeOf = (out) =>
      (Array.isArray(out) ? out : [out]).flatMap((o) => o.output ?? []).map((chunk) => chunk.code ?? "").join("\n");
    const raw = codeOf(await buildOf("src/raw.js"));
    if (!raw.includes("export let $count: number = 0") || raw.includes("defineCompiledProgram")) {
      failures.push("build: a `?raw` import of an .aktion.ts module did not give its text");
    }
    // Rollup builds (Vite 5–7) explain; Rolldown (Vite 8) keeps its own error.
    const explained = major !== "8";
    try {
      await buildOf("src/named.js", { expectError: true });
      failures.push("build: a named import of an Aktion module from host code built");
    } catch (error) {
      const message = String(error?.message ?? error);
      const expected = explained ? /gives host code only its compiled program/ : /"increment" is not exported/;
      if (!expected.test(message)) failures.push(`build: unexpected error for a named host import: ${message.split("\n")[0]}`);
    }

    const server = await vite.createServer({
      root,
      configFile: false,
      logLevel: "error",
      customLogger: logger,
      plugins: [control ? withoutConfigHook(aktion()) : aktion(), probe],
      resolve: { alias },
      server: { middlewareMode: true, ws: false, watch: null },
    });
    const sent = [];
    const hot = server.environments?.client?.hot ?? server.hot ?? server.ws;
    const send = hot.send.bind(hot);
    hot.send = (payload, ...rest) => {
      sent.push(typeof payload === "string" ? payload : payload?.type);
      return send(payload, ...rest);
    };
    try {
      const transformed = await server.transformRequest("/src/app.aktion");
      if (!transformed?.code.includes("defineCompiledProgram")) failures.push("dev: the entry did not transform");
      await server.transformRequest("/src/store.aktion.ts");
      if (!(seen["store.aktion.ts"] ?? "").startsWith(generated)) failures.push("dev: an .aktion.ts id was re-processed");
      if (!(seen["store.aktion.ts"] ?? "").includes("as increment")) failures.push("dev: no stand-in for a named export");
      await new Promise((r) => setTimeout(r, 1500)); // let the dependency scan report
      const store = join(root, "src/store.aktion.ts");
      writeFileSync(store, readFileSync(store, "utf8").replace("step: number = 1", "step: number = 3"));
      server.watcher?.emit("change", store);
      await new Promise((r) => setTimeout(r, 800));
      if (!sent.includes("update") && !sent.includes("full-reload")) failures.push("dev: no HMR message after editing a .aktion.ts dependency");
    } finally {
      await server.close();
    }
    // A dependency module requested directly is compiled as an entry and
    // warns that it renders nothing — expected for this probe.
    const unexpected = problems.filter((p) => !/CJS build of Vite/.test(p) && !/renders nothing/.test(p));
    failures.push(...unexpected.map((p) => `logged: ${p}`));
  } catch (error) {
    failures.push(`threw: ${error?.stack ?? error}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return { vite: vite.version, failures };
}

let failed = false;
for (const major of majors) {
  const { vite, failures } = await check(major);
  if (failures.length === 0) console.log(`vite ${vite}: ok`);
  else {
    failed = true;
    console.log(`vite ${vite}: FAILED\n  ${failures.join("\n  ")}`);
  }
  // Control: without the plugin's `config()` the dependency scan must fail on
  // `aktion-runtime/dsl` — otherwise the check above proves nothing.
  if (process.env.AKTION_VITE_MATRIX_CONTROL === "1") {
    const control = await check(major, { control: true });
    // Vite 5–7: `No known conditions for "./dsl" specifier`; Vite 8: `"./dsl" is not exported under the conditions`.
    const scanFailed = control.failures.some((f) => /No known conditions for "\.\/dsl"|"\.\/dsl" is not exported/.test(f));
    console.log(`vite ${control.vite} control (no config hook): ${scanFailed ? "scan fails as expected" : "scan did NOT fail"}`);
    if (!scanFailed) failed = true;
  }
}
process.exit(failed ? 1 : 0);
