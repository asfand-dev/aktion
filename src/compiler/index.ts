/**
 * `aktion-runtime` multi-file module support — all browser-safe (no `node:*`,
 * no bundler dependencies). Re-exported from the package root so a browser host
 * (or the playground) can link a multi-file project in-page:
 *
 *   import { linkProject, defineCompiledProgram } from "aktion-runtime";
 *   const { program, source } = await linkProject({ entry: "app.aktion", files });
 *   el.mountCompiled(defineCompiledProgram({ __aktionCompiled: 1, program, source, path: "app.aktion" }));
 */

export {
  COMPILED_PROGRAM_VERSION,
  defineCompiledProgram,
  isCompiledProgram,
  compileLite,
  type CompiledProgram,
  type CompileLiteOptions,
} from "./runtime.js";

export {
  linkProgram,
  type LinkResult,
  type LinkDiagnostic,
  type ModuleResolver,
} from "./linker.js";

export {
  linkProject,
  resolveSpecifier,
  createMemoryResolver,
  type LinkProjectOptions,
  type LinkProjectResult,
} from "./project.js";
