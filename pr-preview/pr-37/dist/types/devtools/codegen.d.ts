/**
 * Aktion DevTools — literals for generated code.
 *
 * The recorder writes tests and the Network view copies requests as `fetch()`
 * calls: text that becomes JavaScript, built from values the app produced (a
 * typed string, a URL, a response). `JSON.stringify` makes a *valid* literal,
 * not an *inert* one: a recorded value such as `</script><!--` ends or
 * corrupts any `<script>` the snippet is pasted into, and U+2028 / U+2029 come
 * out raw, which engines before ES2019 read as line terminators in a string.
 *
 * Every literal therefore goes through one extra pass that writes the risky
 * characters as `\uXXXX` escapes: `<`, which opens every tag, comment, and
 * CDATA section; `>` only where it closes one (`-->`, `--!>`, `]]>`), so the
 * child combinator in a generated CSS locator stays readable; and the two
 * separators. All of them only occur inside JSON strings, where the escape is
 * valid, so the value is identical once evaluated.
 */
/** A JavaScript string literal for `value`, safe to embed in generated code. */
export declare function jsString(value: string): string;
/**
 * A JavaScript expression for a JSON-serialisable value (`space` as for
 * `JSON.stringify`), or `undefined` for a value that has no JSON form — a
 * function, a symbol, a cyclic object.
 */
export declare function jsLiteral(value: unknown, space?: number): string;
