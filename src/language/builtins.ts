/**
 * Built-in `@Name(...)` catalog.
 *
 * Sourced (by name) from `src/runtime/builtins.ts` plus the action steps
 * handled directly in the evaluator. Each entry carries a short description
 * and parameter signature so editors can show argument hints.
 *
 * Adding a new builtin to the runtime? Add an entry here too — the test
 * suite guards the union (see `tests/language.test.ts`).
 */

import { dataBuiltins } from "../runtime/builtins.js";

export interface BuiltinParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface BuiltinEntry {
  name: string;
  category: "data";
  description: string;
  params: BuiltinParam[];
  signature: string;
}

const DATA_DESCRIPTIONS: Record<string, Omit<BuiltinEntry, "name" | "category" | "signature">> = {
  Count: {
    description: "Number of items in an array.",
    params: [{ name: "array", type: "any[]", required: true }],
  },
  Sum: {
    description: "Sum of numeric values in an array.",
    params: [{ name: "array", type: "number[]", required: true }],
  },
  Avg: {
    description: "Average of numeric values in an array.",
    params: [{ name: "array", type: "number[]", required: true }],
  },
  Min: {
    description: "Minimum of numeric values in an array.",
    params: [{ name: "array", type: "number[]", required: true }],
  },
  Max: {
    description: "Maximum of numeric values in an array.",
    params: [{ name: "array", type: "number[]", required: true }],
  },
  First: {
    description: "First element of an array, or null.",
    params: [{ name: "array", type: "any[]", required: true }],
  },
  Last: {
    description: "Last element of an array, or null.",
    params: [{ name: "array", type: "any[]", required: true }],
  },
  Filter: {
    description: "Filter an array by a field/operator/value comparison.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: true },
      { name: "op", type: "'=='|'!='|'>'|'<'|'>='|'<='|'contains'", required: true },
      { name: "value", type: "any", required: true },
    ],
  },
  FilterBy: {
    description: "Alias for `@Filter` — filter an array by a field/operator/value comparison.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: true },
      { name: "op", type: "'=='|'!='|'>'|'<'|'>='|'<='|'contains'", required: true },
      { name: "value", type: "any", required: true },
    ],
  },
  Sort: {
    description: "Sort an array by a field, ascending or descending.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: true },
      { name: "direction", type: "'asc'|'desc'", required: false },
    ],
  },
  Round: {
    description: "Round a number to N decimals (default 0).",
    params: [
      { name: "value", type: "number", required: true },
      { name: "decimals", type: "number", required: false },
    ],
  },
  Abs: {
    description: "Absolute value of a number.",
    params: [{ name: "value", type: "number", required: true }],
  },
  Floor: {
    description: "Round a number down to the nearest integer.",
    params: [{ name: "value", type: "number", required: true }],
  },
  Ceil: {
    description: "Round a number up to the nearest integer.",
    params: [{ name: "value", type: "number", required: true }],
  },
  Find: {
    description: "Find the first item matching a field/op/value comparator.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: true },
      { name: "op", type: "'=='|'!='|'>'|'<'|'>='|'<='|'contains'", required: true },
      { name: "value", type: "any", required: true },
    ],
  },
  GroupBy: {
    description: "Group items into `{groupKey: [items…]}` by a field value.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: true },
    ],
  },
  Slice: {
    description: "Slice an array by `[start, end)` — both indices optional.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "start", type: "number", required: false },
      { name: "end", type: "number", required: false },
    ],
  },
  Unique: {
    description: "Deduplicate. With a `field`, dedupes by that field (first wins).",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: false },
    ],
  },
  Reverse: {
    description: "Return a reversed copy of the array (non-mutating).",
    params: [{ name: "array", type: "any[]", required: true }],
  },
  Range: {
    description: "Inclusive integer range. Third arg is the step (default 1 / -1).",
    params: [
      { name: "start", type: "number", required: true },
      { name: "end", type: "number", required: true },
      { name: "step", type: "number", required: false },
    ],
  },
  Repeat: {
    description: "Repeat a value N times. Useful for skeleton/placeholder grids.",
    params: [
      { name: "value", type: "any", required: true },
      { name: "count", type: "number", required: true },
    ],
  },
  Pick: {
    description: "Keep only the listed keys from an object — `@Pick(obj, [\"a\",\"b\"])`.",
    params: [
      { name: "object", type: "object", required: true },
      { name: "keys", type: "string[]", required: true },
    ],
  },
  Format: {
    description: "Locale-aware number formatter. Modes: 'number' (default), 'currency', 'percent', 'compact'. Options: { currency?, locale?, decimals? }.",
    params: [
      { name: "value", type: "number", required: true },
      { name: "mode", type: "'number'|'currency'|'percent'|'compact'", required: false },
      { name: "options", type: "{currency?: string, locale?: string, decimals?: number}", required: false },
    ],
  },
  FormatDate: {
    description: "Format a date. Pattern tokens (MMM D, YYYY-MM-DD) or named: 'relative', 'date', 'time', 'datetime', 'iso'.",
    params: [
      { name: "value", type: "Date|number|string", required: true },
      { name: "format", type: "string", required: false },
    ],
  },
  Now: {
    description: "Current moment as epoch ms — pair with `@FormatDate`.",
    params: [],
  },
  Today: {
    description: "Today's date at midnight, as an ISO string.",
    params: [],
  },
  AddDays: {
    description: "Shift a date by N days (negative N moves backward).",
    params: [
      { name: "date", type: "Date|number|string", required: true },
      { name: "days", type: "number", required: true },
    ],
  },
  AddHours: {
    description: "Shift a date by N hours (negative N moves backward).",
    params: [
      { name: "date", type: "Date|number|string", required: true },
      { name: "hours", type: "number", required: true },
    ],
  },
  DiffDays: {
    description: "Whole-day difference from start to end (end − start).",
    params: [
      { name: "start", type: "Date|number|string", required: true },
      { name: "end", type: "Date|number|string", required: true },
    ],
  },
  StartOfWeek: {
    description: "Local Sunday 00:00:00 for the week containing the date.",
    params: [{ name: "date", type: "Date|number|string", required: true }],
  },
  EndOfMonth: {
    description: "Last moment of the calendar month containing the date.",
    params: [{ name: "date", type: "Date|number|string", required: true }],
  },
  Plural: {
    description: "Pluralisation: `@Plural(n, \"order\", \"orders\")` → \"1 order\" / \"2 orders\".",
    params: [
      { name: "count", type: "number", required: true },
      { name: "singular", type: "string", required: true },
      { name: "plural", type: "string", required: false },
    ],
  },
  Capitalize: {
    description: "Uppercase the first character.",
    params: [{ name: "value", type: "string", required: true }],
  },
  Lowercase: {
    description: "Lowercase every character.",
    params: [{ name: "value", type: "string", required: true }],
  },
  Uppercase: {
    description: "Uppercase every character.",
    params: [{ name: "value", type: "string", required: true }],
  },
  Titlecase: {
    description: "Capitalise the first letter of each word.",
    params: [{ name: "value", type: "string", required: true }],
  },
  Case: {
    description: "Convert casing — mode: \"camel\", \"snake\", \"kebab\", or \"pascal\".",
    params: [
      { name: "value", type: "string", required: true },
      { name: "mode", type: "'camel'|'snake'|'kebab'|'pascal'", required: true },
    ],
  },
  Join: {
    description: "Join array values into a string (default separator \",\").",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "separator", type: "string", required: false },
    ],
  },
  Split: {
    description: "Split a string by a separator (default \",\").",
    params: [
      { name: "value", type: "string", required: true },
      { name: "separator", type: "string", required: false },
    ],
  },
  Trim: {
    description: "Trim leading and trailing whitespace.",
    params: [{ name: "value", type: "string", required: true }],
  },
  Replace: {
    description: "Replace all occurrences of search with replacement.",
    params: [
      { name: "value", type: "string", required: true },
      { name: "search", type: "string", required: true },
      { name: "replacement", type: "string", required: false },
    ],
  },
  Substring: {
    description: "Extract a substring — `start`, optional `end`.",
    params: [
      { name: "value", type: "string", required: true },
      { name: "start", type: "number", required: true },
      { name: "end", type: "number", required: false },
    ],
  },
  StartsWith: {
    description: "True when the string starts with the given prefix.",
    params: [
      { name: "value", type: "string", required: true },
      { name: "prefix", type: "string", required: true },
    ],
  },
  EndsWith: {
    description: "True when the string ends with the given suffix.",
    params: [
      { name: "value", type: "string", required: true },
      { name: "suffix", type: "string", required: true },
    ],
  },
  Contains: {
    description: "True when the string contains the given substring.",
    params: [
      { name: "value", type: "string", required: true },
      { name: "needle", type: "string", required: true },
    ],
  },
  Match: {
    description: "Test a string against a RegExp pattern (invalid patterns return false).",
    params: [
      { name: "value", type: "string", required: true },
      { name: "pattern", type: "string", required: true },
    ],
  },
  Clamp: {
    description: "Clamp a number into `[min, max]`.",
    params: [
      { name: "value", type: "number", required: true },
      { name: "min", type: "number", required: true },
      { name: "max", type: "number", required: true },
    ],
  },
  Pow: {
    description: "Raise a number to a power — `Math.pow(base, exp)`.",
    params: [
      { name: "base", type: "number", required: true },
      { name: "exp", type: "number", required: true },
    ],
  },
  Sqrt: {
    description: "Square root of a number.",
    params: [{ name: "value", type: "number", required: true }],
  },
  Random: {
    description: "Pseudo-random number in [0, 1) — `Math.random()`.",
    params: [],
  },
  Log: {
    description: "Natural logarithm — `Math.log(value)`.",
    params: [{ name: "value", type: "number", required: true }],
  },
};

