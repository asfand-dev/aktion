import { DevtoolsValue } from './protocol.js';
export type Attrs = Record<string, unknown>;
export type Child = Node | string | number | null | undefined | false;
/**
 * Create an element. `on*` keys become listeners, `class` / `style` are
 * strings, `true` becomes a bare attribute, and `null` / `false` / `undefined`
 * are skipped — so a conditional attribute is just `title: maybe && "…"`.
 */
export declare function h(tag: string, attrs?: Attrs, ...children: Child[]): HTMLElement;
/** Append children, flattening arrays and skipping empties. */
export declare function append(parent: Node, children: ReadonlyArray<Child | Child[]>): void;
/** A document fragment holding `children` — for a tab returning several nodes. */
export declare function frag(...children: Child[]): DocumentFragment;
/** Duration with a precision that shrinks as the number grows. */
export declare function fmtMs(n: number | undefined): string;
/** Offset from a timeline origin. */
export declare function fmtRel(ms: number): string;
/** Wall-clock time of day, for log rows. */
export declare function fmtClock(epochMs: number): string;
/** Compact integer with a `k` / `M` suffix. */
export declare function fmtCount(n: number): string;
/** Byte size in the unit a human would use. */
export declare function fmtBytes(n: number | undefined): string;
/** Percentage of `num` in `den`, or an em-dash when the ratio is undefined. */
export declare function fmtPct(num: number, den: number): string;
/**
 * Shorten a long string from the MIDDLE. For URLs and instance keys the ends
 * carry the meaning (which endpoint, which component) and the middle is
 * scaffolding, so a trailing ellipsis hides exactly the informative half.
 */
export declare function truncateMiddle(text: string, limit?: number): string;
/** Path portion of a URL, for the network list's primary column. */
export declare function urlPath(url: string): string;
/** Host portion of a URL, or `""` for a relative one. */
export declare function urlHost(url: string): string;
/** A titled block with an optional row of actions on the right. */
export declare function section(title: string | null, body: Child | Child[], options?: {
    actions?: Child[];
    flush?: boolean;
    id?: string;
}): HTMLElement;
/** The sticky control strip at the top of a tab. */
export declare function toolbar(...children: Child[]): HTMLElement;
/** Flexible spacer for a toolbar / header row. */
export declare function spacer(): HTMLElement;
/** Small coloured label. */
export declare function chip(label: string, tone?: string, title?: string): HTMLElement;
/** A push button in the panel's chrome style. */
export declare function button(label: Child, onClick: () => void, options?: {
    title?: string;
    tone?: string;
    active?: boolean;
    disabled?: boolean;
}): HTMLElement;
/** A toggle rendered as a filter chip. */
export declare function toggle(label: string, on: boolean, onToggle: () => void, title?: string): HTMLElement;
/** A single-select group of chips. */
export declare function chipGroup<T extends string>(values: ReadonlyArray<{
    value: T;
    label: string;
    title?: string;
}>, active: T, onPick: (value: T) => void): HTMLElement;
/** Debounced-free search box; `onInput` fires on every keystroke. */
export declare function searchInput(value: string, onInput: (value: string) => void, placeholder?: string, options?: {
    focusKey?: string;
}): HTMLInputElement;
/**
 * Attribute carrying a field's stable identity across re-renders.
 *
 * The panel re-renders on every runtime event, so a field the user is typing in
 * is destroyed and rebuilt several times a second. Restoring focus by POSITION
 * fails exactly when it matters — running a REPL expression grows the history
 * above the input, so the input is no longer the same child index and focus is
 * lost on the keystroke that mattered most. A declared key is positional-shape
 * independent.
 */
export declare const FOCUS_KEY_ATTR = "data-dt-focus";
/**
 * Attribute marking a scroll container whose position should survive a
 * re-render. Without it, a scrolled component tree jumps back to the top every
 * time an event arrives.
 */
