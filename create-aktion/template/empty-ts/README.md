# Aktion app — empty (TypeScript)

The minimal [Aktion](https://asfand-dev.github.io/aktion/) starter, written in
TypeScript: one `.aktion.ts` module rendering a hello-world tree, wired through
Vite.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # declarations for any .aktion module (aktion-dts), then tsc over src/ and tests/
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## How it works

- `src/app.aktion.ts` is the **entry** module — it registers the UI root with
  `export default $app(...)`.
- The `aktion-runtime/vite` plugin erases the types (with `ts-blank-space`,
  without moving a character, so errors point at your lines) and compiles the
  module like any `.aktion` file; `src/main.ts` mounts the result. Host code
  imports only that default export: an Aktion module's other exports exist
  inside Aktion programs.
- Built-ins (`Column`, `Text`, `$state`, `$http`, …) come from
  `aktion-runtime/dsl`, a types-only module: `tsc` checks every call against the
  component library, and the import vanishes at build time.

Aktion runs your TypeScript under its own rules, and rejects what would behave
differently from JavaScript — `async`/`await`, `var`, `this`, a closure that
reads a variable reassigned after it was created, and a few more — with an
error at the exact line. See the TypeScript guide in the docs.

You can mix languages freely: `.aktion`, `.aktion.ts` and `.aktion.js` modules
import each other.
