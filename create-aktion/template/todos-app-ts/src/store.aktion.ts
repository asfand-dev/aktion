// The data layer. `$todos` is a reactive `$http({...})` resource that loads on
// mount; every mutation fires its own one-shot `$http` request and refetches
// the list when it settles (via `.onDone`). Components import the resource +
// these actions — no prop-drilling.
//
// State atoms that change are declared with `let` (TypeScript would reject an
// assignment to a `const`), and other modules change them only through the
// exported actions (an imported binding is read-only in TypeScript).
import { $http } from "aktion-runtime/dsl";
import type { Todo } from "./types.ts";
import { base } from "./api.aktion.ts";

export const $todos = $http<Todo[]>({ url: base + "/todos" });
export let $draft = "";
export let $editingId: number | null = null;
export let $editTitle = "";

export function addTodo(): void {
  const title = $draft.trim();
  if (!title) return;
  const create = $http({ url: base + "/todos", method: "POST", body: { title } });
  $draft = "";
  create.onDone = () => $todos.refetch();
}

export function toggleTodo(todo: Todo): void {
  const patch = $http({ url: base + "/todos/" + todo.id, method: "PATCH", body: { isCompleted: !todo.isCompleted } });
  patch.onDone = () => $todos.refetch();
}

export function startEdit(todo: Todo): void {
  $editingId = todo.id;
  $editTitle = todo.title;
}

export function cancelEdit(): void {
  $editingId = null;
  $editTitle = "";
}

export function saveEdit(todo: Todo): void {
  const update = $http({
    url: base + "/todos/" + todo.id,
    method: "PUT",
    body: { title: $editTitle, isCompleted: todo.isCompleted },
  });
  $editingId = null;
  $editTitle = "";
  update.onDone = () => $todos.refetch();
}

export function deleteTodo(todo: Todo): void {
  const del = $http({ url: base + "/todos/" + todo.id, method: "DELETE" });
  del.onDone = () => $todos.refetch();
}
