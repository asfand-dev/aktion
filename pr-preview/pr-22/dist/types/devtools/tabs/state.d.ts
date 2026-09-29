import { TabDefinition } from '../context.js';
import { HistoryEntry } from '../model.js';
export declare const stateTab: TabDefinition;
export interface Change {
    kind: "added" | "removed" | "changed";
    path: string;
    before: string;
    after: string;
}
/**
 * Leaf-level diff of two snapshots.
 *
 * Comparing whole atoms would report `user` as "changed" and leave you to find
 * out what inside it moved — which is the work you wanted done. Walking to the
 * leaves means the answer is `user.prefs.notify: true → false`.
 */
export declare function diffSnapshots(from: HistoryEntry, to: HistoryEntry): Change[];
