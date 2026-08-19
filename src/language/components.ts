/**
 * Component catalog derived from the runtime library.
 *
 * We project `ComponentSpec` (which carries a DOM-flavoured `render` fn) into
 * a flat, JSON-serialisable shape that any editor or tool can consume without
 * pulling in the renderer or the DOM.
 */

import type { ComponentLibrary, ComponentSpec, PropSpec } from "../library/types.js";
import { defaultLibrary } from "../library/index.js";
import { UNIVERSAL_PROP_NAMES } from "../library/sx.js";

export interface ComponentParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  enumValues?: readonly string[];
}

export interface ComponentEntry {
  name: string;
  group: string;
  description: string;
  params: ComponentParam[];
  /** Short positional signature, e.g. `Card(children, variant?)`. */
  signature: string;
}

const projectParam = (prop: PropSpec): ComponentParam => {
  const param: ComponentParam = {
    name: prop.name,
    type: prop.type,
    required: !prop.optional,
  };
  if (prop.description) param.description = prop.description;
  if (prop.enum && prop.enum.length > 0) param.enumValues = prop.enum;
  return param;
};

const buildSignature = (spec: ComponentSpec): string => {
  const parts = spec.props.map((p) => (p.optional ? `${p.name}?` : p.name));
  return `${spec.name}(${parts.join(", ")})`;
};

const buildGroupIndex = (library: ComponentLibrary): Map<string, string> => {
  const index = new Map<string, string>();
  for (const group of library.componentGroups ?? []) {
    for (const name of group.components) index.set(name, group.name);
  }
  return index;
};

/**
 * Project a library's component specs into a flat catalog. Defaults to the
 * built-in `defaultLibrary`, but accepts a custom library so consumers that
 * register extra components via `registerComponents()` get the right autocomplete
 * data.
 */
export function getComponentCatalog(library: ComponentLibrary = defaultLibrary): ComponentEntry[] {
  const groupOf = buildGroupIndex(library);
  return library.components.map((spec) => ({
    name: spec.name,
    group: groupOf.get(spec.name) ?? "Other",
    description: spec.description,
    params: spec.props.map(projectParam),
    signature: buildSignature(spec),
  }));
}

/**
 * Prose for the universal props. Keyed by name so the catalog below can be
 * DERIVED from `UNIVERSAL_PROP_NAMES` (the set the validator actually enforces)
 * rather than hand-listed alongside it — a new universal prop then shows up in
 * every editor automatically, with a generic entry until someone writes its
 * description here.
 */
const UNIVERSAL_PROP_DOCS: Record<string, { type: string; description: string }> = {
  sx: {
    type: "object",
    description:
      "Style channel accepted by EVERY component: layout, colour, typography, spacing, borders, effects. "
      + "Values may be responsive maps (`{base, sm, md, lg}`), interaction states (`{_hover, _focus, _active}`), "
      + "or theme-token refs (`\"primary\"`, `\"gradient.brand\"`, `\"space.md\"`).",
  },
  animate: {
    type: "string | object",
    description:
      "Motion channel accepted by EVERY component. A preset name (`\"fade\"`, `\"slide-up\"`, `\"pulse\"`, `\"none\"`) "
      + "or an object with `{ preset, duration, delay, easing, repeat }`.",
  },
  id: { type: "string", description: "DOM id on the rendered root element." },
  anchor: {
    type: "string",
    description: "Scroll-anchor id — the target for `SkipLink`, `ScrollSpy` and `#hash` links.",
  },
  className: { type: "string", description: "Extra CSS classes appended to the rendered root element." },
  class: { type: "string", description: "Alias of `className`." },
  style: { type: "string | object", description: "Inline CSS. Prefer `sx`, which is token- and breakpoint-aware." },
  aria: {
    type: "object",
    description: "ARIA attributes as a plain object, e.g. `{ label: \"Close\", expanded: false }` → `aria-*`.",
  },
  data: { type: "object", description: "`data-*` attributes as a plain object, e.g. `{ testid: \"row-1\" }`." },
  dataAttrs: {
    type: "object",
    description:
      "Second spelling of the `data` channel, for the components that declare a `data` prop of their own "
      + "(LineChart, JsonTree, Async, Draggable, Lottie, QRCode) and would otherwise shadow it.",
  },
  role: {
    type: "string",
    description: "Override the rendered ARIA role. An escape valve for accessibility defects; use sparingly.",
  },
  tooltip: { type: "string", description: "Native hover tooltip (`title`) on the rendered root element." },
  hidden: { type: "boolean", description: "Remove the component from the accessibility tree and hide it visually." },
  testId: {
    type: "string",
    description:
      "End-to-end test hook: renders `data-testid` on the component's ROOT element. "
      + "Works on every component, including the six that shadow the `data` channel. "
      + "Prefer role/label queries; reach for this where they are genuinely ambiguous.",
  },
  testid: { type: "string", description: "Alias of `testId`." },
};

/**
 * The props EVERY component in the library accepts, over and above its own
 * declared params.
 *
 * These live in a separate `UNIVERSAL_PROP_NAMES` allow-list inside the
 * validator rather than on each `ComponentSpec`, so nothing derived from
 * `getComponentCatalog()` mentions them — which left editors unable to complete,
 * hover, or document `sx` and `animate`, the two channels most likely to be
 * reached for. Editors should append this catalog to a component's own `params`
 * (ranked below them) wherever named args are offered.
 */
export const universalPropCatalog: readonly ComponentParam[] = [...UNIVERSAL_PROP_NAMES].map((name) => {
  const doc = UNIVERSAL_PROP_DOCS[name];
  return {
    name,
    type: doc?.type ?? "any",
    required: false,
    description: doc?.description ?? "Universal prop accepted by every component.",
  };
});

/**
 * Returns an index of component name → entry for O(1) lookup. Convenient
 * inside editor extensions that need to render details on hover.
 */
export function indexCatalog(entries: ComponentEntry[]): Record<string, ComponentEntry> {
  const out: Record<string, ComponentEntry> = {};
  for (const entry of entries) out[entry.name] = entry;
  return out;
}
