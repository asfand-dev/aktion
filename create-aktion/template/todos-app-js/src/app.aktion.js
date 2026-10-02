// Entry module. A focused single-surface app: header, live KPIs, composer, list.
import { $app, $theme, Column, PageHeader, Stats } from "aktion-runtime/dsl";
import { Composer } from "./components/composer.aktion.js";
import { TodoList } from "./components/todo-list.aktion.js";
import { $todos } from "./store.aktion.js";
import { remaining } from "./api.aktion.js";

$theme({ colors: { primary: "#6366f1" } });

function TodoStats() {
  const list = $todos.data ?? [];
  const done = list.length - remaining(list);
  return Stats([
    { label: "Total", value: `${list.length}` },
    { label: "Remaining", value: `${remaining(list)}`, tone: "primary" },
    { label: "Done", value: `${done}`, tone: "success" },
  ], { layout: "strip" });
}

function App() {
  return Column([
    PageHeader("Todos", {
      subtitle: "Create, toggle, edit and delete — every action is a real REST call.",
      breadcrumbs: false,
    }),
    TodoStats(),
    Composer(),
    TodoList(),
  ], { gap: "l" });
}

export default $app(App());
