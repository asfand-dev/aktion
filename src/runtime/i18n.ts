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
    return interpolate(template, vars, currentLanguage || defaultLanguage || "en");
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

function interpolate(template: string, vars?: Record<string, unknown>, locale = "en"): string {
  // First resolve ICU `{name, plural, …}` / `{name, select, …}` blocks, then
  // the simple `{name}` placeholders. ICU blocks can contain `#` (the number)
  // and are matched with brace-balancing so nested braces work.
  const withIcu = resolveIcu(template, vars ?? {}, locale);
  return withIcu.replace(/\{([^{}]+)\}/g, (_, expr: string) => {
    const value = (vars ?? {})[expr.trim()];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/**
 * Resolve ICU MessageFormat `plural` and `select` blocks (X.2). Supports:
 *   {count, plural, one {# item} other {# items}}
 *   {count, plural, =0 {none} one {# item} other {# items}}
 *   {gender, select, male {he} female {she} other {they}}
 * `#` inside a chosen plural branch is replaced with the (formatted) number.
 * Branch bodies may contain nested `{name}` placeholders (resolved by the
 * caller's second pass). Unmatched / malformed blocks are left untouched.
 */
function resolveIcu(template: string, vars: Record<string, unknown>, locale: string): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open === -1) { out += template.slice(i); break; }
    // Find the matching close brace for this block.
    const end = matchBrace(template, open);
    if (end === -1) { out += template.slice(i); break; }
    const inner = template.slice(open + 1, end);
    const resolved = tryResolveIcuBlock(inner, vars, locale);
    if (resolved !== null) {
      out += template.slice(i, open) + resolved;
    } else {
      // Not an ICU block — leave the braces for the simple-placeholder pass.
      out += template.slice(i, end + 1);
    }
    i = end + 1;
  }
  return out;
}

/** Index of the `}` matching the `{` at `start`, honouring nesting. */
function matchBrace(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i += 1) {
    if (s[i] === "{") depth += 1;
    else if (s[i] === "}") { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function tryResolveIcuBlock(inner: string, vars: Record<string, unknown>, locale: string): string | null {
  // Split into `name, type, rest` (only the first two commas matter).
  const firstComma = inner.indexOf(",");
  if (firstComma === -1) return null;
  const name = inner.slice(0, firstComma).trim();
  const secondComma = inner.indexOf(",", firstComma + 1);
  if (secondComma === -1) return null;
  const type = inner.slice(firstComma + 1, secondComma).trim();
  const body = inner.slice(secondComma + 1);
  if (type !== "plural" && type !== "select") return null;

  const branches = parseIcuBranches(body);
  if (!branches) return null;
  const raw = vars[name];

  if (type === "select") {
    const chosen = branches[String(raw)] ?? branches.other;
    return chosen ?? "";
  }
  // plural
  const num = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(num)) {
    const exact = branches[`=${num}`];
    let chosen = exact;
    if (chosen === undefined) {
      let category = "other";
      try { category = new Intl.PluralRules(locale).select(num); } catch { /* default */ }
      chosen = branches[category] ?? branches.other;
    }
    const formatted = formatNumber(num, locale);
    return (chosen ?? "").replace(/#/g, formatted);
  }
  return branches.other ?? "";
}

/** Parse `one {…} other {…}` branch bodies into a `{ category: text }` map. */
function parseIcuBranches(body: string): Record<string, string> | null {
  const branches: Record<string, string> = {};
  let i = 0;
  let found = false;
  while (i < body.length) {
    // Skip whitespace.
    while (i < body.length && /\s/.test(body[i]!)) i += 1;
    if (i >= body.length) break;
    // Read the category key up to the next `{`.
    const brace = body.indexOf("{", i);
    if (brace === -1) break;
    const key = body.slice(i, brace).trim();
    const close = matchBrace(body, brace);
    if (close === -1) break;
    branches[key] = body.slice(brace + 1, close);
    found = true;
    i = close + 1;
  }
  return found ? branches : null;
}

function formatNumber(num: number, locale: string): string {
  try { return new Intl.NumberFormat(locale).format(num); } catch { return String(num); }
}
