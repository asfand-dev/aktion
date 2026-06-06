import { describe, expect, it } from "vitest";
import { getSignatureHelp } from "../src/tooling/signature-help.js";
import { defaultLibrary } from "../src/library/index.js";

describe("getSignatureHelp", () => {
  it("describes a library component and tracks the active parameter", () => {
    // `Card([], )` — cursor after the comma → second argument (variant).
    const src = 'x = Card([], )';
    const help = getSignatureHelp(src, { line: 1, column: 14 }, defaultLibrary);
    expect(help).not.toBeNull();
    expect(help?.signatures[0]?.label).toBe("Card(children, variant?)");
    expect(help?.activeParameter).toBe(1);
  });

  it("falls back to the first parameter at the start of the call", () => {
    const src = "x = Card(";
    const help = getSignatureHelp(src, { line: 1, column: 10 }, defaultLibrary);
    expect(help?.activeParameter).toBe(0);
  });

  it("describes a $-builtin", () => {
    const src = "x = $http(";
    const help = getSignatureHelp(src, { line: 1, column: 11 }, defaultLibrary);
    expect(help?.signatures[0]?.label).toBe("$http({ url, method, … })");
  });

  it("describes a user-declared component with its params", () => {
    const src = ["function Greeting(name, role) {", "  return Text(name)", "}", "x = Greeting("].join("\n");
    const help = getSignatureHelp(src, { line: 4, column: 14 }, defaultLibrary);
    expect(help?.signatures[0]?.label).toBe("Greeting(name, role)");
    expect(help?.signatures[0]?.parameters.map((p) => p.label)).toEqual(["name", "role"]);
  });

  it("does not count commas inside a nested array argument", () => {
    // Cursor is inside the array (still the first argument of Card).
    const src = "x = Card([a, b, ";
    const help = getSignatureHelp(src, { line: 1, column: 17 }, defaultLibrary);
    expect(help?.activeParameter).toBe(0);
  });

  it("returns null outside any call", () => {
    expect(getSignatureHelp("x = 1", { line: 1, column: 6 }, defaultLibrary)).toBeNull();
  });
});
