/**
 * A legacy size spelling must render exactly like its canonical form.
 *
 * The validator accepts `s`/`m`/`l`/`small`/`normal`/`large` on any enum prop
 * whose canonical form (`canonicalSizeToken`) is in the enum, and the generated
 * DSL types advertise them — but most renderers wrote the raw token straight
 * into `data-size` / a lookup table. `Button({ size: "s" })` rendered medium,
 * `Avatar({ size: "large" })` rendered `data-size="large"` (which no theme rule
 * matches), `Box({ radius: "l" })` lost its radius: the program validated clean
 * and silently rendered the default.
 *
 * The renderer now canonicalises once, before a library spec renders, so no
 * component has to remember to. The sweep below is the guard for the whole
 * library; the probe spec pins the choke point's own contract.
 */

import { afterEach, describe, expect, it } from "vitest";
import { defaultLibrary } from "../src/library/index.js";
import type { ComponentLibrary, ComponentSpec } from "../src/library/types.js";
import { LEGACY_SIZE_TOKEN_ALIASES } from "../src/library/utils.js";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";
import { cleanup, render } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

/** Auto-generated ids differ between two renders of the same tree; nothing else should. */
const stable = (html: string): string => html.replace(/-\d+\b/g, "-N");

const markup = (expression: string, library?: ComponentLibrary): string =>
  renderToStaticMarkup(`$app(${expression})`, library ? { library } : {});

const fragment = (expression: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = markup(expression);
  return host;
};

describe("legacy size tokens render as their canonical spelling", () => {
  it("every enum prop that accepts a legacy spelling renders it like the canonical one", () => {
    const differing: string[] = [];
    let checked = 0;
    for (const spec of defaultLibrary.components) {
      for (const prop of spec.props) {
        if (!prop.enum) continue;
        for (const [legacy, canonical] of Object.entries(LEGACY_SIZE_TOKEN_ALIASES)) {
          // Only where the validator accepts the legacy spelling as an alias.
          if (prop.enum.includes(legacy) || !prop.enum.includes(canonical)) continue;
          checked += 1;
          const viaLegacy = stable(markup(`${spec.name}({ ${prop.name}: "${legacy}" })`));
          const viaCanonical = stable(markup(`${spec.name}({ ${prop.name}: "${canonical}" })`));
          if (viaLegacy !== viaCanonical) differing.push(`${spec.name}.${prop.name}: "${legacy}" ≠ "${canonical}"`);
        }
      }
    }
    // Measured at the time of writing: 296 (component, prop, alias) triples, 100
    // of which rendered differently before the renderer canonicalised.
    expect(checked).toBeGreaterThan(250);
    expect(differing, differing.join("\n")).toEqual([]);
  });

  it("Button takes the single-letter spellings, not just the verbose ones", () => {
    expect(fragment(`Button("Go", { size: "s" })`).querySelector(".rui-button")?.getAttribute("data-size")).toBe("sm");
    expect(fragment(`Button("Go", { size: "l" })`).querySelector(".rui-button")?.getAttribute("data-size")).toBe("lg");
  });

  it("ButtonGroup pushes the canonical token onto every child", () => {
    const group = fragment(`ButtonGroup([Button("A"), Button("B")], { size: "small" })`);
    const sizes = [...group.querySelectorAll(".rui-button")].map((b) => b.getAttribute("data-size"));
    expect(sizes).toEqual(["sm", "sm"]);
    expect(group.querySelector(".rui-button-group")?.getAttribute("data-size")).toBe("sm");
  });

  it("components that copy the raw token into data-size get a token the theme matches", () => {
    expect(fragment(`Avatar("Ada Lovelace", { size: "large" })`).querySelector(".rui-avatar")?.getAttribute("data-size")).toBe("lg");
    expect(fragment(`Heading("Title", { size: "normal" })`).querySelector("[data-size]")?.getAttribute("data-size")).toBe("md");
    expect(fragment(`Icon("star", { size: "s" })`).querySelector("[data-icon-size]")?.getAttribute("data-icon-size")).toBe("sm");
  });

  it("lookup-table props resolve too (Box radius)", () => {
    const viaLegacy = fragment(`Box([Text("x")], { radius: "l" })`).querySelector<HTMLElement>(".rui-box");
    const viaCanonical = fragment(`Box([Text("x")], { radius: "lg" })`).querySelector<HTMLElement>(".rui-box");
    expect(viaCanonical?.getAttribute("style")).toContain("border-radius");
    expect(viaLegacy?.getAttribute("style")).toBe(viaCanonical?.getAttribute("style"));
  });

  it("a legacy token that arrives at runtime (a $variable) is canonicalised as well", () => {
    // The validator only sees literals; the choke point sees every value.
    const html = renderToStaticMarkup(`$size = "l"\n$app(Button("Go", { size: $size }))`);
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelector(".rui-button")?.getAttribute("data-size")).toBe("lg");
  });

  it("the live element path (not only SSR) canonicalises", async () => {
    const screen = render(`$app(Row([Button("A", { size: "s" }), Avatar("Ada", { size: "l" })]))`);
    await screen.flush();
    expect(screen.shadowRoot.querySelector(".rui-button")?.getAttribute("data-size")).toBe("sm");
    expect(screen.shadowRoot.querySelector(".rui-avatar")?.getAttribute("data-size")).toBe("lg");
  });
});

