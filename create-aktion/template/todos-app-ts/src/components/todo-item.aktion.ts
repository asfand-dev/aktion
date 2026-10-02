// One todo row. It swaps between a read view (checkbox + title + edit/delete)
// and an inline edit view based on the shared `$editingId` atom.
import { Button, Checkbox, IconButton, Input, Row, StackItem, Text, type AktionNode } from "aktion-runtime/dsl";
import { $editingId, $editTitle, cancelEdit, deleteTodo, saveEdit, startEdit, toggleTodo } from "../store.aktion.ts";
import type { Todo } from "../types.ts";

export function TodoItem(todo: Todo): AktionNode {
  return $editingId === todo.id ? EditRow(todo) : ViewRow(todo);
}

function ViewRow(todo: Todo): AktionNode {
  return Row([
    // The title is the checkbox's accessible name; the visible title is the Text beside it.
    Checkbox("done-" + todo.id, {
      label: todo.title,
      labelHidden: true,
      value: todo.isCompleted,
      onChange: () => toggleTodo(todo),
    }),
    StackItem(Text(todo.title, { tone: todo.isCompleted ? "muted" : "default" }), { grow: 1 }),
    IconButton("pen", { label: "Edit", onClick: () => startEdit(todo), variant: "ghost", size: "sm" }),
    IconButton("trash", { label: "Delete", onClick: () => deleteTodo(todo), variant: "ghost", size: "sm" }),
  ], { gap: "s", align: "center" });
}

function EditRow(todo: Todo): AktionNode {
  return Row([
    StackItem(Input("edit-" + todo.id, { value: $editTitle, placeholder: "Todo title" }), { grow: 1 }),
    Button("Save", { onClick: () => saveEdit(todo), variant: "primary", size: "sm", icon: "check" }),
    Button("Cancel", { onClick: cancelEdit, variant: "ghost", size: "sm" }),
  ], { gap: "s", align: "center" });
}
