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
 *
 * The grid is a real ARIA grid: each week of seven cells is wrapped in a
 * `role="row"` (laid out with `display: contents`, so the CSS grid still owns
 * the columns), and exactly one cell is in the tab order at a time.
 */

import type { ComponentSpec, InstanceStateSlot, RenderHelpers } from "../types.js";
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

interface GcalEvent { label: string; color: string; time: string; raw: unknown }

interface GcalConfig {
  todayIso: string;
  selected: string;
  /** The `selected` prop this build started from (the instance slot's stamp). */
  propSelected: string;
  chips: Map<string, GcalEvent[]>;
  dots: Map<string, number>;
  firstDay: number;
  navigable: boolean;
  minIso: string;
  maxIso: string;
  blocked: Set<string>;
  weekdays: string[];
  months: string[];
  dayLabel: (date: Date) => string;
  onSelect: unknown;
  onNavigate: unknown;
  onEventClick: unknown;
  selRef: string | undefined;
  helpers: RenderHelpers;
  viewSlot: InstanceStateSlot<GcalView | null>;
  /** Selection kept per-instance when `selected` is not $-bound. */
  selSlot: InstanceStateSlot<{ prop: string; value: string } | null>;
  /** The day cell that owns the single tab stop. */
  activeSlot: InstanceStateSlot<string | null>;
}

interface GcalView { propsYear: number; propsMonth: number; year: number; month: number }

const pad2 = (n: number): string => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number): string => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const isoDay = (raw: unknown): string => asString(raw).slice(0, 10);

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
    // `raw` is handed back to `onEventClick` so the author can open the event
    // they actually passed in, not a reconstruction of it.
    list.push({ label, color, time: asString(e.time), raw: entry });
    chips.set(date, list);
  }
  return { chips, dots };
}

/**
 * Weekday / month names for the calendar. `locale` drives `Intl`; explicit
 * `weekdayLabels` / `monthLabels` win over both so an app can ship its own
 * translations without depending on the runtime's ICU data.
 */
function resolveLabels(
  locale: string,
  weekdayLabels: unknown,
  monthLabels: unknown,
): { weekdays: string[]; months: string[] } {
  let weekdays = WEEKDAY_LABELS.slice();
  let months = MONTH_NAMES.slice();
  if (locale && typeof Intl !== "undefined") {
    try {
      // 1970-01-04 was a Sunday, so index 0 stays Sunday like the constants.
      const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
      weekdays = Array.from({ length: 7 }, (_unused, i) =>
        wd.format(new Date(Date.UTC(1970, 0, 4 + i))).toUpperCase());
      const mo = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
      months = Array.from({ length: 12 }, (_unused, i) => mo.format(new Date(Date.UTC(2021, i, 15))));
    } catch {
      /* unknown locale / no ICU data — keep the English defaults. */
    }
  }
  const wdOverride = asArray<unknown>(weekdayLabels).map((v) => asString(v)).filter(Boolean);
  if (wdOverride.length === 7) weekdays = wdOverride;
  const moOverride = asArray<unknown>(monthLabels).map((v) => asString(v)).filter(Boolean);
  if (moOverride.length === 12) months = moOverride;
  return { weekdays, months };
}

/** `true` when a day is outside the window or explicitly blacked out. */
function isBlocked(cfg: GcalConfig, iso: string): boolean {
  // ISO dates compare correctly as strings.
  if (cfg.minIso && iso < cfg.minIso) return true;
  if (cfg.maxIso && iso > cfg.maxIso) return true;
  return cfg.blocked.has(iso);
}

/**
 * Remember what has focus inside the calendar as a selector, so a rebuild can
 * put it back. Paging months replaces the whole subtree — including the very
 * button the user pressed — which otherwise dumps focus on `<body>` and leaves
 * a keyboard user unable to advance a second month.
 */
