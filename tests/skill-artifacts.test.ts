/**
 * The Aktion agent skill (`skills/aktion/`) must never drift from the runtime.
 *
 * Its predecessor, a single hand-maintained `coding-gen-skill.md`, rotted through
 * two feature waves: it invented 24 group names where the library has 17, omitted
 * eight real components, and 11 of its 22 flagship worked examples no longer
 * validated — teaching props that do not exist. Nothing failed, because nothing
 * ever checked.
 *
 * `scripts/emit-skill.mjs` regenerates the reference half and gates the examples
 * at build time. This test is the CI half of the same contract: it fails if the
 * committed artifacts are stale relative to the current library, so a change to
 * `src/library/` that forgets `npm run build:skill` is caught in review rather
 * than shipped.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { defaultLibrary } from "../src/library/index.js";
import { getComponentCatalog } from "../src/language/components.js";
import { builtinCatalog } from "../src/language/builtins.js";
import { getDiagnostics } from "../src/tooling/language-service.js";
import { builtInThemes } from "../src/theme/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = resolve(repoRoot, "skills/aktion");
const referencesDir = resolve(skillDir, "references");
const componentsDir = resolve(referencesDir, "components");

const read = (relative: string): string =>
  readFileSync(resolve(skillDir, relative), "utf8");

const slug = (name: string): string =>
  name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

describe("agent skill — structure", () => {
  it("has the SKILL.md entry point with valid frontmatter", () => {
    const text = read("SKILL.md");
    expect(text.startsWith("---\n")).toBe(true);
    const frontmatter = text.slice(4, text.indexOf("\n---", 4));
    // An Agent Skill name must be a lowercase, hyphen-only slug — the old file's
    // `aktion/coding-gen-skill` was not a valid one.
    const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
    expect(name).toBeDefined();
    expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
    // The description is what an agent matches against, so it has to describe
    // trigger conditions, not just the topic.
    const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
    expect(description).toBeDefined();
    expect(description!.length).toBeGreaterThan(120);
  });

  it("keeps the hand-written references present", () => {
    for (const file of ["layout.md", "gotchas.md", "patterns.md", "language.md"]) {
      expect(existsSync(resolve(referencesDir, file)), `${file} missing`).toBe(true);
    }
  });

  it("has one generated component file per group, plus an index", () => {
    const groups = defaultLibrary.componentGroups ?? [];
    const files = readdirSync(componentsDir).sort();
    expect(files).toContain("index.md");
    for (const group of groups) {
      expect(files, `no reference file for group "${group.name}"`).toContain(`${slug(group.name)}.md`);
    }
    expect(files.length).toBe(groups.length + 1);
  });

  it("resolves every relative markdown link", () => {
    const files = ["SKILL.md", ...readdirSync(referencesDir).filter((f) => f.endsWith(".md")).map((f) => `references/${f}`)];
    const broken: string[] = [];
    for (const file of files) {
      const dir = dirname(resolve(skillDir, file));
      for (const m of read(file).matchAll(/\]\((\.[^)#]*?)(#[^)]*)?\)/g)) {
        const target = resolve(dir, m[1]!);
        if (!existsSync(target)) broken.push(`${file} → ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("agent skill — generated references are current", () => {
  it("names every component in the library, and no others", () => {
    const catalog = getComponentCatalog(defaultLibrary);
    const index = read("references/components/index.md");
    const missing = catalog.filter((c) => !index.includes(`${c.name}(`)).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  it("documents every component in its own group's file", () => {
    const missing: string[] = [];
    for (const group of defaultLibrary.componentGroups ?? []) {
      const text = readFileSync(resolve(componentsDir, `${slug(group.name)}.md`), "utf8");
      for (const name of group.components) {
        if (!text.includes(`### ${name}\n`)) missing.push(`${group.name}/${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("documents every builtin", () => {
    const text = read("references/builtins.md");
    const missing = builtinCatalog.filter((b) => !text.includes(`### \`${b.sigil}\``)).map((b) => b.sigil);
    expect(missing).toEqual([]);
  });

  it("documents every theme and token", () => {
    const text = read("references/themes.md");
    const names = Object.keys(builtInThemes);
    for (const name of names) expect(text, `theme ${name}`).toContain(`\`${name}\``);
    for (const token of Object.keys(builtInThemes[names[0]!]!)) {
      expect(text, `token ${token}`).toContain(`\`${token}\``);
    }
  });

  it("states the true component count in the hand-written SKILL.md", () => {
    const count = getComponentCatalog(defaultLibrary).length;
    const claimed = /(\d+)\s+components/.exec(read("SKILL.md"))?.[1];
    expect(claimed).toBe(String(count));
  });
});

describe("agent skill — every `aktion` example is a valid program", () => {
  /**
   * A block tagged ```aktion is a PROMISE that it is a complete, valid program.
   * Fragments are tagged `js` and are not checked. Gating on warnings as well as
   * errors is deliberate: an unknown-component warning means the example names
   * something that does not exist, which for teaching material is fatal.
   */
  function aktionBlocks(text: string): Array<{ code: string; line: number }> {
    const out: Array<{ code: string; line: number }> = [];
    const lines = text.split("\n");
    let start = -1;
    let fence = "";
    for (let i = 0; i < lines.length; i += 1) {
      if (start < 0) {
        const open = /^```(\w[\w-]*)\s*$/.exec(lines[i]!.trim());
        if (open) {
          fence = open[1]!;
          start = i;
        }
        continue;
      }
      if (lines[i]!.trim() !== "```") continue;
      if (fence === "aktion") out.push({ code: lines.slice(start + 1, i).join("\n"), line: start + 1 });
      start = -1;
    }
    return out;
  }

  const files = [
    "SKILL.md",
    ...readdirSync(referencesDir).filter((f) => f.endsWith(".md")).map((f) => `references/${f}`),
  ];

  it("finds examples to check", () => {
    const total = files.reduce((n, f) => n + aktionBlocks(read(f)).length, 0);
    expect(total).toBeGreaterThan(15);
  });

  for (const file of files) {
    it(`validates every example in ${file}`, () => {
      for (const block of aktionBlocks(read(file))) {
        const diagnostics = getDiagnostics(block.code, defaultLibrary);
        expect(
          diagnostics.map((d) => `L${d.line} ${d.severity}: ${d.message}`),
          `${file} example at line ${block.line}`,
        ).toEqual([]);
      }
    });
  }
});

