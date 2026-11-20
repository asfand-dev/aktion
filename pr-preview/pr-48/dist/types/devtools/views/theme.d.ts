import { ViewDefinition } from '../context.js';
import { ThemeInfo } from '../protocol.js';
/** The colour pairs the library actually paints, with the WCAG minimum each needs. */
export declare const CONTRAST_PAIRS: ReadonlyArray<{
    label: string;
    fg: string;
    bg: string;
    min: number;
}>;
export declare function isColorValue(value: string): boolean;
/** `colorBgSubtle` → `--rui-color-bg-subtle`. */
export declare function cssVarName(token: string): string;
/** The `$theme({...})` block reproducing the edits (or every token). */
export declare function themeBlock(theme: ThemeInfo, onlyEdited: boolean): string;
/** Step a numeric CSS value (`12px`, `1.5`, `0.25rem`) by `delta` in its own unit. */
export declare function nudgeValue(value: string, delta: number): string | null;
export declare const themeView: ViewDefinition;
