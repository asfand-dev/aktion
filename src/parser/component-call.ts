/**
 * How a call's arguments bind to a user component's parameters — the part
 * decided by the shape of the call and the declaration alone, before any
 * argument is evaluated.
 *
 * Shared by the evaluator, which binds the arguments (`invokeComponentDecl`,
 * `invokeComponentDeclPositionally`), and the printer, which has to write a
 * call whose text binds them the same way once it is parsed again
 * (`printProgram`). Keeping one copy is what stops the two from drifting.
 */

import type { DeclParam, Expression, ObjectExpr } from "./types.js";

/**
 * The name a caller uses for a component parameter: its `publicName` when a
 * compiler pass renamed the local binding (the TS/JS frontend's hygienic
 * renaming), else the declared `name`. Everything that is part of the
 * calling convention BY NAME — matching named props, binding them, and
 * telling a named slot apart from a parameter — goes through this; the value
 * itself is always bound to the local `name`.
 */
export function componentParamPublicName(param: DeclParam): string {
  return param.publicName ?? param.name;
}

/** True when the last parameter is `...rest`. */
export function hasRestParam(params: ReadonlyArray<DeclParam>): boolean {
  return params.length > 0 && params[params.length - 1]!.rest === true;
}

/** The rightmost object-literal argument of a call, and whether it binds as named props. */
export interface TrailingPropsArgument {
  /** Its index in the call's arguments. */
  index: number;
  /**
   * The DSL convention: `true` when its properties bind as named props (and
   * `key:` as the instance identity) instead of the whole object being one
   * positional value.
   */
  named: boolean;
}

/** An identifier-shaped key — the only kind that can name a slot. */
const IDENTIFIER_KEY = /^[A-Za-z_$][\w$]*$/;

/**
 * DSL argument binding (every call except a `CallExpr.positional` one that
 * reaches a `.aktion.js` / `.aktion.ts` component): the rightmost
 * object-literal argument binds as named props when one of its keys is
 * `key` or a parameter's public name, or — for identifier keys only, and
 * not for a component with a `...rest` parameter — when the arguments before
 * it already fill every parameter (named slots: `Panel(body, { header })`).
 * Otherwise it is passed positionally, so an opaque data object
 * (`Foo({ data })`) reaches the parameter at its position. `null` when the
 * call has no object-literal argument.
 */
export function trailingPropsArgument(
  args: ReadonlyArray<Expression>,
  params: ReadonlyArray<DeclParam>,
): TrailingPropsArgument | null {
  let index = -1;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i]!.kind === "Object") {
      index = i;
      break;
    }
  }
  if (index < 0) return null;
  const object = args[index] as ObjectExpr;
  const publicNames = new Set(params.map(componentParamPublicName));
  let named = false;
  let keys = 0;
  let identifierKeys = true;
  for (const prop of object.properties) {
    if (prop.spread) continue;
    keys += 1;
    if (prop.key === "key" || publicNames.has(prop.key)) named = true;
    if (!IDENTIFIER_KEY.test(prop.key)) identifierKeys = false;
  }
  if (!named && identifierKeys && keys > 0 && !hasRestParam(params) && args.length - 1 >= params.length) {
    named = true;
  }
  return { index, named };
}

/**
 * JavaScript argument binding (`CallExpr.positional` reaching a component
 * declared in a `.aktion.js` / `.aktion.ts` module): every argument binds to
 * the parameter at its position, and the only DSL convention kept is `key:`
 * as the instance identity. It is read from the object-literal arguments
 * listed here, in order, when their value has an own `key` (the last one
 * wins): one passed BEYOND the declared parameters of a component without a
 * `...rest` parameter (`Row(item, { key: item.id })` for `function Row(item)`),
 * or the LAST argument when `key` is its only property
 * (`Item(id, { key: id })` for `function Item(label, _opts)`).
 */
export function positionalKeyArguments(
  args: ReadonlyArray<Expression>,
  params: ReadonlyArray<DeclParam>,
): number[] {
  const out: number[] = [];
  const rest = hasRestParam(params);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg.kind !== "Object") continue;
    const keyOnly = i === args.length - 1 && arg.properties.length === 1 &&
      !arg.properties[0]!.spread && arg.properties[0]!.key === "key";
    if (keyOnly || (i >= params.length && !rest)) out.push(i);
  }
  return out;
}
