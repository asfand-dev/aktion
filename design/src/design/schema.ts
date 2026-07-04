/**
 * Runtime bridge to Aktion. Client-only: importing `aktion-runtime` registers
 * the `<aktion-app>` custom element as a side effect, so everything here is
 * loaded lazily via dynamic import and must never run on the server.
 *
 * The component palette and property inspector are driven entirely by
 * Aktion's own `componentSchema()` — components added to Aktion show up here
 * with zero changes to the design app.
 */
import { CATEGORY_RULES, CURATED_ORDER } from "./presets";

export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
  positional: boolean;
  required: boolean;
  enum?: readonly string[];
  description?: string;
}

export interface ComponentInfo {
  name: string;
  description: string;
  category: string;
  props: PropInfo[];
  positional: PropInfo | null;
  /** True when the positional slot (or a `children` prop) accepts nodes. */
  acceptsChildren: boolean;
  /**
   * True when the POSITIONAL prop itself hosts child nodes/components
   * (Node/Node[] or component-typed arrays like AccordionItem[]) — the slot
   * design-node children render into.
   */
  positionalIsChildSlot: boolean;
}

export interface SchemaIndex {
  components: ComponentInfo[];
  byName: Map<string, ComponentInfo>;
  categories: { name: string; components: ComponentInfo[] }[];
  themes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AktionModule = any;

let modPromise: Promise<AktionModule> | null = null;

/** Load (and cache) the Aktion runtime module. Registers <aktion-app>. */
export function loadAktion(): Promise<AktionModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("aktion-runtime is client-only"));
  }
  if (!modPromise) modPromise = import("aktion-runtime");
  return modPromise;
}

let indexPromise: Promise<SchemaIndex> | null = null;

/** Build (and cache) the schema index from the live Aktion library. */
export function getSchemaIndex(): Promise<SchemaIndex> {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

async function buildIndex(): Promise<SchemaIndex> {
  const aktion = await loadAktion();
  const schema =
    typeof aktion.componentSchema === "function"
      ? aktion.componentSchema(aktion.defaultLibrary)
      : fallbackSchema(aktion.defaultLibrary);

  // Aktion's own group metadata is the authoritative categorization; the
  // curated rules below only cover libraries without groups.
  const groupOf = new Map<string, string>();
  for (const group of aktion.defaultLibrary?.componentGroups ?? []) {
    for (const name of group.components ?? []) {
      if (!groupOf.has(name)) groupOf.set(name, group.name);
    }
  }

  // All registered component names — used to recognize component-typed item
  // arrays (e.g. Accordion's `AccordionItem[]`) as real child slots.
  const allNames = new Set(
    (schema.components as Array<{ name: string }>).map((c) => c.name),
  );
  const isChildSlotType = (type: string): boolean => {
    if (/Node/.test(type)) return true;
    // "AccordionItem[]", "BentoCell[]", "Col[]", "ListItem[] | string[]"...
    for (const part of type.split("|")) {
      const m = part.trim().match(/^([A-Za-z][A-Za-z0-9]*)\[\]$/);
      if (m && allNames.has(m[1])) return true;
    }
    return false;
  };

  const components: ComponentInfo[] = [];
  for (const entry of schema.components as Array<{
    name: string;
    description: string;
    props: PropInfo[];
  }>) {
    if (HIDDEN.has(entry.name)) continue;
    const props: PropInfo[] = entry.props.map((p) => ({ ...p }));
    const positional =
      props.find((p) => p.positional) ?? (props.length > 0 ? props[0] : null);
    const positionalIsChildSlot =
      positional != null && isChildSlotType(positional.type);
    const acceptsChildren =
      positionalIsChildSlot ||
      props.some((p) => p.name === "children" && /Node/.test(p.type));
    components.push({
      name: entry.name,
      description: entry.description ?? "",
      category:
        groupOf.get(entry.name) ?? categorize(entry.name, entry.description ?? ""),
      props,
      positional,
      acceptsChildren,
      positionalIsChildSlot,
    });
  }
  components.sort((a, b) => a.name.localeCompare(b.name));

  const byName = new Map(components.map((c) => [c.name, c]));

  const grouped = new Map<string, ComponentInfo[]>();
  for (const c of components) {
    const list = grouped.get(c.category) ?? [];
    list.push(c);
    grouped.set(c.category, list);
  }
  const categories = CURATED_ORDER.filter((name) => grouped.has(name)).map(
    (name) => ({ name, components: grouped.get(name)! }),
  );
  for (const [name, list] of grouped) {
    if (!CURATED_ORDER.includes(name)) categories.push({ name, components: list });
  }

  const themes = Object.keys(aktion.builtInThemes ?? {});

  return { components, byName, categories, themes };
}

/**
 * Fallback for runtimes that predate the `componentSchema` export
 * (aktion-runtime <= 0.5.15 on npm): derive the same shape straight from the
 * library's component specs.
 */
function fallbackSchema(library: {
  components?: ReadonlyArray<{
    name: string;
    description?: string;
    props?: ReadonlyArray<{
      name: string;
      type: string;
      optional?: boolean;
      positional?: boolean;
      required?: boolean;
      enum?: readonly string[];
      description?: string;
    }>;
  }>;
}): { components: Array<{ name: string; description: string; props: PropInfo[] }> } {
  const components = (library?.components ?? []).map((spec) => {
    const props = spec.props ?? [];
    const positionalIndex = Math.max(
      0,
      props.findIndex((p) => p.positional === true),
    );
    return {
      name: spec.name,
      description: spec.description ?? "",
      props: props.map((p, i) => ({
        name: p.name,
        type: String(p.type ?? "any"),
        optional: p.optional !== false,
        positional: props.some((q) => q.positional)
          ? p.positional === true
          : i === positionalIndex && props.length > 0,
        required: p.required === true,
        enum: p.enum,
        description: p.description,
      })),
    };
  });
  return { components };
}

/** Components that make no sense as canvas objects. */
const HIDDEN = new Set([
  "Fragment",
  "Portal",
  "Router",
  "Mount",
  "WebComponent",
  "Suspense",
]);

function categorize(name: string, description: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.names?.includes(name)) return rule.category;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern?.test(name) || (rule.descPattern && rule.descPattern.test(description))) {
      return rule.category;
    }
  }
  return "Other";
}
