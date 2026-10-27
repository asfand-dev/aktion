import { ComponentLibrary } from '../library/types.js';
import { Position } from './language-service.js';
export interface ParameterInfo {
    label: string;
    documentation?: string;
}
export interface SignatureInfo {
    label: string;
    documentation?: string;
    parameters: ParameterInfo[];
}
export interface SignatureHelp {
    signatures: SignatureInfo[];
    activeSignature: number;
    /**
     * Index into `signatures[activeSignature].parameters`. May equal
     * `parameters.length` (out of range) when no parameter should be
     * highlighted — e.g. the cursor is on a not-yet-matching object key or
     * past the last slot of an all-positional call.
     */
    activeParameter: number;
}
/**
 * Signature help for the call enclosing `position`, or `null` when the cursor
 * is not inside a recognised call.
 */
export declare function getSignatureHelp(source: string, position: Position, library?: ComponentLibrary): SignatureHelp | null;
/** Per-argument shape gathered by the scanner (feeds `chooseNamedBagIndex`). */
interface ScannedArg {
    /** Top-level keys when the argument is an object literal; null otherwise. */
    objectKeys: string[] | null;
}
interface ActiveObjectContext {
    /**
     * The prop key the cursor is on: the key whose value region contains the
     * cursor, or the partial identifier being typed in key position. Empty
     * when the cursor sits before any key (e.g. right after `{`).
     */
    activeKey: string;
}
export interface ActiveCall {
    callee: string;
    /** Zero-based index of the argument the cursor is in. */
    argIndex: number;
    /** Shapes of every argument seen so far (the cursor's one included). */
    args: ScannedArg[];
    /** Set when the cursor is inside an object literal that IS the argument. */
    objectArg: ActiveObjectContext | null;
}
/**
 * Expose the cursor → enclosing-call analysis so other language-service
 * surfaces (completions) can apply the same §19 binding rules without
 * re-implementing the scan.
 */
export declare function analyseCallContext(source: string, position: Position): ActiveCall | null;
export {};
