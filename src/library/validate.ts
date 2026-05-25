/**
 * Schema-as-truth validation (§15).
 *
 * Walks a parsed `Program` and reports advisory diagnostics for:
 *
 *   - Closed-token enum mismatches (`Button("Save", tone: "magic")` →
 *     "magic" is not in the `tone` enum).
 *   - Unknown named args (`Stack(gap: "md", junk: 1)` → no such prop).
 *
 * The diagnostics are *warnings*, not errors — the runtime still
 * evaluates the program. Hosts may surface them as a banner or ignore
 * them entirely. The goal is to give authors (and LLMs) a clear signal
 * that they are reaching outside the documented surface.
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
      validateBuiltinCall(expr, out);
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
    case "NamedArg":
      walkExpression(expr.value, library, out);
      return;
    case "If":
      walkExpression(expr.test, library, out);
      for (const inner of expr.consequent.body) walkStatement(inner, library, out);
      if (expr.alternate) {
        if (expr.alternate.kind === "If") {
          walkExpression(expr.alternate, library, out);
        } else {
          for (const inner of expr.alternate.body) walkStatement(inner, library, out);
        }
      }
      return;
    case "Match":
      walkExpression(expr.discriminant, library, out);
      for (const arm of expr.arms) walkExpression(arm.body, library, out);
      return;
    case "For":
      walkExpression(expr.iterable, library, out);
      for (const inner of expr.body.body) walkStatement(inner, library, out);
      return;
    case "Lambda":
      // Lambda body might be an expression or a JsBlock — only walk
      // expressions; JsBlocks are opaque to schema validation.
      if ((expr.body as Expression).kind !== "JsBlock") {
        walkExpression(expr.body as Expression, library, out);
      }
      return;
    case "Bind":
      walkExpression(expr.target, library, out);
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
    `Script("id", body, deps?) is not supported. Use an \`effect [$deps] { js{ … } }\` block (see §9 — effect declarations).`,
  Action:
    `Action([@Set, @Run, …]) payloads are removed in 0.5. Use \`action <Name>() { … }\` declarations and reference them by name (e.g. \`Button("Save", action: save)\`) — see §10.`,
  Routes:
    `Routes(items, default?) is removed in 0.5. Use \`pages = _router_({ "/": Home(), default: NotFound() })\` (see §12 — outlet-first router).`,
  Route:
    `Route(path, content) is only valid inside a v1 \`Routes(...)\` outlet, which has been removed. Use \`"/path": content\` arms inside a \`_router_({ … })\` call (see §12).`,
  Query:
    `Query("name", args, placeholder, refreshSec?) is removed in 0.5. Declare a top-level \`query <Name>(args) { url, method, … }\` block and bind it with \`$query foo = <Name>(args)\` (see §11.2).`,
  Mutation:
    `Mutation("name", args) is removed in 0.5. Declare a top-level \`mutation <Name>(args) { url, method, body, … }\` block and bind it with \`$mutation save = <Name>\` (see §11.3).`,
  NavLinkRoute:
    `NavLinkRoute is removed in 0.5. Use \`NavLink(label, to: "/path")\` (see §12 — Outlet-first router).`,
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

  // Aktion 0.5 §19.1 — components allow at most one
  // positional argument (the canonical primary slot). Additional
  // positional args surface as advisory warnings naming the prop the
  // author should switch to a `prop: value` form.
  const positionalArgs: Expression[] = [];
  for (const arg of expr.arguments) {
    if (arg.kind === "NamedArg") continue;
    positionalArgs.push(arg);
  }
  if (positionalArgs.length > 1) {
    const positionalProp = findPositionalProp(spec);
    const positionalName = positionalProp?.name ?? "(none)";
    // Hint the next props the author should switch to a `prop: value` form
    // — skip the canonical positional (already filled by the first arg)
    // and any prop already consumed by a named arg.
    const namedNames = new Set(
      expr.arguments
        .filter((a): a is Extract<Expression, { kind: "NamedArg" }> => a.kind === "NamedArg")
        .map((a) => a.name),
    );
    const extras = spec.props
      .filter((p) => p.name !== positionalName && !namedNames.has(p.name))
      .slice(0, positionalArgs.length - 1)
      .map((p) => p.name);
    const hints = extras.length > 0
      ? extras.map((n) => `${n}: …`).join(", ")
      : "use named arguments";
    out.push({
      message:
        `${expr.callee}(...) — Aktion 0.5 §19.1 allows at most ` +
        `one positional argument (the "${positionalName}" prop). The extra ` +
        `${positionalArgs.length - 1} positional argument(s) must be passed ` +
        `as named arguments: ${hints}. Multi-positional calls are removed.`,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0,
    });
  }

  for (const arg of expr.arguments) {
    if (arg.kind !== "NamedArg") continue;
    if (!propNames.has(arg.name)) {
      out.push({
        message: `Unknown prop "${arg.name}" on <${expr.callee}>. Known props: ${spec.props.map((p) => p.name).join(", ")}.`,
        line: arg.loc?.line ?? expr.loc?.line ?? 0,
        column: arg.loc?.column ?? expr.loc?.column ?? 0,
      });
      continue;
    }
    const prop = spec.props.find(
      (p) => p.name === arg.name || (p.aliases?.includes(arg.name) ?? false),
    );
    if (prop?.enum && arg.value.kind === "Literal" && typeof arg.value.value === "string") {
      const value = arg.value.value;
      if (!prop.enum.includes(value)) {
        out.push({
          message: `<${expr.callee}> ${arg.name}="${value}" — must be one of ${prop.enum.map((v) => `"${v}"`).join(", ")}.`,
          line: arg.loc?.line ?? expr.loc?.line ?? 0,
          column: arg.loc?.column ?? expr.loc?.column ?? 0,
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

/**
 * Appendix-A legacy `@`-builtins. Each entry is a v1 helper that the
 * 0.5 surface explicitly removed. The parser accepts the *syntax*
 * (a `BuiltinCall` is just `@<Name>(args)`), so without an explicit
 * guard here a v1 program with e.g. `@Const(...)` would silently
 * evaluate to `null`. The error message points at the canonical 0.5
 * replacement.
 */
