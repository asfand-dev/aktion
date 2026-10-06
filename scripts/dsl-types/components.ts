/**
 * Emit the TypeScript declarations (and the manifest entries) for every
 * `ComponentSpec` in a library.
 *
 * The overloads mirror how the evaluator binds a library call
 * (`resolveLibraryCallArgs` in `src/runtime/evaluator.ts`, with
 * `chooseNamedBagIndex` / `slotForNthPositional` from `src/library/types.ts`):
 *
 *   X(k, props?)        positional #0 → the positional slot `k` (the prop marked
 *                       `positional: true`, else slot 0), plus the trailing
 *                       named-props object literal
 *   X(props)            a single all-named object — omitted for a one-prop
 *                       component whose prop accepts an object, where a lone
 *                       object is that prop's payload (chooseNamedBagIndex rule 1)
 *   X(k, s1, …, props?) positional #1.. fill the remaining slots in declaration
 *                       order (up to `maxPositionals`); the bag may not repeat a
 *                       bound slot, so it can never shift a later positional
 *   X(props?)           a component without props
 *
 * Every name a slot answers to is derived with the runtime's precedence: a
 * canonical prop name always wins its slot, an alias only binds when no
 * earlier name claimed it.
 */
import type * as TS from "typescript";
import type { ComponentSpec, PropSpec } from "../../src/library/types.js";
import type { ComponentTypeTable, TypeParameter } from "./component-types/types.js";
import { compileTypeString, type TypeStrContext } from "./typestr.js";

export interface ComponentManifestEntry {
  name: string;
  /** Prop names in declaration order — the slot order positionals fill. */
  slots: string[];
  /** Index into `slots` of the slot positional #0 binds to (`-1`: no props). */
  positional: number;
  /** Alias → canonical prop name, for every alias that reaches its slot. */
  aliases: Record<string, string>;
}

export interface ComponentEmitOptions {
  ts: typeof TS;
  components: readonly ComponentSpec[];
  findPositionalIndex: (spec: ComponentSpec) => number;
  propExpectsObject: (prop: PropSpec) => boolean;
  universalPropNames: ReadonlySet<string>;
  legacySizeAliases: Readonly<Record<string, string>>;
  spacingTokens: readonly string[];
  /** Curated per-component types: callback signatures, shapes, generics, support types. */
  componentTypes: ComponentTypeTable;
  /**
   * Fail when a prop whose hint is `callable` has no signature in
   * `componentTypes` (on in generation; the tests switch it off to measure).
   */
  requireCallableSignatures: boolean;
  /** For a component named like an ES global value: that global's constructor interface. */
  constructorInterface: (name: string) => string | undefined;
  /** ES global value names (a component may only share one when it has a constructor interface). */
  esGlobalValues: ReadonlySet<string>;
  /** Names declared by the rest of the module — enum aliases must not collide with them. */
  reservedNames: ReadonlySet<string>;
  maxPositionals: number;
}

