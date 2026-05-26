/**
 * Aktion 0.5 §27 — automatic v1 → 0.5 source codemod.
 *
 * The migration helper accepts a *v1* source string and returns a
 * best-effort *0.5* equivalent, plus a list of advisory notes describing
 * each transformation. The codemod targets the legacy surfaces enumerated
 * in `language-update-final.md` Appendix A; surfaces that have no clean
 * textual rewrite (e.g. `Action([@Set, …])`'s open-ended payload DSL)
 * surface a note pointing the author at the manual migration path.
 *
 * Why a text codemod rather than an AST-to-AST one? The v1 grammar is
 * accepted as a hard parse error by the current parser (the legacy
 * `name=value`, `$$x` sigil, `Name(args) = expr` macros, etc. all raise
 * definitive errors). Re-introducing v1 syntax just to round-trip
 * through the parser would defeat the purpose of removing it — and a
 * focused set of regexes handles the line-oriented transforms cleanly
 * because the v1 grammar is itself line-oriented.
 *
 * The codemod is idempotent: feeding its output back through `migrateV1`
 * is a no-op.
 */

export interface MigrateV1Result {
  /** Best-effort 0.5 source. */
  source: string;
  /** Human-readable record of every transform that fired, in source order. */
  notes: string[];
  /** Hand-migration hints for surfaces that have no clean text rewrite. */
  manualMigrations: string[];
}

interface Rule {
  /** Short identifier used in `notes`. */
  id: string;
  /** Pattern the rule matches. `g` and `m` flags are assumed. */
  pattern: RegExp;
  /** Replacement function — must return the new fragment. */
  replace: (
    match: string,
    ...groups: string[]
  ) => string;
  /** Human-readable note added once per match. */
  note: (match: string, ...groups: string[]) => string;
}

