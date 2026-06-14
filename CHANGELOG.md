# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Pre-1.0 note.** While the runtime is at `0.x`, minor versions may include
> behavioural changes. See [Stability & versioning](#stability--versioning) for
> what is considered stable vs experimental and how the generated system
> prompt is versioned.

## [Unreleased]

### Added

- **`$toast` notifications now auto-render.** `$toast.show` / `.success` /
  `.error` / `.info` / `.warning` display the toast on their own — you no
  longer wire a `Toasts($toast.items.map(...))` into `$app`. The runtime
  appends a managed toast layer (stacked top-right) to the UI root. Rendering
  `$toast.items` yourself still works for custom placement and transparently
  opts out of the auto-layer, so existing programs never double-render.
- **Third-party / imperative widget interop** — first-class primitives for
  embedding libraries that own their own DOM (charts, maps, editors, payment
  elements, captchas):
  - **`Mount({ setup, update?, cleanup?, props?, tag?, sx? })`** — a managed
    imperative-component host with a clean lifecycle: `setup(node, props)` runs
    once after attach and returns an instance handle, `update(instance, props)`
    runs when the (shallow-compared) `props` bag changes, and
    `cleanup(instance)` runs on unmount. Aktion owns + preserves the host so the
    widget is never rebuilt mid-session.
  - **`WebComponent(tag, { attributes?, properties?, on?, children? })`** —
    render + hydrate any native custom element with reactive attributes, JS
    properties, and event hooks (handlers stay current across renders).
  - **`$script({ src, global?, type?, as?, attributes? })`** — load an external
    UMD/ESM script or stylesheet once (de-duplicated per `src`), exposing a
    reactive `{ ready, loading, error, value }` bag. `value` reads
    `window[global]` once ready.
  - **`$dom`** — a managed observer namespace: `$dom.onResize(node, cb)`,
    `$dom.onIntersect(node, cb, opts?)`, `$dom.onMutation(node, cb, opts?)`
    (auto-disposed on replan), and `$dom.measure(node)` →
    `{ rect, scroll, viewport }`.
  - Interop hosts carry `data-rui-preserve`; the morph reconciler keeps the live
    element and never touches the DOM the widget owns (attribute changes still
    flow additively).
- **`$head({ title, titleTemplate?, meta?, og?, twitter?, link?, jsonLd?, base?, htmlAttrs? })`**
  — a reactive document-head manager. Sets `document.title`, meta tags,
  canonical/alternate links, Open Graph + Twitter cards, JSON-LD, and `<html>`
  attributes. Per-route calls compose (later wins on conflicts), and
  `renderToString` now returns the resolved `head` + `headAttrs` so SSR pages are
  crawlable.
- **Deeper style-migration helpers** — `tailwindToSx` now maps arbitrary values
  (`w-[327px]`, `text-[#abc]`, `rounded-[12px]`, `z-[60]`), an extended
  color-shade palette, backdrop blur, background sizing, and more cursors. New
  **`cssToSx(cssText)`** (raw CSS declaration string / rule → `sx`) and
  **`styledToSx(template)`** (styled-components / emotion template → `sx`)
  extractors complement it; all three surface anything they can't map under
  `_unmapped`.

- **Member-level editor intelligence** — the DOM-free `aktion-runtime/language`
  surface now models every namespace member and reactive resource bag, so the
  VS Code extension and the docs playground complete, hover, highlight, and
  show signature help for member access after a `.`: `$util.*` (incl. nested
  `$util.style` / `$util.rules` / `$util.url`), `$storage.*`
  (`.local`/`.session`/`.cookies`), `$console.*`, `$toast.*`, the reactive
  `route` handle, and the bag a factory builtin returns (`$http`, `$query`,
  `$mutation`, `$socket`, `$sse`, `$form`, `$store`). The member catalog ships
  as data (`namespaceCatalog`, `factoryResourceCatalog`). Object-style component
  arguments (`{ variant: "primary" }`) now get their keys semantically tagged as
  properties too.
- **Config-object key intelligence** — the config-taking builtins (`$http`,
  `$query`, `$mutation`, `$socket`, `$sse`, `$form`, `$store`, `$theme`,
  `$i18n`) now complete and hover their accepted config keys inside
  `$builtin({ … })` (e.g. `url` / `method` / `refetchInterval` / `colors`),
  shipped as data via `findBuiltinConfig` and mirrored in the docs playground.

- **`$query({ url, key?, ttl? })`** — a cached, deduplicated read built on the
  `$http` runtime. Queries sharing a `key` (or the same derived
  method + url + query + body) reuse one in-flight request and one reactive
  bag across components; optional `ttl` (ms) auto-refetches stale data.
- **`$mutation({ url, method? })`** — a deferred write that fires only on
  `.mutate(overrides?)` (method defaults to `POST`). Exposes reactive
  `.loading` / `.error` / `.data`, plus `.reset()` and an `onDone` settle hook.
- **`$toast`** — a reserved imperative notification namespace
  (`$toast.show/.success/.error/.info/.warning`, `.dismiss(id)`, `.clear()`)
  backed by a reactive `$toast.items` list, replacing hand-managed toast arrays.
- **Hooks `$ref`, `$reducer`, `$id`** — mirroring React's `useRef`,
  `useReducer`, and `useId`.
- **`OnMount` wrapper** — runs `onMount` / `onUnmount` callbacks with the
  wrapped DOM node, giving authors a ref/lifecycle hook the Aktion way.
- **`$optimistic(() => { … })`** builtin — runs a callback that writes state
  optimistically and rolls the store back if it throws (or its returned
  promise rejects). Replaces the never-shipped `optimistic` keyword.
- **`$util` collection/object helpers** — `omit`, `chunk`, `flatten`, `zip`,
  `partition`, `keyBy`, `cloneDeep`, `merge`.
- **History-mode routing** — `router-mode="history"` and `router-base` on
  `<aktion-app>` for clean `/path` URLs via the History API (default stays
  hash-based).
- **Dev/strict mode** — the `strict` attribute on `<aktion-app>` surfaces
  silent failures as `console.warn`s (unknown identifiers; trailing `{...}`
  objects passed to a user component whose keys match no parameter).
- **Accessibility** — `Modal` focus trap + restore, `aria-labelledby`, and
  Escape-to-close; `Toast` uses `role="alert"` (danger) / `role="status"`;
  `NavLink` sets `aria-current="page"`.
- **Editor DX** — scope-aware completions (`getCompletions` now surfaces the
  document's own atoms, components, and actions), a VS Code document-formatting
  provider (format-on-save via `formatProgram`), and a real v3 source map from
  the Vite plugin (with `sourcesContent`) so frames resolve to the `.aktion`
  file instead of the generated JSON blob.

### Changed

- `cleanup` and `$emit` resolve to real bound functions, so they keep working
  when aliased or called from inside nested blocks, rather than being detected
  only by literal callee name.
- Documented the **full-re-render caveat** prominently: path-tracking applies
  to `$name = value` atoms only; hook setters, `$http`/`$query`/`$mutation`,
  timers, effects, and `$emit` trigger a full re-render.

### Removed

- The non-standard `optimistic` function keyword and its dead rollback
  machinery (`ActionDeclRunner`, the `ActionDeclaration.optimistic` AST field).
  Use the JS-compliant `$optimistic(...)` builtin instead.

## [0.5.5] — baseline

- First version tracked by this changelog. Streaming parser, schema-as-truth
  validation, the morph reconciler, the component library, themes, the
  system-prompt generator, the delta protocol, the visual editor, the testing
  library, DevTools, the multi-file linker, and the Vite plugin.

---

## Stability & versioning

Aktion is pre-1.0. The following reflects the intended stability of each
surface; anything not listed should be treated as experimental.

| Surface | Stability | Notes |
| --- | --- | --- |
| `<aktion-app>` attributes / properties / methods / events | **Stable** | Additive changes only within `0.5.x`. |
| Aktion language core (`$name` atoms, components/actions, `$effect`, `$http`, `$router`, `$store`) | **Stable** | The authoring surface the system prompt teaches. |
| `$query` / `$mutation` / `$toast` / `$ref` / `$reducer` / `$id` / `OnMount` / `$optimistic` | **Experimental** | Newly added; API may refine before 1.0. |
| Component library names + props | **Stable** | Validated against the closed schema; removals are breaking. |
| Themes | **Stable** | Token additions are non-breaking. |
| `aktion-runtime/language` (diagnostics / completions / hover / formatting) | **Stable (data shape)** | Output content may grow. |
| `aktion-runtime/vite` plugin | **Stable** | Emitted module shape is versioned via `COMPILED_PROGRAM_VERSION`. |
| `aktion-runtime/test` and `aktion-runtime/devtools` | **Stable** | |
| Generated system prompt (`getSystemPrompt` / `system_prompt.txt`) | **Versioned, not byte-stable** | Section *content* evolves as components/builtins change; the *structure* (sections, modes) is stable. Pin a runtime version if you cache the prompt. |
| `strict` mode warning messages | **Experimental** | Wording may change; presence of a warning is the contract, not its exact text. |

### SemVer policy (pre-1.0)

- **Patch** (`0.5.x`): bug fixes, additive components/builtins, documentation.
- **Minor** (`0.x.0`): may include behavioural changes flagged in this file.
- Breaking removals/renames are called out under **Removed** / **Changed** with
  a migration note.
