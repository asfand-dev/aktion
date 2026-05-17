/**
 * Advanced chat bot — production-grade multi-stage LLM pipeline.
 *
 * Per user prompt the pipeline runs FOUR sequential LLM calls:
 *
 *   1. Intent + persona brief        →  small JSON brief
 *   2. Information architecture      →  JSON blueprint (pages, sections,
 *                                       data schemas, sample records,
 *                                       navigation, KPIs, actions)
 *   3. Brand theme                   →  single `theme = Theme({...})` line
 *   4. Intent-specific UI generator  →  streaming Streaming UI Script
 *
 * After a turn the user can refine it in place — a fifth-style edit call
 * that rewrites the program using the previous code as a starting point.
 *
 * The pipeline covers 14+ intents (dashboard, app, website, landing,
 * storefront, crm, booking, directory, portfolio, docs, form, data-view,
 * profile, chat) so every common professional/industry use case lands in a
 * specialised generator with industry-aware rules and worked examples.
 *
 * Successful generations are auto-saved to a local gallery so each user
 * builds up a personal library of starting points they can re-open, share,
 * download, or take into the playground.
 */

import "../../dist/streaming-ui-script.js";

/* ===========================================================================
   1. Constants
   =========================================================================== */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CDN_BUNDLE = "https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const STORAGE = {
  apiKey: "streaming-ui-script.chat.openrouter-key",
  model: "streaming-ui-script.chat.openrouter-model",
  mock: "streaming-ui-script.chat-advanced.mock",
  industry: "streaming-ui-script.chat-advanced.industry",
  gallery: "streaming-ui-script.chat-advanced.gallery",
};

const GALLERY_LIMIT = 12;

/* ---------------------------------------------------------------------------
   Stage 1 — Intent classifier
   --------------------------------------------------------------------------- */

const INTENT_KEYS = [
  "dashboard", "app", "website", "landing", "storefront",
  "crm", "booking", "directory", "portfolio", "docs",
  "form", "data-view", "profile", "chat", "generic",
];

const INTENT_SYSTEM_PROMPT = `You are a senior product manager classifying a user's "build me X" request for a generative UI system. Your job is to produce a tight JSON brief that downstream stages will use to plan the information architecture, design the brand, and generate the UI.

Return ONLY one JSON object. No markdown, no commentary, no code fences.

Schema:
{
  "intent": ${INTENT_KEYS.map((k) => `"${k}"`).join(" | ")},
  "industry": string,           // domain vertical (e.g. "fintech", "healthcare", "e-commerce", "saas", "education", "hospitality", "real-estate", "legal", "media", "logistics", "gaming", "developer-tools", "non-profit", "government")
  "audience": string,           // primary persona (e.g. "small-business owners", "support agents", "fitness coaches")
  "brand": string,              // explicit brand name if mentioned, otherwise a short style descriptor ("modern", "playful", "minimal", "luxury", "enterprise", "developer")
  "appName": string,            // friendly product/site name to use throughout the UI
  "tagline": string,            // 4–10 word tagline you'd put under the logo
  "purpose": string,            // single-sentence summary of what the UI is for
  "tone": string,               // adjective: "professional", "playful", "minimal", "rich", "editorial", "technical"
  "primaryColorHint": string,   // hex like "#0969da" — best guess for the brand
  "locale": string,             // BCP-47 like "en-US", "en-GB", "de-DE", "fr-FR" — defaults to "en-US"
  "currency": string,           // ISO 4217 like "USD", "EUR", "GBP" — defaults to "USD"
  "needsMockData": boolean,     // true unless the user already provided data
  "refinedPrompt": string       // a polished 3–7 sentence rewrite of the request that an LLM can implement directly. Mention pages, sections, sample fields, layout cues, and tone.
}

Intent rubric (pick the MOST specific that fits):
- "dashboard"  — analytics/admin/reports surface with KPIs, charts, tables, filters
- "app"        — full multi-page SaaS application with sidebar + routes + CRUD
- "website"    — multi-page/multi-section marketing or content site (Home, Pricing, About, Contact)
- "landing"    — single long-scroll marketing page (no Routes)
- "storefront" — e-commerce catalog/product/cart/checkout surface
- "crm"        — customers/contacts/deals/pipeline/relationships management
- "booking"    — appointments, calendar, reservations, scheduling
- "directory"  — searchable listings (jobs, properties, courses, restaurants, members)
- "portfolio"  — personal/agency showcase (work, case studies, about, contact)
- "docs"       — documentation, help center, knowledge base, wiki
- "form"       — signup, contact, multi-step wizard, settings, survey
- "data-view"  — inbox/list+detail (tickets, mail, orders) with split layout
- "profile"    — single-person/team profile or "about" page
- "chat"       — short conversational reply that fits in a single chat bubble
- "generic"    — only when nothing else clearly fits

Industry tips: pick the closest vertical so the downstream stages can seed realistic data. Match locale + currency to the user's market if mentioned (default en-US/USD).`;

/* ---------------------------------------------------------------------------
   Stage 2 — Information architecture blueprint
   --------------------------------------------------------------------------- */

const BLUEPRINT_SYSTEM_PROMPT = `You are a senior product architect. Given a brief, return a STRUCTURED JSON blueprint that lets a Streaming UI Script generator emit a production-grade UI without having to invent the IA or the data model.

Return ONLY a single JSON object. No markdown, no commentary, no fences.

Schema:
{
  "appName": string,
  "tagline": string,
  "pages": [
    {
      "path": string,           // route path: "/", "/dashboard", "/customers", "/customers/:id" (single-page intents use just "/")
      "title": string,          // human-friendly page name (Home, Customers, Settings)
      "icon": string,           // Font Awesome icon name without the "fa-" prefix (e.g. "house", "users", "chart-line")
      "purpose": string,        // 1 sentence what this page is for
      "sections": [string]      // ordered section/component names this page uses ("Hero", "FeatureGrid", "PricingTable", "MetricGrid", "Table", "KanbanBoard", "Timeline", "Form", "Sheet", "EmptyState", "Banner", ...)
    }
  ],
  "navigation": [
    {"label": string, "path": string, "icon": string}
  ],
  "schemas": [
    {
      "name": string,           // PascalCase entity name: Customer, Order, Patient, Reservation, Article
      "fields": [
        {"name": string, "type": "string"|"number"|"date"|"datetime"|"currency"|"percent"|"enum"|"badge"|"url"|"image"|"avatar"|"boolean", "example": string, "values": string[]?}
      ]
    }
  ],
  "sampleData": {
    /* keyed by schema name. 6–15 records per schema (3 for chat intents). */
    [schemaName: string]: object[]
  },
  "kpis": [
    {"label": string, "value": string, "trend": string, "tone": "success"|"warning"|"danger"|"neutral", "icon": string}
  ],
  "primaryActions": [
    {"label": string, "icon": string, "intent": "primary"|"secondary"|"danger"|"ghost"}
  ],
  "filters": [
    {"label": string, "field": string, "options": string[]}
  ],
  "ctaLines": {
    "hero": string?,            // hero headline (for landing/website/portfolio)
    "subhero": string?,
    "primaryCta": string?,      // CTA button label
    "secondaryCta": string?
  },
  "copy": {
    /* short, on-brand microcopy keyed by surface name. */
    [surface: string]: string
  }
}

Rules:
- Tailor every field to the brief's industry, locale, currency, audience, tone.
- Sample data is REALISTIC: real-looking names, dates within the last 12 months, plausible statuses, locale-appropriate addresses and currency formatting.
- Page count by intent:
    landing / data-view / form / profile / chat                   → 1
    dashboard / portfolio / directory / docs / storefront / crm   → 1–5 (with sidebar routing for multi-page)
    app / website                                                 → 4–8
- Schemas:
    Apps and dashboards have 2–4 schemas with 6–15 records each.
    Marketing sites/landings have 1 light schema or omit entirely.
- KPIs only for dashboard / app / crm / storefront intents (4–6 cards).
- Filters only for list/table heavy surfaces.
- Every page must list at least 3 sections.
- Icon names are Font Awesome solid names without "fa-" prefix.
- Currency values must include the ISO code or symbol from the brief.
- Output JSON ONLY.`;

/* ---------------------------------------------------------------------------
   Stage 3 — Theme generator
   --------------------------------------------------------------------------- */

const THEME_SYSTEM_PROMPT = `You are a senior brand designer producing a single Theme({...}) call for Streaming UI Script. Output ONLY ONE LINE of code, starting with \`theme = Theme({\` and ending with \`})\`. No commentary, no markdown, no fences.

Available tokens (use the ones that match the brand; omit the rest):

Surface:
  colorBg, colorBgSubtle, colorSurface, colorSurfaceMuted,
  colorBorder, colorBorderSubtle, colorText, colorTextMuted

Brand & semantic:
  colorPrimary, colorPrimaryHover, colorPrimaryText,
  colorAccent, colorAccentHover, colorAccentText, colorFocusRing,
  colorSuccess, colorWarning, colorDanger, colorInfo

Typography:
  fontFamily, fontFamilyHeading, fontFamilyMono,
  fontSizeBase, fontSizeHeading, fontSizeTitle,
  fontWeightBody, fontWeightHeading,
  lineHeightBody, lineHeightHeading,
  letterSpacingHeading, headingTextTransform

Shape:
  radiusXs, radiusSm, radiusMd, radiusLg, radiusPill,
  radiusButton, radiusInput, borderWidth,
  shadowSm, shadowMd, shadowLg

Spacing:  spacingXs, spacingS, spacingM, spacingL, spacingXl
Buttons:  buttonFontWeight, buttonTextTransform, buttonLetterSpacing, buttonPaddingY, buttonPaddingX
Motion:   transitionDuration
Charts:   chart1, chart2, chart3, chart4, chart5, chart6

Value format: every value is a CSS string. Colors are hex (\`"#0969da"\`) or rgba. Radii are pixel/string values (\`"6px"\`, \`"980px"\`). Weights are quoted numerics (\`"500"\`). Fonts are full quoted CSS font stacks. Use SINGLE quotes inside font strings when you need to nest quotes.

Required tokens (always include at least these): colorPrimary, colorPrimaryHover, colorAccent, colorBg, colorBgSubtle, colorSurface, colorText, colorTextMuted, colorBorder, colorSuccess, colorWarning, colorDanger, fontFamily, fontFamilyHeading, fontSizeBase, radiusButton, radiusMd, shadowMd, buttonFontWeight, chart1, chart2, chart3, chart4.

Rules:
1. Match the palette to the brief's industry, brand, tone (fintech ≠ kids ≠ luxury ≠ developer tools).
2. Primary color must have WCAG-acceptable contrast against colorBg.
3. Font stack must fit the brand: Inter/Sohne/system for tech, Georgia/serif for editorial/luxury, rounded sans for friendly/family products, mono accents for developer tools.
4. Keep radii consistent across the design (do not mix 4px and 24px without intent).
5. Chart palette is 4–6 coherent hues that read well next to each other.
6. Output ONE physical line. No newlines inside the object literal.`;

/* ---------------------------------------------------------------------------
   Stage 5 — Refine (edit existing program)
   --------------------------------------------------------------------------- */

const REFINE_SYSTEM_PROMPT = `You are an expert Streaming UI Script editor. Given the current program and a change request from the user, output the COMPLETE updated program with the change applied.

Hard rules:
- Output ONLY Streaming UI Script. No markdown, no fences, no commentary.
- Output the COMPLETE program (not a diff, not just the changed lines).
- Preserve the existing \`theme = Theme({...})\` line at the very top unless the user explicitly asks to change the theme.
- Preserve every component/binding the user did NOT mention. Carry their definitions through unchanged.
- Preserve sample data unless the user asks to change it. Mock data realism matters — keep it consistent.
- Carry routing/state ($state variables) through unchanged unless the user asks to change them.
- Every statement on its own line. Order: \`theme = ...\` (if present), \`root = ...\`, then named definitions, then leaf data values last.
- If the user asks for a completely different page, you may rewrite the program — but keep the same theme line and the same brand identity unless told otherwise.`;

