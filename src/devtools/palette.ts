/**
 * Aktion DevTools — the command palette.
 *
 * Fourteen tabs, each with its own sub-views and buttons, is a lot of surface to
 * find things in. A palette fixes discoverability the way editors do: one
 * keystroke (<kbd>Ctrl/⌘ K</kbd>), type a few letters, hit Enter. It is also the
 * fastest path for the things you do constantly — pick an element, clear the
 * session, run the audit — without hunting for the button that does it.
 *
 * Two design rules keep it useful rather than decorative:
 *
 *   - **Every command says where it lives** (`Inspect · Pick element`), so using
 *     the palette teaches the panel instead of replacing it.
 *   - **Matching is subsequence-based, not substring.** `pel` finds
 *     "Inspect · **P**ick **el**ement"; requiring a contiguous match would mean
 *     remembering the exact wording, which is the problem the palette solves.
 */

import { h } from "./ui.js";
import type { TabContext, TabId } from "./context.js";

/** One palette entry. */
export interface Command {
  /** Stable id, also used as the list key. */
  id: string;
  /** Group the command belongs to (usually a tab name). */
  group: string;
  /** What it does, in the imperative. */
  label: string;
  /** Extra searchable words that are not in the label. */
  keywords?: string;
  /** Shortcut hint shown on the right. */
  hint?: string;
  run(): void;
}

/* -------------------------------------------------------------------------- */
/*  Matching                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Subsequence score for `query` against `text`, or `null` for no match.
 *
 * Lower is better. Consecutive matches and matches at word starts score better,
 * so `insp` ranks "Inspect" above "Install", and typing a full word ranks it
 * first even when a shorter entry also matches.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (query === "") return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let lastHit = -2;
  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found < 0) return null;
    // Penalise gaps, reward adjacency and word starts.
    const atWordStart = found === 0 || /[\s·:/(-]/.test(t[found - 1] ?? "");
    score += found - ti;
    if (found === lastHit + 1) score -= 1;
    if (atWordStart) score -= 2;
    lastHit = found;
    ti = found + 1;
  }
  // Prefer shorter entries when scores tie: a match in a short label is usually
  // the one meant.
  return score + text.length / 100;
}

/**
 * Rank commands against a query, best first.
 *
 * Raw subsequence scoring is not enough on its own. Typing a word that names a
 * tab — "theme", "network" — almost always means "take me there", but the tab
 * command competes with every action in that tab's group, several of which
 * repeat the word ("Reset theme token overrides"). Three biases fix that
 * without special-casing individual commands:
 *
 *   - an exact label match wins outright,
 *   - a label that STARTS with the query beats one that merely contains it,
 *   - navigation beats action on an otherwise equal score.
 */
