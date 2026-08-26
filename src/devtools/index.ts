/**
 * Aktion DevTools (`aktion-runtime/devtools`)
 * ===========================================
 *
 * A real, in-page debugger for any `<aktion-app>` on the page — the Aktion
 * equivalent of the React / Vue DevTools, built around Aktion's own runtime
 * signals. Fourteen tabs:
 *
 *   - **Overview** — health, cost, and shape of the app, with a link to the tab
 *     that explains each number.
 *   - **Inspect** — the component-instance tree, an element picker that reaches
 *     inside the shadow root, live editing of a component's props, hooks, and
 *     internal UI state, plus its box model, computed styles, `--rui-*`
 *     variables, and accessibility properties.
 *   - **State** — a live, editable tree of every reactive `$state` atom, with
 *     per-atom change counts and snapshot-based time travel.
 *   - **Profiler** — every commit with its trigger, duration, DOM-diff time, and
 *     a flamegraph of which instances mounted / updated / were memoized (and
 *     *why*), a ranked component table, and detected hot-spots.
 *   - **Effects** — the lifecycle timeline (mount → run → cleanup → unmount)
 *     attributed to the trigger that fired it, plus every mounted effect with
 *     its subscriptions and a "run now" button.
 *   - **Network** — requests from the Aktion HTTP layer with headers, bodies,
 *     and a waterfall, plus rules that delay, mock, fail, or blackhole matching
 *     requests.
 *   - **Console** — the program's output and the runtime's own diagnostics, plus
 *     a REPL that evaluates Aktion expressions against the live program scope.
 *   - **Routes** — current route, the patterns the program declares, params, and
 *     navigation history.
 *   - **Data** — cached `$query` resources, `Store` / `$form` handles, and
 *     browser storage.
 *   - **Theme** — a live design-token editor with contrast checks.
 *   - **Source** — the running program with diagnostics on their lines, an
 *     outline, and edit-and-remount.
 *   - **Test** — record interactions into a runnable test, audit accessibility,
 *     measure DSL coverage, try Testing Library queries, and fuzz the UI.
 *   - **Timeline** — every event in one ordered stream, and a session export.
 *   - **Settings** — instrumentation switches, docking, and density.
 *
 * Everything is reachable two ways: the tab strip, and a command palette
 * (Ctrl/Cmd + K) that fuzzy-matches every tab and every action — press ? for
 * the full shortcut list.
 *
 * Architecture mirrors the browser-DevTools split: the runtime ("backend")
 * always emits to a global hook (`__AKTION_DEVTOOLS_HOOK__`) but the calls are
 * cheap no-ops until a frontend subscribes. This module is the in-page
 * frontend; a browser-extension frontend could speak the identical protocol.
 *
 * Usage — drop one line into any page that loads Aktion:
 *
 *   import { mountDevtools } from "aktion-runtime/devtools";
 *   mountDevtools();
 *
 * It is a separate, opt-in entry so production bundles that never import it
 * pay nothing for the panel UI.
 */

// Hook + protocol (the wire contract — also usable by an extension frontend).
export {
  installDevtoolsHook,
  getDevtoolsHook,
  isDevtoolsActive,
  devtoolsOption,
  HOOK_KEY,
  DEVTOOLS_PROTOCOL_VERSION,
  type AktionDevtoolsHook,
  type DevtoolsAppRecord,
  type DevtoolsEventListener,
  type DevtoolsAppListener,
  type DevtoolsHookOptions,
} from "./hook.js";

