/**
 * Schema-as-truth validation (§15).
 *
 * Walks a parsed `Program` and reports **fatal** diagnostics for:
 *
 *   - Closed-token enum mismatches (`Button("Save", { tone: "magic" })` →
 *     "magic" is not in the `tone` enum).
 *   - Unknown props (`Stack([...], { gap: "md", junk: 1 })` → no such prop).
 *
 * In Aktion 0.5 these are surfaced through `program.errors` and block
 * rendering — see `validateProgram(source, library)` for the combined
 * entry point the element calls. The goal is to give authors (and LLMs)
 * a clear signal that they are reaching outside the documented surface.
 */

import type {
  Expression,
  ParseError,
  Program,
  Statement,
} from "../parser/types.js";
import { parse } from "../parser/index.js";
import type { ComponentLibrary } from "./types.js";
import { findPositionalProp } from "./types.js";
import { findComponent } from "./registry.js";

/**
 * Combined entry point for hosts: parse the source and merge any
 * schema-level violations into `program.errors`. The element calls
 * this so the on-screen error banner surfaces *every* Aktion 0.5
 * violation, not just the syntactic ones. Returning the
 * parsed program lets the caller render the committed prefix when
 * the input still parses cleanly.
 */
export function validateProgram(
  source: string,
  library: ComponentLibrary,
): Program {
  const program = parse(source);
  const schemaErrors = validateProgramSchema(program, library);
  if (schemaErrors.length > 0) {
    program.errors = [...program.errors, ...schemaErrors];
  }
  return program;
}

/**
 * Schema-as-truth validation (§15).
 *
 * Walks a parsed `Program` and returns every Aktion 0.5
 * schema violation as a `ParseError`. In 0.5 these are **fatal** — the
 * host should merge them into `program.errors` (see
 * `validateProgram(source, library)` for the combined entry point) and
 * surface the error banner instead of rendering. There are no longer
 * any "advisory warnings" — every legacy v1 surface either:
 *
 *   - produces a parser-level migration error at parse time, or
 *   - produces a schema-validator error here when library knowledge is
 *     required (multi-positional calls, unknown props, enum mismatches,
 *     legacy Theme tokens, …).
 */
export function validateProgramSchema(
  program: Program,
  library: ComponentLibrary,
): ParseError[] {
  const errors: ParseError[] = [];
  for (const stmt of program.statements) {
    walkStatement(stmt, library, errors);
  }
  return errors;
}

