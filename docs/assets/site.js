/**
 * Documentation site helpers:
 *   - Wires up live examples (preview + code tabs)
 *   - Hooks up theme switching
 *   - Powers the playground page
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

document.addEventListener("DOMContentLoaded", () => {
  highlightActiveLink();
  setupThemePicker();
  setupExamples();
  setupPlayground();
  setupCopyButtons();
});
