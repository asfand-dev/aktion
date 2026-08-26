/**
 * Settings tab — instrumentation switches, panel chrome, and the help card.
 *
 * The switches are not decoration. Prop capture serialises every instance's
 * arguments on every commit, DOM tagging writes an attribute per rendered
 * element, and per-commit snapshots clone the whole store — each is worth its
 * cost when you are using the feature that needs it, and worth turning off when
 * you are measuring render time on a heavy app. A debugger that silently
 * changes the timings it reports is a bad debugger; this is where you take back
 * control of that.
 */

import {
  button, chip, code, defList, faint, fmtCount, h, muted, section, spacer, stat,
  statGrid, toggle, toolbar,
} from "../ui.js";
import type { DevtoolsHookOptions } from "../hook.js";
import { clearModel } from "../model.js";
import type { DockMode, TabContext, TabDefinition } from "../context.js";

const SWITCHES: ReadonlyArray<{
  key: keyof DevtoolsHookOptions;
  label: string;
  hint: string;
}> = [
  {
    key: "captureProps",
    label: "Capture props",
    hint: "Record each component instance's arguments in every commit. Required by the Inspect tab's Props pane; the most expensive switch on a large tree.",
  },
  {
    key: "tagDom",
    label: "Tag DOM",
    hint: "Stamp data-aktion-instance on rendered elements. Required by the element picker and by highlighting.",
  },
  {
    key: "captureSnapshots",
    label: "State snapshots",
    hint: "Attach a $state snapshot to every commit. Required by time travel; clones the store once per commit.",
  },
  {
    key: "captureNetwork",
    label: "Network",
    hint: "Emit request events and honour request rules. Turning this off also disables mocking.",
  },
  {
    key: "measureDom",
    label: "Measure DOM",
    hint: "Count DOM nodes after each commit. Cheap, but it walks the whole tree.",
  },
];

const DOCKS: ReadonlyArray<{ value: DockMode; label: string }> = [
  { value: "float", label: "Float" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
];

export const settingsTab: TabDefinition = {
  id: "settings",
  label: "Settings",
  icon: "⚙",
  hint: "Instrumentation switches, panel layout, and keyboard shortcuts",
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { hook, model, ui } = ctx;

  const bar = toolbar(
    muted(`Aktion DevTools · protocol v${hook.protocolVersion} · runtime ${hook.libraryVersion}`),
    spacer(),
    chip(`${hook.apps.size} app${hook.apps.size === 1 ? "" : "s"}`, "grey"),
  );

  const instrumentation = section("Instrumentation", [
    h("div", { class: "switch-list" }, ...SWITCHES.map((entry) => h("div", { class: "switch-row" },
      toggle(entry.label, hook.options[entry.key], () => {
        hook.setOptions({ [entry.key]: !hook.options[entry.key] });
        // The renderer reads these per commit, so force one to apply the change
        // immediately rather than at the next unrelated render.
        ctx.app?.forceRender();
        ctx.toast(`${entry.label} ${hook.options[entry.key] ? "on" : "off"}`);
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, entry.hint)))),
    faint("These gate work inside the runtime, not inside the panel — switching one off makes the app faster, not just the panel."),
  ]);

  const layout = section("Panel", [
    h("div", { class: "switch-row" },
      h("div", { class: "filters" }, ...DOCKS.map((dock) =>
        toggle(dock.label, ui.dock === dock.value, () => {
          ui.dock = dock.value;
          ctx.refresh();
        }))),
      h("span", { class: "switch-hint" }, "Float freely, or dock to an edge.")),
    h("div", { class: "switch-row" },
      toggle("Light theme", ui.light, () => {
        ui.light = !ui.light;
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, "For a light host page.")),
    h("div", { class: "switch-row" },
      toggle("Compact rows", ui.compact, () => {
        ui.compact = !ui.compact;
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, "Denser lists, for a small dock.")),
    h("div", { class: "switch-row" },
      toggle("Capture console", ui.captureConsole, () => {
        ui.captureConsole = !ui.captureConsole;
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, "Mirror the page console into the Console tab, including the runtime's own [aktion] diagnostics.")),
  ]);

  const retention = section("Session", [
    statGrid(
      stat("commits", fmtCount(model.commits.length), { title: `${fmtCount(model.totals.commits)} seen` }),
      stat("effects", fmtCount(model.effects.length)),
      stat("requests", fmtCount(model.network.length)),
      stat("logs", fmtCount(model.logs.length)),
      stat("snapshots", fmtCount(model.history.length)),
      stat("buffer", fmtCount(hook.buffer.length), { title: `Backfill buffer, capped at ${hook.bufferLimit}` }),
    ),
    h("div", { class: "detail-head" },
      button("Clear captured data", () => {
        clearModel(model);
        hook.clearBuffer();
        ui.selectedCommitId = null;
        ui.selectedRequest = null;
        ui.timeTravel = null;
        ctx.toast("Session data cleared");
        ctx.refresh();
      }, { tone: "warn" }),
      spacer(),
      faint("Lists are rings: old entries are dropped so a long session cannot grow without bound.")),
  ]);

  const shortcuts = section("Keyboard", defList([
    ["Esc", "Cancel the element picker"],
    ["Enter", "Commit an inline edit · run a REPL expression"],
    ["↑ / ↓", "Walk REPL history"],
    ["Click a header", "Sort a table"],
    ["Drag the header", "Move a floating panel"],
    ["Drag the corner", "Resize the panel"],
  ]));

  const about = section("About", [
    faint("An in-page debugger for any <aktion-app> on the page. It talks to the runtime only through the global hook, so the same protocol could drive a browser-extension panel."),
    defList([
      ["hook", code("__AKTION_DEVTOOLS_HOOK__")],
      ["protocol", `v${hook.protocolVersion}`],
      ["runtime", hook.libraryVersion],
      ["apps", [...hook.apps.values()].map((app) => app.label).join(", ") || "none"],
    ]),
    faint("Instrumentation stays dormant until a frontend subscribes: closing this panel returns the app to its uninstrumented speed."),
  ]);

  return [bar, instrumentation, layout, retention, shortcuts, about];
}
