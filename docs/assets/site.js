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
const LOGO_URL = new URL("logo.png", import.meta.url).href;

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
      { href: "get-started.html", label: "Installation" },
      { href: "frameworks.html", label: "Frameworks" },
      { href: "migration-guide.html", label: "Migration to Aktion" },
    ],
  },
  {
    label: "Core Concepts",
    items: [
      { href: "language.html", label: "Language" },
      { href: "language-reference.html", label: "Language reference" },
      { href: "modules.html", label: "Modules" },
      { href: "layout.html", label: "Layout" },
      { href: "sx.html", label: "Styling (sx)" },
      { href: "components.html", label: "Components" },
      { href: "hooks.html", label: "Hooks" },
      { href: "stores.html", label: "Global state" },
      { href: "forms.html", label: "Forms" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { href: "actions.html", label: "Actions" },
      { href: "http.html", label: "HTTP" },
      { href: "javascript-interactions.html", label: "JavaScript" },
      { href: "side-effects.html", label: "Side effects" },
      { href: "interop.html", label: "Third-party widgets" },
      { href: "ui-providers.html", label: "UI Providers" },
      { href: "custom-components.html", label: "Custom components" },
      { href: "head.html", label: "Document head" },
      { href: "routing.html", label: "Routing" },
      { href: "testing.html", label: "Testing" },
      { href: "devtools.html", label: "DevTools" },
    ],
  },
  {
    label: "Guides",
    items: [
      { href: "reactivity.html", label: "Reactivity & rendering" },
      { href: "performance.html", label: "Performance" },
      { href: "troubleshooting.html", label: "Troubleshooting / FAQ" },
      { href: "errors.html", label: "Error handling" },
      { href: "typescript.html", label: "TypeScript" },
      { href: "accessibility.html", label: "Accessibility" },
      { href: "security.html", label: "Security" },
      { href: "deployment.html", label: "Production & deployment" },
      { href: "llm-integration.html", label: "LLM integration" },
    ],
  },
  {
    label: "Theming",
    items: [
      { href: "themes.html", label: "Themes & customization" },
      { href: "theme-generator.html", label: "Theme generator" },
      { href: "brand-themes.html", label: "Brand themes" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "live-demos.html", label: "Live demos" },
      { href: "playground.html", label: "Playground" },
      { href: "visual-editor.html", label: "Visual editor" },
      { href: "chat-bot.html", label: "Chat bot", badge: "AI" },
    ],
  },
];

const PRIMARY_TABS = [
  { href: "index.html",      label: "Docs",       matches: ["index.html", "get-started.html", "frameworks.html", "migration-guide.html", "language.html", "language-reference.html", "modules.html", "layout.html", "sx.html", "hooks.html", "stores.html", "forms.html", "actions.html", "http.html", "javascript-interactions.html", "side-effects.html", "interop.html", "ui-providers.html", "custom-components.html", "head.html", "routing.html", "testing.html", "devtools.html", "reactivity.html", "performance.html", "troubleshooting.html", "errors.html", "typescript.html", "accessibility.html", "security.html", "deployment.html", "llm-integration.html"] },
  { href: "components.html", label: "Components", matches: ["components.html"] },
  { href: "themes.html",     label: "Themes",     matches: ["themes.html", "theme-generator.html", "brand-themes.html"] },
  { href: "live-demos.html", label: "Demos",      matches: ["live-demos.html"] },
  { href: "playground.html", label: "Playground", matches: ["playground.html"] },
  { href: "chat-bot.html",   label: "Chat bot",   matches: ["chat-bot.html"] },
];

const REPO_URL = "https://github.com/asfand-dev/aktion";

const PAGE_TITLES = NAV_GROUPS.flatMap((g) => g.items).reduce((acc, item) => {
  acc[item.href] = item.label;
  return acc;
}, {});

