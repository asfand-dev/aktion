# Aktion Design

A collaborative, Figma-style design tool where every layer on the canvas is a
**live Aktion component**. Draw frames, drop components from the full Aktion
library, tweak props and styles in a schema-driven inspector, group layers,
extract reusable symbols, share projects with teammates, preview interactive
designs, and export to `.aktion` code, standalone HTML, PNG, JPEG, or SVG.

Built with Next.js (App Router), TypeScript, Tailwind, Prisma + Postgres,
Zustand, and the [`aktion-runtime`](https://www.npmjs.com/package/aktion-runtime)
npm package. This app is fully self-contained — it has no source dependency on
the surrounding repository and can be moved to its own repo as-is.

## Features

- **Auth** — email + password accounts (bcrypt-hashed, JWT session cookie,
  rate-limited endpoints, middleware-protected routes).
- **Projects** — create, rename, duplicate, delete; thumbnail cards; search.
- **Sharing** — invite collaborators by email with *can edit* / *view only*
  roles; shared projects appear in their dashboard.
- **Canvas editor** — infinite pan/zoom canvas, multiple pages, frames with
  presets (desktop/tablet/phone/social), marquee selection, drag to move and
  resize frames, drag-and-drop insertion with live drop indicators,
  progressive (Figma-style) click selection, hover highlights, keyboard
  shortcuts, undo/redo, copy/paste, autosave.
- **Free positioning** — drop or drag any component anywhere on a frame
  (Figma semantics): dropping on a layout container joins its flow with an
  insertion indicator; dropping on frame space places it absolutely at the
  pointer. Empty containers (Row, Column, Grid, Card, …) render a dashed
  placeholder so they stay visible and easy to drop into.
- **Resize anything** — every selected component gets 8 resize handles with
  live preview; freely-placed nodes resize their box, flow nodes get `sx`
  width/height.
- **AI Designer** — describe a design (or a change to the selected frame) and
  an OpenRouter-hosted LLM generates it: the model is taught Aktion via the
  published system prompt, its program streams into the panel, is parsed with
  Aktion's own parser, and lands as fully editable layers. ⌘Z undoes any AI
  change. Configure with `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` in `.env`.
- **Layers** — tree view with reorder/reparent drag-and-drop, rename,
  hide/lock, group/ungroup.
- **Symbols** — turn any layer into a reusable symbol; drag instances from
  the panel; detach when needed.
- **The whole Aktion library** — the component palette and the property
  inspector are generated at runtime from Aktion's own `componentSchema()`.
  Add a component to Aktion and it appears here automatically with typed prop
  editors (strings, numbers, booleans, enums, expressions) and an `sx` style
  section.
- **Expressions** — any prop can switch to expression mode (`fx`) and bind to
  live Aktion state (`$atoms`, handlers, `$toast`, …), so designs are
  interactive prototypes.
- **Assets** — upload images (stored in Postgres), drop files straight onto
  the canvas, insert as `Image` components.
- **Preview mode** — full-screen, fully interactive rendering of any frame.
- **Code + export** — view/copy the generated `.aktion` program, download as
  `.aktion` / standalone `.html`, or export frames as PNG / JPEG / SVG.

## Getting started

```bash
cd design
npm install
cp .env.example .env       # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:push            # create tables
npm run dev                # http://localhost:3999
```

Create an account at `/register`, then create a project.

### Environment

| Variable       | Purpose                                             |
| -------------- | --------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string (pooled) used at runtime |
| `DIRECT_URL`   | Non-pooled connection for `prisma db push`          |
| `AUTH_SECRET`  | 32+ byte secret for session JWTs (`openssl rand -hex 32`) |

## Deep Aktion integration

Everything that touches components is driven by the Aktion runtime itself:

- `componentSchema(defaultLibrary)` enumerates every component, prop, type,
  enum, and description → palette + inspector are always in sync with the
  installed runtime.
- Each frame renders in a real `<aktion-app>` element; the editor generates an
  Aktion program per frame (see `src/design/codegen.ts`) with
  `display: contents` wrappers carrying `data-node-id` for hit-testing.
- Preview/export use the clean generated program (no wrappers) — the same code
  you get from the code panel.
- `builtInThemes` powers the project theme picker.

To develop against a **local** Aktion build instead of the npm release:

```bash
npm run sync:aktion -- /path/to/aktion   # copies its dist/ into node_modules
```

New components picked up from the sync appear in the palette immediately —
no design-app code changes required.

## Production notes

- Security headers are set in `next.config.ts`; session cookies are
  `httpOnly` + `secure` in production; auth endpoints are rate-limited;
  all inputs are validated with zod; project access is enforced per-request
  (missing access responds 404 to avoid leaking existence).
- The rate limiter is in-memory (per instance). Behind a multi-instance
  deployment, swap `src/lib/rate-limit.ts` for a Redis-backed implementation.
- Assets are stored as bytes in Postgres for zero-config deployment. For
  heavy usage move them to object storage (S3/R2) and keep the same API
  routes.

### Deploy to Vercel

```bash
npm i -g vercel
vercel                       # from the design/ directory
vercel env add DATABASE_URL  # pooled Neon URL
vercel env add DIRECT_URL    # direct Neon URL
vercel env add AUTH_SECRET
vercel --prod
```

The build runs `prisma generate` automatically (`npm run build`). Run
`npm run db:push` once against the production database.

## Project layout

```
src/
  app/                 # routes: /login /register /projects /editor/[id] /preview/[id] + /api/*
  design/              # THE domain: document model, tree ops, codegen, Aktion schema bridge, presets
  store/editor-store.ts# zustand store: document, selection, camera, history
  components/
    editor/            # canvas, overlays, toolbar, panels, modals
    dashboard/         # project cards, share modal
    ui/                # small dark-UI kit
  lib/                 # db, auth, validation, access control, api client, export pipeline
prisma/schema.prisma   # User, Project, ProjectShare, Asset
```
