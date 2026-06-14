/**
 * DataGrid `Col` render receives the original row, not just a display index
 * (issue #11 from issues-to-fix.md).
 *
 * When DataGrid sorts internally, a cell `render` that looks up sibling data
 * must still resolve the correct row. We pin two guarantees:
 *   1. the `index` passed to `render` is the ORIGINAL row index, and
 *   2. `render` also receives a header-keyed `row` object as its 3rd arg.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

const ROWS = `rows = [
  { name: "Charlie", age: 30 },
  { name: "Alice", age: 25 },
  { name: "Bob", age: 35 }
]`;

describe("#11 DataGrid render() and sorting", () => {
  it("passes a header-keyed row object so sibling lookups survive sorting", () => {
    const program = [
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name), "text", "left", true),',
      '  Col("Age", rows.map(r => r.age), "number"),',
      '  Col("Combo", rows.map(r => r.name), "text", "left", false, false, (v, i, row) => Text(`${row.Name}#${row.Age}`))',
      '], { sort: { key: "Name", direction: "asc" } }))',
    ].join("\n");
    const html = renderToStaticMarkup(program);
    // Each combo cell must pair the correct name with ITS OWN age, in sorted
    // order (Alice, Bob, Charlie) — never a mismatched age.
    expect(html).toContain("Alice#25");
    expect(html).toContain("Bob#35");
    expect(html).toContain("Charlie#30");
    expect(html).not.toContain("Alice#30");
    expect(html).not.toContain("Bob#25");
    // Sorted order: Alice before Bob before Charlie.
    expect(html.indexOf("Alice#25")).toBeLessThan(html.indexOf("Bob#35"));
    expect(html.indexOf("Bob#35")).toBeLessThan(html.indexOf("Charlie#30"));
  });

  it("passes the ORIGINAL row index to render (not the display position)", () => {
    // A column whose values are the original indices; after sorting by name the
    // index arg must still map back to the original row's age.
    const program = [
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name), "text", "left", true),',
      '  Col("Idx", rows.map(r => r.name), "text", "left", false, false, (v, i) => Text(`${v}=${rows[i].age}`))',
      '], { sort: { key: "Name", direction: "asc" } }))',
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain("Alice=25");
    expect(html).toContain("Bob=35");
    expect(html).toContain("Charlie=30");
  });
});
