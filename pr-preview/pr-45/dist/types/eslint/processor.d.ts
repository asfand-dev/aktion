import { Linter } from 'eslint';
/**
 * ESLint processor letting a consumer's own ESLint installation lint (and
 * autofix) `.aktion` DSL files using a real JS/TS parser and their own rule
 * set — not a bespoke reimplementation of any rule.
 *
 * A `.aktion` file can be written to parse as JS/TS. The one construct this
 * processor rewrites is a bare top-level `export IDENTIFIER = …` with no
 * declaration keyword, a syntax error in JS/TS (see `scan.ts`'s header for the
 * full grammar cross-check); anything else a JS parser rejects is reported by
 * the consumer's own parser. `preprocess` rewrites every such occurrence to `export const IDENTIFIER = …` — genuinely valid
 * JS/TS — and hands the transformed text to whatever parser the consumer has
 * configured for the virtual `.ts` block (see this module's own README
 * section / `rules.ts` for the recommended wiring). `postprocess` then remaps
 * every reported message's position, and any autofix's `fix.range`, back to
 * the ORIGINAL file's coordinates via `remap.ts` — getting this wrong would
 * mean `--fix` silently corrupts the real `.aktion` file at the wrong byte
 * offset, which is why `remap.ts` has its own dedicated, ESLint-independent
 * unit tests. A fix whose range overlaps the processor's own injected text is
 * dropped entirely rather than remapped — see `remapMessage` and
 * `rangeOverlapsInsertion`.
 */
export declare const aktionProcessor: Linter.Processor;
