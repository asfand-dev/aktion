import { Widget } from './vdom.js';
export interface CanvasBaseProps {
    height: number;
    ariaLabel: string;
    testid?: string;
}
export declare abstract class CanvasWidget<P extends CanvasBaseProps> extends Widget<P> {
    protected canvas: HTMLCanvasElement;
    protected g: CanvasRenderingContext2D | null;
    protected width: number;
    protected height: number;
    protected dpr: number;
    protected tip: HTMLElement;
    private framePending;
    private resizeObserver;
    private colorCache;
    private colorEpoch;
    mount(): Element;
    update(previous: P): void;
    unmount(): void;
    /** Props changed; recompute derived layout before the redraw. */
    protected changed(_previous: P): void;
    protected abstract draw(g: CanvasRenderingContext2D): void;
    protected onPointer(_kind: "move" | "down" | "up" | "dbl", _x: number, _y: number, _event: PointerEvent): void;
    protected onWheel(_event: WheelEvent): void;
    protected onKey(_event: KeyboardEvent): void;
    protected onLeave(): void;
    /** Coalesce redraws into the next frame. */
    redraw(): void;
    protected resize(): void;
    private paint;
    /** A theme token's value (`--dt-accent`), cached per theme. */
    protected color(token: string, fallback?: string): string;
    protected font(size?: number, weight?: number, mono?: boolean): string;
    protected showTip(x: number, y: number, lines: ReadonlyArray<string | {
        text: string;
        tone?: string;
        bold?: boolean;
    }>): void;
    protected hideTip(): void;
    private handlePointer;
}
/** Round-rect path helper (Canvas `roundRect` is not universal yet). */
export declare function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void;
/** Truncate text to fit `maxWidth`, measuring with the context's current font. */
export declare function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number): string;
/** Heat colour for a 0–1 intensity: teal → yellow → orange → red. */
export declare function heat(t: number, light?: boolean): string;
