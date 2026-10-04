// The entry module of the §5.2 example. `$app` is typed to return
// `CompiledProgram`, so `main.ts` gets a typed default import (design doc D6).
import { $app, Column, PageHeader, Async, LoadingState, EmptyState } from "aktion-runtime/dsl";
import { $todos } from "./store.aktion.ts";
import { TodoRow } from "./components/todo-row.aktion.ts";

function App() {
  const rows = ($todos.data ?? []).map((t) => TodoRow(t));
  return Column([
    PageHeader("Todos"),
    Async($todos, { loading: LoadingState("Loading…"), empty: EmptyState("Nothing yet"), data: Column(rows) }),
  ], { gap: "l" });
}

export default $app(App());
