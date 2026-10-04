# Aktion app — todos-app (TypeScript)

A todo app backed by a **real REST API** — every action (create, toggle, edit,
delete) is an `$http({...})` request that refetches the list when it settles.
Built with [Aktion](https://asfand-dev.github.io/aktion/) + Vite, with every
Aktion module written in TypeScript.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build      # production build → dist/
npm test           # run the unit tests (Vitest, network mocked)
```

## Structure

```
src/
  types.ts                    the Todo type (native TS, imported with `import type`)
  app.aktion.ts               entry — header, live KPIs, composer, list
  api.aktion.ts               API base URL + pure helpers (point this at your API)
  store.aktion.ts             $todos resource + CRUD actions (POST/PATCH/PUT/DELETE)
  components/
    composer.aktion.ts        new-todo input + button
    todo-item.aktion.ts       one row, with inline edit mode
    todo-list.aktion.ts       Async( loading / error / empty / data )
tests/
  todos.test.ts               drives CRUD against a fake in-memory API
```

## TypeScript in Aktion modules

- Built-ins come from `aktion-runtime/dsl`, a types-only module: `tsc` checks
  every component call and prop against the library, and the import is dropped
  at build time.
- Atoms that change are declared with `let` (`export let $draft = ""`), and
  other modules change them through exported actions.
- Types are imported with `import type` — they are erased before linking.
- Aktion runs the code under its own rules and rejects what would behave
  differently from JavaScript (`async`/`await`, `var`, `this`, a closure reading
  a variable reassigned after it was created, …) with an error at the exact line.

## How the data layer works

`src/store.aktion.ts` declares `$todos = $http<Todo[]>({ url })` — a reactive
resource with `.data` / `.loading` / `.error` / `.refetch()`. Each mutation
fires its own one-shot request and refreshes the list from its `.onDone`:

```ts
export function addTodo(): void {
  const title = $draft.trim();
  if (!title) return;
  const create = $http({ url: base + "/todos", method: "POST", body: { title } });
  $draft = "";
  create.onDone = () => $todos.refetch();
}
```

The default `base` (in `src/api.aktion.ts`) points at a public mock API so the
app works out of the box. Swap it for your own backend.
