/**
 * Aktion 0.5 §27 — minimal in-process language service.
 *
 * Goal: ship the *data* a Language Server Protocol (LSP) implementation
 * would need — completions, diagnostics, hover info — as a pure
 * JSON-friendly API. A real LSP server can wrap these calls behind a
 * WebSocket / stdio transport; library consumers can also use them
 * directly inside in-browser editors.
 *
 * Surface
 * -------
 *
 *   - `getDiagnostics(source, library)` — every parse + schema error.
 *   - `getCompletions(source, position, library)` — component names,
 *     known prop names for the call site under the cursor, and state-tier
 *     keywords.
 *   - `getHoverInfo(source, position, library)` — the description /
 *     signature for the symbol under the cursor.
 *
 * Why a projection rather than a protocol? Transport plumbing is host-specific,
 * so the analysis stays pure here and each host adapts it: the VS Code
 * extension calls these functions in-process, the docs playground calls them
 * in-page, and `editors/lsp` wraps them in an LSP server over stdio for every
 * other editor (JetBrains, Neovim, Helix, Zed, …). One implementation, three
 * adapters — never a second parser.
 */

import { parse, collectPatternNames } from "../parser/index.js";
import type { DestructuringPattern } from "../parser/types.js";
import type { ComponentLibrary, ComponentSpec, PropSpec } from "../library/types.js";
import { findComponent } from "../library/registry.js";
import { validateProgramSchema } from "../library/validate.js";
import { suggestComponent } from "./schema.js";
import { findPositionalProp, chooseNamedBagIndex, slotForNthPositional } from "../library/types.js";
import { keywordDocs, type KeywordDoc } from "../language/grammar.js";
import { builtinCatalog, findBuiltin } from "../language/builtins.js";
import {
  isNamespaceName,
  namespaceMembersAt,
  findNamespaceMember,
  findFactoryResource,
  factoryResourceNames,
  routeMembers,
  findBuiltinConfig,
  type NamespaceMember,
  type ConfigKey,
} from "../language/namespaces.js";
import { analyseCallContext } from "./signature-help.js";

export interface Position {
  /** 1-indexed line number. */
  line: number;
  /** 1-indexed column number. */
  column: number;
}

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  /** `error` when the program will not render; `warning` is reserved for the future. */
  severity: "error" | "warning";
}

export interface CompletionItem {
  /** Insertion text (the user types this to accept). */
  label: string;
  /**
   * What kind of symbol this is. Useful when the host wants to render
   * different icons per kind (LSP / editor UIs typically display these).
   */
  kind:
    | "component"
    | "prop"
    | "state"
    | "builtin"
    | "keyword";
  /** Short textual description. */
  detail?: string;
  /** Long-form documentation surfaced in a tooltip. */
  documentation?: string;
}

export interface HoverInfo {
  /** Markdown-friendly text rendered in the hover popup. */
  contents: string;
  /** Symbol kind for clients that prefer typed surfaces. */
  kind: "component" | "prop" | "state" | "builtin" | "unknown";
}

const KEYWORDS: ReadonlyArray<{ label: string; detail: string }> = [
  { label: "function",     detail: "Declare a component or action — either case works" },
  { label: "$effect",      detail: "Reactive side-effect: $effect(() => { ... }, [deps])" },
  { label: "$router",      detail: "pages = $router({ '/': Home(), default: NotFound() })" },
  { label: "switch",       detail: "switch (value) { case …: …; break; default: … }" },
  { label: "for",          detail: "for (let x of xs) { … }" },
  { label: "if",           detail: "if (condition) { … } else { … }" },
  { label: "return",       detail: "Return value from a component or action" },
  { label: "let",          detail: "Declare a variable (reactive if $-prefixed)" },
  { label: "const",        detail: "Declare a constant" },
  { label: "$emit",        detail: "$emit('name', detail) — dispatch a CustomEvent" },
  { label: "cleanup",      detail: "Register an effect teardown callback" },
];

/**
 * Combine parse-level + schema-level diagnostics into one list. Every
 * entry has a `severity` field so editors can theme errors vs warnings
 * (in 0.5 every entry is currently `error` — there are no soft
 * warnings — but the surface stays future-proof).
 */
