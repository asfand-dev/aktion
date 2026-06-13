/**
 * Semantic tokens for Aktion.
 *
 * The TextMate grammar colours `.aktion` like TypeScript with a couple of
 * regex overlays. Semantic tokens layer *meaning* on top: a PascalCase call is
 * resolved to a real component (library vs. user-declared), a `$name` is
 * resolved to a reactive atom vs. a builtin hook/factory vs. a namespace, and
 * `.member` access is tagged as a property. Editors paint these precisely,
 * regardless of theme.
 *
 * Pure + DOM-free like the rest of the language service: returns 1-indexed
 * tokens; the host encodes them into its own (e.g. LSP relative) format.
 */

import { tokenize, type Token } from "../parser/lexer.js";
import type { ComponentLibrary } from "../library/types.js";
import { defaultLibrary } from "../library/index.js";
import { findBuiltin } from "../language/builtins.js";
import {
  isNamespaceName,
  findNamespace,
  findFactoryResource,
  factoryResourceNames,
  routeMembers,
  type NamespaceMember,
} from "../language/namespaces.js";

/** Token type legend (the host registers these in the same order). */
export const semanticTokenTypes = [
  "namespace",
  "class",
  "function",
  "variable",
  "property",
  "keyword",
  "number",
] as const;

export type SemanticTokenType = (typeof semanticTokenTypes)[number];

/** Token modifier legend (a token may carry several). */
export const semanticTokenModifiers = ["declaration", "defaultLibrary"] as const;

export type SemanticTokenModifier = (typeof semanticTokenModifiers)[number];

export interface SemanticToken {
  /** 1-indexed line. */
  line: number;
  /** 1-indexed column (start). */
  column: number;
  /** Character length of the token (includes `$` for state identifiers). */
  length: number;
  tokenType: SemanticTokenType;
  tokenModifiers: SemanticTokenModifier[];
}

/** Identifiers that act as reserved handles even though they lex as Identifier. */
const HANDLE_KEYWORDS = new Set(["route", "aktion"]);

/**
 * Classify every meaningful token in `source`. Unknown lowercase identifiers
 * (locals, params, bare globals) are intentionally left untagged so the
 * TextMate layer keeps colouring them — semantic tokens only fire where we can
 * say something the regex grammar cannot.
 */
export function getSemanticTokens(
  source: string,
  library: ComponentLibrary = defaultLibrary,
): SemanticToken[] {
  const tokens = tokenize(source);
  const components = new Set(library.components.map((c) => c.name));
  const userComponents = new Set<string>();
  const userActions = new Set<string>();
  const hooks = new Set<string>();
  collectUserDeclarations(tokens, userComponents, userActions, hooks);

  const factories = collectFactoryBindings(tokens);

  const out: SemanticToken[] = [];
  let prev: Token | undefined;
  // Tracks the receiver chain so a member after a `.` can be resolved against
  // the namespace / factory-bag / route catalogs (`$util.style.cx`,
  // `$todos.refetch`, `route.path`).
  let chain: MemberChain = null;
  let dotPending = false;
  // Bracket stack so object-literal keys (`{ variant: "primary" }`) — the props
  // of an object-style component argument — are tagged as properties, not left
  // to the generic TextMate layer.
  const brackets: BracketFrame[] = [];

  const emit = (t: Token, c: Classified): void => {
    out.push({
      line: t.line,
      column: t.column,
      length: tokenLength(t),
      tokenType: c.type,
      tokenModifiers: c.modifiers,
    });
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === "Newline") continue;

    // Maintain the bracket stack BEFORE classification so the `{` frame knows
    // whether it is an object literal (a value position) or a code block.
    if (t.type === "Punctuation" && (t.value === "(" || t.value === "[" || t.value === "{")) {
      brackets.push({ bracket: t.value, isObject: t.value === "{" && isValuePosition(prev) });
    } else if (t.type === "Punctuation" && (t.value === ")" || t.value === "]" || t.value === "}")) {
      brackets.pop();
    }

    // A `.` / `?.` keeps the chain alive and arms the next identifier as a
    // member lookup.
    if (isMemberAccess(t)) {
      dotPending = chain !== null;
      prev = t;
      continue;
    }

    // Member position: classify against the receiver's catalog.
    if (dotPending && chain && t.type === "Identifier") {
      const resolved = resolveMember(chain, t.value);
      emit(t, resolved.token);
      chain = resolved.next;
      dotPending = false;
      prev = t;
      continue;
    }

    dotPending = false;

    // Object-literal key: an identifier at the start of an entry inside an
    // object literal whose next token is `:` (`{ variant: … }`).
    if (
      t.type === "Identifier" &&
      brackets[brackets.length - 1]?.isObject &&
      isEntryStart(prev) &&
      nextMeaningful(tokens, i + 1)?.value === ":"
    ) {
      emit(t, { type: "property", modifiers: [] });
      chain = null;
      prev = t;
      continue;
    }

    // Default classification (keywords, numbers, components, state, …).
    const classified = classify(t, prev, { components, userComponents, userActions, hooks });
    if (classified) emit(t, classified);

    // Does this token START a resolvable member chain?
    chain = chainRootFor(t, factories);
    prev = t;
  }

  return out;
}

