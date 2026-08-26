# Changelog

All notable changes to **Aktion** are documented here in plain language.
Each entry is dated and summarises what was added, changed, or fixed.

---

## 2026-08-26

### A Select No Longer Loses Its Value When Its Option List Grows

- Re-rendering a `<select>` with **more** options than it currently shows used to
  drop the selected value and fall back to the first option, whenever the value
  the render asked for sat past the end of the old list.
- The cause was in the reconciler: it moves the fresh element's surplus
  `<option>` nodes into the live element, which empties the fresh `<select>` of
  the very options that carried its selectedness — and then read `value` off that
  emptied node. A single-line select with nothing selected reports its *first*
  option, so the live control was faithfully set to a value nothing asked for.
- The reconciler now captures the fresh select's value **before** touching its
  children, so the value the render asked for is the value that lands. A render
  that widens the list *and* moves the selection still applies as asked.
- Visible symptom this fixes: a picker whose options depend on another control —
  a location list that widens when a "private" option is chosen, say — showed the
  first entry while the program's state still held the operator's real choice. A
  control saying one thing over a form that submits another.
- The executable defect note for this (`tests/coverage-morph-contract.test.ts`,
  "should resolve a `<select>` value against options only the fresh tree has") is
  now a passing contract rather than an `it.fails`.

---

## 2026-08-20

### Redesigned DataGrid Column Settings

- The column-settings panel is now a titled "Table settings" sheet with a
  sub-heading, a drag handle, pin and checkbox on every row, and its reset action
  moved out of the header into a footer that says "Reset to default" — it used to
  sit one mis-click away from the close button while discarding a whole layout.
- **Pinning a column now moves it.** Pinned columns are hoisted to the front of
  the table and above a divider in the panel, in the order they were pinned.
  Previously a pinned column stuck to the edge of the viewport but never changed
  places, so it could sit visually to the right of an unpinned one.
- That divider is a real boundary: dragging and arrow-key reordering both stop at
  it, so columns rearrange freely within the pinned group or within the unpinned
  group, and the only way to move one between them is the pin itself.
- The panel's checkbox is now the same control the rest of the library uses, so
  it picks up each theme's own checkbox styling instead of the browser default.
- **The last visible column can no longer be hidden.** Its checkbox is disabled
  and explains why. A grid with every column hidden renders nothing over nothing,
  and the only way back was the panel the user had just emptied.
- Hiding or pinning a column no longer drops keyboard focus. The panel rebuilds
  itself on those actions, which used to throw away the control the user was
  standing on — after which Escape no longer closed the panel.

### Opening the DataGrid Column Panel From Your Own Button

- New `columnMenuOpen` (a two-way binding) and `onColumnMenuOpenChange` let a
  page open and close the column-settings panel from anywhere — a button in your
  own toolbar, a keyboard shortcut, a menu item.
- `columnMenuAnchor` takes a CSS selector for the element the panel should hang
  off, and `columnMenuButton: false` drops the in-header icon while keeping the
  panel and everything it configures. The built-in trigger stays the default, so
  grids that do not ask for any of this are unchanged.
- `columnMenuTitle`, `columnMenuDescription` and `columnMenuResetLabel` accept
  translated strings — the panel's three labels were the one grid surface with no
  way to localise it. Passing an empty `columnMenuDescription` drops that line.

## 2026-08-19

### Reading a File the User Picked

- Added `$util.readFile(pick, { as?, maxSize? })`. `FileUpload` hands the picked
  files to an `action` callback and nowhere else — a `File` is not serialisable,
  so it can never travel through a `$variable` — but until now there was no way
  to then read one: `FileReader` is not a permitted host global under the `"safe"`
  global-access policy, so any program that wanted the contents of a picked
  `.pub`, `.csv` or `.json` had to run unrestricted. This is that read, as a
  capability the runtime grants.
- Pass the pick straight through (`$util.readFile(files)`) or a single `File` —
  a `FileList`, an array and a lone file are all accepted, and the first readable
  entry is used. `as` selects the representation: `"text"` (default, UTF-8),
  `"dataUrl"` for an inline preview, or `"base64"` for a JSON body. `maxSize`
  rejects a larger file without reading it.
- It never rejects. Every failure — no file, an unreadable one, an over-size one,
  a host with no reader — resolves an empty string, because `await` in Aktion does
  not suspend, so a rejection would surface as an unhandled promise instead of at
  the call site. Branch on an empty result.

