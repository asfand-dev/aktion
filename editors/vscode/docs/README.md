# Aktion for VS Code — contributor guide

This is the **internal / maintainer** documentation for the extension: how it is
architected, how to build and debug it from a checkout, and how to publish it to
the marketplaces. For the **public, user-facing** overview (what it does and how
to install it), see [`../README.md`](../README.md).

---

## Architecture

### One implementation, three adapters

There is exactly one parser, one schema validator, one formatter and one language
service — in `src/tooling/*`, exported through
[`src/language-api.ts`](../../../src/language-api.ts) as the DOM-free
`aktion-runtime/language` surface. Every editor integration is an *adapter* over
it:

```
src/tooling/*  (one parser, one schema validator, one formatter, one service)
      │
      └── src/language-api.ts ──► editors/vscode   (this)  in-process
                              ──► editors/lsp             LSP over stdio
                              │        └──► editors/jetbrains, Neovim, Helix, Zed, …
                              └── docs/assets/playground.js       in-page
```

**Why this extension does NOT use `editors/lsp`.** The LSP server exists because
a JetBrains plugin is JVM code and Neovim / Helix / Zed / Emacs are not JS hosts
— they cannot call a JavaScript function, so they need a protocol. VS Code can:
the extension host *is* Node. `src/tooling/*` is pure, synchronous and
dependency-free, so calling it in-process is strictly cheaper than spawning a
child process and serialising every hover over stdio, and it keeps the "no
language server to install or manage" property the public README advertises.
A `vscode-languageclient` rewrite would buy nothing and cost a process.

The price of that choice is a duplicated adapter layer: position/range
conversion, the kind-mapping tables, the `resolveModule` candidate order and the
`safely()` guard exist in both [`src/extension.ts`](../src/extension.ts) and
[`../../lsp/src/server.ts`](../../lsp/src/server.ts). **Each duplicated helper
carries a comment naming its twin** — keep those comments accurate, and when you
fix a bug in one adapter, check the other. (If the duplication ever grows past
the mapping layer, the fix is to hoist the host-agnostic parts into
`src/tooling/` — not to make VS Code an LSP client.)

### The surface functions the extension consumes

| Feature | Service function(s) |
| --- | --- |
| Diagnostics | `getDiagnostics` (parse + schema + lint, already folded together) |
| Quick fixes | `suggestComponent` (nearest-name ranking) + `getComponentCatalog` |
| Hover | `getHoverInfo` |
| Completions | `getCompletions` |
| Signature help | `getSignatureHelp` |
| Go to Definition | `getDefinitionTarget` + `findDeclaration` (cross-file) |
| Find references / highlights | `getReferences` / `getDocumentHighlights` |
| Document outline / workspace symbols | `getDocumentSymbols` |
| Rename | `getRenameEdits` |
| Semantic highlighting | `getSemanticTokens` (+ `semanticTokenTypes` / `semanticTokenModifiers`) |
| Formatting (document + selection) | `formatProgram` |
| `Aktion: Show Language Reference` | `getLanguageSpec` + `grammarSpec` + `builtinCatalog` + `namespaceCatalog` + `factoryResourceCatalog` + `routeMembers` + `keywordDocs` + `getComponentCatalog` |
| `Aktion: Insert Component…` | `getComponentCatalog` (params → the call skeleton) |
| Snippets / grammar | `getSnippets` / `builtinCatalog` (build-time generators) |

`getLintWarnings` is deliberately **not** called: `getDiagnostics` already folds
the soft lint pass in, so calling both double-reports every warning.
`getDefinition` is likewise unused — it is the local-only, strictly weaker
variant of `getDefinitionTarget`.

Because the service is single-file, **cross-file work lives in the host**
([`src/extension.ts`](../src/extension.ts)): for go-to-definition the service
classifies the cursor (`local` / `import-binding` / `module`) and the extension
resolves the relative module path, reads the target file (preferring an open
buffer), and runs `findDeclaration` there; for workspace symbols the extension
walks `**/*.aktion` and calls `getDocumentSymbols` once per file.

Keep the extension free of language logic — anything that inspects Aktion source
belongs in `aktion-runtime/language` so the playground and editor stay in sync
(see [`.cursor/rules/editor-tooling-sync.mdc`](../../../.cursor/rules/editor-tooling-sync.mdc)).
The same rule bans hand-listed data: component names, builtins, keywords, theme
names and **counts** must be read from the surface. Two places cannot read
anything — the marketplace `description` in `package.json` and the "At a glance"
line in the public README are prose, and prose rots (the shipped description
claimed a "275-component library" long after the library had grown). Every figure
and every `$`-builtin named in those two strings is therefore asserted against
the runtime by
[`tests/vscode-extension-metadata.test.ts`](../../../tests/vscode-extension-metadata.test.ts),
which also checks the generated grammar and snippets, the semantic-token scope
map, the version lockstep, and that every contributed command and setting is
actually implemented. A library change now fails CI instead of shipping a wrong
blurb.

