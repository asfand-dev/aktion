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

/**
 * A `Blob`-ish value, structurally. Deliberately NOT `instanceof Blob`: a
 * program may be handed a `File` from a different realm (an `<iframe>`'s picker,
 * a jsdom test), where the constructor identity differs but the interface does
 * not.
 */
type BlobLike = {
  size?: number;
  type?: string;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

const isBlobLike = (v: unknown): v is BlobLike =>
  Boolean(v) && typeof v === "object" &&
  (typeof (v as BlobLike).text === "function" || typeof (v as BlobLike).arrayBuffer === "function");

/**
 * The one file out of whatever `FileUpload` handed over.
 *
 * `onSelect` is invoked with the whole pick — a `FileList` in the browser, a
 * plain array after a remove — so the overwhelmingly common call is
 * `$util.readFile(files)` rather than `$util.readFile(files[0])`. Accepting both
 * removes the single most likely mistake at the call site: indexing a `FileList`
 * is fine, but forgetting to is silent, and `readFile(aFileList)` would
 * otherwise resolve `""` as though the file were unreadable.
 */
const firstBlob = (input: unknown): BlobLike | null => {
  if (isBlobLike(input)) return input;
  if (Array.isArray(input)) {
    const found = input.find((entry) => isBlobLike(entry));
    return found ? (found as BlobLike) : null;
  }
  // `FileList` is array-LIKE, not an array: it has `length` + index access and
  // nothing else, so neither branch above reaches it.
  if (input && typeof input === "object" && typeof (input as { length?: unknown }).length === "number") {
    const list = input as unknown as ArrayLike<unknown>;
    for (let index = 0; index < list.length; index += 1) {
      if (isBlobLike(list[index])) return list[index] as BlobLike;
    }
  }
  return null;
};

/**
 * Decode a blob as UTF-8 text.
 *
 * `Blob.prototype.text()` is the modern path and is what every current browser
 * and jsdom provide. The `FileReader` fallback is for hosts that predate it;
 * both are reached through this one function so a caller never has to know which
 * it got.
 */
const blobToText = (blob: BlobLike): Promise<string> => {
  if (typeof blob.text === "function") return blob.text().then((value) => String(value ?? ""));
  if (typeof blob.arrayBuffer === "function" && typeof TextDecoder !== "undefined") {
    return blob.arrayBuffer().then((buffer) => new TextDecoder().decode(new Uint8Array(buffer)));
  }
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === "undefined") { reject(new Error("no FileReader")); return; }
    const reader = new FileReader();
    reader.onload = () => { resolve(String(reader.result ?? "")); };
    reader.onerror = () => { reject(reader.error ?? new Error("read failed")); };
    reader.readAsText(blob as unknown as Blob);
  });
};

/**
 * Encode a blob as a `data:` URI.
 *
 * Built from `arrayBuffer()` + `btoa` rather than `FileReader.readAsDataURL`
 * because the buffer path is available wherever `blobToText` is, keeps this
 * helper synchronous in structure, and — unlike `FileReader` — cannot be left
 * hanging by a host that never fires either callback. The chunked `btoa` is not
 * an optimisation: `String.fromCharCode(...bytes)` on a multi-megabyte file
 * spreads a million arguments onto the stack and throws `RangeError`.
 */
const blobToDataUrl = (blob: BlobLike): Promise<string> => {
  if (typeof blob.arrayBuffer !== "function" || typeof btoa === "undefined") {
    return Promise.reject(new Error("no arrayBuffer"));
  }
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 8192;
    for (let at = 0; at < bytes.length; at += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
  });
};

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
    case "startsWith": return String(a ?? "").toLowerCase().startsWith(String(b ?? "").toLowerCase());
    case "endsWith": return String(a ?? "").toLowerCase().endsWith(String(b ?? "").toLowerCase());
    default: return false;
  }
};

