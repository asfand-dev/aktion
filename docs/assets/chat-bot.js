/**
 * Chat bot — generative UI demo powered by OpenRouter.
 *
 * Four generation modes:
 *   - chat-compact : `getSystemPrompt({ mode: "chat" })`
 *   - chat-full    : `getSystemPrompt({ mode: "full" })`
 *   - website      : `getSystemPrompt({ mode: "full", preamble, rules })`
 *   - app          : `getSystemPrompt({ mode: "full", preamble, rules })`
 *
 * Per assistant turn:
 *   - Live streaming preview rendered by <streaming-ui-script>.
 *   - Preview / Source tabs with copy + open-in-playground + download HTML.
 *   - Regenerate uses the last user prompt.
 *
 * All UI state (mode, theme, model, key, history) is persisted to
 * localStorage so the page survives reloads.
 *
 * No bundler: ships as plain ESM to GitHub Pages.
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
  theme: "streaming-ui-script.chat.theme",
  mode: "streaming-ui-script.chat.mode",
  history: "streaming-ui-script.chat.history-size",
};

const MODES = {
  "chat-compact": {
    label: "Chat (Compact)",
    icon: "comments",
    options: () => ({ mode: "chat" }),
  },
  "chat-full": {
    label: "Chat (Full)",
    icon: "comment-dots",
    options: () => ({ mode: "full" }),
  },
  website: {
    label: "Website Builder",
    icon: "globe",
    options: () => ({
      mode: "full",
      preamble: WEBSITE_PREAMBLE,
      additionalRules: WEBSITE_RULES,
    }),
  },
  app: {
    label: "App Builder",
    icon: "shapes",
    options: () => ({
      mode: "full",
      preamble: APP_PREAMBLE,
      additionalRules: APP_RULES,
    }),
  },
};

const SUGGESTIONS = {
  "chat-compact": [
    { icon: "chart-line", title: "Show this week's sales as a chart", desc: "KPIs + line chart in a single card." },
    { icon: "list-check", title: "Make me a todo list", desc: "Reactive add/delete with state." },
    { icon: "circle-info", title: "Render a feature table", desc: "5 features compared across 3 plans." },
    { icon: "comment", title: "Reply with a follow-up block", desc: "Three suggested next prompts." },
  ],
  "chat-full": [
    { icon: "gauge-high", title: "Build a sales dashboard", desc: "Metric grid + chart + kanban board." },
    { icon: "calendar-days", title: "Weekly schedule view", desc: "Timeline + booking sheet with Script." },
    { icon: "table", title: "Live orders table", desc: "Sortable, filterable, with a detail sheet." },
    { icon: "envelope", title: "Inbox with split view", desc: "List on the left, conversation on the right." },
  ],
  website: [
    { icon: "rocket", title: "SaaS landing page for an AI startup", desc: "Hero, features, pricing, testimonials." },
    { icon: "store", title: "Restaurant marketing site", desc: "Menu, hours, gallery, reservation CTA." },
    { icon: "graduation-cap", title: "Online course landing page", desc: "Curriculum, instructor, FAQ, enroll." },
    { icon: "newspaper", title: "Personal portfolio", desc: "Bio, projects grid, contact section." },
  ],
  app: [
    { icon: "users", title: "CRM with contacts and deals", desc: "Dashboard, contacts, deals pipeline, settings." },
    { icon: "cart-shopping", title: "Mini e-commerce admin", desc: "Products, orders, customers, analytics." },
    { icon: "stethoscope", title: "Clinic appointment manager", desc: "Calendar, patients, appointments, billing." },
    { icon: "code-branch", title: "Project management app", desc: "Projects, kanban, team, sprint analytics." },
  ],
};

const WEBSITE_PREAMBLE =
  "You are a generative web designer. Your job is to produce complete, modern, production-quality websites in Streaming UI Script. The reply must look and feel like a real, polished marketing or content site — not a single card.";

const WEBSITE_RULES = [
  "WEBSITE MODE — always return a full, multi-section website assigned to `root`. Never reply with a single Card or a chat-style bubble in this mode.",
  "Lead with a `Navbar` (logo + 3–6 links + CTA) and end with a footer section (Stack with brand line, link columns, and a small copyright note).",
  "Between the navbar and footer compose 5+ sections drawn from: `Hero`, `Cover`, `FeatureGrid`, `MediaCard`, `PricingTable`, `Testimonial`, `Stats`, `Timeline`, `Banner`, `EmptyState` (for CTA blocks), and `Section`/`Card` for custom blocks. Use `Container(maxWidth, content)` to constrain each section.",
  "Use multiple routes when the user implies more than one page (Home, Pricing, About, Contact, etc.) — wire them up with `Routes([Route(...), ...], \"/\")` and `NavLink` items in the navbar. Each page must be substantive (3+ sections).",
  "Use real-looking copy. Never write Lorem Ipsum or placeholder text — write actual marketing-ready microcopy that fits the product/brand the user asked for.",
  "Use `Icon`/`Badge` liberally for visual polish, and `Quote` for testimonials. Pair text-heavy sections with `Image` URLs that look plausible (https://images.unsplash.com/... or https://picsum.photos/).",
  "Keep the response in pure Streaming UI Script — no HTML, no markdown wrappers, no commentary.",
];

const APP_PREAMBLE =
  "You are a generative full-stack app builder. Your job is to produce complete, working applications in Streaming UI Script with multiple routes, reactive state, working CRUD interactions, and rich SaaS-quality UI.";

const APP_RULES = [
  "APP MODE — always reply with a complete application assigned to `root` using `AppShell` (or `Sidebar`+`SplitView`) for the layout. Never reply with a single Card.",
  "The application MUST have a left `Sidebar` with logical sections (`SidebarSection`) and 4–8 `SidebarItem`s pointing to routes. Every nav item must lead to a real, working page rendered via `Routes([Route(...), ...], \"/dashboard\")`.",
  "Every page must be substantive: KPIs (`MetricGrid`), at least one data view (`Table`, `KanbanBoard`, `Timeline`, `List`, or `Tree`), filters/toolbar (`Toolbar`, `SearchBar`), and at least one working action button (Create / Edit / Delete / Status change).",
  "MOCK DATA — if the user did not provide a data source, seed realistic mock data inline via `$state` variables at the top of the program. Aim for 5–20 sample rows per dataset, with believable names, dates, numbers, and statuses. Pages must read from these `$state` variables so changes propagate live.",
  "Every visible button must be wired. Use `Action([@Set(...), @Push(...), @Reset(...), @Js(...), @Navigate(...)])` for behaviour. No dead buttons. Forms must submit into `$state` and update the visible UI.",
  "Use `Script(\"id\", body, deps?)` for derived/computed state (e.g. totals, filtered lists) and lifecycle effects (interval refreshes, keyboard shortcuts). Use `@Js(body, args?)` for one-shot click handlers that need per-row data.",
  "Match the design quality of shadcn/Tailwind apps: rich layouts, `PageHeader` on each page, `Toolbar` strips, `StatCard` density, `Badge`/`StatusDot` for state, `Avatar`/`PersonChip` where people appear, `EmptyState` for empty lists.",
  "Keep the response in pure Streaming UI Script — no HTML, no markdown wrappers, no commentary.",
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
  get theme() { return localStorage.getItem(STORAGE.theme) || "light"; },
  set theme(v) { localStorage.setItem(STORAGE.theme, v); },
  get mode() {
    const raw = localStorage.getItem(STORAGE.mode);
    return raw && MODES[raw] ? raw : "chat-compact";
  },
  set mode(v) {
    if (MODES[v]) localStorage.setItem(STORAGE.mode, v);
  },
  get historySize() {
    const raw = parseInt(localStorage.getItem(STORAGE.history) || "", 10);
    return Number.isFinite(raw) && raw >= 1 && raw <= 20 ? raw : 5;
  },
  set historySize(v) {
    const n = Math.max(1, Math.min(20, Math.round(v) || 5));
    localStorage.setItem(STORAGE.history, String(n));
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
  setup: $("cb-setup"),
  setupForm: $("cb-setup-form"),
  setupKey: $("cb-setup-key"),
  setupModel: $("cb-setup-model"),
  setupErr: $("cb-setup-error"),
  setupReveal: $("cb-setup-reveal"),
  chat: $("cb-chat"),
  modes: $("cb-modes"),
  theme: $("cb-theme"),
  model: $("cb-model"),
  newChat: $("cb-new-chat"),
  settingsBtn: $("cb-settings"),
  stage: $("cb-stage"),
  welcome: $("cb-welcome"),
  suggestions: $("cb-suggestions"),
  history: $("cb-history"),
  composer: $("cb-composer"),
  input: $("cb-input"),
  send: $("cb-send"),
  stop: $("cb-stop"),
  drawer: $("cb-drawer"),
  drawerBackdrop: $("cb-drawer-backdrop"),
  drawerClose: $("cb-drawer-close"),
  drawerKey: $("cb-drawer-key"),
  drawerReveal: $("cb-drawer-reveal"),
  drawerModel: $("cb-drawer-model"),
  drawerHistory: $("cb-drawer-history"),
  drawerHistoryReadout: $("cb-history-readout"),
  drawerExport: $("cb-drawer-export"),
  drawerReset: $("cb-drawer-reset"),
  toast: $("cb-toast"),
};

/* ===========================================================================
   5. App state
   =========================================================================== */

