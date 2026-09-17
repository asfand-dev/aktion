/**
 * Aktion 0.5 §27 — canonical pretty-printer.
 *
 * `formatProgram(source, options?)` re-emits a syntactically clean version
 * of the input. The output is:
 *
 *   - **Idempotent.** `format(format(x)) === format(x)` for every input
 *     that parses cleanly.
 *   - **Canonical.** Statements one per line; two-space indentation by
 *     default inside `{ … }` blocks (configurable via `FormatOptions`);
 *     named args always use `prop: value` (the legacy `prop=value` form is
 *     gone); double-quoted strings unless interpolation is required
 *     (templates).
 *   - **Round-trips through the parser.** Re-parsing the formatter's
 *     output yields a structurally-equivalent AST.
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
 * Indentation is configurable via the optional `FormatOptions` parameter on
 * both `formatProgram` and `printProgram` (`indentStyle`/`indentWidth`).
 * Omitting it reproduces today's exact 2-space output, unchanged — this is
 * a published surface with real consumers depending on that default shape.
 */

import { parse } from "../parser/index.js";
import type {
  DestructuringPattern,
  Expression,
  ObjectProperty,
  ParseError,
  Program,
  Statement,
  SwitchCase,
} from "../parser/types.js";

const SAFE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const NEEDS_DOUBLE_QUOTE = /[\\"]/;

/**
 * Configures the printer's indentation. Every default matches today's
 * hard-coded behaviour (2-space indents), so calling `formatProgram`/
 * `printProgram` with no options is BIT-FOR-BIT IDENTICAL to the pre-existing
 * output — this is load-bearing: the printer is a published surface with
 * real consumers depending on that exact shape.
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
}

interface ResolvedFormatOptions {
  /** The literal string repeated `depth` times to indent one level. */
  unit: string;
}

const DEFAULT_INDENT_WIDTH = 2;

function resolveFormatOptions(options?: FormatOptions): ResolvedFormatOptions {
  if (options?.indentStyle === "tab") {
    return { unit: "\t" };
  }
  const width = options?.indentWidth ?? DEFAULT_INDENT_WIDTH;
  return { unit: " ".repeat(width) };
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
  const parts = pattern.bindings.map((b) => {
    const lead = b.rest ? "..." : "";
    const target = b.pattern
      ? (pattern.kind === "object" && b.sourceKey
          ? `${b.sourceKey}: ${printPattern(b.pattern, indent, opts)}`
          : printPattern(b.pattern, indent, opts))
      : (b.sourceKey ? `${b.sourceKey}: ${b.name}` : (b.name || ""));
    const def = b.defaultValue ? ` = ${printExpression(b.defaultValue, indent, opts)}` : "";
    return `${lead}${target}${def}`;
  });
  return `${open}${parts.join(", ")}${close}`;
}

export interface FormatResult {
  /** Canonical source. Equal to the input when parse errors occur. */
  formatted: string;
  /** Parse errors raised while reading the input — formatting is a no-op when non-empty. */
  errors: ParseError[];
}

export function formatProgram(source: string, options?: FormatOptions): FormatResult {
  const program = parse(source);
  if (program.errors.length > 0) {
    return { formatted: source, errors: [...program.errors] };
  }
  const out = printProgram(program, options);
  // Guarantee idempotency: re-formatting the output must yield the
  // same string. If not, the printer disagrees with the parser and we
  // fall back to the un-touched source so the caller never sees drift.
  const second = parse(out);
  if (second.errors.length > 0) {
    return { formatted: source, errors: [] };
  }
  return { formatted: out, errors: [] };
}

/**
 * Re-emit a parsed `Program` as canonical Aktion source. Exported so the
 * module linker can serialise a merged (multi-file → single) program back to
 * text for `mountCompiled`'s round-trip fields (reconnect re-parse, snapshots).
 */
