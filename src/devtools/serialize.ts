/**
 * Aktion DevTools — value serialisation.
 *
 * The protocol is JSON-shaped on purpose (see `protocol.ts`), so every value
 * the runtime hands a frontend passes through here first. Three jobs:
 *
 *   1. **Never leak a live reference.** A DOM node, a class instance, or a
 *      live `Http({...})` resource put on the wire would either break
 *      `structuredClone` (an extension frontend) or keep a torn-down subtree
 *      reachable from the panel's event buffer for the rest of the session.
 *   2. **Never hang on a hostile value.** Cycles, 100k-row arrays, and getters
 *      that throw are all normal in a real app; a debugger that dies on them
 *      is useless exactly when you need it.
 *   3. **Say whether an edit is safe.** `json` is present only when the value
 *      genuinely round-trips, which is what lets the inspector decide between
 *      an editable field and a read-only preview.
 *
 * Both halves import this module: the runtime to produce values, the panel to
 * parse an edit back. It has no dependencies beyond `protocol.ts` types.
 */

import type { DevtoolsValue } from "./protocol.js";

/** Longest preview string we ever produce (before the ellipsis). */
const PREVIEW_LIMIT = 120;
/** Longest `json` payload we attach; larger values become read-only. */
const JSON_LIMIT = 20_000;
/** Deepest nesting `toJsonText` will walk before bailing out. */
const DEPTH_LIMIT = 6;
/** Most array entries / object keys we serialise at one level. */
const BREADTH_LIMIT = 200;

/**
 * Classify a value into the type names the protocol uses. Aktion's own live
 * bags get their own names so the inspector can label them instead of
 * printing `{ state, data, error, … }`.
 */
export function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t !== "object") return t;
  const rec = value as Record<string, unknown>;
  if (rec.__kind === "Store") return "store";
  if (typeof rec.refetch === "function" && "state" in rec && "loading" in rec) return "resource";
  if (typeof rec.send === "function" && "connected" in rec) return "socket";
  if (typeof Node !== "undefined" && value instanceof Node) return "node";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof RegExp) return "regexp";
  if (value instanceof Error) return "error";
  return "object";
}

