/**
 * Document head management — `$head({...})`.
 *
 * A reactive head manager: calling `$head({ title, meta, og, twitter, link,
 * jsonLd, ... })` sets `document.title`, meta tags, canonical / alternate
 * links, Open Graph + Twitter cards, JSON-LD, and `<html>` attributes. The
 * same resolved head is collected for SSR, so `renderToString` can emit a
 * crawlable `<head>`.
 *
 * Composition with the router: multiple `$head(...)` calls in a single render
 * pass MERGE in call order (a layout sets defaults; the routed page overrides
 * the title / description). To scope a "render pass" without coupling to the
 * renderer, calls accumulate synchronously and commit on a microtask — so a
 * route that does not render this pass contributes nothing (no stale tags),
 * and per-route titles naturally replace the previous route's.
 */

import type { EvaluationContext } from "./evaluator.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------------ *
 * Head safety
 *
 * `$head(...)` is the one runtime API that writes OUTSIDE the shadow DOM,
 * into the host page's `<head>` and `<html>`. Since the DSL is untrusted,
 * every value here is attacker-controlled and the blast radius is the whole
 * host application — so each field is allow-listed rather than filtered.
 * ------------------------------------------------------------------------ */

/**
 * A syntactically valid, inert HTML attribute name. Rejects whitespace and
 * `=`/`/`/quotes, which is what stops an attribute *name* from smuggling a
 * second attribute into the serialised SSR output (`<link a onload=alert(1) b="…">`),
 * and stops `setAttribute` from throwing on the DOM path.
 */
const ATTR_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.:-]*$/;

function isSafeAttrName(name: string): boolean {
  if (!ATTR_NAME_RE.test(name)) return false;
  // Event handlers would run in the host page's context.
  return !/^on/i.test(name);
}

/**
 * `rel` values `<link>` may carry. Metadata and resource *hints* only.
 *
 * Excluded on purpose: `stylesheet` (attacker CSS over the entire host page —
 * clickjacking overlays and attribute-selector exfiltration), `preload` /
 * `modulepreload` / `prefetch` / `prerender` (fetch arbitrary origins, and
 * `as=script` primes a script load), and `import` (legacy HTML imports).
 * Web fonts have their own vetted path: `$theme({ fonts: { import: [...] } })`.
 */
const SAFE_LINK_RELS = new Set([
  "canonical", "alternate", "prev", "next", "author", "license", "help",
  "icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed",
  "mask-icon", "manifest", "search", "dns-prefetch", "preconnect", "me",
]);

/**
 * `<html>` attributes `$head({ htmlAttrs })` may set. Localisation and
 * styling hooks only — notably NOT `style`, which would let a program paint a
 * full-viewport overlay over the host page (clickjacking) and beacon out via
 * `background-image`.
 */
const SAFE_HTML_ATTRS = new Set(["lang", "dir", "class", "translate", "id"]);

/**
 * Sanitise a `<base href>`.
 *
 * `<base>` rewrites how the *host page* resolves every relative URL it has —
 * script `src`, form `action`, `fetch("/api/…")`. An absolute or
 * protocol-relative base therefore hands the whole application to another
 * origin, so only same-origin relative paths are accepted.
 */
function sanitiseBaseHref(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("//")) return "";
  // Any scheme at all (including `javascript:` and `https:`) is out of scope
  // for a base path.
  if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(cleaned)) return "";
  if (/[\\<>"']/.test(cleaned)) return "";
  return cleaned;
}

/**
 * Sanitise a URL destined for a `<link href>` in the host head. Same rules as
 * the component-level `href` chokepoint: fragments / relative paths, or an
 * absolute `http(s)` URL.
 */
function sanitiseLinkHref(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!cleaned || cleaned.startsWith("//")) return "";
  if (cleaned.startsWith("#") || cleaned.startsWith("/") || cleaned.startsWith("?") || cleaned.startsWith(".")) {
    return cleaned;
  }
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(cleaned);
  if (!scheme) return cleaned;
  const lower = scheme[1]!.toLowerCase();
  return lower === "http" || lower === "https" ? cleaned : "";
}

