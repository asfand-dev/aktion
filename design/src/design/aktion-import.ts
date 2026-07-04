/**
 * Aktion program -> DesignNode tree. Powers AI generation: the LLM returns an
 * Aktion program (constrained to a single component tree with literal props),
 * which is parsed with Aktion's own parser and converted into editable canvas
 * layers. Anything that can't be represented structurally is preserved as an
 * `{ $expr }` value so nothing the model wrote is silently lost.
 *
 * Client-only (uses the aktion-runtime parser via loadAktion()).
 */
import type { DesignNode, PropValue } from "./types";
import { createNode } from "./document";
import { loadAktion, type SchemaIndex, type ComponentInfo } from "./schema";

// Minimal structural typings for the parser AST (see aktion's parser/types).
interface AstNode {
  kind: string;
  [key: string]: unknown;
}
interface CallNode extends AstNode {
  kind: "Call";
  callee: string;
  arguments: AstNode[];
}
interface ObjectPropertyNode {
  key: string;
  value: AstNode;
  spread?: boolean;
  computedKey?: AstNode;
}

export interface ImportResult {
  roots: DesignNode[];
  warnings: string[];
}

/** Strip optional markdown fences the model may add despite instructions. */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return fence ? fence[1] : trimmed;
}

export async function programToNodes(
  programText: string,
  schema: SchemaIndex,
): Promise<ImportResult> {
  const aktion = (await loadAktion()) as {
    parse: (source: string) => {
      statements: AstNode[];
      errors: Array<{ message: string; line: number }>;
    };
  };
  const warnings: string[] = [];
  const source = stripFences(programText);
  const program = aktion.parse(source);

  for (const err of program.errors.slice(0, 3)) {
    warnings.push(`Parse: ${err.message} (line ${err.line})`);
  }

  // Top-level `name = expr` bindings (non-reactive) are inlined on reference.
  const env = new Map<string, AstNode>();
  let appArgs: AstNode[] | null = null;
  let dropped = 0;

  for (const stmt of program.statements) {
    if (stmt.kind === "Assignment") {
      const isState = stmt.isState === true;
      if (isState) {
        dropped++;
        continue;
      }
      env.set(String(stmt.identifier), stmt.expression as AstNode);
      continue;
    }
    if (stmt.kind === "ExpressionStatement") {
      const expr = stmt.expression as AstNode;
      // `$app(...)` parses as Invoke{ callee: StateRef{name:"app"} } — the
      // sigil is stripped from StateRef names. Keep fallbacks for other
      // encodings so the converter survives parser evolution.
      const callee = expr.callee as AstNode | string | undefined;
      const isApp =
        (expr.kind === "Invoke" &&
          typeof callee === "object" &&
          callee?.kind === "StateRef" &&
          callee.name === "app") ||
        (expr.kind === "BuiltinCall" && (expr.name === "$app" || expr.name === "app")) ||
        (expr.kind === "Call" && (expr as CallNode).callee === "$app");
      if (isApp && !appArgs) {
        appArgs = (expr.arguments as AstNode[]) ?? [];
        continue;
      }
      dropped++;
      continue;
    }
    dropped++;
  }
  if (dropped > 0) {
    warnings.push(
      `${dropped} non-design statement${dropped === 1 ? "" : "s"} (state/effects/functions) were skipped`,
    );
  }
  if (!appArgs) {
    return { roots: [], warnings: [...warnings, "No $app(...) found in the program"] };
  }

  const ctx: ConvertContext = { schema, env, warnings, seen: new Set() };

  // $app(node) | $app([a, b]) | $app(a, b)
  const rootExprs =
    appArgs.length === 1 && appArgs[0].kind === "Array"
      ? (appArgs[0].elements as AstNode[])
      : appArgs;

  const roots: DesignNode[] = [];
  for (const expr of rootExprs) {
    const node = convertChild(expr, ctx);
    if (node) roots.push(node);
  }
  if (roots.length === 0) {
    warnings.push("The program rendered no convertible components");
  }
  return { roots, warnings };
}

