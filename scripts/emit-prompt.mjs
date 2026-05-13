#!/usr/bin/env node
/**
 * Emit the system prompt artefacts by importing the freshly built ESM bundle.
 * This keeps the prompts in lockstep with the components shipped in the bundle.
 *
 * Two flavours are written into `dist/`:
 *   - `system_prompt.txt`      — full prompt (every component, JS, routing).
 *   - `system_prompt_chat.txt` — compact chat-focused prompt for short replies.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "../dist");
const bundlePath = resolve(distDir, "streaming-ui-script.js");

async function main() {
  // Ensure DOM globals exist for the bundle's customElements/HTMLElement refs.
  installDomShim();

  const moduleUrl = pathToFileURL(bundlePath).href;
  const bundle = await import(moduleUrl);
  const { generatePrompt, defaultLibrary } = bundle;
  if (typeof generatePrompt !== "function" || !defaultLibrary) {
    throw new Error("Bundle does not export generatePrompt/defaultLibrary");
  }
  const full = generatePrompt(defaultLibrary);
  const chat = generatePrompt(defaultLibrary, { mode: "chat" });
  await mkdir(distDir, { recursive: true });
  await writeFile(resolve(distDir, "system_prompt.txt"), full, "utf8");
  await writeFile(resolve(distDir, "system_prompt_chat.txt"), chat, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${full.length} chars to dist/system_prompt.txt`);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${chat.length} chars to dist/system_prompt_chat.txt`);
}

function installDomShim() {
  if (typeof globalThis.HTMLElement !== "undefined") return;
  class HTMLElementShim {}
  globalThis.HTMLElement = HTMLElementShim;
  globalThis.customElements = {
    define() {/* noop in shim */},
    get() { return undefined; },
  };
  globalThis.document = {
    createElement: () => ({ append() {}, appendChild() {}, setAttribute() {}, querySelectorAll: () => ({ forEach() {} }) }),
    createElementNS: () => ({ append() {}, appendChild() {}, setAttribute() {} }),
    createDocumentFragment: () => ({ append() {} }),
    createTextNode: () => ({}),
  };
  globalThis.window = globalThis;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
