/**
 * `$util.duration` and `$util.rules.duration`.
 *
 * A duration is a length of time — a cooldown, a TTL, a poll interval, a
 * retention window — and every API that takes one writes it either in the
 * simple grammar (`5m`) or in ISO-8601 (`PT5M`), with most accepting both.
 * Neither the platform nor `Intl` parses either, so before this every app
 * hand-rolled it: DCD's VM Auto Scaling console needed exactly this pair of
 * questions ("is it a duration?" and "is it inside these bounds?") for three
 * separate fields.
 *
 * The two properties this file exists to pin down:
 *
 *   1. **The two grammars round-trip.** `parse` reads both; `format` writes
 *      either; `parse(format(x)) === x` for every representable x.
 *   2. **The strictness is deliberate.** Years, months, weeks and unitless
 *      numbers are refused, and each refusal has a reason a future reader
 *      would otherwise "fix" — see the header comment above the parser.
 */

import { describe, expect, it } from "vitest";
import { Util } from "../src/runtime/util.js";
import { Rules } from "../src/runtime/namespaces-extra.js";

const duration = Util.duration;

/** A validator answers `null` when the value is acceptable. */
const passes = (result: unknown): boolean => result === null;

describe("$util.duration.parse — the simple grammar", () => {
  it("reads every unit suffix", () => {
    expect(duration.parse("500ns")).toBeCloseTo(5e-7, 12);
    expect(duration.parse("500us")).toBeCloseTo(5e-4, 9);
    expect(duration.parse("250ms")).toBeCloseTo(0.25, 9);
    expect(duration.parse("30s")).toBe(30);
    expect(duration.parse("5m")).toBe(300);
    expect(duration.parse("2h")).toBe(7_200);
    expect(duration.parse("7d")).toBe(604_800);
  });

  it("reads fractions and signs", () => {
    expect(duration.parse("1.5h")).toBe(5_400);
    expect(duration.parse("-5m")).toBe(-300);
    expect(duration.parse("+5m")).toBe(300);
  });

  it("trims surrounding whitespace", () => {
    expect(duration.parse("  5m  ")).toBe(300);
  });

  it("does not confuse `ms` with `m` followed by `s`", () => {
    // The suffix table is matched as a whole by an anchored pattern, so
    // `500ms` can only be milliseconds. Reading it as minutes would be wrong
    // by a factor of 300,000.
    expect(duration.parse("500ms")).toBeCloseTo(0.5, 9);
    expect(duration.parse("500m")).toBe(30_000);
  });
});

describe("$util.duration.parse — ISO-8601", () => {
  it("reads the time components", () => {
    expect(duration.parse("PT30S")).toBe(30);
    expect(duration.parse("PT5M")).toBe(300);
    expect(duration.parse("PT2H")).toBe(7_200);
    expect(duration.parse("PT1H30M")).toBe(5_400);
    expect(duration.parse("PT0.5S")).toBe(0.5);
  });

  it("reads days, alone and with a time part", () => {
    expect(duration.parse("P1D")).toBe(86_400);
    expect(duration.parse("P1DT12H")).toBe(129_600);
    expect(duration.parse("P2DT3H4M5S")).toBe(183_845);
  });

  it("is case-insensitive and signed", () => {
    expect(duration.parse("pt5m")).toBe(300);
    expect(duration.parse("-PT5M")).toBe(-300);
  });

  it("rejects years, months and weeks", () => {
    // Not an oversight: a month has no fixed length in seconds, and `P1W` is a
    // period designator `java.time.Duration.parse` refuses — so accepting it
    // would let a form submit a value its own backend cannot read.
    expect(duration.parse("P1Y")).toBeNull();
    expect(duration.parse("P1M")).toBeNull();
    expect(duration.parse("P1W")).toBeNull();
    expect(duration.parse("P1Y2M3D")).toBeNull();
  });

  it("rejects a designator with no components", () => {
    expect(duration.parse("P")).toBeNull();
    expect(duration.parse("PT")).toBeNull();
    expect(duration.parse("-PT")).toBeNull();
  });
});

describe("$util.duration.parse — what is not a duration", () => {
  it("rejects a unitless number written as text", () => {
    // Spring reads a bare `500` as milliseconds; a great many hand-rolled APIs
    // read it as seconds. Indistinguishable on the wire, three orders of
    // magnitude apart — so this refuses to guess.
    expect(duration.parse("500")).toBeNull();
    expect(duration.parse("0")).toBeNull();
  });

  it("passes a NUMBER straight through as seconds", () => {
    // The argument is already in this namespace's own unit, which makes
    // `parse` idempotent and lets a bound be written as a plain number.
    expect(duration.parse(500)).toBe(500);
    expect(duration.parse(0)).toBe(0);
    expect(duration.parse(-1.5)).toBe(-1.5);
  });

  it("rejects empty, nullish and malformed input without throwing", () => {
    expect(duration.parse("")).toBeNull();
    expect(duration.parse("   ")).toBeNull();
    expect(duration.parse(null)).toBeNull();
    expect(duration.parse(undefined)).toBeNull();
    expect(duration.parse("5 m")).toBeNull();
    expect(duration.parse("5minutes")).toBeNull();
    expect(duration.parse("abc")).toBeNull();
    expect(duration.parse(Number.NaN)).toBeNull();
    expect(duration.parse({})).toBeNull();
  });
});

