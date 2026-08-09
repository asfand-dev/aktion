# Authoring Aktion Quest games

**Audience: an LLM (or a human) writing new content for `games.json`.**

Aktion Quest is a runtime (`game.html` + `game.js`) that plays a bundle of JSON.
It has no content of its own. Everything a player reads, clicks, drags, or watches
comes out of `games.json` — including the PixiJS and GSAP source for the animated
backdrops, celebrations, and full arcade mini-games.

Your job is to add **games**. This file is the complete contract.

---

## 0. The 60-second version

```
games.json
└── games[]                        one "world" — a coherent slice of the language
    ├── palette / backdrop         look and feel (the whole UI re-tints)
    ├── intro                      the brief screen: why this matters
    ├── stages[]                   5–7 of them, in a deliberate difficulty ramp
    │   ├── teach                  prose + code + an infographic + tips  (LEFT pane)
    │   ├── challenge              one of 11 interaction engines         (RIGHT pane)
    │   ├── hints / nudges         progressive help
    │   ├── explain                the payoff, shown after the answer
    │   └── codex                  one term the player permanently collects
    └── outro / badge              the reward screen
```

Run the bundle through the runtime's own validator at any time:

```bash
node -e "const d=require('./game/games.json');console.log(JSON.stringify(d.games.map(g=>g.id)))"
```

and open the browser console — `game.js` prints every structural problem it finds
on boot (`[aktion-quest] content warnings:`). **A clean console is the bar.**

---

## 1. Bundle shape

```jsonc
{
  "$schema": "aktion-quest/1",
  "meta": {
    "title": "Aktion Quest",
    "tagline": "learn by playing",
    "blurb": "One paragraph shown under the home headline.",
    "backdrop": { "preset": "starfield" }        // home-screen backdrop
  },
  "config": {
    "xpPerStage": 100,          // default stage XP when a stage omits `xp`
    "hintCost": 15,             // XP deducted per hint taken
    "livePreview": true,        // allow stages to render real Aktion (see §7)
    "liveValidation": true,     // allow type-code stages to run the real validator
    "aktionSources":         ["../dist/aktion.js",  "https://esm.sh/aktion-runtime@0.6.1"],
    "aktionLanguageSources": ["../dist/language.js","https://esm.sh/aktion-runtime@0.6.1/language"]
  },
  "tracks": [
    { "id": "foundations", "title": "Foundations",
      "blurb": "optional one-liner under the track heading",
      "games": ["first-light", "reactive-pulse"] }   // ordered game ids
  ],
  "games": [ /* … */ ]
}
```

`tracks` is presentation only — a game appears on the home screen through the
track that lists its id. A game missing from every track is invisible, so always
add the id to a track when you add a game.

---

## 2. A game

```jsonc
{
  "id": "reactive-pulse",              // kebab-case, unique, never reused
  "title": "Reactive Pulse",
  "subtitle": "State that redraws itself",
  "icon": "bolt",                      // see §9 for the icon set
  "difficulty": 2,                     // 1 starter · 2 easy · 3 medium · 4 hard · 5 boss
  "estimateMin": 9,
  "requires": ["first-light"],         // game ids that must be *complete* to unlock
  "palette": { "g1": "#5eead4", "g2": "#a78bfa", "g3": "#38bdf8" },
  "backdrop": { "preset": "circuit" }, // or { "code": "…" } — see §6
  "intro": {
    "headline": "One sigil, one rule",
    "body": "Markdown-lite. **bold**, *emphasis*, `code`, blank line = new paragraph.",
    "code": "$count = 0",              // optional teaser, syntax-highlighted
    "codeCaption": "what you will be able to write",
    "infographic": { /* §5 */ },
    "objectives": ["Declare reactive state", "Wire an event handler", "…"]
  },
  "stages": [ /* §3 */ ],
  "outro": {
    "headline": "The pulse is yours",
    "body": "One or two sentences of payoff.",
    "nextHint": "Next up: components — turning that state into reusable UI."
  },
  "badge": { "name": "Pulsekeeper", "icon": "bolt", "tagline": "Made the UI move." }
}
```

### Palette

