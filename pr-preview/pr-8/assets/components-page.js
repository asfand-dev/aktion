/**
 * components.html — the component gallery.
 *
 * Renders one preview tile per built-in component (name + one-line summary +
 * a live, running sample), filterable by search and category, and opens a
 * detail drawer with the signature, prop table, a full-size preview and the
 * source behind it.
 *
 * Three data sources are merged here:
 *   - `defaultLibrary` from the built bundle — the authoritative signatures,
 *     prop types, enums and authored descriptions. Nothing about a component's
 *     API is duplicated in the docs.
 *   - `component-catalog.js` — the docs-side layer: a plain-English summary,
 *     search tags and the sample program shown in the preview.
 *   - The page's own hash — `#badge` opens Badge's drawer, which is what the
 *     Cmd-K palette in `site.js` links to.
 *
 * Previews hydrate lazily. 281 running programs is a lot of work to do up
 * front, so a tile only calls `setResponse()` once it approaches the viewport,
 * and keeps its renderer afterwards (re-mounting on every scroll flickers).
 */

import { defaultLibrary } from "../dist/aktion.js";
import { SAMPLES, SUMMARIES, TAGS, GROUP_BLURBS, OVERLAY_PREVIEW } from "./component-catalog.js";

/* ===========================================================================
   1. Model
   =========================================================================== */

const grid = document.getElementById("cx-grid");
const chipsHost = document.getElementById("cx-chips");
const searchInput = document.getElementById("cx-search-input");
const searchWrap = document.getElementById("cx-search");
const clearButton = document.getElementById("cx-search-clear");
const metaLine = document.getElementById("cx-meta");
const statsHost = document.getElementById("cx-hero-stats");

/** Same slug rule `site.js` uses to build its Cmd-K deep links. */
function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "component"
  );
}

/**
 * Build the flat catalogue. Ids follow library order with a collide-then-suffix
 * rule (`Navbar` → `#navbar`, `NavBar` → `#navbar-2`) so the anchors the search
 * palette generates land on the right component.
 */
function buildCatalog() {
  const byName = new Map(defaultLibrary.components.map((c) => [c.name, c]));
  const groups = defaultLibrary.componentGroups ?? [
    { name: "Components", components: defaultLibrary.components.map((c) => c.name) },
  ];

  const taken = new Set();
  const idFor = (name) => {
    const base = slugify(name);
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
    taken.add(id);
    return id;
  };

  // Walk the components array (not the groups) so ids match `site.js` exactly.
  const ids = new Map();
  for (const spec of defaultLibrary.components) {
    if (!ids.has(spec.name)) ids.set(spec.name, idFor(spec.name));
  }

  const groupOf = new Map();
  for (const group of groups) {
    for (const name of group.components) groupOf.set(name, group.name);
  }

  const entries = [];
  const seen = new Set();
  const push = (name, groupName) => {
    const spec = byName.get(name);
    if (!spec || seen.has(name)) return;
    seen.add(name);
    const tags = TAGS[name] ?? [];
    const summary = SUMMARIES[name] || spec.description || "";
    entries.push({
      name,
      id: ids.get(name),
      group: groupName,
      spec,
      summary,
      tags,
      sample: SAMPLES[name] ?? null,
      haystack: [
        name.toLowerCase(),
        summary.toLowerCase(),
        tags.join(" "),
        groupName.toLowerCase(),
        spec.props.map((p) => p.name).join(" ").toLowerCase(),
      ].join(" · "),
    });
  };

  for (const group of groups) for (const name of group.components) push(name, group.name);
  // Anything the library registers but no group lists still gets a tile.
  for (const spec of defaultLibrary.components) push(spec.name, groupOf.get(spec.name) ?? "Other");

  return entries;
}

const CATALOG = buildCatalog();
const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
const GROUP_ORDER = [...new Set(CATALOG.map((c) => c.group))];

