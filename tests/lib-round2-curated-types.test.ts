/**
 * Curated-type rules that cannot be read off a prop's name or hint, pinned
 * against the library so a new prop cannot ship without them.
 *
 *   - Every component that declares the shared field-shell `optional` prop
 *     types it `boolean | string`: a number renders no marker
 *     (`optionalMarkText`), while the hint alone widens to `string | number`.
 */

import { describe, expect, it } from "vitest";
import { COMPONENT_TYPES } from "../scripts/dsl-types/component-types/index.js";
import { FIELD_SHELL_PROPS } from "../src/library/components/forms-shared.js";
import { defaultLibrary } from "../src/library/index.js";

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
