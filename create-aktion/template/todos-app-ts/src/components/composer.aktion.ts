// The "new todo" composer. The input two-way-binds to the shared `$draft`
// atom; the button calls the `addTodo` action.
import { Button, Card, Input, Row, SectionHeader, StackItem, type AktionNode } from "aktion-runtime/dsl";
import { $draft, addTodo } from "../store.aktion.ts";

export function Composer(): AktionNode {
  return Card([
    SectionHeader("New todo", { eyebrow: "CREATE" }),
    Row([
      StackItem(Input("draft", { placeholder: "What needs doing?", value: $draft }), { grow: 1 }),
      Button("Add", { onClick: addTodo, variant: "primary", icon: "plus" }),
    ], { gap: "s", align: "center" }),
  ]);
}
