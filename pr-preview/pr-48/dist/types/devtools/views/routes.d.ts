import { ViewDefinition } from '../context.js';
import { RouteEvent, RouteInfo } from '../protocol.js';
/** A `:param` / `*` segment of a declared pattern. */
interface PatternParam {
    name: string;
    wildcard: boolean;
}
export declare function patternParams(pattern: string): PatternParam[];
/**
 * Build a concrete path from a pattern and param values, or `null` while a
 * required param is empty. Values are URI-encoded (the router decodes them).
 */
export declare function buildPath(pattern: string, values: Record<string, string>): string | null;
/** The first declared arm matching `path`, in declaration order (how `$router` picks). */
export declare function firstMatch(declared: ReadonlyArray<string>, path: string): {
    pattern: string;
    params: Record<string, string>;
} | null;
/** Route coverage for this session: which declared patterns were ever matched. */
export declare function routeCoverage(declared: ReadonlyArray<string>, history: ReadonlyArray<RouteEvent>, current: RouteInfo | null): {
    visited: Set<string>;
    counts: Map<string, number>;
};
export declare const routesView: ViewDefinition;
export {};
