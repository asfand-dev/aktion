// Lint fixture for `aktion/props-literal` (tests/eslint-generated-dsl.test.ts):
// an object literal TypeScript matches to a positional object parameter
// (`attributes`), which the runtime reads as the props bag as soon as one of
// its keys is a prop name — keeping only the props and dropping the rest.
// Type-checks cleanly, so every call resolves to the overload it shows.
import { Column, HTMLTag, Text, WebComponent } from "aktion-runtime/dsl";

// Silent: no key is a prop name, so the object stays the attributes.
export const attributesOnly = HTMLTag("section", { "data-x": "1", title: "t" });
export const attributesAndChildren = HTMLTag("div", { "data-id": 1 }, [Text("x")]);
// Silent: the attributes passed by name, next to a real prop.
export const named = HTMLTag("section", { attributes: { "data-x": "1", title: "t" }, id: "a" });
// Silent: objectReadAsProps's advice for `withChildren` below — the children
// move into the bag too, since no overload takes arguments after `props`.
export const namedWithChildren = HTMLTag("div", { attributes: { "data-id": 1 }, class: "hero", children: [Text("x")] });
// Silent: the literal is the props bag on both sides.
export const bag = Column([Text("a")], { gap: "md", id: "list" });

// Reported: `id` / `class` make the runtime read the object as the props bag.
export const mixed = HTMLTag("section", { "data-x": "1", title: "t", id: "a" }); // expect: objectReadAsProps
export const withChildren = HTMLTag("div", { class: "hero", "data-id": 1 }, [Text("x")]); // expect: objectReadAsProps
const extra = { id: "b" };
export const withTrailingProps = HTMLTag("div", { class: "hero", "data-id": 1 }, extra); // expect: objectReadAsProps propsNotLiteral
export const webComponent = WebComponent("my-el", { "data-x": "1", title: "t", id: "a" }); // expect: objectReadAsProps
export const webComponentAndMore = WebComponent("my-el", { "data-x": "1", id: "a" }, null, null, [Text("x")]); // expect: objectReadAsProps
