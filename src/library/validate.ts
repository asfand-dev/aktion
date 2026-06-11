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
import { chooseNamedBagIndex, callArgShapes, slotForNthPositional, propExpectsObject } from "./types.js";
import { findComponent } from "./registry.js";
import { UNIVERSAL_PROP_NAMES } from "./sx.js";
import { canonicalSizeToken } from "./utils.js";

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
 *     required (positional arity overflows, unknown props, enum
 *     mismatches, built-in-name collisions, legacy Theme tokens, …).
 */
export function validateProgramSchema(
  program: Program,
  library: ComponentLibrary,
): ParseError[] {
  const errors: ParseError[] = [];
  // Calls to user-declared components are bound to the *custom* signature at
  // runtime (even when the name shadows a built-in), so they must not be
  // schema-checked against the library spec. Collected once per program;
  // validation is synchronous, so the module-level set cannot be observed
  // by a concurrent run.
  currentDeclaredComponents = collectDeclaredComponentNames(program);
  try {
    for (const stmt of program.statements) {
      walkStatement(stmt, library, errors);
    }
  } finally {
    currentDeclaredComponents = EMPTY_NAME_SET;
  }
  return errors;
}

const EMPTY_NAME_SET: ReadonlySet<string> = new Set();
let currentDeclaredComponents: ReadonlySet<string> = EMPTY_NAME_SET;

/** Deep-collect every `ComponentDeclaration` name in the program (incl. component-local ones). */
function collectDeclaredComponentNames(program: Program): Set<string> {
  const names = new Set<string>();
  const scan = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const entry of node) scan(entry);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.kind === "ComponentDeclaration" && typeof rec.name === "string") {
      names.add(rec.name);
    }
    for (const key of Object.keys(rec)) {
      if (key !== "loc") scan(rec[key]);
    }
  };
  scan(program.statements);
  return names;
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
      validateComponentDeclarationName(stmt, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "ActionDeclaration":
    case "EffectDeclaration":
    case "HookDeclaration":
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
      // `$theme({...})` is an Invoke on a StateRef — validate its token shape here.
      if (expr.callee.kind === "StateRef" && expr.callee.name === "theme") {
        validateThemeCall(expr, out);
      }
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
 * A custom component may not reuse a built-in component's name — UNLESS its
 * body calls that same name, in which case it is the supported wrapper
 * pattern: inside its own body the name resolves to the BUILT-IN (the
 * innermost call renders the library component, every outer call the custom
 * one), so the declaration extends the built-in instead of replacing it.
 */
function validateComponentDeclarationName(
  stmt: Extract<Statement, { kind: "ComponentDeclaration" }>,
  library: ComponentLibrary,
  out: ParseError[],
): void {
  if (!findComponent(library, stmt.name)) return;
  if (subtreeCallsName(stmt.body, stmt.name)) return;
  out.push({
    message:
      `function ${stmt.name}(...) — "${stmt.name}" is a built-in component name. ` +
      `Rename the custom component (e.g. "App${stmt.name}"), or call ${stmt.name}(...) ` +
      `inside the body to wrap the built-in (inside its own body the name refers ` +
      `to the built-in component).`,
    line: stmt.loc?.line ?? 0,
    column: stmt.loc?.column ?? 0,
  });
}

/**
 * Deep-scan an AST subtree for a `Call` whose callee is `name`. Generic
 * object walk (AST nodes are acyclic plain objects) so new statement /
 * expression kinds are covered automatically; `loc` subtrees are skipped.
 */
function subtreeCallsName(node: unknown, name: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((entry) => subtreeCallsName(entry, name));
  const rec = node as Record<string, unknown>;
  if (rec.kind === "Call" && rec.callee === name) return true;
  for (const key of Object.keys(rec)) {
    if (key === "loc") continue;
    if (subtreeCallsName(rec[key], name)) return true;
  }
  return false;
}

function validateCall(
  expr: Extract<Expression, { kind: "Call" }>,
  library: ComponentLibrary,
  out: ParseError[],
): void {
  // Calls that resolve to a user component declaration follow the custom
  // signature, not the library spec — skip them (the declaration itself is
  // checked by `validateComponentDeclarationName`).
  if (currentDeclaredComponents.has(expr.callee)) return;
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

  // Detect the named-props ObjectExpr with the same §19 flexible-call rules
  // the runtime uses (`chooseNamedBagIndex`): trailing object
  // (`Button("Hi", { onClick })`), leading object (`Grid({ cols: 12 },
  // [children])`), or a single all-named object (`Button({ children: "Hi" })`).
  // Object arguments destined for object-typed slots stay positional.
  const args = expr.arguments;
  const trailingObjIdx = chooseNamedBagIndex(callArgShapes(args), spec);
  const trailingObj =
    trailingObjIdx >= 0
      ? (args[trailingObjIdx] as Extract<Expression, { kind: "Object" }>)
      : null;

  const positionalArgs: Expression[] = [];
  for (let i = 0; i < args.length; i++) {
    if (i === trailingObjIdx) continue;
    positionalArgs.push(args[i]!);
  }

  // Positional arity: a call may pass at most one positional per prop slot.
  if (positionalArgs.length > spec.props.length) {
    out.push({
      message:
        `${expr.callee}(...) — takes at most ${spec.props.length} positional ` +
        `argument${spec.props.length === 1 ? "" : "s"} ` +
        `(${spec.props.map((p) => p.name).join(", ")}); got ${positionalArgs.length}.`,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0,
    });
  }

  // Positional literal checks along the runtime's slot mapping: positional
  // #0 → the positional slot, the rest → the next unfilled slots in
  // declaration order. Enum-carrying slots reject unknown literals; slots
  // that cannot accept an object reject object literals (a named-props
  // object that matched no prop name lands here — the hint points at the
  // prop list).
  positionalArgs.forEach((arg, n) => {
    const prop = slotForNthPositional(spec, n);
    if (!prop) return;
    if (prop.enum && arg.kind === "Literal" && typeof arg.value === "string") {
      const value = arg.value;
      if (!prop.enum.includes(value) && !prop.enum.includes(canonicalSizeToken(value))) {
        out.push({
          message: `<${expr.callee}> ${prop.name}="${value}" — must be one of ${prop.enum.map((v) => `"${v}"`).join(", ")}.`,
          line: arg.loc?.line ?? expr.loc?.line ?? 0,
          column: arg.loc?.column ?? expr.loc?.column ?? 0,
        });
      }
    }
    if (arg.kind === "Object" && !propExpectsObject(prop)) {
      out.push({
        message:
          `<${expr.callee}> — object passed positionally for "${prop.name}" ` +
          `(${prop.type}). Use named props from: ${spec.props.map((p) => p.name).join(", ")}.`,
        line: arg.loc?.line ?? expr.loc?.line ?? 0,
        column: arg.loc?.column ?? expr.loc?.column ?? 0,
      });
    }
  });

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
      // Universal style/behaviour channel (`sx`, `animate`, `id`, …):
      // accepted by every component at the runtime layer, so it is never
      // an "unknown prop" even when the spec declares no such slot.
      if (UNIVERSAL_PROP_NAMES.has(entry.name)) continue;
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
      // Legacy t-shirt spellings (`s`/`m`/`l`, `small`/…) stay accepted as
      // long as their canonical form is in the enum; only the canonical
      // names are advertised in the error message.
      if (!prop.enum.includes(value) && !prop.enum.includes(canonicalSizeToken(value))) {
        out.push({
          message: `<${expr.callee}> ${entry.name}="${value}" — must be one of ${prop.enum.map((v) => `"${v}"`).join(", ")}.`,
          line: entry.loc?.line ?? expr.loc?.line ?? 0,
          column: entry.loc?.column ?? expr.loc?.column ?? 0,
        });
      }
    }
  }
}


