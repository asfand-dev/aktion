/**
 * Aktion docs runtime.
 *
 * Single entry point for every docs page. Handles:
 *   - Top navigation bar (logo, primary tabs, search, theme toggle, GitHub).
 *   - Grouped sidebar navigation (rebuilt from a single source of truth).
 *   - Right-side "On this page" TOC with scroll-spy.
 *   - Light / dark theme persistence (separate from the renderer theme).
 *   - Copy buttons on every <pre><code> block.
 *   - Command-K search palette (jump to any docs page).
 *   - Mobile sidebar drawer + backdrop.
 *   - Existing helpers: live examples, theme picker, playground, wide tables.
 */

const LIB_PATH = new URL("../../dist/aktion.js", import.meta.url).href;

let importPromise = null;
function importLibrary() {
  if (!importPromise) importPromise = import(/* @vite-ignore */ LIB_PATH);
  return importPromise;
}

/* ---------------------------------------------------------------------------
   Source of truth: site navigation
   --------------------------------------------------------------------------- */

const NAV_GROUPS = [
  {
    label: "Getting Started",
    items: [
      { href: "index.html", label: "Introduction" },
      { href: "get-started.html", label: "Installation" },
      { href: "frameworks.html", label: "Frameworks" },
    ],
  },
  {
    label: "Core Concepts",
    items: [
      { href: "language.html", label: "Language" },
      { href: "components.html", label: "Components" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { href: "actions.html", label: "Actions" },
      { href: "javascript-interactions.html", label: "JavaScript" },
      { href: "side-effects.html", label: "Side effects" },
      { href: "routing.html", label: "Routing" },
    ],
  },
  {
    label: "Theming",
    items: [
      { href: "themes.html", label: "Themes & customization" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "examples.html", label: "Examples" },
      { href: "live-examples.html", label: "Live demos" },
      { href: "playground.html", label: "Playground" },
      { href: "chat-bot.html", label: "Chat bot", badge: "AI" },
    ],
  },
];

const PRIMARY_TABS = [
  { href: "index.html",       label: "Docs",       matches: ["index.html", "get-started.html", "frameworks.html", "language.html", "actions.html", "javascript-interactions.html", "routing.html"] },
  { href: "components.html",  label: "Components", matches: ["components.html"] },
  { href: "themes.html",      label: "Themes",     matches: ["themes.html"] },
  { href: "live-examples.html", label: "Demos",    matches: ["live-examples.html", "examples.html"] },
  { href: "playground.html",  label: "Playground", matches: ["playground.html"] },
  { href: "chat-bot.html",    label: "Chat bot",   matches: ["chat-bot.html"] },
];

const REPO_URL = "https://github.com/asfand-dev/aktion";

const PAGE_TITLES = NAV_GROUPS.flatMap((g) => g.items).reduce((acc, item) => {
  acc[item.href] = item.label;
  return acc;
}, {});

const PAGE_KEYWORDS = {
  "index.html": "overview introduction",
  "get-started.html": "install cdn quickstart setup",
  "frameworks.html": "react vue angular svelte nextjs html",
  "language.html": "syntax expressions state queries mutations builtins",
  "components.html": "props library catalog signatures",
  "actions.html": "action assignment http emit assistant-message navigate _route_ js button click",
  "javascript-interactions.html": "script @js useeffect hooks",
  "routing.html": "routes navlink navigate hash router",
  "themes.html": "built-in themes light dark neon pastel glass brutalist skyline tokens custom studio in-script Theme",
  "examples.html": "recipes copy paste snippets",
  "live-examples.html": "demos catalog showcase",
  "playground.html": "editor preview live",
  "chat-bot.html": "chat bot llm openrouter generate website builder app builder files images upload",
};

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

function currentPage() {
  const parts = location.pathname.split("/");
  const last = parts[parts.length - 1] || "index.html";
  return last || "index.html";
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

// Build a real SVG element with the proper namespace. `paths` is raw SVG
// markup (line / path / circle / polyline / rect) and gets parsed in the
// SVG namespace because we set innerHTML on a real svg node.
function svg(className, paths, viewBox = "0 0 24 24") {
  const node = document.createElementNS(SVG_NS, "svg");
  if (className) node.setAttribute("class", className);
  node.setAttribute("viewBox", viewBox);
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "1.75");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = paths;
  return node;
}

/* ---------------------------------------------------------------------------
   Theme (docs site light / dark)
   --------------------------------------------------------------------------- */

function getSavedDocTheme() {
  try { return localStorage.getItem("doc-theme"); } catch { return null; }
}

function applyDocTheme(theme) {
  document.documentElement.setAttribute("data-doc-theme", theme);
  setTimeout(() => {
    // Pages that own their renderer theme (playground, chat bot) set
    // `data-theme-managed="true"` on each renderer so we don't clobber the
    // user's chosen theme when they toggle the docs chrome light/dark mode.
    document.querySelectorAll('aktion-app:not([data-theme-managed])').forEach((script) => {
      script.setAttribute("theme", theme);
    });
    document.querySelectorAll(".example-output").forEach((output) => {
      output.style.background = theme === "light" ? "white" : "black";
    });
  }, 500);
  try { localStorage.setItem("doc-theme", theme); } catch { /* ignore */ }
}

function resolveInitialDocTheme() {
  const saved = getSavedDocTheme();
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setupDocThemeToggle(button) {
  button.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-doc-theme") === "dark" ? "light" : "dark";
    applyDocTheme(next);
  });
}

