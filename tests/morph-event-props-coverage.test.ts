/**
 * Every event handler a component assigns must survive a re-render.
 *
 * The morph reconciler keeps the LIVE node and copies handler PROPERTIES from
 * the freshly-rendered one — but only the properties listed in its `EVENT_PROPS`
 * array. Anything a component assigns that is absent from that list is silently
 * dropped the first time its node is kept, and the feature stops working with no
 * error.
 *
 * `onload`, `onplay`, `onpause` and `onended` were all missing, so AudioPlayer
 * and VideoPlayer stopped reflecting playback state and an image's load hook
 * never fired again after the first re-render.
 *
 * This test derives the requirement from the source rather than hardcoding a
 * list, so adding a new handler to a component without registering it fails here
 * instead of becoming a silent runtime bug.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = join(process.cwd(), "src", "library", "components");
const MORPH = join(process.cwd(), "src", "renderer", "morph.ts");

/** The handler names morph is willing to transfer. */
function registered(): Set<string> {
  const src = readFileSync(MORPH, "utf8");
  const block = /const EVENT_PROPS = \[([\s\S]*?)\] as const;/.exec(src);
  expect(block, "EVENT_PROPS array not found — has morph.ts been restructured?").toBeTruthy();
  return new Set([...block![1]!.matchAll(/"(on[a-z]+)"/g)].map((m) => m[1]!));
}

/** Every `node.onX = ` assignment across the component library. */
function assigned(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(COMPONENTS_DIR, file), "utf8");
    for (const m of src.matchAll(/\.(on[a-z]+)\s*=\s/g)) {
      const name = m[1]!;
      // `props.once = ...` style property names are not event handlers; only
      // count names the DOM actually exposes as an event handler property.
      if (!(name in HTMLElement.prototype) && !(name in HTMLMediaElement.prototype)) continue;
      const list = found.get(name) ?? [];
      if (!list.includes(file)) list.push(file);
      found.set(name, list);
    }
  }
  return found;
}

describe("morph EVENT_PROPS covers every handler components assign", () => {
  it("no assigned handler is missing from the transfer list", () => {
    const reg = registered();
    const missing: string[] = [];
    for (const [name, files] of assigned()) {
      if (!reg.has(name)) missing.push(`${name} (assigned in ${files.join(", ")})`);
    }
    expect(missing, `these handlers are lost on the first re-render:\n${missing.join("\n")}`)
      .toEqual([]);
  });

  it("the four that regressed are registered", () => {
    const reg = registered();
    for (const name of ["onload", "onplay", "onpause", "onended"]) {
      expect(reg.has(name), `${name} must stay in EVENT_PROPS`).toBe(true);
    }
  });
});
