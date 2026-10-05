/**
 * The curated component types (`scripts/dsl-types/component-types/`) against
 * the renderers they describe.
 *
 * `tests/dsl-types.test.ts` proves the generated declarations are fresh, total
 * and well-formed; it cannot prove a callback signature says what the renderer
 * passes, because that knowledge lives in the curated data, not in the
 * library. This file closes the loop statically: it walks every component's
 * `render` function, finds each `helpers.invoke(<prop>, …args)` and checks
 * the curated signature of that prop accepts exactly that call —
 *
 *   - at least as many parameters as the renderer passes arguments (an author
 *     must be able to name every value the runtime hands over), and
 *   - no more REQUIRED parameters than the renderer passes (a required
 *     parameter the runtime never fills would be `undefined` while typed as a
 *     value).
 *
 * It also pins the completeness rules the generator enforces, so they fail
 * here with a readable list instead of only inside `npm run build:dsl-types`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { COMPONENT_TYPES } from "../scripts/dsl-types/component-types/index.js";
import { defaultLibrary } from "../src/library/index.js";
import type { ComponentSpec } from "../src/library/types.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = resolve(repoRoot, "src/library/components");
const specs = new Map<string, ComponentSpec>(defaultLibrary.components.map((c) => [c.name, c]));

/** `alias → canonical` for one component, with the runtime's precedence (a canonical name always wins). */
function canonicalOf(spec: ComponentSpec, name: string): string | undefined {
  if (spec.props.some((p) => p.name === name)) return name;
  return spec.props.find((p) => p.aliases?.includes(name))?.name;
}

interface InvokeSite {
  component: string;
  prop: string;
  args: number;
  /** An argument is a spread (`...xs`): the count is a lower bound. */
  spread: boolean;
  where: string;
}

/** Every `helpers.invoke(props.X, …)` inside a library spec's `render`, resolved to its component and canonical prop. */
function invokeSites(): InvokeSite[] {
  const sites: InvokeSite[] = [];
  for (const file of readdirSync(componentsDir).filter((f) => f.endsWith(".ts"))) {
    const path = join(componentsDir, file);
    const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true);
    const functions = new Map<string, ts.FunctionLikeDeclaration>();
    const collect = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        functions.set(node.name.text, node.initializer);
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);

    const visitSpecs = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const prop = (key: string): ts.Expression | undefined => {
          const p = node.properties.find((m): m is ts.PropertyAssignment => ts.isPropertyAssignment(m) && m.name.getText(sf) === key);
          return p?.initializer;
        };
        const name = prop("name");
        const render = prop("render");
        const spec = name && ts.isStringLiteral(name) ? specs.get(name.text) : undefined;
        if (spec && render && prop("props")) {
          const fn = ts.isIdentifier(render) ? functions.get(render.text) : (ts.isArrowFunction(render) || ts.isFunctionExpression(render)) ? render : undefined;
          if (fn) scanRender(spec, fn, sf, file, sites);
        }
      }
      ts.forEachChild(node, visitSpecs);
    };
    visitSpecs(sf);
  }
  return sites;
}