/** Cut `text` to `limit` characters, appending an ellipsis when it was longer. */
export function truncate(text: string, limit = PREVIEW_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

/**
 * One-line display form of a value — the string the inspector shows in a
 * collapsed row. Never throws: a getter that explodes degrades to `<error>`.
 */
export function previewOf(value: unknown): string {
  const kind = valueKind(value);
  try {
    switch (kind) {
      case "string": return truncate(JSON.stringify(value) ?? '""');
      case "number":
      case "boolean":
        return String(value);
      case "null": return "null";
      case "undefined": return "undefined";
      case "function": {
        const name = (value as { name?: string }).name;
        return name ? `ƒ ${name}()` : "ƒ ()";
      }
      case "symbol": return String(value);
      case "bigint": return `${String(value)}n`;
      case "date": return (value as Date).toISOString();
      case "regexp": return String(value);
      case "error": return `${(value as Error).name}: ${(value as Error).message}`;
      case "node": {
        const el = value as Element;
        return `<${(el.tagName ?? "node").toLowerCase()}>`;
      }
      case "map": return `Map(${(value as Map<unknown, unknown>).size})`;
      case "set": return `Set(${(value as Set<unknown>).size})`;
      case "array": {
        const arr = value as unknown[];
        if (arr.length === 0) return "[]";
        const head = arr.slice(0, 3).map((v) => shortPreview(v)).join(", ");
        return truncate(`[${head}${arr.length > 3 ? `, …${arr.length - 3} more` : ""}]`);
      }
      case "store": {
        const methods = Object.keys((value as { __methods?: object }).__methods ?? {});
        return `Store { ${methods.slice(0, 3).join(", ")}${methods.length > 3 ? ", …" : ""} }`;
      }
      case "resource": {
        const res = value as { state?: unknown; status?: unknown };
        return `Resource(${String(res.state ?? "?")}${res.status != null ? ` ${String(res.status)}` : ""})`;
      }
      case "socket": {
        const sock = value as { status?: unknown };
        return `Socket(${String(sock.status ?? "?")})`;
      }
      default: {
        const keys = safeKeys(value as object);
        if (keys.length === 0) return "{}";
        const head = keys.slice(0, 4).join(", ");
        return truncate(`{ ${head}${keys.length > 4 ? ", …" : ""} }`);
      }
    }
  } catch {
    return "<unreadable>";
  }
}

/** Even shorter form, used inside array/object previews. */
function shortPreview(value: unknown): string {
  const kind = valueKind(value);
  switch (kind) {
    case "string": return truncate(JSON.stringify(value) ?? '""', 24);
    case "array": return `Array(${(value as unknown[]).length})`;
    case "object": return "{…}";
    case "function": return "ƒ";
    default: return truncate(String(value), 24);
  }
}

/** `Object.keys` that survives a throwing proxy / exotic object. */
function safeKeys(value: object): string[] {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

/**
 * Deep-clone a value into something `JSON.stringify` can handle: cycles
 * become `"[Circular]"`, functions `"[Function]"`, DOM nodes `"[Node <div>]"`,
 * and over-long collections are cut with a marker so the reader knows the
 * view is partial rather than the data being wrong.
 */
function toPlain(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  const kind = valueKind(value);
  switch (kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return value;
    case "undefined": return "[undefined]";
    case "function": {
      const name = (value as { name?: string }).name;
      return name ? `[Function ${name}]` : "[Function]";
    }
    case "symbol": return String(value);
    case "bigint": return `${String(value)}n`;
    case "date": return (value as Date).toISOString();
    case "regexp": return String(value);
    case "error": return `[${(value as Error).name}: ${(value as Error).message}]`;
    case "node": return `[Node <${((value as Element).tagName ?? "node").toLowerCase()}>]`;
    case "store": return `[Store]`;
    case "resource": return `[Resource]`;
    case "socket": return `[Socket]`;
    case "map": {
      const out: Record<string, unknown> = {};
      let i = 0;
      for (const [k, v] of value as Map<unknown, unknown>) {
        if (i++ >= BREADTH_LIMIT) { out["…"] = `${(value as Map<unknown, unknown>).size - BREADTH_LIMIT} more`; break; }
        out[String(k)] = depth >= DEPTH_LIMIT ? previewOf(v) : toPlain(v, depth + 1, seen);
      }
      return out;
    }
    case "set": {
      const arr: unknown[] = [];
      let i = 0;
      for (const v of value as Set<unknown>) {
        if (i++ >= BREADTH_LIMIT) { arr.push(`…${(value as Set<unknown>).size - BREADTH_LIMIT} more`); break; }
        arr.push(depth >= DEPTH_LIMIT ? previewOf(v) : toPlain(v, depth + 1, seen));
      }
      return arr;
    }
    case "array": {
      const arr = value as unknown[];
      if (seen.has(arr)) return "[Circular]";
      if (depth >= DEPTH_LIMIT) return `[Array(${arr.length})]`;
      seen.add(arr);
      try {
        const out = arr.slice(0, BREADTH_LIMIT).map((v) => toPlain(v, depth + 1, seen));
        if (arr.length > BREADTH_LIMIT) out.push(`…${arr.length - BREADTH_LIMIT} more`);
        return out;
      } finally {
        seen.delete(arr);
      }
    }
    default: {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) return "[Circular]";
      if (depth >= DEPTH_LIMIT) return previewOf(obj);
      seen.add(obj);
      try {
        const out: Record<string, unknown> = {};
        const keys = safeKeys(obj);
        for (const key of keys.slice(0, BREADTH_LIMIT)) {
          let entry: unknown;
          try { entry = obj[key]; } catch { entry = "[getter threw]"; }
          out[key] = toPlain(entry, depth + 1, seen);
        }
        if (keys.length > BREADTH_LIMIT) out["…"] = `${keys.length - BREADTH_LIMIT} more`;
        return out;
      } finally {
        seen.delete(obj);
      }
    }
  }
}

/**
 * Pretty JSON text for a value, or `null` when it is not worth (or safe to)
 * serialise. `null` is the signal an inspector uses to render a value
 * read-only.
 */
export function toJsonText(value: unknown, indent = 2): string | null {
  const kind = valueKind(value);
  if (kind === "function" || kind === "node" || kind === "resource" || kind === "socket" || kind === "symbol") {
    return null;
  }
  try {
    const plain = toPlain(value, 0, new WeakSet());
    const text = JSON.stringify(plain, null, indent);
    if (text === undefined) return null;
    if (text.length > JSON_LIMIT) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Package a value for the wire. `json` is attached only for values an editor
 * could legitimately write back, so the inspector never offers an edit field
 * whose result it cannot apply.
 */
export function toDevtoolsValue(value: unknown): DevtoolsValue {
  const type = valueKind(value);
  const out: DevtoolsValue = { type, preview: previewOf(value) };
  const json = toJsonText(value, 0);
  if (json !== null) out.json = json;
  if (type === "array") out.size = (value as unknown[]).length;
  else if (type === "object") out.size = safeKeys(value as object).length;
  else if (type === "string") out.size = (value as string).length;
  return out;
}

/**
 * Parse text typed into an inspector field. JSON first (`42`, `true`,
 * `"x"`, `null`, `[1,2]`, `{"a":1}`) so structured edits work, then a bare
 * string — because `Ada` is what a user types into a name field, and
 * rejecting it as invalid JSON would be pedantic.
 */
export function parseEditedValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "undefined") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

/** Byte-ish length of a body for the network inspector's size column. */
export function bodySize(body: unknown): number {
  if (body == null) return 0;
  if (typeof body === "string") return body.length;
  try {
    return JSON.stringify(body)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Body preview for the network inspector — JSON pretty-printed, capped. */
export function bodyPreview(body: unknown, limit = 4000): string {
  if (body == null) return "";
  if (typeof body === "string") return truncate(body, limit);
  const json = toJsonText(body);
  return json === null ? previewOf(body) : truncate(json, limit);
}