/**
 * Vet one `<link>` descriptor. Returns `null` when the entry has no allowed
 * `rel`, or when its `href` does not survive sanitisation.
 */
function sanitiseLinkEntry(link: Record<string, string>): Record<string, string> | null {
  const rel = (link.rel ?? "").trim().toLowerCase();
  if (!SAFE_LINK_RELS.has(rel)) return null;

  const out: Record<string, string> = { rel };
  for (const [key, value] of Object.entries(link)) {
    const lower = key.toLowerCase();
    if (lower === "rel") continue;
    if (!isSafeAttrName(key)) continue;
    if (lower === "href") {
      const safe = sanitiseLinkHref(value);
      if (!safe) return null;
      out.href = safe;
      continue;
    }
    // `as`/`type`/`sizes`/`media`/`hreflang`/`color`/`title` are inert
    // descriptors; anything else is dropped rather than guessed at.
    if (["as", "type", "sizes", "media", "hreflang", "color", "title", "crossorigin", "referrerpolicy"].includes(lower)) {
      out[lower] = value;
    }
  }
  // A `rel` that names a destination is meaningless (and suspicious) with no
  // href, except for `dns-prefetch`/`preconnect` which we still require one for.
  if (!out.href) return null;
  return out;
}

/** A single resolved head contribution from one `$head(...)` call. */
interface HeadDirective {
  title?: string;
  meta: Record<string, string>;
  og: Record<string, string>;
  twitter: Record<string, string>;
  link: Array<Record<string, string>>;
  jsonLd: unknown[];
  base?: string;
  htmlAttrs: Record<string, string>;
}

function resolveConfig(config: unknown): HeadDirective {
  const cfg = asRecord(config);
  const out: HeadDirective = { meta: {}, og: {}, twitter: {}, link: [], jsonLd: [], htmlAttrs: {} };

  if (typeof cfg.title === "string") {
    const template = typeof cfg.titleTemplate === "string" ? cfg.titleTemplate : "";
    out.title = template ? template.replace("%s", cfg.title) : cfg.title;
  }

  const meta = asRecord(cfg.meta);
  for (const [k, v] of Object.entries(meta)) {
    if (v != null) out.meta[k] = String(v);
  }
  const og = asRecord(cfg.og);
  for (const [k, v] of Object.entries(og)) {
    if (v != null) out.og[k] = String(v);
  }
  const twitter = asRecord(cfg.twitter);
  for (const [k, v] of Object.entries(twitter)) {
    if (v != null) out.twitter[k] = String(v);
  }

  const links = Array.isArray(cfg.link) ? cfg.link : cfg.link != null ? [cfg.link] : [];
  for (const entry of links) {
    const rec = asRecord(entry);
    const link: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (v != null) link[k] = String(v);
    }
    if (Object.keys(link).length === 0) continue;
    const safe = sanitiseLinkEntry(link);
    if (safe) out.link.push(safe);
  }

  if (cfg.jsonLd != null) {
    const entries = Array.isArray(cfg.jsonLd) ? cfg.jsonLd : [cfg.jsonLd];
    for (const entry of entries) {
      if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        out.jsonLd.push("@context" in obj ? obj : { "@context": "https://schema.org", ...obj });
      }
    }
  }

  if (typeof cfg.base === "string") {
    const safe = sanitiseBaseHref(cfg.base);
    if (safe) out.base = safe;
  } else if (cfg.base && typeof cfg.base === "object") {
    const href = (cfg.base as Record<string, unknown>).href;
    const safe = sanitiseBaseHref(href);
    if (safe) out.base = safe;
  }

  const htmlAttrs = asRecord(cfg.htmlAttrs);
  for (const [k, v] of Object.entries(htmlAttrs)) {
    if (v == null) continue;
    const lower = k.toLowerCase();
    if (!isSafeAttrName(k)) continue;
    if (!SAFE_HTML_ATTRS.has(lower) && !lower.startsWith("data-")) continue;
    out.htmlAttrs[lower] = String(v);
  }
  return out;
}

