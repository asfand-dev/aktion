/**
 * Theme tokens applied as CSS custom properties on the host element.
 *
 * Built-in themes:
 *   - "light"      (default)
 *   - "dark"
 *   - "neon"       (cyberpunk-inspired, dark with glowing accents)
 *   - "pastel"     (soft, friendly, light & rounded)
 *   - "glass"      (frosted glass, translucent surfaces, vivid gradient bg)
 *   - "brutalist"  (neo-brutalism, hard edges, thick borders, bold colors)
 *   - "skyline"    (deep navy + cyan, crisp & calm)
 *
 * Consumers can also pass a JSON object via the `theme` attribute, or call
 * `element.setTheme({...})` to apply a fully custom token map.
 */

export interface ThemeTokens {
  colorBg: string;
  colorBgSubtle: string;
  colorSurface: string;
  colorSurfaceMuted: string;
  colorBorder: string;
  colorBorderSubtle: string;
  colorText: string;
  colorTextMuted: string;
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryText: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  colorInfo: string;
  fontFamily: string;
  fontFamilyMono: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  shadowSm: string;
  shadowMd: string;
  spacingXs: string;
  spacingS: string;
  spacingM: string;
  spacingL: string;
  spacingXl: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chart6: string;
}

const baseFonts = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

const baseSpacing = {
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "12px",
  spacingL: "20px",
  spacingXl: "32px",
} as const;

const baseRadii = {
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "16px",
} as const;

export const lightTheme: ThemeTokens = {
  colorBg: "#ffffff",
  colorBgSubtle: "#f8fafc",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f1f5f9",
  colorBorder: "#e2e8f0",
  colorBorderSubtle: "rgba(15, 23, 42, 0.08)",
  colorText: "#0f172a",
  colorTextMuted: "#475569",
  colorPrimary: "#6366f1",
  colorPrimaryHover: "#4f46e5",
  colorPrimaryText: "#ffffff",
  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorDanger: "#ef4444",
  colorInfo: "#06b6d4",
  shadowSm: "0 1px 2px rgba(15, 23, 42, 0.06)",
  shadowMd: "0 6px 24px rgba(15, 23, 42, 0.08)",
  chart1: "#6366f1",
  chart2: "#10b981",
  chart3: "#f59e0b",
  chart4: "#ef4444",
  chart5: "#06b6d4",
  chart6: "#8b5cf6",
  ...baseFonts,
  ...baseSpacing,
  ...baseRadii,
};

export const darkTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#0b1220",
  colorBgSubtle: "#0f172a",
  colorSurface: "#111827",
  colorSurfaceMuted: "#1e293b",
  colorBorder: "#1f2937",
  colorBorderSubtle: "rgba(248, 250, 252, 0.08)",
  colorText: "#f8fafc",
  colorTextMuted: "#94a3b8",
  colorPrimary: "#818cf8",
  colorPrimaryHover: "#6366f1",
  colorPrimaryText: "#0b1220",
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  shadowMd: "0 8px 24px rgba(0, 0, 0, 0.4)",
};

/**
 * Neon — cyberpunk-flavoured dark mode. Magenta/cyan glow, sharper corners,
 * monospace headings, and high-contrast surfaces.
 */
export const neonTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#05060f",
  colorBgSubtle: "#0a0c1c",
  colorSurface: "#0d1024",
  colorSurfaceMuted: "#161a36",
  colorBorder: "#2a2f6b",
  colorBorderSubtle: "rgba(236, 72, 153, 0.18)",
  colorText: "#f5f3ff",
  colorTextMuted: "#a5b4fc",
  colorPrimary: "#ec4899",
  colorPrimaryHover: "#f472b6",
  colorPrimaryText: "#05060f",
  colorSuccess: "#34d399",
  colorWarning: "#fbbf24",
  colorDanger: "#f87171",
  colorInfo: "#22d3ee",
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusSm: "2px",
  radiusMd: "4px",
  radiusLg: "6px",
  shadowSm: "0 0 0 1px rgba(236, 72, 153, 0.25), 0 0 12px rgba(34, 211, 238, 0.18)",
  shadowMd: "0 0 0 1px rgba(236, 72, 153, 0.35), 0 0 28px rgba(34, 211, 238, 0.22)",
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "14px",
  spacingL: "22px",
  spacingXl: "36px",
  chart1: "#ec4899",
  chart2: "#22d3ee",
  chart3: "#fbbf24",
  chart4: "#a78bfa",
  chart5: "#34d399",
  chart6: "#f472b6",
};

/**
 * Pastel — soft, friendly, light and rounded. Larger paddings, big radii,
 * lavender + mint palette, gentle shadows.
 */