`g1` / `g2` / `g3` re-tint the *entire* interface for that world — buttons,
glow, syntax accents, the aurora, and the default colours handed to your Pixi
code. Pick high-chroma colours that survive a dark background. Give every game a
distinct pair so the world map reads as a spectrum.

### Locking

`requires` is the whole progression system. Keep the graph shallow and linear
inside a track (`B requires A`, `C requires B`) and let later tracks require the
last game of the previous one. A game with `requires: []` is playable immediately.

---

## 3. A stage

```jsonc
{
  "id": "s2",                          // unique inside its game; used for progress
  "title": "Two-way by default",
  "kicker": "reactivity",              // small uppercase label above the title
  "icon": "bolt",
  "goal": "Bind an input to state without writing a single handler.",
  "xp": 100,
  "hearts": 3,                         // wrong answers allowed before the reveal

  "teach": {
    "text": "…markdown-lite…",
    "code":  { "src": "$name = \"Ada\"", "caption": "declare it" },
    "code2": { "src": "Input(\"name\", { value: $name })", "caption": "bind it" },
    "infographic": { /* §5 */ },
    "tips": [
      "A plain string tip.",
      { "kind": "warn",   "text": "Amber — a trap." },
      { "kind": "danger", "text": "Red — a hard error." }
    ]
  },

  "challenge": { /* §4 — exactly one */ },

  "hints":  ["Nudge one.", "Nudge two — closer.", "Almost the answer."],
  "nudges": ["Shown after the 1st wrong answer.", "After the 2nd."],
  "explain": "Why the right answer is right. Always write this.",
  "afterCode": { "src": "…", "caption": "the shape to remember" },
  "codex": { "term": "$name", "def": "One-line definition, collected forever." },
  "preview": { "program": "$app(Column([Text(\"hi\")]))", "theme": "dark" },

  "scene":     { "code": "…", "params": {} },   // extra backdrop layer for this stage
  "onCorrect": { "code": "…", "duration": 2600 },
  "onWrong":   { "code": "…", "duration": 1800 }
}
```

**`teach` is the textbook, `challenge` is the exam, `explain` is the answer key.**
A stage that only tests, or only teaches, is a broken stage.

### Stage ordering inside a game

1. **Recognise** — quiz, match-pairs, hotspot. Low friction, builds vocabulary.
2. **Assemble** — fill-blanks, order-lines, sequence-tap. The player produces the shape.
3. **Discriminate** — bug-hunt, switchboard, sort-bins. The player rejects wrong shapes.
4. **Arcade** — one per game, roughly at position 3–5. Pure fun, one concept.
5. **Produce** — type-code. They write it from nothing.

Never open a game with `type-code`. Never close one with a quiz.

### Variety is a bundle-level property, not a game-level one

Six *different* engines inside your game is the floor, not the goal. The trap is
that "recognise → assemble → discriminate → arcade → discriminate → produce"
resolves to `quiz → fill-blanks → switchboard → arcade → bug-hunt → type-code`
in every single game, and a player who has finished three worlds has then seen
the same six screens twelve times.

Before you pick engines, **count what the rest of the bundle already uses**:

```bash
node game/build.mjs        # prints the per-game type mix for every world
```

Then deliberately choose the under-used ones. Each recognise/assemble/
discriminate slot has three interchangeable engines — pick the one the bundle is
short of, and shape the content to fit it rather than the reverse. Ordered
things (a lifecycle, a request's states, route-match precedence, a streaming
sequence) want `sequence-tap` or `order-lines`. Relationships (builtin → what it
returns, component → what it replaces) want `match-pairs`. A claim about one
specific token inside a line wants `hotspot` or `bug-hunt`, not a quiz about it.

---

## 4. The eleven challenge engines

Every challenge needs `type` and `prompt`. `title` (pane heading) and `code`
(a syntax-highlighted block shown above the interaction) are optional everywhere.

### 4.1 `quiz` — recognise

```jsonc
{
  "type": "quiz",
  "prompt": "Which line declares reactive state?",
  "code": "// optional context shown above",
  "multi": false,                      // true = check-all-that-apply
  "shuffle": true,                     // false keeps authored order
  "options": [
    { "id": "a", "code": "$count = 0", "label": "optional headline", "detail": "optional small note" },
    { "id": "b", "code": "let count = 0" }
  ],
  "answer": "a"                        // or ["a","c"] when multi
}
```
Keys `1`–`9` select options. Give 3–5 options; every wrong one should be a
mistake a real beginner makes, never filler.

