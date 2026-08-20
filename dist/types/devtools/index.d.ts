/**
 * Aktion DevTools (`aktion/devtools`)
 * ===================================
 *
 * A real, in-page debugger for any `<aktion-app>` on the page — the Aktion
 * equivalent of the React / Vue DevTools, built around Aktion's own runtime
 * signals:
 *
 *   - **State inspector** — a live, editable tree of every reactive `$state`
 *     atom. Edits flow back through the genuine reactive pipeline, so changing
 *     a value here re-renders the app and re-derives computed atoms exactly as
 *     a real event handler would. Changed atoms flash.
 *   - **Render profiler** — every commit, captured with its trigger, duration,
 *     and a flamegraph of which component instances mounted / updated / were
 *     memoized (and *why*), plus a ranked "most expensive components" table.
 *   - **Effect timeline** — every effect's mount → run → cleanup → unmount,
 *     attributed to the trigger that fired it (`$count` change, `every(N)`
 *     tick, lifecycle), with per-effect lanes and run timings.
 *
 * Architecture mirrors the browser-DevTools split: the runtime ("backend")
 * always emits to a global hook (`__AKTION_DEVTOOLS_HOOK__`) but the calls are
 * cheap no-ops until a frontend subscribes. This module is the in-page
 * frontend; a browser-extension frontend could speak the identical protocol.
 *
 * Usage — drop one line into any page that loads Aktion:
 *
 *   import { mountDevtools } from "aktion/devtools";
 *   mountDevtools();
 *
 * It is a separate, opt-in entry so production bundles that never import it
 * pay nothing for the panel UI.
 */
export { installDevtoolsHook, getDevtoolsHook, isDevtoolsActive, HOOK_KEY, DEVTOOLS_PROTOCOL_VERSION, type AktionDevtoolsHook, type DevtoolsAppRecord, type DevtoolsEventListener, type DevtoolsAppListener, } from './hook.js';
export type { DevtoolsEvent, DevtoolsEventKind, CommitRecord, ComponentRenderRecord, RenderPhase, ComponentKind, StateEvent, EffectEvent, EffectEventPayload, EffectPhase, } from './protocol.js';
export { mountDevtools, defineDevtoolsElement, isDevtoolsInstalled, AktionDevtoolsElement, type MountDevtoolsOptions, type DevtoolsController, } from './panel.js';
