---
name: aktion
description: Build applications in the Aktion DSL (.aktion files) — dashboards, CRUD apps, settings consoles, inboxes, admin panels, multi-page sites, landing pages, chat UIs. Use when authoring or editing .aktion source, or when a request involves $app, $http, $query, $router, $store, $form, $theme, $effect, or the Aktion component library. Covers the language, the 282-component catalogue, layout density, theming, routing, data fetching, and the mistakes the schema validator cannot catch. Not for host-page integration (embedding the <aktion-app> element, framework wiring, CDN setup) — that is README.md's job.
license: MIT
---

# Building applications in Aktion

Aktion is a declarative DSL whose surface syntax is a **strict subset of
TypeScript**. A program is a list of statements that a single web component
(`<aktion-app>`) streams into a live UI. You write the program; the runtime owns
rendering, reactivity, and styling.

Two things make authoring Aktion different from authoring React:

1. **It streams.** Statements commit as they arrive, top to bottom. Declare the
   shell first and let details fill in.
2. **The component library is closed and opinionated.** 282 components cover
   nearly every UI idiom, and reaching for the right composite is worth more than
   any amount of hand-composition. A prop that is not in the schema is a hard
   error, not a no-op.

## Before anything else

**What you produce is an Aktion program.** Not HTML, not CSS, not hand-written
JavaScript, not React — Aktion source, in the language described below.

This section is first because the request will usually not say the word
"Aktion". *"Create a todo app"*, with this skill active, is a request for **an
Aktion todo app**. Nothing downstream repeats this, and the failure is silent: a
hand-rolled HTML page with a `<script>` block looks like a working answer while
being the wrong artifact entirely.

- **Never substitute another technology**, in whole or in part, however
  convenient it looks. `<div>`, `document.querySelector`, `useState`, a `<style>`
  block, a hand-written `<script>` — none of these belong in the deliverable.
  Every element on screen comes from a component in the catalogue; every piece of
  state is a `$name` atom.
