import { RenderHelpers } from './types.js';
import { IconSize } from '../icons/index.js';
export declare function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | number | boolean | null | undefined>, children?: ReadonlyArray<Node | string | null | undefined>): HTMLElementTagNameMap[K];
export declare function text(value: unknown): string;
export declare function classNames(...parts: Array<string | false | null | undefined>): string;
export declare function asArray<T>(value: unknown): T[];
export declare function asString(value: unknown, fallback?: string): string;
/**
 * Resolve a form control's `value` attribute, preserving the difference between
 * "the program did not supply a value" and "the program supplied an empty one".
 *
 * Returns `null` when the prop is absent, and `el()` skips null attributes — so
 * the rendered element carries no `value` attribute at all. The morph
 * reconciler reads that absence as "this render is not asserting a value" and
 * leaves whatever the user typed alone (see `syncInput` in renderer/morph.ts).
 *
 * Using `asString(props.value)` here instead is the bug this exists to prevent:
 * it collapses "unset" to `""`, which morph applied as a deliberate clear, so
 * every uncontrolled field wiped itself on the next re-render from anywhere in
 * the app.
 */
export declare function valueAttr(value: unknown): string | null;
export declare function asBoolean(value: unknown, fallback?: boolean): boolean;
export declare function asNumber(value: unknown, fallback?: number): number;
/**
 * Canonical t-shirt spacing scale shared by every `gap`/`padding`/`margin`/
 * spacing-ish prop. `none` always resolves to `0`. Ordered smallest → largest
 * so the list reads naturally in docs and error messages.
 */
export declare const SPACING_TOKENS: readonly ["none", "3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"];
export type SpacingToken = typeof SPACING_TOKENS[number];
/**
 * Legacy t-shirt spellings still accepted at runtime and in validation but no
 * longer advertised in prop enums: the early single-letter spacing dialect
 * (`s`/`m`/`l`) and the verbose Button sizes (`small`/`normal`/`large`).
 */
export declare const LEGACY_SIZE_TOKEN_ALIASES: Record<string, string>;
/** Map a size token to its canonical spelling (`m` → `md`); other values pass through. */
export declare function canonicalSizeToken(value: unknown): string;
/**
 * Normalise a spacing prop value to a canonical {@link SPACING_TOKENS} entry.
 * Legacy aliases canonicalise first; anything outside the scale returns
 * `fallback` so callers can keep their historical defaults.
 */
export declare function normalizeSpacingToken(value: unknown, fallback?: string): string;
/**
 * Resolve a spacing token (canonical or legacy) to its CSS value: `none` → `0`,
 * everything else → the matching `var(--rui-spacing-*)`. The stylesheet keeps
 * the historical short variable names for `sm`/`md`/`lg` (`--rui-spacing-s/m/l`)
 * so existing theme overrides keep working. Unknown tokens return "".
 */
export declare function spacingCssValue(value: unknown): string;
/**
 * Breakpoint keys honoured by responsive prop maps (Grid columns, Stack
 * direction, etc.). Ordered from narrow → wide so CSS only needs to chain
 * one `min-width` per breakpoint and naturally cascades.
 */
export declare const RESPONSIVE_BREAKPOINTS: readonly ["base", "sm", "md", "lg", "xl"];
export type Breakpoint = typeof RESPONSIVE_BREAKPOINTS[number];
/**
 * Normalise a prop value that may be a single value or a responsive map
 * like `{sm: 1, md: 2, lg: 4}`. Returns either:
 *   - `{kind: "single", value}` — caller should use the value directly
 *   - `{kind: "responsive", values}` — caller should emit CSS variables /
 *     data attributes for each breakpoint
 *
 * A bare key without a breakpoint prefix (e.g. `{value: 2}`) collapses to
 * a single-value result. Unknown breakpoint keys are ignored so typos
 * don't crash the page.
 */
export type ResponsiveProp<T> = {
    kind: "single";
    value: T | null;
} | {
    kind: "responsive";
    values: Partial<Record<Breakpoint, T>>;
};
export declare function readResponsiveProp<T>(value: unknown): ResponsiveProp<T>;
export declare function sanitiseCssUrl(raw: string): string;
export declare function sanitiseCssLength(raw: unknown, fallback: string): string;
export declare function sanitiseCssColor(raw: unknown): string;
/**
 * Sanitise an LLM-supplied `href` value before it lands on an anchor.
 *
 * - Fragments (`#anchor`), root-relative paths (`/about`), and pure query
 *   strings (`?q=foo`) are kept verbatim.
 * - Absolute URLs with an allow-listed scheme (`http`, `https`, `mailto`,
 *   `tel`) are kept verbatim.
 * - Anything else — `javascript:`, `vbscript:`, `data:text/html`,
 *   `file:`, protocol-relative `//host/path`, control characters — collapses
 *   to `fallback` (default `"#"`) so the click never navigates anywhere
 *   dangerous.
 *
 * This is the single chokepoint every component should call before assigning
 * `href`. The Markdown renderer has its own (stricter, HTML-escaping)
 * sibling, but the validation rules match so behaviour stays consistent.
 */
