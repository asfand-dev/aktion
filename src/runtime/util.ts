/**
 * `Util` — global helper namespace exposed to Aktion programs.
 *
 * These are pure data transformations available everywhere as
 * `Util.<method>(...)`. They replace the former `@-builtin` catalog
 * (`@Count`, `@Filter`, `@Format`, …) which was removed.
 *
 * The namespace is intentionally open: add methods here and they
 * become available to authors without any other wiring. Pair with
 * documentation in `src/prompt/generator.ts` so the LLM-facing prompt
 * teaches the new entry.
 */

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
};

const toArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const compare = (op: string, a: unknown, b: unknown): boolean => {
  switch (op) {
    case "==": return a === b;
    case "!=": return a !== b;
    case ">": return toNumber(a) > toNumber(b);
    case "<": return toNumber(a) < toNumber(b);
    case ">=": return toNumber(a) >= toNumber(b);
    case "<=": return toNumber(a) <= toNumber(b);
    case "contains": {
      const haystack = String(a ?? "").toLowerCase();
      const needle = String(b ?? "").toLowerCase();
      return haystack.includes(needle);
    }
    default: return false;
  }
};

const getField = (item: unknown, field: string): unknown => {
  if (field === "") return item;
  if (item && typeof item === "object") {
    if (field.includes(".")) {
      let cursor: unknown = item;
      for (const part of field.split(".")) {
        if (cursor && typeof cursor === "object") {
          cursor = (cursor as Record<string, unknown>)[part];
        } else return undefined;
      }
      return cursor;
    }
    return (item as Record<string, unknown>)[field];
  }
  return undefined;
};

const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string" && v.trim() !== "") {
    if (!Number.isNaN(Number(v)) && /^-?\d+$/.test(v.trim())) return new Date(Number(v));
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
};

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_LONG    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const formatDateTokens = (date: Date, pattern: string): string => {
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  const hours = date.getHours();
  const hour12 = ((hours + 11) % 12) + 1;
  const tokens: Array<[RegExp, string]> = [
    [/YYYY/g, String(date.getFullYear())],
    [/YY/g, String(date.getFullYear()).slice(-2)],
    [/MMMM/g, MONTHS_LONG[date.getMonth()]!],
    [/MMM/g, MONTHS_SHORT[date.getMonth()]!],
    [/MM/g, pad(date.getMonth() + 1)],
    [/dddd/g, DAYS_LONG[date.getDay()]!],
    [/ddd/g, DAYS_SHORT[date.getDay()]!],
    [/DD/g, pad(date.getDate())],
    [/HH/g, pad(hours)],
    [/hh/g, pad(hour12)],
    [/mm/g, pad(date.getMinutes())],
    [/ss/g, pad(date.getSeconds())],
    [/\bM\b/g, String(date.getMonth() + 1)],
    [/\bD\b/g, String(date.getDate())],
    [/\bH\b/g, String(hours)],
    [/\bh\b/g, String(hour12)],
    [/\bm\b/g, String(date.getMinutes())],
    [/\bs\b/g, String(date.getSeconds())],
    [/A/g, hours >= 12 ? "PM" : "AM"],
    [/a/g, hours >= 12 ? "pm" : "am"],
  ];
  let out = pattern;
  for (const [re, value] of tokens) out = out.replace(re, value);
  return out;
};

const formatRelative = (date: Date, now = Date.now()): string => {
  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const minute = 60_000, hour = 60 * minute, day = 24 * hour;
  const week = 7 * day, month = 30 * day, year = 365 * day;
  let value: number, unit: string;
  if (abs < minute) return future ? "in a moment" : "just now";
  if (abs < hour) { value = Math.round(abs / minute); unit = "m"; }
  else if (abs < day) { value = Math.round(abs / hour); unit = "h"; }
  else if (abs < week) { value = Math.round(abs / day); unit = "d"; }
  else if (abs < month) { value = Math.round(abs / week); unit = "w"; }
  else if (abs < year) { value = Math.round(abs / month); unit = "mo"; }
  else { value = Math.round(abs / year); unit = "y"; }
  return future ? `in ${value}${unit}` : `${value}${unit} ago`;
};

