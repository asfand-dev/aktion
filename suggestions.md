# Codebase Optimization Suggestions

A review of `src/**` for redundant or replaceable language features and small
patterns that can be tightened without changing behaviour. Items are grouped
by impact and each one references the concrete files / lines that motivate
the suggestion. Nothing here proposes a behavioural change — every item is
either a deduplication, a stronger type, or a modernization of an idiom that
the rest of the codebase already uses elsewhere.

---

## 1. High-impact deduplications

### 1.1 Three near-identical URL/scheme sanitizers

Three places implement essentially the same "strip control chars, reject
`//`, allowlist the scheme" algorithm with the same regex
`/^([a-zA-Z][a-zA-Z0-9+.\-]*):/`:

- `sanitiseHref(raw, fallback)` — `src/library/utils.ts` (~L125)
- `sanitiseImageSrc(raw)` — `src/library/utils.ts` (~L172)
- `sanitizeMarkdownHref(raw)` — `src/library/components/content.ts` (~L454)

Suggestion: collapse them into a single factory in `src/library/utils.ts`,
e.g.

```ts
type SanitiseUrlOptions = {
  schemes: ReadonlySet<string>;
  fallback: string;
  allowDataImagesOnly?: boolean;
};

export function sanitiseUrl(raw: unknown, opts: SanitiseUrlOptions): string {
  // single implementation
}

export const sanitiseHref      = (raw: unknown, fallback = "#") =>
  sanitiseUrl(raw, { schemes: SAFE_HREF_SCHEMES, fallback });

export const sanitiseImageSrc  = (raw: unknown) =>
  sanitiseUrl(raw, { schemes: SAFE_IMAGE_SCHEMES, fallback: "", allowDataImagesOnly: true });
```

`sanitizeMarkdownHref` would then become a one-liner that calls
`sanitiseUrl` with `{ schemes: new Set(["http","https","mailto","tel"]), fallback: "#" }`
and pipes the result through `escapeAttr`. This removes one regex, two scheme
allowlists, and ~60 lines of near-identical code.

### 1.2 Two `escapeAttr` implementations

- `escapeAttr` in `src/library/utils.ts` (~L74)
- `escapeAttr` in `src/library/components/content.ts` (~L472)

The two differ only in whether they replace `<` / `>` (the content.ts version
does, the utils.ts version does not). Move the stricter one into
`src/library/utils.ts`, export it, delete the local copy, and switch the
Markdown renderer to import it.

### 1.3 Two `parseRatio` helpers

- `parseRatio` — `src/library/components/layout.ts` (~L364)
- `parseMediaRatio` — `src/library/components/patterns.ts` (~L1038)

The bodies differ only in `den !== 0` vs `den > 0`. Promote one of them into
`src/library/utils.ts` (e.g. `parseAspectRatio`) and have both call sites use
it. Two functions become one, and the stricter `den > 0` rule applies
uniformly (it is the safer default).

### 1.4 Three `toNumber`/`asNumber` variants

- `toNumber` — `src/runtime/builtins.ts` (~L11)
- `toNumber` — `src/runtime/evaluator.ts` (~L553)
- `asNumber` — `src/library/utils.ts` (~L62)

All three coerce `unknown -> number` with a `0` (or supplied) fallback. The
`utils.ts` version already takes a `fallback` parameter — adopt it everywhere
and delete the other two. `runtime/builtins.ts` and `runtime/evaluator.ts`
can both `import { asNumber as toNumber } from "../library/utils.js"`.

### 1.5 Two `stringify` functions

- `stringify` — `src/runtime/evaluator.ts` (~L564)
- `stringify` — `src/runtime/scripts.ts` (~L316)

Behaviour differs only in how `null`/`undefined` is rendered (empty string vs
`"null"`). Replace with a single `stringifyValue(value, { nullAs: "" | "null" })`
in a shared `runtime/format.ts` (or `library/utils.ts`). The duplicate
`try { JSON.stringify } catch { String }` block disappears.

### 1.6 Three `default*Icon` switch tables

- `defaultCalloutIcon(variant)` — `src/library/components/content.ts` (~L265)
- `defaultNoteIcon(tone)` — `src/library/components/content.ts` (~L403)
- `defaultToastIcon(tone)` — `src/library/components/feedback.ts` (~L883)

All three are short `switch (tone)` ladders that map a small set of tone
strings to icon names with substantial overlap (`success`, `warning`,
`info`, `danger`/`error`). Replace with one shared `Record<string, string>`
plus optional per-component overrides:

```ts
const TONE_ICON_DEFAULT: Record<string, string> = {
  success: "circle-check",
  warning: "triangle-exclamation",
  danger: "circle-xmark",
  error: "circle-xmark",
  info: "circle-info",
};
export const defaultToneIcon = (tone: string, overrides: Record<string,string> = {}) =>
  overrides[tone] ?? TONE_ICON_DEFAULT[tone] ?? "circle-info";
```

Three switches collapse to one lookup table.

