/**
 * In-browser project linker: specifier resolution, in-memory linking, URL
 * prefetch (injected fetch), and the `compileLite` / `isCompiledProgram` helpers.
 */

import { describe, expect, it } from "vitest";
import {
  resolveSpecifier,
  linkProject,
  compileLite,
  isCompiledProgram,
} from "../src/compiler/index.js";
import type { Statement } from "../src/parser/types.js";

const compNames = (stmts: readonly Statement[]) =>
  stmts.filter((s) => s.kind === "ComponentDeclaration").map((s) => (s as { name: string }).name);

describe("resolveSpecifier", () => {
  it("resolves relative paths against the importer directory", () => {
    expect(resolveSpecifier("./Button.aktion", "app.aktion")).toBe("Button.aktion");
    expect(resolveSpecifier("./Button.aktion", "components/App.aktion")).toBe("components/Button.aktion");
    expect(resolveSpecifier("../Button.aktion", "components/App.aktion")).toBe("Button.aktion");
  });

  it("resolves absolute paths against the project root", () => {
    expect(resolveSpecifier("/components/Button.aktion", "app.aktion")).toBe("components/Button.aktion");
    expect(resolveSpecifier("/Button.aktion", "deep/nested/App.aktion")).toBe("Button.aktion");
  });

  it("passes URL specifiers through, and resolves relative imports under a URL importer", () => {
    expect(resolveSpecifier("https://example.com/B.aktion", "app.aktion")).toBe("https://example.com/B.aktion");
    expect(resolveSpecifier("./rel.aktion", "https://example.com/dir/app.aktion")).toBe(
      "https://example.com/dir/rel.aktion",
    );
  });

  it("returns null for bare specifiers", () => {
    expect(resolveSpecifier("lodash", "app.aktion")).toBeNull();
  });
});

describe("linkProject (in-memory)", () => {
  it("links a 2-file project and renames the imported component privately", async () => {
    const files = {
      "app.aktion": `import { Button } from "./Button.aktion"\naktion = Button()`,
      "Button.aktion": `export function Button() { return Text("Click") }`,
    };
    const { program, diagnostics, dependencies, source } = await linkProject({ entry: "app.aktion", files });
    expect(diagnostics).toEqual([]);
    expect(dependencies).toEqual(["Button.aktion"]);
    expect(compNames(program.statements)).toContain("__a1_Button");
    expect(source).toContain("aktion = __a1_Button()");
  });

  it("reports a diagnostic for a missing project file", async () => {
    const files = { "app.aktion": `import { X } from "./missing.aktion"\naktion = Text("x")` };
    const { diagnostics } = await linkProject({ entry: "app.aktion", files });
    expect(diagnostics.some((d) => /Failed to load/.test(d.message))).toBe(true);
  });

  it("reports a diagnostic when the entry is not found", async () => {
    const { diagnostics } = await linkProject({ entry: "nope.aktion", files: {} });
    expect(diagnostics.some((d) => /Entry module "nope.aktion" was not found/.test(d.message))).toBe(true);
  });
});

describe("linkProject (URL imports)", () => {
  it("fetches a URL module via the injected fetch and links it", async () => {
    const files = {
      "app.aktion": `import { Remote } from "https://x.test/Remote.aktion"\naktion = Remote()`,
    };
    const fetchImpl = async (url: string): Promise<string> => {
      if (url === "https://x.test/Remote.aktion") return `export function Remote() { return Text("R") }`;
      throw new Error(`unexpected url ${url}`);
    };
    const { program, diagnostics, dependencies } = await linkProject({ entry: "app.aktion", files, fetch: fetchImpl });
    expect(diagnostics).toEqual([]);
    expect(dependencies).toContain("https://x.test/Remote.aktion");
    expect(compNames(program.statements).some((n) => /_Remote$/.test(n))).toBe(true);
  });

  it("turns a URL fetch failure into a diagnostic (rest of the graph still links)", async () => {
    const files = {
      "app.aktion": `import { Down } from "https://x.test/Down.aktion"\naktion = Text("ok")`,
    };
    const fetchImpl = async (): Promise<string> => {
      throw new Error("network down");
    };
    const { diagnostics } = await linkProject({ entry: "app.aktion", files, fetch: fetchImpl });
    expect(diagnostics.some((d) => /Failed to fetch module/.test(d.message))).toBe(true);
  });
});

describe("compileLite / isCompiledProgram", () => {
  it("wraps a single-file source as a CompiledProgram", () => {
    const compiled = compileLite(`aktion = Text("hi")`, { path: "x.aktion" });
    expect(isCompiledProgram(compiled)).toBe(true);
    expect(compiled.path).toBe("x.aktion");
  });

  it("rejects non-CompiledProgram values", () => {
    expect(isCompiledProgram({})).toBe(false);
    expect(isCompiledProgram(null)).toBe(false);
    expect(isCompiledProgram({ __aktionCompiled: 99, program: { statements: [] }, source: "", path: "" })).toBe(false);
  });
});
