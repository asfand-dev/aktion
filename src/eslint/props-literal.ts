import type { Rule, Scope, SourceCode } from "eslint";
import type * as ESTree from "estree";
// Type-only: erased from the build. The rule never loads `typescript` itself —
// it reads the `Program` the consumer's typescript-eslint parser already
// created, so whatever TypeScript instance that parser uses is the one called.
import type * as ts from "typescript";

/**
 * `aktion/props-literal` — the type-aware rule `aktion-runtime/eslint` ships
 * for `*.aktion.ts` / `*.aktion.js` modules.
 *
 * A library component reads its named props by SYNTAX. When the runtime binds
 * a call (`resolveLibraryCallArgs` in `src/runtime/evaluator.ts`, which asks
 * `chooseNamedBagIndex` in `src/library/types.ts`), only an object LITERAL
 * written at the call site can become the props bag; any other argument is
 * positional and fills the next unfilled slot. `Button("Go", opts)` therefore
 * binds `opts` to `onClick` — the click does nothing and `variant` is ignored.
 * Spread entries inside the literal are skipped outright (`if (prop.spread)
 * continue`), so `Button("Go", { ...extra })` sets no prop at all.
 *
 * TypeScript sees neither problem: the generated `aktion-runtime/dsl`
 * declarations type the bag as a `props` parameter, and a variable (or a
 * spread) of the right type satisfies it. So the rule asks the checker which
 * overload the call resolved to (`getResolvedSignature`), maps every argument
 * to that overload's parameter — a rest parameter absorbs every argument from
 * its own position on — and checks the arguments that land on a parameter
 * named `props`, the name the generated declarations give the bag in every
 * overload:
 *
 * - not an object literal → `propsNotLiteral`. TypeScript-only wrappers
 *   (`x as T`, `x satisfies T`, `x!`) are looked through, because the
 *   `.aktion.ts` frontend erases them before Aktion parses the module; so is
 *   the `<T>x` assertion, which that frontend rejects with its own message.
 * - an object literal with spread entries → `propsSpread`, once per spread.
 *
 * Scope, and why:
 * - Only calls whose callee is a PascalCase identifier — a component call.
 * - Only components the module graph does not declare: the callee is
 *   imported from `aktion-runtime/dsl` (library components, and host
 *   components added to that module by augmentation), or is not declared in
 *   the file at all (the ambient `aktion-runtime/dsl-globals` flavour). A
 *   component declared in the file, or imported from another module, is a
 *   USER component, and those bind a non-literal argument positionally, just
 *   as JavaScript does (`invokeComponentDecl`), so a parameter called `props`
 *   on one is not a mistake. This is the runtime's own library/user split.
 * - Arguments from the first spread argument on (`Button(...args)`) are
 *   skipped: which parameter each one reaches is not known statically.
 * - Without type information (no `parserServices.program`: no
 *   `projectService`/`project`, a non-TypeScript parser, or the `.aktion`
 *   processor's virtual blocks) the rule reports nothing.
 *
 * No autofix: turning a variable into a literal means choosing which of its
 * properties to list, and the variable may be shared, conditional or computed.
 */
export const aktionPropsLiteralRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require the props of an Aktion library component call to be an object literal written at the call site, without spreads (needs type information)",
      recommended: true,
    },
    messages: {
      propsNotLiteral:
        "Aktion only reads props from an object literal written at the call site — inline it: Button(\"Go\", { …opts }) is not supported either (spreads are dropped), so list the props.",
      propsSpread:
        "Spreads inside component props are ignored by Aktion — list the props explicitly (`{ variant: extra.variant, … }`).",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices as TypeAwareParserServices | undefined;
    const program = services?.program;
    const nodeMap = services?.esTreeNodeToTSNodeMap;
    if (!program || !nodeMap) return {};
    const checker = program.getTypeChecker();

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "Identifier" || !COMPONENT_NAME.test(callee.name)) return;
        if (isDeclaredInModuleGraph(sourceCode, callee)) return;
        const tsCall = nodeMap.get(node) as ts.CallExpression | undefined;
        if (!tsCall) return;
        const signature = checker.getResolvedSignature(tsCall);
        if (!signature) return;

        for (const [index, argument] of node.arguments.entries()) {
          if (argument.type === "SpreadElement") return;
          if (parameterAt(signature, index)?.getName() !== PROPS_PARAMETER) continue;
          const bag = withoutTypeOnlyWrappers(argument);
          if (bag.type !== "ObjectExpression") {
            context.report({ node: argument, messageId: "propsNotLiteral" });
            continue;
          }
          for (const property of bag.properties) {
            if (property.type === "SpreadElement") {
              context.report({ node: property, messageId: "propsSpread" });
            }
          }
        }
      },
    };
  },
};