const conversation = []; // { role: "user" | "assistant", content }
const turns = [];        // DOM refs per assistant turn
let inFlight = null;     // AbortController
let currentMode = settings.mode;
let cachedPrompt = "";   // current built system prompt

/* ===========================================================================
   6. Boot
   =========================================================================== */

function boot() {
  hydrateUiFromSettings();
  wireEvents();

  if (settings.apiKey) {
    showChat();
  } else {
    showSetup();
  }
}

function hydrateUiFromSettings() {
  // Reflect mode on <body> so CSS can theme accents per mode.
  document.body.dataset.mode = currentMode;

  // Mode tabs
  for (const btn of els.modes.querySelectorAll(".cb-mode")) {
    const isActive = btn.dataset.mode === currentMode;
    btn.setAttribute("aria-selected", String(isActive));
  }

  renderSuggestions(currentMode);

  // Selects
  els.theme.value = settings.theme;
  ensureSelectOption(els.model, settings.model);
  els.model.value = settings.model;

  // Drawer fields
  els.drawerKey.value = settings.apiKey;
  els.drawerModel.value = settings.model;
  els.drawerHistory.value = String(settings.historySize);
  renderHistoryReadout(settings.historySize);

  // Setup defaults
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
  cachedPrompt = buildSystemPrompt(currentMode);
  ensureComposerCount();
  toggleWelcome(conversation.length === 0);
  setTimeout(() => els.input?.focus(), 30);
}