### Callout Renders Correctly on the Exos (`vision`) Theme

- Fixed the icon on a `compact` Callout landing below and to the right of its
  own text, overlapping the headline and spilling past the bottom border. On
  this theme the icon is positioned into the panel's padding box, but `compact`
  only shrank the padding — the icon stayed pinned to the roomier layout's
  coordinates. The padding, the icon's position and the headline's indent are
  now driven by one set of custom properties, so a density change moves all
  three together. Nothing about the default (non-compact) Callout changes.
- Fixed `hideIcon` (and `icon: false`) leaving the headline indented past an
  icon that was never drawn. Callout now publishes `data-has-icon` on its root
  element, so any theme can drop the indent without guessing from the DOM.
- Fixed `danger`, `error` and `neutral` Callout icons being invisible. The theme
  draws the icon as a bare glyph rather than a filled disc, but the glyph kept
  the white ink meant for the disc it no longer sat on — white on a white card.
  Each tone's icon now takes the same semantic colour as its headline.
- Fixed an `error`-tone Callout drawing a red status bar above a default-coloured
  headline; `error` now matches `danger`, as it already did everywhere else.

### Smooth, Predictable Column Reordering in the DataGrid Column Menu

- Reordering columns is now a pointer-driven drag: the row you grab follows the
  cursor and the rows it passes slide out of its way, so the gap on screen is
  exactly where the column will land. Previously the drop position depended on
  which way you were dragging — releasing on a row put the column *after* it when
  moving down but *before* it when moving up — and the only hint was a marker
  that pointed at the wrong gap half the time, flickered as the cursor crossed
  each row's contents, and nudged the whole list as it moved.
- Columns can now be reordered from the keyboard: focus a row's drag handle and
  press the up or down arrow keys. The handle is a real button with a label, so
  reordering is reachable with a screen reader for the first time.
- The list auto-scrolls when a drag reaches its top or bottom edge, so columns
  can be moved across a menu taller than the window.
- Dragging respects "reduced motion", cancels cleanly on `Escape`, and no longer
  starts when the press lands on a row's checkbox or pin button.
- Fixed reordering not starting at all in Firefox, which requires drag data to be
  set before it will begin a native drag.

### Fixed

- The VS Code extension's version now matches the runtime again (0.6.4); it was
  left at 0.6.3 by the last release, which broke the lockstep check.

### A First-Class `testId` Prop on Every Component

- Every component now accepts `testId`, which writes `data-testid` on the
  rendered root element. Reaching for a test hook used to mean
  `data: { testid: "row" }` — a spelling that reads as incidental metadata, and
  that does not work at all on the six components declaring a `data` prop of
  their own (`LineChart`, `JsonTree`, `Async`, `Draggable`, `Lottie`, `QRCode`),
  where the component's own prop shadows the universal channel. `testId` reaches
  all of them, and wins when more than one spelling is present. The lowercase
  `testid` is accepted as an alias.
- The value is used exactly as written — there is no character allow-list, so a
  test id may contain slashes, colons, spaces or non-ASCII text. A `data-testid`
  is an attribute *value*, not a selector, so there is nothing to sanitise on the
  way in; escaping belongs on the query side, which leads to the next entry.
- `within(node).getByTestId(...)` and its `query`/`queryAll` siblings now escape
  the id before building their CSS selector, the way `screen.getByTestId` always
  did. Previously an id containing a quote or a backslash produced a broken
  selector rather than a match.
- Two things worth knowing. `testId` marks a component's **root** element: on a
  form field that has a label, that root is the `.rui-field` wrapper rather than
  the control inside it, so reach the control with
  `within(getByTestId("email")).getByRole("textbox")`. And a component that
  renders nothing — `Show(false, …)` with no fallback — has no element to carry
  the attribute, so `queryByTestId` correctly answers `null`.

## 2026-08-18

### A Toast No Longer Resets the Rest of the Page

Showing a toast quietly re-keyed every component in the program, so unrelated
UI state elsewhere on the page snapped back to its defaults.

- Fixed component-local UI state being discarded whenever a toast appeared or
  auto-dismissed. Because the auto-injected toast stack is a sibling of the
  program root, the root moved to a different position in the tree for as long
  as a toast was on screen — and per-instance state is keyed by tree position,
  so one `$toast.success("Saved")` reset the active `Tabs` pane to its
  `defaultValue`, closed any open `Popover` / `DropdownMenu`, and dropped each
  `DataGrid`'s sort, page and column layout. The UI root is now always rendered
  at a fixed position, so a toast changes nothing but the toast.

