import { describe, expect, it } from "vitest";
import {
  grammarSpec,
  keywordDocs,
  createStreamTokenizer,
  defaultTagMap,
  type StreamLike,
  type GrammarTokenKind,
} from "../src/language/grammar.js";

/**
 * Minimal StreamLike backed by a string for unit testing the tokenizer.
 */
function createStream(input: string): StreamLike {
  let pos = 0;
  return {
    sol: () => pos === 0,
    peek: () => (pos < input.length ? input[pos]! : null),
    next: () => (pos < input.length ? input[pos++] : undefined),
    eatWhile(test) {
      let eaten = false;
      while (pos < input.length) {
        const ch = input[pos]!;
        const ok = test instanceof RegExp ? test.test(ch) : test(ch);
        if (!ok) break;
        pos++;
        eaten = true;
      }
      return eaten;
    },
    eat(test) {
      if (pos >= input.length) return undefined;
      const ch = input[pos]!;
      const ok = typeof test === "string" ? ch === test : test instanceof RegExp ? test.test(ch) : test(ch);
      if (ok) { pos++; return ch; }
      return undefined;
    },
    match(pattern, consume = false) {
      const rest = input.slice(pos);
      if (typeof pattern === "string") {
        if (rest.startsWith(pattern)) {
          if (consume) pos += pattern.length;
          return true;
        }
        return false;
      }
      const m = rest.match(pattern);
      if (m && m.index === 0) {
        if (consume) pos += m[0].length;
        return m;
      }
      return null;
    },
    skipToEnd: () => { pos = input.length; },
    eol: () => pos >= input.length,
  };
}

function tokenizeLine(line: string): Array<{ kind: GrammarTokenKind | null; text: string }> {
  const tokenizer = createStreamTokenizer();
  const state = tokenizer.startState();
  const stream = createStream(line);
  const result: Array<{ kind: GrammarTokenKind | null; text: string }> = [];
  let prev = 0;
  while (!stream.eol()) {
    const startPos = line.length - (stream as { eol: () => boolean }).toString().length;
    const kind = tokenizer.token(stream, state);
    const consumed = line.slice(prev);
    if (consumed) result.push({ kind, text: consumed });
    prev = line.length;
  }
  return result;
}

describe("grammarSpec", () => {
  it("has the name 'aktion'", () => {
    expect(grammarSpec.name).toBe("aktion");
  });

  it("defines atoms", () => {
    expect(grammarSpec.atoms).toContain("true");
    expect(grammarSpec.atoms).toContain("false");
    expect(grammarSpec.atoms).toContain("null");
    expect(grammarSpec.atoms).toContain("undefined");
  });

  it("defines keywords matching the lexer set plus aktion/route", () => {
    expect(grammarSpec.keywords).toContain("function");
    expect(grammarSpec.keywords).toContain("if");
    expect(grammarSpec.keywords).toContain("else");
    expect(grammarSpec.keywords).toContain("aktion");
    expect(grammarSpec.keywords).toContain("route");
  });

  it("defines bracket pairs", () => {
    expect(grammarSpec.brackets).toContainEqual({ open: "(", close: ")" });
    expect(grammarSpec.brackets).toContainEqual({ open: "[", close: "]" });
    expect(grammarSpec.brackets).toContainEqual({ open: "{", close: "}" });
  });

  it("defines comment styles", () => {
    expect(grammarSpec.comments.line).toBe("//");
    expect(grammarSpec.comments.blockStart).toBe("/*");
    expect(grammarSpec.comments.blockEnd).toBe("*/");
  });

  it("defines string quote styles", () => {
    expect(grammarSpec.strings.singleLineQuotes).toContain('"');
    expect(grammarSpec.strings.singleLineQuotes).toContain("'");
    expect(grammarSpec.strings.multiLineQuote).toBe("`");
  });

  it("defines identifier patterns", () => {
    expect(grammarSpec.identifier.start.test("a")).toBe(true);
    expect(grammarSpec.identifier.start.test("1")).toBe(false);
    expect(grammarSpec.identifier.part.test("1")).toBe(true);
  });

  it("defines state sigil", () => {
    expect(grammarSpec.sigils.state).toBe("$");
  });
});

