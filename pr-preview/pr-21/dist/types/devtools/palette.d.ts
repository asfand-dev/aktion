import { TabContext } from './context.js';
/** One palette entry. */
export interface Command {
    /** Stable id, also used as the list key. */
    id: string;
    /** Group the command belongs to (usually a tab name). */
    group: string;
    /** What it does, in the imperative. */
    label: string;
    /** Extra searchable words that are not in the label. */
    keywords?: string;
    /** Shortcut hint shown on the right. */
    hint?: string;
    run(): void;
}
/**
 * Subsequence score for `query` against `text`, or `null` for no match.
 *
 * Lower is better. Consecutive matches and matches at word starts score better,
 * so `insp` ranks "Inspect" above "Install", and typing a full word ranks it
 * first even when a shorter entry also matches.
 */
export declare function fuzzyScore(query: string, text: string): number | null;
/**
 * Rank commands against a query, best first.
 *
 * Raw subsequence scoring is not enough on its own. Typing a word that names a
 * tab — "theme", "network" — almost always means "take me there", but the tab
 * command competes with every action in that tab's group, several of which
 * repeat the word ("Reset theme token overrides"). Three biases fix that
 * without special-casing individual commands:
 *
 *   - an exact label match wins outright,
 *   - a label that STARTS with the query beats one that merely contains it,
 *   - navigation beats action on an otherwise equal score.
 */
export declare function rankCommands(commands: ReadonlyArray<Command>, query: string): Command[];
/**
 * Build the command list for the current context.
 *
 * Commands are recomputed per open rather than registered up front, so they can
 * depend on what is actually available — there is no "Refetch query" entry when
 * the app exposes no query cache, and no "Clear overrides" when none are active.
 */
export declare function buildPalette(ctx: TabContext, actions: PaletteActions): Command[];
/** The panel-level operations the palette needs to be able to trigger. */
export interface PaletteActions {
    togglePicker(): void;
    clearOverrides(): void;
    runAudit(): void;
    toggleRecording(): void;
    exportSession(): void;
    clearSession(): void;
    cycleDock(): void;
    showShortcuts(): void;
}
/** What the palette needs from its owner on each update. */
export interface PaletteState {
    query: string;
    selected: number;
    commands: ReadonlyArray<Command>;
}
/** Callbacks the palette fires; the owner holds the state they mutate. */
export interface PaletteHandlers {
    onQuery(value: string): void;
    onMove(delta: number): void;
    onRun(command: Command): void;
    onClose(): void;
}
/**
 * A palette whose input element persists across renders.
 *
 * This is deliberately a small controller rather than a render function. A
 * palette re-created on every keystroke — which is what a plain
 * `(state) => Node` would do, since typing changes the query and the query
 * drives a re-render — replaces the very element you are typing into: it drops
 * IME composition, can lose a fast keystroke, and makes an <kbd>Enter</kbd> that
 * arrives mid-render run whatever the *previous* render had selected. Binding
 * the listeners once and re-rendering only the result list fixes all three.
 */
export declare class PaletteController {
    private readonly handlers;
    private readonly input;
    private readonly list;
    private readonly footCount;
    private readonly root;
    /** Results of the latest update, so Enter always runs what is on screen. */
    private results;
    private selected;
    constructor(handlers: PaletteHandlers);
    /** Mount into `host` (idempotent) and refresh the list. Returns the count. */
    update(host: HTMLElement, state: PaletteState): number;
    /**
     * Focus the input. The palette is the one place where taking focus is
     * unambiguously what the user asked for.
     */
    focus(): void;
    /** Reset the query so the next open starts clean. */
    reset(): void;
}
/** The keyboard-shortcut reference, shown by `?` and from the palette. */
export declare const SHORTCUTS: ReadonlyArray<[string, string]>;