const RULES: Rule[] = [
  // `$$x = …` persistent sigil → `$x = …` (a single reactive atom kind).
  {
    id: "persist-sigil",
    pattern: /^(\s*)\$\$([a-zA-Z_][\w]*)\s*=\s*(.+)$/gm,
    replace: (_match, indent, name, rhs) => `${indent}$${name} = ${rhs}`,
    note: (_match, _indent, name) =>
      `$$${name} → $${name} = … (single reactive atom kind).`,
  },
  // Tiered state declarations (`$state name`, `$persist name`,
  // `$session name`, `$shared name`, `$computed name`) all collapse to
  // the single-sigil `$name = …` form.
  {
    id: "state-tier-strip",
    pattern: /^(\s*)\$(state|persist|session|shared|computed)\s+([a-zA-Z_][\w]*)\s*=\s*(.+)$/gm,
    replace: (_match, indent, _tier, name, rhs) => `${indent}$${name} = ${rhs}`,
    note: (_match, _indent, tier, name) =>
      `$${tier} ${name} = … → $${name} = … (single reactive atom kind).`,
  },
  // Reserved `root` binding → `aktion`. We only touch the canonical LHS
  // form so we don't accidentally rewrite identifier references named
  // `root` inside other contexts.
  {
    id: "root-binding",
    pattern: /^(\s*)root\s*=\s*/gm,
    replace: (_match, indent) => `${indent}aktion = `,
    note: () =>
      `root = … → aktion = … (the top-level binding is now named aktion).`,
  },
  // Router / match arms switched from `-> body` / `_ -> body` to
  // `: body` / `default: body`. We target arm-shaped fragments so plain
  // arrow operators in lambda bodies are left alone.
  {
    id: "router-arrow",
    pattern: /^(\s*)(_|"[^"]*")\s*->\s*/gm,
    replace: (_match, indent, pattern) =>
      `${indent}${pattern === "_" ? "default" : pattern}: `,
    note: () =>
      `"path" -> Body / _ -> Fallback → "path": Body / default: Fallback (router & match arms).`,
  },
  // `Name(args) = expr` macro shorthand → `function Name(args) { return expr }`.
  {
    id: "macro-shorthand",
    pattern: /^(\s*)([A-Z][\w]*)\(([^()]*)\)\s*=\s*(.+)$/gm,
    replace: (_match, indent, name, params, body) =>
      `${indent}function ${name}(${params.trim()}) {\n${indent}  return ${body.trim()}\n${indent}}`,
    note: (_match, _indent, name) =>
      `${name}(...) = … → function ${name}(...) { return … } (macros subsumed by function declarations).`,
  },
  // `name=value` legacy named-arg form → `name: value`. Limited to inside
  // call argument lists so it doesn't accidentally rewrite assignments.
  // We target `(... NAME=value ...)` patterns; the rule fires repeatedly
  // until convergence.
  {
    id: "named-arg-form",
    pattern: /(\(|,)(\s*)([a-zA-Z_][\w]*)\s*=\s*(?!=)/g,
    replace: (_match, lead, ws, name) => `${lead}${ws}${name}: `,
    note: (_match, _lead, _ws, name) =>
      `${name}=value → ${name}: value (legacy named-arg form removed in §3.4).`,
  },
  // Legacy `<aktion-app enable-javascript>` / `enable-routes`
  // attributes are no-ops in the current runtime — every capability is
  // always available. Strip them so the canonical output stays clean.
  {
    id: "enable-javascript",
    pattern: /\s*enable-javascript(?:="(?:true|on)")?/g,
    replace: () => ``,
    note: () =>
      `enable-javascript → (removed — every capability is always on).`,
  },
  {
    id: "enable-routes",
    pattern: /\s*enable-routes(?:="(?:true|on)")?/g,
    replace: () => ``,
    note: () =>
      `enable-routes → (removed — routes are always on).`,
  },
  // `<aktion-app capabilities="…">` / `capabilities-default="…"`
  // attributes were the host-side gate; the gate is removed in the
  // current runtime so strip them.
  {
    id: "capabilities-attr",
    pattern: /\s*capabilities(?:-default)?="[^"]*"/g,
    replace: () => ``,
    note: () =>
      `capabilities="…" / capabilities-default="…" → (removed — the capability sandbox is gone; every capability is always on).`,
  },
  // Old `effect Name [uses { caps }] [on triggers] [debounce(N) | throttle(N)] { body }`
  // declarations migrate to the canonical anonymous form
  // `effect(() => { body }, [deps])`. State triggers, lifecycle triggers,
  // and any rate-limit modifier all collapse into a single bracketed
  // dependency list; the name is dropped.
  {
    id: "effect-anonymous-form",
    pattern:
      /\beffect\s+[A-Za-z_]\w*(?:\s+uses\s*\{[^}]*\})?((?:\s+on(?::\w+(?:\([^)]*\))?|\s+\$\w+(?:\s*,\s*\$\w+)*))*)?(\s+(?:debounce|throttle)\s*\(\s*\d+\s*\))?\s*\{/g,
    replace: (_match, triggersClause: string | undefined, rateClause: string | undefined) => {
      const deps: string[] = [];
      const triggers = (triggersClause ?? "").trim();
      if (triggers) {
        const tokens = triggers.split(/\s+on\b/).map((t) => t.trim()).filter(Boolean);
        for (const tok of tokens) {
          if (tok.startsWith(":")) {
            deps.push(`on${tok}`);
          } else {
            for (const state of tok.split(",").map((s) => s.trim()).filter(Boolean)) {
              deps.push(state);
            }
          }
        }
      }
      const rate = (rateClause ?? "").trim();
      if (rate) deps.push(rate);
      const depsClause = deps.length > 0 ? ` [${deps.join(", ")}]` : "";
      return `effect${depsClause} {`;
    },
    note: () =>
      `effect Name [uses {...}] [on triggers] [debounce(N) | throttle(N)] → effect(() => { ... }, [...deps]) — the name is dropped, dependencies (state, "mount"/"unmount"/"every(N)", "debounce(N)", "throttle(N)") live in the deps array.`,
  },
  // `uses { caps }` clause on `action`/`function` declarations is gone.
  {
    id: "action-uses-clause",
    pattern:
      /\b(?:action|function)\s+([A-Za-z_]\w*)(\s*\([^)]*\))?\s+uses\s*\{[^}]*\}/g,
    replace: (_match, name, params) => `function ${name}${params ?? ""}`,
    note: () =>
      `action/function uses { … } clause → (removed — capabilities are gone).`,
  },
  // `#sus/2` (and `#sus/2 delta`) pragma → drop. The 0.5 parser treats
  // `#…` as a comment so the pragma is silently ignored; the codemod
  // strips it to keep canonical output clean.
  {
    id: "pragma",
    pattern: /^\s*#sus\/[\w.]+(?:\s+delta)?\s*$/gm,
    replace: () => ``,
    note: () =>
      `#sus/2 pragma → (removed — the 0.5 parser has no version pragma).`,
  },
  // `$route` → `route`. The router's reactive surface used to live on
  // a reserved `$state` slot named `route`; now it lives on `route`.
  {
    id: "route-handle",
    pattern: /\$route\b/g,
    replace: () => `route`,
    note: () =>
      `$route → route. The router's reactive surface (and its \`navigate(path)\` method) lives on the reserved \`route\` handle.`,
  },
  // `TextContent(...)` → `Text(...)`. The component was renamed; the
  // legacy name is still registered as a deprecated alias so old
  // programs keep rendering, but the codemod migrates the call site to
  // the canonical name.
  {
    id: "text-content-rename",
    pattern: /\bTextContent\(/g,
    replace: () => `Text(`,
    note: () =>
      `TextContent(...) → Text(...). The component was renamed; the new \`Text\` spec accepts the same props plus an optional \`style\` declaration string.`,
  },
  // Flat-shape Theme tokens — `colorPrimary: "#fff"` etc. We only target
  // top-level keys directly inside a `Theme({...})` call argument list
  // and rewrite to the structured form. Multiple flat-shape keys at the
  // same level merge into one nested object per group.
  {
    id: "theme-tokens",
    pattern: /Theme\(\s*\{([^{}]*)\}\s*\)/g,
    replace: (_match, body) => {
      const rewritten = rewriteThemeBody(body);
      return `Theme({ ${rewritten} })`;
    },
    note: () =>
      `Theme({...}) — flat-shape tokens and free-form --css-vars rewritten to the structured form (§16).`,
  },
];

