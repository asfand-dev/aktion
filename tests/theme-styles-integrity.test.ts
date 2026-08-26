/**
 * Guard for `src/theme/styles.ts`.
 *
 * The whole stylesheet is a single JS template literal, so a stray backtick or
 * `${` inside a CSS comment silently terminates the literal and the rest of the
 * file is parsed as code. That failure mode surfaces as confusing type errors
 * (sometimes in unrelated files like `element.ts`), so it is worth asserting
 * directly: the exported CSS must be one intact string containing the theme
 * blocks we expect.
 *
 * The second half of the file guards a different failure: a component that
 * ACCEPTS an option the sheet never styles. Nothing throws, nothing warns, and
 * the option simply does nothing — `Toasts(position: "bottom-center")` was in
 * the enum and had a `.rui-toast-standalone` rule, but no `.rui-toasts` rule, so
 * the stack set no inset and rendered wherever `position: fixed` left it. Those
 * tests therefore derive the accepted values from the component specs rather
 * than restating them, so adding a seventh corner fails until it is styled.
 */

import { describe, expect, it } from "vitest";
import { componentStyles } from "../src/theme/styles.js";
import { defaultLibrary } from "../src/library/index.js";

/** Source order of the per-theme blocks, which the slices below rely on. */
const VISION = ':host([data-rui-theme="vision"])';
const SHADCN = ':host([data-rui-theme^="shadcn"])';
const MUI = ':host([data-rui-theme^="mui"])';
const HEROUI = ':host([data-rui-theme^="heroui"])';
/** Marks the end of the last theme block — the first rule after it. */
const AFTER_LAST = ".rui-dropdown-menu {";

const blockBetween = (from: string, to: string): string =>
  componentStyles.slice(componentStyles.indexOf(from), componentStyles.indexOf(to));