export type {
  DevtoolsEvent,
  DevtoolsEventKind,
  DevtoolsValue,
  CommitRecord,
  ComponentRenderRecord,
  ComponentPropRecord,
  RenderPhase,
  ComponentKind,
  StateEvent,
  StateAtomMeta,
  EffectEvent,
  EffectEventPayload,
  EffectPhase,
  EffectInfo,
  NetworkEvent,
  NetworkPhase,
  NetworkRule,
  QueryInfo,
  StoreInfo,
  RouteEvent,
  RouteInfo,
  EmitEvent,
  LogEvent,
  LogLevel,
  ErrorEvent,
  InstanceNode,
  InstanceDetail,
  InstanceHookRecord,
  InstanceUiStateRecord,
  Diagnostic,
  OutlineEntry,
  ProgramAnalysis,
  ThemeInfo,
  AppStats,
  EvalResult,
} from "./protocol.js";

// Value serialisation — shared by the runtime and any frontend.
export {
  toDevtoolsValue,
  parseEditedValue,
  previewOf,
  toJsonText,
  valueKind,
} from "./serialize.js";

// Request rules (pure matching + verdict logic).
export { findMatchingRule, ruleMatches, verdictFor, newRule } from "./rules.js";

// Component-tree derivation from a commit's flat records.
export {
  buildInstanceTree,
  parentKeyOf,
  ancestorsOf,
  descendantsOf,
  componentNameFromKey,
  shortInstanceLabel,
} from "./tree.js";

// The panel's derived model — useful to a headless consumer of the event stream.
export {
  emptyModel,
  ingest,
  ingestLog,
  clearModel,
  componentAggregates,
  instanceAggregates,
  effectAggregates,
  networkStats,
  hotAtoms,
  buildTimeline,
  CAPS,
  type AppModel,
  type NetworkRequest,
  type LogEntry,
  type HistoryEntry,
  type TimelineEntry,
  type ComponentAggregate,
  type EffectAggregate,
  type ProgramVersion,
  type LongTask,
} from "./model.js";

// Accessibility audit (usable on its own, e.g. from a test).
export {
  auditAccessibility,
  groupFindings,
  contrastRatio,
  relativeLuminance,
  parseColor,
  effectiveBackground,
  type A11yFinding,
  type A11yImpact,
} from "./a11y.js";

// Interaction recorder + test code generation.
export {
  InteractionRecorder,
  generateTest,
  generateSnapshotTest,
  chooseQuery,
  queryExpression,
  queryLabel,
  type RecordedStep,
  type QueryStrategy,
  type CodegenOptions,
} from "./recorder.js";

// Highlight overlay + element picker, and the DOM readers behind them.
export {
  InspectOverlay,
  measureBox,
  describeElement,
  cssPath,
  cssVariables,
  computedGroup,
  a11ySummary,
  accessibleName,
  implicitRole,
  deepElementFromPoint,
  COMPUTED_GROUPS,
  type BoxModel,
} from "./overlay.js";

// Console tap.
export { ConsoleCapture, type CapturedLog } from "./console-capture.js";

// Command palette — the fuzzy matcher, the command list, and the controller.
export {
  PaletteController,
  buildPalette,
  fuzzyScore,
  rankCommands,
  SHORTCUTS,
  type Command,
  type PaletteActions,
  type PaletteHandlers,
  type PaletteState,
} from "./palette.js";

// Session export — everything the panel knows, as one JSON document.
export { exportSessionJson } from "./session.js";

// Derivations the tabs expose because they are useful on their own: the
// leaf-level diff between two state snapshots, and the visible-tree
// projection that keeps the hierarchy when library components are hidden.
export { diffSnapshots, type Change } from "./tabs/state.js";
export { visibleNodes } from "./tabs/inspect.js";

// The in-page panel + its programmatic mount API.
export {
  mountDevtools,
  defineDevtoolsElement,
  isDevtoolsInstalled,
  AktionDevtoolsElement,
  type MountDevtoolsOptions,
  type DevtoolsController,
} from "./panel.js";

export type { TabId, DockMode, UiState, TabContext, TabDefinition } from "./context.js";

import { defineDevtoolsElement } from "./panel.js";

// Registering the element on import is harmless (idempotent) and lets a
// consumer drop a `<aktion-devtools>` tag straight into their HTML.
defineDevtoolsElement();