export function rankCommands(commands: ReadonlyArray<Command>, query: string): Command[] {
  const trimmed = query.trim();
  if (trimmed === "") return [...commands];
  const needle = trimmed.toLowerCase();
  const scored: Array<{ command: Command; score: number }> = [];
  for (const command of commands) {
    const haystack = `${command.group} · ${command.label} ${command.keywords ?? ""}`;
    const base = fuzzyScore(trimmed, haystack);
    if (base === null) continue;
    const label = command.label.toLowerCase();
    let score = base;
    if (label === needle) score -= 100;
    else if (label.startsWith(needle)) score -= 20;
    if (command.group === "Go to") score -= 3;
    scored.push({ command, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((entry) => entry.command);
}

/* -------------------------------------------------------------------------- */
/*  Command list                                                              */
/* -------------------------------------------------------------------------- */

/** Tab labels + icons, for the "go to tab" commands. */
const TAB_COMMANDS: ReadonlyArray<{ id: TabId; label: string; keywords: string }> = [
  { id: "overview", label: "Overview", keywords: "health summary home start" },
  { id: "inspect", label: "Inspect", keywords: "component tree element picker props hooks dom styles box model" },
  { id: "state", label: "State", keywords: "atoms reactive edit time travel snapshot diff watch" },
  { id: "profiler", label: "Profiler", keywords: "commits renders flamegraph memo performance slow" },
  { id: "effects", label: "Effects", keywords: "side effects timeline triggers intervals cleanup mounted" },
  { id: "network", label: "Network", keywords: "http requests fetch query mutation mock offline delay rules" },
  { id: "console", label: "Console", keywords: "logs warnings errors repl evaluate expression watch" },
  { id: "routes", label: "Routes", keywords: "router navigation path params patterns" },
  { id: "data", label: "Data", keywords: "queries cache stores forms localstorage session cookies" },
  { id: "theme", label: "Theme", keywords: "tokens colours colors contrast design dark light" },
  { id: "source", label: "Source", keywords: "program code diagnostics outline edit reload history" },
  { id: "test", label: "Test", keywords: "record test accessibility a11y coverage queries chaos fuzz" },
  { id: "timeline", label: "Timeline", keywords: "events ordered stream export session" },
  { id: "settings", label: "Settings", keywords: "instrumentation dock theme density shortcuts about" },
];

/**
 * Build the command list for the current context.
 *
 * Commands are recomputed per open rather than registered up front, so they can
 * depend on what is actually available — there is no "Refetch query" entry when
 * the app exposes no query cache, and no "Clear overrides" when none are active.
 */
export function buildPalette(ctx: TabContext, actions: PaletteActions): Command[] {
  const commands: Command[] = [];
  const { app, ui } = ctx;

  for (const tab of TAB_COMMANDS) {
    commands.push({
      id: `tab:${tab.id}`,
      group: "Go to",
      label: tab.label,
      keywords: tab.keywords,
      run: () => ctx.selectTab(tab.id),
    });
  }

  commands.push(
    {
      id: "pick",
      group: "Inspect",
      label: ctx.overlay.isPicking ? "Cancel element picker" : "Pick element on the page",
      keywords: "select click crosshair find component",
      hint: "Ctrl+Shift+P",
      run: () => actions.togglePicker(),
    },
    {
      id: "highlight",
      group: "Inspect",
      label: `${ui.highlightUpdates ? "Stop" : "Start"} highlighting re-renders`,
      keywords: "flash outline updates paint which components render",
      run: () => {
        ui.highlightUpdates = !ui.highlightUpdates;
        ctx.toast(ui.highlightUpdates ? "Highlighting re-renders" : "Highlighting off");
        ctx.refresh();
      },
    },
    {
      id: "force-render",
      group: "App",
      label: "Force a full re-render",
      keywords: "repaint refresh redraw",
      run: () => {
        app?.forceRender();
        ctx.toast("Full re-render requested");
      },
    },
  );

  if (typeof app?.reload === "function") {
    commands.push({
      id: "reload",
      group: "App",
      label: "Re-plan the program",
      keywords: "reload hot restart",
      run: () => {
        app.reload!();
        ctx.toast("Program re-planned");
        ctx.refresh();
      },
    });
  }

  if (typeof app?.resetState === "function") {
    commands.push({
      id: "reset-state",
      group: "State",
      label: "Reset all state to declared defaults",
      keywords: "clear wipe initial",
      run: () => {
        app.resetState!();
        ctx.toast("State reset");
        ctx.refresh();
      },
    });
  }

  if (ui.timeTravel !== null) {
    commands.push({
      id: "live",
      group: "State",
      label: "Return to live state",
      keywords: "time travel stop scrub",
      run: () => {
        ui.timeTravel = null;
        ctx.selectTab("state");
      },
    });
  }

  if (typeof app?.listPropOverrides === "function" && app.listPropOverrides().length > 0) {
    commands.push({
      id: "clear-overrides",
      group: "Inspect",
      label: `Clear ${app.listPropOverrides().length} prop override(s)`,
      keywords: "revert restore props",
      run: () => actions.clearOverrides(),
    });
  }

  if (typeof app?.clearThemeTokens === "function") {
    commands.push({
      id: "clear-theme",
      group: "Theme",
      label: "Reset theme token overrides",
      keywords: "colours colors revert",
      run: () => {
        app.clearThemeTokens!();
        ctx.toast("Theme overrides cleared");
        ctx.refresh();
      },
    });
  }

  commands.push(
    {
      id: "audit",
      group: "Test",
      label: "Run the accessibility audit",
      keywords: "a11y contrast labels roles",
      run: () => actions.runAudit(),
    },
    {
      id: "record",
      group: "Test",
      label: ctx.recorder.isRecording ? "Stop recording interactions" : "Record interactions as a test",
      keywords: "capture generate vitest steps",
      run: () => actions.toggleRecording(),
    },
    {
      id: "export",
      group: "Session",
      label: "Export the session as JSON",
      keywords: "download bug report share",
      run: () => actions.exportSession(),
    },
    {
      id: "clear-session",
      group: "Session",
      label: "Clear captured data",
      keywords: "reset empty commits events logs",
      run: () => actions.clearSession(),
    },
    {
      id: "pause",
      group: "Session",
      label: ui.paused ? "Resume recording events" : "Pause recording events",
      keywords: "freeze stop capture",
      run: () => {
        ui.paused = !ui.paused;
        ctx.toast(ui.paused ? "Paused" : "Recording");
        ctx.refresh();
      },
    },
    {
      id: "dock",
      group: "Panel",
      label: "Cycle dock position",
      keywords: "float right bottom left move layout",
      run: () => actions.cycleDock(),
    },
    {
      id: "theme-toggle",
      group: "Panel",
      label: `Switch to the ${ui.light ? "dark" : "light"} panel theme`,
      keywords: "appearance contrast",
      run: () => {
        ui.light = !ui.light;
        ctx.refresh();
      },
    },
    {
      id: "compact",
      group: "Panel",
      label: ui.compact ? "Use comfortable row height" : "Use compact row height",
      keywords: "density small rows",
      run: () => {
        ui.compact = !ui.compact;
        ctx.refresh();
      },
    },
    {
      id: "shortcuts",
      group: "Help",
      label: "Show keyboard shortcuts",
      keywords: "keys help bindings",
      hint: "?",
      run: () => actions.showShortcuts(),
    },
  );

  return commands;
}

/** The panel-level operations the palette needs to be able to trigger. */
export interface PaletteActions {
  togglePicker(): void;
  clearOverrides(): void;
  runAudit(): void;
  toggleRecording(): void;
  exportSession(): void;
  clearSession(): void;
  cycleDock(): void;
  showShortcuts(): void;
}

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/** What the palette needs from its owner on each update. */
export interface PaletteState {
  query: string;
  selected: number;
  commands: ReadonlyArray<Command>;
}

/** Callbacks the palette fires; the owner holds the state they mutate. */
export interface PaletteHandlers {
  onQuery(value: string): void;
  onMove(delta: number): void;
  onRun(command: Command): void;
  onClose(): void;
}

/**
 * A palette whose input element persists across renders.
 *
 * This is deliberately a small controller rather than a render function. A
 * palette re-created on every keystroke — which is what a plain
 * `(state) => Node` would do, since typing changes the query and the query
 * drives a re-render — replaces the very element you are typing into: it drops
 * IME composition, can lose a fast keystroke, and makes an <kbd>Enter</kbd> that
 * arrives mid-render run whatever the *previous* render had selected. Binding
 * the listeners once and re-rendering only the result list fixes all three.
 */
export class PaletteController {
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly footCount: HTMLElement;
  private readonly root: HTMLElement;
  /** Results of the latest update, so Enter always runs what is on screen. */
  private results: Command[] = [];
  private selected = 0;

  constructor(private readonly handlers: PaletteHandlers) {
    this.input = h("input", {
      class: "pal-input",
      placeholder: "Type a command… (tabs, actions, settings)",
      spellcheck: "false",
    }) as HTMLInputElement;
    this.list = h("div", { class: "pal-list" });
    this.footCount = h("span", {});

    this.input.addEventListener("input", () => this.handlers.onQuery(this.input.value));
    this.input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") { event.preventDefault(); this.handlers.onMove(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); this.handlers.onMove(-1); }
      else if (event.key === "Enter") {
        event.preventDefault();
        const command = this.results[this.selected];
        if (command) this.handlers.onRun(command);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.handlers.onClose();
      }
    });

    this.root = h(
      "div",
      { class: "pal-scrim", onclick: () => this.handlers.onClose() },
      h(
        "div",
        { class: "pal-box", onclick: (event: Event) => event.stopPropagation() },
        this.input,
        this.list,
        h("div", { class: "pal-foot" },
          h("span", {}, "↑↓ to move · Enter to run · Esc to close"),
          this.footCount),
      ),
    );
  }

  /** Mount into `host` (idempotent) and refresh the list. Returns the count. */
  update(host: HTMLElement, state: PaletteState): number {
    if (this.root.parentElement !== host) host.replaceChildren(this.root);
    // Only assign when it differs: writing `value` unconditionally would reset
    // the caret to the end on every render.
    if (this.input.value !== state.query) this.input.value = state.query;

    this.results = rankCommands(state.commands, state.query).slice(0, 40);
    this.selected = Math.max(0, Math.min(state.selected, this.results.length - 1));

    this.list.replaceChildren();
    if (this.results.length === 0) {
      this.list.appendChild(h("div", { class: "pal-empty" }, `No command matches “${state.query}”.`));
    }
    this.results.forEach((command, index) => {
      this.list.appendChild(h(
        "button",
        {
          class: `pal-row ${index === this.selected ? "is-active" : ""}`,
          onmouseenter: () => this.handlers.onMove(index - this.selected),
          onclick: () => this.handlers.onRun(command),
        },
        h("span", { class: "pal-group" }, command.group),
        h("span", { class: "pal-label" }, command.label),
        command.hint ? h("span", { class: "pal-hint" }, command.hint) : null,
      ));
    });
    this.footCount.textContent = `${this.results.length} command${this.results.length === 1 ? "" : "s"}`;
    return this.results.length;
  }

  /**
   * Focus the input. The palette is the one place where taking focus is
   * unambiguously what the user asked for.
   */
  focus(): void {
    this.input.focus();
    try {
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    } catch {
      /* not supported for this input type */
    }
    this.list.querySelector(".pal-row.is-active")?.scrollIntoView({ block: "nearest" });
  }

  /** Reset the query so the next open starts clean. */
  reset(): void {
    this.input.value = "";
    this.results = [];
    this.selected = 0;
  }
}

/** The keyboard-shortcut reference, shown by `?` and from the palette. */
export const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ["Ctrl / ⌘ K", "Open the command palette — from anywhere on the page"],
  ["Ctrl+Shift+P", "Toggle the element picker — from anywhere on the page"],
  ["Alt+1 … Alt+9", "Jump to a tab by position — from anywhere on the page"],
  ["Alt+[  /  Alt+]", "Previous / next tab — from anywhere on the page"],
  ["?", "Show this list (panel focused)"],
  ["Ctrl / ⌘ F  or  /", "Focus the current tab's filter (panel focused)"],
  ["Esc", "Cancel the picker, close the palette, or cancel an edit"],
  ["Enter", "Commit an inline edit · run a REPL expression"],
  ["↑ / ↓", "Walk REPL history · move in the palette"],
];
