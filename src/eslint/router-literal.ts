import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { isDeclaredInModuleGraph, withoutTypeOnlyWrappers } from "./props-literal.js";

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
export const aktionRouterLiteralRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require the route table of `$router(…)`, and the `routes` of each layout arm, to be an object literal written at the call site, without spreads",
      recommended: true,
    },
    messages: {
      tableNotLiteral:
        "`$router` reads its route table by syntax — pass an object literal written here and list every arm (`$router({ \"/\": Home(), default: NotFound() })`); anything else renders nothing.",
      armSpread:
        "Aktion reads route tables by syntax and skips spread entries, so these arms never match — list each arm explicitly.",
      routesNotLiteral:
        "A layout arm's `routes` is read by syntax — write the child routes as an object literal here; anything else leaves `outlet` empty.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    /** Check one route table literal: its spreads, then each layout arm in it. */
    const checkTable = (table: ESTree.ObjectExpression): void => {
      for (const entry of table.properties) {
        if (entry.type === "SpreadElement") {
          context.report({ node: entry, messageId: "armSpread" });
          continue;
        }
        const arm = withoutTypeOnlyWrappers(entry.value);
        if (arm.type === "ObjectExpression") checkArm(arm);
      }
    };

    /**
     * An arm written as an object literal is a layout arm when it has a
     * `layout` key; the evaluator reads it by syntax as well, skipping spreads
     * and keeping `routes` only when it is an object literal.
     */
    const checkArm = (arm: ESTree.ObjectExpression): void => {
      let isLayout = false;
      let routes: ESTree.Node | null = null;
      for (const entry of arm.properties) {
        if (entry.type === "SpreadElement") {
          context.report({ node: entry, messageId: "armSpread" });
          continue;
        }
        const key = staticKey(entry);
        if (key === "layout") isLayout = true;
        else if (key === "routes") routes = entry.value;
      }
      if (!isLayout || routes === null) return;
      const child = withoutTypeOnlyWrappers(routes);
      if (child.type === "ObjectExpression") checkTable(child);
      else context.report({ node: routes, messageId: "routesNotLiteral" });
    };

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "Identifier" || callee.name !== ROUTER) return;
        if (isDeclaredInModuleGraph(sourceCode, callee)) return;
        const first = node.arguments[0];
        if (!first) {
          context.report({ node, messageId: "tableNotLiteral" });
          return;
        }
        const table = withoutTypeOnlyWrappers(first);
        if (table.type === "ObjectExpression") checkTable(table);
        else context.report({ node: first, messageId: "tableNotLiteral" });
      },
    };
  },
};

/** The name of the router built-in. */
const ROUTER = "$router";

/** A property's key as the Aktion parser stores it; `null` for a computed key. */
function staticKey(property: ESTree.Property): string | null {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return null;
}