interface ConvertContext {
  schema: SchemaIndex;
  env: Map<string, AstNode>;
  warnings: string[];
  /** Cycle guard for binding inlining. */
  seen: Set<string>;
}

function resolveExpr(expr: AstNode, ctx: ConvertContext): AstNode {
  let current = expr;
  const trail = new Set<string>();
  while (current.kind === "Identifier") {
    const name = String(current.name);
    if (trail.has(name)) break;
    const bound = ctx.env.get(name);
    if (!bound) break;
    trail.add(name);
    current = bound;
  }
  return current;
}

/** Convert an expression appearing in "node position" (a child slot). */
function convertChild(rawExpr: AstNode, ctx: ConvertContext): DesignNode | null {
  const expr = resolveExpr(rawExpr, ctx);

  if (expr.kind === "Call") {
    return convertCall(expr as CallNode, ctx);
  }
  if (expr.kind === "Literal") {
    const value = expr.value;
    if (value === null || value === false) return null;
    return createNode("Text", { value: String(value) }, [], "Text");
  }
  if (expr.kind === "Template") {
    return createNode("Text", { value: { $expr: printExpr(expr) } }, [], "Text");
  }
  // Anything else that renders (ternaries, member chains, ...) is preserved
  // verbatim inside a Column's node slot.
  const preserved = createNode(
    "Column",
    { children: { $expr: `[${printExpr(expr)}]` } },
    [],
    "Expression",
  );
  ctx.warnings.push(`Kept a non-literal child as an expression (${expr.kind})`);
  return preserved;
}

function convertCall(call: CallNode, ctx: ConvertContext): DesignNode | null {
  const name = call.callee;
  const info = ctx.schema.byName.get(name);
  if (!info) {
    ctx.warnings.push(`Unknown component "${name}" was skipped`);
    return null;
  }

  // Special case: HTMLTag position wrappers round-trip as free placement.
  if (name === "HTMLTag") {
    const unwrapped = unwrapPositionedHtmlTag(call, ctx);
    if (unwrapped) return unwrapped;
  }

  const node = createNode(name, {}, [], name);
  const args = call.arguments ?? [];
  const positional = info.positional;

  // Split arguments: leading positionals + optional trailing named object.
  let namedProps: ObjectPropertyNode[] | null = null;
  let positionals = args;
  const last = args[args.length - 1];
  if (last && last.kind === "Object" && !positionalObjectPayload(info, args)) {
    namedProps = last.properties as ObjectPropertyNode[];
    positionals = args.slice(0, -1);
  }

  // Positional args bind to: positional prop first, then remaining props in
  // declared order.
  const slots: string[] = [];
  if (positional) slots.push(positional.name);
  for (const p of info.props) {
    if (p.name !== positional?.name) slots.push(p.name);
  }
  positionals.forEach((arg, i) => {
    const slot = slots[i];
    if (!slot) {
      ctx.warnings.push(`Extra argument to ${name} was skipped`);
      return;
    }
    assignProp(node, info, slot, arg, ctx);
  });

  if (namedProps) {
    for (const prop of namedProps) {
      if (prop.spread || prop.computedKey) {
        ctx.warnings.push(`Dynamic props on ${name} were skipped`);
        continue;
      }
      assignProp(node, info, prop.key, prop.value as AstNode, ctx);
    }
  }

  return node;
}

/**
 * A lone object argument to a component whose positional prop is
 * object-typed is that prop's payload, not named props.
 */
function positionalObjectPayload(info: ComponentInfo, args: AstNode[]): boolean {
  if (args.length !== 1 || !info.positional) return false;
  const t = info.positional.type;
  return /object|any/i.test(t) && !/Node/.test(t);
}

