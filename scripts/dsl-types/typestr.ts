/**
 * Compile a `PropSpec.type` / `ConfigKey.type` hint string — `"string | object"`,
 * `"Button[]"`, `"{x: number, y: number, label?: string}[]"`,
 * `"(MenuItem | MenuSeparator)[]"`, `"(vars) => void"` — into a TypeScript type
 * expression. The hint is parsed with the TypeScript parser as a type node and
 * its leaves are rewritten, so a hint that is not valid TypeScript as written
 * (`{label, to}`, an index signature that conflicts with a named member) still
 * produces a valid declaration.
 */
import type * as TS from "typescript";

export interface TypeStrContext {
  ts: typeof TS;
  /** Library component names: a hint naming one becomes `AktionNode<"Name">`. */
  componentNames: ReadonlySet<string>;
  /** Identifiers that resolved to nothing are recorded here (they compile to `unknown`). */
  unresolved: Set<string>;
}

export interface TypeStrOptions {
  /**
   * Widen a top-level `string` member to `string | number`. Component renderers
   * read string props through `asString`, which coerces numbers
   * (`src/library/utils.ts`), so `Text(count)` is valid at runtime.
   */
  widenString?: boolean;
}

export function compileTypeString(src: string, ctx: TypeStrContext, options: TypeStrOptions = {}): string {
  const { ts } = ctx;
  const sf = ts.createSourceFile("hint.ts", `type __Hint = ${src};`, ts.ScriptTarget.ES2022, true);
  const decl = sf.statements[0];
  const diagnostics = (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  if (!decl || !ts.isTypeAliasDeclaration(decl) || diagnostics.length > 0 || sf.statements.length !== 1) {
    ctx.unresolved.add(`<unparseable:${src}>`);
    return "unknown";
  }
  const top = topLevelMembers(decl.type, ts).map((node) => emit(node, ctx));
  if (options.widenString && top.includes("string") && !top.includes("number")) {
    top.splice(top.indexOf("string") + 1, 0, "number");
  }
  return union(top);
}

/** The members of a top-level union (parentheses unwrapped), or the node itself. */
function topLevelMembers(node: TS.TypeNode, ts: typeof TS): TS.TypeNode[] {
  if (ts.isParenthesizedTypeNode(node)) return topLevelMembers(node.type, ts);
  if (ts.isUnionTypeNode(node)) return node.types.flatMap((t) => topLevelMembers(t, ts));
  return [node];
}

/** Join union members, dropping duplicates and collapsing on `unknown`. */
function union(members: readonly string[]): string {
  const unique = [...new Set(members)];
  if (unique.includes("unknown")) return "unknown";
  return unique.join(" | ");
}

function emit(node: TS.TypeNode, ctx: TypeStrContext): string {
  const { ts } = ctx;
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword: return "string";
    case ts.SyntaxKind.NumberKeyword: return "number";
    case ts.SyntaxKind.BooleanKeyword: return "boolean";
    case ts.SyntaxKind.AnyKeyword: return "unknown";
    case ts.SyntaxKind.UnknownKeyword: return "unknown";
    case ts.SyntaxKind.ObjectKeyword: return "object";
    case ts.SyntaxKind.VoidKeyword: return "void";
    case ts.SyntaxKind.NullKeyword: return "null";
    case ts.SyntaxKind.UndefinedKeyword: return "undefined";
    case ts.SyntaxKind.LiteralType: return (node as TS.LiteralTypeNode).literal.getText();
    case ts.SyntaxKind.ParenthesizedType:
      return `(${emit((node as TS.ParenthesizedTypeNode).type, ctx)})`;
    case ts.SyntaxKind.UnionType:
      return union((node as TS.UnionTypeNode).types.map((t) => emit(t, ctx)));
    case ts.SyntaxKind.ArrayType: {
      const elem = (node as TS.ArrayTypeNode).elementType;
      // `Node[]` is the renderable-children shape: one child, arrays, nesting.
      if (ts.isTypeReferenceNode(elem) && elem.typeName.getText() === "Node") return "Children";
      const inner = emit(elem, ctx);
      const needsParens = inner.includes("|") || inner.includes("=>") || inner.startsWith("readonly ");
      return `readonly ${needsParens ? `(${inner})` : inner}[]`;
    }
    case ts.SyntaxKind.TypeLiteral: {
      const literal = node as TS.TypeLiteralNode;
      // An index signature must admit every named member's type (TS2411); the
      // hint strings are not always valid TypeScript in that respect.
      const named = literal.members
        .filter(ts.isPropertySignature)
        .map((m) => (m.type ? emit(m.type, ctx) : "unknown"));
      const members = literal.members.map((m) => {
        if (ts.isPropertySignature(m)) {
          return `${m.name.getText()}${m.questionToken ? "?" : ""}: ${m.type ? emit(m.type, ctx) : "unknown"}`;
        }
        if (ts.isIndexSignatureDeclaration(m)) {
          const param = m.parameters[0]!;
          const value = union([m.type ? emit(m.type, ctx) : "unknown", ...named]);
          return `[${param.name.getText()}: ${param.type ? emit(param.type, ctx) : "string"}]: ${value}`;
        }
        ctx.unresolved.add(`<member:${m.getText()}>`);
        return "";
      }).filter(Boolean);
      return `{ ${members.join("; ")} }`;
    }
    case ts.SyntaxKind.TypeReference: {
      const name = (node as TS.TypeReferenceNode).typeName.getText();
      if (name === "Node") return "AktionChild";
      if (name === "callable") return "Callable";
      if (ctx.componentNames.has(name)) return `AktionNode<"${name}">`;
      ctx.unresolved.add(name);
      return "unknown";
    }
    case ts.SyntaxKind.FunctionType: {
      // `(vars) => void` style hints from the config-key catalogue.
      const fn = node as TS.FunctionTypeNode;
      const params = fn.parameters.map((p) =>
        `${p.dotDotDotToken ? "..." : ""}${p.name.getText()}${p.questionToken ? "?" : ""}: ${p.type ? emit(p.type, ctx) : p.dotDotDotToken ? "any[]" : "any"}`);
      return `(${params.join(", ")}) => ${emit(fn.type, ctx)}`;
    }
    default:
      ctx.unresolved.add(`<kind:${ts.SyntaxKind[node.kind]}:${node.getText()}>`);
      return "unknown";
  }
}

