import { AppModel } from '../model.js';
import { Diagnostic } from '../protocol.js';
import { TabId } from '../context.js';
import { VitalsSnapshot } from './vitals.js';
export type InsightTone = "bad" | "warn" | "info" | "good";
export interface Insight {
    id: string;
    tone: InsightTone;
    title: string;
    detail: string;
    fix?: string;
    /** Where the evidence is. */
    tab?: TabId;
    /** A component name to filter by, when the insight is about one. */
    component?: string;
    commitId?: number;
}
/** Commits per second over the most recent `window` commits (needs at least 5). */
export declare function commitRate(model: AppModel, window?: number): number;
/** Health issues for the Overview: errors first, then warnings, then hints. */
export declare function healthIssues(model: AppModel, diagnostics: ReadonlyArray<Diagnostic>): Insight[];
/** Performance insights across the retained commits. */
export declare function performanceInsights(model: AppModel, vitals?: VitalsSnapshot): Insight[];