export declare function sanitiseHref(raw: unknown, fallback?: string): string;
/**
 * Sanitise an LLM-supplied image `src` before it lands on an `<img>`.
 *
 * Relative paths and same-origin shapes are kept as-is. Absolute URLs with
 * an allow-listed scheme (`http`, `https`, `data`, `blob`) are kept. Anything
 * else (`javascript:`, `vbscript:`, `file:`, …) returns the empty string so
 * callers can render their own placeholder.
 */
export declare function sanitiseImageSrc(raw: unknown): string;
/** `true` when a value is a renderable component node produced by the runtime. */
export declare function isComponentNode(value: unknown): boolean;
/**
 * The `Col(...)` nodes of a table, with the holes taken out.
 *
 * A conditional column is the obvious way to write "only show Options to someone
 * who can use them":
 *
 *   Table([Col("Name", names), canEdit ? Col("", ids, …) : null])
 *
 * The `null` reached the column readers as a real array entry, and the first
 * `col.args` read threw a TypeError — so the whole table rendered as
 * `[render error in Table]` rather than as a table with one fewer column. Both
 * table components funnel their `columns` prop through here.
 */
export declare function asColumnNodes<T extends {
    args?: unknown[];
}>(raw: unknown): T[];
/** Subset of `RenderHelpers` the table cell builder needs. */
export interface CellRenderHelpers {
    renderNode: (node: unknown) => Node;
    invoke: (callable: unknown, ...args: unknown[]) => void;
}
/** A column's cell-rendering configuration, shared by Table and DataGrid. */
export interface TableCellCol {
    /** Cell value formatting hint (`text|number|currency|date`). */
    format?: string;
    /**
     * Optional `(value, rowIndex) => Component | string | (Component|string)[]`
     * mapper. Lets a column render arbitrary components — action buttons,
     * badges, avatars, links — instead of plain text. When omitted, a cell
     * value that is itself a component node still renders directly.
     */
    render?: unknown;
    /**
     * Optional `(value, rowIndex) => void` fired when the cell is clicked or
     * activated via keyboard. Clicks originating on an interactive child
     * (a rendered Button / link / input) are ignored so nested actions keep
     * their own handlers.
     */
    onClick?: unknown;
}
/**
 * Populate a `<td>` for one Table / DataGrid cell. Content resolution order:
 *
 *   1. `col.render(value, rowIndex)` — when provided, its result (a
 *      component, string, or array of either) is rendered. This is the
 *      idiomatic way to put buttons / badges / links in a column.
 *   2. a component-node `value` — rendered directly (so authors can also
 *      pass a pre-built array of component cells as the column `values`).
 *   3. otherwise the value is formatted as text via `formatValue`.
 *
 * When `col.onClick` is a callable the whole cell becomes an accessible
 * button (pointer + Enter/Space), firing `onClick(value, rowIndex)`.
 */
export declare function fillTableCell(td: HTMLElement, col: TableCellCol, value: unknown, rowIndex: number, helpers: CellRenderHelpers, formatValue: (value: unknown, format: string) => string, 
/**
 * The whole row this cell belongs to (issue #11). Passed as the 3rd arg to
 * `render` / `onClick` so a cell renderer can read sibling-column data
 * directly — robust to DataGrid's internal sorting, which `rowIndex` alone
 * doesn't convey to lookups against a *display-ordered* array.
 */
row?: unknown): void;
/**
 * A DOM id for a component that was not given one, stable across re-renders.
 *
 * Stored in instance state, so it survives re-renders and stays unique per
 * mounted component — two instances of the same component on one page get
 * different ids, which is what `aria-describedby` / `for=` need to stay valid.
 */
export declare function autoId(helpers: RenderHelpers, prefix: string): string;
export declare function renderIcon(value: unknown, options?: {
    className?: string;
    size?: IconSize | string;
    color?: string;
}): HTMLElement | null;
