import { Child, VElement } from '../core/vdom.js';
import { ViewContext, TabId } from '../context.js';
import { NetworkRequest } from '../model.js';
import { Tone } from '../ui/kit.js';
import { IconName } from '../ui/icons.js';
/** The "nothing to inspect" state every app-bound view shares. */
export declare function noApp(ctx: ViewContext, what: string, icon?: IconName): VElement;
/** An explanatory note for a runtime that lacks a capability. */
export declare function unsupported(what: string): VElement;
/** A persisted split-pane size. */
export declare function paneSize(ctx: ViewContext, id: string, fallback: number): number;
export declare function setPaneSize(ctx: ViewContext, id: string, size: number): void;
/** Jump to the State view filtered to one atom. */
export declare function openAtom(ctx: ViewContext, path: string): void;
/** Jump to a source line. */
export declare function openSource(ctx: ViewContext, line: number | null | undefined): void;
export declare function go(ctx: ViewContext, tab: TabId): () => void;
/** A `$path` chip that opens the State view. */
export declare function atomChip(ctx: ViewContext, path: string, tone?: Tone): VElement;
export declare function requestTone(request: NetworkRequest): Tone;
export declare function requestStatusLabel(request: NetworkRequest): string;
export declare function isProblem(request: NetworkRequest): boolean;
/** Shared "section header row" for view content. */
export declare function heading(title: Child, options?: {
    actions?: Child[];
    sub?: Child;
}): VElement;
/** A labelled key/value row used inside detail panes. */
export declare function detailRow(label: string, value: Child): VElement;
/** Percentile of a numeric list (nearest-rank). */
export declare function percentile(values: ReadonlyArray<number>, p: number): number;
export declare const viewCss = "\n.detail-row { display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 4px 0; font-size: var(--dt-fs-sm); align-items: baseline; }\n.detail-k { color: var(--dt-text-3); white-space: nowrap; }\n.detail-v { color: var(--dt-text); min-width: 0; overflow-wrap: anywhere; }\n.pane-head { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex: none; }\n.pane-title { font-weight: 650; font-size: var(--dt-fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pane-body { flex: 1 1 auto; min-height: 0; overflow: auto; }\n.pane-body.is-pad { padding: 12px; }\n.stack { display: flex; flex-direction: column; gap: 12px; }\n.chips { display: flex; flex-wrap: wrap; gap: 5px; }\n.split-note { padding: 10px 12px; }\n";