/**
 * Every type-reference identifier in a type expression (or, with
 * `declaration`, in a sequence of type declarations), minus the type
 * parameters it declares itself (`<K extends …>`, mapped `[K in …]`, `infer K`).
 * Qualified names report their first segment (`Foo.Bar` → `Foo`).
 */
export function referencedTypeNames(ts: typeof TS, text: string, declaration = false): string[] {
  const sf = ts.createSourceFile("ref.ts", declaration ? text : `type __Ref = ${text};`, ts.ScriptTarget.ES2022, true);
  const refs: string[] = [];
  const own = new Set<string>(["__Ref"]);
  const visit = (node: TS.Node): void => {
    if (ts.isTypeParameterDeclaration(node)) own.add(node.name.text);
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) own.add(node.name.text);
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName;
      refs.push(ts.isIdentifier(name) ? name.text : name.getText().split(".")[0]!);
    }
    if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)) refs.push(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...new Set(refs)].filter((r) => !own.has(r));
}

/** Parse diagnostics of a type expression (or declarations): empty when it is valid TypeScript. */
export function typeSyntaxErrors(ts: typeof TS, text: string, declaration = false): string[] {
  const sf = ts.createSourceFile("check.ts", declaration ? text : `type __Check = ${text};`, ts.ScriptTarget.ES2022, true);
  const diagnostics = (sf as unknown as { parseDiagnostics?: ReadonlyArray<{ messageText: unknown }> }).parseDiagnostics ?? [];
  return diagnostics.map((d) => (typeof d.messageText === "string" ? d.messageText : JSON.stringify(d.messageText)));
}