interface BracketFrame {
  bracket: "(" | "[" | "{";
  /** True for a `{` opened in a value position (object literal vs. code block). */
  isObject: boolean;
}

/**
 * A `{` immediately following an expression-position token starts an object
 * literal; one following `)` / an identifier / `}` starts a code block
 * (function / if / for body).
 */
function isValuePosition(prev: Token | undefined): boolean {
  if (!prev) return false;
  if (prev.type === "Operator") return true; // =, =>, ||, &&, …
  if (prev.type === "Keyword") return prev.value === "return";
  if (prev.type === "Punctuation") {
    // `(` / `[` / `,` (argument or element), `:` (object value), `?` (ternary).
    return prev.value === "(" || prev.value === "[" || prev.value === "," ||
      prev.value === ":" || prev.value === "?";
  }
  return false;
}

/** True when `prev` marks the start of a fresh object entry (`{` or `,`). */
function isEntryStart(prev: Token | undefined): boolean {
  return Boolean(prev && prev.type === "Punctuation" && (prev.value === "{" || prev.value === ","));
}

/** Receiver chain state used while resolving `obj.member` highlighting. */
type MemberChain =
  | { kind: "namespace"; ns: string; path: string[] }
  | { kind: "factory"; members: readonly NamespaceMember[] }
  | { kind: "route" }
  | null;

interface FactoryBindings {
  /** `$x = $http(...)` — keyed by the bare state name (`"x"`). */
  state: Map<string, string>;
  /** `x = $http(...)` — keyed by the identifier name. */
  ident: Map<string, string>;
}

/** The chain a token opens when it is a namespace builtin / factory bag / route. */
function chainRootFor(t: Token, factories: FactoryBindings): MemberChain {
  if (t.type === "StateIdentifier") {
    if (isNamespaceName(t.value)) return { kind: "namespace", ns: t.value, path: [] };
    const factory = factories.state.get(t.value);
    if (factory) {
      const entry = findFactoryResource(factory);
      if (entry) return { kind: "factory", members: entry.members };
    }
    return null;
  }
  if (t.type === "Identifier") {
    if (t.value === "route") return { kind: "route" };
    const factory = factories.ident.get(t.value);
    if (factory) {
      const entry = findFactoryResource(factory);
      if (entry) return { kind: "factory", members: entry.members };
    }
  }
  return null;
}

/** Classify a member name against a receiver chain and compute the next chain. */
function resolveMember(chain: MemberChain, name: string): { token: Classified; next: MemberChain } {
  const asProperty: Classified = { type: "property", modifiers: [] };
  if (!chain) return { token: asProperty, next: null };

  if (chain.kind === "namespace") {
    const ns = findNamespace(chain.ns);
    const path = [...chain.path, name].join(".");
    const member = ns?.members.find((m) => m.name === path);
    if (member) {
      if (member.kind === "namespace") {
        return {
          token: { type: "namespace", modifiers: ["defaultLibrary"] },
          next: { kind: "namespace", ns: chain.ns, path: [...chain.path, name] },
        };
      }
      return {
        token: {
          type: member.kind === "method" ? "function" : "property",
          modifiers: ["defaultLibrary"],
        },
        next: null,
      };
    }
    return { token: asProperty, next: null };
  }

  const members = chain.kind === "factory" ? chain.members : routeMembers;
  const member = members.find((m) => m.name === name);
  if (member) {
    return {
      token: { type: member.kind === "method" ? "function" : "property", modifiers: [] },
      next: null,
    };
  }
  return { token: asProperty, next: null };
}

