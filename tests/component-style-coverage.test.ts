/**
 * Every class a component emits must reach the stylesheet.
 *
 * The failure this guards is silent by construction: a component renders
 * `<span class="rui-slider-mark">`, the sheet has no rule for it, nothing
 * throws, no snapshot changes, and the only symptom is a control that looks
 * half-built. A sweep found 143 such classes at once — slider ticks with no
 * positioning, a Modal body with no gap between its children, a QueryBuilder
 * row whose four `width: 100%` controls fought over one line, and a raw UA
 * checkbox sitting inside a DataGrid full of CSS-painted ones.
 *
 * So the sweep is the test. Every `rui-*` class the library assigns has to be
 * either styled or on the allowlist below, with a reason. Adding a class and
 * forgetting its rule now fails here instead of shipping.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { componentStyles } from "../src/theme/styles.js";

/* -------------------------------------------------------------------------- */
/*  Collecting what the library emits                                         */
/* -------------------------------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    // styles.ts is the sheet, not a caller.
    else if (p.endsWith(".ts") && !p.endsWith("styles.ts")) out.push(p);
  }
  return out;
}

/**
 * The three shapes the library uses to put a class on an element. Anything else
 * matching `rui-*` in the source is a CSS variable, a `data-` attribute, a DOM
 * id or an instance-state key, none of which the sheet should know about.
 */