### 4.2 `fill-blanks` — assemble (code layout)

```jsonc
{
  "type": "fill-blanks",
  "prompt": "Complete the program.",
  "display": "code",                                  // default
  "template": "{{0}}(Column([\n  Text({{1}})\n]))",   // {{n}} = slot n
  "bank": ["$app", "$render", "\"Hello\"", "Hello"],  // strings → id === label
  "answer": ["$app", "\"Hello\""]                     // one entry per slot, in slot order
}
```
Bank entries may also be `{ "id": "x", "label": "…" }` when two chips read alike.
**Always add 1–3 plausible distractors.** Slot count must equal answer count —
the boot validator checks this.

### 4.3 `fill-blanks` with `display: "tree"` — assemble (nesting)

```jsonc
{
  "type": "fill-blanks", "display": "tree",
  "prompt": "Rebuild the component tree.",
  "rows": [
    { "depth": 0, "label": "$app(", "slot": 0, "after": ")" },
    { "depth": 1, "slot": 1 },
    { "depth": 2, "label": "Text(\"Total\")" }
  ],
  "bank": ["Column([…])", "Card([…])", "Row([…])"],
  "answer": ["Column([…])", "Card([…])"]
}
```
`depth` indents; `label` / `after` are static text around the slot.

### 4.4 `order-lines` — assemble (sequence)

```jsonc
{
  "type": "order-lines",
  "prompt": "Put the program in streaming order.",
  "lines": [
    { "id": "app",  "code": "$app(Column([header, list]))" },
    { "id": "hdr",  "code": "header = PageHeader(\"Orders\")" }
  ],
  "answer": ["app", "hdr"]             // omit to mean "as authored"
}
```
Drag, or use the ▲▼ buttons. The runtime guarantees the initial order is wrong.

### 4.5 `bug-hunt` — discriminate

```jsonc
{
  "type": "bug-hunt",
  "prompt": "One token stops this rendering. Which?",
  "code": "function Card(t) {\n  [[Card]]([[Text]](t))\n}",   // [[…]] marks a clickable span
  "answer": 0,                          // 0-based index among the [[…]] spans
  "fixed": "function Card(t) {\n  return Card(Text(t))\n}"    // shown on reveal
}
```
Spans are indexed in source order. Mark 3–6 of them — one bug, the rest innocent.

### 4.6 `match-pairs` — recognise (relational)

```jsonc
{
  "type": "match-pairs",
  "prompt": "Match each builtin to what it returns.",
  "pairs": [
    { "left": { "mono": "$http({…})", "note": "optional" },
      "right": { "label": "A reactive resource bag" } }
  ]
}
```
No answer key: pairing is positional, and the right column is shuffled for you.
4–6 pairs is the sweet spot.

### 4.7 `sort-bins` — discriminate (categorise)

```jsonc
{
  "type": "sort-bins",
  "prompt": "File each name under what it is.",
  "bins": [
    { "id": "builtin", "label": "Builtin", "hint": "$-prefixed runtime surface" },
    { "id": "comp",    "label": "Component", "hint": "returns a tree" }
  ],
  "items": [ { "label": "$router", "bin": "builtin" }, { "label": "Stack", "bin": "comp" } ]
}
```
2–4 bins, 6–9 items.

### 4.8 `switchboard` — discriminate (valid / invalid)

```jsonc
{
  "type": "switchboard",
  "prompt": "Switch ON every legal $effect dependency.",
  "help": "optional replacement for the default instruction line",
  "switches": [
    { "label": "$todos",      "detail": "a reactive atom", "on": true },
    { "label": "route.path",  "detail": "the router handle", "on": false }
  ]
}
```
`on` is the *correct* state. Every switch starts OFF, so a correct answer means
turning on exactly the `on: true` ones.

### 4.9 `sequence-tap` — recall under pressure

```jsonc
{
  "type": "sequence-tap",
  "prompt": "Tap the lifecycle in the order the runtime runs it.",
  "order": ["parse", "plan", "render", "commit"]     // authored = correct order
}
```
The runtime shuffles the display. One wrong tap ends the attempt — keep it to
4–6 short items.

