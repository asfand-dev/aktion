/**
 * Public entry point.
 *
 * Importing this file (or loading the bundled script) registers the
 * `<llm-response-ui-lang>` custom element. All public types and helpers are
 * also re-exported so consumers can use them programmatically.
 */

import { LlmResponseUiLangElement, defineElement } from "./element.js";

export { LlmResponseUiLangElement, defineElement };

export * from "./parser/index.js";
export * from "./runtime/index.js";
export * from "./library/index.js";
export * from "./renderer/index.js";
export * from "./prompt/index.js";
export * from "./theme/index.js";

declare global {
  interface HTMLElementTagNameMap {
    "llm-response-ui-lang": LlmResponseUiLangElement;
  }
}

defineElement();

// Build script also writes the system prompt to dist/system_prompt.txt; this
// constant lets consumers read the same text at runtime without an HTTP call.
import { generatePrompt } from "./prompt/generator.js";
import { defaultLibrary } from "./library/index.js";

export const SYSTEM_PROMPT_TEXT = generatePrompt(defaultLibrary);
