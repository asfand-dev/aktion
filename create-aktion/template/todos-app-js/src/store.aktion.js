// The data layer. `$todos` is a reactive `$http({...})` resource that loads on
// mount; every mutation fires its own one-shot `$http` request and refetches
// the list when it settles (via `.onDone`). Components import the resource +
// these actions — no prop-drilling.
//
// State atoms that change are declared with `let`, and other modules change
// them only through the exported actions (an imported binding is read-only in
// JavaScript).
import { $http } from "aktion-runtime/dsl";
import { base } from "./api.aktion.js";

export const $todos = $http({ url: base + "/todos" });
export let $draft = "";
export let $editingId = null;
export let $editTitle = "";

export function addTodo() {
  const title = $draft.trim();
  if (!title) return;
  const create = $http({ url: base + "/todos", method: "POST", body: { title } });
  $draft = "";
  create.onDone = () => $todos.refetch();
}

export function toggleTodo(todo) {
  const patch = $http({ url: base + "/todos/" + todo.id, method: "PATCH", body: { isCompleted: !todo.isCompleted } });
  patch.onDone = () => $todos.refetch();
}

export function startEdit(todo) {
  $editingId = todo.id;
  $editTitle = todo.title;
}

export function cancelEdit() {
  $editingId = null;
  $editTitle = "";
}

export function saveEdit(todo) {
  const update = $http({
    url: base + "/todos/" + todo.id,
    method: "PUT",
    body: { title: $editTitle, isCompleted: todo.isCompleted },
  });
  $editingId = null;
  $editTitle = "";
  update.onDone = () => $todos.refetch();
}

export function deleteTodo(todo) {
  const del = $http({ url: base + "/todos/" + todo.id, method: "DELETE" });
  del.onDone = () => $todos.refetch();
}
