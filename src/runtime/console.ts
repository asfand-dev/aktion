/**
 * Console namespace for Aktion.
 *
 * Exposes a `console` global that forwards to the browser's built-in
 * `console` methods (`log`, `error`, `warn`, `info`, `debug`). The
 * forwarder gracefully no-ops when no global console is available (e.g.
 * during SSR or inside a worker without a console binding) so authors
 * can sprinkle `console.log(...)` calls without breaking partial-stream
 * renders.
 *
 * The runtime intentionally does NOT shadow JavaScript's full console
 * surface — just the five methods that LLM-authored scripts reach for.
 */

type ConsoleMethod = "log" | "error" | "warn" | "info" | "debug";

const METHODS: readonly ConsoleMethod[] = ["log", "error", "warn", "info", "debug"];

export interface ConsoleNamespace {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const getNativeConsole = (): Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> | null => {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as { console?: Console };
  return g.console ?? null;
};

const forward = (method: ConsoleMethod) =>
  (...args: unknown[]): void => {
    const native = getNativeConsole();
    if (!native) return;
    const fn = native[method] ?? native.log;
    if (typeof fn !== "function") return;
    try {
      fn(...args);
    } catch {
      /* swallow — console failures must not crash the render */
    }
  };

export const consoleNs: ConsoleNamespace = METHODS.reduce(
  (acc, method) => {
    acc[method] = forward(method);
    return acc;
  },
  {} as ConsoleNamespace,
);
