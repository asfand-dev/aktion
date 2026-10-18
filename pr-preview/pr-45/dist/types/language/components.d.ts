import { ComponentLibrary } from '../library/types.js';
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
/**
 * Project a library's component specs into a flat catalog. Defaults to the
 * built-in `defaultLibrary`, but accepts a custom library so consumers that
 * register extra components via `registerComponents()` get the right autocomplete
 * data.
 */
export declare function getComponentCatalog(library?: ComponentLibrary): ComponentEntry[];
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
export declare const universalPropCatalog: readonly ComponentParam[];
/**
 * Returns an index of component name → entry for O(1) lookup. Convenient
 * inside editor extensions that need to render details on hover.
 */
export declare function indexCatalog(entries: ComponentEntry[]): Record<string, ComponentEntry>;
