/**
 * `$util.rules` — the numeric and network validators.
 *
 * `integer` / `range` / `port` / `ipv4` / `ipv6` / `ip` / `cidr` are the rules a
 * form asking for an address, a port or a count needs, and every one of them
 * used to be hand-rolled per app as a `rules.pattern(...)` — which is how the
 * obvious-but-wrong IPv4 pattern (`\d{1,3}(\.\d{1,3}){3}`, which accepts
 * `999.1.1.1`) keeps being reinvented.
 *
 * The two address parsers are cross-checked against `node:net`, which is the
 * reference implementation the rest of the stack agrees with. That test is the
 * point of this file: a table of hand-picked cases proves the cases someone
 * thought of, and the corpus comparison catches the ones they did not.
 */

import { describe, expect, it } from "vitest";
import net from "node:net";
import { Rules } from "../src/runtime/namespaces-extra.js";

/** A validator answers `null` when the value is acceptable. */
const passes = (result: unknown): boolean => result === null;

describe("$util.rules.integer", () => {
  it("accepts whole numbers as numbers or as text", () => {
    const rule = Rules.integer();
    expect(passes(rule(3))).toBe(true);
    expect(passes(rule(-4))).toBe(true);
    expect(passes(rule(0))).toBe(true);
    expect(passes(rule("3"))).toBe(true);
    expect(passes(rule(" 3 "))).toBe(true);
  });

  it("rejects fractions and non-numbers", () => {
    const rule = Rules.integer();
    expect(passes(rule(2.5))).toBe(false);
    expect(passes(rule("2.5"))).toBe(false);
    expect(passes(rule("abc"))).toBe(false);
    expect(passes(rule(Number.NaN))).toBe(false);
  });

  it("leaves an empty field alone but not a whitespace-only one", () => {
    const rule = Rules.integer();
    // "Not a whole number" is not the complaint to make about a field nobody
    // has filled in yet — that is `required`'s job.
    expect(passes(rule(""))).toBe(true);
    expect(passes(rule(null))).toBe(true);
    expect(passes(rule(undefined))).toBe(true);
    // But `Number(" ")` is 0, so a spaces-only field must not read as zero.
    expect(passes(rule("   "))).toBe(false);
  });

  it("carries a custom message", () => {
    expect(Rules.integer("whole numbers only")(1.5)).toBe("whole numbers only");
  });
});

describe("$util.rules.range", () => {
  it("is inclusive at both ends", () => {
    const rule = Rules.range(1, 256);
    expect(passes(rule(1))).toBe(true);
    expect(passes(rule(256))).toBe(true);
    expect(passes(rule(128))).toBe(true);
    expect(passes(rule(0))).toBe(false);
    expect(passes(rule(257))).toBe(false);
  });

  it("names both ends in its default message", () => {
    expect(Rules.range(1, 256)(0)).toBe("Must be between 1 and 256");
  });

  it("passes an empty field and rejects a non-number", () => {
    const rule = Rules.range(1, 10);
    expect(passes(rule(""))).toBe(true);
    expect(passes(rule("abc"))).toBe(false);
  });
});

describe("$util.rules.port", () => {
  it("accepts 1 to 65535", () => {
    const rule = Rules.port();
    expect(passes(rule(1))).toBe(true);
    expect(passes(rule("8080"))).toBe(true);
    expect(passes(rule(65_535))).toBe(true);
  });

  it("rejects 0, out-of-range, fractional and ambiguous input", () => {
    const rule = Rules.port();
    // 0 means "assign me one" to the kernel, which is never what a field that
    // names a destination means.
    expect(passes(rule(0))).toBe(false);
    expect(passes(rule(65_536))).toBe(false);
    expect(passes(rule(-1))).toBe(false);
    expect(passes(rule("80.5"))).toBe(false);
    // A leading zero reads as octal to some stacks and decimal to others.
    expect(passes(rule("08080"))).toBe(false);
    expect(passes(rule("http"))).toBe(false);
  });

  it("passes an empty field", () => {
    expect(passes(Rules.port()(""))).toBe(true);
  });
});

describe("$util.rules.ipv4", () => {
  it("accepts dotted quads and trims surrounding space", () => {
    const rule = Rules.ipv4();
    expect(passes(rule("0.0.0.0"))).toBe(true);
    expect(passes(rule("192.168.0.1"))).toBe(true);
    expect(passes(rule("255.255.255.255"))).toBe(true);
    expect(passes(rule(" 10.0.0.1 "))).toBe(true);
  });

  it("rejects the cases the obvious regex lets through", () => {
    const rule = Rules.ipv4();
    expect(passes(rule("256.1.1.1"))).toBe(false);
    expect(passes(rule("999.1.1.1"))).toBe(false);
    // Different network stacks disagree about whether this is octal, and the
    // ambiguity is itself a reason to refuse it.
    expect(passes(rule("010.0.0.1"))).toBe(false);
    expect(passes(rule("1.2.3"))).toBe(false);
    expect(passes(rule("1.2.3.4.5"))).toBe(false);
    expect(passes(rule("1.2.3.-4"))).toBe(false);
  });
});

