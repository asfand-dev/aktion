/**
 * Advanced pattern composites that round out the catalogue:
 *
 *   - InboxPanel — Grouped notification card list (read / unread).
 *   - OnboardingChecklist — Step-by-step product checklist.
 *   - LoadingState / ErrorState / SuccessState — Full-card status panels.
 *   - Tour / Spotlight — Light-weight product-tour primitives.
 *   - Sticky / Affix — Pin a child to the top while scrolling.
 *   - ResizablePanels — Two-pane drag-to-resize split.
 *   - MasonryGrid — Pinterest-style column grid.
 *   - TopBar — Convenience composite.
 *   - Drawer — Side-panel overlay (detail views, filters, previews).
 */

import type { ComponentSpec, InstanceStateSlot, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssLength, SPACING_TOKENS, normalizeSpacingToken,
  readResponsiveProp, RESPONSIVE_BREAKPOINTS,
} from "../utils.js";
import { deferToPaint } from "../floating.js";
import { dialogKeydownHandler, wireDialogFocus } from "./_internal.js";
import { Notification } from "./patterns.js";

/** Minimal helper surface for the deferred, post-paint wiring below. */
interface DisposerHelpers {
  registerDisposer: (cleanup: () => void, key?: string) => void;
}

let labelIdSeq = 0;

/**
 * A per-instance id for an overlay's `aria-labelledby` target.
 *
 * These dialogs used to share one module-level literal, so two Drawers on a
 * page (filters + detail) both emitted `id="rui-drawer-label"`.
 * `aria-labelledby` resolves to the FIRST match, so the second drawer
 * announced the first one's title. Duplicate ids also collide in the morph
 * reconciler, which keys children by id.
 */
function instanceLabelId(helpers: RenderHelpers, key: string, prefix: string): string {
  const slot = helpers.useInstanceState<string>(key, "");
  if (!slot.get()) slot.set(`${prefix}-${(labelIdSeq += 1)}`);
  return slot.get();
}

/* ----------------------------------------------------------------------- *
 * InboxPanel
 * ----------------------------------------------------------------------- */

interface InboxEntry {
  title: string;
  message: string;
  time: string;
  icon: string;
  tone: string;
  unread: boolean;
  avatarSrc: string;
  onClick: unknown;
  actions: unknown;
}

function readInboxEntries(raw: unknown): InboxEntry[] {
  return asArray<unknown>(raw)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      return {
        title: asString(r.title),
        message: asString(r.message),
        time: asString(r.time),
        icon: asString(r.icon),
        tone: asString(r.tone, "default"),
        unread: asBoolean(r.unread),
        avatarSrc: asString(r.avatarSrc),
        onClick: r.onClick ?? r.action,
        actions: r.actions,
      };
    })
    .filter((e): e is InboxEntry => e !== null);
}

/** Interactive descendants own their own clicks — a row press must not double-fire. */
const INTERACTIVE_CHILD = "input,button,a,label,select,textarea";

export const InboxPanel: ComponentSpec = {
  name: "InboxPanel",
  description:
    "Grouped notification list — entries are grouped into Unread/Earlier " +
    "sections, with a count chip on each group header. Pass `items` as " +
    "`{title, message, time, icon?, tone?, unread?, avatarSrc?, onClick?, actions?}` " +
    "objects (`action` is also accepted as an alias for `onClick`; `actions` takes " +
    "Button(...) entries rendered inside the row). Pair with a `SectionHeader` for the panel title (the " +
    "component does not render its own title to avoid duplication). Set " +
    "`loading` while entries are still being fetched so the panel does not " +
    "claim the inbox is empty. Use " +
    "for top-bar notification trays, activity drawers, and alert center " +
    "pages.",
  props: [
    { name: "items", type: "object[]" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when there are no notifications" },
    { name: "onMarkAllRead", type: "callable", optional: true, description: "Callable fired by the \"Mark all as read\" button" },
    { name: "loading", type: "boolean", optional: true, description: "Show a busy placeholder instead of the empty state while entries load" },
    { name: "loadingLabel", type: "string", optional: true, description: "Busy text (default \"Loading…\")" },
    { name: "markAllLabel", type: "string", optional: true, description: "Label of the mark-all button (default \"Mark all as read\")" },
    { name: "unreadLabel", type: "string", optional: true, description: "Unread group heading (default \"Unread\")" },
    { name: "earlierLabel", type: "string", optional: true, description: "Read group heading (default \"Earlier\")" },
  ],
  render: (_node, props, helpers) => {
    const entries = readInboxEntries(props.items);
    const unread = entries.filter((e) => e.unread);
    const read = entries.filter((e) => !e.unread);
    const loading = asBoolean(props.loading);
    const root = el("div", { class: "rui-inbox-panel", "aria-busy": loading ? "true" : null });
    if (typeof props.onMarkAllRead === "function" && unread.length > 0) {
      const toolbar = el("div", { class: "rui-inbox-panel-toolbar" });
      const btn = el("button", { type: "button", class: "rui-inbox-panel-mark-all" }, [
        asString(props.markAllLabel, "Mark all as read"),
      ]);
      btn.onclick = () => helpers.invoke(props.onMarkAllRead);
      toolbar.append(btn);
      root.append(toolbar);
    }
    if (entries.length === 0) {
      // An in-flight fetch must not assert "you're all caught up" — that is a
      // claim the panel cannot make until the request resolves.
      if (loading) {
        const busy = el("div", { class: "rui-inbox-panel-empty rui-inbox-panel-loading", role: "status", "aria-live": "polite" });
        const spinner = el("span", { class: "rui-spinner", "data-size": "md", "data-tone": "primary" });
        spinner.append(el("span", { class: "rui-spinner-ring", "aria-hidden": "true" }));
        busy.append(spinner, el("span", {}, [asString(props.loadingLabel, "Loading…")]));
        root.append(busy);
        return root;
      }
      root.append(el("div", { class: "rui-inbox-panel-empty" }, [asString(props.emptyLabel, "You're all caught up.")]));
      return root;
    }
    const renderGroup = (label: string, items: InboxEntry[]) => {
      if (items.length === 0) return;
      const group = el("section", { class: "rui-inbox-panel-group" });
      const groupHead = el("header", { class: "rui-inbox-panel-group-head" });
      groupHead.append(el("span", { class: "rui-inbox-panel-group-label" }, [label]));
      // The chip is the single source of the count — baking it into the label
      // as well printed "UNREAD (3)" next to a pill reading "3".
      groupHead.append(el("span", { class: "rui-inbox-panel-group-count" }, [String(items.length)]));
      group.append(groupHead);
      for (const entry of items) {
        const card = Notification.render(
          { __kind: "Component", name: "Notification", args: [], argMeta: [] },
          {
            title: entry.title,
            message: entry.message,
            time: entry.time,
            icon: entry.icon,
            tone: entry.tone,
            avatarSrc: entry.avatarSrc,
            unread: entry.unread,
            actions: entry.actions,
          },
          helpers,
        ) as HTMLElement;
        if (typeof entry.onClick === "function") {
          card.setAttribute("data-clickable", "true");
          // A row that only carries `onclick` is mouse-only: give it the
          // button role, a tab stop, and Enter/Space activation.
          card.setAttribute("role", "button");
          card.tabIndex = 0;
          const fire = (event: Event): boolean => {
            const target = event.target as Element | null;
            if (target?.closest(INTERACTIVE_CHILD)) return false;
            helpers.invoke(entry.onClick);
            return true;
          };
          card.onclick = (event) => { fire(event); };
          card.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (fire(event)) event.preventDefault();
          };
        }
        group.append(card);
      }
      root.append(group);
    };
    renderGroup(asString(props.unreadLabel, "Unread"), unread);
    renderGroup(asString(props.earlierLabel, "Earlier"), read);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * OnboardingChecklist
 * ----------------------------------------------------------------------- */

interface ChecklistItem {
  title: string;
  description: string;
  done: boolean;
  onClick: unknown;
  cta: string;
}

function readChecklistItems(raw: unknown): ChecklistItem[] {
  return asArray<unknown>(raw)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      return {
        title: asString(r.title),
        description: asString(r.description),
        done: asBoolean(r.done),
        onClick: r.onClick ?? r.action,
        cta: asString(r.cta),
      };
    })
    .filter((c): c is ChecklistItem => c !== null);
}

