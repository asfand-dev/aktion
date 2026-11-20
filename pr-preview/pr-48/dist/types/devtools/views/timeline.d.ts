import { ViewContext, ViewDefinition, TabId } from '../context.js';
import { Tone } from '../ui/kit.js';
export interface TimelineEntry {
    id: string;
    kind: string;
    start: number;
    end?: number;
    label: string;
    detail: string;
    color: string;
    tone: Tone;
    alert?: boolean;
    open?: {
        tab: TabId;
        apply: (ctx: ViewContext) => void;
        label: string;
    };
    raw: unknown;
}
/** Every event the model and the vitals monitor hold, as timeline entries. */
/**
 * Console lines are stamped with wall-clock time by the console tap; every
 * other event uses the monotonic `performance.now()` clock. Convert so logs
 * land where they happened on the shared axis.
 */
/** "every 3s · L16" rather than the runtime's `effect @ L16:C1`: what it is for, then where. */
export declare function effectEventLabel(event: {
    label: string;
    triggers?: string;
}): string;
export declare function toMonotonic(time: number, epochOffset: number): number;
export declare function timelineEntries(ctx: Pick<ViewContext, "model" | "vitals" | "now" | "epochOffset">): TimelineEntry[];
export declare const timelineView: ViewDefinition;
