import { SourceLocation } from '../parser/types.js';
import { EvaluationContext } from './evaluator.js';
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
export type AktionErrorKind = "action" | "render" | "effect" | "http-callback" | "top-level" | "boot" | "budget";
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
export declare const rememberRenderError: (placeholder: Node, err: unknown) => void;
export declare const recallRenderError: (placeholder: Node) => {
    error: unknown;
} | undefined;
/** Report a failure from a place that has no evaluation context of its own. */
export type RuntimeErrorSink = (err: unknown, meta: AktionErrorMeta) => void;
type SourceCtx = Pick<EvaluationContext, "sources" | "coverageSourcePath">;
export declare function getAktionErrorInfo(err: unknown): AktionErrorInfo | undefined;
/** Record the innermost position of a thrown value, once. */
export declare function annotateError(err: unknown, loc: SourceLocation | undefined, ctx: SourceCtx): void;
/** Append the frame of a user function the error is unwinding through. */
export declare function addErrorFrame(err: unknown, fn: {
    name?: string;
    loc?: SourceLocation;
}, ctx: SourceCtx): void;
/**
 * Tell the program's `$util.onError` sink about an action failure, once per
 * error object. Called when an action body throws, before the error unwinds
 * further, and again from {@link reportRuntimeError} for the sites that used to
 * only log.
 */
export declare function notifyProgramHook(ctx: EvaluationContext, err: unknown, source: string): void;
/**
 * Report an error the runtime would otherwise only log: annotate it with the
 * catch site's position when the program did not already, notify the program's
 * `$util.onError` and the host's `errorHook`, then log it as before.
 */
export declare function reportRuntimeError(ctx: EvaluationContext, err: unknown, meta: AktionErrorMeta): void;
/**
 * Report through a sink handed in by the host element, or just log when there
 * is none (the renderer, effect runner and HTTP runtime also run standalone).
 */
export declare function reportVia(sink: RuntimeErrorSink | undefined, err: unknown, meta: AktionErrorMeta): void;
export {};
