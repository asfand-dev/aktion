#!/usr/bin/env node
/**
 * Emit dist/system_prompt.txt by importing the freshly built ESM bundle.
 * This keeps the prompt in lockstep with the components shipped in the bundle.
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
  const text = generatePrompt(defaultLibrary);
  await mkdir(distDir, { recursive: true });
  await writeFile(resolve(distDir, "system_prompt.txt"), text, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${text.length} chars to dist/system_prompt.txt`);
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
