import { Rule } from 'eslint';
/**
 * `aktion/router-literal` — the route table of `$router(…)` must be an object
 * literal written at the call site, without spreads, and so must the
 * `routes` of every layout arm in it.
 *
 * The runtime reads the table by SYNTAX (`evaluateRouterCall` in
 * `src/runtime/evaluator.ts`): it walks the properties of the literal
 * argument so that only the matching arm is evaluated. Anything else is lost
 * without a type error, since the generated declarations type the table as
 * `RouteTable`, an index signature any object satisfies:
 *
 * - a table that is not an object literal (`$router(routes)`, `$router(pages())`)
 *   → `tableNotLiteral`: the call logs `$router expects an object literal of
 *   route arms` and renders nothing;
 * - a spread entry in the table, in a layout arm, or in a layout arm's
 *   `routes` (`$router({ ...base, default: NotFound() })`) → `armSpread`: the
 *   evaluator skips spread entries (`if (prop.spread) continue`), so those arms
 *   never match;
 * - a computed path in the table or in a layout arm's `routes`
 *   (`$router({ [path]: Page() })`, `["/"]` too) → `armComputed`: the arm is
 *   ignored and the router falls through to `default` (the compiler's E127
 *   for these modules);
 * - a layout arm (an object literal with a `layout` key) whose `routes` is not
 *   an object literal (`{ layout: Shell(outlet), routes: children }`) →
 *   `routesNotLiteral`: `asLayoutArm` keeps `routes` only when it is a literal,
 *   so the layout renders with an empty `outlet`.
 *
 * Purely syntactic, so it needs no type information. Like
 * `aktion/props-literal` it checks `$router` only where the module graph does
 * not declare it: imported from `aktion-runtime/dsl`, or not declared at all
 * (the ambient `aktion-runtime/dsl-globals` flavour). TypeScript-only
 * wrappers (`as`, `satisfies`, `!`, `<T>x`) are looked through, because the
 * `.aktion.ts` frontend erases them before Aktion parses the module. No
 * autofix: the arms a variable or spread holds are not visible here.
 */
export declare const aktionRouterLiteralRule: Rule.RuleModule;