function ensureComposerCount() {
  if (document.getElementById("cb-composer-count")) return;
  const hint = document.querySelector(".cb-composer-hint");
  if (!hint) return;
  const count = document.createElement("span");
  count.id = "cb-composer-count";
  count.className = "cb-composer-count";
  count.textContent = "0";
  hint.parentNode.insertBefore(count, hint.nextSibling);
  updateComposerCount();
}

function updateComposerCount() {
  const node = document.getElementById("cb-composer-count");
  if (!node || !els.input) return;
  const n = els.input.value.length;
  node.textContent = n ? `${n.toLocaleString()} chars` : "";
  node.dataset.tone = n > 4000 ? "warn" : "";
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
  // -- Setup form --
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

  // -- Mode tabs --
  els.modes.addEventListener("click", (e) => {
    const btn = e.target.closest(".cb-mode");
    if (!btn) return;
    selectMode(btn.dataset.mode);
  });

  // -- Theme picker (affects all renderers) --
  els.theme.addEventListener("change", (e) => {
    settings.theme = e.target.value;
    document.querySelectorAll(".cb-msg-preview streaming-ui-script").forEach((node) => {
      node.setAttribute("theme", e.target.value);
    });
  });

  // -- Model picker --
  els.model.addEventListener("change", (e) => {
    settings.model = e.target.value;
    els.drawerModel.value = e.target.value;
  });

  // -- New chat --
  els.newChat.addEventListener("click", () => resetConversation());

  // -- Settings drawer --
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
  els.drawerHistory.addEventListener("input", () => {
    const n = parseInt(els.drawerHistory.value, 10) || 5;
    settings.historySize = n;
    renderHistoryReadout(n);
  });
  els.drawerReset.addEventListener("click", () => {
    if (inFlight) inFlight.abort();
    settings.clearKey();
    resetConversation();
    closeDrawer();
    showSetup();
    showToast("API key cleared", "trash");
  });
  els.drawerExport.addEventListener("click", () => exportChat());

  // -- Composer --
  els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.input.value;
    if (!text.trim() || els.send.disabled) return;
    els.input.value = "";
    resizeInput();
    sendMessage(text);
  });

  els.input.addEventListener("input", () => {
    resizeInput();
    updateComposerCount();
  });
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      els.composer.requestSubmit();
    }
    if (event.key === "Escape" && inFlight) {
      inFlight.abort();
    }
  });

  // -- Stop button --
  els.stop.addEventListener("click", () => {
    if (inFlight) inFlight.abort();
  });

  // -- Suggestions (event-delegated; rendered dynamically) --
  els.suggestions.addEventListener("click", (e) => {
    const btn = e.target.closest(".cb-suggestion");
    if (!btn) return;
    sendMessage(btn.dataset.prompt || btn.textContent || "");
  });

  // -- Keyboard shortcut: Esc closes the drawer when it's open --
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.drawer.dataset.open === "true") {
      closeDrawer();
    }
  });
}

