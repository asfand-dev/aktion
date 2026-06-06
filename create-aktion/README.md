# create-aktion

Scaffold a new [Aktion](https://asfand-dev.github.io/aktion/) app in seconds —
pick from a hello-world starter or a fully-featured example.

```bash
# npm
npm create aktion@latest my-app

# pnpm
pnpm create aktion my-app

# yarn
yarn create aktion my-app

# or directly
npx create-aktion my-app
```

Run with no project name in a terminal and it prompts for a name and a template
interactively. Then:

```bash
cd my-app
npm install
npm run dev        # http://localhost:5173
npm test           # (templates other than `empty`)
```

## Templates

| Template     | What you get |
|--------------|--------------|
| `empty`      | Minimal hello-world starter — one `.aktion` file, no tests. |
| `dashboard`  | A home-automation control panel — a `$store`, device controls (switches/sliders), scenes, energy charts, and automations, behind an `AppShell` + router. |
| `website`    | A pet-sitting company marketing site — sticky navbar, hero, services, a pricing table + FAQ, and a validated contact form. |
| `todos-app`  | A REST CRUD todo app — `$http` create/toggle/edit/delete against a live API, with `Async` loading/error/empty states. |
| `chatbot`    | An OpenAI chatbot — settings popover for your API key, a transcript, and an offline echo fallback so it works with no key. |
| `portfolio`  | A frontend developer portfolio — router pages, a filterable projects grid, an experience timeline + skills radar, and a contact form. |

Every template except `empty` ships **multiple `.aktion` files** split the way
you'd split a React app (data / store / components / pages) and a **Vitest unit
test suite** covering its core behaviour.

```bash
# pick a template up front (non-interactive / CI):
npm create aktion@latest my-app -- --template dashboard
npx create-aktion my-app -y --template todos-app
```

## Options

```
create-aktion <project-name> [options]

  -t, --template <name>   empty | dashboard | website | todos-app | chatbot | portfolio
                          (default: empty)
      --pm <manager>      Package manager for the printed next-steps (npm | pnpm | yarn | bun)
  -y, --yes               Skip prompts (use defaults; required in CI / non-TTY)
  -h, --help              Show help
```

## What you get

A Vite + TypeScript project with multi-file `.aktion` modules wired through the
`aktion-runtime/vite` plugin (which links the `import`/`export` graph and emits
a typed `CompiledProgram`), HMR with `$state` preservation, ambient `*.aktion`
types, and — for every template but `empty` — Vitest tests that mount the
compiled program and drive it like a user.

```
my-app/
  src/
    app.aktion              entry (assigns `aktion`, imports the rest)
    …                       components/, pages/, data/, store, lib (per template)
    main.ts                 mounts the compiled program
    env.d.ts
  tests/                    Vitest suite (except `empty`)
  index.html
  vite.config.ts            registers the aktion() plugin
  vitest.config.ts          happy-dom test env (except `empty`)
  tsconfig.json
  .vscode/                  recommends the Aktion extension + format-on-save
```

Install the **Aktion** VS Code extension for highlighting, diagnostics, hover,
and completions on `.aktion` files.