export function getDiagnostics(
  source: string,
  library: ComponentLibrary,
): Diagnostic[] {
  const program = parse(source);
  const schemaErrors = validateProgramSchema(program, library);
  return [
    ...program.errors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: "error" as const,
    })),
    ...schemaErrors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: "error" as const,
    })),
    // Render-time lint warnings (issue #8). These don't block rendering but
    // flag silent footguns the schema validator can't see. Editors theme them
    // by `severity`. Kept narrow + precise to avoid false positives — the
    // worst silent bugs (#1 scope leak, #2 placeholder stripping, #3 Date
    // compares, #5 unicode escapes) are now fixed in the runtime, so linting
    // them would flag correct code.
    ...lintProgram(program, library),
  ];
}

/**
 * Static lint warnings for patterns the schema validator cannot flag. On by
 * default inside `getDiagnostics`; also exported standalone for hosts that want
 * only the soft warnings. Currently:
 *
 *   - `unknown-component` — a PascalCase call (`Cardd(...)`) that is neither a
 *     library component nor anything this document declares or imports.
 *     Requires `library`; skipped when it is omitted.
 *   - `shadowed-i18n` — a `function` / lambda parameter or `for…of` / `for…in`
 *     loop variable named the same as a binding destructured from `$i18n(...)`
 *     (typically `t`). Inside that scope the name resolves to the local, so a
 *     `t("key")` call quietly invokes the loop item instead of the translator.
 *     Only fires when `$i18n` is actually destructured in the program, so a
 *     plain `arr.map(t => …)` elsewhere is never flagged.
 */
export function getLintWarnings(source: string, library?: ComponentLibrary): Diagnostic[] {
  return lintProgram(parse(source), library);
}

function lintProgram(
  program: ReturnType<typeof parse>,
  library?: ComponentLibrary,
): Diagnostic[] {
  return [
    ...(library ? lintUnknownComponents(program, library) : []),
    ...lintShadowedI18n(program),
  ];
}

function lintShadowedI18n(program: ReturnType<typeof parse>): Diagnostic[] {
  const protectedNames = collectI18nBindingNames(program);
  if (protectedNames.size === 0) return [];

  const warnings: Diagnostic[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    const rec = node as Record<string, unknown> & { kind?: string; loc?: Position };
    const loc = rec.loc;
    const flag = (name: unknown, what: string): void => {
      if (typeof name !== "string" || !protectedNames.has(name)) return;
      const line = loc?.line ?? 0;
      const column = loc?.column ?? 0;
      const key = `${name}:${line}:${column}:${what}`;
      if (seen.has(key)) return;
      seen.add(key);
      warnings.push({
        line,
        column,
        severity: "warning",
        message:
          `${what} "${name}" shadows the i18n binding from $i18n(...). Inside this scope ` +
          `"${name}(...)" calls the ${what}, not the translator — rename it (e.g. "item").`,
      });
    };
    switch (rec.kind) {
      case "Lambda":
      case "ComponentDeclaration":
      case "ActionDeclaration":
      case "HookDeclaration":
        for (const p of (rec.params as Array<{ name?: unknown }> | undefined) ?? []) flag(p.name, "parameter");
        break;
      case "ForOfStatement": {
        const pat = rec.pattern as DestructuringPattern | undefined;
        if (pat) {
          for (const name of collectPatternNames(pat)) flag(name, "loop variable");
        } else {
          flag(rec.item, "loop variable");
        }
        break;
      }
      case "ForInStatement":
        flag(rec.item, "loop variable");
        break;
    }
    for (const key of Object.keys(rec)) {
      if (key !== "loc") visit(rec[key]);
    }
  };
  visit(program.statements);
  return warnings;
}

/* -------------------------------------------------------------------------- */
/*  `unknown-component` lint                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Host/JS constructors and callables an author may legitimately invoke with a
 * PascalCase bare name. Without this list, ordinary JavaScript (`Date.now()`
 * is a MethodCall and safe, but `new Date()`/`Number(x)`/`Promise.all` style
 * bare calls like `Number(x)` / `String(v)` / `BigInt(n)` are plain `Call`s)
 * would be flagged as hallucinated components.
 */
const JS_GLOBAL_CALLABLES: ReadonlySet<string> = new Set([
  // Type coercion / value constructors (called bare, without `new`)
  "Array", "BigInt", "Boolean", "Number", "Object", "String", "Symbol",
  // Namespaces occasionally called or shadow-checked
  "Date", "Error", "Function", "JSON", "Map", "Math", "Promise", "Proxy",
  "RangeError", "Reflect", "RegExp", "Set", "TypeError", "WeakMap", "WeakSet",
  // Web platform constructors reachable from an action body
  "AbortController", "Blob", "CustomEvent", "DOMParser", "Event", "EventSource",
  "File", "FormData", "Headers", "Image", "Intl", "IntersectionObserver",
  "MutationObserver", "Notification", "Request", "Response", "ResizeObserver",
  "TextDecoder", "TextEncoder", "URL", "URLSearchParams", "WebSocket", "Worker",
]);

