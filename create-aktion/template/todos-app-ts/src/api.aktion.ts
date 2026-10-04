// API config + pure helpers. Point `base` at your own REST backend — the mock
// implements the standard /todos collection: GET list, POST create,
// PATCH/PUT update, DELETE remove.
import type { Todo } from "./types.ts";

export const base = "https://mock-api-one-chi.vercel.app/api/mock/todo";

export function remaining(todos: readonly Todo[]): number {
  return todos.filter((t) => !t.isCompleted).length;
}

export function summary(todos: readonly Todo[]): string {
  return remaining(todos) + " of " + todos.length + " left";
}