/* ---------------------------------------------------------------------------
   Topbar
   --------------------------------------------------------------------------- */

function buildTopbar() {
  if (document.querySelector(".topbar")) return;

  const here = currentPage();

  const tabs = el("nav", { class: "topbar-tabs", "aria-label": "Primary" });
  for (const tab of PRIMARY_TABS) {
    const isActive = tab.matches.includes(here);
    tabs.appendChild(el("a", { href: tab.href, class: isActive ? "is-active" : "" }, tab.label));
  }

  const search = el(
    "button",
    { class: "topbar-search", type: "button", "aria-label": "Search docs (Cmd+K)" },
    svg("topbar-search-icon", '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>'),
    el("span", {}, "Search docs…"),
    el("span", { class: "kbd" }, isMac() ? "⌘ K" : "Ctrl K"),
  );
  search.addEventListener("click", openSearch);

  const themeBtn = el(
    "button",
    { class: "topbar-icon", type: "button", "aria-label": "Toggle dark mode", title: "Toggle theme" },
    svg("icon-moon", '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>'),
    svg("icon-sun", '<circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"></line><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"></line>'),
  );
  setupDocThemeToggle(themeBtn);

  const ghLink = el(
    "a",
    { class: "topbar-icon", href: REPO_URL, target: "_blank", rel: "noopener", "aria-label": "GitHub repository", title: "GitHub" },
    svg(null, '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>'),
  );

  const menuToggle = el(
    "button",
    { class: "topbar-menu-toggle", type: "button", "aria-label": "Toggle navigation menu", "aria-controls": "site-nav", "aria-expanded": "false" },
    svg(null, '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line>'),
  );

  const brand = el(
    "a",
    { class: "topbar-brand", href: "index.html" },
    el("span", { class: "topbar-brand-mark", "aria-hidden": "true" }, "A"),
    el("span", {}, "Aktion"),
    el("span", { class: "topbar-version" }, "v0.5"),
  );

  const topbar = el(
    "header",
    { class: "topbar", role: "banner" },
    menuToggle,
    brand,
    tabs,
    el("div", { class: "topbar-spacer" }),
    search,
    themeBtn,
    ghLink,
  );

  document.body.insertBefore(topbar, document.body.firstChild);

  menuToggle.addEventListener("click", () => toggleSidebar());
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/* ---------------------------------------------------------------------------
   Sidebar: replace whatever the page hard-codes with the grouped nav.
   --------------------------------------------------------------------------- */

function renderSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  sidebar.id = sidebar.id || "site-nav";
  sidebar.setAttribute("aria-label", "Documentation");

  const here = currentPage();
  sidebar.replaceChildren();

  for (const group of NAV_GROUPS) {
    const groupEl = el("div", { class: "sidebar-group" });
    groupEl.appendChild(el("p", { class: "sidebar-group-label" }, group.label));
    const nav = el("nav");
    for (const item of group.items) {
      const isActive = item.href === here;
      const a = el(
        "a",
        { href: item.href, class: isActive ? "is-active" : "" },
        document.createTextNode(item.label),
      );
      if (item.badge) {
        a.appendChild(el("span", { class: "nav-badge" }, item.badge));
      }
      nav.appendChild(a);
    }
    groupEl.appendChild(nav);
    sidebar.appendChild(groupEl);
  }

  // Mobile drawer backdrop
  if (!document.querySelector(".sidebar-backdrop")) {
    const backdrop = el("div", { class: "sidebar-backdrop" });
    backdrop.addEventListener("click", () => toggleSidebar(false));
    document.body.appendChild(backdrop);
  }

  sidebar.querySelectorAll("nav a").forEach((a) =>
    a.addEventListener("click", () => toggleSidebar(false)),
  );
}