interface FormatOptions {
  currency?: string;
  locale?: string;
  decimals?: number;
}

const normalizeFormatOptions = (
  mode: string,
  third: unknown,
  fourth: unknown,
): FormatOptions => {
  if (isObject(third)) {
    const out: FormatOptions = {};
    if (typeof third.currency === "string") out.currency = third.currency;
    if (typeof third.locale === "string") out.locale = third.locale;
    if (typeof third.decimals === "number") out.decimals = third.decimals;
    return out;
  }
  const out: FormatOptions = {};
  if (mode === "currency") {
    if (typeof third === "string" && third.length > 0) out.currency = third;
    if (typeof fourth === "string" && fourth.length > 0) out.locale = fourth;
  } else if (typeof third === "string" && third.length > 0) {
    out.locale = third;
  }
  return out;
};

const recase = (input: unknown, kind: "camel" | "pascal" | "snake" | "kebab"): string => {
  const text = String(input ?? "");
  const parts = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  if (parts.length === 0) return "";
  if (kind === "snake") return parts.join("_");
  if (kind === "kebab") return parts.join("-");
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  if (kind === "pascal") return parts.map(cap).join("");
  return parts[0]! + parts.slice(1).map(cap).join("");
};

/**
 * Pure helpers exposed to programs as the `Util` namespace.
 *
 * All methods are side-effect-free and safe inside reactive expressions.
 * Authors typically reach for one of two styles:
 *
 *   total = Util.sum($cart.price)
 *   text  = Util.plural(items.length, "item")
 *
 * Comparators for `filter` / `find` accept the operator strings
 * `"=="`, `"!="`, `">"`, `"<"`, `">="`, `"<="`, `"contains"`.
 */
