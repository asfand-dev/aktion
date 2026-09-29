/**
 * Aktion DevTools — the section registry, in rail order.
 *
 * Alt+1…9 follow this order, the rail groups follow `group`, and the command
 * palette offers every entry. Adding a section means adding it here; the shell
 * never needs to change.
 */

import type { ViewDefinition } from "../context.js";
import { viewCss } from "./common.js";
import { overviewView } from "./overview.js";
import { inspectView } from "./inspect.js";
import { stateView } from "./state.js";
import { dataView } from "./data.js";
import { routesView } from "./routes.js";
import { timelineView } from "./timeline.js";
import { networkView } from "./network.js";
import { consoleView } from "./console.js";
import { effectsView } from "./effects.js";
import { profilerView } from "./profiler.js";
import { a11yView } from "./a11y.js";
import { securityView } from "./security.js";
import { testingView } from "./testing.js";
import { sourceView } from "./source.js";
import { themeView } from "./theme.js";
import { settingsView } from "./settings.js";

export const VIEWS: ReadonlyArray<ViewDefinition> = [
  // The shared view stylesheet rides on the first entry: the shell appends
  // every view's `css` once, in order.
  { ...overviewView, css: `${viewCss}\n${overviewView.css ?? ""}` },
  inspectView,
  stateView,
  dataView,
  routesView,
  timelineView,
  networkView,
  consoleView,
  effectsView,
  profilerView,
  a11yView,
  securityView,
  testingView,
  sourceView,
  themeView,
  settingsView,
];