### 4.10 `hotspot` — recognise (spatial)

```jsonc
{
  "type": "hotspot",
  "prompt": "Click the part that makes this call two-way bound.",
  "code": "Input(\"email\", { value: $signup.email })",
  "points": [
    { "match": "\"email\"",       "label": "1", "tip": "the positional name — just the field id", "correct": false },
    { "match": "$signup.email",  "label": "2", "correct": true }
  ]
}
```

**Anchor every point with `match`, not coordinates.** `match` is a substring of
`code`; the runtime finds it in the rendered text and pins the marker to that
token's own box, re-measuring on every resize. Add `"nth": 2` to target the
second occurrence when a token repeats.

`x` / `y` (CSS percentages over the code block) still work as a fallback, but
they are only correct at one viewport width — the code block is a full-width
grid item that never shrink-wraps, so the percentage a marker needs changes with
the pane. Reach for them only when you want a marker somewhere there is no token
to attach to. A `match` that finds nothing silently falls back to `x`/`y`, or to
dead centre if you gave neither, so check your markers in the browser.

Keep `code` to 3–6 short lines: markers stack up badly on a wrapped line.

### 4.11 `type-code` — produce

```jsonc
{
  "type": "type-code",
  "prompt": "Write a counter: state, a button that increments it, and a readout.",
  "filename": "counter.aktion",
  "starter": "$count = 0\n\n$app(",
  "placeholder": "…",
  "solution": "$count = 0\n$app(Column([\n  Button(\"+1\", { onClick: () => $count = $count + 1 }),\n  Text(`${$count}`)\n]))",
  "validate": {
    "must":    ["\\$count\\s*=", "Button\\(", "onClick", "\\$app\\("],
    "mustWhy": ["Declare $count first.", "You need a Button.", "The Button needs an onClick.", "Everything renders from $app()."],
    "mustNot": ["useState", "document\\."]
  }
}
```
`must` / `mustNot` are **JavaScript regex source strings** (escape backslashes for
JSON). Prefer them over exact matching — there are many correct programs. If you
omit `validate.must`, the runtime falls back to whitespace-normalised comparison
against `solution`, which is nearly always too strict. When the real Aktion
language service is reachable, its diagnostics are shown under the editor for
free.

### 4.12 `arcade` — the showpiece

```jsonc
{
  "type": "arcade",
  "prompt": "Catch the reactive names. Let the plain ones fall.",
  "goal": "8 caught",
  "height": 340,
  "note": "Drag anywhere to move the collector.",
  "winNote": "Press Check to bank the XP.",
  "params": { "target": 8 },
  "code": "…PixiJS + GSAP source, see §6…",
  "fallback": { "type": "quiz", "prompt": "…", "options": [], "answer": "a" }
}
```

**`fallback` is mandatory.** It is played instead when WebGL or the CDN is
unavailable, and the boot validator warns if it is missing. Make it a real
question on the same concept, not a placeholder.

---

## 5. Infographics

`teach.infographic` (and `intro.infographic`) renders a declarative diagram that
animates in. Eight types; each takes an optional `title`.

```jsonc
{ "type": "flow", "title": "The render path", "direction": "right",   // or "down"
  "nodes": [ { "label": "$app(…)", "note": "the one root", "accent": true },
             { "label": "plan",    "note": "resolve names" } ] }

{ "type": "compare",
  "columns": [ { "kind": "bad",  "title": "Silently wrong", "code": "Button(\"Save\", \"primary\")", "note": "binds to onClick" },
               { "kind": "good", "title": "What you meant", "code": "Button(\"Save\", { variant: \"primary\" })" } ] }

{ "type": "anatomy", "code": "$orders = $http({ url: \"…\" })",
  "parts": [ { "match": "$orders", "key": "the bag",  "text": "not the payload — .data holds that" },
             { "match": "$http",   "key": "builtin",  "text": "the only network primitive" } ] }

{ "type": "layers",   "layers": [ { "label": "$app",   "note": "render root" } ] }
{ "type": "timeline", "steps":  [ { "label": "mount",  "note": "effects with \"mount\" fire" } ] }
{ "type": "orbit",    "core": "$util", "satellites": [ { "label": ".format", "note": "numbers" } ] }
{ "type": "meter",    "rows":   [ { "label": "atoms",  "value": 95, "note": "path-tracked" } ] }   // value 0–100
{ "type": "table",    "headers": ["Rejected", "Replace with"],
                      "rows": [ ["x = if (c) {a}", "x = c ? a : b"] ] }
```

