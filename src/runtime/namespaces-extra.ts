/**
 * Extra runtime namespaces exposed to Aktion programs (suggestions-global
 * Parts V.2, XIII.2): `$style` (bounded styling helpers) and `$rules`
 * (composable validators). Both are pure — no side effects — and safe to
 * call from any expression / action / effect / lambda.
 */

// `parseDuration` is imported rather than reimplemented: `rules.duration` and
// `$util.duration.parse` must agree about what a duration is, and two copies of
// a grammar this fiddly would not stay in step.
import { parseDuration as parseDurationSeconds, safeRegexTest } from "./util.js";

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

/* --- Network address parsing --------------------------------------------- *
 *
 * Hand-written rather than regex-driven, and deliberately so: the obvious IPv4
 * pattern (`\d{1,3}(\.\d{1,3}){3}`) accepts `999.1.1.1`, and the obvious IPv6
 * one is either wrong about `::` or a ReDoS candidate. These are linear, total,
 * and reject the octal-looking leading zeros (`010.0.0.1`) that different
 * network stacks disagree about — the ambiguity is itself a reason to refuse.
 * ------------------------------------------------------------------------- */

/** A decimal integer in `[0, max]`, written without a sign or a leading zero. */
const isPlainInt = (text: string, max: number): boolean => {
  if (!/^\d+$/.test(text)) return false;
  if (text.length > 1 && text.startsWith("0")) return false;
  const value = Number(text);
  return value <= max;
};

/** Dotted-quad IPv4, e.g. `192.168.0.1`. */
const isIpv4Address = (text: string): boolean => {
  const parts = text.split(".");
  return parts.length === 4 && parts.every((part) => isPlainInt(part, 255));
};

/**
 * IPv6, including the `::` run-of-zeros shorthand, a trailing dotted-quad
 * (`::ffff:192.168.0.1`) and an RFC 4007 zone index (`fe80::1%eth0`). A `::`
 * may appear at most once, and the groups on either side of it must leave room
 * for the ones it stands in for.
 *
 * Matches `node:net`'s `isIPv6` on a corpus of valid and malformed addresses,
 * which is the parser everything else in the stack agrees with — including the
 * zone index, which a link-local address genuinely needs and which is the one
 * case a from-scratch implementation always forgets.
 */
const isIpv6Address = (input: string): boolean => {
  // The zone is an interface name, not part of the address — any non-empty
  // string is legitimate, so it is separated off rather than validated.
  const zoneAt = input.indexOf("%");
  if (zoneAt !== -1 && zoneAt === input.length - 1) return false;
  const text = zoneAt === -1 ? input : input.slice(0, zoneAt);
  if (text.indexOf(":") === -1) return false;
  const halves = text.split("::");
  if (halves.length > 2) return false;
  const compressed = halves.length === 2;

  const groupsOf = (part: string): string[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    // An embedded IPv4 tail occupies the last TWO 16-bit groups.
    const tail = groups[groups.length - 1] ?? "";
    if (tail.indexOf(".") !== -1) {
      if (!isIpv4Address(tail)) return null;
      groups.splice(groups.length - 1, 1, "0", "0");
    }

    return groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group)) ? groups : null;
  };

  const head = groupsOf(halves[0] ?? "");
  const rest = compressed ? groupsOf(halves[1] ?? "") : [];
  if (head === null || rest === null) return false;
  const total = head.length + rest.length;
  // `::` stands for AT LEAST one zero group, so a compressed address that
  // already names eight is not shorter — it is malformed.
  return compressed ? total < 8 : total === 8;
};

