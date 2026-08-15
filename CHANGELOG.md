# Changelog

All notable changes to **Aktion** are documented here in plain language.
Each entry is dated and summarises what was added, changed, or fixed.

---

## 2026-08-15

### Docs Runtime Version Sync

- Added a docs version sync step that reads the current `package.json` version and updates version badges/snippets in the docs and flagship demos automatically.
- Wired the sync into `build` and `build:docs`, so docs stop drifting to old values like `0.5.15` after a release bump.

### UI Providers Interoperability Layer

- Added a formal interoperability interface (`UIProvider`) to allow external packages to replace Aktion's default component library.
- Added a new `setUIProvider()` method on `<aktion-app>` to seamlessly swap the built-in UI layer for UI libraries like Material UI, Bootstrap, or ShadCN.
- Added documentation for UI providers with examples on how to build connectors for React and plain-DOM UI libraries.
- Added a new section on the homepage illustrating how Aktion orchestrates various design systems like Material UI, Bootstrap, and ShadCN.
- Expanded UI Providers documentation with a guide on how to write and publish custom packages for in-house or external UI libraries.

### Vite HMR for `.aktion` Files

- Vite's dev server now watches all `*.aktion` files and triggers a full hot-reload whenever one changes, so edits to `.aktion` sources are reflected in the browser instantly.

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
