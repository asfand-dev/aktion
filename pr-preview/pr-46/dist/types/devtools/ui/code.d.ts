import { Widget, Child, VNode } from '../core/vdom.js';
/** One coloured run of text within a line. */
export interface Tok {
    /** Class suffix: `kw` `str` `tpl` `num` `state` `comp` `fn` `com` `punc` `op` `prop` `bool`, or `""`. */
    t: string;
    v: string;
}
/**
 * Tokenise `source` into lines of coloured runs. Never throws and always
 * returns exactly `source.split("\n").length` lines, whatever the input.
 */
export declare function highlightLines(source: string): Tok[][];
/** Render one line's tokens, splitting runs at search-match boundaries so matches keep their colour. */
export declare function renderTokens(tokens: ReadonlyArray<Tok>, search?: string): Child[];
export interface LineMarker {
    severity: "error" | "warn";
    message: string;
}
export interface CodeViewOptions {
    lines: ReadonlyArray<ReadonlyArray<Tok>>;
    markers?: ReadonlyMap<number, LineMarker>;
    /** 1-based. */
    focusLine?: number | null;
    search?: string;
    onLineClick?: (line: number) => void;
    rowHeight?: number;
    testid?: string;
    /** Number shown for the first line (for excerpts). */
    firstLine?: number;
    /** Render every line without virtualisation (short excerpts). */
    inline?: boolean;
    version?: unknown;
    /** Show diagnostic messages at the end of their line. */
    lens?: boolean;
}
/** A read-only, syntax-highlighted code view. */
export declare function codeView(options: CodeViewOptions): VNode;
export interface CodeEditorProps {
    value: string;
    /** Every edit. The editor owns its text; this is a notification. */
    onChange: (text: string) => void;
    /** Ctrl/⌘ + Enter or Ctrl/⌘ + S. */
    onSubmit?: (text: string) => void;
    onCancel?: () => void;
    markers?: ReadonlyMap<number, LineMarker>;
    testid?: string;
    label?: string;
}
/**
 * Overlay editor: a transparent `<textarea>` over a highlighted `<pre>`.
 *
 * The textarea is the real editor — selection, IME, undo, spellcheck-off, and
 * every platform shortcut work because it IS the platform's editor. The layer
 * underneath only paints. Both share one font, one line height, and one
 * padding, and the layer follows the textarea's scroll, so the caret always
 * sits on the character it looks like it sits on.
 */
export declare class CodeEditor extends Widget<CodeEditorProps> {
    private textarea;
    private layer;
    private gutter;
    private painted;
    private framePending;
    mount(): Element;
    update(previous: CodeEditorProps): void;
    unmount(): void;
    focus(): void;
    private schedulePaint;
    private paint;
    private syncScroll;
    private onKeyDown;
}
export declare function codeEditor(props: CodeEditorProps & {
    key?: string;
}): VNode;
