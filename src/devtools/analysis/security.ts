/**
 * Aktion DevTools — security scanner.
 *
 * Aktion's trust model (SECURITY.md) has two inputs with opposite privileges:
 * the program text is TRUSTED code, and everything it renders is UNTRUSTED
 * data that the library sanitises. A useful security view follows that split
 * rather than printing a generic web-security checklist:
 *
 *   - **Program** — what the trusted code can reach: the global access policy
 *     in force, host globals it names, dynamic code, endpoints, windows it
 *     opens, events that leave the app, escape hatches that bypass sanitisers.
 *     (Static; computed by the runtime from the real AST.)
 *   - **Rendered output** — whether the sanitiser guarantees hold in the live
 *     DOM: no `javascript:` URLs, no inline handlers, no stray `<script>`,
 *     sandboxed frames, safe `target=_blank`.
 *   - **Transport** — what the app actually sent: mixed content, secrets in
 *     URLs, credentials to third parties.
 *   - **Storage** — tokens where any script (and so any XSS) can read them.
 *   - **Headers / CSP** — the page's policy, checked on request, plus live
 *     `securitypolicyviolation` reports.
 *
 * Every finding names the evidence and the fix, and nothing here throws: a
 * check that cannot run in this environment is skipped, never guessed.
 */

import type { NetworkRequest } from "../model.js";
import type { ProgramSecurityProfile } from "../introspect.js";

export type Severity = "high" | "medium" | "low" | "info";
export type SecurityCategory = "program" | "dom" | "transport" | "storage" | "headers" | "csp";

export interface SecurityFinding {
  /** Stable per-finding id (`rule:evidence`). */
  id: string;
  rule: string;
  severity: Severity;
  category: SecurityCategory;
  title: string;
  detail: string;
  fix: string;
  evidence?: string;
  element?: Element;
  /** Source line for program findings. */
  line?: number;
  requestId?: string;
  storageKey?: string;
}

export interface OriginSummary {
  origin: string;
  requests: number;
  failed: number;
  firstParty: boolean;
  secure: boolean;
  credentials: boolean;
}

export interface StorageItem {
  area: "local" | "session" | "cookie";
  key: string;
  size: number;
  kind: "jwt" | "api-key" | "private-key" | "secret-name" | "none";
  /** Decoded JWT claims worth showing (`exp`, `sub`, `iss`, `aud`). */
  jwt?: { exp?: number; iat?: number; sub?: string; iss?: string; aud?: string; alg?: string; expired?: boolean };
}

export interface HeaderCheck {
  header: string;
  value: string | null;
  status: "good" | "warn" | "missing" | "info";
  note: string;
}

export interface CspViolation {
  time: number;
  directive: string;
  blocked: string;
  source: string;
  disposition: string;
  sample?: string;
}

export interface SecurityReport {
  at: number;
  findings: SecurityFinding[];
  score: number;
  counts: Record<Severity, number>;
  origins: OriginSummary[];
  storage: StorageItem[];
  headers: HeaderCheck[] | null;
  profile: ProgramSecurityProfile | null;
  examined: number;
  pageOrigin: string;
  secureContext: boolean;
}

export interface SecurityInput {
  root: Element | null;
  requests: ReadonlyArray<NetworkRequest>;
  profile: ProgramSecurityProfile | null;
  location?: { href: string; protocol: string; hostname: string; origin: string } | null;
  storage?: { local: Array<[string, string]>; session: Array<[string, string]>; cookies: Array<[string, string]> } | null;
  headers?: Record<string, string> | null;
  cspMeta?: string | null;
  violations?: ReadonlyArray<CspViolation>;
  limit?: number;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 18, medium: 7, low: 2, info: 0 };
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

/* -------------------------------------------------------------------------- */
/*  Pattern detectors                                                          */
/* -------------------------------------------------------------------------- */

const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{0,}$/;
const API_KEY_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bsk_(live|test)_[0-9A-Za-z]{16,}\b/, "Stripe secret key"],
  [/\bgh[pousr]_[0-9A-Za-z]{30,}\b/, "GitHub token"],
  [/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, "API secret key"],
];
const SECRET_NAME_RE = /(^|[_\-.])(token|access[_-]?token|refresh[_-]?token|id[_-]?token|jwt|secret|password|passwd|pwd|api[_-]?key|apikey|auth|session|sid|credential|bearer|private[_-]?key)($|[_\-.])/i;
const SESSION_COOKIE_RE = /(^|[_\-.])(session|sess|sid|auth|token|jwt|remember|login|connect\.sid|phpsessid|jsessionid)($|[_\-.])/i;
const URL_SECRET_PARAMS = /^(token|access_token|refresh_token|id_token|auth|authorization|api_key|apikey|key|secret|password|pwd|session|sessionid|sid|sig|signature|jwt|code)$/i;

