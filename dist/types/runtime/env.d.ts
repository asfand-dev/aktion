import { EvaluationContext } from './evaluator.js';
export interface EnvManager {
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
    readonly breakpoint: {
        readonly width: number;
        readonly active: "base" | "sm" | "md" | "lg" | "xl";
        readonly sm: boolean;
        readonly md: boolean;
        readonly lg: boolean;
        readonly xl: boolean;
    };
    readonly scroll: {
        readonly x: number;
        readonly y: number;
        readonly progress: number;
        readonly direction: "up" | "down";
    };
    readonly media: {
        readonly prefersDark: boolean;
        readonly prefersReducedMotion: boolean;
        readonly online: boolean;
        readonly pointer: "coarse" | "fine";
        readonly portrait: boolean;
    };
    readonly mouse: {
        readonly x: number;
        readonly y: number;
    };
}
export declare function createEnvManager(ctx: EvaluationContext): EnvManager;
