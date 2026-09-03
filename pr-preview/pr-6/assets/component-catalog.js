/**
 * Docs-side catalogue for components.html.
 *
 * The runtime bundle already carries every signature, prop type and authored
 * description, so nothing about a component's API is repeated here. This file
 * adds only what a browsing human needs and the library does not have:
 *
 *   - SUMMARIES  — one plain sentence per component: what it is FOR.
 *   - TAGS       — search synonyms, so "alert" finds Callout and "typeahead"
 *                  finds Combobox.
 *   - SAMPLES    — a complete, runnable program shown in the preview tile and
 *                  in the detail drawer. Each one starts with `$app(...)`.
 *   - GROUP_BLURBS   — one line per category, shown when that chip is active.
 *   - OVERLAY_PREVIEW — samples whose output escapes its box (modals, sheets,
 *                  toasts); the detail stage gives them a containing block and
 *                  extra height.
 *
 * Generated content is hand-maintained: adding a component to the library
 * without adding it here still renders a tile, just without a preview.
 */

export const SUMMARIES = {
  "Column": "Stacks children top-to-bottom with even spacing — the default page and card body layout.",
  "Row": "Lines children up left-to-right, vertically centered — toolbars, button rows, nav bars.",
  "Center": "Centers content on both axes — spinners, empty states, hero CTAs, and modal bodies.",
  "Stack": "Flex container whose direction flips per breakpoint: column on mobile, row on desktop.",
  "StackItem": "Lets one child of a Row or Column grow, shrink, or align on its own — input beside a button.",
  "Grid": "Arranges children into equal columns that wrap — card walls, KPI tiles, galleries.",
  "GridItem": "Gives one grid cell its own column span or offset — sidebar plus main on a 12-track grid.",
  "Box": "Adds padding, a border, or a tinted background around content when a Card is too heavy.",
  "Container": "Centers a wide page inside a comfortable max-width — landing pages, articles, docs.",
  "Spacer": "Pushes the items after it to the far edge of a row, or inserts a fixed gap.",
  "Card": "Groups related content on a raised, padded surface — one per chunk of a page.",
  "CardHeader": "Titles a card, with optional eyebrow, subtitle, and trailing badges or buttons.",
  "CardFooter": "Puts a card's action buttons along its bottom edge, trailing-aligned by default.",
  "CardSection": "Tints an edge-to-edge band inside a card to flag success, warning, or critical state.",
  "Separator": "Draws a dividing line between sections, optionally with a centered label like OR.",
  "Tabs": "Switches between panels of content with a keyboard-navigable tab strip.",
  "TabItem": "Defines one tab inside Tabs: its label, icon, count badge, and panel content.",
  "Accordion": "Collapsible sections that expand one at a time or independently — FAQs, settings groups.",
  "AccordionItem": "One expandable section inside an Accordion, with its own open state and color stripe.",
  "Modal": "Centered dialog over a dimmed page — confirmations, short forms, focused decisions.",
  "Drawer": "Panel that slides in from a screen edge — filters, detail views, side navigation.",
  "Steps": "Numbered guide marking which step is done, current, or failed — wizards and onboarding.",
  "AspectRatio": "Locks a child to a fixed shape like 16:9 or 1:1 — video embeds, thumbnails, covers.",
  "ScrollArea": "Clips tall content to a fixed height with its own scrollbar — logs, chat panes, lists.",
  "Sticky": "Pins a toolbar, nav, or banner in place while the content behind it scrolls.",
  "ResizablePanels": "Two panes split by a divider the user can drag — editors, file browsers, master/detail.",
  "MasonryGrid": "Packs mixed-height cards into Pinterest-style columns — galleries, feeds, note walls.",
  "Fragment": "Groups siblings without adding a wrapper box, so they stay direct children of the parent.",
  "Section": "Full-width page band with an optional tint and eyebrow/title header — marketing, docs.",
  "Split": "Two-column text-and-media layout with a set ratio that stacks on small screens.",
  "Bento": "Mosaic grid of differently sized tiles — the marquee feature section on a landing page.",
  "BentoCell": "Sizes one tile in a Bento mosaic: 1×1, wide, tall, hero, or a full row.",
  "Overlay": "Floats badges, ribbons, or play buttons on top of an image or card.",
  "OverlayItem": "Anchors one floating element to a corner, edge, or center of an Overlay.",
  "Text": "Prints one string at a preset size and tone — the everyday label, sentence, and caption.",
  "Image": "Shows a picture with an optional caption, fixed aspect ratio, and fallback when it fails.",
  "Badge": "Solid attention-grabbing chip for labels like Recommended, Beta, or a count.",
  "BadgeList": "Turns an array of strings into a row of chips, with a +N pill once the list overflows.",
  "Pill": "Soft tinted status label for the current state of a thing — active, pending, failed.",
  "Callout": "Highlighted info, warning, or error banner with a title, body text, and leading icon.",
  "Quote": "Lifts a sentence out of the page as a styled pull-quote with optional attribution.",
  "CodeBlock": "Displays read-only source with syntax colours, line numbers, and a copy button.",
  "Skeleton": "Shimmering grey placeholder that holds a card or paragraph's space while data loads.",
  "Spinner": "Rotating ring for small waits inside buttons, toolbars, and table cells.",
  "LoadingDots": "Three pulsing dots — the quieter inline wait when a spinning ring feels too loud.",
  "Markdown": "Turns a markdown string into rich text — headings, lists, links, code, and images.",
  "Kbd": "Shows a keyboard key as a styled cap — pass an array for a simple Cmd + K combo.",
  "Icon": "Draws a single Font Awesome glyph at a chosen size, style, and colour.",
  "TextContent": "Legacy alias of Text kept for older programs — reach for Text in anything new.",
  "GradientText": "Paints a phrase inside a headline with a brand gradient to emphasise it.",
  "Display": "Oversized hero headline that resizes itself responsively — the biggest text on a page.",
  "Heading": "Titles a section or subsection at the right h1–h6 level and token-driven size.",
  "Eyebrow": "Small uppercase kicker line that sits above a headline to set context.",
  "Prose": "Wraps long-form articles and docs bodies so headings, lists, and quotes read well.",
  "RelativeTime": "Shows a timestamp as 3m ago or in 2 days, refreshing itself as time passes.",
  "Svg": "Drops sanitised inline SVG on the page for logos, custom icons, and illustrations.",
  "VisuallyHidden": "Keeps text off the screen but readable by screen readers — the sr-only pattern.",
  "KbdShortcut": "Spells out a multi-key combo as joined key caps, with a separator for chords.",
  "CountUp": "Animates a number up from zero when it scrolls into view — for stats and hero figures.",
  "CountdownTimer": "Ticks down to a launch, sale, or deadline and fires a callback when it hits zero.",
  "TableOfContents": "Lists page sections as jump links that scroll to anchors and mark the current one.",
  "Form": "Wraps fields and buttons into one submittable unit, with Enter-to-submit and busy states.",
  "FormControl": "Pairs one field with its label, hint and error message — the standard field wrapper.",
  "FormSection": "Groups related fields under a small heading with optional explanatory helper text.",
  "FieldSet": "Wraps a radio or checkbox set in a native fieldset so screen readers announce the group.",
  "ValidationSummary": "Lists every error in one panel at the top of a form, each linking to the field it broke.",
  "RequirementList": "Marks each rule a value has to satisfy as met, unmet, or not yet checked \u2014 password requirements, naming rules.",
  "Input": "Single-line text field for names, emails, numbers and URLs — the everyday form control.",
  "TextArea": "Multi-line box for notes, descriptions and comments that need more than one row.",
  "PasswordInput": "Password field with a show/hide eye toggle and an optional strength meter.",
  "MaskedInput": "Formats typing against a fixed pattern — phone numbers, postal codes, card numbers.",
  "MentionInput": "Comment box where typing @ suggests people and inserts their handle.",
  "TagInput": "Turns typed words into removable chips — keywords, recipients, skills, labels.",
  "Select": "Dropdown for picking one option from a short, known list of choices.",
  "SelectItem": "One option inside a Select, Radio or Combobox list — a value plus its display label.",
  "Combobox": "Type-to-filter single picker for long lists like countries, currencies, repos or users.",
  "MultiSelect": "Pick several options at once; the choices show as removable chips in the trigger.",
  "Checkbox": "Single on/off tick box for consent, agreements and one-off opt-ins.",
  "CheckBoxGroup": "Several tick boxes bound to one object — permissions, scopes, notification channels.",
  "CheckBoxItem": "One tick box inside a CheckBoxGroup, with its own key, description and locked state.",
  "Radio": "Mutually exclusive choices, all visible at once — shipping speed, billing period.",
  "Switch": "Toggle for a setting that applies immediately — prefer this over Checkbox in settings.",
  "ToggleGroup": "Row of toggle buttons for view modes and filters; set multiple for a bold/italic toolbar.",
  "Button": "Clickable action — runs onClick, submits a Form, or navigates when given href.",
  "Buttons": "Lays a set of buttons out in a spaced row or column — the usual Save / Cancel pair.",
  "ButtonGroup": "Joins buttons edge-to-edge into one continuous control for closely related actions.",
  "InputGroup": "Puts a leading icon, trailing button or unit suffix inside a single field's border.",
  "SearchBar": "Ready-made filter field with magnifier icon, clear button and keyboard shortcut hint.",
  "Slider": "Drag a handle to choose a number in a range — volume, brightness, price caps.",
  "NumberInput": "Numeric field with +/- buttons for quantities, integer settings and unit amounts.",
  "ColorPicker": "Choose a colour from preset swatches or a hex box — theme builders and label colours.",
  "DatePicker": "Choose a single calendar date, bound as an ISO string with optional min/max limits.",
  "DateRangePicker": "Choose a start and end date that bound each other — reporting periods, bookings.",
  "TimePicker": "Choose a time of day in HH:MM, optionally snapped to fixed increments.",
  "DateTimePicker": "Choose a date and a time together in one field — launch windows, appointments.",
  "FileUpload": "Click-or-drop area for choosing files, with accept filters, size cap and progress bar.",
  "PinInput": "Per-digit boxes for 2FA and SMS codes — auto-advancing and paste-friendly.",
  "MultiStepForm": "Wizard that pages long forms into steps with a progress indicator and Back/Next.",
  "SegmentedControl": "iOS-style pill track for switching between a few mutually exclusive views.",
  "QuantityStepper": "Minus / value / plus control for cart quantities and small counts.",
  "VariantSelector": "Size pills and colour swatches for choosing a product variant before adding to cart.",
  "Swatch": "Theme preview tile showing accent dots on a named background — for theme pickers.",
  "DrawingCanvas": "Freehand sketch surface for mouse, touch or stylus that exports a PNG data URL.",
  "SignaturePad": "Capture a handwritten signature for contracts, deliveries and consent flows.",
  "ReactionPicker": "Row of emoji reaction pills with counts, shown under messages, comments and posts.",
  "Table": "Read-only rows and columns built from Col children — one Col per column.",
  "Col": "Defines one column of a Table or DataGrid: its header, values, format and alignment.",
  "DataGrid": "Sortable, filterable table with row selection and paging — the interactive Table.",
  "List": "Stacks ListItem rows into menus, settings panels, feeds and simple record lists.",
  "ListItem": "One row inside a List: title, description, leading icon, trailing badge or switch.",
  "StatCard": "Single KPI card: big value, trend delta, icon and an optional inline sparkline.",
  "Stats": "Lays several KPIs out as one strip or grid — the header row of a dashboard.",
  "Sparkline": "Tiny inline trend line for KPI cards and table cells where a real chart is too big.",
  "Tile": "Dense icon-and-label square for quick-action menus, category grids and filters.",
  "Progress": "Horizontal bar showing how far a task has got, with segmented and unknown-total modes.",
  "ProgressRing": "Circular completion gauge for quotas and scores — the round counterpart of the bar.",
  "Pagination": "Prev/next page navigator with page numbers, record counts and a per-page selector.",
  "Tree": "Expandable hierarchy of TreeNode children — file browsers, nested nav, category pickers.",
  "TreeNode": "One branch or leaf inside a Tree, with an icon, badge and optional child nodes.",
  "CalendarView": "Month-or-week event grid whose selected day and visible month bind to ISO-date atoms.",
  "ComparisonTable": "Feature-by-feature grid comparing plans or products, with tick/dash cells and row groups.",
  "InfiniteList": "Scrolls on forever, calling onLoadMore as the bottom comes into view — endless feeds.",
  "VirtualGrid": "Windowed tile grid that mounts only visible rows, so thousands of thumbnails stay fast.",
  "Metric": "Big gradient number with a label and delta, optionally counting up as it scrolls in.",
  "MetricStrip": "Row or grid of Metric tiles — the big-number band on a landing or About page.",
  "Calendar": "Bookable month grid with Today/prev/next, event chips and blocked-out unavailable days.",
  "OrderSummary": "Itemised checkout total: line items, discount, shipping, tax and a bold grand total.",
  "Cart": "Shopping-basket lines with quantity steppers, remove buttons and a running subtotal.",
  "PriceTag": "Formatted price with an optional struck-through was-price and a discount badge.",
  "BarChart": "Compares values across categories as grouped, stacked or horizontal bars.",
  "LineChart": "Plots trends over time, one line per series; set filled for an area chart.",
  "PieChart": "Shows proportions of a whole as slices, or a donut when you want a hole in the middle.",
  "RadarChart": "Multi-axis polygon for scorecards and capability comparisons across three or more traits.",
  "ScatterChart": "Plots XY points to expose correlation and spread — price vs rating, sessions vs signups.",
  "Histogram": "Bins raw numbers into frequency bars — latency spreads, score and age distributions.",
  "Heatmap": "Colour-intensity matrix for activity grids, schedule density and correlation tables.",
  "Gauge": "Half-doughnut dial for one value against thresholds — uptime, capacity, NPS, score.",
  "Series": "Names one line, bar set or point cloud fed into a chart — never rendered on its own.",
  "Avatar": "Shows one person's photo, falling back to a generated illustration or their initials.",
  "AvatarGroup": "Overlapping pile of member avatars with a +N chip when the list overflows.",
  "PersonChip": "Compact avatar + name + role pill for referencing someone in rows, cells and cards.",
  "Tooltip": "Reveals a short hint when a control is hovered or focused — six words or fewer.",
  "HoverCard": "Previews rich content — a profile, a link target — when the trigger is hovered.",
  "Popover": "Click-opened panel for filter forms, colour pickers and small settings flyouts.",
  "Rating": "Star score for reviews and testimonials, optionally clickable so users can rate.",
  "Toast": "Transient notice pinned to a screen corner — confirm a save or report an error.",
  "Toasts": "Stacks several toasts in one viewport corner when you need to place them yourself.",
  "VideoPlayer": "Plays inline video with poster, captions and themed controls — demos and tutorials.",
  "AudioPlayer": "Plays audio with a title, artist and transport bar — podcasts, voice notes, demos.",
  "Carousel": "Shows one slide at a time with arrows, dots and swipe — hero banners and tours.",
  "Gallery": "Responsive grid of image tiles, clickable to open a bigger view.",
  "Lightbox": "Full-screen image viewer with arrows for stepping through a set of photos.",
  "Map": "Static OpenStreetMap view on a lat/lng with pins — store locators, address cards.",
  "TypingIndicator": "Three bouncing dots showing that someone is composing a chat message.",
  "Confetti": "Fires a one-shot particle burst to celebrate a checkout, signup or milestone.",
  "Lottie": "Plays a vector JSON animation, with a poster fallback when the library is absent.",
  "QRCode": "Encodes a URL or text as a scannable SVG code, entirely in the browser.",
  "PresenceAvatars": "Shows who is here right now — overlapping avatars with online status dots.",
  "LiveCursor": "Floats a named collaborator pointer at x/y for realtime, multiplayer surfaces.",
  "Backdrop": "Decorative grid, blurred blobs and drifting particles behind a hero section.",
  "Breadcrumb": "Clickable trail showing where a page sits — put it atop every detail page.",
  "BreadcrumbItem": "One crumb in a trail, linking to a route or URL — or plain text when it is current.",
  "Navbar": "Product top bar built from NavbarItem links, with a brand and right-side actions.",
  "NavbarItem": "One link in a Navbar's centre row, with an icon and an active-page highlight.",
  "DropdownMenu": "Click-triggered list of actions hanging off a button — profile and row \"…\" menus.",
  "MenuItem": "One clickable row inside a dropdown menu, with icon, shortcut and danger styling.",
  "MenuSeparator": "Thin rule that splits a dropdown menu into groups of related actions.",
  "MenuLabel": "Small uppercase heading that titles a group of rows inside a dropdown menu.",
  "NavBar": "Marketing-page header built from Brand and NavLink nodes, with optional frosted blur.",
  "TabBar": "Bottom icon+label tab strip pinned for mobile — the phone-app style of navigation.",
  "BackToTop": "Floating button that appears after scrolling and glides the page back to the top.",
  "ScrollSpy": "Sticky in-page outline that highlights whichever section is currently on screen.",
  "Brand": "Logo, product name and version pill that link home — for headers and footers.",
  "Footer": "Site footer with brand, link columns, social icons and a copyright line.",
  "FooterColumn": "Titled column of links inside a Footer — one per section, like Product or Company.",
  "SkipLink": "Hidden-until-focused link letting keyboard users jump straight past the navigation.",
  "SectionBlock": "Groups answer content under a title, optional description and header-right controls.",
  "ListBlock": "Bulleted, numbered or checkmarked run of short lines — steps, summaries, key points.",
  "FollowUpBlock": "Row of tappable suggested prompts that keep the conversation moving after an answer.",
  "FollowUpItem": "One suggestion chip, pairing the visible label with the message it sends when picked.",
  "ActionLink": "Inline text link that runs an action on click instead of navigating anywhere.",
  "ChatBubble": "Single message bubble with author, time and delivery status for building transcripts.",
  "Hero": "Landing-page headline band with eyebrow, CTA buttons, and an optional image-backed cover.",
  "PageHeader": "Opens a dashboard or detail page with breadcrumbs, title, status, and an actions row.",
  "EmptyState": "Shows a friendly icon, message, and CTA when a list, search, or dashboard has no data.",
  "Timeline": "Vertical feed of dated events for activity streams, changelogs, and audit histories.",
  "TimelineItem": "One dated event on a Timeline: marker icon, title, time, and optional rich content.",
  "ActivityLog": "Who-did-what feed built from plain data objects; the audit variant adds monospace metadata.",
  "FeatureGrid": "Responsive grid of icon tiles for marketing feature highlights or section landing pages.",
  "FeatureItem": "One icon tile inside a FeatureGrid; add href to make it the doorway into that section.",
  "Testimonial": "Customer quote card with author, role, avatar, and star rating for social proof.",
  "ProfileCard": "Person card with avatar, role, bio, and actions — for team rosters and contact panels.",
  "Comment": "Single message bubble with avatar, author, timestamp, and reply/like toolbar buttons.",
  "Banner": "Full-width page-top announcement for promos, release notes, or downtime notices.",
  "Notification": "One alert row for notification trays: title, message, time, unread accent, and actions.",
  "InboxPanel": "Notification tray that groups alerts into Unread and Earlier with a mark-all-read action.",
  "OnboardingChecklist": "Setup checklist with automatic progress, for first-run dashboards and getting-started panels.",
  "MediaCard": "Image-topped card for article previews, product tiles, and project highlights.",
  "TopBar": "Compact header strip with title, search, and action slots above a panel or content pane.",
  "KanbanBoard": "Drag-and-drop task board that scrolls horizontally across its KanbanColumn children.",
  "KanbanColumn": "One status column on a Kanban board, with a card count, WIP limit, and header actions.",
  "KanbanCard": "One task on a Kanban board: title, description, tags, assignee, and tone accent.",
  "SectionHeader": "Introduces a section inside a Card with eyebrow, title, status badge, and actions.",
  "Toolbar": "Filter, search, and action row that sits above a table, list, grid, or board.",
  "DescriptionList": "Aligned key/value summary for detail pages — profiles, billing, and metadata panels.",
  "DescriptionItem": "One label/value pair in a DescriptionList; the value can be a Badge or any node.",
  "ActionStripe": "Tappable settings row with icon, label, trailing value, and chevron — stack for menus.",
  "StatusDot": "Colored status pip with a label for health indicators in toolbars, rows, and cells.",
  "PricingTable": "Side-by-side plan comparison grid — the centerpiece of a pricing or upgrade page.",
  "PricingCard": "One plan tier with price, feature bullets, and CTA; mark one featured to highlight it.",
  "LoadingState": "Full-card spinner with title and description while a query or long tool run is pending.",
  "ErrorState": "Full-card failure message with retry and support actions when content can't load.",
  "SuccessState": "Full-card confirmation for the end of a flow — order placed, payment done, verified.",
  "Tour": "Multi-step product walkthrough with Back/Next/Skip controls and progress dots.",
  "Spotlight": "Dims the page and rings one element to reveal a single new feature.",
  "LogoCloud": "Centered band of partner or customer logos — 'trusted by' and 'works with' sections.",
  "LogoChip": "One named logo chip inside a LogoCloud, built from an icon or a wordmark image.",
  "ProductCard": "E-commerce tile with photo, price, stars, and add-to-cart, plus sale and sold-out states.",
  "ShareButtons": "Row of social buttons plus copy-link for spreading a blog post or public page.",
  "AuthorByline": "Article credit line: avatar, writer's name, publish date, and reading time.",
  "CodeWindow": "IDE-style window around a code snippet, optionally running it live beside the source.",
  "BrowserFrame": "Wraps any UI in browser chrome with a URL bar, for screenshots and product demos.",
  "Terminal": "Mock shell window of monospace lines for install steps, CLI output, and build logs.",
  "ThemeToggle": "Sun/moon button that flips the app between light and dark themes, no host wiring.",
  "CopyButton": "Copies text to the clipboard and confirms it — for snippets, API keys, and links.",
  "RichTextEditor": "WYSIWYG editor with a formatting toolbar — comments, CMS bodies, email composers.",
  "CodeEditor": "Editable code pane with line numbers and tab indent — snippets, JSON settings, prompts.",
  "ContextMenu": "Right-click menu attached to any node — table rows, tree nodes, kanban cards, files.",
  "Sheet": "Panel that slides in from any edge over a dimmed backdrop, for side detail and forms.",
  "BottomSheet": "Mobile-style panel that rises from the bottom edge and swipes down to dismiss.",
  "ConfirmDialog": "Are-you-sure modal with confirm and cancel — guard deletes and other one-way actions.",
  "SpeedDial": "Floating button that fans out a handful of quick actions — compose, upload, invite.",
  "FloatingActionButton": "Single fixed round button pinned to a screen corner for the one primary action.",
  "AppShell": "Whole product layout in one call: left sidebar, optional top bar, scrolling main area.",
  "Sidebar": "Vertical nav panel with brand, grouped links, footer and a collapsible icon-only rail.",
  "SidebarSection": "Labelled group of nav links, for chunking long navigation into readable sections.",
  "SidebarItem": "One nav entry with icon, active highlight, count badge and a route to navigate to.",
  "SplitView": "Master/detail two-pane layout for inboxes, file browsers and contact lists.",
  "IconButton": "Compact icon-only control with a required accessible label — toolbars and row actions.",
  "CommandPalette": "Cmd-K overlay for searching and running actions from the keyboard — power-user navigation.",
  "FilterChips": "Row of removable pills showing the filters already applied, with a clear-all control.",
  "FilterPill": "Click-to-toggle pill for a filter bar — shows on/off state plus an optional match count.",
  "FieldRepeater": "Add/remove rows of the same fields — invoice lines, recipients, key/value pairs.",
  "VirtualList": "Renders only the visible rows so a list of thousands stays smooth to scroll.",
  "QueryBuilder": "Build AND/OR filter rules visually — field, operator, value, one row per condition.",
  "DiffViewer": "Compare two text blobs line by line, side-by-side or unified, with changes highlighted.",
  "JsonTree": "Inspect nested JSON as a collapsible tree — API responses, config, debug payloads.",
  "Gantt": "Plot tasks as dated bars on a timeline to show a project schedule and its progress.",
  "Truncate": "Clamp long text to a few lines with a “show more” toggle when it overflows.",
  "InlineEdit": "Click a value to edit it in place — rename a title without a separate form.",
  "NotificationBell": "Unread-count badge on a bell icon, opening a dropdown of recent alerts.",
  "Reveal": "Animates a section in the first time it scrolls into view — fade-up, zoom and friends.",
  "Transition": "Shows or hides a child with an animation as a boolean flips — modals, toasts, rows.",
  "FlipList": "Glides list items to their new spots when the order changes instead of jumping.",
  "Parallax": "Drifts a layer at a different speed as the page scrolls, for depth in hero sections.",
  "ReadingProgress": "Thin bar that fills as the reader scrolls — how far through an article they are.",
  "Sortable": "Drag rows into a new order — task lists, priorities, anything the user ranks.",
  "Draggable": "Wraps anything so it can be dragged, carrying a payload for a DropZone to receive.",
  "DropZone": "Target that receives a dragged item, with type filtering and a highlight on hover.",
  "OnGesture": "Adds swipe, long-press, double-tap and pan handlers to any component, keyboard included.",
  "NavLink": "Router link that highlights itself automatically when its route is the current page.",
  "RouteView": "Animates page changes, scrolls back to top and announces each new route to screen readers.",
  "Async": "Switches between loading, error, empty and data views for an $http request.",
  "Show": "Renders children only when a condition is true, with an optional fallback — inline if/else.",
  "Portal": "Escapes the parent subtree to render children at the app root — for overlays and popovers.",
  "Redirect": "Sends the user to another route immediately and unmounts the rest — for auth guards.",
  "Lazy": "Defers rendering until an async loader resolves, showing a fallback while it is pending.",
  "ErrorBoundary": "Catches rendering errors from its children and shows a fallback instead of a blank page.",
  "LiveRegion": "Announces changing text to screen readers — status messages, validation, async progress.",
  "FocusTrap": "Keeps keyboard focus inside its subtree while open — required for modals and dialogs.",
  "OnClick": "Makes any component clickable — cards, rows, tiles — with keyboard activation built in.",
  "OnMouse": "Attaches hover, drag-and-drop, wheel and right-click listeners to any component.",
  "OnKeyboard": "Attaches key listeners to any component, or registers an app-wide shortcut like Cmd+K.",
  "OnFocus": "Tracks focus entering or leaving a subtree — focus rings and autosave-on-blur flows.",
  "OnIntersect": "Fires when a component scrolls into view — infinite scroll, lazy loading, impressions.",
  "OnMount": "Hands you the real DOM node after render — measure it, focus it, or pass it to a library.",
  "Css": "Merges raw class names and inline styles onto a component when its props can't express it.",
  "Link": "Turns text or any component into a navigating link, in-app or outbound to a URL.",
  "Mount": "Hosts a third-party imperative widget (chart, map, editor) with setup/update/cleanup hooks.",
  "WebComponent": "Drops a native custom element into an app with reactive attributes and event hooks.",
  "HTMLTag": "Renders a raw HTML element with attributes and children when no built-in component fits.",
  "Styles": "Injects a raw CSS stylesheet, optionally scoped to one selector — last-resort styling.",
};

