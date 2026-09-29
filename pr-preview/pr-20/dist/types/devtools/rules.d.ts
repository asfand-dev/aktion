import { NetworkRule } from './protocol.js';
/** Does one rule apply to this request? */
export declare function ruleMatches(rule: NetworkRule, method: string, url: string): boolean;
/** First enabled rule that applies, or `null`. */
export declare function findMatchingRule(rules: ReadonlyArray<NetworkRule>, method: string, url: string): NetworkRule | null;
/** A rule's effect on one request, in the shape the HTTP tap's gate returns. */
export interface RuleVerdict {
    response?: {
        status: number;
        headers: Record<string, string>;
        body: unknown;
    };
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
export declare function verdictFor(rule: NetworkRule): RuleVerdict;
/**
 * Fresh rule with sensible defaults, for the panel's "add rule" button.
 *
 * `delayMs` defaults to 0, not to a "nice" latency: a `mock` or `fail` rule
 * that quietly added a second of delay would make every mocked response look
 * slow and every failure look like a timeout. A rule whose *purpose* is latency
 * passes the number it wants.
 */
export declare function newRule(seed?: Partial<NetworkRule>): NetworkRule;