const CLASS_SITES: RegExp[] = [
  /class:\s*"([^"]+)"/g,
  /class:\s*`([^`$]+)`/g,
  /classList\.(?:add|toggle|remove)\("([^"]+)"/g,
];

function emittedClasses(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    const short = file.replaceAll("\\", "/");
    for (const re of CLASS_SITES) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        for (const cls of m[1]!.trim().split(/\s+/)) {
          if (!cls.startsWith("rui-")) continue;
          if (!found.has(cls)) found.set(cls, new Set());
          found.get(cls)!.add(short);
        }
      }
    }
  }
  return found;
}

/** Class names that appear in a selector somewhere in the sheet. */
function styledClasses(): Set<string> {
  const declarations = componentStyles.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  return new Set(declarations.match(/(?<=\.)rui-[a-z0-9]+(?:-{1,2}[a-z0-9]+)*/g) ?? []);
}

/* -------------------------------------------------------------------------- */
/*  The allowlist                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A class with no rule of its own, and why that is correct.
 *
 * Three legitimate reasons appear here, and nothing else should:
 *   - **hook** — the element already carries a styled class; this one exists so
 *     a theme, a test or an author's CSS can target that one instance.
 *   - **behaviour** — the element is a marker with no box: `display: contents`
 *     wrappers, hidden inputs, portal anchors, `<col>` sizing elements.
 *   - **inline geometry** — only the render knows the number (a virtualiser's
 *     translate offset, a spacer's computed height), so it is set inline and
 *     there is nothing left for a rule to say.
 */
const UNSTYLED_BY_DESIGN: Readonly<Record<string, string>> = {
  /* hook: rides on an already-styled sibling class */
  "rui-heatmap-value": "hook on .rui-heatmap-cell",
  "rui-calendar-nav-button": "hook on .rui-data-grid-page-button",
  "rui-fieldset-error": "hook on .rui-field-error",
  "rui-file-upload-error": "hook on .rui-field-error",
  "rui-form-error": "hook on .rui-field-error",
  "rui-inbox-panel-loading": "hook on .rui-inbox-panel-empty",
  "rui-drawer": "hook on .rui-sheet",
  "rui-drawer-header": "hook on .rui-sheet-header",
  "rui-drawer-footer": "hook on .rui-sheet-footer",
  "rui-topbar-left": "hook on .rui-topbar-side",
  "rui-tour-skip": "hook on .rui-button",
  "rui-tour-back": "hook on .rui-button",
  "rui-tour-next": "hook on .rui-button",
  "rui-bar-chart": "hook on .rui-chart",
  "rui-line-chart": "hook on .rui-chart",
  "rui-stat-hint": "hook on .rui-stats-hint",
  "rui-tree-node-pending": "hook on .rui-tree-node-row",
  "rui-code-editor-copy": "hook on .rui-code-block-copy",
  "rui-kbd-shortcut": "hook on .rui-kbd-group",
  "rui-kbd-key": "hook on .rui-kbd",
  "rui-kbd-plus": "hook on .rui-kbd-sep",
  "rui-avatar-gradient": "hook on .rui-avatar-fallback",
  "rui-segmented": "hook on .rui-segmented-control",
  "rui-diff-line": "hook on .rui-diff-viewer-cell / .rui-diff-line-gap",
  "rui-gcal-head": "hook on .rui-gcal-row",
  "rui-masonry-item": "hook — .rui-masonry-grid > * owns the column break",
  "rui-on-intersect": "hook on .rui-wrapper",
  "rui-on-mount": "hook on .rui-wrapper",

  /* hook: sr-only live region, styled by .rui-visually-hidden */
  "rui-requirement-list-status": "sr-only live region",
  "rui-rating-status": "sr-only live region",
  "rui-async-status": "sr-only live region",
  "rui-sortable-status": "sr-only live region",
  "rui-copy-button-status": "sr-only live region",
  "rui-countdown-summary": "sr-only live region",
  "rui-filter-chips-status": "sr-only live region",
  "rui-notification-bell-status": "sr-only live region",
  "rui-multiselect-status": "sr-only live region",
  "rui-data-grid-status": "sr-only live region",

  /* behaviour: no box to style */
  "rui-canvas-value": "hidden input carrying the form value",
  "rui-portal": "portal container, positioned by its target",
  "rui-portal-anchor": "zero-size marker for the portal's origin",
  "rui-redirect": "hidden marker element",
  "rui-lazy": "display: contents wrapper",
  "rui-wrapper-fragment": "display: contents wrapper",
  "rui-css": "carrier for an author stylesheet, renders nothing",
  "rui-mount": "host element for a foreign framework tree",
  "rui-web-component": "host element for a custom element",
  "rui-data-grid-col-lead": "a <col>; only width applies and it is inline",
  "rui-data-grid-col-filler": "a <col>; absorbs leftover width",
  "rui-calendar-row": "display: contents row in a CSS grid",

  /* inline geometry: the render computes the only value there is */
  "rui-virtual-list": "viewport; height comes from the item count",
  "rui-virtual-list-spacer": "height is total rows x row height",
  "rui-virtual-list-window": "absolute offset tracks the scroll position",
  "rui-virtual-grid": "viewport; height comes from the item count",
  "rui-virtual-grid-spacer": "height is total rows x row height",
  "rui-virtual-grid-window": "absolute offset + a computed grid template",
};

/* -------------------------------------------------------------------------- */

describe("every emitted class reaches the stylesheet", () => {
  const emitted = emittedClasses();
  const styled = styledClasses();

  it("finds a meaningful number of classes to check", () => {
    // A collector that silently stopped matching would make every assertion
    // below pass by looking at nothing.
    expect(emitted.size).toBeGreaterThan(900);
    expect(styled.size).toBeGreaterThan(900);
  });

  it("styles every class that is not explicitly exempt", () => {
    const unstyled = [...emitted.keys()]
      .filter((cls) => !styled.has(cls))
      .filter((cls) => !(cls in UNSTYLED_BY_DESIGN))
      .sort();

    expect(
      unstyled,
      unstyled.length === 0
        ? ""
        : `These classes are put on an element but no selector in the sheet names them, `
          + `so they render unstyled:\n`
          + unstyled.map((c) => `  .${c}  (${[...emitted.get(c)!].join(", ")})`).join("\n")
          + `\n\nAdd a rule, or add the class to UNSTYLED_BY_DESIGN with the reason.`,
    ).toEqual([]);
  });

  it("keeps the allowlist honest — no entry for a class that is styled now", () => {
    // An exemption that outlived its reason hides the next real gap.
    const stale = Object.keys(UNSTYLED_BY_DESIGN).filter((cls) => styled.has(cls));
    expect(stale, `now styled, so the exemption should go: ${stale.join(", ")}`).toEqual([]);
  });

  it("keeps the allowlist honest — no entry for a class nothing emits", () => {
    const orphans = Object.keys(UNSTYLED_BY_DESIGN).filter((cls) => !emitted.has(cls));
    expect(orphans, `no component emits these any more: ${orphans.join(", ")}`).toEqual([]);
  });

  it("gives every exemption a reason", () => {
    const blank = Object.entries(UNSTYLED_BY_DESIGN)
      .filter(([, why]) => why.trim().length < 8)
      .map(([cls]) => cls);
    expect(blank).toEqual([]);
  });
});

describe("presentational values live in the sheet, not inline", () => {
  /**
   * An inline `style` beats every rule in the sheet, including a theme's, so a
   * colour or a radius written inline is a value no theme can ever change. The
   * FileUpload progress bar shipped `background: var(--rui-color-primary)`
   * inline with a comment explaining that it was there "so the bar is visible
   * without waiting on a theme rule" — which is exactly the trade this test
   * exists to stop.
   *
   * Values the render COMPUTES are fine inline — a percentage, a pixel
   * offset, a grid template, a chart series colour taken from the theme's own
   * `chart*` tokens. Those are interpolated, and the check skips them. What it
   * catches is a literal: CSS somebody typed into a style attribute.
   */
  const PRESENTATIONAL = /^(background(-color)?|border-radius|box-shadow|font-family|color)$/;

  it("no component writes a HARDCODED colour, radius or shadow into a style attribute", () => {
    const offenders: string[] = [];
    for (const file of walk("src/library")) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        const m = /style:\s*(?:"([^"]*)"|`([^`]*)`)/.exec(line);
        const style = m?.[1] ?? m?.[2];
        if (!style) return;
        for (const decl of style.split(";")) {
          const at = decl.indexOf(":");
          if (at === -1) continue;
          const prop = decl.slice(0, at).trim();
          const value = decl.slice(at + 1);
          if (!PRESENTATIONAL.test(prop)) continue;
          // An interpolated value is DATA the render computed — a chart series
          // colour, a per-particle confetti hue, an author's avatar tint. There
          // is nothing a static rule could say about it. A literal is CSS
          // somebody wrote in the wrong place.
          if (value.includes("${")) continue;
          offenders.push(`${file.replaceAll("\\", "/")}:${i + 1}  ${prop}:${value.slice(0, 70)}`);
        }
      });
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Inline styles out-specify every theme. Move these to src/theme/styles.ts:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