function scanRender(spec: ComponentSpec, fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile, file: string, out: InvokeSite[]): void {
  const [, propsParam, helpersParam] = fn.parameters;
  if (!propsParam || !helpersParam || !ts.isIdentifier(propsParam.name) || !ts.isIdentifier(helpersParam.name)) return;
  const propsName = propsParam.name.text;
  const helpersName = helpersParam.name.text;
  // `const onChange = props.onChange` / `const { onChange } = props` — the
  // local aliases the renderer reads a callable through.
  const locals = new Map<string, string>();
  const readProp = (e: ts.Expression): string | undefined => {
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === propsName) return e.name.text;
    if (ts.isElementAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === propsName && ts.isStringLiteral(e.argumentExpression)) {
      return e.argumentExpression.text;
    }
    if (ts.isIdentifier(e)) return locals.get(e.text);
    return undefined;
  };
  const bind = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        const read = readProp(node.initializer);
        if (read) locals.set(node.name.text, read);
      } else if (ts.isObjectBindingPattern(node.name) && ts.isIdentifier(node.initializer) && node.initializer.text === propsName) {
        for (const el of node.name.elements) {
          if (!ts.isIdentifier(el.name)) continue;
          const key = el.propertyName ? el.propertyName.getText(sf) : el.name.text;
          locals.set(el.name.text, key);
        }
      }
    }
    ts.forEachChild(node, bind);
  };
  bind(fn);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "invoke" && ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === helpersName && node.arguments.length > 0) {
      const read = readProp(node.arguments[0]!);
      const prop = read ? canonicalOf(spec, read) : undefined;
      if (prop) {
        const rest = node.arguments.slice(1);
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        out.push({
          component: spec.name,
          prop,
          args: rest.filter((a) => !ts.isSpreadElement(a)).length,
          spread: rest.some((a) => ts.isSpreadElement(a)),
          where: `src/library/components/${file}:${line + 1}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
}

interface Arity { required: number; total: number }

/** Parameter counts of the function member of a curated type (`(a: X, b?: Y) => void`, possibly inside a union). */
function arityOf(typeText: string): Arity | undefined {
  const sf = ts.createSourceFile("sig.ts", `type __Sig = ${typeText};`, ts.ScriptTarget.ES2022, true);
  const decl = sf.statements[0];
  if (!decl || !ts.isTypeAliasDeclaration(decl)) return undefined;
  const find = (node: ts.TypeNode): ts.FunctionTypeNode | undefined => {
    if (ts.isFunctionTypeNode(node)) return node;
    if (ts.isParenthesizedTypeNode(node)) return find(node.type);
    if (ts.isUnionTypeNode(node)) for (const t of node.types) { const f = find(t); if (f) return f; }
    return undefined;
  };
  const fnType = find(decl.type);
  if (!fnType) return undefined;
  let required = 0;
  let total = 0;
  for (const p of fnType.parameters) {
    if (p.dotDotDotToken) return { required, total: Number.POSITIVE_INFINITY };
    total += 1;
    if (!p.questionToken) required += 1;
  }
  return { required, total };
}

const sites = invokeSites();

describe("curated component types — completeness", () => {
  it("every component and prop the curated data names exists in the library (canonical names only)", () => {
    const problems: string[] = [];
    for (const [component, entry] of Object.entries(COMPONENT_TYPES)) {
      const spec = specs.get(component);
      if (!spec) { problems.push(`${component}: not a library component`); continue; }
      for (const prop of Object.keys(entry.props ?? {})) {
        if (!spec.props.some((p) => p.name === prop)) problems.push(`${component}.${prop}: not a canonical prop`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every callable prop of every library component has a curated signature", () => {
    const missing: string[] = [];
    for (const spec of specs.values()) {
      for (const p of spec.props) {
        if (/\bcallable\b/.test(p.type) && !COMPONENT_TYPES[spec.name]?.props?.[p.name]) missing.push(`${spec.name}.${p.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every curated callable signature is a function type", () => {
    const notFunctions: string[] = [];
    for (const spec of specs.values()) {
      for (const p of spec.props) {
        const curated = COMPONENT_TYPES[spec.name]?.props?.[p.name];
        if (curated && /\bcallable\b/.test(p.type) && !arityOf(curated)) notFunctions.push(`${spec.name}.${p.name}: ${curated}`);
      }
    }
    expect(notFunctions).toEqual([]);
  });
});

describe("curated component types — the arity oracle (helpers.invoke call sites)", () => {
  it("finds the renderers' invoke call sites", () => {
    // A drop here means the scan stopped recognising the renderers' shape —
    // the checks below would then pass vacuously.
    expect(sites.length).toBeGreaterThan(150);
    expect(new Set(sites.map((s) => s.component)).size).toBeGreaterThan(100);
  });

  it("each curated signature accepts every argument list its renderer invokes it with", () => {
    const problems: string[] = [];
    for (const site of sites) {
      const curated = COMPONENT_TYPES[site.component]?.props?.[site.prop];
      if (!curated) {
        problems.push(`${site.component}.${site.prop} (${site.where}): invoked, but no curated signature`);
        continue;
      }
      const arity = arityOf(curated);
      if (!arity) {
        problems.push(`${site.component}.${site.prop} (${site.where}): invoked, but the curated type has no function member: ${curated}`);
        continue;
      }
      if (arity.total < site.args && arity.total !== Number.POSITIVE_INFINITY) {
        problems.push(`${site.component}.${site.prop} (${site.where}): the renderer passes ${site.args} argument(s), the signature names ${arity.total}: ${curated}`);
      }
      if (!site.spread && arity.required > site.args) {
        problems.push(`${site.component}.${site.prop} (${site.where}): ${arity.required} required parameter(s), but the renderer passes ${site.args}: ${curated}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
