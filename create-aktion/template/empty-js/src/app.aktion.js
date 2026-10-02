// The entry module. It registers the UI root with `$app(…)`.
//
// This is an Aktion module written in JavaScript: Aktion checks it for code
// that would behave differently from JavaScript and reports the exact line.
// Edit this file and the dev server hot-reloads while preserving live state.
import { $app, Column, Markdown, Text } from "aktion-runtime/dsl";

function App() {
  return Column([
    Markdown("# Hello, Aktion"),
    Text("Edit src/app.aktion.js to start building. The UI hot-reloads on save.", {
      tone: "muted",
    }),
  ], { gap: "m", padding: "l" });
}

export default $app(App());
