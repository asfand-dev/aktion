import { Child, Props, VElement, VNode } from '../core/vdom.js';
import { IconName } from './icons.js';
export type Tone = "grey" | "green" | "amber" | "red" | "blue" | "cyan" | "purple" | "pink" | "orange" | "teal" | "accent";
export interface ButtonOptions {
    label?: Child;
    icon?: IconName;
    onClick?: (event: MouseEvent) => void;
    variant?: "default" | "primary" | "ghost" | "danger" | "success";
    size?: "sm" | "md" | "lg";
    active?: boolean;
    disabled?: boolean;
    /** Tooltip; also the accessible description. */
    tip?: string;
    /** Keyboard shortcut shown in the tooltip. */
    kbd?: string;
    testid?: string;
    /** Extra attributes (aria-*, type, …). */
    attrs?: Props;
    trailing?: Child;
}
export declare function button(options: ButtonOptions): VElement;
export interface IconButtonOptions {
    icon: IconName;
    /** Required: an icon button's only name. */
    label: string;
    onClick?: (event: MouseEvent) => void;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    size?: "sm" | "md" | "lg";
    kbd?: string;
    testid?: string;
    dot?: boolean;
    attrs?: Props;
}
export declare function iconButton(options: IconButtonOptions): VElement;
export interface Choice<T extends string> {
    value: T;
    label: Child;
    icon?: IconName;
    count?: number | string | null;
    tip?: string;
    tone?: Tone;
    testid?: string;
}
/** A segmented control — the sub-view switcher of every section. */
export declare function segmented<T extends string>(choices: ReadonlyArray<Choice<T>>, value: T, onChange: (value: T) => void, options?: {
    label?: string;
    testid?: string;
}): VElement;
/** Underlined tabs — for detail panes. */
export declare function tabs<T extends string>(choices: ReadonlyArray<Choice<T>>, value: T, onChange: (value: T) => void, options?: {
    label?: string;
    trailing?: Child;
}): VElement;
/** A pill-shaped filter toggle. */
export declare function filterChip(options: {
    label: Child;
    on: boolean;
    onToggle: () => void;
    count?: number;
    swatch?: string;
    tip?: string;
    testid?: string;
}): VElement;
/** An on/off switch with an optional label and description. */
export declare function toggleSwitch(options: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: Child;
    testid?: string;
    disabled?: boolean;
}): VElement;
export declare function checkbox(options: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: Child;
    testid?: string;
}): VElement;
export interface SearchOptions {
    value: string;
    onInput: (value: string) => void;
    placeholder?: string;
    /** Right-aligned meta (match count). */
    meta?: string;
    testid?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
    width?: string;
}
/** The search field every list has. `/` focuses the first one in the view. */
export declare function searchField(options: SearchOptions): VElement;
export interface FieldOptions {
    value: string;
    placeholder?: string;
    mono?: boolean;
    invalid?: boolean;
    width?: string;
    label?: string;
    testid?: string;
    type?: string;
    /** Every keystroke. */
    onInput?: (value: string) => void;
    /** Enter (and blur, when `commitOnBlur`). */
    onCommit?: (value: string) => void;
    commitOnBlur?: boolean;
    onKeyDown?: (event: KeyboardEvent) => void;
    attrs?: Props;
}
/** A single-line input. Controlled when `onInput` is given. */
export declare function field(options: FieldOptions): VElement;
export declare function textarea(options: {
    value: string;
    onInput: (value: string) => void;
    rows?: number;
    placeholder?: string;
    mono?: boolean;
    invalid?: boolean;
    testid?: string;
    label?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
}): VElement;
export declare function select<T extends string>(options: {
    value: T;
    options: ReadonlyArray<{
        value: T;
        label: string;
    }>;
    onChange: (value: T) => void;
    label: string;
    testid?: string;
    width?: string;
}): VElement;
export declare function chip(label: Child, tone?: Tone, options?: {
    tip?: string;
    icon?: IconName;
    mono?: boolean;
    outline?: boolean;
    onClick?: () => void;
    testid?: string;
}): VElement;
export declare function badge(value: number | string, tone?: "grey" | "red" | "amber" | "accent" | "green"): VElement;
export declare function kbd(keys: string): VElement;
/** Keyboard combo `⌘ K` → two keycaps. */
export declare function keys(combo: string): VElement;
export declare function spinner(): VElement;
export interface StatOptions {
    label: string;
    value: Child;
    unit?: string;
    foot?: Child;
    tone?: "green" | "amber" | "red" | "accent";
    tip?: string;
    onClick?: () => void;
    icon?: IconName;
    spark?: VNode | null;
    testid?: string;
}
/** One headline number. Clickable stats navigate to the view that explains them. */
export declare function stat(options: StatOptions): VElement;
export declare function statGrid(...stats: Child[]): VElement;
export declare function meter(fraction: number, tone?: "green" | "amber" | "red" | "cyan"): VElement;
export declare function emptyState(options: {
    icon?: IconName;
    title: string;
    body?: Child;
    actions?: Child[];
    testid?: string;
}): VElement;
export declare function note(tone: "info" | "warn" | "error" | "good" | "accent" | "plain", body: Child, options?: {
    icon?: IconName;
    testid?: string;
    actions?: Child;
}): VElement;
export declare function kv(rows: ReadonlyArray<readonly [string, Child] | null | false>): VElement;
export declare function card(options: {
    title?: Child;
    icon?: IconName;
    sub?: Child;
    actions?: Child[];
    body: Child;
    flush?: boolean;
    testid?: string;
    className?: string;
}): VElement;
export declare function section(title: Child, body: Child, options?: {
    actions?: Child[];
    testid?: string;
    icon?: IconName;
}): VElement;
/** The strip at the top of a view. */
export declare function viewbar(...children: Child[]): VElement;
export declare function subbar(...children: Child[]): VElement;
export declare function spacer(): VElement;
export declare function vsep(): VElement;
export declare function tip(text: string, kbdHint?: string): Props;
/** A tiny line chart. `values` oldest first. */
export declare function sparkline(values: ReadonlyArray<number>, options?: {
    width?: number;
    height?: number;
    color?: string;
    fill?: boolean;
    max?: number;
}): VElement;
/** A tiny bar chart. */
export declare function microBars(values: ReadonlyArray<number>, options?: {
    width?: number;
    height?: number;
    color?: string;
    highlight?: (v: number) => string | null;
}): VElement;
/** A score ring (0–100), Lighthouse-style. */
export declare function scoreRing(score: number | null, options?: {
    size?: number;
    label?: string;
}): VElement;
export declare function fmtMs(n: number | undefined | null): string;
export declare function fmtBytes(n: number | undefined | null): string;
export declare function fmtCount(n: number): string;
export declare function fmtPct(fraction: number, digits?: number): string;
export declare function fmtClock(epochMs: number): string;
/** "3s ago", "2m ago" — relative to `now`. */
export declare function fmtAgo(ms: number, now: number): string;
/** Shorten from the middle — URLs and keys carry their meaning at both ends. */
export declare function truncateMiddle(text: string, limit?: number): string;
export declare function plural(n: number, one: string, many?: string): string;
/**
 * Plain text with `backtick` spans rendered as inline code — audit messages
 * are written that way. An unmatched backtick stays literal.
 */
export declare function richText(text: string): Child[];
/** Highlight `query` inside `text` (case-insensitive), for search results. */
export declare function highlightMatch(text: string, query: string): Child;
/**
 * Copy to the clipboard, falling back to a hidden textarea. The panel runs in an
 * arbitrary page, so the async Clipboard API may be missing (insecure context)
 * or refused (no permission) — a copy button that silently does nothing then
 * is worse than one that uses the older command.
 */
export declare function copyText(text: string): Promise<boolean>;
/** Offer `text` as a download. The URL is revoked later: some browsers cancel a download revoked in the same task. */
export declare function downloadText(filename: string, text: string, mime?: string): void;