/* ===========================================================================
   8. Mode handling
   =========================================================================== */

function selectMode(mode) {
  if (!MODES[mode] || mode === currentMode) return;
  currentMode = mode;
  settings.mode = mode;
  document.body.dataset.mode = mode;
  for (const btn of els.modes.querySelectorAll(".cb-mode")) {
    btn.setAttribute("aria-selected", String(btn.dataset.mode === mode));
  }
  renderSuggestions(mode);
  cachedPrompt = buildSystemPrompt(mode);
  showToast(`${MODES[mode].label} mode`, MODES[mode].icon);
}

function renderSuggestions(mode) {
  const list = SUGGESTIONS[mode] || [];
  els.suggestions.innerHTML = "";
  for (const item of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cb-suggestion";
    btn.dataset.prompt = item.title;
    btn.innerHTML = `
      <span class="cb-suggestion-title"><i class="fa-solid fa-${escapeAttr(item.icon)}"></i> ${escapeHtml(item.title)}</span>
      <span class="cb-suggestion-desc">${escapeHtml(item.desc)}</span>
    `;
    els.suggestions.append(btn);
  }
}

function buildSystemPrompt(mode) {
  const def = MODES[mode] || MODES["chat-compact"];
  const proxy = document.createElement("streaming-ui-script");
  return proxy.getSystemPrompt(def.options());
}

/* ===========================================================================
   9. Conversation lifecycle
   =========================================================================== */

function resetConversation() {
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  conversation.length = 0;
  turns.length = 0;
  els.history.replaceChildren();
  toggleWelcome(true);
  setBusy(false);
  els.input.focus();
}

function toggleWelcome(show) {
  els.welcome.hidden = !show;
}

function setBusy(busy) {
  els.send.disabled = busy;
  els.input.disabled = false; // Always allow typing the next message
  els.stop.hidden = !busy;
  els.send.querySelector("span").textContent = busy ? "Sending…" : "Send";
}

