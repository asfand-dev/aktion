import { ViewDefinition } from '../context.js';
import { HistoryEntry } from '../model.js';
export interface Change {
    kind: "added" | "removed" | "changed";
    path: string;
    before: string;
    after: string;
}
/**
 * Leaf-level diff between two recorded snapshots: recurses into plain objects
 * (arrays compare whole), reports added / removed keys, and caps at 400 changes
 * so a pathological snapshot cannot stall the panel.
 */
export declare function diffSnapshots(from: HistoryEntry, to: HistoryEntry): Change[];
/** "on $count", "every 3s", "on mount" — what an effect is FOR, not where it is. */
export declare function effectLabel(effect: {
    label: string;
    triggers?: string;
    deps: string[];
}): string;
export declare const stateView: ViewDefinition;