/* ===========================================================================
   2. Small DOM helpers
   =========================================================================== */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function icon(paths, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

const ICONS = {
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  play: '<path d="M5 3 19 12 5 21z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};

/**
 * The library's authored descriptions are written in Markdown-ish prose and
 * lean heavily on `backticks`. Rendering them as plain text puts the literal
 * backticks on screen, so turn just that one construct into real <code>.
 * Nothing else in those strings is Markdown, so a full parser would be
 * overkill — and would be a way to inject markup from a component spec.
 */
function inlineCode(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text ?? "").split("`");
  parts.forEach((part, i) => {
    if (!part) return;
    frag.append(i % 2 === 1 ? el("code", { text: part }) : document.createTextNode(part));
  });
  return frag;
}

function currentRendererTheme() {
  const attr = document.documentElement.getAttribute("data-doc-theme");
  return attr === "dark" ? "dark" : "light";
}

/* ===========================================================================
   3. Preview hydration
   =========================================================================== */

/**
 * Only mount a tile's renderer when it comes near the viewport. Tiles keep
 * their renderer once hydrated — tearing them down on scroll-out saves memory
 * but makes the grid strobe, which is much worse.
 */
const previewObserver =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            previewObserver.unobserve(entry.target);
            hydratePreview(entry.target);
          }
        },
        { rootMargin: "400px 0px" },
      )
    : null;

function hydratePreview(host) {
  if (host.dataset.hydrated === "true") return;
  host.dataset.hydrated = "true";
  const source = host.dataset.source;
  if (!source) return;

  const inner = el("div", { class: "cx-card-preview-inner" });
  const renderer = document.createElement("aktion-app");
  renderer.setAttribute("theme", currentRendererTheme());
  renderer.setAttribute("transparent", "");
  renderer.setAttribute("margin", "0");
  inner.append(renderer);
  host.replaceChildren(inner);

  try {
    renderer.setResponse(source);
  } catch (err) {
    console.warn(`[components] preview failed for ${host.dataset.name}`, err);
    host.replaceChildren(el("span", { class: "cx-card-preview-empty", text: "Preview unavailable" }));
  }
}

/* ===========================================================================
   4. Grid rendering
   =========================================================================== */

let activeGroup = "All";
let query = "";

/** Rank a component against the query. Higher is better; 0 means "no match". */
function score(entry, needle) {
  const name = entry.name.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if (entry.tags.some((t) => t === needle)) return 55;
  if (entry.tags.some((t) => t.startsWith(needle))) return 45;
  if (entry.summary.toLowerCase().includes(needle)) return 30;
  if (entry.haystack.includes(needle)) return 15;
  return 0;
}

