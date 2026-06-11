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

describe("getSignatureHelp — §19 flexible call binding", () => {
  const helpAtEnd = (src: string) => {
    const lines = src.split("\n");
    return getSignatureHelp(
      src,
      { line: lines.length, column: lines[lines.length - 1]!.length + 1 },
      defaultLibrary,
    );
  };
  const paramAt = (help: ReturnType<typeof helpAtEnd>, index: number) =>
    help?.signatures[0]?.parameters[index]?.label;

  it("all-positional calls highlight slots in signature order", () => {
    // StatCard(label, value?, trend?, …)
    const first = helpAtEnd('x = StatCard("Revenue"');
    expect(paramAt(first, first!.activeParameter)).toBe("label");
    const second = helpAtEnd('x = StatCard("Revenue", ');
    expect(paramAt(second, second!.activeParameter)).toBe("value");
    const third = helpAtEnd('x = StatCard("Revenue", "$48k", ');
    expect(paramAt(third, third!.activeParameter)).toBe("trend?");
  });

  it("the first positional maps to the (positional) slot even when it is not slot 0", () => {
    // Callout(variant?, title (positional), …) — positional prop at index 1.
    const help = helpAtEnd('x = Callout("Saved!"');
    expect(paramAt(help, help!.activeParameter)).toBe("title");
    // The SECOND positional falls back to the first unfilled slot (tone).
    const second = helpAtEnd('x = Callout("Saved!", ');
    expect(paramAt(second, second!.activeParameter)).toBe("tone?");
  });

  it("inside the trailing object the active parameter is the prop key, not the arg index", () => {
    const typingValue = helpAtEnd('x = Button("Save", { variant: ');
    expect(paramAt(typingValue, typingValue!.activeParameter)).toBe("variant?");
    const secondKey = helpAtEnd('x = Button("Save", { variant: "primary", loading: ');
    expect(paramAt(secondKey, secondKey!.activeParameter)).toBe("loading?");
  });

  it("a partially typed key prefix-matches its prop", () => {
    const help = helpAtEnd('x = Button("Save", { var');
    expect(paramAt(help, help!.activeParameter)).toBe("variant?");
  });

  it("right after the object opens, nothing is highlighted", () => {
    const help = helpAtEnd('x = Button("Save", { ');
    expect(help!.activeParameter).toBe(help!.signatures[0]!.parameters.length);
  });

  it("all-named single-object calls highlight by key", () => {
    const help = helpAtEnd('x = Button({ label: "Save", variant: ');
    expect(paramAt(help, help!.activeParameter)).toBe("variant?");
  });

  it("nested objects highlight the outer prop key", () => {
    const help = helpAtEnd('x = Button("Save", { sx: { p: ');
    // `sx` is a universal prop (not in Button's spec) → no highlight, but
    // the signature stays on Button.
    expect(help?.signatures[0]?.label.startsWith("Button(")).toBe(true);
    const known = helpAtEnd('x = Tooltip("hint", { content: { ');
    expect(known?.signatures[0]?.label.startsWith("Tooltip(")).toBe(true);
  });

  it("positional args after a leading named object keep their slot mapping", () => {
    // Grid({ columns: 3 }, [...]) — the leading bag is excluded, so the
    // second argument is positional #0 → children.
    const help = helpAtEnd("x = Grid({ columns: 3 }, ");
    expect(paramAt(help, help!.activeParameter)).toBe("children");
  });

  it("past the last slot nothing is highlighted", () => {
    const help = helpAtEnd('x = Eyebrow("Pricing", ');
    expect(help!.activeParameter).toBe(help!.signatures[0]!.parameters.length);
  });

  it("user components highlight named keys in the trailing object", () => {
    const src = [
      "function Greeting(name, role) {",
      "  return Text(name)",
      "}",
      'x = Greeting("Ada", { role: ',
    ].join("\n");
    const help = getSignatureHelp(src, { line: 4, column: 29 }, defaultLibrary);
    expect(help?.signatures[0]?.parameters[help!.activeParameter]?.label).toBe("role");
  });
});