/**
 * Theme token validation (§16).
 *
 * SUIS/2 only accepts the structured form:
 *
 *   $theme({ name?, direction?, colors: {...}, radius: {...}, font: {...} })
 *
 * Any other top-level key is either a legacy flat-shape token
 * (`colorPrimary`, `radiusMd`) or a free-form CSS variable
 * (`--color-x`). Both forms surface as advisory warnings so the runtime
 * can keep streaming partial themes without crashing.
 */
const STRUCTURED_THEME_GROUPS = new Set(["colors", "radius", "font", "fonts", "spacing", "shadows", "gradients", "icons", "zIndex", "motion"]);
const THEME_METADATA_KEYS = new Set(["name", "direction"]);

function validateThemeCall(
  expr: { arguments: ReadonlyArray<Expression>; loc?: { line: number; column: number } },
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
      ? `$theme({"${prop.key}": ...}) — free-form CSS variable keys are removed in Aktion 0.5. Use the structured form: $theme({ colors: {...}, radius: {...}, font: {...} }).`
      : `$theme({${prop.key}: ...}) — legacy flat-shape token is removed in Aktion 0.5. Use ${suggestion}.`;
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
  // `fontFamily`   -> `font: { family: ... }`
  const groups: Array<{ prefix: string; group: string }> = [
    { prefix: "color", group: "colors" },
    { prefix: "radius", group: "radius" },
    { prefix: "font", group: "font" },
  ];
  for (const { prefix, group } of groups) {
    if (flatKey === prefix) continue;
    if (flatKey.startsWith(prefix) && flatKey.length > prefix.length) {
      const tail = flatKey.slice(prefix.length);
      const inner = tail.charAt(0).toLowerCase() + tail.slice(1);
      return `$theme({ ${group}: { ${inner}: ... } })`;
    }
  }
  return `$theme({ colors: {...}, radius: {...}, font: {...} })`;
}
