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

export function createI18n(config: I18nConfig = {}): I18nInstance {
  const translations = sanitiseTranslations(config.translations);
  const defaultLanguage =
    typeof config.defaultLanguage === "string" ? config.defaultLanguage : "";
  let currentLanguage =
    typeof config.currentLanguage === "string" && config.currentLanguage
      ? config.currentLanguage
      : defaultLanguage;

  function t(key: string, vars?: Record<string, unknown>): string {
    if (typeof key !== "string" || !key) return "";
    const entry = translations[key];
    let template: string | undefined;
    if (entry) {
      if (currentLanguage && typeof entry[currentLanguage] === "string") {
        template = entry[currentLanguage];
      } else if (defaultLanguage && typeof entry[defaultLanguage] === "string") {
        template = entry[defaultLanguage];
      }
    }
    if (template === undefined) return key;
    return interpolate(template, vars);
  }

  function setCurrentLanguage(lang: string): void {
    if (typeof lang !== "string" || !lang) return;
    currentLanguage = lang;
  }

  function getCurrentLanguage(): string {
    return currentLanguage;
  }

  return { t, setCurrentLanguage, getCurrentLanguage };
}

function sanitiseTranslations(
  input: unknown,
): Record<string, Record<string, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const langs: Record<string, string> = {};
    for (const [lang, text] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (typeof text === "string") langs[lang] = text;
    }
    out[key] = langs;
  }
  return out;
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\{([^}]+)\}/g, (_, expr: string) => {
    const value = vars[expr.trim()];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}
