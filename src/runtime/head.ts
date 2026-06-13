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
    if (Object.keys(link).length > 0) out.link.push(link);
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

  if (typeof cfg.base === "string") out.base = cfg.base;
  else if (cfg.base && typeof cfg.base === "object") {
    const href = (cfg.base as Record<string, unknown>).href;
    if (typeof href === "string") out.base = href;
  }

  const htmlAttrs = asRecord(cfg.htmlAttrs);
  for (const [k, v] of Object.entries(htmlAttrs)) {
    if (v != null) out.htmlAttrs[k] = String(v);
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
    const attrs = Object.entries(link)
      .map(([k, v]) => `${escapeAttr(k)}="${escapeAttr(v)}"`)
      .join(" ");
    parts.push(`<link ${attrs}>`);
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
      if (/^on/i.test(k)) continue;
      root.setAttribute(k, v);
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
    const el = document.createElement("meta");
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
      if (/^on/i.test(k)) continue;
      el.setAttribute(k, v);
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