function base64UrlDecode(part: string): string | null {
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    if (typeof atob !== "function") return null;
    return atob(padded);
  } catch {
    return null;
  }
}

/** Decode a JWT's header + claims, or `null` when the value is not one. */
export function decodeJwt(value: string, now = Date.now()): StorageItem["jwt"] | null {
  const text = value.trim().replace(/^Bearer\s+/i, "");
  if (!JWT_RE.test(text)) return null;
  const [headerPart, payloadPart] = text.split(".");
  const header = base64UrlDecode(headerPart ?? "");
  const payload = base64UrlDecode(payloadPart ?? "");
  if (!header || !payload) return null;
  try {
    const h = JSON.parse(header) as { alg?: string; typ?: string };
    const p = JSON.parse(payload) as { exp?: number; iat?: number; sub?: string; iss?: string; aud?: string | string[] };
    if (typeof h !== "object" || h === null || typeof p !== "object" || p === null) return null;
    if (!("alg" in h) && !("typ" in h)) return null;
    return {
      alg: h.alg,
      exp: typeof p.exp === "number" ? p.exp : undefined,
      iat: typeof p.iat === "number" ? p.iat : undefined,
      sub: typeof p.sub === "string" ? p.sub : undefined,
      iss: typeof p.iss === "string" ? p.iss : undefined,
      aud: Array.isArray(p.aud) ? p.aud.join(", ") : typeof p.aud === "string" ? p.aud : undefined,
      expired: typeof p.exp === "number" ? p.exp * 1000 < now : undefined,
    };
  } catch {
    return null;
  }
}

/** Classify a stored value by what it looks like. */
export function classifySecret(key: string, value: string): { kind: StorageItem["kind"]; label?: string; jwt?: StorageItem["jwt"] } {
  const jwt = decodeJwt(value);
  if (jwt) return { kind: "jwt", label: "JWT", jwt };
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) return { kind: "private-key", label: "private key" };
  for (const [re, label] of API_KEY_PATTERNS) if (re.test(value)) return { kind: "api-key", label };
  // A JSON blob that carries a token field ({ "accessToken": "eyJ…" }).
  if (value.length < 20_000 && (value.startsWith("{") || value.startsWith("["))) {
    try {
      const parsed = JSON.parse(value) as unknown;
      const stack: unknown[] = [parsed];
      let budget = 200;
      while (stack.length > 0 && budget-- > 0) {
        const current = stack.pop();
        if (current && typeof current === "object") {
          for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
            if (typeof v === "string") {
              const inner = decodeJwt(v);
              if (inner) return { kind: "jwt", label: `JWT in "${k}"`, jwt: inner };
              if (SECRET_NAME_RE.test(k) && v.length >= 12) return { kind: "secret-name", label: `"${k}" field` };
            } else if (v && typeof v === "object") stack.push(v);
          }
        }
      }
    } catch {
      /* not JSON */
    }
  }
  if (SECRET_NAME_RE.test(key) && value.length >= 12 && !/^(true|false|null|\d+)$/.test(value)) return { kind: "secret-name", label: "secret-named key" };
  return { kind: "none" };
}

/** Local hosts where plain http is normal. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost") || host.endsWith(".test") || host === "0.0.0.0";
}

function safeUrl(raw: string, base: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

function describe(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const cls = typeof element.className === "string" && element.className.trim()
    ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
    : "";
  return `<${tag}${id}${cls}>`;
}

/* -------------------------------------------------------------------------- */
/*  The scan                                                                   */
/* -------------------------------------------------------------------------- */

