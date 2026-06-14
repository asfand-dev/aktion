/**
 * Toast runtime — the imperative `$toast` namespace.
 *
 * Authors used to hand-manage a `$toasts = [...]` array (push on show, splice
 * on dismiss, wire a timer per entry). `$toast` owns that lifecycle: it keeps
 * a reactive `items` list, auto-dismisses after a `duration`, and exposes a
 * small imperative surface (`show` + tone shortcuts, `dismiss`, `clear`).
 *
 * It is a per-context singleton (see `getToastManager` in the evaluator) so
 * timers are cleared on replan / disconnect via the context's disposer list,
 * and `notify()` re-renders the host whenever the list changes.
 *
 * The live list renders itself: the evaluator auto-appends a `Toasts(...)`
 * layer to the UI root (see `installAppRootBinding`), so a plain
 * `$toast.success("Saved")` is enough — authors don't wire up a `Toasts(...)`.
 * Reading `$toast.items` (the `items` getter flips `ctx.toastItemsRead`) opts
 * out of the auto-layer so authors can still place the stack themselves:
 *   Toasts($toast.items.map(t =>
 *     Toast({ title: t.title, message: t.message, tone: t.tone,
 *             onClose: () => $toast.dismiss(t.id) })))
 */

import type { EvaluationContext } from "./evaluator.js";

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
}

/** Default auto-dismiss delay (ms). `0` in options keeps a toast sticky. */
const DEFAULT_DURATION = 4000;

function asString(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Build a context-scoped toast manager. Registers a disposer that clears any
 * pending auto-dismiss timers when the context is torn down (replan /
 * disconnect), so a previous program's toasts can never fire against a stale
 * scope.
 */
export function createToastManager(ctx: EvaluationContext): ToastManager {
  let items: ToastItem[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let counter = 0;

  const notify = (): void => ctx.notify?.();

  const clearTimer = (id: string): void => {
    const handle = timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.delete(id);
    }
  };

  const dismiss = (id: string): void => {
    clearTimer(id);
    const next = items.filter((t) => t.id !== id);
    if (next.length === items.length) return;
    // Replace the array (new identity) so fine-grained readers re-render.
    items = next;
    notify();
  };

  const clear = (): void => {
    if (items.length === 0) return;
    for (const id of [...timers.keys()]) clearTimer(id);
    items = [];
    notify();
  };

  const show = (message: unknown, options: ToastOptions = {}): string => {
    const id = `toast-${(counter += 1)}`;
    const duration =
      typeof options.duration === "number" ? options.duration : DEFAULT_DURATION;
    const item: ToastItem = {
      id,
      message: asString(message),
      title: options.title != null ? asString(options.title) : undefined,
      tone: options.tone != null ? asString(options.tone) : "default",
      duration,
      createdAt: Date.now(),
    };
    items = [...items, item];
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          dismiss(id);
        }, duration),
      );
    }
    notify();
    return id;
  };

  const withTone =
    (tone: string) =>
    (message: unknown, options: ToastOptions = {}): string =>
      show(message, { ...options, tone });

  const manager: ToastManager = {
    // Reading `$toast.items` means the author is rendering the toasts by hand
    // (the classic `Toasts($toast.items.map(...))` pattern). Flag that on the
    // context so the runtime's auto-rendered toast layer steps aside and we
    // never double-render — see the `$app` injection in the evaluator.
    // Internal code reads the `items` closure directly and never trips this.
    get items() {
      ctx.toastItemsRead = true;
      return items;
    },
    show,
    success: withTone("success"),
    error: withTone("danger"),
    info: withTone("info"),
    warning: withTone("warning"),
    dismiss,
    clear,
  };

  ctx.disposers.push(() => {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
    items = [];
  });

  return manager;
}
