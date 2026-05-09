/**
 * Theme tokens applied as CSS custom properties on the host element.
 *
 * Built-in themes:
 *   - "light"   (default)
 *   - "dark"
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

export const builtInThemes: Record<string, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
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

export function resolveTheme(input: ThemeInput | null | undefined): ThemeTokens {
  if (!input) return lightTheme;
  if (typeof input === "string") {
    const key = input.trim().toLowerCase();
    if (key.startsWith("{")) {
      try {
        return mergeTheme(JSON.parse(input) as Partial<ThemeTokens>);
      } catch {
        return lightTheme;
      }
    }
    return builtInThemes[key] ?? lightTheme;
  }
  return mergeTheme(input);
}

export function applyTheme(host: HTMLElement, tokens: ThemeTokens): void {
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS) as Array<[keyof ThemeTokens, string]>) {
    host.style.setProperty(cssVar, tokens[key]);
  }
}

function mergeTheme(partial: Partial<ThemeTokens>): ThemeTokens {
  return { ...lightTheme, ...partial };
}
