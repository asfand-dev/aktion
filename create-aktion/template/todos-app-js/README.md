# Aktion app — todos-app (JavaScript)

A todo app backed by a **real REST API** — every action (create, toggle, edit,
delete) is an `$http({...})` request that refetches the list when it settles.
Built with [Aktion](https://asfand-dev.github.io/aktion/) + Vite, with every
Aktion module written in JavaScript.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm test           # run the unit tests (Vitest, network mocked)
```

## Structure

```
src/
  app.aktion.js               entry — header, live KPIs, composer, list
  api.aktion.js               API base URL + pure helpers (point this at your API)
  store.aktion.js             $todos resource + CRUD actions (POST/PATCH/PUT/DELETE)
  components/
    composer.aktion.js        new-todo input + button
    todo-item.aktion.js       one row, with inline edit mode
    todo-list.aktion.js       Async( loading / error / empty / data )
tests/
  todos.test.ts               drives CRUD against a fake in-memory API
```

## JavaScript in Aktion modules

- Built-ins can be imported from `aktion-runtime/dsl`, a types-only module that
  gives the editor completions and docs; the import is dropped at build time.
- Atoms that change are declared with `let` (`export let $draft = ""`), and
  other modules change them through exported actions.
- Aktion runs the code under its own rules and rejects what would behave
  differently from JavaScript (`async`/`await`, `var`, `this`, a closure reading
  a variable reassigned after it was created, …) with an error at the exact line.

## How the data layer works

`src/store.aktion.js` declares `$todos = $http({ url })` — a reactive
resource with `.data` / `.loading` / `.error` / `.refetch()`. Each mutation
fires its own one-shot request and refreshes the list from its `.onDone`:

```js
export function addTodo() {
  const title = $draft.trim();
  if (!title) return;
  const create = $http({ url: base + "/todos", method: "POST", body: { title } });
  $draft = "";
  create.onDone = () => $todos.refetch();
}
```

The default `base` (in `src/api.aktion.js`) points at a public mock API so the
app works out of the box. Swap it for your own backend.
