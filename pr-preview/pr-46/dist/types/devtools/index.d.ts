/**
 * Aktion DevTools (`aktion-runtime/devtools`)
 * ===========================================
 *
 * An in-page debugger for every `<aktion-app>` on the page, built around
 * Aktion's own runtime signals. Sixteen sections:
 *
 *   - **Overview** — health, cost, and shape of the app; every number links on.
 *   - **Inspector** — the component tree, an element picker that reaches inside
 *     the shadow root, live-editable props / hooks / UI state, owned effects,
 *     the DOM with its box model, computed styles, and what a screen reader says.
 *   - **State** — every `$state` atom, editable; time travel (read-only, or live
 *     in the app); snapshot diffs; each atom's change log; the reactivity graph.
 *   - **Data** — `$query` resources with refetch / invalidate / simulate, stores
 *     and forms, and browser storage.
 *   - **Routes** — the current route, declared patterns, params, and history.
 *   - **Timeline** — every event kind on its own track, zoomable, brushable.
 *   - **Network** — requests with headers, bodies, and a waterfall; mock, delay,
 *     fail, or flake any request; throttling presets; cURL / fetch / HAR export.
 *   - **Console** — program and runtime output, watches, and a REPL.
 *   - **Effects** — mounted effects, their triggers, and their lifecycle.
 *   - **Performance** — commit chart, flame chart, ranked components, "why did
 *     this render", insights, and Core Web Vitals (INP with its phases).
 *   - **Accessibility** — a WCAG-mapped audit with on-page markers, the
 *     accessibility tree, landmarks, headings, tab order, and vision simulation.
 *   - **Security** — what the program can reach (from its AST), the rendered
 *     output's sanitiser guarantees, transport, storage secrets, headers, CSP.
 *   - **Testing** — record, assert, replay, and export tests (Aktion or
 *     Playwright); scenarios; coverage; query playground; chaos; emulation.
 *   - **Source**, **Theme**, **Settings**.
 *
 * Architecture mirrors the browser-DevTools split: the runtime ("backend")
 * always emits to a global hook (`__AKTION_DEVTOOLS_HOOK__`), cheap no-ops until
 * a frontend subscribes. This module is the in-page frontend.
 *
 *   import { mountDevtools } from "aktion-runtime/devtools";
 *   mountDevtools();
 *
 * It is a separate, opt-in entry, so production bundles that never import it
 * pay nothing for the panel.
 */
export { installDevtoolsHook, getDevtoolsHook, isDevtoolsActive, devtoolsOption, HOOK_KEY, DEVTOOLS_PROTOCOL_VERSION, type AktionDevtoolsHook, type DevtoolsAppRecord, type DevtoolsEventListener, type DevtoolsAppListener, type DevtoolsHookOptions, } from './hook.js';
export type { DevtoolsEvent, DevtoolsEventKind, DevtoolsValue, CommitRecord, ComponentRenderRecord, ComponentPropRecord, RenderPhase, ComponentKind, StateEvent, StateAtomMeta, EffectEvent, EffectEventPayload, EffectPhase, EffectInfo, NetworkEvent, NetworkPhase, NetworkRule, QueryInfo, StoreInfo, RouteEvent, RouteInfo, EmitEvent, LogEvent, LogLevel, ErrorEvent, InstanceNode, InstanceDetail, InstanceHookRecord, InstanceUiStateRecord, Diagnostic, OutlineEntry, ProgramAnalysis, ThemeInfo, AppStats, EvalResult, ReactivityGraph, ProgramSecurityProfile, } from './protocol.js';
export { toDevtoolsValue, parseEditedValue, previewOf, toJsonText, valueKind } from './serialize.js';
export { findMatchingRule, ruleMatches, verdictFor, newRule } from './rules.js';
export { buildInstanceTree, parentKeyOf, ancestorsOf, descendantsOf, componentNameFromKey, shortInstanceLabel, } from './tree.js';
export { emptyModel, ingest, ingestLog, clearModel, componentAggregates, instanceAggregates, effectAggregates, networkStats, hotAtoms, buildTimeline, CAPS, type AppModel, type AtomChange, type ModelRevisions, type NetworkRequest, type LogEntry, type HistoryEntry, type TimelineEntry, type ComponentAggregate, type EffectAggregate, type ProgramVersion, type LongTask, } from './model.js';
export { auditAccessibility, groupFindings, a11yScore, RULE_INFO, tabOrder, landmarks, headingOutline, accessibilityTree, announce, contrastRatio, relativeLuminance, parseColor, effectiveBackground, type A11yFinding, type A11yImpact, type A11yCategory, type Landmark, type HeadingEntry, type AxNode, } from './a11y.js';
export { InteractionRecorder, generateTest, generateSnapshotTest, generatePlaywrightTest, playwrightLocator, chooseQuery, queryExpression, queryLabel, resolveQuery, replayStep, isVisible, type RecordedStep, type QueryStrategy, type CodegenOptions, type PlaywrightOptions, type ReplayResult, } from './recorder.js';
export { InspectOverlay, isPanelChrome, measureBox, describeElement, cssPath, cssVariables, computedGroup, a11ySummary, accessibleName, implicitRole, deepElementFromPoint, COMPUTED_GROUPS, type BoxModel, type HighlightLabel, type ScanEntry, type OverlayMarker, } from './overlay.js';
export { ConsoleCapture, type CapturedLog } from './console-capture.js';
export { fuzzyScore, fuzzyPositions, rankCommands, SHORTCUTS, SHORTCUT_GROUPS, type Command, type ShortcutGroup, } from './palette.js';
export { exportSessionJson, importSessionJson, bugReportMarkdown, SESSION_FORMAT, type ImportedSession, type SessionSource, } from './session.js';
export { scanSecurity, checkHeaders, checkUrlSecrets, classifySecret, decodeJwt, isLocalHost, readPageStorage, type SecurityReport, type SecurityFinding, type SecurityInput, type Severity, type CspViolation, type HeaderCheck, type OriginSummary, type StorageItem, } from './analysis/security.js';
export { VitalsMonitor, computeInp, computeCls, rate as rateVital, THRESHOLDS as VITAL_THRESHOLDS, emptyVitals, type VitalsSnapshot, type InteractionRecord, type LongTaskRecord, } from './analysis/vitals.js';
export { performanceInsights, healthIssues, commitRate, type Insight } from './analysis/insights.js';
export { layoutFlame, inclusiveTimes, packLanes, niceTicks, type FlameNode, type FlameLayout } from './analysis/layout.js';
export { toCurl, toFetch, toHar, shellQuote } from './analysis/har.js';
export { diffSnapshots, type Change } from './views/state.js';
export { visibleNodes } from './views/inspect.js';
export { mountDevtools, defineDevtoolsElement, isDevtoolsInstalled, AktionDevtoolsElement, type MountDevtoolsOptions, type DevtoolsController, } from './panel.js';
export { DEVTOOLS_UI_VERSION } from './meta.js';
export type { TabId, DockMode, UiState, TabContext, TabDefinition, ViewContext, ViewDefinition, PanelTheme, } from './context.js';