### Version lockstep

`package.json`'s `version` **tracks the runtime version exactly** (both are
`0.5.15`) and the same test asserts it. The reason is that `esbuild.mjs` *inlines*
the language surface into `dist/extension.js`: an installed extension serves the
diagnostics of the runtime it was built against, whatever `aktion-runtime` the
user's project has. Publishing the extension at a version that does not exist as
a runtime release would make that relationship unreadable. Bump both together.

`aktion-runtime` is therefore a **devDependency**, not a dependency: it is never
resolved at build time inside this repo (the alias points at the local build) and
never shipped (the bundle already contains the code). It is there so a standalone
checkout has a type source — and `tsconfig.json`'s `paths` prefers the repo's
`dist/types/language-api.d.ts` even then.

### Manifest choices worth knowing

- **`engines.vscode: ^1.75.0`** (Jan 2023). Nothing in the code needs a newer
  host — the newest API used is `registerDocumentSemanticTokensProvider` (1.43).
  The floor is deliberately low so remote/older installs keep working; raise it
  only when an API actually demands it.
- **`activationEvents: ["workspaceContains:**/*.aktion"]`** — and nothing else.
  Since 1.74 (below our floor) VS Code derives `onLanguage:aktion` from
  `contributes.languages` and `onCommand:*` from `contributes.commands`, so
  listing them would be dead metadata. `workspaceContains` is *not* implicit and
  earns its place: it activates the extension before any `.aktion` file is open,
  which is what makes `Cmd/Ctrl+T` workspace symbols work from a cold start.
- **`capabilities`** declares full untrusted-workspace support (the extension
  parses and pretty-prints — it never evaluates a program, spawns a process, or
  reads workspace config) and *limited* virtual-workspace support (only
  cross-file go-to-definition needs a real filesystem). Omitting the block makes
  VS Code silently restrict the extension.
- **`semanticTokenScopes`** maps modifier-qualified scopes
  (`class.defaultLibrary`, `function.defaultLibrary`, `*.declaration`) as well as
  the seven bare types. The service already distinguishes a library component
  from one you wrote via the `defaultLibrary` modifier; without those entries
  both fall to the same colour in themes with no default modifier styling.

---

## Running it locally (F5 debug)

The extension bundles the DOM-free `aktion-runtime/language` surface, so the
**runtime should be built first**. From a fresh checkout:

### 1. Build the runtime (repo root)

```bash
# from the repository root
npm install
npm run build          # produces dist/language.js — the entry this extension bundles
```

Re-run it whenever you change anything under `src/` (the language service,
parser, or component library).

### 2. Build the extension

```bash
cd editors/vscode
npm install            # @types/vscode, typescript, esbuild, @vscode/vsce, ovsx
npm run build          # 0) typecheck, 1) snippets, 2) grammar, 3) bundles dist/extension.js
```

`npm run build` runs four steps:

- `typecheck` — `tsc -p tsconfig.json` (`noEmit`; esbuild does the emit but does
  not check types, so this is the only thing that catches a renamed service
  export or a stale `dist/types/language-api.d.ts`).
- `gen-snippets` — reads `getSnippets()` and writes `snippets/aktion.code-snippets`.
- `gen-grammar` — reads `builtinCatalog` and writes two TextMate grammars:
  `syntaxes/aktion.tmLanguage.json` (the `.aktion` grammar; its `$`-builtin
  overlay stays in lockstep with the runtime) and
  `syntaxes/aktion-html-injection.tmLanguage.json` (an injection grammar that
  embeds `source.aktion` inside `<aktion-app> … </aktion-app>` tags in HTML
  files — contributed via `injectTo` in `package.json`). Both are generated;
  do not hand-edit them.
- `esbuild.mjs` — bundles `src/extension.ts` → `dist/extension.js` (CJS, Node
  target, `vscode` external), and copies the generated `system_prompt.txt` /
  `system_prompt_chat.txt` from the repo's `dist/` so
  **Aktion: Copy System Prompt** has something to serve (it says so plainly if
  the root build has not produced them).