function resizeInput() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(200, els.input.scrollHeight)}px`;
}

async function sendMessage(rawText) {
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

  conversation.push({ role: "user", content: text });
  appendUserMessage(text);

  const turn = appendAssistantTurn(currentMode);
  turns.push(turn);
  setBusy(true);

  // Build messages: system + last N turns (1 turn = 1 user + 1 assistant).
  const N = settings.historySize * 2;
  const truncated = conversation.slice(-N);
  const payload = [
    { role: "system", content: cachedPrompt || buildSystemPrompt(currentMode) },
    ...truncated,
  ];

  const controller = new AbortController();
  inFlight = controller;

  try {
    let full = "";
    for await (const delta of streamCompletion({
      apiKey: settings.apiKey,
      model: settings.model,
      messages: payload,
      signal: controller.signal,
    })) {
      full += delta;
      turn.setSource(full);
      turn.setPreview(stripFences(full));
    }
    turn.markDone();
    conversation.push({ role: "assistant", content: full });
  } catch (err) {
    if (controller.signal.aborted) {
      turn.markCancelled();
    } else {
      turn.markError(err?.message || "Request failed");
      conversation.pop(); // remove the unanswered user message
    }
  } finally {
    setBusy(false);
    if (inFlight === controller) inFlight = null;
  }
}

/* ===========================================================================
   10. Message rendering
   =========================================================================== */

function appendUserMessage(text) {
  const wrap = el("article", { class: "cb-msg cb-msg--user" });
  const meta = el("div", { class: "cb-msg-meta" },
    el("span", { class: "cb-role" },
      el("i", { class: "fa-solid fa-user", "aria-hidden": "true" }),
      " You",
    ),
    el("span", { class: "cb-msg-time" }, formatTime(new Date())),
  );
  const bubble = el("div", { class: "cb-bubble" }, text);
  wrap.append(meta, bubble);
  els.history.append(wrap);
  scrollToEnd();
}

function appendAssistantTurn(mode) {
  const def = MODES[mode] || MODES["chat-compact"];

  const wrap = el("article", { class: "cb-msg cb-msg--assistant" });

  const stats = el("span", { class: "cb-msg-meta-stats" },
    el("span", { class: "cb-stat-chars" },
      el("b", {}, "0"), " chars",
    ),
    el("span", {}, "·"),
    el("span", { class: "cb-stat-lines" },
      el("b", {}, "0"), " lines",
    ),
    el("span", {}, "·"),
    el("span", { class: "cb-stat-time" },
      el("b", {}, "0.0s"),
    ),
  );

  const meta = el("div", { class: "cb-msg-meta" },
    el("span", { class: "cb-role" },
      el("i", { class: "fa-solid fa-wand-magic-sparkles", "aria-hidden": "true" }),
      " Assistant",
    ),
    el("span", { class: "cb-mode-pill" },
      el("i", { class: `fa-solid fa-${def.icon}`, "aria-hidden": "true" }),
      " " + def.label,
    ),
    stats,
    el("span", { class: "cb-msg-time" }, formatTime(new Date())),
  );

  const card = el("div", { class: "cb-msg-card", "data-streaming": "true" });

  // Tabs row
  const tabs = el("div", { class: "cb-msg-tabs", role: "tablist" });
  const tabPreview = el("button", {
    type: "button",
    class: "cb-msg-tab",
    "data-tab": "preview",
    role: "tab",
    "aria-selected": "true",
  }, el("i", { class: "fa-solid fa-display", "aria-hidden": "true" }), " Preview");
  const tabSource = el("button", {
    type: "button",
    class: "cb-msg-tab",
    "data-tab": "source",
    role: "tab",
    "aria-selected": "false",
  }, el("i", { class: "fa-solid fa-code", "aria-hidden": "true" }), " Source");

  const tabsSpacer = el("div", { class: "cb-msg-tabs-spacer" });

  const status = el("span", { class: "cb-status", "data-tone": "streaming" },
    el("i", { class: "fa-solid fa-circle-notch fa-spin", "aria-hidden": "true" }),
    el("span", { class: "cb-status-text" }, "Streaming…"),
  );

  tabs.append(tabPreview, tabSource, tabsSpacer, status);

  // Body
  const body = el("div", { class: "cb-msg-body" });

  // Preview panel: viewport bar + framed renderer + skeleton overlay.
  const previewPanel = el("div", {
    class: "cb-msg-panel",
    "data-key": "preview",
    "data-active": "true",
  });

  const previewWrap = el("div", { class: "cb-msg-preview", "data-vp": "desktop" });
  const previewFrame = el("div", { class: "cb-msg-preview-frame" });
  const skeleton = el("div", { class: "cb-msg-skeleton" },
    el("span"), el("span"), el("span"), el("span"), el("span"),
  );
  const renderer = document.createElement("streaming-ui-script");
  renderer.setAttribute("transparent", "true");
  renderer.setAttribute("theme", settings.theme);
  renderer.setAttribute("data-theme-managed", "true");
  renderer.style.display = "none";
  renderer.addEventListener("assistant-message", (event) => {
    const m = event.detail?.message;
    if (typeof m === "string" && m.trim()) {
      sendMessage(m);
    }
  });
  previewFrame.append(skeleton, renderer);
  previewWrap.append(previewFrame);
  previewPanel.append(previewWrap);

  const sourcePanel = el("div", {
    class: "cb-msg-panel",
    "data-key": "source",
    "data-active": "false",
  });
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
  const spacer = el("div", { class: "cb-msg-actions-spacer" });
  const regenBtn = makeAction("regenerate", "fa-rotate", "Regenerate");
  actions.append(copyBtn, playBtn, dlBtn, shareBtn, fsBtn, spacer, regenBtn);

  card.append(tabs, body, actions);
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

  // Action handlers
  let currentSource = "";
  const startedAt = performance.now();
  let timerId = null;
  const charsB = stats.querySelector(".cb-stat-chars b");
  const linesB = stats.querySelector(".cb-stat-lines b");
  const timeB  = stats.querySelector(".cb-stat-time b");
  const tickTimer = () => {
    timeB.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
  };
  timerId = setInterval(tickTimer, 100);

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentSource);
      flashAction(copyBtn, "Copied", "fa-check");
      showToast("Source copied", "copy");
    } catch {
      showToast("Couldn't copy source", "triangle-exclamation");
    }
  });

  playBtn.addEventListener("click", async () => {
    if (!currentSource.trim()) {
      showToast("Nothing to open yet", "circle-info");
      return;
    }
    try {
      const encoded = await encodeShare(currentSource);
      const url = new URL("playground.html", window.location.href);
      url.searchParams.set("code", encoded);
      window.open(url.toString(), "_blank", "noopener");
    } catch {
      showToast("Couldn't open in playground", "triangle-exclamation");
    }
  });

  dlBtn.addEventListener("click", () => {
    if (!currentSource.trim()) {
      showToast("Nothing to download yet", "circle-info");
      return;
    }
    downloadHtml(currentSource, settings.theme, MODES[mode]?.label || "Generated UI");
  });

  shareBtn.addEventListener("click", async () => {
    if (!currentSource.trim()) {
      showToast("Nothing to share yet", "circle-info");
      return;
    }
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

  fsBtn.addEventListener("click", () => {
    openFullscreen(currentSource, settings.theme, MODES[mode]?.label || "Generated UI");
  });

  regenBtn.addEventListener("click", () => regenerateFrom(wrap));

  return {
    wrap,
    mode,
    setSource(text) {
      currentSource = text;
      sourceCode.textContent = text;
      // Hide skeleton + reveal renderer once first chunk arrives.
      if (text && skeleton.style.display !== "none") {
        skeleton.style.display = "none";
        renderer.style.display = "block";
      }
      charsB.textContent = String(text.length);
      linesB.textContent = String(text ? text.split("\n").length : 0);
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
      if (timerId) { clearInterval(timerId); timerId = null; tickTimer(); }
      // Make sure renderer is shown (in case stream produced nothing).
      skeleton.style.display = "none";
      renderer.style.display = "block";
    },
    markCancelled() {
      status.dataset.tone = "";
      status.querySelector("i").className = "fa-solid fa-ban";
      status.querySelector(".cb-status-text").textContent = "Cancelled";
      card.dataset.streaming = "false";
      if (timerId) { clearInterval(timerId); timerId = null; }
    },
    markError(message) {
      status.dataset.tone = "";
      status.querySelector("i").className = "fa-solid fa-triangle-exclamation";
      status.querySelector(".cb-status-text").textContent = "Error";
      card.dataset.streaming = "false";
      if (timerId) { clearInterval(timerId); timerId = null; }
      const err = el("div", { class: "cb-msg-err" }, message);
      card.append(err);
    },
  };
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

function regenerateFrom(wrap) {
  // Find the user message immediately before this assistant message.
  const previous = wrap.previousElementSibling;
  if (!previous || !previous.classList.contains("cb-msg--user")) {
    showToast("Nothing to regenerate", "circle-info");
    return;
  }
  const text = previous.querySelector(".cb-bubble")?.textContent || "";
  if (!text.trim()) return;

  // Remove the assistant turn (and any cancelled / error tail) so we replace it.
  wrap.remove();
  // Pop the last assistant entry from the conversation (if any).
  if (conversation.length && conversation[conversation.length - 1].role === "assistant") {
    conversation.pop();
  }
  // Pop the user message too — sendMessage will re-add it.
  if (conversation.length && conversation[conversation.length - 1].role === "user") {
    conversation.pop();
  }
  previous.remove();
  sendMessage(text);
}

/* ===========================================================================
   11. OpenRouter streaming
   =========================================================================== */

async function* streamCompletion({ apiKey, model, messages, signal }) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.href,
      "X-Title": "streaming-ui-script chat bot",
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.5 }),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.error?.message || "";
    } catch { /* ignore */ }
    throw new Error(detail || `OpenRouter request failed (${res.status}). Check your API key and selected model.`);
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

function stripFences(text) {
  let out = (text || "").trim();
  const opening = out.match(/^```[a-zA-Z0-9_-]*\n/);
  if (opening) out = out.slice(opening[0].length);
  if (out.endsWith("```")) out = out.slice(0, -3).trimEnd();
  return out;
}

