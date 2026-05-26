/**
 * Pure-data grammar description for Aktion.
 *
 * The grammar lives here as plain JSON-style data and a minimal stream
 * tokenizer factory. The stream tokenizer returned by
 * `createStreamTokenizer` matches the shape of CodeMirror 6's `StreamParser`
 * (`token`, `startState`, `copyState`), but it does NOT import CodeMirror or
 * any DOM API — so the same data drives Monaco, a VS Code TextMate grammar,
 * or any other editor.
 *
 * Token kinds are reported as semantic strings. Consumers map them to their
 * own highlight tags (CodeMirror's `tags`, Monaco's `TokenType`, etc.).
 */

export type GrammarTokenKind =
  | "comment"        // // line and /* block */
  | "string"         // "double" 'single' `backtick`
  | "number"         // 12, -3.14
  | "atom"           // true / false / null
  | "keyword"        // function, if, else, for, switch, return, …
  | "builtin"        // @Sum, @Filter, @Format, …
  | "state"          // $variable
  | "component"      // Capitalised identifier in call position
  | "identifier"     // lowercase identifier
  | "operator"       // +, -, *, /, ==, &&, …
  | "punctuation"    // ( ) [ ] { } , : ?
  | "loopvar"        // first segment of `row.name` / `params.id`
  | "property";      // segment after `.`

export interface GrammarSpec {
  name: "aktion";
  /** Literal atoms (true / false / null). */
  atoms: readonly string[];
  /** Reserved keywords that drive control flow and declarations. */
  keywords: readonly string[];
  /** Operators (longest-match first when tokenising). */
  operators: readonly string[];
  /** Two-character operators that must be matched before single chars. */
  operatorsLong: readonly string[];
  /** Brackets that must be balanced; useful for editor bracket matching. */
  brackets: ReadonlyArray<{ open: string; close: string }>;
  comments: {
    /** Primary line-comment introducer (used by editors for Ctrl+/ toggle). */
    line: string;
    blockStart: string;
    blockEnd: string;
  };
  strings: {
    /** Quote characters allowed for single-line escape-supporting strings. */
    singleLineQuotes: readonly string[];
    /** Quote character for multi-line raw strings (no escaping needed). */
    multiLineQuote: string;
  };
  identifier: {
    start: RegExp;
    part: RegExp;
  };
  /** Sigils that mark non-identifier categories. */
  sigils: {
    builtin: string;
    state: string;
  };
}

export const grammarSpec: GrammarSpec = {
  name: "aktion",
  atoms: ["true", "false", "null"],
  keywords: [
    "function", "return", "if", "else", "for", "let", "of",
    "switch", "case", "default", "break", "effect", "aktion", "emit",
  ],
  operators: ["+", "-", "*", "/", "%", "!", "=", "<", ">", "?", ":", ".", ","],
  // Long operators include `??` and `?.` (nullish coalescing + optional chain)
  // and `...` (spread). Order matters: longest match wins.
  operatorsLong: ["...", "==", "!=", ">=", "<=", "&&", "||", "??", "?."],
  brackets: [
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
  ],
  comments: { line: "//", blockStart: "/*", blockEnd: "*/" },
  strings: {
    singleLineQuotes: ['"', "'"],
    multiLineQuote: "`",
  },
  identifier: {
    start: /[A-Za-z_]/,
    part: /[A-Za-z0-9_]/,
  },
  sigils: { builtin: "@", state: "$" },
};

/**
 * Mutable state carried by the stream tokenizer between calls. We track the
 * unclosed multi-line constructs (backtick strings, block comments).
 */
export interface StreamState {
  inBacktick: boolean;
  inBlockComment: boolean;
}

export interface StreamLike {
  /** True at column 0 of a line (CodeMirror exposes `stream.sol()`). */
  sol(): boolean;
  /** Returns next char without consuming. */
  peek(): string | null | undefined;
  /** Consume and return the next char, advancing the stream. */
  next(): string | undefined;
  /** Consume while the predicate matches. */
  eatWhile(test: RegExp | ((ch: string) => boolean)): boolean;
  /** Consume one char if it matches; returns whether it consumed. */
  eat(test: string | RegExp | ((ch: string) => boolean)): string | undefined;
  /**
   * Consume everything up to (and optionally including) the given string or
   * regex. CodeMirror's `skipTo` matches the string in the rest of the line.
   * We rely only on `match(string, consume?)` which is available in CM6.
   */
  match(pattern: string | RegExp, consume?: boolean): boolean | RegExpMatchArray | null;
  /** Skip to end of line. */
  skipToEnd(): void;
  /** True at end of line. */
  eol(): boolean;
}

export interface StreamTokenizer {
  startState(): StreamState;
  copyState(state: StreamState): StreamState;
  token(stream: StreamLike, state: StreamState): GrammarTokenKind | null;
  /**
   * Language metadata that CodeMirror's `StreamLanguage.define(...)` will pick
   * up — comment style and bracket pairs for auto-pairing.
   */
  languageData: {
    commentTokens: { line: string; block: { open: string; close: string } };
    closeBrackets: { brackets: readonly string[] };
    indentOnInput: RegExp;
  };
}

/**
 * Lookahead tokenizer driven by `grammarSpec`. Suitable for
 * `StreamLanguage.define(...)` in CodeMirror 6, but framework-agnostic.
 */