export declare const SCROLL_KEY_ATTR = "data-dt-scroll";
/** A scrollable region whose scroll offset is preserved across re-renders. */
export declare function scrollArea(key: string, attrs: Attrs, ...children: Child[]): HTMLElement;
/** A single-line text field with a stable focus key and Enter/blur commit. */
export declare function textField(options: {
    focusKey: string;
    value?: string;
    placeholder?: string;
    className?: string;
    width?: string;
    title?: string;
    /** Fires on every keystroke. */
    onInput?: (value: string) => void;
    /** Fires on Enter and on blur when the value changed. */
    onCommit?: (value: string) => void;
    /** Fires on Enter only. */
    onEnter?: (value: string) => void;
}): HTMLInputElement;
/** Muted inline note. */
export declare function muted(...children: Child[]): HTMLElement;
/** Even quieter note, for hints. */
export declare function faint(...children: Child[]): HTMLElement;
/** Monospace inline code. */
export declare function code(text: string, title?: string): HTMLElement;
/** The "nothing here yet" block, with an actionable hint. */
export declare function emptyState(title: string, hint?: Child, action?: Child): HTMLElement;
/** Key/value metadata line. */
export declare function kv(...pairs: Array<[string, Child]>): HTMLElement;
/** One headline number with a caption. */
export declare function stat(label: string, value: string, options?: {
    tone?: string;
    title?: string;
    onClick?: () => void;
}): HTMLElement;
/** Grid of `stat`s. */
export declare function statGrid(...stats: Child[]): HTMLElement;
/** A labelled horizontal bar, for "top N" breakdowns. */
export declare function barRow(label: Child, fraction: number, note: Child, options?: {
    tone?: string;
    title?: string;
    onClick?: () => void;
}): HTMLElement;
/** One insight line: an icon, a tone, and a sentence that names the fix. */
export declare function insight(tone: string, icon: string, body: Child): HTMLElement;
/** A stack of `insight`s. */
export declare function insightList(items: ReadonlyArray<{
    tone: string;
    icon: string;
    text: Child;
}>): HTMLElement;
export interface Column<T> {
    key: string;
    label: string;
    /** Right-align numeric columns. */
    numeric?: boolean;
    /** Sort value; omit for an unsortable column. */
    sort?: (row: T) => number | string;
    render(row: T): Child;
    title?: string;
}
export interface SortState {
    key: string;
    dir: 1 | -1;
}
/**
 * A sortable table.
 *
 * Sorting is owned by the caller (it lives in the tab's UI state, so it
 * survives a re-render), which is why `sort` and `onSort` come in rather than
 * being hidden here.
 */
export declare function table<T>(columns: ReadonlyArray<Column<T>>, rows: ReadonlyArray<T>, options?: {
    sort?: SortState;
    onSort?: (key: string) => void;
    rowClass?: (row: T) => string;
    onRowClick?: (row: T) => void;
    empty?: string;
}): HTMLElement;
/** Flip a sort state for `key`, defaulting new numeric columns to descending. */
export declare function nextSort(current: SortState, key: string, defaultDir?: 1 | -1): SortState;
/** Type-coloured, one-line rendering of a protocol value. */
export declare function valueSpan(value: DevtoolsValue, options?: {
    title?: string;
}): HTMLElement;
/**
 * A value that can be edited in place: click to open an input, Enter to commit,
 * Escape to cancel.
 *
 * `onCommit` receives the PARSED value (JSON where it parses, the raw string
 * otherwise), because every caller wants the same rule and re-deriving it per
 * tab is how `"42"` ends up written as a string in one place and a number in
 * another.
 */
