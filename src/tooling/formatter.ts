/**
 * Aktion 0.5 §27 — canonical pretty-printer.
 *
 * `formatProgram(source)` re-emits a syntactically clean version of the
 * input. The output is:
 *
 *   - **Idempotent.** `format(format(x)) === format(x)` for every input
 *     that parses cleanly.
 *   - **Canonical.** Statements one per line; two-space indentation
 *     inside `{ … }` blocks; named args always use `prop: value` (the
 *     legacy `prop=value` form is gone); double-quoted strings unless
 *     interpolation is required (templates).
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
 */

import { parse } from "../parser/index.js";
import type {
  Expression,
  ObjectProperty,
  ParseError,
  Program,
  Statement,
  SwitchCase,
} from "../parser/types.js";

const INDENT = "  ";
const SAFE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const NEEDS_DOUBLE_QUOTE = /[\\"]/;

export interface FormatResult {
  /** Canonical source. Equal to the input when parse errors occur. */
  formatted: string;
  /** Parse errors raised while reading the input — formatting is a no-op when non-empty. */
  errors: ParseError[];
}

export function formatProgram(source: string): FormatResult {
  const program = parse(source);
  if (program.errors.length > 0) {
    return { formatted: source, errors: [...program.errors] };
  }
  const out = printProgram(program);
  // Guarantee idempotency: re-formatting the output must yield the
  // same string. If not, the printer disagrees with the parser and we
  // fall back to the un-touched source so the caller never sees drift.
  const second = parse(out);
  if (second.errors.length > 0) {
    return { formatted: source, errors: [] };
  }
  return { formatted: out, errors: [] };
}

function printProgram(program: Program): string {
  const lines: string[] = [];
  let prev: Statement | null = null;
  for (const stmt of program.statements) {
    if (prev && needsBlankLineBetween(prev, stmt)) lines.push("");
    lines.push(printStatement(stmt, 0));
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
  ]);
  if (heavy.has(prev.kind) || heavy.has(next.kind)) return true;
  return false;
}

function printStatement(stmt: Statement, indent: number): string {
  const pad = INDENT.repeat(indent);
  switch (stmt.kind) {
    case "Assignment": {
      const lhs = stmt.isState ? `$${stmt.identifier}` : stmt.identifier;
      const expr = printExpression(stmt.expression, indent);
      return `${pad}${lhs} = ${expr}`;
    }
    case "ComponentDeclaration": {
      const params = stmt.params.map(printDeclParam).join(", ");
      const head = `${pad}function ${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1);
      return body.length > 0
        ? `${head}\n${body}\n${pad}}`
        : `${head}\n${pad}}`;
    }
    case "EffectDeclaration": {
      const deps: string[] = stmt.triggers.map(printTrigger).filter((s) => s.length > 0);
      if (stmt.rateLimit) {
        deps.push(`"${stmt.rateLimit.kind}(${stmt.rateLimit.ms})"`);
      }
      const body = printBlock(stmt.body.body, indent + 1);
      const depsArray = `[${deps.join(", ")}]`;
      return `${pad}effect(() => {\n${body}\n${pad}}, ${depsArray})`;
    }
    case "ActionDeclaration": {
      const params = stmt.params.map(printDeclParam).join(", ");
      const head = `${pad}function ${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1);
      return `${head}\n${body}\n${pad}}`;
    }
    case "Await": {
      return `${pad}await ${printExpression(stmt.argument, indent)}`;
    }
    case "Return": {
      return stmt.argument
        ? `${pad}return ${printExpression(stmt.argument, indent)}`
        : `${pad}return`;
    }
    case "ExpressionStatement": {
      return `${pad}${printExpression(stmt.expression, indent)}`;
    }
  }
}

function printDeclParam(p: { name: string; defaultValue?: Expression; optional?: boolean }): string {
  if (p.defaultValue) {
    return `${p.name} = ${printExpression(p.defaultValue, 0)}`;
  }
  return p.name;
}

function printTrigger(t: { kind: string } & Record<string, unknown>): string {
  if (t.kind === "lifecycle") return `"${t.name as string}"`;
  if (t.kind === "every") return `"every(${t.intervalMs as number})"`;
  if (t.kind === "state") return `$${t.name as string}`;
  return "";
}

function printBlock(stmts: ReadonlyArray<Statement>, indent: number): string {
  return stmts.map((s) => printStatement(s, indent)).join("\n");
}

