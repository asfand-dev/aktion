/**
 * Theme marker for the runtime.
 *
 * The former `@`-builtin catalog (`@Count`, `@Filter`, `@Format`, …)
 * has been removed. Programs now reach for equivalent native
 * JavaScript or the `Util` namespace (see `./util.ts`).
 */

export type BuiltinFn = (args: unknown[]) => unknown;

/**
 * Empty registry kept as a structural placeholder so the parser's
 * synthetic `BuiltinCall` nodes (`__rui_assign__`, `__rui_postfix__`,
 * `__rui_prefix__`, `__rui_await__`) flow through the evaluator without
 * a surprise lookup.
 */
export const dataBuiltins: Record<string, BuiltinFn> = {};

/**
 * Marker emitted by the `Theme({...})` construct. Carries an arbitrary token
 * map that the element applies on top of the base theme between render
 * cycles. Distinct from `ComponentNode` so the renderer can ignore it (it is
 * a side-effect, not a piece of UI to draw).
 *
 * Authors declare a theme like any other top-level binding:
 *
 *   theme = Theme({ colors: { primary: "#0969da" }, radius: { button: "6px" } })
 *   root  = Stack([...])
 */
export interface ThemeNode {
  kind: "Theme";
  tokens: Record<string, string>;
}

export const isThemeNode = (value: unknown): value is ThemeNode => {
  return Boolean(
    value && typeof value === "object" &&
    (value as { kind?: unknown }).kind === "Theme",
  );
};
