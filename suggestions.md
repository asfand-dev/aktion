# Aktion — Suggestions to make marketing/landing UIs a piece of cake

> **Context.** This document is the post-mortem of porting
> [`docs/index.static.html`](./docs/index.static.html) (a hand-built, modern
> SaaS landing page) to a pure-Aktion program
> ([`aktion/index.aktion`](./aktion/index.aktion)). The port *works and looks
> great*, but it leaned heavily on escape hatches.
>
> **Hard numbers from the port:**
>
> | Metric | Count | What it tells us |
> | --- | --- | --- |
> | `HTMLTag(...)` calls | **90** | ~half the tree is raw HTML |
> | Lines of raw CSS in one `Styles(...)` block | **166** | the "no CSS" promise broke down |
> | Native component calls | **107** | the good half |
>
> **Goal of this doc.** Propose the smallest set of *language features,
> components, props, helpers and styling primitives* that would let the
> exact same page be authored with **zero `HTMLTag`, zero `Styles`, and no
> hand-written CSS** — i.e. make this migration trivial.

Each suggestion below records: **the pain** (what I had to do in this port),
**the proposal** (concrete API), **before/after**, and a **priority**
(P0 = blocks "no escape hatch", P1 = high leverage, P2 = polish).

---

## Table of contents

1. [Styling system — the #1 gap](#1-styling-system--the-1-gap)
2. [Layout primitives](#2-layout-primitives)
3. [Marketing / landing components](#3-marketing--landing-components)
4. [Decoration & motion](#4-decoration--motion)
5. [Typography](#5-typography)
6. [Code & developer surfaces](#6-code--developer-surfaces)
7. [Interactivity & lifecycle](#7-interactivity--lifecycle)
8. [New props on existing components](#8-new-props-on-existing-components)
9. [Language & authoring ergonomics](#9-language--authoring-ergonomics)
10. [Helper functions (`$util` / `$style`)](#10-helper-functions)
11. [North-star: the hero, before vs after](#11-north-star-the-hero-before-vs-after)
12. [Priority matrix & rollout](#12-priority-matrix--rollout)

---

## 1. Styling system — the #1 gap

**The pain.** 100% of the visual personality (gradients, glass surfaces,
custom radii, spacing, shadows, hover lifts, section backgrounds) had to be
expressed as raw CSS inside a single 166-line `Styles(...)` block, targeted
at classes I attached with `Css(node, { class })` / `HTMLTag`. The library
has no *declarative* way to say "this surface has a gradient background",
"lift on hover", or "tint this section".

Every component already renders into a themed Shadow DOM with `--rui-*`
tokens. We need a **style-prop layer** that maps a safe, finite vocabulary
of design intents onto those tokens — *without* free-form CSS.

### 1.1 `sx` / style-intent prop on every component (P0)

A bounded, token-aware style object accepted by **all** components and
layout primitives. It is **not** raw CSS — every key is an enum or a token
reference, so it stays theme-safe and sanitisable.

```javascript
Card([...], {
  sx: {
    bg: "gradient.brand",        // token or named gradient (see §1.2)
    border: "subtle",            // none | subtle | strong | "primary"
    radius: "lg",                // xs|sm|md|lg|pill or token
    shadow: "lg",                // sm|md|lg|none
    padding: "xl",               // spacing token
    hover: { lift: 2, shadow: "lg" },   // bounded hover effects
    backdrop: "blur",            // frosted glass
    align: "center"
  }
})
```

**Why bounded, not raw CSS:** keeps the "describe intent, not pixels"
philosophy (TL;DR rule #11/#19), stays XSS-safe by construction, and keeps
every value theme-switchable. This single prop would have eliminated the
**majority of my 90 `HTMLTag` + `Css` calls**.

### 1.2 First-class gradients (P0)

**The pain.** "Gradient text" (the `.ak-grad` class) appears ~20 times in
the port and is pure CSS each time. Gradient backgrounds (hero CTA, icon
discs, accent bars) are all hand-rolled.

Add gradients as **theme tokens** and a `GradientText` content component:

```javascript
// In $theme(...)
$theme({
  gradients: {
    brand:   ["#6366f1", "#8b5cf6", "#ec4899"],   // angle defaults to 120deg
    cyan:    { stops: ["#22d3ee", "#6366f1"], angle: 120 },
    emerald: ["#10b981", "#22d3ee"]
  }
})

// Usage anywhere a tone/bg is accepted:
Button("Get started", { variant: "primary", fill: "gradient.brand" })
Box([...], { sx: { bg: "gradient.cyan" } })

// Gradient text becomes one call:
Heading(["Build complex UIs in ", GradientText("a fraction of the code"), "."])
```

`GradientText(text, { gradient })` defaults to `gradient.brand`. Today this
is impossible without `Styles` + `-webkit-background-clip`.

### 1.3 `tone`/`variant` should accept gradients & glass everywhere (P1)

`Banner`, `Button`, `StatCard`, `FeatureItem`, `Hero`, `Card` already take a
`tone`. Let `tone: "gradient.brand"` and `surface: "glass"` resolve through
the token system so marketing accents need no CSS.

---

## 2. Layout primitives

### 2.1 `Section` — the page-band primitive (P0)

**The pain.** I wrote three factory functions (`section`, `section2`,
`head`) and 24 `HTMLTag("section"...)` wrappers just to get: full-bleed
band → centered max-width container → optional tinted/`soft` background →
centered eyebrow+title+subtitle header. This is *the* unit of a landing
page and it doesn't exist.

```javascript
Section({
  background: "soft",          // base | soft | gradient.brand | "surface"
  width: "lg",                 // inner container max-width (sm|md|lg|xl|full)
  padding: "section",          // vertical rhythm preset
  eyebrow: "Why developers switch",
  title: ["One language. ", GradientText("Everything a frontend needs.")],
  subtitle: "Components, state, routing, theming, i18n and data — built in.",
  align: "center"
}, [ /* children */ ])
```

This one component replaces ~30 `HTMLTag` nodes and the `head()` factory.

### 2.2 `Bento` / asymmetric grid (P1)

**The pain.** The static page's feature grid is a *bento* layout (cells span
3/3/2/2/2 columns with varied sizes). `Grid` + `GridItem` can do 12-col
spans but it's verbose, and `FeatureGrid` (what I fell back to) forces equal
tiles. A purpose-built bento makes the marquee feature section trivial:

```javascript
Bento([
  BentoCell(FeatureItem("Looks like JavaScript", {...}), { span: "wide" }),   // 2 cols
  BentoCell(FeatureItem("One reactive sigil", {...}),    { span: "wide" }),
  BentoCell(FeatureItem("170+ components", {...}),        { span: "tall" })    // 2 rows
], { columns: 6, gap: "m" })
```

`span` accepts named sizes (`tile|wide|tall|hero`) or `{ col, row }`.

### 2.3 `Split` — sticky two-column (P1)

**The pain.** Code-pane-beside-preview (hero showcase, dev steps,
reactivity) used `Grid({ columns: 2, gap: "none" })` plus CSS for the divider
and responsive collapse. A `Split` primitive with a ratio, divider, and
auto-stack breakpoint covers every "text + media" section:

```javascript
Split(leftNode, rightNode, {
  ratio: "1/1",            // or "3/2", "2/3"
  gap: "l",
  divider: true,
  stackAt: "md",           // collapses to column below md
  sticky: "left"           // optional sticky pane on scroll
})
```

### 2.4 `Container` already exists — add `padded`/`bleed` (P2)

Minor: let `Container` express full-bleed children (for hero windows that
should escape the text column).

---

## 3. Marketing / landing components

These are the composites that, if they existed, would have turned whole
sections into one-liners. Aktion already nails the *app/dashboard* pattern
space; this fills the *marketing* space.

### 3.1 `NavBar` for marketing (P0)

**The pain.** The sticky glass nav (logo + version pill + links + theme
toggle + GitHub + CTA + mobile burger) was ~30 lines of `HTMLTag`. `Navbar`/
`TopBar` exist but are app-shell oriented.

```javascript
NavBar({
  brand: Brand("Aktion", { logo: "assets/logo.png", version: "v0.5", href: "index.html" }),
  links: [NavLink("Docs", { to: "/docs" }), NavLink("Components", { to: "/components" })],
  actions: [ThemeToggle(), IconButton("brands:github", { href: "..." }), Button("Get started", { variant: "primary" })],
  sticky: true,
  blur: true                 // frosted glass on scroll
})
```

### 3.2 `Hero` upgrade: `media` slot + `badge` + gradient title (P0)

**The pain.** The existing `Hero` couldn't host the live code/preview window,
the "NEW/v0.5" pill, or a gradient word in the title — so I rebuilt the hero
by hand. Extend `Hero`:

```javascript
Hero(["Build complex UIs in ", GradientText("a fraction of the code"), "."], {
  badge: Badge("v0.5", { tone: "gradient.brand" }),
  subtitle: "Aktion is a reactive UI language — a strict subset of JS…",
  primary: Button("Start building", { variant: "primary", icon: "rocket" }),
  secondary: Button("Open the playground", { icon: "play" }),
  note: "Learn it in an afternoon · Runs in any framework",
  media: CodeWindow({...}),     // ← NEW: any node beside/below the copy
  align: "center"
})
```

Key additions: `badge` (node), title accepts **nodes** (for gradient words),
`note` line, and a `media` slot.

### 3.3 `LogoCloud` (P1)

**The pain.** The "works everywhere" chip row was a manual `Row` of
`HTMLTag` chips.

```javascript
LogoCloud({
  label: "One custom element · drop it anywhere",
  items: [
    LogoChip("React",  { icon: "brands:react" }),
    LogoChip("Vue",    { icon: "brands:vuejs" }),
    LogoChip("Angular",{ icon: "brands:angular" })
  ]
})
```

### 3.4 `MetricStrip` / `StatBlock` with count-up (P1)

**The pain.** The stat tiles ("170+ / 7 / 50+ / 1") with gradient accent bars
and the static page's **count-up animation** had no equivalent — I rendered
static tiles. `Stats` exists but doesn't animate or carry a gradient accent.

```javascript
MetricStrip([
  Metric("170+", "Built-in components", { accent: "gradient.brand", countUp: true }),
  Metric("7", "Production themes", { countUp: true })
], { columns: 4 })
```

`countUp: true` animates from 0 when scrolled into view (see §4.3).

### 3.5 `CompareCards` / better `ComparisonTable` highlight (P2)

`ComparisonTable` worked well (one of the smooth parts!). Only nit: a
`legend`/`recommended` ribbon on the highlighted column would polish the
"vs React/Vue/Angular" table.

### 3.6 `Swatch` / `ThemePreview` (P2)

**The pain.** The 8 theme swatches were hand-built `HTMLTag` cards with inline
`background` colors. A `Swatch(name, { palette })` (or a `ThemePreview` that
renders a mini-UI in a given theme) would make the theming section native.

### 3.7 `Footer` (P1)

**The pain.** The footer (brand blurb + 3 link columns + legal row) was ~25
`HTMLTag` nodes.

```javascript
Footer({
  brand: Brand("Aktion", { logo: "assets/logo.png" }),
  tagline: "A reactive UI language for building rich interfaces in any framework.",
  columns: [
    FooterColumn("Product", [Link("Get started", { to: "/start" }), ...]),
    FooterColumn("Learn", [...])
  ],
  legal: "© 2026 Aktion · MIT License"
})
```

---

## 4. Decoration & motion

This is the single biggest "wow" gap. The static page's particles, blobs,
grid, scroll-reveal and count-up are *what make it feel modern*, and Aktion
has **no declarative path** to any of them.

### 4.1 `Backdrop` decoration component (P0 for landing pages)

**The pain.** I hard-coded **18 particle `<span>`s**, 3 blur "blobs", and a
masked grid — all as `HTMLTag` + 40 lines of CSS/keyframes.

```javascript
Backdrop({
  layers: [
    "grid",                                   // masked dotted/line grid
    Blobs(["gradient.brand", "#ec4899", "#22d3ee"]),  // floating blur orbs
    Particles({ count: 40, link: true })      // canvas particle network
  ],
  fixed: true
})
```

Ship `Particles`, `Blobs`, `Aurora`, and `GridPattern` as bounded, theme-aware
decorations. These are the literal contents of the static page's `<canvas>`
and `.blob`/`.bg-grid` divs.

### 4.2 Animation presets on any component (P1)

**The pain.** No entrance/hover/loop animation vocabulary. The static page
fades/reveals sections and pulses the "live" dot.

```javascript
Card([...], { animate: "fade-up" })                 // entrance
Badge("Live", { tone: "success", animate: "pulse" })// loop
Button(..., { sx: { hover: { lift: 2 } } })         // hover (via sx, §1.1)
```

Preset enum: `fade | fade-up | fade-in | zoom | slide-left | pulse |
float | shimmer`. Honors `prefers-reduced-motion` automatically (I had to
write that media query by hand).

### 4.3 `Reveal` / `OnIntersect`-driven animation (P1)

`OnIntersect` already exists (great!), but wiring it to add a class and
animate was manual. A `Reveal(child, { animation, once })` composite, plus
the `animate` prop auto-deferring until in-view, makes scroll choreography
declarative:

```javascript
Reveal(Section({...}, [...]), { animation: "fade-up", once: true })
```

### 4.4 `CountUp` number (P2)

`CountUp(170, { suffix: "+", duration: 800 })` — a tiny animated number, used
by `MetricStrip` but also standalone. Today: not possible.

---

## 5. Typography

**The pain.** `Text` variants are body/heading oriented; I needed
**display** sizes, **gradient** runs, **responsive `clamp()`** sizing, and
tight letter-spacing — all done via `HTMLTag("h1"/"h2")` + CSS.

### 5.1 `Heading` / `Display` components (P0)

```javascript
Display(["Build complex UIs in ", GradientText("a fraction of the code")], {
  size: "hero",          // hero | xl | lg  → responsive clamp() built in
  weight: 900,
  align: "center",
  balance: true          // text-wrap: balance for headlines
})
Heading("One language.", { level: 2, size: "section" })
```

`size` presets encode the `clamp()` ramps I wrote by hand
(`clamp(36px,6vw,72px)` etc.), so headlines scale responsively with no CSS.

### 5.2 `Text` additions (P1)

- `variant: "display-heavy" | "eyebrow"` (eyebrow = uppercase, letter-spaced,
  primary-toned — I rebuilt this ~10 times as `.ak-eyebrow`).
- `gradient: "brand"` to tint inline runs.
- `maxWidth: "60ch"` (lead paragraphs).

---

## 6. Code & developer surfaces

A developer-tools product *must* show code beautifully; this section was
surprisingly weak.

### 6.1 `CodeWindow` / `BrowserFrame` / `Terminal` chrome (P0)

**The pain.** The "window" chrome (traffic-light dots + filename + "Live"
badge) wrapping both the code pane and the live preview was ~15 `HTMLTag`
nodes **per window**, repeated 4×.

```javascript
CodeWindow({
  file: "dashboard.aktion",
  status: Badge("Live render", { tone: "success", animate: "pulse" }),
  tabs: ["dashboard.aktion", "counter.aktion"],   // optional
  code: CodeBlock(src, { language: "aktion" }),
  preview: heroPreviewNode                          // optional split preview
})
```

Plus `BrowserFrame(url, child)` and `Terminal(lines)` for the dev-steps
section.

### 6.2 Real syntax highlighting in `CodeBlock` (P1)

**The pain.** `CodeBlock` renders monochrome text. The static page had
**token-colored** code (keywords, strings, functions). I couldn't match it.
Add a lightweight tokenizer for at least `aktion`, `js`, `ts`, `html`, `bash`
so `CodeBlock(src, { language: "aktion" })` colorizes via theme tokens
(`--rui-code-keyword`, `-string`, `-fn`, …).

### 6.3 Streaming/typewriter code demo (P2)

The static page streams code token-by-token into a live preview (the
"tokens → screen" infographic). A `TypewriterCode` / `StreamDemo({ source,
speed })` component would make Aktion's signature streaming feature
*self-demonstrating* with one call.

---

## 7. Interactivity & lifecycle

### 7.1 `ThemeToggle` + readable/writable theme handle (P0)

**The pain.** The in-page dark/light toggle required emitting a custom
`toggle-theme` event and wiring a host listener in the HTML. There's no way
for an Aktion program to read or set its own theme.

Proposal: a reserved `$theme` handle is **readable and writable** at runtime,
and a `ThemeToggle()` component ships built-in:

```javascript
ThemeToggle()                          // drops a sun/moon switch, just works
// or imperatively:
function flip() { $theme.mode = $theme.mode == "dark" ? "light" : "dark" }
Text(`Current: ${$theme.mode}`)
```

This removes host-side glue entirely — the program owns its own theme.

### 7.2 `$scroll` / viewport reactive globals (P1)

A read-only reactive `$scroll.y`, `$scroll.progress`, and `$viewport.width`
would enable scroll-driven nav shadows and parallax without `OnMount` + raw
DOM. The static nav's "shadow on scroll" needed JS; this makes it
declarative: `NavBar({ elevate: $scroll.y > 12 })`.

### 7.3 `copyToClipboard` action helper (P2)

The CTA "copy snippet" button needed host JS. Expose
`$util.copy(text)` (or a `CopyButton(text)` component) so copy-to-clipboard
is a one-liner. (`CodeBlock` already has copy — generalize it.)

---

## 8. New props on existing components

Small, high-leverage additions discovered during the port:

| Component | New prop | Why (from this port) |
| --- | --- | --- |
| **all** | `sx` (§1.1) | eliminate `Css`/`HTMLTag` styling |
| **all** | `animate` (§4.2) | entrance/loop motion without CSS |
| **all** | `id` / `anchor` | smooth-scroll nav targets (had none) |
| `Grid` | `gap: "none"` officially, `minChildWidth` responsive map | code+preview split |
| `Button` | `fill: "gradient.brand"`, `size`, icon-only when label `""` | gradient CTAs; nav icon buttons |
| `Icon` | `disc: "gradient.brand"` (colored disc bg), `size: "2xl"` | feature/step icons in discs (rebuilt by hand) |
| `Card` | `surface: "glass"`, `hover: "lift"`, `accent: "left:gradient.brand"` | stat tiles, demo cards |
| `Badge` | `tone: "gradient.brand"`, `animate: "pulse"` | pills & live dots |
| `StatCard` | `accentBar`, `countUp` | metric tiles |
| `Select`/`Slider`/`Switch` | `label` rendered above (consistent) | I added manual field labels |
| `CodeBlock` | `theme: "dark"` independent of page theme, `tokens` | dark code on light page |
| `Hero` | `badge`, `media`, `note`, node titles (§3.2) | the whole hero |
| `Container`/`Section` | `align`, `background`, `eyebrow/title/subtitle` (§2.1) | every section |

---

## 9. Language & authoring ergonomics

### 9.1 Spread/compose children more fluidly (P2)

I wrote many `[a, b, ...list.map(...)]`. This works, but a `Fragment(...)`
or implicit flattening of nested arrays in children would reduce noise.
(Minor — the language handled composition well overall.)

### 9.2 String building for inline values (P1)

**The pain.** Because there's no `sx`, I built inline styles by string
concat: `"left:" + p.x + "%; top:" + p.y + "%;"`. With `sx`/typed props
(§1) this disappears. If raw style strings remain a thing, a `$style({...})`
helper that serializes an object → safe style string would beat `+`
concatenation.

### 9.3 Component-local constants / private helpers (P2)

My helper factories (`section`, `chip`, `statTile`, …) are top-level
bindings. A way to mark helpers as private/local (so they don't pollute the
program's reactive namespace) would keep large pages tidy. Today everything
shares one flat scope.

### 9.4 Named slots in user components (P2)

`function Section(opts, children)` worked, but first-class **slot** semantics
(`header`, `media`, `footer`) for user components would make composites like
my `codeWindow`/`demoCard` cleaner and match how the proposed built-ins
(`Hero.media`, `CodeWindow.preview`) behave.

---

## 10. Helper functions

A `$style` namespace (sibling to `$util`) for **safe, declarative styling
math**, all theme-token aware:

```javascript
$style.gradient(["#6366f1", "#ec4899"], { angle: 120 })   // → token ref
$style.alpha("primary", 0.12)                              // color-mix wrapper
$style.token("spacing.xl")                                 // resolve a token
$style.clamp("36px", "6vw", "72px")                        // responsive size
$util.copy(text)                                           // clipboard (§7.3)
$util.inView(ref)                                          // reactive visibility
```

These cover the exact CSS functions I reached for (`color-mix`, `clamp`,
`linear-gradient`) but keep them bounded and sanitised.

---

## 11. North-star: the hero, before vs after

**Today (abridged from the port — ~70 lines incl. `HTMLTag`/`Styles`):**

```javascript
hero = HTMLTag("section", { attributes: { class: "ak-section ak-hero" }, children: [
  HTMLTag("div", { attributes: { class: "ak-wrap ak-hero-wrap" }, children: [
    HTMLTag("span", { attributes: { class: "ak-pill" }, children: [
      HTMLTag("span", { attributes: { class: "ak-pill-tag" }, children: ["v0.5"] }),
      "A new language for building user interfaces"
    ] }),
    HTMLTag("h1", { attributes: { class: "ak-h1" }, children: ["Build complex UIs in ", grad("a fraction of the code"), "."] }),
    HTMLTag("p", { attributes: { class: "ak-lead" }, children: ["Aktion is a reactive UI language…"] }),
    Row([Button("Start building", {...}), Button("Open the playground", {...})], {...}),
    HTMLTag("div", { attributes: { class: "ak-note" }, children: [Icon("circle-check"), "Learn it in an afternoon…"] }),
    showcase   // itself ~15 more HTMLTag nodes
  ] })
] })
// + ~40 lines of .ak-hero / .ak-pill / .ak-h1 / .ak-lead CSS in Styles(...)
```

**After (with these suggestions — zero HTMLTag, zero CSS):**

```javascript
hero = Section({ align: "center", padding: "hero", background: "base" }, [
  Backdrop({ layers: ["grid", Blobs("gradient.brand"), Particles({ count: 40 })] }),
  Hero(Display(["Build complex UIs in ", GradientText("a fraction of the code"), "."], { size: "hero" }), {
    badge: Badge("v0.5", { tone: "gradient.brand" }),
    subtitle: "Aktion is a reactive UI language — a strict subset of JavaScript you already know.",
    primary: Button("Start building", { variant: "primary", icon: "rocket", fill: "gradient.brand" }),
    secondary: Button("Open the playground", { icon: "play" }),
    note: "Learn it in an afternoon · Runs in any framework · LLM-friendly",
    media: CodeWindow({
      file: "dashboard.aktion",
      status: Badge("Live render", { tone: "success", animate: "pulse" }),
      code: CodeBlock(heroCode, { language: "aktion" }),
      preview: heroPreview
    }),
    animate: "fade-up"
  })
])
```

That is the whole point: **the page becomes describable, not constructed.**

---

## 12. Priority matrix & rollout

### P0 — unblocks "no escape hatch" (do these first)

1. **`sx` style-intent prop** on all components (§1.1) — kills most `HTMLTag`/`Css`.
2. **Gradients as tokens + `GradientText`** (§1.2).
3. **`Section`** band primitive (§2.1).
4. **`NavBar` + `Footer` + `Hero` upgrade** (§3.1, §3.7, §3.2).
5. **`Backdrop`/`Particles`/`Blobs`/`GridPattern`** (§4.1).
6. **`Display`/`Heading`** typography (§5.1).
7. **`CodeWindow`** chrome (§6.1).
8. **`ThemeToggle` + writable `$theme` handle** (§7.1).

> Implementing just the P0 list would take this exact page from
> **90 `HTMLTag` + 166 CSS lines → ~0**.

### P1 — high leverage

`Bento` (§2.2), `Split` (§2.3), `LogoCloud` (§3.3), `MetricStrip` + count-up
(§3.4), `animate` presets + `Reveal` (§4.2–4.3), syntax highlighting (§6.2),
`$scroll` globals (§7.2), eyebrow/display `Text` variants (§5.2),
`Icon { disc }` & `Card { surface, hover, accent }` props (§8), `$style`
helpers (§10).

### P2 — polish

`CountUp` standalone (§4.4), `BrowserFrame`/`Terminal`/`StreamDemo` (§6.1,
6.3), `Swatch`/`ThemePreview` (§3.6), copy helper (§7.3), local helper scope &
named slots (§9.3–9.4), Fragment/flattening (§9.1).

### Guiding principles (so additions stay "Aktion")

- **Bounded, not free-form.** Every new styling input is an enum or a token
  reference — never raw CSS. This preserves theme-safety, XSS-safety, and the
  "describe intent" philosophy, and keeps the surface **LLM-friendly** (a model
  can enumerate valid values).
- **Composites over config.** Prefer shipping `Section`/`Hero`/`CodeWindow`
  composites (one line = one section) over piling props onto primitives.
- **Theme-token native.** Gradients, motion, and spacing all resolve through
  `$theme(...)`, so a brand override restyles the whole marketing page for free.
- **Motion is opt-in & accessible.** All `animate` presets auto-respect
  `prefers-reduced-motion`.

---

### Appendix — what already worked well (keep it)

Not everything was hard. These carried the port and should be the model for
new additions:

- **`ComparisonTable`** — dropped in the React/Vue/Angular table in one call.
- **`FeatureGrid` / `FeatureItem`** — the feature section's tiles + icon discs.
- **`StatCard`, `Card`, `CardHeader`, `Callout`, `Table`, `Badge`** — the live
  component-showcase previews are *real* and looked great untouched.
- **`BarChart` + `Series`, `Select` + `SelectItem`, `Switch`, `Slider`** — the
  live form/chart demos.
- **Reactivity** (`$count`, actions) — the live counter "just worked".
- **`$emit`** — made the theme toggle possible (even if `$theme` handle would
  be nicer).
- **`Css` / `HTMLTag` / `Styles`** — the escape hatches were *always*
  available, so nothing was ever truly blocked. The goal of this doc is to
  make reaching for them the rare exception, not the default.