function toggleSidebar(force) {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");
  const toggle = document.querySelector(".topbar-menu-toggle");
  if (!sidebar) return;
  const nextOpen = typeof force === "boolean" ? force : !sidebar.classList.contains("is-open");
  sidebar.classList.toggle("is-open", nextOpen);
  if (backdrop) backdrop.classList.toggle("is-open", nextOpen);
  if (toggle) toggle.setAttribute("aria-expanded", String(nextOpen));
}

/* ---------------------------------------------------------------------------
   Right-side "On this page" TOC
   --------------------------------------------------------------------------- */

function ensureHeadingId(node) {
  if (!node.id) node.id = slugify(node.textContent || "");
  return node.id;
}

let tocObserver = null;

function buildToc() {
  const main = document.querySelector("main");
  if (!main) return;
  const layout = document.querySelector(".layout");
  if (!layout || layout.getAttribute("data-wide") === "true") return;

  const headings = [...main.querySelectorAll("h2, h3")];

  if (headings.length < 3) {
    // Some pages hydrate headings dynamically (e.g. components.html appends
    // group h2s once the library loads). Watch main for new headings once,
    // then rebuild.
    if (!tocObserver) {
      tocObserver = new MutationObserver(() => {
        const count = main.querySelectorAll("h2, h3").length;
        if (count >= 3) {
          tocObserver.disconnect();
          tocObserver = null;
          buildToc();
        }
      });
      tocObserver.observe(main, { childList: true, subtree: true });
      // Stop watching after a sensible delay so we don't leak observers.
      setTimeout(() => {
        if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
      }, 8000);
    }
    return;
  }

  // We're going to build the TOC; remove any prior one so we don't duplicate.
  const existing = layout.querySelector(":scope > .toc");
  if (existing) existing.remove();
  layout.removeAttribute("data-toc");

  const aside = el("aside", { class: "toc", "aria-label": "On this page" });
  aside.appendChild(el("p", { class: "toc-title" }, "On this page"));
  const nav = el("nav");
  for (const h of headings) {
    const id = ensureHeadingId(h);
    const link = el("a", {
      href: "#" + id,
      class: h.tagName === "H3" ? "is-h3" : "",
    }, h.textContent || "");
    nav.appendChild(link);

    // Add a hover-visible anchor # next to the heading itself.
    if (!h.querySelector(".heading-anchor")) {
      const anchor = el("a", { href: "#" + id, class: "heading-anchor", "aria-label": "Link to section" }, "#");
      h.appendChild(anchor);
    }
  }
  aside.appendChild(nav);

  layout.appendChild(aside);
  layout.setAttribute("data-toc", "on");

  // Scroll spy with IntersectionObserver — only the topmost heading is active.
  const links = new Map();
  aside.querySelectorAll("nav a").forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    links.set(id, a);
  });

  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.id;
        if (entry.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      const firstVisible = headings.find((h) => visible.has(h.id));
      links.forEach((a) => a.classList.remove("is-active"));
      const active = firstVisible ? links.get(firstVisible.id) : null;
      if (active) active.classList.add("is-active");
    },
    { rootMargin: `-${parseInt(getComputedStyle(document.documentElement).getPropertyValue("--doc-topbar-h")) + 16}px 0px -65% 0px`, threshold: [0, 1] },
  );
  headings.forEach((h) => observer.observe(h));
}

