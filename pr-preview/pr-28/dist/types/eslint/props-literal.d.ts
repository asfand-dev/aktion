import { Rule } from 'eslint';
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
export declare const aktionPropsLiteralRule: Rule.RuleModule;