export const pastelTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#fdf6ff",
  colorBgSubtle: "#fbf2ff",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4ecff",
  colorBorder: "#ead8ff",
  colorBorderSubtle: "rgba(168, 132, 232, 0.18)",
  colorText: "#3b1f56",
  colorTextMuted: "#7d6193",
  colorPrimary: "#a78bfa",
  colorPrimaryHover: "#8b5cf6",
  colorPrimaryText: "#ffffff",
  colorSuccess: "#5eead4",
  colorWarning: "#fcd34d",
  colorDanger: "#fda4af",
  colorInfo: "#93c5fd",
  fontFamily: "'Quicksand', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusSm: "12px",
  radiusMd: "20px",
  radiusLg: "28px",
  shadowSm: "0 4px 14px rgba(168, 132, 232, 0.12)",
  shadowMd: "0 18px 40px rgba(168, 132, 232, 0.18)",
  spacingXs: "6px",
  spacingS: "12px",
  spacingM: "18px",
  spacingL: "28px",
  spacingXl: "44px",
  chart1: "#a78bfa",
  chart2: "#5eead4",
  chart3: "#fcd34d",
  chart4: "#fda4af",
  chart5: "#93c5fd",
  chart6: "#f9a8d4",
};

/**
 * Glass — modern glassmorphism. Vivid gradient backdrop, frosted translucent
 * surfaces (real backdrop-filter blur applied via the stylesheet), generous
 * radii, and a cool indigo→cyan accent. Designed for hero sections and
 * marketing-style UIs.
 */
export const glassTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#0f1730",
  colorBgSubtle: "#13204a",
  colorSurface: "rgba(255, 255, 255, 0.08)",
  colorSurfaceMuted: "rgba(255, 255, 255, 0.04)",
  colorBorder: "rgba(255, 255, 255, 0.18)",
  colorBorderSubtle: "rgba(255, 255, 255, 0.10)",
  colorText: "#f1f5ff",
  colorTextMuted: "#b6c3e6",
  colorPrimary: "#60a5fa",
  colorPrimaryHover: "#3b82f6",
  colorPrimaryText: "#0b132b",
  colorSuccess: "#34d399",
  colorWarning: "#fbbf24",
  colorDanger: "#fb7185",
  colorInfo: "#22d3ee",
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusSm: "10px",
  radiusMd: "16px",
  radiusLg: "24px",
  shadowSm: "0 1px 2px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  shadowMd: "0 18px 50px rgba(7, 14, 33, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
  spacingXs: "4px",
  spacingS: "10px",
  spacingM: "16px",
  spacingL: "24px",
  spacingXl: "40px",
  chart1: "#60a5fa",
  chart2: "#22d3ee",
  chart3: "#a78bfa",
  chart4: "#f472b6",
  chart5: "#34d399",
  chart6: "#fbbf24",
};

/**
 * Brutalist — neo-brutalism. Hard 2px black borders, chunky offset shadows,
 * loud primary colors, all-caps display type, and zero gradients. Designed
 * to look hand-built and unapologetically bold.
 */
export const brutalistTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#fef9c3",
  colorBgSubtle: "#fde68a",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#fef3c7",
  colorBorder: "#0a0a0a",
  colorBorderSubtle: "#0a0a0a",
  colorText: "#0a0a0a",
  colorTextMuted: "#3f3f46",
  colorPrimary: "#1d4ed8",
  colorPrimaryHover: "#1e40af",
  colorPrimaryText: "#ffffff",
  colorSuccess: "#16a34a",
  colorWarning: "#ea580c",
  colorDanger: "#dc2626",
  colorInfo: "#0891b2",
  fontFamily: "'Space Grotesk', 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusSm: "0px",
  radiusMd: "0px",
  radiusLg: "0px",
  shadowSm: "3px 3px 0 0 #0a0a0a",
  shadowMd: "6px 6px 0 0 #0a0a0a",
  spacingXs: "4px",
  spacingS: "10px",
  spacingM: "16px",
  spacingL: "22px",
  spacingXl: "36px",
  chart1: "#dc2626",
  chart2: "#1d4ed8",
  chart3: "#16a34a",
  chart4: "#ea580c",
  chart5: "#7c3aed",
  chart6: "#0a0a0a",
};

/**
 * Skyline — enterprise cloud-console aesthetic. Deep navy primary, calm
 * cyan accents, very pale blue page background, white surfaces with crisp
 * 1px borders, small radii, and a clean Inter type stack. The look should
 * feel at home in an admin panel: dense, scannable, minimal chrome.
 */
