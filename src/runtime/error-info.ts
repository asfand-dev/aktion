/**
 * Where a runtime error came from, in terms of the `.aktion` source.
 *
 * The JavaScript stack of an error thrown by a program points into the runtime
 * bundle, never at the program, because the program is interpreted from an AST.
 * The AST nodes do carry `loc`, so the runtime records the position at the
 * innermost throw site and one frame per user function the error unwinds
 * through, and hands them to the host.
 *
 * The record lives in a `WeakMap` keyed by the error object rather than on the
 * error itself, so serialisers and error reporters never see an extra property.
 * A thrown primitive cannot be a key; its position travels in the hook payload.
 */
import type { SourceLocation } from "../parser/types.js";
import type { EvaluationContext } from "./evaluator.js";

export interface AktionErrorLocation {
  /** Module path as linked, project-relative when built by the Vite plugin. */
  file: string;
  line: number;
  column: number;
  /** Name of the user function this frame belongs to, when it has one. */
  function?: string;
}

export interface AktionErrorInfo {
  /** The innermost position: where the program threw, or the call that failed. */
  location?: AktionErrorLocation;
  /** One entry per user function the error unwound through, innermost first. */
  frames: AktionErrorLocation[];
}

export type AktionErrorKind =
  | "action"
  | "render"
  | "effect"
  | "http-callback"
  | "top-level"
  | "boot"
  | "budget";

/** What the runtime hands to `element.errorHook` (the host adds `sourceText`). */
export interface AktionErrorReport extends AktionErrorInfo {
  error: unknown;
  /** Function, component or effect name when known, else a short label. */
  source: string;
  kind: AktionErrorKind;
}

export interface AktionErrorMeta {
  loc?: SourceLocation;
  source: string;
  kind: AktionErrorKind;
  /** Console line to log, when the site has always logged a specific one. */
  message?: string;
}

/**
 * The original error behind a `[render error in X]` placeholder, by the
 * placeholder node, so an `ErrorBoundary` can hand it on instead of text.
 */
const renderErrors = new WeakMap<Node, unknown>();
export const rememberRenderError = (placeholder: Node, err: unknown): void => { renderErrors.set(placeholder, err); };
export const recallRenderError = (placeholder: Node): { error: unknown } | undefined =>
  renderErrors.has(placeholder) ? { error: renderErrors.get(placeholder) } : undefined;

/** Report a failure from a place that has no evaluation context of its own. */
export type RuntimeErrorSink = (err: unknown, meta: AktionErrorMeta) => void;

type SourceCtx = Pick<EvaluationContext, "sources" | "coverageSourcePath">;

const infos = new WeakMap<object, AktionErrorInfo>();
const programNotified = new WeakSet<object>();
const hostNotified = new WeakSet<object>();

/**
 * Position of the last thrown primitive, so the report for `throw "x"` can
 * still say where it was thrown. Consumed by the first report that matches.
 */
let lastPrimitive: { value: unknown; info: AktionErrorInfo; program: boolean; host: boolean } | null = null;

const isObject = (value: unknown): value is object =>
  (typeof value === "object" && value !== null) || typeof value === "function";

export function getAktionErrorInfo(err: unknown): AktionErrorInfo | undefined {
  return isObject(err) ? infos.get(err) : undefined;
}

function locate(loc: SourceLocation, ctx: SourceCtx, fn?: string): AktionErrorLocation {
  const place: AktionErrorLocation = {
    file: ctx.sources?.[loc.source ?? 0] ?? ctx.coverageSourcePath ?? "<inline>",
    line: loc.line,
    column: loc.column,
  };
  // The linker mangles a module-local name to `__a<module>_<name>`; show the name the author wrote.
  if (fn) place.function = fn.replace(/^__a\d+_/, "");
  return place;
}

/** Record the innermost position of a thrown value, once. */
export function annotateError(err: unknown, loc: SourceLocation | undefined, ctx: SourceCtx): void {
  if (!loc) return;
  if (!isObject(err)) {
    lastPrimitive = { value: err, info: { location: locate(loc, ctx), frames: [] }, program: false, host: false };
    return;
  }
  const info = infos.get(err);
  if (!info) infos.set(err, { location: locate(loc, ctx), frames: [] });
  else if (!info.location) info.location = locate(loc, ctx);
}

/** Append the frame of a user function the error is unwinding through. */
export function addErrorFrame(
  err: unknown,
  fn: { name?: string; loc?: SourceLocation },
  ctx: SourceCtx,
): void {
  if (!fn.loc) return;
  const frame = locate(fn.loc, ctx, fn.name);
  if (!isObject(err)) {
    if (lastPrimitive && Object.is(lastPrimitive.value, err)) lastPrimitive.info.frames.push(frame);
    return;
  }
  const info = infos.get(err);
  if (info) info.frames.push(frame);
  else infos.set(err, { frames: [frame] });
}

/**
 * Tell the program's `$util.onError` sink about an action failure, once per
 * error object. Called when an action body throws, before the error unwinds
 * further, and again from {@link reportRuntimeError} for the sites that used to
 * only log.
 */
export function notifyProgramHook(ctx: EvaluationContext, err: unknown, source: string): void {
  if (!ctx.errorHook) return;
  if (!firstNotice(err, programNotified, "program")) return;
  const info = getAktionErrorInfo(err) ?? takePrimitiveInfo(err);
  try {
    ctx.errorHook({ error: err, source, ...(info ? { location: info.location, frames: info.frames } : {}) });
  } catch { /* a hook must never crash the runner */ }
}

/** True the first time `err` is offered to a sink; a thrown primitive is tracked by its slot. */
function firstNotice(err: unknown, seen: WeakSet<object>, sink: "program" | "host"): boolean {
  if (isObject(err)) {
    if (seen.has(err)) return false;
    seen.add(err);
    return true;
  }
  if (lastPrimitive && Object.is(lastPrimitive.value, err)) {
    if (lastPrimitive[sink]) return false;
    lastPrimitive[sink] = true;
  }
  return true;
}

function takePrimitiveInfo(err: unknown): AktionErrorInfo | undefined {
  return lastPrimitive && Object.is(lastPrimitive.value, err) ? lastPrimitive.info : undefined;
}

/**
 * Report an error the runtime would otherwise only log: annotate it with the
 * catch site's position when the program did not already, notify the program's
 * `$util.onError` and the host's `errorHook`, then log it as before.
 */
export function reportRuntimeError(ctx: EvaluationContext, err: unknown, meta: AktionErrorMeta): void {
  annotateError(err, meta.loc, ctx);
  notifyProgramHook(ctx, err, meta.source);
  const sink = ctx.hostErrorSink;
  if (sink) {
    if (firstNotice(err, hostNotified, "host")) {
      const info = getAktionErrorInfo(err) ?? takePrimitiveInfo(err) ?? { frames: [] };
      try {
        sink({ error: err, source: meta.source, kind: meta.kind, location: info.location, frames: info.frames });
      } catch { /* a hook must never crash the runner */ }
    }
  }
  // eslint-disable-next-line no-console
  console.error("%s", meta.message ?? `[aktion] ${meta.kind} error in ${meta.source}`, err);
}

/**
 * Report through a sink handed in by the host element, or just log when there
 * is none (the renderer, effect runner and HTTP runtime also run standalone).
 */
export function reportVia(sink: RuntimeErrorSink | undefined, err: unknown, meta: AktionErrorMeta): void {
  if (sink) {
    sink(err, meta);
    return;
  }
  // eslint-disable-next-line no-console
  console.error("%s", meta.message ?? `[aktion] ${meta.kind} error in ${meta.source}`, err);
}