describe("keywordDocs", () => {
  it("has entries for all grammar keywords", () => {
    for (const kw of grammarSpec.keywords) {
      if (kw === "aktion" || kw === "route") {
        expect(keywordDocs[kw]).toBeDefined();
      }
    }
  });

  it("documents $effect and $emit", () => {
    expect(keywordDocs["$effect"]).toBeDefined();
    expect(keywordDocs["$emit"]).toBeDefined();
  });

  it("each entry has summary, syntax, and example", () => {
    for (const [key, doc] of Object.entries(keywordDocs)) {
      expect(doc.summary).toBeTruthy();
      expect(doc.syntax).toBeTruthy();
      expect(doc.example).toBeTruthy();
    }
  });

  it("has an entry for the common keywords", () => {
    for (const kw of ["if", "else", "for", "while", "return", "function", "let", "const"]) {
      expect(keywordDocs[kw]).toBeDefined();
    }
  });
});

describe("defaultTagMap", () => {
  it("maps all GrammarTokenKind values", () => {
    const kinds: GrammarTokenKind[] = [
      "comment", "string", "number", "atom", "keyword",
      "state", "component", "identifier", "loopvar", "property",
      "operator", "punctuation",
    ];
    for (const kind of kinds) {
      expect(kind in defaultTagMap).toBe(true);
    }
  });

  it("maps punctuation to null", () => {
    expect(defaultTagMap.punctuation).toBeNull();
  });

  it("maps component to typeName", () => {
    expect(defaultTagMap.component).toBe("typeName");
  });
});