describe("componentStyles integrity", () => {
  it("is one non-trivial CSS string", () => {
    expect(typeof componentStyles).toBe("string");
    // The real sheet is well over 100k chars; a truncated literal would be tiny.
    expect(componentStyles.length).toBeGreaterThan(100_000);
  });

  it("still declares every theme that has an override block", () => {
    // `light` and `dark` are purely token-driven and intentionally have no
    // `:host([data-rui-theme=...])` block; the rest reshape components.
    // `vision` is private — absent from `builtInThemes`, but its CSS block is
    // what makes the name work at all, so it is asserted here like the others.
    for (const theme of ["soft", "vision"]) {
      expect(componentStyles).toContain(`:host([data-rui-theme="${theme}"])`);
    }
    // The three framework families are PREFIX-matched, so one block covers
    // `shadcn`, `shadcn-light` and `shadcn-dark` at once; the dark variant then
    // adds an exact-match delta on top.
    for (const family of ["shadcn", "mui", "heroui"]) {
      expect(componentStyles).toContain(`:host([data-rui-theme^="${family}"])`);
      expect(componentStyles).toContain(`:host([data-rui-theme="${family}-dark"])`);
    }
  });

  it("prefix-matches each family so all three of its names are styled", () => {
    // The whole reason `^=` is used instead of `=`: `theme="shadcn"` and
    // `theme="shadcn-light"` are two live spellings of the same theme and the
    // host echoes back whichever one the author wrote. An `=` selector would
    // style one of them and silently leave the other on the base sheet.
    const families = { shadcn: SHADCN, mui: MUI, heroui: HEROUI } as const;
    for (const [family, prefixSel] of Object.entries(families)) {
      for (const name of [family, `${family}-light`, `${family}-dark`]) {
        expect(
          name.startsWith(family),
          `${name} must be matched by ${prefixSel}`,
        ).toBe(true);
      }
      // …and no exact-match rule for the bare or -light spelling sneaked back
      // in, which would be the sign someone had started dividing the family.
      expect(componentStyles).not.toContain(`:host([data-rui-theme="${family}"])`);
      expect(componentStyles).not.toContain(`:host([data-rui-theme="${family}-light"])`);
    }
  });

  it("drops the blocks of the three themes these replaced", () => {
    for (const retired of ["modern", "glass", "corporate"]) {
      expect(componentStyles).not.toContain(`[data-rui-theme="${retired}"]`);
    }
  });

  it("reaches the end of the sheet — the last theme block is intact", () => {
    // The families are authored vision -> shadcn -> mui -> heroui; if the
    // literal closed early the later ones would be absent.
    const vision = componentStyles.indexOf(VISION);
    const shadcn = componentStyles.indexOf(SHADCN);
    const mui = componentStyles.indexOf(MUI);
    const heroui = componentStyles.indexOf(HEROUI);
    expect(vision).toBeGreaterThan(-1);
    expect(shadcn).toBeGreaterThan(vision);
    expect(mui).toBeGreaterThan(shadcn);
    expect(heroui).toBeGreaterThan(mui);
    expect(componentStyles.indexOf(AFTER_LAST)).toBeGreaterThan(heroui);
  });

  it("keeps the vision block's UI block-anchored anchor values", () => {
    // A few load-bearing values from the UI block. If any of these
    // vanish the vision theme has silently drifted off the framework.
    const visionBlock = blockBetween(VISION, SHADCN);
    expect(visionBlock).toContain("line-height: 24px");   // 36px button box
    expect(visionBlock).toContain("#dbedf8");             // corporate-1 hover wash
    expect(visionBlock).toContain("#718095");             // neutral-5 input border
    expect(visionBlock).toContain("opacity: 0.62");       // UI block disabled button
    expect(visionBlock).toContain("text-transform: uppercase"); // table header
  });

  /*
   * Each framework block is pinned by the handful of rules that make it that
   * framework rather than a generic light theme. These are the details a
   * well-meaning cleanup would flatten first — and flattening any one of them
   * is what would make somebody able to tell the difference.
   */
  it("keeps the shadcn block's signatures", () => {
    const block = blockBetween(SHADCN, MUI);
    // The 3px 50%-alpha focus ring plus a recoloured border, never an outline.
    expect(block).toContain("box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 50%, transparent)");
    // A segmented tab strip on the muted wash, not an underline rail.
    expect(block).toContain("background: var(--rui-color-surface-muted)");
    // hover:bg-primary/90 — shadcn LIGHTENS a solid button rather than
    // swapping in a darker fill.
    expect(block).toContain("color-mix(in srgb, var(--rui-color-primary) 90%, transparent)");
    // The tooltip is painted in the primary colour.
    expect(block).toContain("background: var(--rui-color-primary);");
    // Table headers: muted, 500, sentence case, no fill.
    expect(block).toContain("text-transform: none");
  });

  it("keeps the Material UI block's signatures", () => {
    const block = blockBetween(MUI, HEROUI);
    // Paper has no border — elevation does the separating.
    expect(block).toContain("border: none");
    // Uppercase tab labels on Material's own tracking.
    expect(block).toContain("letter-spacing: 0.02857em");
    expect(block).toContain("text-transform: uppercase");
    // Elevation 2 on a resting contained button.
    expect(block).toContain("0px 3px 1px -2px rgba(0, 0, 0, 0.2)");
    // The 4% overlay that Material uses instead of a hover fill.
    expect(block).toContain("color-mix(in srgb, var(--rui-color-primary) 4%, transparent)");
    // The charcoal tooltip, which stays charcoal in dark mode.
    expect(block).toContain("background: rgba(97, 97, 97, 0.92)");
    // The 34x14 switch track the 20px thumb overhangs.
    expect(block).toContain("width: 34px");
  });

  it("keeps the HeroUI block's signatures", () => {
    const block = blockBetween(HEROUI, AFTER_LAST);
    // Hover DIMS; it does not recolour.
    expect(block).toContain("opacity: 0.8");
    // Press scales.
    expect(block).toContain("transform: scale(0.97)");
    // A hard 2px ring standing 2px clear of the control.
    expect(block).toContain("outline: 2px solid var(--rui-color-focus-ring)");
    expect(block).toContain("outline-offset: 2px");
    // Borderless surfaces carrying shadow-medium.
    expect(block).toContain("box-shadow: var(--rui-shadow-md)");
    // The blurred modal scrim.
    expect(block).toContain("backdrop-filter: blur(8px)");
  });
});


