/**
 * Built-in `@Name(...)` functions for Streaming UI Script.
 *
 * These are pure data transformations. Action builtins (@Run, @Set, @Reset,
 * @ToAssistant, @OpenUrl) are handled separately because they are emitted as
 * marker objects that the action runner interprets at click-time.
 */

export type BuiltinFn = (args: unknown[]) => unknown;

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
};

const toArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

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
  if (item && typeof item === "object") {
    return (item as Record<string, unknown>)[field];
  }
  return undefined;
};

const filterByField = (args: unknown[]): unknown[] => {
  const arr = toArray(args[0]);
  const field = String(args[1] ?? "");
  const op = String(args[2] ?? "==");
  const value = args[3];
  return arr.filter((item) => compare(op, getField(item, field), value));
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Parse a value into a `Date` instance. Accepts ISO strings, epoch
 * milliseconds, `Date` instances themselves, and (as a graceful fallback)
 * the empty string → "now".
 */
const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string" && v.trim() !== "") {
    // Numeric strings are interpreted as epoch ms; everything else goes
    // through `Date`'s ISO/date string parser.
    if (!Number.isNaN(Number(v)) && /^-?\d+$/.test(v.trim())) {
      return new Date(Number(v));
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
};

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_LONG    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/**
 * Tiny date formatter using a moment-like token language. Supports:
 *   YYYY, YY, MMMM, MMM, MM, M, DD, D, dddd, ddd, HH, H, hh, h, mm, m, ss, s, A, a.
 * Designed for human-readable labels in cards/timelines — not a replacement
 * for `Intl.DateTimeFormat` which authors should reach for via @Format if
 * they need full locale awareness.
 */
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
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  let value: number;
  let unit: string;
  if (abs < minute) return future ? "in a moment" : "just now";
  if (abs < hour) { value = Math.round(abs / minute); unit = "m"; }
  else if (abs < day) { value = Math.round(abs / hour); unit = "h"; }
  else if (abs < week) { value = Math.round(abs / day); unit = "d"; }
  else if (abs < month) { value = Math.round(abs / week); unit = "w"; }
  else if (abs < year) { value = Math.round(abs / month); unit = "mo"; }
  else { value = Math.round(abs / year); unit = "y"; }
  return future ? `in ${value}${unit}` : `${value}${unit} ago`;
};

const recase = (input: unknown, kind: "camel" | "pascal" | "snake" | "kebab"): string => {
  const text = String(input ?? "");
  // Split on any non-alphanumeric run AND at boundaries between lowercase
  // followed by uppercase (so `helloWorld` → ["hello","World"]).
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
  // camel
  return parts[0]! + parts.slice(1).map(cap).join("");
};

