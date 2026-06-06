#!/usr/bin/env node
/**
 * create-aktion — scaffold a new Aktion app.
 *
 *   npm  create aktion@latest my-app
 *   pnpm create aktion my-app
 *   yarn create aktion my-app
 *   npx  create-aktion my-app --template dashboard
 *
 * Zero runtime dependencies (uses only Node built-ins), interactive when run
 * with no project name / template in a TTY, fully flag-driven otherwise
 * (CI-friendly).
 *
 * Each scaffold is assembled from two layers under `template/`:
 *   _base/        shared config (package.json, vite/tsconfig, index.html, main.ts, .vscode)
 *   <template>/   the content overlay (.aktion sources, tests, README, extra deps)
 * The overlay's `package.json` is deep-merged onto the base one.
 */

import { cp, readFile, writeFile, rename, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));

// Template name → one-line description (order = menu order; first is default).
const TEMPLATES = {
  empty: "Minimal hello-world starter (no tests)",
  dashboard: "Home-automation control panel — store, charts, live controls",
  website: "Pet-sitting company site — router pages + validated contact form",
  "todos-app": "REST CRUD todos — $http create/toggle/edit/delete",
  chatbot: "OpenAI chatbot — settings, transcript, offline echo fallback",
  portfolio: "Developer portfolio — projects filter, timeline, contact form",
};
const TEMPLATE_NAMES = Object.keys(TEMPLATES);
const DEFAULT_TEMPLATE = "empty";
// Backwards-compat: the old single template name maps to `empty`.
const ALIASES = { "vite-ts": "empty" };

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function parseArgs(argv) {
  const opts = { name: undefined, template: undefined, pm: undefined, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-y" || a === "--yes") opts.yes = true;
    else if (a === "--template" || a === "-t") opts.template = argv[++i];
    else if (a.startsWith("--template=")) opts.template = a.slice("--template=".length);
    else if (a === "--pm") opts.pm = argv[++i];
    else if (a.startsWith("--pm=")) opts.pm = a.slice("--pm=".length);
    else if (!a.startsWith("-") && opts.name === undefined) opts.name = a;
  }
  return opts;
}

/** Resolve user input (name / alias) to a canonical template, or null. */
function resolveTemplate(input) {
  if (!input) return null;
  const key = String(input).trim().toLowerCase();
  if (TEMPLATES[key]) return key;
  if (ALIASES[key]) return ALIASES[key];
  return null;
}

function printHelp() {
  const list = TEMPLATE_NAMES.map((n) => `      ${n.padEnd(11)} ${c.dim(TEMPLATES[n])}`).join("\n");
  console.log(`
${c.bold("create-aktion")} — scaffold a new Aktion app

${c.bold("Usage")}
  npm create aktion@latest ${c.dim("<project-name> [options]")}
  npx create-aktion ${c.dim("<project-name> [options]")}

${c.bold("Options")}
  -t, --template <name>   Template to use. Default: ${DEFAULT_TEMPLATE}
${list}
      --pm <manager>      Package manager for the printed next-steps (npm | pnpm | yarn | bun)
  -y, --yes               Skip prompts (use defaults; required in CI / non-TTY)
  -h, --help              Show this help

${c.bold("Examples")}
  npm create aktion@latest my-app
  npm create aktion@latest my-app -- --template dashboard
  npx create-aktion my-app -y --template todos-app
`);
}

