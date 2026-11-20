import { Child, VNode } from '../core/vdom.js';
/** The one inline edit in progress, panel-wide. */
export interface EditState {
    scope: string;
    path: string;
    draft: string;
    /** `leaf` edits a value; `key` names a new object key. */
    mode: "leaf" | "key";
}
export interface ValueRow {
    path: string;
    key: string;
    depth: number;
    value: unknown;
    type: string;
    expandable: boolean;
    open: boolean;
    isIndex: boolean;
    /** Synthetic rows: "… N more", "+ add". */
    special?: "more" | "add";
    /** For `more` rows: how many children are hidden. */
    hidden?: number;
    /** For `more`/`add` rows: the container path. */
    container?: string;
    containerType?: string;
}
export interface ValueTreeOptions {
    /** Scope id, unique per tree on screen (`state`, `props:<key>`). */
    scope: string;
    /** Root value. Its children are the top-level rows. */
    value: unknown;
    expanded: Set<string>;
    onToggle: (path: string) => void;
    rowHeight: number;
    /** May this path be written? Leaves AND containers are asked. */
    editable?: (path: string, depth: number) => boolean;
    onEdit?: (path: string, value: unknown) => void;
    /** Extra per-row content (heat bars, chips, buttons). */
    decorate?: (row: ValueRow) => Child;
    /** Row → extra classes (e.g. a flash class). */
    rowClass?: (row: ValueRow) => string;
    /** Case-insensitive filter on top-level keys and leaf values. */
    filter?: string;
    editing: EditState | null;
    setEditing: (edit: EditState | null) => void;
    /** Replace a container with JSON the user typed (opens the shell dialog). */
    editJson?: (path: string, value: unknown) => void;
    selected?: string | null;
    onSelect?: (path: string | null) => void;
    onCopy?: (text: string, what: string) => void;
    /** Children shown per container before a "show more" row. */
    pageSize?: number;
    /** Per-container expanded page counts (caller-owned so it survives renders). */
    pages?: Map<string, number>;
    onMore?: (container: string) => void;
    testid?: string;
    empty?: Child;
    /** Render inline (no virtualisation) — for short values inside a card. */
    inline?: boolean;
    version?: unknown;
}
export declare function valueType(value: unknown): string;
/** Children of a value as `[key, value]`, never throwing on exotic objects. */
export declare function entriesOf(value: unknown): Array<[string, unknown]>;
export declare function flattenValue(value: unknown, options: {
    expanded: Set<string>;
    filter?: string;
    pageSize?: number;
    pages?: Map<string, number>;
    editable?: (path: string, depth: number) => boolean;
}): ValueRow[];
export declare function previewValue(value: unknown): string;
/** Text a leaf editor opens with — strings unquoted, everything else as JSON. */
export declare function editSeed(value: unknown): string;
/**
 * What a leaf edit will write. A field that held a string stays a string even
 * when the new text looks like JSON — typing `42` into a name field means the
 * text "42", not the number. Anything else goes through the shared parser.
 */
export declare function parseLeafEdit(draft: string, original: unknown): unknown;
/** Replace `path` (dotted, relative to `root`) with `next`, immutably. */
export declare function setAtPath(root: unknown, segments: ReadonlyArray<string>, next: unknown): unknown;
/** Container minus one key/index. */
export declare function withoutKey(container: unknown, key: string): unknown;
export declare function getAtPath(root: unknown, path: string): unknown;
/** The explorer. Virtualised unless `inline`. */
export declare function valueTree(options: ValueTreeOptions): VNode;
