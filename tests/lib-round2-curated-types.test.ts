/**
 * Two curated-type rules that cannot be read off a prop's name or hint, pinned
 * against the renderers so a new prop cannot ship without them.
 *
 *   - Every prop whose value is rendered as a Font Awesome icon is typed
 *     `AktionIconName` (the prelude's open icon-name union). Found by RENDERING
 *     each string prop with a sentinel name and looking for the icon class it
 *     produces, not by matching prop names: `Image.fallback`,
 *     `Breadcrumb.homeIcon` and `Icon.name` are icon props too.
 *   - Every component that declares the shared field-shell `optional` prop
 *     types it `boolean | string`: a number renders no marker
 *     (`optionalMarkText`), while the hint alone widens to `string | number`.
 */

import { describe, expect, it } from "vitest";
import { COMPONENT_TYPES } from "../scripts/dsl-types/component-types/index.js";
import { FIELD_SHELL_PROPS } from "../src/library/components/forms-shared.js";
import { defaultLibrary } from "../src/library/index.js";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

const SENTINEL = "zzprobe";

/** Whether rendering `expression` produces the sentinel's Font Awesome class. */
function rendersSentinelIcon(expression: string): boolean {
  let html = "";
  try {
    html = renderToStaticMarkup(`$app(${expression})`);
  } catch {
    return false;
  }
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector(`.fa-${SENTINEL}`) !== null;
}

/**
 * `Component.prop` for every top-level string (or string-list) prop that
 * renders as an icon. A second, fuller call gives components that only draw
 * the icon next to a label, title, list entry or open state the context they
 * need.
 */
function measuredIconProps(): string[] {
  const hits: string[] = [];
  for (const spec of defaultLibrary.components) {
    for (const prop of spec.props) {
      if (!/\bstring\b/.test(prop.type)) continue;
      const value = /\bstring\[\]/.test(prop.type) ? `["${SENTINEL}"]` : `"${SENTINEL}"`;
      const calls = [
        `${spec.name}({ ${prop.name}: ${value} })`,
        `${spec.name}({ ${prop.name}: ${value}, label: "L", title: "T", labels: ["L"], items: ["a"], value: "a", open: true })`,
      ];
      if (calls.some(rendersSentinelIcon)) hits.push(`${spec.name}.${prop.name}`);
    }
  }
  return hits.sort();
}

/** Icon props that only render inside a parent, measured through that parent. */
const IN_PARENT: Record<string, string> = {
  "TabItem.icon": `Tabs([TabItem("a", "A", [], { icon: "${SENTINEL}" })])`,
};

const curatedIconProps = (): string[] =>
  Object.entries(COMPONENT_TYPES)
    .flatMap(([component, entry]) => Object.entries(entry.props ?? {})
      .filter(([, type]) => /\bAktionIconName\b/.test(type))
      .map(([prop]) => `${component}.${prop}`))
    .sort();

describe("icon-name props are typed AktionIconName", () => {
  it("the parent-rendered cases really render an icon", () => {
    for (const [prop, expression] of Object.entries(IN_PARENT)) expect(rendersSentinelIcon(expression), prop).toBe(true);
  });

  it("exactly the props that render an icon, no more and no fewer", () => {
    const measured = [...measuredIconProps(), ...Object.keys(IN_PARENT)].sort();
    expect(measured.length).toBeGreaterThan(40);
    expect(curatedIconProps()).toEqual(measured);
  });
});

describe("the field-shell `optional` marker", () => {
  const shared = FIELD_SHELL_PROPS.find((p) => p.name === "optional");

  it("is curated `boolean | string` on every component that declares it", () => {
    const declaring = defaultLibrary.components.filter((spec) => spec.props.some((p) => p === shared));
    expect(declaring.length).toBeGreaterThan(20);
    const wrong = declaring
      .filter((spec) => COMPONENT_TYPES[spec.name]?.props?.optional !== "boolean | string")
      .map((spec) => `${spec.name}: ${COMPONENT_TYPES[spec.name]?.props?.optional ?? "(hint-derived)"}`);
    expect(wrong).toEqual([]);
  });
});
