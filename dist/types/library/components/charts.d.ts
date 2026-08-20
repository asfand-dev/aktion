import { ComponentSpec, PropSpec } from '../types.js';
export declare const PALETTE: readonly string[];
export declare const colorAt: (index: number) => string;
/** Tone tokens the charts accept. */
export declare const CHART_TONES: readonly ["primary", "success", "warning", "danger", "info"];
/**
 * Resolve a `tone` prop to a known token before it is interpolated into a
 * `var(--rui-color-…)` reference. The schema validator only enum-checks string
 * *literals*, so a tone that arrives from a `$variable` or an expression never
 * reaches that check — and the interpolated value lands in an inline `style`
 * attribute, where a `;` would open a second declaration.
 */
export declare function resolveTone(raw: unknown, fallback?: string): string;
/** Placeholder copy for the two async states every chart can be in. */
export declare const EMPTY_TEXT = "No data";
export declare const LOADING_TEXT = "Loading\u2026";
/**
 * The accessibility controls every chart shares. Read them with
 * `readChartA11y` and apply them with `nameChart` (both below, in "Shared
 * chart primitives").
 *
 * Spread these at the END of a chart's `props` array: the evaluator binds
 * positional arguments in declaration order, so inserting them any earlier
 * would silently rebind every documented call signature.
 */
export declare const CHART_A11Y_PROPS: readonly PropSpec[];
export declare const Series: ComponentSpec;
export interface SeriesData {
    name: string;
    values: number[];
    /** Author-supplied override for this series' palette colour. */
    color?: string;
}
export declare const readSeries: (raw: unknown[]) => SeriesData[];
/** The part of a series the legend and colour lookup need. */
export interface SeriesStyle {
    name: string;
    color?: string;
}
/** A series' own colour when it declares one, its palette slot otherwise. */
export declare const seriesColor: (series: SeriesStyle, index: number) => string;
export declare const BarChart: ComponentSpec;
export declare const LineChart: ComponentSpec;
export declare const PieChart: ComponentSpec;
export declare function formatNumeric(value: number): string;
/** Exact text for a data-table cell — `—` for a value the series never had. */
export declare function cellText(value: number | null | undefined): string;
/**
 * Clamp an author-supplied chart height / size (px) to something renderable.
 * Accepts `320` and `"320px"`; anything unparseable keeps the default.
 */
export declare function readChartHeight(raw: unknown, fallback: number): number;
/** Render a placeholder branch (loading / empty) into a chart root. */
export declare function chartPlaceholder(root: HTMLElement, message: string, busy: boolean): HTMLElement;
/**
 * Accessible name for a chart SVG.
 *
 * `role="img"` prunes everything inside the element from the a11y tree —
 * including the `<title>` tooltip on every bar — so without a name of its own
 * the chart is announced as a bare "image" and conveys nothing. The numbers
 * stay reachable through the visually-hidden table `chartTable` emits.
 */
export declare function chartLabel(kind: string, title: string, detail?: string): string;
export interface ChartA11y {
    /** Author-supplied accessible name, or `""` when they did not pass one. */
    name: string;
    decorative: boolean;
}
/**
 * Read the shared a11y props.
 *
 * `interactive` is the escape valve for `decorative`: an activatable shape is
 * given `tabindex="0"`, and a focusable node inside an `aria-hidden` subtree is
 * a worse defect than the unnamed graphic we started from. A chart wired to a
 * click handler is not decoration, so the flag is ignored for one.
 */
export declare function readChartA11y(props: Record<string, unknown>, interactive?: boolean): ChartA11y;
/**
 * Name a chart graphic — or take it out of the a11y tree entirely.
 *
 * `role="img"` prunes the element's contents, so an unnamed chart is announced
 * as a bare "image" AND its per-shape `<title>` tooltips become unreachable.
 * There is no case where that combination is right: either the graphic carries
 * information and needs a name, or it is decoration and should be hidden.
 */
export declare function nameChart(svg: SVGSVGElement, a11y: ChartA11y, generated: string): void;
/**
 * Screen-reader (and keyboard) fallback for an SVG chart: the same data as a
 * real table, visually hidden. This is the only path to the underlying numbers
 * for a non-pointer user, since SVG `<title>` tooltips are hover-only.
 */
export declare function chartTable(caption: string, columns: ReadonlyArray<string>, rows: ReadonlyArray<{
    label: string;
    cells: ReadonlyArray<string>;
}>, rowHeader?: string): HTMLElement;
/**
 * Make an SVG shape (or a grid cell) activatable by pointer AND keyboard.
 *
 * The handlers are assigned as DOM properties — never `addEventListener` — so
 * the morph reconciler copies this render's closure onto the node it keeps
 * instead of freezing the first render's loop variables.
 */
export declare function makeActivatable(node: Element, label: string, fire: () => void): void;
export interface LabelPlan {
    /** Render every Nth label (1 = all of them). */
    step: number;
    /** Rotate labels -45° when horizontal space per label is too tight. */
    rotated: boolean;
    /** Truncate each label to this many characters; full label stays in <title>. */
    maxChars: number;
    /** Reserved height under the chart so rotated labels are not clipped. */
    bottomPadding: number;
}
export declare const APPROX_CHAR_PX = 7;
/** Room reserved for a rotated y-axis / centred x-axis caption. */
export declare const AXIS_CAPTION_PX = 18;
/** Widest formatted label, in px, for a conservative gutter estimate. */
export declare function longestLabelPx(labels: ReadonlyArray<string>, maxChars?: number): number;
/**
 * Left gutter wide enough for the widest y-axis tick. A fixed 40px gutter
 * clipped the leading digits off anything above ~5 characters, which any
 * revenue figure is.
 */
export declare function tickGutter(min: number, max: number): number;
/**
 * Plan the x-axis labels. `slotCount` is the number of x positions the chart
 * actually plots (which can exceed `labels.length`), so the spacing estimate
 * matches the geometry the labels are drawn against.
 */
export declare function planLabels(labels: ReadonlyArray<string>, innerWidth: number, slotCount?: number): LabelPlan;
export declare function truncateLabel(label: string, maxChars: number): string;
/** Truncate to whatever fits `availablePx` at the chart-label font size. */
export declare function truncateToWidth(label: string, availablePx: number): string;
export declare function drawXAxisLabels(svg: SVGSVGElement, labels: ReadonlyArray<string>, padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
}, innerHeight: number, plan: LabelPlan, xFor: (index: number) => number): void;
/** Axis unit captions ("Revenue (EUR)" / "requests/sec"). */
export declare function drawAxisCaptions(svg: SVGSVGElement, padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
}, innerWidth: number, innerHeight: number, height: number, xAxisLabel: string, yAxisLabel: string): void;
export declare function createSvg(width: number, height: number): SVGSVGElement;
export declare function svgEl(tag: string, attrs: Record<string, string>, children?: ReadonlyArray<Node | string>): SVGElement;
/** Horizontal gridlines + y-axis tick values. */
export declare function drawAxes(svg: SVGSVGElement, padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
}, innerWidth: number, innerHeight: number, max: number, min?: number): void;
/** Vertical gridlines + x-axis tick values (horizontal bars, scatter plots). */
export declare function drawValueTicks(svg: SVGSVGElement, padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
}, innerWidth: number, innerHeight: number, max: number, min?: number): void;
export declare function legend(series: ReadonlyArray<SeriesStyle>): HTMLElement;