### Toolbar Actions Stay Right-Aligned

- Fixed `Toolbar`'s `right` slot rendering hard LEFT once the bar wrapped onto
  two rows — the common case being a long hint or filter row in `left`.
  `justify-content` is resolved per flex line, so a right slot alone on the
  second line was left at flex-start; it now takes an auto left margin (unless a
  `center` slot is present, which still needs that space).

### DataGrid Column Settings Actually Repaint the Table

- Fixed hiding, pinning or reordering a column from the settings panel storing
  the new layout while leaving the visible table unchanged. The panel is promoted
  into the top layer, and where the `popover` API is missing the floating layer
  reparents it out of the grid — its controls then could not find the grid to
  repaint. Affects Safari < 17, Firefox < 125, and headless DOM implementations.
- `persistKey` is now mirrored onto the grid as `data-persist-key`, so the
  localStorage slot a grid uses is visible in DevTools — two grids sharing a key
  silently fight over one saved layout, and nothing on screen looks wrong.

### Scoped Test Queries Can Assert Absence

- Added `queryAllByText`, `queryAllByRole` and `queryAllByTestId` to
  `within(node)`. The scoped suite stopped at `getAll*` and the single-element
  `query*`, so `within(panel)` could assert "exactly one" but never "none" — the
  shape every "this region no longer offers X" test needs. `Screen` has had them
  all along. Also documented the one place the scoped surface diverges from
  `Screen`: its `getAll*` answers `[]` instead of throwing.

### Readable Destructive Buttons in the Vision Theme

- Fixed the `vision` theme drawing danger-toned ink in the danger FILL colour,
  which made every danger-filled surface blank: a solid red `ConfirmDialog`
  confirm button with a red label, a red badge with a red count, and the same
  for the danger `Button` / `IconButton` variant, the danger toast icon and the
  error step marker. The ink is now white on that fill (6.00:1).
- Added a theme check that no `colorOn<Tone>` token may hold its own fill
  colour, across the private theme registry as well as the public one — the
  reason this one shipped unnoticed.

---

## 2026-08-16

### Monorepo Module Resolution

`.aktion` imports could only be relative, and only within the Vite project root.
A shared `.aktion` library in a sibling package therefore needed either a
`../../../..` chain plus `allowOutsideRoot: true` — which removes the containment
boundary entirely — or a copy of the library per app. Both are now unnecessary.

- Added `alias` to the Vite plugin and to `compileAktionFile` /
  `compileAktionSource`, mapping a bare specifier prefix to a directory:
  `aktion({ alias: { "@acme/ui": "…/libs/ui/src" } })` makes
  `import { Button } from "@acme/ui/button.aktion"` resolve. The longest matching
  prefix wins, and an aliased import cannot climb out of the directory its alias
  names — so an alias widens resolution by exactly that directory rather than
  lifting the boundary.
- Added `roots`, for a sibling package imported by relative path instead of by
  alias.
- Added `aktion.config.json`. The plugin, the compile API and both validators now
  look for the nearest one at or above the project root and read `alias` / `roots`
  from it, so a repository declares its shared packages once instead of restating
  them in every app's config and every CI command. A malformed config is ignored
  rather than failing a build that never asked for one.
- Import specifiers may now omit the extension: `"./lib/format"` finds
  `lib/format.aktion`, and `"./lib"` finds `lib/index.aktion`. Previously only the
  multi-module validator did this, so an extensionless import validated and then
  failed to build.
- Exported `createNodeResolver`, `loadAktionConfig` and `mergeResolveOptions` from
  `aktion-runtime/vite`, so a build, a test and a CI validation share one answer to
  "what does this specifier point at" instead of each implementing their own.
- **Changed:** an unresolvable import now fails at resolve time with
  `Cannot resolve import "./missing.aktion"` (naming the specifier the author
  wrote) rather than at load time with `Failed to load imported module "<abs path>"`.

### New Lint Warning: an Awaited Value Is the Promise

`await` parses so that JavaScript-shaped source still compiles, but it does not
suspend — bodies run synchronously and nothing unwraps the thenable, so the value
of `await expr` is the promise. `const ok = await $util.copy(value)` is therefore
always truthy, and the "copied to clipboard" branch runs even when the write
failed. This was documented but silent: the parse succeeds, the schema check
passes, and the program renders.

