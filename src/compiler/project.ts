/**
 * In-browser project linker. Wraps the synchronous, resolver-driven
 * `linkProgram` (`./linker.js`) with:
 *
 *   - `resolveSpecifier` — the canonical mapping from an `import` specifier +
 *     importer path to a module key, covering relative (`./`, `../`), absolute
 *     (`/`), and remote (`https://…`) specifiers, plus relative-against-a-URL.
 *   - `createMemoryResolver` — a sync `ModuleResolver` over a complete
 *     `{ path → source }` map.
 *   - `linkProject` — an async entry that walks the import graph from an entry
 *     file, **fetches any URL specifiers**, then links the whole graph into one
 *     program. This is what the playground (and any browser host) calls.
 *
 * Everything here is browser-safe (no `node:*`). URL fetching uses the global
 * `fetch`; hosts can override it via the `fetch` option (used by tests).
 */

import { parse } from "../parser/index.js";
import { printProgram } from "../tooling/formatter.js";
import type { Program } from "../parser/types.js";
import { linkProgram, type LinkDiagnostic, type ModuleResolver } from "./linker.js";

/** True for an absolute URL specifier (`https://…`, `http://…`, etc.). */
function isUrl(spec: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(spec);
}

/** POSIX-style join + normalize (drops `.`, applies `..`); no `node:path`. */
function normalizeSegments(parts: string[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** Directory portion of a project path (`components/App.aktion` → `components`). */
function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/**
 * Resolve an import specifier to a module key.
 *
 *   - `https://host/x.aktion`                       → itself (a remote module)
 *   - relative/absolute under a URL importer        → resolved against the URL
 *   - `/components/Button.aktion` (project root)    → `components/Button.aktion`
 *   - `./Button.aktion` from `app.aktion`           → `Button.aktion`
 *   - `../Button.aktion` from `components/App.aktion`→ `Button.aktion`
 *   - bare `lodash`                                 → `null` (unresolved)
 */
export function resolveSpecifier(spec: string, importerPath: string): string | null {
  if (isUrl(spec)) {
    try {
      return new URL(spec).href;
    } catch {
      return null;
    }
  }
  // Relative/absolute specifier under a remote importer → resolve against it.
  if (isUrl(importerPath)) {
    try {
      return new URL(spec, importerPath).href;
    } catch {
      return null;
    }
  }
  if (spec.startsWith("/")) {
    return normalizeSegments(spec.split("/"));
  }
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return normalizeSegments(`${dirOf(importerPath)}/${spec}`.split("/"));
  }
  // Bare specifiers (`import { x } from "lodash"`) have no project meaning.
  return null;
}

/** A sync `ModuleResolver` backed by a complete in-memory `{ path → source }` map. */
export function createMemoryResolver(files: Readonly<Record<string, string>>): ModuleResolver {
  return {
    resolve: (spec, importer) => resolveSpecifier(spec, importer),
    load: (path) => {
      const src = files[path];
      if (src === undefined) throw new Error(`not found: ${path}`);
      return src;
    },
  };
}

export interface LinkProjectOptions {
  /** Entry module key (must exist in `files`), e.g. `"app.aktion"`. */
  entry: string;
  /** In-memory project files, keyed by path. */
  files: Readonly<Record<string, string>>;
  /**
   * Fetch a remote module's text. Defaults to the global `fetch`. Override in
   * tests / hosts that want a custom transport or to disable remote loading.
   */
  fetch?: (url: string) => Promise<string>;
}

export interface LinkProjectResult {
  /** The merged, scope-renamed program. */
  program: Program;
  /** Re-emitted source of the merged program (for `mountCompiled` round-trips). */
  source: string;
  /** Linker + fetch diagnostics. */
  diagnostics: LinkDiagnostic[];
  /** Resolved paths/URLs of the imported modules (excludes the entry). */
  dependencies: string[];
}

async function defaultFetch(url: string): Promise<string> {
  if (typeof fetch !== "function") {
    throw new Error("global fetch is unavailable; cannot load URL imports");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Link an in-memory project (entry + files) into a single `CompiledProgram`-
 * ready `Program`, fetching any `https://…` imports along the way.
 *
 * The walk is async only because of URL fetches — a project with no URL imports
 * resolves on a single microtask. URL-fetch failures become diagnostics (the
 * rest of the graph still links) rather than thrown errors.
 */
export async function linkProject(options: LinkProjectOptions): Promise<LinkProjectResult> {
  const { entry, files } = options;
  const fetchImpl = options.fetch ?? defaultFetch;
  const fetchDiagnostics: LinkDiagnostic[] = [];

  // Working copy: project files plus any URL sources we fetch. The sync linker
  // resolves against this once it's complete.
  const sources: Record<string, string> = { ...files };
  const seen = new Set<string>();

  // Walk the import graph, fetching URL modules into `sources`. Project files
  // that are missing are left out — the linker reports them as load failures.
  async function walk(path: string): Promise<void> {
    if (seen.has(path)) return;
    seen.add(path);

    if (sources[path] === undefined) {
      if (isUrl(path)) {
        try {
          sources[path] = await fetchImpl(path);
        } catch (err) {
          fetchDiagnostics.push({
            line: 0,
            column: 0,
            message: `Failed to fetch module "${path}": ${(err as Error).message ?? err}`,
            severity: "error",
          });
          return;
        }
      } else {
        return; // missing project file — linker will diagnose the load failure
      }
    }

    let program: Program;
    try {
      program = parse(sources[path]!);
    } catch {
      return; // parse failure surfaces through the linker's own parse
    }
    const children: Promise<void>[] = [];
    for (const stmt of program.statements) {
      if (stmt.kind !== "Import") continue;
      const resolved = resolveSpecifier(stmt.source, path);
      if (resolved !== null) children.push(walk(resolved));
    }
    await Promise.all(children);
  }

  if (sources[entry] === undefined) {
    return {
      program: { statements: [], errors: [] },
      source: "",
      diagnostics: [
        { line: 0, column: 0, message: `Entry module "${entry}" was not found.`, severity: "error" },
      ],
      dependencies: [],
    };
  }

  await walk(entry);

  const linked = linkProgram(sources[entry]!, entry, createMemoryResolver(sources));

  let source: string;
  try {
    source = printProgram(linked.program);
  } catch {
    source = sources[entry]!;
  }

  return {
    program: linked.program,
    source,
    diagnostics: [...fetchDiagnostics, ...linked.diagnostics],
    dependencies: linked.dependencies,
  };
}