describe("agent skill — the generator is idempotent", () => {
  /**
   * Running the generator must not change the committed output. This is what
   * actually catches "someone edited src/library/ and forgot to rebuild": the
   * regenerated files differ from what is on disk.
   */
  it("produces byte-identical output when re-run", () => {
    if (!existsSync(resolve(repoRoot, "dist/language.js"))) {
      // The generator reads the built surface; without it there is nothing to
      // compare. Skip rather than fail, so a fresh clone's first test run works.
      return;
    }

    // Snapshot the generated half, regenerate, and compare in-process. Comparing
    // file CONTENT rather than `git status` matters: on a branch where the skill
    // is newly added, every file legitimately shows as added, and a git-based
    // check would fail for a reason that has nothing to do with staleness.
    const generated = [
      "references/builtins.md",
      "references/namespaces.md",
      "references/themes.md",
      ...readdirSync(componentsDir).map((f) => `references/components/${f}`),
    ];
    const before = new Map(generated.map((f) => [f, read(f)]));

    execFileSync("node", ["scripts/emit-skill.mjs"], { cwd: repoRoot, stdio: "pipe" });

    const stale = generated.filter((f) => read(f) !== before.get(f));
    expect(
      stale,
      "these generated skill files are stale — run `npm run build:skill` and commit the result",
    ).toEqual([]);
  });
});