const cloneDeepValue = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((v) => cloneDeepValue(v)) as unknown as T;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = cloneDeepValue((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
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
 * `"=="`, `"!="`, `">"`, `"<"`, `">="`, `"<="`, `"contains"`,
 * `"startsWith"`, `"endsWith"`. The string operators (`contains` /
 * `startsWith` / `endsWith`) match case-insensitively.
 */
/**
 * Test a DSL-supplied regex against a DSL-supplied subject with bounded cost.
 *
 * Both the pattern and the subject are untrusted, which is the textbook ReDoS
 * setup: a pattern like `(a+)+$` against a long run of `a` backtracks
 * exponentially and freezes the render thread. An arbitrary pattern cannot be
 * made safe, so the mitigation bounds the subject — worst-case backtracking
 * grows with subject length, so a small cap keeps the worst case small.
 * Over-long subjects are truncated rather than rejected so ordinary matching
 * still behaves as authors expect.
 */
const REGEX_MAX_PATTERN_LENGTH = 1024;
const REGEX_MAX_SUBJECT_LENGTH = 8 * 1024;

export function safeRegexTest(pattern: string, subject: string): boolean {
  if (pattern.length > REGEX_MAX_PATTERN_LENGTH) return false;
  const bounded = subject.length > REGEX_MAX_SUBJECT_LENGTH
    ? subject.slice(0, REGEX_MAX_SUBJECT_LENGTH)
    : subject;
  try { return new RegExp(pattern).test(bounded); }
  catch { return false; }
}

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
  omit: (obj: unknown, keys: unknown): Record<string, unknown> => {
    if (!isObject(obj)) return {};
    const drop = new Set(toArray(keys).map((k) => String(k ?? "")));
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) if (!drop.has(k)) out[k] = obj[k];
    return out;
  },
  chunk: (arr: unknown, size: number): unknown[][] => {
    const xs = toArray(arr);
    const n = Math.max(1, Math.floor(toNumber(size)));
    const out: unknown[][] = [];
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
    return out;
  },
  flatten: (arr: unknown, depth: number = 1): unknown[] => {
    const walk = (xs: unknown[], left: number): unknown[] =>
      left <= 0
        ? xs.slice()
        : xs.reduce<unknown[]>((acc, v) => {
            if (Array.isArray(v)) acc.push(...walk(v, left - 1));
            else acc.push(v);
            return acc;
          }, []);
    return walk(toArray(arr), Math.max(0, Math.floor(toNumber(depth))));
  },
  zip: (...arrays: unknown[]): unknown[][] => {
    const lists = arrays.map(toArray);
    const len = lists.reduce((m, l) => Math.max(m, l.length), 0);
    const out: unknown[][] = [];
    for (let i = 0; i < len; i += 1) out.push(lists.map((l) => l[i] ?? null));
    return out;
  },
  partition: (arr: unknown, field = "", op = "==", value?: unknown): [unknown[], unknown[]] => {
    const pass: unknown[] = [];
    const fail: unknown[] = [];
    for (const item of toArray(arr)) {
      (compare(op, getField(item, String(field)), value) ? pass : fail).push(item);
    }
    return [pass, fail];
  },
  keyBy: (arr: unknown, field = ""): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const item of toArray(arr)) {
      out[String(getField(item, String(field)) ?? "")] = item;
    }
    return out;
  },
  cloneDeep: <T>(value: T): T => cloneDeepValue(value),
  merge: (target: unknown, ...sources: unknown[]): Record<string, unknown> => {
    const out: Record<string, unknown> = isObject(target) ? cloneDeepValue(target) : {};
    for (const src of sources) {
      if (!isObject(src)) continue;
      for (const k of Object.keys(src)) {
        const sv = src[k];
        const tv = out[k];
        out[k] = isObject(tv) && isObject(sv)
          ? Util.merge(tv, sv)
          : isObject(sv) || Array.isArray(sv)
            ? cloneDeepValue(sv)
            : sv;
      }
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
    try { return safeRegexTest(String(pattern ?? ""), String(text ?? "")); }
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

  // ── Formatting & misc convenience (suggestions-global XIII.6) ─────────
  slugify: (text: unknown): string => String(text ?? "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, ""),
  truncate: (text: unknown, length: unknown = 80, ellipsis = "…"): string => {
    const t = String(text ?? "");
    const n = toNumber(length);
    return t.length <= n ? t : t.slice(0, Math.max(0, n - 1)).trimEnd() + String(ellipsis);
  },
  initials: (name: unknown, max: unknown = 2): string => String(name ?? "")
    .split(/\s+/).filter(Boolean).slice(0, toNumber(max))
    .map((w) => w.charAt(0).toUpperCase()).join(""),
  currency: (value: unknown, code = "USD", locale?: string): string => {
    try { return new Intl.NumberFormat(locale, { style: "currency", currency: String(code) }).format(toNumber(value)); }
    catch { return `${code} ${toNumber(value).toFixed(2)}`; }
  },
  percent: (value: unknown, decimals: unknown = 0): string => {
    const v = toNumber(value);
    return `${(v * 100).toFixed(toNumber(decimals))}%`;
  },
  bytes: (value: unknown): string => {
    let n = toNumber(value);
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
  },
  relativeTime: (value: unknown): string => {
    const d = toDate(value);
    const diff = d.getTime() - Date.now();
    const abs = Math.abs(diff);
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 31536e6], ["month", 2592e6], ["week", 6048e5],
      ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3],
    ];
    try {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      for (const [unit, ms] of units) {
        if (abs >= ms || unit === "second") return rtf.format(Math.round(diff / ms), unit);
      }
    } catch { /* fall through */ }
    return d.toLocaleString();
  },
  /**
   * Copy text to the clipboard. Resolves `true` only once the async Clipboard
   * API write actually succeeds (permission can deny it), `false` otherwise.
   * `await $util.copy(x)` in an action; plain truthy checks keep working.
   */
  copy: (text: unknown): Promise<boolean> => {
    try {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { clipboard?: { writeText?: (t: string) => Promise<void> } }) : null;
      const write = nav?.clipboard?.writeText?.(String(text ?? ""));
      if (write && typeof write.then === "function") {
        return write.then(() => true, () => false);
      }
      return Promise.resolve(false);
    } catch { return Promise.resolve(false); }
  },
  /** Await a pause: `await $util.sleep(300)`. Capped at 60s. */
  sleep: (ms: unknown = 0): Promise<void> => {
    const parsed = toNumber(ms);
    const delay = Number.isFinite(parsed) ? Math.max(0, Math.min(60_000, parsed)) : 0;
    return new Promise((resolve) => setTimeout(resolve, delay));
  },
  uuid: (): string => {
    try {
      const c = (typeof crypto !== "undefined" ? crypto : null) as (Crypto & { randomUUID?: () => string }) | null;
      if (c?.randomUUID) return c.randomUUID();
    } catch { /* fall through */ }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
  /** Wrap a function so it only fires `wait` ms after the last call. */
  debounceFn: (fn: unknown, wait: unknown = 250): ((...args: unknown[]) => void) => {
    const parsed = toNumber(wait);
    const ms = Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: unknown[]) => {
      if (typeof fn !== "function") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { (fn as (...a: unknown[]) => unknown)(...args); }, ms);
    };
  },
  /**
   * Wrap a function so it fires at most once per `wait` ms. Leading edge
   * fires immediately; calls landing inside the window schedule one trailing
   * fire with the latest arguments, so the final value is never dropped.
   */
  throttleFn: (fn: unknown, wait: unknown = 250): ((...args: unknown[]) => void) => {
    const parsed = toNumber(wait);
    const ms = Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: unknown[] = [];
    return (...args: unknown[]) => {
      if (typeof fn !== "function") return;
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        (fn as (...a: unknown[]) => unknown)(...args);
        return;
      }
      lastArgs = args;
      if (trailing) return;
      trailing = setTimeout(() => {
        trailing = null;
        last = Date.now();
        (fn as (...a: unknown[]) => unknown)(...lastArgs);
      }, ms - (now - last));
    };
  },
  // ── Device / sensor APIs (suggestions-global XII.3) ──────────────────────
  /** Trigger device haptics. `pattern` is ms or an array of on/off ms. */
  vibrate: (pattern: unknown = 10): boolean => {
    try {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
      if (!nav?.vibrate) return false;
      const p = Array.isArray(pattern) ? (pattern as number[]).map((n) => Number(n) || 0) : (Number(pattern) || 0);
      return nav.vibrate(p);
    } catch { return false; }
  },
  /** Native share sheet. `data` = { title?, text?, url? }. Returns a promise. */
  share: (data: unknown): Promise<boolean> => {
    try {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: unknown) => Promise<void> }) : null;
      if (!nav?.share) return Promise.resolve(false);
      const d = (data && typeof data === "object") ? data as Record<string, unknown> : { text: String(data ?? "") };
      return nav.share(d).then(() => true).catch(() => false);
    } catch { return Promise.resolve(false); }
  },
  /** Read text from the clipboard (async). Returns "" when unavailable/denied. */
  readClipboard: (): Promise<string> => {
    try {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { clipboard?: { readText?: () => Promise<string> } }) : null;
      if (!nav?.clipboard?.readText) return Promise.resolve("");
      return nav.clipboard.readText().catch(() => "");
    } catch { return Promise.resolve(""); }
  },
  /**
   * Read a file the user picked, and resolve with its contents.
   *
   * `FileUpload` is the only way a program receives a file, and its own note
   * says why the file cannot travel through a `$variable`: a `File` is not
   * serialisable, so it reaches the program as a callback argument and nowhere
   * else. Until now there was no vetted way to then READ it — the only route was
   * reaching for `FileReader` or `document` as a host global, which the `"safe"`
   * global-access policy exists to forbid (`SAFE_HOST_GLOBALS` grants the inert
   * `Blob`/`File` containers but no reader). So a program that wanted the
   * contents of a picked `.pub`, `.csv` or `.json` had to be run under the
   * unrestricted `"all"` policy. This is that read, as a capability the runtime
   * grants rather than one the program smuggles in.
   *
   *   FileUpload("key-file", {accept: ".pub,text/plain", action: onPick})
   *   function onPick(files) {
   *     $util.readFile(files).then(text => { $keyBody = text.trim() })
   *   }
   *
   * `file` may be a single `File`/`Blob`, or the whole pick as `FileUpload`
   * hands it over (a `FileList` or an array) — in which case the FIRST readable
   * entry is used. Loop the pick yourself for `multiple`.
   *
   * `options.as` selects the representation:
   *   `"text"`     (default) the decoded UTF-8 text
   *   `"dataUrl"`  a `data:<mime>;base64,…` URI, for an inline preview
   *   `"base64"`   that URI's payload alone, for a JSON body
   *
   * `options.maxSize` rejects a larger file without reading it, in bytes.
   * `FileUpload`'s own `maxSize` already screens the pick, so this is for the
   * programmatic caller that did not come through the component.
   *
   * NEVER REJECTS. It resolves `""` for every failure — no file, an unreadable
   * one, an over-size one, a host with no reader at all — because `await` in
   * Aktion does not suspend, so an author writes `.then(...)` and a rejection
   * would surface as an unhandled promise instead of at the call site. An empty
   * string is also the honest answer: the program has no contents to work with.
   * Branch on the result being empty, not on a `.catch`.
   */
  readFile: (file: unknown, options?: unknown): Promise<string> => {
    try {
      const blob = firstBlob(file);
      if (!blob) return Promise.resolve("");
      const opts = isObject(options) ? options : {};
      const limit = Math.max(0, toNumber(opts.maxSize));
      if (limit > 0 && typeof blob.size === "number" && blob.size > limit) return Promise.resolve("");
      const as = typeof opts.as === "string" ? opts.as : "text";
      if (as === "dataUrl" || as === "base64") {
        return blobToDataUrl(blob).then(
          (url) => (as === "base64" ? url.slice(url.indexOf(",") + 1) : url),
          () => "",
        );
      }
      return blobToText(blob).then((text) => text, () => "");
    } catch { return Promise.resolve(""); }
  },
  /** Current geolocation as a promise of { lat, lng, accuracy } (or null). */
  geolocate: (options?: unknown): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    return new Promise((resolve) => {
      try {
        const nav = typeof navigator !== "undefined" ? (navigator as Navigator) : null;
        if (!nav?.geolocation) { resolve(null); return; }
        nav.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => resolve(null),
          (options && typeof options === "object") ? options as PositionOptions : undefined,
        );
      } catch { resolve(null); }
    });
  },
  /** `true` when the device is currently online. */
  isOnline: (): boolean => {
    try { return typeof navigator !== "undefined" ? navigator.onLine !== false : true; }
    catch { return true; }
  },
  /** Best-effort device class from the user agent: "mobile" | "tablet" | "desktop". */
  deviceType: (): string => {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "tablet";
      if (/Mobi|Android|iPhone|iPod|Windows Phone/.test(ua)) return "mobile";
      return "desktop";
    } catch { return "desktop"; }
  },
  // ── Web Worker offload (suggestions-global XI.5) ─────────────────────────
  /**
   * Run a PURE function off the main thread in a Web Worker, resolving with its
   * result. `fn` is serialised via `toString()`, so it must not close over
   * outer variables (pass everything it needs as arguments). Falls back to
   * running inline (still async) when Workers aren't available.
   *   $util.worker((n) => heavyCompute(n), 1000).then(r => $result = r)
   */
  worker: (fn: unknown, ...args: unknown[]): Promise<unknown> => {
    if (typeof fn !== "function") return Promise.resolve(undefined);
    const fallback = (): Promise<unknown> =>
      Promise.resolve().then(() => (fn as (...a: unknown[]) => unknown)(...args));
    const canWorker =
      typeof Worker !== "undefined" && typeof Blob !== "undefined" &&
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
    if (!canWorker) return fallback();
    try {
      const src =
        `self.onmessage=function(e){` +
        `var fn=(${(fn as () => unknown).toString()});` +
        `Promise.resolve().then(function(){return fn.apply(null,e.data);})` +
        `.then(function(r){self.postMessage({ok:true,value:r});})` +
        `.catch(function(err){self.postMessage({ok:false,error:String(err)});});};`;
      const url = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
      const w = new Worker(url);
      return new Promise((resolve, reject) => {
        w.onmessage = (e: MessageEvent) => {
          URL.revokeObjectURL(url); w.terminate();
          const data = e.data as { ok?: boolean; value?: unknown; error?: string };
          if (data?.ok) resolve(data.value);
          else reject(new Error(data?.error || "worker error"));
        };
        w.onerror = (err) => { URL.revokeObjectURL(url); w.terminate(); reject(err); };
        w.postMessage(args);
      });
    } catch {
      return fallback();
    }
  },
  // ── PWA helpers (suggestions-global XII.2) ───────────────────────────────
  /** Register a service worker. Resolves true on success, false otherwise. */
  registerServiceWorker: (url: unknown, scope?: unknown): Promise<boolean> => {
    try {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator) : null;
      if (!nav?.serviceWorker || typeof url !== "string" || !url) return Promise.resolve(false);
      const opts = typeof scope === "string" && scope ? { scope } : undefined;
      return nav.serviceWorker.register(url, opts).then(() => true).catch(() => false);
    } catch { return Promise.resolve(false); }
  },
  /**
   * Build a sanitised Web App Manifest object from a config (XII.2). Use it to
   * inline a manifest (`<link rel="manifest" href="data:...">`) or write one at
   * build time. Unknown/unsafe keys are dropped.
   */
  webManifest: (config: unknown): Record<string, unknown> => {
    const cfg = (config && typeof config === "object" && !Array.isArray(config)) ? config as Record<string, unknown> : {};
    const out: Record<string, unknown> = {
      name: typeof cfg.name === "string" ? cfg.name : "App",
      short_name: typeof cfg.shortName === "string" ? cfg.shortName : (typeof cfg.name === "string" ? cfg.name : "App"),
      start_url: typeof cfg.startUrl === "string" ? cfg.startUrl : "/",
      display: typeof cfg.display === "string" ? cfg.display : "standalone",
      background_color: typeof cfg.backgroundColor === "string" ? cfg.backgroundColor : "#ffffff",
      theme_color: typeof cfg.themeColor === "string" ? cfg.themeColor : "#000000",
    };
    if (typeof cfg.description === "string") out.description = cfg.description;
    if (Array.isArray(cfg.icons)) {
      out.icons = cfg.icons
        .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
        .map((i) => ({ src: String(i.src ?? ""), sizes: String(i.sizes ?? "512x512"), type: String(i.type ?? "image/png") }));
    }
    return out;
  },
  // ── Native shell detection (suggestions-global XII.4) ────────────────────
  /**
   * Detect the native shell the app is running inside (Capacitor / Cordova /
   * Tauri / Electron / React Native WebView), or "web" when it's a plain
   * browser. Lets a program branch on the host (e.g. hide a download button in
   * a native shell, or call a bridge when present).
   */
  nativeShell: (): string => {
    try {
      const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
      const nav = typeof navigator !== "undefined" ? navigator : ({ userAgent: "" } as Navigator);
      if (w.__TAURI__ || w.__TAURI_IPC__) return "tauri";
      if (w.Capacitor) return "capacitor";
      if (w.cordova || w.PhoneGap) return "cordova";
      if (w.ReactNativeWebView) return "react-native";
      if (/Electron\//.test(nav.userAgent)) return "electron";
      return "web";
    } catch { return "web"; }
  },
  /** True when running inside any native shell (not a plain browser). */
  isNativeApp: (): boolean => Util.nativeShell() !== "web",
} as const;

// Soft cap on `Util.range` / `Util.repeat` allocations so a stray
// `Util.range(0, 1e9)` cannot wedge the renderer before evaluation
// budgets kick in elsewhere.
const MAX_RANGE = 100_000;

export type UtilNamespace = typeof Util;