/* ---------------------------------------------------------------------------
   Stage 4 — Intent-specific UI generators
   --------------------------------------------------------------------------- */

/**
 * Shared rules every intent inherits. Things every production-grade UI MUST
 * have, regardless of intent.
 */
const SHARED_PRODUCTION_RULES = [
  "PRODUCTION QUALITY — the generated UI must be ready to host as a real product, not a demo. Real microcopy, plausible mock data, working interactions, polished typography and spacing.",
  "ACCESSIBILITY — every Input/Select/TextArea has a label via `FormControl(...)`. Every Image carries an alt sentence. Icon-only buttons get an aria-label-style `tooltip` prop where the component supports one. Never use color alone to convey state — pair with text/icon.",
  "RESPONSIVE BY DEFAULT — prefer **responsive prop maps** on layout components: `Grid(items, {sm: 1, md: 2, lg: 4}, \"l\")` and `Stack(children, {sm: \"column\", md: \"row\"}, \"m\")`. Wrap reading surfaces in `Container(content, 'lg'|'md')`. Tables are horizontally scrollable.",
  "WORKING INTERACTIONS — every visible button has an `Action([...])` (or routes via `@Navigate`). Forms submit into `$state`. No dead buttons. Use `Script(\"id\", body)` for derived/computed values.",
  "REAL COPY — never write Lorem Ipsum. Hero headlines, feature descriptions, testimonials, sample table rows are believable and on-brand for the industry.",
  "ICONS — every `StatCard`/`FeatureItem`/`Banner`/`Tile`/`SidebarItem` carries a Font Awesome icon name (no `fa-` prefix). Status conveyed via `Badge`/`Tag`/`StatusDot`.",
  "DENSITY — match the page-type minimum: dashboards 6+ sections, app pages 5+, marketing pages 5+. A single Card is never enough for a page-shaped request.",
  "FOLLOW-UPS — end the response with a `FollowUpBlock` of 3–4 short prompts the user can click to iterate (e.g. \"Add a pricing page\", \"Switch to dark mode\", \"Translate to Spanish\").",
  // Modern-language nudges (these prevent the LLM from emitting verbose, hard-to-stream patterns).
  "PERSIST USER PREFERENCES — anything the user expects to find again after a reload (`$$theme`, `$$sidebarCollapsed`, `$$lastRoute`, `$$selectedId`, `$$cart`, `$$sort`, draft form values) uses the `$$variable` sigil so it survives via `localStorage`. Same read/write surface as `$`.",
  "LAZY CONTROL FLOW — replace nested ternaries with `@Switch(value, {key1: branch1, key2: branch2}, default)` for tabs/views, and `@If(cond, then, else?)` for empty states. Branches are evaluated lazily so loop variables stay safe.",
  "TEMPLATE LITERALS — any string that mixes copy with values uses backtick interpolation: `` `${@Count(rows)} ${@Plural(@Count(rows), \"order\", \"orders\")} · ${@FormatCurrency(@Sum(rows.total), \"USD\")}` ``. Never write `\"…\" + … + \"…\"` concatenation.",
  "MACROS FOR REPEATED CARDS/ROWS — define once, call many times. Example: `RowCard(p) = Card([Avatar(p.name), TextContent(p.role)])` then `@Each($people, \"p\", RowCard(p))`. Macros are the cleanest way to keep a list of cards visually consistent.",
  "DESTRUCTURE LOOP VARS — `@Each($users, \"{id, name, role}\", row)` exposes fields directly inside `row`, no `u.` prefix. Use it whenever a row template touches 2+ fields.",
  "FORMATTING BUILTINS — use `@FormatCurrency(n, code)`, `@FormatNumber(n)`, `@FormatDate(d, mode)`, `@Plural(n, sing, pl)`, `@Titlecase(s)`/`@Uppercase(s)` to keep numbers/dates/text locale-friendly and consistent.",
];

