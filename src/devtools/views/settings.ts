/**
 * Settings — appearance, behaviour, runtime instrumentation, session data,
 * shortcuts, and version information. Everything here persists per browser.
 */

import { h, type Child } from "../core/vdom.js";
import { type DockMode, type UiState, type ViewContext, type ViewDefinition } from "../context.js";
import type { DevtoolsHookOptions } from "../hook.js";
import { DEVTOOLS_UI_VERSION } from "../meta.js";
import { SHORTCUT_GROUPS } from "../palette.js";
import { icon, logoMark, type IconName } from "../ui/icons.js";
import { button, card, chip, keys, note, segmented, toggleSwitch, fmtCount } from "../ui/kit.js";

function row(title: string, description: Child, control: Child, iconName?: IconName): Child {
  return h("div", { class: "se-row" },
    iconName ? h("span", { class: "se-row-icon" }, icon(iconName, { size: 15 })) : h("span", { class: "se-row-icon is-empty" }),
    h("div", { class: "se-row-text" }, h("div", { class: "se-row-title" }, title), description ? h("div", { class: "se-row-desc" }, description) : null),
    h("div", { class: "se-row-control" }, control));
}

const INSTRUMENTATION: ReadonlyArray<{ key: keyof DevtoolsHookOptions; title: string; description: string; icon: IconName; rerender?: boolean }> = [
  { key: "captureProps", title: "Capture props", description: "Per-instance props and arguments in every commit — the Inspector's Props pane and the profiler's “why did this render”.", icon: "brackets", rerender: true },
  { key: "tagDom", title: "Tag DOM nodes", description: "Stamps data-aktion-instance on rendered elements so the picker and highlights can map DOM ↔ component.", icon: "tag", rerender: true },
  { key: "captureSnapshots", title: "State snapshots", description: "A $state snapshot with every commit — powers time travel and state diffs.", icon: "history" },
  { key: "captureNetwork", title: "Network events", description: "Requests from the HTTP layer, plus mock, delay and failure rules.", icon: "network" },
  { key: "measureDom", title: "Count DOM nodes", description: "Walks the tree after each commit to report DOM size. Cheap, but a full walk.", icon: "layers" },
];

