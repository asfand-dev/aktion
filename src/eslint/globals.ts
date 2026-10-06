import { getComponentCatalog } from "../language/components.js";
import { builtinCatalog } from "../language/builtins.js";
import { namespaceCatalog } from "../language/namespaces.js";
import manifest from "../dsl/manifest.json";

/**
 * Access level of one injected name, in the shape ESLint's flat config reads
 * for `languageOptions.globals`.
 */
export type AktionGlobalAccess = "readonly" | "writable";

/**
 * Names the legacy root bindings the runtime still accepts as ASSIGNMENTS
 * (`aktion = …`, `theme = $theme(…)`), so `no-global-assign` must not flag them.
 */
const WRITABLE: ReadonlySet<string> = new Set(["aktion", "theme"]);

function buildGlobals(): Record<string, AktionGlobalAccess> {
  const names = new Set<string>();
  // Every component (`Button`, `Container`, …).
  for (const entry of getComponentCatalog()) names.add(entry.name);
  // Every `$`-builtin and `$`-namespace, with the sigil (`$state`, `$util`, …).
  for (const entry of builtinCatalog) names.add(entry.sigil);
  for (const entry of namespaceCatalog) names.add(entry.sigil);
  // The non-`$` names the runtime binds without a declaration (`route`,
  // `params`, `outlet`, `children`, `slots`, `cleanup`, the tracked timers, …).
  for (const name of manifest.injected) names.add(name);
  // The host names `lib.es2022` (and so ESLint's ES environment) lacks but the
  // generated `globals.d.ts` declares: `atob`, `btoa`, `console`, `structuredClone`.
  for (const name of manifest.hostGlobals) names.add(name);

  const out: Record<string, AktionGlobalAccess> = {};
  for (const name of [...names].sort()) out[name] = WRITABLE.has(name) ? "writable" : "readonly";
  return out;
}

/**
 * Every name the Aktion runtime provides to a program without a declaration:
 * the component library, the `$`-prefixed builtins and namespaces, the injected
 * bindings (`route`, `params`, `outlet`, `children`, `slots`, `cleanup`,
 * `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval`, and the
 * legacy `aktion` / `theme` roots) and `atob`, `btoa`, `console` and
 * `structuredClone`.
 *
 * It is a plain `Record<string, "readonly" | "writable">`, the shape ESLint's
 * flat config takes as `languageOptions.globals`, so `no-undef` knows the names
 * a `.aktion` file uses without an import. It is derived from the same
 * catalogues and `src/dsl/manifest.json` that the editor tooling and the
 * generated types read, so it follows them. `tests/dsl-types.test.ts` checks
 * those sources against what the runtime binds, and
 * `tests/eslint-globals.test.ts` checks that every name the runtime resolves is
 * known to `no-undef` under the recommended config.
 *
 * Context-only names (`params`, `outlet`, `children`, `slots`, `cleanup`) are
 * declared program-wide but only hold a value inside the construct that binds
 * them; at top level they are `null`.
 *
 * Other host globals a program may reach (`document`, `window`, `URL`,
 * `crypto`, …) are NOT listed: whether they exist depends on the host's
 * global-access policy, so the consumer's own `languageOptions.globals` (or
 * `globals.browser`) supplies them.
 *
 * `configs.recommended` already applies it to the processor's virtual
 * `**\/*.aktion/*.ts` block; use it directly when assembling your own config:
 *
 * ```js
 * import { aktionGlobals } from "aktion-runtime/eslint";
 *
 * export default [{ files: ["**\/*.aktion/*.ts"], languageOptions: { globals: aktionGlobals } }];
 * ```
 */
export const aktionGlobals: Readonly<Record<string, AktionGlobalAccess>> = Object.freeze(buildGlobals());