describe("vision theme web fonts", () => {
  it("declares the UI block typefaces so a page does not fall back to system-ui", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const decl = builtInThemeFonts.vision;
    expect(decl).toBeTruthy();
    // UI block self-hosts one file per weight and always asks for 400; the closest
    // equivalent here is the same two families at 400 and 600.
    expect(decl.import).toEqual(
      expect.arrayContaining(["Open Sans:400,600", "Overpass:400,600"]),
    );
  });

  it("keeps vision on UI block's weight ladder — no 700/800 title roles", () => {
    const block = blockBetween(VISION, SHADCN);
    // UI block has no component text above SemiBold; a 700 or 800 here means a title
    // role slipped back onto the UA bold rung.
    expect(block).not.toMatch(/font-weight:\s*(700|800)\b/);
    // and the systemic heading reset must stay in place
    expect(block).toMatch(/font-weight:\s*inherit/);
  });
});

describe("framework theme web fonts", () => {
  /*
   * Geist, Roboto and Inter are half of what makes each of these read as its
   * framework. Without a declaration here the theme falls back to `system-ui`
   * and the whole type ladder — every weight, size and tracking value the
   * theme sets — lands on the wrong face.
   */
  it("declares the typeface each framework is actually set in", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const expected: Record<string, string> = {
      shadcn: "Geist",
      mui: "Roboto",
      heroui: "Inter",
    };
    for (const [family, face] of Object.entries(expected)) {
      // Every spelling of the family, so `theme="mui-dark"` is not left bare.
      for (const name of [family, `${family}-light`, `${family}-dark`]) {
        const decl = builtInThemeFonts[name];
        expect(decl, name).toBeTruthy();
        expect(decl.import.join(" "), name).toContain(face);
      }
    }
  });

  it("gives no two families the same declaration", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const decls = [
      builtInThemeFonts.shadcn.import.join(),
      builtInThemeFonts.mui.import.join(),
      builtInThemeFonts.heroui.import.join(),
      builtInThemeFonts.vision.import.join(),
    ];
    expect(new Set(decls).size).toBe(decls.length);
  });

  it("loads a retired alias's replacement typefaces", async () => {
    const { canonicalThemeName, builtInThemeFonts } = await import("../src/theme/index.js");
    // `loadBuiltInThemeFonts` canonicalises before the lookup, so `modern`
    // must not silently render in system-ui.
    expect(builtInThemeFonts[canonicalThemeName("modern")]).toBe(builtInThemeFonts["shadcn-light"]);
    expect(builtInThemeFonts[canonicalThemeName("glass")]).toBe(builtInThemeFonts["mui-light"]);
    expect(builtInThemeFonts[canonicalThemeName("corporate")]).toBe(builtInThemeFonts["heroui-light"]);
  });
});

/**
 * The sheet with CSS comments stripped.
 *
 * Everything below asks "is there a RULE for this?", and the sheet's comments
 * quote the selectors they explain — including the one this batch added. Scanning
 * the raw text would answer yes for a selector that exists only in prose, which
 * is the exact opposite of what these tests are for.
 */