function render(ctx: ViewContext): Child {
  const { ui, hook, app } = ctx;
  const setUi = <K extends keyof UiState>(key: K, value: UiState[K]): void => {
    ui[key] = value;
    ctx.persist();
    ctx.refresh();
  };
  const options = hook.options;
  const docks: ReadonlyArray<{ value: DockMode; label: string; icon: IconName }> = [
    { value: "float", label: "Float", icon: "dockFloat" },
    { value: "right", label: "Right", icon: "dockRight" },
    { value: "bottom", label: "Bottom", icon: "dockBottom" },
    { value: "left", label: "Left", icon: "dockLeft" },
  ];
  return h("div", { class: "dt-scroll", "data-dt": "settings" },
    h("div", { class: "se-page" },
      h("div", { class: "se-hero" },
        logoMark(40),
        h("div", { class: "se-hero-text" },
          h("div", { class: "se-hero-title" }, "Aktion DevTools"),
          h("div", { class: "t3" }, `Panel ${DEVTOOLS_UI_VERSION} · protocol ${hook.protocolVersion} · runtime ${hook.libraryVersion}`)),
        h("div", { class: "se-hero-actions" },
          button({ label: "Shortcuts", icon: "keyboard", size: "sm", onClick: () => ctx.panel.showShortcuts() }),
          button({ label: "Command palette", icon: "command", size: "sm", kbd: "⌘ K", onClick: () => ctx.openPalette() }))),

      card({
        title: "Appearance", icon: "sun", testid: "settings-appearance", flush: true,
        body: h("div", { class: "se-rows" },
          row("Theme", "Follows your system unless you pick one.",
            segmented([{ value: "system", label: "System", icon: "contrast" }, { value: "dark", label: "Dark", icon: "moon" }, { value: "light", label: "Light", icon: "sun" }], ui.theme, (v) => setUi("theme", v), { label: "Panel theme", testid: "settings-theme" }), "contrast"),
          row("Density", "Compact rows fit more on screen.",
            segmented([{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }], ui.compact ? "compact" : "comfortable", (v) => setUi("compact", v === "compact"), { label: "Density", testid: "settings-density" }), "list"),
          row("Motion", "Animations respect prefers-reduced-motion by default.",
            segmented([{ value: "system", label: "System" }, { value: "reduced", label: "Reduced" }, { value: "full", label: "Full" }], ui.motion, (v) => setUi("motion", v), { label: "Motion" }), "sparkles"),
          row("Position", "Dock to an edge, or float and drag it anywhere (drag to an edge to snap).",
            segmented(docks.map((d) => ({ value: d.value, label: d.label, icon: d.icon })), ui.dock, (v) => ctx.panel.setDock(v), { label: "Dock position", testid: "settings-dock" }), "panel"),
          row("Push the page aside when docked", "Keeps the app fully visible next to the panel instead of underneath it.",
            toggleSwitch({ checked: ui.pushPage, onChange: (v) => setUi("pushPage", v) }), "split"),
          row("Sidebar labels", "Show section names next to the icons.",
            toggleSwitch({ checked: ui.railWide, onChange: (v) => setUi("railWide", v) }), "panel"),
          row("Launcher button", ["The floating button shown while the panel is minimised — ", h("code", {}, "Shift+Alt+D"), " reopens DevTools either way."],
            toggleSwitch({ checked: ui.showLauncher, onChange: (v) => setUi("showLauncher", v) }), "dot")),
      }),

      card({
        title: "Behaviour", icon: "zap", testid: "settings-behaviour", flush: true,
        body: h("div", { class: "se-rows" },
          row("Capture console", "Mirror console.* calls into the Console view (the original calls still run).",
            toggleSwitch({ checked: ui.captureConsole, testid: "settings-console", onChange: (v) => setUi("captureConsole", v) }), "console"),
          row("Highlight re-renders", "Outline every component as it renders, with a running count — wasted renders glow amber.",
            toggleSwitch({ checked: ui.highlightUpdates, testid: "settings-highlight", onChange: (v) => ctx.panel.setHighlightUpdates(v) }), "scan"),
          row("Flash the app on commit", "A brief outline on the app element after every commit.",
            toggleSwitch({ checked: ui.flashOnCommit, onChange: (v) => setUi("flashOnCommit", v) }), "zap"),
          row("User Timing marks", ["Emit ", h("code", {}, "performance.measure"), " entries per commit, so renders line up in the browser's Performance panel."],
            toggleSwitch({ checked: ui.perfMarks, onChange: (v) => setUi("perfMarks", v) }), "gauge"),
          row("Re-run accessibility audit after commits", "Keeps the Accessibility view current while you work (debounced).",
            toggleSwitch({ checked: ui.a11yAuto, onChange: (v) => setUi("a11yAuto", v) }), "a11y")),
      }),

      card({
        title: "Runtime instrumentation", icon: "cpu", testid: "settings-instrumentation", flush: true,
        sub: "What the runtime records while DevTools is open. Closing the panel stops all of it.",
        body: h("div", { class: "se-rows" }, ...INSTRUMENTATION.map((entry) => row(entry.title, entry.description,
          toggleSwitch({ checked: options[entry.key], testid: `settings-${entry.key}`, onChange: (v) => {
            hook.setOptions({ [entry.key]: v });
            if (entry.rerender) app?.forceRender();
            ctx.toast(`${entry.title} ${v ? "on" : "off"}`);
            ctx.refresh();
          } }), entry.icon))),
      }),

      card({
        title: "Session data", icon: "data", testid: "settings-data", flush: true,
        body: h("div", { class: "se-rows" },
          row("Export the session", "Commits, state history, requests, logs, errors and recorded steps as one JSON file — attach it to a bug; anyone can open it in DevTools.",
            button({ label: "Export", icon: "download", size: "sm", onClick: () => ctx.panel.exportSession() }), "download"),
          row("Open a session file", "Inspect an exported session offline: timeline, commits, requests, logs and state.",
            button({ label: "Import…", icon: "upload", size: "sm", onClick: () => ctx.panel.importSession() }), "upload"),
          row("Copy a bug report", "Markdown with the environment, recent errors, failing requests, vitals and reproduction steps.",
            button({ label: "Copy", icon: "bug", size: "sm", onClick: () => ctx.panel.copyBugReport() }), "bug"),
          row("Clear captured data", `${fmtCount(ctx.model.commits.length)} commits, ${fmtCount(ctx.model.network.length)} requests and ${fmtCount(ctx.model.logs.length)} log lines in memory.`,
            button({ label: "Clear", icon: "trash", size: "sm", variant: "danger", onClick: () => ctx.panel.clearSession() }), "trash"),
          row("Reset preferences", "Theme, density, position, sizes and toggles back to their defaults.",
            button({ label: "Reset", icon: "undo", size: "sm", onClick: () => ctx.panel.resetPreferences() }), "undo")),
      }),

      card({
        title: "Keyboard shortcuts", icon: "keyboard", testid: "settings-shortcuts",
        body: h("div", { class: "se-shortcuts" }, ...SHORTCUT_GROUPS.map((group) => h("div", { key: group.title, class: "se-sc-group" },
          h("div", { class: "se-sc-title" }, group.title),
          ...group.items.map(([combo, what]) => h("div", { key: combo, class: "se-sc-row" }, h("span", { class: "se-sc-what" }, what), keys(combo)))))),
      }),

      card({
        title: "About", icon: "info", testid: "settings-about",
        body: h("div", { class: "se-about" },
          h("dl", { class: "kv" },
            h("dt", {}, "Panel"), h("dd", {}, DEVTOOLS_UI_VERSION),
            h("dt", {}, "Protocol"), h("dd", {}, String(hook.protocolVersion)),
            h("dt", {}, "Runtime"), h("dd", {}, hook.libraryVersion),
            h("dt", {}, "Apps on page"), h("dd", {}, String(hook.apps.size)),
            h("dt", {}, "Event buffer"), h("dd", {}, `${fmtCount(hook.buffer.length)} / ${fmtCount(hook.bufferLimit)}`),
            h("dt", {}, "Secure context"), h("dd", {}, typeof isSecureContext !== "undefined" && isSecureContext ? chip("yes", "green") : chip("no", "amber"))),
          note("plain", ["DevTools costs nothing until opened: the runtime checks ", h("code", {}, "hook.active"), " and keeps its profiler dormant. Nothing leaves this page — no telemetry, no network calls of its own (the Security view's header check is one same-origin HEAD request, on request)."], { icon: "lock" })),
      })));
}

