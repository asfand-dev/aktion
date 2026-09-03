/**
 * `Util` — global helper namespace exposed to Aktion programs.
 *
 * These are pure data transformations available everywhere as
 * `Util.<method>(...)`. They replace the former `@-builtin` catalog
 * (`@Count`, `@Filter`, `@Format`, …) which was removed.
 *
 * The namespace is intentionally open: add methods here and they
 * become available to authors without any other wiring. Pair with
 * documentation in `src/prompt/generator.ts` so the LLM-facing prompt
 * teaches the new entry.
 */
export declare function safeRegexTest(pattern: string, subject: string): boolean;
export declare const Util: {
    readonly count: (arr: unknown) => number;
    readonly sum: (arr: unknown) => number;
    readonly avg: (arr: unknown) => number;
    readonly min: (arr: unknown) => number;
    readonly max: (arr: unknown) => number;
    readonly first: (arr: unknown) => unknown;
    readonly last: (arr: unknown) => unknown;
    readonly filter: (arr: unknown, field?: string, op?: string, value?: unknown) => unknown[];
    readonly find: (arr: unknown, field?: string, op?: string, value?: unknown) => unknown;
    readonly sort: (arr: unknown, field?: string, direction?: "asc" | "desc") => unknown[];
    readonly groupBy: (arr: unknown, field?: string) => Record<string, unknown[]>;
    readonly slice: (arr: unknown, start?: number, end?: number) => unknown[];
    readonly unique: (arr: unknown, field?: string) => unknown[];
    readonly reverse: (arr: unknown) => unknown[];
    readonly range: (start: number, end: number, step?: number) => number[];
    readonly repeat: <T>(value: T, n: number) => T[];
    readonly pick: (obj: unknown, keys: unknown) => Record<string, unknown>;
    readonly omit: (obj: unknown, keys: unknown) => Record<string, unknown>;
    readonly chunk: (arr: unknown, size: number) => unknown[][];
    readonly flatten: (arr: unknown, depth?: number) => unknown[];
    readonly zip: (...arrays: unknown[]) => unknown[][];
    readonly partition: (arr: unknown, field?: string, op?: string, value?: unknown) => [unknown[], unknown[]];
    readonly keyBy: (arr: unknown, field?: string) => Record<string, unknown>;
    readonly cloneDeep: <T>(value: T) => T;
    readonly merge: (target: unknown, ...sources: unknown[]) => Record<string, unknown>;
    /**
     * Locale-aware number formatter. Modes: `"number"` (default),
     * `"currency"`, `"percent"`, `"compact"`. Options object:
     * `{ currency?, locale?, decimals? }`. Legacy positional form
     * `Util.format(v, "currency", "USD", "en-US")` is also accepted.
     */
    readonly format: (value: unknown, mode?: string, options?: unknown, fourth?: unknown) => string;
    /**
     * Format a date. Second argument is either a moment-like pattern
     * (`"MMM D"`, `"YYYY-MM-DD"`) or one of: `"relative"`, `"date"`,
     * `"time"`, `"datetime"`, `"iso"`.
     */
    readonly formatDate: (value: unknown, format?: string) => string;
    readonly plural: (count: unknown, singular: unknown, plural?: unknown) => string;
    readonly capitalize: (text: unknown) => string;
    readonly lowercase: (text: unknown) => string;
    readonly uppercase: (text: unknown) => string;
    readonly titlecase: (text: unknown) => string;
    readonly case: (text: unknown, kind?: "camel" | "snake" | "kebab" | "pascal") => string;
    readonly now: () => number;
    readonly today: () => string;
    readonly addDays: (date: unknown, days: unknown) => string;
    readonly addHours: (date: unknown, hours: unknown) => string;
    readonly diffDays: (start: unknown, end: unknown) => number;
    readonly startOfWeek: (date: unknown) => string;
    readonly endOfMonth: (date: unknown) => string;
    readonly join: (arr: unknown, sep?: string) => string;
    readonly split: (text: unknown, sep?: string) => string[];
    readonly trim: (text: unknown) => string;
    readonly replace: (text: unknown, search: unknown, replacement?: unknown) => string;
    readonly substring: (text: unknown, start: unknown, end?: unknown) => string;
    readonly startsWith: (text: unknown, prefix: unknown) => boolean;
    readonly endsWith: (text: unknown, suffix: unknown) => boolean;
    readonly contains: (text: unknown, needle: unknown) => boolean;
    readonly match: (text: unknown, pattern: unknown) => boolean;
    readonly round: (value: unknown, decimals?: number) => number;
    readonly floor: (value: unknown) => number;
    readonly ceil: (value: unknown) => number;
    readonly abs: (value: unknown) => number;
    readonly clamp: (value: unknown, min: unknown, max: unknown) => number;
    readonly pow: (base: unknown, exp: unknown) => number;
    readonly sqrt: (value: unknown) => number;
    readonly random: () => number;
    readonly log: (value: unknown) => number;
    readonly slugify: (text: unknown) => string;
    readonly truncate: (text: unknown, length?: unknown, ellipsis?: string) => string;
    readonly initials: (name: unknown, max?: unknown) => string;
    readonly currency: (value: unknown, code?: string, locale?: string) => string;
    readonly percent: (value: unknown, decimals?: unknown) => string;
    readonly bytes: (value: unknown) => string;
    readonly relativeTime: (value: unknown) => string;
    /**
     * Copy text to the clipboard. Resolves `true` only once the async Clipboard
     * API write actually succeeds (permission can deny it), `false` otherwise.
     * `await $util.copy(x)` in an action; plain truthy checks keep working.
     */
    readonly copy: (text: unknown) => Promise<boolean>;
    /** Await a pause: `await $util.sleep(300)`. Capped at 60s. */
    readonly sleep: (ms?: unknown) => Promise<void>;
    readonly uuid: () => string;
    /** Wrap a function so it only fires `wait` ms after the last call. */
    readonly debounceFn: (fn: unknown, wait?: unknown) => ((...args: unknown[]) => void);
    /**
     * Wrap a function so it fires at most once per `wait` ms. Leading edge
     * fires immediately; calls landing inside the window schedule one trailing
     * fire with the latest arguments, so the final value is never dropped.
     */
    readonly throttleFn: (fn: unknown, wait?: unknown) => ((...args: unknown[]) => void);
    /** Trigger device haptics. `pattern` is ms or an array of on/off ms. */
    readonly vibrate: (pattern?: unknown) => boolean;
    /** Native share sheet. `data` = { title?, text?, url? }. Returns a promise. */
    readonly share: (data: unknown) => Promise<boolean>;
    /** Read text from the clipboard (async). Returns "" when unavailable/denied. */
    readonly readClipboard: () => Promise<string>;
    /**
     * Read a file the user picked, and resolve with its contents.
     *
     * `FileUpload` is the only way a program receives a file, and its own note
     * says why the file cannot travel through a `$variable`: a `File` is not
     * serialisable, so it reaches the program as a callback argument and nowhere
     * else. Until now there was no vetted way to then READ it — the only route was
     * reaching for `FileReader` or `document` as a host global, which the `"safe"`
     * global-access policy exists to forbid (`SAFE_HOST_GLOBALS` grants the inert
     * `Blob`/`File` containers but no reader). So a program that wanted the
     * contents of a picked `.pub`, `.csv` or `.json` had to be run under the
     * unrestricted `"all"` policy. This is that read, as a capability the runtime
     * grants rather than one the program smuggles in.
     *
     *   FileUpload("key-file", {accept: ".pub,text/plain", action: onPick})
     *   function onPick(files) {
     *     $util.readFile(files).then(text => { $keyBody = text.trim() })
     *   }
     *
     * `file` may be a single `File`/`Blob`, or the whole pick as `FileUpload`
     * hands it over (a `FileList` or an array) — in which case the FIRST readable
     * entry is used. Loop the pick yourself for `multiple`.
     *
     * `options.as` selects the representation:
     *   `"text"`     (default) the decoded UTF-8 text
     *   `"dataUrl"`  a `data:<mime>;base64,…` URI, for an inline preview
     *   `"base64"`   that URI's payload alone, for a JSON body
     *
     * `options.maxSize` rejects a larger file without reading it, in bytes.
     * `FileUpload`'s own `maxSize` already screens the pick, so this is for the
     * programmatic caller that did not come through the component.
     *
     * NEVER REJECTS. It resolves `""` for every failure — no file, an unreadable
     * one, an over-size one, a host with no reader at all — because `await` in
     * Aktion does not suspend, so an author writes `.then(...)` and a rejection
     * would surface as an unhandled promise instead of at the call site. An empty
     * string is also the honest answer: the program has no contents to work with.
     * Branch on the result being empty, not on a `.catch`.
     */
    readonly readFile: (file: unknown, options?: unknown) => Promise<string>;
    /** Current geolocation as a promise of { lat, lng, accuracy } (or null). */
    readonly geolocate: (options?: unknown) => Promise<{
        lat: number;
        lng: number;
        accuracy: number;
    } | null>;
    /** `true` when the device is currently online. */
    readonly isOnline: () => boolean;
    /** Best-effort device class from the user agent: "mobile" | "tablet" | "desktop". */
    readonly deviceType: () => string;
    /**
     * Run a PURE function off the main thread in a Web Worker, resolving with its
     * result. `fn` is serialised via `toString()`, so it must not close over
     * outer variables (pass everything it needs as arguments). Falls back to
     * running inline (still async) when Workers aren't available.
     *   $util.worker((n) => heavyCompute(n), 1000).then(r => $result = r)
     */
    readonly worker: (fn: unknown, ...args: unknown[]) => Promise<unknown>;
    /** Register a service worker. Resolves true on success, false otherwise. */
    readonly registerServiceWorker: (url: unknown, scope?: unknown) => Promise<boolean>;
    /**
     * Build a sanitised Web App Manifest object from a config (XII.2). Use it to
     * inline a manifest (`<link rel="manifest" href="data:...">`) or write one at
     * build time. Unknown/unsafe keys are dropped.
     */
    readonly webManifest: (config: unknown) => Record<string, unknown>;
    /**
     * Detect the native shell the app is running inside (Capacitor / Cordova /
     * Tauri / Electron / React Native WebView), or "web" when it's a plain
     * browser. Lets a program branch on the host (e.g. hide a download button in
     * a native shell, or call a bridge when present).
     */
    readonly nativeShell: () => string;
    /** True when running inside any native shell (not a plain browser). */
    readonly isNativeApp: () => boolean;
};
export type UtilNamespace = typeof Util;
