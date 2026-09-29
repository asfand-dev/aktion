/**
 * Aktion DevTools — virtual list.
 *
 * A debugger's lists are the long kind: 300 commits, 500 log lines, a
 * component tree with 2,000 instances, a network log that runs all afternoon.
 * Rendering every row costs layout on each event and, worse, makes the panel
 * slower than the app it is measuring. This widget renders only the rows in
 * the viewport (plus a small overscan), positions them with one transform, and
 * reuses row nodes by key as you scroll.
 *
 * Rows have one fixed height. That is a deliberate constraint rather than an
 * omission: fixed rows make every scroll offset a multiplication, keyboard
 * navigation trivially exact, and "keep the selection in view" a two-line
 * calculation. Content that needs more room opens in a detail pane instead of
 * growing its row — the same trade Chrome's network panel makes.
 */

import { h, render, unmountAll, Widget, type Child, type Key, type VNode } from "./vdom.js";

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

/** Viewport height used before layout exists (headless DOMs, hidden panels). */
const FALLBACK_VIEWPORT = 480;

const raf: (fn: () => void) => void =
  typeof requestAnimationFrame === "function"
    ? (fn) => { requestAnimationFrame(() => fn()); }
    : (fn) => { setTimeout(fn, 16); };

export class VirtualList<T> extends Widget<VirtualListProps<T>> {
  private sizer!: HTMLElement;
  private windowEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private framePending = false;
  private resizeObserver: ResizeObserver | null = null;
  private lastRange = "";
  private atBottom = true;
  private readonly onScroll = (): void => {
    const el = this.el as HTMLElement;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    if (atBottom !== this.atBottom) {
      this.atBottom = atBottom;
      this.props.onStickChange?.(atBottom);
    }
    if (this.framePending) return;
    this.framePending = true;
    raf(() => {
      this.framePending = false;
      this.paint(false);
    });
  };

  mount(): Element {
    const props = this.props;
    const focusable = props.focusable ?? props.onKeyDown !== undefined;
    const root = document.createElement("div");
    root.className = `vlist ${props.className ?? ""}`;
    if (props.role) root.setAttribute("role", props.role);
    if (props.ariaLabel) root.setAttribute("aria-label", props.ariaLabel);
    if (props.testid) root.setAttribute("data-dt", props.testid);
    if (focusable) root.tabIndex = 0;
    this.sizer = document.createElement("div");
    this.sizer.className = "vlist-sizer";
    this.windowEl = document.createElement("div");
    this.windowEl.className = "vlist-window";
    this.windowEl.setAttribute("role", "presentation");
    this.sizer.appendChild(this.windowEl);
    this.emptyEl = document.createElement("div");
    this.emptyEl.className = "vlist-empty";
    root.append(this.sizer, this.emptyEl);
    root.addEventListener("scroll", this.onScroll, { passive: true });
    root.addEventListener("keydown", (event) => this.props.onKeyDown?.(event));
    this.el = root;
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.paint(false));
      this.resizeObserver.observe(root);
    }
    this.paint(true);
    return root;
  }

  override update(previous: VirtualListProps<T>): void {
    const props = this.props;
    const el = this.el as HTMLElement;
    if (props.className !== previous.className) el.className = `vlist ${props.className ?? ""}`;
    if (props.ariaLabel !== previous.ariaLabel) {
      if (props.ariaLabel) el.setAttribute("aria-label", props.ariaLabel);
      else el.removeAttribute("aria-label");
    }
    const dataChanged = props.items !== previous.items || props.version !== previous.version || props.rowHeight !== previous.rowHeight || props.empty !== previous.empty;
    const follow = props.stickToBottom === true && this.atBottom && props.items.length > previous.items.length;
    if (dataChanged) this.paint(true);
    if (follow) {
      el.scrollTop = el.scrollHeight;
      this.paint(true);
    }
    if (props.scrollTo !== previous.scrollTo && props.scrollTo !== null && props.scrollTo !== undefined) {
      this.reveal(props.scrollTo);
    }
  }

  override unmount(): void {
    (this.el as HTMLElement).removeEventListener("scroll", this.onScroll);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    unmountAll(this.windowEl);
    unmountAll(this.emptyEl);
  }

  /** Scroll the minimum distance needed to show `index`. */
  reveal(index: number): void {
    const el = this.el as HTMLElement;
    const { rowHeight } = this.props;
    const viewport = el.clientHeight || FALLBACK_VIEWPORT;
    const top = index * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + viewport) el.scrollTop = top + rowHeight - viewport;
    this.paint(true);
  }

  private paint(force: boolean): void {
    const props = this.props;
    const el = this.el as HTMLElement;
    const count = props.items.length;
    const rowHeight = Math.max(1, props.rowHeight);

    if (count === 0) {
      this.sizer.style.height = "0px";
      if (this.lastRange !== "empty" || force) {
        render(this.windowEl, null);
        render(this.emptyEl, props.empty ?? null);
        this.lastRange = "empty";
      }
      return;
    }
    if (this.lastRange === "empty") render(this.emptyEl, null);

    const total = count * rowHeight;
    this.sizer.style.height = `${total}px`;
    const viewport = el.clientHeight || FALLBACK_VIEWPORT;
    // A shrunk list can leave the scroll offset past the new end.
    const maxTop = Math.max(0, total - viewport);
    const scrollTop = Math.min(el.scrollTop, maxTop);
    const overscan = props.overscan ?? 6;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
    const range = `${start}:${end}`;
    if (!force && range === this.lastRange) return;
    this.lastRange = range;

    const rows: VNode[] = [];
    for (let i = start; i < end; i += 1) {
      const item = props.items[i]!;
      const key = props.rowKey ? props.rowKey(item, i) : i;
      rows.push(h("div", { key, class: "vrow", role: "presentation", style: { height: `${rowHeight}px` } }, props.renderRow(item, i)));
    }
    this.windowEl.style.transform = `translateY(${start * rowHeight}px)`;
    render(this.windowEl, rows);
  }
}

/** Convenience: `virtualList({...})` reads better in a view than `h(VirtualList, {...})`. */
export function virtualList<T>(props: VirtualListProps<T> & { key?: Key }): VNode {
  return h(VirtualList as unknown as new (p: VirtualListProps<T>) => Widget<VirtualListProps<T>>, props);
}