/** Merge an ordered list of directives — later entries win on conflicts. */
function mergeDirectives(list: readonly HeadDirective[]): HeadDirective {
  const merged: HeadDirective = { meta: {}, og: {}, twitter: {}, link: [], jsonLd: [], htmlAttrs: {} };
  const linkSeen = new Set<string>();
  for (const d of list) {
    if (d.title != null) merged.title = d.title;
    Object.assign(merged.meta, d.meta);
    Object.assign(merged.og, d.og);
    Object.assign(merged.twitter, d.twitter);
    Object.assign(merged.htmlAttrs, d.htmlAttrs);
    if (d.base != null) merged.base = d.base;
    for (const link of d.link) {
      const id = `${link.rel ?? ""}|${link.href ?? ""}|${link.hreflang ?? ""}`;
      if (linkSeen.has(id)) continue;
      linkSeen.add(id);
      merged.link.push(link);
    }
    for (const entry of d.jsonLd) merged.jsonLd.push(entry);
  }
  return merged;
}

export interface HeadManager {
  /** Queue a `$head(...)` contribution for the current render pass. */
  apply: (config: unknown) => void;
  /** Force the queued contributions to commit immediately (used by SSR). */
  flush: () => void;
  /** Serialise the resolved head to an HTML string for SSR `<head>` injection. */
  serialize: () => string;
  /** The resolved `<html>` attributes (lang / dir / …) for SSR. */
  htmlAttrs: () => Record<string, string>;
}

function serializeDirective(head: HeadDirective): string {
  const parts: string[] = [];
  if (head.title != null) parts.push(`<title>${escapeText(head.title)}</title>`);
  for (const [name, content] of Object.entries(head.meta)) {
    if (!isSafeAttrName(name)) continue;
    if (name.toLowerCase() === "charset") parts.push(`<meta charset="${escapeAttr(content)}">`);
    else parts.push(`<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`);
  }
  for (const [key, content] of Object.entries(head.og)) {
    const property = key.startsWith("og:") ? key : `og:${key}`;
    parts.push(`<meta property="${escapeAttr(property)}" content="${escapeAttr(content)}">`);
  }
  for (const [key, content] of Object.entries(head.twitter)) {
    const name = key.startsWith("twitter:") ? key : `twitter:${key}`;
    parts.push(`<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`);
  }
  if (head.base) parts.push(`<base href="${escapeAttr(head.base)}">`);
  for (const link of head.link) {
    // The attribute NAME is emitted outside quotes, so entity-escaping it is
    // not enough — a name containing a space would introduce a second,
    // attacker-chosen attribute (`<link a onload=alert(1) b="…">`). Names are
    // validated instead.
    const attrs = Object.entries(link)
      .filter(([k]) => isSafeAttrName(k))
      .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
      .join(" ");
    if (attrs) parts.push(`<link ${attrs}>`);
  }
  for (const entry of head.jsonLd) {
    let json = "";
    try { json = JSON.stringify(entry); } catch { json = ""; }
    if (json) parts.push(`<script type="application/ld+json">${json.replace(/</g, "\\u003c")}</script>`);
  }
  return parts.join("\n");
}

const MANAGED_ATTR = "data-rui-head";

