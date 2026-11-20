import { ComponentSpec } from '../types.js';
import { asNumber } from '../utils.js';
/**
 * Normalise a legacy size token to the shared `xs|sm|md|lg|xl` vocabulary.
 * Keeps the catalogue self-consistent (suggestion 4.2) while letting old
 * prompts that emit `"small"` / `"normal"` / `"large"` still render.
 */
export declare function normaliseSize(value: unknown, fallback?: string): string;
export declare const Icon: ComponentSpec;
export declare const Text: ComponentSpec;
/**
 * Deprecated alias for `Text`. Kept registered so existing Aktion
 * programs that still emit `TextContent(...)` keep rendering. New code
 * should use `Text(...)`.
 */
export declare const TextContent: ComponentSpec;
export declare const Image: ComponentSpec;
export declare const Badge: ComponentSpec;
export declare const Pill: ComponentSpec;
/**
 * `BadgeList` renders an array of string labels as a row of Badge pills.
 * Replaces the legacy `TagBlock` component.
 */
export declare const BadgeList: ComponentSpec;
export declare const Callout: ComponentSpec;
export declare const CodeBlock: ComponentSpec;
export declare const Skeleton: ComponentSpec;
export declare const Markdown: ComponentSpec;
export declare const Container: ComponentSpec;
export declare const Spacer: ComponentSpec;
/**
 * `LoadingDots` is the sequenced three-dot loader — a row of dots that pulse in
 * turn. A different visual metaphor from `Spinner`'s rotating ring, and the one
 * UI block uses for inline "working on it" feedback (its `loading-circle`
 * block). Use it where a ring would feel heavy: inside buttons, beside a label,
 * or in a table cell.
 */
export declare const LoadingDots: ComponentSpec;
export declare const Spinner: ComponentSpec;
export declare const Quote: ComponentSpec;
export { asNumber };