const INTENT_GENERATORS = {

  dashboard: {
    label: "Dashboard",
    icon: "gauge-high",
    description: "Analytics surface with KPIs, charts, tables, and filters.",
    suggestions: [
      "Sales dashboard for a coffee subscription brand",
      "Fitness tracker dashboard with weekly stats",
      "Server monitoring dashboard with alerts",
      "Marketing campaign analytics dashboard",
    ],
    preamble:
      "You are a generative UI designer producing a single rich, production-grade analytics dashboard in Streaming UI Script. The reply MUST be a complete dashboard surface — not a single Card and not a chat bubble.",
    rules: [
      "DASHBOARD MODE — open with a `PageHeader` (title + subtitle + 1–2 status `Badge`/`Tag` + 1–3 action `Button`s).",
      "Compose 6+ named sections: `PageHeader`, `Toolbar` (with `SearchBar` + filter chips + date range), `MetricGrid` of 4–6 `StatCard`s with trend deltas and icons, a primary chart (`LineChart`/`BarChart`), a secondary chart or `KanbanBoard`, a `Table` of recent records, a side `List`/`Timeline` of activity, and a final `FollowUpBlock`.",
      "Wire toolbar filters: each filter chip uses `Action([@Set(\"$filter\", \"value\")])`. Use `Script(\"id\", body, deps)` for derived totals/filtered lists where useful.",
      "Use the blueprint's KPI values verbatim. Use the blueprint's primary chart series names. Pull table rows from the blueprint's sample data.",
      "Currency, dates, and units follow the brief's locale/currency.",
    ],
    examples: [],
  },

  app: {
    label: "App",
    icon: "shapes",
    description: "Full multi-page SaaS application with sidebar, routes, and CRUD.",
    suggestions: [
      "CRM with contacts, deals, and a pipeline",
      "Project management app with kanban + analytics",
      "Mini e-commerce admin (products, orders, customers)",
      "Clinic appointment manager (calendar, patients, billing)",
    ],
    preamble:
      "You are a generative full-stack app builder. Produce a complete, working multi-page application in Streaming UI Script with reactive state, working CRUD, and rich SaaS-quality UI. Match the design quality of shadcn/Tailwind apps.",
    rules: [
      "APP MODE — assign `root` to an `AppShell(sidebar, mainOutlet)`. Never reply with a single Card.",
      "Sidebar has logical `SidebarSection`s, 4–8 `SidebarItem`s with icons + paths, and a `PersonChip` user widget at the bottom.",
      "`mainOutlet = Routes([Route(...), ...], firstPath)`. Every navigation item MUST resolve to a real, substantive page (PageHeader + 4+ sections).",
      "Every page: `PageHeader`, KPIs (`MetricGrid`), data view (`Table`/`KanbanBoard`/`Timeline`/`List`/`Tree`), toolbar (`Toolbar`/`SearchBar`/filter chips), at least one working action button (Create / Edit / Delete / Status change), and an `EmptyState` for empty lists.",
      "MOCK DATA from the blueprint goes into top-level `$state` variables. Pages read from `$state.<schema>` so changes propagate live. Wire CRUD with `@Set` / `@Push` / `@Pop` / `@Reset` / `@Js`.",
      "Include a working settings page with a Form. Include a 404 fallback `Route(\"*\", notFoundPage)`.",
      "Decorate with `Badge`/`StatusDot`/`Avatar`/`PersonChip`/`Tag` everywhere people, status, or categories appear.",
    ],
    examples: [],
  },

  website: {
    label: "Website",
    icon: "globe",
    description: "Multi-section marketing or content website (Home, Pricing, About…).",
    suggestions: [
      "SaaS marketing site for an AI startup",
      "Restaurant marketing site with menu and reservations",
      "Online course landing pages",
      "Local business marketing site (clinic, salon, gym)",
    ],
    preamble:
      "You are a generative web designer producing a complete, modern, production-quality website in Streaming UI Script. The response must look and feel like a real, polished marketing or content site — not a single card.",
    rules: [
      "WEBSITE MODE — lead with `Navbar` (logo + 3–6 `NavLink`s + a CTA `Button`) and end with a footer `Stack` (brand line, 2–3 link columns, copyright + social).",
      "If the blueprint declares more than one page, wire them with `Routes([Route(...), ...], \"/\")` and matching `NavLink` items. Each page is 3+ sections drawn from: `Hero`, `Cover`, `FeatureGrid`, `MediaCard`, `PricingTable`, `Testimonial`, `Stats`, `Timeline`, `Banner`, `EmptyState`, custom `Section`/`Card`.",
      "Wrap each section's content in `Container(content, 'lg'|'md')` so wide screens do not stretch reading content edge-to-edge.",
      "Use real, on-brand microcopy from the blueprint's `copy`/`ctaLines`. Never write Lorem Ipsum.",
      "Pair text-heavy sections with plausible `Image` URLs (https://images.unsplash.com/photo-... or https://picsum.photos/seed/<slug>/1200/800) and alt text.",
      "Always include a final `Section` (or `Banner`) CTA above the footer.",
    ],
    examples: [],
  },

  landing: {
    label: "Landing page",
    icon: "rocket",
    description: "Single long-scroll marketing page (Hero + Features + Pricing + CTA).",
    suggestions: [
      "Landing page for a mobile productivity app",
      "Landing page for a developer tool that ships in seconds",
      "Landing page for an indie hardware product",
      "Landing page for a community newsletter",
    ],
    preamble:
      "You are a generative web designer producing a SINGLE long-scroll landing page in Streaming UI Script. The page must be polished, on-brand, and ready to ship.",
    rules: [
      "LANDING MODE — assign `root` to a vertical `Stack` of full-width sections. Never use Routes.",
      "Required section order: `Navbar`, `Hero` (with the blueprint's hero headline + subhero + primaryCta + image), trust strip (`Stats` or logo row), `FeatureGrid` (3–6 items with icons), one `MediaCard` or `Cover` deep-dive, `PricingTable` (2–3 plans from the blueprint), `Testimonial` row, FAQ via `Accordion`, final `Banner` CTA, footer.",
      "Wrap every section in `Container(content, 'lg')`. Real microcopy only. Icons on every FeatureItem and StatCard.",
      "Pair the Hero with a plausible product image URL. Pair testimonials with a name + role + avatar.",
      "End with a `FollowUpBlock` outside the footer (\"Add a video section\", \"Translate to Spanish\", \"Show the dark version\").",
    ],
    examples: [],
  },

  storefront: {
    label: "Storefront",
    icon: "cart-shopping",
    description: "E-commerce catalog/product/cart surface.",
    suggestions: [
      "Online store for a coffee subscription brand",
      "Vintage record shop catalog",
      "Indie clothing store with new arrivals + sale section",
      "Specialty tea shop with subscription tiers",
    ],
    preamble:
      "You are a generative web designer producing a complete e-commerce storefront in Streaming UI Script. The response must feel like a real shop — products with prices, ratings, add-to-cart buttons, and a cart sheet.",
    rules: [
      "STOREFRONT MODE — top: `Navbar` (logo + category links + cart icon button). Hero promo `Banner`. Section: `FeatureGrid` of trust badges (free shipping, returns, support).",
      "Products grid: `Grid` of 6–12 `MediaCard`s. Each card uses a plausible product image, name, price (from blueprint sample data), `Rating`, and an Add-to-cart `Button` wired with `Action([@Push(\"$cart\", productId)])`.",
      "Side cart: define a `Sheet` (or `Drawer`-style Card) bound to `$cart` showing the current cart line items, subtotal, and a Checkout `Button`.",
      "Include a `Filters` strip (category, price range, size) wired to `$filter` and reflected via `Script(\"id\", body)` derivations.",
      "Footer: payment methods row + newsletter signup `Form` + link columns.",
    ],
    examples: [],
  },

  crm: {
    label: "CRM",
    icon: "handshake",
    description: "Customer/contacts/deals/pipeline management.",
    suggestions: [
      "CRM for a real-estate agency",
      "Sales pipeline tool for a B2B SaaS team",
      "Customer-success workspace with health scores",
      "Recruiting CRM with candidate pipeline",
    ],
    preamble:
      "You are a generative app builder producing a complete CRM workspace in Streaming UI Script. The response must feel like a real sales/customer-success product.",
    rules: [
      "CRM MODE — `AppShell(sidebar, mainOutlet)`. Sidebar sections: Workspace (Contacts, Companies, Deals, Pipeline) and Insights (Reports, Settings).",
      "Pages from the blueprint, each route a real page. Contacts page: KPIs + Toolbar + `Table` of contacts with `Badge` status + Avatar. Deals page: `KanbanBoard` with stage columns and `KanbanCard` per deal.",
      "Use the blueprint's sample contacts and deals verbatim. Avatars are `Avatar` with a placeholder URL or icon.",
      "Every row supports actions (Open, Edit, Move stage, Convert). Wire with `@Set` / `@Push` / `@Js`.",
      "Detail `Sheet` opens on row click via `@Set(\"$selectedId\", row.id)` with `Script(\"id\", body)` selecting the record.",
    ],
    examples: [],
  },

  booking: {
    label: "Booking",
    icon: "calendar-check",
    description: "Calendar, appointments, reservations, scheduling.",
    suggestions: [
      "Hair salon appointment booking",
      "Doctor's office reservation system",
      "Tutoring scheduler with weekly slots",
      "Co-working room booking dashboard",
    ],
    preamble:
      "You are a generative app builder producing a booking/scheduling surface in Streaming UI Script. The response must feel like a real reservation tool.",
    rules: [
      "BOOKING MODE — top: `PageHeader` (business name + tagline + a 'Today' status `Badge`).",
      "Layout: `SplitView` (calendar/list on the left, detail/booking form on the right) or `Stack` (calendar then list then form on small screens).",
      "Calendar: `DatePicker` bound to `$date`. Slot list under it pulled from blueprint sample data — each slot shows time + service + practitioner + `Badge` status (Open / Booked / Tentative).",
      "Booking form (`Form`): name, email/phone, service (`Select`), date/time (read from `$date`/$selectedSlot), notes (`TextArea`), Submit (`@Set` into `$bookings` + success `Note`).",
      "Side panel: `MetricGrid` of today/this-week stats (Bookings, Revenue, Cancellations, Capacity).",
    ],
    examples: [],
  },

  directory: {
    label: "Directory",
    icon: "magnifying-glass",
    description: "Searchable listings (jobs, properties, courses, members, restaurants).",
    suggestions: [
      "Job board for remote engineering roles",
      "Real-estate listings for rentals in Berlin",
      "Online course directory for designers",
      "Restaurant directory with filters by cuisine",
    ],
    preamble:
      "You are a generative web designer producing a searchable directory in Streaming UI Script. The response must feel like a real catalogue site (Indeed, Zillow, Coursera, Yelp).",
    rules: [
      "DIRECTORY MODE — top: `PageHeader` + a prominent `SearchBar` bound to `$q`. Below: filter strip (`Toolbar` with `Select`/`Chip`-style filters bound to `$filters.*`).",
      "Results grid: `Grid` of `MediaCard` or `Tile` items pulled from the blueprint's sample listings. Each item shows title, summary, key fields (price/location/rating), 1–2 `Badge`s, and an Open action.",
      "Open action routes to a detail page (if blueprint allows) or opens a `Sheet`. Detail panel: cover image, `DescriptionList` of attributes, related items, and an `Action` button (Apply / Contact / Book / Enroll).",
      "Use the blueprint's filter list and sample data verbatim. Empty-state when no results.",
    ],
    examples: [],
  },

  portfolio: {
    label: "Portfolio",
    icon: "user-pen",
    description: "Personal or agency showcase (work, case studies, about, contact).",
    suggestions: [
      "Designer portfolio with case studies",
      "Photographer portfolio with project grid",
      "Small studio agency website",
      "Engineer portfolio with projects + writing",
    ],
    preamble:
      "You are a generative web designer producing a personal/agency portfolio in Streaming UI Script. The response must feel like a polished personal site (Bonfire, Cargo, Read.cv).",
    rules: [
      "PORTFOLIO MODE — `Navbar` with logo + 3–4 NavLinks (Home, Work, About, Contact). If single-page, use anchor `Link`s instead of Routes.",
      "Home/Hero: `Hero` with the person's name + role + intro + a primary CTA (View work / Contact me).",
      "Work section: `Grid` of `MediaCard` case studies pulled from sample data. Each card: cover image (use Unsplash/picsum), title, role, year, tags as `Badge`s.",
      "About section: `Stack` row with avatar `Image` + bio `TextContent` + `Stats` (years of experience, projects shipped, clients).",
      "Contact section: simple `Form` (Name, Email, Message) with a Submit `Button` and a `Note` confirmation.",
    ],
    examples: [],
  },

  docs: {
    label: "Docs",
    icon: "book",
    description: "Documentation, help center, or knowledge base.",
    suggestions: [
      "Help center for a SaaS product",
      "API documentation with code snippets",
      "Knowledge base for an internal team",
      "Wiki for a community project",
    ],
    preamble:
      "You are a generative web designer producing a documentation/help-center surface in Streaming UI Script. The response must feel like a real docs site (Vercel docs, Stripe docs, Linear docs).",
    rules: [
      "DOCS MODE — `SplitView(sidebar, article)` or `AppShell(sidebar, mainOutlet)` if routed.",
      "Sidebar: `SearchBar` + `Tree` of categories/articles from the blueprint. Highlight active item via state.",
      "Article body: `Container(content, 'md')` with a `Breadcrumb`, `PageHeader` (article title + updated date), `Markdown` rich text body, code blocks via `CodeBlock`, callouts via `Note`/`Callout`, screenshots via `Image` with captions.",
      "Article footer: 'Was this helpful?' `Rating` + related-articles list + `Edit on GitHub` link.",
      "Use the blueprint's article tree and sample copy verbatim.",
    ],
    examples: [],
  },

  form: {
    label: "Form / wizard",
    icon: "list-check",
    description: "Signup, contact, multi-step wizard, settings, survey.",
    suggestions: [
      "Multi-step onboarding wizard for a banking app",
      "Conference registration form with attendee preferences",
      "Account settings page with tabs",
      "Patient intake survey for a clinic",
    ],
    preamble:
      "You are a generative UI designer producing a polished form/wizard surface in Streaming UI Script. The screen must feel like a real settings/onboarding flow.",
    rules: [
      "FORM MODE — open with a `PageHeader` (title + subtitle). Place the form inside a `Card`.",
      "Multi-step forms use `Steps([StepsItem(...)])` bound to `$step` with prev/next buttons that `@Set(\"$step\", n)`.",
      "Define ONE `FormControl` reference per field so each control streams in progressively. Use the right input type per field (Input email/password/number, Select, TextArea, Checkbox, Switch, RadioGroup).",
      "Sections use `SectionHeader` or separate `Card`s with clear titles. Group related toggles with `Tabs` if the form covers different concerns.",
      "Submit button wires `Action([@Set(...), @ToAssistant(\"Submitted: ...\")])`. Show a success `Note` or `Alert` after submit.",
      "Pull placeholder text and sample defaults from the blueprint.",
    ],
    examples: [],
  },

  "data-view": {
    label: "Data view",
    icon: "table",
    description: "List + detail view with filters, search, and an inline detail panel.",
    suggestions: [
      "Support tickets list with a detail pane",
      "Orders table with filters and a side detail sheet",
      "Hotel bookings list with map and detail view",
      "Open positions list grouped by team",
    ],
    preamble:
      "You are a generative UI designer producing a list/detail data surface in Streaming UI Script. Build something that feels like the data screen of a real product (Linear, Notion, Stripe).",
    rules: [
      "DATA-VIEW MODE — root is `SplitView(list, detail)` (or `Stack` with `Toolbar` + `Table` + `Sheet` on small screens).",
      "Open with a `PageHeader` above the split. List toolbar: `SearchBar` + 2–3 filter chips + a sort `Select` bound to `$sort`.",
      "List body: `Table` (one `Col` per field) OR `List` of `ListItem`s. 8–20 rows from blueprint sample data. Each row click sets `$selectedId` via `Action([@Set])`.",
      "Detail: `Card` with `CardHeader`, `DescriptionList` of attributes, supporting content (timeline, attachments, related items), and action buttons (Reply / Resolve / Assign).",
      "Empty-state when nothing selected. Use `Script(\"id\", body)` to derive `$selected` from `$selectedId`.",
    ],
    examples: [],
  },

  profile: {
    label: "Profile",
    icon: "id-card",
    description: "Personal or team profile / about page.",
    suggestions: [
      "Profile page for a freelance illustrator",
      "Team profile for a 6-person startup",
      "Speaker profile for a conference",
      "Public profile for a developer",
    ],
    preamble:
      "You are a generative web designer producing a single profile/about page in Streaming UI Script. The response must feel like a polished public profile (read.cv, Twitter/X profile, GitHub profile).",
    rules: [
      "PROFILE MODE — cover image (Image URL) + `Avatar` + name + role + a one-line bio.",
      "`Stats` strip with 3–5 numbers (projects, years of experience, followers, repos, articles).",
      "`Section`s: About (TextContent), Work / Projects (`Grid` of `MediaCard`s from blueprint), Skills (`Tag`/`Badge` row), Recent activity (`Timeline`), Contact (`Form` or contact links).",
      "Wrap everything in `Container(content, 'md')`.",
    ],
    examples: [],
  },

  chat: {
    label: "Chat reply",
    icon: "comments",
    description: "Short conversational reply that fits in a single chat bubble.",
    suggestions: [
      "Reply with a feature comparison table",
      "Reply with a small chart of monthly sales",
      "Reply with a Yes/No follow-up suggestion list",
      "Reply explaining a concept in 3 bullet points",
    ],
    preamble:
      "You are an AI chat assistant. Respond using Streaming UI Script — a small, focused reply that fits inside a single chat bubble. No app shells, no routes, no sidebars.",
    rules: [
      "CHAT MODE — keep the reply to ONE `Stack` with at most 3–4 visible children: a heading, the main artefact (table/chart/list/form), and a `FollowUpBlock` of 2–4 short prompts.",
      "No `AppShell`, `Sidebar`, `Routes`, `Navbar`, or `PageHeader`. No `Hero`. No multi-section dashboards.",
      "Pick the component that best fits the content: `Table` for comparisons, `LineChart`/`BarChart`/`PieChart` for trends, `List` for tips, `Form` for input, `Card` for explanations.",
    ],
    examples: [],
  },

  generic: {
    label: "Generic UI",
    icon: "shapes",
    description: "Mid-size UI surface that does not fit any specific intent.",
    suggestions: [
      "Show me a profile card for a designer",
      "Build a small notification feed",
      "Show a settings card with two toggles",
      "Build a comparison block of three plans",
    ],
    preamble:
      "You are a generative UI designer producing a polished UI surface in Streaming UI Script. Match the design quality of shadcn/Tailwind apps.",
    rules: [
      "GENERIC MODE — compose a tight, focused surface. Use `PageHeader` only if the request implies a full page; otherwise lead with a `Card` or `SectionHeader`.",
      "Include at least one icon, one piece of structure (Table/List/Stack), and a `FollowUpBlock` of 2–4 short prompts.",
      "Real, plausible mock data only — never placeholder text.",
    ],
    examples: [],
  },
};

