# Aktion Language Server

A standalone [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
server for **[Aktion](https://asfand-dev.github.io/aktion/)** `.aktion` files.
Speaks LSP over stdio, has **zero runtime dependencies**, and ships as a single
`.mjs` file you can run with `node`.

## Why this exists

The VS Code extension talks to Aktion's DOM-free `aktion-runtime/language`
surface **in-process** — it can, because VS Code extensions are JavaScript. No
other editor family can: a JetBrains plugin is JVM code, and Neovim, Helix, Zed,
Sublime Text, and Emacs are not JS hosts at all.

Rather than reimplement Aktion's parser and schema validator per editor, this
server exposes the *same* pure functions over LSP:

```
src/tooling/*  (one parser, one schema validator, one formatter)
      │
      └── src/language-api.ts ──► editors/vscode              in-process
                              ──► editors/lsp  (this)         LSP over stdio
                              │        └──► editors/jetbrains, Neovim, Helix, Zed, …
                              └── docs/assets/playground.js   in-page
```

One implementation, three adapters. An editor can never disagree with the runtime
about what a valid program is.

## Features

Everything the language service can do is exposed:

| LSP capability | Backed by |
| --- | --- |
| `textDocument/publishDiagnostics` | `getDiagnostics` — parse errors, schema errors (unknown props, enum mismatches), and lint warnings (unknown components with "did you mean", shadowed i18n bindings) |
| `textDocument/hover` | `getHoverInfo` — component signatures, builtin/keyword docs, namespace + resource-bag members, config keys |
| `textDocument/completion` | `getCompletions` + `getSnippets` — components, your own atoms/components/actions, keywords, builtins, prop names, `.`-members, config keys, and snippet expansions |
| `textDocument/signatureHelp` | `getSignatureHelp` |
| `textDocument/definition` | `getDefinitionTarget` + `findDeclaration` — resolves **across files** |
| `textDocument/references` | `getReferences` |
| `textDocument/documentHighlight` | `getDocumentHighlights` |
| `textDocument/documentSymbol` | `getDocumentSymbols` |
| `textDocument/prepareRename`, `rename` | `getRenameEdits` (the `$` sigil is preserved) |
| `textDocument/formatting` | `formatProgram` — idempotent; leaves files with parse errors untouched |
| `textDocument/semanticTokens/full` | `getSemanticTokens` |

Snippet completions are only sent to clients that advertise
`completionItem.snippetSupport`, and hover/documentation is sent as plaintext to
clients that do not advertise markdown.

## Install

```bash
npm install -g aktion-language-server
```

Or run the built bundle directly from a checkout:

```bash
node editors/lsp/dist/server.mjs --stdio
```

Requires **Node 18+**.

## Editor setup

The server takes no configuration — point your client at it for `*.aktion` files.

### Neovim (0.11+)

```lua
vim.filetype.add({ extension = { aktion = "aktion" } })

vim.lsp.config.aktion = {
  cmd = { "aktion-language-server", "--stdio" },
  filetypes = { "aktion" },
  root_markers = { "package.json", ".git" },
}
vim.lsp.enable("aktion")
```

### Helix — `languages.toml`

```toml
[language-server.aktion]
command = "aktion-language-server"
args = ["--stdio"]

[[language]]
name = "aktion"
scope = "source.aktion"
file-types = ["aktion"]
roots = ["package.json", ".git"]
language-servers = ["aktion"]
indent = { tab-width = 2, unit = "  " }
```

### Zed — `settings.json`

Zed needs an extension to register the language; once `aktion` is a known
language, add:

```json
{
  "lsp": {
    "aktion": {
      "binary": { "path": "aktion-language-server", "arguments": ["--stdio"] }
    }
  }
}
```

### Sublime Text — LSP package settings

```json
{
  "clients": {
    "aktion": {
      "enabled": true,
      "command": ["aktion-language-server", "--stdio"],
      "selector": "source.aktion"
    }
  }
}
```

### Emacs — `eglot`

```elisp
(add-to-list 'auto-mode-alist '("\\.aktion\\'" . typescript-ts-mode))
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               '(typescript-ts-mode . ("aktion-language-server" "--stdio"))))
```

### JetBrains IDEs

Use the [Aktion plugin](../jetbrains/README.md), which bundles this server —
there is nothing to install by hand.

### VS Code

Use the [Aktion extension](../vscode/README.md). It runs the language service
in-process and does **not** need this server.

## Syntax highlighting

This server provides **semantic** tokens, not lexical ones. For comments,
strings, and numbers, point your editor at a TextMate/Tree-sitter grammar too.
Aktion is a strict subset of TypeScript, so the pragmatic option in most editors
is to treat `.aktion` as TypeScript for lexical purposes. Generated grammars
live in [`editors/vscode/syntaxes`](../vscode/syntaxes) (overlay on `source.ts`)
and, for hosts without a TypeScript grammar, in the self-contained bundle that
`editors/jetbrains/scripts/sync-assets.mjs` generates.

## CLI

```
aktion-language-server [--stdio]

  --stdio        Communicate over stdin/stdout (the default; accepted for
                 compatibility with clients that always pass it).
  -v, --version  Print the version and exit.
  -h, --help     Print help and exit.
```

Set `AKTION_LSP_TRACE=1` to log every request/response to stderr, which every
LSP client tees into a log window.

## Developing

```bash
# From the repo root — produces dist/language.js, which the server bundles.
npm install && npm run build

cd editors/lsp
npm run build       # → dist/server.mjs (single file, no deps)
npm run watch       # rebuild on change
npm run typecheck   # tsc --noEmit
```

The bundler aliases `aktion-runtime/language` to the repo's local build (or the
TypeScript source if you skipped the root build), so the server is buildable
without publishing or linking the package.

`tests/lsp-server.test.ts` at the repo root drives the built server over a real
stdio pipe.

## Design notes

- **Zero dependencies on purpose.** LSP is JSON-RPC with a `Content-Length`
  header; the framing is ~40 lines. The runtime ships no dependencies, and pulling
  in `vscode-languageserver` to save those lines would be the tail wagging the dog.
  `Content-Length` counts *bytes*, which is why the framing uses `Buffer`
  throughout — a program containing non-ASCII text would otherwise desynchronise
  the stream.
- **No language logic here.** The file only converts coordinates and shapes. The
  service is 1-indexed (line + column); LSP is 0-indexed (line + character, UTF-16
  code units). That off-by-one is the entire adapter.
- **Full document sync.** The service parses whole documents anyway, so
  incremental patching would add state for no gain.
- **Cross-file work belongs to the host.** `getDefinitionTarget` stays pure by
  *classifying* the cursor (`local` / `import-binding` / `module`); resolving
  `"./counter.aktion"` and reading it happens here, preferring an open buffer over
  the copy on disk.

## License

[MIT](https://github.com/asfand-dev/aktion/blob/main/LICENSE)