### 1.7 Repeated "is component node" predicate

The exact pattern below appears in **four** files:

```ts
value !== null && typeof value === "object" &&
  (value as { __kind?: string }).__kind === "Component"
```

Locations:
- `src/library/components/data.ts` (~L59)
- `src/library/components/feedback.ts` (~L80)
- `src/library/components/navigation.ts` (~L69)
- `src/library/components/patterns.ts` (~L774)

Plus a structurally similar check in `src/library/components/chat.ts`
(`extractFollowUp`) that also pulls `args` out of the same object.

Suggestion: declare a single shared interface and a typed predicate (e.g.
in `src/runtime/types.ts` or `src/library/types.ts`):

```ts
export interface ComponentNode {
  readonly __kind: "Component";
  readonly name: string;
  readonly args: ReadonlyArray<unknown>;
  readonly props?: Record<string, unknown>;
}
export const isComponentNode = (v: unknown): v is ComponentNode =>
  typeof v === "object" && v !== null &&
  (v as { __kind?: unknown }).__kind === "Component";
```

Every call site becomes `if (isComponentNode(value)) { … }`, the structural
cast disappears, and TypeScript narrows `value` to the proper shape.

### 1.8 Repeated "open + outside-click" pattern

The same `useInstanceState<boolean>("open", false)` + `setOpen()` +
`installDismissListeners(...)` pattern is implemented three times for very
similar dropdown-style UIs:

- `src/library/components/menu.ts` (`DropdownMenu`, ~L95)
- `src/library/components/feedback.ts` (`Popover`, ~L605)
- `src/library/components/forms.ts` (`Combobox`, ~L629)

Suggestion: extract a tiny helper that encapsulates the pattern:

```ts
function useDismissibleOpen(
  helpers: RenderHelpers,
  root: HTMLElement,
  opts?: { onClose?: () => void },
): { open: boolean; setOpen: (v: boolean) => void } { … }
```

This removes ~30 lines of identical wiring per component and centralizes the
escape-key / outside-click semantics.

### 1.9 Inline `runAction({ kind: "Action", steps: [{ kind: "Set", … }] })`

Repeated 7 times across components (`forms.ts`, `feedback.ts`,
`navigation.ts`, `chat.ts`, …). Add small builders, e.g. in
`src/runtime/builtins.ts` next to the action-step types:

```ts
export const setStateAction = (name: string, value: unknown): ActionPayload =>
  ({ kind: "Action", steps: [{ kind: "Set", name, value }] });

export const toAssistantAction = (message: string): ActionPayload =>
  ({ kind: "Action", steps: [{ kind: "ToAssistant", message }] });
```

Call sites become `helpers.runAction(setStateAction(name, value))`, which
also makes future changes to the `ActionPayload` envelope a one-line edit.

---

## 2. Modernization opportunities

### 2.1 `Object.assign({}, x, { … })` → object spread

- `src/prompt/generator.ts` (~L1042)
- `src/prompt/generator.ts` (~L1130)

```ts
// before
todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, { done: !x.done }) : x);
// after
todos.map(x => x.id === ctx.args.id ? { ...x, done: !x.done } : x);
```

These appear inside generated prompt examples (LLM-facing strings) so the
change also doubles as guidance for what idiom the LLM should emit.

### 2.2 Explicit `any` on the AsyncFunction constructor

- `src/runtime/scripts.ts` (~L283)

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AsyncFunctionCtor: any = Object.getPrototypeOf(async function () {}).constructor;
```

Tighten the type and drop the eslint-disable:

```ts
type AsyncFn = (this: unknown, ...a: unknown[]) => Promise<unknown>;
type AsyncFnCtor = new (...args: string[]) => AsyncFn;
const AsyncFunctionCtor =
  Object.getPrototypeOf(async function () {}).constructor as AsyncFnCtor;
```

The `tsconfig.json` already sets `"strict": true` and
`"noUncheckedIndexedAccess": true` — a single typed alias here keeps the
file consistent with the rest.

### 2.3 One-line wrapper that hides nothing

- `src/runtime/scripts.ts` (~L312):

```ts
function snapshotState(state: StateStore): Record<string, unknown> {
  return state.snapshot();
}
```

This wrapper has one caller (line 237). Inline it:
`values: () => opts.state.snapshot()`.

### 2.4 `event.currentTarget ?? event.target` cast

This pattern is repeated 8 times (`forms.ts` ×2, `menu.ts` ×2,
`feedback.ts` ×2, `layout.ts`, `renderer/renderer.ts`). Centralise:

```ts
// in src/library/utils.ts
export const eventTarget = <T extends Element>(event: Event): T | null =>
  ((event.currentTarget ?? event.target) as T | null);
