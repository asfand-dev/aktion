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
    state: string;
  };
}

export const grammarSpec: GrammarSpec = {
  name: "aktion",
  atoms: ["true", "false", "null", "undefined"],
  // Full reserved-word set, kept in sync with `KEYWORDS_AKTION` in
  // `src/parser/lexer.ts` plus the reserved top-level handle `aktion` and the
  // router handle `route`. Aktion's `$`-prefixed builtins (`$effect`, `$emit`,
  // …) lex as StateIdentifiers, so they are not in this keyword list. Every
  // entry is documented in `keywordDocs` so the playground can show a popup.
  keywords: [
    "function", "import", "export", "if", "else", "switch", "case", "break",
    "continue", "for", "while", "do", "of", "in", "let", "var", "const",
    "await", "async", "return", "default", "try", "catch", "finally",
    "throw", "new", "typeof", "instanceof", "delete", "void",
    "aktion", "route",
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
  sigils: { state: "$" },
};

/**
 * Documentation for a reserved keyword — surfaced by the language
 * service hover provider and the playground keyword-popup. Each entry
 * has a one-line `summary`, a `syntax` skeleton, and a runnable
 * `example` snippet.
 */
export interface KeywordDoc {
  /** One-line description of what the keyword does. */
  summary: string;
  /** Syntax skeleton, e.g. `if (condition) { … } else { … }`. */
  syntax: string;
  /** Short usage example. */
  example: string;
}

/**
 * Canonical explanations for every reserved word / top-level handle in
 * `grammarSpec.keywords`. Single source of truth shared by the language
 * service (`getHoverInfo`) and the playground keyword popups so the two
 * never drift. Keep this in sync with `grammarSpec.keywords`.
 */
export const keywordDocs: Record<string, KeywordDoc> = {
  aktion: {
    summary: "Legacy entry-point binding — prefer the `$app(...)` builtin to register the root of the rendered UI tree.",
    syntax: "$app(Component(...))",
    example: '$app(Stack([Heading("Hi"), Text("Welcome")]))',
  },
  route: {
    summary: "Reactive router handle — exposes path, params, query, and navigate().",
    syntax: "route.path · route.params · route.query · route.navigate(path)",
    example: 'Button("Home", () => route.navigate("/"))',
  },
  $emit: {
    summary: "Dispatch a custom DOM event from the host element.",
    syntax: '$emit("event-name", detail)',
    example: 'Button("Save", () => $emit("saved", { id: $id }))',
  },
  import: {
    summary: "Import named bindings (components, actions, hooks, `$state`) from another `.aktion` file. Multi-file projects are linked in the browser.",
    syntax: 'import { Name, Other as Alias, $shared } from "./module.aktion"',
    example: 'import { Button } from "./Button.aktion"\nimport { $count } from "./store.aktion"',
  },
  export: {
    summary: "Mark a top-level declaration importable from another file. Anything not exported is private to its file.",
    syntax: "export function Name(...) { ... } · export $state = ... · export name = ...",
    example: 'export function Card2({ title }) {\n  return Card([CardHeader(title)])\n}',
  },
  function: {
    summary: "Declare a component or action — first-letter case does not matter.",
    syntax: "function name(params) { ... }",
    example: 'function Greeting(name) {\n  return Text(`Hello ${name}`)\n}',
  },
  $effect: {
    summary: "Run a side-effect when dependencies change (timers, fetch, analytics).",
    syntax: "$effect(() => { ... }, [deps])",
    example: '$effect(() => {\n  $now = $util.now()\n}, ["every(1000)"])',
  },
  if: {
    summary: "Conditional statement — run a block when a condition is truthy.",
    syntax: "if (condition) { ... } else { ... }",
    example: "if (!$user) {\n  return Spinner()\n}",
  },
  else: {
    summary: "Fallback branch executed when the matching `if` condition is falsy.",
    syntax: "if (condition) { ... } else { ... }",
    example: 'if ($ok) { return Done() } else { return Retry() }',
  },
  switch: {
    summary: "Multi-way branch on a value — pair each arm with `case` / `default`.",
    syntax: "switch (value) { case x: ...; default: ... }",
    example: 'switch (tab) {\n  case "list": return List()\n  default: return Empty()\n}',
  },
  case: {
    summary: "A labelled arm inside a `switch` statement.",
    syntax: "case value: statements; break",
    example: 'case "grid": return Grid($items)',
  },
  break: {
    summary: "Exit the nearest enclosing loop or `switch` immediately.",
    syntax: "break",
    example: "for (let i = 0; i < n; i++) {\n  if (done) break\n}",
  },
  continue: {
    summary: "Skip to the next iteration of the nearest enclosing loop.",
    syntax: "continue",
    example: "for (let x of items) {\n  if (!x.ok) continue\n}",
  },
  for: {
    summary: "Loop — classic `for`, `for…of` (values), or `for…in` (keys).",
    syntax: "for (let i = 0; i < n; i++) { ... }",
    example: "for (let item of $items) {\n  log(item)\n}",
  },
  while: {
    summary: "Loop while a condition stays truthy (checked before each pass).",
    syntax: "while (condition) { ... }",
    example: "while (i > 0) {\n  i = i - 1\n}",
  },
  do: {
    summary: "Run a block once, then repeat while a condition holds.",
    syntax: "do { ... } while (condition)",
    example: "do {\n  step()\n} while (hasMore)",
  },
  of: {
    summary: "Iterate the VALUES of an array/iterable in a `for…of` loop.",
    syntax: "for (let item of iterable) { ... }",
    example: "for (let row of $rows) { render(row) }",
  },
  in: {
    summary: "Iterate the KEYS of an object (`for…in`) or test key membership.",
    syntax: 'for (let key in obj) { ... }  ·  "key" in obj',
    example: 'for (let k in $config) { use(k) }',
  },
  let: {
    summary: "Declare a block-scoped mutable variable (supports destructuring).",
    syntax: "let name = value  ·  let [a, b] = arr  ·  let { x } = obj",
    example: "let { name, age = 0 } = $user",
  },
  var: {
    summary: "Declare a variable (function-scoped) — `let` is preferred.",
    syntax: "var name = value",
    example: "var total = 0",
  },
  const: {
    summary: "Declare a block-scoped constant binding (supports destructuring).",
    syntax: "const name = value",
    example: "const [first, ...rest] = $items",
  },
  await: {
    summary:
      "Parses, but NEVER suspends — bodies are not async functions. In expression position the value is the PROMISE, not what it resolves to, so `if (await p)` is always true; as a bare statement it is dropped. Chain `.then(...)` instead, or use `$http(...).onDone`.",
    syntax: "await expression",
    example: '$util.copy($url).then(ok => { if (ok) $toast.success("Copied") })',
  },
  async: {
    summary: "Marks a function as async — accepted as a no-op modifier; it does NOT make the body suspend.",
    syntax: "async function name() { ... }",
    example: 'function load() {\n  fetch("/api/ping").then(res => { $status = res.status })\n}',
  },
  return: {
    summary: "Return a value from a component / action / helper body.",
    syntax: "return expression",
    example: 'return Card({ title: "Done" })',
  },
  default: {
    summary: "The fallback arm of a `switch` (or wildcard route in Router).",
    syntax: "default: statements",
    example: 'default: return NotFound()',
  },
  try: {
    summary: "Run code that may throw, handling errors in a `catch` block.",
    syntax: "try { ... } catch (e) { ... } finally { ... }",
    example: 'try {\n  risky()\n} catch (e) {\n  log(e)\n}',
  },
  catch: {
    summary: "Handle an error thrown inside the preceding `try` block.",
    syntax: "catch (error) { ... }",
    example: 'catch (e) { $error = e }',
  },
  finally: {
    summary: "Run cleanup after `try` / `catch`, regardless of outcome.",
    syntax: "finally { ... }",
    example: 'finally { $loading = false }',
  },
  throw: {
    summary: "Raise an error — caught by an enclosing `try` / `catch`.",
    syntax: "throw value",
    example: 'throw "invalid state"',
  },
  new: {
    summary: "Construct an instance of a host class (Date, Map, Set, …).",
    syntax: "new Constructor(args)",
    example: "let now = new Date()",
  },
  typeof: {
    summary: 'Return a string naming a value\'s type ("number", "string", …).',
    syntax: "typeof value",
    example: 'if (typeof x === "number") { ... }',
  },
  instanceof: {
    summary: "Test whether a value is an instance of a constructor.",
    syntax: "value instanceof Constructor",
    example: "if (d instanceof Date) { ... }",
  },
  delete: {
    summary: "Remove a property from an object.",
    syntax: "delete obj.prop",
    example: "delete $form.draft",
  },
  void: {
    summary: "Evaluate an expression and yield `undefined`.",
    syntax: "void expression",
    example: "void sideEffect()",
  },
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
  state: "variableName.special",
  component: "typeName",
  identifier: "variableName",
  loopvar: "variableName.local",
  property: "propertyName",
  operator: "operator",
  punctuation: null,
};
