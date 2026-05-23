/**
 * Aktion 0.5 i18n runtime — `$i18n` declaration + `t()` global builtin (§23).
 *
 * The runtime is intentionally tiny:
 *   - Holds the active locale, fallback locale, and message map.
 *   - `t(key, vars?)` looks up `key` (dot-paths supported, e.g. `"orders.title"`),
 *     falls back to the fallback locale's bundle, then to the bare key.
 *   - `vars?` are interpolated using `${name}` placeholders.
 *
 * Locale-aware formatting (`Money`, `Date`, `Number`, `Percent`,
 * `RelativeTime`) is wired through `getLocale()` so library components
 * can read the live value without each declaring it as a prop.
 */

export interface I18nConfig {
  locale: string;
  messages: Record<string, unknown>;
  fallback?: string;
  /** Optional secondary message map for the fallback locale. */
  fallbackMessages?: Record<string, unknown>;
}

export class I18nRuntime {
  private locale = "en";
  private fallback = "en";
  private messages: Record<string, unknown> = {};
  private fallbackMessages: Record<string, unknown> = {};

  configure(config: I18nConfig): void {
    this.locale = config.locale || "en";
    this.fallback = config.fallback ?? "en";
    this.messages = sanitiseMessages(config.messages);
    this.fallbackMessages = sanitiseMessages(config.fallbackMessages ?? {});
  }

  /** Current active locale tag (e.g. `"en-US"`, `"de"`). */
  getLocale(): string {
    return this.locale;
  }

  /** Snapshot of the configured fallback locale. */
  getFallback(): string {
    return this.fallback;
  }

  /**
   * Translate a dot-pathed key, optionally interpolating `${name}` vars.
   *
   * Resolution order:
   *   1. The active locale's message map.
   *   2. The fallback locale's message map (if provided separately).
   *   3. The bare key as a literal string.
   */
  t(key: string, vars?: Record<string, unknown>): string {
    const value =
      readPath(this.messages, key) ??
      readPath(this.fallbackMessages, key) ??
      key;
    if (typeof value !== "string") return key;
    return interpolate(value, vars);
  }
}

function sanitiseMessages(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function readPath(messages: Record<string, unknown>, key: string): unknown {
  if (!key) return undefined;
  // Fast path for non-nested keys.
  if (key.indexOf(".") === -1) return messages[key];
  let cursor: unknown = messages;
  for (const segment of key.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const value = vars[expr.trim()];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}
