import { DeclParam, Expression } from './types.js';
/**
 * The name a caller uses for a component parameter: its `publicName` when a
 * compiler pass renamed the local binding (the TS/JS frontend's hygienic
 * renaming), else the declared `name`. Everything that is part of the
 * calling convention BY NAME — matching named props, binding them, and
 * telling a named slot apart from a parameter — goes through this; the value
 * itself is always bound to the local `name`.
 */
export declare function componentParamPublicName(param: DeclParam): string;
/** True when the last parameter is `...rest`. */
export declare function hasRestParam(params: ReadonlyArray<DeclParam>): boolean;
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
export declare function trailingPropsArgument(args: ReadonlyArray<Expression>, params: ReadonlyArray<DeclParam>): TrailingPropsArgument | null;
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
export declare function positionalKeyArguments(args: ReadonlyArray<Expression>, params: ReadonlyArray<DeclParam>): number[];
