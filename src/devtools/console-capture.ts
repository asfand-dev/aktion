/**
 * Aktion DevTools — console capture.
 *
 * The panel mirrors the page console instead of asking the runtime to emit log
 * events, and that choice is deliberate:
 *
 *   - A program's `console.log` forwards to the native console (see
 *     `src/runtime/console.ts`). Emitting a protocol event *as well* would show
 *     every line twice.
 *   - The most valuable lines are not the program's at all: they are the
 *     runtime's own diagnostics — `[aktion] A reactive $state write happened
 *     during render…`, `[aktion] failed to render Button`. Those go straight to
 *     the native console, so only a tap sees them.
 *
 * A tap on a global is the kind of thing that can wreck a page, so this one is
 * careful: it forwards every call to the original first, it patches the console
 * exactly once however many panels are open, it restores precisely what it
 * replaced, and it swallows any error in a sink rather than letting the app's
 * `console.log` throw.
 */

import type { LogLevel } from "./protocol.js";
import { previewOf } from "./serialize.js";

/** One captured console line. */
export interface CapturedLog {
  level: LogLevel;
  /** Rendered arguments, one entry each. */
  args: string[];
  /** `runtime` for `[aktion] …` diagnostics, else `program`. */
  origin: string;
  /** Wall-clock time (epoch ms), so rows can show a real clock. */
  time: number;
  /** Stack from the throw site, for `error` entries that carry one. */
  stack?: string;
}

type Sink = (entry: CapturedLog) => void;

const LEVELS: readonly LogLevel[] = ["log", "info", "warn", "error", "debug"];

type ConsoleLike = Record<string, unknown>;

/**
 * The tap lives on `globalThis`, not in module scope, for the same reason the
 * hook does: two panels — or two copies of this module from two bundles — must
 * share one patch. Nested wrappers would otherwise unpatch each other's, and
 * the panel that lost its wrapper would silently stop receiving lines.
 */
const TAP_KEY = "__AKTION_DEVTOOLS_CONSOLE_TAP_V1__";

interface SharedTap {
  sinks: Set<Sink>;
  originals: Map<string, unknown>;
  /** Guards against a sink whose own logging would re-enter the tap. */
  inSink: boolean;
  errorHandler: ((event: Event) => void) | null;
  rejectionHandler: ((event: Event) => void) | null;
}

function sharedTap(): SharedTap {
  const holder = globalThis as unknown as Record<string, SharedTap | undefined>;
  let tap = holder[TAP_KEY];
  if (!tap) {
    tap = { sinks: new Set(), originals: new Map(), inSink: false, errorHandler: null, rejectionHandler: null };
    holder[TAP_KEY] = tap;
  }
  return tap;
}

function emit(level: LogLevel, args: unknown[], stack?: string): void {
  const tap = sharedTap();
  if (tap.sinks.size === 0 || tap.inSink) return;
  tap.inSink = true;
  try {
    const rendered = args.map((arg) => (typeof arg === "string" ? arg : previewOf(arg)));
    const first = rendered[0] ?? "";
    const entry: CapturedLog = {
      level,
      args: rendered,
      // The runtime prefixes every diagnostic it owns, which is the only
      // reliable way to tell its output from the program's.
      origin: first.startsWith("[aktion") ? "runtime" : "program",
      time: Date.now(),
      stack,
    };
    for (const sink of [...tap.sinks]) {
      try {
        sink(entry);
      } catch {
        /* one broken panel must not stop the others from seeing the line */
      }
    }
  } catch {
    /* never let a broken panel break the page's logging */
  } finally {
    tap.inSink = false;
  }
}

function patch(): void {
  const tap = sharedTap();
  if (tap.originals.size > 0) return;
  const target = globalThis as unknown as { console?: ConsoleLike };
  const native = target.console;
  if (!native) return;

  for (const level of LEVELS) {
    const original = native[level];
    if (typeof original !== "function") continue;
    tap.originals.set(level, original);
    const forward = original as (...args: unknown[]) => void;
    native[level] = (...args: unknown[]): void => {
      // The page's own console must work exactly as before, first and always.
      try {
        forward.apply(native, args);
      } catch {
        /* a console that throws is the page's problem, not ours */
      }
      emit(level, args);
    };
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    // An uncaught error does not reach `console.error` in every browser, and a
    // rejected promise reaches it in none — but both are exactly what someone
    // opening a debugger is looking for.
    tap.errorHandler = (event: Event) => {
      const error = event as ErrorEvent;
      emit("error", [error.message ?? "Uncaught error"], error.error instanceof Error ? error.error.stack : undefined);
    };
    tap.rejectionHandler = (event: Event) => {
      const rejection = event as PromiseRejectionEvent;
      const reason = rejection.reason;
      emit(
        "error",
        [`Unhandled rejection: ${reason instanceof Error ? reason.message : previewOf(reason)}`],
        reason instanceof Error ? reason.stack : undefined,
      );
    };
    window.addEventListener("error", tap.errorHandler);
    window.addEventListener("unhandledrejection", tap.rejectionHandler);
  }
}

function unpatch(): void {
  const tap = sharedTap();
  const target = globalThis as unknown as { console?: ConsoleLike };
  const native = target.console;
  if (native) {
    for (const [level, original] of tap.originals) {
      native[level] = original;
    }
  }
  tap.originals.clear();
  if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
    if (tap.errorHandler) window.removeEventListener("error", tap.errorHandler);
    if (tap.rejectionHandler) window.removeEventListener("unhandledrejection", tap.rejectionHandler);
  }
  tap.errorHandler = null;
  tap.rejectionHandler = null;
}

/**
 * One panel's subscription to the shared tap. Starting the first one patches
 * the console; stopping the last one restores it.
 */
export class ConsoleCapture {
  private sink: Sink | null = null;

  get active(): boolean {
    return this.sink !== null;
  }

  /** Begin capturing. Calling twice replaces this instance's sink. */
  start(sink: Sink): void {
    const tap = sharedTap();
    if (this.sink) tap.sinks.delete(this.sink);
    this.sink = sink;
    tap.sinks.add(sink);
    patch();
  }

  /** Stop capturing. The console is restored once no panel is listening. */
  stop(): void {
    const tap = sharedTap();
    if (this.sink) tap.sinks.delete(this.sink);
    this.sink = null;
    if (tap.sinks.size === 0) unpatch();
  }
}
