/**
 * Single CSS bundle for the shadow root. Uses CSS custom properties so that
 * theme switches at the host element propagate without re-rendering.
 *
 * Built-in themes additionally hook into `:host([data-rui-theme="..."])`
 * overrides so that themes can change layout, fonts, animations, etc., not
 * only color tokens.
 */
/**
 * The whole sheet, as ONE template literal.
 *
 * WRITING IN HERE: never put a raw backtick in a CSS comment. It closes the literal
 * ~13k lines early, and what you get is an esbuild parse error in every test file in
 * the suite, pointing at whatever token happens to follow — a loud failure that says
 * nothing about the cause. Write a class name as .rui-link, not in backticks. (An
 * escaped \` works, and `${...}` interpolation is used deliberately below.)
 */
export declare const componentStyles: string;
