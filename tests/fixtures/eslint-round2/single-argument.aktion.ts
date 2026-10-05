// Lint fixture for `aktion/props-literal` (tests/tooling-round2-props-literal.test.ts):
// a call whose ONLY argument is an object literal that TypeScript binds to the
// component's positional object parameter — `JsonTree`'s first overload is
// `(data: unknown, props?)` — while the runtime reads it as the props bag
// once a key is a prop name (`id` is a universal prop). Type-checks cleanly,
// so every call resolves to the overload it shows. The test mounts the same
// calls (`CALLS`) to check what each one renders.
import { Column, JsonTree, Text } from "aktion-runtime/dsl";

// Silent: no key is a prop name, so the object stays the `data` payload.
export const payload = JsonTree({ name: "payload-name", count: 2 });
// Silent: the bag form naming `data` itself, which the runtime binds as written.
export const named = JsonTree({ data: { name: "named-name" }, expanded: true });
// Silent: a lone props object TypeScript already matched to `props`.
export const bag = Column({ children: [Text("bag-child")], gap: "md" });

// Reported: `id` makes the runtime read the object as the props bag, so `data` is lost.
export const mixed = JsonTree({ id: 1, name: "mixed-name" }); // expect: objectReadAsProps
// Reported: every key is a prop, none of them `data`.
export const optionsOnly = JsonTree({ expanded: true }); // expect: objectReadAsProps
// Reported: `data` is bound, but `extra` is not a prop and is dropped.
export const withExtra = JsonTree({ data: { name: "extra-data" }, extra: "extra-dropped" }); // expect: objectReadAsProps
