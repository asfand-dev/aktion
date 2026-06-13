/**
 * Member-level editor intelligence for Aktion's `$`-namespaces and the
 * reactive resource bags its factory builtins return. Exercises the shared
 * catalog (`src/language/namespaces.ts`) through the completion, hover,
 * semantic-token, and signature-help surfaces the VS Code extension consumes.
 */

import { describe, expect, it } from "vitest";
import { getCompletions, getHoverInfo } from "../src/tooling/language-service.js";
import { getSemanticTokens } from "../src/tooling/semantic-tokens.js";
import { getSignatureHelp } from "../src/tooling/signature-help.js";
import { defaultLibrary } from "../src/library/index.js";
import {
  namespaceCatalog,
  factoryResourceCatalog,
  namespaceMembersAt,
  findNamespaceMember,
} from "../src/language/namespaces.js";

const labelsOf = (src: string, line: number, column: number): string[] =>
  getCompletions(src, { line, column }, defaultLibrary).map((c) => c.label);

describe("namespace catalog data", () => {
  it("exposes the four `.`-member namespaces", () => {
    expect(namespaceCatalog.map((n) => n.name).sort()).toEqual(
      ["console", "storage", "toast", "util"],
    );
  });

  it("strips the consumed sub-namespace prefix at a nested path", () => {
    const members = namespaceMembersAt("util", ["style"]).map((m) => m.name);
    expect(members).toContain("cx");
    expect(members).toContain("token");
    expect(members).not.toContain("style.cx");
  });

  it("resolves a fully-qualified nested member", () => {
    expect(findNamespaceMember("util", "rules.email")?.kind).toBe("method");
    expect(findNamespaceMember("util", "scroll")?.kind).toBe("property");
  });

  it("models every factory resource bag", () => {
    expect(factoryResourceCatalog.map((f) => f.factory).sort()).toEqual(
      ["form", "http", "mutation", "query", "socket", "sse", "store"],
    );
  });
});

describe("member completions", () => {
  it("completes $util methods after a dot", () => {
    const labels = labelsOf("x = $util.", 1, 11);
    expect(labels).toContain("format");
    expect(labels).toContain("sum");
    expect(labels).toContain("slugify");
  });

  it("completes nested $util.style members", () => {
    const labels = labelsOf("x = $util.style.", 1, 17);
    expect(labels).toContain("cx");
    expect(labels).toContain("gradient");
    // Flattened sibling members must not leak in.
    expect(labels).not.toContain("format");
  });

  it("completes $storage backends and their methods", () => {
    expect(labelsOf("x = $storage.", 1, 14)).toContain("local");
    expect(labelsOf("x = $storage.local.", 1, 20)).toContain("set");
    expect(labelsOf("x = $storage.cookies.", 1, 22)).toContain("get");
  });

  it("completes $toast tone shortcuts", () => {
    const labels = labelsOf("x = $toast.", 1, 12);
    expect(labels).toContain("success");
    expect(labels).toContain("dismiss");
    expect(labels).toContain("items");
  });

  it("completes a factory bag from its assignment", () => {
    const src = "$todos = $http({ url: u })\nx = $todos.";
    const labels = labelsOf(src, 2, 12);
    expect(labels).toContain("data");
    expect(labels).toContain("refetch");
    expect(labels).toContain("loading");
  });

  it("completes a non-sigil factory binding (form = $form(...))", () => {
    const src = "form = $form({ values: {} })\nx = form.";
    const labels = labelsOf(src, 2, 10);
    expect(labels).toContain("values");
    expect(labels).toContain("submit");
  });

  it("completes the reserved route handle", () => {
    const labels = labelsOf("x = route.", 1, 11);
    expect(labels).toContain("path");
    expect(labels).toContain("navigate");
  });
});

describe("builtin config-key completions", () => {
  it("completes $http({ … }) config keys", () => {
    const labels = labelsOf("$x = $http({ ", 1, 13);
    expect(labels).toContain("url");
    expect(labels).toContain("method");
    expect(labels).toContain("headers");
    expect(labels).toContain("body");
  });

  it("completes $query-only keys on top of the $http base", () => {
    const labels = labelsOf("$x = $query({ ", 1, 14);
    expect(labels).toContain("url");
    expect(labels).toContain("ttl");
    expect(labels).toContain("refetchInterval");
    expect(labels).toContain("infinite");
  });

  it("completes $theme({ … }) token groups", () => {
    const labels = labelsOf("theme = $theme({ ", 1, 17);
    expect(labels).toContain("colors");
    expect(labels).toContain("radius");
    expect(labels).toContain("motion");
  });

  it("completes $form({ … }) keys", () => {
    const labels = labelsOf("form = $form({ ", 1, 15);
    expect(labels).toContain("values");
    expect(labels).toContain("rules");
    expect(labels).toContain("onSubmit");
  });

  it("offers no fixed keys for $router (route-pattern keyed)", () => {
    const labels = labelsOf("pages = $router({ ", 1, 18);
    expect(labels).not.toContain("url");
    expect(labels).not.toContain("colors");
  });
});