/**
 * Scan the token stream for `receiver = [await] $factory(` assignments so a
 * binding's member access can resolve to the right resource bag.
 */
function collectFactoryBindings(tokens: Token[]): FactoryBindings {
  const state = new Map<string, string>();
  const ident = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (!(t.type === "Operator" && t.value === "=")) continue;
    const receiver = prevMeaningful(tokens, i - 1);
    if (!receiver) continue;
    let j = i + 1;
    let rhs = nextMeaningful(tokens, j);
    // Skip a leading `await`.
    if (rhs && rhs.type === "Keyword" && rhs.value === "await") {
      j = tokens.indexOf(rhs) + 1;
      rhs = nextMeaningful(tokens, j);
    }
    if (!rhs || rhs.type !== "StateIdentifier" || !factoryResourceNames.has(rhs.value)) continue;
    if (receiver.type === "StateIdentifier") state.set(receiver.value, rhs.value);
    else if (receiver.type === "Identifier") ident.set(receiver.value, rhs.value);
  }
  return { state, ident };
}

function prevMeaningful(tokens: Token[], from: number): Token | undefined {
  for (let i = from; i >= 0; i -= 1) {
    if (tokens[i]!.type !== "Newline") return tokens[i];
  }
  return undefined;
}

interface Scope {
  components: Set<string>;
  userComponents: Set<string>;
  userActions: Set<string>;
  hooks: Set<string>;
}

interface Classified {
  type: SemanticTokenType;
  modifiers: SemanticTokenModifier[];
}

function classify(t: Token, prev: Token | undefined, scope: Scope): Classified | null {
  if (t.type === "Keyword") return { type: "keyword", modifiers: [] };
  if (t.type === "Number") return { type: "number", modifiers: [] };

  if (t.type === "StateIdentifier") {
    const builtin = findBuiltin(t.value);
    if (builtin) {
      return {
        type: builtin.namespace ? "namespace" : "function",
        modifiers: ["defaultLibrary"],
      };
    }
    if (scope.hooks.has(t.value)) return { type: "function", modifiers: [] };
    return { type: "variable", modifiers: [] };
  }

  if (t.type === "Identifier") {
    if (HANDLE_KEYWORDS.has(t.value)) return { type: "keyword", modifiers: [] };
    // Member / method access: `obj.name` / `obj?.name`.
    if (isMemberAccess(prev)) return { type: "property", modifiers: [] };
    if (scope.components.has(t.value)) {
      return { type: "class", modifiers: ["defaultLibrary"] };
    }
    if (scope.userComponents.has(t.value)) return { type: "class", modifiers: [] };
    if (scope.userActions.has(t.value)) return { type: "function", modifiers: [] };
    // Unknown PascalCase identifier — most likely a component or constructor.
    if (/^[A-Z]/.test(t.value)) return { type: "class", modifiers: [] };
    return null;
  }

  return null;
}

function isMemberAccess(prev: Token | undefined): boolean {
  if (!prev) return false;
  return (
    (prev.type === "Punctuation" && prev.value === ".") ||
    (prev.type === "Operator" && prev.value === "?.")
  );
}

/** Lightweight pass for the names a PascalCase / camelCase `function` declares. */
function collectUserDeclarations(
  tokens: Token[],
  components: Set<string>,
  actions: Set<string>,
  hooks: Set<string>,
): void {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === "Keyword" && t.value === "function") {
      const next = nextMeaningful(tokens, i + 1);
      if (!next) continue;
      if (next.type === "StateIdentifier") hooks.add(next.value);
      else if (next.type === "Identifier") {
        if (/^[A-Z]/.test(next.value)) components.add(next.value);
        else actions.add(next.value);
      }
    }
  }
}

function nextMeaningful(tokens: Token[], from: number): Token | null {
  for (let i = from; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === "Newline") continue;
    return t;
  }
  return null;
}

function tokenLength(t: Token): number {
  return t.type === "StateIdentifier" ? t.value.length + 1 : t.value.length;
}