const LEGACY_V1_BUILTINS: Record<string, string> = {
  // Action steps (removed — actions are now `action Name() { … }` blocks).
  Set:
    `@Set($x, value) is removed in 0.5. Inside an \`action Name() { … }\` body, assign directly: \`$x = value\`.`,
  Reset:
    `@Reset($x) is removed in 0.5. Inside an \`action Name() { … }\` body, assign the default explicitly: \`$x = defaultValue\`.`,
  Run:
    `@Run(name) is removed in 0.5. Inside an \`action Name() { … }\` body, call the mutation: \`await $mutation.foo.call(args)\` (see §11.3).`,
  ToAssistant:
    `@ToAssistant("text") is removed in 0.5. Use \`emit "assistant-message" { message: "..." }\` inside an \`action Name() { … }\` body (see §22.2).`,
  OpenUrl:
    `@OpenUrl("https://…") is removed in 0.5. Inside an \`action Name() { js{ … } }\` body, call \`window.open(url, "_blank", "noopener,noreferrer")\`.`,
  Navigate:
    `@Navigate("/path") is removed in 0.5. Use \`pages = _router_({ … })\` (see §12) and navigate via the host (\`el.navigate("/path")\`), \`_route_.navigate("/path")\` from inside an action, or by linking to the path with \`NavLink(label, "/path")\`.`,
  Js:
    `@Js(body, args?) is removed in 0.5. Use \`effect <id> on $deps { js{ … } }\` or \`action Name() { js{ … } }\` (see §9, §10).`,
  // Derived-value helpers (subsumed by `$computed`).
  Const:
    `@Const(expr) is removed in 0.5. Use \`$computed name = expr\` (see §4 — state tiers).`,
  Memo:
    `@Memo(expr) is removed in 0.5. Use \`$computed name = expr\` (see §4 — state tiers).`,
  // Array helpers (subsumed by spread + builtins).
  Push:
    `@Push(arr, value) is removed in 0.5. Use spread: \`[...arr, value]\`.`,
  Concat:
    `@Concat(a, b) is removed in 0.5. Use spread: \`[...a, ...b]\`.`,
  Map:
    `@Map(arr, "field") is removed in 0.5. Use array pluck shorthand: \`arr.field\` (yields \`[arr[0].field, arr[1].field, …]\`).`,
  Take:
    `@Take(arr, n) is removed in 0.5. Use @Slice(arr, 0, n) or array shortcuts like \`arr.first\` / \`arr.last\`.`,
  // Formatters (subsumed by @Format(value, mode, {currency?, locale?, decimals?})).
  FormatCurrency:
    `@FormatCurrency(value, opts?) is removed in 0.5. Use \`@Format(value, "currency", {currency: "USD"})\`.`,
  FormatNumber:
    `@FormatNumber(value, opts?) is removed in 0.5. Use \`@Format(value, "number", {locale: "en-US"})\`.`,
  // Control-flow helpers (subsumed by expression-form if/match/for).
  Each:
    `@Each(items, "x", template) is removed in 0.5. Use the expression-form loop: \`for x in items { template }\` (see §8.3).`,
  If:
    `@If(cond, then, else?) is removed in 0.5. Use the expression-form conditional: \`if cond { then } else { else }\` (see §8.1).`,
  Switch:
    `@Switch(value, cases, default?) is removed in 0.5. Use the expression-form match: \`match value { "a" -> A() _ -> Default() }\` (see §8.2).`,
};

function validateBuiltinCall(
  expr: Extract<Expression, { kind: "BuiltinCall" }>,
  out: ParseError[],
): void {
  const legacy = LEGACY_V1_BUILTINS[expr.name];
  if (legacy) {
    out.push({
      message: `@${expr.name}(...) — ${legacy}`,
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