function visibleEntries() {
  const needle = query.trim().toLowerCase();
  let list = CATALOG;
  if (activeGroup !== "All") list = list.filter((c) => c.group === activeGroup);
  if (!needle) return list;
  return list
    .map((entry) => ({ entry, s: score(entry, needle) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.entry.name.localeCompare(b.entry.name))
    .map((r) => r.entry);
}

/** Wrap the matched run of the name in a <mark> so the hit is obvious. */
function highlightedName(name, needle) {
  const at = needle ? name.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return [name];
  return [
    name.slice(0, at),
    el("mark", { text: name.slice(at, at + needle.length) }),
    name.slice(at + needle.length),
  ];
}

/**
 * Cards are built ONCE and then moved between renders rather than rebuilt.
 * Rebuilding on every keystroke would throw away each tile's hydrated renderer
 * and boot a fresh program for it — 281 running programs re-created while the
 * user is still typing. `append` moves an existing node, so filtering costs a
 * reorder and nothing else.
 */
function cardFor(entry) {
  if (entry.el) return entry.el;

  const preview = el("span", {
    class: "cx-card-preview",
    "data-name": entry.name,
    "data-source": entry.sample || false,
  });
  if (entry.sample) {
    if (previewObserver) previewObserver.observe(preview);
    else hydratePreview(preview);
  } else {
    preview.append(el("span", { class: "cx-card-preview-empty", text: "No preview yet" }));
  }

  const title = el(
    "span",
    { class: "cx-card-title" },
    entry.name,
    el("span", { class: "cx-card-group", text: entry.group }),
  );

  entry.titleEl = title;
  entry.el = el(
    "button",
    {
      type: "button",
      class: "cx-card",
      "data-id": entry.id,
      "aria-label": `${entry.name} — ${entry.summary}`,
    },
    preview,
    el(
      "span",
      { class: "cx-card-body" },
      title,
      el("span", { class: "cx-card-summary", text: entry.summary }),
    ),
  );
  return entry.el;
}

/** Re-mark the matched run in a card's name without touching its preview. */
function paintTitle(entry, needle) {
  entry.titleEl.replaceChildren(
    ...highlightedName(entry.name, needle),
    el("span", { class: "cx-card-group", text: entry.group }),
  );
}

/** Group headings are stable too, so they get built once and reused. */
const groupLabels = new Map();
function groupLabel(group, count) {
  let node = groupLabels.get(group);
  if (!node) {
    node = el("h2", { class: "cx-group-label" });
    groupLabels.set(group, node);
  }
  node.textContent = `${group} · ${count}`;
  return node;
}

function renderGrid() {
  const needle = query.trim().toLowerCase();
  const entries = visibleEntries();
  const frag = document.createDocumentFragment();

  if (entries.length === 0) {
    frag.append(
      el(
        "div",
        { class: "cx-empty" },
        el("b", { text: `No component matches “${query.trim()}”` }),
        el("span", { text: "Try a shorter word, or search by what you want to build — “table”, “chart”, “upload”, “alert”." }),
      ),
    );
  } else if (needle) {
    // Ranked results read better as one flat, best-first list.
    for (const entry of entries) {
      frag.append(cardFor(entry));
      paintTitle(entry, needle);
    }
  } else {
    for (const group of GROUP_ORDER) {
      const inGroup = entries.filter((c) => c.group === group);
      if (inGroup.length === 0) continue;
      frag.append(groupLabel(group, inGroup.length));
      for (const entry of inGroup) {
        frag.append(cardFor(entry));
        paintTitle(entry, "");
      }
    }
  }

  grid.replaceChildren(frag);
  renderMeta(entries.length);
}

function renderMeta(count) {
  const parts = [
    el("span", {}, el("b", { text: String(count) }), ` component${count === 1 ? "" : "s"}`),
  ];
  if (activeGroup !== "All") {
    const blurb = GROUP_BLURBS[activeGroup];
    parts.push(el("span", { class: "cx-meta-blurb", text: blurb || activeGroup }));
  } else if (!query.trim()) {
    parts.push(el("span", { class: "cx-meta-blurb", text: "Click any tile for the full signature, props and source." }));
  }
  metaLine.replaceChildren(...parts);
}

/* ===========================================================================
   5. Toolbar
   =========================================================================== */

function renderChips() {
  const counts = new Map();
  for (const entry of CATALOG) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);

  const make = (label, count) =>
    el(
      "button",
      {
        type: "button",
        class: "cx-chip",
        "data-group": label,
        "aria-pressed": label === activeGroup ? "true" : "false",
      },
      label,
      el("span", { class: "cx-chip-count", text: String(count) }),
    );

  chipsHost.replaceChildren(
    make("All", CATALOG.length),
    ...GROUP_ORDER.map((g) => make(g, counts.get(g) ?? 0)),
  );
}

function setGroup(group) {
  activeGroup = group;
  for (const chip of chipsHost.querySelectorAll(".cx-chip")) {
    chip.setAttribute("aria-pressed", chip.dataset.group === group ? "true" : "false");
  }
  renderGrid();
}

function setQuery(value) {
  query = value;
  searchWrap.setAttribute("data-filled", value ? "true" : "false");
  renderGrid();
}

/* ===========================================================================
   6. Detail drawer
   =========================================================================== */

let drawer = null;
let drawerRefs = null;
let currentEntry = null;
let lastFocused = null;

function buildDrawer() {
  const title = el("h2", { class: "cx-detail-title", id: "cx-detail-title" });
  const groupChip = el("span", { class: "cx-detail-group" });

  const prevBtn = el("button", { type: "button", class: "cx-iconbtn", "aria-label": "Previous component", title: "Previous (←)" }, icon(ICONS.prev));
  const nextBtn = el("button", { type: "button", class: "cx-iconbtn", "aria-label": "Next component", title: "Next (→)" }, icon(ICONS.next));
  const closeBtn = el("button", { type: "button", class: "cx-iconbtn", "aria-label": "Close", title: "Close (Esc)" }, icon(ICONS.close));

  const head = el(
    "header",
    { class: "cx-detail-head" },
    title,
    groupChip,
    el("div", { class: "cx-detail-nav" }, prevBtn, nextBtn, closeBtn),
  );

  const summary = el("p", { class: "cx-detail-summary" });
  const description = el("p", { class: "cx-detail-description" });
  const tags = el("div", { class: "cx-detail-tags" });
  const signature = el("pre", { class: "cx-signature" });

  const tabPreview = el("button", { type: "button", class: "cx-tab", role: "tab", "data-key": "preview", "aria-selected": "true", text: "Preview" });
  const tabSource = el("button", { type: "button", class: "cx-tab", role: "tab", "data-key": "source", "aria-selected": "false", text: "Source" });
  const tabs = el("div", { class: "cx-tabs", role: "tablist" }, tabPreview, tabSource);

  const stage = el("div", { class: "cx-preview-stage" });
  const previewPanel = el("div", { class: "cx-panel", "data-key": "preview", "data-active": "true" }, stage);

  const codeEl = el("code");
  const copyBtn = el("button", { type: "button", class: "cx-code-btn" }, icon(ICONS.copy, 13), "Copy");
  const playBtn = el("button", { type: "button", class: "cx-code-btn" }, icon(ICONS.play, 13), "Playground");
  const sourcePanel = el(
    "div",
    { class: "cx-panel", "data-key": "source", "data-active": "false" },
    el("div", { class: "cx-code" }, el("div", { class: "cx-code-actions" }, copyBtn, playBtn), el("pre", {}, codeEl)),
  );

  const propsHost = el("div", { class: "cx-props-host" });

  const body = el(
    "div",
    { class: "cx-detail-body" },
    summary,
    description,
    tags,
    el("h3", { class: "cx-section-title", text: "Signature" }),
    signature,
    el("h3", { class: "cx-section-title", text: "Example" }),
    tabs,
    previewPanel,
    sourcePanel,
    el("h3", { class: "cx-section-title", text: "Props" }),
    propsHost,
  );

  const anchorBtn = el("button", { type: "button", class: "cx-linkbtn" }, icon(ICONS.link, 13), "Copy link");
  const foot = el(
    "footer",
    { class: "cx-detail-foot" },
    anchorBtn,
    el("span", { class: "cx-detail-hint" }, "Navigate with ", el("kbd", { text: "←" }), " ", el("kbd", { text: "→" }), " · close with ", el("kbd", { text: "Esc" })),
  );

  const panel = el("aside", { class: "cx-detail-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "cx-detail-title", tabindex: "-1" }, head, body, foot);
  const scrim = el("div", { class: "cx-detail-scrim" });
  drawer = el("div", { class: "cx-detail", hidden: true }, scrim, panel);
  document.body.append(drawer);

  scrim.addEventListener("click", closeDetail);
  closeBtn.addEventListener("click", closeDetail);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));

  const activate = (key) => {
    for (const t of [tabPreview, tabSource]) t.setAttribute("aria-selected", t.dataset.key === key ? "true" : "false");
    for (const p of [previewPanel, sourcePanel]) p.setAttribute("data-active", p.dataset.key === key ? "true" : "false");
  };
  tabPreview.addEventListener("click", () => activate("preview"));
  tabSource.addEventListener("click", () => activate("source"));

  copyBtn.addEventListener("click", async () => {
    if (!currentEntry?.sample) return;
    await navigator.clipboard?.writeText(currentEntry.sample);
    flash(copyBtn, "Copied");
  });

  playBtn.addEventListener("click", async () => {
    if (!currentEntry?.sample) return;
    const encoded = await encodeShare(currentEntry.sample);
    window.open(`playground.html#code=${encoded}`, "_blank", "noopener");
  });

  anchorBtn.addEventListener("click", async () => {
    if (!currentEntry) return;
    const url = `${location.origin}${location.pathname}#${currentEntry.id}`;
    await navigator.clipboard?.writeText(url);
    flash(anchorBtn, "Link copied");
  });

  drawerRefs = { title, groupChip, summary, description, tags, signature, stage, codeEl, propsHost, prevBtn, nextBtn, panel, activate, tabs, sourcePanel, previewPanel };
}

function flash(button, message) {
  const original = button.lastChild;
  const previous = original.textContent;
  original.textContent = message;
  setTimeout(() => { original.textContent = previous; }, 1400);
}

/** Same gzip+base64url codec the playground and chat bot use for `#code=`. */
async function encodeShare(text) {
  const bytes = new TextEncoder().encode(text);
  let compressed = bytes;
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* fall through to the raw bytes */ }
  }
  return btoa(String.fromCharCode(...compressed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Colour the signature by role rather than shipping a syntax highlighter. */
function renderSignature(spec) {
  const frag = document.createDocumentFragment();
  frag.append(el("span", { class: "cx-sig-name", text: spec.name }));
  frag.append(el("span", { class: "cx-sig-punct", text: "(" }));
  spec.props.forEach((prop, i) => {
    if (i > 0) frag.append(el("span", { class: "cx-sig-punct", text: ", " }));
    frag.append(el("span", { class: "cx-sig-prop", text: prop.name + (prop.optional ? "?" : "") }));
    frag.append(el("span", { class: "cx-sig-punct", text: ": " }));
    if (prop.enum && prop.enum.length > 0) {
      frag.append(el("span", { class: "cx-sig-enum", text: prop.enum.map((v) => `"${v}"`).join(" | ") }));
    } else {
      frag.append(el("span", { class: "cx-sig-type", text: prop.type }));
    }
  });
  frag.append(el("span", { class: "cx-sig-punct", text: ")" }));
  return frag;
}

function renderProps(spec) {
  if (spec.props.length === 0) {
    return el("p", { class: "cx-no-props", text: "Takes no props — call it as " + spec.name + "()." });
  }
  const rows = spec.props.map((prop) =>
    el(
      "tr",
      {},
      el(
        "td",
        {},
        el("span", { class: "cx-prop-name", text: prop.name }),
        prop.optional ? null : el("span", { class: "cx-prop-req", text: "required" }),
        prop.positional ? el("span", { class: "cx-prop-slot", text: "slot 1" }) : null,
      ),
      el(
        "td",
        {},
        el("span", { class: "cx-prop-type", text: prop.type }),
        prop.enum && prop.enum.length
          ? el("div", { class: "cx-prop-enums" }, ...prop.enum.map((v) => el("span", { class: "cx-prop-enum", text: `"${v}"` })))
          : null,
      ),
      el("td", { class: "cx-prop-desc" }, prop.description ? inlineCode(prop.description) : "—"),
    ),
  );
  const table = el(
    "table",
    { class: "cx-props" },
    el("thead", {}, el("tr", {}, el("th", { text: "Prop" }), el("th", { text: "Type" }), el("th", { text: "What it does" }))),
    el("tbody", {}, ...rows),
  );
  return el("div", { class: "table-scroll" }, table);
}

function openDetail(entry, { pushHash = true } = {}) {
  if (!drawer) buildDrawer();
  currentEntry = entry;
  const r = drawerRefs;

  r.title.textContent = entry.name;
  r.groupChip.textContent = entry.group;
  r.summary.textContent = entry.summary;
  r.description.replaceChildren(inlineCode(entry.spec.description || ""));
  r.description.hidden = !entry.spec.description || entry.spec.description === entry.summary;

  r.tags.replaceChildren(...entry.tags.map((t) => el("span", { class: "cx-tag", text: t })));
  r.tags.hidden = entry.tags.length === 0;

  r.signature.replaceChildren(renderSignature(entry.spec));
  r.propsHost.replaceChildren(renderProps(entry.spec));

  // Rebuild the stage every time: a fresh renderer is the only reliable way to
  // reset a sample that mutated its own reactive state while it was open.
  r.stage.replaceChildren();
  r.stage.setAttribute("data-overlay", OVERLAY_PREVIEW.has(entry.name) ? "true" : "false");
  if (entry.sample) {
    const renderer = document.createElement("aktion-app");
    renderer.setAttribute("theme", currentRendererTheme());
    renderer.setAttribute("margin", "0");
    r.stage.append(renderer);
    try {
      renderer.setResponse(entry.sample);
    } catch (err) {
      console.warn(`[components] detail preview failed for ${entry.name}`, err);
    }
    r.codeEl.textContent = entry.sample;
    r.sourcePanel.hidden = false;
    r.tabs.hidden = false;
  } else {
    r.stage.append(el("p", { class: "cx-no-props", text: "No sample program is registered for this component yet — the signature and props above describe how to call it." }));
    r.codeEl.textContent = "";
    r.sourcePanel.hidden = true;
    r.tabs.hidden = true;
  }
  r.activate("preview");

  const list = visibleEntries();
  const at = list.findIndex((c) => c.id === entry.id);
  r.prevBtn.disabled = at <= 0;
  r.nextBtn.disabled = at < 0 || at >= list.length - 1;

  lastFocused = document.activeElement;
  drawer.hidden = false;
  document.body.classList.add("cx-detail-open");
  r.panel.focus();

  if (pushHash && location.hash.slice(1) !== entry.id) {
    history.replaceState(null, "", `#${entry.id}`);
  }
}

function closeDetail() {
  if (!drawer || drawer.hidden) return;
  drawer.hidden = true;
  currentEntry = null;
  document.body.classList.remove("cx-detail-open");
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
}

/** Move to the previous/next component in whatever list is currently shown. */
function step(delta) {
  if (!currentEntry) return;
  const list = visibleEntries();
  const at = list.findIndex((c) => c.id === currentEntry.id);
  const next = list[at + delta];
  if (next) openDetail(next);
}

/* ===========================================================================
   7. Wiring
   =========================================================================== */

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const entry = BY_ID.get(id) ?? CATALOG.find((c) => c.name.toLowerCase() === id.toLowerCase());
  if (entry) openDetail(entry, { pushHash: false });
}

function renderStats() {
  if (!statsHost) return;
  statsHost.replaceChildren(
    el("span", { class: "cx-hero-stat" }, el("b", { text: String(CATALOG.length) }), "components"),
    el("span", { class: "cx-hero-stat" }, el("b", { text: String(GROUP_ORDER.length) }), "categories"),
    el("span", { class: "cx-hero-stat" }, el("b", { text: String(CATALOG.filter((c) => c.sample).length) }), "live examples"),
  );
}

function init() {
  renderStats();
  renderChips();
  renderGrid();

  chipsHost.addEventListener("click", (event) => {
    const chip = event.target.closest(".cx-chip");
    if (chip) setGroup(chip.dataset.group);
  });

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".cx-card");
    if (!card) return;
    const entry = BY_ID.get(card.dataset.id);
    if (entry) openDetail(entry);
  });

  let debounce = 0;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    const value = searchInput.value;
    debounce = setTimeout(() => setQuery(value), 90);
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      searchInput.value = "";
      setQuery("");
    }
  });
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    setQuery("");
    searchInput.focus();
  });

  document.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if (drawer && !drawer.hidden) {
      if (event.key === "Escape") { event.preventDefault(); closeDetail(); }
      else if (event.key === "ArrowLeft" && !typing) { event.preventDefault(); step(-1); }
      else if (event.key === "ArrowRight" && !typing) { event.preventDefault(); step(1); }
      return;
    }
    // `/` jumps to the gallery filter. Cmd-K stays with the site-wide palette.
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  window.addEventListener("hashchange", () => {
    if (location.hash) openFromHash();
    else closeDetail();
  });

  openFromHash();
}

init();
