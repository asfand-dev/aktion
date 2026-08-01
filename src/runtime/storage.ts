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
 * Try / catch wrapper used by every storage operation. Returns the
 * fallback when the underlying API throws (e.g. SecurityError in private
 * browsing modes). Keeps the storage surface side-effect free in tests
 * even when `localStorage` is missing.
 */
const safeRun = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Serialise a value the same way every namespace does (strings pass through). */
const serialise = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** Parse a string back to its original shape (JSON when possible). */
const deserialise = (raw: string | null): unknown => {
  if (raw === null || raw === "") return raw;
  // Numbers/booleans/null/objects are JSON-encoded by `set`; plain strings
  // fail JSON.parse and fall back to the raw value (so legacy keys keep
  // working even when authors wrote raw strings directly).
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const createWebStorageNamespace = (
  getBackend: () => Storage | null,
): StorageNamespace => ({
  set: (key, value) =>
    safeRun(() => {
      const backend = getBackend();
      if (!backend) return false;
      backend.setItem(String(key), serialise(value));
      return true;
    }, false),
  get: (key) =>
    safeRun(() => {
      const backend = getBackend();
      if (!backend) return null;
      return deserialise(backend.getItem(String(key)));
    }, null),
  remove: (key) =>
    safeRun(() => {
      const backend = getBackend();
      if (!backend) return false;
      backend.removeItem(String(key));
      return true;
    }, false),
  clear: () =>
    safeRun(() => {
      const backend = getBackend();
      if (!backend) return false;
      backend.clear();
      return true;
    }, false),
});

const getLocalBackend = (): Storage | null => {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as { localStorage?: Storage };
  return g.localStorage ?? null;
};

const getSessionBackend = (): Storage | null => {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as { sessionStorage?: Storage };
  return g.sessionStorage ?? null;
};

const getDocument = (): Document | null => {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as { document?: Document };
  return g.document ?? null;
};

/** Format a cookie expiry date — accepts days, Date, or ISO string. */
const formatExpires = (value: CookieOptions["expires"]): string | null => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toUTCString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toUTCString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date();
    date.setTime(date.getTime() + value * 86_400_000);
    return date.toUTCString();
  }
  return null;
};

/** Build the trailing attribute portion of a `Set-Cookie` string. */
/**
 * A cookie `Path` attribute value. `;` and `,` would terminate the attribute
 * and let a caller append attributes of their own choosing (`Domain=`,
 * `SameSite=None`, …) — the cookie name and value are percent-encoded, but the
 * attributes were interpolated raw. Since the DSL is untrusted, they are
 * validated instead.
 */
const COOKIE_PATH_RE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;

/** A cookie `Domain` attribute value: a hostname, optionally leading-dotted. */
const COOKIE_DOMAIN_RE = /^\.?[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;

const buildCookieAttributes = (options: CookieOptions = {}): string => {
  const parts: string[] = [];
  const expires = formatExpires(options.expires);
  if (expires) parts.push(`expires=${expires}`);
  if (typeof options.maxAge === "number" && Number.isFinite(options.maxAge)) {
    parts.push(`max-age=${Math.floor(options.maxAge)}`);
  }
  const path = options.path ?? "/";
  parts.push(`path=${COOKIE_PATH_RE.test(path) ? path : "/"}`);
  if (options.domain && COOKIE_DOMAIN_RE.test(options.domain) && options.domain.length <= 253) {
    parts.push(`domain=${options.domain}`);
  }
  if (options.secure) parts.push("secure");
  // Always emit SameSite. Omitting it leaves the cookie's cross-site behaviour
  // to browser defaults, which SonarQube / CodeQL flag and which differ between
  // engines; `Lax` matches what modern browsers apply anyway.
  const sameSite = options.sameSite
    ? options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1).toLowerCase()
    : "Lax";
  parts.push(`samesite=${["Strict", "Lax", "None"].includes(sameSite) ? sameSite : "Lax"}`);
  return parts.length === 0 ? "" : `; ${parts.join("; ")}`;
};

const readAllCookies = (): Record<string, string> => {
  const doc = getDocument();
  if (!doc) return {};
  const out: Record<string, string> = {};
  const raw = doc.cookie ?? "";
  if (!raw) return out;
  // `decodeURIComponent` throws on a malformed escape (`%`, `%zz`). Cookies
  // set by the host app or a third-party script share this jar, so one
  // undecodable cookie must not make every cookie read fail — decode per
  // entry and fall back to the raw text.
  const decode = (input: string): string => {
    try { return decodeURIComponent(input); } catch { return input; }
  };
  for (const pair of raw.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      out[decode(trimmed)] = "";
      continue;
    }
    const key = decode(trimmed.slice(0, eq));
    // A cookie name that reaches a prototype key would make `out.__proto__`
    // assignment retarget the object's prototype instead of adding an entry.
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = decode(trimmed.slice(eq + 1));
  }
  return out;
};

const cookies: StorageNamespace = {
  set: (key, value, options) =>
    safeRun(() => {
      const doc = getDocument();
      if (!doc) return false;
      const encodedKey = encodeURIComponent(String(key));
      const encodedValue = encodeURIComponent(serialise(value));
      doc.cookie = `${encodedKey}=${encodedValue}${buildCookieAttributes(options)}`;
      return true;
    }, false),
  get: (key) =>
    safeRun(() => {
      const all = readAllCookies();
      const raw = all[String(key)];
      return raw === undefined ? null : deserialise(raw);
    }, null),
  remove: (key, options) =>
    safeRun(() => {
      const doc = getDocument();
      if (!doc) return false;
      const encodedKey = encodeURIComponent(String(key));
      const opts: CookieOptions = {
        ...options,
        expires: new Date(0),
        maxAge: 0,
      };
      doc.cookie = `${encodedKey}=${buildCookieAttributes(opts)}`;
      return true;
    }, false),
  clear: () =>
    safeRun(() => {
      const doc = getDocument();
      if (!doc) return false;
      const all = readAllCookies();
      for (const key of Object.keys(all)) {
        const encodedKey = encodeURIComponent(key);
        doc.cookie = `${encodedKey}=${buildCookieAttributes({ expires: new Date(0), maxAge: 0 })}`;
      }
      return true;
    }, false),
};

const local = createWebStorageNamespace(getLocalBackend);
const session = createWebStorageNamespace(getSessionBackend);

/**
 * The `storage` global exposed to Aktion programs. Default
 * methods (`storage.set` / `storage.get` / `storage.remove` /
 * `storage.clear`) delegate to `localStorage`; nested namespaces select
 * a specific backend.
 */
export const storage: StorageRoot = {
  set: local.set,
  get: local.get,
  remove: local.remove,
  clear: local.clear,
  local,
  session,
  cookies,
};
