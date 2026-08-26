/**
 * Aktion DevTools — network request rules.
 *
 * Pure matching + verdict logic for {@link NetworkRule}, kept out of both the
 * HTTP runtime (which owns transport, not simulation) and the panel (which
 * owns UI, not request-time decisions). The host element imports this to build
 * its `HttpDevtoolsTap.gate`; the panel imports it to preview which rule would
 * win for a given URL, so the list you see and the behaviour you get come from
 * one implementation.
 *
 * Semantics, deliberately small enough to hold in your head:
 *
 *   - Rules are evaluated **in order**; the first enabled match wins.
 *   - `pattern` is a substring test, upgraded to a glob when it contains `*`.
 *     An empty pattern matches everything (the "offline" switch).
 *   - `method` narrows to one verb; omitted means any.
 */

import type { NetworkRule } from "./protocol.js";

/** Turn a `*`-glob into an anchored regular expression. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** Does one rule apply to this request? */
export function ruleMatches(rule: NetworkRule, method: string, url: string): boolean {
  if (!rule.enabled) return false;
  if (rule.method && rule.method.toUpperCase() !== method.toUpperCase()) return false;
  const pattern = rule.pattern.trim();
  if (pattern === "" || pattern === "*") return true;
  if (pattern.includes("*")) {
    try {
      return globToRegExp(pattern).test(url);
    } catch {
      return false;
    }
  }
  return url.includes(pattern);
}

/** First enabled rule that applies, or `null`. */
export function findMatchingRule(
  rules: ReadonlyArray<NetworkRule>,
  method: string,
  url: string,
): NetworkRule | null {
  for (const rule of rules) {
    if (ruleMatches(rule, method, url)) return rule;
  }
  return null;
}

/** A rule's effect on one request, in the shape the HTTP tap's gate returns. */
export interface RuleVerdict {
  response?: { status: number; headers: Record<string, string>; body: unknown };
  error?: string;
  rule?: string;
  delayMs?: number;
}

/**
 * Translate a matched rule into a verdict.
 *
 * `mock` bodies are parsed as JSON when they can be, because that is what a
 * program consuming `res.data` expects; a body that is not valid JSON is passed
 * through as a string rather than rejected, so `body: "hello"` works too.
 */
export function verdictFor(rule: NetworkRule): RuleVerdict {
  const label = rule.label || rule.pattern || rule.action;
  switch (rule.action) {
    case "delay":
      return { delayMs: Math.max(0, rule.delayMs ?? 0), rule: label };
    case "fail":
      return { error: rule.message || `blocked by DevTools rule "${label}"`, rule: label, delayMs: rule.delayMs };
    case "offline":
      return { error: rule.message || "Failed to fetch (DevTools offline mode)", rule: label, delayMs: rule.delayMs };
    case "mock": {
      let body: unknown = rule.body ?? "";
      if (typeof rule.body === "string" && rule.body.trim() !== "") {
        try { body = JSON.parse(rule.body); } catch { body = rule.body; }
      }
      const headers: Record<string, string> = { "content-type": "application/json", ...(rule.headers ?? {}) };
      return {
        response: { status: rule.status ?? 200, headers, body },
        rule: label,
        delayMs: rule.delayMs,
      };
    }
    default:
      return { rule: label };
  }
}

/**
 * Fresh rule with sensible defaults, for the panel's "add rule" button.
 *
 * `delayMs` defaults to 0, not to a "nice" latency: a `mock` or `fail` rule
 * that quietly added a second of delay would make every mocked response look
 * slow and every failure look like a timeout. A rule whose *purpose* is latency
 * passes the number it wants.
 */
export function newRule(seed: Partial<NetworkRule> = {}): NetworkRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 9)}`,
    pattern: "",
    enabled: true,
    action: "delay",
    delayMs: 0,
    status: 200,
    body: "",
    ...seed,
  };
}