/* ---------------------------------------------------------------------------
   Breadcrumb (lightweight; only added if the page doesn't already have one)
   --------------------------------------------------------------------------- */

function renderBreadcrumb() {
  const main = document.querySelector("main");
  if (!main) return;
  if (main.querySelector(".docs-breadcrumb")) return;

  const here = currentPage();
  const title = PAGE_TITLES[here];
  if (!title || here === "index.html") return;

  // Find which group the page belongs to.
  let groupLabel = null;
  for (const group of NAV_GROUPS) {
    if (group.items.some((i) => i.href === here)) {
      groupLabel = group.label;
      break;
    }
  }

  const crumbs = el(
    "nav",
    { class: "docs-breadcrumb", "aria-label": "Breadcrumb" },
    el("a", { href: "index.html" }, "Docs"),
  );
  if (groupLabel) {
    crumbs.appendChild(el("span", { class: "docs-breadcrumb-sep" }, "/"));
    crumbs.appendChild(el("span", {}, groupLabel));
  }
  crumbs.appendChild(el("span", { class: "docs-breadcrumb-sep" }, "/"));
  crumbs.appendChild(el("span", { "aria-current": "page" }, title));

  // Insert before the first direct child that contains (or is) the page title.
  // If the page uses a <header class="hero"> wrapper, the h1 lives inside it.
  const heroHeader = main.querySelector(":scope > header.hero");
  const directH1 = main.querySelector(":scope > h1");
  const anchor = heroHeader || directH1 || main.firstChild;
  if (anchor) main.insertBefore(crumbs, anchor);
  else main.appendChild(crumbs);
}

/* ---------------------------------------------------------------------------
   Copy buttons on every <pre><code>
   --------------------------------------------------------------------------- */

function setupCopyButtons() {
  const COPY_SVG = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
  const CHECK_SVG = '<polyline points="20 6 9 17 4 12"></polyline>';

  // We wrap the `pre` in a non-scrolling `.code-block-wrap` and hang the
  // button on that wrapper. Positioning the button on the wrapper (which
  // doesn't scroll horizontally) keeps it pinned to the right edge as
  // the code inside the `pre` is scrolled.
  document.querySelectorAll("main pre").forEach((pre) => {
    if (pre.parentElement && pre.parentElement.classList.contains("code-block-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "code-block-wrap";
    pre.parentElement.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = el(
      "button",
      { class: "code-copy", type: "button", "aria-label": "Copy to clipboard", title: "Copy" },
      svg(null, COPY_SVG),
      el("span", {}, "Copy"),
    );
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = (code ? code.textContent : pre.textContent) || "";
      try {
        await navigator.clipboard.writeText(text);
        btn.setAttribute("data-state", "copied");
        btn.querySelector("svg").innerHTML = CHECK_SVG;
        btn.querySelector("span").textContent = "Copied";
        setTimeout(() => {
          btn.removeAttribute("data-state");
          btn.querySelector("svg").innerHTML = COPY_SVG;
          btn.querySelector("span").textContent = "Copy";
        }, 1600);
      } catch {
        btn.querySelector("span").textContent = "Failed";
      }
    });
    wrap.appendChild(btn);
  });
}

