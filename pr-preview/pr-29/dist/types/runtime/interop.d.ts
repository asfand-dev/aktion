import { EvaluationContext } from './evaluator.js';
export interface ScriptResource {
    /** `true` once the resource has finished loading successfully. */
    ready: boolean;
    /** `true` while the resource is still downloading / executing. */
    loading: boolean;
    /** The load error, or `null` on success. */
    error: unknown;
    /**
     * The resolved value. For a script with a `global`, this is
     * `window[global]` once loaded (e.g. `window.Stripe`); otherwise `true`.
     * `null` until ready.
     */
    value: unknown;
}
/**
 * Validate a `$script({ src })` URL.
 *
 * `$script` exists to load a real external script, so the only sensible
 * schemes are `http(s)` and same-origin relative paths. `javascript:` and
 * `data:`/`blob:` are never "an external script" — they are inline code
 * wearing a URL, and they were previously assigned to `script.src` verbatim.
 */
export declare function sanitiseScriptSrc(raw: unknown): string;
/**
 * `$script({ src, global?, type?, as?, attributes? })` — load an external
 * script (or stylesheet) exactly once, reactively gated on readiness. The
 * returned bag's `ready` flag flips to `true` (and `value` to `window[global]`)
 * when the resource finishes loading; reading any field subscribes the render.
 */
export declare function createScriptResource(config: unknown, ctx: EvaluationContext): ScriptResource;
/** A disposer returned by an observer helper; calling it stops observing. */
export type DomDisposer = () => void;
export interface DomMeasurement {
    /** The element's bounding rectangle (`getBoundingClientRect()`). */
    rect: DOMRect | {
        width: number;
        height: number;
        top: number;
        left: number;
        right: number;
        bottom: number;
    };
    /** Scroll position + scrollable size of the element. */
    scroll: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    /** Current viewport size. */
    viewport: {
        width: number;
        height: number;
    };
}
export interface DomManager {
    onResize: (node: unknown, callback: unknown) => DomDisposer;
    onIntersect: (node: unknown, callback: unknown, options?: unknown) => DomDisposer;
    onMutation: (node: unknown, callback: unknown, options?: unknown) => DomDisposer;
    measure: (node: unknown) => DomMeasurement | null;
}
/**
 * Build the `$dom` observer manager for a context. Every observer it creates
 * is registered on `ctx.disposers`, so a replan / disconnect tears them all
 * down automatically — callers never have to remember to disconnect.
 */
export declare function createDomManager(ctx: EvaluationContext): DomManager;
