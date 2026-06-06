/**
 * Extended `$util` helpers — the data-shaping additions
 * (omit / chunk / flatten / zip / partition / keyBy / cloneDeep / merge).
 * All are pure and side-effect-free, matching the rest of the namespace.
 */

import { describe, expect, it } from "vitest";
import { Util } from "../src/runtime/util.js";

describe("$util — object helpers", () => {
  it("omit drops the listed keys", () => {
    expect(Util.omit({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
    expect(Util.omit(null, ["b"])).toEqual({});
  });

  it("keyBy indexes an array by a field", () => {
    const rows = [{ id: "x", n: 1 }, { id: "y", n: 2 }];
    expect(Util.keyBy(rows, "id")).toEqual({ x: rows[0], y: rows[1] });
  });

  it("cloneDeep produces an independent deep copy", () => {
    const src = { a: { b: [1, 2] }, d: new Date(0) };
    const copy = Util.cloneDeep(src);
    expect(copy).toEqual(src);
    expect(copy.a).not.toBe(src.a);
    expect(copy.a.b).not.toBe(src.a.b);
    copy.a.b.push(3);
    expect(src.a.b).toEqual([1, 2]); // original untouched
  });

  it("merge deep-merges objects without mutating inputs", () => {
    const a = { x: 1, nested: { p: 1 } };
    const b = { y: 2, nested: { q: 2 } };
    expect(Util.merge(a, b)).toEqual({ x: 1, y: 2, nested: { p: 1, q: 2 } });
    expect(a).toEqual({ x: 1, nested: { p: 1 } }); // input untouched
  });
});

describe("$util — array helpers", () => {
  it("chunk splits into fixed-size groups", () => {
    expect(Util.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(Util.chunk([], 2)).toEqual([]);
  });

  it("flatten respects depth", () => {
    expect(Util.flatten([1, [2, [3]]])).toEqual([1, 2, [3]]);
    expect(Util.flatten([1, [2, [3]]], 2)).toEqual([1, 2, 3]);
  });

  it("zip pairs by index, padding short lists with null", () => {
    expect(Util.zip([1, 2], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
    expect(Util.zip([1], ["a", "b"])).toEqual([[1, "a"], [null, "b"]]);
  });

  it("partition splits by a predicate operator", () => {
    const rows = [{ done: true }, { done: false }, { done: true }];
    const [done, pending] = Util.partition(rows, "done", "==", true);
    expect(done).toHaveLength(2);
    expect(pending).toHaveLength(1);
  });
});