/* ---------------------------------------------------------------------------
   Live examples & theme picker (existing behaviour)
   --------------------------------------------------------------------------- */

const THEME_BG = {
  light: "#ffffff",
  dark: "#0b1220",
  neon: "#05060f",
  pastel: "#fdf6ff",
  glass: "linear-gradient(135deg, #0b132b 0%, #1a2454 60%, #1f3a8a 100%)",
  brutalist: "#fef9c3",
  skyline: "linear-gradient(180deg, #eff2f7 0%, #e6ecf3 100%)",
};

function paintExampleOutputs(themeName) {
  const bg = THEME_BG[themeName] ?? THEME_BG.light;
  document.querySelectorAll(".example-output").forEach((node) => {
    node.style.background = bg;
  });
}

function setupThemePicker() {
  const select = document.getElementById("theme-picker");
  if (!select) return;
  const apply = () => {
    const value = select.value;
    document.querySelectorAll("aktion-app").forEach((el) => {
      el.setAttribute("theme", value);
    });
    paintExampleOutputs(value);
  };
  select.addEventListener("change", apply);
  apply();
}

function setupExamples() {
  document.querySelectorAll(".example").forEach((example) => {
    const lang = example.querySelector(".example-source");
    const tabs = example.querySelectorAll(".example-tab");
    const panels = example.querySelectorAll(".example-panel");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-target");
        tabs.forEach((t) => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
        panels.forEach((p) => p.setAttribute("data-active", p.getAttribute("data-key") === target ? "true" : "false"));
      });
    });
    const target = example.querySelector("aktion-app");
    if (target && lang) {
      const text = lang.textContent.trim();
      target.setAttribute("data-source", "");
      if (!target.hasAttribute("transparent")) target.setAttribute("transparent", "");
      importLibrary().then(() => {
        target.setResponse(text);
      });
    }
  });
}

function setupPlayground() {
  const input = document.getElementById("playground-input");
  const themeSelect = document.getElementById("playground-theme");
  const target = document.getElementById("playground-target");
  if (!input || !target) return;

  const applyPlaygroundTheme = (value) => {
    target.setAttribute("theme", value);
    const pane = target.closest(".playground-pane");
    if (pane) pane.style.background = THEME_BG[value] ?? THEME_BG.light;
  };

  importLibrary().then(() => {
    const update = () => target.setResponse(input.value);
    update();
    input.addEventListener("input", update);
    if (themeSelect) {
      applyPlaygroundTheme(themeSelect.value);
      themeSelect.addEventListener("change", () => applyPlaygroundTheme(themeSelect.value));
    }
  });
}

/* ---------------------------------------------------------------------------
   Wrap wide tables for horizontal scroll
   --------------------------------------------------------------------------- */

