import { EvaluationContext } from './evaluator.js';
/** A single live toast tracked by the `$toast` manager. */
export interface ToastItem {
    id: string;
    message: string;
    title?: string;
    /** Visual accent, mapped onto the `Toast` component's `tone`. */
    tone: string;
    /** Auto-dismiss delay in ms; `0` keeps the toast until dismissed. */
    duration: number;
    /** ms-epoch the toast was shown — handy for ordering / debugging. */
    createdAt: number;
}
/** Options accepted by `$toast.configure(options)`. */
export interface ToastConfig {
    /**
     * Viewport corner the auto-rendered stack pins to — one of the `Toasts`
     * component's own positions. Absent leaves the default (`top-right`).
     */
    position?: string;
}
/** Options accepted by `$toast.show(message, options)` and the shortcuts. */
export interface ToastOptions {
    title?: string;
    tone?: string;
    duration?: number;
}
/** Imperative surface exposed as the reserved `$toast` namespace. */
export interface ToastManager {
    /** Reactive list of live toasts (newest last). Treat as read-only. */
    items: ToastItem[];
    /** Show a toast; returns its id. `message` is coerced to a string. */
    show: (message: unknown, options?: ToastOptions) => string;
    /** `show` with `tone: "success"`. */
    success: (message: unknown, options?: ToastOptions) => string;
    /** `show` with `tone: "danger"`. */
    error: (message: unknown, options?: ToastOptions) => string;
    /** `show` with `tone: "info"`. */
    info: (message: unknown, options?: ToastOptions) => string;
    /** `show` with `tone: "warning"`. */
    warning: (message: unknown, options?: ToastOptions) => string;
    /** Remove a single toast by id (no-op if already gone). */
    dismiss: (id: string) => void;
    /** Remove every toast. */
    clear: () => void;
    /**
     * Settings for the auto-rendered stack. Call once, at the top level of the
     * program: everything here describes where notifications appear, not what any
     * one of them says.
     *
     *     $toast.configure({position: "bottom-center"})
     *
     * Only for the layer the runtime renders on the program's behalf. A program
     * that renders `Toasts(...)` itself already owns its placement and this does
     * nothing for it.
     */
    configure: (options?: ToastConfig) => void;
}
/**
 * Build a context-scoped toast manager. Registers a disposer that clears any
 * pending auto-dismiss timers when the context is torn down (replan /
 * disconnect), so a previous program's toasts can never fire against a stale
 * scope.
 */
export declare function createToastManager(ctx: EvaluationContext): ToastManager;
