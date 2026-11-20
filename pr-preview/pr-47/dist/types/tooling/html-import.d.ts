/**
 * HTML → Aktion importer (suggestions-global XIV.1).
 *
 * A pragmatic codemod that converts a chunk of static HTML into an equivalent
 * Aktion program string, mapping common tags to the closest library component.
 * It is not a 1:1 fidelity tool — it gives authors a running head-start that
 * they then refine. Parsing uses the DOM when available (browsers / jsdom /
 * happy-dom) and falls back to a tiny tag tokenizer in pure-Node contexts.
 *
 *   import { htmlToAktion } from "aktion-runtime/tooling";
 *   const program = htmlToAktion("<section><h1>Hi</h1><p>Body</p></section>");
 *   // → $app(Section([Heading("Hi"), Text("Body")]))
 */
/**
 * Convert an HTML string to an Aktion program. The result is wrapped in
 * `$app(...)`; a single root renders directly, multiple roots become a
 * `Column([...])`.
 */
export declare function htmlToAktion(html: string): string;
