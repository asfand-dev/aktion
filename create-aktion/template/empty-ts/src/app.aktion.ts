// The entry module. It registers the UI root with `$app(…)`; `export default`
// gives `src/main.ts` a typed `CompiledProgram` to mount.
//
// This is an Aktion module written in TypeScript: the types are checked by
// `tsc` (and your editor) and erased at build time. Edit this file and the dev
// server hot-reloads while preserving live state.
import { $app, Column, Markdown, Text, type AktionNode } from "aktion-runtime/dsl";

function App(): AktionNode {
  return Column([
    Markdown("# Hello, Aktion"),
    Text("Edit src/app.aktion.ts to start building. The UI hot-reloads on save.", {
      tone: "muted",
    }),
  ], { gap: "m", padding: "l" });
}

export default $app(App());
