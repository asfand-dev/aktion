# Changelog

All notable changes to **Aktion** are documented here in plain language.
Each entry is dated and summarises what was added, changed, or fixed.

---

## 2026-08-13

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
