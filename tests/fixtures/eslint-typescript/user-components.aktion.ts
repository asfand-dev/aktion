// Lint fixture for `aktion/props-literal`: user components — declared in this
// file or imported from another module — bind a non-literal argument
// positionally, as JavaScript does, so nothing here is reported, not even
// where a parameter is called `props`.
import { Button, type AktionNode, type ButtonNamed } from "aktion-runtime/dsl";
import { Card, type CardProps } from "./card.aktion";

export function Panel(props: { title: string }): AktionNode {
  return Button(props.title, { variant: "ghost" });
}

const cardProps: CardProps = { title: "Plan" };
const panelProps = { title: "Usage" };

export const card = Card(cardProps);
export const cardSpread = Card({ ...cardProps, subtitle: "Monthly" });
export const panel = Panel(panelProps);

// A parameter that shadows a library component's name is a user value too.
export function Wrapper(Button: (props: ButtonNamed) => AktionNode, opts: ButtonNamed): AktionNode {
  return Button(opts);
}