/* ===========================================================================
   12. Fullscreen overlay + Download as standalone HTML
   =========================================================================== */

let fsOverlay = null;
function openFullscreen(source, theme, modeLabel) {
  const text = stripFences(source || "");
  if (!text.trim()) {
    showToast("Nothing to preview yet", "circle-info");
    return;
  }
  if (!fsOverlay) {
    fsOverlay = el("div", { class: "cb-fullscreen", id: "cb-fullscreen" });
    const head = el("div", { class: "cb-fullscreen-head" },
      el("h3", {},
        el("i", { class: "fa-solid fa-expand", "aria-hidden": "true" }),
        el("span", { class: "cb-fs-title" }, "Fullscreen preview"),
      ),
      el("div", { class: "cb-toolbar-spacer" }),
      el("button", { type: "button", class: "cb-iconbtn", "aria-label": "Close",
                    title: "Close (Esc)", id: "cb-fullscreen-close" },
        el("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }),
      ),
    );
    const body = el("div", { class: "cb-fullscreen-body" });
    fsOverlay.append(head, body);
    document.body.append(fsOverlay);
    fsOverlay.querySelector("#cb-fullscreen-close").addEventListener("click", closeFullscreen);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && fsOverlay?.dataset.open === "true") closeFullscreen();
    });
  }
  const body = fsOverlay.querySelector(".cb-fullscreen-body");
  body.replaceChildren();
  const r = document.createElement("streaming-ui-script");
  r.setAttribute("transparent", "true");
  r.setAttribute("theme", theme || settings.theme);
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