/**
 * `unknown-component` — flag `Cardd([...])` when no such component exists.
 *
 * This is the single most common defect in LLM-authored Aktion: a plausible but
 * non-existent component name. The schema validator deliberately cannot report
 * it, because from its point of view `Panel("x")` (the author's own
 * `function Panel(...)`) and `Cardd("x")` (a typo) are the same shape. The AST
 * resolves the ambiguity: collect every name this document *binds* — component /
 * action / hook declarations, import specifiers, assignments, destructurings,
 * parameters, loop and catch variables — then flag PascalCase `Call` callees
 * that are in neither that set nor the library.
 *
 * A `warning`, not an `error`: the runtime renders an unknown component as
 * nothing rather than failing the program, and a stale editor library must never
 * turn a working file red. `suggestComponent` supplies the "did you mean" hint,
 * which is what actually gets an LLM to self-correct.
 *
 * Only bare-identifier calls are considered — `obj.Method()` is a `MethodCall`,
 * `new Foo()` is a `New`, and `(fn)()` is an `Invoke`, so none of them reach here.
 */
function lintUnknownComponents(
  program: ReturnType<typeof parse>,
  library: ComponentLibrary,
): Diagnostic[] {
  const bound = collectBoundNames(program);
  const warnings: Diagnostic[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    const rec = node as Record<string, unknown> & { kind?: string; loc?: Position };

    if (rec.kind === "Call" && typeof rec.callee === "string") {
      const name = rec.callee;
      if (
        /^[A-Z][A-Za-z0-9_]*$/.test(name) &&
        !bound.has(name) &&
        !JS_GLOBAL_CALLABLES.has(name) &&
        !findComponent(library, name)
      ) {
        const line = rec.loc?.line ?? 0;
        const column = rec.loc?.column ?? 0;
        const key = `${name}:${line}:${column}`;
        if (!seen.has(key)) {
          seen.add(key);
          const hint = suggestComponent(name, library, 3).filter((s) => s !== name);
          warnings.push({
            line,
            column,
            severity: "warning",
            message:
              `Unknown component <${name}> — it is not in the component library and this ` +
              `file does not declare or import it.` +
              (hint.length > 0
                ? ` Did you mean ${hint.map((h) => `"${h}"`).join(" or ")}?`
                : ""),
          });
        }
      }
    }

    for (const key of Object.keys(rec)) {
      if (key !== "loc") visit(rec[key]);
    }
  };

  visit(program.statements);
  return warnings;
}

/**
 * Every name the program binds, anywhere and at any nesting depth. Deliberately
 * over-collects (it ignores scope) — a false negative here just means one
 * unknown component goes unreported, whereas a false positive would put a red
 * squiggle on working code.
 */
function collectBoundNames(program: ReturnType<typeof parse>): Set<string> {
  const names = new Set<string>();
  const add = (name: unknown): void => {
    if (typeof name === "string" && name.length > 0) names.add(name);
  };
  const addParams = (params: unknown): void => {
    for (const p of (params as Array<{ name?: unknown; pattern?: DestructuringPattern }>) ?? []) {
      if (p.pattern) {
        for (const n of collectPatternNames(p.pattern)) add(n);
      } else {
        add(p.name);
      }
    }
  };

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    const rec = node as Record<string, unknown> & { kind?: string };

    switch (rec.kind) {
      case "ComponentDeclaration":
      case "ActionDeclaration":
      case "HookDeclaration":
        add(rec.name);
        addParams(rec.params);
        break;
      case "Lambda":
        addParams(rec.params);
        break;
      case "Import":
        for (const s of (rec.specifiers as Array<{ local?: unknown }>) ?? []) add(s.local);
        break;
      case "Assignment":
        add(rec.identifier);
        break;
      case "DestructureStatement":
        for (const n of collectPatternNames({
          kind: (rec.patternKind as "array" | "object") ?? "object",
          bindings: (rec.bindings as DestructuringPattern["bindings"]) ?? [],
        })) {
          add(n);
        }
        break;
      case "ForOfStatement": {
        const pattern = rec.pattern as DestructuringPattern | undefined;
        if (pattern) {
          for (const n of collectPatternNames(pattern)) add(n);
        } else {
          add(rec.item);
        }
        break;
      }
      case "ForInStatement":
        add(rec.item);
        break;
      case "TryStatement":
        add(rec.catchParam);
        break;
    }

    for (const key of Object.keys(rec)) {
      if (key !== "loc") visit(rec[key]);
    }
  };

  visit(program.statements);
  return names;
}

