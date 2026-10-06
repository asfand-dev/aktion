/**
 * Link order: the linker is a depth-first, post-order walk that takes each
 * module's `import` statements in the order they are written — the order ES
 * modules evaluate in. Reordering imports therefore reorders the merged
 * program, and with it the order the modules' top-level statements run in.
 * Documented in `docs/modules.html#link-order`; any tool that sorts imports
 * must not.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { linkProgram, defineCompiledProgram, COMPILED_PROGRAM_VERSION } from "../src/compiler/index.js";
import type { ModuleResolver } from "../src/compiler/index.js";
import { renderCompiled, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function resolver(files: Record<string, string>): ModuleResolver {
  return {
    resolve: (spec) => (spec.startsWith("./") ? `/${spec.slice(2)}` : null),
    load: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
}

const link = (files: Record<string, string>) => linkProgram(files["/app.aktion"]!, "/app.aktion", resolver(files));

const A = 'console.log("a")\nexport $a = 1';
const B = 'console.log("b")\nexport $b = 2';
const C = 'console.log("c")\nexport $c = 3';
const entry = (...imports: string[]) =>
  [...imports, 'console.log("entry")', '$app(Text("x"))'].join("\n");
const importA = 'import { $a } from "./a.aktion"';
const importB = 'import { $b } from "./b.aktion"';

describe("link order", () => {
  it("links imports in the order they are written, entry last", () => {
    const ab = link({ "/app.aktion": entry(importA, importB), "/a.aktion": A, "/b.aktion": B });
    const ba = link({ "/app.aktion": entry(importB, importA), "/a.aktion": A, "/b.aktion": B });

    expect(ab.diagnostics).toEqual([]);
    expect(ba.diagnostics).toEqual([]);
    expect(ab.dependencies).toEqual(["/a.aktion", "/b.aktion"]);
    expect(ba.dependencies).toEqual(["/b.aktion", "/a.aktion"]);
    expect(ab.program.sources).toEqual(["/app.aktion", "/a.aktion", "/b.aktion"]);
    expect(ba.program.sources).toEqual(["/app.aktion", "/b.aktion", "/a.aktion"]);
  });

  it("links a module's own imports before the module (post-order)", () => {
    const result = link({
      "/app.aktion": entry(importA, importB),
      "/a.aktion": `import { $c } from "./c.aktion"\n${A}`,
      "/b.aktion": B,
      "/c.aktion": C,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.dependencies).toEqual(["/c.aktion", "/a.aktion", "/b.aktion"]);
  });

  it("merges the statements in link order, so top-level code runs in it", async () => {
    const run = async (files: Record<string, string>): Promise<string[]> => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const { program } = link(files);
      renderCompiled(
        defineCompiledProgram({
          __aktionCompiled: COMPILED_PROGRAM_VERSION,
          program,
          source: files["/app.aktion"]!,
          path: "/app.aktion",
        }),
      );
      await flush(12);
      const calls = log.mock.calls.map((call) => String(call[0]));
      log.mockRestore();
      cleanup();
      return calls;
    };

    expect(await run({ "/app.aktion": entry(importA, importB), "/a.aktion": A, "/b.aktion": B })).toEqual([
      "a",
      "b",
      "entry",
    ]);
    expect(await run({ "/app.aktion": entry(importB, importA), "/a.aktion": A, "/b.aktion": B })).toEqual([
      "b",
      "a",
      "entry",
    ]);
  });
});
