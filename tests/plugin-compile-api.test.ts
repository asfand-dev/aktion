/**
 * `compileAktionFile` / `compileAktionSource` — producing a `CompiledProgram`
 * outside a Vite build (tests, SSR, CLIs).
 */
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileAktionFile,
  compileAktionSource,
  createNodeResolver,
  loadAktionConfig,
  mergeResolveOptions,
} from "../src/plugin/index.js";
import { isCompiledProgram } from "../src/compiler/index.js";
import { renderCompiled, cleanup } from "../src/testing/index.js";

const dir = mkdtempSync(join(tmpdir(), "aktion-compile-"));
const write = (name: string, source: string): string => {
  const path = join(dir, name);
  writeFileSync(path, source, "utf8");
  return path;
};

const entry = write(
  "app.aktion",
  ['import { label } from "./copy.aktion"', "$app(Text(label()))"].join("\n"),
);
write("copy.aktion", ['export function label() {', '  return "compiled from disk"', "}"].join("\n"));

afterAll(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

describe("compileAktionFile", () => {
  it("links a graph from disk into a mountable program", async () => {
    const compiled = compileAktionFile(entry);
    expect(isCompiledProgram(compiled)).toBe(true);
    expect(compiled.program.sources).toHaveLength(2);

    const screen = renderCompiled(compiled);
    await screen.flush();
    expect(screen.getByText("compiled from disk")).toBeDefined();
  });

  it("reports an unresolved import as a thrown diagnostic", () => {
    // The resolver checks the filesystem (it has to, to extension-complete
    // `"./copy"` → `copy.aktion`), so a missing module fails at RESOLVE time and
    // the diagnostic names the specifier the author wrote rather than an absolute
    // path that was never on disk.
    const broken = write("broken.aktion", 'import { x } from "./missing.aktion"\n$app(Text("hi"))');
    expect(() => compileAktionFile(broken)).toThrow(/Cannot resolve import "\.\/missing\.aktion"/);
  });

  it("reports a syntax error in a dependency", () => {
    write("bad.aktion", "export function oops( {\n");
    const host = write("host.aktion", 'import { oops } from "./bad.aktion"\n$app(Text("hi"))');
    expect(() => compileAktionFile(host)).toThrow(/\[aktion\] failed to compile/);
  });

  it("confines imports to `root`", () => {
    // `../copy.aktion` resolves outside the declared root, so the resolver
    // refuses it rather than reading a file the caller did not opt into.
    const escaping = write("escape.aktion", 'import { label } from "../copy.aktion"\n$app(Text("x"))');
    expect(() => compileAktionFile(escaping, { root: join(dir, "nowhere") })).toThrow(
      /Cannot resolve import/,
    );
  });

  it("`strict` promotes a warning to a failure", () => {
    const noEntry = write("no-entry.aktion", 'greeting = "hi"');
    expect(() => compileAktionFile(noEntry)).not.toThrow();
    expect(() => compileAktionFile(noEntry, { strict: true })).toThrow(/renders nothing/);
  });
});

describe("compileAktionSource", () => {
  it("resolves an inline program's imports against the real filesystem", async () => {
    const compiled = compileAktionSource(
      ['import { label } from "./copy.aktion"', "$app(Text(`inline: ${label()}`))"].join("\n"),
      join(dir, "inline.aktion"),
    );
    const screen = renderCompiled(compiled);
    await screen.flush();
    expect(screen.getByText("inline: compiled from disk")).toBeDefined();
  });

  it("attributes the imported module to its real path, so coverage merges", () => {
    const compiled = compileAktionSource(
      ['import { label } from "./copy.aktion"', "$app(Text(label()))"].join("\n"),
      join(dir, "probe-one.aktion"),
    );
    expect(compiled.program.sources).toEqual([
      join(dir, "probe-one.aktion"),
      join(dir, "copy.aktion"),
    ]);
  });

  it("does not require the virtual entry to exist on disk", () => {
    expect(() =>
      compileAktionSource('$app(Text("nowhere"))', join(dir, "does-not-exist.aktion")),
    ).not.toThrow();
  });
});

/**
 * Monorepo resolution: a shared `.aktion` package that lives outside the app
 * being built, reached by an alias rather than a `../../../..` chain.
 */
describe("module resolution", () => {
  const repo = mkdtempSync(join(tmpdir(), "aktion-repo-"));
  const appSrc = join(repo, "app", "src");
  const libSrc = join(repo, "libs", "ui", "src");
  mkdirSync(appSrc, { recursive: true });
  mkdirSync(libSrc, { recursive: true });

  writeFileSync(
    join(libSrc, "chrome.aktion"),
    'export function Shared() {\n  return Badge("shared", {variant: "success"})\n}\n',
    "utf8",
  );
  writeFileSync(
    join(libSrc, "index.aktion"),
    'export function Barrel() {\n  return Text("from the barrel")\n}\n',
    "utf8",
  );
  writeFileSync(join(repo, "aktion.config.json"), JSON.stringify({ alias: { "@acme/ui": "./libs/ui/src" } }), "utf8");

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  const compileApp = (source: string, options = {}) =>
    compileAktionSource(source, join(appSrc, "app.aktion"), { root: appSrc, ...options });

  it("resolves an aliased specifier declared in aktion.config.json", () => {
    const compiled = compileApp('import { Shared } from "@acme/ui/chrome.aktion"\n$app(Shared())');
    expect(compiled.program.sources).toContain(join(libSrc, "chrome.aktion"));
  });

  it("resolves a bare alias to the target's index.aktion", () => {
    const compiled = compileApp('import { Barrel } from "@acme/ui"\n$app(Barrel())');
    expect(compiled.program.sources).toContain(join(libSrc, "index.aktion"));
  });

  it("completes a missing .aktion extension", () => {
    const compiled = compileApp('import { Shared } from "@acme/ui/chrome"\n$app(Shared())');
    expect(compiled.program.sources).toContain(join(libSrc, "chrome.aktion"));
  });

  it("refuses an aliased specifier that climbs out of its target", () => {
    // An alias widens resolution by exactly the directory it names — `..` inside
    // the remainder must not turn it into a way out of that directory.
    expect(() =>
      compileApp('import { x } from "@acme/ui/../../../etc/passwd"\n$app(Text("x"))'),
    ).toThrow(/Cannot resolve import/);
  });

  it("still refuses a bare specifier with no alias", () => {
    expect(() => compileApp('import { x } from "lodash"\n$app(Text("x"))')).toThrow(
      /Cannot resolve import "lodash"/,
    );
  });

  it("`config: false` pins resolution to the passed options alone", () => {
    expect(() =>
      compileApp('import { Shared } from "@acme/ui/chrome.aktion"\n$app(Shared())', { config: false }),
    ).toThrow(/Cannot resolve import/);
  });

  it("an explicit `roots` entry admits a relative import across packages", () => {
    const compiled = compileApp(
      'import { Shared } from "../../libs/ui/src/chrome.aktion"\n$app(Shared())',
      { config: false, roots: [libSrc] },
    );
    expect(compiled.program.sources).toContain(join(libSrc, "chrome.aktion"));
  });

  describe("loadAktionConfig", () => {
    it("finds the nearest config above a path and absolutises its targets", () => {
      const found = loadAktionConfig(appSrc);
      expect(found?.configPath).toBe(join(repo, "aktion.config.json"));
      expect(found?.alias?.["@acme/ui"]).toBe(libSrc);
    });

    it("returns null when no config exists above the path", () => {
      expect(loadAktionConfig(tmpdir())).toBeNull();
    });

    it("returns null for a malformed config rather than failing the build", () => {
      const broken = mkdtempSync(join(tmpdir(), "aktion-badcfg-"));
      writeFileSync(join(broken, "aktion.config.json"), "{ not json", "utf8");
      expect(loadAktionConfig(broken)).toBeNull();
      rmSync(broken, { recursive: true, force: true });
    });
  });

  describe("mergeResolveOptions", () => {
    it("lets explicit options win over the discovered config", () => {
      const merged = mergeResolveOptions(
        { alias: { a: "/from-config", b: "/kept" }, roots: ["/r1"] },
        { alias: { a: "/from-caller" }, roots: ["/r2"] },
      );
      expect(merged.alias).toEqual({ a: "/from-caller", b: "/kept" });
      expect(merged.roots).toEqual(["/r1", "/r2"]);
    });

    it("passes the override through untouched when there is no config", () => {
      const override = { alias: { a: "/x" } };
      expect(mergeResolveOptions(null, override)).toBe(override);
    });
  });

  describe("createNodeResolver", () => {
    it("refuses to load a path outside every allowed root", () => {
      const resolver = createNodeResolver({ root: appSrc });
      expect(() => resolver.load(join(libSrc, "chrome.aktion"))).toThrow(/refusing to read/);
    });

    it("prefers the longest matching alias prefix", () => {
      const nested = join(libSrc, "forms");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, "field.aktion"), 'export function F() { return Text("f") }\n', "utf8");
      const resolver = createNodeResolver({
        root: appSrc,
        alias: { "@acme/ui": libSrc, "@acme/ui/forms": nested },
      });
      // Under the short prefix this would be `<libSrc>/forms/forms/field.aktion`.
      expect(resolver.resolve("@acme/ui/forms/field.aktion", join(appSrc, "app.aktion"))).toBe(
        join(nested, "field.aktion"),
      );
    });
  });
});
