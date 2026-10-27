/**
 * Aktion i18n factory — `i18n({...})` returns a `{ t, setCurrentLanguage,
 * getCurrentLanguage }` bundle with language state held in closure.
 *
 *   const { t, setCurrentLanguage, getCurrentLanguage } = i18n({
 *     defaultLanguage: "en",
 *     currentLanguage: "fr",
 *     translations: {
 *       greeting:    { en: "Hello, {name}!", fr: "Bonjour, {name}!" },
 *       items_count: { en: "{count} items",  fr: "{count} objets"   },
 *     },
 *   })
 *
 *   t("greeting", { name: "Ada" })   // "Bonjour, Ada!"
 *   setCurrentLanguage("en")
 *   t("greeting", { name: "Ada" })   // "Hello, Ada!"
 *
 * Placeholders use `{name}` syntax. Lookup falls back to
 * `defaultLanguage`, then to the bare key.
 *
 * The one true path for interpolation is `t(key, { vars })` — pass every
 * placeholder a value. A placeholder you do NOT supply is left **intact**
 * (e.g. `t("constraint")` → `"Uppercase: min {n}"`), so the legacy
 * `t(key).replace("{n}", "1")` idiom no longer silently drops the value.
 */
export interface I18nConfig {
    defaultLanguage?: string;
    currentLanguage?: string;
    translations?: Record<string, Record<string, string>>;
}
export interface I18nInstance {
    t(key: string, vars?: Record<string, unknown>): string;
    setCurrentLanguage(lang: string): void;
    getCurrentLanguage(): string;
}
export declare function createI18n(config?: I18nConfig): I18nInstance;
