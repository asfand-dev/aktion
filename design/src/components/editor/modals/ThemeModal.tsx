"use client";
/**
 * Project theme editor: pick a built-in base, then layer grouped
 * `$theme({...})` overrides (brand colors, surfaces, roundness, density,
 * elevation, fonts). Edits apply live — every frame on the canvas re-renders
 * with the new brand — and the generated statement is shown verbatim.
 */
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { useEditor } from "@/store/editor-store";
import type { PropValue } from "@/design/types";
import { themeStatement } from "@/design/codegen";
import {
  THEME_COLOR_SECTIONS,
  THEME_DENSITY_PRESETS,
  THEME_FONTS,
  THEME_PRESETS,
  THEME_RADIUS_PRESETS,
  THEME_SHADOW_PRESETS,
} from "@/design/presets";
import { Button, Modal, Segmented } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tokens = Record<string, PropValue>;
type Group = Record<string, PropValue>;

const BASE_THEMES = ["light", "dark", "corporate", "soft", "glass", "modern"];

export default function ThemeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const doc = useEditor((s) => s.document);
  const readOnly = useEditor((s) => s.readOnly);
  const setTheme = useEditor((s) => s.setTheme);
  const setThemeTokens = useEditor((s) => s.setThemeTokens);

  const tokens: Tokens = useMemo(
    () => (doc.themeTokens ? { ...(doc.themeTokens as Tokens) } : {}),
    [doc.themeTokens],
  );
  const baseTheme =
    typeof tokens.name === "string" ? (tokens.name as string) : doc.theme || "light";

  const groupOf = (name: string): Group => {
    const g = tokens[name];
    return g && typeof g === "object" && !Array.isArray(g) ? { ...(g as Group) } : {};
  };

  /** Write a patch into a token group; empty values delete keys/groups. */
  const patchGroup = (name: string, patch: Group | null) => {
    if (readOnly) return;
    const next: Tokens = { ...tokens, name: baseTheme };
    if (patch === null) {
      delete next[name];
    } else {
      const merged = { ...groupOf(name) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v === null || v === undefined) delete merged[k];
        else merged[k] = v;
      }
      if (Object.keys(merged).length === 0) delete next[name];
      else next[name] = merged as PropValue;
    }
    const hasOverrides = Object.keys(next).some((k) => k !== "name");
    setThemeTokens(hasOverrides ? next : null);
  };

  const setBase = (name: string) => {
    if (readOnly) return;
    const hasOverrides = Object.keys(tokens).some((k) => k !== "name");
    if (hasOverrides) setThemeTokens({ ...tokens, name });
    else setTheme(name);
  };

  const colors = groupOf("colors");
  const font = groupOf("font");

  // Which preset (if any) matches the current group values.
  const activePreset = (
    presets: Record<string, Record<string, string> | null>,
    group: Group,
  ): string => {
    for (const [label, values] of Object.entries(presets)) {
      if (values === null) continue;
      if (
        Object.entries(values).every(([k, v]) => group[k] === v) &&
        Object.keys(group).length === Object.keys(values).length
      ) {
        return label;
      }
    }
    return "Default";
  };

  const fontIdFor = (family: unknown): string =>
    THEME_FONTS.find((f) => f.family === family)?.id ?? "default";

  const applyFont = (slot: "family" | "familyHeading", id: string) => {
    const choice = THEME_FONTS.find((f) => f.id === id);
    patchGroup("font", { [slot]: choice?.family ?? "" });
    // Keep the web-font import list in sync with the selected families.
    const nextFont = { ...font, [slot]: choice?.family ?? "" };
    const imports = THEME_FONTS.filter(
      (f) => f.import && (f.family === nextFont.family || f.family === nextFont.familyHeading),
    ).map((f) => f.import as string);
    patchGroup("fonts", imports.length ? { import: imports as unknown as PropValue } : null);
  };

  const statement = themeStatement(doc);

  return (
    <Modal open={open} onClose={onClose} title="Project theme" width={560}>
      <div className="space-y-5">
        {/* Base theme */}
        <section>
          <SectionLabel>Base theme</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {BASE_THEMES.map((name) => (
              <button
                key={name}
                disabled={readOnly}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs capitalize",
                  baseTheme === name
                    ? "border-accent bg-accent-muted text-text-1"
                    : "border-border-1 text-text-2 hover:border-border-1 hover:text-text-1",
                )}
                onClick={() => setBase(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        {/* Brand presets */}
        <section>
          <SectionLabel>Brand presets</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.name}
                disabled={readOnly}
                title={p.name}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]",
                  colors.primary === p.primary
                    ? "border-accent text-text-1"
                    : "border-border-1 text-text-2 hover:text-text-1",
                )}
                onClick={() =>
                  patchGroup("colors", {
                    primary: p.primary,
                    primaryHover: p.primaryHover,
                    accent: p.accent,
                  })
                }
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.accent})` }}
                />
                {p.name}
              </button>
            ))}
          </div>
        </section>

        {/* Colors */}
        {THEME_COLOR_SECTIONS.map((section) => (
          <section key={section.label}>
            <SectionLabel>{section.label}</SectionLabel>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {section.fields.map((field) => {
                const value = typeof colors[field.key] === "string" ? (colors[field.key] as string) : "";
                return (
                  <div key={field.key} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 truncate text-xs text-text-2">
                      {field.label}
                    </label>
                    <span className="checkerboard relative h-6 w-6 shrink-0 overflow-hidden rounded border border-border-1">
                      <input
                        type="color"
                        disabled={readOnly}
                        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#888888"}
                        className="absolute -left-1 -top-1 h-9 w-9 cursor-pointer"
                        onChange={(e) => patchGroup("colors", { [field.key]: e.target.value })}
                      />
                      {value && (
                        <span
                          className="pointer-events-none absolute inset-0"
                          style={{ background: value }}
                        />
                      )}
                    </span>
                    <input
                      type="text"
                      disabled={readOnly}
                      placeholder="default"
                      value={value}
                      className="h-6 w-full min-w-0 rounded border border-border-1 bg-bg-2 px-1.5 text-[11px] text-text-1 placeholder:text-text-3 focus:border-accent focus:outline-none"
                      onChange={(e) => patchGroup("colors", { [field.key]: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Shape / density / elevation */}
        <section className="grid grid-cols-1 gap-3">
          <PresetRow
            label="Roundness"
            presets={THEME_RADIUS_PRESETS}
            active={activePreset(THEME_RADIUS_PRESETS, groupOf("radius"))}
            disabled={readOnly}
            onPick={(label) =>
              THEME_RADIUS_PRESETS[label]
                ? patchGroup("radius", THEME_RADIUS_PRESETS[label])
                : patchGroup("radius", null)
            }
          />
          <PresetRow
            label="Density"
            presets={THEME_DENSITY_PRESETS}
            active={activePreset(THEME_DENSITY_PRESETS, groupOf("spacing"))}
            disabled={readOnly}
            onPick={(label) =>
              THEME_DENSITY_PRESETS[label]
                ? patchGroup("spacing", THEME_DENSITY_PRESETS[label])
                : patchGroup("spacing", null)
            }
          />
          <PresetRow
            label="Elevation"
            presets={THEME_SHADOW_PRESETS}
            active={activePreset(THEME_SHADOW_PRESETS, groupOf("shadows"))}
            disabled={readOnly}
            onPick={(label) =>
              THEME_SHADOW_PRESETS[label]
                ? patchGroup("shadows", THEME_SHADOW_PRESETS[label])
                : patchGroup("shadows", null)
            }
          />
        </section>

        {/* Fonts */}
        <section>
          <SectionLabel>Typography</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <FontSelect
              label="Body font"
              value={fontIdFor(font.family)}
              disabled={readOnly}
              onChange={(id) => applyFont("family", id)}
            />
            <FontSelect
              label="Heading font"
              value={fontIdFor(font.familyHeading)}
              disabled={readOnly}
              onChange={(id) => applyFont("familyHeading", id)}
            />
          </div>
        </section>

        {/* Generated statement */}
        <section>
          <SectionLabel>Generated code</SectionLabel>
          <pre className="max-h-32 overflow-auto rounded-lg border border-border-0 bg-bg-0 p-2.5 font-mono text-[10.5px] leading-relaxed text-text-2">
            {statement ?? `// No overrides — using the "${baseTheme}" theme as-is`}
          </pre>
        </section>

        <div className="flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly || !doc.themeTokens}
            onClick={() => setThemeTokens(null)}
          >
            <RotateCcw size={12} />
            Reset overrides
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-3">
      {children}
    </div>
  );
}

function PresetRow({
  label,
  presets,
  active,
  disabled,
  onPick,
}: {
  label: string;
  presets: Record<string, Record<string, string> | null>;
  active: string;
  disabled: boolean;
  onPick: (label: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-text-2">{label}</span>
      <Segmented
        className="flex-1"
        value={active}
        onChange={(v) => !disabled && onPick(v)}
        options={Object.keys(presets).map((name) => ({ value: name, label: name }))}
      />
    </div>
  );
}

function FontSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-2">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full rounded-md border border-border-1 bg-bg-2 px-1.5 text-xs text-text-1 focus:border-accent focus:outline-none"
      >
        {THEME_FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}