- Added the `awaited-value` lint warning, reported by `getDiagnostics`,
  `getLintWarnings` and both `tools/validate-aktion*.mjs` validators.
- Only a **consumed** result is flagged — bound to a name, used as a condition, or
  passed as an argument. A bare `await f()` statement whose value is discarded is
  a readability marker with no wrong value attached, and is left alone.

### Fixed: the Multi-Module Validator Never Reported Anything

`tools/validate-aktion-app.mjs` called the three-argument `linkProgram` with two
arguments, so it parsed the entry's *path string* as the program instead of the
file's contents. That program has no imports and no component calls, so the tool
printed `OK` and exited 0 for every input — including a file whose imports did not
resolve and a file naming components that do not exist. Any CI gate built on it was
passing vacuously.

- Fixed the call, so the tool links and checks the real program.
- The lint pass now runs. It needs source text rather than a `Program`, which the
  linker does not return, so `printProgram` is now exported from
  `aktion-runtime/language` and the merged program is re-emitted for it.
- Added `--alias <prefix>=<dir>` and `--root <dir>` flags, and `aktion.config.json`
  support, so the validator resolves imports exactly as the build does.
- A missing entry file is now reported instead of passing.
- Added `tests/validate-tools.test.ts`, which spawns both validators and asserts
  they reject bad input. Neither tool had any test coverage, which is why this
  survived.

---

## 2026-08-15

### Docs, Providers, and Dev UX

- Added the `UIProvider` interoperability layer and `setUIProvider()` so Aktion can target external design systems like Material UI, Bootstrap, and ShadCN.
- Reworked the `UI Providers` docs and homepage orchestration section with live CDN-backed provider previews, forked source/output examples, and theme-aware embedded demos.
- Added docs version syncing from `package.json`, so version badges and snippets no longer drift after releases.
- Improved docs polish with a seamless looping scroll-progress gradient.
- Tightened embedded preview sandboxing by removing unnecessary `allow-same-origin` from demo iframes.
- Vite now watches `*.aktion` files during development and triggers a hot reload when they change.

---

## 2026-08-13

### DataGrid Column Tooling — Corrections

The column menu, drag-resize and scroll arrows added earlier today each worked in
isolation but interfered with the table around them. This pass reworks how all
three attach to the grid.

- **Breaking (visual):** the column-settings button is no longer a table column.
  It overlays the top-right of the header instead, so it costs the table no width,
  the last column's cells are as wide as its header again, and every row is one
  cell shorter. A stylesheet that targeted `.rui-data-grid-col-menu-cell` should
  target `.rui-data-grid-col-menu` (the overlay) instead, and `th:last-child` /
  `td:last-child` rules now land on the last real column — new `[data-last="true"]`
  attributes are available on both the header and body cells of that column.
- Fixed drag-resize moving the wrong thing. Widths are now declared once in a
  `<colgroup>` and the table switches to a fixed layout on the first drag, so a
  narrowed column truncates (with an ellipsis for plain text; a clean clip for a
  cell built out of components). Previously the width was written onto every body
  cell under the default auto layout, where the content's own minimum width wins:
  the column refused to shrink and its text ran across the neighbouring cell.
  As a side-effect the filter row now resizes with its column instead of skewing
  out of line, and the grid keeps its column widths while data changes.
- A `resizable` grid ends every row with one empty, `aria-hidden`,
  `role="presentation"` filler cell. It absorbs whatever width the columns do not
  use, which is what keeps a drag exact — without it, fixed layout shares the
  leftover space out over every column, so narrowing one widened all the others.
  It is zero-width whenever the columns already fill the grid.
- Column resizing is now operable by keyboard (focus a divider, then arrow keys,
  or Home to auto-fit) and by touch, and no longer breaks on a column whose header
  contains a quote.
- Fixed the scroll arrows disappearing for good after any unrelated re-render, and
  the arrows travelling out of view exactly when they were needed. They are now
  part of the rendered tree and anchored to a non-scrolling frame around the
  scroll port.
- Redesigned the scroll hint: a 20px chevron in the header band at each end that
  has content behind it, plus a soft fade at that edge. It no longer sits on top of
  any data cell. New `scrollArrows` prop (default `true`) turns it off.