export const dataBuiltins: Record<string, BuiltinFn> = {
  Count: (args) => toArray(args[0]).length,
  Sum: (args) => toArray(args[0]).reduce<number>((acc, v) => acc + toNumber(v), 0),
  Avg: (args) => {
    const arr = toArray(args[0]);
    if (arr.length === 0) return 0;
    return arr.reduce<number>((acc, v) => acc + toNumber(v), 0) / arr.length;
  },
  Min: (args) => {
    const arr = toArray(args[0]).map(toNumber);
    return arr.length === 0 ? 0 : Math.min(...arr);
  },
  Max: (args) => {
    const arr = toArray(args[0]).map(toNumber);
    return arr.length === 0 ? 0 : Math.max(...arr);
  },
  First: (args) => toArray(args[0])[0] ?? null,
  Last: (args) => {
    const arr = toArray(args[0]);
    return arr.length === 0 ? null : arr[arr.length - 1];
  },
  Filter: filterByField,
  /** Alias for `@Filter` — identical semantics. */
  FilterBy: filterByField,
  Sort: (args) => {
    const arr = [...toArray(args[0])];
    const field = String(args[1] ?? "");
    const direction = String(args[2] ?? "asc").toLowerCase() === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      const av = getField(a, field);
      const bv = getField(b, field);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
      return String(av ?? "").localeCompare(String(bv ?? "")) * direction;
    });
    return arr;
  },
  Round: (args) => {
    const n = toNumber(args[0]);
    const decimals = args[1] === undefined ? 0 : toNumber(args[1]);
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  },
  Abs: (args) => Math.abs(toNumber(args[0])),
  Floor: (args) => Math.floor(toNumber(args[0])),
  Ceil: (args) => Math.ceil(toNumber(args[0])),

  // ───────── Array helpers ─────────
  /** Find the first item matching a comparator (mirrors `@Filter`). */
  Find: (args) => {
    const arr = toArray(args[0]);
    const field = String(args[1] ?? "");
    const op = String(args[2] ?? "==");
    const value = args[3];
    return arr.find((item) => compare(op, getField(item, field), value)) ?? null;
  },
  /** Group items by a field — `{groupKey: [items…]}`. */
  GroupBy: (args) => {
    const arr = toArray(args[0]);
    const field = String(args[1] ?? "");
    const out: Record<string, unknown[]> = {};
    for (const item of arr) {
      const key = String(getField(item, field) ?? "");
      (out[key] ??= []).push(item);
    }
    return out;
  },
  /** Slice an array — `start`, optional `end`, both clamped. */
  Slice: (args) => {
    const arr = toArray(args[0]);
    const start = args[1] === undefined ? 0 : toNumber(args[1]);
    const end = args[2] === undefined ? arr.length : toNumber(args[2]);
    return arr.slice(start, end);
  },
  /**
   * Deduplicate. Without a field, compares values with strict equality;
   * with a field, dedupes by that field's value (first seen wins).
   */
  Unique: (args) => {
    const arr = toArray(args[0]);
    const field = args[1] === undefined ? "" : String(args[1] ?? "");
    if (!field) return Array.from(new Set(arr));
    const seen = new Set<unknown>();
    const out: unknown[] = [];
    for (const item of arr) {
      const key = getField(item, field);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  },
  /** Reverse a copy of the array (non-mutating). */
  Reverse: (args) => [...toArray(args[0])].reverse(),
  /**
   * Inclusive integer range. `@Range(0, 4)` → `[0,1,2,3,4]`. With a third
   * argument, controls the step (defaults to 1, may be negative).
   */
  Range: (args) => {
    const start = toNumber(args[0]);
    const end = toNumber(args[1]);
    const step = args[2] === undefined ? (end >= start ? 1 : -1) : toNumber(args[2]);
    if (step === 0) return [start];
    const out: number[] = [];
    if (step > 0) {
      for (let n = start; n <= end; n += step) out.push(n);
    } else {
      for (let n = start; n >= end; n += step) out.push(n);
    }
    return out;
  },
  /** Repeat a value N times — handy for skeleton placeholders. */
  Repeat: (args) => {
    const n = Math.max(0, toNumber(args[1]));
    return Array.from({ length: n }, () => args[0]);
  },
  /** Reshape an object — keep only the listed keys. */
  Pick: (args) => {
    const obj = args[0];
    if (!isObject(obj)) return {};
    const keys = toArray(args[1]).map((k) => String(k ?? ""));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in obj) out[key] = obj[key];
    }
    return out;
  },

  // ───────── Formatting ─────────
  /**
   * Locale-aware number/currency formatter. Modes:
   *   - `"currency"` (default `USD`)
   *   - `"percent"` — multiplies by 100; pass already-fractional values
   *   - `"number"` / omitted — plain numeric formatting
   */
  Format: (args) => {
    const value = toNumber(args[0]);
    const mode = String(args[1] ?? "number");
    const opt = args[2];
    if (mode === "currency") {
      const currency = String(opt ?? "USD") || "USD";
      const locale = args[3] === undefined ? undefined : String(args[3] ?? "");
      try {
        return new Intl.NumberFormat(locale || undefined, { style: "currency", currency }).format(value);
      } catch {
        return value.toFixed(2);
      }
    }
    if (mode === "percent") {
      const locale = args[2] === undefined ? undefined : String(args[2] ?? "");
      return new Intl.NumberFormat(locale || undefined, { style: "percent", maximumFractionDigits: 2 }).format(value);
    }
    const locale = args[2] === undefined ? undefined : String(args[2] ?? "");
    return new Intl.NumberFormat(locale || undefined).format(value);
  },
  /**
   * Format a date. The second argument is either a moment-like pattern
   * (e.g. `"MMM D"`, `"YYYY-MM-DD"`) or one of these named modes:
   *   - `"relative"` — "5m ago", "in 2h"
   *   - `"date"`     — locale short date
   *   - `"time"`     — locale short time
   *   - `"datetime"` — locale short datetime
   *   - `"iso"`      — ISO 8601 string
   */
  FormatDate: (args) => {
    const date = toDate(args[0]);
    const mode = String(args[1] ?? "MMM D");
    switch (mode) {
      case "relative": return formatRelative(date);
      case "date": return date.toLocaleDateString();
      case "time": return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      case "datetime": return date.toLocaleString();
      case "iso": return date.toISOString();
      default: return formatDateTokens(date, mode);
    }
  },

  // ───────── Date / time helpers ─────────
  /** Current moment as epoch ms — feed to @FormatDate for display. */
  Now: () => Date.now(),
  /** Today's date at midnight, as an ISO string. */
  Today: () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  },
  /** Shift a date by N days (negative N moves backward). */
  AddDays: (args) => {
    const date = toDate(args[0]);
    const days = toNumber(args[1]);
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next.toISOString();
  },
  /** Shift a date by N hours (negative N moves backward). */
  AddHours: (args) => {
    const date = toDate(args[0]);
    const hours = toNumber(args[1]);
    const next = new Date(date.getTime());
    next.setTime(next.getTime() + hours * 3_600_000);
    return next.toISOString();
  },
  /** Whole-day difference from `start` to `end` (end − start). */
  DiffDays: (args) => {
    const start = toDate(args[0]);
    const end = toDate(args[1]);
    const msPerDay = 86_400_000;
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  },
  /** UTC Sunday 00:00:00 for the week containing `date`. */
  StartOfWeek: (args) => {
    const date = toDate(args[0]);
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    next.setUTCDate(next.getUTCDate() - next.getUTCDay());
    return next.toISOString();
  },
  /** Last moment of the calendar month containing `date`. */
  EndOfMonth: (args) => {
    const date = toDate(args[0]);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return next.toISOString();
  },

  // ───────── String helpers ─────────
  /** Pluralisation: `@Plural(n, "order", "orders")` → "1 order"/"2 orders". */
  Plural: (args) => {
    const n = toNumber(args[0]);
    const singular = String(args[1] ?? "");
    const plural = args[2] === undefined ? singular + "s" : String(args[2] ?? "");
    return `${n} ${n === 1 ? singular : plural}`;
  },
  Capitalize: (args) => {
    const text = String(args[0] ?? "");
    if (text.length === 0) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
  Lowercase: (args) => String(args[0] ?? "").toLowerCase(),
  Uppercase: (args) => String(args[0] ?? "").toUpperCase(),
  Titlecase: (args) => String(args[0] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" "),
  Case: (args) => {
    const kind = String(args[1] ?? "camel").toLowerCase();
    if (kind === "snake" || kind === "kebab" || kind === "pascal" || kind === "camel") {
      return recase(args[0], kind);
    }
    return recase(args[0], "camel");
  },
  Join: (args) => {
    const arr = toArray(args[0]);
    const sep = args[1] === undefined ? "," : String(args[1] ?? "");
    return arr.map((v) => (v == null ? "" : String(v))).join(sep);
  },
  Split: (args) => {
    const text = String(args[0] ?? "");
    const sep = args[1] === undefined ? "," : String(args[1] ?? "");
    return text.split(sep);
  },
  Trim: (args) => String(args[0] ?? "").trim(),
  Replace: (args) => {
    const text = String(args[0] ?? "");
    const search = String(args[1] ?? "");
    const replacement = args[2] === undefined ? "" : String(args[2] ?? "");
    return text.split(search).join(replacement);
  },
  Substring: (args) => {
    const text = String(args[0] ?? "");
    const start = toNumber(args[1]);
    const end = args[2] === undefined ? text.length : toNumber(args[2]);
    return text.substring(start, end);
  },
  StartsWith: (args) => String(args[0] ?? "").startsWith(String(args[1] ?? "")),
  EndsWith: (args) => String(args[0] ?? "").endsWith(String(args[1] ?? "")),
  Contains: (args) => String(args[0] ?? "").includes(String(args[1] ?? "")),
  Match: (args) => {
    const text = String(args[0] ?? "");
    const pattern = String(args[1] ?? "");
    try {
      return new RegExp(pattern).test(text);
    } catch {
      return false;
    }
  },

  // ───────── Numeric utility ─────────
  /** Clamp a number into `[min, max]`. */
  Clamp: (args) => {
    const v = toNumber(args[0]);
    const min = toNumber(args[1]);
    const max = toNumber(args[2]);
    return Math.min(Math.max(v, min), max);
  },
  Pow: (args) => Math.pow(toNumber(args[0]), toNumber(args[1])),
  Sqrt: (args) => Math.sqrt(toNumber(args[0])),
  Random: () => Math.random(),
  Log: (args) => Math.log(toNumber(args[0])),
};

