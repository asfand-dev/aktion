/**
 * Internal DOM helpers shared by primitives (`feedback.ts`) and pattern
 * composites (`patterns.ts`). Not exported from the package barrel — these
 * are implementation details that keep avatar/initials rendering consistent
 * across every component that needs them.
 */
export type AvatarSize = "sm" | "md" | "lg" | "xl";
/**
 * The slice of `RenderHelpers` an avatar needs. Declared locally (like
 * `DisposerHelpers` below) so this module stays independent of the public
 * type surface. Required, not optional: a caller without it silently loses
 * the error latch, which is the whole point of the parameter.
 */
export interface InstanceStateHelpers {
    useInstanceState: <T>(key: string, initialValue: T) => {
        get: () => T;
        set: (value: T) => void;
    };
}
/** Render an `<rui-avatar>` matching the canonical Avatar primitive. */
export declare function renderAvatar(src: string, name: string, size: AvatarSize, helpers: InstanceStateHelpers): HTMLElement;
/** Two-letter initials, falling back to `?` for empty input. */
export declare function initialsFor(name: string): string;
/**
 * Shared outside-click + Escape dismissal for popovers, dropdowns, comboboxes.
 *
 * Previous implementations leaked listeners in three subtle ways:
 *
 *   1. Re-opening the floater (trigger clicked while still open) installed a
 *      second listener pair without removing the first.
 *   2. Closing via any code path *other than* an outside-click / Escape (e.g.
 *      clicking the trigger again, selecting an item, programmatic close)
 *      left the listeners attached, holding references to detached DOM.
 *   3. The host node being removed from the DOM (LLM produced a new response,
 *      route changed, parent re-rendered) silently kept the listeners on the
 *      shadow root forever.
 *
 * This helper installs listeners exactly once per open, exposes a single
 * `dispose()` so every close path can clean up, and observes the host so we
 * auto-dispose when the floater is unmounted.
 *
 * `key` dedupes re-opens across element identities. The morph reconciler
 * discards the previous render's panel, so a re-open usually arrives with a
 * *new* `liveRoot` that the element-keyed registry can never match — which is
 * how a closed-and-reopened floater ended up with a second listener pair on
 * the shared shadow root. When the registration held under `key` is no longer
 * connected it is therefore disposed before the new pair is installed. Two
 * roots that are both still on screen under one `key` are two instances of the
 * same component (the keys callers pass are per-component, not per-instance),
 * so that registration is left alone.
 *
 * Escape is handled topmost-first. Every registration listens on the same
 * shared shadow root, and capture at that root is the only phase that runs
 * before a dialog's own bubble-phase Escape handler — so without a stack one
 * keystroke closed the combobox, the popover around it AND the enclosing
 * dialog. The innermost open floater consumes the keystroke; the next Escape
 * reaches the layer below, which is the contract users expect: one press peels
 * exactly one layer.
 */
export interface DismissHandle {
    dispose: () => void;
}
interface DismissOptions {
    liveRoot: HTMLElement;
    onDismiss: () => void;
    /** Stable per-instance identifier, used to deduplicate re-opens. */
    key?: string;
}
export declare function installDismissListeners(opts: DismissOptions): DismissHandle;
/** Trigger an immediate dispose for a live root if one is registered. */
export declare function disposeDismissListeners(liveRoot: HTMLElement | null | undefined): void;
/**
 * Keyboard handler for state-bound dialogs: Escape closes, Tab cycles within
 * the panel (focus trap). Assign to `root.onkeydown` (a property, so the
 * morph keeps the closure fresh); `close` receives the live origin element.
 */
export declare function dialogKeydownHandler(panelSelector: string, close: (origin: HTMLElement) => void): (event: KeyboardEvent) => void;
interface DisposerHelpers {
    registerDisposer: (cleanup: () => void, key?: string) => void;
}
/**
 * Watch a state-bound dialog's `data-open` attribute on the LIVE node and
 * manage focus: on open, move focus to the panel's first focusable element
 * (remembering what had it); on close, restore it. Installed once per
 * instance — re-render snapshots that the morph discards skip themselves via
 * the `isConnected` check, and the observer is torn down through a keyed
 * disposer when the dialog unmounts.
 */
export declare function wireDialogFocus(root: HTMLElement, panelSelector: string, helpers: DisposerHelpers): void;
export declare function pickIconForLabel(label: string | null | undefined): string | null;
export declare function pickIconForTone(tone: string | null | undefined): string | null;
/**
 * Build a deterministic DiceBear avatar URL for a person name.
 *
 * Used as the fallback when the LLM passes a name but omits `src`.
 * `style` defaults to `initials` which is bulletproof (no network face-art),
 * but callers can pass `shapes`, `avataaars`, etc. for fancier looks.
 */
export declare function dicebearUrlFor(name: string, style?: string): string;
export {};
