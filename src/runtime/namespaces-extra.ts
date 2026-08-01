/**
 * Extra runtime namespaces exposed to Aktion programs (suggestions-global
 * Parts V.2, XIII.2): `$style` (bounded styling helpers) and `$rules`
 * (composable validators). Both are pure — no side effects — and safe to
 * call from any expression / action / effect / lambda.
 */

import { safeRegexTest } from "./util.js";

/* ----------------------------------------------------------------------- *
 * $style — safe, declarative styling helpers
 * ----------------------------------------------------------------------- */

const SAFE_COLOR = /^[a-zA-Z0-9#%.,()\s+-]+$/;
const COLOR_TOKENS: Record<string, string> = {
  primary: "var(--rui-color-primary)",
  accent: "var(--rui-color-accent)",
  success: "var(--rui-color-success)",
  warning: "var(--rui-color-warning)",
  danger: "var(--rui-color-danger)",
  info: "var(--rui-color-info)",
  text: "var(--rui-color-text)",
  muted: "var(--rui-color-text-muted)",
  bg: "var(--rui-color-bg)",
  surface: "var(--rui-color-surface)",
  border: "var(--rui-color-border)",
};

function safeColor(value: unknown): string {
  const s = String(value ?? "").trim();
  if (s in COLOR_TOKENS) return COLOR_TOKENS[s]!;
  if (!s || s.length > 64 || !SAFE_COLOR.test(s)) return "";
  if (/url\s*\(|expression\s*\(|javascript\s*:|@import/i.test(s)) return "";
  return s;
}

function safeLength(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s || s.length > 64) return "0";
  if (!/^[a-zA-Z0-9.%+\-*/\s(),]+$/.test(s)) return "0";
  return s;
}

export const Style = {
  /**
   * Classname helper (clsx-style). Accepts strings, arrays, and objects
   * `{ "is-active": cond }`; returns a space-joined, de-duped class string.
   * Tokens that aren't valid CSS identifiers are dropped.
   */
  cx: (...args: unknown[]): string => {
    const out: string[] = [];
    const push = (v: unknown): void => {
      if (!v) return;
      if (typeof v === "string" || typeof v === "number") {
        for (const tok of String(v).split(/\s+/)) {
          if (tok && /^[A-Za-z_-][\w-]*$/.test(tok) && !out.includes(tok)) out.push(tok);
        }
      } else if (Array.isArray(v)) {
        v.forEach(push);
      } else if (typeof v === "object") {
        for (const [k, cond] of Object.entries(v as Record<string, unknown>)) {
          if (cond) push(k);
        }
      }
    };
    args.forEach(push);
    return out.join(" ");
  },

  /**
   * Build a safe `linear-gradient(...)` from an array of color stops (and an
   * optional angle in degrees). Returns "" if fewer than two valid stops.
   */
  gradient: (stops: unknown, angle?: unknown): string => {
    const arr = Array.isArray(stops) ? stops : [stops];
    const safe = arr.map(safeColor).filter(Boolean);
    if (safe.length < 2) return "";
    const deg = typeof angle === "number" && Number.isFinite(angle) ? `${Math.round(angle)}deg` : "120deg";
    return `linear-gradient(${deg}, ${safe.join(", ")})`;
  },

  /** color-mix wrapper: blend a color with transparent at `amount` (0–1). */
  alpha: (color: unknown, amount: unknown): string => {
    const c = safeColor(color);
    if (!c) return "";
    const a = Math.max(0, Math.min(1, Number(amount)));
    const pct = Number.isFinite(a) ? Math.round(a * 100) : 100;
    return `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  },

  /** Build a responsive `clamp(min, preferred, max)` size. */
  clamp: (min: unknown, preferred: unknown, max: unknown): string =>
    `clamp(${safeLength(min)}, ${safeLength(preferred)}, ${safeLength(max)})`,

  /**
   * Resolve a dotted token path to its CSS variable: `style.token("spacing.l")`
   * → `var(--rui-spacing-l)`, `style.token("colors.primary")` →
   * `var(--rui-color-primary)`. Falls back to "" for unknown shapes.
   */
  token: (path: unknown): string => {
    const p = String(path ?? "").trim();
    if (!/^[a-zA-Z0-9.]+$/.test(p)) return "";
    const [group, ...rest] = p.split(".");
    const key = rest.join("-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    if (!group || !key) return "";
    const prefix = group === "colors" || group === "color" ? "color"
      : group === "spacing" ? "spacing"
      : group === "radius" ? "radius"
      : group === "shadows" || group === "shadow" ? "shadow"
      : group === "gradients" || group === "gradient" ? "gradient"
      : group;
    return `var(--rui-${prefix}-${key})`;
  },

  /** Serialize a plain object of CSS declarations to a sanitised style string. */
  toStyle: (obj: unknown): string => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v == null || v === false) continue;
      const prop = k.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      if (!/^[a-z-]+$/.test(prop)) continue;
      const val = String(v).trim();
      if (/[;{}<>]|expression\s*\(|javascript\s*:|@import/i.test(val)) continue;
      parts.push(`${prop}:${val}`);
    }
    return parts.join(";");
  },
} as const;

export type StyleNamespace = typeof Style;

/* ----------------------------------------------------------------------- *
 * $rules — composable validators
 *
 * Each rule returns a validator `(value) => string | null` (an error message
 * or null when valid). Compose them per field and run with `$rules.validate`.
 * Usable standalone today; the future `$form` engine will consume the same
 * shape.
 * ----------------------------------------------------------------------- */

/**
 * A validator returns an error message (invalid), null (valid), or a Promise
 * of either — async validators (V.2 `asyncCustom`) resolve server-side checks
 * like username uniqueness.
 */
type Validator = (value: unknown) => string | null | Promise<string | null>;

const isThenable = (v: unknown): v is Promise<unknown> =>
  Boolean(v) && typeof (v as { then?: unknown }).then === "function";

const isEmpty = (v: unknown): boolean =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i;

export const Rules = {
  required: (message = "This field is required"): Validator =>
    (v) => (isEmpty(v) ? message : null),

  email: (message = "Enter a valid email"): Validator =>
    (v) => (isEmpty(v) || EMAIL_RE.test(String(v)) ? null : message),

  url: (message = "Enter a valid URL"): Validator =>
    (v) => (isEmpty(v) || URL_RE.test(String(v)) ? null : message),

  min: (n: number, message?: string): Validator =>
    (v) => (isEmpty(v) || Number(v) >= n ? null : (message ?? `Must be at least ${n}`)),

  max: (n: number, message?: string): Validator =>
    (v) => (isEmpty(v) || Number(v) <= n ? null : (message ?? `Must be at most ${n}`)),

  minLength: (n: number, message?: string): Validator =>
    (v) => (isEmpty(v) || String(v).length >= n ? null : (message ?? `Must be at least ${n} characters`)),

  maxLength: (n: number, message?: string): Validator =>
    (v) => (isEmpty(v) || String(v).length <= n ? null : (message ?? `Must be at most ${n} characters`)),

  pattern: (re: unknown, message = "Invalid format"): Validator => {
    // Both the pattern and the value being validated are untrusted, so this is
    // a ReDoS pair. Run it through the bounded tester rather than `rx.test`.
    const source = re instanceof RegExp ? re.source : String(re ?? "");
    return (v) => (isEmpty(v) || safeRegexTest(source, String(v)) ? null : message);
  },

  oneOf: (options: unknown[], message = "Not an allowed value"): Validator =>
    (v) => (isEmpty(v) || (Array.isArray(options) && options.includes(v)) ? null : message),

  matches: (other: unknown, message = "Values do not match"): Validator =>
    (v) => (v === other ? null : message),

  custom: (fn: unknown, message = "Invalid"): Validator =>
    (v) => {
      if (typeof fn !== "function") return null;
      try {
        const res = (fn as (val: unknown) => unknown)(v);
        if (isThenable(res)) {
          return res.then(
            (r) => (r === true || r == null ? null : r === false ? message : String(r)),
            () => message,
          );
        }
        if (res === true || res == null) return null;
        if (res === false) return message;
        return String(res);
      } catch { return message; }
    },

  /**
   * Async validator (V.2) — `fn(value)` may return a Promise resolving to
   * true/null (valid), false (invalid → `message`), or an error string. Use
   * for server-side checks (e.g. username uniqueness). `$form` awaits these
   * before submitting; a rejected promise counts as invalid.
   */
  asyncCustom: (fn: unknown, message = "Invalid"): Validator =>
    (v) => {
      if (typeof fn !== "function") return null;
      try {
        const res = (fn as (val: unknown) => unknown)(v);
        if (!isThenable(res)) return res === true || res == null ? null : res === false ? message : String(res);
        return res.then(
          (r) => (r === true || r == null ? null : r === false ? message : String(r)),
          () => message,
        );
      } catch { return message; }
    },

  /**
   * Run a list of validators against a value; returns the first error
   * message, or null when all pass. Stays fully synchronous for sync
   * validators; returns a Promise only when an async validator is hit.
   */
  validate: (value: unknown, validators: unknown): string | null | Promise<string | null> => {
    const list = Array.isArray(validators) ? validators : [validators];
    const run = (from: number): string | null | Promise<string | null> => {
      for (let i = from; i < list.length; i += 1) {
        const val = list[i];
        if (typeof val !== "function") continue;
        const msg = (val as Validator)(value);
        if (isThenable(msg)) return msg.then((m) => (m ? m : run(i + 1)));
        if (msg) return msg;
      }
      return null;
    };
    return run(0);
  },

  /**
   * Validate an object of `{ field: value }` against a schema of
   * `{ field: [validators] }`. Returns `{ field: message }` for failures
   * (empty object when valid) — or a Promise of it when any validator in the
   * schema is async.
   */
  validateAll: (values: unknown, schema: unknown): Record<string, string> | Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    const pending: Array<Promise<void>> = [];
    if (!schema || typeof schema !== "object") return out;
    const vals = (values && typeof values === "object") ? values as Record<string, unknown> : {};
    for (const [field, validators] of Object.entries(schema as Record<string, unknown>)) {
      const msg = Rules.validate(vals[field], validators);
      if (isThenable(msg)) pending.push(msg.then((m) => { if (m) out[field] = m; }));
      else if (msg) out[field] = msg;
    }
    if (pending.length > 0) return Promise.all(pending).then(() => out);
    return out;
  },
} as const;

export type RulesNamespace = typeof Rules;