describe("$util.rules.ipv6", () => {
  it("accepts the shorthands", () => {
    const rule = Rules.ipv6();
    expect(passes(rule("::"))).toBe(true);
    expect(passes(rule("::1"))).toBe(true);
    expect(passes(rule("2001:db8::1"))).toBe(true);
    expect(passes(rule("2001:0db8:0000:0000:0000:0000:0000:0001"))).toBe(true);
    // `::` standing for exactly one zero group is permitted by RFC 4291 and
    // accepted by every parser, RFC 5952's style advice notwithstanding.
    expect(passes(rule("1:2:3:4:5:6:7::"))).toBe(true);
    // An IPv4 tail occupies the last two 16-bit groups.
    expect(passes(rule("::ffff:192.168.0.1"))).toBe(true);
    expect(passes(rule("64:ff9b::1.2.3.4"))).toBe(true);
  });

  it("accepts a zone index, which a link-local address needs", () => {
    const rule = Rules.ipv6();
    expect(passes(rule("fe80::1%eth0"))).toBe(true);
    expect(passes(rule("fe80::1%25eth0"))).toBe(true);
    // An empty zone is not a zone.
    expect(passes(rule("fe80::1%"))).toBe(false);
    expect(passes(rule("%eth0"))).toBe(false);
  });

  it("rejects malformed addresses", () => {
    const rule = Rules.ipv6();
    expect(passes(rule("2001:db8::1::2"))).toBe(false); // two `::`
    expect(passes(rule("1:2:3:4:5:6:7:8:9"))).toBe(false); // nine groups
    expect(passes(rule("gggg::1"))).toBe(false);
    expect(passes(rule("12345::1"))).toBe(false);
    expect(passes(rule("2001:db8"))).toBe(false);
    expect(passes(rule("::ffff:999.1.1.1"))).toBe(false);
    expect(passes(rule("192.168.0.1"))).toBe(false); // that is the other rule
  });
});

describe("$util.rules.ipv4 / ipv6 against node:net", () => {
  // The corpus mixes valid addresses of both families with the malformed
  // shapes a hand-written parser typically gets wrong. Comparing against
  // `node:net` rather than a second table is the point: it catches the cases
  // whoever wrote the table did not think of.
  const CORPUS = [
    "0.0.0.0", "1.2.3.4", "255.255.255.255", "192.168.0.1", "10.0.0.255",
    "256.1.1.1", "1.2.3", "1.2.3.4.5", "010.0.0.1", "1.2.3.-4", "1..2.3", "1.2.3.04",
    "abc", "", "  ", "1.2.3.4 ",
    "::", "::1", "1::", "2001:db8::1", "fe80::1%eth0", "fe80::1%25eth0", "fe80::1%",
    "2001:0db8:0000:0000:0000:0000:0000:0001", "1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7::",
    "::ffff:192.168.0.1", "64:ff9b::1.2.3.4",
    "2001:db8::1::2", "1:2:3:4:5:6:7:8:9", "gggg::1", "2001:db8", "12345::1",
    ":::", "::ffff:999.1.1.1", "%eth0",
  ];

  it("agrees with node:net on every entry", () => {
    const ipv4 = Rules.ipv4();
    const ipv6 = Rules.ipv6();
    for (const value of CORPUS) {
      const trimmed = value.trim();
      // A genuinely EMPTY field is `required`'s business and every rule here
      // lets it through; a whitespace-only one is not empty and is judged on
      // its merits, which is why the oracle tests `value`, not `trimmed`.
      // Paired with the value so a failure names the address rather than
      // reporting `true !== false`.
      expect([value, passes(ipv4(value))]).toEqual([value, value === "" || net.isIPv4(trimmed)]);
      expect([value, passes(ipv6(value))]).toEqual([value, value === "" || net.isIPv6(trimmed)]);
    }
  });
});

describe("$util.rules.ip", () => {
  it("accepts either family and nothing else", () => {
    const rule = Rules.ip();
    expect(passes(rule("10.0.0.1"))).toBe(true);
    expect(passes(rule("::1"))).toBe(true);
    expect(passes(rule("nope"))).toBe(false);
  });
});

describe("$util.rules.cidr", () => {
  it("bounds the prefix by the address family", () => {
    const rule = Rules.cidr();
    expect(passes(rule("10.0.0.0/8"))).toBe(true);
    expect(passes(rule("0.0.0.0/0"))).toBe(true);
    expect(passes(rule("192.168.1.0/32"))).toBe(true);
    expect(passes(rule("2001:db8::/32"))).toBe(true);
    expect(passes(rule("::/128"))).toBe(true);
    expect(passes(rule("10.0.0.0/33"))).toBe(false);
    expect(passes(rule("2001:db8::/129"))).toBe(false);
  });

  it("rejects a bare address", () => {
    // `10.0.0.0` and `10.0.0.0/8` mean different things, and accepting the
    // first is how a subnet field ends up meaning a single host.
    expect(passes(Rules.cidr()("10.0.0.0"))).toBe(false);
    expect(passes(Rules.cidr()("10.0.0.0/"))).toBe(false);
    expect(passes(Rules.cidr()("10.0.0.0/08"))).toBe(false);
  });

  it("carries a custom message", () => {
    expect(Rules.cidr("bad block")("x")).toBe("bad block");
  });
});

describe("the new rules compose with validate/validateAll", () => {
  it("reports the first failing rule per field", () => {
    const errors = Rules.validateAll(
      { ip: "999.1.1.1", port: 0, weight: 2.5 },
      {
        ip: [Rules.required(), Rules.ipv4()],
        port: [Rules.required(), Rules.port()],
        weight: [Rules.integer(), Rules.range(1, 256)],
      },
    );
    expect(errors).toEqual({
      ip: "Enter a valid IPv4 address",
      port: "Enter a port between 1 and 65535",
      weight: "Enter a whole number",
    });
  });

  it("reports nothing for a valid row", () => {
    expect(Rules.validateAll(
      { ip: "10.0.0.4", port: 8080, weight: 1 },
      {
        ip: [Rules.required(), Rules.ipv4()],
        port: [Rules.required(), Rules.port()],
        weight: [Rules.integer(), Rules.range(1, 256)],
      },
    )).toEqual({});
  });
});