export const TAGS = {
  "Column": ["stack", "vertical", "vstack", "flex", "spacing", "page-body"],
  "Row": ["horizontal", "hstack", "inline", "toolbar", "flex", "justify"],
  "Center": ["middle", "align", "empty-state", "hero", "vertical-align"],
  "Stack": ["responsive", "direction", "breakpoint", "flex", "adaptive"],
  "StackItem": ["grow", "shrink", "flex-grow", "basis", "align-self", "fill"],
  "Grid": ["columns", "tiles", "cards", "auto-fit", "gallery", "responsive"],
  "GridItem": ["span", "colspan", "offset", "12-column", "cell", "dashboard"],
  "Box": ["padding", "margin", "border", "background", "wrapper", "surface", "spacing"],
  "Container": ["max-width", "centered", "page", "wrapper", "readable", "gutter"],
  "Spacer": ["gap", "fill", "push", "whitespace", "flex-grow"],
  "Card": ["panel", "surface", "tile", "box", "container", "widget"],
  "CardHeader": ["title", "heading", "subtitle", "eyebrow", "actions"],
  "CardFooter": ["actions", "buttons", "bottom", "toolbar", "confirm"],
  "CardSection": ["band", "tinted", "status", "group", "stripe", "region"],
  "Separator": ["divider", "hr", "rule", "line", "break"],
  "Tabs": ["tabbed", "panels", "switcher", "segmented", "navigation"],
  "TabItem": ["panel", "trigger", "label", "badge", "icon"],
  "Accordion": ["collapse", "expand", "disclosure", "faq", "toggle", "details"],
  "AccordionItem": ["collapse", "expand", "disclosure", "section", "panel", "toggle"],
  "Modal": ["dialog", "popup", "overlay", "confirm", "lightbox", "prompt"],
  "Drawer": ["sidebar", "panel", "slide-out", "offcanvas", "sheet", "flyout"],
  "Steps": ["stepper", "wizard", "progress", "checklist", "onboarding", "timeline"],
  "AspectRatio": ["ratio", "16-9", "video", "thumbnail", "embed", "proportion"],
  "ScrollArea": ["scroll", "overflow", "scrollbar", "logs", "max-height", "pane"],
  "Sticky": ["pinned", "fixed", "affix", "toolbar", "header", "scroll"],
  "ResizablePanels": ["split", "drag", "divider", "resize", "panes", "editor"],
  "MasonryGrid": ["pinterest", "gallery", "waterfall", "feed", "columns", "cards"],
  "Fragment": ["group", "wrapper", "siblings", "passthrough", "no-box"],
  "Section": ["band", "hero", "page", "marketing", "heading", "block"],
  "Split": ["two-column", "side-by-side", "media", "ratio", "panes", "sidebar"],
  "Bento": ["mosaic", "tiles", "asymmetric", "feature-grid", "showcase"],
  "BentoCell": ["tile", "span", "cell", "mosaic", "size"],
  "Overlay": ["layer", "badge", "ribbon", "floating", "on-top", "stacked"],
  "OverlayItem": ["anchor", "corner", "badge", "floating", "position", "layer"],
  "Text": ["label", "paragraph", "typography", "copy", "string", "caption"],
  "Image": ["picture", "photo", "img", "media", "thumbnail", "figure"],
  "Badge": ["tag", "chip", "label", "status", "count", "new"],
  "BadgeList": ["tags", "chips", "labels", "keywords", "cluster", "topics"],
  "Pill": ["status", "state", "tag", "chip", "tone", "label"],
  "Callout": ["alert", "notice", "warning", "banner", "info", "admonition"],
  "Quote": ["citation", "excerpt", "testimonial", "highlight", "attribution"],
  "CodeBlock": ["snippet", "syntax", "highlight", "source", "copy", "pre"],
  "Skeleton": ["loading", "placeholder", "shimmer", "ghost", "pending", "stub"],
  "Spinner": ["loading", "busy", "wait", "throbber", "indicator", "progress"],
  "LoadingDots": ["wait", "busy", "typing", "ellipsis", "indicator", "pending"],
  "Markdown": ["md", "richtext", "formatting", "article", "parser", "commonmark"],
  "Kbd": ["keyboard", "key", "shortcut", "hotkey", "keycap"],
  "Icon": ["glyph", "symbol", "fontawesome", "pictogram", "graphic"],
  "TextContent": ["legacy", "alias", "deprecated", "typography", "label"],
  "GradientText": ["highlight", "brand", "headline", "colorful", "accent", "emphasis"],
  "Display": ["hero", "headline", "title", "jumbo", "big", "h1"],
  "Heading": ["title", "h2", "section", "subtitle", "header", "semantic"],
  "Eyebrow": ["kicker", "overline", "label", "uppercase", "tagline"],
  "Prose": ["article", "longform", "blog", "typography", "docs", "richtext"],
  "RelativeTime": ["timeago", "timestamp", "date", "ago", "elapsed", "clock"],
  "Svg": ["vector", "graphic", "inline", "illustration", "shape", "path"],
  "VisuallyHidden": ["sr-only", "accessibility", "a11y", "screenreader", "offscreen", "label"],
  "KbdShortcut": ["hotkey", "keyboard", "combo", "keys", "chord", "keycap"],
  "CountUp": ["animate", "number", "stat", "odometer", "metric", "rollup"],
  "CountdownTimer": ["deadline", "launch", "clock", "urgency", "sale", "expiry"],
  "TableOfContents": ["toc", "outline", "index", "navigation", "anchors", "jump-links"],
  "Form": ["submit", "fields", "signup", "login", "validation", "entry"],
  "FormControl": ["label", "field", "hint", "error", "wrapper", "validation"],
  "FormSection": ["group", "section", "heading", "related", "helper", "subsection"],
  "FieldSet": ["legend", "group", "accessibility", "radio", "checkbox", "a11y"],
  "ValidationSummary": ["errors", "summary", "validation", "panel", "alert", "submit"],
  "RequirementList": ["requirements", "rules", "checklist", "password", "policy", "criteria", "validation", "met"],
  "Input": ["text", "textbox", "field", "email", "entry", "typing"],
  "TextArea": ["multiline", "textbox", "notes", "comment", "description", "rows"],
  "PasswordInput": ["secret", "login", "signup", "strength", "reveal", "credentials"],
  "MaskedInput": ["mask", "pattern", "phone", "format", "postcode", "credit-card"],
  "MentionInput": ["mention", "at", "comment", "people", "tagging", "composer"],
  "TagInput": ["tags", "chips", "keywords", "labels", "tokens", "multi-value"],
  "Select": ["dropdown", "picker", "options", "choose", "menu", "list"],
  "SelectItem": ["option", "choice", "dropdown", "item", "value", "optgroup"],
  "Combobox": ["autocomplete", "typeahead", "search", "dropdown", "picker", "filter"],
  "MultiSelect": ["multi", "chips", "tags", "dropdown", "picker", "checkboxes"],
  "Checkbox": ["tick", "boolean", "consent", "opt-in", "agree", "terms"],
  "CheckBoxGroup": ["checkboxes", "multi", "options", "permissions", "scopes", "group"],
  "CheckBoxItem": ["option", "item", "choice", "row", "scope", "group"],
  "Radio": ["radiogroup", "options", "exclusive", "single-select", "pick-one", "choice"],
  "Switch": ["toggle", "on-off", "setting", "boolean", "preference", "enable"],
  "ToggleGroup": ["toggle", "segmented", "view-mode", "filter", "toolbar", "switcher"],
  "Button": ["click", "action", "cta", "submit", "link", "press"],
  "Buttons": ["actions", "row", "group", "toolbar", "save-cancel", "footer"],
  "ButtonGroup": ["segmented", "joined", "toolbar", "split-button", "actions", "switcher"],
  "InputGroup": ["addon", "prefix", "suffix", "icon", "affix", "wrapper"],
  "SearchBar": ["search", "filter", "query", "find", "magnifier", "lookup"],
  "Slider": ["range", "numeric", "drag", "volume", "filter", "scale"],
  "NumberInput": ["number", "stepper", "quantity", "spinner", "increment", "numeric"],
  "ColorPicker": ["hex", "swatch", "palette", "theme", "rgb", "brand"],
  "DatePicker": ["date", "calendar", "day", "deadline", "due", "iso"],
  "DateRangePicker": ["range", "from-to", "period", "calendar", "dates", "booking"],
  "TimePicker": ["time", "clock", "hour", "schedule", "appointment", "minutes"],
  "DateTimePicker": ["datetime", "calendar", "clock", "schedule", "timestamp", "appointment"],
  "FileUpload": ["file", "attachment", "dropzone", "browse", "import", "avatar"],
  "PinInput": ["otp", "2fa", "code", "verification", "digits", "passcode"],
  "MultiStepForm": ["wizard", "steps", "stepper", "onboarding", "checkout", "paged"],
  "SegmentedControl": ["tabs", "switcher", "toggle", "view-mode", "pills", "options"],
  "QuantityStepper": ["quantity", "counter", "cart", "plus-minus", "increment", "basket"],
  "VariantSelector": ["product", "size", "colour", "swatch", "ecommerce", "options"],
  "Swatch": ["theme", "palette", "colour", "tile", "preview", "skin"],
  "DrawingCanvas": ["draw", "sketch", "paint", "canvas", "freehand", "annotate"],
  "SignaturePad": ["sign", "signing", "contract", "consent", "handwriting", "esign"],
  "ReactionPicker": ["emoji", "reaction", "like", "upvote", "feedback", "social"],
  "Table": ["grid", "rows", "columns", "tabular", "spreadsheet", "report"],
  "Col": ["cell", "header", "field", "tabular", "format", "align"],
  "DataGrid": ["sortable", "filter", "pagination", "selection", "spreadsheet", "export"],
  "List": ["rows", "menu", "items", "vertical", "feed", "settings"],
  "ListItem": ["row", "entry", "option", "icon", "link", "line"],
  "StatCard": ["kpi", "metric", "dashboard", "number", "trend", "summary"],
  "Stats": ["kpi", "metrics", "dashboard", "summary", "strip", "overview"],
  "Sparkline": ["trend", "microchart", "inline", "mini", "line", "graph"],
  "Tile": ["icon", "shortcut", "menu", "category", "button", "square"],
  "Progress": ["bar", "loading", "percent", "completion", "upload", "steps"],
  "ProgressRing": ["circle", "donut", "percent", "quota", "completion", "radial"],
  "Pagination": ["pager", "pages", "next", "previous", "paging", "navigation"],
  "Tree": ["hierarchy", "folder", "nested", "explorer", "outline", "branch"],
  "TreeNode": ["node", "branch", "leaf", "folder", "hierarchy", "row"],
  "CalendarView": ["schedule", "events", "agenda", "week", "month", "planner"],
  "ComparisonTable": ["compare", "features", "plans", "matrix", "specs", "pricing"],
  "InfiniteList": ["scroll", "load-more", "feed", "lazy", "endless", "paging"],
  "VirtualGrid": ["virtualized", "windowing", "gallery", "performance", "thumbnails", "scroll"],
  "Metric": ["number", "counter", "kpi", "statistic", "hero", "figure"],
  "MetricStrip": ["numbers", "band", "kpi", "landing", "showcase", "row"],
  "Calendar": ["schedule", "booking", "month", "dates", "availability", "events"],
  "OrderSummary": ["checkout", "invoice", "receipt", "totals", "billing", "basket"],
  "Cart": ["basket", "shop", "ecommerce", "checkout", "quantity", "items"],
  "PriceTag": ["cost", "money", "currency", "discount", "amount", "sale"],
  "BarChart": ["bars", "comparison", "categories", "column", "graph", "stacked"],
  "LineChart": ["trend", "area", "timeseries", "graph", "plot", "series"],
  "PieChart": ["donut", "proportion", "share", "percentage", "slices", "breakdown"],
  "RadarChart": ["spider", "web", "scorecard", "polygon", "skills", "comparison"],
  "ScatterChart": ["xy", "points", "correlation", "distribution", "plot", "cloud"],
  "Histogram": ["distribution", "bins", "frequency", "buckets", "spread", "statistics"],
  "Heatmap": ["matrix", "intensity", "grid", "correlation", "density", "calendar"],
  "Gauge": ["dial", "meter", "kpi", "speedometer", "threshold", "indicator"],
  "Series": ["dataset", "values", "legend", "points", "line", "group"],
  "Avatar": ["profile", "user", "picture", "initials", "photo", "person"],
  "AvatarGroup": ["team", "members", "facepile", "overflow", "collaborators", "stack"],
  "PersonChip": ["user", "assignee", "member", "profile", "contact", "mention"],
  "Tooltip": ["hint", "hover", "help", "title", "popup", "label"],
  "HoverCard": ["preview", "hover", "peek", "profile", "popup", "card"],
  "Popover": ["flyout", "panel", "popup", "overlay", "picker", "click"],
  "Rating": ["stars", "review", "score", "feedback", "vote", "testimonial"],
  "Toast": ["notification", "snackbar", "alert", "message", "flash", "transient"],
  "Toasts": ["notifications", "stack", "container", "queue", "snackbar", "corner"],
  "VideoPlayer": ["video", "media", "play", "mp4", "embed", "clip"],
  "AudioPlayer": ["audio", "sound", "music", "podcast", "play", "mp3"],
  "Carousel": ["slider", "slideshow", "slides", "banner", "swipe", "rotator"],
  "Gallery": ["images", "grid", "photos", "thumbnails", "album", "tiles"],
  "Lightbox": ["overlay", "fullscreen", "viewer", "zoom", "photos", "modal"],
  "Map": ["location", "geo", "openstreetmap", "markers", "pins", "address"],
  "TypingIndicator": ["chat", "dots", "composing", "messaging", "presence", "animation"],
  "Confetti": ["celebration", "particles", "success", "party", "animation", "reward"],
  "Lottie": ["animation", "bodymovin", "json", "vector", "motion", "illustration"],
  "QRCode": ["scan", "barcode", "link", "share", "svg", "offline"],
  "PresenceAvatars": ["online", "presence", "collaboration", "team", "status", "active"],
  "LiveCursor": ["collaboration", "multiplayer", "pointer", "realtime", "presence", "mouse"],
  "Backdrop": ["hero", "background", "particles", "gradient", "decorative", "marketing"],
  "Breadcrumb": ["trail", "path", "hierarchy", "location", "crumbs", "wayfinding"],
  "BreadcrumbItem": ["crumb", "link", "step", "route", "segment", "path"],
  "Navbar": ["header", "topbar", "appbar", "menu", "masthead", "links"],
  "NavbarItem": ["link", "nav-link", "route", "tab", "header", "entry"],
  "DropdownMenu": ["menu", "actions", "context-menu", "overflow", "kebab", "flyout"],
  "MenuItem": ["action", "option", "entry", "command", "shortcut", "row"],
  "MenuSeparator": ["divider", "rule", "line", "group", "spacer", "hr"],
  "MenuLabel": ["heading", "section", "group", "title", "caption", "category"],
  "NavBar": ["landing", "marketing", "site-nav", "header", "sticky", "blur"],
  "TabBar": ["mobile", "bottom-nav", "tabs", "icons", "switcher", "app"],
  "BackToTop": ["scroll", "top", "floating", "fab", "jump", "anchor"],
  "ScrollSpy": ["toc", "outline", "anchors", "sections", "on-this-page", "jumplist"],
  "Brand": ["logo", "wordmark", "identity", "name", "home", "masthead"],
  "Footer": ["site-footer", "bottom", "links", "legal", "copyright", "sitemap"],
  "FooterColumn": ["links", "column", "group", "section", "list", "sitemap"],
  "SkipLink": ["accessibility", "a11y", "keyboard", "skip", "focus", "bypass"],
  "SectionBlock": ["heading", "title", "group", "panel", "segment", "container"],
  "ListBlock": ["bullets", "steps", "checklist", "numbered", "ordered", "summary"],
  "FollowUpBlock": ["suggestions", "prompts", "chips", "next-steps", "quick-replies", "conversation"],
  "FollowUpItem": ["suggestion", "prompt", "chip", "reply", "label", "message"],
  "ActionLink": ["button", "inline", "click", "hyperlink", "trigger", "command"],
  "ChatBubble": ["message", "messaging", "transcript", "conversation", "thread", "speech"],
  "Hero": ["landing", "marketing", "headline", "cta", "masthead", "jumbotron"],
  "PageHeader": ["breadcrumbs", "page-title", "masthead", "actions", "dashboard", "detail-page"],
  "EmptyState": ["zero-state", "no-data", "no-results", "placeholder", "blank-slate", "nothing-found"],
  "Timeline": ["activity", "history", "feed", "changelog", "events", "chronology"],
  "TimelineItem": ["event", "entry", "activity", "milestone", "history", "step"],
  "ActivityLog": ["audit", "feed", "history", "events", "trail", "who-did-what"],
  "FeatureGrid": ["features", "benefits", "marketing", "tiles", "highlights", "capabilities"],
  "FeatureItem": ["feature", "tile", "benefit", "highlight", "capability", "icon-card"],
  "Testimonial": ["quote", "review", "social-proof", "customer", "endorsement", "praise"],
  "ProfileCard": ["user", "person", "team", "avatar", "contact", "member", "roster"],
  "Comment": ["reply", "discussion", "thread", "message", "feedback", "conversation"],
  "Banner": ["announcement", "promo", "notice", "alert", "ribbon", "release-notes"],
  "Notification": ["alert", "unread", "inbox", "message", "notice", "bell"],
  "InboxPanel": ["notifications", "alerts", "tray", "unread", "messages", "bell"],
  "OnboardingChecklist": ["checklist", "setup", "getting-started", "progress", "wizard", "first-run"],
  "MediaCard": ["image", "article", "preview", "thumbnail", "gallery", "blog", "photo"],
  "TopBar": ["appbar", "header-strip", "toolbar", "search", "sticky", "chrome"],
  "KanbanBoard": ["board", "tasks", "backlog", "workflow", "columns", "drag-drop", "sprint"],
  "KanbanColumn": ["column", "lane", "swimlane", "status", "board", "wip-limit"],
  "KanbanCard": ["task", "ticket", "issue", "story", "assignee", "board"],
  "SectionHeader": ["subheading", "panel-title", "eyebrow", "card-title", "section", "sub-header"],
  "Toolbar": ["filters", "search", "actions", "controls", "action-bar", "view-switcher"],
  "DescriptionList": ["key-value", "details", "metadata", "summary", "specs", "attributes"],
  "DescriptionItem": ["key-value", "label", "field", "detail-row", "metadata", "property"],
  "ActionStripe": ["settings", "menu-row", "drill-down", "navigation", "chevron", "preferences"],
  "StatusDot": ["status", "indicator", "health", "online", "live", "pip", "uptime"],
  "PricingTable": ["pricing", "plans", "tiers", "subscription", "upgrade", "compare"],
  "PricingCard": ["plan", "tier", "price", "subscription", "upgrade", "package"],
  "LoadingState": ["loading", "spinner", "busy", "pending", "fetching", "in-flight"],
  "ErrorState": ["error", "failure", "retry", "broken", "problem", "went-wrong"],
  "SuccessState": ["success", "confirmation", "done", "complete", "thank-you", "receipt"],
  "Tour": ["walkthrough", "onboarding", "guide", "steps", "coachmark", "intro"],
  "Spotlight": ["highlight", "coachmark", "feature-reveal", "overlay", "whats-new", "onboarding"],
  "LogoCloud": ["logos", "brands", "trusted-by", "partners", "customers", "integrations"],
  "LogoChip": ["logo", "brand", "partner", "integration", "wordmark", "vendor"],
  "ProductCard": ["ecommerce", "shop", "price", "store", "cart", "catalog", "storefront"],
  "ShareButtons": ["social", "twitter", "linkedin", "copy-link", "social-media", "facebook"],
  "AuthorByline": ["credit", "blog", "article", "writer", "attribution", "publish-date", "reading-time"],
  "CodeWindow": ["code", "snippet", "editor", "ide", "syntax", "source", "playground"],
  "BrowserFrame": ["mockup", "screenshot", "chrome", "demo", "website", "url-bar", "device-frame"],
  "Terminal": ["shell", "cli", "console", "bash", "command-line", "logs"],
  "ThemeToggle": ["dark-mode", "light-mode", "theme", "switcher", "appearance", "night-mode"],
  "CopyButton": ["clipboard", "duplicate", "snippet", "api-key", "paste", "share-link"],
  "RichTextEditor": ["wysiwyg", "html", "formatting", "compose", "toolbar", "content"],
  "CodeEditor": ["source", "textarea", "syntax", "gutter", "snippet", "ide", "json"],
  "ContextMenu": ["right-click", "dropdown", "actions", "overflow", "popup", "long-press"],
  "Sheet": ["drawer", "slide-in", "panel", "side-panel", "overlay", "modal"],
  "BottomSheet": ["mobile", "drawer", "swipe", "tray", "overlay", "modal"],
  "ConfirmDialog": ["confirmation", "alert", "delete", "destructive", "prompt", "yes-no"],
  "SpeedDial": ["fab", "quick-actions", "menu", "floating", "expand", "shortcut"],
  "FloatingActionButton": ["fab", "floating", "primary-action", "corner", "compose", "sticky"],
  "AppShell": ["layout", "dashboard", "saas", "scaffold", "frame", "admin"],
  "Sidebar": ["navigation", "nav", "menu", "rail", "drawer", "left-nav"],
  "SidebarSection": ["group", "navigation", "menu", "heading", "category", "divider"],
  "SidebarItem": ["nav-link", "menu-entry", "navigation", "link", "badge", "route"],
  "SplitView": ["master-detail", "two-pane", "inbox", "list-detail", "panes", "columns"],
  "IconButton": ["icon", "toolbar", "action", "toggle", "compact", "control"],
  "CommandPalette": ["cmd-k", "search", "shortcut", "launcher", "spotlight", "quick-open"],
  "FilterChips": ["pills", "tags", "remove", "facets", "applied", "dismiss"],
  "FilterPill": ["toggle", "facet", "chip", "refine", "segmented", "active"],
  "FieldRepeater": ["dynamic-form", "rows", "add-remove", "line-items", "repeat", "inputs"],
  "VirtualList": ["virtualization", "windowing", "performance", "large-data", "scroll", "infinite"],
  "QueryBuilder": ["rules", "conditions", "advanced-search", "predicate", "segments", "logic"],
  "DiffViewer": ["compare", "changes", "git", "revisions", "before-after", "side-by-side"],
  "JsonTree": ["inspector", "viewer", "object", "debug", "api-response", "collapsible"],
  "Gantt": ["timeline", "schedule", "project", "roadmap", "tasks", "planning"],
  "Truncate": ["clamp", "ellipsis", "show-more", "expand", "collapse", "overflow"],
  "InlineEdit": ["edit-in-place", "rename", "click-to-edit", "editable", "quick-edit", "field"],
  "NotificationBell": ["alerts", "inbox", "unread", "badge", "dropdown", "activity"],
  "Reveal": ["scroll-animation", "fade-in", "entrance", "motion", "viewport", "stagger"],
  "Transition": ["show-hide", "enter-exit", "animate", "mount", "fade", "slide"],
  "FlipList": ["reorder", "animate", "shuffle", "stagger", "list-animation", "sorting"],
  "Parallax": ["scroll", "depth", "hero", "motion", "background", "layer"],
  "ReadingProgress": ["scroll-indicator", "article", "docs", "scrollbar", "completion", "bar"],
  "Sortable": ["drag-and-drop", "reorder", "rank", "dnd", "move", "handle"],
  "Draggable": ["drag-and-drop", "dnd", "payload", "move", "kanban", "pickup"],
  "DropZone": ["drag-and-drop", "dnd", "target", "upload", "kanban", "accept"],
  "OnGesture": ["swipe", "touch", "long-press", "pan", "mobile", "double-tap"],
  "NavLink": ["navigation", "anchor", "menu", "active", "href", "page"],
  "RouteView": ["transition", "animation", "router", "page", "scroll", "navigation"],
  "Async": ["fetch", "loading", "http", "request", "empty-state", "error"],
  "Show": ["conditional", "if", "toggle", "visibility", "when", "hide"],
  "Portal": ["overlay", "teleport", "layer", "modal", "popover", "detach"],
  "Redirect": ["navigate", "route", "router", "guard", "forward", "auth"],
  "Lazy": ["defer", "async", "promise", "suspense", "loading", "code-split"],
  "ErrorBoundary": ["error", "catch", "fallback", "crash", "exception", "recovery"],
  "LiveRegion": ["aria", "accessibility", "screen-reader", "announce", "a11y", "status"],
  "FocusTrap": ["focus", "keyboard", "modal", "dialog", "tab", "accessibility", "a11y"],
  "OnClick": ["click", "tap", "press", "clickable", "handler", "event"],
  "OnMouse": ["hover", "mouse", "drag", "drop", "pointer", "wheel", "context-menu"],
  "OnKeyboard": ["keyboard", "key", "shortcut", "hotkey", "keydown", "keypress"],
  "OnFocus": ["focus", "blur", "focusin", "autosave", "accessibility", "a11y"],
  "OnIntersect": ["scroll", "viewport", "visibility", "infinite-scroll", "observer", "lazy-load", "impression"],
  "OnMount": ["ref", "lifecycle", "dom", "mount", "unmount", "node", "effect"],
  "Css": ["class", "inline-style", "override", "styling", "custom", "tweak"],
  "Link": ["anchor", "href", "navigate", "url", "route", "hyperlink"],
  "Mount": ["imperative", "third-party", "widget", "chart", "map", "embed", "lifecycle"],
  "WebComponent": ["custom-element", "third-party", "embed", "hydrate", "native", "element"],
  "HTMLTag": ["html", "markup", "raw", "element", "semantic", "custom"],
  "Styles": ["css", "stylesheet", "inject", "custom-css", "selector", "override"],
};

