/**
 * Browser storage namespace for Aktion.
 *
 * Exposes a single `storage` global that wraps three browser storage
 * mechanisms — `localStorage`, `sessionStorage`, and document cookies —
 * behind a uniform `set` / `get` / `remove` / `clear` API. Authors can
 * reach for the default `localStorage` directly (`storage.set("k", "v")`)
 * or namespace through `storage.local`, `storage.session`, or
 * `storage.cookies`.
 *
 * Values that aren't strings round-trip through `JSON.stringify` /
 * `JSON.parse`, so authors can persist arrays and objects without manual
 * serialisation. Failures (quota exceeded, disabled storage, malformed
 * JSON) are swallowed and reported via the return values rather than
 * thrown — keeps streaming scripts robust in privacy / SSR contexts
 * where the underlying APIs may be missing.
 */
/** Options accepted by `storage.cookies.set` (mirrors the standard cookie attributes). */
export interface CookieOptions {
    /** Days until expiry, or a Date instance for an absolute expiry. */
    expires?: number | Date | string;
    /** `Max-Age` in seconds — overrides `expires` when both are set. */
    maxAge?: number;
    /** Restrict cookie to the given path (defaults to `/`). */
    path?: string;
    /** Restrict cookie to the given domain. */
    domain?: string;
    /** Only send over HTTPS. */
    secure?: boolean;
    /** `SameSite` policy — `"Strict"`, `"Lax"`, or `"None"`. */
    sameSite?: "Strict" | "Lax" | "None" | "strict" | "lax" | "none";
}
export interface StorageNamespace {
    set: (key: string, value: unknown, options?: CookieOptions) => boolean;
    get: (key: string) => unknown;
    remove: (key: string, options?: CookieOptions) => boolean;
    clear: () => boolean;
}
export interface StorageRoot extends StorageNamespace {
    local: StorageNamespace;
    session: StorageNamespace;
    cookies: StorageNamespace;
}
/**
 * The `storage` global exposed to Aktion programs. Default
 * methods (`storage.set` / `storage.get` / `storage.remove` /
 * `storage.clear`) delegate to `localStorage`; nested namespaces select
 * a specific backend.
 */
export declare const storage: StorageRoot;