/** Names destructured from a `$i18n(...)` call (e.g. `const { t } = $i18n(...)`). */
function collectI18nBindingNames(program: ReturnType<typeof parse>): Set<string> {
  const names = new Set<string>();
  const isI18nCall = (expr: unknown): boolean => {
    if (!expr || typeof expr !== "object") return false;
    const e = expr as Record<string, unknown>;
    if (e.kind === "Invoke") {
      const callee = e.callee as Record<string, unknown> | undefined;
      return callee?.kind === "StateRef" && callee?.name === "i18n";
    }
    return e.kind === "BuiltinCall" && e.name === "i18n";
  };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.kind === "DestructureStatement" && rec.patternKind === "object" && isI18nCall(rec.expression)) {
      for (const b of (rec.bindings as Array<{ name?: unknown }> | undefined) ?? []) {
        if (typeof b.name === "string" && b.name) names.add(b.name);
      }
    }
    for (const key of Object.keys(rec)) visit(rec[key]);
  };
  visit(program.statements);
  return names;
}

/**
 * Completion items for the cursor position `position`. Heuristics are
 * intentionally simple — the prompt + the closed schema (§16) make
 * deep static analysis unnecessary:
 *
 *   - After `$` → the reactive-atom hint + the `$`-builtin catalog.
 *   - Inside a component call's trailing `{ … }` props object → that
 *     component's prop names, FOLLOWED BY the general list (so you can
 *     still reference components / atoms / actions in prop values).
 *   - Everywhere else (top of line, inside a `[ … ]` children array, a
 *     `( … )` argument list) → the general list: author-declared symbols,
 *     keywords, and the full component library. Components are ALWAYS
 *     offered here — a children array like `Column([ Sidebar() ])` is the
 *     most common authoring position, so suppressing components there
 *     (the old behaviour) broke the headline autocomplete.
 */
