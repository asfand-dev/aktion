import { ViewContext, ViewDefinition } from '../context.js';
export declare function wcagUrl(criterion: string): string | null;
type Rgb = {
    r: number;
    g: number;
    b: number;
};
export declare function toHex(color: Rgb): string;
/**
 * The smallest shift of `fg` toward black or white that reaches `target`
 * contrast against `bg` — the colour a designer would pick, not just "use
 * black".
 */
export declare function suggestForeground(fg: Rgb, bg: Rgb, target: number): {
    hex: string;
    ratio: number;
} | null;
export declare function runAudit(ctx: ViewContext, options?: {
    quiet?: boolean;
}): void;
export declare const a11yView: ViewDefinition;
export {};
