# Aktion app — todos-app

A todo app backed by a **real REST API** — every action (create, toggle, edit,
delete) is an `$http({...})` request that refetches the list when it settles.
Built with [Aktion](https://asfand-dev.github.io/aktion/) + Vite.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
npm test           # run the unit tests (Vitest, network mocked)
```

## Structure

```
src/
  app.aktion                  entry — header, live KPIs, composer, list
  api.aktion                  API base URL + pure helpers (point this at your API)
  store.aktion                $todos resource + CRUD actions (POST/PATCH/PUT/DELETE)
  components/
    composer.aktion           new-todo input + button
    todo-item.aktion          one row, with inline edit mode
    todo-list.aktion          Async( loading / error / empty / data )
tests/
  todos.test.ts               drives CRUD against a fake in-memory API
```

## How the data layer works

`src/store.aktion` declares `$todos = $http({ url })` — a reactive resource with
`.data` / `.loading` / `.error` / `.refetch()`. Each mutation fires its own
one-shot request and refreshes the list from its `.onDone` callback:

```js
function addTodo() {
  $create = $http({ url: base + "/todos", method: "POST", body: { title: $draft } })
  $create.onDone = () => { $todos.refetch() }
}
```

The default `base` (in `src/api.aktion`) points at a public mock API so the app
works out of the box. Swap it for your own backend — the todo shape is
`{ id, title, isCompleted }`.

## Testing

`tests/todos.test.ts` installs a small in-memory fake of the REST collection via
`render({ fetch })`, then loads, adds, toggles, and deletes — asserting both the
rendered rows and the HTTP methods captured in `screen.requests`. No network is
touched. Run `npm test`.