function captureFocus(root: HTMLElement): string | null {
  const scope = root.getRootNode() as Document | ShadowRoot;
  const active = scope.activeElement as HTMLElement | null;
  if (!active || !root.contains(active)) return null;
  if (active.classList.contains("rui-gcal-today")) return ".rui-gcal-today";
  const dir = active.getAttribute("data-dir");
  if (dir) return `.rui-gcal-nav[data-dir="${dir}"]`;
  const iso = active.closest(".rui-gcal-day")?.getAttribute("data-iso");
  return iso ? `.rui-gcal-day[data-iso="${iso}"]` : null;
}

function restoreFocus(root: HTMLElement, selector: string | null): void {
  if (!selector) return;
  const target = root.querySelector<HTMLElement>(selector)
    // The focused day may not exist in the new month — land on a usable cell
    // rather than dropping focus to the document.
    ?? (selector.startsWith(".rui-gcal-day")
      ? root.querySelector<HTMLElement>('.rui-gcal-day[tabindex="0"]')
      : null);
  target?.focus();
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

  const title = `${cfg.months[month] ?? MONTH_NAMES[month]} ${year}`;
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
  toolbar.append(el("span", { class: "rui-gcal-title" }, [title]));

  const grid = el("div", { class: "rui-gcal-grid", role: "grid", "aria-label": title });
  // `role="grid"` with bare gridcells is a structurally invalid grid: no
  // row/column position is conveyed and the columnheaders associate with
  // nothing. Rows are `display: contents` so the 7-column CSS grid is intact.
  const headRow = el("div", { class: "rui-gcal-row rui-gcal-head", role: "row", style: "display:contents" });
  for (let i = 0; i < 7; i += 1) {
    headRow.append(el("div", { class: "rui-gcal-weekday", role: "columnheader" }, [cfg.weekdays[(cfg.firstDay + i) % 7]!]));
  }
  grid.append(headRow);

  // Keyboard navigation (X.3): arrows move a week/day at a time, Home/End
  // jump within the row. Enter/Space activate natively (cells are buttons).
  grid.onkeydown = (event: KeyboardEvent) => {
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
    const live = liveRootOf(event);
    const days = Array.from(live.querySelectorAll<HTMLButtonElement>(".rui-gcal-day"));
    const doc = live.getRootNode() as Document | ShadowRoot;
    const idx = days.indexOf(doc.activeElement as HTMLButtonElement);
    if (idx < 0) return;
    // Step past unselectable days instead of stalling on them.
    const seek = (from: number, step: number): number => {
      for (let i = from; i >= 0 && i < days.length; i += step) {
        if (!days[i]!.disabled) return i;
      }
      return -1;
    };
    let next = -1;
    if (key === "ArrowLeft") next = seek(idx - 1, -1);
    else if (key === "ArrowRight") next = seek(idx + 1, 1);
    else if (key === "ArrowUp") next = seek(idx - 7, -7);
    else if (key === "ArrowDown") next = seek(idx + 7, 7);
    else if (key === "Home") next = seek(idx - (idx % 7), 1);
    else if (key === "End") next = seek(idx - (idx % 7) + 6, -1);
    const target = next >= 0 ? days[next] : undefined;
    if (!target) return;
    event.preventDefault();
    // Move the single tab stop with the focus, and remember it so the next
    // render (or month rebuild) puts the tab stop back where the user left it.
    for (const day of days) day.setAttribute("tabindex", "-1");
    target.setAttribute("tabindex", "0");
    cfg.activeSlot.set(target.getAttribute("data-iso"));
    target.focus();
  };

  // Full weeks, Google-style: pad with the previous month's tail and the
  // next month's head so every row holds seven real, clickable days.
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (firstOfMonth.getDay() - cfg.firstDay + 7) % 7;
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const start = new Date(year, month, 1 - lead);
  const cells: HTMLButtonElement[] = [];
  let week: HTMLElement | null = null;

  for (let i = 0; i < totalCells; i += 1) {
    if (i % 7 === 0) {
      week = el("div", { class: "rui-gcal-row", role: "row", style: "display:contents" });
      grid.append(week);
    }
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoOf(date.getFullYear(), date.getMonth(), date.getDate());
    const inMonth = date.getMonth() === month;
    const isSelected = Boolean(cfg.selected) && iso === cfg.selected;
    const blocked = isBlocked(cfg, iso);
    const cell = el("button", {
      type: "button",
      class: "rui-gcal-day",
      role: "gridcell",
      "data-in-month": inMonth ? "true" : "false",
      "data-today": iso === cfg.todayIso ? "true" : null,
      "data-selected": isSelected ? "true" : null,
      "data-iso": iso,
      // Human-readable for screen readers ("June 10, 2026", not the ISO).
      "aria-label": cfg.dayLabel(date),
      // `aria-pressed` is not permitted on `role="gridcell"`; selection state
      // belongs in `aria-selected`.
      "aria-selected": isSelected ? "true" : "false",
      // Roving tabindex — the active cell is chosen after the loop, so every
      // cell starts out of the tab order instead of adding 42 tab stops.
      tabindex: "-1",
      disabled: blocked ? "" : null,
      "data-disabled": blocked ? "true" : null,
    }) as HTMLButtonElement;
    cell.append(el("span", { class: "rui-gcal-daynum" }, [String(date.getDate())]));

    const chipEvents = cfg.chips.get(iso) ?? [];
    const dotCount = cfg.dots.get(iso) ?? 0;
    if (chipEvents.length > 0 || dotCount > 0) {
      const eventsEl = el("div", { class: "rui-gcal-events" });
      const visible = chipEvents.slice(0, 2);
      for (const evt of visible) {
        const chip = el("span", {
          class: "rui-gcal-chip",
          style: `--rui-gcal-chip:${evt.color}`,
          title: evt.time ? `${evt.time} — ${evt.label}` : evt.label,
          "data-clickable": cfg.onEventClick != null ? "true" : null,
        }, [evt.time ? `${evt.time} ${evt.label}` : evt.label]);
        if (cfg.onEventClick != null) {
          chip.onclick = (event: Event) => {
            // Opening the event must not also select the day underneath it.
            event.stopPropagation();
            cfg.helpers.invoke(cfg.onEventClick, evt.raw, iso);
          };
        }
        eventsEl.append(chip);
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

    if (!blocked) {
      cell.onclick = (event: Event) => {
        const live = liveRootOf(event);
        // Instant visual feedback; the fresh render confirms it from either the
        // bound $variable or the instance slot written below.
        for (const sel of live.querySelectorAll('.rui-gcal-day[data-selected="true"]')) {
          sel.removeAttribute("data-selected");
          sel.setAttribute("aria-selected", "false");
        }
        const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
        const liveCell = origin?.closest?.(".rui-gcal-day") as HTMLElement | null;
        liveCell?.setAttribute("data-selected", "true");
        liveCell?.setAttribute("aria-selected", "true");
        // Keep the config in step so paging months re-renders the highlight.
        cfg.selected = iso;
        cfg.activeSlot.set(iso);
        if (cfg.selRef) cfg.helpers.setState(cfg.selRef, iso);
        // No $-binding: without this the next unrelated commit re-rendered a
        // tree with no `data-selected`, and morph stripped the highlight while
        // the app's own state still held the day.
        else cfg.selSlot.set({ prop: cfg.propSelected, value: iso });
        cfg.helpers.invoke(cfg.onSelect, iso);
      };
    }
    (week ?? grid).append(cell);
    cells.push(cell);
  }

  // Exactly one cell in the tab order: where the user last was, else the
  // selection, else today, else the first selectable day of the month.
  const preferred = [cfg.activeSlot.get() ?? "", cfg.selected, cfg.todayIso].filter(Boolean);
  let active: HTMLButtonElement | undefined;
  for (const iso of preferred) {
    active = cells.find((cell) => cell.getAttribute("data-iso") === iso && !cell.disabled);
    if (active) break;
  }
  active ??= cells.find((cell) => !cell.disabled && cell.getAttribute("data-in-month") === "true")
    ?? cells.find((cell) => !cell.disabled);
  active?.setAttribute("tabindex", "0");

  const focused = captureFocus(root);
  root.replaceChildren(toolbar, grid);
  restoreFocus(root, focused);
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
    "`color` is a tone name or CSS color); `onEventClick(event, iso)` fires " +
    "when a chip is clicked. `minDate`/`maxDate`/`disabledDates` block days " +
    "from being selected at all (booking windows, blackout days). " +
    "`onNavigate(year, month)` fires when the user pages months; " +
    "`navigable=false` hides the toolbar buttons; `locale` (or " +
    "`weekdayLabels`/`monthLabels`) localises the names. Use for schedules, " +
    "bookings, and availability calendars.",
  props: [
    { name: "month", type: "number", optional: true, description: "0–11 (default current month)" },
    { name: "year", type: "number", optional: true, description: "Full year (default current)" },
    { name: "selected", type: "string", optional: true, description: "ISO date to highlight; bind a $variable" },
    { name: "onSelect", type: "callable", optional: true, description: "(isoDate) => …" },
    { name: "events", type: "any[]", optional: true, description: "ISO strings (dots) and/or {date, label, color?, time?} chips" },
    { name: "firstDay", type: "number", optional: true, description: "0=Sunday (default), 1=Monday" },
    { name: "navigable", type: "boolean", optional: true, description: "Show Today/prev/next controls (default true)" },
    { name: "onNavigate", type: "callable", optional: true, description: "(year, month) => … after paging" },
    { name: "minDate", type: "string", optional: true, description: "ISO date — earlier days are not selectable (e.g. no past bookings)" },
    { name: "maxDate", type: "string", optional: true, description: "ISO date — later days are not selectable (e.g. a 90-day horizon)" },
    { name: "disabledDates", type: "any[]", optional: true, aliases: ["blackoutDates"], description: "ISO dates that cannot be selected (holidays, fully-booked days)" },
    { name: "onEventClick", type: "callable", optional: true, description: "(event, isoDate) => … when an event chip is clicked (the day cell still handles keyboard selection)" },
    { name: "locale", type: "string", optional: true, description: "BCP 47 tag for the weekday/month/day names (e.g. `de-DE`)" },
    { name: "weekdayLabels", type: "any[]", optional: true, description: "Exactly 7 labels, Sunday first — overrides `locale`" },
    { name: "monthLabels", type: "any[]", optional: true, description: "Exactly 12 month names — overrides `locale`" },
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

    // `selected` is authoritative when it is $-bound; otherwise the user's
    // click lives in an instance slot (stamped with the prop it started from,
    // so an author-driven change still wins).
    const selRef = node.argMeta?.[2]?.stateRef;
    const propSelected = asString(props.selected);
    const selSlot = helpers.useInstanceState<{ prop: string; value: string } | null>("rui-gcal-selected", null);
    const storedSel = selSlot.get();
    const followSel = !storedSel || storedSel.prop !== propSelected;
    if (!selRef && followSel) selSlot.set({ prop: propSelected, value: propSelected });
    const selected = selRef || followSel ? propSelected : storedSel!.value;

    const { chips, dots } = readGcalEvents(props.events);
    const { weekdays, months } = resolveLabels(asString(props.locale), props.weekdayLabels, props.monthLabels);
    const locale = asString(props.locale);
    const cfg: GcalConfig = {
      todayIso: isoOf(now.getFullYear(), now.getMonth(), now.getDate()),
      selected,
      propSelected,
      chips,
      dots,
      firstDay: ((Math.round(asNumber(props.firstDay, 0)) % 7) + 7) % 7,
      navigable: props.navigable === undefined ? true : asBoolean(props.navigable),
      minIso: isoDay(props.minDate),
      maxIso: isoDay(props.maxDate),
      blocked: new Set(asArray<unknown>(props.disabledDates).map(isoDay).filter(Boolean)),
      weekdays,
      months,
      dayLabel: (date: Date): string => {
        if (locale && typeof Intl !== "undefined") {
          try {
            return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
          } catch { /* fall through to the label arrays */ }
        }
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
      },
      onSelect: props.onSelect,
      onNavigate: props.onNavigate,
      onEventClick: props.onEventClick,
      selRef,
      helpers,
      viewSlot,
      selSlot,
      activeSlot: helpers.useInstanceState<string | null>("rui-gcal-active", null),
    };

    const root = el("div", { class: "rui-gcal" });
    buildCalendarInto(root, view.year, view.month, cfg);
    return root;
  },
};