export const GROUP_BLURBS = {
  "Layout": "Containers that arrange everything else on the page — stacks, grids, cards, panels, dialogs, and dividers.",
  "Content": "Text, headings, badges, code, icons and loading placeholders — the everyday building blocks of a page.",
  "Forms": "Inputs, pickers, toggles and buttons for collecting, validating and submitting what a user enters.",
  "Data": "Tables, lists, trees, KPI tiles and calendars for showing records, metrics and orders.",
  "Charts": "Bars, lines, pies, scatter, heatmaps and gauges for turning numbers into a picture.",
  "Feedback & Media": "People, hints, notices and rich media: avatars, tooltips, toasts, players, maps and animations.",
  "Navigation": "Getting around: breadcrumbs, top bars, dropdown menus, tab bars, footers and in-page outlines.",
  "Chat": "Message bubbles, titled blocks and suggestion chips for composing conversational replies.",
  "Patterns": "Opinionated composites that pack a whole UI idiom — page headers, boards, pricing, empty states — in one call.",
  "Editors & overlays": "Text and code editors plus the surfaces that float over a page: sheets, confirm dialogs, menus, FABs.",
  "App shell": "Complete product surfaces — sidebar navigation, top bar and master/detail panes in one statement.",
  "Advanced UI": "Power-user widgets and motion: command palettes, filters, diffs, virtual lists, drag-and-drop, animation.",
  "Routing": "Path-aware links and animated page views that wire a multi-page app to the runtime router.",
  "Helpers": "Control-flow and accessibility utilities that wrap a subtree — conditionals, async states, portals, focus.",
  "Behaviour wrappers": "Wrap any component to add clicks, hover, keyboard, visibility, lifecycle, links, or raw styling.",
  "Interop": "Bridges to imperative and third-party libraries that own their own DOM — charts, maps, editors.",
  "Escape hatches": "Last-resort primitives for raw HTML and CSS when no standard component can express the markup.",
};

export const OVERLAY_PREVIEW = new Set([
  "Modal",
  "Drawer",
  "Lightbox",
  "Tour",
  "Spotlight",
  "ContextMenu",
  "CommandPalette",
  "DropdownMenu",
  "MenuLabel",
  "MenuSeparator",
  "MenuItem",
  "Popover",
  "MultiSelect",
  "Combobox",
  "HoverCard",
  "NotificationBell",
  "MentionInput",
  "Sheet",
  "BottomSheet",
  "ConfirmDialog",
  "SpeedDial",
  "FloatingActionButton",
  "BackToTop",
  "Toast",
  "Toasts",
  "Select",
  "SelectItem",
  "DatePicker",
  "DateRangePicker",
  "TimePicker",
  "DateTimePicker",
  "ColorPicker",
  "Tooltip",
  "Overlay",
  "OverlayItem",
  "Backdrop",
  "Portal",
]);

