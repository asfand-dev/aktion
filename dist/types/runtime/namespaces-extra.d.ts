/**
 * Extra runtime namespaces exposed to Aktion programs (suggestions-global
 * Parts V.2, XIII.2): `$style` (bounded styling helpers) and `$rules`
 * (composable validators). Both are pure — no side effects — and safe to
 * call from any expression / action / effect / lambda.
 */
export declare const Style: {
    /**
     * Classname helper (clsx-style). Accepts strings, arrays, and objects
     * `{ "is-active": cond }`; returns a space-joined, de-duped class string.
     * Tokens that aren't valid CSS identifiers are dropped.
     */
    readonly cx: (...args: unknown[]) => string;
    /**
     * Build a safe `linear-gradient(...)` from an array of color stops (and an
     * optional angle in degrees). Returns "" if fewer than two valid stops.
     */
    readonly gradient: (stops: unknown, angle?: unknown) => string;
    /** color-mix wrapper: blend a color with transparent at `amount` (0–1). */
    readonly alpha: (color: unknown, amount: unknown) => string;
    /** Build a responsive `clamp(min, preferred, max)` size. */
    readonly clamp: (min: unknown, preferred: unknown, max: unknown) => string;
    /**
     * Resolve a dotted token path to its CSS variable: `style.token("spacing.l")`
     * → `var(--rui-spacing-l)`, `style.token("colors.primary")` →
     * `var(--rui-color-primary)`. Falls back to "" for unknown shapes.
     */
    readonly token: (path: unknown) => string;
    /** Serialize a plain object of CSS declarations to a sanitised style string. */
    readonly toStyle: (obj: unknown) => string;
};
export type StyleNamespace = typeof Style;
/**
 * A validator returns an error message (invalid), null (valid), or a Promise
 * of either — async validators (V.2 `asyncCustom`) resolve server-side checks
 * like username uniqueness.
 */
type Validator = (value: unknown) => string | null | Promise<string | null>;
export declare const Rules: {
    readonly required: (message?: string) => Validator;
    readonly email: (message?: string) => Validator;
    readonly url: (message?: string) => Validator;
    readonly min: (n: number, message?: string) => Validator;
    readonly max: (n: number, message?: string) => Validator;
    readonly minLength: (n: number, message?: string) => Validator;
    readonly maxLength: (n: number, message?: string) => Validator;
    readonly pattern: (re: unknown, message?: string) => Validator;
    readonly oneOf: (options: unknown[], message?: string) => Validator;
    readonly matches: (other: unknown, message?: string) => Validator;
    readonly custom: (fn: unknown, message?: string) => Validator;
    /**
     * Async validator (V.2) — `fn(value)` may return a Promise resolving to
     * true/null (valid), false (invalid → `message`), or an error string. Use
     * for server-side checks (e.g. username uniqueness). `$form` awaits these
     * before submitting; a rejected promise counts as invalid.
     */
    readonly asyncCustom: (fn: unknown, message?: string) => Validator;
    /**
     * Run a list of validators against a value; returns the first error
     * message, or null when all pass. Stays fully synchronous for sync
     * validators; returns a Promise only when an async validator is hit.
     */
    readonly validate: (value: unknown, validators: unknown) => string | null | Promise<string | null>;
    /**
     * Validate an object of `{ field: value }` against a schema of
     * `{ field: [validators] }`. Returns `{ field: message }` for failures
     * (empty object when valid) — or a Promise of it when any validator in the
     * schema is async.
     */
    readonly validateAll: (values: unknown, schema: unknown) => Record<string, string> | Promise<Record<string, string>>;
};
export type RulesNamespace = typeof Rules;
export {};