export const skylineTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#eff2f7",
  colorBgSubtle: "#e6ecf3",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4f7fb",
  colorBorder: "#d6deea",
  colorBorderSubtle: "rgba(13, 27, 58, 0.08)",
  colorText: "#0d1b3a",
  colorTextMuted: "#5a6a85",
  colorPrimary: "#003580",
  colorPrimaryHover: "#002a66",
  colorPrimaryText: "#ffffff",
  colorSuccess: "#1b8f4f",
  colorWarning: "#c47e00",
  colorDanger: "#c8362b",
  colorInfo: "#0095d6",
  fontFamily: "'Inter', 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusSm: "4px",
  radiusMd: "6px",
  radiusLg: "10px",
  shadowSm: "0 1px 0 rgba(13, 27, 58, 0.04), 0 1px 3px rgba(13, 27, 58, 0.06)",
  shadowMd: "0 4px 16px rgba(13, 27, 58, 0.08), 0 1px 3px rgba(13, 27, 58, 0.04)",
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "14px",
  spacingL: "20px",
  spacingXl: "32px",
  chart1: "#003580",
  chart2: "#0095d6",
  chart3: "#1b8f4f",
  chart4: "#c47e00",
  chart5: "#d43594",
  chart6: "#5a6a85",
};

export const builtInThemes: Record<string, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
  neon: neonTheme,
  pastel: pastelTheme,
  glass: glassTheme,
  brutalist: brutalistTheme,
  skyline: skylineTheme,
};

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  colorBg: "--rui-color-bg",
  colorBgSubtle: "--rui-color-bg-subtle",
  colorSurface: "--rui-color-surface",
  colorSurfaceMuted: "--rui-color-surface-muted",
  colorBorder: "--rui-color-border",
  colorBorderSubtle: "--rui-color-border-subtle",
  colorText: "--rui-color-text",
  colorTextMuted: "--rui-color-text-muted",
  colorPrimary: "--rui-color-primary",
  colorPrimaryHover: "--rui-color-primary-hover",
  colorPrimaryText: "--rui-color-primary-text",
  colorSuccess: "--rui-color-success",
  colorWarning: "--rui-color-warning",
  colorDanger: "--rui-color-danger",
  colorInfo: "--rui-color-info",
  fontFamily: "--rui-font-family",
  fontFamilyMono: "--rui-font-family-mono",
  radiusSm: "--rui-radius-sm",
  radiusMd: "--rui-radius-md",
  radiusLg: "--rui-radius-lg",
  shadowSm: "--rui-shadow-sm",
  shadowMd: "--rui-shadow-md",
  spacingXs: "--rui-spacing-xs",
  spacingS: "--rui-spacing-s",
  spacingM: "--rui-spacing-m",
  spacingL: "--rui-spacing-l",
  spacingXl: "--rui-spacing-xl",
  chart1: "--rui-chart-1",
  chart2: "--rui-chart-2",
  chart3: "--rui-chart-3",
  chart4: "--rui-chart-4",
  chart5: "--rui-chart-5",
  chart6: "--rui-chart-6",
};

export type ThemeInput = string | Partial<ThemeTokens>;

export interface ResolvedTheme {
  /** Built-in theme name when known, otherwise "custom". Drives `data-rui-theme`. */
  name: string;
  tokens: ThemeTokens;
}

export function resolveTheme(input: ThemeInput | null | undefined): ResolvedTheme {
  if (!input) return { name: "light", tokens: lightTheme };
  if (typeof input === "string") {
    const key = input.trim().toLowerCase();
    if (key.startsWith("{")) {
      try {
        return { name: "custom", tokens: mergeTheme(JSON.parse(input) as Partial<ThemeTokens>) };
      } catch {
        return { name: "light", tokens: lightTheme };
      }
    }
    const tokens = builtInThemes[key];
    if (tokens) return { name: key, tokens };
    return { name: "light", tokens: lightTheme };
  }
  return { name: "custom", tokens: mergeTheme(input) };
}

/**
 * Apply theme tokens to the host element. Also sets `data-rui-theme` so the
 * shadow-DOM stylesheet can hook into theme-specific overrides (fonts,
 * gradients, animations, etc.) that go beyond raw token values.
 */
export function applyTheme(host: HTMLElement, theme: ResolvedTheme | ThemeTokens): void {
  const resolved: ResolvedTheme =
    "tokens" in theme ? theme : { name: "custom", tokens: theme };
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS) as Array<[keyof ThemeTokens, string]>) {
    host.style.setProperty(cssVar, resolved.tokens[key]);
  }
  host.setAttribute("data-rui-theme", resolved.name);
}

function mergeTheme(partial: Partial<ThemeTokens>): ThemeTokens {
  return { ...lightTheme, ...partial };
}
