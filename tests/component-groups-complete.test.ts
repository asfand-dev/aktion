/**
 * Every registered component must belong to a `componentGroups` entry.
 *
 * The groups are what the generated system prompt uses to organise the catalogue
 * and attach usage guidance. A component missing from every group still appears
 * in the generated signature list, but ships with no notes explaining when to
 * reach for it, and is invisible in the compact chat-mode prompt. 76 of 282
 * specs were in that state.
 *
 * The reverse direction matters too: a group naming a component that no longer
 * exists silently documents a component authors cannot call.
 */

import { describe, expect, it } from "vitest";
import { defaultLibrary } from "../src/library/index.js";

describe("componentGroups covers the registry", () => {
  const grouped = new Set(
    (defaultLibrary.componentGroups ?? []).flatMap((g) => g.components ?? []),
  );

  it("no registered component is missing from every group", () => {
    const missing = defaultLibrary.components
      .map((s) => s.name)
      .filter((n) => !grouped.has(n));
    expect(missing, `ungrouped components ship with no usage guidance:\n${missing.join(", ")}`)
      .toEqual([]);
  });

  it("no group names a component that does not exist", () => {
    const known = new Set(defaultLibrary.components.map((s) => s.name));
    const ghosts = [...grouped].filter((n) => !known.has(n));
    expect(ghosts, `groups document components that are not registered:\n${ghosts.join(", ")}`)
      .toEqual([]);
  });

  it("no component is listed in two groups", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const g of defaultLibrary.componentGroups ?? []) {
      for (const name of g.components ?? []) {
        const prior = seen.get(name);
        if (prior && prior !== g.name) dupes.push(`${name} (${prior} + ${g.name})`);
        else seen.set(name, g.name);
      }
    }
    expect(dupes, dupes.join(", ")).toEqual([]);
  });
});
