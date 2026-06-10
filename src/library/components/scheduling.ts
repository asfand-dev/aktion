/**
 * Scheduling components (suggestions-global VIII.6).
 *
 *   Calendar — a Google Calendar-style month grid: Today / prev / next
 *   navigation, full weeks (leading/trailing days from adjacent months),
 *   today shown as a filled circle, and events rendered as colored chips
 *   with a "+N more" overflow (bare ISO strings render as dots).
 *
 * Pairs with the existing `Gantt` for timelines and `DatePicker` for single
 * date input. Bounded + theme-aware, no dependencies. Uses its own
 * `rui-gcal-*` class namespace so it never collides with `CalendarView`.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString, asNumber, asBoolean, renderIcon, sanitiseCssColor } from "../utils.js";

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CHIP_TONES: Record<string, string> = {
  primary: "var(--rui-color-primary)",
  success: "var(--rui-color-success, #10b981)",
  warning: "var(--rui-color-warning, #f59e0b)",
  danger: "var(--rui-color-danger, #ef4444)",
  info: "var(--rui-color-info, #06b6d4)",
};

interface GcalEvent { label: string; color: string; time: string }

interface GcalConfig {
  todayIso: string;
  selected: string;
  chips: Map<string, GcalEvent[]>;
  dots: Map<string, number>;
  firstDay: number;
  navigable: boolean;
  onSelect: unknown;
  onNavigate: unknown;
  selRef: string | undefined;
  helpers: RenderHelpers;
  viewSlot: { get(): GcalView | null; set(v: GcalView): void };
}

interface GcalView { propsYear: number; propsMonth: number; year: number; month: number }

const pad2 = (n: number): string => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number): string => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** Normalise the `events` prop: bare ISO strings → dots, objects → chips. */
function readGcalEvents(raw: unknown): { chips: Map<string, GcalEvent[]>; dots: Map<string, number> } {
  const chips = new Map<string, GcalEvent[]>();
  const dots = new Map<string, number>();
  for (const entry of asArray<unknown>(raw)) {
    if (entry == null) continue;
    if (typeof entry === "string") {
      const key = entry.slice(0, 10);
      if (key) dots.set(key, (dots.get(key) ?? 0) + 1);
      continue;
    }
    if (typeof entry !== "object") continue;
    const e = entry as { date?: unknown; label?: unknown; title?: unknown; color?: unknown; tone?: unknown; time?: unknown };
    const date = asString(e.date).slice(0, 10);
    if (!date) continue;
    const label = asString(e.label ?? e.title);
    if (!label) {
      dots.set(date, (dots.get(date) ?? 0) + 1);
      continue;
    }
    const colorRaw = asString(e.color ?? e.tone, "primary");
    const color = CHIP_TONES[colorRaw] ?? sanitiseCssColor(colorRaw) ?? CHIP_TONES.primary!;
    const list = chips.get(date) ?? [];
    list.push({ label, color, time: asString(e.time) });
    chips.set(date, list);
  }
  return { chips, dots };
}

/**
 * (Re)build the calendar UI into `root` for the given view month. Pure DOM
 * construction — render passes the freshly created root; the toolbar's nav
 * handlers call it again on the LIVE root (resolved via `currentTarget`)
 * since navigating doesn't go through the reactive render loop.
 */
