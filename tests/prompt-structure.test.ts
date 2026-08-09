/**
 * Structural guarantees for the generated system prompt.
 *
 * `tests/prompt-signature-integrity.test.ts` already asserts the prompt never
 * documents a prop that does not exist. This file guards the things that went
 * wrong *mechanically* — where the generator silently dropped or mis-emitted the
 * runtime's own teaching material, and no test noticed:
 *
 *  1. The `(positional)` marker was gated on `prop.positional === true`, but
 *     `findPositionalIndex` falls back to `props[0]`. 194 of 282 components
 *     resolved a positional slot at runtime and carried no marker, while the
 *     section header told the model to "pass the prop tagged (positional) bare".
 *  2. `componentGroups[].notes` — 150 authored "which component should I reach
 *     for" notes — were never read by the group loop. 144 of them never appeared
 *     in the prompt at all.
 *  3. The prompt's own routing examples called `MainSidebar()`, a component that
 *     does not exist, i.e. it demonstrated the exact failure the runtime calls
 *     "the single most common defect in LLM-authored Aktion".
 *  4. The one worked example sat AFTER 190k characters of component dump.
 */

import { describe, expect, it } from "vitest";
import { generatePrompt } from "../src/prompt/generator.js";
import { defaultLibrary } from "../src/library/index.js";
import { getDiagnostics } from "../src/tooling/language-service.js";
import { findPositionalProp } from "../src/library/types.js";

const fullPrompt = generatePrompt(defaultLibrary);
const chatPrompt = generatePrompt(defaultLibrary, { mode: "chat" });

