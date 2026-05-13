/**
 * Component catalog derived from the runtime library.
 *
 * We project `ComponentSpec` (which carries a DOM-flavoured `render` fn) into
 * a flat, JSON-serialisable shape that any editor or tool can consume without
 * pulling in the renderer or the DOM.
 */

import type { ComponentLibrary, ComponentSpec, PropSpec } from "../library/types.js";
import { defaultLibrary } from "../library/index.js";

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
 * Returns an index of component name → entry for O(1) lookup. Convenient
 * inside editor extensions that need to render details on hover.
 */
export function indexCatalog(entries: ComponentEntry[]): Record<string, ComponentEntry> {
  const out: Record<string, ComponentEntry> = {};
  for (const entry of entries) out[entry.name] = entry;
  return out;
}