/* Suggestions shown in the welcome screen (mixed intents covering many industries). */
const WELCOME_SUGGESTIONS = [
  { icon: "gauge-high",       title: "Sales dashboard for a coffee subscription brand",       intent: "dashboard"  },
  { icon: "shapes",           title: "CRM app for a B2B SaaS sales team",                     intent: "crm"        },
  { icon: "globe",            title: "Marketing site for an AI legal copilot",                intent: "website"    },
  { icon: "rocket",           title: "Landing page for a mindful-running watch",              intent: "landing"    },
  { icon: "cart-shopping",    title: "Online store for a specialty tea brand",                intent: "storefront" },
  { icon: "calendar-check",   title: "Hair salon appointment booking app",                    intent: "booking"    },
  { icon: "magnifying-glass", title: "Job board for remote engineering roles",                intent: "directory"  },
  { icon: "book",             title: "Help center for a no-code SaaS product",                intent: "docs"       },
  { icon: "user-pen",         title: "Portfolio for an independent product designer",         intent: "portfolio"  },
  { icon: "list-check",       title: "Onboarding wizard for a fintech savings app",           intent: "form"       },
  { icon: "table",            title: "Inbox-style support tickets with a detail pane",        intent: "data-view"  },
  { icon: "id-card",          title: "Public profile page for a freelance illustrator",       intent: "profile"    },
];

/* ===========================================================================
   2. Share-link codec (compatible with playground's #code= / ?code=)
   =========================================================================== */

async function encodeShare(text) {
  const bytes = new TextEncoder().encode(text);
  let compressed = bytes;
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* fall through to raw bytes */ }
  }
  return btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ===========================================================================
   3. Settings + persistence
   =========================================================================== */

const settings = {
  get apiKey() { return localStorage.getItem(STORAGE.apiKey) || ""; },
  set apiKey(v) { localStorage.setItem(STORAGE.apiKey, v); },
  get model() { return localStorage.getItem(STORAGE.model) || DEFAULT_MODEL; },
  set model(v) { localStorage.setItem(STORAGE.model, v); },
  get useMockData() {
    const raw = localStorage.getItem(STORAGE.mock);
    return raw == null ? true : raw === "true";
  },
  set useMockData(v) { localStorage.setItem(STORAGE.mock, v ? "true" : "false"); },
  get industryHint() { return localStorage.getItem(STORAGE.industry) || ""; },
  set industryHint(v) { localStorage.setItem(STORAGE.industry, v || ""); },
  get gallery() {
    try { return JSON.parse(localStorage.getItem(STORAGE.gallery) || "[]"); }
    catch { return []; }
  },
  set gallery(v) {
    try { localStorage.setItem(STORAGE.gallery, JSON.stringify(v || [])); }
    catch { /* quota exceeded — silently drop */ }
  },
  saveToGallery(entry) {
    const list = this.gallery;
    list.unshift(entry);
    this.gallery = list.slice(0, GALLERY_LIMIT);
  },
  removeFromGallery(id) {
    this.gallery = this.gallery.filter((g) => g.id !== id);
  },
  clearGallery() {
    this.gallery = [];
  },
  clearKey() {
    localStorage.removeItem(STORAGE.apiKey);
  },
};

/* ===========================================================================
   4. DOM refs
   =========================================================================== */

const $ = (id) => document.getElementById(id);

const els = {
  setup:          $("cb-setup"),
  setupForm:      $("cba-setup-form"),
  setupKey:       $("cba-setup-key"),
  setupModel:     $("cba-setup-model"),
  setupErr:       $("cba-setup-error"),
  setupReveal:    $("cba-setup-reveal"),
  chat:           $("cba-chat"),
  model:          $("cba-model"),
  newChat:        $("cba-new-chat"),
  settingsBtn:    $("cba-settings"),
  stage:          $("cba-stage"),
  welcome:        $("cba-welcome"),
  suggestions:    $("cba-suggestions"),
  gallery:        $("cba-gallery"),
  history:        $("cba-history"),
  composer:       $("cba-composer"),
  input:          $("cba-input"),
  send:           $("cba-send"),
  stop:           $("cba-stop"),
  drawer:         $("cba-drawer"),
  drawerBackdrop: $("cba-drawer-backdrop"),
  drawerClose:    $("cba-drawer-close"),
  drawerKey:      $("cba-drawer-key"),
  drawerReveal:   $("cba-drawer-reveal"),
  drawerModel:    $("cba-drawer-model"),
  drawerMock:     $("cba-drawer-mock"),
  drawerIndustry: $("cba-drawer-industry"),
  drawerReset:    $("cba-drawer-reset"),
  drawerGallery:  $("cba-drawer-gallery"),
  toast:          $("cba-toast"),
};

/* ===========================================================================
   5. App state
   =========================================================================== */

let inFlight = null; // AbortController for the active pipeline run

/* ===========================================================================
   6. Boot
   =========================================================================== */

function boot() {
  hydrateUiFromSettings();
  wireEvents();
  renderSuggestions();
  renderGallery();

  if (settings.apiKey) {
    showChat();
  } else {
    showSetup();
  }
}

function hydrateUiFromSettings() {
  document.body.dataset.mode = "app"; // green→cyan→indigo accent
  ensureSelectOption(els.model, settings.model);
  els.model.value = settings.model;

  els.drawerKey.value = settings.apiKey;
  els.drawerModel.value = settings.model;
  els.drawerMock.checked = settings.useMockData;
  if (els.drawerIndustry) els.drawerIndustry.value = settings.industryHint;

  els.setupKey.value = settings.apiKey;
  els.setupModel.value = settings.model;
}

function showSetup() {
  els.setup.hidden = false;
  els.chat.hidden = true;
  els.setupKey.focus();
}

function showChat() {
  els.setup.hidden = true;
  els.chat.hidden = false;
  toggleWelcome(els.history.children.length === 0);
  setTimeout(() => els.input?.focus(), 30);
}

function ensureSelectOption(select, value) {
  if (!value) return;
  for (const opt of select.options) {
    if (opt.value === value) return;
  }
  const opt = new Option(value, value);
  select.add(opt);
}

/* ===========================================================================
   7. Wiring
   =========================================================================== */

function wireEvents() {
  els.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = els.setupKey.value.trim();
    const model = els.setupModel.value.trim() || DEFAULT_MODEL;
    if (!key) {
      els.setupErr.textContent = "An API key is required to start.";
      els.setupErr.hidden = false;
      return;
    }
    settings.apiKey = key;
    settings.model = model;
    ensureSelectOption(els.model, model);
    els.model.value = model;
    els.drawerKey.value = key;
    els.drawerModel.value = model;
    showChat();
  });

  els.setupReveal.addEventListener("click", () =>
    togglePasswordVisibility(els.setupKey, els.setupReveal),
  );
  els.drawerReveal.addEventListener("click", () =>
    togglePasswordVisibility(els.drawerKey, els.drawerReveal),
  );

  els.model.addEventListener("change", (e) => {
    settings.model = e.target.value;
    els.drawerModel.value = e.target.value;
  });

  els.newChat.addEventListener("click", () => resetConversation());

  els.settingsBtn.addEventListener("click", () => openDrawer());
  els.drawerClose.addEventListener("click", () => closeDrawer());
  els.drawerBackdrop.addEventListener("click", () => closeDrawer());

  els.drawerKey.addEventListener("change", () => {
    const v = els.drawerKey.value.trim();
    if (v) settings.apiKey = v;
  });
  els.drawerModel.addEventListener("change", () => {
    const v = els.drawerModel.value.trim();
    if (v) {
      settings.model = v;
      ensureSelectOption(els.model, v);
      els.model.value = v;
    }
  });
  els.drawerMock.addEventListener("change", () => {
    settings.useMockData = els.drawerMock.checked;
  });
  if (els.drawerIndustry) {
    els.drawerIndustry.addEventListener("change", () => {
      settings.industryHint = els.drawerIndustry.value.trim();
    });
  }
  els.drawerReset.addEventListener("click", () => {
    if (inFlight) inFlight.abort();
    settings.clearKey();
    resetConversation();
    closeDrawer();
    showSetup();
    showToast("API key cleared", "trash");
  });
  if (els.drawerGallery) {
    els.drawerGallery.addEventListener("click", () => {
      if (!confirm("Clear all saved generations from this browser?")) return;
      settings.clearGallery();
      renderGallery();
      showToast("Saved generations cleared", "trash");
    });
  }

  els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.input.value;
    if (!text.trim() || els.send.disabled) return;
    els.input.value = "";
    resizeInput();
    runPipeline(text);
  });

  els.input.addEventListener("input", resizeInput);
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      els.composer.requestSubmit();
    }
    if (event.key === "Escape" && inFlight) {
      inFlight.abort();
    }
  });

  els.stop.addEventListener("click", () => {
    if (inFlight) inFlight.abort();
  });

  els.suggestions.addEventListener("click", (e) => {
    const btn = e.target.closest(".cb-suggestion");
    if (!btn) return;
    runPipeline(btn.dataset.prompt || btn.textContent || "");
  });

  if (els.gallery) {
    els.gallery.addEventListener("click", (e) => {
      const card = e.target.closest("[data-gallery-action]");
      if (!card) return;
      const action = card.dataset.galleryAction;
      const id = card.dataset.galleryId;
      const entry = settings.gallery.find((g) => g.id === id);
      if (!entry) return;
      if (action === "open-playground") {
        openInPlayground(entry.source);
      } else if (action === "download") {
        downloadHtml(entry.source, entry.intentLabel || "Generated UI");
      } else if (action === "rebuild") {
        runPipeline(entry.prompt);
      } else if (action === "remove") {
        settings.removeFromGallery(id);
        renderGallery();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.drawer.dataset.open === "true") {
      closeDrawer();
    }
  });
}

/* ===========================================================================
   8. Suggestions + gallery rendering
   =========================================================================== */

function renderSuggestions() {
  els.suggestions.innerHTML = "";
  for (const item of WELCOME_SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cb-suggestion";
    btn.dataset.prompt = item.title;
    const intentLabel = INTENT_GENERATORS[item.intent]?.label || item.intent;
    btn.innerHTML = `
      <span class="cb-suggestion-title"><i class="fa-solid fa-${escapeAttr(item.icon)}"></i> ${escapeHtml(item.title)}</span>
      <span class="cb-suggestion-desc"><i class="fa-solid fa-diagram-project"></i> ${escapeHtml(intentLabel)} pipeline</span>
    `;
    els.suggestions.append(btn);
  }
}

