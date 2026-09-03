import { DevtoolsValue } from './protocol.js';
/**
 * Classify a value into the type names the protocol uses. Aktion's own live
 * bags get their own names so the inspector can label them instead of
 * printing `{ state, data, error, … }`.
 */
export declare function valueKind(value: unknown): string;
/** Cut `text` to `limit` characters, appending an ellipsis when it was longer. */
export declare function truncate(text: string, limit?: number): string;
/**
 * One-line display form of a value — the string the inspector shows in a
 * collapsed row. Never throws: a getter that explodes degrades to `<error>`.
 */
export declare function previewOf(value: unknown): string;
/**
 * Pretty JSON text for a value, or `null` when it is not worth (or safe to)
 * serialise. `null` is the signal an inspector uses to render a value
 * read-only.
 */
export declare function toJsonText(value: unknown, indent?: number): string | null;
/**
 * Package a value for the wire. `json` is attached only for values an editor
 * could legitimately write back, so the inspector never offers an edit field
 * whose result it cannot apply.
 */
export declare function toDevtoolsValue(value: unknown): DevtoolsValue;
/**
 * Parse text typed into an inspector field. JSON first (`42`, `true`,
 * `"x"`, `null`, `[1,2]`, `{"a":1}`) so structured edits work, then a bare
 * string — because `Ada` is what a user types into a name field, and
 * rejecting it as invalid JSON would be pedantic.
 */
export declare function parseEditedValue(raw: string): unknown;
/** Byte-ish length of a body for the network inspector's size column. */
export declare function bodySize(body: unknown): number;
/** Body preview for the network inspector — JSON pretty-printed, capped. */
export declare function bodyPreview(body: unknown, limit?: number): string;