export const OnboardingChecklist: ComponentSpec = {
  name: "OnboardingChecklist",
  description:
    "Step-by-step product checklist with completion progress at the top. " +
    "Pass `items` as `{title, description?, done?, onClick?, cta?}` " +
    "objects (`action` is also accepted as an alias). The progress percentage is computed automatically from " +
    "`done`; `onComplete` fires once every step is done. An item's `onClick` " +
    "stays available after it is completed (the button label defaults to " +
    "\"Start\", or \"Review\" for a done step). Use on first-run dashboards, empty workspaces, and " +
    "\"complete your profile\" surfaces.",
  props: [
    { name: "items", type: "object[]" },
    { name: "title", type: "string", optional: true, description: "Heading (default \"Getting started\")" },
    { name: "subtitle", type: "string", optional: true },
    { name: "onDismiss", type: "callable", optional: true, description: "Callable fired by the dismiss (×) button — omit to render no dismiss affordance" },
    { name: "onComplete", type: "callable", optional: true, description: "Callable fired once, when the last remaining step flips to done" },
  ],
  render: (_node, props, helpers) => {
    const items = readChecklistItems(props.items);
    const completed = items.filter((i) => i.done).length;
    const total = Math.max(1, items.length);
    const pct = Math.round((completed / total) * 100);
    const root = el("div", { class: "rui-onboarding-checklist" });
    const head = el("header", { class: "rui-onboarding-checklist-header" });
    const headRow = el("div", { class: "rui-onboarding-checklist-headrow" });
    headRow.append(el("h3", { class: "rui-onboarding-checklist-title" }, [
      asString(props.title, "Getting started"),
    ]));
    if (typeof props.onDismiss === "function") {
      const dismiss = el("button", {
        type: "button",
        class: "rui-onboarding-checklist-dismiss",
        "aria-label": "Dismiss",
      });
      const icon = renderIcon("xmark");
      if (icon) dismiss.append(icon); else dismiss.append(document.createTextNode("×"));
      dismiss.onclick = () => helpers.invoke(props.onDismiss);
      headRow.append(dismiss);
    }
    head.append(headRow);
    const subtitle = asString(props.subtitle);
    if (subtitle) head.append(el("p", { class: "rui-onboarding-checklist-subtitle" }, [subtitle]));
    head.append(el("div", { class: "rui-onboarding-checklist-progress" }, [
      el("div", {
        class: "rui-onboarding-checklist-bar",
        // Without these the completion state is carried only by a CSS width
        // and an aria-hidden icon, i.e. nothing assistive tech can read.
        role: "progressbar",
        "aria-valuenow": String(pct),
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuetext": `${completed} of ${items.length} steps complete`,
      }, [
        el("div", {
          class: "rui-onboarding-checklist-fill",
          style: `width:${pct}%`,
        }),
      ]),
      el("span", { class: "rui-onboarding-checklist-meta" }, [`${completed}/${items.length} complete`]),
    ]));
    root.append(head);
    const list = el("ol", { class: "rui-onboarding-checklist-list" });
    for (const item of items) {
      const li = el("li", {
        class: "rui-onboarding-checklist-item",
        "data-done": item.done ? "true" : "false",
      });
      const marker = el("span", { class: "rui-onboarding-checklist-marker" });
      const iconNode = renderIcon(item.done ? "circle-check" : "circle", { className: "rui-onboarding-checklist-marker-icon" });
      if (iconNode) marker.append(iconNode);
      // The icon is aria-hidden and the line-through is CSS, so the done state
      // needs a text equivalent.
      marker.append(el("span", { class: "rui-visually-hidden" }, [item.done ? "Completed" : "Not completed"]));
      li.append(marker);
      const body = el("div", { class: "rui-onboarding-checklist-body" });
      body.append(el("div", { class: "rui-onboarding-checklist-item-title" }, [item.title]));
      if (item.description) body.append(el("p", { class: "rui-onboarding-checklist-item-description" }, [item.description]));
      li.append(body);
      // A completed step keeps its action — "review / edit what I already did"
      // is a normal request, and silently dropping the author's onClick was not.
      if (typeof item.onClick === "function") {
        const btn = el("button", {
          type: "button",
          class: "rui-button",
          "data-variant": "secondary",
          "data-size": "sm",
        }, [item.cta || (item.done ? "Review" : "Start")]);
        btn.onclick = () => helpers.invoke(item.onClick);
        li.append(btn);
      }
      list.append(li);
    }
    root.append(list);
    const completeSlot = helpers.useInstanceState<boolean>("completed", false);
    const allDone = items.length > 0 && completed === items.length;
    if (!allDone) {
      completeSlot.set(false); // re-arm if a step is re-opened
    } else if (!completeSlot.get()) {
      completeSlot.set(true);
      // Deferred so the callback's state writes do not re-enter this render.
      // Deliberately not gated on `root.isConnected`: the render that flips
      // the last step is usually the snapshot morph discards, so the mounted
      // node is a different element by the time this runs.
      deferToPaint(() => helpers.invoke(props.onComplete));
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * LoadingState / ErrorState / SuccessState
 * ----------------------------------------------------------------------- */

function renderStateCard(opts: {
  klass: string;
  iconName: string;
  iconClass: string;
  title: string;
  description: string;
  actions: unknown;
  /** ARIA role for the card — status cards replace content, so they announce. */
  role?: string;
  live?: string;
  helpers: { renderNode: (n: unknown) => Node };
}): HTMLElement {
  const root = el("div", {
    class: `rui-${opts.klass}`,
    role: opts.role ?? null,
    "aria-live": opts.live ?? null,
  });
  if (opts.iconName) {
    const icon = renderIcon(opts.iconName, { className: opts.iconClass });
    if (icon) root.append(icon);
  }
  if (opts.title) root.append(el("h3", { class: `rui-${opts.klass}-title` }, [opts.title]));
  if (opts.description) root.append(el("p", { class: `rui-${opts.klass}-description` }, [opts.description]));
  const items = asArray<unknown>(opts.actions);
  if (items.length > 0) {
    const row = el("div", { class: `rui-${opts.klass}-actions` });
    for (const item of items) row.append(opts.helpers.renderNode(item));
    root.append(row);
  }
  return root;
}

export const LoadingState: ComponentSpec = {
  name: "LoadingState",
  description:
    "Full-card loading state — large spinner + title + description. Use " +
    "while a query is in flight or while a long-running tool runs. Pass " +
    "`actions` for escape hatches (Cancel / Run in background) and `icon` " +
    "to replace the spinner for a queued/waiting state. For " +
    "tiny inline loaders prefer `Spinner`; for skeleton placeholders " +
    "prefer `Skeleton`.",
  props: [
    { name: "title", type: "string", optional: true, description: "Default \"Loading…\"" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons rendered under the text (Cancel, Run in background, …)" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon shown INSTEAD of the spinner (e.g. `clock` for a queued state)" },
  ],
  render: (_node, props, helpers) => {
    // A full-card loader replaces the region's content, so it has to announce
    // itself — `aria-busy` also tells AT the region is mid-update.
    const root = el("div", {
      class: "rui-loading-state",
      role: "status",
      "aria-live": "polite",
      "aria-busy": "true",
    });
    const iconName = asString(props.icon);
    const icon = iconName ? renderIcon(iconName, { className: "rui-loading-state-icon" }) : null;
    if (icon) {
      root.append(icon);
    } else {
      const spinner = el("span", { class: "rui-spinner", "data-size": "lg", "data-tone": "primary" });
      spinner.append(el("span", { class: "rui-spinner-ring", "aria-hidden": "true" }));
      root.append(spinner);
    }
    root.append(el("h3", { class: "rui-loading-state-title" }, [asString(props.title, "Loading…")]));
    const description = asString(props.description);
    if (description) root.append(el("p", { class: "rui-loading-state-description" }, [description]));
    const actions = asArray<unknown>(props.actions);
    if (actions.length > 0) {
      const row = el("div", { class: "rui-loading-state-actions" });
      for (const item of actions) row.append(helpers.renderNode(item));
      root.append(row);
    }
    return root;
  },
};

export const ErrorState: ComponentSpec = {
  name: "ErrorState",
  description:
    "Full-card error placeholder. Pairs a danger icon with title, " +
    "description, and a row of recovery actions (Retry / Contact " +
    "support / Go home). Pass `actions` as Button(...) entries.",
  props: [
    { name: "title", type: "string", optional: true, description: "Default \"Something went wrong\"" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon (default `circle-exclamation`)" },
  ],
  render: (_node, props, helpers) => renderStateCard({
    klass: "error-state",
    iconName: asString(props.icon, "circle-exclamation"),
    iconClass: "rui-error-state-icon",
    title: asString(props.title, "Something went wrong"),
    description: asString(props.description),
    actions: props.actions,
    // A failure that replaces content must interrupt — a silent swap leaves
    // the user believing the operation succeeded.
    role: "alert",
    helpers,
  }),
};

export const SuccessState: ComponentSpec = {
  name: "SuccessState",
  description:
    "Full-card success placeholder. Use for confirmation screens " +
    "(\"Order placed\", \"Payment succeeded\", \"Account verified\") at " +
    "the end of a flow. Pass `actions` for follow-up CTAs.",
  props: [
    { name: "title", type: "string", optional: true, description: "Default \"Success\" — an empty title falls back rather than rendering an icon-only card" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Default `circle-check`" },
  ],
  render: (_node, props, helpers) => renderStateCard({
    klass: "success-state",
    iconName: asString(props.icon, "circle-check"),
    iconClass: "rui-success-state-icon",
    // `asString(x, fallback)` only covers null/undefined; a title bound to a
    // still-empty $variable would otherwise render a bare green tick.
    title: asString(props.title).trim() || "Success",
    description: asString(props.description),
    actions: props.actions,
    role: "status",
    live: "polite",
    helpers,
  }),
};

/* ----------------------------------------------------------------------- *
 * Tour / Spotlight
 * ----------------------------------------------------------------------- */

interface TourStep {
  title: string;
  description: string;
  target: string;
}

export const Tour: ComponentSpec = {
  name: "Tour",
  description:
    "Product-tour controller — renders the current step's title, " +
    "description, and a Prev/Next/Skip row. Bind `current` to a " +
    "`$variable` (0-indexed) to drive the step from your own state; without " +
    "a binding the component advances itself. Bind `open` to a `$variable` " +
    "so Skip/Finish can close it (otherwise it closes itself). Pass `steps` " +
    "as `{title, description, target?}` objects; the optional `target` is a " +
    "CSS selector that renders alongside the step for designers to reference.",
  props: [
    { name: "steps", type: "object[]" },
    { name: "current", type: "number", description: "0-indexed active step — bind a $variable" },
    { name: "open", type: "boolean", optional: true, description: "Whether the tour is visible — bind a $variable to control it" },
    { name: "onOpenChange", type: "callable", optional: true, aliases: ["onopenchange"], description: "Called with the new boolean open state whenever the component opens or closes." },
    { name: "onComplete", type: "callable", optional: true, description: "Fired when the user reaches Finish" },
    { name: "onSkip", type: "callable", optional: true, description: "Fired when the user bails out via Skip (falls back to `onComplete` when omitted)" },
    { name: "skipLabel", type: "string", optional: true, description: "Default \"Skip\"" },
    { name: "backLabel", type: "string", optional: true, description: "Default \"Back\"" },
    { name: "nextLabel", type: "string", optional: true, description: "Default \"Next\"" },
    { name: "finishLabel", type: "string", optional: true, description: "Default \"Finish\"" },
  ],
  render: (node, props, helpers) => {
    const steps: TourStep[] = asArray<unknown>(props.steps).map((entry) => {
      if (!entry || typeof entry !== "object") return { title: asString(entry), description: "", target: "" };
      const r = entry as Record<string, unknown>;
      return { title: asString(r.title), description: asString(r.description), target: asString(r.target) };
    });
    const total = steps.length;
    const clampStep = (n: number): number => Math.max(0, Math.min(total - 1, Math.floor(n)));
    // Slot 1 is `current`, slot 2 is `open`. Both are optional bindings: when
    // neither is a `$variable` the controls fall back to instance state, so a
    // literal call can still be advanced and — crucially — dismissed. Without
    // that fallback `Tour(steps: [...])` covered the whole app forever.
    const stepRef = node.argMeta?.[1]?.stateRef;
    const openRef = node.argMeta?.[2]?.stateRef;
    const labelId = instanceLabelId(helpers, "rui-tour-label-id", "rui-tour-label");
    const declared = clampStep(asNumber(props.current, 0));
    const stepSlot = helpers.useInstanceState<number>("step", declared);
    const dismissSlot = helpers.useInstanceState<boolean>("dismissed", false);
    const openProp = props.open === undefined ? true : asBoolean(props.open);
    const isOpen = openRef ? openProp : (openProp && !dismissSlot.get());
    const current = stepRef ? declared : clampStep(stepSlot.get());
    const overlay = el("div", { class: "rui-tour", "data-open": isOpen ? "true" : "false" });
    if (!isOpen || total === 0) return overlay;
    const step = steps[current];
    if (!step) return overlay;

    const close = (origin: HTMLElement | null): void => {
      // Report the transition on every dismissal path (backdrop, close button,
      // Escape, Skip, Finish) — `onSkip`/`onComplete` only cover two of them, so
      // a controlled Tour had no way to observe the others.
      helpers.invoke(props.onOpenChange, false);
      if (openRef) { helpers.setState(openRef, false); return; }
      dismissSlot.set(true);
      // Instance state does not schedule a render, so hide the LIVE overlay.
      const live = origin?.closest(".rui-tour") as HTMLElement | null;
      live?.setAttribute("data-open", "false");
    };
    const goTo = (origin: HTMLElement | null, index: number): void => {
      const target = clampStep(index);
      if (stepRef) { helpers.setState(stepRef, target); return; }
      stepSlot.set(target);
      const live = origin?.closest(".rui-tour") as HTMLElement | null;
      const card = live?.querySelector(".rui-tour-card") as HTMLElement | null;
      if (!live || !card) return;
      const scope = live.getRootNode() as Document | ShadowRoot;
      const hadFocus = card.contains(scope.activeElement);
      const fresh = buildCard(target);
      card.replaceWith(fresh);
      if (hadFocus) fresh.querySelector<HTMLElement>(".rui-tour-next")?.focus();
    };
    const originOf = (event: Event): HTMLElement | null =>
      (event.currentTarget ?? event.target) as HTMLElement | null;

    const buildCard = (index: number): HTMLElement => {
      const active = steps[index]!;
      const isLast = index >= total - 1;
      const card = el("div", {
        class: "rui-tour-card",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": labelId,
        tabindex: "-1",
      });
      card.append(el("div", { class: "rui-tour-step" }, [`Step ${index + 1} of ${total}`]));
      card.append(el("h3", { class: "rui-tour-title", id: labelId }, [active.title]));
      if (active.description) card.append(el("p", { class: "rui-tour-description" }, [active.description]));
      if (active.target) card.append(el("div", { class: "rui-tour-target" }, [`Target: ${active.target}`]));
      const footer = el("div", { class: "rui-tour-footer" });
      const skip = el("button", {
        type: "button",
        class: "rui-button rui-tour-skip",
        "data-variant": "ghost",
      }, [asString(props.skipLabel, "Skip")]);
      skip.onclick = (event) => {
        // Skip and Finish used to fire the same callback, so "bailed at step 2"
        // and "finished" were indistinguishable.
        if (typeof props.onSkip === "function") helpers.invoke(props.onSkip, index);
        else helpers.invoke(props.onComplete);
        close(originOf(event));
      };
      const prev = el("button", {
        type: "button",
        class: "rui-button rui-tour-back",
        "data-variant": "secondary",
        disabled: index <= 0 ? "" : null,
      }, [asString(props.backLabel, "Back")]);
      prev.onclick = (event) => { if (index > 0) goTo(originOf(event), index - 1); };
      const next = el("button", {
        type: "button",
        class: "rui-button rui-tour-next",
        "data-variant": "primary",
      }, [isLast ? asString(props.finishLabel, "Finish") : asString(props.nextLabel, "Next")]);
      next.onclick = (event) => {
        const origin = originOf(event);
        if (isLast) {
          helpers.invoke(props.onComplete);
          close(origin);
          return;
        }
        goTo(origin, index + 1);
      };
      footer.append(skip, prev, next);
      card.append(footer);
      return card;
    };

    overlay.append(buildCard(current));
    // Escape-to-close, Tab focus trap, focus move + restore (the overlay blocks
    // the page, so leaving focus behind it is not an option).
    overlay.onkeydown = dialogKeydownHandler(".rui-tour-card", (origin) => close(origin));
    wireDialogFocus(overlay, ".rui-tour-card", helpers);
    return overlay;
  },
};

interface RingRect { top: number; left: number; width: number; height: number; }

/** Padding between the ringed element and the highlight ring, in px. */
const RING_PAD = 6;

const ringStyle = (r: RingRect): string =>
  `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;`;

/**
 * Measure the ringed element and write the result to BOTH the live ring and the
 * instance-state slot: morph strips attributes the fresh render does not emit,
 * so the render has to be able to re-assert the coordinates.
 */
function paintSpotlightRing(
  live: HTMLElement,
  selector: string,
  slot: InstanceStateSlot<RingRect | null>,
): void {
  const ring = live.querySelector<HTMLElement>(".rui-spotlight-ring");
  if (!ring) return;
  let anchor: Element | null = null;
  try {
    anchor = (live.getRootNode() as Document | ShadowRoot).querySelector(selector);
  } catch {
    anchor = null; // an invalid selector must not take the page down
  }
  const rect = anchor?.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    slot.set(null);
    // No target found — fall back to the plain dimmed overlay.
    live.setAttribute("data-ring", "false");
    ring.style.cssText = "display:none;";
    return;
  }
  const next: RingRect = {
    top: rect.top - RING_PAD,
    left: rect.left - RING_PAD,
    width: rect.width + RING_PAD * 2,
    height: rect.height + RING_PAD * 2,
  };
  slot.set(next);
  live.setAttribute("data-ring", "true");
  ring.style.cssText = ringStyle(next);
}

function trackSpotlightRing(
  root: HTMLElement,
  selector: string,
  slot: InstanceStateSlot<RingRect | null>,
  helpers: DisposerHelpers,
): void {
  deferToPaint(() => {
    // Only the mounted render owns the listeners — a re-render's fresh root is
    // discarded by morph, and registering the keyed disposer from it would tear
    // down the working ones.
    if (!root.isConnected) return;
    paintSpotlightRing(root, selector, slot);
    const onReflow = (): void => paintSpotlightRing(root, selector, slot);
    window.addEventListener("resize", onReflow, { passive: true });
    window.addEventListener("scroll", onReflow, { capture: true, passive: true });
    helpers.registerDisposer(() => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, { capture: true } as EventListenerOptions);
    }, "rui-spotlight-ring");
  });
}

export const Spotlight: ComponentSpec = {
  name: "Spotlight",
  description:
    "Single-step product highlight — a dimmed full-page overlay with an " +
    "explainer card, plus a ring around the element named by `target` (a CSS " +
    "selector). Omit `target` for a centred callout on a plain dim. Use for " +
    "one-off feature reveals (\"Try the new commands menu\"). Bind " +
    "`open` to a `$variable` to control it; the × button, a backdrop click " +
    "and Escape all dismiss and fire `onClose`.",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", optional: true, description: "Whether the spotlight is visible — typically a $variable (default true)" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true, aliases: ["action"] },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked when the spotlight is dismissed — persist \"already seen\" here" },
    { name: "target", type: "string", optional: true, description: "CSS selector of the element to ring, e.g. \"#commands-button\"" },
  ],
  render: (node, props, helpers) => {
    const openRef = node.argMeta?.[1]?.stateRef;
    // Same fallback as Tour: an unbound `open` must still be dismissable, or a
    // 50%-black fixed overlay covers the app with no way out.
    const dismissSlot = helpers.useInstanceState<boolean>("dismissed", false);
    const openProp = props.open === undefined ? true : asBoolean(props.open);
    const isOpen = openRef ? openProp : (openProp && !dismissSlot.get());
    const selector = asString(props.target).trim();
    const labelId = instanceLabelId(helpers, "rui-spotlight-label-id", "rui-spotlight-label");
    const ringSlot = helpers.useInstanceState<RingRect | null>("ring", null);
    const ringRect = selector ? ringSlot.get() : null;
    const overlay = el("div", {
      class: "rui-spotlight",
      "data-open": isOpen ? "true" : "false",
      "data-ring": ringRect ? "true" : "false",
    });
    if (!isOpen) return overlay;
    const close = (origin: HTMLElement | null): void => {
      if (openRef) helpers.setState(openRef, false);
      else {
        dismissSlot.set(true);
        (origin?.closest(".rui-spotlight") as HTMLElement | null)?.setAttribute("data-open", "false");
      }
      helpers.invoke(props.onClose);
    };
    if (selector) {
      overlay.append(el("div", {
        class: "rui-spotlight-ring",
        "aria-hidden": "true",
        style: ringRect ? ringStyle(ringRect) : "display:none;",
      }));
    }
    const card = el("div", {
      class: "rui-spotlight-card",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": labelId,
      tabindex: "-1",
    });
    const head = el("div", { class: "rui-spotlight-head" });
    head.append(el("h3", { class: "rui-spotlight-title", id: labelId }, [asString(props.title)]));
    const closeBtn = el("button", {
      type: "button",
      class: "rui-spotlight-close",
      "aria-label": "Close",
    });
    const closeIcon = renderIcon("xmark");
    if (closeIcon) closeBtn.append(closeIcon); else closeBtn.append(document.createTextNode("×"));
    closeBtn.onclick = (event) => close((event.currentTarget ?? event.target) as HTMLElement | null);
    head.append(closeBtn);
    card.append(head);
    const description = asString(props.description);
    if (description) card.append(el("p", { class: "rui-spotlight-description" }, [description]));
    const actions = asArray<unknown>(props.actions);
    if (actions.length > 0) {
      const row = el("div", { class: "rui-spotlight-actions" });
      for (const item of actions) row.append(helpers.renderNode(item));
      card.append(row);
    }
    overlay.append(card);
    // Backdrop dismissal is installed unconditionally now — it used to exist
    // only when `open` was bound to a $variable.
    overlay.onclick = (event) => {
      if (event.target !== event.currentTarget) return;
      close(event.currentTarget as HTMLElement);
    };
    overlay.onkeydown = dialogKeydownHandler(".rui-spotlight-card", (origin) => close(origin));
    wireDialogFocus(overlay, ".rui-spotlight-card", helpers);
    if (selector) trackSpotlightRing(overlay, selector, ringSlot, helpers);
    return overlay;
  },
};