export function getCompletions(
  source: string,
  position: Position,
  library: ComponentLibrary,
): CompletionItem[] {
  const ctx = analyseCursor(source, position);
  // Scope-aware symbols declared in THIS document — the author's own atoms,
  // components, and actions. Without these, autocomplete only ever knew the
  // library + reserved words (feedback §3.2 — the biggest hand-authoring
  // papercut). Parsing is cheap and tolerant: a partial/erroring program
  // still yields whatever declarations have streamed in so far.
  const user = collectUserSymbols(source);

  // After `$` — surface the reactive-atom hint plus the built-in catalog
  // (hooks, factories, namespaces), which also start with the `$` sigil.
  // Sourced from the single builtin catalog so new builtins appear here
  // automatically (`src/language/builtins.ts`).
  if (ctx.afterDollar) {
    return [
      ...user.atoms.map((name) => ({
        label: `$${name}`,
        kind: "state" as const,
        detail: "Reactive atom declared in this file",
      })),
      { label: "$name = value", kind: "state" as const, detail: "Declare or assign a reactive atom" },
      ...builtinCatalog.map((b) => ({
        label: b.signature,
        kind: "builtin" as const,
        detail: b.summary,
      })),
    ];
  }

  // Member access: `$util.`, `$util.style.`, `$storage.local.`, `route.`,
  // or `binding.` where `binding` was assigned from a factory builtin
  // (`$todos = $http(...)` → `.data` / `.refetch()`). Resolved against the
  // shared namespace + resource-bag catalogs so the editor surfaces every
  // member with no hand-maintained list.
  const member = analyseMemberAccess(source, position);
  if (member) {
    const items = memberCompletionsFor(member.objectExpr, source);
    if (items) return items;
  }

  const general = generalCompletions(library, user);
  const call = analyseCallContext(source, position);

  // Inside a component call's named-props object `{ … }` — trailing,
  // leading, or a single all-named argument — offer the spec's prop names
  // first, then the general list. An object that binds POSITIONALLY under
  // the §19 rules (a payload for an object-typed slot) gets no prop names:
  // its keys are data, not props.
  if (ctx.objectCallee) {
    const spec = findComponent(library, ctx.objectCallee);
    if (spec) {
      const isNamedBag =
        !call ||
        call.objectArg === null ||
        chooseNamedBagIndex(call.args, spec) === call.argIndex;
      if (isNamedBag) return [...propCompletions(spec), ...general];
    }
    // Config-taking builtins (`$http({ … })`, `$theme({ … })`, …) — offer the
    // accepted config-object keys first, then the general list.
    if (ctx.objectCallee.startsWith("$")) {
      const config = findBuiltinConfig(ctx.objectCallee.slice(1));
      if (config) return [...configKeyCompletions(config, ctx.objectCallee), ...general];
    }
    return general;
  }

  // Bare positional position inside a library call — when the slot the
  // argument will bind to carries an enum, offer its values first so
  // all-positional calls complete as well as named ones do.
  if (call?.callee && call.objectArg === null) {
    const spec = findComponent(library, call.callee);
    if (spec) {
      const bagIdx = chooseNamedBagIndex(call.args, spec);
      if (bagIdx !== call.argIndex) {
        let n = call.argIndex;
        if (bagIdx >= 0 && bagIdx < call.argIndex) n -= 1;
        const slot = slotForNthPositional(spec, n);
        if (slot?.enum && slot.enum.length > 0) {
          // Inside an open string literal the quotes are already typed.
          const prefix = source.slice(0, lineColumnToOffset(source, position));
          const inString = /["']([\w-]*)$/.test(prefix);
          const values = slot.enum.map((value) => ({
            label: inString ? value : `"${value}"`,
            kind: "prop" as const,
            detail: `${slot.name} value (${call.callee})`,
            documentation: slot.description,
          }));
          return [...values, ...general];
        }
      }
    }
  }

  return general;
}

/**
 * The "general" completion set: author-declared symbols, reserved keywords,
 * and the full component library. Offered at every position that is not after
 * a `$` and not inside a props object.
 */
function generalCompletions(library: ComponentLibrary, user: UserSymbols): CompletionItem[] {
  // Merge the curated `KEYWORDS` (which include non-reserved helpers like
  // `cleanup`) with the full reserved-word set from `keywordDocs`,
  // de-duplicated by label.
  const keywordItems = new Map<string, CompletionItem>();
  for (const [label, doc] of Object.entries(keywordDocs)) {
    keywordItems.set(label, {
      label,
      kind: "keyword",
      detail: doc.summary,
      documentation: `${doc.syntax}\n\n${doc.example}`,
    });
  }
  for (const k of KEYWORDS) {
    if (!keywordItems.has(k.label)) {
      keywordItems.set(k.label, { label: k.label, kind: "keyword", detail: k.detail });
    }
  }
  return [
    // Author-declared symbols first so they rank above the large library
    // list in editors that preserve provider order.
    ...user.components.map((name) => ({
      label: name,
      kind: "component" as const,
      detail: "Component declared in this file",
    })),
    ...user.actions.map((name) => ({
      label: name,
      kind: "builtin" as const,
      detail: "Action declared in this file",
    })),
    ...user.atoms.map((name) => ({
      label: `$${name}`,
      kind: "state" as const,
      detail: "Reactive atom declared in this file",
    })),
    ...keywordItems.values(),
    ...library.components.map((c) => ({
      label: c.name,
      kind: "component" as const,
      detail: signaturePreview(c),
      documentation: c.description,
    })),
  ];
}

/** Symbols declared in the current document, for scope-aware completions. */
interface UserSymbols {
  atoms: string[];
  components: string[];
  actions: string[];
}

/**
 * Parse `source` and collect the author's top-level reactive atoms,
 * component declarations (PascalCase functions), and action declarations
 * (camelCase functions). Tolerant of parse errors — the parser returns
 * whatever statements it recovered, which is exactly what we want while the
 * user is mid-edit.
 */
function collectUserSymbols(source: string): UserSymbols {
  const atoms = new Set<string>();
  const components = new Set<string>();
  const actions = new Set<string>();
  try {
    const program = parse(source);
    for (const stmt of program.statements) {
      if (stmt.kind === "Assignment" && stmt.isState && stmt.identifier) {
        atoms.add(stmt.identifier);
      } else if (stmt.kind === "ComponentDeclaration" && stmt.name) {
        components.add(stmt.name);
      } else if (stmt.kind === "ActionDeclaration" && stmt.name) {
        actions.add(stmt.name);
      }
    }
  } catch {
    // Never let completion crash the editor — fall back to no user symbols.
  }
  return { atoms: [...atoms], components: [...components], actions: [...actions] };
}

// ---------------------------------------------------------------------------
// Member access (`obj.member`) — namespaces, factory bags, the `route` handle
// ---------------------------------------------------------------------------

interface MemberAccess {
  /** The object expression before the trailing `.partial` (e.g. `$util.style`). */
  objectExpr: string;
  /** Partial member identifier being typed after the last dot. */
  typing: string;
}

/**
 * Matches a member-access chain ending at the cursor: the object expression
 * (an optionally `$`-sigilled identifier plus any `.segment`s) followed by a
 * dot and an optional partial member. Whitespace-free by design — a member
 * access spanning a newline is not a completion site we care about.
 */
const MEMBER_ACCESS_RE = /(\$?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)?$/;

function analyseMemberAccess(source: string, position: Position): MemberAccess | null {
  const prefix = source.slice(0, lineColumnToOffset(source, position));
  const match = MEMBER_ACCESS_RE.exec(prefix);
  if (!match) return null;
  return { objectExpr: match[1]!, typing: match[2] ?? "" };
}

/** Map a member's kind onto a completion icon kind. */
function memberKind(m: NamespaceMember): CompletionItem["kind"] {
  return m.kind === "method" ? "builtin" : "prop";
}

function toMemberCompletion(m: NamespaceMember, detail: string): CompletionItem {
  return {
    label: m.name,
    kind: memberKind(m),
    detail: `${detail} · ${m.signature}`,
    documentation: m.summary,
  };
}

/** Completions for the config-object keys accepted by a config-taking builtin. */
function configKeyCompletions(keys: readonly ConfigKey[], callee: string): CompletionItem[] {
  return keys.map((k) => ({
    label: k.name,
    kind: "prop" as const,
    detail: `${callee} config · ${k.name}: ${k.type}`,
    documentation: k.summary,
  }));
}

/**
 * Resolve member completions for an `objectExpr.` position, or `null` when the
 * receiver is not a known object (so general completions take over).
 */
function memberCompletionsFor(objectExpr: string, source: string): CompletionItem[] | null {
  const segments = objectExpr.split(".");
  const root = segments[0]!;

  // `$`-namespace (`$util`, `$storage`, `$console`, `$toast`) + nested
  // sub-namespaces (`$util.style.`, `$storage.local.`).
  if (root.startsWith("$")) {
    const bare = root.slice(1);
    if (isNamespaceName(bare)) {
      const members = namespaceMembersAt(bare, segments.slice(1));
      if (members.length > 0) {
        return members.map((m) => toMemberCompletion(m, root));
      }
      return [];
    }
  }

  // Single-segment receivers: the reserved `route` handle, or a binding
  // assigned from a factory builtin.
  if (segments.length === 1) {
    if (root === "route") return routeMembers.map((m) => toMemberCompletion(m, "route"));
    const factory = factoryBindingFor(source, root);
    if (factory) {
      const entry = findFactoryResource(factory);
      if (entry) return entry.members.map((m) => toMemberCompletion(m, root));
    }
  }
  return null;
}

/** Build the alternation of factory builtin names, escaped for a RegExp. */
const FACTORY_ALTERNATION = [...factoryResourceNames].join("|");

/**
 * The factory builtin a binding was assigned from, if any:
 * `$todos = $http(...)` → `"http"`. `receiver` is matched exactly as typed
 * (with or without the `$` sigil). Returns `undefined` when not found.
 */
function factoryBindingFor(source: string, receiver: string): string | undefined {
  if (!FACTORY_ALTERNATION) return undefined;
  // Escape `$` for the receiver literal; identifiers are otherwise regex-safe.
  const lhs = receiver.replace(/\$/g, "\\$");
  const re = new RegExp(`(?:^|[^\\w$.])${lhs}\\s*=\\s*(?:await\\s+)?\\$(${FACTORY_ALTERNATION})\\s*\\(`);
  const match = re.exec(source);
  return match ? match[1] : undefined;
}

/**
 * Hover for the namespace / factory-bag / `route` member under the cursor.
 * `word` is the already-extracted identifier at `position`.
 */
function memberHoverAt(source: string, position: Position, word: string): HoverInfo | null {
  // Re-read the prefix up to the END of the hovered word so the member-access
  // regex sees the full `obj.member` even when the cursor is mid-word.
  const offset = lineColumnToOffset(source, position);
  let end = offset;
  while (end < source.length && /[\w$]/.test(source[end]!)) end += 1;
  const prefix = source.slice(0, end);
  const match = MEMBER_ACCESS_RE.exec(prefix);
  if (!match || (match[2] ?? "") !== word) return null;

  const objectExpr = match[1]!;
  const segments = objectExpr.split(".");
  const root = segments[0]!;

  if (root.startsWith("$")) {
    const bare = root.slice(1);
    if (isNamespaceName(bare)) {
      const path = [...segments.slice(1), word].join(".");
      const m = findNamespaceMember(bare, path);
      if (m) return memberHover(`${root}.${path}`, m);
      return null;
    }
    const factory = factoryBindingFor(source, root);
    if (factory && segments.length === 1) {
      const entry = findFactoryResource(factory);
      const m = entry?.members.find((x) => x.name === word);
      if (m) return memberHover(`${root}.${word}`, m);
    }
    return null;
  }

  if (segments.length === 1) {
    if (root === "route") {
      const m = routeMembers.find((x) => x.name === word);
      if (m) return memberHover(`route.${word}`, m);
    }
    const factory = factoryBindingFor(source, root);
    if (factory) {
      const entry = findFactoryResource(factory);
      const m = entry?.members.find((x) => x.name === word);
      if (m) return memberHover(`${root}.${word}`, m);
    }
  }
  return null;
}

function memberHover(qualified: string, m: NamespaceMember): HoverInfo {
  return {
    kind: m.kind === "method" ? "builtin" : "prop",
    contents: `**${qualified}** — ${m.summary}\n\nSignature: \`${m.signature}\``,
  };
}

/**
 * Hover for a config-object key under the cursor, when it sits inside the
 * config object of a config-taking builtin (`$http({ url: … })`). Returns
 * `null` otherwise.
 */
function configKeyHoverAt(source: string, position: Position, word: string): HoverInfo | null {
  const ctx = analyseCursor(source, position);
  if (!ctx.objectCallee || !ctx.objectCallee.startsWith("$")) return null;
  const keys = findBuiltinConfig(ctx.objectCallee.slice(1));
  const key = keys?.find((k) => k.name === word);
  if (!key) return null;
  return {
    kind: "prop",
    contents: `**${ctx.objectCallee} config · ${key.name}** — ${key.summary}\n\nType: \`${key.type}\``,
  };
}

/**
 * Hover info for the symbol under the cursor. Returns `null` when the
 * cursor is not over a recognised symbol.
 */
export function getHoverInfo(
  source: string,
  position: Position,
  library: ComponentLibrary,
): HoverInfo | null {
  const word = wordAt(source, position);
  if (!word) return null;

  // Member of a `$`-namespace / factory bag / `route` handle under the cursor
  // (`$util.format`, `$storage.local.set`, `route.path`, `$todos.refetch`).
  const memberHover = memberHoverAt(source, position, word);
  if (memberHover) return memberHover;

  const spec = findComponent(library, word);
  if (spec) {
    return {
      kind: "component",
      contents:
        `**${spec.name}** — ${spec.description ?? "Component."}\n\n` +
        `Signature: \`${signaturePreview(spec)}\``,
    };
  }

  // Config-object key inside a config-taking builtin (`url` in `$http({ … })`).
  const configHover = configKeyHoverAt(source, position, word);
  if (configHover) return configHover;
  if (word.startsWith("$")) {
    // Runtime builtin (hook / factory / namespace) — rich signature + summary
    // sourced from the shared catalog (`src/language/builtins.ts`).
    const builtin = findBuiltin(word.slice(1));
    if (builtin) {
      return {
        kind: "builtin",
        contents: `**${builtin.sigil}** — ${builtin.summary}\n\nSignature: \`${builtin.signature}\``,
      };
    }
    return { kind: "state", contents: `**${word}** — reactive state atom` };
  }
  // Reserved-word hover: rich definition + syntax + example from the
  // shared keyword docs (single source of truth in `grammar.ts`).
  const doc = keywordDocs[word];
  if (doc) {
    return { kind: "unknown", contents: formatKeywordHover(word, doc) };
  }
  const kw = KEYWORDS.find((k) => k.label === word);
  if (kw) {
    return { kind: "unknown", contents: `**${word}** — ${kw.detail}` };
  }
  return null;
}

/** Render a keyword's docs as Markdown (definition, syntax, example). */
function formatKeywordHover(word: string, doc: KeywordDoc): string {
  return (
    `**${word}** — ${doc.summary}\n\n` +
    `**Syntax**\n\n\`\`\`js\n${doc.syntax}\n\`\`\`\n\n` +
    `**Example**\n\n\`\`\`js\n${doc.example}\n\`\`\``
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CursorContext {
  /**
   * The component call whose trailing props object `{ … }` the cursor sits
   * inside, if any. Drives prop-name completions.
   */
  objectCallee?: string;
  /** True when the previous non-whitespace token is `$` — user typing a tier. */
  afterDollar: boolean;
}

interface BracketFrame {
  bracket: "(" | "[" | "{";
  /** Identifier preceding a `(` — the callee. Empty for grouping/`[`/`{`. */
  callee: string;
}

/**
 * Analyse the text before the cursor with a bracket stack (skipping strings
 * and comments). The cursor is in a props object when the innermost open
 * bracket is `{` and there is an enclosing `(` call — the callee of that call
 * is the component whose props we complete.
 */
function analyseCursor(source: string, position: Position): CursorContext {
  const offset = lineColumnToOffset(source, position);
  const prefix = source.slice(0, offset);
  const afterDollar = /\$[A-Za-z_]*$/.test(prefix);

  const stack: BracketFrame[] = [];
  for (let i = 0; i < prefix.length; i += 1) {
    const ch = prefix[i]!;
    if (ch === "/" && prefix[i + 1] === "/") {
      while (i < prefix.length && prefix[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && prefix[i + 1] === "*") {
      i += 2;
      while (i < prefix.length && !(prefix[i] === "*" && prefix[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(prefix, i, ch);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ bracket: ch, callee: ch === "(" ? identifierBefore(prefix, i) : "" });
    } else if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop();
    }
  }

  let objectCallee: string | undefined;
  const top = stack[stack.length - 1];
  if (top && top.bracket === "{") {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i]!.bracket === "(") {
        const callee = stack[i]!.callee;
        if (callee) objectCallee = callee;
        break;
      }
    }
  }

  return { objectCallee, afterDollar };
}

/** Returns the index of the closing quote (or the last index if unterminated). */
function skipStringLiteral(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i;
    i += 1;
  }
  return source.length - 1;
}

function identifierBefore(source: string, openIndex: number): string {
  let end = openIndex;
  while (end > 0 && /\s/.test(source[end - 1]!)) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1]!)) start -= 1;
  return source.slice(start, end);
}

