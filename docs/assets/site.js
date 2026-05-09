/**
 * Documentation site helpers:
 *   - Wires up live examples (preview + code tabs)
 *   - Hooks up theme switching
 *   - Powers the playground page
 *   - Mounts a mobile menu toggle so the sidebar works on phones
 *   - Wraps any wide tables in a horizontally-scrollable container
 */

// Relative to the page importing site.js. The build script copies dist/ into
// site/dist/ so both layouts (site/ root or project root with /docs) work via
// the same URL.
const LIB_PATH = new URL("../../dist/llm-response-ui-lang.js", import.meta.url).href;

let importPromise = null;
function importLibrary() {
  if (!importPromise) importPromise = import(LIB_PATH);
  return importPromise;
}

function highlightActiveLink() {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar nav a").forEach((a) => {
    if ((a.getAttribute("href") || "").endsWith(here)) a.classList.add("active");
  });
}

function setupThemePicker() {
  const select = document.getElementById("theme-picker");
  if (!select) return;
  const apply = () => {
    const value = select.value;
    document.querySelectorAll("llm-response-ui-lang").forEach((el) => {
      el.setAttribute("theme", value);
    });
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
    const target = example.querySelector("llm-response-ui-lang");
    if (target && lang) {
      const text = lang.textContent.trim();
      target.setAttribute("data-source", "");
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

  importLibrary().then(() => {
    const update = () => target.setResponse(input.value);
    update();
    input.addEventListener("input", update);
    themeSelect?.addEventListener("change", () => {
      target.setAttribute("theme", themeSelect.value);
    });
  });
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-copy-target");
      const node = document.getElementById(id);
      if (!node) return;
      const text = node.textContent || "";
      navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = "Copied!";
        setTimeout(() => { button.textContent = originalText; }, 1500);
      });
    });
  });
}

/**
 * Wrap each .signature-table in a horizontally-scrollable container so
 * narrow viewports can still read the full row instead of squashing or
 * wrapping the cell contents. We only wrap if the table isn't already
 * inside a `.table-scroll` element.
 */
function wrapWideTables() {
  document.querySelectorAll("main table.signature-table").forEach((table) => {
    if (table.parentElement?.classList.contains("table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
}

/**
 * Inject a hamburger toggle and backdrop so the sidebar collapses on mobile.
 * The toggle is always present in the DOM but hidden on desktop via CSS.
 */
function setupMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "menu-toggle";
  toggle.setAttribute("aria-label", "Toggle navigation menu");
  toggle.setAttribute("aria-controls", "site-nav");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = "&#9776;";
  document.body.appendChild(toggle);

  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  document.body.appendChild(backdrop);

  sidebar.id = sidebar.id || "site-nav";

  const close = () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "&#9776;";
  };

  const open = () => {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.innerHTML = "&times;";
  };

  toggle.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) close(); else open();
  });
  backdrop.addEventListener("click", close);
  sidebar.querySelectorAll("nav a").forEach((a) => a.addEventListener("click", close));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  highlightActiveLink();
  wrapWideTables();
  setupMobileMenu();
  setupThemePicker();
  setupExamples();
  setupPlayground();
  setupCopyButtons();
});