- **Never rebuild the app in another language because a preview will not
  render.** See [Delivering it](#delivering-it). "The sandbox cannot load the
  runtime" is a fact to report, not a licence to rewrite.
- **If a request genuinely cannot be expressed in Aktion, say so and stop.**
  Naming the gap is a correct answer. Shipping a lookalike in another technology
  and not mentioning it is not.

## Your task

$ARGUMENTS

If the line above is blank, or still reads as the literal token, then either the
skill was loaded for context rather than invoked with a request, or this surface
does not substitute arguments. Take the request from the conversation instead.
Everything below applies either way.

## What "done" means

The deliverable is the same everywhere — one complete, correct Aktion program.
Only the hand-off changes with what you can reach.

**With file and shell tools** (Claude Code, or any agent with a repo):

1. **Write a `.aktion` file.** In an existing project, edit the files already
   there. In an empty directory, `app.aktion` is the default name.
2. **Zero validator errors**, confirmed by running the validator below — not by
   inspection. This is the step the whole skill is built around: a program that
   reads perfectly and names one prop that does not exist renders as nothing.
3. **A host page** if the project has none — see [Delivering it](#delivering-it).
4. **A short summary**: what you built, its sections, what is stubbed.

**Without them** (claude.ai, Claude Desktop, any chat surface):

1. **The Aktion source is the answer.** Give it complete, in one ` ```aktion `
   block — not excerpted, not summarised. Write it to a `.aktion` file too if you
   have file tools.
2. **Say that you could not validate it.** There is no shell, so the schema check
   did not run. Do not describe the program as validated. Compensate by looking
   up every component's signature in its group reference before you use it, and
   never guess a prop name.
3. **Say how to run it** — see [Delivering it](#delivering-it).
4. **A short summary**, as above.

## Workflow

1. **Identify the page type** and look up its minimum section count in
   [`references/layout.md`](references/layout.md). Read that file before writing
   any UI — sparse layouts are the single most common failure mode, and it is
   the one part of this skill no generated reference can replace.
2. **Pick composites** from its composition table for each section, before
   reaching for `Card`/`Column`/`Row`.
3. **Look up exact signatures** in the group reference for each component you
   use. Do not guess prop names — the validator rejects unknown props, and a
   guessed prop is the most common cause of a program that will not render.
4. **Write the program**, shell first.
5. **Validate it** — if you have a shell:

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs app.aktion
   ```

   Pass as many files as you like. It picks the right checker per file — a
   program that `import`s another module is linked first, which a plain schema
   check cannot do. Output is `FILE: Lnn: error|warning: message`.

   **Exit codes are load-bearing: `0` clean, `1` errors found, `2` could not
   run.** On `2` the program was never checked — say so in your summary rather
   than reporting the program as validated. Fix every error and every warning; a
   warning means you named a component that does not exist.

   From a repo checkout the same check is `node tools/validate-aktion.mjs
   app.aktion` (add `-app` to the script name for multi-module apps), run from
   the repo root.

   With no shell — claude.ai, Claude Desktop — this step cannot run. Re-read
   every component call against its group reference instead, and say in your
   summary that the program is unvalidated. Never imply a check happened.
6. **Run through [`references/gotchas.md`](references/gotchas.md).** The validator
   cannot catch any of them, and they are the difference between a program that
   validates and a program that works.

## Delivering it

The `.aktion` file is source, not a page. How the user runs it depends on where
you are — and one of these routes is a trap.

**When you can write files to the user's machine:**

- **Quick preview, no install** — write `index.html` next to the program with the
  validated source inlined between the tags. This opens straight from `file://`,
  no server:

  ```html
  <script type="module" src="https://asfand-dev.github.io/aktion/dist/aktion.js"></script>
  <aktion-app theme="light">
    <!-- contents of app.aktion -->
  </aktion-app>
  ```

  `app.aktion` stays the source of truth and the thing you validate; `index.html`
  is generated from it. If you change the program, re-validate and re-inline.
  (Do not use `<aktion-app src="./app.aktion">` for this — the fetch is blocked
  on `file://` and the user gets a blank page.)
- **A real project** — `npm create aktion@latest my-app` scaffolds a Vite app
  with hot reload on `src/app.aktion`. Prefer this when the user wants to keep
  working on it.

**In a chat surface, hand over the source and point at the playground:**

<https://asfand-dev.github.io/aktion/playground.html> runs a pasted program
immediately, with live errors and a theme picker. That is the answer to "how do I
see this?" — not a generated page.

> **Do not put the app in an HTML artifact.** Artifact sandboxes block requests
> to external hosts, so the `<script src="…/aktion.js">` tag above never loads
> and an `<aktion-app>` artifact renders blank. The runtime is ~2 MB, so inlining
> it is not practical either.
>
> A blank preview is a limitation of the sandbox, not a problem with the program,
> and **it is never a reason to rewrite the app in HTML and JavaScript.** Doing
> that produces something that looks right, previews nicely, and is not an Aktion
> app — the exact failure [Before anything else](#before-anything-else) exists to
> prevent. Deliver the Aktion source and link the playground.

## The ten rules

1. **One statement per line.** `name = Expression`. The renderer commits each
   line as it streams.
2. **`$app(…)` anchors the program, and there is exactly ONE per program.** It
   accepts a single node, an array, or variadic nodes. Put it first and use
   forward references — `$app(Column([header, list]))` with `header` and `list`
   defined below — so the shell commits before its children arrive.
3. **`$name` is the one reactive atom kind.** `$count = 0` declares it; reading
   or writing `$count` anywhere is reactive. No tiers, no setters.
4. **Components return trees; actions don't.** `function Name(args) { … return
   Expression }` renders when called in render position. A function with no
   `return` renders nothing and is used for side effects.
   **Name case is a convention, not a mechanism** — PascalCase for
   tree-returning, camelCase for side-effecting, purely for readability.
5. **Reach for pattern composites before composing by hand.** `PageHeader`,
   `Stats`, `Toolbar`, `EmptyState`, `Timeline`, `DescriptionList`, `AppShell`,
   `SplitView`, `Hero`, `FeatureGrid`, `PricingTable`, `KanbanBoard` each commit
   a whole visual section in one line. See the composition table in
   [`references/layout.md`](references/layout.md).
6. **Pick ONE argument form per call.** Canonical: one positional argument plus a
   trailing options object. `Button("Save", { variant: "primary" })` — **not**
   `Button("Save", "primary")`, which binds `"primary"` to the second positional
   slot. See [`references/gotchas.md`](references/gotchas.md).
7. **`map` produces values; `for`/`if`/`switch` are statements.** They cannot
   appear on the right of `name = …`. Use `items.map(i => Row(i))` in render
   position and keep `for`/`if`/`switch` inside function, lambda-block, and
   `$effect` bodies.
8. **Density must match the page type.** Dashboards 6+ named sections, detail /
   settings / list / landing pages 5+. If a draft is short, **add** a
   complementary section — never ship a sparse response.
9. **Never hard-code colour, spacing, or typography.** Pass semantic
   `tone` / `variant` values and let the active theme resolve them. A program
   must look right on all 6 themes.
10. **Icons are Font Awesome names without the `fa-` prefix** — `"house"`,
    `"chart-line"`, `"sack-dollar"`. Optional variant prefix: `"regular:star"`,
    `"brands:github"`. **Never emit raw emoji.**

## Shape of a program

```aktion
$theme({ colors: { primary: "#0969da" } })

$app(Column([
  PageHeader("Orders", { subtitle: "Everything shipped this month" }),
  summary,
  table,
], { gap: "lg" }))

$orders = $http({ url: "https://api.example.com/orders" })
$search = ""

summary = Stats([
  StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%" }),
  StatCard("Orders", { value: "1,204", trend: "up", delta: "+3%" }),
  StatCard("Refunds", { value: "18", trend: "down", delta: "-2%", tone: "warning" }),
])

function refresh() { $orders.refetch() }

table = Card([
  SectionHeader("All orders", { actions: [Button("Refresh", { icon: "rotate", action: refresh })] }),
  Toolbar({ searchable: true, searchValue: $search }),
  Async($orders, {
    loading: Skeleton({ variant: "table-row", lines: 5 }),
    error: ErrorState("Could not load orders", { description: "Try again in a moment." }),
    empty: EmptyState("No orders yet", { description: "Orders appear here once customers check out." }),
    data: Table([
      Col("Order", $orders.data.id),
      Col("Customer", $orders.data.customer),
      Col("Total", $orders.data.total, { format: "currency" }),
    ], { density: "compact", sticky: true }),
  }),
])
```

Note what that program does *not* contain: no colours, no pixel values, no
loading boolean, no manual empty check, no hand-rolled table markup. Every one of
those is the runtime's job.

## References

| Reference | What's in it |
| --- | --- |
| [`references/layout.md`](references/layout.md) | Pattern-first composition table, visual hierarchy, **density targets per page type**, theme-aware authoring, anti-patterns. |
| [`references/language.md`](references/language.md) | The full authoring language: statements, state, components, actions, effects, data, routing, styling, i18n. |
| [`references/gotchas.md`](references/gotchas.md) | **Traps the validator cannot catch.** Read before finishing. |
| [`references/patterns.md`](references/patterns.md) | Worked, validated application patterns to adapt. |
| [`references/components/index.md`](references/components/index.md) | The catalogue: every component, by group, with signatures. *Generated.* |
| [`references/components/<group>.md`](references/components/) | Full prop tables + when-to-use notes per group. *Generated.* |
| [`references/builtins.md`](references/builtins.md) | All 26 `$`-builtins and their config keys. *Generated.* |
| [`references/namespaces.md`](references/namespaces.md) | `$util`/`$storage`/`$console`/`$toast`/`$dom` members and every reactive resource bag. *Generated.* |
| [`references/themes.md`](references/themes.md) | The 6 built-in themes and all 86 tokens. *Generated.* |

The generated references are projections of the runtime, regenerated by
`npm run build`. Trust them over any memory of the API.

## What the validator will not tell you

It checks the schema, not the design. It will happily pass a sparse,
three-component page that ignores every composite; a program that hard-codes
`#4f46e5` and breaks on the dark theme; a `Button("Save", "primary")` that
silently binds `"primary"` to `onClick`. Those are your responsibility, and they
are what [`references/layout.md`](references/layout.md) and
[`references/gotchas.md`](references/gotchas.md) exist to prevent.

## Further reading

- **`README.md`** (repo root) — host-page integration: embedding
  `<aktion-app>`, framework wiring, CDN, the public element API. Different
  audience from this skill.
- **`dist/system_prompt.txt`** — the full generated language reference, also
  served at
  <https://asfand-dev.github.io/aktion/dist/system_prompt.txt>. Use it when this
  skill's language reference is not detailed enough.
- **Live docs** — <https://asfand-dev.github.io/aktion/>, including a
  [playground](https://asfand-dev.github.io/aktion/playground.html) and a
  [component gallery](https://asfand-dev.github.io/aktion/components.html).
