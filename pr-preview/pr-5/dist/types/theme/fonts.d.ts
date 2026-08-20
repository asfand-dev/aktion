/**
 * Web-font loading for `$theme({ fonts: { import: [...] } })`
 * (suggestions-global I.7).
 *
 * Accepts a short Google-Fonts shorthand list and injects a single
 * `<link rel="stylesheet">` into `document.head` (once per unique URL).
 * Font faces loaded into the document are visible to shadow roots, so the
 * renderer can reference them via the `font` theme tokens.
 *
 * Shorthand:
 *   "Inter:400,700"      → family Inter, weights 400 & 700
 *   "JetBrains Mono"     → family JetBrains Mono, default weight
 *   "Inter:400,500i,700" → `i` suffix marks an italic weight
 *
 * Only well-formed family names (letters, digits, spaces) and numeric
 * weights are accepted; anything else is dropped so a hostile value can't
 * smuggle a different origin or CSS payload into the page.
 */
/**
 * Build a sanitised Google Fonts CSS2 URL from a shorthand list, or "" when
 * no valid family is present.
 */
export declare function buildFontUrl(list: unknown): string;
/**
 * Inject the web fonts named in `import` into `document.head` (idempotent).
 * `record` is the `fonts` group from a `$theme({ fonts: {...} })` call; only
 * its `import` array is used here (the `family`/`familyHeading` tokens are
 * applied separately by the normal token flow). Returns the injected URL or "".
 */
export declare function loadFonts(record: unknown): string;
/**
 * Load the web fonts a built-in theme needs, if it declares any.
 *
 * Called when a theme is selected by name, so `theme="corporate"` renders in
 * this Brand UI typefaces rather than falling back to `system-ui`. Idempotent —
 * `loadFonts` de-duplicates by URL.
 */
export declare function loadBuiltInThemeFonts(name: unknown): void;