export interface ComponentEmitResult {
  /** `export type <Enum> = …;` lines, one per distinct enum alias. */
  enumAliases: string[];
  /** Support-type declarations from `componentTypes`, in component order. */
  supportTypes: string[];
  /**
   * Every curated type expression, for the generator's reference check:
   * the text, where it came from, and the type parameters in scope.
   */
  curated: Array<{ where: string; text: string; scope: readonly string[]; declaration: boolean }>;
  /** One declaration block per component. */
  blocks: string[];
  manifest: ComponentManifestEntry[];
  /** Every top-level name the blocks declare (values and types). */
  declaredNames: string[];
  stats: {
    components: number;
    props: number;
    overloads: number;
    enumAliases: number;
    unresolvedTypeNames: Record<string, string[]>;
    overridesApplied: string[];
    hybridConstructors: string[];
    /** `Component.prop` of every callable prop without a curated signature. */
    untypedCallables: string[];
    genericComponents: string[];
  };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
/** Words a parameter name may not be (it gets a `_` suffix instead). */
export const RESERVED_WORDS: ReadonlySet<string> = new Set(
  ("break case catch class const continue debugger default delete do else enum export extends false finally for " +
    "function if import in instanceof new null return super switch this throw true try typeof var void while with " +
    "yield let static implements interface package private protected public await").split(" "),
);

/** A property key: bare when it is an identifier, quoted otherwise. */
export const propKey = (name: string): string => (IDENT.test(name) ? name : JSON.stringify(name));

/** A one-line JSDoc comment, or "" for no text. */
export function jsdoc(text: string | undefined, indent = ""): string {
  if (!text) return "";
  const body = text.replace(/\*\//g, "*\\/").replace(/\s+/g, " ").trim();
  return body ? `${indent}/** ${body} */\n` : "";
}

export const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const pascal = (s: string): string => s.replace(/(^|[-_\s])(\w)/g, (_m, _sep, c: string) => c.toUpperCase());

export function emitComponents(options: ComponentEmitOptions): ComponentEmitResult {
  const { ts } = options;
  const specs = [...options.components].sort((a, b) => byCodePoint(a.name, b.name));
  const componentNames = new Set(specs.map((s) => s.name));
  const unresolved = new Map<string, string[]>();
  const overridesApplied: string[] = [];
  const hybridConstructors: string[] = [];
  const genericComponents: string[] = [];
  const supportTypes: string[] = [];
  const declaredNames: string[] = [];
  const manifest: ComponentManifestEntry[] = [];
  const blocks: string[] = [];
  let propCount = 0;
  let overloadCount = 0;

  for (const [component, entry] of Object.entries(options.componentTypes)) {
    const spec = specs.find((s) => s.name === component);
    if (!spec) throw new Error(`emit-dsl-types: scripts/dsl-types/component-types names "${component}", which the library does not declare`);
    for (const prop of Object.keys(entry.props ?? {})) {
      const declared = spec.props.find((p) => p.name === prop);
      if (!declared) {
        const viaAlias = spec.props.find((p) => p.aliases?.includes(prop));
        throw new Error(
          `emit-dsl-types: scripts/dsl-types/component-types types "${component}.${prop}", which the library does not declare` +
            (viaAlias ? ` (it is an alias of \`${viaAlias.name}\` — type the canonical prop)` : ""),
        );
      }
    }
    for (const [typeName, declaration] of Object.entries(entry.types ?? {})) {
      if (!typeName.startsWith(component) || typeName === component) {
        throw new Error(`emit-dsl-types: support type "${typeName}" of ${component} must be named ${component}<Thing>`);
      }
      const declared = declaredTypeName(ts, declaration);
      if (declared !== typeName) {
        throw new Error(`emit-dsl-types: the support type keyed "${typeName}" (${component}) declares ${declared ? `"${declared}"` : "nothing parseable"}`);
      }
    }
    for (const g of entry.generics ?? []) {
      if (!IDENT.test(g.name) || componentNames.has(g.name)) {
        throw new Error(`emit-dsl-types: ${component} type parameter "${g.name}" is not a free identifier`);
      }
    }
  }

  // ---- enum aliases ---------------------------------------------------------
  // Named `<Component><Prop>` — stable by construction, so reordering the
  // library never renames a type a user imported. The shared spacing scale is
  // one alias (`SpacingToken`) because every gap/padding prop uses it.
  const spacing = new Set(options.spacingTokens);
  const enumDecls = new Map<string, string>(); // alias name → union text
  const taken = (name: string): boolean =>
    options.reservedNames.has(name) || componentNames.has(name) ||
    specs.some((s) => [`${s.name}Options`, `${s.name}Props`, `${s.name}Named`, `${s.name}Component`].includes(name));
  const enumUnion = (values: readonly string[]): string => {
    const all = new Set(values);
    // The validator accepts a legacy t-shirt spelling whenever its canonical
    // form is in the enum (`canonicalSizeToken`, src/library/validate.ts).
    for (const [legacy, canonical] of Object.entries(options.legacySizeAliases)) {
      if (all.has(canonical)) all.add(legacy);
    }
    return [...all].map((v) => JSON.stringify(v)).join(" | ");
  };
  const enumAlias = (spec: ComponentSpec, prop: PropSpec): string => {
    const union = enumUnion(prop.enum!);
    const isSpacing = prop.enum!.length === spacing.size && prop.enum!.every((v) => spacing.has(v));
    const base = isSpacing ? "SpacingToken" : `${spec.name}${pascal(prop.name)}`;
    for (let n = 1; ; n += 1) {
      const name = n === 1 ? base : `${base}${n}`;
      const existing = enumDecls.get(name);
      if (existing === union) return name;
      if (existing === undefined && !taken(name)) {
        enumDecls.set(name, union);
        return name;
      }
    }
  };

  const untypedCallables: string[] = [];
  const curated: ComponentEmitResult["curated"] = [];
  const propType = (spec: ComponentSpec, prop: PropSpec): string => {
    const key = `${spec.name}.${prop.name}`;
    const entry = options.componentTypes[spec.name];
    const override = entry?.props?.[prop.name];
    // The enum alias exists even when curated data replaces the prop's type:
    // the curated text may name it, and users may already import it.
    if (override && prop.enum && prop.enum.length > 0) enumAlias(spec, prop);
    if (override) {
      overridesApplied.push(key);
      curated.push({ where: key, text: override, scope: (entry.generics ?? []).map((g) => g.name), declaration: false });
      return override;
    }
    if (/\bcallable\b/.test(prop.type)) untypedCallables.push(key);
    const typeCtx: TypeStrContext = { ts, componentNames, unresolved: new Set() };
    let out: string;
    if (prop.enum && prop.enum.length > 0) {
      const alias = enumAlias(spec, prop);
      // An enum constrains the string members of the hint; an `object` member
      // of a prop documented as responsive is a breakpoint map of the same enum.
      const members = prop.type.split("|").map((s) => s.trim()).map((part) => {
        if (part === "string") return alias;
        if (part === "string[]") return `readonly ${alias}[]`;
        if (part === "object") return /responsive/i.test(prop.description ?? "") ? `Responsive<${alias}>` : "object";
        return compileTypeString(part, typeCtx);
      });
      out = [...new Set(members)].join(" | ");
    } else {
      out = compileTypeString(prop.type, typeCtx, { widenString: true });
    }
    for (const name of typeCtx.unresolved) {
      const list = unresolved.get(name) ?? [];
      list.push(key);
      unresolved.set(name, list);
    }
    return out;
  };

  for (const spec of specs) {
    const name = spec.name;
    if (options.esGlobalValues.has(name) && !options.constructorInterface(name)) {
      throw new Error(`emit-dsl-types: component "${name}" collides with a JavaScript global that has no constructor interface`);
    }
    const k = options.findPositionalIndex(spec);
    const n = spec.props.length;
    propCount += n;

    // Every name each slot answers to, with the runtime's precedence.
    const slotByName = new Map<string, number>();
    spec.props.forEach((p, i) => {
      slotByName.set(p.name, i);
      for (const alias of p.aliases ?? []) if (!slotByName.has(alias)) slotByName.set(alias, i);
    });
    const namesOf = (i: number): string[] => {
      const p = spec.props[i]!;
      return [p.name, ...(p.aliases ?? []).filter((a) => slotByName.get(a) === i)];
    };
    for (const reachable of slotByName.keys()) {
      if (reachable === "key") {
        throw new Error(`emit-dsl-types: ${name} declares a prop named "key", which the runtime strips from every named-props object`);
      }
    }
    const aliases: Record<string, string> = {};
    spec.props.forEach((p, i) => {
      for (const alias of namesOf(i).slice(1)) aliases[alias] = p.name;
    });
    manifest.push({ name, slots: spec.props.map((p) => p.name), positional: k, aliases });

    const types = spec.props.map((p) => propType(spec, p));
    // A callback prop also takes `null`: `helpers.invoke` (and every renderer's
    // `if (props.onX)` guard) treats a non-function as "no handler", so
    // `onClick: $editing ? save : null` is a real idiom. Positional slots get
    // `| null | undefined` below anyway.
    const memberTypes = spec.props.map((p, i) => (/\bcallable\b/.test(p.type) ? `${grouped(types[i]!)} | null` : types[i]!));
    const typeEntry = options.componentTypes[name];
    const generics: readonly TypeParameter[] = typeEntry?.generics ?? [];
    // `<Row = Record<string, unknown>>` on every declaration, `<Row>` on every reference.
    const tpDecl = generics.length
      ? `<${generics.map((g) => `${g.name}${g.constraint ? ` extends ${g.constraint}` : ""} = ${g.default}`).join(", ")}>`
      : "";
    const tpArgs = generics.length ? `<${generics.map((g) => g.name).join(", ")}>` : "";
    if (generics.length) genericComponents.push(name);
    for (const [typeName, declaration] of Object.entries(typeEntry?.types ?? {})) {
      supportTypes.push(declaration.trim());
      declaredNames.push(typeName);
      curated.push({ where: typeName, text: declaration, scope: [], declaration: true });
    }
    const shadowed = [...options.universalPropNames].filter((u) => slotByName.has(u)).sort(byCodePoint);
    const base = shadowed.length ? `Omit<BaseProps, ${shadowed.map((s) => JSON.stringify(s)).join(" | ")}>` : "BaseProps";

    // <Name>Options — every prop + alias, all optional.
    const lines: string[] = [];
    const required: Array<{ slot: number; names: string[]; type: string }> = [];
    spec.props.forEach((p, i) => {
      const [canonical, ...aliasNames] = namesOf(i);
      lines.push(`${jsdoc(p.description, "  ")}  ${propKey(canonical!)}?: ${memberTypes[i]};`);
      for (const alias of aliasNames) lines.push(`  /** Alias of \`${canonical}\`. */\n  ${propKey(alias)}?: ${memberTypes[i]};`);
      if (!p.optional) required.push({ slot: i, names: namesOf(i), type: types[i]! });
    });
    const options_ = `${name}Options`;
    const out: string[] = [];
    out.push(`/* ---- ${name} */`);
    out.push(`export interface ${options_}${tpDecl} extends ${base} {${lines.length ? `\n${lines.join("\n")}\n` : ""}}`);

    const requirement = (r: { names: string[]; type: string }): string =>
      r.names.length === 1
        ? `{ ${propKey(r.names[0]!)}: ${r.type} }`
        : `OneOf<${r.names.map((s) => JSON.stringify(s)).join(" | ")}, ${r.type}>`;
    const omit = (slots: readonly number[]): string =>
      `Omit<${options_}${tpArgs}, ${slots.flatMap(namesOf).map((s) => JSON.stringify(s)).join(" | ")}>`;
    out.push(`export type ${name}Props${tpDecl} = ${[options_ + tpArgs, ...required.map(requirement)].join(" & ")};`);
    declaredNames.push(options_, `${name}Props`);

    // Parameter names are cosmetic (signature help) but must be legal and unique.
    const paramNames = new Map<number, string>();
    const used = new Set<string>(["props", "namedProps"]);
    spec.props.forEach((p, i) => {
      let id = p.name.replace(/[^\w$]/g, "_");
      if (!/^[A-Za-z_$]/.test(id)) id = `_${id}`;
      if (RESERVED_WORDS.has(id)) id = `${id}_`;
      while (used.has(id)) id = `${id}_`;
      used.add(id);
      paramNames.set(i, id);
    });

    const ret = `AktionNode<"${name}">`;
    const sigs: string[] = [];
    if (k < 0) {
      sigs.push(`(props?: ${name}Props${tpArgs})`);
    } else {
      const pos = spec.props[k]!;
      const reqNamed = required.filter((r) => r.slot !== k);
      out.push(`export type ${name}Named${tpDecl} = ${[omit([k]), ...reqNamed.map(requirement)].join(" & ")};`);
      declaredNames.push(`${name}Named`);
      // A required named prop makes the bag itself required (omitting it would
      // skip the requirement); an optional positional before it then takes
      // `undefined` instead of being omittable.
      const bagRequired = reqNamed.length > 0;
      const posName = paramNames.get(k)!;
      const posParam = pos.optional
        ? bagRequired ? `${posName}: ${grouped(types[k]!)} | undefined` : `${posName}?: ${types[k]}`
        : `${posName}: ${types[k]}`;
      sigs.push(`(${posParam}, props${bagRequired ? "" : "?"}: ${name}Named${tpArgs})`);
      if (!(n === 1 && options.propExpectsObject(spec.props[0]!))) sigs.push(`(props: ${name}Props${tpArgs})`);
      // Positional runs: #0 → slot k, #1.. → the remaining slots in declaration
      // order. Each run binds exactly m slots; an optional bound slot accepts a
      // null / undefined placeholder.
      const order = [k, ...spec.props.map((_p, i) => i).filter((i) => i !== k)];
      for (let m = 2; m <= Math.min(n, options.maxPositionals); m += 1) {
        const bound = order.slice(0, m);
        const params = bound.map((i) => `${paramNames.get(i)}: ${spec.props[i]!.optional ? `${grouped(types[i]!)} | null | undefined` : types[i]}`);
        const rest = required.filter((r) => !bound.includes(r.slot)).map(requirement);
        const bag = m === n ? "" : `, props${rest.length ? "" : "?"}: ${[omit(bound), ...rest].join(" & ")}`;
        sigs.push(`(${params.join(", ")}${bag})`);
      }
    }
    overloadCount += sigs.length;

    const ctor = options.esGlobalValues.has(name) ? options.constructorInterface(name) : undefined;
    if (ctor) {
      // Also an ES global (`Map`): a call builds the component node (a library
      // component always wins a call), while `new Map()` still reaches the JS
      // constructor (`evaluateNew`) — so the binding is a callable + constructable hybrid.
      hybridConstructors.push(name);
      out.push(`export interface ${name}Component {\n${sigs.map((s) => `  ${tpDecl}${s}: ${ret};`).join("\n")}\n}`);
      out.push(`${jsdoc(spec.description)}export declare const ${name}: ${name}Component & ${ctor};`);
      declaredNames.push(`${name}Component`, name);
    } else {
      out.push(sigs.map((s, i) => `${i === 0 ? jsdoc(spec.description) : ""}export declare function ${name}${tpDecl}${s}: ${ret};`).join("\n"));
      declaredNames.push(name);
    }
    blocks.push(out.join("\n"));
  }

  const enumAliases = [...enumDecls].map(([alias, union]) => `export type ${alias} = ${union};`);
  declaredNames.push(...enumDecls.keys());
  if (options.requireCallableSignatures && untypedCallables.length > 0) {
    throw new Error(
      `emit-dsl-types: ${untypedCallables.length} callable prop(s) have no signature in scripts/dsl-types/component-types: ` +
        `${untypedCallables.join(", ")}.\n  Add \`props: { <prop>: "(…) => void" }\` with the exact arguments the renderer passes (helpers.invoke(props.<prop>, …)).`,
    );
  }
  return {
    enumAliases,
    supportTypes,
    curated,
    blocks,
    manifest,
    declaredNames,
    stats: {
      components: specs.length,
      props: propCount,
      overloads: overloadCount,
      enumAliases: enumDecls.size,
      unresolvedTypeNames: Object.fromEntries([...unresolved].sort(([a], [b]) => byCodePoint(a, b))),
      overridesApplied: [...new Set(overridesApplied)].sort(byCodePoint),
      hybridConstructors,
      untypedCallables,
      genericComponents,
    },
  };
}

/** The name a single `export interface X …` / `export type X = …` declaration declares (or undefined). */
function declaredTypeName(ts: typeof TS, declaration: string): string | undefined {
  const sf = ts.createSourceFile("support.ts", declaration, ts.ScriptTarget.ES2022, true);
  const diagnostics = (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  if (diagnostics.length > 0 || sf.statements.length !== 1) return undefined;
  const s = sf.statements[0]!;
  if (!(ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s))) return undefined;
  const exported = (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  return exported ? s.name.text : undefined;
}

/**
 * A type expression safe to extend with `| X`: a function type is wrapped in
 * parentheses, because `(a: A) => void | null` makes `null` part of the RETURN
 * type, not an alternative to the function.
 */
export function grouped(type: string): string {
  return topLevelArrow(type) ? `(${type})` : type;
}

/** Whether `=>` occurs outside every (), [], {} and <> group — i.e. the expression is (or ends in) a bare function type. */
function topLevelArrow(type: string): boolean {
  let depth = 0;
  for (let i = 0; i < type.length; i += 1) {
    const c = type[i]!;
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "=" && type[i + 1] === ">" && depth === 0) return true;
  }
  return false;
}
