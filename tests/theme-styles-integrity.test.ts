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
const CORPORATE = ':host([data-rui-theme="corporate"])';
const MODERN = ':host([data-rui-theme="modern"])';

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
    for (const theme of ["soft", "glass", "vision", "corporate", "modern"]) {
      expect(componentStyles).toContain(`:host([data-rui-theme="${theme}"])`);
    }
  });

  it("reaches the end of the sheet — the last theme block is intact", () => {
    // `modern` is authored last; if the literal closed early it would be absent.
    const vision = componentStyles.indexOf(VISION);
    const corporate = componentStyles.indexOf(CORPORATE);
    const modern = componentStyles.indexOf(MODERN);
    expect(vision).toBeGreaterThan(-1);
    expect(corporate).toBeGreaterThan(vision);
    expect(modern).toBeGreaterThan(corporate);
  });

  it("keeps the vision block's UI block-anchored anchor values", () => {
    // A few load-bearing values from the UI block. If any of these
    // vanish the vision theme has silently drifted off the framework.
    const visionBlock = blockBetween(VISION, CORPORATE);
    expect(visionBlock).toContain("line-height: 24px");   // 36px button box
    expect(visionBlock).toContain("#dbedf8");             // corporate-1 hover wash
    expect(visionBlock).toContain("#718095");             // neutral-5 input border
    expect(visionBlock).toContain("opacity: 0.62");       // UI block disabled button
    expect(visionBlock).toContain("text-transform: uppercase"); // table header
  });

  it("keeps the corporate block's own signatures", () => {
    // The corporate theme is a fresh design, not a re-creation of an external
    // framework, so what is pinned here is what makes it recognisably itself.
    const corporateBlock = blockBetween(CORPORATE, MODERN);
    // Square-shouldered controls (the radius token, not a pill).
    expect(corporateBlock).toContain("border-radius: var(--rui-radius-button)");
    // The 2px teal rail that marks the selected tab.
    expect(corporateBlock).toContain("border-bottom-color: var(--rui-color-primary)");
    // Flat cards: no resting shadow, hairline first.
    expect(corporateBlock).toContain("box-shadow: none");
    // Sentence-case table headers — deliberately NOT vision's/modern's uppercase.
    expect(corporateBlock).toContain("text-transform: none");
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
    const block = blockBetween(VISION, CORPORATE);
    // UI block has no component text above SemiBold; a 700 or 800 here means a title
    // role slipped back onto the UA bold rung.
    expect(block).not.toMatch(/font-weight:\s*(700|800)\b/);
    // and the systemic heading reset must stay in place
    expect(block).toMatch(/font-weight:\s*inherit/);
  });
});

describe("corporate theme web fonts", () => {
  it("declares its own typefaces rather than inheriting vision's", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const decl = builtInThemeFonts.corporate;
    expect(decl).toBeTruthy();
    expect(decl.import).toEqual(
      expect.arrayContaining(["Inter:400,500,600,700", "Space Grotesk:500,600,700"]),
    );
    // The two themes must not share a font declaration — that was the symptom
    // to avoid when the `corporate` key was handed to a different design.
    expect(decl.import).not.toEqual(builtInThemeFonts.vision.import);
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