function assignProp(
  node: DesignNode,
  info: ComponentInfo,
  propName: string,
  rawValue: AstNode,
  ctx: ConvertContext,
): void {
  const value = resolveExpr(rawValue, ctx);
  const spec = info.props.find((p) => p.name === propName);
  const isPositional = info.positional?.name === propName;
  const isNodeSlot = spec
    ? /Node/.test(spec.type) || (isPositional && info.positionalIsChildSlot)
    : false;

  if (isNodeSlot) {
    // Node-typed slot: arrays/calls become real children when this is the
    // positional slot; otherwise keep as an expression prop.
    if (isPositional) {
      const elements =
        value.kind === "Array" ? (value.elements as AstNode[]) : [value];
      const children = elements
        .map((el) => convertChild(el, ctx))
        .filter((n): n is DesignNode => n !== null);
      if (children.length > 0) {
        node.children = children;
        return;
      }
    }
    node.props[propName] = { $expr: printExpr(value) };
    return;
  }

  const literal = literalValue(value);
  node.props[propName] =
    literal !== UNPRINTABLE ? (literal as PropValue) : { $expr: printExpr(value) };
}

/** Sentinel for "not a pure literal". */
const UNPRINTABLE = Symbol("unprintable");

function literalValue(expr: AstNode): unknown {
  switch (expr.kind) {
    case "Literal":
      return expr.value;
    case "Array": {
      const out: unknown[] = [];
      for (const el of expr.elements as AstNode[]) {
        const v = literalValue(el);
        if (v === UNPRINTABLE) return UNPRINTABLE;
        out.push(v);
      }
      return out;
    }
    case "Object": {
      const out: Record<string, unknown> = {};
      for (const prop of (expr.properties as ObjectPropertyNode[])) {
        if (prop.spread || prop.computedKey) return UNPRINTABLE;
        const v = literalValue(prop.value as AstNode);
        if (v === UNPRINTABLE) return UNPRINTABLE;
        out[prop.key] = v;
      }
      return out;
    }
    case "Unary": {
      // Negative number literals parse as unary minus.
      const u = expr as { operator?: string; argument?: AstNode; operand?: AstNode };
      const inner = u.argument ?? u.operand;
      if (u.operator === "-" && inner) {
        const v = literalValue(inner);
        if (typeof v === "number") return -v;
      }
      return UNPRINTABLE;
    }
    default:
      return UNPRINTABLE;
  }
}

// ---------------------------------------------------------------------------
// Expression printer — AST back to Aktion source for `{ $expr }` values.
// ---------------------------------------------------------------------------