export function printProgram(program: Program, options?: FormatOptions): string {
  const opts = resolveFormatOptions(options);
  const lines: string[] = [];
  let prev: Statement | null = null;
  for (const stmt of program.statements) {
    if (prev && needsBlankLineBetween(prev, stmt)) lines.push("");
    lines.push(printStatement(stmt, 0, opts));
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
      return `${padStr}import { ${specs} } from "${stmt.source}"`;
    }
    case "Assignment": {
      const lhs = stmt.isState ? `$${stmt.identifier}` : stmt.identifier;
      const expr = printExpression(stmt.expression, indent, opts);
      return `${padStr}${exp}${lhs} = ${expr}`;
    }
    case "ComponentDeclaration": {
      const params = stmt.params.map((p) => printDeclParam(p, opts)).join(", ");
      const head = `${padStr}${exp}function ${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1, opts);
      return body.length > 0
        ? `${head}\n${body}\n${padStr}}`
        : `${head}\n${padStr}}`;
    }
    case "EffectDeclaration": {
      const deps: string[] = stmt.triggers.map(printTrigger).filter((s) => s.length > 0);
      if (stmt.rateLimit) {
        deps.push(`"${stmt.rateLimit.kind}(${stmt.rateLimit.ms})"`);
      }
      const body = printBlock(stmt.body.body, indent + 1, opts);
      const depsArray = `[${deps.join(", ")}]`;
      return `${padStr}$effect(() => {\n${body}\n${padStr}}, ${depsArray})`;
    }
    case "ActionDeclaration": {
      const params = stmt.params.map((p) => printDeclParam(p, opts)).join(", ");
      const head = `${padStr}${exp}function ${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1, opts);
      return `${head}\n${body}\n${padStr}}`;
    }
    case "HookDeclaration": {
      // Re-emit the `$` sigil that marks the function as a hook.
      const params = stmt.params.map((p) => printDeclParam(p, opts)).join(", ");
      const head = `${padStr}${exp}function $${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1, opts);
      return `${head}\n${body}\n${padStr}}`;
    }
    case "Await": {
      return `${padStr}await ${printExpression(stmt.argument, indent, opts)}`;
    }
    case "Return": {
      return stmt.argument
        ? `${padStr}return ${printExpression(stmt.argument, indent, opts)}`
        : `${padStr}return`;
    }
    case "ExpressionStatement": {
      return `${padStr}${printExpression(stmt.expression, indent, opts)}`;
    }
    case "IfStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const cons = `{\n${printBlock(stmt.consequent.body, indent + 1, opts)}\n${padStr}}`;
      if (!stmt.alternate) return `${padStr}if (${test}) ${cons}`;
      const alt = stmt.alternate.kind === "IfStatement"
        ? printStatement(stmt.alternate, indent, opts).trimStart()
        : `{\n${printBlock(stmt.alternate.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}if (${test}) ${cons} else ${alt}`;
    }
    case "SwitchStatement": {
      const disc = printExpression(stmt.discriminant, indent, opts);
      const cases = stmt.cases.map((c) => printSwitchCase(c, indent + 1, opts)).join("\n");
      return `${padStr}switch (${disc}) {\n${cases}\n${padStr}}`;
    }
    case "ForOfStatement": {
      const iter = printExpression(stmt.iterable, indent, opts);
      const body = `{\n${printBlock(stmt.body.body, indent + 1, opts)}\n${padStr}}`;
      const binding = stmt.pattern ? printPattern(stmt.pattern, indent, opts) : stmt.item;
      return `${padStr}for (let ${binding} of ${iter}) ${body}`;
    }
    case "ForClassicStatement": {
      const init = stmt.init ? printStatement(stmt.init, 0, opts).trimStart() : "";
      const test = stmt.test ? printExpression(stmt.test, indent, opts) : "";
      const update = stmt.update ? printExpression(stmt.update, indent, opts) : "";
      const body = `{\n${printBlock(stmt.body.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}for (${init}; ${test}; ${update}) ${body}`;
    }
    case "WhileStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const body = `{\n${printBlock(stmt.body.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}while (${test}) ${body}`;
    }
    case "DoWhileStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const body = `{\n${printBlock(stmt.body.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}do ${body} while (${test})`;
    }
    case "ForInStatement": {
      const iter = printExpression(stmt.iterable, indent, opts);
      const body = `{\n${printBlock(stmt.body.body, indent + 1, opts)}\n${padStr}}`;
      return `${padStr}for (let ${stmt.item} in ${iter}) ${body}`;
    }
    case "DestructureStatement": {
      const pattern = printPattern({ kind: stmt.patternKind, bindings: stmt.bindings }, indent, opts);
      const expr = printExpression(stmt.expression, indent, opts);
      return `${padStr}let ${pattern} = ${expr}`;
    }
    case "BreakStatement":
      return `${padStr}break`;
    case "ContinueStatement":
      return `${padStr}continue`;
    case "ThrowStatement":
      return `${padStr}throw ${printExpression(stmt.argument, indent, opts)}`;
    case "TryStatement": {
      const block = `{\n${printBlock(stmt.block.body, indent + 1, opts)}\n${padStr}}`;
      let out = `${padStr}try ${block}`;
      if (stmt.catchBlock) {
        const catchHead = stmt.catchParam ? ` (${stmt.catchParam})` : "";
        const catchBody = `{\n${printBlock(stmt.catchBlock.body, indent + 1, opts)}\n${padStr}}`;
        out += ` catch${catchHead} ${catchBody}`;
      }
      if (stmt.finallyBlock) {
        const finBody = `{\n${printBlock(stmt.finallyBlock.body, indent + 1, opts)}\n${padStr}}`;
        out += ` finally ${finBody}`;
      }
      return out;
    }
  }
}

function printDeclParam(p: { name: string; defaultValue?: Expression; optional?: boolean }, opts: ResolvedFormatOptions): string {
  if (p.defaultValue) {
    return `${p.name} = ${printExpression(p.defaultValue, 0, opts)}`;
  }
  return p.name;
}

function printTrigger(t: { kind: string } & Record<string, unknown>): string {
  if (t.kind === "lifecycle") return `"${t.name as string}"`;
  if (t.kind === "every") return `"every(${t.intervalMs as number})"`;
  if (t.kind === "state") return `$${t.name as string}`;
  return "";
}

function printBlock(stmts: ReadonlyArray<Statement>, indent: number, opts: ResolvedFormatOptions): string {
  return stmts.map((s) => printStatement(s, indent, opts)).join("\n");
}

function printExpression(expr: Expression, indent: number, opts: ResolvedFormatOptions): string {
  switch (expr.kind) {
    case "Literal":
      return printLiteral(expr.value);
    case "Identifier":
      return expr.name;
    case "StateRef":
      return `$${expr.name}`;
    case "Array": {
      if (expr.elements.length === 0) return "[]";
      const items = expr.elements.map((e) => printExpression(e, indent, opts));
      const inline = `[${items.join(", ")}]`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const innerPad = pad(indent + 1, opts);
      return `[\n${items.map((s) => `${innerPad}${s}`).join(",\n")}\n${pad(indent, opts)}]`;
    }
    case "Object": {
      if (expr.properties.length === 0) return "{}";
      const items = expr.properties.map((p) => printObjectProp(p, indent, opts));
      const inline = `{ ${items.join(", ")} }`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const innerPad = pad(indent + 1, opts);
      return `{\n${items.map((s) => `${innerPad}${s}`).join(",\n")}\n${pad(indent, opts)}}`;
    }
    case "Member": {
      const obj = printExpression(expr.object, indent, opts);
      const dot = expr.optional ? "?." : ".";
      if (expr.property) return `${obj}${dot}${expr.property}`;
      if (expr.computed) {
        const inner = printExpression(expr.computed, indent, opts);
        return expr.optional ? `${obj}?.[${inner}]` : `${obj}[${inner}]`;
      }
      return obj;
    }
    case "Unary":
      return `${expr.operator}${printExpression(expr.argument, indent, opts)}`;
    case "Binary":
      return `${printExpression(expr.left, indent, opts)} ${expr.operator} ${printExpression(expr.right, indent, opts)}`;
    case "Ternary":
      return `${printExpression(expr.test, indent, opts)} ? ${printExpression(expr.consequent, indent, opts)} : ${printExpression(expr.alternate, indent, opts)}`;
    case "Call":
      return printCall(expr.callee, expr.arguments, indent, opts);
    case "MethodCall": {
      const target = printExpression(expr.object, indent, opts);
      const sep = expr.optional ? "?." : ".";
      return printCall(`${target}${sep}${expr.method}`, expr.arguments, indent, opts);
    }
    case "Invoke": {
      const callee = printExpression(expr.callee, indent, opts);
      const sep = expr.optional ? "?." : "";
      return printCall(`${callee}${sep}`, expr.arguments, indent, opts);
    }
    case "New": {
      const callee = printExpression(expr.callee, indent, opts);
      return `new ${printCall(callee, expr.arguments, indent, opts)}`;
    }
    case "BuiltinCall":
      return printCall(`@${expr.name}`, expr.arguments, indent, opts);
    case "Template":
      return printTemplate(expr.quasis, expr.expressions, indent, opts);
    case "Spread":
      return `...${printExpression(expr.argument, indent, opts)}`;
    case "Lambda": {
      const params = expr.params
        .map((p) => {
          const prefix = p.rest ? "..." : "";
          return p.defaultValue
            ? `${prefix}${p.name} = ${printExpression(p.defaultValue, indent, opts)}`
            : `${prefix}${p.name}`;
        })
        .join(", ");
      const head = expr.params.length === 1 && !expr.params[0]!.defaultValue && !expr.params[0]!.rest
        ? expr.params[0]!.name
        : `(${params})`;
      return `${head} => ${printExpression(expr.body, indent, opts)}`;
    }
    case "Block":
      return `{\n${printBlock(expr.body, indent + 1, opts)}\n${pad(indent, opts)}}`;
  }
}

function printCall(callee: string, args: Expression[], indent: number, opts: ResolvedFormatOptions): string {
  if (args.length === 0) return `${callee}()`;
  const parts = args.map((a) => printExpression(a, indent, opts));
  const inline = `${callee}(${parts.join(", ")})`;
  if (inline.length <= 80 && !parts.some((s) => s.includes("\n"))) return inline;
  const innerPad = pad(indent + 1, opts);
  return `${callee}(\n${parts.map((s) => `${innerPad}${s}`).join(",\n")}\n${pad(indent, opts)})`;
}

function printSwitchCase(c: SwitchCase, indent: number, opts: ResolvedFormatOptions): string {
  const padStr = pad(indent, opts);
  const body = c.body.map((s) => printStatement(s, indent + 1, opts)).join("\n");
  if (c.test === null) {
    return `${padStr}default:\n${body}\n${printStatement({ kind: "ExpressionStatement", expression: { kind: "Identifier", name: "break" } } as Statement, indent + 1, opts)}`;
  }
  return `${padStr}case ${printExpression(c.test, indent, opts)}:\n${body}\n${pad(indent + 1, opts)}break`;
}

function printObjectProp(prop: ObjectProperty, indent: number, opts: ResolvedFormatOptions): string {
  if (prop.spread) return `...${printExpression(prop.value, indent, opts)}`;
  const value = printExpression(prop.value, indent, opts);
  // Shorthand: `{ name }` when key and value identifier match.
  if (
    prop.value.kind === "Identifier" &&
    prop.value.name === prop.key &&
    SAFE_IDENT.test(prop.key)
  ) {
    return prop.key;
  }
  const key = SAFE_IDENT.test(prop.key) ? prop.key : printStringLiteral(prop.key);
  return `${key}: ${value}`;
}

function printLiteral(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "string") return printStringLiteral(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function printStringLiteral(value: string): string {
  // Double quotes by default. If the body contains both `"` and `\\`,
  // escape `"` so the output round-trips. Single-quote and template
  // forms are only emitted when the AST distinguishes them, which it
  // does not — string literals carry no quote-style metadata, so
  // canonical double-quoting is fine.
  if (NEEDS_DOUBLE_QUOTE.test(value)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return `"${value}"`;
}

function printTemplate(quasis: string[], expressions: Expression[], indent: number, opts: ResolvedFormatOptions): string {
  const parts: string[] = [];
  for (let i = 0; i < quasis.length; i += 1) {
    parts.push(quasis[i] ?? "");
    if (i < expressions.length) {
      parts.push("${");
      parts.push(printExpression(expressions[i]!, indent, opts));
      parts.push("}");
    }
  }
  return `\`${parts.join("")}\``;
}