describe("prompt — the positional-slot marker", () => {
  it("marks the resolved positional slot on every component that has props", () => {
    const unmarked: string[] = [];
    for (const spec of defaultLibrary.components) {
      if (spec.props.length === 0) continue;
      const positional = findPositionalProp(spec);
      if (!positional) continue;
      // The signature line for this component, from the generated dump.
      const line = fullPrompt
        .split("\n")
        .find((l) => l.startsWith(`- ${spec.name}(`));
      if (!line) continue; // ungrouped components are covered by another test
      if (!line.includes("(positional")) unmarked.push(spec.name);
    }
    expect(unmarked).toEqual([]);
  });

  it("marks exactly one positional slot per signature line", () => {
    const offenders: string[] = [];
    for (const line of fullPrompt.split("\n")) {
      if (!/^- [A-Z][A-Za-z0-9_]*\(/.test(line)) continue;
      const count = (line.match(/\(positional/g) ?? []).length;
      if (count > 1) offenders.push(line.slice(0, 80));
    }
    expect(offenders).toEqual([]);
  });
});

describe("prompt — authored group notes", () => {
  it("emits every componentGroups[].notes entry", () => {
    const missing: string[] = [];
    for (const group of defaultLibrary.componentGroups ?? []) {
      for (const note of group.notes ?? []) {
        // Compare on a distinctive prefix: the loop normalises the leading "- ".
        const needle = note.replace(/^-\s*/, "").slice(0, 60);
        if (!fullPrompt.includes(needle)) missing.push(`${group.name}: ${needle}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("carries the guidance an LLM most often gets wrong", () => {
    // Spot-check the highest-value notes rather than only the mechanical count,
    // so a refactor that drops the notes silently still fails loudly.
    expect(fullPrompt).toContain("THREE primitives cover almost everything");
    expect(fullPrompt).toContain("Build columns using array pluck");
    expect(fullPrompt).toContain("Patterns are **opinionated composites**");
  });
});

describe("prompt — every component named in a code example exists", () => {
  /**
   * The generator's own examples are code the model will copy. A call to a
   * component that does not exist renders nothing, silently — so an example that
   * names one is worse than no example. This is the test that would have caught
   * `MainSidebar()`.
   */
  const KNOWN = new Set(defaultLibrary.components.map((c) => c.name));

  /** Names that are language constructs or host globals, not components. */
  const NOT_COMPONENTS = new Set([
    "Series", // a real component, but listed for clarity
    "Math", "JSON", "Date", "Object", "Array", "String", "Number", "Boolean",
    "Promise", "Map", "Set", "URL", "URLSearchParams", "Intl", "RegExp", "Error",
    "TextEncoder", "TextDecoder", "AbortController", "FormData", "Blob", "File",
    "Headers", "Request", "Response", "WebSocket", "EventSource", "Worker",
    "CustomEvent", "Event", "IntersectionObserver", "ResizeObserver",
    "MutationObserver", "DOMParser", "Notification", "Image", "Function",
    "BigInt", "Symbol", "WeakMap", "WeakSet", "Proxy", "Reflect", "ArrayBuffer",
  ]);

  function fencedBlocks(prompt: string): string[] {
    const blocks: string[] = [];
    const lines = prompt.split("\n");
    let open = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]!.trim() === "```") {
        if (open < 0) open = i;
        else {
          blocks.push(lines.slice(open + 1, i).join("\n"));
          open = -1;
        }
      }
    }
    return blocks;
  }

  /**
   * The worked examples are the code a model will copy verbatim, so they are held
   * to the strict standard: every PascalCase callee must be a real component or
   * declared in the same block.
   *
   * Short illustrative fragments elsewhere are NOT held to it, because a routing
   * config snippet legitimately writes `"/": Home()` without defining `Home` —
   * that is a placeholder for the reader's own page component, and spelling it out
   * would bury the construct being demonstrated. The `never presents a
   * non-existent component as correct usage` test below covers the actual risk in
   * those fragments.
   */
  it("uses only real or locally-declared component names in the worked examples", () => {
    const examplesSection = fullPrompt.slice(
      fullPrompt.indexOf("## Examples"),
      fullPrompt.indexOf("## Component library"),
    );
    const offenders: string[] = [];
    for (const block of fencedBlocks(examplesSection)) {
      const declared = new Set<string>();
      for (const m of block.matchAll(/function\s+(\$?[A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
        declared.add(m[1]!);
      }
      for (const m of block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
        declared.add(m[1]!);
      }
      for (const m of block.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\(/g)) {
        const name = m[1]!;
        if (KNOWN.has(name) || declared.has(name) || NOT_COMPONENTS.has(name)) continue;
        offenders.push(name);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("never presents a non-existent component as correct usage", () => {
    // Names that a model invents in place of a real Aktion component, and that no
    // reasonable example would use for anything else. `Panel` and `Label` are
    // deliberately NOT on this list: both are natural names for an author's own
    // component or a parameter, and the prompt uses `Panel` that way when
    // demonstrating named slots.
    //
    // Matched on a word boundary: a naive substring test flags `HTMLTag(` for
    // `Tag(` and `ActionLink(` for `Link(`, both of which are real.
    const invented = ["Alert", "Tag", "Chip", "Textbox", "Snackbar", "Dialog"];
    for (const name of invented) {
      const call = new RegExp(`(?<![A-Za-z0-9_])${name}\\s*\\(`);
      const declaration = new RegExp(`function\\s+${name}\\s*\\(`);
      for (const line of fullPrompt.split("\n")) {
        if (!call.test(line)) continue;
        const excused =
          line.trimStart().startsWith("✗") ||   // the WRONG side of the table
          line.includes("DO NOT EXIST") ||        // the prose naming them
          declaration.test(line);                 // an author's own component
        expect(excused, `"${name}(" presented as valid in: ${line.trim()}`).toBe(true);
      }
    }
  });
});

describe("prompt — the worked examples are valid programs", () => {
  /**
   * Every default example must pass the same validation the runtime applies,
   * INCLUDING the unknown-component lint (a warning, not an error — so a plain
   * `program.errors` check would miss a hallucinated name entirely).
   */
  it("validates each example with zero errors and zero warnings", () => {
    const examplesSection = fullPrompt.slice(
      fullPrompt.indexOf("## Examples"),
      fullPrompt.indexOf("## Component library"),
    );
    expect(examplesSection.length).toBeGreaterThan(0);

    const blocks: string[] = [];
    const lines = examplesSection.split("\n");
    let open = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]!.trim() === "```") {
        if (open < 0) open = i;
        else {
          blocks.push(lines.slice(open + 1, i).join("\n"));
          open = -1;
        }
      }
    }

    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const block of blocks) {
      const diagnostics = getDiagnostics(block, defaultLibrary);
      expect(diagnostics, `example failed:\n${block.slice(0, 200)}`).toEqual([]);
    }
  });
});

describe("prompt — section budget and ordering", () => {
  it("puts the worked examples BEFORE the component dump", () => {
    const examples = fullPrompt.indexOf("## Examples");
    const library = fullPrompt.indexOf("## Component library");
    expect(examples).toBeGreaterThan(0);
    expect(library).toBeGreaterThan(0);
    expect(examples).toBeLessThan(library);
  });

  it("puts the cheat sheet and the mistakes table in the first 15% of the prompt", () => {
    const cheat = fullPrompt.indexOf("## Cheat sheet");
    const mistakes = fullPrompt.indexOf("## Common mistakes");
    expect(cheat).toBeGreaterThan(0);
    expect(mistakes).toBeGreaterThan(0);
    expect(cheat / fullPrompt.length).toBeLessThan(0.15);
    expect(mistakes / fullPrompt.length).toBeLessThan(0.15);
  });

  it("ends with the pre-flight checklist", () => {
    expect(fullPrompt.trimEnd().length - fullPrompt.indexOf("## Streaming & verification"))
      .toBeLessThan(3000);
  });

  it("gives the examples a non-trivial share of the prompt", () => {
    // They were 0.5% of it, and last. A checklist the model never reaches is not
    // a checklist; nor is one example for a 281-component surface.
    const examples = fullPrompt.indexOf("## Examples");
    const library = fullPrompt.indexOf("## Component library");
    const share = (library - examples) / fullPrompt.length;
    expect(share).toBeGreaterThan(0.02);
  });
});

describe("chat prompt — the read-only subset", () => {
  const chatNames = new Set(
    [...chatPrompt.matchAll(/^- ([A-Z][A-Za-z0-9_]*)\(/gm)].map((m) => m[1]!),
  );

  it("covers every shape a Markdown answer takes", () => {
    // Chat mode exists to replace a Markdown reply. Each entry here is a
    // Markdown construct (or something Markdown cannot express at all) paired
    // with the component that has to be reachable to render it. A gap here is
    // the failure the allowlist is meant to prevent: the model falls back to
    // stitching Card + Text by hand, or emits literal Markdown syntax.
    const shapes: Record<string, string> = {
      heading: "Heading",
      paragraph: "Markdown",
      "short label": "Text",
      "bullet list": "ListBlock",
      "rich list": "List",
      "numbered procedure": "Steps",
      blockquote: "Quote",
      "fenced code": "CodeBlock",
      "shell session": "Terminal",
      diff: "DiffViewer",
      table: "Table",
      "comparison matrix": "ComparisonTable",
      "key/value pairs": "DescriptionList",
      admonition: "Callout",
      "thematic break": "Separator",
      image: "Image",
      "key figure": "StatCard",
      "trend over time": "LineChart",
      ranking: "BarChart",
      proportion: "PieChart",
      chronology: "Timeline",
      "titled block": "SectionBlock",
      "nothing found": "EmptyState",
      "it failed": "ErrorState",
      "suggested follow-ups": "FollowUpBlock",
    };
    for (const [shape, name] of Object.entries(shapes)) {
      expect(chatNames.has(name), `no component for "${shape}" (${name} missing)`).toBe(true);
    }
  });

  it("excludes interactive components a one-shot reply cannot drive", () => {
    for (const name of [
      "Input", "Button", "Form", "Modal", "Drawer", "AppShell", "Sidebar",
      "DataGrid", "CommandPalette", "Mount", "WebComponent", "HTMLTag", "Styles",
      "NavLink", "RichTextEditor", "OnClick",
    ]) {
      expect(chatNames.has(name), `${name} should not be in chat mode`).toBe(false);
    }
  });

  it("excludes marketing, storefront and app-shell furniture", () => {
    // The denylist era left these reachable, and a model handed `Hero` and
    // `PricingTable` answers a question with a landing page.
    for (const name of [
      "Hero", "PricingTable", "PricingCard", "LogoCloud", "LogoChip",
      "Testimonial", "FeatureGrid", "Footer", "Brand", "ProductCard",
      "PriceTag", "OrderSummary", "TableOfContents", "SkipLink", "Breadcrumb",
      "FieldRepeater", "IconButton", "Bento", "PageHeader", "Banner",
    ]) {
      expect(chatNames.has(name), `${name} should not be in chat mode`).toBe(false);
    }
  });

  it("names only components that exist", () => {
    const known = new Set(defaultLibrary.components.map((c) => c.name));
    const unknown = [...chatNames].filter((n) => !known.has(n));
    expect(unknown).toEqual([]);
  });

  it("stays a small, memorable vocabulary", () => {
    // The catalogue is the bulk of this prompt. An allowlist that creeps back
    // past ~70 names is drifting toward the denylist it replaced, where the
    // component dump crowded out every instruction around it.
    expect(chatNames.size).toBeGreaterThan(40);
    expect(chatNames.size).toBeLessThan(70);
  });

  it("is a fraction of the full prompt", () => {
    expect(chatPrompt.length).toBeLessThan(fullPrompt.length / 4);
  });
});
