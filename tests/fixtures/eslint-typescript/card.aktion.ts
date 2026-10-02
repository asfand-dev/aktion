// A user component in a module of its own, imported by
// user-components.aktion.ts.
import { Column, Text, type AktionNode } from "aktion-runtime/dsl";

export interface CardProps {
  title: string;
  subtitle?: string;
}

export function Card(props: CardProps): AktionNode {
  return Column([Text(props.title), Text(props.subtitle ?? "")]);
}