describe("builtin config-key hover", () => {
  it("describes an $http config key under the cursor", () => {
    const info = getHoverInfo('$x = $http({ url: "/a" })', { line: 1, column: 14 }, defaultLibrary);
    expect(info?.kind).toBe("prop");
    expect(info?.contents).toContain("$http config · url");
  });

  it("describes a $theme config key under the cursor", () => {
    const info = getHoverInfo("t = $theme({ colors: {} })", { line: 1, column: 14 }, defaultLibrary);
    expect(info?.contents).toContain("$theme config · colors");
  });
});

describe("member hover", () => {
  it("describes a $util method under the cursor", () => {
    const info = getHoverInfo("x = $util.format(v)", { line: 1, column: 12 }, defaultLibrary);
    expect(info?.kind).toBe("builtin");
    expect(info?.contents).toContain("$util.format");
  });

  it("describes a nested $util.style member", () => {
    const info = getHoverInfo("x = $util.style.cx(a)", { line: 1, column: 18 }, defaultLibrary);
    expect(info?.contents).toContain("$util.style.cx");
  });

  it("describes a factory-bag property", () => {
    const src = "$todos = $http({ url: u })\nx = $todos.data";
    const info = getHoverInfo(src, { line: 2, column: 13 }, defaultLibrary);
    expect(info?.contents).toContain("$todos.data");
  });
});

describe("member semantic tokens", () => {
  const tokenAt = (src: string, line: number, column: number) =>
    getSemanticTokens(src).find((t) => t.line === line && t.column === column);

  it("tags a $util method as a function", () => {
    // `$util.format` — `format` starts at column 11.
    const tok = tokenAt("x = $util.format(v)", 1, 11);
    expect(tok?.tokenType).toBe("function");
    expect(tok?.tokenModifiers).toContain("defaultLibrary");
  });

  it("tags a $util reactive-env property", () => {
    const tok = tokenAt("x = $util.scroll.y", 1, 11);
    expect(tok?.tokenType).toBe("property");
  });

  it("tags a nested sub-namespace then its method", () => {
    const src = "x = $util.style.cx(a)";
    expect(tokenAt(src, 1, 11)?.tokenType).toBe("namespace"); // style
    expect(tokenAt(src, 1, 17)?.tokenType).toBe("function"); // cx
  });

  it("tags a factory-bag method", () => {
    const src = "$todos = $http({ url: u })\nx = $todos.refetch()";
    const tok = tokenAt(src, 2, 12); // refetch
    expect(tok?.tokenType).toBe("function");
  });

  it("tags object-style component argument keys as properties", () => {
    // `Button("Save", { variant: "primary", size: "lg" })`
    const src = 'x = Button("Save", { variant: "primary", size: "lg" })';
    const variant = tokenAt(src, 1, 22); // `variant`
    expect(variant?.tokenType).toBe("property");
    const size = getSemanticTokens(src).find((t) => t.line === 1 && t.tokenType === "property" && t.column > 30);
    expect(size).toBeDefined();
  });

  it("tags keys in a single all-named object argument", () => {
    const src = "x = Card({ variant: v })";
    const variant = tokenAt(src, 1, 12);
    expect(variant?.tokenType).toBe("property");
  });

  it("does not tag identifiers inside a code block as properties", () => {
    // The `{` after `)` opens a function body, not an object literal.
    const src = "function Go() { return Card([]) }";
    const props = getSemanticTokens(src).filter((t) => t.tokenType === "property");
    expect(props.length).toBe(0);
  });
});

describe("member signature help", () => {
  it("describes a $util method call", () => {
    const help = getSignatureHelp("x = $util.format(", { line: 1, column: 18 }, defaultLibrary);
    expect(help?.signatures[0]?.label).toBe("$util.format(value, mode?, options?)");
    expect(help?.signatures[0]?.parameters.map((p) => p.label)).toEqual([
      "value",
      "mode?",
      "options?",
    ]);
  });

  it("describes a factory-bag method call", () => {
    const src = "form = $form({ values: {} })\nx = form.field(";
    const help = getSignatureHelp(src, { line: 2, column: 16 }, defaultLibrary);
    expect(help?.signatures[0]?.label).toBe("form.field(name)");
  });
});
