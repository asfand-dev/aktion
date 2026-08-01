# Changelog

All notable changes to the **Aktion** VS Code extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the extension version tracks the `aktion-runtime` version it bundles exactly —
see the [contributor guide](./docs/README.md) on version lockstep.

## [0.5.15]

The extension bundles the Aktion 0.5.15 language surface: **281 components**
across 17 groups, **26 `$`-builtins**, 5 namespaces (153 members), 8 factory
resource bags, 42 snippets and 6 built-in themes.

### Added

- **Quick fixes** for the unknown-component warning — the nearest component
  names (ranked by the runtime, not by the extension) are offered as one-click
  replacements.
- **Workspace symbols** (`Cmd/Ctrl+T`) across every `.aktion` file in the
  project, and "Format Selection" support (Aktion's printer is whole-program, so
  a selection formats the document).
- Three commands: **Aktion: Copy System Prompt (for an LLM)** (full or
  chat-sized), **Aktion: Show Language Reference** (generated from the bundled
  runtime), and **Aktion: Insert Component…** (quick pick over the whole
  catalog, grouped).
- Settings: `aktion.diagnostics.enable`, `aktion.diagnostics.debounceMs`,
  `aktion.maxFileSizeKb`.
- Declared extension `capabilities`: full support in untrusted workspaces
  (nothing is ever evaluated) and limited support in virtual workspaces
  (cross-file go-to-definition needs a local filesystem).
- A file icon for `.aktion` documents.

### Changed

- Diagnostics are **debounced** (200 ms by default) and skipped above a
  configurable file size, instead of re-parsing the whole document synchronously
  on every keystroke.
- Every language-service call is wrapped in an error guard that logs to the
  **Aktion** output channel, so a pathological buffer degrades one feature
  instead of silently freezing diagnostics on stale results. Rename still
  surfaces its error message to the user.
- Semantic-token scopes now include modifier-qualified entries, so a library
  component (`class.defaultLibrary`) is themed differently from one you wrote.
- The marketplace description and README no longer claim a stale component
  count; both figures are asserted against the runtime by
  `tests/vscode-extension-metadata.test.ts`.

### Fixed

- Unknown components really are flagged inline now: the runtime's lint pass
  reports them as warnings with a "did you mean?" hint, and the extension themes
  warnings as warnings.
- Cross-file go-to-definition no longer tries to resolve module paths for
  `untitled:` / virtual documents, where the path is meaningless.
- A semantic token whose type is not in the legend is dropped instead of
  corrupting the encoded token stream.
- `esbuild.mjs` falls back to the installed `aktion-runtime` package when the
  repo's local build is absent, which is what a standalone checkout needs.
