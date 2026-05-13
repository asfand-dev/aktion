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
  category: "data" | "action" | "iteration" | "javascript";
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
  Sort: {
    description: "Sort an array by a field, ascending or descending.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "field", type: "string", required: true },
      { name: "direction", type: "'asc'|'desc'", required: false },
    ],
  },
  Push: {
    description: "Append a value to an array; returns a new array.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "value", type: "any", required: true },
    ],
  },
  Concat: {
    description: "Concatenate two arrays into a new array.",
    params: [
      { name: "a", type: "any[]", required: true },
      { name: "b", type: "any[]", required: true },
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
};

const ACTION_ENTRIES: Array<Omit<BuiltinEntry, "signature">> = [
  {
    name: "Run",
    category: "action",
    description: "Run a registered Query or Mutation by name.",
    params: [{ name: "ref", type: "identifier", required: true }],
  },
  {
    name: "Set",
    category: "action",
    description: "Set a $variable to a value.",
    params: [
      { name: "$state", type: "$variable", required: true },
      { name: "value", type: "any", required: true },
    ],
  },
  {
    name: "Reset",
    category: "action",
    description: "Reset one or more $variables to their initial values.",
    params: [{ name: "...$states", type: "$variable[]", required: true }],
  },
  {
    name: "ToAssistant",
    category: "action",
    description: "Send a message back to the assistant (fires `assistant-message`).",
    params: [{ name: "message", type: "string", required: true }],
  },
  {
    name: "OpenUrl",
    category: "action",
    description: "Open a URL in a new browser tab.",
    params: [{ name: "url", type: "string", required: true }],
  },
  {
    name: "Navigate",
    category: "action",
    description: "Navigate to a hash-based route.",
    params: [{ name: "path", type: "string", required: true }],
  },
];

const ITERATION_ENTRIES: Array<Omit<BuiltinEntry, "signature">> = [
  {
    name: "Each",
    category: "iteration",
    description: "Iterate over an array. The loop variable is scoped to the template.",
    params: [
      { name: "array", type: "any[]", required: true },
      { name: "varName", type: "string", required: true },
      { name: "template", type: "Node", required: true },
    ],
  },
];

const JS_ENTRIES: Array<Omit<BuiltinEntry, "signature">> = [
  {
    name: "Js",
    category: "javascript",
    description: "One-shot click handler. The optional args object is exposed inside the body as `ctx.args`.",
    params: [
      { name: "body", type: "string", required: true },
      { name: "args", type: "object", required: false },
    ],
  },
];

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
 * builtins first (sourced from the runtime registry), then action steps,
 * iteration, and JavaScript helpers.
 */
export function getBuiltinCatalog(): BuiltinEntry[] {
  const dataEntries: BuiltinEntry[] = Object.keys(dataBuiltins).map((name) => {
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
  return [
    ...dataEntries,
    ...ACTION_ENTRIES.map(finalize),
    ...ITERATION_ENTRIES.map(finalize),
    ...JS_ENTRIES.map(finalize),
  ];
}

export function indexBuiltins(entries: BuiltinEntry[]): Record<string, BuiltinEntry> {
  const out: Record<string, BuiltinEntry> = {};
  for (const entry of entries) out[entry.name] = entry;
  return out;
}
