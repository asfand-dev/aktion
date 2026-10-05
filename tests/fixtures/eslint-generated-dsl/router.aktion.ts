// Lint fixture for `aktion/router-literal` (tests/eslint-generated-dsl.test.ts):
// `$router` reads its route table — and a layout arm's `routes` — by syntax.
// Type-checks cleanly: `RouteTable` is an index signature any object meets.
import { $router, Text, type RouteTable } from "aktion-runtime/dsl";

const routes: RouteTable = { "/": Text("home"), default: Text("not found") };
const base = { "/": Text("home") };
const kids = { "/a": Text("kid a") };

function makeRoutes(): RouteTable {
  return routes;
}

// Silent: literal tables, a cast the frontend erases, a literal layout arm.
export const literal = $router({ "/": Text("home"), default: Text("not found") });
export const cast = $router({ "/": Text("home") } as RouteTable);
export const layout = $router({
  "/x": { layout: Text("shell"), routes: { "/a": Text("kid a"), default: Text("kid default") } },
});

// Reported: the table is not an object literal.
export const fromVariable = $router(routes); // expect: tableNotLiteral
export const fromCall = $router(makeRoutes()); // expect: tableNotLiteral

// Reported: spread entries are skipped.
export const spreadArm = $router({ ...base, default: Text("not found") }); // expect: armSpread
export const layoutSpread = $router({ "/x": { layout: Text("shell"), routes: { ...kids, default: Text("d") } } }); // expect: armSpread

// Reported: a layout arm's `routes` must be a literal too.
export const layoutVariable = $router({ "/x": { layout: Text("shell"), routes: kids } }); // expect: routesNotLiteral