describe("the renderer's enum canonicalisation (probe spec)", () => {
  // Echoes what the renderer handed it, through BOTH channels a renderer can read.
  const seen: Array<{ props: Record<string, unknown>; args: unknown[] }> = [];
  const Probe: ComponentSpec = {
    name: "Probe",
    description: "test probe",
    props: [
      { name: "size", type: "string | object", optional: true, enum: ["sm", "md", "lg"], description: "Size, or a responsive map" },
      { name: "tone", type: "string", optional: true, enum: ["primary", "muted"] },
      { name: "flat", type: "string", optional: true, enum: ["sm", "md"] },
      { name: "label", type: "string", optional: true },
    ],
    render: (node, props) => {
      seen.push({ props: { ...props }, args: [...node.args] });
      return document.createElement("span");
    },
  };
  const library: ComponentLibrary = { ...defaultLibrary, components: [...defaultLibrary.components, Probe] };
  const probe = (bag: string): { props: Record<string, unknown>; args: unknown[] } => {
    seen.length = 0;
    markup(`Probe({ ${bag} })`, library);
    expect(seen).toHaveLength(1);
    return seen[0]!;
  };

  it("rewrites a legacy spelling in the prop bag and in node.args alike", () => {
    const { props, args } = probe(`size: "small"`);
    expect(props.size).toBe("sm");
    expect(args[0]).toBe("sm");
  });

  it("rewrites each breakpoint of a responsive map, on props that take an object", () => {
    const { props } = probe(`size: { base: "s", md: "large", lg: "md" }`);
    expect(props.size).toEqual({ base: "sm", md: "lg", lg: "md" });
  });

  it("leaves canonical values, unknown values, other strings and non-strings alone", () => {
    expect(probe(`size: "md"`).props.size).toBe("md");
    // Not a legacy spelling of anything in the enum — the renderer's own fallback decides.
    expect(probe(`size: "huge"`).props.size).toBe("huge");
    // `m` canonicalises to `md`, which IS in this enum…
    expect(probe(`flat: "m"`).props.flat).toBe("md");
    // …but `l` → `lg` is not, so it is left as written.
    expect(probe(`flat: "l"`).props.flat).toBe("l");
    expect(probe(`tone: "primary"`).props.tone).toBe("primary");
    // A prop without an enum is never touched.
    expect(probe(`label: "small"`).props.label).toBe("small");
    expect(probe(`size: 3`).props.size).toBe(3);
  });

  it("only rewrites breakpoint keys, and never maps on a prop that takes no object", () => {
    expect(probe(`size: { base: "s", other: "s" }`).props.size).toEqual({ base: "sm", other: "s" });
  });

  it("canonicalises a padded token the validator accepts", () => {
    expect(probe(`size: " lg "`).props.size).toBe("lg");
  });
});
