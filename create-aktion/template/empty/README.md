# Aktion app — empty

The minimal [Aktion](https://asfand-dev.github.io/aktion/) starter: one
`.aktion` file rendering a hello-world tree, wired through Vite.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## How it works

- `src/app.aktion` is the **entry** program — it registers the UI root with
  `$app(...)`.
- The `aktion-runtime/vite` plugin compiles your `.aktion` file(s) at build
  time; `src/main.ts` mounts the result with `mountCompiled`. Editing any
  `.aktion` file hot-reloads while preserving live `$state`.

Grow from here: pull pieces into `function` components, split them into more
`.aktion` files and `import`/`export` between them, and add reactive state with
`$`-prefixed bindings. The richer scaffolds (`dashboard`, `website`,
`todos-app`, `chatbot`, `portfolio`) show those patterns — generate one with
`npm create aktion@latest my-app -- --template dashboard`.

Install the **Aktion** VS Code extension for highlighting, diagnostics, hover,
and completions on `.aktion` files.
