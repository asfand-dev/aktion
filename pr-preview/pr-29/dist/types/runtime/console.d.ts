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
export interface ConsoleNamespace {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
}
export declare const consoleNs: ConsoleNamespace;
