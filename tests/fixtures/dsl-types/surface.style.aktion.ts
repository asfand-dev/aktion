// Positive fixture for the universal style channel (`sx`, `animate`, `role`,
// `className`, `style`, …), the typed `$theme` groups and the icon-name type.
// It must type-check with and without the DOM lib; nothing here is expected to
// fail. The negative cases live in negative.style.dsl.ts.
import {
  $theme, Card, Column, Row, Text,
  type AktionIconName, type AktionIconRegistry, type AktionNode, type AnimateValue, type AvatarItemData,
  type SxProps, type ThemeConfig,
} from "aktion-runtime/dsl";

// An app registers its custom icon names once; they then autocomplete.
declare module "aktion-runtime/dsl" {
  interface AktionIconRegistry {
    logo: true;
  }
}

// ---- sx: every key, tokens, raw CSS, numbers (pixels), breakpoint maps ------

export function StyledCard(active: boolean): AktionNode {
  return Card([
    Text("Title", { sx: { fontSize: "xl", weight: 700, color: "text-muted", textAlign: "center", textDecoration: "underline" } }),
    Text("Body", { sx: { fontSize: 15, weight: "600", color: "#57606a" } }),
    Row([Text("a"), Text("b")], {
      sx: { gap: "md", px: { base: "sm", md: 24 }, py: 8, ps: "safe-left", pe: 0, align: "center", justify: "between", wrap: false },
    }),
    Column([Text("c")], {
      sx: { p: "safe", m: "auto", mx: "auto", my: -4, mt: "2xl", mr: "1rem", mb: 0, ml: "s", ms: "xs", me: "3xs", pt: "l", pr: "m", pb: "safe-bottom", pl: "2xs" },
    }),
  ], {
    sx: {
      w: "full", h: "screen-h", minW: 0, maxW: "60ch", minH: "dvh", maxH: { base: "none", lg: 640 }, basis: "half",
      top: 0, right: "auto", bottom: -8, left: "50%", inset: "0", position: "sticky", zIndex: "modal",
      bg: active ? "gradient.brand" : "surface", color: "primary-text", borderColor: "var(--rui-color-border)",
      border: active, radius: { base: "md", lg: 12 }, shadow: "lg", opacity: 0.9,
      display: { base: "block", md: "flex" }, direction: "row-reverse", grow: 1, shrink: 0, columns: { base: 1, md: 3 },
      overflow: "hidden", cursor: "pointer", backdrop: "blur",
      bgImage: "/hero.jpg", bgOverlay: "gradient.cool", bgSize: "contain",
      hover: { lift: true, bg: "primary-hover", scale: 1.02, translateY: -2, rotate: 3 },
      focus: "glow",
      states: {
        active: { scale: 0.98 },
        "focus-visible": { borderColor: "primary", shadow: "md" },
        disabled: { opacity: 0.5, cursor: "not-allowed" },
        "group-hover": { color: "primary", textDecoration: "underline", translateX: "4px" },
      },
    },
    animate: { preset: "fade-up", duration: 300, delay: 50, repeat: "infinite" },
    className: ["card", active ? "card--active" : ""],
    role: "region",
    style: "outline: 1px dashed currentColor",
    testId: 7,
    tooltip: 3,
  });
}

export const shorthandEffects = [
  Text("lift", { sx: { hover: "lift", focus: "border" } }),
  Text("scale", { sx: { hover: { scale: true, glow: true }, focus: { glow: true, bg: "bg-subtle" } } }),
  Text("radius", { sx: { radius: "pill", border: "subtle", bg: "linear-gradient(90deg, red, blue)" } }),
  Text("zIndex", { sx: { zIndex: 10, weight: "bold", fontSize: "clamp(1rem, 2vw, 2rem)" } }),
];

// ---- animate --------------------------------------------------------------

export const animations: AnimateValue[] = ["fade", "none", { name: "spin" }, { preset: "pulse", repeat: 3 }, { preset: "zoom-in", repeat: true }];
export const unstyled = Text("plain", { sx: null, animate: null, class: "a b" });

// ---- a stored style object ------------------------------------------------

export const panel: SxProps = { p: { base: 12, md: 24 }, bg: "bg-subtle", radius: "lg" };
export const panelled = Text("stored", { sx: panel });

// ---- $theme ---------------------------------------------------------------

export const theme: ThemeConfig = {
  name: "shadcn-dark",
  colors: { primary: "#0969da", bgSubtle: "#f6f8fa", onDanger: "#ffffff" },
  radius: { button: "999px", md: "6px" },
  font: { family: "Inter, sans-serif", size15: "15px", weightHeading: 700, weightBody: "400", import: "Inter:400,700" },
  spacing: { md: "14px", m: "14px", "3xs": "2px" },
  shadows: { lg: "0 8px 24px rgba(0,0,0,.2)" },
  gradients: {
    brand: ["#6366f1", "#ec4899"],
    warm: { stops: ["#f97316", "#facc15", "#ef4444"], angle: 45 },
    cool: "radial-gradient(#0ea5e9, #6366f1)",
  },
  zIndex: { modal: 2000, toast: "2100" },
  motion: { fast: "120ms", ease: "cubic-bezier(.2,0,0,1)" },
  fonts: { import: ["Inter:400,700", "JetBrains Mono:400"] },
  icons: { logo: "<svg viewBox='0 0 24 24'><path d='M0 0h24v24H0z'/></svg>" },
};
$theme(theme);
$theme({ gradients: { danger: "conic-gradient(red, blue)" }, fonts: { import: "Inter:400" } });

// ---- icons / avatar items -------------------------------------------------

export const icons: AktionIconName[] = ["house", "regular:star", "brands:github", "logo"];
export const registered: keyof AktionIconRegistry = "logo";
export const member: AvatarItemData = { name: 42, src: "/ada.png", status: "online", fallback: "dicebear" };
