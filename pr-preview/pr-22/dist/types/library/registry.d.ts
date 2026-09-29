import { ComponentLibrary, ComponentSpec } from './types.js';
/**
 * Combines two libraries by name. Components from `extra` win on collision.
 * Useful when a consumer registers their own components alongside the
 * built-ins via `<aktion-app>.registerComponents([...])`.
 */
export declare function mergeLibraries(base: ComponentLibrary, extra: {
    components: ReadonlyArray<ComponentSpec>;
    root?: string;
}): ComponentLibrary;
/**
 * Resolve a component spec by name. O(1) thanks to the lazily-built index
 * cached against the library's `components` array.
 */
export declare function findComponent(library: ComponentLibrary, name: string): ComponentSpec | undefined;