function downloadHtml(source, theme, modeLabel) {
  const stripped = stripFences(source);
  const html = buildStandaloneHtml(stripped, theme, modeLabel);
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

function buildStandaloneHtml(source, theme, modeLabel) {
  // The inline boot script JSON-encodes the source, so we just need to make
  // sure the resulting string can't accidentally close its own <script> tag.
  const json = JSON.stringify(source).replace(/<\/(script)/gi, "<\\/$1");
  const parts = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>Generated UI · ${escapeHtml(modeLabel)}</title>`,
    '  <meta name="generator" content="streaming-ui-script chat bot" />',
    `  <script type="module" src="${CDN_BUNDLE}"></script>`,
    "  <style>",
    "    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }",
    "    streaming-ui-script { display: block; min-height: 100vh; }",
    "  </style>",
    "</head>",
    "<body>",
    `  <streaming-ui-script theme="${escapeAttr(theme)}"></streaming-ui-script>`,
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

function exportChat() {
  if (conversation.length === 0) {
    showToast("Nothing to export yet", "circle-info");
    return;
  }
  const payload = {
    mode: currentMode,
    model: settings.model,
    theme: settings.theme,
    exportedAt: new Date().toISOString(),
    messages: conversation,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-${Date.now()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Chat exported", "file-export");
}

/* ===========================================================================
   13. Drawer
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

function renderHistoryReadout(n) {
  els.drawerHistoryReadout.textContent = `${n} turn${n === 1 ? "" : "s"}`;
}

function togglePasswordVisibility(input, button) {
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  const i = button.querySelector("i");
  if (i) i.className = `fa-solid fa-${reveal ? "eye-slash" : "eye"}`;
}

/* ===========================================================================
   14. Toast + helpers
   =========================================================================== */

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

/**
 * Tiny DOM helper. Skips null/undefined children and treats strings as text.
 */
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
   15. Go
   =========================================================================== */

boot();