export const Util = {
  // ── Aggregation ───────────────────────────────────────────
  count: (arr: unknown): number => toArray(arr).length,
  sum: (arr: unknown): number =>
    toArray(arr).reduce<number>((a, v) => a + toNumber(v), 0),
  avg: (arr: unknown): number => {
    const xs = toArray(arr);
    return xs.length === 0 ? 0 : xs.reduce<number>((a, v) => a + toNumber(v), 0) / xs.length;
  },
  min: (arr: unknown): number => {
    const xs = toArray(arr).map(toNumber);
    return xs.length === 0 ? 0 : Math.min(...xs);
  },
  max: (arr: unknown): number => {
    const xs = toArray(arr).map(toNumber);
    return xs.length === 0 ? 0 : Math.max(...xs);
  },
  first: (arr: unknown): unknown => toArray(arr)[0] ?? null,
  last: (arr: unknown): unknown => {
    const xs = toArray(arr);
    return xs.length === 0 ? null : xs[xs.length - 1];
  },

  // ── Reshaping ─────────────────────────────────────────────
  filter: (arr: unknown, field = "", op = "==", value?: unknown): unknown[] =>
    toArray(arr).filter((item) => compare(op, getField(item, String(field)), value)),
  find: (arr: unknown, field = "", op = "==", value?: unknown): unknown =>
    toArray(arr).find((item) => compare(op, getField(item, String(field)), value)) ?? null,
  sort: (arr: unknown, field = "", direction: "asc" | "desc" = "asc"): unknown[] => {
    const xs = [...toArray(arr)];
    const dir = String(direction).toLowerCase() === "desc" ? -1 : 1;
    xs.sort((a, b) => {
      const av = getField(a, String(field));
      const bv = getField(b, String(field));
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return xs;
  },
  groupBy: (arr: unknown, field = ""): Record<string, unknown[]> => {
    const out: Record<string, unknown[]> = {};
    for (const item of toArray(arr)) {
      const key = String(getField(item, String(field)) ?? "");
      (out[key] ??= []).push(item);
    }
    return out;
  },
  slice: (arr: unknown, start?: number, end?: number): unknown[] => {
    const xs = toArray(arr);
    return xs.slice(start ?? 0, end ?? xs.length);
  },
  unique: (arr: unknown, field?: string): unknown[] => {
    const xs = toArray(arr);
    if (!field) return Array.from(new Set(xs));
    const seen = new Set<unknown>();
    const out: unknown[] = [];
    for (const item of xs) {
      const key = getField(item, field);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  },
  reverse: (arr: unknown): unknown[] => [...toArray(arr)].reverse(),
  range: (start: number, end: number, step?: number): number[] => {
    const a = toNumber(start), b = toNumber(end);
    const s = step === undefined ? (b >= a ? 1 : -1) : toNumber(step);
    if (s === 0) return [a];
    const span = Math.abs(b - a);
    const count = Math.floor(span / Math.abs(s)) + 1;
    if (count > MAX_RANGE) {
      throw new RangeError(
        `$util.range refusing to allocate ${count} entries (limit ${MAX_RANGE}).`,
      );
    }
    const out: number[] = [];
    if (s > 0) { for (let n = a; n <= b; n += s) out.push(n); }
    else       { for (let n = a; n >= b; n += s) out.push(n); }
    return out;
  },
  repeat: <T>(value: T, n: number): T[] => {
    const count = Math.max(0, toNumber(n));
    if (count > MAX_RANGE) {
      throw new RangeError(
        `$util.repeat refusing to allocate ${count} entries (limit ${MAX_RANGE}).`,
      );
    }
    return Array.from({ length: count }, () => value);
  },
  pick: (obj: unknown, keys: unknown): Record<string, unknown> => {
    if (!isObject(obj)) return {};
    const ks = toArray(keys).map((k) => String(k ?? ""));
    const out: Record<string, unknown> = {};
    for (const k of ks) {
      if (k in obj) out[k] = obj[k];
    }
    return out;
  },

  // ── Formatting ────────────────────────────────────────────
  /**
   * Locale-aware number formatter. Modes: `"number"` (default),
   * `"currency"`, `"percent"`, `"compact"`. Options object:
   * `{ currency?, locale?, decimals? }`. Legacy positional form
   * `Util.format(v, "currency", "USD", "en-US")` is also accepted.
   */
  format: (value: unknown, mode = "number", options?: unknown, fourth?: unknown): string => {
    const v = toNumber(value);
    const m = String(mode);
    const opts = normalizeFormatOptions(m, options, fourth);
    const fmtOptions: Intl.NumberFormatOptions = {};
    if (m === "currency") {
      fmtOptions.style = "currency";
      fmtOptions.currency = opts.currency || "USD";
    } else if (m === "percent") {
      fmtOptions.style = "percent";
      if (opts.decimals === undefined) fmtOptions.maximumFractionDigits = 2;
    } else if (m === "compact") {
      fmtOptions.notation = "compact";
    } else {
      fmtOptions.style = "decimal";
    }
    if (opts.decimals !== undefined) {
      fmtOptions.minimumFractionDigits = opts.decimals;
      fmtOptions.maximumFractionDigits = opts.decimals;
    }
    try {
      return new Intl.NumberFormat(opts.locale || undefined, fmtOptions).format(v);
    } catch {
      return m === "currency" ? v.toFixed(opts.decimals ?? 2) : String(v);
    }
  },
  /**
   * Format a date. Second argument is either a moment-like pattern
   * (`"MMM D"`, `"YYYY-MM-DD"`) or one of: `"relative"`, `"date"`,
   * `"time"`, `"datetime"`, `"iso"`.
   */
  formatDate: (value: unknown, format = "MMM D"): string => {
    const date = toDate(value);
    const mode = String(format);
    switch (mode) {
      case "relative": return formatRelative(date);
      case "date": return date.toLocaleDateString();
      case "time": return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      case "datetime": return date.toLocaleString();
      case "iso": return date.toISOString();
      default: return formatDateTokens(date, mode);
    }
  },
  plural: (count: unknown, singular: unknown, plural?: unknown): string => {
    const n = toNumber(count);
    const s = String(singular ?? "");
    const p = plural === undefined ? s + "s" : String(plural ?? "");
    return `${n} ${n === 1 ? s : p}`;
  },
  capitalize: (text: unknown): string => {
    const t = String(text ?? "");
    return t.length === 0 ? "" : t.charAt(0).toUpperCase() + t.slice(1);
  },
  lowercase: (text: unknown): string => String(text ?? "").toLowerCase(),
  uppercase: (text: unknown): string => String(text ?? "").toUpperCase(),
  titlecase: (text: unknown): string => String(text ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" "),
  case: (text: unknown, kind: "camel" | "snake" | "kebab" | "pascal" = "camel"): string => {
    const k = String(kind).toLowerCase();
    return recase(text, (k === "snake" || k === "kebab" || k === "pascal" || k === "camel") ? k : "camel");
  },

  // ── Date / time ───────────────────────────────────────────
  now: (): number => Date.now(),
  today: (): string => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  },
  addDays: (date: unknown, days: unknown): string => {
    const d = toDate(date);
    const next = new Date(d.getTime());
    next.setDate(next.getDate() + toNumber(days));
    return next.toISOString();
  },
  addHours: (date: unknown, hours: unknown): string => {
    const d = toDate(date);
    const next = new Date(d.getTime() + toNumber(hours) * 3_600_000);
    return next.toISOString();
  },
  diffDays: (start: unknown, end: unknown): number => {
    const a = toDate(start), b = toDate(end);
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
  },
  startOfWeek: (date: unknown): string => {
    const d = toDate(date);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    next.setUTCDate(next.getUTCDate() - next.getUTCDay());
    return next.toISOString();
  },
  endOfMonth: (date: unknown): string => {
    const d = toDate(date);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  },

  // ── String / regex helpers ────────────────────────────────
  join: (arr: unknown, sep = ","): string =>
    toArray(arr).map((v) => (v == null ? "" : String(v))).join(String(sep)),
  split: (text: unknown, sep = ","): string[] => String(text ?? "").split(String(sep)),
  trim: (text: unknown): string => String(text ?? "").trim(),
  replace: (text: unknown, search: unknown, replacement: unknown = ""): string =>
    String(text ?? "").split(String(search ?? "")).join(String(replacement ?? "")),
  substring: (text: unknown, start: unknown, end?: unknown): string => {
    const t = String(text ?? "");
    return t.substring(toNumber(start), end === undefined ? t.length : toNumber(end));
  },
  startsWith: (text: unknown, prefix: unknown): boolean =>
    String(text ?? "").startsWith(String(prefix ?? "")),
  endsWith: (text: unknown, suffix: unknown): boolean =>
    String(text ?? "").endsWith(String(suffix ?? "")),
  contains: (text: unknown, needle: unknown): boolean =>
    String(text ?? "").includes(String(needle ?? "")),
  match: (text: unknown, pattern: unknown): boolean => {
    try { return new RegExp(String(pattern ?? "")).test(String(text ?? "")); }
    catch { return false; }
  },

  // ── Math ──────────────────────────────────────────────────
  round: (value: unknown, decimals = 0): number => {
    const factor = Math.pow(10, toNumber(decimals));
    return Math.round(toNumber(value) * factor) / factor;
  },
  floor: (value: unknown): number => Math.floor(toNumber(value)),
  ceil: (value: unknown): number => Math.ceil(toNumber(value)),
  abs: (value: unknown): number => Math.abs(toNumber(value)),
  clamp: (value: unknown, min: unknown, max: unknown): number =>
    Math.min(Math.max(toNumber(value), toNumber(min)), toNumber(max)),
  pow: (base: unknown, exp: unknown): number => Math.pow(toNumber(base), toNumber(exp)),
  sqrt: (value: unknown): number => Math.sqrt(toNumber(value)),
  random: (): number => Math.random(),
  log: (value: unknown): number => Math.log(toNumber(value)),
} as const;

// Soft cap on `Util.range` / `Util.repeat` allocations so a stray
// `Util.range(0, 1e9)` cannot wedge the renderer before evaluation
// budgets kick in elsewhere.
const MAX_RANGE = 100_000;

export type UtilNamespace = typeof Util;
