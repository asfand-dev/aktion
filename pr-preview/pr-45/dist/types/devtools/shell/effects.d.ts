import { DevtoolsAppRecord } from '../hook.js';
import { NetworkRule } from '../protocol.js';
import { UiState, ViewContext } from '../context.js';
/** Network presets, applied after the user's own rules (so an explicit mock still wins). */
export declare const THROTTLE_RULES: Record<UiState["throttle"], NetworkRule[]>;
interface Saved {
    element: HTMLElement;
    filter?: string;
    dir?: string | null;
}
/** Per-panel bookkeeping; opaque to the shell. */
export interface EffectState {
    markersSig?: string;
    tabSig?: string;
    landmarkSig?: string;
    badgeSig?: string;
    visionSig?: string;
    dirSig?: string;
    scaleSig?: string;
    saved?: Saved;
    scale?: {
        app: DevtoolsAppRecord;
        base: Record<string, string>;
        userOverrides: Record<string, string>;
    } | null;
}
/** Findings passing the impact + category filters, in audit order (the numbering source). */
export declare function visibleFindings<F extends {
    impact: string;
    category?: string;
}>(findings: ReadonlyArray<F>, ui: Pick<UiState, "a11yImpacts" | "a11yCategory">): F[];
export declare function applySideEffects(raw: object, ctx: ViewContext): void;
/** Undo everything (the panel is going away). */
export declare function releaseSideEffects(raw: object, _app: DevtoolsAppRecord | null): void;
export {};