`anatomy` matches the **first occurrence** of each `match` string in `code`, so
make each one unique within that snippet. Its `code` is rendered plain (the
callout colours are the highlighting) — everything else runs through the Aktion
syntax highlighter.

Use one infographic per stage at most. Two is noise.

---

## 6. PixiJS + GSAP inside the JSON

Four places take code, all optional:

| Field | Runs on | Lives for |
| --- | --- | --- |
| `game.backdrop.code` | the full-window backdrop canvas | the whole world |
| `stage.scene.code` | an extra layer on the same canvas | that stage |
| `stage.onCorrect.code` / `onWrong.code` | the same canvas | `duration` ms |
| `challenge.code` (`type: "arcade"`) | its own canvas inside the card | that stage |

The string is compiled with `new Function("PIXI", "gsap", "ctx", src)`. It is
**code, not data** — only ship bundles you wrote or reviewed.

### The `ctx` toolkit

```js
ctx.stage            // PIXI.Container — add everything here; auto-cleaned
ctx.app              // the PIXI.Application (for .ticker, .renderer)
ctx.width, ctx.height
ctx.params           // your JSON `params` object
ctx.colors           // { g1, g2, g3, good, bad, warn, ink, dim, bg } as 0xRRGGBB numbers
ctx.rand(a, b)       // float in [a,b)
ctx.pick(array)
ctx.text(str, { size, color, weight, mono })   // → PIXI.Text
ctx.chip(label, { color, textColor, size, padX, padY, radius, stroke, minWidth })
                     // → PIXI.Container with .chipWidth / .chipHeight / .label
ctx.glow(radius, color, alpha)                 // → soft radial PIXI.Graphics
ctx.onTick(fn)       // fn(delta, ticker) each frame
ctx.onDestroy(fn)    // teardown hook
ctx.state            // scratch object (arcade only) — survives your closures
ctx.el               // the host DOM element (arcade only)
ctx.api              // arcade only, see below
```

Arcade scoring API:

```js
ctx.api.setScore(n)      // paints the HUD counter
ctx.api.setGoal("8 / 8") // paints the HUD goal label
ctx.api.win("Nice!")     // marks the challenge solved — Check now succeeds
ctx.api.fail("Missed")   // shows a Retry overlay; the scene restarts clean
```

You may also `return { update(delta) {…}, destroy() {…} }` instead of using
`ctx.onTick` / `ctx.onDestroy`.

### PixiJS v8 API — the parts you need

v8 is **not** v7. These are the shapes that work:

```js
const g = new PIXI.Graphics();
g.circle(0, 0, 12).fill({ color: ctx.colors.g1, alpha: .8 });
g.roundRect(-40, -14, 80, 28, 10).fill(0x223344).stroke({ width: 2, color: ctx.colors.g2 });
g.moveTo(0, 0).lineTo(100, 0).stroke({ width: 2, color: ctx.colors.g3, alpha: .4 });
g.clear();                                   // redraw-per-frame pattern

const t = new PIXI.Text({ text: "hi", style: { fontFamily: "JetBrains Mono", fontSize: 14, fill: 0xffffff } });
t.anchor.set(.5);

const c = new PIXI.Container();
c.addChild(g, t);
ctx.stage.addChild(c);

c.eventMode = "static";                      // v8 interactivity (not `.interactive`)
c.cursor = "pointer";
c.on("pointertap", () => { /* … */ });
```

`ctx.app.stage.eventMode = "static"` is already set by the runtime for arcade
canvases; add `hitArea` when you need pointer events over empty space:

```js
ctx.app.stage.eventMode = "static";
ctx.app.stage.hitArea = new PIXI.Rectangle(0, 0, ctx.width, ctx.height);
ctx.app.stage.on("pointermove", (e) => { paddle.x = e.global.x });
```

### GSAP notes