/* ----------------------------------------------------------------------- *
 * Sticky / ResizablePanels / MasonryGrid / Drawer / TopBar
 * ----------------------------------------------------------------------- */

export const Sticky: ComponentSpec = {
  name: "Sticky",
  description:
    "Wraps content in a `position: sticky` container so it pins to the " +
    "top (or bottom / left / right) of the nearest scrollable ancestor. Use for " +
    "toolbar action rows above tables, in-page navs, status banners, and " +
    "pinned first/last columns in a horizontally scrolling row. " +
    "Sets `data-stuck=\"true\"` on itself once pinned, so a CSS hook (a " +
    "shadow/border) can flag the pinned state.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"] },
    { name: "offset", type: "string", optional: true, description: "CSS offset (default 0)" },
    { name: "zIndex", type: "number", optional: true, description: "Z-index (default 10)" },
  ],
  render: (_node, props, helpers) => {
    const side = asString(props.side, "top");
    const offset = sanitiseCssLength(props.offset, "0");
    const z = Math.max(0, Math.floor(asNumber(props.zIndex, 10)));
    const styles = `position:sticky;${side}:${offset};z-index:${z};`;
    // The pinned flag lives in instance state: morph removes attributes the
    // fresh render does not emit, and the observer only fires on a *change*,
    // so a stripped `data-stuck` would never come back.
    const stuckSlot = helpers.useInstanceState<boolean>("stuck", false);
    const root = el("div", {
      class: "rui-sticky",
      style: styles,
      "data-stuck": stuckSlot.get() ? "true" : "false",
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    // Stuck detection (II.4): a sentinel rootMargin equal to the pin offset
    // makes the element's intersection ratio drop below 1 exactly when it
    // pins, with no extra sentinel node. Toggle `data-stuck` for CSS hooks.
    if (typeof IntersectionObserver !== "undefined") {
      // Parse a px offset for the rootMargin; non-px offsets fall back to 0
      // (the stuck flag still flips, just at the viewport edge).
      const offsetPx = /^(\d+(?:\.\d+)?)px$/.exec(offset)?.[1] ?? "0";
      const edge = `-${Number(offsetPx) + 1}px`;
      const margin = side === "bottom" ? `0px 0px ${edge} 0px`
        : side === "left" ? `0px 0px 0px ${edge}`
        : side === "right" ? `0px ${edge} 0px 0px`
        : `${edge} 0px 0px 0px`;
      deferToPaint(() => {
        // Only the mounted render may own the observer. A re-render's fresh
        // root is discarded by morph, so attaching here would watch a detached
        // node AND — through the keyed disposer — disconnect the observer that
        // is actually watching the live one. The same guard makes a pending
        // callback inert when the instance unmounts before it fires, so no
        // observer is ever allocated into an already-swept disposer bucket.
        if (!root.isConnected) return;
        const io = new IntersectionObserver(
          ([entry]) => {
            if (!entry) return;
            const stuck = entry.intersectionRatio < 1;
            stuckSlot.set(stuck);
            root.setAttribute("data-stuck", stuck ? "true" : "false");
          },
          { threshold: [1], rootMargin: margin },
        );
        io.observe(root);
        // Keyed: a re-render replaces the previous observer instead of
        // stacking one per render (anonymous disposers only run on unmount).
        helpers.registerDisposer(() => io.disconnect(), "rui-sticky-io");
      });
    }
    return root;
  },
};

/** The drag is clamped to these percentages so neither pane can collapse. */
const RESIZE_MIN_PCT = 15;
const RESIZE_MAX_PCT = 85;

const clampResizePct = (n: number): number =>
  Math.max(RESIZE_MIN_PCT, Math.min(RESIZE_MAX_PCT, n));

/** Read a plain `NN%` width back as a number; `null` for px/calc widths. */
const percentOf = (raw: string): number | null => {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(raw.trim());
  return match ? Number(match[1]) : null;
};

export const ResizablePanels: ComponentSpec = {
  name: "ResizablePanels",
  description:
    "Two-pane horizontal split with a draggable divider. The user can " +
    "drag the divider (or focus it and use the arrow keys / Home / End) to " +
    "resize the primary pane; `onResize` reports the new percentage so the " +
    "split can be persisted. Use for code editors, file browsers, master/detail " +
    "layouts that need user-controllable proportions.",
  props: [
    { name: "primary", type: "Node[]" },
    { name: "secondary", type: "Node[]" },
    { name: "initialPrimaryWidth", type: "string", optional: true, description: "CSS width for the primary pane (default 40%)" },
    { name: "minPrimaryWidth", type: "string", optional: true, description: "Min width of the PRIMARY pane (default 240px)" },
    { name: "minSecondaryWidth", type: "string", optional: true, description: "Min width of the secondary pane (default 0)" },
    { name: "onResize", type: "callable", optional: true, description: "Called with the primary pane's new width percentage when a drag or key press ends" },
  ],
  render: (_node, props, helpers) => {
    const initial = sanitiseCssLength(props.initialPrimaryWidth, "40%");
    const minWidth = sanitiseCssLength(props.minPrimaryWidth, "240px");
    const minSecondary = sanitiseCssLength(props.minSecondaryWidth, "0");
    // The dragged ratio has to be re-emitted by every render: morph copies the
    // fresh node's `style` attribute onto the live node, so a render still
    // carrying `initialPrimaryWidth` snapped the panes back on any unrelated
    // state change.
    const pctSlot = helpers.useInstanceState<number | null>("primaryPct", null);
    const storedPct = pctSlot.get();
    const primaryWidth = storedPct === null ? initial : `${storedPct}%`;
    const root = el("div", {
      class: "rui-resizable-panels",
      style: `--rui-resizable-primary:${primaryWidth};--rui-resizable-min:${minWidth};--rui-resizable-min-secondary:${minSecondary};`,
    });
    const primary = el("div", { class: "rui-resizable-panel rui-resizable-panel-primary" });
    for (const child of asArray(props.primary)) primary.append(helpers.renderNode(child));
    const shownPct = storedPct ?? percentOf(initial);
    const divider = el("div", {
      class: "rui-resizable-divider",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize panes",
      "aria-valuemin": String(RESIZE_MIN_PCT),
      "aria-valuemax": String(RESIZE_MAX_PCT),
      // Omitted (rather than guessed) while the width is still a px/calc value.
      "aria-valuenow": shownPct === null ? null : String(Math.round(shownPct)),
      tabindex: "0",
    });
    const secondary = el("div", { class: "rui-resizable-panel rui-resizable-panel-secondary" });
    for (const child of asArray(props.secondary)) secondary.append(helpers.renderNode(child));
    root.append(primary, divider, secondary);

    /** Percentage the primary pane currently occupies, measured if unknown. */
    const currentPct = (live: HTMLElement): number => {
      const stored = pctSlot.get() ?? percentOf(initial);
      if (stored !== null) return clampResizePct(stored);
      const width = live.getBoundingClientRect().width;
      const pane = live.querySelector(".rui-resizable-panel-primary") as HTMLElement | null;
      if (!pane || width === 0) return 40;
      return clampResizePct((pane.getBoundingClientRect().width / width) * 100);
    };
    const applyPct = (live: HTMLElement, handle: HTMLElement, next: number): number => {
      const clamped = clampResizePct(next);
      live.style.setProperty("--rui-resizable-primary", `${clamped}%`);
      handle.setAttribute("aria-valuenow", String(Math.round(clamped)));
      pctSlot.set(clamped);
      return clamped;
    };

    divider.onpointerdown = (event) => {
      const e = event as PointerEvent;
      // Resolve the live nodes from the event — a render-time reference is a
      // snapshot morph has already thrown away.
      const handle = (e.currentTarget ?? e.target) as HTMLElement;
      const live = handle.closest(".rui-resizable-panels") as HTMLElement | null;
      if (!live) return;
      handle.setPointerCapture(e.pointerId);
      const rect = live.getBoundingClientRect();
      let latest = currentPct(live);
      let ended = false;
      const onMove = (moveEvent: PointerEvent) => {
        latest = applyPct(live, handle, ((moveEvent.clientX - rect.left) / rect.width) * 100);
      };
      // `pointercancel` / `lostpointercapture` share the teardown: a gesture
      // reinterpreted as a scroll (or a long-press menu) never fires
      // `pointerup`, and the pane used to keep following the next touch.
      const stop = (endEvent: PointerEvent) => {
        if (ended) return;
        ended = true;
        try { handle.releasePointerCapture(endEvent.pointerId); } catch { /* already released */ }
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
        handle.removeEventListener("lostpointercapture", stop);
        helpers.invoke(props.onResize, latest);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
      handle.addEventListener("lostpointercapture", stop);
    };

    // The divider is a focusable separator, so it must be operable: arrows
    // nudge, Shift+arrow jumps, Home/End go to the clamped extremes.
    divider.onkeydown = (event) => {
      const handle = (event.currentTarget ?? event.target) as HTMLElement;
      const live = handle.closest(".rui-resizable-panels") as HTMLElement | null;
      if (!live) return;
      const step = event.shiftKey ? 10 : 2;
      let next: number;
      switch (event.key) {
        case "ArrowLeft": next = currentPct(live) - step; break;
        case "ArrowRight": next = currentPct(live) + step; break;
        case "Home": next = RESIZE_MIN_PCT; break;
        case "End": next = RESIZE_MAX_PCT; break;
        default: return;
      }
      event.preventDefault();
      helpers.invoke(props.onResize, applyPct(live, handle, next));
    };

    return root;
  },
};

const clampMasonryColumns = (n: number): number =>
  Math.max(1, Math.min(6, Math.floor(n)));

export const MasonryGrid: ComponentSpec = {
  name: "MasonryGrid",
  description:
    "Pinterest-style column grid. Children flow into columns that reflow " +
    "on viewport changes. Use for galleries, social-style feeds, and " +
    "mixed-height card walls. `columns` accepts a responsive map like " +
    "`{base: 1, md: 2, lg: 4}`. Prefer `Grid` when children should share " +
    "the same height per row.",
  props: [
    { name: "items", type: "Node[]" },
    { name: "columns", type: "number | object", optional: true, description: "Preferred column count 1–6 (default 3). May be a responsive map like `{base: 1, md: 2, lg: 4}`." },
    { name: "gap", type: "string", optional: true, enum: SPACING_TOKENS },
  ],
  render: (_node, props, helpers) => {
    const columns = readResponsiveProp<number | string>(props.columns);
    const gap = normalizeSpacingToken(props.gap, "md");
    const attrs: Record<string, string | null> = {
      class: "rui-masonry-grid",
      "data-gap": gap,
    };
    const styleParts: string[] = [];
    if (columns.kind === "single") {
      attrs["data-columns"] = String(clampMasonryColumns(asNumber(columns.value, 3)));
    } else {
      // Per-breakpoint counts: the CSS chains `--rui-masonry-columns-{bp}`
      // mobile-first, exactly like Grid's `--rui-grid-cols-{bp}`.
      attrs["data-responsive-columns"] = "true";
      for (const bp of RESPONSIVE_BREAKPOINTS) {
        const value = columns.values[bp];
        if (value === undefined) continue;
        styleParts.push(`--rui-masonry-columns-${bp}:${clampMasonryColumns(asNumber(value, 3))}`);
      }
    }
    if (styleParts.length > 0) attrs.style = `${styleParts.join(";")};`;
    const root = el("div", attrs);
    for (const item of asArray(props.items)) {
      // Each child gets a wrapper so the column rules (`display: inline-block`,
      // `break-inside: avoid`) land on the wrapper instead of overriding the
      // child's own display — `.rui-masonry-grid > *` beat `.rui-card`'s
      // `display: flex` and silently killed every card's internal `gap`.
      const cell = el("div", { class: "rui-masonry-item" });
      cell.append(helpers.renderNode(item));
      root.append(cell);
    }
    return root;
  },
};

export const Drawer: ComponentSpec = {
  name: "Drawer",
  description:
    "Side drawer overlay shown when `open` is true. Pass a `$variable` as " +
    "`open` to control it. Choose `side` for slide direction (default right) " +
    "and `width` for a wide detail drawer. " +
    "`onClose` fires whenever the drawer is dismissed (× button, Escape, or " +
    "backdrop click — set `closeOnBackdrop: false` to keep a form safe from " +
    "stray clicks).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["right", "left", "top", "bottom"] },
    { name: "footer", type: "Node[]", optional: true, description: "Optional footer actions row" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked when the drawer is dismissed" },
    { name: "width", type: "string", optional: true, aliases: ["size"], description: "Panel width for left/right drawers, height for top/bottom (default 420px), e.g. \"720px\" or \"60vw\"" },
    { name: "closeOnBackdrop", type: "boolean", optional: true, description: "Whether clicking the backdrop dismisses (default true)" },
  ],
  render: (node, props, helpers) => {
    const isOpen = asBoolean(props.open);
    const side = asString(props.side, "right");
    const overlay = el("div", {
      class: "rui-sheet-overlay",
      "data-open": isOpen ? "true" : "false",
      "data-side": side,
    });
    // `sx`/`style` land on the node the render RETURNS (this overlay), so the
    // panel needs its own escape hatch for width.
    const width = sanitiseCssLength(props.width, "");
    const alongBlockAxis = side === "top" || side === "bottom";
    const panelStyle = width
      ? (alongBlockAxis ? `height:${width};max-height:100vh;` : `width:${width};max-width:100vw;`)
      : null;
    const title = asString(props.title);
    const labelId = instanceLabelId(helpers, "rui-drawer-label-id", "rui-drawer-label");
    const panel = el("aside", {
      // `rui-drawer-*` classes shadow the `rui-sheet-*` ones, whose later
      // (Sheet-era) redefinitions stripped this component's body layout and
      // shrank the close glyph.
      class: "rui-sheet rui-drawer",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": title ? labelId : null,
      "aria-label": title ? null : "Drawer",
      "data-side": side,
      style: panelStyle,
      tabindex: "-1",
    });
    const header = el("header", { class: "rui-sheet-header rui-drawer-header" });
    header.append(el("h3", {
      class: "rui-sheet-title rui-drawer-title",
      id: title ? labelId : null,
    }, [title]));
    const closeBtn = el("button", {
      type: "button",
      class: "rui-sheet-close rui-drawer-close",
      "aria-label": "Close",
    }, ["×"]);
    const stateName = node.argMeta?.[1]?.stateRef;
    const closeDrawer = () => {
      if (stateName) helpers.setState(stateName, false);
      helpers.invoke(props.onClose);
    };
    closeBtn.onclick = () => closeDrawer();
    const closeOnBackdrop = props.closeOnBackdrop === undefined ? true : asBoolean(props.closeOnBackdrop);
    overlay.onclick = (event) => {
      if (!closeOnBackdrop) return;
      if (event.target !== event.currentTarget) return;
      closeDrawer();
    };
    header.append(closeBtn);
    panel.append(header);
    const body = el("div", { class: "rui-sheet-body rui-drawer-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    panel.append(body);
    const footer = asArray<unknown>(props.footer);
    if (footer.length > 0) {
      const footerRow = el("footer", { class: "rui-sheet-footer rui-drawer-footer" });
      for (const child of footer) footerRow.append(helpers.renderNode(child));
      panel.append(footerRow);
    }
    overlay.append(panel);
    // Escape-to-close, Tab focus trap, focus move + restore — the same contract
    // the sibling Sheet has had (VIII.9 / X.3).
    overlay.onkeydown = dialogKeydownHandler(".rui-sheet", () => closeDrawer());
    wireDialogFocus(overlay, ".rui-sheet", helpers);
    return overlay;
  },
};

export const TopBar: ComponentSpec = {
  name: "TopBar",
  description:
    "Compact header strip that pairs a title (or breadcrumb) with " +
    "search and action slots. Use INSTEAD of hand-rolling a " +
    "`Stack(direction=\"row\")` above a page. For full SaaS shells use " +
    "`Navbar` (links) or `AppShell` (sidebar + topbar + content).",
  props: [
    { name: "title", type: "string", optional: true },
    { name: "subtitle", type: "string", optional: true },
    { name: "left", type: "Node[]", optional: true, aliases: ["badges"], description: "Leading slot (breadcrumbs, brand, status, badges)" },
    { name: "center", type: "Node[]", optional: true, aliases: ["search"], description: "Centered slot (search bar, segmented control)" },
    { name: "right", type: "Node[]", optional: true, aliases: ["actions"], description: "Trailing slot (actions, avatar)" },
    { name: "sticky", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("header", {
      class: "rui-topbar",
      "data-sticky": asBoolean(props.sticky) ? "true" : "false",
    });
    const left = el("div", { class: "rui-topbar-side rui-topbar-left" });
    const title = asString(props.title);
    const subtitle = asString(props.subtitle);
    // Either text alone is enough to warrant the block — `subtitle` used to be
    // read inside `if (title)` and was silently dropped without one (a bulk
    // action bar whose only text is "12 items selected" rendered no text).
    if (title || subtitle) {
      const titleBlock = el("div", { class: "rui-topbar-title-block" });
      if (title) titleBlock.append(el("h2", { class: "rui-topbar-title" }, [title]));
      if (subtitle) titleBlock.append(el("p", { class: "rui-topbar-subtitle" }, [subtitle]));
      left.append(titleBlock);
    }
    for (const child of asArray(props.left)) left.append(helpers.renderNode(child));
    // An empty slot wrapper still consumes the bar's flex gap, which pushed a
    // "centered" slot off centre by half of it.
    if (left.childNodes.length > 0) root.append(left);
    const center = asArray<unknown>(props.center);
    if (center.length > 0) {
      const centerWrap = el("div", { class: "rui-topbar-side rui-topbar-center" });
      for (const child of center) centerWrap.append(helpers.renderNode(child));
      root.append(centerWrap);
    }
    const right = el("div", { class: "rui-topbar-side rui-topbar-right" });
    for (const child of asArray(props.right)) right.append(helpers.renderNode(child));
    if (right.childNodes.length > 0) root.append(right);
    return root;
  },
};