describe("$util.duration.format", () => {
  it("picks the largest unit that divides evenly", () => {
    expect(duration.format(90)).toBe("90s");
    expect(duration.format(120)).toBe("2m");
    expect(duration.format(5_400)).toBe("90m");
    expect(duration.format(7_200)).toBe("2h");
    expect(duration.format(86_400)).toBe("1d");
    expect(duration.format(0.25)).toBe("250ms");
  });

  it("never rounds — a value with no whole-unit form stays in seconds", () => {
    expect(duration.format(5_401)).toBe("5401s");
  });

  it("writes ISO-8601 on request", () => {
    expect(duration.format(30, { style: "iso" })).toBe("PT30S");
    expect(duration.format(5_400, { style: "iso" })).toBe("PT1H30M");
    expect(duration.format(86_400, { style: "iso" })).toBe("P1D");
    expect(duration.format(129_600, { style: "iso" })).toBe("P1DT12H");
    expect(duration.format(0.5, { style: "iso" })).toBe("PT0.5S");
  });

  it("renders zero in both styles rather than as a bare designator", () => {
    // `P` alone is not a duration any parser accepts, including this one.
    expect(duration.format(0)).toBe("0s");
    expect(duration.format(0, { style: "iso" })).toBe("PT0S");
  });

  it("keeps the sign", () => {
    expect(duration.format(-300)).toBe("-5m");
    expect(duration.format(-300, { style: "iso" })).toBe("-PT5M");
  });

  it("re-formats a duration STRING, so the two grammars convert either way", () => {
    expect(duration.format("PT120S")).toBe("2m");
    expect(duration.format("5m", { style: "iso" })).toBe("PT5M");
  });

  it("answers \"\" for something that is not a duration, rather than throwing", () => {
    expect(duration.format("nonsense")).toBe("");
    expect(duration.format(null)).toBe("");
  });
});

describe("$util.duration — round trip", () => {
  it("parse(format(x)) === x in both styles", () => {
    const cases = [0, 0.25, 1, 30, 90, 120, 300, 5_400, 7_200, 86_400, 129_600, 604_800, -300];
    for (const seconds of cases) {
      expect(duration.parse(duration.format(seconds))).toBe(seconds);
      expect(duration.parse(duration.format(seconds, { style: "iso" }))).toBe(seconds);
    }
  });
});

describe("$util.duration.isValid", () => {
  it("is parse() reduced to a boolean", () => {
    expect(duration.isValid("5m")).toBe(true);
    expect(duration.isValid("PT5M")).toBe(true);
    expect(duration.isValid("500")).toBe(false);
    expect(duration.isValid("")).toBe(false);
  });
});

describe("$util.rules.duration", () => {
  it("accepts either grammar and rejects anything else", () => {
    const rule = Rules.duration();
    expect(passes(rule("5m"))).toBe(true);
    expect(passes(rule("PT5M"))).toBe(true);
    expect(passes(rule("250ms"))).toBe(true);
    expect(passes(rule("5 minutes"))).toBe(false);
    expect(passes(rule("500"))).toBe(false);
  });

  it("passes an empty value, leaving that to required()", () => {
    const rule = Rules.duration();
    expect(passes(rule(""))).toBe(true);
    expect(passes(rule(null))).toBe(true);
    expect(passes(rule(undefined))).toBe(true);
  });

  it("bounds in SECONDS apply whatever grammar the value is written in", () => {
    // The whole reason this is not `pattern(…)` plus `range(…)`: a regular
    // expression cannot see that `120m` exceeds a two-hour ceiling, and a
    // numeric range cannot see through the unit at all.
    const rule = Rules.duration({ min: 120, max: 86_400 });
    expect(passes(rule("2m"))).toBe(true);
    expect(passes(rule("PT2M"))).toBe(true);
    expect(passes(rule("24h"))).toBe(true);
    expect(passes(rule("P1D"))).toBe(true);
    expect(passes(rule("119s"))).toBe(false);
    expect(passes(rule("PT1M"))).toBe(false);
    expect(passes(rule("25h"))).toBe(false);
    expect(passes(rule("1500m"))).toBe(false);
  });

  it("takes either bound on its own", () => {
    expect(passes(Rules.duration({ min: 60 })("1h"))).toBe(true);
    expect(passes(Rules.duration({ min: 60 })("30s"))).toBe(false);
    expect(passes(Rules.duration({ max: 60 })("30s"))).toBe(true);
    expect(passes(Rules.duration({ max: 60 })("1h"))).toBe(false);
  });

  it("reads a string in the bounds position as the message", () => {
    expect(Rules.duration("Pick a cooldown")("nope")).toBe("Pick a cooldown");
    expect(Rules.duration({ min: 120 }, "At least two minutes")("1s")).toBe("At least two minutes");
  });

  it("has a default message that names both grammars", () => {
    const message = Rules.duration()("nope");
    expect(String(message)).toContain("30s");
    expect(String(message)).toContain("PT1H");
  });
});
