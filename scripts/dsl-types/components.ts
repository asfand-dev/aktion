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
  /** Curated per-prop type overrides, keyed `"Component.prop"`. */
  overrides: Readonly<Record<string, string>>;
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
  const declaredNames: string[] = [];
  const manifest: ComponentManifestEntry[] = [];
  const blocks: string[] = [];
  let propCount = 0;
  let overloadCount = 0;

  for (const key of Object.keys(options.overrides)) {
    const [component, prop] = key.split(".");
    const spec = specs.find((s) => s.name === component);
    if (!spec || !spec.props.some((p) => p.name === prop)) {
      throw new Error(`emit-dsl-types: type override "${key}" names a prop the library does not declare`);
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

  const propType = (spec: ComponentSpec, prop: PropSpec): string => {
    const key = `${spec.name}.${prop.name}`;
    const override = options.overrides[key];
    if (override) {
      overridesApplied.push(key);
      return override;
    }
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
    const shadowed = [...options.universalPropNames].filter((u) => slotByName.has(u)).sort(byCodePoint);
    const base = shadowed.length ? `Omit<BaseProps, ${shadowed.map((s) => JSON.stringify(s)).join(" | ")}>` : "BaseProps";

    // <Name>Options — every prop + alias, all optional.
    const lines: string[] = [];
    const required: Array<{ slot: number; names: string[]; type: string }> = [];
    spec.props.forEach((p, i) => {
      const [canonical, ...aliasNames] = namesOf(i);
      lines.push(`${jsdoc(p.description, "  ")}  ${propKey(canonical!)}?: ${types[i]};`);
      for (const alias of aliasNames) lines.push(`  /** Alias of \`${canonical}\`. */\n  ${propKey(alias)}?: ${types[i]};`);
      if (!p.optional) required.push({ slot: i, names: namesOf(i), type: types[i]! });
    });
    const options_ = `${name}Options`;
    const out: string[] = [];
    out.push(`/* ---- ${name} */`);
    out.push(`export interface ${options_} extends ${base} {${lines.length ? `\n${lines.join("\n")}\n` : ""}}`);

    const requirement = (r: { names: string[]; type: string }): string =>
      r.names.length === 1
        ? `{ ${propKey(r.names[0]!)}: ${r.type} }`
        : `OneOf<${r.names.map((s) => JSON.stringify(s)).join(" | ")}, ${r.type}>`;
    const omit = (slots: readonly number[]): string =>
      `Omit<${options_}, ${slots.flatMap(namesOf).map((s) => JSON.stringify(s)).join(" | ")}>`;
    out.push(`export type ${name}Props = ${[options_, ...required.map(requirement)].join(" & ")};`);
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
      sigs.push(`(props?: ${name}Props)`);
    } else {
      const pos = spec.props[k]!;
      const reqNamed = required.filter((r) => r.slot !== k);
      out.push(`export type ${name}Named = ${[omit([k]), ...reqNamed.map(requirement)].join(" & ")};`);
      declaredNames.push(`${name}Named`);
      // A required named prop makes the bag itself required (omitting it would
      // skip the requirement); an optional positional before it then takes
      // `undefined` instead of being omittable.
      const bagRequired = reqNamed.length > 0;
      const posName = paramNames.get(k)!;
      const posParam = pos.optional
        ? bagRequired ? `${posName}: ${types[k]} | undefined` : `${posName}?: ${types[k]}`
        : `${posName}: ${types[k]}`;
      sigs.push(`(${posParam}, props${bagRequired ? "" : "?"}: ${name}Named)`);
      if (!(n === 1 && options.propExpectsObject(spec.props[0]!))) sigs.push(`(props: ${name}Props)`);
      // Positional runs: #0 → slot k, #1.. → the remaining slots in declaration
      // order. Each run binds exactly m slots; an optional bound slot accepts a
      // null / undefined placeholder.
      const order = [k, ...spec.props.map((_p, i) => i).filter((i) => i !== k)];
      for (let m = 2; m <= Math.min(n, options.maxPositionals); m += 1) {
        const bound = order.slice(0, m);
        const params = bound.map((i) => `${paramNames.get(i)}: ${types[i]}${spec.props[i]!.optional ? " | null | undefined" : ""}`);
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
      out.push(`export interface ${name}Component {\n${sigs.map((s) => `  ${s}: ${ret};`).join("\n")}\n}`);
      out.push(`${jsdoc(spec.description)}export declare const ${name}: ${name}Component & ${ctor};`);
      declaredNames.push(`${name}Component`, name);
    } else {
      out.push(sigs.map((s, i) => `${i === 0 ? jsdoc(spec.description) : ""}export declare function ${name}${s}: ${ret};`).join("\n"));
      declaredNames.push(name);
    }
    blocks.push(out.join("\n"));
  }

  const enumAliases = [...enumDecls].map(([alias, union]) => `export type ${alias} = ${union};`);
  declaredNames.push(...enumDecls.keys());
  return {
    enumAliases,
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
    },
  };
}
