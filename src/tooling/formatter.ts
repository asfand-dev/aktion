/**
 * Aktion 0.5 §27 — canonical pretty-printer.
 *
 * `formatProgram(source, options?)` re-emits a syntactically clean version
 * of the input. The output is:
 *
 *   - **Idempotent.** `format(format(x)) === format(x)` for every input that
 *     parses cleanly. The grammar has no `Paren`/grouping AST node, so the
 *     printer puts back the parentheses an expression needs from a
 *     precedence table that mirrors the parser's (`PREC`): `(a || b).c()`
 *     stays grouped. Every `BuiltinCall` node printed by this module must
 *     also re-parse back to the same node kind, or this guarantee silently
 *     breaks in a second, unrelated way — see `printDesugaredOperator`'s doc
 *     comment.
 *   - **Canonical.** Statements one per line; two-space indentation by
 *     default inside `{ … }` blocks (configurable via `FormatOptions`);
 *     named args always use `prop: value` (the legacy `prop=value` form is
 *     gone); double-quoted strings by default unless interpolation is
 *     required (templates), also configurable via `FormatOptions`.
 *   - **Round-trips through the parser.** `formatProgram` returns its output
 *     only when re-parsing it yields a structurally-equivalent AST
 *     (positions and comment metadata aside) and keeps every comment, at the
 *     brace depth it had; otherwise it returns the input untouched with a
 *     `warnings` entry. Comments are attached to statements, so one written
 *     inside an expression (between the properties of an object literal, the
 *     elements of an array argument) is printed elsewhere or not at all.
 *     `printProgram` has no such guard.
 *   - **Means what the AST means.** `printProgram` also prints LINKED
 *     programs (`CompiledProgram.source`), whose `.aktion.js` / `.aktion.ts`
 *     modules carry JavaScript semantics in AST-only fields. A named function
 *     expression prints as one (`LambdaExpr.selfName`), and a call to a user
 *     component is printed for the declaration it reaches, so the re-parsed
 *     text binds its arguments as the AST does (`CallExpr.positional`,
 *     `DeclParam.publicName`) — see `printCallExpr`.
 *
 * The formatter is *not* a linter — it does not rewrite §19.1
 * violations to named args, and it does not fix unknown components.
 * Use `validateProgramSchema` for diagnostics; the formatter is purely
 * a syntactic projection.
 *
 * Inputs with parse errors are returned unchanged in `formatted`, with
 * the original `errors` list passed through so the host can surface
 * them.
 *
 * Indentation, quote style, trailing commas and object curly spacing are
 * all configurable via the optional `FormatOptions` parameter on both
 * `formatProgram` and `printProgram` (`indentStyle`/`indentWidth`/
 * `quoteStyle`/`trailingComma`/`objectCurlySpacing`). Omitting any of them
 * reproduces today's exact output, unchanged — this is a published surface
 * with real consumers depending on that default shape.
 */

import { parse } from "../parser/index.js";
import { tokenize, type RawComment } from "../parser/lexer.js";
import { positionalKeyArguments, trailingPropsArgument } from "../parser/component-call.js";
import type {
  AttachedComment,
  BinaryOperator,
  BlockExpr,
  BuiltinCallExpr,
  CallExpr,
  ComponentDeclaration,
  DeclParam,
  DestructuringPattern,
  Expression,
  LambdaExpr,
  LambdaParam,
  ObjectExpr,
  ObjectProperty,
  ParseError,
  Program,
  Statement,
  SwitchCase,
} from "../parser/types.js";
import manifest from "../dsl/manifest.json";

/**
 * A key the lexer reads back as one plain name token — a `$` would start a
 * state atom, so `{ "$x": 1 }` cannot print as `{ $x: 1 }`. Used for every
 * key this printer writes (object properties, destructuring keys and method
 * names); anything else (`"a-b"`, `"0"`, `"$x"`) is printed quoted.
 */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Characters that cannot appear literally inside a canonical double-quoted
