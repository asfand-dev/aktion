/**
 * Single CSS bundle for the shadow root. Uses CSS custom properties so that
 * theme switches at the host element propagate without re-rendering.
 *
 * Built-in themes additionally hook into `:host([data-rui-theme="..."])`
 * overrides so that themes can change layout, fonts, animations, etc., not
 * only color tokens.
 */
export declare const componentStyles: string;