export function printExpr(expr: AstNode): string {
  switch (expr.kind) {
    case "Literal": {
      const v = expr.value;
      return typeof v === "string" ? JSON.stringify(v) : String(v);
    }
    case "Identifier":
      return String(expr.name);
    case "StateRef":
      return `$${expr.name}`;
    case "Array":
      return `[${(expr.elements as AstNode[]).map(printExpr).join(", ")}]`;
    case "Object": {
      const props = (expr.properties as ObjectPropertyNode[]).map(
        (p) => {
          if (p.spread) return `...${printExpr(p.value as AstNode)}`;
          if (p.computedKey)
            return `[${printExpr(p.computedKey as AstNode)}]: ${printExpr(p.value as AstNode)}`;
          const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.key)
            ? p.key
            : JSON.stringify(p.key);
          return `${key}: ${printExpr(p.value as AstNode)}`;
        },
      );
      return `{ ${props.join(", ")} }`;
    }
    case "Member": {
      const object = printExpr(expr.object as AstNode);
      const opt = expr.optional ? "?." : "";
      if (expr.computed) {
        return `${object}${opt ? "?." : ""}[${printExpr(expr.computed as AstNode)}]`;
      }
      return `${object}${opt || "."}${expr.property}`;
    }
    case "Unary": {
      const u = expr as { operator?: string; argument?: AstNode; operand?: AstNode };
      return `${u.operator ?? ""}${printExpr((u.argument ?? u.operand ?? expr) as AstNode)}`;
    }
    case "Binary":
      return `(${printExpr(expr.left as AstNode)} ${expr.operator} ${printExpr(expr.right as AstNode)})`;
    case "Ternary":
      return `(${printExpr(expr.condition as AstNode)} ? ${printExpr(expr.consequent as AstNode)} : ${printExpr(expr.alternate as AstNode)})`;
    case "Call":
      return `${expr.callee}(${(expr.arguments as AstNode[]).map(printExpr).join(", ")})`;
    case "BuiltinCall":
      return `${expr.name}(${(expr.arguments as AstNode[]).map(printExpr).join(", ")})`;
    case "MethodCall": {
      const opt = expr.optional ? "?." : ".";
      return `${printExpr(expr.object as AstNode)}${opt}${expr.method}(${(expr.arguments as AstNode[]).map(printExpr).join(", ")})`;
    }
    case "Invoke":
      return `(${printExpr(expr.callee as AstNode)})(${(expr.arguments as AstNode[]).map(printExpr).join(", ")})`;
    case "Template": {
      const quasis = expr.quasis as string[];
      const exprs = expr.expressions as AstNode[];
      let out = "`";
      for (let i = 0; i < quasis.length; i++) {
        out += quasis[i].replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
        if (i < exprs.length) out += `\${${printExpr(exprs[i])}}`;
      }
      return `${out}\``;
    }
    case "Lambda": {
      const params = (expr.params as Array<{ name: string; rest?: boolean }>)
        .map((p) => `${p.rest ? "..." : ""}${p.name || "_"}`)
        .join(", ");
      const body = expr.body as AstNode;
      if (body.kind === "Block") {
        // Statement bodies can't be reprinted faithfully — emit a no-op.
        return `(${params}) => {}`;
      }
      return `(${params}) => ${printExpr(body)}`;
    }
    case "Spread":
      return `...${printExpr(expr.argument as AstNode)}`;
    case "New":
      return `new (${printExpr(expr.callee as AstNode)})(${(expr.arguments as AstNode[]).map(printExpr).join(", ")})`;
    default:
      return "null";
  }
}

// ---------------------------------------------------------------------------
// HTMLTag free-placement round-trip
// ---------------------------------------------------------------------------

/**
 * Our exporter wraps freely-placed nodes in
 * `HTMLTag("div", { attributes: { style: "position: absolute; ..." }, children: [X] })`.
 * Recognize that shape (e.g. when the AI edits an exported program) and fold
 * it back into `layout` on the inner node.
 */
function unwrapPositionedHtmlTag(call: CallNode, ctx: ConvertContext): DesignNode | null {
  const args = call.arguments ?? [];
  const obj = args.find((a) => a.kind === "Object") as
    | { properties: ObjectPropertyNode[] }
    | undefined;
  if (!obj) return null;

  let style = "";
  let childrenExpr: AstNode | null = null;
  for (const prop of obj.properties) {
    if (prop.key === "attributes" && (prop.value as AstNode).kind === "Object") {
      for (const attr of ((prop.value as AstNode).properties as ObjectPropertyNode[]) ?? []) {
        if (attr.key === "style" && (attr.value as AstNode).kind === "Literal") {
          style = String((attr.value as AstNode).value ?? "");
        }
      }
    }
    if (prop.key === "children") childrenExpr = prop.value as AstNode;
  }
  if (!/position:\s*absolute/.test(style) || !childrenExpr) return null;

  const elements =
    childrenExpr.kind === "Array" ? (childrenExpr.elements as AstNode[]) : [childrenExpr];
  if (elements.length !== 1) return null;
  const inner = convertChild(elements[0], ctx);
  if (!inner) return null;

  const num = (name: string): number | undefined => {
    const m = style.match(new RegExp(`${name}:\\s*(-?\\d+(?:\\.\\d+)?)px`));
    return m ? Math.round(Number(m[1])) : undefined;
  };
  inner.layout = {
    x: num("left") ?? 0,
    y: num("top") ?? 0,
    width: num("width"),
    height: num("height"),
  };
  return inner;
}
