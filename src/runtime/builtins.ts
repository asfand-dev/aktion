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
  Filter: (args) => {
    const arr = toArray(args[0]);
    const field = String(args[1] ?? "");
    const op = String(args[2] ?? "==");
    const value = args[3];
    return arr.filter((item) => compare(op, getField(item, field), value));
  },
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
  /**
   * Append a value to an array, returning a new array. Designed to be paired
   * with `@Set` so the LLM can grow a list declaratively, no JS required:
   *   addBtn = Button("Add", Action([@Set($todos, @Push($todos, newTodo))]))
   */
  Push: (args) => [...toArray(args[0]), args[1]],
  /**
   * Concatenate two arrays. Useful for prepending items as well:
   *   @Set($todos, @Concat([newTodo], $todos))
   */
  Concat: (args) => [...toArray(args[0]), ...toArray(args[1])],
  Round: (args) => {
    const n = toNumber(args[0]);
    const decimals = args[1] === undefined ? 0 : toNumber(args[1]);
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  },
  Abs: (args) => Math.abs(toNumber(args[0])),
  Floor: (args) => Math.floor(toNumber(args[0])),
  Ceil: (args) => Math.ceil(toNumber(args[0])),
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
   * browser back/forward buttons keep working. No-op when the host element
   * has `enable-routes` off.
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