function wrapWideTables() {
  document.querySelectorAll("main table.signature-table").forEach((table) => {
    if (table.parentElement?.classList.contains("table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
}

/* ---------------------------------------------------------------------------
   Command-K search palette
   --------------------------------------------------------------------------- */

let searchOverlay = null;
let searchInput = null;
let searchResults = null;
let searchItems = [];
let focusedIndex = 0;

function buildSearchIndex() {
  const items = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      items.push({
        href: item.href,
        title: item.label,
        group: group.label,
        keywords: (PAGE_KEYWORDS[item.href] || "") + " " + group.label.toLowerCase(),
      });
    }
  }
  return items;
}

function buildSearchPalette() {
  if (searchOverlay) return;

  searchInput = el("input", {
    type: "text",
    placeholder: "Search documentation…",
    "aria-label": "Search documentation",
    autocomplete: "off",
    spellcheck: "false",
  });
  searchResults = el("div", { class: "search-results" });

  const dialog = el(
    "div",
    { class: "search-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Search docs" },
    el(
      "div",
      { class: "search-input-row" },
      svg(null, '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>'),
      searchInput,
      el("span", { class: "kbd" }, "Esc"),
    ),
    searchResults,
    el(
      "div",
      { class: "search-footer" },
      el("span", {}, el("span", { class: "kbd" }, "↑↓"), " navigate"),
      el("span", {}, el("span", { class: "kbd" }, "↵"), " open"),
      el("span", {}, el("span", { class: "kbd" }, "Esc"), " close"),
    ),
  );

  searchOverlay = el("div", { class: "search-overlay" }, dialog);
  searchOverlay.addEventListener("click", (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activateFocused();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  });

  document.body.appendChild(searchOverlay);
}

function renderSearchResults(query) {
  if (!searchResults) return;
  const q = String(query || "").trim().toLowerCase();
  const all = buildSearchIndex();
  const matches = q
    ? all.filter((item) =>
        (item.title + " " + item.group + " " + item.keywords).toLowerCase().includes(q),
      )
    : all;

  searchResults.replaceChildren();
  searchItems = [];

  if (matches.length === 0) {
    searchResults.appendChild(el("div", { class: "search-empty" }, "No matches. Try a different keyword."));
    return;
  }

  let currentGroup = null;
  for (const item of matches) {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      searchResults.appendChild(el("div", { class: "search-group" }, currentGroup));
    }
    const link = el(
      "a",
      { href: item.href },
      el("span", {}, item.title),
      el("span", { class: "desc" }, item.href),
    );
    link.addEventListener("mouseenter", () => focusItem(searchItems.indexOf(link)));
    link.addEventListener("click", () => closeSearch());
    searchResults.appendChild(link);
    searchItems.push(link);
  }

  focusedIndex = 0;
  focusItem(0);
}

function focusItem(index) {
  if (searchItems.length === 0) return;
  focusedIndex = Math.max(0, Math.min(searchItems.length - 1, index));
  searchItems.forEach((item, i) => item.classList.toggle("is-focused", i === focusedIndex));
  searchItems[focusedIndex]?.scrollIntoView({ block: "nearest" });
}

function moveFocus(delta) {
  if (searchItems.length === 0) return;
  let next = focusedIndex + delta;
  if (next < 0) next = searchItems.length - 1;
  if (next >= searchItems.length) next = 0;
  focusItem(next);
}

function activateFocused() {
  if (searchItems[focusedIndex]) {
    searchItems[focusedIndex].click();
    location.href = searchItems[focusedIndex].href;
  }
}

function openSearch() {
  buildSearchPalette();
  searchOverlay.classList.add("is-open");
  renderSearchResults("");
  searchInput.value = "";
  setTimeout(() => searchInput.focus(), 10);
}

function closeSearch() {
  if (searchOverlay) searchOverlay.classList.remove("is-open");
}

function setupSearchShortcut() {
  document.addEventListener("keydown", (e) => {
    const isPalette = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
    if (isPalette) {
      e.preventDefault();
      const open = searchOverlay && searchOverlay.classList.contains("is-open");
      if (open) closeSearch();
      else openSearch();
    } else if (e.key === "Escape" && searchOverlay?.classList.contains("is-open")) {
      closeSearch();
    }
  });
}

/* ---------------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------------- */

// Run a setup step in isolation so one failure can't kill the rest of the
// init pipeline (e.g. a missing DOM node on an edge-case page should not
// prevent the topbar from rendering).
function safely(name, fn) {
  try { fn(); }
  catch (err) { console.warn(`[docs] ${name} failed:`, err); }
}

function init() {
  applyDocTheme(resolveInitialDocTheme());

  if (!window.location.pathname.includes("chat-bot.html")) {
    safely("topbar", buildTopbar);
    safely("sidebar", renderSidebar);
    safely("breadcrumb", renderBreadcrumb);
  }

  safely("wide-tables", wrapWideTables);
  safely("toc", buildToc);
  safely("copy-buttons", setupCopyButtons);
  safely("theme-picker", setupThemePicker);
  safely("examples", setupExamples);
  safely("playground", setupPlayground);
  safely("search-shortcut", setupSearchShortcut);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) toggleSidebar(false);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
