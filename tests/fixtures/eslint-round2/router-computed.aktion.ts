// Lint fixture for `aktion/router-literal` (tests/tooling-round2-router-literal.test.ts):
// `$router` reads each arm's path by syntax and ignores a computed one (the
// compiler's E127 for `.aktion.ts` / `.aktion.js` modules). Type-checks
// cleanly: `RouteTable` is an index signature any string key meets.
import { $router, Text } from "aktion-runtime/dsl";

const path = "/users";

// Silent: string and identifier keys.
export const literal = $router({ "/": Text("home"), default: Text("not found") });
export const nested = $router({ "/x": { layout: Text("shell"), routes: { "/a": Text("kid a"), default: Text("kid") } } });

// Reported: a computed path, also when it is a string literal, also in a layout arm's routes.
export const computed = $router({ [path]: Text("users"), default: Text("not found") }); // expect: armComputed
export const computedLiteral = $router({ ["/"]: Text("home"), default: Text("not found") }); // expect: armComputed
export const computedChild = $router({ "/x": { layout: Text("shell"), routes: { [path]: Text("kid") } } }); // expect: armComputed