const buildSignature = (entry: Omit<BuiltinEntry, "signature">): string => {
  const parts = entry.params.map((p) => (p.required ? p.name : `${p.name}?`));
  return `@${entry.name}(${parts.join(", ")})`;
};

const finalize = (entry: Omit<BuiltinEntry, "signature">): BuiltinEntry => ({
  ...entry,
  signature: buildSignature(entry),
});

/**
 * Return the catalog of all `@-builtins`. The list is deterministic — data
 * builtins sourced from the runtime registry. Aktion 0.5 removed the legacy
 * action-step builtins (`@Set`, `@Run`, `@Reset`, `@ToAssistant`,
 * `@OpenUrl`, `@Navigate`, `@Js`), the `@Const` memo helper, and the
 * iteration/conditional builtins (Each/If/Switch — removed in 0.5). Use `function`
 * declarations and native `for`/`if`/`switch` instead.
 */
export function getBuiltinCatalog(): BuiltinEntry[] {
  return Object.keys(dataBuiltins).map((name) => {
    const meta = DATA_DESCRIPTIONS[name];
    if (!meta) {
      return finalize({
        name,
        category: "data",
        description: `Data helper: @${name}`,
        params: [{ name: "value", type: "any", required: true }],
      });
    }
    return finalize({ name, category: "data", ...meta });
  });
}

export function indexBuiltins(entries: BuiltinEntry[]): Record<string, BuiltinEntry> {
  const out: Record<string, BuiltinEntry> = {};
  for (const entry of entries) out[entry.name] = entry;
  return out;
}
