import type { ComponentLibrary, ComponentSpec } from "./types.js";

/**
 * Combines two libraries by name. Components from `extra` win on collision.
 * Useful when a consumer registers their own components alongside the
 * built-ins via `<streaming-ui-script>.registerComponents([...])`.
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

export function findComponent(library: ComponentLibrary, name: string): ComponentSpec | undefined {
  return library.components.find((c) => c.name === name);
}
