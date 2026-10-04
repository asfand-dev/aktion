import { EvaluationContext } from './evaluator.js';
export interface HeadManager {
    /** Queue a `$head(...)` contribution for the current render pass. */
    apply: (config: unknown) => void;
    /** Force the queued contributions to commit immediately (used by SSR). */
    flush: () => void;
    /** Serialise the resolved head to an HTML string for SSR `<head>` injection. */
    serialize: () => string;
    /** The resolved `<html>` attributes (lang / dir / …) for SSR. */
    htmlAttrs: () => Record<string, string>;
}
/**
 * Build the per-context `$head` manager. Contributions accumulate per render
 * pass (synchronously) and commit on a microtask, so the resolved head is the
 * merge of every `$head(...)` that ran this pass.
 */
export declare function createHeadManager(ctx: EvaluationContext): HeadManager;