/** `address/prefix`, where the prefix fits the address family. */
const isCidrBlock = (text: string): boolean => {
  const slash = text.indexOf("/");
  if (slash === -1) return false;
  const address = text.slice(0, slash);
  const prefix = text.slice(slash + 1);
  if (isIpv4Address(address)) return isPlainInt(prefix, 32);
  return isIpv6Address(address) && isPlainInt(prefix, 128);
};

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

  /**
   * A whole number. `min`/`max` bound the magnitude but say nothing about the
   * step, so `2.5` passes `min(1)` + `max(10)` — which is wrong for every count,
   * port, weight and retry limit a form asks for.
   *
   * `Number("")` is `0` and `Number(" ")` is `0` too, so the value is tested as
   * TEXT before it is coerced: a field containing only spaces is empty, not
   * zero. `isEmpty` still lets a genuinely blank field through untouched —
   * "this is not a whole number" is not the complaint to make about a field the
   * operator has not filled in yet; that is `required`'s job.
   */
  integer: (message = "Enter a whole number"): Validator =>
    (v) => {
      if (isEmpty(v)) return null;
      if (typeof v === "number") return Number.isInteger(v) ? null : message;
      const text = String(v).trim();
      return text !== "" && Number.isInteger(Number(text)) ? null : message;
    },

  /**
   * An inclusive numeric range — `min(lo)` and `max(hi)` in one rule, so the
   * message can name both ends. A field that fails one bound almost always
   * wants to be told the other.
   */
  range: (lo: number, hi: number, message?: string): Validator =>
    (v) => {
      if (isEmpty(v)) return null;
      const value = Number(String(v).trim());
      return Number.isFinite(value) && value >= lo && value <= hi
        ? null
        : (message ?? `Must be between ${lo} and ${hi}`);
    },

  /**
   * A TCP/UDP port: a whole number in `[1, 65535]`. Port `0` is excluded
   * deliberately — the kernel reads it as "assign me one", which is never what
   * a form field that names a destination means.
   */
  port: (message = "Enter a port between 1 and 65535"): Validator =>
    (v) => {
      if (isEmpty(v)) return null;
      const text = String(v).trim();
      return isPlainInt(text, 65_535) && text !== "0" ? null : message;
    },

  /** A dotted-quad IPv4 address, e.g. `192.168.0.10`. */
  ipv4: (message = "Enter a valid IPv4 address"): Validator =>
    (v) => (isEmpty(v) || isIpv4Address(String(v).trim()) ? null : message),

  /** An IPv6 address, `::` shorthand and IPv4-mapped tails included. */
  ipv6: (message = "Enter a valid IPv6 address"): Validator =>
    (v) => (isEmpty(v) || isIpv6Address(String(v).trim()) ? null : message),

  /** Either family — for a field that accepts whatever the network runs. */
  ip: (message = "Enter a valid IP address"): Validator =>
    (v) => {
      if (isEmpty(v)) return null;
      const text = String(v).trim();
      return isIpv4Address(text) || isIpv6Address(text) ? null : message;
    },

  /**
   * A CIDR block — `address/prefix`, with the prefix bounded by the address
   * family (`/0`–`/32` for IPv4, `/0`–`/128` for IPv6). A bare address without
   * a prefix is rejected: `10.0.0.0` and `10.0.0.0/8` mean different things,
   * and silently accepting the first is how a subnet field ends up meaning a
   * single host.
   */
  cidr: (message = "Enter a valid CIDR block, e.g. 10.0.0.0/24"): Validator =>
    (v) => (isEmpty(v) || isCidrBlock(String(v).trim()) ? null : message),

  /**
   * A duration — `5m`, `250ms`, `2h`, `PT30S`, `P1DT12H` — optionally inside an
   * inclusive range given in SECONDS.
   *
   * `bounds` is `{min, max}`, either half omissible, and a STRING in that
   * position is read as the message so the common `duration("…")` reads
   * naturally. Both bounds are in seconds because that is the unit
   * `$util.duration` speaks; the grammar the operator types in is theirs to
   * choose, and `2h`, `120m` and `PT2H` all satisfy `{max: 7200}` alike.
   *
   * That is the whole reason this is not `pattern(…)` plus `range(…)`: a
   * regular expression can say whether `90m` is well-formed but not whether it
   * is under a two-hour ceiling, and a numeric range cannot see through the
   * unit at all. Cooldowns, TTLs, timeouts, poll intervals and retention
   * windows all want exactly this pair of questions asked together.
   *
   * An out-of-range value and a malformed one report the SAME message by
   * default. Pass your own when the two are worth separating — a field with a
   * documented floor usually is.
   */
  duration: (bounds?: unknown, message?: string): Validator => {
    const asMessage = typeof bounds === "string" ? bounds : message;
    const range = (bounds && typeof bounds === "object" ? bounds : {}) as {
      min?: unknown;
      max?: unknown;
    };
    const low = typeof range.min === "number" ? range.min : null;
    const high = typeof range.max === "number" ? range.max : null;
    const text = asMessage ?? "Enter a valid duration, e.g. 30s, 5m or PT1H";
    return (v) => {
      if (isEmpty(v)) return null;
      const seconds = parseDurationSeconds(v);
      if (seconds === null) return text;
      if (low !== null && seconds < low) return text;
      return high !== null && seconds > high ? text : null;
    };
  },

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