function renderGallery() {
  if (!els.gallery) return;
  const items = settings.gallery;
  els.gallery.replaceChildren();
  if (items.length === 0) {
    els.gallery.hidden = true;
    return;
  }
  els.gallery.hidden = false;
  const head = el("div", { class: "cba-gallery-head" },
    el("span", { class: "cba-gallery-title" },
      el("i", { class: "fa-solid fa-folder-open", "aria-hidden": "true" }),
      " Your recent generations",
    ),
    el("span", { class: "cba-gallery-meta" },
      String(items.length), " of ", String(GALLERY_LIMIT),
    ),
  );
  els.gallery.append(head);
  const grid = el("div", { class: "cba-gallery-grid" });
  for (const entry of items) {
    const swatchRow = el("span", { class: "cba-gallery-swatches" });
    for (const color of (entry.swatches || []).slice(0, 5)) {
      swatchRow.append(el("span", { class: "cba-gallery-swatch", style: `background:${color}` }));
    }
    const card = el("article", { class: "cba-gallery-card" });
    const meta = el("div", { class: "cba-gallery-card-meta" },
      el("span", { class: "cba-gallery-pill" },
        el("i", { class: `fa-solid fa-${entry.intentIcon || "shapes"}`, "aria-hidden": "true" }),
        " ", entry.intentLabel || "UI",
      ),
      swatchRow,
    );
    const title = el("h4", { class: "cba-gallery-card-title" }, entry.appName || entry.prompt || "Generated UI");
    const prompt = el("p", { class: "cba-gallery-card-prompt" }, entry.prompt || "");
    const actions = el("div", { class: "cba-gallery-card-actions" },
      el("button", { type: "button", class: "cba-gallery-btn", "data-gallery-action": "open-playground", "data-gallery-id": entry.id, title: "Open in playground" },
        el("i", { class: "fa-solid fa-flask", "aria-hidden": "true" }), " Playground",
      ),
      el("button", { type: "button", class: "cba-gallery-btn", "data-gallery-action": "download", "data-gallery-id": entry.id, title: "Download as HTML" },
        el("i", { class: "fa-solid fa-download", "aria-hidden": "true" }), " HTML",
      ),
      el("button", { type: "button", class: "cba-gallery-btn", "data-gallery-action": "rebuild", "data-gallery-id": entry.id, title: "Regenerate from this prompt" },
        el("i", { class: "fa-solid fa-rotate", "aria-hidden": "true" }), " Rebuild",
      ),
      el("button", { type: "button", class: "cba-gallery-btn cba-gallery-btn--danger", "data-gallery-action": "remove", "data-gallery-id": entry.id, title: "Remove" },
        el("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }),
      ),
    );
    card.append(meta, title, prompt, actions);
    grid.append(card);
  }
  els.gallery.append(grid);
}

/* ===========================================================================
   9. Pipeline orchestration
   =========================================================================== */

function resetConversation() {
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  els.history.replaceChildren();
  toggleWelcome(true);
  setBusy(false);
  renderGallery();
  els.input.focus();
}

function toggleWelcome(show) {
  els.welcome.hidden = !show;
}

function setBusy(busy) {
  els.send.disabled = busy;
  els.input.disabled = false;
  els.stop.hidden = !busy;
  els.send.querySelector("span").textContent = busy ? "Running pipeline…" : "Send";
}

function resizeInput() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(200, els.input.scrollHeight)}px`;
}

/**
 * Run the full 4-stage pipeline for a new top-level prompt.
 */
async function runPipeline(rawText) {
  const text = (rawText || "").trim();
  if (!text) return;
  if (!settings.apiKey) {
    showSetup();
    return;
  }

  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }

  toggleWelcome(false);
  appendUserMessage(text);
  const turn = appendAssistantTurn();
  setBusy(true);

  const controller = new AbortController();
  inFlight = controller;

  try {
    // ----- Stage 1: brief -----
    turn.stages.brief.start();
    const brief = await classifyIntent({
      apiKey: settings.apiKey,
      model: settings.model,
      userPrompt: text,
      industryHint: settings.industryHint,
      signal: controller.signal,
    });
    turn.stages.brief.complete(brief);

    const generator = INTENT_GENERATORS[brief.intent] || INTENT_GENERATORS.generic;
    turn.setIntentLabel(generator.label, generator.icon);

    // ----- Stage 2: blueprint -----
    turn.stages.blueprint.start();
    let blueprint = null;
    try {
      blueprint = await generateBlueprint({
        apiKey: settings.apiKey,
        model: settings.model,
        brief,
        signal: controller.signal,
      });
      turn.stages.blueprint.complete(blueprint);
    } catch (blueprintErr) {
      if (controller.signal.aborted) throw blueprintErr;
      turn.stages.blueprint.fail("Blueprint failed — continuing without a structured plan");
      blueprint = null;
    }

    // ----- Stage 3: theme -----
    turn.stages.theme.start();
    let themeSource = "";
    try {
      themeSource = await generateTheme({
        apiKey: settings.apiKey,
        model: settings.model,
        brief,
        blueprint,
        signal: controller.signal,
      });
      turn.stages.theme.complete(themeSource);
    } catch (themeErr) {
      if (controller.signal.aborted) throw themeErr;
      turn.stages.theme.fail("Theme generation failed — using default theme");
      themeSource = "";
    }

    // ----- Stage 4: UI generation (streaming) -----
    turn.stages.ui.start();
    const uiSystemPrompt = buildUiSystemPrompt(generator);
    const userTurn = buildUserTurn(brief, blueprint, generator, themeSource);

    let uiSource = "";
    for await (const delta of streamCompletion({
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [
        { role: "system", content: uiSystemPrompt },
        { role: "user", content: userTurn },
      ],
      signal: controller.signal,
    })) {
      uiSource += delta;
      const combined = combineSources(themeSource, stripFences(uiSource));
      turn.setSource(combined);
      turn.setPreview(combined);
      turn.stages.ui.streamTick();
    }
    turn.stages.ui.complete();
    turn.markDone();

    // ----- Auto-save to gallery -----
    settings.saveToGallery({
      id: cryptoRandomId(),
      prompt: text,
      intent: brief.intent,
      intentLabel: generator.label,
      intentIcon: generator.icon,
      appName: brief.appName || generator.label,
      industry: brief.industry,
      timestamp: Date.now(),
      source: turn.getSource(),
      swatches: extractSwatches(themeSource),
    });
    renderGallery();
  } catch (err) {
    if (controller.signal.aborted) {
      turn.markCancelled();
    } else {
      turn.markError(err?.message || "Pipeline failed");
    }
  } finally {
    setBusy(false);
    if (inFlight === controller) inFlight = null;
  }
}

/**
 * Run a refinement of an existing turn — appends a new turn that uses the
 * previous code as a starting point and applies a user-supplied change
 * request. Skips the brief/blueprint/theme stages; only the UI is rewritten.
 */
async function runRefine(sourceTurn, instruction) {
  const refineText = instruction.trim();
  if (!refineText) return;
  if (!settings.apiKey) { showSetup(); return; }
  if (inFlight) { inFlight.abort(); inFlight = null; }

  toggleWelcome(false);
  appendUserMessage(`Refine: ${refineText}`, "wand-magic-sparkles");

  const previousSource = sourceTurn.getSource();
  const previousIntent = sourceTurn.getIntent();
  const turn = appendRefineTurn(previousIntent);
  setBusy(true);

  const controller = new AbortController();
  inFlight = controller;

  try {
    turn.stages.refine.start();
    const messages = [
      { role: "system", content: REFINE_SYSTEM_PROMPT },
      { role: "user", content: buildRefineUserMessage(previousSource, refineText) },
    ];

    let updated = "";
    for await (const delta of streamCompletion({
      apiKey: settings.apiKey,
      model: settings.model,
      messages,
      signal: controller.signal,
    })) {
      updated += delta;
      const code = stripFences(updated);
      turn.setSource(code);
      turn.setPreview(code);
      turn.stages.refine.streamTick();
    }
    turn.stages.refine.complete();
    turn.markDone();

    settings.saveToGallery({
      id: cryptoRandomId(),
      prompt: `Refine: ${refineText}`,
      intent: previousIntent?.id || "generic",
      intentLabel: previousIntent?.label || "Refined UI",
      intentIcon: previousIntent?.icon || "wand-magic-sparkles",
      appName: previousIntent?.label || "Refined UI",
      industry: "",
      timestamp: Date.now(),
      source: turn.getSource(),
      swatches: extractSwatches(turn.getSource()),
    });
    renderGallery();
  } catch (err) {
    if (controller.signal.aborted) {
      turn.markCancelled();
    } else {
      turn.markError(err?.message || "Refinement failed");
    }
  } finally {
    setBusy(false);
    if (inFlight === controller) inFlight = null;
  }
}

function buildRefineUserMessage(previousSource, instruction) {
  return [
    "Here is the current Streaming UI Script program:",
    "",
    previousSource,
    "",
    "The user wants this change:",
    "",
    instruction,
    "",
    "Output the COMPLETE updated program now. Preserve the theme line, brand identity, and everything the user did not mention. Start directly with `theme = ...` (if present) or `root = ...`.",
  ].join("\n");
}

function buildUiSystemPrompt(generator) {
  const proxy = document.createElement("streaming-ui-script");
  const additionalRules = [...SHARED_PRODUCTION_RULES, ...generator.rules];
  return proxy.getSystemPrompt({
    mode: "full",
    preamble: generator.preamble,
    additionalRules,
    examples: (generator.examples && generator.examples.length > 0) ? generator.examples : undefined,
  });
}

function buildUserTurn(brief, blueprint, generator, themeSource) {
  const lines = [];
  lines.push(`Brief:`);
  lines.push(`- App name: ${brief.appName || "(unnamed)"}`);
  lines.push(`- Tagline: ${brief.tagline || ""}`);
  lines.push(`- Intent: ${brief.intent}`);
  lines.push(`- Industry: ${brief.industry || "general"}`);
  lines.push(`- Audience: ${brief.audience || "general users"}`);
  lines.push(`- Brand: ${brief.brand || "modern"}`);
  lines.push(`- Tone: ${brief.tone || "professional"}`);
  lines.push(`- Locale: ${brief.locale || "en-US"}, Currency: ${brief.currency || "USD"}`);
  if (settings.useMockData && brief.needsMockData !== false) {
    lines.push(`- Mock data: REQUIRED — seed realistic data inline.`);
  }
  lines.push("");
  lines.push(`Polished request:`);
  lines.push(brief.refinedPrompt || brief.purpose || "");
  lines.push("");

  if (blueprint) {
    lines.push("Blueprint (use this as the structural plan — pages, sections, schemas, sample records, KPIs):");
    lines.push("```json");
    lines.push(JSON.stringify(compactBlueprint(blueprint), null, 2));
    lines.push("```");
    lines.push("");
    lines.push("Wire the sample data into top-level $state bindings (one $state per schema). Pages must read from $state so user actions propagate live.");
    lines.push("");
  }

  if (themeSource) {
    lines.push(`A brand theme has already been chosen and will be prepended to your response. DO NOT emit a \`theme = ...\` line — start directly with \`root = ...\`.`);
    lines.push(`For reference, the theme line is:`);
    lines.push(themeSource);
    lines.push("");
  }

  lines.push("Generate the complete Streaming UI Script program now. Start with `root = ...` on the very first line. No markdown, no code fences, no commentary.");
  return lines.join("\n");
}

/** Trim blueprint payload to keep the user message manageable. */
function compactBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== "object") return blueprint;
  const out = { ...blueprint };
  if (Array.isArray(out.pages)) out.pages = out.pages.slice(0, 8);
  if (Array.isArray(out.schemas)) out.schemas = out.schemas.slice(0, 5);
  if (out.sampleData && typeof out.sampleData === "object") {
    const trimmed = {};
    for (const [k, v] of Object.entries(out.sampleData)) {
      trimmed[k] = Array.isArray(v) ? v.slice(0, 15) : v;
    }
    out.sampleData = trimmed;
  }
  if (Array.isArray(out.kpis)) out.kpis = out.kpis.slice(0, 6);
  if (Array.isArray(out.primaryActions)) out.primaryActions = out.primaryActions.slice(0, 5);
  if (Array.isArray(out.filters)) out.filters = out.filters.slice(0, 5);
  return out;
}

function combineSources(themeSource, uiSource) {
  const theme = (themeSource || "").trim();
  const ui = (uiSource || "").trimStart();
  if (!theme) return ui;
  if (!ui) return theme;
  const uiSansTheme = ui.replace(/^\s*theme\s*=\s*Theme\([^\n]*\)\s*\n?/m, "");
  return `${theme}\n${uiSansTheme}`;
}

/* ===========================================================================
   10. Stage 1 — intent classification call
   =========================================================================== */