- The scroll port is now keyboard-focusable while it overflows, so the columns can
  be reached with the arrow keys and not only with a pointer (WCAG 2.1.1).
- Fixed the column-settings panel being clipped by the grid's own scroll box (and
  by any `overflow: hidden` card around it). It is promoted out of every clipping
  ancestor like every other menu in the library, and closes on Escape.
- Fixed typing in a column filter losing the caret after the first character: the
  header was rebuilt on every repaint, which replaced the input being typed into.
- Fixed a column added after the first render never appearing, and a stale saved
  layout being able to keep a column that no longer exists.
- Fixed pinned columns overlapping each other, and sliding underneath the
  selection checkbox / row-number cells. Offsets are measured from the live header
  rather than guessed at 150px per column.
- Fixed `Table` and `DataGrid` failing to render at all when a column was
  conditional — `permitted ? Col(...) : null` now simply omits that column.
- The `vision` theme now dresses `DataGrid` the way it already dressed `Table`
  (white header cell, navy uppercase label, hairline rows, pale-blue row hover),
  and styles the new column-menu button, settings panel and scroll chevrons in its
  own idiom. Apps no longer need to restate the head treatment themselves.

### DataGrid UX Refinements

- Fixed pinned cells on striped and selected rows showing content bleed-through during horizontal scrolling. Pinned cells now use opaque backgrounds instead of semi-transparent tints, so scrolled content behind them is fully hidden.
- Added a close button (×) to the column settings panel header, next to the existing "Reset" button. The panel can now be dismissed without clicking outside.
- Fixed filter row cells for pinned columns not being sticky — filter inputs now stay in place during horizontal scrolling, matching the header and body cell behavior.
- The column menu icon is now pinned to the right edge of the header row so it remains visible during horizontal scrolling on narrow viewports.
- Improved column resize handles: the clickable area is now 12px wide (up from 4px) and all resize dividers light up when hovering anywhere on the header row, making them discoverable at a glance.
- Fixed resize reliability: the drag handler now resolves the live DOM element from the event instead of a closure-captured reference, so resizing works consistently after re-renders.
- Moved the column settings button from the toolbar into the header row as a compact icon-only button, keeping the grid chrome minimal.
- Fixed column hiding not hiding headers: hiding a column via the column settings panel now correctly removes both the header cell and the filter cell, not just the body cells.
- Fixed the column settings panel closing unexpectedly when toggling visibility or pinning. The panel now stays open until the user clicks outside it.
- Upgraded the DataGrid example in the component catalog to three tabbed demos: Basic (sort, filter, selection), Advanced (pinning, resizing, column menu, global search, persistence), and Inventory (export, row numbers, hover highlights).
- Fixed the column settings menu not closing when re-clicking the button or clicking outside. The root cause was shadow DOM event retargeting — the close handler now uses `composedPath()` and mousedown propagation is stopped at the menu wrapper level.
- Fixed pinned columns being moved to the front of the table — pinned columns now stay at their original position and become sticky during horizontal scroll without changing order.
- Fixed pinned column headers not being sticky — the header cell now has `position: sticky` with the correct z-index (higher than body cells) and a border shadow for visual separation.
- Added 22 unit tests covering column hiding/showing, menu panel persistence, menu toggle, column pinning position/stickiness, global search, row numbers, resize handles, cell wrapping, hover highlights, menu placement, `initiallyHidden`, and SSR with advanced props.

### DataGrid Advanced Column Management

- Added column hiding/showing: set `columnMenu=true` to reveal a settings panel where users can toggle column visibility.
- Added column reordering: drag-and-drop columns in the settings panel to rearrange them.
- Added column pinning: pin columns to the left edge so they stay visible during horizontal scrolling. Set `Col(pinned: "left")` or toggle from the settings panel.
- Added column resizing: set `resizable=true` to let users drag column header borders. Double-click to auto-fit. Per-column `Col(resizable:)` overrides the grid-level setting. New `Col(minWidth:)` and `Col(maxWidth:)` props constrain the range.
- Added horizontal scroll arrows: small overlay buttons appear on the edges of horizontally scrollable grids, making scroll affordance visible without blocking data.
- Added cell truncation with tooltips: set `wrapCells=false` for single-line cells with ellipsis. Hovering reveals the full content. Custom component cells render normally. Per-column `Col(wrap:)` overrides.
- Added global search: pass `globalSearch` (bind a `$variable`) to show a cross-column search bar that filters across all columns.
- Added row numbers: set `rowNumbers=true` for a leading row-number column.
- Added `highlightOnHover` prop (default true) to control row hover highlighting.
- Added localStorage persistence: set `persistKey="myTable"` to save column widths, order, visibility, and pinning across page refreshes.
- All new features are opt-in via new props — existing DataGrid usage is unaffected.