function buildCalendarInto(root: HTMLElement, year: number, month: number, cfg: GcalConfig): void {
  const liveRootOf = (event: Event): HTMLElement =>
    (((event.currentTarget ?? event.target) as HTMLElement | null)?.closest(".rui-gcal") as HTMLElement | null) ?? root;
  const navigateTo = (event: Event, y: number, m: number): void => {
    const live = liveRootOf(event);
    const prev = cfg.viewSlot.get();
    cfg.viewSlot.set({
      propsYear: prev?.propsYear ?? y,
      propsMonth: prev?.propsMonth ?? m,
      year: y,
      month: m,
    });
    buildCalendarInto(live, y, m, cfg);
    cfg.helpers.invoke(cfg.onNavigate, y, m);
  };
  // Page relative to the slot's CURRENT view (not this build's month) so a
  // handler that outlived its build still navigates from where the user is.
  const navigateBy = (event: Event, delta: number): void => {
    const current = cfg.viewSlot.get();
    const baseYear = current?.year ?? year;
    const baseMonth = current?.month ?? month;
    const shifted = new Date(baseYear, baseMonth + delta, 1);
    navigateTo(event, shifted.getFullYear(), shifted.getMonth());
  };

  const toolbar = el("div", { class: "rui-gcal-toolbar" });
  if (cfg.navigable) {
    const todayBtn = el("button", { type: "button", class: "rui-gcal-today" }, ["Today"]) as HTMLButtonElement;
    todayBtn.onclick = (event: Event) => {
      const now = new Date();
      navigateTo(event, now.getFullYear(), now.getMonth());
    };
    const prevBtn = el("button", { type: "button", class: "rui-gcal-nav", "data-dir": "prev", "aria-label": "Previous month" }) as HTMLButtonElement;
    const prevIcon = renderIcon("chevron-left");
    if (prevIcon) prevBtn.append(prevIcon); else prevBtn.textContent = "‹";
    prevBtn.onclick = (event: Event) => navigateBy(event, -1);
    const nextBtn = el("button", { type: "button", class: "rui-gcal-nav", "data-dir": "next", "aria-label": "Next month" }) as HTMLButtonElement;
    const nextIcon = renderIcon("chevron-right");
    if (nextIcon) nextBtn.append(nextIcon); else nextBtn.textContent = "›";
    nextBtn.onclick = (event: Event) => navigateBy(event, 1);
    toolbar.append(todayBtn, prevBtn, nextBtn);
  }
  toolbar.append(el("span", { class: "rui-gcal-title" }, [`${MONTH_NAMES[month]} ${year}`]));

  const grid = el("div", { class: "rui-gcal-grid", role: "grid" });
  for (let i = 0; i < 7; i += 1) {
    grid.append(el("div", { class: "rui-gcal-weekday", role: "columnheader" }, [WEEKDAY_LABELS[(cfg.firstDay + i) % 7]!]));
  }
  // Keyboard navigation (X.3): arrows move a week/day at a time, Home/End
  // jump within the row. Enter/Space activate natively (cells are buttons).
  grid.onkeydown = (event: KeyboardEvent) => {
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
    const live = liveRootOf(event);
    const days = Array.from(live.querySelectorAll<HTMLElement>(".rui-gcal-day"));
    const doc = live.getRootNode() as Document | ShadowRoot;
    const idx = days.indexOf(doc.activeElement as HTMLElement);
    if (idx < 0) return;
    let next = idx;
    if (key === "ArrowLeft") next = idx - 1;
    else if (key === "ArrowRight") next = idx + 1;
    else if (key === "ArrowUp") next = idx - 7;
    else if (key === "ArrowDown") next = idx + 7;
    else if (key === "Home") next = idx - (idx % 7);
    else if (key === "End") next = idx - (idx % 7) + 6;
    if (next < 0 || next >= days.length) return;
    event.preventDefault();
    days[next]?.focus();
  };

  // Full weeks, Google-style: pad with the previous month's tail and the
  // next month's head so every row holds seven real, clickable days.
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (firstOfMonth.getDay() - cfg.firstDay + 7) % 7;
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const start = new Date(year, month, 1 - lead);

  for (let i = 0; i < totalCells; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoOf(date.getFullYear(), date.getMonth(), date.getDate());
    const inMonth = date.getMonth() === month;
    const cell = el("button", {
      type: "button",
      class: "rui-gcal-day",
      role: "gridcell",
      "data-in-month": inMonth ? "true" : "false",
      "data-today": iso === cfg.todayIso ? "true" : null,
      "data-selected": cfg.selected && iso === cfg.selected ? "true" : null,
      "data-iso": iso,
      // Human-readable for screen readers ("June 10, 2026", not the ISO).
      "aria-label": `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
      "aria-pressed": cfg.selected && iso === cfg.selected ? "true" : "false",
    }) as HTMLButtonElement;
    cell.append(el("span", { class: "rui-gcal-daynum" }, [String(date.getDate())]));

    const chipEvents = cfg.chips.get(iso) ?? [];
    const dotCount = cfg.dots.get(iso) ?? 0;
    if (chipEvents.length > 0 || dotCount > 0) {
      const eventsEl = el("div", { class: "rui-gcal-events" });
      const visible = chipEvents.slice(0, 2);
      for (const evt of visible) {
        eventsEl.append(el("span", {
          class: "rui-gcal-chip",
          style: `--rui-gcal-chip:${evt.color}`,
          title: evt.time ? `${evt.time} — ${evt.label}` : evt.label,
        }, [evt.time ? `${evt.time} ${evt.label}` : evt.label]));
      }
      if (dotCount > 0) {
        const dotsEl = el("div", { class: "rui-gcal-dots" });
        for (let d = 0; d < Math.min(3, dotCount); d += 1) dotsEl.append(el("span", { class: "rui-gcal-dot" }));
        eventsEl.append(dotsEl);
      }
      const hidden = chipEvents.length - visible.length;
      if (hidden > 0) eventsEl.append(el("span", { class: "rui-gcal-more" }, [`+${hidden} more`]));
      cell.append(eventsEl);
    }

    cell.onclick = (event: Event) => {
      const live = liveRootOf(event);
      // Instant visual feedback; a bound `selected` re-render confirms it.
      for (const sel of live.querySelectorAll('.rui-gcal-day[data-selected="true"]')) {
        sel.removeAttribute("data-selected");
        sel.setAttribute("aria-pressed", "false");
      }
      const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
      const liveCell = origin?.closest?.(".rui-gcal-day") as HTMLElement | null;
      liveCell?.setAttribute("data-selected", "true");
      liveCell?.setAttribute("aria-pressed", "true");
      if (cfg.selRef) cfg.helpers.setState(cfg.selRef, iso);
      cfg.helpers.invoke(cfg.onSelect, iso);
    };
    grid.append(cell);
  }

  root.replaceChildren(toolbar, grid);
}

export const Calendar: ComponentSpec = {
  name: "Calendar",
  description:
    "A Google Calendar-style month grid with Today/prev/next navigation. " +
    "`month` (0–11) and `year` set the view (default current month); " +
    "`selected` is an ISO date (YYYY-MM-DD) to highlight — bind a $variable " +
    "for two-way selection; `onSelect(iso)` fires on a day click. `events` " +
    "mixes bare ISO strings (rendered as dots) and `{date, label, color?, " +
    "time?}` objects (rendered as colored chips with a '+N more' overflow; " +
    "`color` is a tone name or CSS color). `onNavigate(year, month)` fires " +
    "when the user pages months; `navigable=false` hides the toolbar " +
    "buttons. Use for schedules, bookings, and availability calendars.",
  props: [
    { name: "month", type: "number", optional: true, description: "0–11 (default current month)" },
    { name: "year", type: "number", optional: true, description: "Full year (default current)" },
    { name: "selected", type: "string", optional: true, description: "ISO date to highlight; bind a $variable" },
    { name: "onSelect", type: "callable", optional: true, description: "(isoDate) => …" },
    { name: "events", type: "any[]", optional: true, description: "ISO strings (dots) and/or {date, label, color?, time?} chips" },
    { name: "firstDay", type: "number", optional: true, description: "0=Sunday (default), 1=Monday" },
    { name: "navigable", type: "boolean", optional: true, description: "Show Today/prev/next controls (default true)" },
    { name: "onNavigate", type: "callable", optional: true, description: "(year, month) => … after paging" },
  ],
  render: (node, props, helpers) => {
    const now = new Date();
    const hasMonth = props.month !== undefined && Number.isFinite(Number(props.month));
    const hasYear = props.year !== undefined && Number.isFinite(Number(props.year));
    const propsMonth = hasMonth ? Math.max(0, Math.min(11, Math.floor(asNumber(props.month, now.getMonth())))) : now.getMonth();
    const propsYear = hasYear ? Math.floor(asNumber(props.year, now.getFullYear())) : now.getFullYear();

    // The view the user navigated to survives re-renders via an instance
    // slot; an author-driven `month`/`year` change snaps the view back.
    const viewSlot = helpers.useInstanceState<GcalView | null>("rui-gcal-view", null);
    const stored = viewSlot.get();
    const followProps = !stored || stored.propsYear !== propsYear || stored.propsMonth !== propsMonth;
    const view = followProps
      ? { propsYear, propsMonth, year: propsYear, month: propsMonth }
      : stored;
    viewSlot.set(view);

    const { chips, dots } = readGcalEvents(props.events);
    const cfg: GcalConfig = {
      todayIso: isoOf(now.getFullYear(), now.getMonth(), now.getDate()),
      selected: asString(props.selected),
      chips,
      dots,
      firstDay: ((Math.round(asNumber(props.firstDay, 0)) % 7) + 7) % 7,
      navigable: props.navigable === undefined ? true : asBoolean(props.navigable),
      onSelect: props.onSelect,
      onNavigate: props.onNavigate,
      selRef: node.argMeta?.[2]?.stateRef,
      helpers,
      viewSlot,
    };

    const root = el("div", { class: "rui-gcal" });
    buildCalendarInto(root, view.year, view.month, cfg);
    return root;
  },
};