const PAGE_KEYWORDS = {
  'accessibility.html': 'accessibility a11y wcag aria keyboard screen reader focus trap modal toast role status alert navlink aria-current contrast theme',
  'actions.html': 'action assignment http emit assistant-message navigate route js button click',
  'brand-themes.html': 'brand themes token maps partial theme tokens settheme setresponse css variables rui prefix palette gallery side-by-side comparison brand palette',
  'chat-bot.html': 'chat bot llm openrouter generate website builder app builder files images upload',
  'components.html': 'props library catalog signatures',
  'custom-components.html': 'custom components componentspec register registercomponents props propspec render renderhelpers el helper asstring asarray asboolean asnumber useinstancestate registerdisposer invoke bindstate slots children callable positional aliases override extend library',
  'deployment.html': 'production deployment ssr hydration serializestate hydratestate csp unsafe-eval integrity subresource cdn caching edge function streaming telemetry error reporting',
  'devtools.html': 'devtools dev tools inspector debugger state inspector render profiler effect timeline flamegraph commit memoization mount update memoized hook __aktion_devtools_hook__ react devtools vue devtools profiling performance edit state live debug panel',
  'errors.html': 'error handling debugging parse error runtime error render loop guard safety budget error event strict mode dev mode console warning telemetry',
  'forms.html': 'forms $form form state validation validate rules required email min max pattern errors touched dirty submit submitting reset field binding two-way input select checkbox radio switch fieldset formsection validationsummary multistepform wizard react hook form formik vee-validate',
  'frameworks.html': 'react vue angular svelte nextjs html',
  'get-started.html': 'install cdn quickstart setup',
  'head.html': 'head document head $head title meta description canonical open graph og twitter card jsonld json-ld structured data schema.org seo social preview link rel htmlattrs lang dir robots noindex titletemplate ssr crawlable rendertostring sitemap marketing pdp',
  'hooks.html': 'hooks $state $memo usestate usememo custom hook useeffect local state reactive per-instance setvalue setter memoize derived react',
  'http.html': 'http fetch request response query headers body refetch cancel async resource crud rest api network',
  'index.html': 'overview introduction',
  'interop.html': 'mount webcomponent web component custom element $script $dom interop third-party imperative widget chart map editor monaco stripe mapbox leaflet chartjs echarts d3 tiptap prosemirror video captcha resizeobserver intersectionobserver mutationobserver measure onresize onintersect onmutation data-rui-preserve external script loader sdk lifecycle setup update cleanup',
  'javascript-interactions.html': 'script @js useeffect hooks',
  'language-reference.html': 'language reference keywords builtins hooks globals operators $util namespace $state $effect $http $memo $store $router $theme $emit util storage console toast i18n reserved handles route aktion literals atoms ternary spread optional chaining nullish template literals fetch math json date intl crypto navigator settimeout setinterval cheatsheet api tailwindtosx csstosx styledtosx tailwind css styled-components emotion sx migration arbitrary values unmapped style convert',
  'language.html': 'syntax expressions state queries mutations builtins',
  'layout.html': 'layout column row center stack grid griditem box container spacer flex responsive sidebar dashboard holy grail gap align justify span',
  'live-demos.html': 'demos catalog showcase mini-apps blocks components',
  'llm-integration.html': 'llm integration openai anthropic openrouter bedrock streaming appendchunk system prompt getsystemprompt chat mode interceptors assistant-message delta protocol',
  'migration-guide.html': 'migrate react vue angular svelte solid preact nextjs jsx tsx hooks composition api signals stores props state',
  'modules.html': 'modules import export multi-file multifile code-splitting code splitting link linker file project component reuse private scope shared state url remote dependency app.aktion entry playground zip',
  'performance.html': 'performance optimization re-render memoization safety budget bundle size streaming throughput setresponse appendchunk virtuallist lists',
  'playground.html': 'editor preview live',
  'reactivity.html': 'reactivity rendering path tracking fine-grained full re-render render gate notify memoization atom store declare assign render guard',
  'routing.html': 'routes navlink navigate hash router',
  'security.html': 'security trust model threat model setglobalaccesspolicy getglobalaccesspolicy global access policy safe all allow-list sandbox untrusted program prompt injection eval function sanitiser sanitizer sanitisehref sanitiseimagesrc sanitisesvgmarkup sanitisecsslength xss shadow dom boundary iframe csp unsafe-eval interceptors ssr rendertostring prototype pollution csv formula injection noopener noreferrer cookies samesite reporting vulnerability',
  'side-effects.html': 'side effects $effect dependency array mount unmount every debounce throttle cleanup interval timer polling subscription watcher useeffect lifecycle teardown scheduling',
  'stores.html': 'store global state management redux zustand pinia jotai recoil mobx shared state actions getters singleton prop drilling slice selector context cart user theme',
  'sx.html': 'sx style styling prop universal padding margin gap spacing sizing width height color background bg gradient border radius shadow opacity flex grid display direction align justify wrap grow shrink basis columns position sticky absolute fixed zindex top right bottom left inset font fontsize weight textalign textdecoration typography overflow cursor backdrop blur bgimage bgoverlay hover focus active disabled checked group-hover states animate fade zoom slide pulse responsive breakpoint base sm md lg xl tokens theme-safe className class aria data tooltip hidden logical rtl safe-area inset dvh',
  'testing.html': 'testing test render screen getbytext getbyrole fireevent userevent click type vitest jest assertion mock fetch http snapshot serializestate findby waitfor unit integration tdd react testing library rtl spy state events emit',
  'theme-generator.html': 'theme generator builder studio create custom theme colors palette radius typography fonts spacing shadows gradient brand $theme tokens live preview copy generate design system',
  'themes.html': 'built-in themes light dark corporate soft glass modern tokens custom studio in-script Theme',
  'troubleshooting.html': 'troubleshooting faq focus loss portal effect not firing memoized away map constructor dropped style missing i18n key silent failure write during render',
  'typescript.html': 'typescript types public api componentspec helpers interceptors host event payloads subpath entry test devtools language vite aktionelement typed wrapper',
  'ui-providers.html': 'ui provider adapter mui bootstrap shadcn interoperability design system component library integration plugin',
  'visual-editor.html': 'drag drop visual editor canvas inspector palette no-code wysiwyg',
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
    el("img", { class: "topbar-brand-mark", src: LOGO_URL, alt: "", "aria-hidden": "true", width: "28", height: "28" }),
    el("span", {}, "Aktion"),
    el("span", { class: "topbar-version" }, "v0.6.3"),
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

/**
 * Slugify `name`, then suffix `-2`, `-3`, … until the result is not already in
 * `taken`. Registers the winner in `taken` and returns it.
 *
 * Needed because distinct names can slugify identically — the component library
 * ships both `Navbar` (navigation) and `NavBar` (marketing), and a shared `id`
 * is invalid HTML that silently sends every anchor to whichever came first.
 */
function uniqueSlug(name, taken) {
  const base = slugify(name) || "section";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function ensureHeadingId(node) {
  if (!node.id) {
    const taken = new Set(
      [...document.querySelectorAll("[id]")].map((el) => el.id).filter(Boolean),
    );
    node.id = uniqueSlug(node.textContent || "", taken);
  }
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
  corporate: "linear-gradient(180deg, #f0f5f4 0%, #eaeef0 100%)",
  soft: "#fdf6ff",
  glass: "linear-gradient(160deg, #eef0f3 0%, #e9e6ef 45%, #efe4ec 100%)",
  modern: "#f4f5f7",
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

/* ---------------------------------------------------------------------------
   Deep search index: per-page section headings + the dynamic component and
   language-reference catalogs. Built lazily (and cached) the first time the
   palette opens so typing a component name, a `$`-builtin, a keyword, or any
   inner heading jumps straight to that section on the right page.
   --------------------------------------------------------------------------- */

let deepIndex = null;
let deepIndexPromise = null;
// Pages whose sections are generated client-side at runtime — their headings
// aren't in the static HTML, so they're indexed from the runtime catalogs
// (components from the library, builtins/keywords from the language surface).
const RUNTIME_RENDERED_PAGES = new Set(["components.html", "language-reference.html"]);

function ensureDeepIndex() {
  if (deepIndex) return Promise.resolve(deepIndex);
  if (!deepIndexPromise) deepIndexPromise = buildDeepIndex();
  return deepIndexPromise;
}

async function buildDeepIndex() {
  const entries = [];

  // 1. Inner headings of every static doc page.
  const pages = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ href: item.href, title: item.label })),
  );
  await Promise.all(
    pages.map(async (page) => {
      if (RUNTIME_RENDERED_PAGES.has(page.href)) return;
      try {
        const res = await fetch(page.href);
        if (!res.ok) return;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const main = doc.querySelector("main");
        if (!main) return;
        const seen = new Set();
        for (const heading of main.querySelectorAll("h2, h3")) {
          const text = (heading.textContent || "").replace(/#+\s*$/, "").trim();
          if (!text || text.length > 90) continue;
          const id = heading.id || slugify(text);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          entries.push({
            href: `${page.href}#${id}`,
            title: text,
            group: page.title,
            keywords: `${page.title} ${text}`.toLowerCase(),
            section: true,
          });
        }
      } catch {
        /* a page that fails to load just contributes no sections */
      }
    }),
  );

  // 2. Runtime catalogs for the dynamically-rendered pages.
  try {
    const mod = await importLibrary();
    // Mirror the id components.html ends up with: cards render in library order
    // and collide-then-suffix the same way, so walking the array in order with
    // the same helper reproduces those ids exactly (`Navbar` → `#navbar`,
    // `NavBar` → `#navbar-2`). `Link` is registered twice, so the duplicate is
    // skipped rather than given a phantom `#link-2` that no card carries.
    // The gallery's own catalogue carries the plain-English summary and the
    // search synonyms ("alert" → Callout, "typeahead" → Combobox). Fold them in
    // so the palette finds a component by what it DOES, not just by its name.
    // Optional: if the module is missing the index still works off the specs.
    let cat = null;
    try {
      cat = await import(/* @vite-ignore */ new URL("./component-catalog.js", import.meta.url).href);
    } catch { /* fall back to the authored descriptions */ }

    const componentIds = new Set();
    const seenNames = new Set();
    for (const component of mod?.defaultLibrary?.components ?? []) {
      if (seenNames.has(component.name)) continue;
      seenNames.add(component.name);
      const summary = cat?.SUMMARIES?.[component.name] || component.description || "";
      const tags = cat?.TAGS?.[component.name] ?? [];
      entries.push({
        href: `components.html#${uniqueSlug(component.name, componentIds)}`,
        title: component.name,
        group: "Components",
        keywords: `component ${component.name} ${summary} ${tags.join(" ")}`.toLowerCase(),
        section: true,
      });
    }
    if (Array.isArray(mod?.builtinCatalog)) {
      for (const builtin of mod.builtinCatalog) {
        entries.push({
          href: `language-reference.html#builtin-${builtin.name}`,
          title: builtin.sigil,
          group: "Language reference",
          keywords: `${builtin.sigil} ${builtin.category} ${builtin.summary || ""}`.toLowerCase(),
          section: true,
        });
      }
    }
    for (const keyword of Object.keys(mod?.keywordDocs ?? {})) {
      if (keyword.startsWith("$")) continue; // $-forms live in builtinCatalog
      entries.push({
        href: `language-reference.html#keyword-${keyword}`,
        title: keyword,
        group: "Language reference",
        keywords: `keyword ${keyword} ${mod.keywordDocs[keyword].summary || ""}`.toLowerCase(),
        section: true,
      });
    }
  } catch {
    /* runtime bundle unavailable — page-level results still work */
  }

  deepIndex = entries;
  return entries;
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

const SEARCH_RESULT_LIMIT = 60;

function renderSearchResults(query) {
  if (!searchResults) return;
  const q = String(query || "").trim().toLowerCase();

  // With no query, show just the clean list of pages. Once the user types,
  // search across page sections, components, builtins, and keywords too.
  const pages = buildSearchIndex();
  const all = q ? pages.concat(deepIndex || []) : pages;
  const matches = q
    ? all.filter((item) =>
        (item.title + " " + item.group + " " + item.keywords).toLowerCase().includes(q),
      )
    : all;

  // While the deep index is still loading, kick it off and re-render with the
  // same query once it resolves so section/component matches stream in.
  if (q && !deepIndex) {
    ensureDeepIndex().then(() => {
      const open = searchOverlay && searchOverlay.classList.contains("is-open");
      if (open && searchInput) renderSearchResults(searchInput.value);
    });
  }

  searchResults.replaceChildren();
  searchItems = [];

  if (matches.length === 0) {
    searchResults.appendChild(el("div", { class: "search-empty" }, "No matches. Try a different keyword."));
    return;
  }

  const limited = matches.slice(0, SEARCH_RESULT_LIMIT);
  let currentGroup = null;
  for (const item of limited) {
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

  if (matches.length > limited.length) {
    searchResults.appendChild(
      el("div", { class: "search-empty" }, `Showing ${limited.length} of ${matches.length} matches — keep typing to narrow.`),
    );
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
  // Warm the deep index (sections + component / language catalogs) so the
  // first keystroke can already match inner headings and symbol names.
  ensureDeepIndex();
  renderSearchResults("");
  searchInput.value = "";
  setTimeout(() => searchInput.focus(), 10);
}

function closeSearch() {
  if (searchOverlay) searchOverlay.classList.remove("is-open");
}

/**
 * Scroll to the URL hash even when the target section is rendered
 * asynchronously (the Components and Language-reference pages build their
 * sections client-side, so a `#anchor` from search navigation may not exist
 * at first paint). Falls back to a short-lived MutationObserver.
 */
function setupHashScroll() {
  const raw = location.hash.slice(1);
  if (!raw) return;
  let id;
  try { id = decodeURIComponent(raw); } catch { id = raw; }
  if (!id) return;

  const scrollToTarget = () => {
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView({ block: "start" });
    return true;
  };

  if (scrollToTarget()) return;

  const main = document.querySelector("main") || document.body;
  const observer = new MutationObserver(() => {
    if (scrollToTarget()) observer.disconnect();
  });
  observer.observe(main, { childList: true, subtree: true });
  // Stop watching after a sensible delay so we don't leak the observer.
  setTimeout(() => observer.disconnect(), 8000);
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

function ensureFavicon() {
  if (document.querySelector('link[rel~="icon"]')) return;
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = LOGO_URL;
  document.head.appendChild(link);
}

function init() {
  applyDocTheme(resolveInitialDocTheme());
  safely("favicon", ensureFavicon);

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
  safely("hash-scroll", setupHashScroll);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) toggleSidebar(false);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
