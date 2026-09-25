/**
 * Rich-text HTML sanitiser — allow-list based.
 *
 * Used by the two places in the library that need to turn an HTML *string*
 * into DOM: the Markdown renderer (a string we build ourselves) and
 * `RichTextEditor` (a `value` prop, which is fully untrusted — it comes from
 * the DSL, from a bound `$variable`, and therefore from any HTTP/WebSocket
 * response or storage value the program writes into it).
 *
 * Same strategy as `svg-sanitizer.ts`: parse in an **inert document** (no
 * browsing context, so no script runs and no subresource is fetched), walk the
 * tree against an allow-list, then `importNode` the survivors into the live
 * document. Callers append real nodes, so no `innerHTML` assignment ever
 * touches the live DOM.
 */
/**
 * Sanitise an HTML string and return live-document nodes for it. Returns an
 * empty array when the input is empty, oversized, or busts a resource cap.
 */
export declare function sanitiseHtmlToNodes(raw: unknown): Node[];
/**
 * Replace `target`'s children with the sanitised parse of `html`.
 *
 * This is the ONLY way the library turns an HTML string into live DOM. It
 * exists as a named function (rather than a magic `html` attribute key on the
 * generic `el()` helper) so that every such conversion is visible at the call
 * site and to static analysis.
 */
export declare function setSanitisedHtml(target: Element, html: unknown): void;
/**
 * Serialise an element's children back to an HTML string, sanitised.
 *
 * `RichTextEditor` reads `contenteditable` content back out to store it in a
 * `$variable`. Sanitising on the way out matters as much as on the way in: the
 * user can paste arbitrary markup into a `contenteditable`, and an unsanitised
 * read-back would persist it and re-inject it on the next render.
 */
export declare function readSanitisedHtml(target: Element): string;
