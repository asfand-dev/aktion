/**
 * Access level of one injected name, in the shape ESLint's flat config reads
 * for `languageOptions.globals`.
 */
export type AktionGlobalAccess = "readonly" | "writable";
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
export declare const aktionGlobals: Readonly<Record<string, AktionGlobalAccess>>;
