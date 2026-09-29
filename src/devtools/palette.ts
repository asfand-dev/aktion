/**
 * Aktion DevTools — the command palette.
 *
 * Sixteen sections, each with sub-views and actions, is a lot of surface. The
 * palette makes all of it one keystroke away: every section, every action a
 * view offers, every component on screen ("Inspect CartRow"), every atom
 * ("$user"), every declared route ("Navigate to /orders"), and every cached
 * query ("Refetch /api/todos").
 *
 * Two rules keep it useful rather than decorative:
 *
 *   - **Every command says where it lives** (`Inspector · Pick element`), so
 *     the palette teaches the panel instead of replacing it.
 *   - **Matching is subsequence-based.** `pel` finds "**P**ick **el**ement";
 *     requiring a contiguous match would mean remembering exact wording, which
 *     is the problem a palette exists to solve.
 */

import { autofocus, h, type Child, type VNode } from "./core/vdom.js";
import { virtualList } from "./core/virtual-list.js";
import { icon, type IconName } from "./ui/icons.js";

/** One palette entry. */
export interface Command {
  /** Stable id, also used as the list key. */
  id: string;
  /** Group the command belongs to (usually a section name). */
  group: string;
  /** What it does, in the imperative. */
  label: string;
  /** Extra searchable words that are not in the label. */
  keywords?: string;
  /** Shortcut hint shown on the right. */
  hint?: string;
  icon?: IconName;
  run(): void;
}

/* -------------------------------------------------------------------------- */
/*  Matching                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Subsequence score for `query` against `text`, or `null` for no match. Lower
 * is better: consecutive matches and word starts score better, so `insp` ranks
 * "Inspect" above "Install".
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
    const atWordStart = found === 0 || /[\s·:/(-]/.test(t[found - 1] ?? "");
    score += found - ti;
    if (found === lastHit + 1) score -= 1;
    if (atWordStart) score -= 2;
    lastHit = found;
    ti = found + 1;
  }
  return score + text.length / 100;
}

/**
 * Indices in `text` that a query's characters matched, preferring word starts —
 * for highlighting. Empty when there is no match.
 */
