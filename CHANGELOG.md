# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Published releases are listed at
[github.com/asfand-dev/aktion/releases](https://github.com/asfand-dev/aktion/releases).

> **Pre-1.0 note.** While the runtime is at `0.x`, minor versions may include
> behavioural changes. See [Stability & versioning](#stability--versioning) for
> what is considered stable vs experimental and how the generated system
> prompt is versioned.

## Unreleased

_Nothing yet._

## 0.6.0 — 2026-07-31

Two waves of work land together: a rewrite of the `corporate` theme plus seven
new components, then a library-wide prop / accessibility / security audit of
all 281 components. This is a **minor**, not a patch, because the
[SemVer policy](#semver-policy-pre-10) below scopes `0.5.x` to bug fixes and
additive surface, while this release changes documented behaviour on surfaces
the [stability table](#stability--versioning) marks **Stable** — form-control
value sync, responsive `sx`, `$head`, cookies, `.aktion` import resolution —
and removes three theme CSS variables.

> `package.json` still reads `0.5.15`; bump it to `0.6.0` in the commit that
> publishes this section.

### Added

- **Seven new components.**
  - **`Pill(label, tone?, icon?)`** — the soft tinted *state* label ("SSL
    active", "pending", "broken") that `Badge` was being misused for. `Badge`
    stays the solid high-attention chip. Tones: `neutral`, `activating`,
    `success`, `warning`, `critical`, `promoting`, `corporate`, with
    `danger` / `error` / `info` / `primary` accepted as synonyms.
  - **`LoadingDots(label?, size?, tone?)`** — three dots pulsing in sequence;
    the quieter inline loader next to `Spinner`'s rotating ring. Announces
    itself via `role="status"` + `aria-live="polite"`.
  - **`ButtonGroup(items, size?, fullWidth?)`** — buttons joined edge-to-edge
    into one continuous control (only the outer corners round, adjoining
    borders collapse). Distinct from `Buttons` (gapped) and
    `SegmentedControl` / `ToggleGroup` (padded track with a floating chip).
  - **`InputGroup(field, icon?, action?, suffix?)`** — one shared bordered
    shell and focus ring around a field plus an optional leading icon,
    trailing action and unit suffix: search boxes, password reveal,
    copy-to-clipboard, unit inputs. The nested control loses its own chrome.
  - **`CardSection(children, tone?, align?)`** — a full-bleed, semantically
    tinted band *inside* a `Card` (edge-to-edge tint with a semantic rule),
    as opposed to `Callout`'s standalone bordered notice. `Card` padding now
    flows through a `--rui-card-pad` variable so the band can bleed to the
    card edge.
  - **`ActionStripe(label, description?, icon?, value?, href?, target?, trailing?, disabled?, onClick?)`**
    — a full-width, always-interactive navigation row (a real `<button>` or
    `<a>`, with chevron affordance) for settings screens and drill-down
    lists: the row-shaped counterpart to a `Tile` grid and to the purely
    presentational `ListItem`. `target: "_blank"` also sets
    `rel="noopener noreferrer"`; `trailing` takes a `Switch` / `Badge` /
    `Avatar` whose clicks do not fire the row.
  - **`FilterPill(label, active?, count?, icon?, disabled?, onToggle?)`** — a
    *toggleable* filter control for filter bars; `onToggle` receives the next
    active state. `FilterChips` remains the already-applied, removable
    representation.
- **A theme selected by name now loads its web fonts.** `<aktion-app
  theme="corporate">` and `$theme({ name: "corporate" })` inject one
  de-duplicated `<link rel="stylesheet" data-rui-font>` for the typefaces the
  theme was designed against — previously only an explicit
  `$theme({ fonts: { import: [...] } })` did, so `corporate` silently rendered
  in `system-ui` and its whole type ladder was invisible. The mapping ships as
  data: the new **`builtInThemeFonts`** export (`corporate` → Open Sans
  400/600 + Overpass 400/600) is exported from the package root and from
  `aktion-runtime/language`, so tooling can show it without hard-coding it.
  Under a strict CSP this needs `style-src` / `font-src` for
  `https://fonts.googleapis.com` and `https://fonts.gstatic.com`; self-host
  instead by overriding `fontFamily` / `fontFamilyHeading`.
- **28 new theme tokens, all settable from `$theme({ colors, … })`** — the
  stylesheet had 411 hard-coded font sizes and ~45 hard-coded `#fff` inks that
  no theme could reach. New: `colorBorderControl` (required per theme — the
  3:1 boundary for interactive controls, kept separate from the deliberately
  faint decorative `colorBorder`); `colorLink` / `colorLinkHover` (interactive
  *text*, so `colorAccent` can stay a fill); `colorSuccessText` /
  `colorWarningText` / `colorDangerText` / `colorInfoText` (status hue painted
  as text at ≥4.5:1); `colorOnSuccess` / `colorOnWarning` / `colorOnDanger` /
  `colorOnInfo` (ink painted *on* a status fill); `colorSurfaceHover` (hover
  wash for rows that own no surface); the type-scale rungs `fontSize10`,
  `11`, `13`, `15`, `18`, `20`, `24`, `32`; and the syntax palette
  `hlKeyword`, `hlString`, `hlNumber`, `hlComment`, `hlFn`, `hlTag`, `hlAttr`,
  `hlPunct` (previously an unreachable One Dark fallback painted on light
  surfaces in five of six themes). A theme that retints a status hue must
  retint its `*Text` partner.
- **`setGlobalAccessPolicy(policy)` / `getGlobalAccessPolicy()`** and the
  `GlobalAccessPolicy` type (`"all" | "safe" | readonly string[]`) — the
  host-level knob for narrowing what a program can reach when the program text
  is not fully trusted (LLM output, a multi-tenant store, a user-editable
  template). The default `"all"` is unchanged. `"safe"` keeps collections,
  `Intl`, `RegExp`, `URL`, codecs and `console` while denying `eval`,
  `Function`, `WebAssembly`, `document`, `window`, `fetch`, `XMLHttpRequest`,
  `WebSocket`, `localStorage` and friends, and disables `$script`. A denied
  global resolves to `undefined` instead of throwing, so it behaves exactly
  like an undeclared identifier. Call it before mounting anything; the curated
  `Math` / `JSON` / `Object` / `Date` fast path and the `$http` / `storage` /
  `$socket` / `$sse` runtime namespaces stay reachable under every policy.
  Full model in [SECURITY.md](./SECURITY.md).
- **Two universal props, accepted on every component: `role` and
  `dataAttrs`.** `role` is the escape valve for an ARIA defect an app author
  cannot otherwise fix (the validator rejects undeclared props), allow-listed
  to ~40 landmark / live-region / widget roles plus `none` / `presentation`;
  anything else is dropped, because a plausible-but-wrong role is worse than
  the original defect. `dataAttrs` is a second spelling of the `data` channel
  for the six components that declare a `data` prop of their own — `LineChart`,
  `JsonTree`, `Async`, `Draggable`, `Lottie`, `QRCode` — where `data-*`
  attributes were previously unreachable.
- **759 new props across 209 of the 281 components**, in coherent families
  rather than one-offs:
  - *Field shell* — `{ disabled, label, hint, error, required, onBlur,
    onFocus, name, labelHidden }` is now one reusable block on 79 controls
    (207 of the new props), so every input-shaped component labels, describes
    and disables itself the same way and `name` makes native form submission
    work.
  - *Loading / empty / error* — `loading` on 26 components (`Form` aliases it
    `submitting`), plus `emptyText` (charts and media), `emptyLabel` (lists)
    and an `empty` node slot (`Carousel`, `Gallery`, `VirtualList`,
    `VirtualGrid`, `OrderSummary`); `Table.loadingRows`, `DataGrid.error`,
    `InfiniteList.onRetry` / `retryLabel`, `Async.retry`,
    `ErrorBoundary.onRetry`. The three empty-state spellings are not
    interchangeable.
  - *Accessibility* — `ariaLabel` on 18 components (alias `alt` on charts),
    `decorative` on the eight SVG charts, `labelHidden` on 14 inputs, `live`
    on `Callout` / `Skeleton`, `RouteView.announce`, `FocusTrap.autoFocus` /
    `restoreFocus` / `onEscape`, `Icon.title`, `ComparisonTable.caption`.
  - *Open state and placement* — `onOpenChange` on nine floating components,
    controlled `open` on `Tooltip` / `ContextMenu` / `SpeedDial`, `align` /
    `offset` / `placement`, corner `position` on `FloatingActionButton` /
    `BackToTop` / `SpeedDial`, `Drawer.width`, `Sheet.footer`,
    `BottomSheet.height`, **`Modal.onRequestClose`** (the only dismissal path
    when `open` is not a plain `$variable`) and `Modal.lazy` (skip rendering
    children while closed).
  - *Controlled values* — `Tree` gained `selectedId`, `expandedIds`,
    `checkable`, `checkedIds`, `onCheck`, `onSelect`; `TreeNode` gained
    `nodeId` and `hasChildren` (the lazy-loading half of `onToggle`);
    `Tabs.value`, `Accordion.type` + `onChange`, `Truncate.expanded`,
    `CalendarView.month`, `DataGrid.onSort` / `onSelectionChange` /
    `perPageOptions`, `MultiStepForm.onStepChange`, `FieldRepeater.onChange`,
    `DrawingCanvas.value` / `SignaturePad.value`.
  - *Whole-thing-clickable* — `href` on 14 container components (`Card`,
    `Button`, `ListItem`, `Tile`, `MediaCard`, `ProductCard`, …) so
    middle-click and open-in-new-tab work, `onClick` on 14 more,
    `onItemClick` on `Breadcrumb` / `ActivityLog` / `VirtualList` /
    `VirtualGrid` / `NotificationBell`, and `Link.download` / `Link.disabled`.
  - *Locale and currency* — `locale` (BCP-47) on `Table`, `Col`,
    `DatePicker`, `DateRangePicker`, `Calendar`, `OrderSummary`, chaining
    `Col.locale` → `Table.locale` → the viewer's browser, with `Col.currency`
    (ISO 4217, default `USD`) for `format: "currency"`. Date pickers announce
    in `locale` while keeping bound values ISO `YYYY-MM-DD`.
  - *Density* — `Card.padding` on the full `none | 3xs … 3xl` scale (`none`
    for a full-bleed body), `Box.radius` decoupled from `border`,
    `List.divided` / `List.gap`, heading `level` on `CardHeader` /
    `SectionBlock` / `FormSection`, `GridItem.rowSpan`, `CardFooter.justify`.
- **Anchored panels and full-viewport overlays now escape their clipping
  ancestors.** Menus, tooltips, selects, comboboxes, popovers, `Modal`,
  `Sheet`, `BottomSheet`, `ConfirmDialog`, toasts and the FAB are promoted into
  the browser top layer (`showPopover()`, without reparenting, so the
  reconciler's tree is unchanged) and positioned by one shared engine with
  flip, shift, offset and viewport fitting. A dropdown inside a scrolling
  table is no longer amputated, and the ad-hoc `z-index: 25/30/40/50` values
  are replaced by the `--rui-z-dropdown` (1000) / `--rui-z-popover` (1350) /
  `--rui-z-tooltip` (1500) scale. On an engine without the Popover API an
  overlay trapped by an ancestor `transform` / `filter` / `backdrop-filter` /
  `contain` / `will-change` is reported with a `console.warn` naming the
  culprit element and declaration.
- **Charts became readable without a pointer.** Every SVG chart now emits a
  visually hidden data `<table>` (the only non-pointer path to the numbers,
  since `role="img"` prunes the per-shape `<title>` tooltips), takes
  `ariaLabel` / `decorative`, renders an explicit placeholder for empty and
  loading data instead of an invisible or misaligned plot, and shares one
  axis / label / legend implementation — so `xAxisLabel`, `yAxisLabel`,
  `showLegend` and `height` behave identically across `BarChart`,
  `LineChart`, `ScatterChart`, `Histogram` and the advanced charts.
  `Series.points` (`{x, y, label}[]`) lets a series carry explicit pairs
  instead of index-positioned `values`.
- **Two new development diagnostics.** `<aktion-app strict>` now warns when a
  handler wrote a DOM attribute that the next commit reverted — naming the
  element and attribute and prescribing `helpers.setState` /
  `helpers.useInstanceState` — which is the difference between "the library is
  buggy" and "this state needs to live in the render". Unconditionally (once
  per page load) the element also warns when a host-page ancestor sets
  `transform` / `filter` / `backdrop-filter` / `perspective` / `contain` /
  `will-change`, which makes it the containing block for `position: fixed` and
  positions every fixed overlay against the embed box instead of the viewport.
  No new attributes: both ride on the existing `strict` attribute and the
  connect path.
- **Unknown components are now a lint warning, not a silent typo.**
  `getDiagnostics` / `getLintWarnings` report a `warning` for a PascalCase call
  that is neither a library component nor declared/imported in the file, with a
  "Did you mean …?" hint. `getLintWarnings(source, library?)` takes the library
  as an optional second argument; omit it and the pass is skipped, so existing
  callers are unaffected.
- **`aktion-runtime/language` gained the surface an editor actually needs** —
  `parse`, `validateProgram`, `validateProgramSchema`, `linkProgram`,
  `linkProject`, `resolveSpecifier`, `createMemoryResolver`, `builtInThemes`,
  `builtInThemeFonts`, `resolveTheme`, `sanitiseThemeTokens`, and the
  `Program`, `ParseError`, `ThemeTokens` and `LinkResult` types. Downstream
  tooling can now parse, link and validate a multi-file project, and list
  themes and their tokens, without importing anything DOM-bound and without
  hard-coding language data.
- **`aktion-language-server` (`editors/lsp/`)** — a standalone,
  dependency-free LSP server wrapping that surface: diagnostics, completions,
  hover, signature help, document symbols, definition, references, rename,
  semantic tokens and formatting over stdio, for any LSP-capable editor. Build
  it with `npm run build:lsp`.
- **A JetBrains plugin (`editors/jetbrains/`)** — IntelliJ / WebStorm / PyCharm
  support for `.aktion` files (TextMate-based highlighting plus an LSP4IJ
  client) that bundles the language server above.
- **An Aktion agent skill (`skills/aktion/`)** — progressive-disclosure
  authoring knowledge for coding agents: a short `SKILL.md` plus generated
  reference files for components, builtins, namespaces, themes, layout,
  patterns and gotchas. `scripts/emit-skill.mjs` regenerates them from the
  language surface and validates every ` ```aktion ` example in them, and it
  runs as part of `npm run build` (`build:skill`), so the skill cannot drift
  from the library the way its hand-maintained predecessor did.
- **`tools/validate-aktion-app.mjs`** — validates a *multi-module* app:
  `node tools/validate-aktion-app.mjs entry.aktion` links the import graph
  first, so names that come from an `import` are not reported as unknown
  identifiers. `tools/validate-aktion.mjs` remains the single-program gate.
- **[SECURITY.md](./SECURITY.md)** — private reporting via GitHub Security
  Advisories, the two-input trust model, `setGlobalAccessPolicy` with its
  stated residual limitations, the sink → sanitiser table, the "shadow DOM is
  not a security boundary" caveat, Node-side tooling notes and CSP guidance.

### Changed

- **The `corporate` theme was rewritten to the Exos design language.** Same
  theme name, entirely different output: flat white surfaces with no card
  borders or shadows, navy `#0b2a63` primary that *brightens* to `#1474c4` on
  hover (it used to darken), `#1474c4` accent and focus ring, 24px pill
  buttons with 4/20 padding, 8px inputs that are transparent until hovered,
  borderless tables with an uppercase navy header, and blue reserved for
  interactive elements only (body, heading and nav text stay `#001b41`). No
  new `ThemeTokens` keys were needed: the theme now *sets* tokens it used to
  inherit from `light` — the full Open Sans / Overpass type ladder
  (14/12/16/16/22px sizes, 400/600 weights, 1.4286 body line-height),
  `radiusXs`–`radiusLg`
  4/8/12/16px, `radiusPill`, `radiusButton` 24px, `radiusInput` 8px,
  `borderWidth`, six brand gradients, button padding and weight,
  100/80/120/240ms `ease-out` motion, softer `rgba(113,128,149,0.5)` shadows,
  `spacingM` 12px, and a new chart palette. Anything pinning corporate's old
  hex values or radii must be updated.
- **Brand hues changed in four of the six themes** to clear WCAG contrast:
  `light` primary/accent/focus `#6366f1` → `#4f46e5` (hover `#4338ca`);
  `soft` `#a78bfa` → `#7c4ddb` with a new mint `colorLink` `#0b6b62` and a
  lavender→rose `gradientBrand`; `glass` `#f2826a` → `#af4027` with darker
  muted text; `modern` muted text `#6b7280` → `#585f6b`; `dark`
  `colorLinkHover` `#a5b4fc` so hover brightens. `soft`, `glass` and `modern`
  also declare their own `spacing2xl` / `spacing3xl` instead of silently
  inheriting `light`'s 48/80px, which had been capping their scales. Theme
  *names* are unchanged: `light`, `dark`, `corporate`, `soft`, `glass`,
  `modern`.
- **Every component is now in a group, and most descriptions were rewritten.**
  76 specs belonged to no group, which meant they shipped with no usage
  guidance in the generated prompt and were absent from chat mode entirely;
  all 281 components are now grouped across the same 17 groups. 208 component
  descriptions and 113 prop descriptions were rewritten, so anything derived
  from spec text — the system prompt, the agent skill, editor completions,
  cheat sheets — must be regenerated, not patched.
- **`tone` and `variant` are interchangeable on 41 component specs** (up from
  7), and **`children` and `child` on 74** (up from 17) — 56 declaring one of the
  names outright and 18 more accepting both as aliases — because the validator
  treats an undeclared prop as a fatal error — so guessing the other spelling
  used to be a hard build failure. `Text` and `TextContent` are deliberately
  excluded: there, `variant` is typographic and `tone` is colour. Component
  authors: the evaluator folds an alias into the canonical slot, so a render
  must read the canonical name (`props.children` is always `undefined` on a
  spec whose canonical slot is `child`).
- **BREAKING — A form control's `value` attribute is now an assertion, not a
  default.** An *absent* `value` attribute means "this render asserts nothing"
  and the live DOM value is left alone; a *present* one (including `value=""`)
  is a deliberate assertion and is applied even while the field has focus, so
  clear-after-submit still works. Previously components emitted `value=""` for
  an unset prop and any state change anywhere in the app wiped what the user
  had typed across 18 controls. Component authors must pass
  `valueAttr(props.value)` — `null`, never `""` — and `type="file"` is never
  synced.
- **BREAKING — Responsive `sx` maps now actually take effect.** Responsive
  rules were emitted at specificity (0,1,0) and lost to every component's own
  `.rui-stack[data-gap="md"]`-style rule (0,2,0), so *every* responsive value
  was silently ignored; they are now (0,3,0) and win. Programs carrying
  responsive `sx` will render differently — correctly. Non-responsive `sx` was
  never affected, and `!important` and inline styles still win.
- **BREAKING — Universal props now reach fragment-returning components.** `sx`,
  `class`, `aria`, `id`, `animate`, `tooltip`, `role` and `data` on `Show`,
  `Async` and `Lazy` were accepted by the validator and then silently
  discarded; they are now applied to a wrapping
  `<span class="rui-universal-host">`, which adds one node to the output tree.
  Relatedly, a boxless root (`display: contents`, `rui-route`,
  `rui-transition`, `rui-focus-trap`) is promoted to `display: block` when the
  channel carries a box-model or animation declaration, and to
  `display: none` for `hidden: true` — box-model `sx` on those roots used to
  write a style attribute that could not render.
- **BREAKING — `.aktion` imports are confined to the Vite project root.** An
  import that resolves outside `config.root` is refused at resolve time and
  throws on load, because under `vite dev` the file's contents were read by
  the build and served to the browser. A monorepo that legitimately imports
  `.aktion` files from a sibling package must opt out with
  `aktion({ allowOutsideRoot: true })`. The emitted module shape is unchanged
  (`COMPILED_PROGRAM_VERSION` is still `1`), so this is an input-side break
  that the emitted-shape version does not signal.
- **BREAKING — A syntax error in an imported module is now a link
  diagnostic.** Only the entry module's errors used to travel out, so a
  dependency with a syntax error linked "successfully" minus whatever
  statements the parser had silently dropped. Builds that used to pass with a
  broken dependency now report the error, with its file, line and column.
- **BREAKING — Per-component behaviour corrections.** `ScrollArea.height` is a
  fixed box and no longer an alias of `maxHeight` (a chat pane used to grow
  from ~90px and reflow the page on every message); `maxHeight` keeps its
  320px default, and new `stickToBottom` follows the newest content until the
  user scrolls up. `GridItem` no longer defaults to `span: 12`, so a child of
  `Grid(columns: 3)` occupies one cell instead of the whole row.
  `VirtualList.renderItem` is a lambda `(row, index) => Node`, not a template
  node. `StatusDot` defaults to the neutral `default` tone instead of
  `success`, so `StatusDot("Offline")` is no longer bright green. Legacy size
  tokens `s` / `m` / `l` resolve identically in every module instead of
  becoming `sm` in some and falling through to `md` (or leaking into an
  unmatched `data-size`) in others. `PricingCard` only puts a check mark on
  bullets that are actually included.
- **`Callout` gained an inner wrapper and an action row.** The root
  `.rui-callout` now owns the border, radius and clipping and contains a new
  `.rui-callout-section` that owns the padding and the inset semantic bar;
  `data-compact` is read on the section. CSS or snapshot tests targeting
  `.rui-callout > .rui-callout-body` must add the level. `Callout` also takes
  `actions` (alias `footer`) so a notice can carry its own buttons, and
  `CardHeader` takes `eyebrow` (aliases `preheadline`, `kicker`) above the
  title.
- **`Brand.logo` is now `Brand.logoSrc`** (old spelling kept as an alias, so
  existing programs work) and `LogoChip` gained `imageSrc` (aliases `logo`,
  `image`, `src`). The prompt and editor completions now name the canonical
  spellings.
- **Multi-line and trailing-comma `import` specifier lists parse.** Spreading
  `import { a, b } from "./x.aktion"` over several lines (or leaving a trailing
  comma before `}`) used to throw, and because the parser records the error and
  recovers to the next line, the *whole* import vanished while the program
  still "parsed" — the bindings were simply missing.
- **`Mount` and `WebComponent` compare props structurally** to depth 4 instead
  of by identity, plus a new explicit `deps` list, `onError(err, stage)` and a
  stable host identity. The DSL rebuilds every object literal per evaluation,
  so `props: { config: { series: $rows } }` compared unequal on every unrelated
  keystroke and re-ran an expensive widget update.

### Fixed

- **`tools/validate-aktion.mjs` and `tools/validate-aktion-app.mjs` could not
  run at all.** Both imported `../src/*.js` paths that do not exist, so every
  invocation failed before reading a file. They now import the built
  `dist/language.js`; `node tools/validate-aktion.mjs <file.aktion> …` reports
  `FILE: OK` or `FILE: Lnn: message` per program and exits non-zero on any
  failure, and parse errors (which the parser records rather than throws) are
  reported instead of passing as OK.
- **`Link` was registered twice in `defaultLibrary`.** `components.length`
  disagreed with the number of distinct names, so every count derived from the
  array — the prompt, the skill reference, the extension's own description —
  was off by one. The library is now 281 specs / 281 distinct names.
- **A re-render no longer destroys what the user is doing in a form.** A file
  selection is never overwritten (the one assignment the platform allows,
  `value = ""`, empties the `FileList`), an uncontrolled checkbox is only
  synced when the render asserts a checked state instead of un-ticking itself
  on every commit, and an `onChange`-only text field keeps its value.
- **Transient UI state survives an unrelated re-render.** Open menus,
  expanded `JsonTree` branches, a "Copied!" label mid-timeout, `Carousel`
  position, `Lightbox` index and broken-image fallbacks lived in DOM
  attributes or class mutations, which the reconciler rebuilds from the fresh
  tree; 154 call sites across 27 modules now hold them in
  `helpers.useInstanceState`, with cleanup in `helpers.registerDisposer`.
- **An open dropdown, menu, tooltip or select survives a commit.** While a
  panel is promoted, `popover`, `style` and `data-floating-side` are owned by
  the floating layer and skipped by all three attribute-sync passes, so a
  re-render mid-interaction no longer un-promotes the panel out of the top
  layer or jumps it to stale coordinates.
- **`onload` / `onplay` / `onpause` / `onended` survive reconciliation.** The
  handlers `AudioPlayer`, `VideoPlayer`, `Image`, `Gallery` and `FileUpload`
  assign were dropped the first time the reconciler kept the node, so players
  stopped reflecting play/pause state and image load hooks never fired again.
  A test derives the required set from the source, so a new handler property
  cannot be forgotten silently.
- **A subtree painted outside a render pass keeps its state.** A `Lazy` panel
  resolving from a promise registered liveness against a closed pass, so its
  state cells were collected and its disposers ran under a still-visible
  subtree (a `Tabs` inside a lazy panel lost its active tab and its
  observers). Separately, anonymous `helpers.registerDisposer` slots replaced
  the previous generation instead of accumulating one live closure per render.
- **Fields with no `id` are now labelled.** The field shell used to drop both
  the label's `for` and the message's `aria-describedby` while still setting
  `aria-invalid` — a control announced as invalid with no name and no
  reachable reason; the control is now nested inside its `<label>`.
  `aria-describedby` is merged instead of overwritten (so a character counter
  or format hint is not lost), `disabled` and `name` apply to a bare control
  such as `Input({ disabled })`, and `labelHidden` renders a visually hidden
  label rather than `display: none`.
- **A component's own blur/focus/change handler is no longer replaced by the
  author's.** Focus handlers chain (component first, then the author
  callback) instead of overwriting, and `onChange` is composed and assigned as
  a DOM property — an `addEventListener` handler cannot be transferred onto a
  kept node, so inside a `.map` the callback captured by the first render was
  the only one that ever ran, and typing in row 2 edited row 1.
- **Real API rows work as select options.** `{ id, name }` fell through to
  string coercion and rendered as `[object Object]`; object options are now
  matched on `value | id | key | code` and `label | name | title | text |
  description`, `SelectItem`'s `disabled` and `group` survive into `Combobox`
  and `MultiSelect`, and an object matching nothing is dropped rather than
  rendered.
- **One Escape press closes exactly one floating layer**, innermost first —
  previously a single press collapsed a combobox, the popover around it *and*
  the enclosing dialog — and focus returns to the trigger. Re-opening a
  floater no longer accumulates listener pairs on the shared root.
- **`IconButton` accepts everything `Button` does.** It advertised four
  variants where `Button` had seven, so `variant: "outline"` was valid on one
  and a fatal validation error on the other; both now read the same exported
  vocabulary, and it gained `type`, `href`, `active` and `loading`.
- **Charts no longer render invisible or misaligned output for degenerate
  data.** A series shorter than its axes plotted missing points at the origin,
  a gap shifted every later value one position left, zero and negative pie
  entries emitted undrawable slices, and an empty query rendered a
  zero-height table; each case now renders an explicit placeholder.
- **One malformed cookie no longer breaks every cookie read.** Decoding is
  per-entry with a raw-text fallback.
- **Three documented signatures matched neither the implementation nor
  reality:** `LiveRegion(text, { politeness?, visible? })` takes a plain
  string, not a node; `VirtualList(items, { itemHeight?, renderItem? })`; and
  `VirtualGrid(items, { columns?, itemHeight?, gap?, height? })`. A test now
  checks prompt signatures against the specs.

### Removed

- **Theme CSS variables `--rui-color-on-primary`,
  `--rui-color-primary-contrast` and `--rui-font-mono`.** None was documented
  or reachable from `$theme()`; use the token-backed
  `--rui-color-primary-text` and `--rui-font-family-mono` instead.
- **The magic `html` attribute key in the element helper.** `el(tag, { html })`
  assigned `innerHTML`, and `HTMLTag`'s attribute keys come from the DSL — so
  `HTMLTag("div", { attributes: { html: "<img src=x onerror=…>" } })`
  executed. Any string→DOM conversion now goes through the allow-list HTML
  sanitiser, which is obvious at the call site.
- **`coding-gen-skill.md`**, replaced by the generated `skills/aktion/` agent
  skill. The single hand-maintained file had rotted through two feature waves;
  the skill is regenerated from the language surface on every build.

### Security

The full trust model — including what these measures deliberately do *not*
cover — is in [SECURITY.md](./SECURITY.md). Two entries below are the most
likely to change existing programs: the `$head` `rel` allow-list and the
always-on cookie `SameSite`.

- **The trust model is now stated, and the CSP guidance was wrong.** A program
  is as privileged as a `<script>` tag: under the default `"all"` policy any
  unshadowed identifier resolves against the host realm. Treat authoring a
  program exactly as shipping a JavaScript file, and if the text is not that
  trustworthy call `setGlobalAccessPolicy("safe")` before mounting. The
  runtime uses neither `eval` nor `new Function` (action and effect bodies are
  interpreted from the AST), so it does **not** need `'unsafe-eval'` — the
  previous claim was backwards; it does inject `<style>` elements and inline
  style attributes, so it needs `style-src 'self' 'unsafe-inline'` or a
  nonce/hash strategy.
- **BREAKING — `$head()` fields are allow-listed rather than filtered.** It is
  the only API that writes outside the shadow root. `rel` must be one of 17
  metadata/hint values — notably **not** `stylesheet`, `preload`,
  `modulepreload`, `prefetch` or `prerender`, so a program that injected a
  stylesheet or font preload through `$head` will silently stop working;
  `<base href>` must be a same-origin relative path; `htmlAttrs` is limited to
  `lang`, `dir`, `class`, `translate`, `id` and `data-*` (not `style`); every
  attribute name must match a strict pattern and may not begin with `on`, on
  both the DOM path and the SSR serialiser, because attribute *names* are
  emitted unquoted.
- **BREAKING — Cookies always carry `SameSite`, defaulting to `Lax`.** A
  cookie that relied on the browser's implicit default now gets `Lax`
  explicitly. `path` and `domain` are validated, because a `;` in either used
  to let a caller append attributes of its own.
- **BREAKING — `constructor`, `__proto__` and `prototype` are unreachable from
  the DSL.** `f.constructor("…")()` on any lambda was arbitrary code
  execution regardless of the global policy, and a computed key could
  re-parent shared objects. All four resolution paths are blocked — dot read,
  computed read, method dispatch and both in-place assignment branches — and
  state-path writes refuse the same three segments. A program that
  legitimately read `.constructor` now gets `undefined`. State writes also cap
  array materialisation at index 1,000,000, so a path computed from an HTTP
  payload cannot exhaust the tab.
- **BREAKING — `$script` validates its `src` and is disabled under a narrowed
  policy.** Only `http(s)` and same-origin relative paths survive;
  `javascript:`, `data:` and `blob:` used to be assigned to `script.src`
  verbatim. It also fails outright whenever the global access policy is not
  `"all"`, which is what makes `"safe"` mean "no code execution" rather than
  "no code execution except through this one API".
- **BREAKING — `HTMLTag` and `Styles` are allow-listed.** A non-allow-listed
  tag collapses to `div` with a one-time console warning (SVG is refused —
  use `Svg` or `Icon`), and the blocked attribute set now covers
  `html`/`innerhtml`/`outerhtml`/`textcontent`, `srcset`, `imagesrcset`,
  `srcdoc`, `data`, `background`, `manifest`, `http-equiv` and `is`. URL
  sanitisation matches on the local name so `xlink:href` cannot skip it, and
  `target` other than `_self`/`_parent`/`_top` forces
  `rel="noopener noreferrer"`. `Styles` enforces a length cap and warns on
  every rejection instead of silently emitting an empty sheet.
- **Rich text and Markdown output pass an HTML allow-list.** Markdown output
  and `RichTextEditor`'s `value` are fully untrusted (they can come from a
  bound variable, an HTTP response or storage). Markup is parsed in an inert
  document — no browsing context, so no script runs and no subresource is
  fetched — scrubbed, then imported, so no `innerHTML` assignment ever touches
  the live document. `style` and `id` are dropped; disallowed elements are
  unwrapped rather than deleted, so text is never swallowed. Caps: 512KB,
  8192 nodes, depth 64.
- **BREAKING — `Svg` markup and custom icons pass an SVG allow-list.** The
  previous regex blocklist ran over the raw string, which entity-encoded
  payloads (`href="&#106;avascript:…"`) defeated because the parser decodes
  after the check. Now rejected: `script`, SVG `a` (its `href` executes),
  `foreignObject`, `style`, `image`, `iframe`/`embed`/`object`,
  `handler`/`listener`, `set` and `discard`; animation `attributeName` is
  restricted. Icons are re-sanitised at render, not only at registration.
- **`DataGrid` CSV export neutralises formula injection.** A cell beginning
  `=`, `+`, `-`, `@`, tab or CR is prefixed so a spreadsheet treats it as
  text (CWE-1236).
- **The Font Awesome CDN link is hardened.** It is injected with
  `crossorigin="anonymous"` and `referrerpolicy="no-referrer"`, and honours
  the new `FONT_AWESOME_CDN_INTEGRITY` constant — set it to a `sha384-…`
  digest to have the browser reject a tampered stylesheet (empty by default,
  because a wrong hash would break icons for every consumer), or self-host and
  never trigger the injection. A CDN or proxy without permissive CORS headers
  will now fail to load it.
- **DSL-supplied regexes and long lines are cost-bounded.** `$util.match` and
  validation `pattern` rules go through a bounded tester (patterns over 1024
  chars are refused, subjects truncated at 8192), so `(a+)+$` against a long
  run of `a` can no longer freeze the render thread; the syntax highlighter
  returns plain text for lines over 4096 chars.

## 0.5.6 – 0.5.15 — previously shipped, not individually recorded

> Per-version attribution for these releases was never tracked: there are no
> release tags, and this repository's recorded history begins at the `0.5.15`
> import. Everything below shipped somewhere across this range — it was sitting
> under `[Unreleased]` while `package.json` had already moved ten versions past
> `0.5.5`. Future releases get their own section.

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
    runs when the compared `props` bag changes, and `cleanup(instance)` runs on
    unmount. Aktion owns + preserves the host so the widget is never rebuilt
    mid-session.
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
- **Nested destructuring patterns** in `let` / `const` / `var`, function /
  lambda parameters, and `for-of` heads:
  `let { data: { items: [first] } } = resp`, `let [[a, b]] = pairs`.
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

### Fixed

- **Loose equality now coerces like JavaScript.** `==` / `!=` follow JS
  abstract-equality, so `x == null` matches both `null` *and* `undefined`,
  and `1 == "1"` / `0 == false` behave as authors expect. `===` / `!==`
  remain strict. (Previously `==` was treated as `===`, silently breaking the
  pervasive `x == null` guard.)
- **Relational `<` / `>` compare alphabetic strings lexicographically.**
  `"b" > "a"` is `true`, so alphabetical `.sort((a, b) => a.name > b.name ? 1
  : -1)` comparators order correctly. `Date` operands coerce via `valueOf`,
  and two numeric strings still compare numerically (`"5" < "10"`).
  (Previously all relational compares coerced numerically, so any string sort
  silently returned `false`.)
- **`for-of` destructuring binds a real JS pattern.** `for (const [k, v] of
  Object.entries(obj))`, `for (const [i, item] of arr.entries())`, and
  `for (const { id, name } of rows)` now bind by index / key like JavaScript.
  (Previously `[a, b]` was misread as an `[item, index]` convenience, so the
  second name never received its value.)
- **Function/lambda rest parameters work.** `function sum(...ns)` /
  `(...args) => …` now gather the trailing arguments into an array instead of
  binding only the first.
- **Spread in call arguments expands.** `fn(...arr)` (and `fn(a, ...rest)`)
  now forward the spread elements as positional args to user functions,
  lambdas, and actions — matching the behaviour array/object spread already
  had.

### Removed

- The non-standard `optimistic` function keyword and its dead rollback
  machinery (`ActionDeclRunner`, the `ActionDeclaration.optimistic` AST field).
  Use the JS-compliant `$optimistic(...)` builtin instead.

## 0.5.5 — baseline

- First version tracked by this changelog. Streaming parser, schema-as-truth
  validation, the morph reconciler, the component library, themes, the
  system-prompt generator, the delta protocol, the visual editor, the testing
  library, DevTools, the multi-file linker, and the Vite plugin. The six theme
  names (`light`, `dark`, `corporate`, `soft`, `glass`, `modern`) date from
  here and are unchanged through `0.6.0`; the library stood at 274 distinct
  components when the recorded history of this repository begins.

---

## Stability & versioning

Aktion is pre-1.0. The following reflects the intended stability of each
surface; anything not listed should be treated as experimental. For the
security posture behind the policy and sanitiser rows — including what they do
not cover — see [SECURITY.md](./SECURITY.md).

| Surface | Stability | Notes |
| --- | --- | --- |
| `<aktion-app>` attributes / properties / methods / events | **Stable** | Additive changes only within a minor. `0.6.0` added no attributes; `theme` now also loads a built-in theme's web fonts. |
| Aktion language core (`$name` atoms, components/actions, `$effect`, `$http`, `$router`, `$store`) | **Stable** | The authoring surface the system prompt teaches; see `builtinCatalog` for the full set (26 builtins, 5 namespaces, 153 members). State-path writes refuse `__proto__` / `constructor` / `prototype` segments as of `0.6.0`. |
| Reactive builtins `$query` / `$mutation` / `$toast` / `$ref` / `$reducer` / `$id` / `$optimistic` / `OnMount` | **Experimental** | Recently added; API may refine before 1.0. |
| Imperative interop `$script` / `$dom` / `$head` / `Mount` / `WebComponent` | **Experimental** | Escape hatches that write outside the shadow root; the `$head` and `$script` allow-lists will keep tightening. |
| Component library names + props | **Stable** | 281 components in 17 groups, none ungrouped. Validated against the closed schema; removals are breaking. Prop *additions* and description rewrites are not. |
| Themes | **Stable** | Token additions are non-breaking, and undocumented internal CSS variables may be removed. A theme's rendered output may change within a minor — `corporate` was rewritten in `0.6.0`. |
| `setGlobalAccessPolicy` / `getGlobalAccessPolicy` | **Stable** | The policy values (`"all"`, `"safe"`, an explicit allow-list) are the contract; the membership of `"safe"` may grow. |
| Sink → sanitiser behaviour (Markdown / `RichTextEditor` HTML, `Svg` + custom icons, `HTMLTag`, `Styles`, `$head`, `$script`) | **Stable (behaviour), not output-stable** | Every string→DOM sink is allow-listed; the allow-lists tighten as sinks are found, so accepted markup may shrink within a minor. |
| `aktion-runtime/language` (diagnostics / completions / hover / formatting / linking) | **Stable (data shape)** | Output content may grow and new diagnostics may appear — `0.6.0` added an unknown-component warning. |
| `aktion-runtime/vite` plugin | **Stable** | Emitted module shape is versioned via `COMPILED_PROGRAM_VERSION` (still `1`); resolution and security behaviour may tighten within a minor — `0.6.0` confined `.aktion` imports to the project root. |
| `aktion-runtime/test` and `aktion-runtime/devtools` | **Stable** | |
| `aktion-language-server` (`editors/lsp`) and the VS Code / JetBrains clients | **Experimental** | Derived entirely from `aktion-runtime/language`; packaging, settings and capabilities may change. |
| `tools/validate-aktion.mjs` / `tools/validate-aktion-app.mjs` | **Experimental** | CLI flags and output format may change. |
| `skills/aktion` (agent skill) | **Experimental** | Generated on every build; file layout and section names may change. |
| Generated system prompt (`getSystemPrompt` / `system_prompt.txt`) | **Versioned, not byte-stable** | Section *content* evolves as components/builtins change; the *structure* (sections, modes) is stable. Pin a runtime version if you cache the prompt. |
| `strict` mode warning messages | **Experimental** | Wording may change; presence of a warning is the contract, not its exact text. |

### SemVer policy (pre-1.0)

- **Patch** (`0.x.y`): bug fixes, additive components/builtins, documentation.
- **Minor** (`0.x.0`): may include behavioural changes flagged in this file.
- Breaking removals/renames are called out under **Removed** / **Changed** with
  a migration note.