function propCompletions(spec: ComponentSpec): CompletionItem[] {
  const positional = findPositionalProp(spec);
  return spec.props.map((prop) => ({
    label: `${prop.name}:`,
    kind: "prop" as const,
    detail: propDetail(prop, positional?.name === prop.name),
    documentation: prop.description,
  }));
}

function propDetail(prop: PropSpec, isPositional: boolean): string {
  const tags: string[] = [];
  if (isPositional) tags.push("positional");
  if (prop.required) tags.push("required");
  if (prop.enum) tags.push(`enum: ${prop.enum.map((e) => `"${e}"`).join(" | ")}`);
  const tagText = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  return `${prop.type}${tagText}`;
}

function signaturePreview(spec: ComponentSpec): string {
  const positional = findPositionalProp(spec);
  const positionalLabel = positional ? positional.name : "";
  const rest = spec.props
    .filter((p) => p.name !== positional?.name)
    .map((p) => `${p.name}${p.optional || !p.required ? "?" : ""}: ${p.type}`)
    .join(", ");
  if (positionalLabel === "" && rest === "") return `${spec.name}()`;
  if (positionalLabel === "") return `${spec.name}(${rest})`;
  if (rest === "") return `${spec.name}(${positionalLabel})`;
  return `${spec.name}(${positionalLabel}, ${rest})`;
}

function lineColumnToOffset(source: string, pos: Position): number {
  let line = 1;
  let col = 1;
  for (let i = 0; i < source.length; i += 1) {
    if (line === pos.line && col === pos.column) return i;
    if (source[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return source.length;
}

function wordAt(source: string, pos: Position): string | null {
  const offset = lineColumnToOffset(source, pos);
  // Expand left + right while we're on a word/identifier-like char.
  const isWord = (c: string): boolean => /[\w$]/.test(c);
  let start = offset;
  while (start > 0 && isWord(source[start - 1]!)) start -= 1;
  let end = offset;
  while (end < source.length && isWord(source[end]!)) end += 1;
  if (start === end) return null;
  return source.slice(start, end);
}
