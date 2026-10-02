# Aktion app — empty (JavaScript)

The minimal [Aktion](https://asfand-dev.github.io/aktion/) starter, written in
JavaScript: one `.aktion.js` module rendering a hello-world tree, wired through
Vite.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## How it works

- `src/app.aktion.js` is the **entry** module — it registers the UI root with
  `export default $app(...)`.
- The `aktion-runtime/vite` plugin compiles it like any `.aktion` file;
  `src/main.ts` mounts the result.
- Built-ins (`Column`, `Text`, `$state`, `$http`, …) can be imported from
  `aktion-runtime/dsl`, a types-only module that gives your editor completions
  and documentation; the import vanishes at build time.

Aktion runs your JavaScript under its own rules, and rejects what would behave
differently from plain JavaScript — `async`/`await`, `var`, `this`, a closure
that reads a variable reassigned after it was created, and a few more — with an
error at the exact line. See the TypeScript & JavaScript guide in the docs.

You can mix languages freely: `.aktion`, `.aktion.js` and `.aktion.ts` modules
import each other.
