import { Widget, Child, Key, VNode } from './vdom.js';
export interface VirtualListProps<T> {
    items: ReadonlyArray<T>;
    rowHeight: number;
    renderRow: (item: T, index: number) => Child;
    rowKey?: (item: T, index: number) => Key;
    /** Rows rendered beyond each edge of the viewport. */
    overscan?: number;
    className?: string;
    /** Bump when something rows depend on changes (selection, expansion). */
    version?: unknown;
    /** Follow new rows while the view is already at the end (logs). */
    stickToBottom?: boolean;
    /** Keep this index in view. Applied whenever it changes. */
    scrollTo?: number | null;
    onKeyDown?: (event: KeyboardEvent) => void;
    role?: string;
    ariaLabel?: string;
    testid?: string;
    /** Shown instead of rows when `items` is empty. */
    empty?: Child;
    /** Focusable for keyboard navigation (default true when onKeyDown is set). */
    focusable?: boolean;
    /** Reported when the user scrolls away from / back to the bottom. */
    onStickChange?: (atBottom: boolean) => void;
}
export declare class VirtualList<T> extends Widget<VirtualListProps<T>> {
    private sizer;
    private windowEl;
    private emptyEl;
    private framePending;
    private resizeObserver;
    private lastRange;
    private atBottom;
    private readonly onScroll;
    mount(): Element;
    update(previous: VirtualListProps<T>): void;
    unmount(): void;
    /** Scroll the minimum distance needed to show `index`. */
    reveal(index: number): void;
    private paint;
}
/** Convenience: `virtualList({...})` reads better in a view than `h(VirtualList, {...})`. */
export declare function virtualList<T>(props: VirtualListProps<T> & {
    key?: Key;
}): VNode;
