// Negative corpus for the universal style channel, `$theme` and the style data
// types. Directive format: see negative.dsl.ts. Every case here is one the
// runtime ACCEPTS and silently drops (or mis-renders), so the types are what
// catch it — hence `[types]`.
import { $theme, Card, Text, type AvatarItemData, type SxProps } from "aktion-runtime/dsl";

// ---- sx keys and closed value sets -----------------------------------------
// @ts-expect-error TS2769 [types] there is no `_hover` — the runtime ignores unknown keys (use `hover`)
Text("x", { sx: { _hover: { bg: "primary" } } });
// @ts-expect-error TS2769 [types] `shadow` is closed: "xl" is dropped
Text("x", { sx: { shadow: "xl" } });
// @ts-expect-error TS2769 [types] `display` is closed: "inline-grid" is dropped
Text("x", { sx: { display: "inline-grid" } });
// @ts-expect-error TS2769 [types] font weights are the nine hundreds: 650 is dropped
Text("x", { sx: { weight: 650 } });
// @ts-expect-error TS2769 [types] `position` is closed
Text("x", { sx: { position: "center" } });
// @ts-expect-error TS2769 [types] `cursor` takes no breakpoint map (it collapses to its base value)
Text("x", { sx: { cursor: { base: "pointer", md: "text" } } });
// @ts-expect-error TS2769 [types] `backdrop` is a keyword, not a filter
Text("x", { sx: { backdrop: "blur(4px)" } });
// @ts-expect-error TS2769 [types] `bgSize` is cover or contain (anything else renders cover)
Text("x", { sx: { bgSize: "auto" } });
// @ts-expect-error TS2769 [types] an unknown layer token is not a z-index
Text("x", { sx: { zIndex: "header" } });
// @ts-expect-error TS2769 [types] `opacity` is a number or a numeric string: "50%" is dropped
Text("x", { sx: { opacity: "50%" } });
// @ts-expect-error TS2769 [types] a state's `opacity` is a number or a numeric string: "90%" is dropped
Text("x", { sx: { states: { hover: { opacity: "90%" } } } });
// @ts-expect-error TS2769 [types] `columns` is a count, not a grid template ("3fr" is dropped)
Text("x", { sx: { columns: "3fr" } });
// @ts-expect-error TS2769 [types] `grow` is a number or a numeric string: "auto" is dropped
Text("x", { sx: { grow: "auto" } });
// @ts-expect-error TS2769 [types] `wrap` is a boolean, not a flex-wrap keyword
Text("x", { sx: { wrap: "wrap-reverse" } });

// ---- interaction states ------------------------------------------------------
// @ts-expect-error TS2769 [types] focus has only the glow and border effects (no `ak-focus-lift` rule)
Text("x", { sx: { focus: "lift" } });
// @ts-expect-error TS2769 [types] an unknown state is dropped
Text("x", { sx: { states: { visited: { color: "primary" } } } });
// @ts-expect-error TS2769 [types] effect flags belong to `hover` / `focus`, not to `states`
Text("x", { sx: { states: { hover: { lift: true } } } });
// @ts-expect-error TS2769 [types] an effect flag is a boolean
Text("x", { sx: { hover: { lift: "yes" } } });

// ---- animate -------------------------------------------------------------------
// @ts-expect-error TS2769 [types] an unknown preset renders nothing
Text("x", { animate: "bogus" });
// @ts-expect-error TS2769 [types] `easing` is not read
Text("x", { animate: { preset: "fade", easing: "linear" } });
// @ts-expect-error TS2769 [types] timing without a preset renders nothing
Text("x", { animate: { duration: 300 } });
// @ts-expect-error TS2769 [types] `preset` and its alias `name` together — `name` would be ignored
Text("x", { animate: { preset: "fade", name: "spin" } });
// @ts-expect-error TS2769 [types] durations are milliseconds as a number ("300ms" is ignored)
Text("x", { animate: { preset: "fade", duration: "300ms" } });
// @ts-expect-error TS2769 [types] `repeat: false` does nothing (an infinite preset keeps looping)
Text("x", { animate: { preset: "pulse", repeat: false } });

// ---- the other universal props -------------------------------------------------
// @ts-expect-error TS2769 [types] `role` is allow-listed: "gridcell" is dropped
Text("x", { role: "gridcell" });
// @ts-expect-error TS2769 [types] `style` is a string: an object renders style="[object Object]"
Card([], { style: { color: "red" } });

// ---- $theme ----------------------------------------------------------------------
// @ts-expect-error TS2353 [types] an unknown colour token is dropped
$theme({ colors: { brandy: "#00ff00" } });
// @ts-expect-error TS2353 [types] `$theme` colour keys are camelCase (`bgSubtle`); kebab-case is dropped
$theme({ colors: { "bg-subtle": "#ffffff" } });
// @ts-expect-error TS2353 [types] there is no xl shadow token
$theme({ shadows: { xl: "none" } });
// @ts-expect-error TS2322 [types] a plain colour is not a gradient (it is dropped)
$theme({ gradients: { brand: "#ff0000" } });
// @ts-expect-error TS2322 [types] a gradient needs at least two stops
$theme({ gradients: { brand: ["#ff0000"] } });
// @ts-expect-error TS2353 [types] only the theme's gradient tokens can be set
$theme({ gradients: { sunset: ["#111111", "#222222"] } });
// @ts-expect-error TS2322 [types] a unitless radius is not a length
$theme({ radius: { button: 8 } });
// @ts-expect-error TS2353 [types] there is no 4xl spacing token
$theme({ spacing: { "4xl": "64px" } });

// ---- data shapes ------------------------------------------------------------------
// @ts-expect-error TS2322 an Avatar status is one of Avatar's own
export const member: AvatarItemData = { name: "Ada", status: "dnd" };
// @ts-expect-error TS2561 a stored sx object is checked too
export const stored: SxProps = { p: "md", _focus: { bg: "primary" } };