`gsap.to(displayObject, { x: 200, alpha: 0, duration: .6, ease: "back.out" })`
works on any Pixi object. **Scale is a Point** — animate it directly:

```js
gsap.to(chip.scale, { x: 1.4, y: 1.4, duration: .3, yoyo: true, repeat: 1 });
```

There is no PixiPlugin, so do not use `{ pixi: { … } }` syntax, and do not tween
colours. If the GSAP CDN is unreachable the runtime substitutes a small shim
covering `to` / `from` / `fromTo` / `set` / `timeline` / `delayedCall` with the
common eases — keep to that surface and your scene degrades instead of dying.
The shim does **not** implement `yoyo` / `repeat`, so write a there-and-back
bounce with `onComplete` instead:

```js
gsap.to(chip.scale, { x: 1.3, y: 1.3, duration: .12,
  onComplete: () => gsap.to(chip.scale, { x: 1, y: 1, duration: .2, ease: "back.out" }) });
```

### Backdrop presets (no code needed)

`starfield` · `stream` · `orbit` · `circuit` · `bloom`

```jsonc
"backdrop": { "preset": "circuit", "params": { "lanes": 12 } }
```

Prefer a preset for the world backdrop and spend your custom-code budget on the
arcade stage, where the player actually interacts with it.

### A complete arcade example

```jsonc
{
  "type": "arcade",
  "prompt": "Only `$`-prefixed names are reactive. Catch those; let the rest fall.",
  "goal": "0 / 8",
  "height": 330,
  "params": { "target": 8, "good": ["$count", "$user", "$rows", "$theme"], "bad": ["count", "let x", "total"] },
  "note": "Move the mouse (or drag) to slide the collector.",
  "code": "const P = ctx.params;\nconst pad = ctx.chip('COLLECTOR', { color: ctx.colors.g2, minWidth: 150 });\npad.y = ctx.height - 34; pad.x = ctx.width / 2;\nctx.stage.addChild(pad);\nctx.app.stage.eventMode = 'static';\nctx.app.stage.hitArea = new PIXI.Rectangle(0, 0, ctx.width, ctx.height);\nctx.app.stage.on('pointermove', (e) => { pad.x = e.global.x; });\nlet score = 0, miss = 0, t = 0;\nconst live = [];\nctx.onTick((dt) => {\n  t += dt;\n  if (t > 34) {\n    t = 0;\n    const good = Math.random() < 0.55;\n    const c = ctx.chip(good ? ctx.pick(P.good) : ctx.pick(P.bad), { color: good ? ctx.colors.g1 : ctx.colors.dim, textColor: good ? 0x04101a : 0xdfe6ff });\n    c.x = ctx.rand(50, ctx.width - 50); c.y = -20; c.good = good;\n    ctx.stage.addChild(c); live.push(c);\n  }\n  for (let i = live.length - 1; i >= 0; i--) {\n    const c = live[i];\n    c.y += 2.4 * dt;\n    const hit = c.y > pad.y - 22 && c.y < pad.y + 22 && Math.abs(c.x - pad.x) < 90;\n    if (hit) {\n      live.splice(i, 1); c.destroy();\n      if (c.good) { score++; ctx.api.setScore(score); ctx.api.setGoal(score + ' / ' + P.target); gsap.to(pad.scale, { x: 1.2, y: 1.2, duration: .12, yoyo: true, repeat: 1 }); }\n      else { miss++; if (miss >= 3) ctx.api.fail('Caught a plain name — those are not reactive.'); }\n      if (score >= P.target) ctx.api.win('Every reactive name caught.');\n    } else if (c.y > ctx.height + 30) {\n      live.splice(i, 1);\n      if (c.good) { miss++; if (miss >= 3) ctx.api.fail('Three reactive names slipped past.'); }\n      c.destroy();\n    }\n  }\n});",
  "fallback": {
    "type": "quiz",
    "prompt": "Which of these is reactive state in Aktion?",
    "options": [ { "id": "a", "code": "$count = 0" }, { "id": "b", "code": "let count = 0" }, { "id": "c", "code": "const count = 0" } ],
    "answer": "a"
  }
}
```

Writing that as a JSON string is the fiddly part. Rules that keep it working:

- **`\n` for newlines, `\"` for double quotes.** Prefer `'single quotes'` inside
  the code so you rarely need `\"`.