// string and must be escaped: `\` and `"` themselves, plus the raw control
// characters a real Aktion string literal can carry once the lexer's
// `decodeEscape` has turned a source `\n`/`\r`/`\t` escape into the actual
// control character in the AST's `Literal.value`. The lexer's own string
// scanner stops at a bare newline (`if (peek() === "\n") { break; }` in
// `tokenize`), so printing one unescaped truncates the string and corrupts
// everything the parser reads after it — a real round-trip failure the
// idempotency sweep in tests/formatter-idempotency-sweep.test.ts caught
// (`docs/demos/mini-apps/palette-studio.aktion`'s `.join("\n")` call).
// Characters that force escaping inside a double- or single-quoted literal,
// respectively. `\`, the quote char itself, and the raw control characters
// noted above are shared; the quote char differs by mode.
const NEEDS_ESCAPE_DOUBLE = /[\\"\n\r\t]/;
const NEEDS_ESCAPE_SINGLE = /[\\'\n\r\t]/;

/**
 * How tightly each expression form binds, mirroring the parser's precedence
 * climb (`parseTernary` → … → `parsePostfix` in `src/parser/parser.ts`);
 * higher binds tighter. The grammar has no grouping node, so a
 * sub-expression whose form binds looser than its position requires is
 * printed in parentheses — that is what keeps `(a + b) * c` from printing as
 * `a + b * c`. Where JavaScript is stricter than this grammar (`(-a) ** 2`,
 * `(a ?? b) || c`, an arrow as an operand) the printer groups as JavaScript
 * requires, so the output stays valid JavaScript too.
 */
const PREC = {
  /**
   * Arrow and `function` expressions, and an assignment: a concise arrow body
   * runs to the end of the enclosing expression, so these print bare only in
   * a full-expression position (an argument, element, property value,
   * statement expression, ternary branch, interpolation, …).
   */
  lambda: 0,
  ternary: 1,
  /** `||` and `??` share one level in this grammar (`parseLogicalOr`). */
  logicalOr: 2,
  logicalAnd: 3,
  bitwiseOr: 4,
  bitwiseXor: 5,
  bitwiseAnd: 6,
  equality: 7,
  /** `<` `>` `<=` `>=` `in` `instanceof`. */
  relational: 8,
  shift: 9,
  additive: 10,
  multiplicative: 11,
  /** `**`, right-associative; its base is a unary operand (`parseExponent`). */
  exponent: 12,
  /** Prefix operators: `!x`, `-x`, `typeof x`, `++x`, `await x`. */
  unary: 13,
  /** `x++` / `x--`. */
  postfix: 14,
  /** Member access, calls, `new X()`, and every primary. */
  member: 15,
} as const;

const BINARY_PRECEDENCE: Readonly<Record<BinaryOperator, number>> = {
  "||": PREC.logicalOr,
  "??": PREC.logicalOr,
  "&&": PREC.logicalAnd,
  "|": PREC.bitwiseOr,
  "^": PREC.bitwiseXor,
  "&": PREC.bitwiseAnd,
  "==": PREC.equality,
  "!=": PREC.equality,
  "===": PREC.equality,
  "!==": PREC.equality,
  "<": PREC.relational,
  ">": PREC.relational,
  "<=": PREC.relational,
  ">=": PREC.relational,
  in: PREC.relational,
  instanceof: PREC.relational,
  "<<": PREC.shift,
  ">>": PREC.shift,
  ">>>": PREC.shift,
  "+": PREC.additive,
  "-": PREC.additive,
  "*": PREC.multiplicative,
  "/": PREC.multiplicative,
  "%": PREC.multiplicative,
  "**": PREC.exponent,
};

/**
 * Built-in component names. Inside the body of a user component that shadows
 * one, the name means the built-in (the evaluator's wrapper semantics), so a
 * call there is printed as a library call.
 */
const LIBRARY_COMPONENTS: ReadonlySet<string> = new Set(manifest.components.map((c) => c.name));

/**
 * The declarations a call by bare name can reach, while one program is
 * printed — see `printCallExpr`.
 */
interface CallScope {
  /** Top-level component declarations by name; a later one wins, as at runtime. */
  readonly topLevel: ReadonlyMap<string, ComponentDeclaration>;
  /** Component declarations of the blocks being printed, innermost last. */
  readonly nested: Array<ReadonlyMap<string, ComponentDeclaration>>;
  /** The component declarations whose body is being printed, innermost last. */
  readonly enclosing: string[];
}

function componentsOf(statements: ReadonlyArray<Statement>): Map<string, ComponentDeclaration> {
  const out = new Map<string, ComponentDeclaration>();
  for (const stmt of statements) if (stmt.kind === "ComponentDeclaration") out.set(stmt.name, stmt);
  return out;
}

/**
 * Configures the printer's indentation, quote style, trailing commas and
 * object curly spacing. Every default matches today's hard-coded behaviour
 * (2-space indents, double-quoted strings, no trailing comma, spaced object
 * braces), so calling `formatProgram`/`printProgram` with no options is
 * BIT-FOR-BIT IDENTICAL to the pre-existing output — this is load-bearing:
 * the printer is a published surface with real consumers depending on that
 * exact shape.
 */
export interface FormatOptions {
  /** `"space"` (default) or `"tab"`. */
  indentStyle?: "space" | "tab";
  /**
   * Spaces per indent level when `indentStyle` is `"space"` (default `2`).
   * Ignored when `indentStyle` is `"tab"` — one tab is emitted per level
   * regardless of width, matching how every other tab-indented tool works.
   */
  indentWidth?: number;
  /**
   * `"single"` or `"double"` (default) quotes for string literals — applies
   * everywhere the printer emits a quoted string (literals, object keys,
   * import sources, `$effect` dependency strings), not just `printLiteral`.
   * A string containing the chosen quote char but not the other one falls
   * back to the other quote for THAT string only, to avoid an ugly escape —
   * mirrors ESLint's `quotes` rule with `avoidEscape: true`.
   */
  quoteStyle?: "single" | "double";
  /**
   * Trailing comma after the last item once an `Array`/`Object` literal
   * wraps across multiple lines (default `false`, matching today's
   * behaviour — never add one). Mirrors ESLint's
   * `comma-dangle: "always-multiline"`. Destructuring patterns never wrap
   * multi-line in this printer, so there is nothing for this option to
   * affect there.
   */
  trailingComma?: boolean;
  /**
   * Whether a single-line object literal gets a space just inside the
   * braces — `{ a, b }` (default `true`, today's behaviour) vs `{a, b}`.
   * Multi-line object literals are unaffected (the brace is already
   * followed/preceded by a newline). Array literals never had inner-bracket
   * spacing and are unaffected by this option. Destructuring patterns
   * already print their object form with no inner spacing today — that
   * pre-existing behaviour is intentionally left untouched here rather than
   * wired to this option, since doing so would change patterns' default
   * output the moment this option's own default (`true`) took effect.
   */
  objectCurlySpacing?: boolean;
}

interface ResolvedFormatOptions {
  /** The literal string repeated `depth` times to indent one level. */
  unit: string;
  /** Quote character to use for every emitted string literal. */
  quote: '"' | "'";
  /** Whether a wrapped multi-line `Array`/`Object` gets a trailing comma. */
  trailingComma: boolean;
  /** Whether a single-line `Object` literal gets inner brace spacing. */
  objectCurlySpacing: boolean;
  /** The program being printed, for calls — see `printCallExpr`. */
  calls: CallScope;
}

const DEFAULT_INDENT_WIDTH = 2;

function resolveFormatOptions(program: Program, options?: FormatOptions): ResolvedFormatOptions {
  const unit = (() => {
    if (options?.indentStyle === "tab") {
      return "\t";
    }
    const width = options?.indentWidth ?? DEFAULT_INDENT_WIDTH;
    // `String.prototype.repeat` throws a RangeError for a negative or
    // infinite count and silently misbehaves for NaN/fractional ones
    // (`" ".repeat(1.5)` truncates to 1 with no indication anything was
    // wrong) — reject all of those explicitly rather than let a bad public
    // input surface as either an opaque low-level exception or quietly
    // wrong indentation.
    if (!Number.isInteger(width) || width < 0) {
      throw new RangeError(
        `FormatOptions.indentWidth must be a non-negative integer, got ${width}`,
      );
    }
    return " ".repeat(width);
  })();
  return {
    unit,
    quote: options?.quoteStyle === "single" ? "'" : '"',
    trailingComma: options?.trailingComma ?? false,
    objectCurlySpacing: options?.objectCurlySpacing ?? true,
    calls: { topLevel: componentsOf(program.statements), nested: [], enclosing: [] },
  };
}

/** The single `indent(depth)`-shaped helper every print function goes through. */
function pad(indent: number, opts: ResolvedFormatOptions): string {
  return opts.unit.repeat(indent);
}

/**
 * Render a destructuring pattern (`[a, b, ...rest]` / `{ x, y: alias }`),
 * recursing into nested patterns (`{ user: { name } }`, `[[a], [b]]`).
 */
function printPattern(pattern: DestructuringPattern, indent: number, opts: ResolvedFormatOptions): string {
  const open = pattern.kind === "array" ? "[" : "{";
  const close = pattern.kind === "array" ? "]" : "}";
  // A key that is not a plain name (`"a-b"`, a number) is quoted; reserved
  // words (`default`) are plain names to the lexer and stay bare.
  const key = (k: string): string => (PLAIN_KEY.test(k) ? k : printStringLiteral(k, opts));
  const parts = pattern.bindings.map((b) => {
    const lead = b.rest ? "..." : "";
    const target = b.pattern
      ? (pattern.kind === "object" && b.sourceKey
          ? `${key(b.sourceKey)}: ${printPattern(b.pattern, indent, opts)}`
          : printPattern(b.pattern, indent, opts))
      : (b.sourceKey ? `${key(b.sourceKey)}: ${b.name}` : (b.name || ""));
    const def = b.defaultValue ? ` = ${printExpression(b.defaultValue, indent, opts)}` : "";
    return `${lead}${target}${def}`;
  });
  return `${open}${parts.join(", ")}${close}`;
}

export interface FormatResult {
  /** Canonical source. Equal to the input when parse errors occur or the output would change the program. */
  formatted: string;
  /** Parse errors raised while reading the input — formatting is a no-op when non-empty. */
  errors: ParseError[];
  /**
   * Non-fatal notes, shaped like `Program.warnings`. Set when formatting was
   * skipped without a parse error: the printed output did not re-parse, or
   * re-parsed to a different tree than the input. `formatted` is then the
   * untouched input. Each entry applies to the whole document (line 1, column 1).
   */
  warnings?: ParseError[];
}

/** AST keys that carry source positions or comments, which a reformat legitimately changes. */
const LAYOUT_ONLY_KEYS = new Set(["loc", "leadingComments", "trailingComments", "innerComments"]);

/**
 * Canonical JSON of a parsed program, used to decide whether two parses are
 * the same program. Layout-only keys (positions, comments) are dropped and
 * object keys are sorted; the position-derived name of an `$effect`
 * (`__effect_L{line}_C{column}`) is normalised. Numbers `JSON.stringify`
 * would conflate (`-0`, `NaN`, `±Infinity`) get their own markers, and a
 * for-of / for-in head without a keyword counts as `let`, which is what the
 * printer writes for it.
 *
 * It is a best-effort check for what the printer is known to get wrong, not a
 * proof of equivalence. Exported for tests only; not part of the package API.
 */
export function structuralFingerprint(program: Program): string {
  const canonical = (value: unknown): unknown => {
    if (typeof value === "number") {
      if (Object.is(value, -0)) return "__negative_zero__";
      if (!Number.isFinite(value)) return `__number_${String(value)}__`;
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => canonical(item));
    if (value === null || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const isForHead = node.kind === "ForOfStatement" || node.kind === "ForInStatement";
    const keys = isForHead ? [...new Set([...Object.keys(node), "declaration"])] : Object.keys(node);
    for (const key of keys.sort()) {
      if (key === "declaration" && isForHead) {
        out[key] = node[key] ?? "let";
        continue;
      }
      if (LAYOUT_ONLY_KEYS.has(key) || node[key] === undefined) continue;
      if (key === "name" && node.kind === "EffectDeclaration" && typeof node[key] === "string") {
        out[key] = (node[key] as string).replace(/_L\d+_C\d+$/, "_L_C");
        continue;
      }
      out[key] = canonical(node[key]);
    }
    return out;
  };
  return JSON.stringify(canonical(program.statements));
}

/**
 * Every comment of `source`, in order, with the brace depth it sits at —
 * counted on the token stream, so a brace inside a string or template does
 * not count. Two texts with the same layout keep each comment in the same
 * scope.
 */
function commentLayout(source: string): string[] {
  const comments: RawComment[] = [];
  const tokens = tokenize(source, comments);
  const out: string[] = [];
  let depth = 0;
  let next = 0;
  for (const comment of comments) {
    while (next < tokens.length) {
      const token = tokens[next]!;
      if (token.line > comment.line || (token.line === comment.line && token.column >= comment.column)) break;
      if (token.type === "Punctuation" && token.value === "{") depth += 1;
      else if (token.type === "Punctuation" && token.value === "}") depth -= 1;
      next += 1;
    }
    out.push(`${depth}:${comment.text}`);
  }
  return out;
}

function sameCommentLayout(a: string, b: string): boolean {
  const left = commentLayout(a);
  const right = commentLayout(b);
  return left.length === right.length && left.every((entry, i) => entry === right[i]);
}

function skippedFormatting(source: string, reason: string): FormatResult {
  return { formatted: source, errors: [], warnings: [{ message: `Formatting skipped: ${reason}`, line: 1, column: 1 }] };
}

export function formatProgram(source: string, options?: FormatOptions): FormatResult {
  const program = parse(source);
  if (program.errors.length > 0) {
    return { formatted: source, errors: [...program.errors] };
  }
  const out = printProgram(program, options);
  // The output is accepted only if it re-parses to the same tree as the input
  // and keeps every comment where it was. Otherwise the caller gets the
  // untouched source plus a warning, never a silently different program or a
  // lost comment.
  const second = parse(out);
  if (second.errors.length > 0) {
    return skippedFormatting(source, "the printed output did not re-parse.");
  }
  if (structuralFingerprint(second) !== structuralFingerprint(program)) {
    return skippedFormatting(source, "the printed output would not parse to the same program as the input.");
  }
  if (!sameCommentLayout(source, out)) {
    return skippedFormatting(source, "the printed output would drop or move a comment.");
  }
  return { formatted: out, errors: [] };
}

/**
 * Re-emit a parsed `Program` as canonical Aktion source. Exported so the
 * module linker can serialise a merged (multi-file → single) program back to
 * text for `mountCompiled`'s round-trip fields (reconnect re-parse, snapshots).
 *
 * For a linked program the text is written so that parsing it again gives a
 * program that behaves as this one does, AST-only fields included — see the
 * "Means what the AST means" bullet at the top of this file, and
 * `CompiledProgram.source` for what text cannot carry.
 */
export function printProgram(program: Program, options?: FormatOptions): string {
  const opts = resolveFormatOptions(program, options);
  const lines: string[] = [];
  let prev: Statement | null = null;
  for (const stmt of program.statements) {
    const forceBlankLine = prev !== null && needsBlankLineBetween(prev, stmt);
    lines.push(printStatementWithComments(stmt, 0, opts, forceBlankLine));
    prev = stmt;
  }
  return lines.join("\n") + "\n";
}

function needsBlankLineBetween(prev: Statement, next: Statement): boolean {
  // Visual separation around big declarations.
  const heavy = new Set([
    "ComponentDeclaration",
    "EffectDeclaration",
    "ActionDeclaration",
    "HookDeclaration",
  ]);
  if (heavy.has(prev.kind) || heavy.has(next.kind)) return true;
  return false;
}

/**
 * Render a `BlockExpr`'s `innerComments` — the ONLY case a fully empty
 * `{ … }` block (zero statements) can still carry comment text, e.g. a
 * function stub whose whole body is `// TODO: implement`. One comment per
 * line at `indent`, with a blank line emitted first wherever the parser
 * recorded `blankLineBefore` (a real blank source line separated it from
 * whatever came before).
 *
 * Each comment's raw `text` (delimiters included, e.g. `// note`,
 * `/* block *\/`) is re-emitted VERBATIM — never reformatted — so a
 * multi-line `/* … *\/` comment's own internal indentation is preserved
 * exactly as written. Only the comment's OWN first line is placed at the
 * target indent; this is a known, minor cosmetic limitation for a
 * multi-line block comment that changes indent depth between formatting
 * passes (rare in the real corpus — see `tests/formatter-comments.test.ts`).
 */
function printCommentGroup(comments: ReadonlyArray<AttachedComment>, indent: number, opts: ResolvedFormatOptions): string[] {
  const padStr = pad(indent, opts);
  const lines: string[] = [];
  for (const c of comments) {
    if (c.blankLineBefore) lines.push("");
    lines.push(`${padStr}${c.text}`);
  }
  return lines;
}

/**
 * Print one statement together with its attached comments: leading
 * comment(s) each on their own line before it (with a forced blank line
 * when `forceBlankLineBefore` is set — the pre-existing `needsBlankLineBetween`
 * spacing around "heavy" declarations — OR when the FIRST leading comment's
 * own `blankLineBefore` says so; never both, to avoid a doubled blank line),
 * and any trailing same-line comment(s) appended after the statement's own
 * printed text.
 */
function printStatementWithComments(
  stmt: Statement,
  indent: number,
  opts: ResolvedFormatOptions,
  forceBlankLineBefore: boolean,
): string {
  const lines: string[] = [];
  const leading = stmt.leadingComments;
  if (leading && leading.length > 0) {
    // A blank line goes before the GROUP when either the pre-existing
    // heavy-declaration spacing calls for one, or the first comment's own
    // `blankLineBefore` does — never both (would double the blank line).
    if (forceBlankLineBefore || leading[0]!.blankLineBefore) lines.push("");
    const padStr = pad(indent, opts);
    for (let i = 0; i < leading.length; i += 1) {
      const c = leading[i]!;
      if (i > 0 && c.blankLineBefore) lines.push("");
      lines.push(`${padStr}${c.text}`);
    }
  } else if (forceBlankLineBefore) {
    lines.push("");
  }

  const stmtText = printStatement(stmt, indent, opts);
  const trailing = stmt.trailingComments;
  if (trailing && trailing.length > 0) {
    lines.push(`${stmtText} ${trailing.map((c) => c.text).join(" ")}`);
  } else {
    lines.push(stmtText);
  }
  return lines.join("\n");
}

function printStatement(stmt: Statement, indent: number, opts: ResolvedFormatOptions): string {
  const padStr = pad(indent, opts);
  // `export` prefix for the declaration/assignment kinds that carry the flag
  // (multi-file modules). Transparent for every other kind.
  const exp = "exported" in stmt && stmt.exported ? "export " : "";
  switch (stmt.kind) {
    case "Import": {
      const specs = stmt.specifiers
        .map((s) => {
          const imported = s.isState ? `$${s.imported}` : s.imported;
          if (s.local === s.imported) return imported;
          const local = s.isState ? `$${s.local}` : s.local;
          return `${imported} as ${local}`;
        })
        .join(", ");
      return `${padStr}import { ${specs} } from ${printStringLiteral(stmt.source, opts)}`;
    }
    case "ExportList": {
      const from = stmt.source === undefined ? "" : ` from ${printStringLiteral(stmt.source, opts)}`;
      if (stmt.all) return `${padStr}export *${from}`;
      const specs = stmt.specifiers
        .map((s) => {
          const local = s.isState ? `$${s.local}` : s.local;
          if (s.exported === s.local) return local;
          return `${local} as ${s.isState ? `$${s.exported}` : s.exported}`;
        })
        .join(", ");
      return `${padStr}export { ${specs} }${from}`;
    }
    case "Assignment": {
      const lhs = stmt.isState ? `$${stmt.identifier}` : stmt.identifier;
      // `let x` — declared without a value (its expression is the `void 0` the parser filled in).
      if (stmt.uninitialized) return `${padStr}${exp}${stmt.declaration ?? "let"} ${lhs}`;
      const expr = printExpression(stmt.expression, indent, opts);
      const kw = stmt.declaration ? `${stmt.declaration} ` : "";
      return `${padStr}${exp}${kw}${lhs} = ${expr}`;
    }
    case "ComponentDeclaration": {
      const params = printDeclParams(stmt.params, opts);
      const head = `${padStr}${exp}function ${stmt.name}(${params}) {`;
      opts.calls.enclosing.push(stmt.name);
      let body: string;
      try {
        body = printBlockBody(stmt.body, indent + 1, opts);
      } finally {
        opts.calls.enclosing.pop();
      }
      return body.length > 0
        ? `${head}\n${body}\n${padStr}}`
        : `${head}\n${padStr}}`;
    }
    case "EffectDeclaration": {
      const deps: string[] = stmt.triggers
        .map((t) => printTrigger(t, opts))
        .filter((s) => s.length > 0);
      if (stmt.rateLimit) {
        deps.push(printStringLiteral(`${stmt.rateLimit.kind}(${stmt.rateLimit.ms})`, opts));
      }
      const body = printBlockBody(stmt.body, indent + 1, opts);
      const depsArray = `[${deps.join(", ")}]`;
      return `${padStr}$effect(() => {\n${body}\n${padStr}}, ${depsArray})`;
    }
    case "ActionDeclaration": {
      const params = printDeclParams(stmt.params, opts);
      const head = `${padStr}${exp}function ${stmt.name}(${params}) {`;
      const body = printBlockBody(stmt.body, indent + 1, opts);
      return `${head}\n${body}\n${padStr}}`;
    }
    case "HookDeclaration": {
      // Re-emit the `$` sigil that marks the function as a hook.
      const params = printDeclParams(stmt.params, opts);
      const head = `${padStr}${exp}function $${stmt.name}(${params}) {`;
      const body = printBlockBody(stmt.body, indent + 1, opts);
      return `${head}\n${body}\n${padStr}}`;
    }
    case "Await": {
      return `${padStr}await ${printExpression(stmt.argument, indent, opts)}`;
    }
    case "Return": {
      return stmt.argument
        ? `${padStr}return ${afterKeyword(printExpression(stmt.argument, indent, opts))}`
        : `${padStr}return`;
    }
    case "ExpressionStatement": {
      if (stmt.exportDefault) return `${padStr}export default ${printExpression(stmt.expression, indent, opts)}`;
      const text = printExpression(stmt.expression, indent, opts);
      // At the start of a statement `function` opens a declaration and `await`
      // an `await` statement (and `{` a block in JavaScript), so an expression
      // that prints that way is grouped.
      return /^(?:function\b|await\b|\{)/.test(text) ? `${padStr}(${text})` : `${padStr}${text}`;
    }
    case "IfStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const cons = `{\n${printBlockBody(stmt.consequent, indent + 1, opts)}\n${padStr}}`;
      if (!stmt.alternate) return `${padStr}if (${test}) ${cons}`;
      const alt = stmt.alternate.kind === "IfStatement"
        ? printStatement(stmt.alternate, indent, opts).trimStart()
        : `{\n${printBlockBody(stmt.alternate, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}if (${test}) ${cons} else ${alt}`;
    }
    case "SwitchStatement": {
      const disc = printExpression(stmt.discriminant, indent, opts);
      const cases = stmt.cases.map((c) => printSwitchCase(c, indent + 1, opts)).join("\n");
      return `${padStr}switch (${disc}) {\n${cases}\n${padStr}}`;
    }
    case "ForOfStatement": {
      const iter = afterKeyword(printExpression(stmt.iterable, indent, opts));
      const body = `{\n${printBlockBody(stmt.body, indent + 1, opts)}\n${padStr}}`;
      const binding = stmt.pattern ? printPattern(stmt.pattern, indent, opts) : stmt.item;
      return `${padStr}for (${stmt.declaration ?? "let"} ${binding} of ${iter}) ${body}`;
    }
    case "ForClassicStatement": {
      const init = stmt.init ? printStatement(stmt.init, 0, opts).trimStart() : "";
      const test = stmt.test ? printExpression(stmt.test, indent, opts) : "";
      const update = stmt.update ? printExpression(stmt.update, indent, opts) : "";
      const body = `{\n${printBlockBody(stmt.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}for (${init}; ${test}; ${update}) ${body}`;
    }
    case "WhileStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const body = `{\n${printBlockBody(stmt.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}while (${test}) ${body}`;
    }
    case "DoWhileStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const body = `{\n${printBlockBody(stmt.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}do ${body} while (${test})`;
    }
    case "ForInStatement": {
      const iter = afterKeyword(printExpression(stmt.iterable, indent, opts));
      const body = `{\n${printBlockBody(stmt.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}for (${stmt.declaration ?? "let"} ${stmt.item} in ${iter}) ${body}`;
    }
    case "DestructureStatement": {
      const pattern = printPattern({ kind: stmt.patternKind, bindings: stmt.bindings }, indent, opts);
      const expr = printExpression(stmt.expression, indent, opts);
      return `${padStr}${stmt.declaration ?? "let"} ${pattern} = ${expr}`;
    }
    case "BreakStatement":
      return `${padStr}break`;
    case "ContinueStatement":
      return `${padStr}continue`;
    case "ThrowStatement":
      return `${padStr}throw ${afterKeyword(printExpression(stmt.argument, indent, opts))}`;
    case "TryStatement": {
      const block = `{\n${printBlockBody(stmt.block, indent + 1, opts)}\n${padStr}}`;
      let out = `${padStr}try ${block}`;
      if (stmt.catchBlock) {
        const catchHead = stmt.catchParam ? ` (${stmt.catchParam})` : "";
        const catchBody = `{\n${printBlockBody(stmt.catchBlock, indent + 1, opts)}\n${padStr}}`;
        out += ` catch${catchHead} ${catchBody}`;
      }
      if (stmt.finallyBlock) {
        const finBody = `{\n${printBlockBody(stmt.finallyBlock, indent + 1, opts)}\n${padStr}}`;
        out += ` finally ${finBody}`;
      }
      return out;
    }
  }
}

/** A `function` declaration's parameter list (without the parentheses). */
function printDeclParams(params: ReadonlyArray<DeclParam>, opts: ResolvedFormatOptions): string {
  return params.map((p) => printParam(p, 0, opts)).join(", ");
}

/**
 * One parameter: `name`, `name = default`, `...rest`, or a destructuring
 * pattern (`{ a, "b-c": c } = {}`). Shared by declarations, arrow functions and
 * method shorthand, so a pattern or rest parameter is never printed as a bare
 * (empty) name.
 */
function printParam(p: DeclParam | LambdaParam, indent: number, opts: ResolvedFormatOptions): string {
  const rest = p.rest ? "..." : "";
  const target = p.pattern ? printPattern(p.pattern, indent, opts) : p.name;
  const def = p.defaultValue ? ` = ${printExpression(p.defaultValue, indent, opts)}` : "";
  return `${rest}${target}${def}`;
}

function printTrigger(t: { kind: string } & Record<string, unknown>, opts: ResolvedFormatOptions): string {
  if (t.kind === "lifecycle") return printStringLiteral(t.name as string, opts);
  if (t.kind === "every") return printStringLiteral(`every(${t.intervalMs as number})`, opts);
  if (t.kind === "state") return `$${t.name as string}`;
  return "";
}

function printBlock(stmts: ReadonlyArray<Statement>, indent: number, opts: ResolvedFormatOptions): string {
  // A component declared in a block shadows a same-named one for the calls in
  // it (the evaluator registers it for the block's extent).
  const nested = componentsOf(stmts);
  if (nested.size === 0) return stmts.map((s) => printStatementWithComments(s, indent, opts, false)).join("\n");
  opts.calls.nested.push(nested);
  try {
    return stmts.map((s) => printStatementWithComments(s, indent, opts, false)).join("\n");
  } finally {
    opts.calls.nested.pop();
  }
}

/**
 * Print a `BlockExpr`'s body, INCLUDING its comments — `printBlock` above
 * handles the common case (one or more statements, each comment-aware via
 * `printStatementWithComments`); this additionally covers the one case
 * `printBlock` cannot, because there is no statement to attach to: a fully
 * empty block whose only content is a comment (`block.innerComments`, set
 * only when `block.body.length === 0` — see `parseBlock`).
 *
 * Every `printStatement` call site that used to read `X.body.body` /
 * `X.consequent.body` / `X.block.body` directly (discarding the `BlockExpr`
 * wrapper the comment lives on) now goes through this instead.
 */
function printBlockBody(block: BlockExpr, indent: number, opts: ResolvedFormatOptions): string {
  if (block.body.length === 0 && block.innerComments && block.innerComments.length > 0) {
    return printCommentGroup(block.innerComments, indent, opts).join("\n");
  }
  return printBlock(block.body, indent, opts);
}

/**
 * Builtin calls named `__rui_*` are desugared forms of ordinary operator
 * syntax — `x = y`, `x++`, `++x`, `await x` — produced by
 * `parseExpressionStatement` / `parseAssignmentLikeExpression` / `parseUnary`
 * in the parser whenever that operator appears somewhere the grammar can't
 * express as a plain statement (a computed-member assignment target like
 * `next[field] = value`, an arrow-function body, a nested increment). They
 * MUST be printed back as that original surface syntax, not as a literal
 * `@name(args)` call: the lexer has no `@` token at all (an unrecognised
 * character is silently dropped — see `tokenize`'s "Unknown char" branch),
 * so re-parsing `@name(args)` reads as an ordinary call to an identifier
 * literally named `name`, silently discarding the desugared operator
 * semantics. That is the formatter's idempotency bug: `next[field] = value`
 * formatted once printed as `@__rui_assign__(next[field], value, "=")`
 * (a real `BuiltinCall`, re-parses fine, no errors — so the idempotency
 * guard in `formatProgram` never caught the drift), and formatting that
 * output a second time silently turned it into a plain call expression,
 * dropping the assignment. Returns `null` for any other/future builtin
 * name, which still falls back to the (equally unparseable) `@name(args)`
 * form below — there are no other `__rui_*` names in the grammar today.
 *
 * Since the lexer reports `@` as an `Error` token instead of dropping it, such
 * a fallback now fails the post-format re-parse in `formatProgram`, which
 * returns the source unchanged rather than emitting drifted code.
 */
function printDesugaredOperator(expr: BuiltinCallExpr, indent: number, opts: ResolvedFormatOptions): string | null {
  const literalOperator = (arg: Expression | undefined): string | null =>
    arg && arg.kind === "Literal" && typeof arg.value === "string" ? arg.value : null;

  switch (expr.name) {
    case "__rui_assign__": {
      const [target, value, opNode] = expr.arguments;
      const op = literalOperator(opNode);
      if (!target || !value || op === null) return null;
      return `${printOperand(target, PREC.member, indent, opts)} ${op} ${printExpression(value, indent, opts)}`;
    }
    case "__rui_postfix__": {
      const [target, opNode] = expr.arguments;
      const op = literalOperator(opNode);
      if (!target || op === null) return null;
      return `${printOperand(target, PREC.member, indent, opts)}${op}`;
    }
    case "__rui_prefix__": {
      const [target, opNode] = expr.arguments;
      const op = literalOperator(opNode);
      if (!target || op === null) return null;
      return `${op}${printOperand(target, PREC.unary, indent, opts)}`;
    }
    case "__rui_await__": {
      const [argument] = expr.arguments;
      if (!argument) return null;
      // Always parenthesize: this printer has no precedence table (see the
      // top-of-file doc comment's known exception), so it cannot tell
      // whether the argument needs grouping to keep `await`'s precedence.
      // Without it, `await (ready ? value : fallback)` prints as
      // `await ready ? value : fallback`, which reparses as
      // `(await ready) ? value : fallback` — a different program — and
      // `await (x => x)` prints as `await x => x`, which does not reparse
      // at all. Unconditional parens are always correct here (worst case,
      // one redundant pair around a simple identifier) and idempotent:
      // `await (expr)` desugars to the same argument AST regardless of
      // whether the source had parens, so re-printing it stays stable.
      return `await (${printExpression(argument, indent, opts)})`;
    }
    default:
      return null;
  }
}

/** How tightly `expr`'s form binds — see {@link PREC}. */
function precedenceOf(expr: Expression): number {
  switch (expr.kind) {
    case "Lambda":
      return PREC.lambda;
    case "Ternary":
      return PREC.ternary;
    case "Binary":
      return BINARY_PRECEDENCE[expr.operator];
    case "Unary":
      return PREC.unary;
    case "BuiltinCall":
      switch (expr.name) {
        case "__rui_assign__":
          return PREC.lambda;
        case "__rui_prefix__":
        case "__rui_await__":
          return PREC.unary;
        case "__rui_postfix__":
          return PREC.postfix;
        default:
          return PREC.member;
      }
    default:
      return PREC.member;
  }
}

/** `expr` where its form must bind at least as tightly as `min` — grouped when it does not. */
function printOperand(expr: Expression, min: number, indent: number, opts: ResolvedFormatOptions): string {
  const text = printExpression(expr, indent, opts);
  return precedenceOf(expr) < min ? `(${text})` : text;
}

/**
 * The object of a member access or method call, or the callee of an
 * invocation. A number is grouped as well — `(1).toFixed(2)`: `1.` would
 * start a fraction in JavaScript, and `-1` reads as one number only after an
 * operator or an opening bracket, not after a keyword such as `return`.
 */
function printReceiver(expr: Expression, indent: number, opts: ResolvedFormatOptions): string {
  const text = printExpression(expr, indent, opts);
  const group = precedenceOf(expr) < PREC.member || (expr.kind === "Literal" && typeof expr.value === "number");
  return group ? `(${text})` : text;
}

/** A negative number literal (`-2`, which the lexer reads as one token). */
function isNegativeNumber(expr: Expression): boolean {
  return expr.kind === "Literal" && typeof expr.value === "number" && (expr.value < 0 || Object.is(expr.value, -0));
}

/**
 * `expr` after a keyword (`return`, `throw`, `typeof`, `case`, `in`, …). The
 * lexer reads `-2` as one number only after an operator or an opening
 * bracket, so after a keyword a leading negative number would come back as
 * unary minus applied to `2`; such an expression is grouped. A printed
 * expression starts with `-` and a digit only when it starts with a negative
 * number literal: unary minus before a digit is printed `- 2`.
 */
function afterKeyword(text: string): string {
  return /^-[\d.]/.test(text) ? `(${text})` : text;
}

/**
 * True when `operand` of `operator` mixes `??` with `||` / `&&`. This grammar
 * reads the mix at fixed precedences, but JavaScript rejects it without
 * parentheses, so it is grouped.
 */
function mixesNullish(operator: BinaryOperator, operand: Expression): boolean {
  if (operand.kind !== "Binary") return false;
  if (operator === "??") return operand.operator === "||" || operand.operator === "&&";
  return (operator === "||" || operator === "&&") && operand.operator === "??";
}

/**
 * `new X(…)`'s callee: the parser reads it as a primary followed by member
 * accesses only (a call there would take the constructor's arguments), so
 * anything else is grouped.
 */
function isNewCallee(expr: Expression): boolean {
  if (expr.kind === "Identifier" || expr.kind === "StateRef") return true;
  return expr.kind === "Member" && expr.optional !== true && isNewCallee(expr.object);
}

function printExpression(expr: Expression, indent: number, opts: ResolvedFormatOptions): string {
  switch (expr.kind) {
    case "Literal":
      return printLiteral(expr.value, opts);
    case "Identifier":
      return expr.name;
    case "StateRef":
      return `$${expr.name}`;
    case "Array": {
      if (expr.elements.length === 0) return "[]";
      // Render elements assuming they'll land one level deeper than this
      // array itself — see `printCall`'s doc comment for why this must
      // happen before the inline-vs-wrap decision, not after.
      const items = expr.elements.map((e) => printExpression(e, indent + 1, opts));
      const inline = `[${items.join(", ")}]`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const innerPad = pad(indent + 1, opts);
      const body = items.map((s) => `${innerPad}${s}`).join(",\n");
      const trailingComma = opts.trailingComma ? "," : "";
      return `[\n${body}${trailingComma}\n${pad(indent, opts)}]`;
    }
    case "Object": {
      if (expr.properties.length === 0) return "{}";
      // Same one-level-deeper rendering as `Array` above.
      const items = expr.properties.map((p) => printObjectProp(p, indent + 1, opts));
      const inline = opts.objectCurlySpacing
        ? `{ ${items.join(", ")} }`
        : `{${items.join(", ")}}`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const innerPad = pad(indent + 1, opts);
      const body = items.map((s) => `${innerPad}${s}`).join(",\n");
      const trailingComma = opts.trailingComma ? "," : "";
      return `{\n${body}${trailingComma}\n${pad(indent, opts)}}`;
    }
    case "Member": {
      const obj = printReceiver(expr.object, indent, opts);
      const dot = expr.optional ? "?." : ".";
      if (expr.property) return `${obj}${dot}${expr.property}`;
      if (expr.computed) {
        const inner = printExpression(expr.computed, indent, opts);
        return expr.optional ? `${obj}?.[${inner}]` : `${obj}[${inner}]`;
      }
      return obj;
    }
    case "Unary": {
      const argument = printOperand(expr.argument, PREC.unary, indent, opts);
      // A keyword operator needs a space (`typeof x`, and `typeof (-1)` — see
      // `afterKeyword`), and so does a sign before the same sign — `- -x` and
      // `+ +x`, not the `--` / `++` operators — and `-` before a digit, which
      // would otherwise lex as a negative number: `- 2`.
      if (/^[a-z]/.test(expr.operator)) return `${expr.operator} ${afterKeyword(argument)}`;
      const spaced = ((expr.operator === "-" || expr.operator === "+") && argument.startsWith(expr.operator)) ||
        (expr.operator === "-" && /^[\d.]/.test(argument));
      return `${expr.operator}${spaced ? " " : ""}${argument}`;
    }
    case "Binary": {
      const precedence = BINARY_PRECEDENCE[expr.operator];
      // `**` is right-associative. Its base is a unary operand in this grammar,
      // but JavaScript rejects a signed base, so that is grouped: `(-a) ** 2`.
      const exponent = expr.operator === "**";
      const leftText = printExpression(expr.left, indent, opts);
      const rightText = printExpression(expr.right, indent, opts);
      const groupLeft = precedenceOf(expr.left) < (exponent ? PREC.postfix : precedence) ||
        mixesNullish(expr.operator, expr.left) || (exponent && isNegativeNumber(expr.left));
      const groupRight = precedenceOf(expr.right) < (exponent ? precedence : precedence + 1) ||
        mixesNullish(expr.operator, expr.right);
      const left = groupLeft ? `(${leftText})` : leftText;
      const right = groupRight ? `(${rightText})` : rightText;
      const keyword = expr.operator === "in" || expr.operator === "instanceof";
      return `${left} ${expr.operator} ${keyword ? afterKeyword(right) : right}`;
    }
    case "Ternary": {
      // Both branches are full expressions (`parseTernary`); the test is not.
      const test = printOperand(expr.test, PREC.logicalOr, indent, opts);
      return `${test} ? ${printExpression(expr.consequent, indent, opts)} : ${printExpression(expr.alternate, indent, opts)}`;
    }
    case "Call":
      return printCallExpr(expr, indent, opts);
    case "MethodCall": {
      const target = printReceiver(expr.object, indent, opts);
      const sep = expr.optional ? "?." : ".";
      return printCall(`${target}${sep}${expr.method}`, expr.arguments, indent, opts);
    }
    case "Invoke": {
      // `(b)(x)` and `(o.p)(x)` stay grouped: printed bare they would parse as
      // a call by name (`Call`) and a method call (`MethodCall`), not as an
      // invocation of the callee's value.
      const byName = expr.callee.kind === "Identifier" ||
        (expr.callee.kind === "Member" && expr.callee.property !== undefined);
      const receiver = printReceiver(expr.callee, indent, opts);
      const callee = byName ? `(${receiver})` : receiver;
      const sep = expr.optional ? "?." : "";
      return printCall(`${callee}${sep}`, expr.arguments, indent, opts);
    }
    case "New": {
      const text = printExpression(expr.callee, indent, opts);
      const callee = isNewCallee(expr.callee) ? text : `(${text})`;
      return `new ${printCall(callee, expr.arguments, indent, opts)}`;
    }
    case "BuiltinCall":
      return printDesugaredOperator(expr, indent, opts) ?? printCall(`@${expr.name}`, expr.arguments, indent, opts);
    case "Template":
      return printTemplate(expr.quasis, expr.expressions, indent, opts);
    case "Spread":
      return `...${printExpression(expr.argument, indent, opts)}`;
    case "Lambda":
      return printLambda(expr, indent, opts);
    case "Block":
      return `{\n${printBlockBody(expr, indent + 1, opts)}\n${pad(indent, opts)}}`;
  }
}

/**
 * An arrow function, or — when it has a `selfName` — a named function
 * expression, whose name is bound inside its own body (so it can recurse).
 */
function printLambda(expr: LambdaExpr, indent: number, opts: ResolvedFormatOptions): string {
  const params = expr.params.map((p) => printParam(p, indent, opts)).join(", ");
  if (expr.selfName !== undefined) {
    const body: BlockExpr = expr.body.kind === "Block"
      ? expr.body
      : { kind: "Block", body: [{ kind: "Return", argument: expr.body }] };
    return `function ${expr.selfName}(${params}) ${printExpression(body, indent, opts)}`;
  }
  const only = expr.params.length === 1 ? expr.params[0]! : undefined;
  const head = only && !only.defaultValue && !only.rest && !only.pattern ? only.name : `(${params})`;
  if (expr.body.kind === "Block") return `${head} => ${printExpression(expr.body, indent, opts)}`;
  // `{` after `=>` opens a block, so a concise body that starts with an
  // object literal is grouped: `m => ({ role: m.role })`.
  const body = printExpression(expr.body, indent, opts);
  return `${head} => ${body.startsWith("{") ? `(${body})` : body}`;
}

function printCall(callee: string, args: Expression[], indent: number, opts: ResolvedFormatOptions): string {
  if (args.length === 0) return `${callee}()`;
  // Every argument is printed as if it will land one level deeper than the
  // call itself — the same "first line unindented, inner lines already
  // absolutely padded to `indent`" convention every other multi-line printer
  // in this file follows (Array/Object/Block). This must happen BEFORE the
  // inline-vs-wrap decision below, not after: a multi-line argument (e.g. a
  // wrapped `Object`/`Array` literal) bakes its OWN inner lines' indentation
  // in at print time, so rendering at `indent` and only prepending the wrap
  // branch's `innerPad` to each part's first line — as this used to do —
  // left every line after the first one shallow by exactly one level. The
  // indent value is irrelevant to a part that stays single-line (it never
  // calls `pad`), so re-using this same rendering for the inline check below
  // is always safe.
  const parts = args.map((a) => printExpression(a, indent + 1, opts));
  const inline = `${callee}(${parts.join(", ")})`;
  if (inline.length <= 80 && !parts.some((s) => s.includes("\n"))) return inline;
  const innerPad = pad(indent + 1, opts);
  return `${callee}(\n${parts.map((s) => `${innerPad}${s}`).join(",\n")}\n${pad(indent, opts)})`;
}

/**
 * A call by bare name. A call that reaches a user component is printed so
 * that the re-parsed text binds its arguments as the AST does, which plain
 * text would not for a call from a `.aktion.js` / `.aktion.ts` module:
 *
 *   - a `positional` call that reaches a `javascript` component binds as
 *     JavaScript does (`printPositionalCall`);
 *   - named props reach a parameter the JS-semantics layer renamed through its
 *     `publicName`, which only the AST carries, so they are printed under the
 *     parameter's local name (`namedPropsByLocalName`).
 *
 * The component a call reaches is resolved lexically — a component declared
 * in an enclosing block, else the top-level one — except that inside a
 * component's own body its name means the built-in component it shadows, if
 * there is one (the evaluator's wrapper semantics, `isSelfShadowingLibraryName`).
 */
function printCallExpr(expr: CallExpr, indent: number, opts: ResolvedFormatOptions): string {
  const decl = reachedComponent(expr.callee, opts.calls);
  if (!decl) return printCall(expr.callee, expr.arguments, indent, opts);
  if (expr.positional === true && decl.javascript === true) return printPositionalCall(expr, decl, indent, opts);
  return printCall(expr.callee, namedPropsByLocalName(expr.arguments, decl), indent, opts);
}

/** The user component a call to `callee` reaches, as {@link printCallExpr} resolves it. */
function reachedComponent(callee: string, scope: CallScope): ComponentDeclaration | undefined {
  if (LIBRARY_COMPONENTS.has(callee) && scope.enclosing.includes(callee)) return undefined;
  for (let i = scope.nested.length - 1; i >= 0; i -= 1) {
    const found = scope.nested[i]!.get(callee);
    if (found) return found;
  }
  return scope.topLevel.get(callee);
}

/**
 * `args` with the keys of the named-props argument (`trailingPropsArgument`)
 * renamed from a parameter's `publicName` to its local name — the only name
 * the re-parsed declaration has. `key` stays: it is the instance identity,
 * never a prop.
 */
function namedPropsByLocalName(args: Expression[], decl: ComponentDeclaration): Expression[] {
  const localOf = new Map<string, string>();
  for (const p of decl.params) {
    if (p.name && p.publicName !== undefined && p.publicName !== p.name) localOf.set(p.publicName, p.name);
  }
  if (localOf.size === 0) return args;
  const bag = trailingPropsArgument(args, decl.params);
  if (!bag || !bag.named) return args;
  const object = args[bag.index] as ObjectExpr;
  const properties = object.properties.map((prop): ObjectProperty => {
    if (prop.spread || prop.computedKey || prop.key === "key") return prop;
    const local = localOf.get(prop.key);
    return local === undefined ? prop : { ...prop, key: local };
  });
  return args.map((arg, i) => (i === bag.index ? { ...object, properties } : arg));
}

/**
 * What the instance identity of a positional call is, read from the object
 * literals `positionalKeyArguments` lists (the last that has its own `key`
 * wins): `"none"` when none of them can have one, `"static"` when it is one
 * literal's `key:` expression and printing it again yields the same value,
 * else `"dynamic"`.
 */
type PositionalKey =
  | { kind: "none" }
  | { kind: "static"; value: Expression }
  | { kind: "dynamic"; candidates: number[] };

/**
 * An object literal's own `key`: the expression of its last `key:` property
 * when no spread or computed key after it can replace it, `"absent"` when the
 * literal cannot have one, else `"maybe"`.
 */
function ownKey(literal: ObjectExpr): Expression | "absent" | "maybe" {
  let value: Expression | undefined;
  let dynamic = false;
  for (const prop of literal.properties) {
    if (prop.spread || prop.computedKey) {
      dynamic = true;
    } else if (prop.key === "key") {
      value = prop.value;
      dynamic = false;
    }
  }
  if (dynamic) return "maybe";
  return value ?? "absent";
}

/**
 * True when evaluating `expr` changes nothing, so a value read before or
 * after it is the same: literals, names, state and member reads, operators
 * over them, and object, array and function literals. A call, `new` or an
 * assignment is not (nor `delete`).
 */
function isSideEffectFree(expr: Expression): boolean {
  switch (expr.kind) {
    case "Literal":
    case "Identifier":
    case "StateRef":
    case "Lambda":
      return true;
    case "Template":
      return expr.expressions.every(isSideEffectFree);
    case "Member":
      return isSideEffectFree(expr.object) && (expr.computed === undefined || isSideEffectFree(expr.computed));
    case "Unary":
      return expr.operator !== "delete" && isSideEffectFree(expr.argument);
    case "Binary":
      return isSideEffectFree(expr.left) && isSideEffectFree(expr.right);
    case "Ternary":
      return isSideEffectFree(expr.test) && isSideEffectFree(expr.consequent) && isSideEffectFree(expr.alternate);
    case "Spread":
      return isSideEffectFree(expr.argument);
    case "Array":
      return expr.elements.every(isSideEffectFree);
    case "Object":
      return expr.properties.every((p) =>
        isSideEffectFree(p.value) && (p.computedKey === undefined || isSideEffectFree(p.computedKey)));
    default:
      return false;
  }
}

function positionalKey(args: ReadonlyArray<Expression>, params: ReadonlyArray<DeclParam>): PositionalKey {
  const candidates = positionalKeyArguments(args, params);
  for (let c = candidates.length - 1; c >= 0; c -= 1) {
    const index = candidates[c]!;
    const own = ownKey(args[index] as ObjectExpr);
    if (own === "absent") continue;
    // Printed again as a trailing `{ key: … }`, the expression is evaluated
    // after the rest of its literal and every later argument; when none of
    // them can change what it reads, it reads the same value.
    if (own === "maybe" || !args.slice(index).every(isSideEffectFree)) return { kind: "dynamic", candidates };
    return { kind: "static", value: own };
  }
  return { kind: "none" };
}

/**
 * A call the JS-semantics layer marked `positional` that reaches a component
 * declared in a `.aktion.js` / `.aktion.ts` module: every argument binds to
 * the parameter at its position (`invokeComponentDeclPositionally`). Text
 * cannot carry that mark, and the DSL binds an object-literal argument by its
 * own rules (`trailingPropsArgument`), so each object literal is printed as
 * the spread of a one-element array — `...[{ … }]` — which the DSL passes
 * positionally, evaluated once and in place. Where the call reads an instance
 * identity (`positionalKey`), a trailing `{ key: … }` — then the only object
 * literal of the call — carries it:
 *
 *   KVRow({ key: "a", value: "1" })   →  KVRow(...[{ key: "a", value: "1" }])
 *   Row(item, { key: item.id })       →  Row(item, ...[{ key: item.id }], { key: item.id })
 *
 * When the identity cannot be printed as an expression of its own, see
 * {@link printPositionalCallOnce}.
 */
function printPositionalCall(expr: CallExpr, decl: ComponentDeclaration, indent: number, opts: ResolvedFormatOptions): string {
  const key = positionalKey(expr.arguments, decl.params);
  if (key.kind === "dynamic") return printPositionalCallOnce(expr, key.candidates, indent, opts);
  const args: Expression[] = expr.arguments.map((arg) =>
    arg.kind === "Object" ? { kind: "Spread", argument: { kind: "Array", elements: [arg] } } : arg);
  if (key.kind === "static") args.push({ kind: "Object", properties: [{ key: "key", value: key.value }] });
  return printCall(expr.callee, args, indent, opts);
}

/**
 * {@link printPositionalCall} for a call whose identity is not one literal's
 * `key:` expression (a spread or computed key may supply it), or whose key
 * expression could read something else when evaluated again. An arrow invoked
 * on the spot takes every argument as a parameter — so each is evaluated
 * once, in order, as the AST evaluates them — and makes the call, reading the
 * identity from the arguments' values, the last that can hold one first:
 *
 *   Row(item, { key: next() })  →  ((__arg0, __arg1) => Row(__arg0, __arg1, { key: __arg1.key }))(item, { key: next() })
 *
 * An argument that may lack an own `key` reads as `"key" in __argN ? __argN.key : …`.
 */
function printPositionalCallOnce(
  expr: CallExpr,
  candidates: readonly number[],
  indent: number,
  opts: ResolvedFormatOptions,
): string {
  const args = expr.arguments;
  const names = args.map((_, i) => `__arg${i}`);
  const ref = (i: number): Expression => ({ kind: "Identifier", name: names[i]! });
  let key: Expression | undefined;
  for (const index of candidates) {
    const own = ownKey(args[index] as ObjectExpr);
    if (own === "absent") continue;
    const read: Expression = { kind: "Member", object: ref(index), property: "key" };
    key = own === "maybe"
      ? {
          kind: "Ternary",
          test: { kind: "Binary", operator: "in", left: { kind: "Literal", value: "key" }, right: ref(index) },
          consequent: read,
          alternate: key ?? { kind: "Identifier", name: "undefined" },
        }
      : read;
  }
  const inner: Expression[] = args.map((arg, i) => (arg.kind === "Spread" ? { kind: "Spread", argument: ref(i) } : ref(i)));
  if (key) inner.push({ kind: "Object", properties: [{ key: "key", value: key }] });
  const call: LambdaExpr = {
    kind: "Lambda",
    params: names.map((name) => ({ name })),
    body: { kind: "Call", callee: expr.callee, arguments: inner },
  };
  // A spread argument is passed as its operand, which the inner call spreads.
  const outer = args.map((arg) => (arg.kind === "Spread" ? arg.argument : arg));
  return printExpression({ kind: "Invoke", callee: call, arguments: outer }, indent, opts);
}

function printSwitchCase(c: SwitchCase, indent: number, opts: ResolvedFormatOptions): string {
  const padStr = pad(indent, opts);
  // `printBlock` (not a bare `.map`) so statements inside the case body get
  // their own leading/trailing comments — see `printStatementWithComments`.
  const body = printBlock(c.body, indent + 1, opts);
  const head = c.test === null
    ? `${padStr}default:`
    : `${padStr}case ${afterKeyword(printExpression(c.test, indent, opts))}:`;
  const caseText = body.length > 0 ? `${head}\n${body}` : head;
  // Comment(s) preceding the `case`/`default` keyword itself (a note on the
  // branch as a whole) — distinct from `body`'s own leading comments on its
  // first statement, which document that statement instead.
  if (!c.leadingComments || c.leadingComments.length === 0) return caseText;
  const header = printCommentGroup(c.leadingComments, indent, opts);
  return `${header.join("\n")}\n${caseText}`;
}

function printObjectProp(prop: ObjectProperty, indent: number, opts: ResolvedFormatOptions): string {
  if (prop.spread) return `...${printExpression(prop.value, indent, opts)}`;
  // A computed key is printed as written (its `key` field is ""); any other
  // key that is not a plain name is quoted — `$` would start a state atom.
  const name = prop.computedKey
    ? `[${printExpression(prop.computedKey, indent, opts)}]`
    : (PLAIN_KEY.test(prop.key) ? prop.key : printStringLiteral(prop.key, opts));
  // Method shorthand — `save(item) { … }` — exactly as it was written.
  if (prop.method && prop.value.kind === "Lambda" && prop.value.body.kind === "Block") {
    const params = prop.value.params.map((p) => printParam(p, indent, opts)).join(", ");
    return `${name}(${params}) ${printExpression(prop.value.body, indent, opts)}`;
  }
  const value = printExpression(prop.value, indent, opts);
  // Shorthand: `{ name }` when key and value identifier match.
  if (
    !prop.computedKey &&
    prop.value.kind === "Identifier" &&
    prop.value.name === prop.key &&
    PLAIN_KEY.test(prop.key)
  ) {
    return prop.key;
  }
  return `${name}: ${value}`;
}

function printLiteral(value: string | number | boolean | null, opts: ResolvedFormatOptions): string {
  if (value === null) return "null";
  if (typeof value === "string") return printStringLiteral(value, opts);
  if (typeof value === "boolean") return value ? "true" : "false";
  // `String(-0)` is "0", which would read back as positive zero.
  return Object.is(value, -0) ? "-0" : String(value);
}

/**
 * Choose the quote character for one specific string value. Double quotes
 * (or single, if `quoteStyle: "single"`) by default — single-quote and
 * template forms are only emitted when the AST distinguishes them, which it
 * does not, so canonical quoting is a pure print-time choice. When
 * `opts.quote` would require escaping the quote char itself (e.g. `'` in
 * single-quote mode) but the OTHER quote char never appears in the value,
 * fall back to that other quote for this string only, to avoid an ugly
 * escape — mirrors ESLint's `quotes` rule with `avoidEscape: true`. This
 * refinement is worth the extra branch here: without it, every apostrophe
 * in ordinary text (`"it's"`) would print as `'it\'s'` under
 * `quoteStyle: "single"`, which is uglier than just keeping that one string
 * double-quoted.
 */
function chooseQuote(value: string, opts: ResolvedFormatOptions): '"' | "'" {
  const other = opts.quote === '"' ? "'" : '"';
  if (value.includes(opts.quote) && !value.includes(other)) return other;
  return opts.quote;
}

function printStringLiteral(value: string, opts: ResolvedFormatOptions): string {
  const quote = chooseQuote(value, opts);
  const needsEscape = quote === '"' ? NEEDS_ESCAPE_DOUBLE.test(value) : NEEDS_ESCAPE_SINGLE.test(value);
  // When the body contains `\`, the chosen quote char, or a raw control
  // character that can't survive inside a single-line literal, escape it —
  // order matters: backslash must be escaped first, or the backslashes
  // introduced by the later replacements would themselves get doubled.
  if (needsEscape) {
    const quoteEscape = quote === '"' ? /"/g : /'/g;
    const quoteReplacement = quote === '"' ? '\\"' : "\\'";
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(quoteEscape, quoteReplacement)
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `${quote}${escaped}${quote}`;
  }
  return `${quote}${value}${quote}`;
}

/**
 * A template chunk as source. The AST holds the chunk's value (escapes
 * decoded), so the characters the lexer would read as syntax — `\`, the
 * backtick and `${` — are escaped again.
 */
function printTemplateChunk(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function printTemplate(quasis: string[], expressions: Expression[], indent: number, opts: ResolvedFormatOptions): string {
  const parts: string[] = [];
  for (let i = 0; i < quasis.length; i += 1) {
    parts.push(printTemplateChunk(quasis[i] ?? ""));
    if (i < expressions.length) {
      parts.push("${");
      parts.push(printExpression(expressions[i]!, indent, opts));
      parts.push("}");
    }
  }
  return `\`${parts.join("")}\``;
}