export function fuzzyPositions(query: string, text: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = text.toLowerCase();
  // A contiguous hit is what the user most likely meant; show it whole.
  const contiguous = t.indexOf(q);
  if (contiguous >= 0) return Array.from({ length: q.length }, (_, i) => contiguous + i);
  const out: number[] = [];
  let ti = 0;
  for (const char of q) {
    if (char === " ") continue;
    let found = -1;
    // Prefer the next word start carrying this character.
    for (let i = ti; i < t.length; i += 1) {
      if (t[i] === char && (i === 0 || /[\s·:/(-]/.test(t[i - 1]!))) { found = i; break; }
    }
    if (found < 0) found = t.indexOf(char, ti);
    if (found < 0) return [];
    out.push(found);
    ti = found + 1;
  }
  return out;
}

/**
 * Rank commands against a query, best first. On top of the raw score: an exact
 * label match wins outright, a label that STARTS with the query beats one that
 * merely contains it, and navigation beats action on an otherwise equal score.
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
/*  Shortcuts                                                                  */
/* -------------------------------------------------------------------------- */

export interface ShortcutGroup {
  title: string;
  items: ReadonlyArray<[string, string]>;
}

/** Every shortcut, grouped the way the help dialog shows them. */
export const SHORTCUT_GROUPS: ReadonlyArray<ShortcutGroup> = [
  {
    title: "Anywhere on the page",
    items: [
      ["Shift Alt D", "Show or hide DevTools"],
      ["Shift Alt C", "Pick an element to inspect"],
      ["Shift Alt K", "Open the command palette"],
    ],
  },
  {
    title: "In the panel",
    items: [
      ["⌘/Ctrl K", "Command palette"],
      ["Alt 1…9", "Jump to a section"],
      ["Alt [  Alt ]", "Previous / next section"],
      ["/", "Focus the view's search"],
      ["?", "This list"],
      ["Esc", "Close a menu or dialog, cancel the picker or an edit"],
    ],
  },
  {
    title: "Lists and trees",
    items: [
      ["↑ ↓", "Move the selection"],
      ["← →", "Collapse / expand"],
      ["Enter", "Edit the value · open the detail"],
      ["Home End", "First / last row"],
    ],
  },
  {
    title: "Element picker",
    items: [
      ["↑ ↓", "Walk to the parent / back to the child"],
      ["Alt wheel", "Same, with the mouse"],
      ["Enter", "Select the highlighted element"],
    ],
  },
  {
    title: "Charts",
    items: [
      ["Wheel", "Zoom around the pointer"],
      ["Shift wheel  Drag", "Pan"],
      ["Shift drag", "Select a time range (Timeline)"],
      ["Double-click", "Zoom to a span / reset"],
      ["← →", "Previous / next commit"],
    ],
  },
  {
    title: "Editors",
    items: [
      ["Enter", "Commit an inline edit"],
      ["⌘/Ctrl Enter", "Apply a program edit"],
      ["Tab  Shift Tab", "Indent / outdent"],
      ["↑ ↓", "REPL history"],
    ],
  },
];

/** Flat list of `[keys, what]`, for callers of the protocol-2 export. */
export const SHORTCUTS: ReadonlyArray<[string, string]> = SHORTCUT_GROUPS.flatMap((group) => group.items);

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function highlighted(text: string, query: string): Child {
  const positions = new Set(fuzzyPositions(query, text));
  if (positions.size === 0) return text;
  const out: Child[] = [];
  let run = "";
  let marked = false;
  for (let i = 0; i < text.length; i += 1) {
    const hit = positions.has(i);
    if (hit !== marked && run) {
      out.push(marked ? h("mark", {}, run) : run);
      run = "";
    }
    marked = hit;
    run += text[i];
  }
  if (run) out.push(marked ? h("mark", {}, run) : run);
  return out;
}

export interface PaletteViewOptions {
  query: string;
  index: number;
  commands: ReadonlyArray<Command>;
  onQuery(query: string): void;
  onIndex(index: number): void;
  onRun(command: Command): void;
  onClose(): void;
}

const ROW_HEIGHT = 36;

/** The palette dialog. The caller ranks nothing — this does. */
export function paletteView(options: PaletteViewOptions): VNode {
  const ranked = rankCommands(options.commands, options.query).slice(0, 300);
  const index = Math.max(0, Math.min(options.index, ranked.length - 1));
  const run = (command: Command | undefined): void => {
    if (command) options.onRun(command);
  };
  return h(
    "div",
    {
      class: "scrim",
      "data-dt": "palette",
      onPointerDown: (event: PointerEvent) => {
        if (event.target === event.currentTarget) options.onClose();
      },
    },
    h(
      "div",
      { class: "palette", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" },
      h(
        "div",
        { class: "palette-input" },
        icon("search", { size: 16 }),
        h("input", {
          "data-dt": "palette-input",
          value: options.query,
          placeholder: "Search sections, actions, components, state, routes…",
          "aria-label": "Command",
          "aria-controls": "dt-palette-list",
          "aria-activedescendant": ranked[index] ? `pal-${ranked[index]!.id}` : undefined,
          role: "combobox",
          "aria-expanded": true,
          spellcheck: "false",
          autocomplete: "off",
          ref: autofocus({ select: true }),
          onInput: (event: Event) => options.onQuery((event.target as HTMLInputElement).value),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "ArrowDown") { event.preventDefault(); options.onIndex(Math.min(ranked.length - 1, index + 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); options.onIndex(Math.max(0, index - 1)); }
            else if (event.key === "PageDown") { event.preventDefault(); options.onIndex(Math.min(ranked.length - 1, index + 8)); }
            else if (event.key === "PageUp") { event.preventDefault(); options.onIndex(Math.max(0, index - 8)); }
            else if (event.key === "Enter") { event.preventDefault(); run(ranked[index]); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); options.onClose(); }
          },
        }),
        h("span", { class: "kbd" }, "esc"),
      ),
      ranked.length === 0
        ? h("div", { class: "palette-empty" }, `Nothing matches “${options.query}”.`)
        : h("div", { class: "palette-list", id: "dt-palette-list", role: "listbox", style: { height: `${Math.min(ranked.length, 11) * ROW_HEIGHT + 12}px` } },
            virtualList({
              items: ranked,
              rowHeight: ROW_HEIGHT,
              rowKey: (command) => command.id,
              version: [options.query, index],
              scrollTo: index,
              renderRow: (command, i) => h(
                "button",
                {
                  type: "button",
                  id: `pal-${command.id}`,
                  role: "option",
                  "aria-selected": i === index,
                  class: ["palette-item", i === index ? "is-active" : ""],
                  "data-dt": `palette-item`,
                  "data-command": command.id,
                  onMouseMove: () => { if (i !== index) options.onIndex(i); },
                  onClick: () => run(command),
                },
                h("span", { class: "pi-icon" }, icon(command.icon ?? "arrowRight", { size: 13 })),
                h("span", { class: "pi-label" }, highlighted(command.label, options.query)),
                h("span", { class: "pi-group" }, command.group),
                command.hint ? h("span", { class: "kbd" }, command.hint) : null,
              ),
            })),
      h(
        "div",
        { class: "palette-foot" },
        h("span", {}, h("span", { class: "kbd" }, "↑"), h("span", { class: "kbd" }, "↓"), " navigate"),
        h("span", {}, h("span", { class: "kbd" }, "↵"), " run"),
        h("span", {}, h("span", { class: "kbd" }, "esc"), " close"),
        h("span", { class: "grow" }),
        h("span", {}, `${ranked.length} result${ranked.length === 1 ? "" : "s"}`),
      ),
    ),
  );
}