### Expanded Unit Test Coverage

- Added dedicated unit tests for 8 previously uncovered source modules: lexer, streaming frontier, grammar/stream tokenizer, HTML sanitizer, reactive environment manager, delta protocol, AST inspector, and floating positioning layer.
- Grew the test suite from 119 to 127 test files (2,567 to 2,801 individual tests), covering all non-trivial source files.

---

## 2026-08-12

### Claude Plugin & v0.6.3 Release

- Published the Aktion plugin for Claude, including marketplace metadata, plugin configuration, and distribution documentation.
- Released **v0.6.3** with testing library improvements:
  - Exposed the full query matrix on `Screen` (`queryAllByRole`, `findAllByRole`, `getAllByLabelText`, etc.) so every query family has all six flavours.
  - Added `screen.state.planned` to check whether the program has completed its first render.
  - Fixed `screen.waitForState()` silently timing out in multi-file programs due to unresolved module-local atom names.
  - Fixed `screen.state.set()` before the first flush writing to the wrong atom without any error.
  - Fixed `cleanup()` leaking the route hash into the next test, causing ordering-dependent failures.
- Updated documentation for state management and query methods.

---

## 2026-08-11

### Select `emptyLabel` & Effect Fixes

- Added an `emptyLabel` prop to the `Select` component so developers can show a message when the options list is empty (e.g. "No results found").
- Fixed local variables inside `$effect` bodies not binding correctly to their enclosing scope.

---

## 2026-08-09

### v0.6.2 — Accessibility & DataGrid Fixes

- Released **v0.6.2**.
- Added `labelHidden` prop to `Checkbox`, `Switch`, `Select`, `Combobox`, `MultiSelect`, `CheckBoxGroup`, and `Radio` — the label stays in the accessibility tree but is visually hidden (useful for controls in table cells).
- Added a `fitted` prop to `Tabs` that stretches the tab strip evenly across its container.
- Fixed `delete obj[key]` doing nothing when using a computed key — it now correctly removes the entry.
- Fixed `DataGrid` ignoring explicit `align` on numeric columns — an explicit `align: "left"` now takes precedence over the default right-alignment.
- Added an interactive learning game with 12 progressive levels teaching Aktion concepts.
- Added 20+ new full-app demo examples across AI, commerce, dashboard, and website categories.
- Introduced a dedicated custom-components documentation page.

---

## 2026-08-02

### Corporate Theme Redesign & Breadcrumb Navigation

- Completely redesigned the **corporate** theme with a contemporary look: graphite canvas, deep-teal brand colour, square-shouldered buttons, flat hairline cards, and Inter + Space Grotesk typography.
- Made `Breadcrumb` crumbs navigable by default — plain string trails now auto-derive their own routes. Added `autoLink` and `homeIcon` props for customisation.
- Fixed Playground example state management issues.

---

## 2026-08-01

### v0.6.0 — Major Release

Released **v0.6.0**, the largest update to date:

- **7 new components:** `Pill`, `LoadingDots`, `ButtonGroup`, `InputGroup`, `CardSection`, `ActionStripe`, and `FilterPill`.
- **Themes now auto-load web fonts** when selected by name (e.g. `theme="corporate"` loads Inter and Space Grotesk automatically).
- **28 new theme tokens** for finer customisation (link colours, status text colours, font size scale, syntax highlighting palette, and more).
- **Global access policy** (`setGlobalAccessPolicy`) lets hosts restrict what untrusted programs can reach — `"safe"` mode blocks `eval`, `fetch`, `document`, `localStorage`, and more.
- **759 new props across 209 components** in coherent families: field shell props, loading/empty/error states, accessibility attributes, open-state controls, controlled values, clickable containers, locale/currency support, and density options.
- **Two universal props** (`role` and `dataAttrs`) now accepted on every component.
- **Security hardening:** HTML sanitiser for rich text, SVG allow-list, `$head` field allow-list, cookie `SameSite` enforcement, `$script` URL validation, CSV formula injection protection, regex cost-bounding, and prototype-chain access blocking.
- **LSP language server** (`editors/lsp/`) — a standalone, zero-dependency server providing diagnostics, completions, hover, formatting, and more over stdio for any LSP-capable editor.
- **JetBrains plugin** (`editors/jetbrains/`) — IntelliJ/WebStorm/PyCharm support for `.aktion` files via the LSP server.
- **Agent skill system** (`skills/aktion/`) — structured authoring knowledge for AI coding agents, auto-generated from the language surface and validated on every build.
- **Multi-file app validator** (`tools/validate-aktion-app.mjs`) that resolves imports before reporting diagnostics.
- Added `LICENSE` and `SECURITY.md` files.
- Updated `create-aktion` templates to v0.6.0 with upgraded Vite (6.4.3), Vitest (3.2.7), and happy-dom (20.11.1).
- Upgraded VS Code extension dependencies to match v0.6.0.