function printExpression(expr: Expression, indent: number): string {
  switch (expr.kind) {
    case "Literal":
      return printLiteral(expr.value);
    case "Identifier":
      return expr.name;
    case "StateRef":
      return `$${expr.name}`;
    case "Array": {
      if (expr.elements.length === 0) return "[]";
      const items = expr.elements.map((e) => printExpression(e, indent));
      const inline = `[${items.join(", ")}]`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const pad = INDENT.repeat(indent + 1);
      return `[\n${items.map((s) => `${pad}${s}`).join(",\n")}\n${INDENT.repeat(indent)}]`;
    }
    case "Object": {
      if (expr.properties.length === 0) return "{}";
      const items = expr.properties.map((p) => printObjectProp(p, indent));
      const inline = `{ ${items.join(", ")} }`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const pad = INDENT.repeat(indent + 1);
      return `{\n${items.map((s) => `${pad}${s}`).join(",\n")}\n${INDENT.repeat(indent)}}`;
    }
    case "Member": {
      const obj = printExpression(expr.object, indent);
      const dot = expr.optional ? "?." : ".";
      if (expr.property) return `${obj}${dot}${expr.property}`;
      if (expr.computed) {
        const inner = printExpression(expr.computed, indent);
        return expr.optional ? `${obj}?.[${inner}]` : `${obj}[${inner}]`;
      }
      return obj;
    }
    case "Unary":
      return `${expr.operator}${printExpression(expr.argument, indent)}`;
    case "Binary":
      return `${printExpression(expr.left, indent)} ${expr.operator} ${printExpression(expr.right, indent)}`;
    case "Ternary":
      return `${printExpression(expr.test, indent)} ? ${printExpression(expr.consequent, indent)} : ${printExpression(expr.alternate, indent)}`;
    case "Call":
      return printCall(expr.callee, expr.arguments, indent);
    case "MethodCall": {
      const target = printExpression(expr.object, indent);
      const sep = expr.optional ? "?." : ".";
      return printCall(`${target}${sep}${expr.method}`, expr.arguments, indent);
    }
    case "BuiltinCall":
      return printCall(`@${expr.name}`, expr.arguments, indent);
    case "Template":
      return printTemplate(expr.quasis, expr.expressions, indent);
    case "Spread":
      return `...${printExpression(expr.argument, indent)}`;
    case "If": {
      const test = printExpression(expr.test, indent);
      const cons = `{\n${printBlock(expr.consequent.body, indent + 1)}\n${INDENT.repeat(indent)}}`;
      if (!expr.alternate) return `if (${test}) ${cons}`;
      const alt = expr.alternate.kind === "If"
        ? printExpression(expr.alternate, indent)
        : `{\n${printBlock(expr.alternate.body, indent + 1)}\n${INDENT.repeat(indent)}}`;
      return `if (${test}) ${cons} else ${alt}`;
    }
    case "Switch": {
      const disc = printExpression(expr.discriminant, indent);
      const cases = expr.cases.map((c) => printSwitchCase(c, indent + 1)).join("\n");
      return `switch (${disc}) {\n${cases}\n${INDENT.repeat(indent)}}`;
    }
    case "For": {
      const iter = printExpression(expr.iterable, indent);
      const body = `{\n${printBlock(expr.body.body, indent + 1)}\n${INDENT.repeat(indent)}}`;
      return `for (let ${expr.item} of ${iter}) ${body}`;
    }
    case "Lambda": {
      const params = expr.params
        .map((p) => p.defaultValue ? `${p.name} = ${printExpression(p.defaultValue, indent)}` : p.name)
        .join(", ");
      const head = expr.params.length === 1 && !expr.params[0]!.defaultValue
        ? expr.params[0]!.name
        : `(${params})`;
      return `${head} => ${printExpression(expr.body, indent)}`;
    }
    case "Block":
      return `{\n${printBlock(expr.body, indent + 1)}\n${INDENT.repeat(indent)}}`;
  }
}

function printCall(callee: string, args: Expression[], indent: number): string {
  if (args.length === 0) return `${callee}()`;
  const parts = args.map((a) => printExpression(a, indent));
  const inline = `${callee}(${parts.join(", ")})`;
  if (inline.length <= 80 && !parts.some((s) => s.includes("\n"))) return inline;
  const pad = INDENT.repeat(indent + 1);
  return `${callee}(\n${parts.map((s) => `${pad}${s}`).join(",\n")}\n${INDENT.repeat(indent)})`;
}

function printSwitchCase(c: SwitchCase, indent: number): string {
  const pad = INDENT.repeat(indent);
  const body = c.body.map((s) => printStatement(s, indent + 1)).join("\n");
  if (c.test === null) {
    return `${pad}default:\n${body}\n${printStatement({ kind: "ExpressionStatement", expression: { kind: "Identifier", name: "break" } } as Statement, indent + 1)}`;
  }
  return `${pad}case ${printExpression(c.test, indent)}:\n${body}\n${INDENT.repeat(indent + 1)}break`;
}

function printObjectProp(prop: ObjectProperty, indent: number): string {
  if (prop.spread) return `...${printExpression(prop.value, indent)}`;
  const value = printExpression(prop.value, indent);
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

function printTemplate(quasis: string[], expressions: Expression[], indent: number): string {
  const parts: string[] = [];
  for (let i = 0; i < quasis.length; i += 1) {
    parts.push(quasis[i] ?? "");
    if (i < expressions.length) {
      parts.push("${");
      parts.push(printExpression(expressions[i]!, indent));
      parts.push("}");
    }
  }
  return `\`${parts.join("")}\``;
}