export const SAMPLES = {

  /* ── Layout ─────────────────────────────────────────────── */
  "Column": `$app(Column([
  Card([CardHeader("Revenue", { subtitle: "€48,210 this month" })]),
  Card([CardHeader("Active users", { subtitle: "12,480 in the last 30 days" })]),
  Card([CardHeader("Open tickets", { subtitle: "17 awaiting a first reply" })])
], { gap: "md" }))`,
  "Row": `$app(Row([
  Text("Inbox", { variant: "large-heavy" }),
  Spacer(),
  Button("Filter", { variant: "ghost" }),
  Button("Compose", { variant: "primary" })
], { gap: "sm" }))`,
  "Center": `$app(Center([
  EmptyState("No results", { description: "Try a different search term." })
], { minHeight: "180px" }))`,
  "Stack": `$app(Stack([
  Card([CardHeader("Filters"), Text("Sits above the results on a phone.")]),
  Card([CardHeader("Results"), Text("Moves beside the filters from md up.")])
], { direction: { base: "column", md: "row" }, gap: "md" }))`,
  "StackItem": `$app(Row([
  Badge("Fixed", { tone: "info" }),
  StackItem(Input("search", { placeholder: "This input grows to fill the row" }), { grow: 1 }),
  Button("Action", { variant: "primary" })
], { gap: "md" }))`,
  "Grid": `$app(Grid([
  Card([CardHeader("Requests", { subtitle: "1.24M today" })]),
  Card([CardHeader("Error rate", { subtitle: "0.12%" })]),
  Card([CardHeader("p95 latency", { subtitle: "184 ms" })])
], { columns: 3, gap: "md" }))`,
  "GridItem": `$app(Grid([
  GridItem(Card([CardHeader("Sidebar"), Text("1/4 width.")]), { span: "1/4" }),
  GridItem(Card([CardHeader("Main content"), Text("3/4 width.")]), { span: "3/4" })
], { columns: 12, gap: "md" }))`,
  "Box": `$app(Column([
  Box([Text("Maintenance window: Thursday 02:00–04:00 UTC.")], { padding: "md", background: "info", border: "subtle", radius: "md" }),
  Box([Text("Draft — not yet reviewed by legal.")], { padding: "md", background: "muted", border: "default", radius: "md" })
], { gap: "md" }))`,
  "Container": `$app(Container([
  Card([CardHeader("Centred content", { subtitle: "Wrapped in Container size=md" })])
], { size: "md" }))`,
  "Spacer": `$app(Row([
  Text("Left edge"),
  Spacer(),
  Text("Right edge")
], { gap: "md" }))`,
  "Card": `$app(Card([
  CardHeader("Nightly backup", { subtitle: "Completed 03:12 UTC" }),
  Text("Snapshot stored in eu-central-1 — 42.6 GB."),
  CardFooter([Button("View log", { variant: "primary", size: "small" })])
]))`,
  "CardHeader": `$app(Card([
  CardHeader("Checkout API", { eyebrow: "Service", subtitle: "v3.2 · eu-central-1", actions: [Badge("Healthy", { tone: "success" })] }),
  Text("Handles 1.2M payment intents per day.")
]))`,
  "CardFooter": `$app(Card([
  CardHeader("Invite teammates", { subtitle: "3 seats left on your plan" }),
  Text("They will join the Engineering workspace."),
  CardFooter([
    Button("Cancel", { variant: "ghost", size: "small" }),
    Button("Send invites", { variant: "primary", size: "small" })
  ], { justify: "between" })
]))`,
  "CardSection": `$app(Card([
  CardHeader("Production cluster"),
  CardSection([Text("Rolling update in progress — 3 of 8 nodes drained.")], { tone: "activating" }),
  CardSection([Text("Last backup completed 20 minutes ago.")], { tone: "success" }),
  CardSection([Text("TLS certificate expires in 6 days.")], { tone: "warning" })
]))`,
  "Separator": `$app(Stack([
  Text("Above the separator"),
  Separator({ orientation: "horizontal" }),
  Text("Below the separator"),
  Separator({ orientation: "horizontal", label: "OR" }),
  Text("After a labelled separator")
]))`,
  "Tabs": `$app(Tabs([
  TabItem("overview", { label: "Overview", children: [Text("Overview tab content.")] }),
  TabItem("details",  { label: "Details",  children: [Text("Details tab content.")] })
]))`,
  "TabItem": `$app(Tabs([
  TabItem("inbox", { label: "Inbox", icon: "inbox", badge: "12", children: [Text("12 unread messages.")] }),
  TabItem("sent", { label: "Sent", icon: "paper-plane", children: [Text("Nothing sent today.")] }),
  TabItem("archive", { label: "Archive", icon: "box-archive", disabled: true, children: [Text("Archive is read-only.")] })
]))`,
  "Accordion": `$app(Accordion([
  AccordionItem("Open by default", { children: [Markdown("This **AccordionItem** has open=true.")], open: true }),
  AccordionItem("Another question", { children: [Markdown("Click to reveal the answer.")] }),
  AccordionItem("And one more",    { children: [Markdown("Stacks as a sequence of disclosures.")] })
], { showArrow: true }))`,
  "AccordionItem": `$app(Accordion([
  AccordionItem("Domain verified", { children: [Text("DNS records confirmed on 3 Aug 2026.")], variant: "success", open: true }),
  AccordionItem("Billing address missing", { children: [Text("Add a VAT ID before the next invoice.")], variant: "warning" })
], { showArrow: true }))`,
  "Modal": `$app(dialog, openBtn)

dialog = Modal("Delete project", { open: $confirmOpen, children: [
  Text("Atlas API and its 3 environments will be removed permanently.")
], size: "sm", footer: [
  Button("Cancel", { variant: "ghost", size: "small", onClick: () => { $confirmOpen = false } }),
  Button("Delete", { variant: "primary", size: "small", onClick: () => { $confirmOpen = false } })
]})

openBtn = Button("Delete project", { variant: "ghost", onClick: () => { $confirmOpen = true } })

$confirmOpen = false`,
  "Drawer": `$app(drawer, openBtn)

drawer = Drawer("Filter results", { open: $filtersOpen, children: [
  Text("Narrow the list by status, owner, and date.")
], side: "right", width: "360px" })

openBtn = Button("Open filters", { variant: "primary", onClick: () => { $filtersOpen = true } })

$filtersOpen = true`,
  "Steps": `$app(Steps([
  {title: "Sign up", details: "Free", active: false},
  {title: "Verify",  details: "Email link", active: true},
  {title: "Invite"}
]))`,
  "AspectRatio": `$app(AspectRatio("16:9", { children: [
  Image("https://images.unsplash.com/photo-1551434678-e076c223a692?w=960&q=80", { alt: "Demo image" })
] }))`,
  "ScrollArea": `$app(ScrollArea([
  Text("09:12:04  build started — commit 8f2a1c9"),
  Text("09:12:41  412 unit tests passed"),
  Text("09:13:10  bundling assets"),
  Text("09:13:58  deploying to eu-central-1"),
  Text("09:14:22  health check OK"),
  Text("09:14:23  release v3.2.1 is live")
], { height: "120px" }))`,
  "Sticky": `$app(ScrollArea([
  Sticky([Banner("Sticky banner", { description: "Stays pinned while you scroll.", icon: "thumbtack", tone: "primary" })], { side: "top" }),
  Stack([
    Card([CardHeader("Block 1"), Text("Scroll down to see the banner stay put.")]),
    Card([CardHeader("Block 2"), Text("More content.")]),
    Card([CardHeader("Block 3"), Text("Keep scrolling.")]),
    Card([CardHeader("Block 4"), Text("Almost done.")])
  ])
], { height: "260px" }))`,
  "ResizablePanels": `$app(ResizablePanels(
  [Card([CardHeader("Files"), List([
    ListItem("README.md", { meta: "Edited 2m ago" }),
    ListItem("package.json", { meta: "Edited 1h ago" }),
    ListItem("src/index.ts", { meta: "Edited 3h ago" })
  ])])],
  { secondary: [Card([CardHeader("Preview"), CodeBlock("typescript", { code: "const greet = (name) => 'Hello, ' + name + '!'\\n\\ngreet('Ada')" })])],
  initialPrimaryWidth: "240px" }
))`,
  "MasonryGrid": `$app(MasonryGrid([
  Card([CardHeader("Short note"), Text("Just a line.")]),
  Card([CardHeader("Longer note"), Text("This note has a bit more content to demonstrate uneven heights.")]),
  Card([CardHeader("Another"), Text("Masonry packs them efficiently.")]),
  Card([CardHeader("Medium"), Text("Two sentences here. Just enough to look different.")]),
  Card([CardHeader("Tiny")])
], { columns: 3 }))`,
  "Fragment": `$app(Grid([
  Fragment([
    Card([CardHeader("Berlin")]),
    Card([CardHeader("Hamburg")])
  ]),
  Card([CardHeader("Munich")])
], { columns: 3, gap: "md" }))`,
  "Section": `$app(Section([
  MetricStrip([
    Metric("12k", { label: "Stars" }),
    Metric("98%", { label: "Uptime" }),
    Metric("4.9", { label: "Rating" })
  ])
], { eyebrow: "Loved by teams", title: "Numbers that matter", subtitle: "A page band with eyebrow, title, and subtitle.", background: "soft", align: "center" }))`,
  "Split": `$app(Split(
  Card([CardHeader("Left pane"), Text("Primary content.")]),
  Card([CardHeader("Right pane"), Text("Secondary content.")]),
  { ratio: "3/2", gap: "lg", divider: true }
))`,
  "Bento": `$app(Bento([
  BentoCell(Card([CardHeader("Hero", { subtitle: "span: hero (2×2)" }), Text("The marquee cell — give it your headline feature.")], { gap: "sm" }), { span: "hero" }),
  BentoCell(Card([CardHeader("Wide", { subtitle: "span: 2x1" })]), { span: "2x1" }),
  BentoCell(Card([CardHeader("Tile A")])),
  BentoCell(Card([CardHeader("Tile B")])),
  BentoCell(Card([CardHeader("Tall", { subtitle: "span: tall (1×2)" }), Text("Grows two rows.")], { gap: "sm" }), { span: "tall" }),
  BentoCell(Card([CardHeader("Tile C")])),
  BentoCell(Card([CardHeader("Full-width strip", { subtitle: "span: full" })]), { span: "full" })
], { columns: 4, gap: "md", rowHeight: "minmax(96px, auto)" }))`,
  "BentoCell": `$app(Bento([
  BentoCell(Card([CardHeader("Featured", { subtitle: "2 columns wide" })]), { span: "2x1" }),
  BentoCell(Card([CardHeader("Side")])),
  BentoCell(Card([CardHeader("Banner", { subtitle: "always full row" })]), { span: "full" })
], { columns: 3 }))`,
  "Overlay": `$app(Overlay(
  Image("https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=640", { alt: "Cover", aspectRatio: "16:9" }),
  [
    OverlayItem(Badge("New", { tone: "primary" }), { anchor: "top-left", offset: "12px" }),
    OverlayItem(Button("Play", { variant: "primary", size: "small" }), { anchor: "center" })
  ]
))`,
  "OverlayItem": `$app(Overlay(
  Card([CardHeader("Base content"), Text("The OverlayItem floats on top.")]),
  [OverlayItem(Badge("99+", { tone: "danger" }), { anchor: "top-right", offset: "8px" })]
))`,

  /* ── Content ─────────────────────────────────────────────── */
  "Text": `$app(Stack([
  Text("Small text.",        { variant: "small" }),
  Text("Body text.",         { variant: "body" }),
  Text("Large heavy text.",  { variant: "large-heavy" }),
  Text("Styled.",            { style: "font-size: 18px; font-weight: 600; color: #6366f1;" }),
  Text("Heading variant.",   { variant: "heading", tone: "primary" })
]))`,
  "Image": `$app(Image("https://images.unsplash.com/photo-1517022812141-23620dba5c23?auto=format&w=600&h=300",
{ alt: "Hero photo", caption: "Self-constrained 16:9 image", ratio: "16:9", fit: "cover" }))`,
  "Badge": `$app(Stack([
  Badge("Default"),
  Badge("Primary", { tone: "primary" }),
  Badge("Success", { tone: "success" }),
  Badge("Warning", { tone: "warning" }),
  Badge("Danger",  { tone: "danger" }),
  Badge("Info",    { tone: "info" })
], { direction: "row", gap: "sm", align: "center" }))`,
  "BadgeList": `$app(BadgeList(["React", "Vue", "Svelte", "Solid"], { tone: "primary", size: "sm" }))`,
  "Pill": `$app(Row([
  Pill("SSL active", "success", "lock"),
  Pill("Deploying", "activating", "arrows-rotate"),
  Pill("Quota near limit", "warning"),
  Pill("Build failed", "critical"),
  Pill("Draft", "neutral")
], { gap: "sm" }))`,
  "Callout": `$app(Stack([
  Callout("success", { title: "Saved", text: "Your settings were saved." }),
  Callout("warning", { title: "Heads up", text: "Compact note style", compact: true })
]))`,
  "Quote": `$app(Quote(
  "Aktion took our recap email from 4k lines of glue to 40.",
  { attribution: "Naomi · last QBR", tone: "primary" }
))`,
  "CodeBlock": `$app(Stack([
  CodeBlock("function greet(name) {\\n  return 'Hello, ' + name + '!'\\n}\\n\\ngreet('Ada')", { language: "ts", showLineNumbers: true, highlightLines: "1-3" }),
  Text("header: false — chromeless, sized, and scrollable:", { variant: "small", tone: "muted" }),
  CodeBlock("$total = 0\\nfor (const line of $items) {\\n  $total = $total + line.price * line.qty\\n}\\n$app(Text(\\"Total: \\" + $total))", { language: "aktion", header: false, height: "96px" })
], { gap: "md" }))`,
  "Skeleton": `$app(Stack([
  Skeleton("card"),
  Stack([Skeleton("avatar"), Skeleton("paragraph", { count: 2 })], { direction: "row", gap: "md", align: "center" })
]))`,
  "Spinner": `$app(Stack([
  Spinner("sm"),
  Spinner("md", { label: "Loading" }),
  Spinner("lg", { label: "Importing rows", tone: "success" })
], { direction: "row", gap: "md", align: "center" }))`,
  "LoadingDots": `$app(Column([
  Row([Text("Generating reply"), LoadingDots()], { gap: "sm" }),
  Row([
    LoadingDots("Uploading", { size: "sm", tone: "primary" }),
    LoadingDots("Verifying", { size: "sm", tone: "success" })
  ], { gap: "lg" })
], { gap: "md" }))`,
  "Markdown": `$app(Markdown("# Aktion\\n\\nA **compact**, *declarative* DSL.\\n\\n- Headings\\n- Fenced code\\n- Auto-linked URLs: https://example.com"))`,
  "Kbd": `$app(Stack([
  Kbd(["Cmd", "K"]),
  Kbd(["Shift", "?"], { size: "sm" })
], { direction: "row", gap: "md", align: "center" }))`,
  "Icon": `$app(Stack([
  Icon("house",      { variant: "solid",   size: "lg" }),
  Icon("chart-line", { variant: "solid",   size: "lg" }),
  Icon("star",       { variant: "regular", size: "lg" }),
  Icon("github",     { variant: "brands",  size: "lg" })
], { direction: "row", gap: "md", align: "center" }))`,
  "TextContent": `$app(Stack([
  TextContent("Body text (TextContent is the legacy alias of Text).", { variant: "body" }),
  TextContent("Muted small text", { variant: "small", tone: "muted" })
], { gap: "xs" }))`,
  "GradientText": `$app(Display(["Ship ", GradientText("beautiful", { gradient: "brand" }), " products"], { size: "xl", align: "center" }))`,
  "Display": `$app(Display(["Build in ", GradientText("record time")], { size: "hero", align: "center", balance: true }))`,
  "Heading": `$app(Stack([
  Heading("Section heading", { size: "section" }),
  Heading("Large heading", { size: "lg" }),
  Heading("Medium heading", { size: "md" })
], { gap: "sm" }))`,
  "Eyebrow": `$app(Stack([
  Eyebrow("New in v0.6"),
  Display("Headline that follows the eyebrow", { size: "lg" })
], { gap: "xs" }))`,
  "Prose": `$app(Prose([
  Markdown("## Writing with Prose\\n\\nThe **Prose** container applies typographic rhythm to long-form text — headings, paragraphs, lists, quotes, links, and inline \`code\` all get consistent spacing and sizing.\\n\\n### What you get\\n\\n- Comfortable line length and leading\\n- Styled lists, like this one\\n- [Links](https://example.com) with sensible accents\\n\\n> Wrap any Markdown(...) or rich nodes — blog posts, docs bodies, product descriptions.\\n\\nUse the \`size\` prop (sm | md | lg) to scale the whole reading experience.")
], { size: "md" }))`,
  "RelativeTime": `$app(Stack([
  Row([Text("Posted: "), RelativeTime("2026-06-08T10:00:00Z")], { gap: "xs" }),
  Row([Text("Updated: "), RelativeTime("2026-06-09T09:30:00Z")], { gap: "xs" })
]))`,
  "Svg": `$app(Row([
  Svg("<circle cx='12' cy='12' r='9' fill='none' stroke='currentColor' stroke-width='2'/><path d='M8 12l3 3 5-6' fill='none' stroke='currentColor' stroke-width='2'/>", { viewBox: "0 0 24 24", width: "48px", height: "48px", fill: "var(--rui-color-success)" }),
  Text("Inline, sanitised SVG.")
], { gap: "md", align: "center" }))`,
  "VisuallyHidden": `$app(Column([
  Row([
    Icon("circle-check", { color: "var(--rui-color-success)" }),
    VisuallyHidden([Text("Verified account")]),
    Text("Maya Okonkwo", { variant: "body-heavy" })
  ], { gap: "sm", align: "center" }),
  Text("Screen readers announce Verified account; the page shows only the tick.", { variant: "small", tone: "muted" })
], { gap: "xs" }))`,
  "KbdShortcut": `$app(Row([
  Text("Open the command palette:"),
  KbdShortcut(["Cmd", "K"]),
  Text("or"),
  KbdShortcut("Ctrl+Shift+P")
], { gap: "md", align: "center", wrap: true }))`,
  "CountUp": `$app(Row([
  Stack([CountUp(12500, { suffix: "+" }), Text("Customers", { variant: "small", tone: "muted" })], { align: "center" }),
  Stack([CountUp(99, { suffix: "%" }), Text("Uptime", { variant: "small", tone: "muted" })], { align: "center" })
], { gap: "xl" }))`,
  "CountdownTimer": `$app(Stack([
  Text("Launch in:"),
  CountdownTimer("2026-12-31T23:59:59Z", { endLabel: "We are live!" })
], { gap: "sm" }))`,
  "TableOfContents": `$app(TableOfContents([
  { label: "Introduction", href: "#intro", level: 1 },
  { label: "Installation",  href: "#install", level: 1 },
  { label: "Configuration", href: "#config", level: 2 },
  { label: "Deployment",    href: "#deploy", level: 1 }
], { title: "On this page" }))`,

  /* ── Forms ─────────────────────────────────────────────── */
  "Form": `$email = ""
$plan = "pro"
submit = Button("Save", { variant: "primary", type: "submit" })
$app(Form("profile", { buttons: submit, fields: [
  FormControl("Email", { control: Input("email", { placeholder: "you@example.com", type: "email", value: $email }) }),
  FormControl("Plan",  { control: Select("plan", { items: [
    SelectItem("free", { label: "Free" }),
    SelectItem("pro",  { label: "Pro" }),
    SelectItem("team", { label: "Team" })
  ], value: $plan }) })
] }))`,
  "FormControl": `$app(FormControl(
  "Email",
  { control: Input("email", { placeholder: "you@example.com", type: "email" }),
  hint: "We'll never share your email." }
))`,
  "FormSection": `$app(FormSection("Account", {
  children: [
    FormControl("Email",    { control: Input("email", { placeholder: "ada@example.com", type: "email" }) }),
    FormControl("Username", { control: Input("user",  { placeholder: "ada-lovelace" }) })
  ],
  helper: "Used to sign in and to send you notifications." }))`,
  "FieldSet": `$app(FieldSet("Notifications", {
  children: [
    Checkbox("news",  { label: "Product updates",  value: true }),
    Checkbox("promo", { label: "Offers & promos",  value: false }),
    Checkbox("tips",  { label: "Tips & guides",    value: true })
  ],
  helper: "We never share your email address." }))`,
  "ValidationSummary": `$app(ValidationSummary(
  [
    {label: "email",    message: "Email is required."},
    {label: "password", message: "Password must be at least 8 characters."}
  ],
  { title: "Please fix the following before continuing" }
))`,
  "RequirementList": `$password = "hunter"
function rules(value) {
  return [
    {label: "At least 8 characters",  met: value.length >= 8},
    {label: "One uppercase letter",   met: value !== value.toLowerCase()},
    {label: "One digit",              met: /[0-9]/.test(value)},
    {label: "No spaces",              met: !value.includes(" ")}
  ]
}
$app(Stack([
  Input("pw", { label: "Password", value: $password }),
  RequirementList(rules($password), { title: "Your password must:" })
], { gap: "md" }))`,
  "Input": `$name = ""
$email = ""
$app(Stack([
  FormControl("Name",  { control: Input("name",  { placeholder: "Your name", type: "text", value: $name }) }),
  FormControl("Email", { control: Input("email", { placeholder: "you@example.com", type: "email", value: $email }) })
]))`,
  "TextArea": `$notes = ""
$app(FormControl(
  "Notes",
  { control: TextArea("notes", { placeholder: "Add a few sentences…", rows: 4, value: $notes }) }
))`,
  "PasswordInput": `$pw = "correct-horse-9"
$app(PasswordInput("pw", {
  value: $pw,
  label: "Password",
  placeholder: "Choose a strong password",
  strengthMeter: true,
  autocomplete: "new-password"
}))`,
  "MaskedInput": `$phone = ""
$app(MaskedInput("phone", { mask: "(999) 999-9999", value: $phone, placeholder: "(415) 555-0114", label: "Phone number" }))`,
  "MentionInput": `$note = "Heads up @"
$app(MentionInput("note",
  { people: [
    {name: "Ada Lovelace",   handle: "ada",   role: "Engineering"},
    {name: "Linus Torvalds", handle: "linus", role: "Kernel"},
    {name: "Grace Hopper",   handle: "grace", role: "Compilers"}
  ],
  value: $note, placeholder: "Type @ to mention someone…" }))`,
  "TagInput": `$tags = ["streaming", "ui", "library"]
$app(TagInput("tags", { value: $tags, placeholder: "Add a tag and press Enter", label: "Tags", max: 8 }))`,
  "Select": `$plan = "pro"
$app(FormControl("Plan", { control: Select("plan", { items: [
  SelectItem("free", { label: "Free" }),
  SelectItem("pro",  { label: "Pro" }),
  SelectItem("team", { label: "Team" })
], placeholder: "Pick a plan", value: $plan }) }))`,
  "SelectItem": `$size = "m"
$app(FormControl("Size", { control: Select("size", { items: [
  SelectItem("s", { label: "Small" }),
  SelectItem("m", { label: "Medium" }),
  SelectItem("l", { label: "Large" })
], value: $size }) }))`,
  "Combobox": `$country = "us"
countries = [
  SelectItem("us", { label: "United States" }),
  SelectItem("uk", { label: "United Kingdom" }),
  SelectItem("ca", { label: "Canada" }),
  SelectItem("de", { label: "Germany" }),
  SelectItem("fr", { label: "France" }),
  SelectItem("jp", { label: "Japan" })
]
$app(Combobox("country", { items: countries, value: $country, placeholder: "Search countries…", open: true }))`,
  "MultiSelect": `$picks = ["ts"]
$app(Stack([
  Text("Pick languages", { variant: "small" }),
  MultiSelect("langs",
    { items: [SelectItem("ts", { label: "TypeScript" }), SelectItem("js", { label: "JavaScript" }),
     SelectItem("py", { label: "Python" }),      SelectItem("rs", { label: "Rust" })],
    value: $picks, placeholder: "Pick languages", open: true })
]))`,
  "Checkbox": `$accepted = true
$app(Checkbox("accept", { label: "I agree to the Terms of Service", value: $accepted }))`,
  "CheckBoxGroup": `$alerts = {email: true, sms: false, push: true}
$app(CheckBoxGroup("alerts", { items: [
  CheckBoxItem("Email", { name: "email", description: "Major product updates",  defaultChecked: true }),
  CheckBoxItem("SMS",   { name: "sms",   description: "Critical alerts only",   defaultChecked: false }),
  CheckBoxItem("Push",  { name: "push",  description: "Real-time notifications", defaultChecked: true })
], value: $alerts }))`,
  "CheckBoxItem": `$alerts = {email: true, sms: false}
$app(CheckBoxGroup("alerts", { items: [
  CheckBoxItem("Email", { name: "email", description: "Major product updates", defaultChecked: true }),
  CheckBoxItem("SMS",   { name: "sms",   description: "Critical alerts only",  defaultChecked: false })
], value: $alerts }))`,
  "Radio": `$ship = "standard"
$app(Radio("ship", { label: "Shipping method", items: [
  SelectItem("standard",  { label: "Standard — 5 business days, free" }),
  SelectItem("express",   { label: "Express — 2 business days, $12" }),
  SelectItem("overnight", { label: "Overnight — $29" })
], value: $ship }))`,
  "Switch": `$notify = true
$app(Switch("notify", { label: "Email notifications", value: $notify, description: "Receive product updates" }))`,
  "ToggleGroup": `$view = "list"
$app(ToggleGroup("view", { items: [
  ["list",  "List",  "list"],
  ["grid",  "Grid",  "grip"],
  ["board", "Board", "table-cells-large"]
], value: $view, variant: "outline", size: "md" }))`,
  "Button": `$app(Stack([
  Button("Primary", { variant: "primary" }),
  Button("Secondary", { variant: "secondary" }),
  Button("Ghost", { variant: "ghost" }),
  Button("Danger", { variant: "danger" })
], { direction: "row", gap: "sm", align: "center" }))`,
  "Buttons": `$app(Buttons([
  Button("Save", { variant: "primary" }),
  Button("Cancel", { variant: "ghost" })
]))`,
  "ButtonGroup": `$app(Column([
  ButtonGroup([
    Button("Day"),
    Button("Week", { variant: "primary" }),
    Button("Month")
  ], { ariaLabel: "Date range" }),
  ButtonGroup([
    Button("Save", { variant: "primary", icon: "check" }),
    Button("Save and close", { variant: "primary" })
  ], { size: "sm" })
], { gap: "md" }))`,
  "InputGroup": `$app(Column([
  InputGroup(Input("search", { placeholder: "Search invoices…" }), {
    icon: "magnifying-glass",
    action: Button("Search", { variant: "primary" })
  }),
  InputGroup(Input("domain", { placeholder: "my-team" }), {
    label: "Workspace URL", suffix: ".aktion.app", hint: "Lowercase letters, digits, and dashes."
  })
], { gap: "md" }))`,
  "SearchBar": `$q = ""
$app(SearchBar("q", { placeholder: "Search the catalog…", value: $q }))`,
  "Slider": `$volume = 60
$app(Slider("vol", { min: 0, max: 100, step: 5, value: $volume, label: "Volume", showValue: true }))`,
  "NumberInput": `$qty = 2
$app(FormControl("Quantity", { control: NumberInput("qty", { value: $qty, min: 1, max: 99, step: 1 }) }))`,
  "ColorPicker": `$brand = "#6366f1"
$app(ColorPicker("brand", { value: $brand, label: "Brand colour",
  swatches: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"] }))`,
  "DatePicker": `$date = "2026-06-01"
$app(DatePicker("date", { value: $date, placeholder: "Pick a date", min: "2026-01-01", max: "2026-12-31" }))`,
  "DateRangePicker": `$from = "2026-05-01"
$to   = "2026-05-15"
$app(DateRangePicker("range", { from: $from, to: $to, label: "Reporting window" }))`,
  "TimePicker": `$time = "09:30"
$app(TimePicker("time", { value: $time, label: "Meeting time" }))`,
  "DateTimePicker": `$when = "2026-05-17T14:30"
$app(DateTimePicker("when", { value: $when, label: "Launch window" }))`,
  "FileUpload": `$app(FileUpload(
  "avatar",
  { label: "Click or drop a PNG / JPG",
  hint: "Up to 5 MB",
  accept: "image/*",
  multiple: false }
))`,
  "PinInput": `$pin = ""
$app(PinInput("pin", { length: 4, value: $pin, type: "numeric" }))`,
  "MultiStepForm": `$step = 0
$app(MultiStepForm([
  {title: "Account", details: "Email & password",
    content: [FormControl("Email", { control: Input("email", { placeholder: "you@example.com", type: "email" }) })]},
  {title: "Profile", details: "Tell us about you",
    content: [FormControl("Name", { control: Input("name", { placeholder: "Your name" }) })]},
  {title: "Done",    details: "Review",
    content: [Banner("Almost there", { description: "Click Submit to finish.", icon: "circle-info", tone: "success" })]}
], { current: $step, stepsLayout: "column" }))`,
  "SegmentedControl": `$view = "grid"
$app(Stack([
  SegmentedControl(["grid", "list", "board"], { value: $view, onChange: (v) => { $view = v } }),
  Text("Selected view: " + $view, { tone: "muted" })
], { gap: "md" }))`,
  "QuantityStepper": `$qty = 1
$app(Stack([
  QuantityStepper($qty, { min: 1, max: 9, onChange: (n) => { $qty = n } }),
  Text("Quantity: " + $qty, { tone: "muted" })
], { gap: "md" }))`,
  "VariantSelector": `$size = "m"
$color = "indigo"
$app(Stack([
  VariantSelector(["s", "m", "l", "xl"], { value: $size, kind: "pill", label: "Size", onChange: (v) => { $size = v } }),
  VariantSelector([
    { label: "Indigo", value: "indigo", color: "#6366f1" },
    { label: "Pink",   value: "pink",   color: "#ec4899" },
    { label: "Teal",   value: "teal",   color: "#14b8a6" }
  ], { value: $color, kind: "swatch", label: "Color", onChange: (v) => { $color = v } })
], { gap: "lg" }))`,
  "Swatch": `$app(Grid([
  Swatch("Light",    { background: "#ffffff", foreground: "#14102b", colors: ["#6366f1", "#10b981", "#f59e0b"] }),
  Swatch("Dark",     { background: "#0e0b1c", foreground: "#f3f1ff", colors: ["#8b5cf6", "#22d3ee", "#ec4899"] }),
  Swatch("Neon",     { background: "#0a0118", foreground: "#39ff14", colors: ["#39ff14", "#ff00ff", "#00ffff"] }),
  Swatch("Pastel",   { background: "#fff5fb", foreground: "#7c3aed", colors: ["#c4b5fd", "#fbcfe8", "#a7f3d0"] }),
  Swatch("Skyline",  { background: "linear-gradient(160deg, #0f172a, #1e3a8a)", foreground: "#bae6fd", colors: ["#38bdf8", "#818cf8", "#0ea5e9"] }),
  Swatch("Brand",    { background: "linear-gradient(120deg, #6366f1, #8b5cf6 45%, #ec4899)", foreground: "#ffffff", colors: ["#ffffff", "#fde68a", "#fbcfe8"] })
], { minChildWidth: "160px", gap: "md" }))`,
  "DrawingCanvas": `$strokes = 0
$app(Stack([
  DrawingCanvas({ width: 320, height: 180, color: "#6366f1", lineWidth: 3, onChange: (n) => { $strokes = n } }),
  Text("Strokes: " + $strokes, { tone: "muted" })
], { gap: "sm" }))`,
  "SignaturePad": `$app(Stack([
  Text("Sign below:", { variant: "small", tone: "muted" }),
  SignaturePad({ width: 360, height: 150, onChange: (png) => $toast.show(png ? "Captured" : "Cleared") })
], { gap: "sm" }))`,
  "ReactionPicker": `$reactions = [
  { emoji: "👍", count: 12, active: true },
  { emoji: "❤️", count: 4 },
  { emoji: "🎉", count: 7 },
  { emoji: "🚀", count: 2 }
]
$app(ReactionPicker($reactions, {
  onReact: (emoji) => $toast.show("You reacted " + emoji)
}))`,

  /* ── Data ─────────────────────────────────────────────── */
  "Table": `$app(Table([
  Col("Name",  { values: ["Ada", "Linus", "Grace"] }),
  Col("Score", { values: [98, 92, 96], align: "right", format: "number" })
], { title: "Top 3", density: "compact", striped: true }))`,
  "Col": `$rows = [
  { name: "Ada Lovelace",   team: "Compilers", active: true },
  { name: "Grace Hopper",   team: "Apollo",    active: false },
  { name: "Linus Torvalds", team: "Kernel",    active: true }
]
$app(Table([
  Col("Engineer", $rows.name, { width: "220px" }),
  Col("Team", $rows.team, { headerTooltip: "Owning team" }),
  Col("Status", $rows.map(r => Badge(r.active ? "Active" : "Paused", { tone: r.active ? "success" : "neutral" })))
]))`,
  "DataGrid": `$page = 1
$sort = { key: "Score", direction: "desc" }
$selectedIds = []
$search = ""

basic = DataGrid([
  Col("Name",  { values: ["Ada Lovelace", "Grace Hopper", "Linus Torvalds", "Margaret Hamilton"], sortable: true, filterable: true }),
  Col("Team",  { values: ["Compilers", "Apollo", "Kernel", "Apollo"], sortable: true, filterable: true }),
  Col("Score", { values: [98, 96, 92, 94], align: "right", format: "number", sortable: true })
], { rowIds: [1, 2, 3, 4], caption: "Top contributors", sort: $sort, selectedIds: $selectedIds, selectable: true, page: $page, perPage: 3 })

advanced = DataGrid([
  Col("Employee",   { values: ["Alice Chen", "Bob Martinez", "Carol White", "Dan Lee", "Eve Park", "Frank Jones"], sortable: true, filterable: true, pinned: "left" }),
  Col("Department", { values: ["Engineering", "Design", "Marketing", "Engineering", "Sales", "Design"], sortable: true, filterable: true }),
  Col("Role",       { values: ["Staff Engineer", "Lead Designer", "Content Strategist", "Senior Engineer", "Account Executive", "UX Researcher"], sortable: true }),
  Col("Salary",     { values: [145000, 118000, 92000, 128000, 105000, 110000], format: "currency", align: "right", sortable: true }),
  Col("Start Date", { values: ["2021-03-15", "2022-07-01", "2023-01-10", "2020-11-28", "2023-06-05", "2022-09-12"], format: "date", sortable: true }),
  Col("Rating",     { values: [4.8, 4.5, 4.2, 4.7, 3.9, 4.6], format: "number", align: "right", sortable: true })
], { rowIds: [1, 2, 3, 4, 5, 6], resizable: true, columnMenu: true, globalSearch: $search, persistKey: "demo-advanced", wrapCells: false, striped: true, density: "compact" })

rich = DataGrid([
  Col("#",        { values: [101, 102, 103, 104, 105], sortable: true, width: "60px" }),
  Col("Product",  { values: ["Wireless Headphones", "Ergonomic Keyboard", "USB-C Hub (7-port)", "Noise-Cancelling Mic", "Webcam 4K Ultra HD"], sortable: true, filterable: true }),
  Col("Category", { values: ["Audio", "Peripherals", "Accessories", "Audio", "Video"], sortable: true, filterable: true }),
  Col("Price",    { values: [79.99, 149.00, 49.99, 129.95, 199.00], format: "currency", align: "right", sortable: true }),
  Col("Stock",    { values: [342, 28, 156, 0, 73], format: "number", align: "right", sortable: true }),
  Col("Status",   { values: ["In Stock", "Low Stock", "In Stock", "Out of Stock", "In Stock"], filterable: true })
], { rowIds: ["p1", "p2", "p3", "p4", "p5"], caption: "Product inventory", exportable: true, rowNumbers: true, highlightOnHover: true, density: "comfortable" })

$app(Tabs([
  TabItem("basic",    { label: "Basic",    children: [basic] }),
  TabItem("advanced", { label: "Advanced", children: [advanced] }),
  TabItem("rich",     { label: "Inventory", children: [rich] })
]))`,
  "List": `$app(List([
  ListItem("Tasks",    { meta: "3 active",   icon: "list-check" }),
  ListItem("Calendar", { meta: "2 events",   icon: "calendar" }),
  ListItem("Inbox",    { meta: "5 unread",   icon: "inbox" })
]))`,
  "ListItem": `$app(List([
  ListItem("Tasks",    { meta: "3 active", icon: "list-check" }),
  ListItem("Calendar", { meta: "2 events", icon: "calendar" })
]))`,
  "StatCard": `$app(StatCard("Active users", { value: "12,481", trend: "up", delta: "+8.2%", icon: "users", spark: [42, 50, 55, 60, 71, 80] }))`,
  "Stats": `$app(Stats([
  {label: "MRR",   value: "$84.2k", hint: "+12%", tone: "success", spark: [12, 14, 18, 22, 28, 31]},
  {label: "Churn", value: "1.8%",   hint: "-0.4%", tone: "danger",  spark: [2.3, 2.2, 2.0, 1.9, 1.8]}
]))`,
  "Sparkline": `$app(Stack([
  Text("Weekly visits", { variant: "small" }),
  Sparkline([10, 14, 9, 22, 18, 28, 31], { tone: "primary" })
]))`,
  "Tile": `$app(Grid([
  Tile("Total contacts",   { icon: "users",                value: "2,481", description: "+128 this week",            tone: "primary" }),
  Tile("Active deals",     { icon: "briefcase",            value: "47",    description: "$418k ARR pipeline",        tone: "info" }),
  Tile("At-risk accounts", { icon: "triangle-exclamation", value: "12",    description: "Needs follow-up this week", tone: "warning" }),
  Tile("Champions",        { icon: "trophy",               value: "63",    description: "NPS 9–10 in last 30d",      tone: "success" })
], { columns: 4, gap: "md" }))`,
  "Progress": `$app(Stack([
  Progress(60, { max: 100, label: "Linear", tone: "primary", indeterminate: false, showValue: true }),
  Progress(60, { max: 100, label: "Buffered", tone: "info", indeterminate: false, showValue: true, buffered: 85 }),
  Progress(60, { max: 100, label: "Step 3 of 5", tone: "primary", indeterminate: false, showValue: true, segments: 5 })
]))`,
  "ProgressRing": `$app(Row([
  ProgressRing(72,  { caption: "In stock", tone: "success" }),
  ProgressRing(28,  { caption: "Backlog",  tone: "warning" }),
  ProgressRing(100, { icon: "circle-check", caption: "Shipped", tone: "primary" })
], { gap: "lg", align: "center" }))`,
  "Pagination": `$page = 3
$app(Pagination($page, { pages: 10, siblings: 1, total: 240, perPage: 25 }))`,
  "Tree": `$app(Tree([
  TreeNode("src", { children: [
    TreeNode("library", { children: [
      TreeNode("components.ts", { icon: "file-code" }),
      TreeNode("registry.ts", { icon: "file-code" })
    ], icon: "folder-open", expanded: true, selected: false, badge: "2" }),
    TreeNode("index.ts", { icon: "file-code" })
  ], icon: "folder-open", expanded: true }),
  TreeNode("README.md", { icon: "file-lines" })
]))`,
  "TreeNode": `$app(Tree([
  TreeNode("src", { children: [
    TreeNode("index.ts", { icon: "file-code" }),
    TreeNode("app.ts", { icon: "file-code" })
  ], icon: "folder-open", expanded: true }),
  TreeNode("README.md", { icon: "file-lines" })
]))`,
  "CalendarView": `$selected = "2026-05-17"
$app(CalendarView(
  $selected,
  { month: "2026-05",
  events: [
    {date: "2026-05-12", title: "Standup",    time: "09:00", tone: "primary"},
    {date: "2026-05-17", title: "Demo day",   time: "14:30", tone: "success"},
    {date: "2026-05-22", title: "Retro",      time: "16:00", tone: "info"}
  ],
  view: "month" }
))`,
  "ComparisonTable": `$app(ComparisonTable(
  ["Free", "Pro", "Enterprise"],
  { rows: [
    {label: "Projects",   values: ["3", "Unlimited", "Unlimited"]},
    {label: "Collaborators", values: ["1", "10", "Unlimited"]},
    {label: "SSO",        values: [false, false, true]},
    {label: "Audit log",  values: [false, true,  true]},
    {label: "Priority support", values: [false, true, true]}
  ],
  highlightColumn: 1 }
))`,
  "InfiniteList": `$pages = 2
function loadMore() { $pages = $pages + 1 }
$app(InfiniteList(
  [
    ListItem("Build component library", { meta: "Add 30+ new primitives.", icon: "code" }),
    ListItem("Ship docs site",          { meta: "Update components.html.", icon: "book" }),
    ListItem("Write tests",             { meta: "Smoke + integration coverage.", icon: "vial" }),
    ListItem("Cut release",             { meta: "Tag + publish.", icon: "tag" })
  ],
  { onLoadMore: loadMore,
  loading: false,
  hasMore: true }
))`,
  "VirtualGrid": `$app(VirtualGrid(
  $util.range(0, 240).map(i => Card([Center([Text("#" + i)])])),
  { columns: 4, itemHeight: 80, gap: 8, height: 320 }
))`,
  "Metric": `$app(Row([
  Metric("$48k", { label: "MRR", gradient: true }),
  Metric(1280, { label: "Signups", countUp: true })
], { gap: "lg" }))`,
  "MetricStrip": `$app(MetricStrip([
  Metric("12k", { label: "Stars" }),
  Metric("98%", { label: "Uptime" }),
  Metric("4.9", { label: "Rating" }),
  Metric("24/7", { label: "Support" })
], { columns: 4 }))`,
  "Calendar": `$picked = "2026-06-14"
$app(Stack([
  Calendar({
    month: 5, year: 2026, selected: $picked,
    events: [
      { date: "2026-06-09", label: "Design review", color: "primary", time: "10:00" },
      { date: "2026-06-09", label: "1:1 with Sam",  color: "success", time: "14:00" },
      { date: "2026-06-09", label: "Retro",         color: "warning", time: "16:30" },
      { date: "2026-06-14", label: "Sprint demo",   color: "danger" },
      { date: "2026-06-22", label: "Offsite",       color: "#0ea5e9" },
      "2026-06-03", "2026-06-26"
    ],
    onSelect: (iso) => { $picked = iso },
    onNavigate: (y, m) => $toast.show("Viewing " + (m + 1) + "/" + y)
  }),
  Text("Selected: " + $picked, { tone: "muted" })
], { gap: "md" }))`,
  "OrderSummary": `$app(OrderSummary([
  { label: "Wireless Headphones", amount: "199.00" },
  { label: "USB-C Cable",         amount: "12.00" }
], { subtotal: "211.00", shipping: "5.00", tax: "17.28", total: "233.28", currency: "$" }))`,
  "Cart": `$cart = [
  { id: "a", name: "Wireless Mouse", price: 29, qty: 1 },
  { id: "b", name: "Mechanical Keyboard", price: 89, qty: 2 }
]
$app(Cart($cart, {
  currency: "USD",
  onQty: (id, qty) => { $cart = $cart.map(i => i.id === id ? { ...i, qty: qty } : i) },
  onRemove: (id) => { $cart = $cart.filter(i => i.id !== id) }
}))`,
  "PriceTag": `$app(Row([
  PriceTag(49, { compareAt: 79, currency: "USD", size: "lg" }),
  PriceTag(12.5, { currency: "EUR" })
], { gap: "xl", align: "center" }))`,

  /* ── Charts ─────────────────────────────────────────────── */
  "BarChart": `$app(BarChart(
  ["Q1", "Q2", "Q3", "Q4"],
  { series: [Series("Sales", { values: [120, 180, 160, 210] }), Series("Refunds", { values: [12, 14, 9, 18] })],
  title: "Quarterly sales" }
))`,
  "LineChart": `$app(LineChart(
  ["Mon", "Tue", "Wed", "Thu", "Fri"],
  { series: [Series("Visits", { values: [120, 180, 160, 210, 250] }), Series("Signups", { values: [12, 18, 15, 22, 28] })] }
))`,
  "PieChart": `$app(PieChart(["Free", "Pro", "Team"], { values: [240, 95, 32], title: "Plan mix", valueFormat: "both" }))`,
  "RadarChart": `$app(RadarChart(
  ["Speed", "Quality", "Cost", "Coverage", "Trust"],
  { series: [Series("Plan A", { values: [80, 70, 60, 75, 85] }),
   Series("Plan B", { values: [60, 85, 70, 65, 80] })],
  title: "Vendor comparison" }
))`,
  "ScatterChart": `$app(ScatterChart(
  [Series("Cohort A", { values: [{x: 1, y: 2}, {x: 2, y: 4}, {x: 3, y: 5}, {x: 4, y: 7}] }),
   Series("Cohort B", { values: [{x: 1, y: 3}, {x: 2, y: 2}, {x: 3, y: 6}, {x: 4, y: 5}] })],
  { xLabel: "Sessions",
  yLabel: "Conversions",
  title: "Cohort behaviour" }
))`,
  "Histogram": `$app(Histogram(
  [1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 8, 9], { binCount: 6,
  title: "Response time (s)" }
))`,
  "Heatmap": `$app(Heatmap(
  ["Mon", "Tue", "Wed", "Thu", "Fri"],
  { yLabels: ["9am", "12pm", "3pm", "6pm"],
  values: [
    [12, 14, 16, 13, 8],
    [22, 26, 28, 24, 15],
    [18, 21, 25, 20, 11],
    [6, 9, 11, 10, 4]
  ],
  title: "Desk occupancy" }
))`,
  "Gauge": `$app(Gauge(78, { min: 0, max: 100, label: "Uptime", tone: "success", size: "md" }))`,
  "Series": `$app(BarChart(
  ["Mon", "Tue", "Wed", "Thu"],
  { series: [Series("Visits", { values: [120, 180, 160, 210] }), Series("Signups", { values: [12, 18, 15, 22] })] }
))`,

  /* ── Feedback & Media ─────────────────────────────────────────────── */
  "Avatar": `$app(Box([
  Avatar("Ada Lovelace",   { src: "https://i.pravatar.cc/64?img=47", size: "sm", status: "online" }),
  Avatar("Linus Torvalds", { src: "https://i.pravatar.cc/64?img=11", size: "md", status: "busy" }),
  Avatar("Grace Hopper",   { size: "lg" })
]))`,
  "AvatarGroup": `$app(AvatarGroup([
  {name: "Ada",   src: "https://i.pravatar.cc/64?img=47"},
  {name: "Linus", src: "https://i.pravatar.cc/64?img=11"},
  {name: "Grace", src: "https://i.pravatar.cc/64?img=32"},
  {name: "Alan"},
  {name: "Mei"}
], { max: 3, size: "md" }))`,
  "PersonChip": `$app(Stack([
  PersonChip("Naomi Rivers", { role: "VP Engineering", avatarSrc: "https://i.pravatar.cc/64?img=47", status: "online" }),
  PersonChip("Marc Lee", { role: "Head of Data", avatarSrc: "https://i.pravatar.cc/64?img=11", status: "busy" }),
  PersonChip("Grace Hopper", { role: "Founder · Atlasworks", status: "away" })
], { gap: "sm" }))`,
  "Tooltip": `$app(Stack([
  Text("Hover or focus the button to reveal the hint.", { variant: "small", tone: "muted" }),
  Tooltip("Saves without closing the editor", { trigger: Button("Save draft"), side: "top" })
], { gap: "sm" }))`,
  "HoverCard": `$app(Stack([
  Text("Hover the trigger to preview the profile.", { variant: "small", tone: "muted" }),
  HoverCard(Button("Ada Lovelace"), {
    content: [
      PersonChip("Ada Lovelace", { role: "Mathematician · 1843", avatarSrc: "https://i.pravatar.cc/64?img=47" }),
      Text("Wrote the first algorithm intended to be processed by a machine.", { variant: "small" })
    ],
    side: "bottom",
    openDelay: 300,
    width: "280px"
  })
], { gap: "sm" }))`,
  "Popover": `$app(Popover(Button("Filters"), {
  title: "Filter deployments",
  content: [
    Text("Showing runs from the last 7 days in eu-central-1."),
    Row([
      Button("Clear", { variant: "ghost", size: "small" }),
      Button("Apply", { variant: "primary", size: "small" })
    ], { gap: "sm" })
  ],
  align: "start",
  open: true
}))`,
  "Rating": `$score = 3.5
$app(Rating($score, { max: 5, label: "3.5 of 5", count: 128, size: "md", readonly: true, halfStep: true, icon: "star" }))`,
  "Toast": `$app(Toast("Changes saved", {
  message: "Your draft was synced across all devices.",
  tone: "success",
  icon: "circle-check"
}))`,
  "Toasts": `$app(Toasts([
  Toast("Deploy finished", { message: "v2.4.1 is live in eu-central-1.", tone: "success" }),
  Toast("Certificate expiring", { message: "Renew within 6 days.", tone: "warning" })
], { position: "top-center", max: 3 }))`,
  "VideoPlayer": `$app(VideoPlayer(
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
  { controls: true,
  autoplay: false,
  loop: false,
  muted: false,
  caption: "Big Buck Bunny — sample clip",
  ratio: "16:9" }
))`,
  "AudioPlayer": `$app(AudioPlayer(
  "https://upload.wikimedia.org/wikipedia/commons/b/b4/Bach_-_Cello_Suite_No._5_-_1._Prelude.ogg",
  { title: "Cello Suite No. 1",
  artist: "J. S. Bach",
  controls: true }
))`,
  "Carousel": `$app(Carousel([
  {src: "https://picsum.photos/seed/streaming1/640/360", alt: "Slide 1", caption: "Launch your product"},
  {src: "https://picsum.photos/seed/streaming2/640/360", alt: "Slide 2", caption: "Onboard customers"},
  {src: "https://picsum.photos/seed/streaming3/640/360", alt: "Slide 3", caption: "Grow your team"}
], { activeIndex: 0, ratio: "16:9", showDots: true }))`,
  "Gallery": `$app(Gallery([
  {src: "https://picsum.photos/seed/gallery1/320/320", alt: "City",   caption: "City"},
  {src: "https://picsum.photos/seed/gallery2/320/320", alt: "Beach",  caption: "Beach"},
  {src: "https://picsum.photos/seed/gallery3/320/320", alt: "Forest", caption: "Forest"},
  {src: "https://picsum.photos/seed/gallery4/320/320", alt: "Hills",  caption: "Hills"}
], { columns: 4 }))`,
  "Lightbox": `$open = false
$index = 0
$app(Stack([
  Gallery([
    {src: "https://picsum.photos/seed/lb1/640/400", caption: "Photo 1"},
    {src: "https://picsum.photos/seed/lb2/640/400", caption: "Photo 2"},
    {src: "https://picsum.photos/seed/lb3/640/400", caption: "Photo 3"}
  ], { onSelect: (i) => { $open = true; $index = i } }),
  Lightbox([
    {src: "https://picsum.photos/seed/lb1/1200/800", caption: "Photo 1"},
    {src: "https://picsum.photos/seed/lb2/1200/800", caption: "Photo 2"},
    {src: "https://picsum.photos/seed/lb3/1200/800", caption: "Photo 3"}
  ], { open: $open, index: $index })
]))`,
  "Map": `$app(Map(
  48.8566,
  { lng: 2.3522,
  zoom: 12,
  markers: [
    {lat: 48.8584, lng: 2.2945, label: "Eiffel Tower"},
    {lat: 48.8606, lng: 2.3376, label: "Louvre"},
    {lat: 48.8530, lng: 2.3499, label: "Notre-Dame"}
  ],
  height: "320px",
  caption: "Three Paris landmarks" }
))`,
  "TypingIndicator": `$app(Stack([
  ChatBubble("Hey, are you there?", { from: "them" }),
  TypingIndicator("Ada")
], { gap: "sm" }))`,
  "Confetti": `$fire = false
$app(Stack([
  Row([
    Button("Celebrate 🎉", { variant: "primary", onClick: () => { $fire = true } }),
    Button("Reset", { variant: "ghost", onClick: () => { $fire = false } })
  ], { gap: "sm" }),
  Confetti({ fire: $fire, count: 90 })
], { gap: "md" }))`,
  "Lottie": `$app(Stack([
  Lottie({
    src: "https://assets9.lottiefiles.com/packages/lf20_x62chJ.json",
    poster: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=320",
    width: "240px",
    height: "180px",
    loop: true
  }),
  Text("Plays via lottie-web when window.lottie is present; otherwise the poster keeps the layout intact.", { variant: "small", tone: "muted" })
], { gap: "sm" }))`,
  "QRCode": `$app(Stack([
  QRCode("https://aktion.dev", { size: 140, ecc: "M" }),
  Text("Scannable offline QR — encoded in the browser.", { variant: "small", tone: "muted" })
], { gap: "sm", align: "center" }))`,
  "PresenceAvatars": `$app(PresenceAvatars([
  { name: "Ada Lovelace", online: true },
  { name: "Alan Turing", src: "https://i.pravatar.cc/48?img=12", online: true },
  { name: "Grace Hopper", online: false },
  { name: "Linus T", online: true },
  { name: "Margaret H", online: true }
], { max: 4 }))`,
  "LiveCursor": `$app(Box([
  Text("Collaborator cursors float over the canvas."),
  LiveCursor({ x: 60, y: 30, label: "Ada", color: "#6366f1" }),
  LiveCursor({ x: 160, y: 64, label: "Alan", color: "#ec4899" })
], { padding: "lg", style: "position: relative; min-height: 120px" }))`,
  "Backdrop": `$type = "network"
$app(Stack([
  SegmentedControl(["network", "drift", "snow", "stars", "bubbles"], { value: $type, onChange: (v) => { $type = v } }),
  Box([
    Backdrop({ grid: true, blobs: ["#6366f1", "#ec4899", "#22d3ee"], particles: 60, type: $type, speed: 1 }),
    Center([Display("Animated hero backdrop", { size: "lg", align: "center" })], { minHeight: "32vh" })
  ], { padding: "none", style: "position: relative; overflow: hidden; border-radius: 16px" })
], { gap: "md" }))`,

  /* ── Navigation ─────────────────────────────────────────────── */
  "Breadcrumb": `$app(Column([
  Text("Plain strings — each crumb derives its own route, the first gets the home icon:", { tone: "muted", variant: "small" }),
  Breadcrumb(["Workspace", "Reports", "Q3"]),
  Text("Objects, when the real routes are not the slugified labels:", { tone: "muted", variant: "small" }),
  Breadcrumb([
    { label: "Home", to: "/" },
    { label: "Projects", to: "/projects" },
    { label: "Atlas" }
  ]),
  Text("Pure text — no icon, no links:", { tone: "muted", variant: "small" }),
  Breadcrumb(["Docs", "Components", "Breadcrumb"], { homeIcon: false, autoLink: false })
], { gap: "md" }))`,
  "BreadcrumbItem": `$app(Breadcrumb([
  BreadcrumbItem("Home",      { href: "#", icon: "house" }),
  BreadcrumbItem("Reports",   { href: "#" }),
  BreadcrumbItem("Q3 results")
]))`,
  "Navbar": `$app(Navbar(
  "Acme",
  { items: [
    NavbarItem("Home",    { to: "/",        icon: "house", active: true }),
    NavbarItem("Docs",    { to: "/docs",    icon: "book" }),
    NavbarItem("Pricing", { to: "/pricing", icon: "tag" })
  ],
  actions: [
    Button("Sign in", { variant: "ghost" }),
    Button("Get started", { variant: "primary" })
  ],
  sticky: false,
  variant: "default" }
))`,
  "NavbarItem": `$app(Navbar(
  "Acme",
  { items: [
    NavbarItem("Home", { to: "/",     icon: "house", active: true }),
    NavbarItem("Docs", { to: "/docs", icon: "book" }),
    NavbarItem("Blog", { to: "/blog", icon: "newspaper" })
  ] }
))`,
  "DropdownMenu": `$app(Stack([
  Text("Click the trigger to open the menu.", { variant: "small", tone: "muted" }),
  DropdownMenu(
    Button("Open menu"),
    { items: [
      MenuLabel("Account"),
      MenuItem("Profile",  { icon: "user" }),
      MenuItem("Settings", { icon: "gear",     shortcut: "⌘," }),
      MenuSeparator(),
      MenuLabel("Workspace"),
      MenuItem("Invite teammates", { icon: "user-plus" }),
      MenuSeparator(),
      MenuItem("Sign out", { icon: "right-from-bracket", variant: "danger" })
    ],
    side: "bottom",
    align: "start",
    open: true }
  )
]))`,
  "MenuItem": `$app(DropdownMenu(Button("Row actions"), {
  items: [
    MenuItem("Rename", { icon: "pen", shortcut: "⌘R" }),
    MenuItem("Duplicate", { icon: "copy" }),
    MenuItem("Move to archive", { icon: "box-archive", disabled: true }),
    MenuSeparator(),
    MenuItem("Delete run", { icon: "trash", variant: "danger" })
  ],
  open: true
}))`,
  "MenuSeparator": `$app(DropdownMenu(
  Button("Actions"),
  { items: [
    MenuLabel("File"),
    MenuItem("New",  { icon: "file" }),
    MenuItem("Open", { icon: "folder-open" }),
    MenuSeparator(),
    MenuLabel("Edit"),
    MenuItem("Cut",  { icon: "scissors" }),
    MenuItem("Copy", { icon: "copy" }),
    MenuSeparator(),
    MenuItem("Delete", { icon: "trash", variant: "danger" })
  ],
  open: true }
))`,
  "MenuLabel": `$app(DropdownMenu(
  Button("Open menu"),
  { items: [
    MenuLabel("Account"),
    MenuItem("Profile", { icon: "user" }),
    MenuItem("Settings", { icon: "gear" }),
    MenuSeparator(),
    MenuLabel("Workspace"),
    MenuItem("Invite", { icon: "user-plus" })
  ],
  open: true }
))`,
  "NavBar": `$app(NavBar({
  brand: Brand("Acme"),
  links: [NavLink("Home", { to: "/" }), NavLink("Docs", { to: "/docs" }), NavLink("Pricing", { to: "/pricing" })],
  actions: [Button("Sign in", { variant: "ghost", size: "small" }), Button("Get started", { variant: "primary", size: "small" })],
  blur: true
}))`,
  "TabBar": `$tab = "home"
$app(TabBar([
  { id: "home",    label: "Home",    icon: "house" },
  { id: "search",  label: "Search",  icon: "magnifying-glass" },
  { id: "profile", label: "Profile", icon: "user", badge: "3" }
], { active: $tab, onChange: (id) => { $tab = id } }))`,
  "BackToTop": `$app(Stack([
  Text("showAfter: 0 keeps the button visible; the default 400 waits for a scroll."),
  BackToTop({ label: "Top", showAfter: 0, position: "bottom-right" })
], { gap: "sm" }))`,
  "ScrollSpy": `$app(Row([
  ScrollSpy([
    { label: "Overview", id: "overview" },
    { label: "Features", id: "features" },
    { label: "Pricing",  id: "pricing" }
  ], { title: "On this page", offset: 24 }),
  Stack([
    Card([Heading("Overview"), Text("What Atlas does, and who it is for.")], { id: "overview" }),
    Card([Heading("Features"), Text("Realtime sync, audit log, SSO.")], { id: "features" }),
    Card([Heading("Pricing"), Text("From $19 per seat, per month.")], { id: "pricing" })
  ], { gap: "xl" })
], { gap: "lg" }))`,
  "Brand": `$app(Brand("Aktion", { version: "v0.6", href: "/" }))`,
  "Footer": `$app(Footer({
  brand: Brand("Acme"),
  tagline: "The fastest way to ship.",
  columns: [
    FooterColumn("Product", [Link("Features", { href: "#" }), Link("Pricing", { href: "#" })]),
    FooterColumn("Company", [Link("About", { href: "#" }), Link("Careers", { href: "#" })])
  ],
  legal: "© 2026 Acme, Inc."
}))`,
  "FooterColumn": `$app(Footer({
  columns: [
    FooterColumn("Resources", [Link("Docs", { href: "#" }), Link("Guides", { href: "#" }), Link("Support", { href: "#" })])
  ]
}))`,
  "SkipLink": `$app(Stack([
  SkipLink("main-content", { label: "Skip to content" }),
  Text("Press Tab to reveal the link, then Enter to jump past this filler…"),
  Card([Text("…some long navigation a keyboard user would rather skip…", { tone: "muted" })], { padding: "sm" }),
  Card([
    CardHeader("Main content"),
    Text("Activating the skip link moves focus here — even inside the shadow DOM.")
  ], { id: "main-content", gap: "sm" })
], { gap: "sm" }))`,

  /* ── Chat ─────────────────────────────────────────────── */
  "SectionBlock": `$app(SectionBlock("Deployment summary", {
  icon: "rocket",
  description: "Release 2.4.1 shipped to production on 12 March at 14:05 UTC.",
  children: [ListBlock(["3 services updated", "Zero failed health checks"], { marker: "check" })],
  actions: [ActionLink("View logs", { onClick: () => { $toast.show("Opening logs") } })]
}))`,
  "ListBlock": `$app(ListBlock([
  "Connect your GitHub organisation",
  "Pick the repositories to sync",
  "Invite your teammates"
], { ordered: true }))`,
  "FollowUpBlock": `$app(FollowUpBlock([
  FollowUpItem("Show me a chart"),
  FollowUpItem("Add a filter"),
  FollowUpItem("Export as CSV")
]))`,
  "FollowUpItem": `$app(FollowUpBlock([
  FollowUpItem("Show at-risk projects"),
  FollowUpItem("Compare to last quarter"),
  FollowUpItem("Open billing")
]))`,
  "ActionLink": `$app(Stack([
  Text("Your March invoice export is ready."),
  ActionLink("Download CSV", { icon: "download", onClick: () => { $toast.show("Export downloaded") } })
]))`,
  "ChatBubble": `$app(Card([
  Stack([
    ChatBubble("Nadia Rahman", { body: "Can you resend the March invoice?", time: "9:12 AM", from: "me", status: "read" }),
    ChatBubble("Billing assistant", { body: "Sent it to nadia@northwind.co — invoice #4417, $1,240.", time: "9:13 AM", from: "agent", status: "delivered" })
  ])
]))`,

  /* ── Patterns ─────────────────────────────────────────────── */
  "Hero": `$app(Hero(
  "Ship faster",
  { subtitle: "From idea to production in minutes.",
  primary: Button("Get started", { variant: "primary" }),
  secondary: Button("Live demo", { variant: "ghost" }),
  eyebrow: "v2 launch",
  highlights: ["No credit card", "Cancel anytime", "Free for 14 days"] }
))`,
  "PageHeader": `$app(PageHeader(
  "Engineering Q3",
  { subtitle: "12 active · 4 at risk",
  breadcrumbs: ["Workspace", "Engineering"],
  status: Badge("On track", { tone: "success" }),
  actions: [Button("Export", { variant: "secondary" }), Button("New project", { variant: "primary" })] }
))`,
  "EmptyState": `$app(EmptyState(
  "No projects yet", { description: "Create a project to start tracking work.", icon: "folder",
  actions: [Button("Create project", { variant: "primary", type: "button", size: "sm", icon: "plus" }),
   Button("Read the guide", { variant: "ghost",   type: "button", size: "sm" })] }))`,
  "Timeline": `$app(Timeline([
  TimelineItem("Ada merged PR #248",    { time: "5m ago",    description: "Patterns ready for review",    icon: "code-pull-request",    tone: "primary" }),
  TimelineItem("QA caught regression",  { time: "1h ago",    description: "Quota dashboard double-count", icon: "triangle-exclamation", tone: "warning" }),
  TimelineItem("Tokenizer 2.1 shipped", { time: "Yesterday", description: "Latency -14%",                icon: "circle-check",         tone: "success" })
]))`,
  "TimelineItem": `$app(Timeline([
  TimelineItem("Released v2.0", { time: "2h ago", description: "Updated 14 components.", icon: "rocket", tone: "success" }),
  TimelineItem("Merged PR #248", { time: "Yesterday", description: "New timeline marker tones.", icon: "code-merge", tone: "primary", content: [Badge("frontend", { tone: "info" })] }),
  TimelineItem("Design review", { time: "3 days ago", description: "Walked through dashboard wireframes.", icon: "palette" })
]))`,
  "ActivityLog": `$app(ActivityLog([
  {actor: "Ada",   title: "merged PR #142",        description: "Streaming UI v2 components.", time: "2m",  icon: "code-merge", tone: "success"},
  {actor: "Linus", title: "opened ticket #2049",   description: "Kernel scheduler regression.", time: "1h",  icon: "circle-exclamation", tone: "warning"},
  {actor: "Grace", title: "deployed compiler 4.2", time: "yesterday", icon: "rocket",          tone: "primary"}
]))`,
  "FeatureGrid": `$app(FeatureGrid([
  FeatureItem("Streaming-first", { description: "Parse and render token-by-token.",          icon: "bolt",         tone: "primary" }),
  FeatureItem("Themeable",       { description: "Six built-in themes, custom tokens too.", icon: "palette",      tone: "success" }),
  FeatureItem("Framework-free",  { description: "One web component, any host stack.",        icon: "puzzle-piece", tone: "info" })
]))`,
  "FeatureItem": `$app(FeatureGrid([
  FeatureItem("Analytics", { description: "Traffic, funnels, and retention.", icon: "chart-line", tone: "primary", href: "#analytics" }),
  FeatureItem("Billing", { description: "Invoices and payment methods.", icon: "credit-card", tone: "success", href: "#billing" }),
  FeatureItem("Security", { description: "SSO, audit logs, and 2FA.", icon: "shield-halved", tone: "info", href: "#security" })
]))`,
  "Testimonial": `$app(Testimonial(
  "Aktion saved us weeks of glue code.",
  { author: "Naomi Rivers",
  role: "VP Engineering · Looplog",
  avatarSrc: "https://i.pravatar.cc/64?img=47",
  rating: 5 }
))`,
  "ProfileCard": `$app(ProfileCard(
  "Alex Rivera",
  { role: "Product Designer",
  avatarSrc: "https://i.pravatar.cc/64?img=12",
  bio: "Designs the future of generative UI at Acme.",
  tags: ["design", "ux", "typography"],
  actions: [Button("Follow", { variant: "primary", size: "sm" }), Button("Resume", { variant: "ghost", size: "sm" })] }
))`,
  "Comment": `$app(Stack([
  Comment("Ada Lovelace",
          { body: "Loving the new patterns API — it's much cleaner.",
          time: "2h ago",
          avatarSrc: "https://i.pravatar.cc/64?img=47",
          actions: [Button("Reply", { variant: "ghost", size: "sm" }), Button("Like", { variant: "ghost", size: "sm" })] }),
  Comment("Linus Torvalds",
          { body: "+1, especially the PageHeader composite.",
          time: "1h ago",
          avatarSrc: "https://i.pravatar.cc/64?img=11" })
]))`,
  "Banner": `$app(Banner(
  "Spring release",
  { message: "Streaming UI v2.4 ships with 20 new components.",
  action: Button("See what's new", { variant: "primary" }),
  icon: "sparkles",
  tone: "primary" }
))`,
  "Notification": `$app(Stack([
  Notification("Stripe receipt",
               { message: "Receipt for Pro plan — $29.00 charged today.",
               time: "10:24 AM",
               avatarSrc: "https://i.pravatar.cc/64?img=12",
               author: "Stripe",
               tone: "primary", unread: true,
               actions: [Button("Open", { variant: "ghost", size: "sm" })] }),
  Notification("GitHub digest",
               { message: "12 new pull requests waiting for review.",
               time: "Yesterday", icon: "code-branch", tone: "info" })
]))`,
  "InboxPanel": `$app(InboxPanel([
  {title: "New comment on PR #142", message: "Ada: looks great, two nits inline.", time: "2m",  icon: "comment", unread: true},
  {title: "Build #482 succeeded",   message: "Tests passed in 2m31s.",            time: "12m", icon: "circle-check", tone: "success", unread: true},
  {title: "Weekly report",          message: "This week's metrics digest.",       time: "1d",  icon: "chart-pie"},
  {title: "Subscription renewed",   message: "Pro plan billed $29.",              time: "1w",  icon: "credit-card"}
], { onMarkAllRead: () => { $toast.show("Inbox cleared") } }))`,
  "OnboardingChecklist": `$app(OnboardingChecklist([
  {title: "Create your workspace", description: "Pick a name and slug.",            done: true},
  {title: "Invite teammates",      description: "Share an invite link.",            done: true},
  {title: "Connect a data source", description: "Hook up GitHub, Postgres, or S3.", done: false, cta: "Connect"},
  {title: "Ship your first board", description: "Publish a dashboard.",             done: false}
], { title: "Get started", subtitle: "Most teams finish setup in under 10 minutes." }))`,
  "MediaCard": `$app(MediaCard(
  "Aurora Headphones",
  { imageSrc: "https://images.unsplash.com/photo-1518443895914-83a35c1eed90?w=900&q=80",
  description: "Studio-grade sound, 40-hour battery.",
  tags: ["wireless", "ANC"],
  meta: "$249 · 4.8 stars",
  badge: "New",
  actions: [Button("Add to cart", { variant: "primary" }), Button("Details", { variant: "ghost" })] }
))`,
  "TopBar": `$app(TopBar(
  "Project Atlas",
  { subtitle: "12 active issues",
  left: [Badge("v0.4", { tone: "info" })],
  center: [SearchBar("q", { placeholder: "Search Atlas…" })],
  right: [Button("New issue", { variant: "primary", size: "sm", icon: "plus" })] }
))`,
  "KanbanBoard": `$app(KanbanBoard([
  KanbanColumn("To do",  { items: [KanbanCard("Migrate auth",      { description: "Roll out the new SDK.", tags: ["auth"],     assignee: "Asha" })] }),
  KanbanColumn("Doing",  { items: [KanbanCard("Streaming UI v2",   { description: "20 new components.",    tags: ["frontend"], assignee: "Alex", tone: "primary" })] }),
  KanbanColumn("Review", { items: [KanbanCard("Mobile onboarding", { description: "Awaiting design.",      tags: ["mobile"],   assignee: "Wren", tone: "warning" })] }),
  KanbanColumn("Done",   { items: [KanbanCard("Activity timeline", { description: "Shipped to 100%.",      tags: ["shipped"],  assignee: "Mira", tone: "success" })] })
]))`,
  "KanbanColumn": `$app(KanbanBoard([
  KanbanColumn("To do", { items: [KanbanCard("Spec the API", { description: "Outline the endpoints." })] }),
  KanbanColumn("Doing", { items: [KanbanCard("Build the router", { description: "Routes + NavLink.", assignee: "Alex", tone: "primary" })], tone: "primary", limit: 3 }),
  KanbanColumn("Done",  { items: [KanbanCard("Hello world", { description: "First render.", assignee: "Ada", tone: "success" })] })
]))`,
  "KanbanCard": `$app(KanbanBoard([
  KanbanColumn("Doing", { items: [
    KanbanCard("Migrate auth",    { description: "Roll out the new SDK.", tags: ["auth"],     assignee: "Asha", icon: "key" }),
    KanbanCard("Streaming UI v2", { description: "20 new components.",    tags: ["frontend"], assignee: "Alex", tone: "primary" })
  ] })
]))`,
  "SectionHeader": `$app(Card([
  SectionHeader(
    "Daily traffic",
    { subtitle: "Visits vs signups",
    eyebrow: "ANALYTICS",
    status: Badge("On track", { tone: "success", size: "sm" }),
    actions: [Button("View all", { variant: "ghost", size: "sm" })] }
  ),
  Text("Section body content lives below the header.")
]))`,
  "Toolbar": `$app(Toolbar(
  [SearchBar("q", { placeholder: "Search…" })],
  { right: [Button("New", { variant: "primary", type: "button", size: "sm", icon: "plus" })],
  center: [ToggleGroup("v", { items: [{value: "grid", label: "Grid"}, {value: "list", label: "List"}], value: "grid" })] }
))`,
  "DescriptionList": `$app(DescriptionList([
  DescriptionItem("Team",     { value: "Design Systems",       icon: "users" }),
  DescriptionItem("Manager",  { value: "Margaret Hamilton" }),
  DescriptionItem("Location", { value: "Berlin, DE",           icon: "location-dot" }),
  DescriptionItem("Joined",   { value: "Mar 2022" }),
  DescriptionItem("Status",   { value: Badge("Active", { tone: "success", size: "sm" }) })
], { columns: 2 }))`,
  "DescriptionItem": `$app(DescriptionList([
  DescriptionItem("Plan",   { value: "Pro",       icon: "rocket" }),
  DescriptionItem("Seats",  { value: "12 / 25" }),
  DescriptionItem("Status", { value: Badge("Active", { tone: "success", size: "sm" }) })
], { columns: 1 }))`,
  "ActionStripe": `$app(Card([
  CardHeader("Account settings"),
  ActionStripe("Profile", { description: "Name, avatar, and contact details", icon: "user", value: "Ada Lovelace" }),
  ActionStripe("Notifications", { description: "Email and in-app alerts", icon: "bell", trailing: Switch("notify", { value: true }) }),
  ActionStripe("Billing", { description: "Plan, invoices, payment method", icon: "credit-card", value: "Team · $49/mo" }),
  ActionStripe("Danger zone", { description: "Delete this workspace", icon: "triangle-exclamation", disabled: true })
]))`,
  "StatusDot": `$app(Stack([
  StatusDot("API",       { tone: "success" }),
  StatusDot("Database",  { tone: "success" }),
  StatusDot("Webhooks",  { tone: "warning" }),
  StatusDot("Streaming", { tone: "success", pulse: true })
], { direction: "row", gap: "md", align: "center" }))`,
  "PricingTable": `$app(PricingTable([
  PricingCard("Starter", { price: "$0", period: "/mo", description: "For hobby projects.",
    features: ["1 workspace", "Community support", "1 GB storage"],
    action: Button("Get started", { variant: "secondary" }) }),
  PricingCard("Pro", { price: "$29", period: "/mo", description: "For teams shipping LLM features.",
    features: ["Unlimited workspaces", "Priority support", "100 GB storage"],
    action: Button("Start trial", { variant: "primary" }), featured: true }),
  PricingCard("Scale", { price: "Talk to us", description: "Custom requirements.",
    features: ["SSO + SCIM", "99.99% SLA", "On-prem available"],
    action: Button("Contact sales", { variant: "ghost" }) })
]))`,
  "PricingCard": `$app(PricingCard(
  "Pro", { price: "$29", period: "/mo",
  description: "For teams shipping LLM features in production.",
  features: ["Unlimited workspaces", "Priority support", {label: "On-prem deploy", included: false}],
  action: Button("Start free trial", { variant: "primary" }),
  featured: true,
  ribbon: "Most popular" }
))`,
  "LoadingState": `$app(LoadingState("Loading projects…", { description: "Hang tight, fetching your workspaces." }))`,
  "ErrorState": `$app(ErrorState(
  "We couldn't load that project",
  { description: "There was a problem reaching the server. Try again in a moment.",
  actions: [Button("Retry", { variant: "primary", type: "button", size: "sm", icon: "rotate-right" }),
   Button("Contact support", { variant: "ghost", type: "button", size: "sm", icon: "life-ring" })] }
))`,
  "SuccessState": `$app(SuccessState(
  "Order placed!",
  { description: "Your invoice will arrive by email shortly.",
  actions: [Button("View receipt", { variant: "primary", type: "button", size: "sm", icon: "file-invoice" }),
   Button("Back to dashboard", { variant: "ghost", type: "button", size: "sm" })] }
))`,
  "Tour": `$app(Tour([
  {title: "Welcome to Atlas", description: "Take a 30-second tour of your new workspace."},
  {title: "Projects sidebar", description: "Switch between projects from the left rail."},
  {title: "Record inspector", description: "Click any row to inspect the full record."}
], { current: $step }))
$step = 0`,
  "Spotlight": `$app(Spotlight(
  "Try the new filter bar",
  { description: "Press F to focus the filter bar, or click any column header to sort.",
  actions: [Button("Got it", { variant: "primary", size: "sm" })] }
))`,
  "LogoCloud": `$app(LogoCloud([
  LogoChip("Vercel", { icon: "bolt" }),
  LogoChip("Linear", { icon: "diagram-project" }),
  LogoChip("Stripe", { icon: "credit-card" }),
  LogoChip("Figma",  { icon: "pen-nib" })
], { label: "Trusted by leading teams" }))`,
  "LogoChip": `$app(LogoCloud([
  LogoChip("React",  { icon: "brands:react", href: "https://react.dev" }),
  LogoChip("GitHub", { icon: "brands:github" }),
  LogoChip("Stripe", { icon: "credit-card" }),
  LogoChip("Figma",  { icon: "pen-nib" })
], { label: "Works with your stack" }))`,
  "ProductCard": `$app(ProductCard("Wireless Headphones", {
  image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=480",
  price: 199,
  compareAt: 249,
  currency: "USD",
  rating: 4.5,
  reviewCount: 218,
  badge: "Sale",
  onAdd: () => { $toast.show("Added to cart") }
}))`,
  "ShareButtons": `$app(ShareButtons("https://acme.com/post/launch", {
  title: "We just launched!",
  networks: ["twitter", "linkedin", "facebook", "email"]
}))`,
  "AuthorByline": `$app(AuthorByline("Ada Lovelace", {
  avatar: "https://i.pravatar.cc/64?img=5",
  role: "Staff Engineer",
  date: "Jun 9, 2026"
}))`,
  "CodeWindow": `$app(CodeWindow(
  "$count = 0\\n$app(Card([\\n  CardHeader(\\"Counter\\"),\\n  Text(\\"Count: \\" + $count, { variant: \\"heading\\" }),\\n  Button(\\"Increment\\", { variant: \\"primary\\", onClick: () => { $count = $count + 1 } })\\n], { gap: \\"m\\" }))",
  { file: "counter.aktion", preview: true }
))`,
  "BrowserFrame": `$app(BrowserFrame(
  Stack([Text("Page content rendered inside a browser chrome.")], { gap: "sm" }),
  { url: "https://acme.com/dashboard" }
))`,
  "Terminal": `$app(Terminal([
  "$ npm install aktion-runtime",
  "added 1 package in 1.2s",
  "$ npm run build",
  "✓ built in 120ms"
], { file: "zsh" }))`,
  "ThemeToggle": `$app(Row([Text("Toggle the theme:"), ThemeToggle()], { gap: "md", align: "center" }))`,
  "CopyButton": `$app(Stack([
  Row([
    CodeBlock("npm i aktion-runtime", { copy: false }),
    CopyButton("npm i aktion-runtime", { label: "Copy" })
  ], { gap: "md", align: "center" }),
  Row([
    Text("Custom confirmation:", { tone: "muted" }),
    CopyButton("https://aktion.dev", { label: "Copy link", copiedLabel: "Link copied ✓" })
  ], { gap: "md", align: "center" })
], { gap: "md" }))`,

  /* ── Editors & overlays ─────────────────────────────────────────────── */
  "RichTextEditor": `$body = "<h2>Email draft</h2><p>Hi <b>Ada</b>, just confirming our <i>demo</i> on Friday.</p>"
$app(RichTextEditor("draft", { value: $body, placeholder: "Start composing…", minHeight: "200px" }))`,
  "CodeEditor": `$code = "function greet(name) {\\n  return 'Hello, ' + name + '!'\\n}\\n"
$app(CodeEditor("snippet", { value: $code, language: "javascript", placeholder: "// type your code…", minHeight: "200px" }))`,
  "ContextMenu": `$app(ContextMenu(
  Card([CardHeader("Right-click anywhere on this card", { subtitle: "ContextMenu attaches here" })]),
  { items: [
    {label: "Open",       icon: "arrow-up-right-from-square"},
    {label: "Duplicate",  icon: "copy"},
    MenuSeparator(),
    {label: "Delete",     icon: "trash", variant: "danger"}
  ] }
))`,
  "Sheet": `$open = false
$app(Stack([
  Button("Open sheet", { variant: "primary", onClick: () => { $open = true } }),
  Sheet([CardHeader("Slide-in sheet"), Text("Anchored to the right edge."), Button("Close", { size: "small", onClick: () => { $open = false } })], { open: $open, side: "right", title: "Details", onClose: () => { $open = false } })
], { gap: "md" }))`,
  "BottomSheet": `$open = false
$app(Stack([
  Button("Open bottom sheet", { variant: "primary", onClick: () => { $open = true } }),
  BottomSheet([Text("A mobile-style bottom sheet."), Button("Done", { size: "small", onClick: () => { $open = false } })], { open: $open, title: "Options", onClose: () => { $open = false } })
], { gap: "md" }))`,
  "ConfirmDialog": `$open = false
$app(Stack([
  Button("Delete item", { variant: "danger", onClick: () => { $open = true } }),
  ConfirmDialog("Delete this item?", {
    open: $open,
    message: "This action cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Keep",
    tone: "danger",
    onConfirm: () => { $open = false; $toast.success("Deleted") },
    onCancel: () => { $open = false }
  })
], { gap: "md" }))`,
  "SpeedDial": `$action = "none yet"
$app(Box([
  Stack([
    Text("Click the + button (bottom-right) to expand the quick actions."),
    Row([Text("Last action:", { tone: "muted" }), Badge($action, { tone: "primary" })], { gap: "sm", align: "center" })
  ], { gap: "sm" }),
  SpeedDial([
    { label: "New doc", icon: "file",      onClick: () => { $action = "New doc" } },
    { label: "Upload",  icon: "upload",    onClick: () => { $action = "Upload" } },
    { label: "Invite",  icon: "user-plus", onClick: () => { $action = "Invite" } }
  ], { icon: "plus" })
], { padding: "lg" }))`,
  "FloatingActionButton": `$app(Box([
  Text("A floating action button is pinned to the corner."),
  FloatingActionButton("plus", { label: "New item" })
], { padding: "lg" }))`,

  /* ── App shell ─────────────────────────────────────────────── */
  "AppShell": `nav = Sidebar([
  SidebarSection("Workspace", { items: [
    SidebarItem("Overview", { icon: "house",    active: true }),
    SidebarItem("Projects", { icon: "folder",   active: false, badge: "12" }),
    SidebarItem("Calendar", { icon: "calendar" })
  ] })
], { brand: "Acme HQ", footer: "Production · v2.3" })
topbar = [StatusDot("Live", { tone: "success", pulse: true })]
content = [
  PageHeader("Overview", { subtitle: "Everything happening across your workspace",
    actions: [Button("New project", { variant: "primary" })] }),
  Stats([
    StatCard("MRR",     { value: "$48.2k", trend: "up",   delta: "+12%" }),
    StatCard("Users",   { value: "2,184",  trend: "up",   delta: "+184" }),
    StatCard("Tickets", { value: "23",     trend: "down", delta: "-9" })
  ])
]
$app(AppShell(nav, { content: content, topbar: topbar }))`,
  "Sidebar": `$app(Sidebar([
  SidebarSection("Workspace", { items: [
    SidebarItem("Overview", { icon: "house",    active: true }),
    SidebarItem("Projects", { icon: "folder",   active: false, badge: "12" }),
    SidebarItem("Calendar", { icon: "calendar" }),
    SidebarItem("Messages", { icon: "comments", active: false, badge: "3" })
  ] }),
  SidebarSection("Insights", { items: [
    SidebarItem("Analytics", { icon: "chart-pie" }),
    SidebarItem("Reports",   { icon: "chart-line" }),
    SidebarItem("Billing",   { icon: "credit-card" })
  ] })
], { brand: "Acme HQ", footer: "Production · v2.3" }))`,
  "SidebarSection": `$app(Sidebar([
  SidebarSection("Workspace", { items: [
    SidebarItem("Overview", { icon: "house",  active: true }),
    SidebarItem("Projects", { icon: "folder", active: false, badge: "12" })
  ] }),
  SidebarSection("Insights", { items: [
    SidebarItem("Analytics", { icon: "chart-pie" }),
    SidebarItem("Reports",   { icon: "chart-line" })
  ] })
]))`,
  "SidebarItem": `$app(Sidebar([
  SidebarItem("Overview", { icon: "house",  active: true }),
  SidebarItem("Projects", { icon: "folder", active: false, badge: "12" }),
  SidebarItem("Calendar", { icon: "calendar" })
]))`,
  "SplitView": `primary = Card([
  CardHeader("Inbox", { subtitle: "3 unread" }),
  List([
    ListItem("Ada Lovelace", { meta: "Welcome to the team" }),
    ListItem("Grace Hopper", { meta: "Q3 planning thoughts" })
  ])
])
detail = Card([
  CardHeader("Welcome to the team", { subtitle: "Ada Lovelace · 10:24 AM" }),
  Text("Glad you joined! Here is the onboarding checklist to get you started.")
])
$app(SplitView([primary], { detail: [detail], primaryWidth: "280px" }))`,

  /* ── Advanced UI ─────────────────────────────────────────────── */
  "IconButton": `$app(Stack([
  IconButton("pencil", { label: "Edit", variant: "primary", size: "md" }),
  IconButton("trash", { label: "Delete", variant: "danger", size: "md" }),
  IconButton("ellipsis-vertical", { label: "More", variant: "ghost", size: "md" })
], { direction: "row", gap: "sm", align: "center" }))`,
  "CommandPalette": `$open = false
btn = Box(Button("Open Command Palette", () => $open = true))
cp = CommandPalette([
  {label: "New project", value: "new", group: "Actions", shortcut: "Cmd+N"},
  {label: "Open file", value: "open", group: "Actions", shortcut: "Cmd+O"},
  {label: "Search docs", value: "search", group: "Navigation", shortcut: "/"},
  {label: "Toggle theme", value: "theme", group: "Settings"}
], {
  open: $open,
  placeholder: "Type a command…",
  shortcut: "Cmd+K",
  onSelect: (v) => { $toast.show("Ran " + v) },
  onClose: () => { $open = false }
})
$app(btn, cp)`,
  "FilterChips": `$chips = ["status:active", "team:platform", "priority:high", "region:eu-west"]
$app(FilterChips($chips, {
  onRemove: (value) => { $chips = $chips.filter(c => c !== value) },
  onClear: () => { $chips = [] }
}))`,
  "FilterPill": `$showOpen = true
$showMine = false
$app(Row([
  FilterPill("Open", { active: $showOpen, count: 12, icon: "inbox", onToggle: () => $showOpen = !$showOpen }),
  FilterPill("Assigned to me", { active: $showMine, count: 3, onToggle: () => $showMine = !$showMine }),
  FilterPill("Archived", { active: false, count: 0, disabled: true })
], { gap: "sm" }))`,
  "FieldRepeater": `$app(FieldRepeater(
  [{name: "Ada Lovelace", role: "Compilers", score: 98}, {name: "Linus Torvalds", role: "Kernel", score: 96}],
  { fields: [{name: "name", label: "Name"}, {name: "role", label: "Role"}, {name: "score", label: "Score", type: "number"}],
  addLabel: "Add contributor" }
))`,
  "VirtualList": `rows = $util.range(1, 500).map(i => ({ name: "Order #" + (1420 + i), total: "€" + (18 + i % 80) + ".00" }))
$app(VirtualList(rows, {
  itemHeight: 40,
  height: 280,
  renderItem: (row) => Row([Text(row.name), Text(row.total, { tone: "muted" })], { gap: "md", align: "center" })
}))`,
  "QueryBuilder": `$rules = [
  {field: "name", op: "contains", value: "Ada"},
  {field: "score", op: "gt", value: "90"}
]
$app(QueryBuilder(
  [{name: "name", label: "Name"}, {name: "score", label: "Score", type: "number"}, {name: "team", label: "Team"}],
  { value: $rules }
))`,
  "DiffViewer": `$app(DiffViewer(
  "function greet(name) {\\n  return 'Hello ' + name\\n}",
  { right: "function greet(name) {\\n  return 'Hello, ' + name + '!'\\n}",
  mode: "unified" }
))`,
  "JsonTree": `$app(JsonTree({
  name: "aktion",
  version: "0.6.5",
  features: ["streaming", "theming", "routing"],
  config: {theme: "system", locale: "en"}
}, { expanded: true }))`,
  "Gantt": `$app(Gantt([
  {id: "design", label: "Design phase", start: "2026-05-01", end: "2026-05-02", progress: 100},
  {id: "build", label: "Build sprint", start: "2026-05-02", end: "2026-05-04", progress: 60},
  {id: "ship", label: "Ship release", start: "2026-05-03", end: "2026-05-05", progress: 0}
], { startDate: "2026-05-01", endDate: "2026-05-05" }))`,
  "Truncate": `$app(Truncate(
  "Aktion is a compact, declarative DSL designed for LLM-generated rich UI responses. It ships with 281 components, six built-in themes, hash-based routing, and real-time streaming. The language is parsed token-by-token so partial responses render progressively without waiting for the full payload.",
  { maxLines: 2, expandLabel: "Read more" }
))`,
  "InlineEdit": `$title = "Q3 revenue review"
$app(InlineEdit($title, {
  label: "Document title",
  hint: "Click the title to rename it",
  onSave: (v) => { $title = v }
}))`,
  "NotificationBell": `$app(NotificationBell({
  count: 3,
  items: [
    {title: "New comment on PR #142", message: "Ada Lovelace: looks great!", time: "2m ago", unread: true},
    {title: "Build succeeded", message: "All 214 tests passed on main.", time: "10m ago", unread: true},
    {title: "Weekly digest ready", time: "1h ago"}
  ],
  onMarkAllRead: () => { $toast.show("All caught up") }
}))`,
  "Reveal": `$app(Stack([
  Reveal(Card([CardHeader("Fades up on scroll")]), { animation: "fade-up" }),
  Reveal(Card([CardHeader("Zooms in (delayed)")]), { animation: "zoom", delay: 150 })
], { gap: "md" }))`,
  "Transition": `$open = true
$app(Stack([
  Switch("open", { value: $open, label: "Show panel", onChange: (v) => { $open = v } }),
  Transition(Card([CardHeader("Animated panel"), Text("Toggles in and out with a scale transition.")]), { show: $open, preset: "scale" })
], { gap: "md" }))`,
  "FlipList": `$items = ["Apple", "Banana", "Cherry", "Date"]
$app(Stack([
  Button("Shuffle", { variant: "primary", size: "small", onClick: () => { $items = [$items[3], $items[0], $items[2], $items[1]] } }),
  FlipList($items.map(x => Card([Text(x)], { key: x })), { duration: 300 })
], { gap: "md" }))`,
  "Parallax": `$app(Stack([
  Text("Scroll — the card drifts at a different rate."),
  Parallax(Card([CardHeader("Parallax layer")]), { speed: 0.3 })
], { gap: "md" }))`,
  "ReadingProgress": `$app(Stack([
  ReadingProgress({ gradient: true, height: "4px" }),
  Text("A reading-progress bar fills as the page scrolls (pinned to the top).")
]))`,
  "Sortable": `$tasks = ["Design", "Build", "Test", "Ship"]
function moveTask(from, to) {
  let next = [...$tasks]
  let item = next.splice(from, 1)[0]
  next.splice(to, 0, item)
  $tasks = next
}
$app(Stack([
  Sortable(
    $tasks.map(t => Card([Text(t, { variant: "body-heavy" })], { padding: "sm", key: t })),
    { handle: true, onReorder: (from, to) => moveTask(from, to) }
  ),
  Text("Order: " + $tasks.join(" → "), { tone: "muted", variant: "small" })
], { gap: "md" }))`,
  "Draggable": `$app(Row([
  Draggable(Badge("Drag me", { tone: "primary" }), { data: "card-1" }),
  DropZone(EmptyState("Drop here", { description: "Release a draggable item." }), { label: "Drop target", onDrop: (data) => $toast.show("Dropped " + data) })
], { gap: "lg", align: "center" }))`,
  "DropZone": `$app(DropZone(
  EmptyState("Drop files or items here", { description: "A bounded drop target." }),
  { label: "Upload zone", onDrop: (data) => $toast.success("Dropped") }
))`,
  "OnGesture": `$last = "none yet"
$app(Stack([
  OnGesture(
    Card([
      CardHeader("Gesture surface", { subtitle: "swipe · long-press · double-tap" }),
      Text("Drag across me, hold me down, or tap twice — works with touch and mouse.")
    ], { gap: "sm" }),
    {
      swipe: (dir) => { $last = "swiped " + dir },
      longPress: () => { $last = "long pressed" },
      doubleTap: () => { $last = "double tapped" }
    }
  ),
  Row([Text("Last gesture:", { tone: "muted" }), Badge($last, { tone: "primary" })], { gap: "sm", align: "center" })
], { gap: "md" }))`,

  /* ── Routing ─────────────────────────────────────────────── */
  "NavLink": `$app(Stack([
  NavLink("Home",    { to: "/",        variant: "ghost",   exact: true,  icon: "house" }),
  NavLink("Docs",    { to: "/docs",    variant: "ghost",   exact: false, icon: "book" }),
  NavLink("Pricing", { to: "/pricing", variant: "primary", exact: false, icon: "tag" })
], { direction: "row", gap: "sm", align: "center" }))`,
  "RouteView": `$app(RouteView(
  $router({ "/": Card([CardHeader("Home page")]), "/about": Card([CardHeader("About page")]), default: Card([CardHeader("Not found")]) }),
  { routeKey: route.path, animation: "fade-up", duration: 280 }
))`,

  /* ── Helpers ─────────────────────────────────────────────── */
  "Async": `$app(Async(roster, {
  loading: Skeleton("paragraph", { count: 2 }),
  error: Callout("danger", { title: "Load failed", text: "Could not reach the directory." }),
  empty: Text("No teammates yet."),
  data: Stack([Text("Priya Raman — Design"), Text("Tom Becker — Backend")], { gap: "xs" })
}))

roster = [{ name: "Priya Raman" }, { name: "Tom Becker" }]`,
  "Show": `$isOpen = true
$app(Stack([
  Switch("toggle", { label: "Show content", value: $isOpen }),
  Show($isOpen, { fallback: Callout("info", { title: "Hidden", text: "Toggle the switch above." }), children: [
    Callout("success", { title: "Visible", text: "The content is showing." })
  ] })
]))`,
  "Portal": `$app(Stack([
  Text("Portal renders children outside the normal subtree."),
  Portal([Badge("Portalled content", { tone: "primary" })])
]))`,
  "Redirect": `$app($router({
  "/dashboard": Card([CardHeader("Dashboard"), Text("Signed in as Priya Raman.")]),
  "/login": Redirect("/dashboard"),
  default: Redirect("/dashboard")
}))`,
  "Lazy": `$app(Lazy(null,
  { fallback: Skeleton("card"),
  children: [Card([CardHeader("Loaded"), Text("Content arrived.")])] }
))`,
  "ErrorBoundary": `$app(ErrorBoundary(
  { fallback: Callout("danger", { title: "Something went wrong", text: "An error occurred in this section." }),
  children: [Card([CardHeader("Safe content"), Text("This renders normally.")])] }
))`,
  "LiveRegion": `$status = "Saving…"
$app(Stack([
  Row([Button("Save", { variant: "primary", size: "small", onClick: () => { $status = "Saved ✓" } }), Text($status)], { gap: "md", align: "center" }),
  LiveRegion($status, { politeness: "polite" })
], { gap: "md" }))`,
  "FocusTrap": `$app(FocusTrap(
  Card([
    CardHeader("Focus stays in this card"),
    Input("email", { placeholder: "you@example.com" }),
    Row([Button("Cancel", { variant: "ghost" }), Button("Save", { variant: "primary" })], { gap: "sm" })
  ]),
  { active: true, onEscape: () => $toast.show("Escape pressed") }
))`,

  /* ── Behaviour wrappers ─────────────────────────────────────────────── */
  "OnClick": `$app(OnClick(
  Card([
    CardHeader("Clickable card"),
    Text("Click anywhere — fires the OnClick handler.")
  ]),
  { onClick: () => console.log("card clicked") }
))`,
  "OnMouse": `$app(OnMouse(
  Card([
    CardHeader("Hover / drag surface", { subtitle: "Open the console to watch events" }),
    Text("Move the mouse, right-click, or drag a file onto this card.")
  ]),
  {
    enter:     () => console.log("enter"),
    leave:     () => console.log("leave"),
    dragOver:  (e) => e.preventDefault(),
    drop:      (e) => { e.preventDefault(); console.log("dropped", e.dataTransfer.files) }
  }
))`,
  "OnKeyboard": `$app(OnKeyboard(
  Card([
    CardHeader("Press a key"),
    Text("Focus this card and press any key — the handler logs to console.")
  ]),
  { onKeyDown: (e) => console.log("key:", e.key) }
))`,
  "OnFocus": `$app(OnFocus(
  Card([
    CardHeader("Focus tracker"),
    Input("Try focusing me", { placeholder: "Tab to focus / blur" })
  ]),
  {
    onFocus: () => console.log("focus entered"),
    onBlur:  () => console.log("focus left")
  }
))`,
  "OnIntersect": `$app(OnIntersect(
  Card([
    CardHeader("Visible-on-scroll sentinel"),
    Text("Fires onEnter when this card enters the viewport.")
  ]),
  { onEnter: () => console.log("visible!"), once: true }
))`,
  "OnMount": `$app(OnMount(
  Card([CardHeader("Mounted"), Text("onMount fires once after this node attaches.")]),
  { onMount: () => $toast.show("Mounted"), onUnmount: () => $toast.show("Unmounted") }
))`,
  "Css": `$app(Css(
  Card([
    CardHeader("Custom styled card"),
    Text("Class + inline style merged onto the rendered Card element.")
  ]),
  { class: "highlight", style: "border-color: #f59e0b; box-shadow: 0 0 0 2px #fde68a;" }
))`,
  "Link": `$app(Stack([
  Link("Internal route",   { to: "/dashboard" }),
  Link("External docs",    { href: "https://example.com", external: true }),
  Link(Badge("Wrapped component", { tone: "primary" }), { to: "/profile" })
], { gap: "sm" }))`,

  /* ── Interop ─────────────────────────────────────────────── */
  "Mount": `$app(Stack([
  Text("Mount owns the host node — the widget is never rebuilt."),
  Mount({
    props: { clicks: $clicks },
    setup: (node, p) => { node.textContent = "setup ran — clicks: " + p.clicks; return node },
    update: (node, p) => { node.textContent = "update ran — clicks: " + p.clicks },
    cleanup: (node) => { node.textContent = "" }
  }),
  Button("Increment", { variant: "primary", size: "small", onClick: () => { $clicks = $clicks + 1 } })
], { gap: "md" }))

$clicks = 0`,
  "WebComponent": `$app(Card([
  CardHeader("3D product preview", { subtitle: "Rendered by a native custom element" }),
  WebComponent("model-viewer", {
    attributes: { alt: "Aurora desk lamp", "camera-controls": "true" },
    on: { load: () => $toast.show("Viewer ready") },
    children: [Text("Loading the 3D preview…")]
  })
]))`,

  /* ── Escape hatches ─────────────────────────────────────────────── */
  "HTMLTag": `$app(HTMLTag("section",
  { attributes: { class: "rui-html-demo", "data-role": "spotlight" },
  children: [
    HTMLTag("h2", { attributes: { class: "rui-html-demo-title" }, children: [Text("Custom markup")] }),
    HTMLTag("p",  { attributes: { class: "rui-html-demo-body" },  children: [Text("Reach for HTMLTag only when no built-in component captures the shape you need.")] })
  ] }
))`,
  "Styles": `$app(Stack([
  Styles(\`
    .escape-hatch-card {
      border: 1px dashed var(--rui-color-border);
      border-radius: 12px;
      padding: 16px;
      background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.08));
    }
    .escape-hatch-card strong { color: var(--rui-color-primary); }
  \`),
  HTMLTag("div", { attributes: { class: "escape-hatch-card" }, children: [
    Markdown("Use **Styles** + **HTMLTag** together to scope custom CSS to your own selectors.")
  ] })
]))`,
};