Both generators resolve the language surface through
[`scripts/load-surface.mjs`](../scripts/load-surface.mjs), which tries the built
`dist/language.js` first and otherwise bundles `src/language-api.ts` on the fly —
so the extension build works even before the root build. That fallback bundle is
written to `os.tmpdir()` and deleted; it must never land in the source tree (two
691 KB copies were once committed as `scripts/.gen-*.tmp.mjs` and went stale,
which is why `.gitignore` now names the pattern).

`esbuild.mjs` resolves `aktion-runtime/language` three ways, in order: the repo's
built `dist/language.js` → its TypeScript source `src/language-api.ts` → nothing,
in which case the alias is **left off entirely** and esbuild resolves the
specifier from `node_modules`. Only the third path works in a standalone checkout
of this directory, and it only works because the alias is conditional.

### 3. Launch the Extension Development Host

Open the **`editors/vscode`** folder in VS Code and press **F5**. The included
[`.vscode/launch.json`](../.vscode/launch.json) runs the build task and opens a
second window (the dev host) with the
[`examples/vite-compiler`](../../../examples/vite-compiler/) project loaded.

Open any `.aktion` file (e.g. `src/app.aktion`) and you should see:

- **Highlighting** — colored like TypeScript, with `$state` and component calls distinct.
- **Diagnostics** — type a bad prop (`Card([], { junk: 1 })`) → a red squiggle.
  Type a component that does not exist (`Cardd([])`) → a **yellow** squiggle
  ("Unknown component <Cardd> … Did you mean "Card"?"), and `Cmd/Ctrl+.` on it
  offers the replacement as a quick fix.
- **Hover** — hover `Card` for its signature.
- **Completions** — start typing a component name (e.g. `Sid` → `Sidebar`) or
  press `Ctrl/Cmd+Space`; inside `(...)`/`[...]` you get components, inside a
  trailing `{ ... }` props object you get prop names.
- **Go to Definition** — `Cmd/Ctrl+Click` an imported `$atom`/component or the
  `"./module.aktion"` string to jump into the source file.
- **Snippets** — type `Card`, `App`, `Hero`, … and accept.
- **Commands** — `Cmd/Ctrl+Shift+P` → "Aktion" lists the three commands. Note
  that **Copy System Prompt** needs the repo's `dist/system_prompt*.txt`, i.e. a
  root `npm run build` (or `npm run build:prompt`) before the extension build.

If a feature misbehaves, check the **Aktion** output channel: every
language-service call is wrapped in an error guard that logs there instead of
throwing out of the provider.

Edit `src/extension.ts`, re-run `npm run build` (or `npm run watch`), and click
**↻ Restart** in the debug toolbar to reload the host.

---

## Publishing to the marketplaces

Aktion users install the extension from a marketplace. The extension can be
published to **two**: the **Visual Studio Marketplace** (VS Code) and **Open VSX**
(VSCodium, Cursor, Gitpod, …). Publish to both for the widest reach.

### What is already in place

Nothing here is outstanding — this list exists so you can tell what is *not*
missing:

- `"publisher": "AsfandiyarKhan"`, `"icon": "icon.png"` (a committed 128×128
  PNG), `repository` (with `directory`), `homepage`, `bugs`, `categories`,
  `keywords` and `"license": "MIT"` are all populated in `package.json`.
- `LICENSE` and `CHANGELOG.md` sit next to `package.json`. Both are packaged and
  rendered by the marketplace — the Changelog tab reads `CHANGELOG.md`, and
  without a `LICENSE` file `vsce package` warns and the published extension
  carries no license text. Add a section to the changelog with every release.

### One-time setup

1. **Use your own publisher id.** If you are not publishing as
   `AsfandiyarKhan`, create your own publisher (below) and change
   `package.json`'s `"publisher"` to match — the id in the manifest must equal
   the account you upload with.
2. **Get the two tokens** — an Azure DevOps PAT for the Visual Studio
   Marketplace and an access token for Open VSX (both below).
3. **Install the tooling** (already in `devDependencies`):
   ```bash
   npm i -g @vscode/vsce ovsx     # or use the local devDeps via npx
   ```

### Visual Studio Marketplace (VS Code)

1. **Create a publisher.** Sign in at <https://marketplace.visualstudio.com/manage>
   with a Microsoft account and create a publisher (its id goes in `package.json`'s
   `"publisher"`).
2. **Create an Azure DevOps Personal Access Token (PAT)** at
   <https://dev.azure.com> → User settings → Personal access tokens. Scope:
   **Marketplace → Manage**, Organization: **All accessible organizations**.