export function createStreamTokenizer(spec: GrammarSpec = grammarSpec): StreamTokenizer {
  const startState = (): StreamState => ({ inBacktick: false, inBlockComment: false });
  const copyState = (state: StreamState): StreamState => ({ ...state });

  const atomSet = new Set(spec.atoms);
  const keywordSet = new Set(spec.keywords);
  const componentCallRe = /^[A-Z][A-Za-z0-9_]*/;
  const lowerIdentRe = /^[a-z_][A-Za-z0-9_]*/;
  const numberRe = /^-?\d+(?:\.\d+)?/;
  const operatorChars = new Set([...spec.operators.join(""), ..."=<>!&|"]);

  const consumeStringBody = (stream: StreamLike, quote: string): void => {
    while (!stream.eol()) {
      const ch = stream.next();
      if (!ch) return;
      if (ch === "\\") {
        stream.next();
        continue;
      }
      if (ch === quote) return;
    }
  };

  const token = (stream: StreamLike, state: StreamState): GrammarTokenKind | null => {
    // Resume open multi-line constructs.
    if (state.inBacktick) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") { stream.next(); continue; }
        if (ch === "`") { state.inBacktick = false; return "string"; }
      }
      return "string";
    }
    if (state.inBlockComment) {
      while (!stream.eol()) {
        if (stream.match(spec.comments.blockEnd, true)) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }

    // Skip whitespace.
    if (stream.eatWhile(/[ \t]/)) return null;

    if (stream.match(spec.comments.line, true)) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(spec.comments.blockStart, true)) {
      state.inBlockComment = true;
      while (!stream.eol()) {
        if (stream.match(spec.comments.blockEnd, true)) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }

    const next = stream.peek();
    if (next === null || next === undefined) return null;

    // Strings.
    if (spec.strings.singleLineQuotes.includes(next)) {
      const quote = next;
      stream.next();
      consumeStringBody(stream, quote);
      return "string";
    }
    if (next === spec.strings.multiLineQuote) {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") { stream.next(); continue; }
        if (ch === "`") return "string";
      }
      state.inBacktick = true;
      return "string";
    }

    // Numbers (also matches `-1`, `-3.14`).
    if (next >= "0" && next <= "9") {
      if (stream.match(numberRe, true)) return "number";
    }
    if (next === "-" && stream.match(/^-\d+(?:\.\d+)?/, false)) {
      if (stream.match(numberRe, true)) return "number";
    }

    // Sigil-prefixed identifiers.
    if (next === spec.sigils.builtin) {
      stream.next();
      stream.eatWhile(spec.identifier.part);
      return "builtin";
    }
    if (next === spec.sigils.state) {
      stream.next();
      // Legacy `$$name` is a hard error in Aktion 0.5; the
      // tokenizer still highlights both `$`s as one `state` token so the
      // user sees a single red squiggle pointing at the migration site
      // instead of two unrelated tokens.
      if (stream.peek() === spec.sigils.state) stream.next();
      stream.eatWhile(spec.identifier.part);
      return "state";
    }

    // Identifiers + atoms + component calls + property access.
    if (spec.identifier.start.test(next)) {
      const upper = stream.match(componentCallRe, true);
      if (upper) {
        return "component";
      }
      const lower = stream.match(lowerIdentRe, true);
      if (lower) {
        const text = (lower as RegExpMatchArray)[0];
        if (atomSet.has(text)) return "atom";
        if (keywordSet.has(text)) return "keyword";
        const ahead = stream.peek();
        if (ahead === ".") return "loopvar";
        return "identifier";
      }
    }

    // Multi-char operators.
    for (const op of spec.operatorsLong) {
      if (stream.match(op, true)) return "operator";
    }

    // Property access: `.name`.
    if (next === ".") {
      stream.next();
      if (stream.peek() && spec.identifier.start.test(stream.peek() as string)) {
        stream.eatWhile(spec.identifier.part);
        return "property";
      }
      return "punctuation";
    }

    // Brackets / commas / colons / question.
    if ("()[]{},:?".includes(next)) {
      stream.next();
      return "punctuation";
    }

    // Single-char operators.
    if (operatorChars.has(next)) {
      stream.next();
      return "operator";
    }

    stream.next();
    return null;
  };

  return {
    startState,
    copyState,
    token,
    languageData: {
      commentTokens: { line: spec.comments.line, block: { open: spec.comments.blockStart, close: spec.comments.blockEnd } },
      closeBrackets: { brackets: ["(", "[", "{", '"', "'", "`"] },
      indentOnInput: /^\s*[)\]}]$/,
    },
  };
}

/**
 * Default mapping from grammar token kinds to CodeMirror highlight tag names.
 *
 * Returned as plain strings so consumers can resolve them to whatever their
 * highlighter understands. We keep `tagName: string | null` so consumers may
 * skip a kind entirely (e.g. punctuation is often left unhighlighted).
 */
export const defaultTagMap: Record<GrammarTokenKind, string | null> = {
  comment: "comment",
  string: "string",
  number: "number",
  atom: "atom",
  keyword: "keyword",
  builtin: "keyword",
  state: "variableName.special",
  component: "typeName",
  identifier: "variableName",
  loopvar: "variableName.local",
  property: "propertyName",
  operator: "operator",
  punctuation: null,
};