function applyToDom(head: HeadDirective): void {
  if (typeof document === "undefined") return;
  if (head.title != null) document.title = head.title;

  const root = document.documentElement;
  if (root) {
    for (const [k, v] of Object.entries(head.htmlAttrs)) {
      // `resolveConfig` already allow-listed these; re-check so a caller that
      // builds a directive directly cannot bypass it, and so an invalid name
      // cannot make `setAttribute` throw and abort the whole commit.
      if (!isSafeAttrName(k)) continue;
      try { root.setAttribute(k, v); } catch { /* invalid name — skip */ }
    }
  }

  const headEl = document.head;
  if (!headEl) return;
  // Replace the previously-managed nodes wholesale — the head is tiny, so a
  // clean rebuild is simpler (and flicker-free) than per-node diffing.
  headEl.querySelectorAll(`[${MANAGED_ATTR}]`).forEach((el) => el.remove());

  const add = (el: HTMLElement): void => {
    el.setAttribute(MANAGED_ATTR, "");
    headEl.appendChild(el);
  };

  for (const [name, content] of Object.entries(head.meta)) {
    if (!isSafeAttrName(name)) continue;
    const el = document.createElement("meta");
    // `name` is always emitted as the *value* of the `name` attribute, never
    // as `http-equiv` — so a program cannot inject a `refresh` redirect or a
    // relaxed `Content-Security-Policy` into the host document.
    if (name.toLowerCase() === "charset") el.setAttribute("charset", content);
    else { el.setAttribute("name", name); el.setAttribute("content", content); }
    add(el);
  }
  for (const [key, content] of Object.entries(head.og)) {
    const el = document.createElement("meta");
    el.setAttribute("property", key.startsWith("og:") ? key : `og:${key}`);
    el.setAttribute("content", content);
    add(el);
  }
  for (const [key, content] of Object.entries(head.twitter)) {
    const el = document.createElement("meta");
    el.setAttribute("name", key.startsWith("twitter:") ? key : `twitter:${key}`);
    el.setAttribute("content", content);
    add(el);
  }
  if (head.base) {
    const el = document.createElement("base");
    el.setAttribute("href", head.base);
    add(el);
  }
  for (const link of head.link) {
    const el = document.createElement("link");
    for (const [k, v] of Object.entries(link)) {
      if (!isSafeAttrName(k)) continue;
      try { el.setAttribute(k, v); } catch { /* invalid name — skip */ }
    }
    add(el);
  }
  for (const entry of head.jsonLd) {
    const el = document.createElement("script");
    el.setAttribute("type", "application/ld+json");
    try { el.textContent = JSON.stringify(entry); } catch { /* skip */ }
    add(el);
  }
}

/**
 * Build the per-context `$head` manager. Contributions accumulate per render
 * pass (synchronously) and commit on a microtask, so the resolved head is the
 * merge of every `$head(...)` that ran this pass.
 */
export function createHeadManager(ctx: EvaluationContext): HeadManager {
  let pending: HeadDirective[] = [];
  let scheduled = false;
  let resolved: HeadDirective = { meta: {}, og: {}, twitter: {}, link: [], jsonLd: [], htmlAttrs: {} };

  const commit = (): void => {
    scheduled = false;
    if (pending.length === 0) return;
    resolved = mergeDirectives(pending);
    pending = [];
    applyToDom(resolved);
  };

  // On replan / disconnect, drop the tags this program added so the next
  // program (or a teardown) doesn't inherit a stale title / meta set.
  ctx.disposers.push(() => {
    if (typeof document === "undefined" || !document.head) return;
    document.head.querySelectorAll(`[${MANAGED_ATTR}]`).forEach((el) => el.remove());
  });

  return {
    apply(config) {
      pending.push(resolveConfig(config));
      if (scheduled) return;
      scheduled = true;
      if (typeof queueMicrotask === "function") queueMicrotask(commit);
      else void Promise.resolve().then(commit);
    },
    flush() {
      commit();
    },
    serialize() {
      // SSR runs synchronously, so commit any queued contributions first.
      if (pending.length > 0) commit();
      return serializeDirective(resolved);
    },
    htmlAttrs() {
      if (pending.length > 0) commit();
      return resolved.htmlAttrs;
    },
  };
}
