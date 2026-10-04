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

## TypeScript and JavaScript

Aktion modules can also be written in TypeScript (`.aktion.ts`) or JavaScript
(`.aktion.js`) — pick with `--lang`:

```bash
npx create-aktion my-app -y --template todos-app --lang ts
npx create-aktion my-app -y --template empty --lang js
```

| `--lang`  | Modules        | What changes |
|-----------|----------------|--------------|
| `aktion`  | `.aktion`      | The default: the Aktion DSL. |
| `ts`      | `.aktion.ts`   | Typed against the component library through `aktion-runtime/dsl`; the recommended `tsconfig.json`; `ts-blank-space` (which erases the types without moving a character) and a `typecheck` script; the plugin's `dts` option, so `.aktion` modules you add are typed too. |
| `js`      | `.aktion.js`   | Plain JavaScript modules; `allowJs`, so host code and tests see their exports. |

The `empty` and `todos-app` templates come in all three languages. Whatever the
language, host code (`src/main.ts`) and tests are TypeScript, and the three
module kinds can import each other — a `.aktion.ts` store can feed `.aktion`
components. Aktion runs TypeScript and JavaScript under its own rules and
reports anything that would behave differently from JavaScript (`async`/`await`,
`var`, `this`, a closure reading a variable reassigned after it was created, …)
with an error at the exact line.

## Options

```
create-aktion <project-name> [options]

  -t, --template <name>   empty | dashboard | website | todos-app | chatbot | portfolio
                          (default: empty)
  -l, --lang <language>   aktion | ts | js — the language of the Aktion modules
                          (default: aktion; ts and js: empty, todos-app)
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
    app.aktion              entry (registers the UI root, imports the rest) —
                            app.aktion.ts / app.aktion.js with --lang ts / js
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

## Editor support

Install the Aktion extension for your editor to get highlighting, diagnostics,
hover, completions, go-to-definition, rename, and formatting on `.aktion` files.
All three integrations run the runtime's own analysis, so they flag exactly what
the runtime flags:

| Editor | Install |
| --- | --- |
| VS Code / Cursor / VSCodium | Search **"Aktion"** in the Extensions view. The scaffolded `.vscode/extensions.json` prompts for it on first open. |
| WebStorm / IntelliJ IDEA / PyCharm / … | Search **"Aktion"** in <kbd>Settings</kbd> → <kbd>Plugins</kbd> → <kbd>Marketplace</kbd>. Requires Node 18+ and the LSP4IJ plugin, which the IDE offers to install alongside it. |
| Neovim / Helix / Zed / Sublime / Emacs | `npm i -g aktion-language-server`, then point your LSP client at `aktion-language-server --stdio` for `*.aktion`. |