/**
 * Action step builtins return marker objects so that buttons can run them
 * later inside an `Action([...])`. They are *not* executed at evaluation time.
 */
export type ActionStep =
  | { kind: "Run"; ref: string }
  | { kind: "Set"; name: string; value: unknown }
  | { kind: "Reset"; names: string[] }
  | { kind: "ToAssistant"; message: string }
  | { kind: "OpenUrl"; url: string }
  /**
   * Internal hash-based navigation. Updates `window.location.hash` so the
   * browser back/forward buttons keep working.
   */
  | { kind: "Navigate"; path: string }
  /**
   * `args` carries values captured at render time — used to pass per-item data
   * (loop variables, computed values) into the JS body. Accessible inside the
   * body as `ctx.args.<key>`. Always an object, never null.
   */
  | { kind: "Js"; code: string; args: Record<string, unknown> };

export const isActionStep = (value: unknown): value is ActionStep => {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "Run" || kind === "Set" || kind === "Reset" ||
    kind === "ToAssistant" || kind === "OpenUrl" ||
    kind === "Navigate" || kind === "Js"
  );
};

export interface ActionPayload {
  kind: "Action";
  steps: ActionStep[];
}

export const isActionPayload = (value: unknown): value is ActionPayload => {
  return Boolean(
    value && typeof value === "object" &&
    (value as { kind?: unknown }).kind === "Action",
  );
};

/**
 * Marker emitted by the `Theme({...})` construct. Carries an arbitrary token
 * map that the element applies on top of the base theme between render
 * cycles. Distinct from `ComponentNode` so the renderer can ignore it (it is
 * a side-effect, not a piece of UI to draw).
 *
 * Authors declare a theme like any other top-level binding:
 *
 *   theme = Theme({colorPrimary: "#0969da", radiusButton: "6px"})
 *   root  = Stack([...])
 */
export interface ThemeNode {
  kind: "Theme";
  tokens: Record<string, string>;
}

export const isThemeNode = (value: unknown): value is ThemeNode => {
  return Boolean(
    value && typeof value === "object" &&
    (value as { kind?: unknown }).kind === "Theme",
  );
};
