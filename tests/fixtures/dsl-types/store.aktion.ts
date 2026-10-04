// The store module of the §5.2 example (docs/ai-context/aktion-typescript).
import { $http } from "aktion-runtime/dsl";
import type { Todo } from "./types.ts";
import { base } from "./api.aktion.ts";

export const $todos = $http<Todo[]>({ url: `${base}/todos` });
export let $editingId: number | null = null; // reassigned → `let`, never `const`

export function startEdit(todo: Todo): void {
  $editingId = todo.id;
}

export function stopEdit(): void {
  $editingId = null;
}

export function toggle(todo: Todo): void {
  const req = $http({ url: `${base}/todos/${todo.id}`, method: "PATCH", body: { isCompleted: !todo.isCompleted } });
  req.onDone = () => $todos.refetch();
}