export const settingsView: ViewDefinition = {
  id: "settings",
  label: "Settings",
  icon: "settings",
  group: "system",
  hint: "Appearance, behaviour, instrumentation, data, shortcuts, about",
  keywords: "settings preferences options theme dark light density dock instrumentation export import reset about version shortcuts",
  render,
  css: /* css */ `
.se-page { padding: 14px; display: flex; flex-direction: column; gap: 12px; max-width: 900px; }
.se-hero { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--dt-r-lg); border: 1px solid var(--dt-border); background: radial-gradient(120% 140% at 0% 0%, var(--dt-accent-soft), transparent 60%), var(--dt-bg-1); flex-wrap: wrap; }
.se-hero-text { flex: 1 1 200px; display: flex; flex-direction: column; gap: 3px; }
.se-hero-title { font-size: 17px; font-weight: 750; letter-spacing: -0.01em; }
.se-hero-text .t3 { font-size: var(--dt-fs-sm); font-variant-numeric: tabular-nums; }
.se-hero-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.se-rows { display: flex; flex-direction: column; }
.se-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--dt-border); }
.se-row:last-child { border-bottom: 0; }
.se-row-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--dt-text-2); background: var(--dt-bg-2); }
.se-row-icon.is-empty { background: none; }
.se-row-title { font-weight: 600; font-size: var(--dt-fs-md); }
.se-row-desc { font-size: var(--dt-fs-sm); color: var(--dt-text-3); margin-top: 2px; line-height: 1.45; }
.se-row-control { display: flex; justify-content: flex-end; }
@container (max-width: 560px) { .se-row { grid-template-columns: 28px minmax(0, 1fr); } .se-row-control { grid-column: 2; justify-content: flex-start; } }
.se-shortcuts { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px 20px; }
.se-sc-title { font-size: var(--dt-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dt-text-3); margin-bottom: 6px; }
.se-sc-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: var(--dt-fs-sm); }
.se-sc-what { color: var(--dt-text-2); }
.se-about { display: flex; flex-direction: column; gap: 12px; }
`,
};
