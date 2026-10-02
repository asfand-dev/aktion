// Entry module. A focused single-surface app: header, live KPIs, composer, list.
import { $app, $theme, Column, PageHeader, Stats, type AktionNode } from "aktion-runtime/dsl";
import { Composer } from "./components/composer.aktion.ts";
import { TodoList } from "./components/todo-list.aktion.ts";
import { $todos } from "./store.aktion.ts";
import { remaining } from "./api.aktion.ts";

$theme({ colors: { primary: "#6366f1" } });

function TodoStats(): AktionNode {
  const list = $todos.data ?? [];
  const done = list.length - remaining(list);
  return Stats([
    { label: "Total", value: `${list.length}` },
    { label: "Remaining", value: `${remaining(list)}`, tone: "primary" },
    { label: "Done", value: `${done}`, tone: "success" },
  ], { layout: "strip" });
}

function App(): AktionNode {
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