3. **Bump first.** `vsce publish` does **not** bump on its own — it uploads
   whatever `version` is already in `package.json`, and the marketplace rejects a
   version it already has. Either `npm version patch` (which is also where you
   keep the runtime lockstep honest) or let `vsce` do it as part of the publish.
4. **Log in and publish:**
   ```bash
   cd editors/vscode
   npx vsce login <publisher>        # paste the PAT
   npm run build                     # ensure dist/ + snippets/ are fresh
   npm run publish                   # = vsce publish — uploads package.json's version as-is
   ```
   - Bump *and* upload in one step: `npx vsce publish patch` (or `minor` /
     `major` / `1.2.3`) instead of `npm run publish`.
   - Publish with a token instead of an interactive login: `npx vsce publish -p <PAT>`.
5. **Verify** at `https://marketplace.visualstudio.com/items?itemName=<publisher>.aktion-vscode`.
   Users then find it in VS Code's Extensions view by searching **"Aktion"**.

### Open VSX (VSCodium / Cursor / Gitpod / Eclipse Theia)

1. Create an account at <https://open-vsx.org>, become a member of (or create)
   a namespace matching your `publisher`, and generate an access token.
2. Publish:
   ```bash
   cd editors/vscode
   npm run build
   npx ovsx publish -p <OPEN_VSX_TOKEN>     # = npm run publish:ovsx
   ```

### Package a `.vsix` (no marketplace)

For local installs, CI artifacts, or private distribution:

```bash
cd editors/vscode
npm run package                 # = vsce package  → aktion-vscode-<version>.vsix
code --install-extension aktion-vscode-<version>.vsix
```

**What ends up inside**, per [`.vscodeignore`](../.vscodeignore) — check `npx vsce ls`
against this list when you add files:

```
CHANGELOG.md            README.md              LICENSE
package.json            icon.png               language-configuration.json
dist/extension.js       dist/system_prompt.txt dist/system_prompt_chat.txt
snippets/aktion.code-snippets
syntaxes/aktion.tmLanguage.json
syntaxes/aktion-html-injection.tmLanguage.json
```

`snippets/` and `syntaxes/` are generated but **must** ship (`package.json`
contributes them). `src/`, `scripts/`, `docs/`, `esbuild.mjs`, `tsconfig.json`,
`package-lock.json`, sourcemaps and any previous `.vsix` are excluded.

### CI publishing

Publishing from CI on a tagged release is the reproducible way to do it. **There
is no workflow for it in this repo yet** — `.github/workflows/` contains only
`deploy-pages.yml`, so treat the following as the recipe to wire up, not
something that already runs. Store the PAT as `VSCE_PAT` and the Open VSX token
as `OVSX_TOKEN` repository secrets, build the runtime first (the extension
bundles it), then:

```bash
npm ci && npm run build                  # repo root: produces dist/language.js + prompts
cd editors/vscode && npm ci && npm run build
npx vsce publish -p "$VSCE_PAT"
npx ovsx publish -p "$OVSX_TOKEN"
```

---

## Troubleshooting

**Deprecation warnings in the Debug Console** (`DEP0040 punycode`, `DEP0005
Buffer()`, `DEP0169 url.parse()`) are **not produced by this extension** — they
come from the VS Code Extension Development Host's Node/Electron runtime and
other extensions, and appear for every extension project. The extension only
calls the pure `aktion-runtime/language` functions and the `vscode` API. Safe to
ignore; to silence them, add to `.vscode/launch.json`:

```jsonc
"env": { "NODE_OPTIONS": "--no-deprecation" }
```

**No highlighting / features on a `.aktion` file** — confirm the status-bar
language mode (bottom-right) is **Aktion**; if it shows Plain Text, the
extension didn't activate (press F5 from the `editors/vscode` folder and ensure
`dist/extension.js` exists).

**Go to Definition doesn't open an imported file** — cross-file jumps only
resolve **relative** specifiers (`./…` / `../…`). The target is tried as-is,
then with `.aktion`, then `<spec>/index.aktion`; make sure the file exists at one
of those paths relative to the importing file. They are also declined outright in
an unsaved (`untitled:`) or virtual document, where there is no directory to
resolve against — save the file first.

**"Aktion: Copy System Prompt … is not bundled with this build"** — the prompts
are generated at the repo root. Run `npm run build` (or `npm run build:prompt`)
there, then rebuild the extension so `esbuild.mjs` can copy them into `dist/`.

**A feature silently does nothing** — open the **Aktion** output channel. Every
language-service call is wrapped in an error guard that logs there and returns an
empty result, so a crash shows up as a log line rather than a frozen provider.
Rename is the exception: it surfaces its error to the user directly.