- **No template literals** unless you escape the backticks' contents carefully —
  string concatenation (`a + ' / ' + b`) is safer in JSON.
- **No `import`, no `await` at top level, no DOM access.** `ctx` is the world.
- **Never leak a ticker.** Anything you start in `ctx.onTick` is torn down for
  you; anything you start with `setInterval` is not — clear it in `ctx.onDestroy`.
- Keep it under ~60 lines. The teaching is in the metaphor, not the physics.

---

## 7. Live Aktion preview

```jsonc
"preview": { "program": "$count = 0\n$app(Column([Text(`${$count}`)]))", "theme": "dark",
             "caption": "live — rendered by the real Aktion runtime" }
```

After a stage resolves, the runtime tries to `import` the real `aktion-runtime`
(from `../dist/aktion.js`, then the CDN) and renders `program` inside a live
`<aktion-app>`. If neither resolves, the player sees the program as code and a
one-line explanation — so a preview is always safe to add.

**The program must be valid Aktion**, because a real parser gets it. Validate
before shipping:

```bash
node tools/validate-aktion.mjs /tmp/probe.aktion
```

Use previews on the stages where seeing the result is the lesson (layout,
components, theming) and skip them where it is not (syntax rules, gotchas).

---

## 8. Writing the teaching content

The runtime is generic; the quality is entirely in your prose. What separates a
good stage from a filler one:

- **One idea per stage.** If `explain` needs the word "also", split the stage.
- **Teach the trap, not just the rule.** `Button("Save", "primary")` validates
  *and* is wrong — that is worth a whole stage. A rule with no failure mode is a
  bullet point, not a challenge.
- **Every wrong option is a real mistake.** Pull them from what someone coming
  from React/Vue would actually type: `useState`, `props.title`, `className`,
  `{cond && <X/>}`, `map` returning JSX.
- **`explain` answers "why", never "what".** The player already saw what.
- **`codex.def` must stand alone** — it is read months later out of context.
- **Prose is markdown-lite**: `**bold**`, `*emph*`, `` `code` ``, `- bullets`,
  blank line between paragraphs. No headings, links, or tables — use an
  infographic instead.
- **Never use raw emoji** anywhere in the content; the icon set is in §9.

### Accuracy bar

Everything you assert about Aktion must be true of *this* repo. Check against
`README.md` (§ "Aktion — the language"), `skills/aktion/references/language.md`,
`skills/aktion/references/gotchas.md`, and `dist/system_prompt.txt`. In
particular:

- Component calls take **one** argument form: `C(positional, { …props })`,
  all-positional, or one all-named object. Never mix.
- `$effect` deps accept **only** `$`-atoms and the strings `"mount"`,
  `"unmount"`, `"every(N)"`, `"debounce(N)"`, `"throttle(N)"`. `route.path` is a
  parse error.
- `$http` / `$query` / `$mutation` return a **bag** (`.data`, `.loading`,
  `.error`, `.refetch()`), never the payload.
- There are exactly five namespaces: `$util`, `$storage`, `$console`, `$toast`,
  `$dom`.
- Icons are Font Awesome names without `fa-`; components never take emoji.
- `if` / `for` / `switch` are statements and cannot sit on the right of `=`.

An invented prop name or component is the worst possible bug here — the player
learns something false and the validator later contradicts you.

---

## 9. The icon set

`icon` fields (game, stage, badge) accept exactly these names:

`bolt` `spark` `check` `x` `lock` `star` `heart` `play` `arrow` `bulb` `book`
`info` `warn` `flame` `layers` `target` `code` `route` `cloud` `form` `paint`
`cpu` `wand` `shield` `trophy` `clock` `chart` `puzzle` `compass` `crown`
`medal` `refresh` `eye` `grid`

Anything else silently falls back to `spark`.

---

## 9b. Verifying your content without playing every stage

Three tools, all on `window.AktionQuest` in the browser console:

```js
AktionQuest.validateBundle(AktionQuest.App.data)
```
Re-runs every structural check the runtime does at boot: unknown challenge or
infographic types, unknown icons, quiz answers that are not option ids,
slot/answer mismatches, `bug-hunt` indexes outside the marked spans, `sort-bins`
items pointing at a missing bin, a `switchboard` with no correct switch, arcade
scenes with no `fallback` — **and every scene string is compiled**, so a syntax
error in your PixiJS code is reported here instead of failing silently at play
time. It also flags an arcade whose code never calls `ctx.api.win(`.