function walkStatement(
  stmt: Statement,
  library: ComponentLibrary,
  out: ParseError[],
): void {
  switch (stmt.kind) {
    case "Assignment":
      walkExpression(stmt.expression, library, out);
      return;
    case "ExpressionStatement":
      walkExpression(stmt.expression, library, out);
      return;
    case "ComponentDeclaration":
    case "ActionDeclaration":
    case "EffectDeclaration":
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "Return":
      if (stmt.argument) walkExpression(stmt.argument, library, out);
      return;
    case "Await":
      walkExpression(stmt.argument, library, out);
      return;
    case "IfStatement":
      walkExpression(stmt.test, library, out);
      for (const inner of stmt.consequent.body) walkStatement(inner, library, out);
      if (stmt.alternate) {
        if (stmt.alternate.kind === "IfStatement") {
          walkStatement(stmt.alternate, library, out);
        } else {
          for (const inner of stmt.alternate.body) walkStatement(inner, library, out);
        }
      }
      return;
    case "SwitchStatement":
      walkExpression(stmt.discriminant, library, out);
      for (const c of stmt.cases) {
        if (c.test) walkExpression(c.test, library, out);
        for (const inner of c.body) walkStatement(inner, library, out);
      }
      return;
    case "ForOfStatement":
      walkExpression(stmt.iterable, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "ForClassicStatement":
      if (stmt.init) walkStatement(stmt.init, library, out);
      if (stmt.test) walkExpression(stmt.test, library, out);
      if (stmt.update) walkExpression(stmt.update, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "WhileStatement":
    case "DoWhileStatement":
      walkExpression(stmt.test, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "ForInStatement":
      walkExpression(stmt.iterable, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "DestructureStatement":
      walkExpression(stmt.expression, library, out);
      for (const binding of stmt.bindings) {
        if (binding.defaultValue) walkExpression(binding.defaultValue, library, out);
      }
      return;
    case "TryStatement":
      for (const inner of stmt.block.body) walkStatement(inner, library, out);
      if (stmt.catchBlock) for (const inner of stmt.catchBlock.body) walkStatement(inner, library, out);
      if (stmt.finallyBlock) for (const inner of stmt.finallyBlock.body) walkStatement(inner, library, out);
      return;
    case "ThrowStatement":
      walkExpression(stmt.argument, library, out);
      return;
    default:
      return;
  }
}

function walkExpression(
  expr: Expression,
  library: ComponentLibrary,
  out: ParseError[],
): void {
  if (!expr) return;
  switch (expr.kind) {
    case "Call": {
      validateCall(expr, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    }
    case "MethodCall": {
      // Method calls on namespace globals (`storage.set`, `console.log`,
      // resource bag callables like `$res.refetch()`) are validated at
      // runtime — the schema validator just walks the children.
      walkExpression(expr.object, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    }
    case "BuiltinCall": {
      // Synthetic `__rui_*` nodes only — user-facing `Util.name(...)` syntax
      // was removed. Just walk arguments.
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    }
    case "Array":
      for (const e of expr.elements) walkExpression(e, library, out);
      return;
    case "Object":
      for (const prop of expr.properties) walkExpression(prop.value, library, out);
      return;
    case "Template":
      for (const e of expr.expressions) walkExpression(e, library, out);
      return;
    case "Binary":
      walkExpression(expr.left, library, out);
      walkExpression(expr.right, library, out);
      return;
    case "Unary":
      walkExpression(expr.argument, library, out);
      return;
    case "Ternary":
      walkExpression(expr.test, library, out);
      walkExpression(expr.consequent, library, out);
      walkExpression(expr.alternate, library, out);
      return;
    case "Member":
      walkExpression(expr.object, library, out);
      if (expr.computed) walkExpression(expr.computed, library, out);
      return;
    case "Spread":
      walkExpression(expr.argument, library, out);
      return;
    case "Invoke":
      walkExpression(expr.callee, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    case "New":
      walkExpression(expr.callee, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    case "Lambda":
      if (expr.body.kind === "Block") {
        for (const inner of expr.body.body) walkStatement(inner, library, out);
      } else {
        walkExpression(expr.body, library, out);
      }
      return;
    case "Block":
      for (const inner of expr.body) walkStatement(inner, library, out);
      return;
    default:
      return;
  }
}

/**
 * Appendix-A legacy call sites. Each entry is a v1 form that the 0.5
 * surface explicitly removed (see `language-update-final.md`,
 * Appendix A). The parser accepts the *syntax* (a call expression is
 * syntactically fine), so without an explicit guard here the runtime
 * would silently render `null` and the author would have no signal
 * that the code is rejected. The error message points at the canonical
 * 0.5 replacement.
 */
const LEGACY_V1_CALLS: Record<string, string> = {
  Script:
    `Script("id", body, deps?) is not supported. Use \`effect(() => { … }, [deps])\` (see §9 — effect declarations).`,
  Action:
    `Action([@Set, @Run, …]) payloads are removed in 0.5. Use \`function name() { … }\` declarations and reference them by name (e.g. \`Button("Save", { action: save })\`) — see §10.`,
  Routes:
    `Routes(items, default?) is removed in 0.5. Use \`pages = Router({ "/": Home(), default: NotFound() })\` (see §12 — outlet-first router).`,
  Route:
    `Route(path, content) is only valid inside a v1 \`Routes(...)\` outlet, which has been removed. Use \`"/path": content\` arms inside a \`Router({ … })\` call (see §12).`,
  Query:
    `Query("name", args, placeholder, refreshSec?) is removed in 0.5. Declare a top-level \`query <Name>(args) { url, method, … }\` block and bind it with \`$query foo = <Name>(args)\` (see §11.2).`,
  Mutation:
    `Mutation("name", args) is removed in 0.5. Declare a top-level \`mutation <Name>(args) { url, method, body, … }\` block and bind it with \`$mutation save = <Name>\` (see §11.3).`,
  NavLinkRoute:
    `NavLinkRoute is removed in 0.5. Use \`NavLink(label, { to: "/path" })\` (see §12 — Outlet-first router).`,
  useInstanceState:
    `useInstanceState(...) is removed in 0.5. Declare per-instance state inside the component body with \`$state name = init\` — identity is content-addressed (§13).`,
};

function validateCall(
  expr: Extract<Expression, { kind: "Call" }>,
  library: ComponentLibrary,
  out: ParseError[],
): void {
  const legacy = LEGACY_V1_CALLS[expr.callee];
  if (legacy) {
    out.push({
      message: `${expr.callee}(...) — ${legacy}`,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0,
    });
    return;
  }
  if (expr.callee === "Theme") {
    validateThemeCall(expr, out);
    return;
  }
  const spec = findComponent(library, expr.callee);
  if (!spec) return; // User-declared or unknown — skip silently.
  const propNames = new Set<string>();
  for (const p of spec.props) {
    propNames.add(p.name);
    if (p.aliases) {
      for (const alias of p.aliases) propNames.add(alias);
    }
  }
  // Allow `key:` everywhere (content-addressed identity, §13).
  propNames.add("key");

  // Detect the named-props ObjectExpr (JS-style props: `Button("Save", { variant: "primary" })`).
  // We accept the *last* ObjectExpr in the argument list so leading
  // props (`Grid({ cols: 12 }, [children])`) and trailing props
  // (`Button("Hi", { onClick })`) both validate consistently.
  const args = expr.arguments;
  let trailingObjIdx = -1;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i]!.kind === "Object") {
      trailingObjIdx = i;
      break;
    }
  }
  const trailingObj =
    trailingObjIdx >= 0
      ? (args[trailingObjIdx] as Extract<Expression, { kind: "Object" }>)
      : null;

  const positionalArgs: Expression[] = [];
  for (let i = 0; i < args.length; i++) {
    if (i === trailingObjIdx) continue;
    positionalArgs.push(args[i]!);
  }
  if (positionalArgs.length > 1) {
    const positionalProp = findPositionalProp(spec);
    const positionalName = positionalProp?.name ?? "(none)";
    const namedNames = collectNamedPropNames(args, trailingObj);
    const extras = spec.props
      .filter((p) => p.name !== positionalName && !namedNames.has(p.name))
      .slice(0, positionalArgs.length - 1)
      .map((p) => p.name);
    const hints = extras.length > 0
      ? extras.map((n) => `${n}: …`).join(", ")
      : "use a trailing { prop: value } object";
    out.push({
      message:
        `${expr.callee}(...) — Aktion 0.5 §19.1 allows at most ` +
        `one positional argument (the "${positionalName}" prop). The extra ` +
        `${positionalArgs.length - 1} positional argument(s) must be passed ` +
        `inside a trailing object: ${hints}. Multi-positional calls are removed.`,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0,
    });
  }

  // Collect named entries from trailing Object properties.
  const namedEntries: Array<{ name: string; value: Expression; loc?: { line: number; column: number } }> = [];
  if (trailingObj) {
    for (const prop of trailingObj.properties) {
      if (prop.spread) continue;
      namedEntries.push({
        name: prop.key,
        value: prop.value,
        loc: prop.value.loc ?? trailingObj.loc,
      });
    }
  }

  for (const entry of namedEntries) {
    if (!propNames.has(entry.name)) {
      out.push({
        message: `Unknown prop "${entry.name}" on <${expr.callee}>. Known props: ${spec.props.map((p) => p.name).join(", ")}.`,
        line: entry.loc?.line ?? expr.loc?.line ?? 0,
        column: entry.loc?.column ?? expr.loc?.column ?? 0,
      });
      continue;
    }
    const prop = spec.props.find(
      (p) => p.name === entry.name || (p.aliases?.includes(entry.name) ?? false),
    );
    if (prop?.enum && entry.value.kind === "Literal" && typeof entry.value.value === "string") {
      const value = entry.value.value;
      if (!prop.enum.includes(value)) {
        out.push({
          message: `<${expr.callee}> ${entry.name}="${value}" — must be one of ${prop.enum.map((v) => `"${v}"`).join(", ")}.`,
          line: entry.loc?.line ?? expr.loc?.line ?? 0,
          column: entry.loc?.column ?? expr.loc?.column ?? 0,
        });
      }
    }
  }
}

function collectNamedPropNames(
  _args: ReadonlyArray<Expression>,
  trailingObj: Extract<Expression, { kind: "Object" }> | null,
): Set<string> {
  const names = new Set<string>();
  if (trailingObj) {
    for (const prop of trailingObj.properties) {
      if (!prop.spread) names.add(prop.key);
    }
  }
  return names;
}

/**
 * Theme token validation (§16).
 *
 * SUIS/2 only accepts the structured form:
 *
 *   Theme({ name?, direction?, colors: {...}, radius: {...},
 *           font: {...}, motion: {...}, elevation: {...} })
 *
 * Any other top-level key is either a legacy flat-shape token
 * (`colorPrimary`, `radiusMd`) or a free-form CSS variable
 * (`--color-x`). Both forms surface as advisory warnings so the runtime
 * can keep streaming partial themes without crashing.
 */
const STRUCTURED_THEME_GROUPS = new Set(["colors", "radius", "font", "motion", "elevation"]);
const THEME_METADATA_KEYS = new Set(["name", "direction"]);

function validateThemeCall(
  expr: Extract<Expression, { kind: "Call" }>,
  out: ParseError[],
): void {
  const arg = expr.arguments[0];
  if (!arg || arg.kind !== "Object") return;
  for (const prop of arg.properties) {
    if (prop.spread) continue;
    if (STRUCTURED_THEME_GROUPS.has(prop.key)) continue;
    if (THEME_METADATA_KEYS.has(prop.key)) continue;
    const suggestion = suggestStructuredKey(prop.key);
    const message = prop.key.startsWith("--")
      ? `Theme({"${prop.key}": ...}) — free-form CSS variable keys are removed in Aktion 0.5. Use the structured form: Theme({ colors: {...}, radius: {...}, font: {...} }).`
      : `Theme({${prop.key}: ...}) — legacy flat-shape token is removed in Aktion 0.5. Use ${suggestion}.`;
    out.push({
      message,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0,
    });
  }
}

function suggestStructuredKey(flatKey: string): string {
  // `colorPrimary` -> `colors: { primary: ... }`
  // `radiusMd`     -> `radius: { md: ... }`
  // `fontHeading`  -> `font: { heading: ... }`
  // `motionSlow`   -> `motion: { slow: ... }`
  // `elevation2`   -> `elevation: { 2: ... }`
  const groups: Array<{ prefix: string; group: string }> = [
    { prefix: "color", group: "colors" },
    { prefix: "radius", group: "radius" },
    { prefix: "font", group: "font" },
    { prefix: "motion", group: "motion" },
    { prefix: "elevation", group: "elevation" },
  ];
  for (const { prefix, group } of groups) {
    if (flatKey === prefix) continue;
    if (flatKey.startsWith(prefix) && flatKey.length > prefix.length) {
      const tail = flatKey.slice(prefix.length);
      const inner = tail.charAt(0).toLowerCase() + tail.slice(1);
      return `Theme({ ${group}: { ${inner}: ... } })`;
    }
  }
  return `Theme({ colors: {...}, radius: {...}, font: {...}, motion: {...}, elevation: {...} })`;
}
