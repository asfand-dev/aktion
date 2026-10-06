/**
 * `aktion-runtime` multi-file module support — all browser-safe (no `node:*`,
 * no bundler dependencies). Covers `.aktion` and `.aktion.js` modules; the
 * TypeScript frontend for `.aktion.ts` lives in `aktion-runtime/vite`. Re-exported from the package root so a browser host
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
  moduleLocalSymbol,
  moduleLocalBaseName,
  nativeImportMessage,
  typeOnlyNativeImportMessage,
  type LinkResult,
  type LinkDiagnostic,
  type LinkOptions,
  type LinkedModule,
  type ModuleResolver,
} from "./linker.js";

export {
  AKTION_MODULE_SUFFIXES,
  RESERVED_AKTION_SUFFIXES,
  NATIVE_MODULE_RE,
  moduleLanguage,
  isAktionModulePath,
  isNativeModulePath,
  isReservedAktionPath,
  stripQuery,
  type ModuleLanguage,
} from "./module-kind.js";

export {
  DSL_MODULE_ID,
  aktionFrontend,
  javascriptFrontend,
  defaultFrontends,
  compileJavaScriptModule,
  type CompileJavaScriptOptions,
  type FrontendResult,
  type ModuleFrontend,
  type ModuleFrontends,
} from "./frontend.js";

export {
  normalizeComponentForms,
  checkJavaScriptSemantics,
  lowerJavaScriptSemantics,
} from "./js-semantics.js";

export {
  linkProject,
  resolveSpecifier,
  createMemoryResolver,
  type LinkProjectOptions,
  type LinkProjectResult,
} from "./project.js";
