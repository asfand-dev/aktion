# Aktion for JetBrains IDEs

<!-- Plugin description -->
Rich language support for <a href="https://asfand-dev.github.io/aktion/">Aktion</a>
<code>.aktion</code> files — the generative-UI DSL that turns a compact,
streaming-first program into a full interactive UI inside a single web component.

<p>Works in every JetBrains IDE from 2024.2 onward: IntelliJ IDEA (Community and
Ultimate), WebStorm, PyCharm, PhpStorm, GoLand, RubyMine, CLion, Rider, and
Android Studio.</p>

<h3>Features</h3>
<ul>
  <li><b>Syntax and semantic highlighting</b> — Aktion colours like TypeScript,
      with distinct colours for the reactive <code>$state</code> sigil,
      <code>$</code>-builtins, PascalCase component calls, and reserved handles.
      Semantic tokens then resolve each name precisely: a library component
      versus one you wrote, a builtin versus a reactive atom.</li>
  <li><b>Diagnostics as you type</b> — unknown components (with a
      "did you mean?" suggestion), unknown props, and enum mismatches, from the
      same schema-as-truth checks the runtime itself enforces.</li>
  <li><b>Completion</b> — all 281 library components, your own file-scoped atoms
      / components / actions, keywords, and the full <code>$</code>-builtin
      catalog. Inside a component's trailing <code>{ … }</code> you get that
      component's prop names; after a <code>.</code> you get namespace and
      resource-bag members (<code>$util.</code>, <code>$storage.local.</code>,
      <code>$toast.</code>, <code>route.</code>, <code>$todos.refetch</code>);
      inside <code>$http({ … })</code> and friends you get their config keys.</li>
  <li><b>Quick documentation and parameter hints</b> — component signatures and
      descriptions, builtin docs, keyword docs, and per-member documentation,
      with the active argument tracked.</li>
  <li><b>Navigation</b> — Go to Declaration, Find Usages, and Rename, all
      working <i>across files</i>: jump from an imported binding straight to its
      declaration in the source module.</li>
  <li><b>Structure view</b> of top-level atoms, components, actions, hooks, and
      imports.</li>
  <li><b>Reformat Code</b> — the canonical, idempotent Aktion pretty-printer.
      Files with parse errors are left untouched, so a mid-edit document is never
      mangled.</li>
  <li><b>Snippets</b> — generated from the component library: type
      <code>App</code>, <code>Card</code>, <code>Hero</code>, … and accept.</li>
</ul>

<p>All language intelligence comes from the Aktion runtime's own DOM-free
language service, bundled with this plugin and spoken over the Language Server
Protocol — the identical analysis the official VS Code extension runs. There is
nothing to install separately and no server to configure.</p>
<!-- Plugin description end -->

## Requirements

- A JetBrains IDE, **2024.2 or newer**.
- **[LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij)** — the LSP
  client. The IDE offers to install it automatically when you install this
  plugin, because it is declared as a required dependency.
- **Node.js 18 or newer** on your machine. The plugin runs its bundled language
  server with it.

> **Why Node?** The Aktion language service *is* the runtime's own parser and
> schema validator. Running it directly — rather than reimplementing Aktion's
> grammar in Kotlin — is what guarantees the IDE flags exactly what the runtime
> flags, forever. See [the contributor guide](./docs/README.md#architecture).

## Installing

### From JetBrains Marketplace

<kbd>Settings</kbd> → <kbd>Plugins</kbd> → <kbd>Marketplace</kbd>, search for
**"Aktion"**, and click **Install**. Accept the prompt to also install LSP4IJ.

Or from the plugin's Marketplace page. (JetBrains assigns the numeric page URL —
`plugins.jetbrains.com/plugin/<id>-aktion` — on first publication; searching for
**"Aktion"** in the IDE always works.)

### From a ZIP

<kbd>Settings</kbd> → <kbd>Plugins</kbd> → <kbd>⚙</kbd> →
**Install Plugin from Disk…**, then pick
`aktion-jetbrains-<version>.zip` (from a release, or from
`build/distributions/` after building locally).

## Using it

1. Open any `.aktion` file. Highlighting is immediate.
2. The language server starts on first open. Watch it in the **Language Servers**
   tool window (<kbd>View</kbd> → <kbd>Tool Windows</kbd> →
   <kbd>Language Servers</kbd>) — that is also where the server's log lives.
3. Diagnostics, completion (<kbd>Ctrl/Cmd</kbd>+<kbd>Space</kbd>), quick docs
   (<kbd>Ctrl/Cmd</kbd>+<kbd>Q</kbd> / <kbd>F1</kbd>), Go to Declaration
   (<kbd>Ctrl/Cmd</kbd>+<kbd>B</kbd>), Find Usages
   (<kbd>Alt</kbd>+<kbd>F7</kbd>), Rename (<kbd>Shift</kbd>+<kbd>F6</kbd>), and
   Reformat Code (<kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>) all work.

### Settings

<kbd>Settings</kbd> → <kbd>Languages & Frameworks</kbd> → <kbd>Aktion</kbd>.
Everything here is optional:

| Setting | Default | When you need it |
| --- | --- | --- |
| **Node interpreter** | auto-detected | Your Node lives somewhere the IDE's `PATH` cannot see. Common with `nvm`, `fnm`, `asdf`, and Volta, because a GUI-launched IDE does not source a login shell. |
| **Language server script** | bundled | You are developing the language service and want the plugin to run your checkout's `editors/lsp/dist/server.mjs`. |
| **Log the LSP protocol trace** | off | Debugging. The trace appears in the **Language Servers** tool window. |

## Troubleshooting

**Highlighting works but nothing else does.** The language server did not start.
Open **Language Servers** and read the log. The usual cause is a Node interpreter
the IDE cannot find — set it explicitly in Settings (above).

**"Plugin 'Aktion' requires plugin 'LSP4IJ' to be installed."** Install
[LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) from the Marketplace,
then restart.

**No colours at all.** The bundled TextMate plugin is disabled. Re-enable
*TextMate bundles* under <kbd>Settings</kbd> → <kbd>Plugins</kbd> →
<kbd>Installed</kbd>. (Semantic colouring from the language server still works
without it, so this looks like "only some tokens are coloured".)

**Nothing at all on a `.aktion` file.** Confirm the file extension is exactly
`.aktion` — the mapping is by file-name pattern.

## Contributing

Issues and pull requests are welcome on
[GitHub](https://github.com/asfand-dev/aktion). The plugin lives in
[`editors/jetbrains`](https://github.com/asfand-dev/aktion/tree/main/editors/jetbrains)
and the language server it bundles in
[`editors/lsp`](https://github.com/asfand-dev/aktion/tree/main/editors/lsp).

Because all analysis lives in the core runtime's `aktion-runtime/language`
surface, most improvements — new diagnostics, completions, builtins, components —
are made there and flow into this plugin, the VS Code extension, and the docs
playground automatically. For architecture, build, debug, and publishing details,
see the [contributor guide](./docs/README.md).

## License

[MIT](https://github.com/asfand-dev/aktion/blob/main/LICENSE)
