/**
 * The runtime's own version.
 *
 * Reported to DevTools (so the panel shows the runtime a page actually loaded,
 * not the panel's version) and exported for hosts that log or gate on it. The
 * release workflow bumps it with package.json — see the `extra-files` entry in
 * `release-please-config.json` — and a test fails if the two ever disagree.
 */
export declare const VERSION = "0.7.0";
