/**
 * Aktion DevTools — helpers shared by the views.
 */

import { h, type Child, type VElement } from "../core/vdom.js";
import type { ViewContext, TabId } from "../context.js";
import type { NetworkRequest } from "../model.js";
import { chip, emptyState, note, button, type Tone } from "../ui/kit.js";
import type { IconName } from "../ui/icons.js";

/** The "nothing to inspect" state every app-bound view shares. */
export function noApp(ctx: ViewContext, what: string, icon: IconName = "box"): VElement {
  if (ctx.imported) {
    return emptyState({
      icon: "file",
      title: `${what} needs a live app`,
      body: "You are viewing an imported session. Recorded history — the timeline, commits, requests, logs, and state — is available; live inspection is not.",
      actions: [button({ label: "Open the Timeline", icon: "timeline", onClick: () => ctx.selectTab("timeline") })],
    });
  }
  return emptyState({
    icon,
    title: "No Aktion app on this page yet",
    body: [
      "Mount an ",
      h("code", {}, "<aktion-app>"),
      " and it appears here automatically. Apps that mounted before the panel opened are discovered on open; later ones register on their next render.",
    ],
  });
}

/** An explanatory note for a runtime that lacks a capability. */
export function unsupported(what: string): VElement {
  return note("info", [`This runtime does not expose ${what}. `, "Upgrade ", h("code", {}, "aktion-runtime"), " to get it — the panel feature-detects every capability, so nothing else breaks."]);
}

/** A persisted split-pane size. */
export function paneSize(ctx: ViewContext, id: string, fallback: number): number {
  return ctx.ui.sizes[id] ?? fallback;
}

export function setPaneSize(ctx: ViewContext, id: string, size: number): void {
  ctx.ui.sizes[id] = Math.round(size);
  ctx.persist();
  ctx.refresh();
}

/** Jump to the State view filtered to one atom. */
export function openAtom(ctx: ViewContext, path: string): void {
  const root = path.split(".")[0] ?? path;
  ctx.ui.stateFilter = root;
  ctx.ui.stateSelected = root;
  ctx.ui.stateView = "tree";
  ctx.selectTab("state");
}

/** Jump to a source line. */
export function openSource(ctx: ViewContext, line: number | null | undefined): void {
  ctx.ui.sourceFocusLine = line ?? null;
  ctx.ui.sourceDraft = null;
  ctx.selectTab("source");
}

export function go(ctx: ViewContext, tab: TabId): () => void {
  return () => ctx.selectTab(tab);
}

/** A `$path` chip that opens the State view. */
export function atomChip(ctx: ViewContext, path: string, tone: Tone = "purple"): VElement {
  return chip(`$${path}`, tone, { mono: true, tip: `Open $${path} in State`, onClick: () => openAtom(ctx, path) });
}

export function requestTone(request: NetworkRequest): Tone {
  if (request.phase === "pending") return "grey";
  if (request.phase === "blocked") return "purple";
  if (request.phase === "error") return "red";
  if (request.phase === "mock") return "purple";
  const status = request.status ?? 0;
  if (status >= 500) return "red";
  if (status >= 400) return "amber";
  if (status >= 300) return "blue";
  return "green";
}

export function requestStatusLabel(request: NetworkRequest): string {
  if (request.phase === "pending") return "…";
  if (request.phase === "blocked") return "blocked";
  if (request.phase === "error") return "failed";
  return String(request.status ?? (request.phase === "mock" ? 200 : "—"));
}

export function isProblem(request: NetworkRequest): boolean {
  return request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400;
}

/** Shared "section header row" for view content. */
export function heading(title: Child, options: { actions?: Child[]; sub?: Child } = {}): VElement {
  return h("div", { class: "section-head" },
    h("h3", { class: "section-title", style: { margin: "0" } }, title),
    options.sub ? h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, options.sub) : null,
    h("span", { class: "grow" }),
    ...(options.actions ?? []));
}

/** A labelled key/value row used inside detail panes. */
export function detailRow(label: string, value: Child): VElement {
  return h("div", { class: "detail-row" }, h("span", { class: "detail-k" }, label), h("span", { class: "detail-v" }, value));
}

/** Percentile of a numeric list (nearest-rank). */
export function percentile(values: ReadonlyArray<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank]!;
}

export const viewCss = /* css */ `
.detail-row { display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 4px 0; font-size: var(--dt-fs-sm); align-items: baseline; }
.detail-k { color: var(--dt-text-3); white-space: nowrap; }
.detail-v { color: var(--dt-text); min-width: 0; overflow-wrap: anywhere; }
.pane-head { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex: none; }
.pane-title { font-weight: 650; font-size: var(--dt-fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pane-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.pane-body.is-pad { padding: 12px; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.split-note { padding: 10px 12px; }
`;