/** Detect the package manager that invoked us (npm/pnpm/yarn/bun). */
function detectPm() {
  const ua = process.env.npm_config_user_agent || "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

function runCmds(pm) {
  if (pm === "yarn") return { install: "yarn", dev: "yarn dev", test: "yarn test" };
  if (pm === "pnpm") return { install: "pnpm install", dev: "pnpm dev", test: "pnpm test" };
  if (pm === "bun") return { install: "bun install", dev: "bun run dev", test: "bun run test" };
  return { install: "npm install", dev: "npm run dev", test: "npm test" };
}

async function isEmptyDir(dir) {
  if (!existsSync(dir)) return true;
  const entries = await readdir(dir);
  return entries.filter((e) => e !== ".git").length === 0;
}

/** Deep-merge plain objects (arrays and scalars are replaced, not merged). */
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (Array.isArray(over) || typeof over !== "object" || over === null) return over;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return { ...over };
  const out = { ...base };
  for (const key of Object.keys(over)) out[key] = deepMerge(base[key], over[key]);
  return out;
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  const interactive = process.stdin.isTTY && !opts.yes;
  let rl;
  const ask = async (q, def) => {
    if (!interactive) return def;
    rl ??= createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`${q} ${c.dim(`(${def})`)} `)).trim();
    return answer || def;
  };

  try {
    // Resolve the template: explicit flag → validate; otherwise prompt (TTY) or
    // fall back to the default.
    let template;
    if (opts.template !== undefined) {
      template = resolveTemplate(opts.template);
      if (!template) {
        console.error(c.red(`Unknown template "${opts.template}". Available: ${TEMPLATE_NAMES.join(", ")}`));
        process.exit(1);
      }
    } else if (interactive) {
      console.log(`\n${c.bold("Choose a template:")}`);
      TEMPLATE_NAMES.forEach((n, i) => {
        console.log(`  ${c.cyan(String(i + 1))}. ${c.bold(n)} ${c.dim("— " + TEMPLATES[n])}`);
      });
      const answer = await ask("\nTemplate (number or name):", DEFAULT_TEMPLATE);
      const byIndex = TEMPLATE_NAMES[Number(answer) - 1];
      template = resolveTemplate(byIndex ?? answer);
      if (!template) {
        console.error(c.red(`Unknown template "${answer}". Available: ${TEMPLATE_NAMES.join(", ")}`));
        process.exit(1);
      }
    } else {
      template = DEFAULT_TEMPLATE;
    }

    let name = opts.name ?? (await ask("Project name:", "aktion-app"));
    name = name.trim().replace(/\/+$/, "");
    if (!name) {
      console.error(c.red("A project name is required."));
      process.exit(1);
    }

    const target = resolve(process.cwd(), name);
    if (!(await isEmptyDir(target))) {
      console.error(c.red(`Directory "${name}" already exists and is not empty.`));
      process.exit(1);
    }

    // Assemble the scaffold: shared base, then the template overlay on top.
    const layers = [join(here, "template", "_base"), join(here, "template", template)];
    await mkdir(target, { recursive: true });
    for (const layer of layers) {
      await cp(layer, target, { recursive: true, force: true });
    }

    // Deep-merge package.json across layers (base provides deps + dev/build,
    // the overlay adds test deps/scripts), then stamp the project name.
    let pkg = {};
    for (const layer of layers) {
      const lp = join(layer, "package.json");
      if (existsSync(lp)) pkg = deepMerge(pkg, JSON.parse(await readFile(lp, "utf8")));
    }
    pkg.name = basename(target);
    await writeFile(join(target, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

    // Templates ship dot-files/-dirs with a `_` prefix (npm strips a real
    // `.gitignore` from published packages, and leading-dot dirs are fragile);
    // restore them on scaffold.
    const ignoreSrc = join(target, "_gitignore");
    if (existsSync(ignoreSrc)) await rename(ignoreSrc, join(target, ".gitignore"));
    // `_vscode/` → `.vscode/` — recommends the Aktion extension and enables
    // format-on-save + semantic highlighting for `.aktion` files.
    const vscodeSrc = join(target, "_vscode");
    if (existsSync(vscodeSrc)) await rename(vscodeSrc, join(target, ".vscode"));

    // Stamp the project name into the page <title>.
    const htmlPath = join(target, "index.html");
    if (existsSync(htmlPath)) {
      const html = await readFile(htmlPath, "utf8");
      await writeFile(htmlPath, html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pkg.name)}</title>`), "utf8");
    }

    const pm = opts.pm ?? detectPm();
    const cmds = runCmds(pm);
    const hasTests = !!(pkg.scripts && pkg.scripts.test);
    console.log(`
${c.green("✔")} Created ${c.bold(name)} ${c.dim(`(${template})`)}

${c.bold("Next steps:")}
  ${c.cyan(`cd ${name}`)}
  ${c.cyan(cmds.install)}
  ${c.cyan(cmds.dev)}${hasTests ? `\n  ${c.cyan(cmds.test)} ${c.dim("# run the unit tests")}` : ""}

Then open ${c.cyan("http://localhost:5173")}. Edit ${c.cyan("src/app.aktion")} and your UI hot-reloads.
${c.dim("Docs: https://asfand-dev.github.io/aktion/")}
`);
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error(c.red(err?.message ?? String(err)));
  process.exit(1);
});