const MANUAL_HINTS: Array<{
  pattern: RegExp;
  hint: (m: string) => string;
}> = [
  {
    pattern: /Action\(\s*\[/,
    hint: () =>
      `Action([@Set, @Run, …]) payloads → function name() { … } blocks. The payload DSL has no automatic rewrite — translate the steps to imperative statements.`,
  },
  {
    pattern: /Script\(/,
    hint: () =>
      `Script(id, body, deps?) → effect(() => { … }, [...deps]). No capability list is needed.`,
  },
  {
    pattern: /Routes\(/,
    hint: () =>
      `Routes(...) / Route(path, content) → pages = Router({ "/": Component(), default: Fallback() }).`,
  },
  {
    pattern: /(^|\n)\s*\$router(?:\s+[a-zA-Z_][\w]*)?\s*=\s*router\s*\{/,
    hint: () =>
      `$router = router { … } → pages = Router({ "/": Home(), "/users/:id": User(params), default: NotFound() }). The router primitive is now a plain function call — assign its result to any binding (e.g. \`pages\`) and reference it inside \`aktion\`. Separate route arms with commas (object-literal form).`,
  },
  {
    pattern: /\bQuery\(/,
    hint: () =>
      `Query(name, args, placeholder) → $response = http({ url, method: "GET", ... }). The reactive bag exposes data / error / loading / status / refetch() / cancel() / lastUpdated / headers.`,
  },
  {
    pattern: /\bMutation\(/,
    hint: () =>
      `Mutation(name, args) → $response = http({ url, method: "POST", body, ... }). Trigger via the surrounding action; observe data / error / loading on the resource.`,
  },
  {
    pattern: /^\s*(?:query|mutation|subscription)\s+[A-Z]/m,
    hint: () =>
      `query / mutation / subscription declarations → call site $response = http({ url, method, body, headers, ... }). The single http() builtin returns a reactive bag with data, error, loading, status, lastUpdated, headers, refetch(), cancel().`,
  },
  {
    pattern: /\$(?:query|mutation|subscription)\s+[a-zA-Z_]/,
    hint: () =>
      `$query / $mutation / $subscription bindings → $name = http({ ... }). One reactive resource type for every HTTP method (GET/POST/PUT/PATCH/DELETE) and for streaming responses via headers/SSE.`,
  },
  {
    pattern: /@Const\(/,
    hint: () =>
      `@Const(expr) → $name = expr (single reactive atom kind). Per-instance reactivity removes the need for explicit memoisation in 95% of cases.`,
  },
  {
    pattern: /@Memo\(/,
    hint: () =>
      `@Memo(expr) → $name = expr (single reactive atom kind).`,
  },
  {
    pattern: /useInstanceState\(/,
    hint: () =>
      `helpers.useInstanceState(positionalKey) → $name = init inside the component body. Identity is content-addressed, so reorderings no longer migrate state.`,
  },
];

/**
 * Run the v1 → 0.5 codemod on `source`. The transform is best-effort:
 * unmigratable surfaces produce a `manualMigrations` note instead of an
 * automatic rewrite, so the caller knows which lines still need a human
 * touch.
 */
export function migrateV1(source: string): MigrateV1Result {
  const notes: string[] = [];
  const seen = new Set<string>(); // Dedupe "same rule fired N times" noise.
  let working = source;

  for (const rule of RULES) {
    const before = working;
    working = working.replace(rule.pattern, (...args) => {
      const match = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      const key = `${rule.id}:${match}`;
      if (!seen.has(key)) {
        seen.add(key);
        notes.push(rule.note(match, ...groups));
      }
      return rule.replace(match, ...groups);
    });
    if (working !== before) {
      // Re-run the rule until it converges — useful for multi-pass
      // patterns like named-args (one call may have several legacy
      // `name=value` args).
      let prev: string;
      do {
        prev = working;
        working = working.replace(rule.pattern, (...args) => {
          const match = args[0] as string;
          const groups = args.slice(1, -2) as string[];
          return rule.replace(match, ...groups);
        });
      } while (working !== prev);
    }
  }

  const manualMigrations: string[] = [];
  const seenManual = new Set<string>();
  for (const hint of MANUAL_HINTS) {
    if (hint.pattern.test(working)) {
      const text = hint.hint(working);
      if (!seenManual.has(text)) {
        seenManual.add(text);
        manualMigrations.push(text);
      }
    }
  }

  // Trim trailing whitespace introduced by pragma-removal etc., but
  // keep the file ending on exactly one newline.
  working = working.replace(/[ \t]+$/gm, "");
  working = working.replace(/\n{3,}/g, "\n\n");
  if (!working.endsWith("\n") && working.length > 0) working += "\n";

  return { source: working, notes, manualMigrations };
}

/**
 * Re-write the body of a `Theme({...})` call: every flat-shape token
 * (`colorPrimary`, `radiusMd`, …) and every free-form `--css-var` is
 * promoted into the structured group form.
 */
function rewriteThemeBody(body: string): string {
  // Split into shallow key/value entries. We only target the
  // top-level object, so a quick split on commas-that-aren't-inside-
  // braces is fine. The grammar guarantees no commas inside string
  // literals at this level.
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      if (current.trim() !== "") entries.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") entries.push(current.trim());

  const flatGroups: Record<string, Array<{ key: string; value: string }>> = {
    colors: [],
    radius: [],
    font: [],
    motion: [],
    elevation: [],
  };
  const passthrough: string[] = [];

  for (const entry of entries) {
    const m = /^([\w\-"]+)\s*:\s*(.*)$/.exec(entry);
    if (!m) {
      passthrough.push(entry);
      continue;
    }
    const rawKey = m[1]!.replace(/^"|"$/g, "");
    const value = m[2]!;

    // Free-form CSS variable (`--color-x`).
    if (rawKey.startsWith("--")) {
      const stripped = rawKey.replace(/^--(rui-)?/, "");
      const [group, ...rest] = stripped.split("-");
      const inner = rest.length === 0 ? "value" : kebabToCamel(rest.join("-"));
      const targetGroup = mapPrefixToGroup(group ?? "");
      if (targetGroup) {
        flatGroups[targetGroup]!.push({ key: inner, value });
        continue;
      }
      passthrough.push(entry);
      continue;
    }

    // Flat-shape (`colorPrimary`, `radiusMd`).
    const flatMatch = matchFlatKey(rawKey);
    if (flatMatch) {
      flatGroups[flatMatch.group]!.push({
        key: flatMatch.inner,
        value,
      });
      continue;
    }

    // Already-structured / metadata key.
    passthrough.push(entry);
  }

  const out: string[] = [...passthrough];
  for (const [group, items] of Object.entries(flatGroups)) {
    if (items.length === 0) continue;
    const inner = items.map((i) => `${i.key}: ${i.value}`).join(", ");
    out.push(`${group}: { ${inner} }`);
  }
  return out.join(", ");
}

function matchFlatKey(key: string): { group: string; inner: string } | null {
  const groups: Array<{ prefix: string; group: string }> = [
    { prefix: "colors", group: "colors" }, // structured form passes through
    { prefix: "color", group: "colors" },
    { prefix: "radius", group: "radius" },
    { prefix: "font", group: "font" },
    { prefix: "motion", group: "motion" },
    { prefix: "elevation", group: "elevation" },
  ];
  for (const { prefix, group } of groups) {
    if (key === prefix) continue;
    if (key.startsWith(prefix) && key.length > prefix.length) {
      const tail = key.slice(prefix.length);
      const inner = tail.charAt(0).toLowerCase() + tail.slice(1);
      return { group, inner };
    }
  }
  return null;
}

function mapPrefixToGroup(prefix: string): string | null {
  if (prefix === "color" || prefix === "colors") return "colors";
  if (prefix === "radius") return "radius";
  if (prefix === "font") return "font";
  if (prefix === "motion") return "motion";
  if (prefix === "elevation") return "elevation";
  return null;
}

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