async function classifyIntent({ apiKey, model, userPrompt, industryHint, signal }) {
  const userMsg = industryHint
    ? `${userPrompt}\n\n(Hint: the user typically works in the ${industryHint} space — bias industry detection accordingly when ambiguous.)`
    : userPrompt;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: defaultHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) throw new Error(await openRouterError(res, "Intent classification failed"));
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  return parseIntentJson(raw, userPrompt);
}

function parseIntentJson(raw, fallbackPrompt) {
  const cleaned = stripFences(raw).trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return defaultIntent(fallbackPrompt);
    try { parsed = JSON.parse(match[0]); } catch { return defaultIntent(fallbackPrompt); }
  }
  const normalisedIntent = typeof parsed.intent === "string"
    ? parsed.intent.toLowerCase().trim()
    : "generic";
  return {
    intent: INTENT_GENERATORS[normalisedIntent] ? normalisedIntent : "generic",
    industry: stringField(parsed.industry, "general"),
    audience: stringField(parsed.audience, "general users"),
    brand: stringField(parsed.brand, "modern"),
    appName: stringField(parsed.appName, ""),
    tagline: stringField(parsed.tagline, ""),
    purpose: stringField(parsed.purpose, fallbackPrompt),
    tone: stringField(parsed.tone, "professional"),
    primaryColorHint: stringField(parsed.primaryColorHint, "#0969da"),
    locale: stringField(parsed.locale, "en-US"),
    currency: stringField(parsed.currency, "USD"),
    needsMockData: parsed.needsMockData !== false,
    refinedPrompt: stringField(parsed.refinedPrompt, fallbackPrompt),
  };
}

function stringField(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function defaultIntent(userPrompt) {
  return {
    intent: "generic",
    industry: "general",
    audience: "general users",
    brand: "modern",
    appName: "",
    tagline: "",
    purpose: userPrompt,
    tone: "professional",
    primaryColorHint: "#0969da",
    locale: "en-US",
    currency: "USD",
    needsMockData: true,
    refinedPrompt: userPrompt,
  };
}

/* ===========================================================================
   11. Stage 2 — blueprint generation call
   =========================================================================== */

async function generateBlueprint({ apiKey, model, brief, signal }) {
  const userMsg = [
    `Brief:`,
    `- Intent: ${brief.intent}`,
    `- Industry: ${brief.industry}`,
    `- Audience: ${brief.audience}`,
    `- Brand: ${brief.brand}`,
    `- App name: ${brief.appName || "(none — invent something on-brand)"}`,
    `- Tagline: ${brief.tagline || "(none)"}`,
    `- Tone: ${brief.tone}`,
    `- Locale: ${brief.locale}, Currency: ${brief.currency}`,
    `- Purpose: ${brief.purpose}`,
    `- Refined request: ${brief.refinedPrompt}`,
    `- Mock data required: ${brief.needsMockData !== false}`,
    ``,
    `Output the JSON blueprint now.`,
  ].join("\n");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: defaultHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: BLUEPRINT_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) throw new Error(await openRouterError(res, "Blueprint generation failed"));
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  return parseBlueprintJson(raw);
}

function parseBlueprintJson(raw) {
  const cleaned = stripFences(raw).trim();
  if (!cleaned) return null;
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { parsed = JSON.parse(match[0]); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

/* ===========================================================================
   12. Stage 3 — theme generation call
   =========================================================================== */

async function generateTheme({ apiKey, model, brief, blueprint, signal }) {
  const userMsg = [
    `Generate a Theme({...}) call that brands the following UI:`,
    `- App name: ${brief.appName || "(unnamed)"}`,
    `- Intent: ${brief.intent}`,
    `- Industry: ${brief.industry}`,
    `- Brand: ${brief.brand}`,
    `- Audience: ${brief.audience}`,
    `- Tone: ${brief.tone}`,
    `- Primary color hint: ${brief.primaryColorHint}`,
    `- Purpose: ${brief.purpose}`,
    blueprint?.tagline ? `- Tagline: ${blueprint.tagline}` : "",
    `- Refined request: ${brief.refinedPrompt}`,
    ``,
    `Output ONLY one line that starts with \`theme = Theme({\` and ends with \`})\`. No commentary.`,
  ].filter(Boolean).join("\n");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: defaultHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: THEME_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.5,
    }),
    signal,
  });
  if (!res.ok) throw new Error(await openRouterError(res, "Theme generation failed"));
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  return extractThemeLine(raw);
}

function extractThemeLine(raw) {
  const cleaned = stripFences(raw).trim();
  if (!cleaned) return "";
  const startIdx = cleaned.search(/theme\s*=\s*Theme\s*\(/);
  if (startIdx === -1) return "";
  let depth = 0;
  let inString = false;
  let stringQuote = null;
  for (let i = startIdx; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === stringQuote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringQuote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return cleaned.slice(startIdx, i + 1).replace(/\s+/g, " ");
      }
    }
  }
  return "";
}

/* ===========================================================================
   13. OpenRouter streaming (used by stage 4 + refine)
   =========================================================================== */

async function* streamCompletion({ apiKey, model, messages, signal }) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: defaultHeaders(apiKey),
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.55 }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(await openRouterError(res, "UI generation failed"));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* ignore unparseable chunk */ }
      }
    }
  }
}

function defaultHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": window.location.href,
    "X-Title": "streaming-ui-script advanced chat bot",
  };
}

async function openRouterError(res, fallback) {
  let detail = "";
  try {
    const data = await res.json();
    detail = data?.error?.message || "";
  } catch { /* ignore */ }
  return detail || `${fallback} (${res.status}). Check your API key and selected model.`;
}

