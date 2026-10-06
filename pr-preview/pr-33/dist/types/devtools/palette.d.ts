import { VNode } from './core/vdom.js';
import { IconName } from './ui/icons.js';
/** One palette entry. */
export interface Command {
    /** Stable id, also used as the list key. */
    id: string;
    /** Group the command belongs to (usually a section name). */
    group: string;
    /** What it does, in the imperative. */
    label: string;
    /** Extra searchable words that are not in the label. */
    keywords?: string;
    /** Shortcut hint shown on the right. */
    hint?: string;
    icon?: IconName;
    run(): void;
}
/**
 * Subsequence score for `query` against `text`, or `null` for no match. Lower
 * is better: consecutive matches and word starts score better, so `insp` ranks
 * "Inspect" above "Install".
 */
export declare function fuzzyScore(query: string, text: string): number | null;
/**
 * Indices in `text` that a query's characters matched, preferring word starts —
 * for highlighting. Empty when there is no match.
 */
export declare function fuzzyPositions(query: string, text: string): number[];
/**
 * Rank commands against a query, best first. On top of the raw score: an exact
 * label match wins outright, a label that STARTS with the query beats one that
 * merely contains it, and navigation beats action on an otherwise equal score.
 */
export declare function rankCommands(commands: ReadonlyArray<Command>, query: string): Command[];
export interface ShortcutGroup {
    title: string;
    items: ReadonlyArray<[string, string]>;
}
/** Every shortcut, grouped the way the help dialog shows them. */
export declare const SHORTCUT_GROUPS: ReadonlyArray<ShortcutGroup>;
/** Flat list of `[keys, what]`, for callers of the protocol-2 export. */
export declare const SHORTCUTS: ReadonlyArray<[string, string]>;
export interface PaletteViewOptions {
    query: string;
    index: number;
    commands: ReadonlyArray<Command>;
    onQuery(query: string): void;
    onIndex(index: number): void;
    onRun(command: Command): void;
    onClose(): void;
}
/** The palette dialog. The caller ranks nothing — this does. */
export declare function paletteView(options: PaletteViewOptions): VNode;
