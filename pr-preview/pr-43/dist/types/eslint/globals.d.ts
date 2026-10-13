/**
 * Access level of one injected name, in the shape ESLint's flat config reads
 * for `languageOptions.globals`.
 */
export type AktionGlobalAccess = "readonly" | "writable";
/**
 * Every name an Aktion program uses without a declaration: the component
 * library, the `$`-prefixed builtins and namespaces, the injected bindings
 * (`route`, `params`, `outlet`, `children`, `slots`, `cleanup`, `setTimeout` /
 * `setInterval` / `clearTimeout` / `clearInterval`, and the legacy `aktion` /
 * `theme` roots), plus `atob`, `btoa`, `console` and `structuredClone`.
 *
 * It is a plain `Record<string, "readonly" | "writable">`, the shape ESLint's
 * flat config takes as `languageOptions.globals`, so `no-undef` knows the names
 * a `.aktion` file uses without an import. It is derived from
 * `src/dsl/manifest.json` alone, the file the generated types are built from,
 * so it follows them without bundling the component library into this entry.
 * `tests/dsl-types.test.ts` checks the manifest against what the runtime binds,
 * and `tests/eslint-globals.test.ts` compares the record with the catalogues
 * and probes the runtime.
 *
 * Of the last four names only `structuredClone` is provided by the runtime
 * itself (under every global-access policy). `atob`, `btoa` and `console` are
 * policy-gated host globals, exactly like `URL`; they are listed because the
 * generated `globals.d.ts` declares them, so the two projections agree, not
 * because Aktion unconditionally provides them.
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