/**
 * The parser services the rule reads. `@typescript-eslint/parser` fills both
 * when type information is configured; without it `program` is `null`, and
 * other parsers provide neither.
 */
interface TypeAwareParserServices {
  program?: ts.Program | null;
  esTreeNodeToTSNodeMap?: { get(node: unknown): ts.Node | undefined };
}

/** A component name: the evaluator treats a call to a capitalised name as a component call. */
const COMPONENT_NAME = /^[A-Z]/;

/** The parameter name the generated `aktion-runtime/dsl` declarations give the named-props bag. */
const PROPS_PARAMETER = "props";

/** The module whose exports are the library (and host-registered) components. */
const DSL_MODULE = "aktion-runtime/dsl";

/**
 * Wrappers that leave nothing behind once the `.aktion.ts` frontend erases the
 * types (`as`, `satisfies`, `!`), plus `<T>x`, which that frontend rejects with
 * a message of its own — reporting it here as "not a literal" would only
 * repeat that error less clearly.
 */
const TYPE_ONLY_WRAPPERS: ReadonlySet<string> = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
]);

function withoutTypeOnlyWrappers(node: ESTree.Node): ESTree.Node {
  let current = node;
  while (TYPE_ONLY_WRAPPERS.has(current.type)) {
    current = (current as unknown as { expression: ESTree.Node }).expression;
  }
  return current;
}

/**
 * The parameter of `signature` that the argument at `index` binds to: the
 * parameter at that position, or the trailing rest parameter for every
 * argument at or past its position. `undefined` for a surplus argument.
 */
function parameterAt(signature: ts.Signature, index: number): ts.Symbol | undefined {
  const parameters = signature.getParameters();
  const restIndex = parameters.length - 1;
  const last = parameters[restIndex];
  if (last !== undefined && index >= restIndex && isRestParameter(last)) return last;
  return parameters[index];
}

function isRestParameter(parameter: ts.Symbol): boolean {
  // `ParameterDeclaration.dotDotDotToken` — read structurally so the rule needs
  // no runtime `typescript` import (and no `SyntaxKind` numbers, which differ
  // between TypeScript versions).
  const declaration = parameter.valueDeclaration as { dotDotDotToken?: unknown } | undefined;
  return declaration?.dotDotDotToken !== undefined;
}

/**
 * True when the callee is bound in this file to something other than an
 * import from `aktion-runtime/dsl` — a local declaration, a parameter, or an
 * import from another module — i.e. a user component. A name with no
 * declaration in any enclosing scope is an ambient global: `false`.
 */
function isDeclaredInModuleGraph(sourceCode: SourceCode, callee: ESTree.Identifier): boolean {
  for (let scope: Scope.Scope | null = sourceCode.getScope(callee); scope; scope = scope.upper) {
    const variable = scope.set.get(callee.name);
    if (variable) return variable.defs.some((definition) => !isDslImport(definition));
  }
  return false;
}

function isDslImport(definition: Scope.Definition): boolean {
  if (definition.type !== "ImportBinding") return false;
  // typescript-eslint also files `import X = N.Y` / `import X = require(…)`
  // under "ImportBinding", with a `TSImportEqualsDeclaration` parent that has
  // no `source` — not an import from the DSL module.
  const parent = definition.parent as { source?: { value?: unknown } } | null;
  return parent?.source?.value === DSL_MODULE;
}
