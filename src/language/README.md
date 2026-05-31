# `src/language/` — reusable language-support module

Pure-data description of the Aktion language, designed so the
same metadata can drive a CodeMirror editor, a Monaco editor, a VS Code
TextMate / LSP extension, or a CLI linter — without re-deriving the catalog
or duplicating the grammar.

The module ships **zero DOM dependencies and zero editor dependencies** at
import time. Every entry in the spec is a plain JSON-style value.

## What's inside

```ts
import { getLanguageSpec } from "aktion/language";

const spec = getLanguageSpec();
spec.components     // every built-in component with positional params + enums
spec.snippets       // ready-to-insert templates (Card, Hero, Routes, …)
spec.grammar        // token / string / operator / bracket / keyword data
spec.tokenizer      // CodeMirror-compatible StreamParser (no CM import)
spec.tagMap         // grammar token kind → highlight tag name
spec.themeNames     // built-in theme names for theme-picker autocomplete
spec.iconAliases    // shortlist of Font Awesome names
```

Pass a custom `ComponentLibrary` to `getLanguageSpec(library)` and the catalog
will automatically include any components your host has registered via
`<aktion-app>.registerComponents([...])`.

## Syntax overview

Aktion uses a JS-aligned syntax:

```
// Declarations — first-letter case does NOT matter.
// A function used as a component renders its return value; a function
// used as an action runs its body for side effects. A function with no
// `return` renders nothing when called in a render position.
function MyComponent(data) {
  return Card([Text(data.name)])
}
function handleClick() {
  $count = $count + 1
}

// Control flow
if ($loggedIn) { Dashboard() } else { LoginForm() }
for (let item of $items) { Card([Text(item.name)]) }
switch ($tab) { case "a": PanelA(); break; default: PanelB() }

// Named props via trailing object
Button("Save", { variant: "primary", action: handleClick })

// Effects
effect(() => {
  let id = setInterval(() => { $now = Date.now() }, 1000)
  return () => { clearInterval(id) }
}, ["mount"])

// App entry + theming
aktion = Stack([MyComponent($data)])
aktion.theme = Theme({ colors: { primary: "#0969da" } })

// Router
pages = Router({
  "/":          HomePage(),
  "/users/:id": UserPage(params.id),
  default:      NotFoundPage()
})
```

## CodeMirror 6

```ts
import { EditorView, basicSetup } from "codemirror";
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { autocompletion, snippet } from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { getLanguageSpec } from "aktion/language";

const spec = getLanguageSpec();

const language = StreamLanguage.define({
  ...spec.tokenizer,
  name: spec.grammar.name,
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword,         color: "#7c3aed" },  // keywords
  { tag: tags.typeName,        color: "#0ea5e9" },  // Components
  { tag: tags.variableName,    color: "#0f172a" },
  { tag: tags.propertyName,    color: "#0f172a" },
  { tag: tags.string,          color: "#16a34a" },
  { tag: tags.number,          color: "#ea580c" },
  { tag: tags.comment,         color: "#64748b", fontStyle: "italic" },
]);

const completions = autocompletion({
  override: [
    (ctx) => {
      const before = ctx.matchBefore(/[\w@$]*/);
      if (!before) return null;
      const options = [
        ...spec.components.map((c) => ({ label: c.name, info: c.signature, type: "class" })),
        ...spec.snippets.map((s) => ({ label: s.name, type: "snippet", apply: snippet(s.template) })),
      ];
      return { from: before.from, options };
    },
  ],
});
```

## Monaco

```ts
import * as monaco from "monaco-editor";
import { getLanguageSpec } from "aktion/language";

const spec = getLanguageSpec();

monaco.languages.register({ id: spec.grammar.name });

monaco.languages.registerCompletionItemProvider(spec.grammar.name, {
  provideCompletionItems(_model, _position) {
    return {
      suggestions: [
        ...spec.components.map((c) => ({
          label: c.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: c.signature,
          detail: c.description,
        })),
        ...spec.snippets.map((s) => ({
          label: s.name,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.template,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        })),
      ],
    };
  },
});
```

## VS Code extension

Render the spec to a `language-configuration.json` and a TextMate grammar at
build time. Re-run on each release of `aktion` to stay in sync.

## Linting

The runtime element fires `error` events with `{ errors: ParseError[] }`
after every render. Map them onto the editor's diagnostics layer using
`spec.severityTokenMap` (every parser error maps to `"error"`).
