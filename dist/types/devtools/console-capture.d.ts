import { LogLevel } from './protocol.js';
/** One captured console line. */
export interface CapturedLog {
    level: LogLevel;
    /** Rendered arguments, one entry each. */
    args: string[];
    /** `runtime` for `[aktion] …` diagnostics, else `program`. */
    origin: string;
    /** Wall-clock time (epoch ms), so rows can show a real clock. */
    time: number;
    /** Stack from the throw site, for `error` entries that carry one. */
    stack?: string;
}
type Sink = (entry: CapturedLog) => void;
/**
 * One panel's subscription to the shared tap. Starting the first one patches
 * the console; stopping the last one restores it.
 */
export declare class ConsoleCapture {
    private sink;
    get active(): boolean;
    /** Begin capturing. Calling twice replaces this instance's sink. */
    start(sink: Sink): void;
    /** Stop capturing. The console is restored once no panel is listening. */
    stop(): void;
}
export {};
