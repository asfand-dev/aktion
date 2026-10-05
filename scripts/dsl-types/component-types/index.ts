/**
 * The curated TypeScript types of every library component, one module per
 * `src/library/components/<file>.ts` — edit the module next to the component's
 * spec when its props or its renderer change (see `./types.ts` for the format
 * and the checks the generator applies).
 */
import type { ComponentTypeSpec, ComponentTypeTable } from "./types.js";
import a11y from "./a11y.js";
import advancedCharts from "./advanced-charts.js";
import advancedData from "./advanced-data.js";
import advancedForms from "./advanced-forms.js";
import advancedPatterns from "./advanced-patterns.js";
import canvas from "./canvas.js";
import charts from "./charts.js";
import chat from "./chat.js";
import content from "./content.js";
import data from "./data.js";
import editors from "./editors.js";
import escapeHatch from "./escape-hatch.js";
import extras from "./extras.js";
import feedback from "./feedback.js";
import forms from "./forms.js";
import helpers from "./helpers.js";
import interop from "./interop.js";
import layoutMotion from "./layout-motion.js";
import layout from "./layout.js";
import marketing from "./marketing.js";
import media from "./media.js";
import menu from "./menu.js";
import navigation from "./navigation.js";
import newComponents from "./new-components.js";
import patterns from "./patterns.js";
import router from "./router.js";
import scheduling from "./scheduling.js";
import wave3 from "./wave3.js";
import wrappers from "./wrappers.js";

const MODULES: Readonly<Record<string, ComponentTypeTable>> = {
  "a11y": a11y,
  "advanced-charts": advancedCharts,
  "advanced-data": advancedData,
  "advanced-forms": advancedForms,
  "advanced-patterns": advancedPatterns,
  "canvas": canvas,
  "charts": charts,
  "chat": chat,
  "content": content,
  "data": data,
  "editors": editors,
  "escape-hatch": escapeHatch,
  "extras": extras,
  "feedback": feedback,
  "forms": forms,
  "helpers": helpers,
  "interop": interop,
  "layout-motion": layoutMotion,
  "layout": layout,
  "marketing": marketing,
  "media": media,
  "menu": menu,
  "navigation": navigation,
  "new-components": newComponents,
  "patterns": patterns,
  "router": router,
  "scheduling": scheduling,
  "wave3": wave3,
  "wrappers": wrappers,
};

function merge(modules: Readonly<Record<string, ComponentTypeTable>>): ComponentTypeTable {
  const out: Record<string, ComponentTypeSpec> = {};
  const owner: Record<string, string> = {};
  for (const [file, table] of Object.entries(modules)) {
    for (const [component, spec] of Object.entries(table)) {
      if (owner[component]) {
        throw new Error(`emit-dsl-types: ${component} is typed in both component-types/${owner[component]}.ts and component-types/${file}.ts`);
      }
      owner[component] = file;
      out[component] = spec;
    }
  }
  return out;
}

export const COMPONENT_TYPES: ComponentTypeTable = merge(MODULES);
