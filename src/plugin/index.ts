/**
 * `aktion-runtime/vite` — the Vite/Rollup plugin for `.aktion` files.
 *
 * It compiles each `.aktion` module at build time by running the browser-safe
 * {@link linkProgram} (the same linker the in-page `linkProject` uses) over a
 * Node-filesystem resolver, then emits a tiny ES module that default-exports a
 * `CompiledProgram`. So `import app from "./app.aktion"` gives you the
 * pre-parsed, schema-aware, cross-file-linked program — `el.mountCompiled(app)`
 * renders it without the parser ever running in the browser.
 *
 * This is the ONLY module that imports `vite`/`node:*`; it ships as a separate
 * Node entry (`dist/plugin.{js,cjs}`) and never enters the browser bundle.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath, sep } from "node:path";
import type { Plugin } from "vite";
import {
  linkProgram,
  COMPILED_PROGRAM_VERSION,
  type ModuleResolver,
  type LinkDiagnostic,
} from "../compiler/index.js";
import type { Program } from "../parser/types.js";

export interface AktionPluginOptions {
  /** Treat linker warnings (e.g. a missing `aktion` entry) as build errors. Default: false. */
  strict?: boolean;
  /** Specifier the emitted module imports the runtime helper from. Default: `"aktion-runtime"`. */
  runtimeModuleId?: string;
  /**
   * Allow `.aktion` imports to resolve outside the Vite project root.
   *
   * Off by default: an import is a filesystem read performed by the build (and,
   * in `serve` mode, one whose result reaches the browser), so it is confined to
   * the project. Enable only for a monorepo layout that genuinely imports
   * `.aktion` files from a sibling package, and only for trusted sources.
   */
  allowOutsideRoot?: boolean;
}

/**
 * Add to `vite.config.ts`:
 *
 *   import aktion from "aktion-runtime/vite";
 *   export default { plugins: [aktion()] };
 */
export function aktionPlugin(options: AktionPluginOptions = {}): Plugin {
  const runtimeModuleId = options.runtimeModuleId ?? "aktion-runtime";
  let isServe = false;
  let projectRoot = process.cwd();

  return {
    name: "aktion",
    enforce: "pre",
    configResolved(config) {
      isServe = config.command === "serve";
      // Confine `.aktion` imports to the project. Without a root, a crafted
      // import in a `.aktion` file reads any file the dev-server process can —
      // and in `serve` mode its contents are then handed to the browser.
      if (config.root) projectRoot = resolvePath(config.root);
    },
    transform(code, id) {
      if (!isAktionId(id)) return null;
      const cleanId = stripQuery(id);

      const { program, diagnostics, dependencies } = linkProgram(
        code,
        cleanId,
        nodeResolver(options.allowOutsideRoot === true ? null : projectRoot),
      );

      // Editing an imported module must re-trigger the entry's transform.
      for (const dep of dependencies) this.addWatchFile(dep);

      // A linked program with no `aktion` entry binding renders nothing.
      const warnings: LinkDiagnostic[] = [...diagnostics];
      if (!hasEntryBinding(program)) {
        warnings.push({
          line: 1,
          column: 1,
          severity: "warning",
          message:
            "No top-level `aktion = …` entry binding found — this program renders nothing.",
        });
      }

      const fatal = warnings.find((d) => d.severity === "error" || (options.strict && d.severity === "warning"));
      if (fatal) {
        return this.error({ message: fatal.message, id: cleanId, loc: { file: cleanId, line: fatal.line, column: fatal.column } });
      }
      for (const w of warnings) {
        if (w.severity === "warning") this.warn(w.message);
      }

      const moduleCode = emitModule(program, code, cleanId, runtimeModuleId) + (isServe ? HMR_FOOTER : "");
      return { code: moduleCode, map: buildSourceMap(moduleCode, cleanId, code) };
    },
  };
}

/** True for `*.aktion` ids (query/hash stripped). Exported for tests. */
export function isAktionId(id: string): boolean {
  return stripQuery(id).endsWith(".aktion");
}

export { aktionPlugin as default };

// ---- internals ----

function stripQuery(id: string): string {
  const q = id.indexOf("?");
  const base = q === -1 ? id : id.slice(0, q);
  const h = base.indexOf("#");
  return h === -1 ? base : base.slice(0, h);
}