```

### 2.5 `Math.max(1, Math.min(N, Math.floor(Number(props.x ?? "auto"))))`

Variants of this appear 4 times in `src/library/components/patterns.ts`
(L165, L286, L795, L894). Add a typed helper next to `asNumber`:

```ts
export const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(asNumber(value, fallback));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
};
```

Removes the `Number(props.x ?? "auto")` idiom (which silently produces `NaN`
that then has to be clamped) and replaces it with one well-named call.

### 2.6 `Array.isArray(x) ? x : []` inlined despite `asArray` existing

`asArray` (in `src/library/utils.ts`) already does this. There are still
inlined versions in `src/runtime/builtins.ts` (`toArray`) and
`src/runtime/evaluator.ts`. Same recommendation as 1.4 — converge on the one
in `library/utils.ts`.

### 2.7 `switch` ladders that are pure `key -> constant` mappings

The codebase contains several `switch` statements whose only purpose is a
key-to-constant mapping (no fall-through, no side effects). Beyond the three
`default*Icon` ones already covered (1.6), candidates worth a second look:

- `compare(op, a, b)` in `src/runtime/builtins.ts` — string switch over 7
  arms; a `Record<string, (a, b) => boolean>` would let it inline
  comparisons cleanly and remove the `default: return false` arm.
- Tone-to-class maps in `feedback.ts` / `patterns.ts`.

Where the body is genuinely a lookup, prefer a `Record<string, T>` with a
`?? defaultValue` fallback. Where the cases involve real logic (e.g. the
parser / evaluator dispatch on AST `kind`), keep the `switch` — it gives
TypeScript exhaustiveness checking that an object lookup cannot.

### 2.8 `import { type X, … }` mixed with `import type { X }`

Most files use `import type` correctly, but a handful (e.g. `runtime/actions.ts`,
`library/components/router.ts`) mix value and type imports in the same line.
Splitting them gives slightly cleaner emit and matches the dominant style.
This is a low-effort lint pass, not a semantic change.

---

## 3. Stylistic / consistency cleanups

### 3.1 `function` declarations vs arrow `const`

The codebase mixes both:

- `runtime/builtins.ts` defines helpers as `const x = (…) => …`.
- `runtime/evaluator.ts` and `library/components/content.ts` use
  `function x(…) { … }` for the same kind of helpers.

Pick one convention per area:
- **Module-private helpers** → `const x = (…) => …` (matches `builtins.ts`).
- **Public exports** → `export function x(…)` (better stack traces, hoisting).

This is purely cosmetic but removes a frequent reviewer question.

### 3.2 `interface` vs `type` aliases

The codebase uses both `interface` and `type` for object shapes more or less
arbitrarily. Recommended convention:

- `interface` for object shapes that may grow (component specs, helpers).
- `type` for unions, intersections, mapped types, and tuples.

Mostly already followed; a one-pass cleanup in `runtime/builtins.ts`
(`ActionStep`, `ActionPayload`) would tidy the remaining inconsistencies.

### 3.3 `readonly` on configuration arrays

Several module-level constants are mutable arrays / sets even though they
are never written to:

- `SAFE_HREF_SCHEMES`, `SAFE_IMAGE_SCHEMES` in `src/library/utils.ts`
- `componentGroups` in `src/library/index.ts`

Mark them `as const` (for arrays of literals) or `Readonly<…>` so accidental
mutation surfaces at compile-time.

### 3.4 Empty `catch {}` blocks

There are six `} catch {` swallow-all blocks across `element.ts` (×4),
`runtime/scripts.ts`, `runtime/evaluator.ts`, `icons/index.ts`,
`library/components/data.ts`, and `theme/index.ts`. Each one is
*intentional* (browser-compat fall-throughs, console-only error reporting),
but they all look identical to a reviewer.

Either:
- Add a one-line comment on every empty catch explaining *why* it is safe to
  swallow, or
- Wrap the pattern in a `safe(fn)` helper that takes a label and a fallback,
  so intent is encoded in the call site.

### 3.5 Project conventions worth documenting

While reviewing, the following project-wide conventions were already
followed and are worth capturing in `coding-gen-skill.md` / `README.md` so
they are preserved:

- No `var` anywhere — `const` / `let` only.
- No `enum` declarations — preferring `as const` literal unions and
  `Record<string, …>` lookup tables (this is the right call; `enum` adds
  runtime weight and is awkward in `"type": "module"` builds).
- No `namespace` declarations.
- No `Function` constructor outside the deliberate `AsyncFunctionCtor` in
  `runtime/scripts.ts`.
- ESM-only (`"type": "module"`), `target: "ES2022"`, `strict: true`,
  `noUncheckedIndexedAccess: true`.

Documenting these as explicit project rules makes them easier to enforce in
review and prevents drift.

---

## 4. Suggested order of execution

If the goal is to land these incrementally without disturbing behaviour:

1. **Pure dedup, no API change** — 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.3.
2. **New shared helpers, call sites migrate one at a time** — 1.7, 1.9,
   2.4, 2.5, 2.6.
3. **Refactors that touch component internals** — 1.8, 2.2.
4. **Cosmetic / convention** — 2.7, 2.8, 3.1–3.5.

Each step is independently mergeable and individually testable against the
existing `vitest` suite — there is no need to bundle them.