```js
await AktionQuest.selfTest()
```
Builds one of every challenge engine from a known-good fixture and asserts that
`check()` is false before `solve()` and true after. Use it when you suspect the
runtime rather than your content. `AktionQuest.FIXTURES` is the minimal valid
example of each type — useful as a starting point when authoring.

```js
await AktionQuest.drillArcade()            // every arcade in the bundle
await AktionQuest.drillArcade("my-game")   // just one
```
Runs each arcade scene off-screen with a synthetic player: a pointer sweeping
the canvas plus taps cycled through every object the scene registered a handler
on. It reports:

| Field | Meaning | How to read it |
| --- | --- | --- |
| `errors` | a tick (or the compile) threw | **Hard failure.** Must be 0. |
| `drew` | display objects on the scene stage | **Hard failure** if 0 — the scene renders nothing. |
| `taps` | objects with a tap handler | 0 means the scene is pointer-driven, which is fine |
| `won` | `ctx.api.win()` fired | **Best-effort only.** See below. |

`won` is a smoke signal, not a verdict. The auto-player taps blindly, so any
scene whose challenge is *choosing the right token* will often be killed by a
deliberate wrong answer before it can finish — and because most scenes spawn
with `Math.random()`, the same scene can win on one run and not the next. Treat
`won: true` as a bonus and `won: false` as "play this one by hand", never as a
bug report.

Two things the drill cannot check, so check them yourself by reading the code:
`ctx.api.win()` must be reachable from a *correct* sequence of inputs, and the
failure path must call `ctx.api.fail()` rather than silently freezing (a frozen
scene has no Retry overlay and strands the player).

---

## 10. Checklist before you ship a game

- [ ] `id` unique; added to exactly one `tracks[].games` array.
- [ ] `requires` names games that exist and come earlier in the progression.
- [ ] 5–7 stages, ramping recognise → assemble → discriminate → produce.
- [ ] At most one `arcade` stage, and it has a real `fallback`.
- [ ] Challenge-type variety: no type used more than twice in one game.
- [ ] Every stage has `teach`, `explain`, `hints` (2–3), and `codex`.
- [ ] `fill-blanks`: slot count === answer count; bank has distractors.
- [ ] `bug-hunt`: `answer` is a valid index into the `[[…]]` spans.
- [ ] `quiz`: every `answer` id exists in `options`.
- [ ] Every code sample is valid Aktion for *this* repo version.
- [ ] Distinct `palette`; a `badge` with `name`, `icon`, `tagline`.
- [ ] `node game/build.mjs` reports no problems.
- [ ] Browser console shows **no** `[aktion-quest] content warnings` on boot.
- [ ] `await AktionQuest.drillArcade("<your-game-id>")` reports `errors: 0` and `drew > 0`.
- [ ] You read the arcade code back and confirmed `ctx.api.win()` is reachable and
      every dead end calls `ctx.api.fail()`.
- [ ] You played it end to end.

---

## 11. Building and running it

Games live one-per-file in `game/_authored/`. `games.json` is a build artefact —
**edit the per-game file, then re-merge**:

```bash
node game/build.mjs
```

It prints the challenge-type mix per game and fails loudly on bad JSON, an
unknown `requires`, or a game missing from every track.

Then serve the **repo root** (not `game/`, so live previews can reach
`../dist/aktion.js`):

```bash
npx vite --config game/serve.config.mjs
```

and open `http://localhost:5180/game/game.html`. Any static server works
(`python3 -m http.server 5180` from the repo root), but `file://` does not —
browsers refuse `fetch()` and ES-module imports from it.

Progress lives in `localStorage` under `aktion-quest-v1`. The reset button in the
top bar clears it; `localStorage.removeItem("aktion-quest-v1")` does the same
from the console. `window.AktionQuest` exposes `{ App, Store, FX, validateBundle }`
for debugging, and `AktionQuest.validateBundle(AktionQuest.App.data)` re-runs the
structural checks on demand.
