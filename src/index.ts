/**
 * Public entry point.
 *
 * Importing this file (or loading the bundled script) registers the
 * `<aktion-app>` custom element. All public types and helpers are
 * also re-exported so consumers can use them programmatically.
 */

import { AktionElement, defineElement } from "./element.js";

export { AktionElement, defineElement };

export * from "./parser/index.js";
export * from "./runtime/index.js";
export * from "./library/index.js";
export * from "./renderer/index.js";
export * from "./prompt/index.js";
export * from "./theme/index.js";
export * from "./language/index.js";

// Multi-file modules: the in-browser linker + `CompiledProgram` helpers
// (`linkProject`, `linkProgram`, `compileLite`, `defineCompiledProgram`, …).
// All browser-safe (no `node:*`, no bundler deps), so they ship in the runtime
// bundle and let a host (or the playground) link a project in-page.
export * from "./compiler/index.js";

// Schema + DX tooling (browser-safe, no language-service weight): the
// machine-readable component schema that drives external editors/design
// tools, plus the style/markup importers and the gallery builder.
export {
  componentSchema,
  suggestComponent,
  tailwindToSx,
  cssToSx,
  styledToSx,
  buildGallery,
} from "./tooling/schema.js";
export type {
  LibrarySchema,
  ComponentSchemaEntry,
  ComponentPropSchema,
  GalleryOptions,
} from "./tooling/schema.js";
export { htmlToAktion } from "./tooling/html-import.js";

declare global {
  interface HTMLElementTagNameMap {
    "aktion-app": AktionElement;
  }
}

defineElement();

// Build script also writes the system prompt to dist/system_prompt.txt; this
// constant lets consumers read the same text at runtime without an HTTP call.
import { generatePrompt } from "./prompt/generator.js";
import { defaultLibrary } from "./library/index.js";

export const SYSTEM_PROMPT_TEXT = generatePrompt(defaultLibrary);