/**
 * True when `candidate` is `root` or sits underneath it.
 *
 * The separator matters: a bare `startsWith(root)` also accepts a sibling whose
 * name merely begins with the root's (`/srv/app` vs `/srv/app-secrets`).
 */
export function isInsideRoot(candidate: string, root: string): boolean {
  const normalisedRoot = resolvePath(root);
  const normalised = resolvePath(candidate);
  if (normalised === normalisedRoot) return true;
  return normalised.startsWith(normalisedRoot.endsWith(sep) ? normalisedRoot : normalisedRoot + sep);
}

/**
 * A `ModuleResolver` over the Node filesystem (absolute paths, sync reads).
 *
 * When `root` is non-null every resolved path must stay inside it. `.aktion`
 * files are project source, but they are also *data* that may have arrived with
 * an untrusted repository — and a specifier like `../../../../etc/passwd` (or an
 * absolute `/etc/passwd`) would otherwise be read and, under `vite dev`, served
 * to the browser as part of the compiled module.
 */
function nodeResolver(root: string | null): ModuleResolver {
  return {
    resolve(spec, importerPath) {
      if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // bare specifiers aren't project modules
      try {
        const resolved = resolvePath(dirname(importerPath), spec);
        if (root && !isInsideRoot(resolved, root)) return null;
        return resolved;
      } catch {
        return null;
      }
    },
    load(path) {
      if (root && !isInsideRoot(path, root)) {
        throw new Error(`[aktion] refusing to read "${path}" — outside the project root`);
      }
      return readFileSync(path, "utf8");
    },
  };
}

function hasEntryBinding(program: Program): boolean {
  return program.statements.some((s) => s.kind === "Assignment" && s.identifier === "aktion");
}

/**
 * Build a minimal valid v3 source map for the generated module.
 *
 * The emitted module is machine-generated (an inert `JSON.parse(...)` of the
 * AST), so there is no line-by-line correspondence with the author's source.
 * The previous `{ mappings: "" }` left every runtime stack frame pointing at
 * that opaque blob (feedback §3.4). Instead we emit a map that (a) carries the
 * original `.aktion` path and its content (`sourcesContent`) so the file shows
 * up in the browser's Sources panel, and (b) maps each generated line to the
 * original file so frames resolve to the `.aktion` module rather than the
 * generated JS. `AAAA` is the VLQ for the segment `[0, 0, 0, 0]`
 * (generatedColumn 0 → source 0, original line 0, original column 0); repeated
 * per line it keeps the absolute original position at the top of the file.
 */
function buildSourceMap(
  generated: string,
  sourcePath: string,
  source: string,
): { version: 3; sources: string[]; sourcesContent: string[]; names: string[]; mappings: string } {
  const lineCount = generated.split("\n").length;
  const mappings = new Array(lineCount).fill("AAAA").join(";");
  return {
    version: 3,
    sources: [sourcePath],
    sourcesContent: [source],
    names: [],
    mappings,
  };
}

/** ES module exporting the linked `CompiledProgram`. The AST embeds as an inert
 *  `JSON.parse("…")` (faster + smaller than an object literal for large trees). */
function emitModule(program: Program, source: string, path: string, runtimeModuleId: string): string {
  const programLiteral = JSON.stringify(JSON.stringify(program));
  return (
    `// Generated by the Aktion Vite plugin — do not edit by hand.\n` +
    `import { defineCompiledProgram } from ${JSON.stringify(runtimeModuleId)};\n` +
    `const program = /*#__PURE__*/ JSON.parse(${programLiteral});\n` +
    `const source = ${JSON.stringify(source)};\n` +
    `export default /*#__PURE__*/ defineCompiledProgram({ ` +
    `__aktionCompiled: ${COMPILED_PROGRAM_VERSION}, program, source, path: ${JSON.stringify(path)} });\n`
  );
}

/** Dev-only self-accepting HMR: re-mount every `<aktion-app>` showing this
 *  module, replaying its serialized `$state` so live state survives the edit. */
const HMR_FOOTER = `
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    const next = mod && mod.default;
    if (!next || typeof document === "undefined") return;
    for (const el of document.querySelectorAll("aktion-app")) {
      if (el.sourceId !== next.path) continue;
      el.mountCompiled(next, el.serializeState());
    }
  });
}
`;
