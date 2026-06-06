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

  const out: SemanticToken[] = [];
  let prev: Token | undefined;

  for (const t of tokens) {
    const classified = classify(t, prev, {
      components,
      userComponents,
      userActions,
      hooks,
    });
    if (classified) {
      out.push({
        line: t.line,
        column: t.column,
        length: tokenLength(t),
        tokenType: classified.type,
        tokenModifiers: classified.modifiers,
      });
    }
    if (t.type !== "Newline") prev = t;
  }

  return out;
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
