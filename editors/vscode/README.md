# Aktion for VS Code

Rich language support for **[Aktion](https://asfand-dev.github.io/aktion/)**
`.aktion` files — the generative-UI DSL. Write Aktion with the same editor
comfort you expect from a first-class language: highlighting, diagnostics,
completions, go-to-definition, rename, and more.

## What this extension does

- **Syntax + semantic highlighting** — `.aktion` highlights like TypeScript,
  with extra colors for the reactive `$state` sigil, `$`-builtins, PascalCase
  component calls, and reserved handles. Semantic tokens then resolve each name
  precisely (library vs. your own component, builtin vs. reactive atom, etc.).
- **Diagnostics** — unknown components, unknown props, and enum mismatches are
  flagged inline as you type — the same schema-as-truth checks the runtime
  enforces.
- **Completions** — start typing and you get component names, your own
  file-scoped atoms / components / actions, keywords, and the full `$`-builtin
  catalog. Inside a component's trailing `{ … }` props object you get that
  component's prop names.
- **Hover** — component signatures and descriptions, `$`-builtin docs, keyword
  docs, and `$state` info.
- **Signature help** — parameter hints for library components, `$`-builtins, and
  your own components / actions / hooks, with the active argument tracked.
- **Go to Definition** — `Cmd/Ctrl+Click` (or `F12`) a symbol to jump to its
  declaration. Works **across files**: clicking an imported binding (e.g.
  `$count` from `import { $count } from "./counter.aktion"`) opens the source
  module on its declaration, and clicking the `"./counter.aktion"` string opens
  that file.
- **Find All References / Document Highlights**, **Rename Symbol** (the `$` sigil
  is preserved), and a **Document outline** of top-level atoms, components,
  actions, hooks, and imports.
- **Formatting** — "Format Document" / format-on-save runs the canonical,
  idempotent pretty-printer. Files with parse errors are left untouched, so a
  mid-edit document is never mangled.
- **Snippets** — generated from the component library (type `Card`, `App`,
  `Hero`, … and accept).
- **Embedded highlighting in HTML** — Aktion code written directly inside an
  `<aktion-app> … </aktion-app>` tag in a `.html` file is highlighted with the
  exact same grammar as a `.aktion` file, so an inline program reads identically
  whether it lives in a tag or a file:

  ```html
  <aktion-app>
  $app(Column([
    PageHeader('Hello', { subtitle: 'Generative UI in plain HTML' }),
    Card([CardHeader('It works'), Text('No build step required.')])
  ]))
  </aktion-app>
  ```

Everything runs in-process — there is no separate language server to install or
manage.

## Installing

### From an editor marketplace

Open the **Extensions** view and search for **"Aktion"**, then click **Install**.

- **VS Code** — [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=AsfandiyarKhan.aktion-vscode).
- **Cursor / VSCodium / Gitpod / Theia** — [Open VSX](https://open-vsx.org/extension/AsfandiyarKhan/aktion-vscode).

Or from the command line:

```bash
code --install-extension AsfandiyarKhan.aktion-vscode
```

### From a `.vsix` file

If you have a packaged build (e.g. from a release or CI artifact):

```bash
code --install-extension aktion-vscode-<version>.vsix
```

## Using it

1. Open any file ending in `.aktion`. The status bar (bottom-right) should show
   **Aktion** as the language mode.
2. Start writing — diagnostics, completions, and hover work immediately.
3. `Cmd/Ctrl+Click` symbols and import paths to navigate; press `F2` to rename.

**Recommended setting** — enable format-on-save for `.aktion` files in your
`settings.json`:

```jsonc
"[aktion]": {
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "AsfandiyarKhan.aktion-vscode",
  "editor.semanticHighlighting.enabled": true
}
```

New projects scaffolded with `npm create aktion@latest` already include this
configuration and a recommended-extensions prompt.

## Updating

VS Code and Cursor update marketplace extensions automatically. To update
manually, open the **Extensions** view, find **Aktion**, and click the update
button — or run:

```bash
code --install-extension AsfandiyarKhan.aktion-vscode --force
```

## Contributing

Issues and pull requests are welcome on
[GitHub](https://github.com/asfand-dev/aktion). The extension lives in
[`editors/vscode`](https://github.com/asfand-dev/aktion/tree/main/editors/vscode).

All language intelligence is powered by the framework's DOM-free
`aktion-runtime/language` surface, so most improvements (new diagnostics,
completions, builtins, …) are made in the core runtime and flow into the editor
automatically. For build, debug (F5), architecture, and publishing details, see
the [contributor guide](./docs/README.md).

## License

[MIT](https://github.com/asfand-dev/aktion/blob/main/LICENSE)
