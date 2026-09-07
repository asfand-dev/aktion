/**
 * Extra runtime namespaces exposed to Aktion programs (suggestions-global
 * Parts V.2, XIII.2): `$style` (bounded styling helpers) and `$rules`
 * (composable validators). Both are pure — no side effects — and safe to
 * call from any expression / action / effect / lambda.
 */
export declare const Style: {
    /**
     * Classname helper (clsx-style). Accepts strings, arrays, and objects
     * `{ "is-active": cond }`; returns a space-joined, de-duped class string.
     * Tokens that aren't valid CSS identifiers are dropped.
     */
    readonly cx: (...args: unknown[]) => string;
    /**
     * Build a safe `linear-gradient(...)` from an array of color stops (and an
     * optional angle in degrees). Returns "" if fewer than two valid stops.
     */
    readonly gradient: (stops: unknown, angle?: unknown) => string;
    /** color-mix wrapper: blend a color with transparent at `amount` (0–1). */
    readonly alpha: (color: unknown, amount: unknown) => string;
    /** Build a responsive `clamp(min, preferred, max)` size. */
    readonly clamp: (min: unknown, preferred: unknown, max: unknown) => string;
    /**
     * Resolve a dotted token path to its CSS variable: `style.token("spacing.l")`
     * → `var(--rui-spacing-l)`, `style.token("colors.primary")` →
     * `var(--rui-color-primary)`. Falls back to "" for unknown shapes.
     */
    readonly token: (path: unknown) => string;
    /** Serialize a plain object of CSS declarations to a sanitised style string. */
    readonly toStyle: (obj: unknown) => string;
};
export type StyleNamespace = typeof Style;
/**
 * A validator returns an error message (invalid), null (valid), or a Promise
 * of either — async validators (V.2 `asyncCustom`) resolve server-side checks
 * like username uniqueness.
 */
type Validator = (value: unknown) => string | null | Promise<string | null>;
export declare const Rules: {
    readonly required: (message?: string) => Validator;
    readonly email: (message?: string) => Validator;
    readonly url: (message?: string) => Validator;
    readonly min: (n: number, message?: string) => Validator;
    readonly max: (n: number, message?: string) => Validator;
    readonly minLength: (n: number, message?: string) => Validator;
    readonly maxLength: (n: number, message?: string) => Validator;
    readonly pattern: (re: unknown, message?: string) => Validator;
    readonly oneOf: (options: unknown[], message?: string) => Validator;
    /**
     * A whole number. `min`/`max` bound the magnitude but say nothing about the
     * step, so `2.5` passes `min(1)` + `max(10)` — which is wrong for every count,
     * port, weight and retry limit a form asks for.
     *
     * `Number("")` is `0` and `Number(" ")` is `0` too, so the value is tested as
     * TEXT before it is coerced: a field containing only spaces is empty, not
     * zero. `isEmpty` still lets a genuinely blank field through untouched —
     * "this is not a whole number" is not the complaint to make about a field the
     * operator has not filled in yet; that is `required`'s job.
     */
    readonly integer: (message?: string) => Validator;
    /**
     * An inclusive numeric range — `min(lo)` and `max(hi)` in one rule, so the
     * message can name both ends. A field that fails one bound almost always
     * wants to be told the other.
     */
    readonly range: (lo: number, hi: number, message?: string) => Validator;
    /**
     * A TCP/UDP port: a whole number in `[1, 65535]`. Port `0` is excluded
     * deliberately — the kernel reads it as "assign me one", which is never what
     * a form field that names a destination means.
     */
    readonly port: (message?: string) => Validator;
    /** A dotted-quad IPv4 address, e.g. `192.168.0.10`. */
    readonly ipv4: (message?: string) => Validator;
    /** An IPv6 address, `::` shorthand and IPv4-mapped tails included. */
    readonly ipv6: (message?: string) => Validator;
    /** Either family — for a field that accepts whatever the network runs. */
    readonly ip: (message?: string) => Validator;
    /**
     * A CIDR block — `address/prefix`, with the prefix bounded by the address
     * family (`/0`–`/32` for IPv4, `/0`–`/128` for IPv6). A bare address without
     * a prefix is rejected: `10.0.0.0` and `10.0.0.0/8` mean different things,
     * and silently accepting the first is how a subnet field ends up meaning a
     * single host.
     */
    readonly cidr: (message?: string) => Validator;
    /**
     * A duration — `5m`, `250ms`, `2h`, `PT30S`, `P1DT12H` — optionally inside an
     * inclusive range given in SECONDS.
     *
     * `bounds` is `{min, max}`, either half omissible, and a STRING in that
     * position is read as the message so the common `duration("…")` reads
     * naturally. Both bounds are in seconds because that is the unit
     * `$util.duration` speaks; the grammar the operator types in is theirs to
     * choose, and `2h`, `120m` and `PT2H` all satisfy `{max: 7200}` alike.
     *
     * That is the whole reason this is not `pattern(…)` plus `range(…)`: a
     * regular expression can say whether `90m` is well-formed but not whether it
     * is under a two-hour ceiling, and a numeric range cannot see through the
     * unit at all. Cooldowns, TTLs, timeouts, poll intervals and retention
     * windows all want exactly this pair of questions asked together.
     *
     * An out-of-range value and a malformed one report the SAME message by
     * default. Pass your own when the two are worth separating — a field with a
     * documented floor usually is.
     */
    readonly duration: (bounds?: unknown, message?: string) => Validator;
    readonly matches: (other: unknown, message?: string) => Validator;
    readonly custom: (fn: unknown, message?: string) => Validator;
    /**
     * Async validator (V.2) — `fn(value)` may return a Promise resolving to
     * true/null (valid), false (invalid → `message`), or an error string. Use
     * for server-side checks (e.g. username uniqueness). `$form` awaits these
     * before submitting; a rejected promise counts as invalid.
     */
    readonly asyncCustom: (fn: unknown, message?: string) => Validator;
    /**
     * Run a list of validators against a value; returns the first error
     * message, or null when all pass. Stays fully synchronous for sync
     * validators; returns a Promise only when an async validator is hit.
     */
    readonly validate: (value: unknown, validators: unknown) => string | null | Promise<string | null>;
    /**
     * Validate an object of `{ field: value }` against a schema of
     * `{ field: [validators] }`. Returns `{ field: message }` for failures
     * (empty object when valid) — or a Promise of it when any validator in the
     * schema is async.
     */
    readonly validateAll: (values: unknown, schema: unknown) => Record<string, string> | Promise<Record<string, string>>;
};
export type RulesNamespace = typeof Rules;
export {};