function stripFences(text) {
  let out = (text || "").trim();
  const opening = out.match(/^```[a-zA-Z0-9_-]*\n/);
  if (opening) out = out.slice(opening[0].length);
  if (out.endsWith("```")) out = out.slice(0, -3).trimEnd();
  return out;
}

/* ===========================================================================
   14. Message rendering
   =========================================================================== */

function appendUserMessage(text, icon = "user") {
  const wrap = el("article", { class: "cb-msg cb-msg--user" });
  const meta = el("div", { class: "cb-msg-meta" },
    el("span", { class: "cb-role" },
      el("i", { class: `fa-solid fa-${icon}`, "aria-hidden": "true" }),
      " You",
    ),
    el("span", { class: "cb-msg-time" }, formatTime(new Date())),
  );
  const bubble = el("div", { class: "cb-bubble" }, text);
  wrap.append(meta, bubble);
  els.history.append(wrap);
  scrollToEnd();
}

/**
 * Append a full 4-stage assistant turn for a new top-level prompt.
 */
function appendAssistantTurn() {
  const ctx = appendTurnSkeleton({
    stagesConfig: [
      { id: "brief",     step: 1, title: "Brief — intent, persona, industry", icon: "compass" },
      { id: "blueprint", step: 2, title: "Blueprint — pages, schemas, data",   icon: "diagram-project" },
      { id: "theme",     step: 3, title: "Brand theme",                        icon: "palette" },
      { id: "ui",        step: 4, title: "Composing the UI",                   icon: "shapes" },
    ],
  });
  return ctx;
}

/**
 * Append a single-stage Refine turn that reuses the previous program.
 */
function appendRefineTurn(previousIntent) {
  const ctx = appendTurnSkeleton({
    stagesConfig: [
      { id: "refine", step: 1, title: "Refining UI", icon: "wand-magic-sparkles" },
    ],
    initialIntent: previousIntent,
    refine: true,
  });
  return ctx;
}

/**
 * Build the shared assistant card (meta + pipeline panel + preview/source +
 * action bar). Returns a controller object the pipeline uses to drive each
 * stage and the final preview/source.
 */
function appendTurnSkeleton({ stagesConfig, initialIntent, refine = false }) {
  const wrap = el("article", { class: "cb-msg cb-msg--assistant" });

  // ---- Meta row -------------------------------------------------------
  const intentPill = el("span", { class: "cb-mode-pill cba-intent-pill" },
    el("i", { class: `fa-solid fa-${initialIntent?.icon || "diagram-project"}`, "aria-hidden": "true" }),
    el("span", { class: "cba-intent-text" },
      initialIntent?.label ? `${initialIntent.label} · refining` : "Pipeline running…"),
  );
  const totalTime = el("b", {}, "0.0s");
  const stats = el("span", { class: "cb-msg-meta-stats" },
    el("span", {}, el("i", { class: "fa-solid fa-stopwatch", "aria-hidden": "true" }), " ", totalTime),
  );
  const meta = el("div", { class: "cb-msg-meta" },
    el("span", { class: "cb-role" },
      el("i", { class: `fa-solid fa-${refine ? "wand-magic-sparkles" : "wand-magic-sparkles"}`, "aria-hidden": "true" }),
      " ", refine ? "Refine" : "Pipeline",
    ),
    intentPill,
    stats,
    el("span", { class: "cb-msg-time" }, formatTime(new Date())),
  );

  // ---- Card body ------------------------------------------------------
  const card = el("div", { class: "cb-msg-card cba-msg-card", "data-streaming": "true" });

  const pipelinePanel = el("div", { class: "cba-pipeline" });
  const stageCtxByKey = {};
  for (const cfg of stagesConfig) {
    stageCtxByKey[cfg.id] = buildStage(cfg.step, cfg.title, cfg.icon, pipelinePanel);
  }

  // Tabs row
  const tabs = el("div", { class: "cb-msg-tabs", role: "tablist" });
  const tabPreview = el("button", { type: "button", class: "cb-msg-tab", "data-tab": "preview", role: "tab", "aria-selected": "true" },
    el("i", { class: "fa-solid fa-display", "aria-hidden": "true" }), " Preview");
  const tabSource = el("button", { type: "button", class: "cb-msg-tab", "data-tab": "source", role: "tab", "aria-selected": "false" },
    el("i", { class: "fa-solid fa-code", "aria-hidden": "true" }), " Source");
  const tabsSpacer = el("div", { class: "cb-msg-tabs-spacer" });
  const status = el("span", { class: "cb-status", "data-tone": "streaming" },
    el("i", { class: "fa-solid fa-circle-notch fa-spin", "aria-hidden": "true" }),
    el("span", { class: "cb-status-text" }, "Streaming…"),
  );
  tabs.append(tabPreview, tabSource, tabsSpacer, status);

  // Body — preview + source panels
  const body = el("div", { class: "cb-msg-body" });

  const previewPanel = el("div", { class: "cb-msg-panel", "data-key": "preview", "data-active": "true" });
  const previewWrap = el("div", { class: "cb-msg-preview", "data-vp": "desktop" });
  const previewFrame = el("div", { class: "cb-msg-preview-frame" });
  const skeleton = el("div", { class: "cb-msg-skeleton" },
    el("span"), el("span"), el("span"), el("span"), el("span"));
  const renderer = document.createElement("streaming-ui-script");
  renderer.setAttribute("transparent", "true");
  renderer.setAttribute("theme", "light");
  renderer.style.display = "none";
  previewFrame.append(skeleton, renderer);
  previewWrap.append(previewFrame);
  previewPanel.append(previewWrap);

  const sourcePanel = el("div", { class: "cb-msg-panel", "data-key": "source", "data-active": "false" });
  const sourceContainer = el("div", { class: "cb-msg-source" });
  const sourcePre = el("pre");
  const sourceCode = el("code");
  sourcePre.append(sourceCode);
  sourceContainer.append(sourcePre);
  sourcePanel.append(sourceContainer);
  body.append(previewPanel, sourcePanel);

  // Action bar
  const actions = el("div", { class: "cb-msg-actions" });
  const copyBtn = makeAction("copy", "fa-copy", "Copy source");
  const playBtn = makeAction("playground", "fa-flask", "Edit in playground");
  const dlBtn = makeAction("download", "fa-download", "Download as HTML");
  const shareBtn = makeAction("share", "fa-share-nodes", "Copy share link");
  const fsBtn = makeAction("fullscreen", "fa-expand", "Open fullscreen");
  const refineBtn = makeAction("refine", "fa-wand-magic-sparkles", "Refine");
  const spacer = el("div", { class: "cb-msg-actions-spacer" });
  const regenBtn = makeAction("regenerate", "fa-rotate", "Regenerate");
  actions.append(copyBtn, playBtn, dlBtn, shareBtn, fsBtn, refineBtn, spacer, regenBtn);

  // Refine panel (hidden until user clicks Refine)
  const refinePanel = el("form", { class: "cba-refine-panel", hidden: true });
  const refineInput = el("input", {
    type: "text",
    class: "cba-refine-input",
    placeholder: "e.g. Add a contact page · Use a darker theme · Translate to Spanish",
    autocomplete: "off",
  });
  const refineSubmit = el("button", { type: "submit", class: "cb-btn cb-btn--primary cba-refine-submit" },
    el("i", { class: "fa-solid fa-arrow-right", "aria-hidden": "true" }), " Apply",
  );
  const refineCancel = el("button", { type: "button", class: "cb-btn cb-btn--ghost cba-refine-cancel" }, "Cancel");
  refinePanel.append(refineInput, refineSubmit, refineCancel);

  card.append(pipelinePanel, tabs, body, actions, refinePanel);
  wrap.append(meta, card);
  els.history.append(wrap);
  scrollToEnd();

  // Tab switching
  for (const tab of [tabPreview, tabSource]) {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabPreview.setAttribute("aria-selected", String(target === "preview"));
      tabSource.setAttribute("aria-selected", String(target === "source"));
      previewPanel.setAttribute("data-active", String(target === "preview"));
      sourcePanel.setAttribute("data-active", String(target === "source"));
    });
  }

  // ---- Lifecycle state ------------------------------------------------
  let currentSource = "";
  let intentInfo = initialIntent || null;
  const startedAt = performance.now();
  const totalTimer = setInterval(() => {
    totalTime.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
  }, 100);

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentSource);
      flashAction(copyBtn, "Copied", "fa-check");
      showToast("Source copied", "copy");
    } catch {
      showToast("Couldn't copy source", "triangle-exclamation");
    }
  });

  playBtn.addEventListener("click", () => openInPlayground(currentSource));
  dlBtn.addEventListener("click", () => {
    if (!currentSource.trim()) { showToast("Nothing to download yet", "circle-info"); return; }
    downloadHtml(currentSource, intentInfo?.label || "Generated UI");
  });
  shareBtn.addEventListener("click", async () => {
    if (!currentSource.trim()) { showToast("Nothing to share yet", "circle-info"); return; }
    try {
      const encoded = await encodeShare(currentSource);
      const url = new URL("playground.html", window.location.href);
      url.searchParams.set("code", encoded);
      const link = url.toString();
      await navigator.clipboard.writeText(link);
      flashAction(shareBtn, "Link copied", "fa-check");
      showToast("Share link copied", "share-nodes");
    } catch {
      showToast("Couldn't create share link", "triangle-exclamation");
    }
  });
  fsBtn.addEventListener("click", () => openFullscreen(currentSource, intentInfo?.label || "Generated UI"));
  regenBtn.addEventListener("click", () => {
    const previous = wrap.previousElementSibling;
    if (!previous || !previous.classList.contains("cb-msg--user")) {
      showToast("Nothing to regenerate", "circle-info");
      return;
    }
    const prompt = previous.querySelector(".cb-bubble")?.textContent || "";
    if (!prompt.trim()) return;
    wrap.remove();
    previous.remove();
    runPipeline(prompt);
  });

  // Refine flow ---------------------------------------------------------
  refineBtn.addEventListener("click", () => {
    if (!currentSource.trim()) {
      showToast("Wait until generation completes before refining", "circle-info");
      return;
    }
    refinePanel.hidden = false;
    refineInput.focus();
  });
  refinePanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const instruction = refineInput.value.trim();
    if (!instruction) return;
    refineInput.value = "";
    refinePanel.hidden = true;
    runRefine(turnController, instruction);
  });
  refineCancel.addEventListener("click", () => {
    refinePanel.hidden = true;
    refineInput.value = "";
  });

  function stop() {
    clearInterval(totalTimer);
    totalTime.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
  }

  const turnController = {
    wrap,
    setIntentLabel(label, icon, id) {
      intentInfo = { label, icon, id: id || label?.toLowerCase() };
      const i = intentPill.querySelector("i");
      const span = intentPill.querySelector(".cba-intent-text");
      if (i) i.className = `fa-solid fa-${icon || "diagram-project"}`;
      if (span) span.textContent = refine ? `${label} · refining` : `${label} pipeline`;
    },
    getIntent: () => intentInfo,
    setSource(text) {
      currentSource = text;
      sourceCode.textContent = text;
      if (text && skeleton.style.display !== "none") {
        skeleton.style.display = "none";
        renderer.style.display = "block";
      }
    },
    setPreview(text) {
      if (typeof renderer.setResponse === "function") {
        renderer.setResponse(text);
      }
    },
    getSource: () => currentSource,
    markDone() {
      status.dataset.tone = "done";
      const i = status.querySelector("i");
      const t = status.querySelector(".cb-status-text");
      i.className = "fa-solid fa-circle-check";
      t.textContent = "Done";
      card.dataset.streaming = "false";
      skeleton.style.display = "none";
      renderer.style.display = "block";
      stop();
    },
    markCancelled() {
      status.dataset.tone = "";
      status.querySelector("i").className = "fa-solid fa-ban";
      status.querySelector(".cb-status-text").textContent = "Cancelled";
      card.dataset.streaming = "false";
      stop();
    },
    markError(message) {
      status.dataset.tone = "";
      status.querySelector("i").className = "fa-solid fa-triangle-exclamation";
      status.querySelector(".cb-status-text").textContent = "Error";
      card.dataset.streaming = "false";
      const err = el("div", { class: "cb-msg-err" }, message);
      card.append(err);
      stop();
    },
    stages: stageCtxByKey,
  };

  // Set initial intent on the meta row if a previous intent was carried in
  if (initialIntent?.label) {
    turnController.setIntentLabel(initialIntent.label, initialIntent.icon, initialIntent.id);
  }

  return turnController;
}

/**
 * Build one collapsible pipeline stage row.
 */
function buildStage(stepNum, title, icon, parent) {
  const stage = el("div", { class: "cba-stage", "data-status": "queued" });
  const head = el("button", { type: "button", class: "cba-stage-head", "aria-expanded": "false" });
  const stepEl = el("span", { class: "cba-stage-step" }, String(stepNum));
  const iconEl = el("span", { class: "cba-stage-icon" },
    el("i", { class: `fa-solid fa-${icon}`, "aria-hidden": "true" }));
  const titleEl = el("span", { class: "cba-stage-title" }, title);
  const spacer = el("span", { class: "cba-stage-spacer" });
  const statusEl = el("span", { class: "cba-stage-status" },
    el("i", { class: "fa-solid fa-circle", "aria-hidden": "true" }),
    el("span", { class: "cba-stage-status-text" }, "Queued"),
  );
  const timerEl = el("span", { class: "cba-stage-time" }, "");
  const caretEl = el("i", { class: "fa-solid fa-chevron-down cba-stage-caret", "aria-hidden": "true" });
  head.append(stepEl, iconEl, titleEl, spacer, statusEl, timerEl, caretEl);

  const bodyEl = el("div", { class: "cba-stage-body", hidden: true });
  stage.append(head, bodyEl);
  parent.append(stage);

  let timer = null;
  let startedAt = 0;
  function tickRunning() {
    if (!startedAt) return;
    const dt = (performance.now() - startedAt) / 1000;
    timerEl.textContent = `${dt.toFixed(1)}s`;
  }

  head.addEventListener("click", () => {
    const expanded = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", String(!expanded));
    bodyEl.hidden = expanded;
  });

  function setExpanded(v) {
    head.setAttribute("aria-expanded", String(v));
    bodyEl.hidden = !v;
  }

  function setStatus(status, label) {
    stage.dataset.status = status;
    statusEl.querySelector(".cba-stage-status-text").textContent = label;
    const i = statusEl.querySelector("i");
    i.className = `fa-solid ${
      status === "running" ? "fa-circle-notch fa-spin" :
      status === "done"    ? "fa-circle-check" :
      status === "error"   ? "fa-triangle-exclamation" :
                             "fa-circle"
    }`;
  }

  return {
    start() {
      startedAt = performance.now();
      setStatus("running", "Running…");
      timer = setInterval(tickRunning, 100);
    },
    streamTick() { /* hook for live progress, currently unused */ },
    complete(artifact) {
      if (timer) { clearInterval(timer); timer = null; }
      tickRunning();
      setStatus("done", "Done");
      renderArtifact(bodyEl, stepNum, artifact);
      setExpanded(true);
    },
    fail(message) {
      if (timer) { clearInterval(timer); timer = null; }
      tickRunning();
      setStatus("error", "Error");
      bodyEl.replaceChildren(el("div", { class: "cba-stage-error" }, message || "Stage failed"));
      setExpanded(true);
    },
  };
}

/**
 * Render the stage's artifact in its body.
 *
 *   step 1 (brief)      → key/value summary + refined prompt + raw JSON
 *   step 2 (blueprint)  → pages + nav + schemas + sample-data preview
 *   step 3 (theme)      → swatch grid + raw theme source
 *   step 4+ (UI/refine) → pointer to the source/preview tabs
 */