---

## 2026-07-28

### New Components & Dependency Updates

- Added `Pill` component for soft, tinted status labels (e.g. "Active", "Pending").
- Added `ButtonGroup` for edge-to-edge joined buttons and `InputGroup` for combined field + icon + action layouts.
- Added `ActionStripe` component for full-width interactive navigation rows (settings screens, drill-down lists).
- Enhanced `CardHeader` with an optional `eyebrow` prop for secondary context above the title.
- Built-in themes now automatically load their web fonts when selected.
- Added new chat-completion model options to the chatbot demo.
- Bumped version to **0.5.16**.
- Upgraded internal dependencies: `brace-expansion`, `fast-uri`, `nanoid`, `postcss`.

---

## 2026-07-19

### Lockfile Sync

- Aligned `package-lock.json` with `aktion-runtime` v0.5.15.

---

## 2026-07-05

### Documentation Cleanup

- Removed outdated feature proposal and feedback documents (`features-suggestions-list.md`, `feedbacks-opus-2.md`, `feedbacks.md`) that were no longer relevant.

---

## 2026-07-01

### Component Rename

- Renamed `ProgressBar` to `Progress` in the tutorial for consistency with the component library.

---

## 2026-06-28

### Documentation Simplification

- Simplified Button and Text component examples on the docs homepage for better readability.

---

## 2026-06-18

### `sx` Styling Prop Documentation

- Added a comprehensive documentation page (`sx.html`) for the `sx` styling prop, covering usage, benefits, and examples for theme-safe component styling.
- Added a scroll progress indicator to the docs homepage.
- Enhanced layout and chat streaming showcases in the documentation.

---

## 2026-06-15

### v0.5.15 — Language Features & Theme Cleanup

- Released **v0.5.15**.
- **Loose equality now works like JavaScript:** `==`/`!=` follow abstract equality rules, so `x == null` correctly matches both `null` and `undefined`.
- **String comparison works:** relational operators (`<`, `>`) now compare strings lexicographically, so alphabetical sorting functions correctly.
- **Nested destructuring** is now supported in `let`/`const`/`var`, function parameters, and `for-of` loops (e.g. `let { data: { items: [first] } } = resp`).
- Fixed inconsistencies in theme documentation — corrected built-in theme count from seven to six.
- Updated version numbers across all packages and documentation.

---

## 2026-06-14

### Toast Auto-Render, DataGrid Enhancements & Mobile Support

- **`$toast` notifications now auto-render** — calling `$toast.show()` / `.success()` / `.error()` displays toasts automatically without manually wiring them into the app. Custom placement still works.
- **DataGrid `Col` render function** now receives the original row index and a header-keyed row object, keeping sibling lookups accurate after sorting.
- **New `getLintWarnings` function** for static analysis that flags common coding pitfalls during development.
- Updated tutorial content to reflect 13 levels (up from 11) and simplified code examples.
- Removed unnecessary margin attribute from the playground app element.
- Implemented a **mobile dropdown menu** for better navigation on small screens.
- Improved **mobile responsiveness** across all documentation pages with refined CSS for grids, buttons, and layouts.
- Updated site assets version and enhanced accessibility with improved ARIA attributes.

---

## 2026-06-13

### Theme Generator & Accessibility Docs

- Added a **visual theme generator** (`theme-generator.html`) for customising colours, typography, and other theme tokens with a live preview.
- Updated component count to 270+ across documentation.
- Enhanced accessibility documentation with new examples for `FocusTrap` and `LiveRegion`.
- Revised deployment instructions for server-side rendering and state management.
