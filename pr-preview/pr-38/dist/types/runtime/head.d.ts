import { EvaluationContext } from './evaluator.js';
/**
 * `rel` values `<link>` may carry. Metadata and resource *hints* only.
 *
 * Excluded on purpose: `stylesheet` (attacker CSS over the entire host page —
 * clickjacking overlays and attribute-selector exfiltration), `preload` /
 * `modulepreload` / `prefetch` / `prerender` (fetch arbitrary origins, and
 * `as=script` primes a script load), and `import` (legacy HTML imports).
 * Web fonts have their own vetted path: `$theme({ fonts: { import: [...] } })`.
 */
export declare const SAFE_LINK_RELS: ReadonlySet<string>;
/**
 * `<html>` attributes `$head({ htmlAttrs })` may set. Localisation and
 * styling hooks only — notably NOT `style`, which would let a program paint a
 * full-viewport overlay over the host page (clickjacking) and beacon out via
 * `background-image`.
 */
export declare const SAFE_HTML_ATTRS: ReadonlySet<string>;
/**
 * `<link>` attributes kept besides `rel` and `href`: inert descriptors.
 * Anything else is dropped rather than guessed at. Exported, like the two
 * sets above, so the `aktion-runtime/dsl` declarations are built from it.
 */
export declare const SAFE_LINK_ATTRS: readonly string[];
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
