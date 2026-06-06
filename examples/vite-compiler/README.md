# Aktion Vite plugin — multi-file example

A minimal Vite app that authors UI in `.aktion` files and compiles them with the
`aktion-runtime/vite` plugin. The browser mounts the pre-parsed AST via
`mountCompiled(...)` — the runtime parser never runs at page load.

```
src/
  dashboard.aktion          a single-file program
  app.aktion                a multi-file ENTRY — imports from a sibling module
  components/
    counter.aktion          exports `Counter` + `$count`; keeps `increment` private
  main.ts                   imports both entries and mounts them
  env.d.ts                  ambient `*.aktion` module types
index.html
vite.config.ts              registers the aktion() plugin
```

## Multi-file modules

`.aktion` files `import`/`export` like JS/TS, with **true module scope** — a
file's non-exported top-level names are private:

```js
// src/components/counter.aktion
export $count = 0
export function Counter() { /* … reads $count, calls increment … */ }
function increment() { $count = $count + 1 }   // private to this module
```

```js
// src/app.aktion  (entry)
import { Counter, $count } from "./components/counter.aktion"
aktion = Column([Markdown(`Shared count: ${$count}`), Counter()])
```

The plugin resolves the import graph at build time and links it into one
program (renaming each module's private names so two files can reuse a name
without clashing). The entry keeps its own names canonical.

## Run it

This example depends on `aktion-runtime`. From a checkout of the library:

```bash
# in the repo root
npm install && npm run build && npm link

# in this folder
npm install && npm link aktion-runtime
npm run dev
```

Then:

- Edit `src/components/counter.aktion` (e.g. change the header). The page
  hot-updates **without losing the count** — the plugin recompiles, registers
  the imported file as a watched dependency, and the self-accepting module
  re-mounts while replaying `$state` via `serializeState()`.
- Import a name a module doesn't `export`, or use an unknown prop — it surfaces
  in the Vite **error overlay** pointing at the offending `.aktion` line.

## Editor support

Install the [Aktion VS Code extension](../../editors/vscode/) for
TypeScript-grade highlighting plus inline diagnostics, hover, completions, and
snippets on `.aktion` files. Or scaffold a fresh project with
`npm create aktion@latest`.
