# Aktion for VS Code — contributor guide

This is the **internal / maintainer** documentation for the extension: how it is
architected, how to build and debug it from a checkout, and how to publish it to
the marketplaces. For the **public, user-facing** overview (what it does and how
to install it), see [`../README.md`](../README.md).

---

## Architecture

All language features run **in-process** via the DOM-free
[`aktion-runtime/language`](../../../src/language-api.ts) surface — the same pure
functions the docs playground uses. **There is no separate language server.** The
extension is a thin adapter that maps the service's 1-indexed JSON results onto
VS Code's 0-indexed API types.

The surface functions the extension consumes:

| Feature | Service function(s) |
| --- | --- |
| Diagnostics | `getDiagnostics` |
| Hover | `getHoverInfo` |
| Completions | `getCompletions` |
| Signature help | `getSignatureHelp` |
| Go to Definition | `getDefinitionTarget` + `findDeclaration` (cross-file) |
| Find references / highlights | `getReferences` / `getDocumentHighlights` |
| Rename | `getRenameEdits` |
| Document outline | `getDocumentSymbols` |
| Semantic highlighting | `getSemanticTokens` (+ `semanticTokenTypes` / `semanticTokenModifiers`) |
| Formatting | `formatProgram` |
| Snippets / grammar | `getSnippets` / `builtinCatalog` (build-time generators) |

Because the service is single-file, **cross-file go-to-definition lives in the
host** ([`src/extension.ts`](../src/extension.ts)): the service classifies the
cursor (`local` / `import-binding` / `module`) and the extension resolves the
relative module path, reads the target file (preferring an open buffer), and
runs `findDeclaration` there.

Keep the extension free of language logic — anything that inspects Aktion source
belongs in `aktion-runtime/language` so the playground and editor stay in sync
(see [`.cursor/rules/editor-tooling-sync.mdc`](../../../.cursor/rules/editor-tooling-sync.mdc)).

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
npm install            # @types/vscode, esbuild, @vscode/vsce, ovsx
npm run build          # 1) generates snippets, 2) generates grammar, 3) bundles dist/extension.js
```

`npm run build` runs three steps:

- `gen-snippets` — reads `getSnippets()` and writes `snippets/aktion.code-snippets`.
- `gen-grammar` — reads `builtinCatalog` and writes two TextMate grammars:
  `syntaxes/aktion.tmLanguage.json` (the `.aktion` grammar; its `$`-builtin
  overlay stays in lockstep with the runtime) and
  `syntaxes/aktion-html-injection.tmLanguage.json` (an injection grammar that
  embeds `source.aktion` inside `<aktion-app> … </aktion-app>` tags in HTML
  files — contributed via `injectTo` in `package.json`). Both are generated;
  do not hand-edit them.
- `esbuild.mjs` — bundles `src/extension.ts` → `dist/extension.js` (CJS, Node
  target, `vscode` external). It aliases `aktion-runtime/language` to the repo's
  local build (or the TS source if you skipped step 1).

Both generators fall back to bundling the TS source when `dist/language.js`
hasn't been built, so the extension build works even before the root build.

### 3. Launch the Extension Development Host

Open the **`editors/vscode`** folder in VS Code and press **F5**. The included
[`.vscode/launch.json`](../.vscode/launch.json) runs the build task and opens a
second window (the dev host) with the
[`examples/vite-compiler`](../../../examples/vite-compiler/) project loaded.

Open any `.aktion` file (e.g. `src/app.aktion`) and you should see:

- **Highlighting** — colored like TypeScript, with `$state` and component calls distinct.
- **Diagnostics** — type a bad prop (`Card([], { junk: 1 })`) → a red squiggle.
- **Hover** — hover `Card` for its signature.
- **Completions** — start typing a component name (e.g. `Sid` → `Sidebar`) or
  press `Ctrl/Cmd+Space`; inside `(...)`/`[...]` you get components, inside a
  trailing `{ ... }` props object you get prop names.
- **Go to Definition** — `Cmd/Ctrl+Click` an imported `$atom`/component or the
  `"./module.aktion"` string to jump into the source file.
- **Snippets** — type `Card`, `App`, `Hero`, … and accept.

Edit `src/extension.ts`, re-run `npm run build` (or `npm run watch`), and click
**↻ Restart** in the debug toolbar to reload the host.

---

## Publishing to the marketplaces

Aktion users install the extension from a marketplace. The extension can be
published to **two**: the **Visual Studio Marketplace** (VS Code) and **Open VSX**
(VSCodium, Cursor, Gitpod, …). Publish to both for the widest reach.

### One-time setup

1. **Add an icon + final metadata.** Marketplaces require/recommend a 128×128
   PNG `icon` and good metadata. In `package.json`:
   - set `"publisher"` to **your** marketplace publisher id,
   - add `"icon": "icon.png"` (commit a `128x128` `icon.png` next to `package.json`),
   - keep `repository`, `categories`, `keywords`, `license` populated (already are).
2. **Install the tooling** (already in `devDependencies`):
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
3. **Log in and publish:**
   ```bash
   cd editors/vscode
   npx vsce login <publisher>        # paste the PAT
   npm run build                     # ensure dist/ + snippets/ are fresh
   npm run publish                   # = vsce publish  (bumps + uploads)
   ```
   - Publish a specific bump: `npx vsce publish minor` (or `patch` / `major` / `1.2.3`).
   - Or publish a token without an interactive login: `npx vsce publish -p <PAT>`.
4. **Verify** at `https://marketplace.visualstudio.com/items?itemName=<publisher>.aktion-vscode`.
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

### CI publishing (recommended)

Run the publish in CI on a tagged release so it's reproducible. Store the PAT as
`VSCE_PAT` and the Open VSX token as `OVSX_TOKEN` secrets, then:

```bash
npm ci && npm run build
npx vsce publish -p "$VSCE_PAT"
npx ovsx publish -p "$OVSX_TOKEN"
```

> `vsce` reads the version from `package.json`. Bump it (e.g. `npm version patch`)
> before each release, and keep a `CHANGELOG.md` — the marketplace shows it.

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
of those paths relative to the importing file.
