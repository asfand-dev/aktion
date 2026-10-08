import { Child, Key, VElement } from '../core/vdom.js';
export interface SplitOptions {
    /** `row`: side by side (default). `col`: stacked. */
    direction?: "row" | "col";
    /** Size of the first pane in px. */
    size: number;
    min?: number;
    max?: number;
    /** Called once, when a drag or key-resize ends, with the final size. */
    onResize: (size: number) => void;
    first: Child;
    second: Child;
    testid?: string;
    label?: string;
}
/**
 * Two panes and a draggable gutter.
 *
 * The drag writes the pane's size straight to its style and reports the final
 * value once, on release — re-rendering the panel sixty times a second for a
 * drag would make resizing the one janky interaction in the tool.
 */
export declare function split(options: SplitOptions): VElement;
export interface Column<T> {
    key: string;
    label: string;
    /** Fixed width in px; omit for a flexible column. */
    width?: number;
    flex?: number;
    align?: "left" | "right";
    sort?: (row: T) => number | string;
    render: (row: T, index: number) => Child;
    tip?: string;
}
export interface SortState {
    key: string;
    dir: 1 | -1;
}
export interface TableOptions<T> {
    columns: ReadonlyArray<Column<T>>;
    rows: ReadonlyArray<T>;
    rowKey: (row: T) => Key;
    rowHeight: number;
    sort?: SortState | null;
    onSort?: (sort: SortState) => void;
    selected?: Key | null;
    onSelect?: (row: T, index: number) => void;
    /** Enter / double-click. */
    onActivate?: (row: T) => void;
    rowClass?: (row: T) => string;
    version?: unknown;
    empty?: Child;
    stickToBottom?: boolean;
    testid?: string;
    ariaLabel?: string;
    onHover?: (row: T | null) => void;
    onContextMenu?: (row: T, event: MouseEvent) => void;
}
/** Sort a copy with a stable comparator. Strings compare naturally ("item 2" < "item 10"). */
export declare function sortRows<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<Column<T>>, sort: SortState | null | undefined): ReadonlyArray<T>;
/**
 * A virtualised, sortable, keyboard-navigable table.
 *
 * Every column with a `sort` reader is sortable — the first-generation panel
 * declared sort readers on six tables and wired up exactly one of them.
 */
export declare function dataTable<T>(options: TableOptions<T>): VElement;
