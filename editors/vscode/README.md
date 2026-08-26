# Aktion for VS Code

Rich language support for **[Aktion](https://asfand-dev.github.io/aktion/)**
`.aktion` files — the generative-UI DSL. Write Aktion with the same editor
comfort you expect from a first-class language: highlighting, diagnostics,
completions, go-to-definition, rename, and more.

**At a glance** — 282 components across 17 groups, 26 `$`-builtins, 5 namespaces
(154 members), 8 factory resource bags, 42 snippets, and 12 built-in themes
(`light`, `dark`, `shadcn`, `shadcn-light`, `shadcn-dark`, `mui`, `mui-light`,
`mui-dark`, `heroui`, `heroui-light`, `heroui-dark`, `soft`). Every one of those
numbers is read from the runtime the extension bundles, not maintained by hand.

## What this extension does

- **Syntax + semantic highlighting** — `.aktion` highlights like TypeScript,
  with extra colors for the reactive `$state` sigil, `$`-builtins, PascalCase
  component calls, and reserved handles. Semantic tokens then resolve each name
  precisely (library vs. your own component, builtin vs. reactive atom, etc.).
- **Diagnostics** — unknown props and enum mismatches are flagged inline as you
  type (the same schema-as-truth checks the runtime enforces), and a PascalCase
  call that is neither a library component nor declared/imported in the file is
  flagged as a **warning** with a "did you mean?" suggestion.
- **Quick fixes** — accept that suggestion with `Cmd/Ctrl+.`: the nearest
  component names are offered as one-click replacements.
- **Completions** — start typing and you get component names, your own
  file-scoped atoms / components / actions, keywords, and the full `$`-builtin
  catalog. Inside a component's trailing `{ … }` props object you get that
  component's prop names. Type a `.` after a namespace and every member is
  offered: `$util.` (and nested `$util.style.` / `$util.rules.` / `$util.url.`),
  `$storage.` (`.local` / `.session` / `.cookies`), `$console.`, `$toast.`,
  `$dom.`, the reactive `route.` handle, and — for a binding assigned from a
  factory builtin
  (`$todos = $http(…)`, `form = $form(…)`) — that resource bag's members
  (`.data` / `.refetch()`, `.values` / `.submit()`, …). Inside a config-taking
  builtin's object (`$http({ … })`, `$query`, `$mutation`, `$socket`, `$sse`,
  `$form`, `$store`, `$theme`, `$i18n`) you get its config keys (`url`,
  `method`, `refetchInterval`, `colors`, …).
- **Hover** — component signatures and descriptions, `$`-builtin docs, keyword
  docs, `$state` info, per-member docs for every namespace / resource-bag
  member (`$util.format`, `$storage.local.set`, `$dom.onResize`,
  `$todos.refetch`, `route.path`), and config-object keys inside a builtin's
  `{ … }` (`$http`'s `url`, `$theme`'s `colors`, …).
- **Signature help** — parameter hints for library components, `$`-builtins,
  namespace + resource-bag member calls (`$util.format(…)`, `form.field(…)`),
  and your own components / actions / hooks, with the active argument tracked.
- **Go to Definition** — `Cmd/Ctrl+Click` (or `F12`) a symbol to jump to its
  declaration. Works **across files**: clicking an imported binding (e.g.
  `$count` from `import { $count } from "./counter.aktion"`) opens the source
  module on its declaration, and clicking the `"./counter.aktion"` string opens
  that file.
- **Find All References / Document Highlights**, **Rename Symbol** (the `$` sigil
  is preserved), a **Document outline** of top-level atoms, components, actions,
  hooks, and imports, and **workspace symbols** (`Cmd/Ctrl+T`) across every
  `.aktion` file in the project.
- **Formatting** — "Format Document" / format-on-save runs the canonical,
  idempotent pretty-printer. Files with parse errors are left untouched, so a
  mid-edit document is never mangled. (Aktion's printer is whole-program, so
  "Format Selection" formats the document.)
- **Snippets** — generated from the component library (type `Card`, `App`,
  `Hero`, … and accept).
- **Commands** (Command Palette, all prefixed **Aktion:**)
  - **Copy System Prompt (for an LLM)** — the generated Aktion system prompt,
    full or chat-sized, straight to your clipboard.
  - **Show Language Reference** — every builtin, namespace member, resource-bag
    member, keyword and component, generated from the bundled runtime.
  - **Insert Component…** — pick from the whole catalog, grouped, and insert a
    call skeleton at the cursor.
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

> **Using a JetBrains IDE?** IntelliJ IDEA, WebStorm, PyCharm, PhpStorm, GoLand,
> RubyMine, CLion, Rider and Android Studio are covered by the
> [Aktion JetBrains plugin](https://github.com/asfand-dev/aktion/tree/main/editors/jetbrains),
> and any other LSP-capable editor (Neovim, Helix, Zed, Sublime Text, Emacs) by
> the [Aktion language server](https://github.com/asfand-dev/aktion/tree/main/editors/lsp).
> All three read the same language surface, so they agree on what a valid program
> is.

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
},
// The extension already claims `.aktion`; pinning the association keeps it
// yours if another extension claims the same suffix.
"files.associations": { "*.aktion": "aktion" }
```

New projects scaffolded with `npm create aktion@latest` already include this
configuration (both blocks) and a recommended-extensions prompt.

### Settings this extension adds

| Setting | Default | What it does |
| --- | --- | --- |
| `aktion.diagnostics.enable` | `true` | Report parse / schema errors and lint warnings while you type. |
| `aktion.diagnostics.debounceMs` | `200` | Idle time before a changed document is re-analysed (`0` = every keystroke). Open and save always publish immediately. |
| `aktion.maxFileSizeKb` | `512` | Skip diagnostics for documents larger than this (`0` = no cap). |

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

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)