export function scanSecurity(input: SecurityInput): SecurityReport {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();
  const push = (finding: SecurityFinding): void => {
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push(finding);
  };
  const loc = input.location ?? null;
  const pageOrigin = loc?.origin ?? "";
  const pageSecure = loc ? loc.protocol === "https:" || isLocalHost(loc.hostname) : true;
  const pageHttps = loc?.protocol === "https:";
  const base = loc?.href ?? "http://localhost/";

  /* ---- page ---- */
  if (loc && loc.protocol === "http:" && !isLocalHost(loc.hostname)) {
    push({
      id: "insecure-page", rule: "insecure-page", severity: "high", category: "transport",
      title: "Page served over plain HTTP",
      detail: `${loc.origin} is not a secure context: anyone on the network path can read and rewrite the program text itself — and program text is trusted code.`,
      fix: "Serve the page over HTTPS and redirect http:// to it (add Strict-Transport-Security once it works).",
      evidence: loc.origin,
    });
  }

  /* ---- program (static profile from the runtime) ---- */
  const profile = input.profile;
  if (profile) {
    if (profile.policy === "all") {
      push({
        id: "policy-all", rule: "policy-all", severity: profile.dynamicCode.length > 0 ? "medium" : "info", category: "program",
        title: "Global access policy is \"all\"",
        detail: "Program text can reach every host global (eval, document, fetch, storage). That is the documented default for trusted programs; it is wrong for a program written by an LLM, loaded from a database, or editable by users.",
        fix: "If the program text is not as trusted as your own code, call setGlobalAccessPolicy(\"safe\") before mounting — and for fully untrusted text, run it in a sandboxed cross-origin iframe.",
      });
    }
    for (const entry of profile.dynamicCode) {
      push({
        id: `dynamic-code:${entry.line}:${entry.column}`, rule: "dynamic-code", severity: "high", category: "program",
        title: `Dynamic code execution: ${entry.what}`,
        detail: "Building code from strings at runtime is the one construct that turns an injection bug in DATA into arbitrary code execution.",
        fix: "Replace it with a lambda or a lookup table. setGlobalAccessPolicy(\"safe\") blocks eval/Function outright.",
        line: entry.line, evidence: `line ${entry.line}`,
      });
    }
    for (const entry of profile.hostGlobals) {
      if (entry.risk === "high") continue; // reported as dynamic code
      const bypass = entry.name === "fetch" || entry.name === "XMLHttpRequest";
      push({
        id: `host-global:${entry.name}`, rule: "host-global", severity: entry.risk === "medium" ? (bypass ? "medium" : "low") : "info", category: "program",
        title: `Program reaches the host global \`${entry.name}\``,
        detail: bypass
          ? `Direct ${entry.name} calls bypass $http: no interceptors (auth headers, CSRF tokens), no DevTools network tap, no mocking — and they are invisible to this panel's Network view.`
          : `\`${entry.name}\` is used ${entry.count}× (first at line ${entry.line}). Under the "safe" policy it would resolve to nothing; under "all" it is full page access.`,
        fix: bypass ? "Use $query / $mutation / Http({…}) so requests go through the runtime." : "Prefer the runtime's vetted namespaces ($util, storage, $router) over raw host objects.",
        line: entry.line, evidence: `${entry.name} ×${entry.count}`,
      });
    }
    for (const entry of profile.escapeHatches) {
      push({
        id: `escape-hatch:${entry.component}:${entry.line}`, rule: "escape-hatch", severity: entry.dynamic && entry.component !== "Markdown" ? "medium" : "info", category: "program",
        title: `${entry.component}(…) escape hatch${entry.dynamic ? " with dynamic content" : ""}`,
        detail: entry.component === "Markdown"
          ? "Markdown output is escaped by the library; this is listed so a reviewer knows where rendered rich text comes from."
          : `${entry.component} writes markup or CSS the component library does not construct. It is allow-listed, but it is where a review should start.`,
        fix: entry.dynamic ? "Keep untrusted values out of tag names, attribute names, and CSS text; pass them as text children or props instead." : "No action needed if the content is static.",
        line: entry.line, evidence: `line ${entry.line}`,
      });
    }
    for (const entry of profile.openUrls) {
      if (!entry.dynamic) continue;
      push({
        id: `open-url:${entry.line}:${entry.column}`, rule: "open-dynamic-url", severity: "low", category: "program",
        title: `${entry.via} with a computed URL`,
        detail: "A URL built from state or input can become an open redirect or a phishing hop if any part of it is attacker-controlled.",
        fix: "Allow-list destinations, or build the URL from a fixed origin plus encoded path/query parts.",
        line: entry.line, evidence: entry.target ?? "${…}",
      });
    }
    for (const endpoint of profile.endpoints) {
      const url = endpoint.dynamic ? null : safeUrl(endpoint.url, base);
      if (url && url.protocol === "http:" && !isLocalHost(url.hostname)) {
        push({
          id: `http-endpoint:${endpoint.url}`, rule: "insecure-endpoint", severity: "high", category: "program",
          title: "Program calls a plain-HTTP endpoint",
          detail: `${endpoint.via} → ${endpoint.url} (line ${endpoint.line}) travels unencrypted${pageHttps ? " and will be blocked as mixed content" : ""}.`,
          fix: "Use https:// for every endpoint.",
          line: endpoint.line, evidence: endpoint.url,
        });
      }
      const inUrl = checkUrlSecrets(endpoint.url);
      if (inUrl) {
        push({
          id: `endpoint-secret:${endpoint.url}`, rule: "secret-in-url", severity: "high", category: "program",
          title: `Credential in a request URL (${inUrl})`,
          detail: `The program puts \`${inUrl}\` in the URL of ${endpoint.via} (line ${endpoint.line}). URLs land in server logs, proxies, browser history, and Referer headers.`,
          fix: "Send credentials in an Authorization header via an interceptor ($util.onRequest) instead.",
          line: endpoint.line, evidence: endpoint.url,
        });
      }
    }
  }

  /* ---- rendered DOM ---- */
  let examined = 0;
  const root = input.root;
  if (root) {
    let elements: Element[] = [];
    try {
      elements = [...root.querySelectorAll("*")].slice(0, input.limit ?? 6000);
    } catch {
      elements = [];
    }
    examined = elements.length;
    for (const element of elements) {
      const tag = element.tagName.toLowerCase();
      for (const attr of ["href", "src", "action", "formaction", "xlink:href"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const normalised = value.replace(/[\u0000- ]/g, "").toLowerCase();
        if (normalised.startsWith("javascript:") || normalised.startsWith("vbscript:") || normalised.startsWith("data:text/html")) {
          push({
            id: `script-url:${describe(element)}:${attr}`, rule: "script-url", severity: "high", category: "dom", element,
            title: `Executable URL in ${attr}`,
            detail: `${describe(element)} has ${attr}="${value.slice(0, 60)}". The component library's sanitisers refuse this scheme, so it came from an escape hatch or from outside the runtime.`,
            fix: "Remove the URL, or route it through Link/Image so sanitiseHref/sanitiseImageSrc applies.",
            evidence: value.slice(0, 120),
          });
        }
        if (pageHttps && (attr === "src" || (attr === "href" && tag === "link")) && normalised.startsWith("http://")) {
          const active = tag === "script" || tag === "iframe" || tag === "link" || tag === "object" || tag === "embed";
          push({
            id: `mixed-dom:${value}`, rule: "mixed-content", severity: active ? "high" : "medium", category: "transport", element,
            title: `${active ? "Active" : "Passive"} mixed content`,
            detail: `${describe(element)} loads ${value} over HTTP on an HTTPS page.${active ? " Browsers block active mixed content outright." : " It can be read and replaced in transit."}`,
            fix: "Load it over https://.",
            evidence: value,
          });
        }
      }
      for (let i = 0; i < element.attributes.length; i += 1) {
        const attr = element.attributes[i]!;
        if (/^on[a-z]+$/i.test(attr.name)) {
          push({
            id: `inline-handler:${describe(element)}:${attr.name}`, rule: "inline-handler", severity: "medium", category: "dom", element,
            title: `Inline event handler (${attr.name})`,
            detail: `${describe(element)} carries ${attr.name}="${attr.value.slice(0, 50)}". Aktion never renders these; an inline handler is script living in markup, and it forces a CSP to allow 'unsafe-inline'.`,
            fix: "Attach behaviour with onClick/onInput props so it goes through the runtime.",
            evidence: `${attr.name}="${attr.value.slice(0, 80)}"`,
          });
        }
      }
      if (tag === "script") {
        push({
          id: `script-element:${describe(element)}`, rule: "script-element", severity: "high", category: "dom", element,
          title: "<script> inside the app's render tree",
          detail: "The runtime never emits script elements. One inside the shadow root was injected by host code or an escape hatch.",
          fix: "Find what inserted it; keep scripts out of rendered content entirely.",
        });
      }
      if (tag === "iframe") {
        const sandbox = element.getAttribute("sandbox");
        if (sandbox === null) {
          push({
            id: `iframe-sandbox:${element.getAttribute("src") ?? describe(element)}`, rule: "iframe-sandbox", severity: "medium", category: "dom", element,
            title: "iframe without a sandbox",
            detail: `${describe(element)} (${element.getAttribute("src") ?? "no src"}) runs with full privileges for its origin.`,
            fix: "Add sandbox with only the capabilities it needs (e.g. sandbox=\"allow-scripts\").",
          });
        } else if (/allow-scripts/.test(sandbox) && /allow-same-origin/.test(sandbox)) {
          push({
            id: `iframe-escape:${element.getAttribute("src") ?? describe(element)}`, rule: "iframe-sandbox-escape", severity: "medium", category: "dom", element,
            title: "Sandbox allows scripts AND same-origin",
            detail: "With both flags a same-origin frame can remove its own sandbox attribute — the sandbox is decorative.",
            fix: "Drop allow-same-origin, or serve the frame from a separate origin.",
          });
        }
        if (element.hasAttribute("srcdoc")) {
          push({
            id: `srcdoc:${describe(element)}`, rule: "srcdoc", severity: "medium", category: "dom", element,
            title: "iframe srcdoc markup",
            detail: "srcdoc renders raw HTML; the library drops it from HTMLTag, so this one was set outside the runtime.",
            fix: "Render the content with components instead.",
          });
        }
      }
      if ((tag === "object" || tag === "embed") && !seen.has(`plugin:${tag}`)) {
        push({
          id: `plugin:${tag}`, rule: "plugin-element", severity: "low", category: "dom", element,
          title: `<${tag}> element`,
          detail: "Plugin containers can load active content outside the page's normal policies.",
          fix: "Use <img>, <video>, or a sandboxed iframe.",
        });
      }
      if (tag === "a" && element.getAttribute("target") === "_blank") {
        const rel = (element.getAttribute("rel") ?? "").toLowerCase();
        if (!rel.includes("noopener") && !rel.includes("noreferrer")) {
          push({
            id: `blank-opener:${element.getAttribute("href") ?? describe(element)}`, rule: "target-blank", severity: "low", category: "dom", element,
            title: "target=\"_blank\" without rel=\"noopener\"",
            detail: `${describe(element)} → ${element.getAttribute("href") ?? ""}. Older browsers let the opened page navigate this one (reverse tabnabbing).`,
            fix: "Add rel=\"noopener noreferrer\" (Link and HTMLTag do this automatically).",
          });
        }
      }
      if (tag === "form") {
        const action = element.getAttribute("action");
        const url = action ? safeUrl(action, base) : null;
        if (url && url.protocol === "http:" && !isLocalHost(url.hostname)) {
          push({
            id: `form-http:${action}`, rule: "form-insecure-action", severity: "high", category: "transport", element,
            title: "Form submits over plain HTTP",
            detail: `${describe(element)} posts to ${action}. Anything typed into it travels unencrypted.`,
            fix: "Submit to an https:// endpoint.",
          });
        } else if (url && pageOrigin && url.origin !== pageOrigin) {
          push({
            id: `form-offsite:${url.origin}`, rule: "form-third-party", severity: "low", category: "transport", element,
            title: "Form submits to another origin",
            detail: `${describe(element)} posts to ${url.origin}.`,
            fix: "Confirm the destination is intended; prefer $mutation so the request is visible and interceptable.",
          });
        }
      }
      if (tag === "input" && (element as HTMLInputElement).type === "password") {
        if (loc && !pageSecure) {
          push({
            id: "password-http", rule: "password-insecure", severity: "high", category: "transport", element,
            title: "Password field on an insecure page",
            detail: "Browsers flag this page as \"Not secure\" and the password travels in clear text.",
            fix: "Serve the page over HTTPS.",
          });
        }
        const ac = (element.getAttribute("autocomplete") ?? "").toLowerCase();
        if (!ac.includes("current-password") && !ac.includes("new-password") && !ac.includes("one-time-code")) {
          push({
            id: `password-ac:${describe(element)}`, rule: "password-autocomplete", severity: "low", category: "dom", element,
            title: "Password field without a precise autocomplete",
            detail: `${describe(element)} has autocomplete="${ac || "(none)"}". Password managers — the strongest defence against reuse and phishing — work best with an exact token.`,
            fix: "Set autocomplete to \"current-password\" (sign-in) or \"new-password\" (sign-up / change).",
          });
        }
      }
    }
  }

  /* ---- transport (observed requests) ---- */
  const origins = new Map<string, OriginSummary>();
  for (const request of input.requests) {
    const url = safeUrl(request.url, base);
    if (!url) continue;
    const origin = url.origin === "null" ? url.protocol : url.origin;
    const firstParty = pageOrigin !== "" ? url.origin === pageOrigin : url.hostname === "" || isLocalHost(url.hostname);
    const headers = request.requestHeaders ?? {};
    const credentials = Object.keys(headers).some((h) => /^(authorization|cookie|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token|proxy-authorization)$/i.test(h));
    let summary = origins.get(origin);
    if (!summary) {
      summary = { origin, requests: 0, failed: 0, firstParty, secure: url.protocol === "https:" || isLocalHost(url.hostname), credentials: false };
      origins.set(origin, summary);
    }
    summary.requests += 1;
    if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400) summary.failed += 1;
    if (credentials) summary.credentials = true;

    if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
      push({
        id: `http-request:${origin}`, rule: pageHttps ? "mixed-content" : "insecure-request", severity: "high", category: "transport",
        title: pageHttps ? "Request blocked as mixed content" : "Request over plain HTTP",
        detail: `${request.method} ${request.url} is unencrypted${credentials ? " and carries credentials" : ""}.`,
        fix: "Use https:// for every endpoint.",
        requestId: request.requestId, evidence: request.url,
      });
    }
    const secretParam = checkUrlSecrets(request.url);
    if (secretParam) {
      push({
        id: `url-secret:${url.origin}${url.pathname}:${secretParam}`, rule: "secret-in-url", severity: "high", category: "transport",
        title: `Credential in a request URL (${secretParam})`,
        detail: `${request.method} ${url.origin}${url.pathname} sends \`${secretParam}\` in the query string, where it is logged by servers and proxies and leaks through Referer.`,
        fix: "Move it into an Authorization header (via $util.onRequest).",
        requestId: request.requestId, evidence: request.url,
      });
    }
    if (credentials && !firstParty) {
      push({
        id: `third-party-credentials:${origin}`, rule: "third-party-credentials", severity: "medium", category: "transport",
        title: "Credentials sent to a third party",
        detail: `Requests to ${origin} carry an Authorization/Cookie/API-key header. Make sure this origin is meant to receive your users' credentials.`,
        fix: "Scope the auth interceptor to your own API origin(s).",
        requestId: request.requestId, evidence: origin,
      });
    }
  }
  const thirdParty = [...origins.values()].filter((o) => !o.firstParty);
  if (thirdParty.length > 0) {
    push({
      id: "third-party-origins", rule: "third-party-origins", severity: "info", category: "transport",
      title: `${thirdParty.length} third-party origin${thirdParty.length === 1 ? "" : "s"} contacted`,
      detail: thirdParty.map((o) => `${o.origin} (${o.requests})`).join(", "),
      fix: "Every origin here needs a connect-src entry in your CSP; unexpected ones deserve a look.",
    });
  }

  /* ---- storage ---- */
  const storageItems: StorageItem[] = [];
  const store = input.storage;
  if (store) {
    const areas: Array<[StorageItem["area"], Array<[string, string]>]> = [["local", store.local], ["session", store.session], ["cookie", store.cookies]];
    for (const [area, entries] of areas) {
      for (const [key, value] of entries) {
        const verdict = classifySecret(key, value);
        storageItems.push({ area, key, size: key.length + value.length, kind: verdict.kind, jwt: verdict.jwt });
        if (verdict.kind === "none") {
          if (area === "cookie" && SESSION_COOKIE_RE.test(key)) {
            push({
              id: `cookie-readable:${key}`, rule: "cookie-not-httponly", severity: "medium", category: "storage", storageKey: key,
              title: `Session-like cookie readable by JavaScript: ${key}`,
              detail: `document.cookie exposes "${key}", so it is NOT HttpOnly — any XSS can steal it.`,
              fix: "Set session cookies from the server with HttpOnly; Secure; SameSite=Lax (or Strict).",
              evidence: key,
            });
          }
          continue;
        }
        const where = area === "cookie" ? "a JavaScript-readable cookie" : `${area}Storage`;
        push({
          id: `storage-secret:${area}:${key}`, rule: "storage-secret", severity: verdict.kind === "private-key" ? "high" : "medium", category: "storage", storageKey: key,
          title: `${verdict.label ?? "Secret"} in ${where}: ${key}`,
          detail: `${where} is readable by every script on the origin, so a single XSS exfiltrates it.${verdict.jwt?.exp ? ` The token ${verdict.jwt.expired ? "has EXPIRED" : `expires ${new Date(verdict.jwt.exp * 1000).toISOString()}`}.` : ""}`,
          fix: area === "cookie" ? "Mark the cookie HttpOnly so script cannot read it." : "Keep session tokens in HttpOnly cookies; if a token must live in JS, keep it in memory and scope it tightly.",
          evidence: key,
        });
      }
    }
  }

  /* ---- headers ---- */
  let headerChecks: HeaderCheck[] | null = null;
  const cspMeta = input.cspMeta ?? null;
  if (input.headers) {
    headerChecks = checkHeaders(input.headers, cspMeta, pageHttps);
    for (const check of headerChecks) {
      if (check.status === "good" || check.status === "info") continue;
      const severity: Severity = check.header === "content-security-policy" ? "medium" : "low";
      push({
        id: `header:${check.header}`, rule: `header-${check.header}`, severity, category: "headers",
        title: check.status === "missing" ? `Missing ${check.header}` : `Weak ${check.header}`,
        detail: check.note, fix: headerFix(check.header), evidence: check.value ?? undefined,
      });
    }
  } else if (cspMeta === null && typeof document !== "undefined") {
    // Without a header scan we can still say something useful about a meta CSP.
    push({
      id: "csp-unknown", rule: "csp-unknown", severity: "info", category: "headers",
      title: "No <meta> Content-Security-Policy",
      detail: "A CSP may still be sent as a response header — run the header check to find out.",
      fix: "Run “Check response headers”.",
    });
  }

  /* ---- CSP violations ---- */
  for (const violation of input.violations ?? []) {
    push({
      id: `csp:${violation.directive}:${violation.blocked}`, rule: "csp-violation", severity: violation.disposition === "report" ? "low" : "medium", category: "csp",
      title: `CSP ${violation.disposition === "report" ? "report" : "blocked"}: ${violation.directive}`,
      detail: `Blocked ${violation.blocked || "(inline)"}${violation.source ? ` from ${violation.source}` : ""}.`,
      fix: violation.directive.startsWith("style-src")
        ? "Aktion injects <style> elements (theme tokens, component CSS): style-src needs 'unsafe-inline' or a nonce/hash strategy."
        : "Either allow the resource explicitly or stop loading it.",
      evidence: violation.sample,
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.category.localeCompare(b.category));
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  let penalty = 0;
  for (const finding of findings) {
    counts[finding.severity] += 1;
    penalty += SEVERITY_WEIGHT[finding.severity];
  }
  return {
    at: Date.now(),
    findings,
    score: Math.max(0, Math.min(100, 100 - penalty)),
    counts,
    origins: [...origins.values()].sort((a, b) => Number(a.firstParty) - Number(b.firstParty) || b.requests - a.requests),
    storage: storageItems.sort((a, b) => Number(b.kind !== "none") - Number(a.kind !== "none") || a.key.localeCompare(b.key)),
    headers: headerChecks,
    profile,
    examined,
    pageOrigin,
    secureContext: pageSecure,
  };
}

/** The first query parameter (or JWT-shaped value) in `raw` that looks like a credential. */
export function checkUrlSecrets(raw: string): string | null {
  const q = raw.indexOf("?");
  if (q < 0) return null;
  const query = raw.slice(q + 1).split("#")[0] ?? "";
  for (const pair of query.split("&")) {
    const [rawKey, rawValue = ""] = pair.split("=");
    let key = rawKey ?? "";
    let value = rawValue;
    try { key = decodeURIComponent(key); } catch { /* keep raw */ }
    try { value = decodeURIComponent(value); } catch { /* keep raw */ }
    if (value === "" || value.startsWith("${")) {
      if (URL_SECRET_PARAMS.test(key) && value.startsWith("${")) return key;
      continue;
    }
    if (URL_SECRET_PARAMS.test(key) && key.toLowerCase() !== "code") return key;
    if (JWT_RE.test(value) && decodeJwt(value)) return key || "JWT";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Headers                                                                    */
/* -------------------------------------------------------------------------- */

export function checkHeaders(headers: Record<string, string>, cspMeta: string | null, https: boolean): HeaderCheck[] {
  const get = (name: string): string | null => {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return key ? headers[key]! : null;
  };
  const out: HeaderCheck[] = [];
  const csp = get("content-security-policy") ?? cspMeta;
  if (!csp) {
    out.push({ header: "content-security-policy", value: null, status: "missing", note: "No CSP: an injected script runs with full origin privileges and nothing reports it." });
  } else {
    const problems: string[] = [];
    const scriptSrc = /(?:^|;)\s*script-src\s+([^;]+)/i.exec(csp)?.[1] ?? /(?:^|;)\s*default-src\s+([^;]+)/i.exec(csp)?.[1] ?? "";
    if (/'unsafe-inline'/.test(scriptSrc) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc)) problems.push("script-src allows 'unsafe-inline'");
    if (/'unsafe-eval'/.test(scriptSrc)) problems.push("script-src allows 'unsafe-eval' (the Aktion runtime does not need it)");
    if (/(^|\s)\*(\s|$)/.test(scriptSrc)) problems.push("script-src allows any host (*)");
    if (!/object-src\s+'none'/i.test(csp) && !/default-src\s+'none'/i.test(csp)) problems.push("object-src is not 'none'");
    if (!/frame-ancestors/i.test(csp)) problems.push("no frame-ancestors (clickjacking)");
    out.push({
      header: "content-security-policy",
      value: csp,
      status: problems.length === 0 ? "good" : "warn",
      note: problems.length === 0 ? `Strict policy${get("content-security-policy") ? "" : " (from <meta>)"}.` : problems.join("; "),
    });
  }
  const hsts = get("strict-transport-security");
  if (https) {
    out.push(hsts
      ? { header: "strict-transport-security", value: hsts, status: /max-age=(\d+)/.test(hsts) && Number(/max-age=(\d+)/.exec(hsts)![1]) >= 15_552_000 ? "good" : "warn", note: /max-age=(\d+)/.test(hsts) ? "HTTPS is enforced for returning visitors." : "max-age is missing." }
      : { header: "strict-transport-security", value: null, status: "missing", note: "Without HSTS the first request can be downgraded to HTTP." });
  }
  const xcto = get("x-content-type-options");
  out.push(xcto && /nosniff/i.test(xcto)
    ? { header: "x-content-type-options", value: xcto, status: "good", note: "MIME sniffing disabled." }
    : { header: "x-content-type-options", value: xcto, status: "missing", note: "Browsers may sniff a response into an executable type." });
  const xfo = get("x-frame-options");
  const frameAncestors = csp && /frame-ancestors/i.test(csp);
  out.push(xfo || frameAncestors
    ? { header: "x-frame-options", value: xfo ?? "(frame-ancestors in CSP)", status: "good", note: "Framing is restricted." }
    : { header: "x-frame-options", value: null, status: "missing", note: "Any site can frame this page (clickjacking)." });
  const referrer = get("referrer-policy");
  out.push(referrer
    ? { header: "referrer-policy", value: referrer, status: /unsafe-url|no-referrer-when-downgrade/i.test(referrer) ? "warn" : "good", note: /unsafe-url/i.test(referrer) ? "Full URLs (including query strings) leak to other sites." : "Referrer data is limited." }
    : { header: "referrer-policy", value: null, status: "info", note: "Browser default (strict-origin-when-cross-origin) applies." });
  const permissions = get("permissions-policy");
  out.push({ header: "permissions-policy", value: permissions, status: permissions ? "good" : "info", note: permissions ? "Powerful features are scoped." : "No Permissions-Policy; camera/microphone/geolocation follow browser defaults." });
  const coop = get("cross-origin-opener-policy");
  out.push({ header: "cross-origin-opener-policy", value: coop, status: coop ? "good" : "info", note: coop ? "Cross-origin windows cannot reach this one." : "No COOP; cross-origin popups keep a reference to this window." });
  return out;
}

function headerFix(header: string): string {
  switch (header) {
    case "content-security-policy": return "Start from: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'. Aktion needs style-src 'unsafe-inline' (or nonces) for its injected <style> elements, and never needs 'unsafe-eval'.";
    case "strict-transport-security": return "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.";
    case "x-content-type-options": return "Send X-Content-Type-Options: nosniff.";
    case "x-frame-options": return "Send frame-ancestors 'self' in your CSP (or X-Frame-Options: SAMEORIGIN).";
    case "referrer-policy": return "Send Referrer-Policy: strict-origin-when-cross-origin.";
    default: return "Set it on the server response.";
  }
}

/** Read all three storage areas from the page. Every read is guarded — storage may be blocked. */
export function readPageStorage(): { local: Array<[string, string]>; session: Array<[string, string]>; cookies: Array<[string, string]> } {
  const read = (area: Storage | undefined): Array<[string, string]> => {
    const out: Array<[string, string]> = [];
    try {
      if (!area) return out;
      for (let i = 0; i < area.length; i += 1) {
        const key = area.key(i);
        if (key === null || key.startsWith("aktion-devtools")) continue;
        out.push([key, area.getItem(key) ?? ""]);
      }
    } catch {
      /* blocked */
    }
    return out;
  };
  let cookies: Array<[string, string]> = [];
  try {
    cookies = (document.cookie || "").split(";").map((c) => c.trim()).filter(Boolean).map((c) => {
      const eq = c.indexOf("=");
      const name = eq < 0 ? c : c.slice(0, eq);
      const value = eq < 0 ? "" : c.slice(eq + 1);
      let decoded = value;
      try { decoded = decodeURIComponent(value); } catch { /* raw */ }
      return [name, decoded] as [string, string];
    });
  } catch {
    cookies = [];
  }
  return {
    local: read(typeof localStorage !== "undefined" ? localStorage : undefined),
    session: read(typeof sessionStorage !== "undefined" ? sessionStorage : undefined),
    cookies,
  };
}