const declarations = componentStyles.replaceAll(/\/\*[\s\S]*?\*\//g, "");

/** Escape a literal selector fragment for use inside a RegExp. */
const escapeRe = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The `enum` a registered component's `position` prop declares. */
function positionEnum(component: string): readonly string[] {
  const spec = defaultLibrary.components.find((s) => s.name === component);
  expect(spec, `${component} is not registered`).toBeTruthy();
  const prop = spec?.props?.find((p) => p.name === "position");
  expect(prop, `${component} declares no position prop`).toBeTruthy();
  const values = prop?.enum ?? [];
  // Read from the spec so the sheet is checked against the source of truth
  // rather than a copy of the six strings that would rot independently — but an
  // enum that went missing would make every check below vacuously pass.
  expect(values.length, `${component}'s position prop declares no enum`).toBeGreaterThan(1);
  return values;
}

type PositionRule = {
  /** The `data-position` value the selector matches. */
  value: string;
  /** The rest of that selector — `""` when the rule targets the element itself. */
  rest: string;
  /** The rule's declaration block. */
  body: string;
};

/**
 * Every rule whose selector qualifies `family` by a `data-position` value.
 *
 * `rest === ""` marks a PINNING rule: the one that puts the container against a
 * viewport edge. The others only scope a descendant (`… .rui-toast.is-dismissed`),
 * and a value with one of those but no pinning rule is precisely the bug — it
 * reads as styled, and pins to nothing.
 */
function positionRules(family: string): PositionRule[] {
  const re = new RegExp(
    `${escapeRe(family)}\\[data-position(?:[\\^$*~|])?="([^"]+)"\\]([^{,]*)`,
    "g",
  );
  const found: PositionRule[] = [];
  for (let m = re.exec(declarations); m; m = re.exec(declarations)) {
    // The block is searched forward from the match so a selector that shares one
    // (a comma-separated list) reports the body that actually applies to it.
    const open = declarations.indexOf("{", m.index);
    const close = declarations.indexOf("}", open);
    found.push({
      value: m[1],
      rest: m[2].trim(),
      body: open === -1 || close === -1 ? "" : declarations.slice(open + 1, close),
    });
  }
  return found;
}

/** Accepted position -> the declarations that pin `family` there. */
const pinningRules = (family: string): Map<string, string> =>
  new Map(positionRules(family)
    .filter((rule) => rule.rest === "")
    .map((rule) => [rule.value, rule.body]));

/*
 * Scoped to the two toast families on purpose. `.rui-fab` and `.rui-speeddial`
 * take `data-position` too, but their default corner lives in the base rule
 * (`bottom: 24px; right: 24px`) and only the other corners get an override — so
 * requiring an explicit rule per enum value would fail them for being correct.
 * Both toast families spell out all six.
 */
describe("every Toast position the specs accept is actually pinned", () => {
  const stack = pinningRules(".rui-toasts");
  const standalone = pinningRules(".rui-toast-standalone");

  it("has one enum shared by the stack and the standalone toast", () => {
    // `Toast(position:)` and `Toasts(position:)` are served by the same two
    // selector families below, so a divergence between the specs would leave one
    // of them accepting a corner the other's rules never cover.
    expect(positionEnum("Toast")).toEqual(positionEnum("Toasts"));
  });

  it("pins the stack for every accepted position", () => {
    for (const value of positionEnum("Toasts")) {
      expect(
        stack.has(value),
        `Toasts accepts position "${value}", but the sheet has no `
          + `.rui-toasts[data-position="${value}"] rule. The stack is position: fixed `
          + `with no inset, so it renders over the top-left of the page instead.`,
      ).toBe(true);
    }
  });

  it("pins the standalone toast for every accepted position", () => {
    for (const value of positionEnum("Toast")) {
      expect(
        standalone.has(value),
        `Toast accepts position "${value}", but the sheet has no `
          + `.rui-toast-standalone[data-position="${value}"] rule, so a one-off toast `
          + `asking for that corner is left un-pinned.`,
      ).toBe(true);
    }
  });

  it("styles no position the specs do not accept", () => {
    // The converse direction: a value the enum dropped (or never had) keeps its
    // rules, and the sheet documents a corner authors cannot ask for.
    const accepted = new Set([...positionEnum("Toasts"), ...positionEnum("Toast")]);
    for (const family of [".rui-toasts", ".rui-toast-standalone"]) {
      for (const rule of positionRules(family)) {
        expect(
          accepted.has(rule.value),
          `${family} styles data-position="${rule.value}", which no Toast spec accepts.`,
        ).toBe(true);
      }
    }
  });
});

describe("a pinned Toast stack grows and dismisses towards its own edge", () => {
  const stack = pinningRules(".rui-toasts");

  it("reverses the column for every bottom-* position and no top-* one", () => {
    for (const value of positionEnum("Toasts")) {
      const body = stack.get(value) ?? "";
      expect(body, `no pinning rule for "${value}" to inspect`).not.toBe("");
      if (value.startsWith("bottom-")) {
        // A bottom-pinned stack grows upward, so the newest toast has to be the
        // one nearest the edge; in source order it would be furthest from it and
        // every new arrival would shove the older ones down over the viewport.
        expect(body, `bottom-pinned "${value}" must stack in column-reverse`)
          .toContain("flex-direction: column-reverse");
      } else {
        expect(body, `top-pinned "${value}" must stack in source order`)
          .not.toContain("column-reverse");
      }
    }
  });

  /** The transform the stack's dismissal override gives `position` (`""` if none). */
  const dismissalTransform = (position: string): string => {
    const rule = positionRules(".rui-toasts")
      .find((r) => r.value === position && r.rest.includes("is-dismissed"));
    return /transform:\s*([^;]+)/.exec(rule?.body ?? "")?.[1]?.trim() ?? "";
  };

  it("dismisses both centre positions along the Y axis", () => {
    // `.rui-toast.is-dismissed` slides sideways by default, which for a
    // centre-pinned stack reads as the toast wandering off the axis it is
    // centred on rather than leaving. Both centres must exit towards their edge.
    for (const value of positionEnum("Toasts").filter((v) => v.endsWith("-center"))) {
      const transform = dismissalTransform(value);
      expect(
        transform,
        `centre-pinned "${value}" has no dismissal override, so it inherits the `
          + `sideways slide of .rui-toast.is-dismissed`,
      ).not.toBe("");
      expect(transform, `"${value}" must leave on the Y axis`).toContain("translateY");
      expect(transform, `"${value}" must not slide off its own centre line`)
        .not.toContain("translateX");
    }
  });

  it("dismisses both left positions along the X axis, towards the edge they hug", () => {
    // The default slide is +12px, correct only for the right-hand corners; a
    // left-pinned toast leaving to the right crosses the page to exit.
    for (const value of positionEnum("Toasts").filter((v) => v.endsWith("-left"))) {
      const transform = dismissalTransform(value);
      expect(transform, `left-pinned "${value}" has no dismissal override`).not.toBe("");
      expect(transform, `"${value}" must leave towards the left edge`)
        .toContain("translateX(-");
      expect(transform, `"${value}" must not leave on the Y axis`).not.toContain("translateY");
    }
  });
});

/** Does any selector in the sheet name `.className`? */
const hasRule = (className: string): boolean =>
  new RegExp(`\\.${escapeRe(className)}(?![\\w-])`).test(declarations);

describe("the classes this batch's components emit all reach the sheet", () => {
  // The narrow version of the un-pinned-position bug, for the same reason: a
  // class the renderer emits and the sheet ignores fails silently. There is no
  // generic emitted-class sweep in the suite to extend — nothing else imports
  // `componentStyles` to compare it against the registry — so this list is
  // maintained by hand alongside the components that added it.
  const EMITTED = [
    // Field shell: description / optional marker / warning message.
    "rui-field-description",
    "rui-field-optional",
    "rui-field-warning",
    // RequirementList.
    "rui-requirement-list",
    "rui-requirement-list-title",
    "rui-requirement-list-items",
    "rui-requirement",
    "rui-requirement-icon",
    // ActionLink's icon gap, moved out of an inline style a theme could not reach.
    "rui-action-link-icon",
  ];

  it("declares at least one rule per class", () => {
    for (const className of EMITTED) {
      expect(
        hasRule(className),
        `.${className} is emitted by a component but no selector in the sheet `
          + `names it, so the element renders unstyled`,
      ).toBe(true);
    }
  });

  it("keeps .rui-visually-hidden styled, since the new a11y nodes are nothing but it", () => {
    // Deliberately not in the list above: `.rui-requirement-text` is a bare hook
    // that inherits the row's size and colour, and
    // `.rui-requirement-list-status` / the per-row "Met: " prefix carry no
    // geometry of their own — `rui-visually-hidden` is the whole of their
    // styling. Lose that one rule and every row reads "Met: at least 8
    // characters" as visible text with the live region's tally printed under it.
    expect(hasRule("rui-visually-hidden")).toBe(true);
  });
});