describe("createStreamTokenizer()", () => {
  it("returns a tokenizer with required methods", () => {
    const t = createStreamTokenizer();
    expect(typeof t.startState).toBe("function");
    expect(typeof t.copyState).toBe("function");
    expect(typeof t.token).toBe("function");
    expect(t.languageData).toBeDefined();
  });

  it("startState returns clean state", () => {
    const t = createStreamTokenizer();
    const s = t.startState();
    expect(s.inBacktick).toBe(false);
    expect(s.inBlockComment).toBe(false);
  });

  it("copyState creates independent copy", () => {
    const t = createStreamTokenizer();
    const s = t.startState();
    s.inBacktick = true;
    const copy = t.copyState(s);
    expect(copy.inBacktick).toBe(true);
    copy.inBacktick = false;
    expect(s.inBacktick).toBe(true);
  });

  describe("token()", () => {
    const t = createStreamTokenizer();

    it("returns null for whitespace", () => {
      const state = t.startState();
      const stream = createStream("   ");
      const kind = t.token(stream, state);
      expect(kind).toBeNull();
    });

    it("tokenizes line comment", () => {
      const state = t.startState();
      const stream = createStream("// comment");
      const kind = t.token(stream, state);
      expect(kind).toBe("comment");
    });

    it("tokenizes block comment on one line", () => {
      const state = t.startState();
      const stream = createStream("/* comment */");
      const kind = t.token(stream, state);
      expect(kind).toBe("comment");
      expect(state.inBlockComment).toBe(false);
    });

    it("sets inBlockComment for unclosed block comment", () => {
      const state = t.startState();
      const stream = createStream("/* unclosed");
      const kind = t.token(stream, state);
      expect(kind).toBe("comment");
      expect(state.inBlockComment).toBe(true);
    });

    it("resumes block comment from previous state", () => {
      const state = t.startState();
      state.inBlockComment = true;
      const stream = createStream("continued */ code");
      const kind = t.token(stream, state);
      expect(kind).toBe("comment");
      expect(state.inBlockComment).toBe(false);
    });

    it("tokenizes double-quoted string", () => {
      const state = t.startState();
      const stream = createStream('"hello"');
      const kind = t.token(stream, state);
      expect(kind).toBe("string");
    });

    it("tokenizes single-quoted string", () => {
      const state = t.startState();
      const stream = createStream("'hello'");
      const kind = t.token(stream, state);
      expect(kind).toBe("string");
    });

    it("tokenizes backtick string on one line", () => {
      const state = t.startState();
      const stream = createStream("`hello`");
      const kind = t.token(stream, state);
      expect(kind).toBe("string");
      expect(state.inBacktick).toBe(false);
    });

    it("sets inBacktick for unclosed backtick string", () => {
      const state = t.startState();
      const stream = createStream("`unclosed");
      const kind = t.token(stream, state);
      expect(kind).toBe("string");
      expect(state.inBacktick).toBe(true);
    });

    it("resumes backtick string from previous state", () => {
      const state = t.startState();
      state.inBacktick = true;
      const stream = createStream("continued`");
      const kind = t.token(stream, state);
      expect(kind).toBe("string");
      expect(state.inBacktick).toBe(false);
    });

    it("tokenizes integer as number", () => {
      const state = t.startState();
      const stream = createStream("42");
      const kind = t.token(stream, state);
      expect(kind).toBe("number");
    });

    it("tokenizes negative number", () => {
      const state = t.startState();
      const stream = createStream("-3.14");
      const kind = t.token(stream, state);
      expect(kind).toBe("number");
    });

    it("tokenizes $state as state token", () => {
      const state = t.startState();
      const stream = createStream("$count");
      const kind = t.token(stream, state);
      expect(kind).toBe("state");
    });

    it("handles legacy $$name as a single state token", () => {
      const state = t.startState();
      const stream = createStream("$$old");
      const kind = t.token(stream, state);
      expect(kind).toBe("state");
    });

    it("tokenizes uppercase identifier as component", () => {
      const state = t.startState();
      const stream = createStream("Button");
      const kind = t.token(stream, state);
      expect(kind).toBe("component");
    });

    it("tokenizes lowercase identifier", () => {
      const state = t.startState();
      const stream = createStream("myVar");
      const kind = t.token(stream, state);
      expect(kind).toBe("identifier");
    });

    it("tokenizes atoms (true, false, null)", () => {
      for (const atom of ["true", "false", "null"]) {
        const state = t.startState();
        const stream = createStream(atom);
        const kind = t.token(stream, state);
        expect(kind).toBe("atom");
      }
    });

    it("tokenizes reserved keywords", () => {
      const state = t.startState();
      const stream = createStream("function");
      const kind = t.token(stream, state);
      expect(kind).toBe("keyword");
    });

    it("tokenizes identifier followed by dot as loopvar", () => {
      const state = t.startState();
      const stream = createStream("row.name");
      const kind = t.token(stream, state);
      expect(kind).toBe("loopvar");
    });

    it("tokenizes dot-property access as property", () => {
      const state = t.startState();
      const stream = createStream(".name");
      const kind = t.token(stream, state);
      expect(kind).toBe("property");
    });

    it("tokenizes standalone dot as punctuation", () => {
      const state = t.startState();
      const stream = createStream(". ");
      const kind = t.token(stream, state);
      expect(kind).toBe("punctuation");
    });

    it("tokenizes multi-char operators", () => {
      const state = t.startState();
      const stream = createStream("==");
      const kind = t.token(stream, state);
      expect(kind).toBe("operator");
    });

    it("tokenizes brackets as punctuation", () => {
      const state = t.startState();
      const stream = createStream("(");
      const kind = t.token(stream, state);
      expect(kind).toBe("punctuation");
    });

    it("tokenizes single-char operator", () => {
      const state = t.startState();
      const stream = createStream("+");
      const kind = t.token(stream, state);
      expect(kind).toBe("operator");
    });

    it("returns null for eol", () => {
      const state = t.startState();
      const stream = createStream("");
      const kind = t.token(stream, state);
      expect(kind).toBeNull();
    });

    it("skips unknown characters", () => {
      const state = t.startState();
      const stream = createStream("@");
      const kind = t.token(stream, state);
      expect(kind).toBeNull();
    });
  });

  it("exposes languageData with comment tokens", () => {
    const t = createStreamTokenizer();
    expect(t.languageData.commentTokens.line).toBe("//");
    expect(t.languageData.commentTokens.block).toEqual({ open: "/*", close: "*/" });
  });

  it("exposes closeBrackets", () => {
    const t = createStreamTokenizer();
    expect(t.languageData.closeBrackets.brackets).toContain("(");
    expect(t.languageData.closeBrackets.brackets).toContain('"');
    expect(t.languageData.closeBrackets.brackets).toContain("`");
  });

  it("exposes indentOnInput regex", () => {
    const t = createStreamTokenizer();
    expect(t.languageData.indentOnInput).toBeInstanceOf(RegExp);
    expect(t.languageData.indentOnInput.test("  }")).toBe(true);
  });
});
