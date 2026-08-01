/**
 * The generated system prompt must never document a prop that does not exist.
 *
 * Most of the prompt is generated from the specs and is therefore correct by
 * construction, but parts of it are hand-written quick-reference tables. Those
 * had drifted: the prompt advertised `VirtualList(items, { key, render })`,
 * `VirtualGrid(items, { columns, rowHeight, render })` and
 * `LiveRegion(child, { mode? })` — and `key`, `render`, `rowHeight` and `mode`
 * exist on none of those three specs.
 *
 * That is worse than an ordinary docs bug. `src/library/validate.ts` treats an
 * undeclared prop as a FATAL error, so the prompt was actively teaching the
 * model to generate code the library rejects.
 *
 * This test extracts every `Component(... { a, b, c })` signature from the whole
 * prompt and asserts each named prop is real — declared on the spec, or one of
 * its `aliases`, or a universal style prop.
 */

import { describe, expect, it } from "vitest";
import { generatePrompt } from "../src/prompt/generator.js";
import { defaultLibrary } from "../src/library/index.js";
import { UNIVERSAL_PROP_NAMES } from "../src/library/sx.js";

/**
 * Only the hand-written quick-reference tables are checked, i.e. rows shaped
 * ``| `Name(args)` | description |``.
 *
 * Scanning the whole prompt is not viable: it also contains DSL code examples,
 * and a naive scan false-positives on things that are not props at all —
 * ``Skeleton({ sx: { h: "320px" } })`` (a nested style object),
 * ``Text(`${label}: ...`)`` (a JS template variable) and
 * ``Styles(`.hero { background: ... }`)`` (CSS inside a string). The generated
 * per-component sections are derived from the specs and cannot drift; the
 * hand-written tables are the only place that can, and did.
 */
const TABLE_ROW = /^\|\s*`([A-Z][A-Za-z0-9]*)\(([^`]*)\)`\s*\|/gm;

/**
 * The same hazard in bullet form: ``- **`Name(args)`** — description`` and
 * ``- `Name(args)` — description``.
 *
 * Several prose sections document signatures as bullets rather than table rows
 * (behaviour wrappers, escape hatches, interop, the a11y primitives). Those were
 * entirely unchecked, which matters because they are hand-written — the very
 * category that produced the `VirtualList({ key, render })` regression this file
 * was created for.
 */
const BULLET_SIGNATURE = /^-\s+(?:\*\*)?`([A-Z][A-Za-z0-9]*)\(([^`]*)\)`/gm;

function knownProps(name: string): Set<string> | null {
  const spec = defaultLibrary.components.find((s) => s.name === name);
  if (!spec) return null;
  const out = new Set<string>(UNIVERSAL_PROP_NAMES as readonly string[]);
  for (const p of spec.props) {
    out.add(p.name);
    for (const a of p.aliases ?? []) out.add(a);
  }
  return out;
}

describe("generated prompt documents only real props", () => {
  it("every documented prop name exists on its spec", () => {
    const prompt = generatePrompt(defaultLibrary);
    const violations: string[] = [];

    let checked = 0;
    const signatures = [...prompt.matchAll(TABLE_ROW), ...prompt.matchAll(BULLET_SIGNATURE)];
    for (const m of signatures) {
      const [, name, args] = m;
      const known = knownProps(name!);
      if (!known) continue; // not a library component

      // Only the trailing named-props object, and only if it has no nested
      // braces (a nested brace means a style/data literal, not a prop list).
      const brace = args!.match(/\{([^{}]*)\}\s*$/);
      if (!brace) continue;
      checked += 1;
      for (const rawPart of brace[1]!.split(",")) {
        const prop = rawPart.trim().replace(/^`|`$/g, "").split(":")[0]!.trim().replace(/\?$/, "");
        if (!prop || !/^[a-z][A-Za-z0-9]*$/.test(prop)) continue;
        if (!known.has(prop)) {
          violations.push(`${name}: "${prop}" is documented but not declared on the spec`);
        }
      }
    }

    // Guard the guard: if the table format ever changes so nothing matches, the
    // test would silently pass and stop protecting anything.
    expect(checked, "no quick-reference signatures were checked — has the table format changed?")
      .toBeGreaterThan(10);

    expect(violations, `The prompt documents props that validate.ts will reject:\n${violations.join("\n")}`)
      .toEqual([]);
  });

  it("the three specs that regressed are pinned", () => {
    // Guard the exact props that were wrong, so a future edit cannot silently
    // reintroduce them.
    for (const [name, absent] of [
      ["VirtualList", ["key", "render"]],
      ["VirtualGrid", ["rowHeight", "render"]],
      ["LiveRegion", ["mode"]],
    ] as const) {
      const known = knownProps(name);
      expect(known, `${name} should be a registered component`).toBeTruthy();
      for (const p of absent) {
        expect(known!.has(p), `${name} must not gain a "${p}" prop without updating the prompt`).toBe(false);
      }
    }
  });
});
