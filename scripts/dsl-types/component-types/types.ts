/**
 * The shape of the curated, per-component TypeScript data the generator layers
 * over each library `ComponentSpec` (see `./index.ts`).
 *
 * A `PropSpec.type` hint (`"callable"`, `"object"`, `"any[]"`) is written for
 * the system prompt and the validator; it cannot say WHAT a callback receives or
 * which keys an object prop reads. This data says it, in TypeScript, next to
 * nothing else — the runtime bundle never sees it.
 *
 * Every entry is checked when the declarations are generated:
 *   - the component and every prop named here must exist in the library;
 *   - every type expression must parse, and may only reference names the
 *     generated module declares, `lib.es2022` types, or this component's own
 *     type parameters (a DOM type would break the no-DOM flavour — use the
 *     `Dom*` bridge types from the prelude);
 *   - every support type must be named `<Component><Thing>` and declare exactly
 *     that name;
 *   - every library prop whose hint is `callable` must have a signature here,
 *     so a new event prop cannot ship as an untyped `(...args: any[]) => unknown`.
 */

export interface TypeParameter {
  /** `Row` — referenced by the prop types and support types of this component. */
  readonly name: string;
  /** The default, used when TypeScript has nothing to infer from (`Record<string, unknown>`). */
  readonly default: string;
  /** Optional `extends` constraint. The default must satisfy it. */
  readonly constraint?: string;
}

export interface ComponentTypeSpec {
  /** Type parameters of the component's call signatures (inferred from the call). */
  readonly generics?: readonly TypeParameter[];
  /**
   * Named support types (object shapes, callback payloads) this component's
   * props reference: name → the complete `export interface …` / `export type …`
   * declaration. Names must start with the component's name.
   */
  readonly types?: Readonly<Record<string, string>>;
  /** Canonical prop name → TypeScript type expression (replaces the hint-derived type). */
  readonly props?: Readonly<Record<string, string>>;
}

export type ComponentTypeTable = Readonly<Record<string, ComponentTypeSpec>>;
