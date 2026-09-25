/**
 * Theme marker for the runtime.
 *
 * The former `@`-builtin catalog (`@Count`, `@Filter`, `@Format`, …)
 * has been removed. Programs now reach for equivalent native
 * JavaScript or the `Util` namespace (see `./util.ts`).
 */
/**
 * Marker emitted by the `Theme({...})` construct. Carries an arbitrary token
 * map that the element applies on top of the base theme between render
 * cycles. Distinct from `ComponentNode` so the renderer can ignore it (it is
 * a side-effect, not a piece of UI to draw).
 *
 * Authors apply a theme with a bare top-level `$theme({...})` statement
 * (no binding needed); the equivalent `theme = $theme({...})` form also
 * works and registers the same reserved `theme` binding:
 *
 *   $theme({ colors: { primary: "#0969da" }, radius: { button: "6px" } })
 *   root = Stack([...])
 */
export interface ThemeNode {
    kind: "Theme";
    tokens: Record<string, string>;
}
export declare const isThemeNode: (value: unknown) => value is ThemeNode;
