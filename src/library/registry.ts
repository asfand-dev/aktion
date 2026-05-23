import type { ComponentLibrary, ComponentSpec } from "./types.js";

/**
 * Cache of Map<name, spec> indexes keyed by the `components` array reference.
 * Lets `findComponent` run in O(1) while still treating libraries as
 * immutable arrays — when the library is replaced (e.g. after
 * `registerComponents`), the new array gets its own index automatically.
 */
const indexCache = new WeakMap<ReadonlyArray<ComponentSpec>, Map<string, ComponentSpec>>();

function getIndex(library: ComponentLibrary): Map<string, ComponentSpec> {
  let index = indexCache.get(library.components);
  if (!index) {
    index = new Map();
    for (const spec of library.components) {
      if (spec?.name) index.set(spec.name, spec);
    }
    indexCache.set(library.components, index);
  }
  return index;
}

/**
 * Combines two libraries by name. Components from `extra` win on collision.
 * Useful when a consumer registers their own components alongside the
 * built-ins via `<aktion-app>.registerComponents([...])`.
 */
export function mergeLibraries(
  base: ComponentLibrary,
  extra: { components: ReadonlyArray<ComponentSpec>; root?: string },
): ComponentLibrary {
  const map = new Map<string, ComponentSpec>();
  for (const c of base.components) map.set(c.name, c);
  for (const c of extra.components) map.set(c.name, c);
  return {
    root: extra.root ?? base.root,
    components: [...map.values()],
    componentGroups: base.componentGroups,
  };
}

/**
 * Resolve a component spec by name. O(1) thanks to the lazily-built index
 * cached against the library's `components` array.
 */
export function findComponent(library: ComponentLibrary, name: string): ComponentSpec | undefined {
  return getIndex(library).get(name);
}
