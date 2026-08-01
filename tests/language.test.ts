import { describe, expect, it } from "vitest";
import {
  getLanguageSpec,
  getComponentCatalog,
  getSnippets,
  createStreamTokenizer,
  grammarSpec,
  type StreamLike,
  type StreamState,
} from "../src/language/index.js";

describe("getLanguageSpec", () => {
  const spec = getLanguageSpec();

  it("returns the static grammar spec", () => {
    expect(spec.grammar.name).toBe("aktion");
    expect(spec.grammar.atoms).toContain("true");
    expect(spec.grammar.brackets.map((b) => b.open)).toEqual(["(", "[", "{"]);
    expect(spec.grammar.strings.multiLineQuote).toBe("`");
  });

  it("includes a non-empty components array containing core names", () => {
    expect(Array.isArray(spec.components)).toBe(true);
    expect(spec.components.length).toBeGreaterThan(50);
    const names = new Set(spec.components.map((c) => c.name));
    for (const required of ["Card", "Stack", "Hero", "KanbanBoard", "PageHeader", "Stats", "NavLink"]) {
      expect(names.has(required), `${required} should be in catalog`).toBe(true);
    }
  });

  it("projects component params (name, type, required, enumValues) and signature", () => {
    const card = spec.componentsByName.Card;
    expect(card).toBeDefined();
    expect(card?.params.length).toBeGreaterThan(0);
    const childrenParam = card?.params.find((p) => p.name === "children");
    expect(childrenParam?.required).toBe(true);
    const variantParam = card?.params.find((p) => p.name === "variant");
    expect(variantParam?.required).toBe(false);
    expect(variantParam?.enumValues).toEqual(["default", "outlined", "elevated"]);
    expect(card?.signature).toBe("Card(children, variant?, padding?, onClick?, href?)");
    expect(card?.group).toBe("Layout");
  });

  it("ships at least 5 snippets keyed by name", () => {
    expect(spec.snippets.length).toBeGreaterThanOrEqual(5);
    const keys = new Set(spec.snippets.map((s) => s.name));
    expect(keys.has("Card")).toBe(true);
    expect(keys.has("Hero")).toBe(true);
    expect(keys.has("KanbanBoard")).toBe(true);
  });

  it("exposes built-in theme names", () => {
    expect(spec.themeNames).toContain("light");
    expect(spec.themeNames).toContain("dark");
    expect(spec.themeNames).toContain("modern");
  });

  it("maps grammar token kinds to highlight tag names", () => {
    expect(spec.tagMap.component).toBe("typeName");
    expect(spec.tagMap.state).toBe("variableName.special");
  });
});

describe("getComponentCatalog (pure derivation)", () => {
  it("ignores DOM render functions and exposes only data", () => {
    const catalog = getComponentCatalog();
    for (const entry of catalog) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.description).toBe("string");
      expect(typeof entry.signature).toBe("string");
      expect(Array.isArray(entry.params)).toBe(true);
      expect((entry as unknown as { render?: unknown }).render).toBeUndefined();
    }
  });
});

describe("getSnippets", () => {
  it("returns templates with placeholders", () => {
    const all = getSnippets();
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const snippet of all) {
      expect(snippet.template.length).toBeGreaterThan(0);
    }
  });
});

describe("createStreamTokenizer", () => {
  function makeStream(line: string): StreamLike {
    let pos = 0;
    return {
      sol: () => pos === 0,
      peek: () => (pos < line.length ? line[pos] : null),
      next: () => {
        if (pos >= line.length) return undefined;
        const ch = line[pos];
        pos += 1;
        return ch;
      },
      eatWhile(test) {
        const before = pos;
        while (pos < line.length) {
          const ch = line[pos] ?? "";
          const matches =
            test instanceof RegExp
              ? test.test(ch)
              : (test as (c: string) => boolean)(ch);
          if (!matches) break;
          pos += 1;
        }
        return pos > before;
      },
      eat(test) {
        if (pos >= line.length) return undefined;
        const ch = line[pos] ?? "";
        const matches =
          typeof test === "string"
            ? ch === test
            : test instanceof RegExp
            ? test.test(ch)
            : (test as (c: string) => boolean)(ch);
        if (matches) {
          pos += 1;
          return ch;
        }
        return undefined;
      },
      match(pattern, consume = true) {
        if (typeof pattern === "string") {
          if (line.slice(pos, pos + pattern.length) === pattern) {
            if (consume) pos += pattern.length;
            return true;
          }
          return false;
        }
        const rest = line.slice(pos);
        const m = rest.match(pattern);
        if (m && m.index === 0) {
          if (consume) pos += m[0].length;
          return m;
        }
        return null;
      },
      skipToEnd: () => {
        pos = line.length;
      },
      eol: () => pos >= line.length,
    };
  }

  function tokenize(source: string): string[] {
    const tokenizer = createStreamTokenizer();
    const out: string[] = [];
    let state: StreamState = tokenizer.startState();
    for (const line of source.split("\n")) {
      const stream = makeStream(line);
      while (!stream.eol()) {
        const tok = tokenizer.token(stream, state);
        if (tok) out.push(tok);
      }
    }
    return out;
  }

  it("tags components, state refs, strings, numbers, and atoms", () => {
    const tokens = tokenize('aktion = Card("title", [for (let x of $items) { x.name }])');
    expect(tokens).toContain("component");
    expect(tokens).toContain("state");
    expect(tokens).toContain("string");
  });

  it("handles line comments and block comments", () => {
    const tokens = tokenize("// a comment\nfoo = /* hi */ 1");
    expect(tokens.filter((t) => t === "comment").length).toBe(2);
    expect(tokens).toContain("number");
  });

  it("`#` is not recognised as a comment (removed in 0.5)", () => {
    const tokens = tokenize("# header\nfoo = 1 # trailing");
    expect(tokens.filter((t) => t === "comment").length).toBe(0);
    expect(tokens).toContain("number");
  });

  it("matches multi-char operators", () => {
    const tokens = tokenize('flag = a == b && c != d');
    const ops = tokens.filter((t) => t === "operator");
    expect(ops.length).toBeGreaterThanOrEqual(3);
  });
});

describe("grammarSpec is stable JSON-style data", () => {
  it("is serialisable", () => {
    expect(() => JSON.stringify({
      ...grammarSpec,
      identifier: {
        start: grammarSpec.identifier.start.source,
        part: grammarSpec.identifier.part.source,
      },
    })).not.toThrow();
  });
});
