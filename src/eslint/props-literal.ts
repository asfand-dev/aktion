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
 * The opposite mistake is checked too: an object literal TypeScript matched
 * to a POSITIONAL object parameter (`HTMLTag(tag, attributes, …)`) that the
 * runtime nevertheless elects as the props bag, because one of its keys is a
 * prop name (`chooseNamedBagIndex` takes the last object literal of a call of
 * two or more arguments as the bag as soon as one key is known) →
 * `objectReadAsProps`. `HTMLTag("section", { "data-x": "1", id: "a" })`
 * renders `<section id="a">`: the bag keeps `id` and drops `data-x`. A lone
 * object literal is elected the same way when the component has more than
 * one positional slot, and only when every key is a prop name when it has
 * one: `JsonTree({ id: 1, name: "x" })` reads `id` as the universal prop and
 * renders no data, although TypeScript bound the object to `data: unknown`.
 * Two lone literals stay silent: the payload of a component whose only prop
 * takes an object (the runtime never elects it), and the bag form that names
 * the slot itself and nothing else (`JsonTree({ data, expanded: true })`),
 * which the runtime binds as written.
 *
 * When no overload matches, `getResolvedSignature` still returns a signature,
 * built for the error message, and its parameters say nothing about where an
 * argument goes: TypeScript merges every overload, naming each position after
 * the first overload that has one, so in the generated declarations every
 * position after the first is called `props`. `.aktion.js` modules hit this
 * silently — without `checkJs`, `let $variant = "primary"` widens to `string`
 * and no overload of `Button("Save", save, { variant: $variant })` matches,
 * with no error shown. The rule therefore checks that the resolution is real
 * (`resolvedCleanly`) and otherwise follows the runtime instead
 * (`bagByCandidates`): an argument is the bag when an overload taking that
 * many arguments has `props` at its position and no overload has a positional
 * parameter there that would accept it, and a non-literal argument also has
 * to be a plain object sharing a key with the props.
 *
 * Scope, and why:
 * - Only calls whose callee is a PascalCase identifier — a component call.
 * - Only components the module graph does not declare: the callee is
 *   imported from `aktion-runtime/dsl` (library components, and host
 *   components added to that module by augmentation), or is not declared in
 *   the file at all (the ambient `aktion-runtime/dsl-globals` flavour). A
 *   component declared in the file, or imported from another module, is a
 *   USER component, and those bind a non-literal argument positionally, just
 *   as JavaScript does (`invokeComponentDecl`) — and every argument, object
 *   literals included, when the call is written in a `.aktion.js` /
 *   `.aktion.ts` module and the component is declared in one
 *   (`invokeComponentDeclPositionally`) — so a parameter called `props` on one
 *   is not a mistake. This is the runtime's own library/user split.
 * - An argument typed `any` is never `propsNotLiteral`. In an untyped
 *   `.aktion.js` module every parameter is `any`, which satisfies every
 *   overload, so `Button("Save", onSave)` resolves cleanly to the first one,
 *   `(label, props?)` — yet nothing says `onSave` holds props, and the runtime
 *   binds it positionally, to `onClick`. TypeScript gives an unresolved name
 *   the same flag.
 * - Arguments from the first spread argument on (`Button(...args)`) are
 *   skipped: which parameter each one reaches is not known statically. A call
 *   with a spread argument that also fails to type-check reports nothing.
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
        "Require the props of an Aktion library component call to be an object literal written at the call site, without spreads, and flag an object literal Aktion reads as props where TypeScript matched a positional parameter (needs type information)",
      recommended: true,
    },
    messages: {
      propsNotLiteral:
        "Aktion only reads props from an object literal written at the call site — inline it: Button(\"Go\", { …opts }) is not supported either (spreads are dropped), so list the props.",
      propsSpread:
        "Spreads inside component props are ignored by Aktion — list the props explicitly (`{ variant: extra.variant, … }`).",
      objectReadAsProps:
        "Aktion reads this object as the component's named props, not as its `{{parameter}}` argument, because `{{key}}` is a prop name: {{effect}}. Pass {{subject}} by name instead (`{{named}}`).",
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

        const spreadAt = node.arguments.findIndex((argument) => argument.type === "SpreadElement");
        const checked = (spreadAt < 0 ? node.arguments : node.arguments.slice(0, spreadAt)) as ESTree.Expression[];
        const tsArguments = checked.map((argument) => nodeMap.get(argument) as ts.Expression | undefined);
        if (tsArguments.some((argument) => argument === undefined)) return;
        const call: CheckedCall = {
          checker,
          tsCall,
          arguments: checked,
          tsArguments: tsArguments as ts.Expression[],
          complete: spreadAt < 0,
        };

        const clean = resolvedCleanly(call, signature);
        for (const [index, argument] of checked.entries()) {
          const bag = withoutTypeOnlyWrappers(argument);
          const isBag = clean
            ? parameterAt(signature, index)?.getName() === PROPS_PARAMETER
            : bagByCandidates(call, index, bag);
          if (!isBag) continue;
          if (bag.type !== "ObjectExpression") {
            if (isAnyTyped(call, index)) continue;
            context.report({ node: argument, messageId: "propsNotLiteral" });
            continue;
          }
          for (const property of bag.properties) {
            if (property.type === "SpreadElement") {
              context.report({ node: property, messageId: "propsSpread" });
            }
          }
        }
        if (clean) checkPositionalObject(context, call, signature);
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

/** One component call, with the arguments the rule can map (those before any spread argument). */
interface CheckedCall {
  checker: ts.TypeChecker;
  tsCall: ts.CallExpression;
  arguments: readonly ESTree.Expression[];
  tsArguments: readonly ts.Expression[];
  /** False when a spread argument hides how many arguments the call passes. */
  complete: boolean;
  /** The callee's own overloads, read once (`calleeSignatures`). */
  signatures?: readonly ts.Signature[];
  /** Every property name of every `props` parameter of those overloads (`bagPropertyNames`). */
  bagNames?: ReadonlySet<string>;
}

/** A component name: the evaluator treats a call to a capitalised name as a component call. */
const COMPONENT_NAME = /^[A-Z]/;

/** The parameter name the generated `aktion-runtime/dsl` declarations give the named-props bag. */
const PROPS_PARAMETER = "props";

/** The module whose exports are the library (and host-registered) components. */
const DSL_MODULE = "aktion-runtime/dsl";

/**
 * `ts.TypeFlags.Any`, as a number so the rule needs no runtime `typescript`
 * import. The checker sets it on `any` and on the error type of a name it
 * cannot resolve.
 */
const ANY_TYPE_FLAG = 1;

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

/** `node` with every TypeScript-only wrapper around it removed (see `TYPE_ONLY_WRAPPERS`). */
export function withoutTypeOnlyWrappers(node: ESTree.Node): ESTree.Node {
  let current = node;
  while (TYPE_ONLY_WRAPPERS.has(current.type)) {
    current = (current as unknown as { expression: ESTree.Node }).expression;
  }
  return current;
}

/**
 * True when `signature` is a real overload of the callee (or an instantiation
 * of a generic one) that every mapped argument satisfies — i.e. the call
 * type-checks and the parameter names describe where each argument goes.
 *
 * Two failure shapes are told apart from success here. With non-generic
 * overloads TypeScript returns a signature merged from all of them, whose
 * parameters come from different declarations. With generic overloads it
 * returns the first overload long enough for the call, instantiated as well as
 * it can, so the shape is real but an argument does not fit its parameter.
 * (A merged signature whose parameters all come from the first overload maps
 * arguments exactly as that overload does, so passing it through is safe.)
 */
function resolvedCleanly(call: CheckedCall, signature: ts.Signature): boolean {
  const { checker } = call;
  const declaration = signature.getDeclaration() as ts.Node | undefined;
  if (!declaration) return false;
  if (!signature.getParameters().every((parameter) => parameter.valueDeclaration?.parent === declaration)) {
    return false;
  }
  // Read defensively, like every checker method this rule needs beyond the
  // basics: on a TypeScript build without it, the shape check above is all
  // there is.
  if (typeof checker.isTypeAssignableTo !== "function") return true;
  return call.tsArguments.every((argument, index) => {
    const parameter = parameterAt(signature, index);
    return parameter !== undefined && checker.isTypeAssignableTo(checker.getTypeAtLocation(argument), slotType(call, parameter));
  });
}

/**
 * True when the argument at `index` is typed `any`: it satisfies whatever
 * parameter TypeScript puts it in, so where it landed says nothing about
 * whether it holds props.
 */
function isAnyTyped(call: CheckedCall, index: number): boolean {
  return (call.checker.getTypeAtLocation(call.tsArguments[index]!).flags & ANY_TYPE_FLAG) !== 0;
}

/**
 * The runtime's answer, read from the callee's overloads, for a call that did
 * not resolve: is the argument at `index` the props bag? Only when some
 * overload that takes this many arguments has `props` at that position, no
 * overload has a positional parameter there whose type accepts the argument,
 * and — for anything but an object literal, which the runtime may elect —
 * the argument is a plain object with at least one prop name (`looksLikeProps`):
 * a handler, a string or a node in that position is positional, as at run time.
 */
function bagByCandidates(call: CheckedCall, index: number, bag: ESTree.Node): boolean {
  const { checker } = call;
  if (!call.complete || typeof checker.isTypeAssignableTo !== "function") return false;
  const slots = calleeSignatures(call)
    .filter((signature) => acceptsArgumentCount(signature, call.arguments.length))
    .map((signature) => parameterAt(signature, index))
    .filter((parameter): parameter is ts.Symbol => parameter !== undefined);
  if (!slots.some((parameter) => parameter.getName() === PROPS_PARAMETER)) return false;
  const type = checker.getTypeAtLocation(call.tsArguments[index]!);
  const positional = slots.filter((parameter) => parameter.getName() !== PROPS_PARAMETER);
  if (positional.some((parameter) => checker.isTypeAssignableTo(type, slotType(call, parameter)))) return false;
  return bag.type === "ObjectExpression" || looksLikeProps(call, type);
}

/**
 * A type that reads as a props object rather than a positional value: every
 * non-nullish member is a non-callable, non-array object, and one of them has
 * a property the component's props declare. `any` reads as neither.
 */
function looksLikeProps(call: CheckedCall, type: ts.Type): boolean {
  const { checker } = call;
  const objectType = typeof checker.getNonPrimitiveType === "function" ? checker.getNonPrimitiveType() : undefined;
  if (!objectType || typeof checker.isArrayLikeType !== "function") return false;
  const nonNullable = checker.getNonNullableType(type);
  const members = nonNullable.isUnion() ? nonNullable.types : [nonNullable];
  const names = bagPropertyNames(call);
  return (
    members.every(
      (member) =>
        member.getCallSignatures().length === 0 &&
        !checker.isArrayLikeType(member) &&
        checker.isTypeAssignableTo(member, objectType),
    ) && members.some((member) => member.getProperties().some((property) => names.has(property.getName())))
  );
}

/**
 * Report the last object literal of a call when TypeScript matched it to a
 * positional parameter but the runtime reads it as the props bag: in a call of
 * two or more arguments, `chooseNamedBagIndex` elects the last object literal
 * as soon as one of its keys is a prop (or universal) name, keeps only those
 * keys, and binds the remaining arguments positionally from the first slot on.
 * A call's only argument is elected by the rules `electsLoneObject` restates.
 *
 * The advice names the arguments after the object too: `props` is the last
 * parameter of every overload in the generated declarations, so they have to
 * move into the bag with it (`HTMLTag("div", { attributes: { … }, children:
 * [ … ] })`).
 */
function checkPositionalObject(context: Rule.RuleContext, call: CheckedCall, signature: ts.Signature): void {
  if (!call.complete || call.arguments.length === 0) return;
  let index = -1;
  for (let i = call.arguments.length - 1; i >= 0; i -= 1) {
    if (withoutTypeOnlyWrappers(call.arguments[i]!).type === "ObjectExpression") {
      index = i;
      break;
    }
  }
  if (index < 0) return;
  const parameter = parameterAt(signature, index);
  if (!parameter || parameter.getName() === PROPS_PARAMETER) return;
  const literal = withoutTypeOnlyWrappers(call.arguments[index]!) as ESTree.ObjectExpression;
  const names = bagPropertyNames(call);
  const keys = literal.properties.flatMap((property) => (property.type === "Property" ? [propertyKey(property)] : []));
  const known = keys.find((key) => key !== null && names.has(key));
  if (known === undefined || known === null) return;
  const dropped = keys.filter((key) => key === null || !names.has(key)).map((key) => (key === null ? "[…]" : key));
  if (call.arguments.length === 1 && !electsLoneObject(call, parameter, keys, dropped.length > 0)) return;
  const effects: string[] = [];
  if (dropped.length > 0) {
    const list = dropped.map((key) => `\`${key}\``).join(", ");
    effects.push(dropped.length === 1 ? `${list} is not a prop and is dropped` : `${list} are not props and are dropped`);
  }
  if (index < call.arguments.length - 1) {
    effects.push(`the argument after it lands in \`${parameter.getName()}\` instead`);
  }
  if (effects.length === 0) effects.push(`nothing reaches \`${parameter.getName()}\``);
  const following = call.arguments.length - 1 - index;
  const subject = following === 0 ? "it" : `it, and the argument${following === 1 ? "" : "s"} after it,`;
  const entries = new Set([`${parameter.getName()}: { … }`]);
  for (let i = index + 1; i < call.arguments.length; i += 1) {
    // A later argument on a prop-named parameter moves in under that name;
    // one on `props` (or on a parameter no bag declares) brings its own keys.
    const name = parameterAt(signature, i)?.getName();
    entries.add(name !== undefined && name !== PROPS_PARAMETER && names.has(name) ? `${name}: …` : "…");
  }
  context.report({
    node: call.arguments[index]!,
    messageId: "objectReadAsProps",
    data: {
      parameter: parameter.getName(),
      key: known,
      effect: effects.join(", and "),
      subject,
      named: `{ ${[...entries].join(", ")} }`,
    },
  });
}

/**
 * `chooseNamedBagIndex`'s answer, read from the callee's overloads, for a call
 * whose ONLY argument is an object literal with at least one prop name and
 * which TypeScript bound to `parameter`, a positional one (the first overload,
 * `(data: unknown, props?)`, accepts any object):
 *
 * - a component whose only prop takes an object has no bag-only overload
 *   (`props` first), and the runtime always keeps the object as that payload;
 * - the bag form naming the slot itself, with no other key dropped
 *   (`JsonTree({ data, expanded: true })`), is bound as written: TypeScript
 *   merely tried the `(data, props?)` overload first;
 * - otherwise the runtime elects the object as soon as one key is a prop name
 *   when the component has more than one positional slot, and only when every
 *   key is one when it has a single slot.
 */
function electsLoneObject(call: CheckedCall, parameter: ts.Symbol, keys: ReadonlyArray<string | null>, dropsKeys: boolean): boolean {
  const signatures = calleeSignatures(call);
  if (!signatures.some((signature) => signature.getParameters()[0]?.getName() === PROPS_PARAMETER)) return false;
  if (!dropsKeys && keys.includes(parameter.getName())) return false;
  const slots = Math.max(
    0,
    ...signatures.map((signature) => signature.getParameters().filter((p) => p.getName() !== PROPS_PARAMETER).length),
  );
  return slots > 1 || !dropsKeys;
}

/**
 * The key the Aktion parser gives a property: an identifier's name, a string
 * or number literal's value; `null` for a computed key, which the parser
 * stores as `""` — a key no component declares.
 */
function propertyKey(property: ESTree.Property): string | null {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return null;
}

/** The callee's call signatures — its overloads, as declared. */
function calleeSignatures(call: CheckedCall): readonly ts.Signature[] {
  call.signatures ??= call.checker.getTypeAtLocation(call.tsCall.expression).getCallSignatures();
  return call.signatures;
}

/**
 * Every property name the callee's `props` parameters declare, across all of
 * its overloads. For a generated component that is each prop, its aliases,
 * `key` and the universal props (`id`, `class`, `style`, `data`, `aria`, …):
 * the names a named-props object may use, as `knownPropNames` in
 * `src/library/types.ts` counts them.
 */
function bagPropertyNames(call: CheckedCall): ReadonlySet<string> {
  if (call.bagNames) return call.bagNames;
  const names = new Set<string>();
  for (const signature of calleeSignatures(call)) {
    for (const parameter of signature.getParameters()) {
      if (parameter.getName() !== PROPS_PARAMETER) continue;
      const type = call.checker.getNonNullableType(slotType(call, parameter));
      for (const property of call.checker.getPropertiesOfType(type)) names.add(property.getName());
    }
  }
  call.bagNames = names;
  return names;
}

/** The type an argument bound to `parameter` must have: a rest parameter's element type. */
function slotType(call: CheckedCall, parameter: ts.Symbol): ts.Type {
  const { checker } = call;
  const type =
    typeof checker.getTypeOfSymbol === "function"
      ? checker.getTypeOfSymbol(parameter)
      : checker.getTypeOfSymbolAtLocation(parameter, call.tsCall);
  return isRestParameter(parameter) ? (type.getNumberIndexType() ?? type) : type;
}

/** True when a call with `count` arguments matches the arity of `signature`. */
function acceptsArgumentCount(signature: ts.Signature, count: number): boolean {
  const parameters = signature.getParameters();
  const rest = parameters.length > 0 && isRestParameter(parameters[parameters.length - 1]!);
  let required = 0;
  for (const [index, parameter] of parameters.entries()) {
    if (!isOptionalParameter(parameter)) required = index + 1;
  }
  return count >= required && (rest || count <= parameters.length);
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

/**
 * The parameter's declaration, read structurally — `ParameterDeclaration`'s
 * `dotDotDotToken`, `questionToken` and `initializer` — so the rule needs no
 * runtime `typescript` import (and no `SyntaxKind` numbers, which differ
 * between TypeScript versions).
 */
function parameterDeclaration(parameter: ts.Symbol): { dotDotDotToken?: unknown; questionToken?: unknown; initializer?: unknown } | undefined {
  return parameter.valueDeclaration as { dotDotDotToken?: unknown; questionToken?: unknown; initializer?: unknown } | undefined;
}

function isRestParameter(parameter: ts.Symbol): boolean {
  return parameterDeclaration(parameter)?.dotDotDotToken !== undefined;
}

function isOptionalParameter(parameter: ts.Symbol): boolean {
  const declaration = parameterDeclaration(parameter);
  return (
    declaration?.dotDotDotToken !== undefined ||
    declaration?.questionToken !== undefined ||
    declaration?.initializer !== undefined
  );
}

/**
 * True when the callee is bound in this file to something other than an
 * import from `aktion-runtime/dsl` — a local declaration, a parameter, or an
 * import from another module — i.e. a user component. A name with no
 * declaration in any enclosing scope is an ambient global: `false`.
 */
export function isDeclaredInModuleGraph(sourceCode: SourceCode, callee: ESTree.Identifier): boolean {
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