function renderArtifact(bodyEl, stepNum, artifact) {
  bodyEl.replaceChildren();
  if (artifact == null) return;

  if (stepNum === 1) {
    const brief = artifact;
    const summary = el("dl", { class: "cba-kv" });
    const addKv = (label, value) => {
      summary.append(el("dt", {}, label), el("dd", {}, String(value ?? "—")));
    };
    if (brief.appName)   addKv("App name", brief.appName);
    if (brief.tagline)   addKv("Tagline", brief.tagline);
    addKv("Intent", brief.intent);
    addKv("Industry", brief.industry);
    addKv("Brand", brief.brand);
    addKv("Tone", brief.tone);
    addKv("Audience", brief.audience);
    addKv("Locale", `${brief.locale} · ${brief.currency}`);
    if (brief.primaryColorHint) {
      const swatch = el("span", { class: "cba-color-chip", style: `background:${brief.primaryColorHint}` });
      const dd = el("dd", { class: "cba-kv-color" }, swatch, el("code", {}, brief.primaryColorHint));
      summary.append(el("dt", {}, "Primary hint"), dd);
    }
    bodyEl.append(summary);

    if (brief.refinedPrompt) {
      bodyEl.append(
        el("h4", { class: "cba-stage-subhead" }, "Refined prompt"),
        el("p", { class: "cba-stage-quote" }, brief.refinedPrompt),
      );
    }
    bodyEl.append(
      el("details", { class: "cba-stage-raw" },
        el("summary", {}, "Raw JSON"),
        el("pre", {}, el("code", {}, JSON.stringify(brief, null, 2))),
      ),
    );
    return;
  }

  if (stepNum === 2) {
    const bp = artifact;
    if (bp.tagline || bp.appName) {
      bodyEl.append(el("h4", { class: "cba-stage-subhead" }, `${bp.appName || ""}${bp.tagline ? " · " + bp.tagline : ""}`));
    }

    // Pages strip
    if (Array.isArray(bp.pages) && bp.pages.length > 0) {
      const pagesEl = el("div", { class: "cba-bp-pages" });
      for (const p of bp.pages) {
        const sections = Array.isArray(p.sections) ? p.sections.slice(0, 5).join(" · ") : "";
        pagesEl.append(el("div", { class: "cba-bp-page" },
          el("span", { class: "cba-bp-page-head" },
            el("i", { class: `fa-solid fa-${p.icon || "circle"}`, "aria-hidden": "true" }),
            el("b", {}, p.title || p.path || "Page"),
            p.path ? el("code", {}, p.path) : null,
          ),
          p.purpose ? el("span", { class: "cba-bp-page-desc" }, p.purpose) : null,
          sections ? el("span", { class: "cba-bp-page-sections" }, sections) : null,
        ));
      }
      bodyEl.append(
        el("h4", { class: "cba-stage-subhead" }, `Pages (${bp.pages.length})`),
        pagesEl,
      );
    }

    // Schemas preview
    if (Array.isArray(bp.schemas) && bp.schemas.length > 0) {
      const schemasEl = el("div", { class: "cba-bp-schemas" });
      for (const s of bp.schemas) {
        const fields = Array.isArray(s.fields)
          ? s.fields.slice(0, 6).map((f) => `${f.name}${f.type ? ":" + f.type : ""}`).join(", ")
          : "";
        const sampleCount = Array.isArray(bp.sampleData?.[s.name]) ? bp.sampleData[s.name].length : 0;
        schemasEl.append(el("div", { class: "cba-bp-schema" },
          el("span", { class: "cba-bp-schema-name" }, el("i", { class: "fa-solid fa-database", "aria-hidden": "true" }), " ", el("b", {}, s.name)),
          el("span", { class: "cba-bp-schema-fields" }, fields),
          sampleCount ? el("span", { class: "cba-bp-schema-count" }, `${sampleCount} sample records`) : null,
        ));
      }
      bodyEl.append(
        el("h4", { class: "cba-stage-subhead" }, "Data schemas"),
        schemasEl,
      );
    }

    // KPIs
    if (Array.isArray(bp.kpis) && bp.kpis.length > 0) {
      const kpisEl = el("div", { class: "cba-bp-kpis" });
      for (const k of bp.kpis) {
        kpisEl.append(el("div", { class: `cba-bp-kpi cba-bp-kpi--${k.tone || "neutral"}` },
          el("i", { class: `fa-solid fa-${k.icon || "chart-line"}`, "aria-hidden": "true" }),
          el("span", { class: "cba-bp-kpi-label" }, k.label),
          el("b", { class: "cba-bp-kpi-value" }, k.value),
          k.trend ? el("span", { class: "cba-bp-kpi-trend" }, k.trend) : null,
        ));
      }
      bodyEl.append(
        el("h4", { class: "cba-stage-subhead" }, "Suggested KPIs"),
        kpisEl,
      );
    }

    bodyEl.append(
      el("details", { class: "cba-stage-raw" },
        el("summary", {}, "Raw blueprint JSON"),
        el("pre", {}, el("code", {}, JSON.stringify(bp, null, 2))),
      ),
    );
    return;
  }

  if (stepNum === 3) {
    const themeLine = typeof artifact === "string" ? artifact.trim() : "";
    if (!themeLine) {
      bodyEl.append(el("p", { class: "cba-stage-empty" }, "No theme produced — using the default theme."));
      return;
    }
    const tokens = extractThemeTokens(themeLine);
    if (tokens.length > 0) {
      const swatchGrid = el("div", { class: "cba-swatch-grid" });
      for (const [key, value] of tokens) {
        const chip = el("div", { class: "cba-swatch" });
        const swatch = el("span", { class: "cba-swatch-color" });
        if (looksLikeColor(value)) {
          swatch.style.background = value;
        } else {
          swatch.classList.add("cba-swatch-color--text");
          swatch.textContent = "Aa";
          swatch.style.font = `600 11px/1 ${value.replace(/^['"]|['"]$/g, "")}`;
        }
        chip.append(
          swatch,
          el("span", { class: "cba-swatch-meta" },
            el("b", {}, key),
            el("code", {}, value),
          ),
        );
        swatchGrid.append(chip);
      }
      bodyEl.append(swatchGrid);
    }
    bodyEl.append(
      el("details", { class: "cba-stage-raw", open: tokens.length === 0 },
        el("summary", {}, "Theme source"),
        el("pre", {}, el("code", {}, themeLine)),
      ),
    );
    return;
  }

  // Default (UI / refine stage):
  bodyEl.append(
    el("p", { class: "cba-stage-empty" },
      "UI source is streaming live into the ",
      el("b", {}, "Source"),
      " tab below — switch to ",
      el("b", {}, "Preview"),
      " to see it rendered with the generated theme.",
    ),
  );
}

/* ===========================================================================
   15. Theme token parsing for swatch rendering
   =========================================================================== */

function extractThemeTokens(themeLine) {
  const m = themeLine.match(/Theme\s*\(\s*\{([\s\S]*)\}\s*\)/);
  if (!m) return [];
  const body = m[1];
  const tokens = [];
  let depth = 0;
  let inString = false;
  let quote = null;
  let chunk = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      chunk += ch;
      if (ch === "\\") { chunk += body[++i] || ""; continue; }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; chunk += ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      pushChunk();
      chunk = "";
      continue;
    }
    chunk += ch;
  }
  pushChunk();
  return tokens;

  function pushChunk() {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    const sep = trimmed.indexOf(":");
    if (sep === -1) return;
    const key = trimmed.slice(0, sep).trim();
    const rawVal = trimmed.slice(sep + 1).trim();
    const value = rawVal.replace(/^["']|["']$/g, "");
    if (!key) return;
    tokens.push([key, value]);
  }
}

function looksLikeColor(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return true;
  if (/^rgba?\(/i.test(v)) return true;
  if (/^hsla?\(/i.test(v)) return true;
  return false;
}

/**
 * Pull the brand colors out of source code (the theme line plus any
 * additional color tokens that the LLM might have emitted). Used for the
 * gallery card swatch row.
 */
function extractSwatches(source) {
  const swatches = [];
  if (!source) return swatches;
  const tokens = extractThemeTokens(source);
  for (const [key, value] of tokens) {
    if (!looksLikeColor(value)) continue;
    if (/^color(Primary|Accent|Success|Warning|Danger|Info)$/.test(key) ||
        /^chart[1-6]$/.test(key)) {
      swatches.push(value);
    }
    if (swatches.length >= 5) break;
  }
  return swatches;
}

/* ===========================================================================
   16. Shared UI helpers (playground, fullscreen, download)
   =========================================================================== */

async function openInPlayground(source) {
  const text = stripFences(source || "");
  if (!text.trim()) {
    showToast("Nothing to open yet", "circle-info");
    return;
  }
  try {
    const encoded = await encodeShare(text);
    const url = new URL("playground.html", window.location.href);
    url.searchParams.set("code", encoded);
    window.open(url.toString(), "_blank", "noopener");
  } catch {
    showToast("Couldn't open in playground", "triangle-exclamation");
  }
}

function makeAction(name, icon, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cb-act";
  btn.dataset.act = name;
  btn.title = label;
  btn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>`;
  return btn;
}

function flashAction(btn, label, icon) {
  const i = btn.querySelector("i");
  const span = btn.querySelector("span");
  const prevI = i.className;
  const prevText = span.textContent;
  btn.dataset.state = "copied";
  i.className = `fa-solid ${icon}`;
  span.textContent = label;
  setTimeout(() => {
    delete btn.dataset.state;
    i.className = prevI;
    span.textContent = prevText;
  }, 1500);
}

let fsOverlay = null;
function openFullscreen(source, modeLabel) {
  const text = stripFences(source || "");
  if (!text.trim()) { showToast("Nothing to preview yet", "circle-info"); return; }
  if (!fsOverlay) {
    fsOverlay = el("div", { class: "cb-fullscreen", id: "cba-fullscreen" });
    const head = el("div", { class: "cb-fullscreen-head" },
      el("h3", {},
        el("i", { class: "fa-solid fa-expand", "aria-hidden": "true" }),
        el("span", { class: "cb-fs-title" }, "Fullscreen preview"),
      ),
      el("div", { class: "cb-toolbar-spacer" }),
      el("button", { type: "button", class: "cb-iconbtn", "aria-label": "Close", title: "Close (Esc)", id: "cba-fullscreen-close" },
        el("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }),
      ),
    );
    const body = el("div", { class: "cb-fullscreen-body" });
    fsOverlay.append(head, body);
    document.body.append(fsOverlay);
    fsOverlay.querySelector("#cba-fullscreen-close").addEventListener("click", closeFullscreen);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && fsOverlay?.dataset.open === "true") closeFullscreen();
    });
  }
  const body = fsOverlay.querySelector(".cb-fullscreen-body");
  body.replaceChildren();
  const r = document.createElement("streaming-ui-script");
  r.setAttribute("transparent", "true");
  r.setAttribute("theme", "light");
  body.append(r);
  customElements.whenDefined("streaming-ui-script").then(() => {
    if (typeof r.setResponse === "function") r.setResponse(text);
  });
  fsOverlay.querySelector(".cb-fs-title").textContent = `Fullscreen preview · ${modeLabel}`;
  fsOverlay.dataset.open = "true";
}

function closeFullscreen() {
  if (fsOverlay) fsOverlay.dataset.open = "false";
}

function downloadHtml(source, modeLabel) {
  const stripped = stripFences(source);
  const html = buildStandaloneHtml(stripped, modeLabel);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `streaming-ui-${Date.now()}.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("HTML downloaded", "download");
}

function buildStandaloneHtml(source, modeLabel) {
  const json = JSON.stringify(source).replace(/<\/(script)/gi, "<\\/$1");
  const parts = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(modeLabel)} · streaming-ui-script</title>`,
    '  <meta name="generator" content="streaming-ui-script advanced chat bot" />',
    `  <script type="module" src="${CDN_BUNDLE}"></script>`,
    "  <style>",
    "    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }",
    "    streaming-ui-script { display: block; min-height: 100vh; }",
    "  </style>",
    "</head>",
    "<body>",
    `  <streaming-ui-script theme="light"></streaming-ui-script>`,
    '  <script type="module">',
    '    const el = document.querySelector("streaming-ui-script");',
    `    const SOURCE = ${json};`,
    '    customElements.whenDefined("streaming-ui-script").then(() => {',
    "      el.setResponse(SOURCE);",
    "    });",
    "  </script>",
    "</body>",
    "</html>",
    "",
  ];
  return parts.join("\n");
}

/* ===========================================================================
   17. Drawer / toast / misc helpers
   =========================================================================== */

function openDrawer() {
  els.drawer.dataset.open = "true";
  els.drawerBackdrop.dataset.open = "true";
  els.drawer.removeAttribute("aria-hidden");
}

function closeDrawer() {
  els.drawer.dataset.open = "false";
  els.drawerBackdrop.dataset.open = "false";
  els.drawer.setAttribute("aria-hidden", "true");
}

function togglePasswordVisibility(input, button) {
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  const i = button.querySelector("i");
  if (i) i.className = `fa-solid fa-${reveal ? "eye-slash" : "eye"}`;
}

let toastTimer;
function showToast(message, icon) {
  els.toast.replaceChildren();
  if (icon) {
    const i = document.createElement("i");
    i.className = `fa-solid fa-${icon}`;
    els.toast.append(i);
  }
  els.toast.append(document.createTextNode(message));
  els.toast.dataset.visible = "true";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.dataset.visible = "false";
  }, 1800);
}

function scrollToEnd() {
  requestAnimationFrame(() => {
    els.stage.scrollTop = els.stage.scrollHeight;
  });
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text) {
  return String(text || "").replace(/[<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

/* ===========================================================================
   18. Go
   =========================================================================== */

boot();
