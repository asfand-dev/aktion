// The component module of the §5.2 example — with one fix: `Checkbox` declares
// `label` as a non-optional prop, so the declarations require it (the example in
// the design doc omits it; the runtime would render an unlabelled checkbox).
import { Row, Text, Checkbox, Button, type AktionNode } from "aktion-runtime/dsl";
import { $editingId, toggle, startEdit } from "../store.aktion.ts";
import type { Todo } from "../types.ts";

export function TodoRow(todo: Todo): AktionNode {
  return Row([
    Checkbox(`done-${todo.id}`, { label: todo.title, labelHidden: true, value: todo.isCompleted, onChange: () => toggle(todo) }),
    Text(todo.title, { tone: $editingId === todo.id ? "primary" : "default" }),
    Button("Edit", { onClick: () => startEdit(todo), variant: "ghost" }),
  ], { gap: "s", align: "center" });
}
