import { EvaluationContext } from './evaluator.js';
export interface EnvManager {
    readonly viewport: {
        width: number;
        height: number;
    };
    readonly breakpoint: {
        width: number;
        active: string;
        sm: boolean;
        md: boolean;
        lg: boolean;
        xl: boolean;
    };
    readonly scroll: {
        x: number;
        y: number;
        progress: number;
        direction: string;
    };
    readonly media: {
        prefersDark: boolean;
        prefersReducedMotion: boolean;
        online: boolean;
        pointer: string;
        portrait: boolean;
    };
    readonly mouse: {
        x: number;
        y: number;
    };
}
export declare function createEnvManager(ctx: EvaluationContext): EnvManager;