export declare function editableValue(value: DevtoolsValue, onCommit: (next: unknown) => void, options?: {
    title?: string;
    disabled?: boolean;
    onCancel?: () => void;
    focusKey?: string;
}): HTMLElement;
export interface JsonTreeOptions {
    /** Dotted path prefix for expansion keys (`state`, `response`). */
    path?: string;
    /** Set of expanded paths, owned by the caller so it survives re-renders. */
    expanded: Set<string>;
    /** Re-render callback after an expand / collapse. */
    onToggle(): void;
    /** Called with the dotted path + new value when a leaf is edited. */
    onEdit?(path: string, value: unknown): void;
    /** Paths that must not be edited (reserved atoms). */
    readOnly?(path: string, depth: number): boolean;
    /** Extra trailing content per row (a heat badge, a "reserved" tag). */
    decorate?(path: string, depth: number): Child;
    /** Highlight rows whose path is in this set. */
    highlight?: Set<string>;
    /** Deepest level rendered before collapsing (guards a cyclic-ish blob). */
    maxDepth?: number;
    /** Case-insensitive key filter applied at the top level only. */
    filter?: string;
}
/**
 * Render a plain JS value as an expandable tree, with optional inline editing.
 *
 * Rows are produced flat with padding rather than nested — a nested structure
 * re-created per keystroke is what makes a big state tree feel slow, and a flat
 * list also lets a filter hide a row without orphaning its children.
 */
export declare function jsonTree(value: unknown, options: JsonTreeOptions): HTMLElement;
/** `typeof`-style classification used by the tree renderer. */
export declare function jsonType(value: unknown): string;
/** Immediate children of a value, as `[key, value]` pairs. */
export declare function childEntries(value: unknown): Array<[string, unknown]>;
/** One-line preview for the tree renderer (mirrors `serialize.previewOf`). */
export declare function jsonPreview(value: unknown): string;
export interface CodeBlockOptions {
    /** Show 1-based line numbers. */
    lineNumbers?: boolean;
    /** Lines to mark, keyed by 1-based line number (within the slice) → tone. */
    markers?: Map<number, {
        tone: string;
        title: string;
    }>;
    /** Line to scroll into view + highlight, 1-based within the slice. */
    focusLine?: number | null;
    /** Called when a line is clicked, with the 1-based line within the slice. */
    onLineClick?(line: number): void;
    /** Cap the rendered lines (a 5k-line program does not need to be in the DOM). */
    maxLines?: number;
    /**
     * Line number the slice starts at, when the caller is rendering a window of a
     * larger file. Gutter numbers are absolute; every other index stays relative.
     */
    firstLine?: number;
    /** Case-insensitive substring to mark inside each line. */
    highlight?: string;
    /** Preserve the scroll offset across re-renders under this key. */
    scrollKey?: string;
}
/**
 * Render source text with optional line numbers, gutter markers, and search
 * highlighting.
 *
 * Diagnostics land on the line that produced them, which is the difference
 * between "line 42: unknown prop" as a sentence and as a place you can look at.
 */
export declare function codeBlock(text: string, options?: CodeBlockOptions): HTMLElement;
/**
 * Copy text to the clipboard, falling back to a hidden textarea.
 *
 * The panel lives in a shadow root inside an arbitrary page, so the async
 * Clipboard API can be unavailable (insecure context) or rejected (no
 * permission) — a copy button that silently does nothing in those cases is
 * worse than one that uses the old command.
 */
export declare function copyText(text: string): void;
/** A small "copy" button wired to `copyText`. */
export declare function copyButton(getText: () => string, label?: string, onDone?: () => void): HTMLElement;
/**
 * Offer `text` as a file download.
 *
 * Used by the session export and the generated-test buttons. Revoking the URL
 * on a timer rather than immediately is deliberate: some browsers cancel a
 * download whose blob URL is revoked in the same task.
 */
export declare function downloadText(filename: string, text: string, mime?: string): void;
/** A horizontal waterfall bar, for network timings. */
export declare function waterfallBar(startFraction: number, widthFraction: number, tone: string, title: string): HTMLElement;
/** A two-column definition list, for detail panes. */
export declare function defList(rows: ReadonlyArray<[string, Child]>): HTMLElement;
/** A collapsible group with a persistent open flag owned by the caller. */
export declare function disclosure(label: Child, open: boolean, onToggle: () => void, body: () => Child | Child[], meta?: Child): HTMLElement;
