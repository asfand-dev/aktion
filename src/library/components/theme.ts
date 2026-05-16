/**
 * In-script theming component.
 *
 * `Theme({...})` is a meta-construct: the evaluator intercepts the call and
 * emits a `ThemeNode` instead of a regular `ComponentNode`. The element picks
 * the value up between render cycles and applies the tokens as CSS custom
 * properties on the host. This file exists so the prompt generator,
 * playground autocomplete, and the language server all know the signature.
 *
 * Authors write:
 *
 *   theme = Theme({
 *     colorPrimary: "#0969da",
 *     fontFamily: "'Inter', system-ui, sans-serif",
 *     radiusButton: "6px",
 *   })
 *   root  = Stack([...])
 */

import type { ComponentSpec } from "../types.js";

export const Theme: ComponentSpec = {
  name: "Theme",
  description:
    "Apply a partial theme on top of the base theme. Pass an object of token → value pairs (colors, fonts, radii, spacing, button styling). Assigning the result to a top-level binding (conventionally `theme`) lets the runtime detect it and write the tokens to the host as CSS custom properties — the rest of the rendered UI picks them up instantly.",
  props: [
    {
      name: "tokens",
      type: "any",
      description:
        "Object literal of theme tokens. Keys must match `ThemeTokens` (e.g. colorPrimary, colorBg, fontFamily, fontFamilyHeading, fontSizeBase, radiusMd, radiusButton, borderWidth, shadowMd, buttonFontWeight, …). Unknown keys are ignored.",
    },
  ],
  // Theme(...) never produces UI — the evaluator captures it and short-
  // circuits before reaching this render fn. The no-op renderer is here so
  // the spec satisfies `ComponentSpec` for prompt / catalog generation.
  render: () => document.createDocumentFragment(),
};
