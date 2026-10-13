import { Rule, SourceCode } from 'eslint';
import type * as ESTree from "estree";
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
export declare const aktionPropsLiteralRule: Rule.RuleModule;
/** `node` with every TypeScript-only wrapper around it removed (see `TYPE_ONLY_WRAPPERS`). */
export declare function withoutTypeOnlyWrappers(node: ESTree.Node): ESTree.Node;
/**
 * True when the callee is bound in this file to something other than an
 * import from `aktion-runtime/dsl` — a local declaration, a parameter, or an
 * import from another module — i.e. a user component. A name with no
 * declaration in any enclosing scope is an ambient global: `false`.
 */
export declare function isDeclaredInModuleGraph(sourceCode: SourceCode, callee: ESTree.Identifier): boolean;
