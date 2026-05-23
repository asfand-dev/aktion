// One-shot codemod: rewrite docs/assets/*.js examples from v1 → 0.5 surface.
//
// The bulk of the work is mechanical — sigils, removed component renames,
// simple Action chains, simple Query/Mutation rewrites, and named-args
// conversion. We process each file as text, identify the program template
// literals (backtick strings inside the EXAMPLES dictionary), and apply a
// chain of rewrites. Anything that can't be mechanically migrated stays as a
// best effort; the user manually fixes those.

import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "docs/assets/live-example.js",
  "docs/assets/playground.js",
  "docs/assets/chat-bot.js",
];

// Removed-component → replacement table (purely syntactic — we just rename).
const RENAMES = [
  [/\bSheet\(/g,                "Drawer("],
  [/\bToggle\(/g,               "Switch("],
  [/\bCover\(/g,                'Hero(layout: "cover", '],
  [/\bMetricGrid\(/g,           'Stats(layout: "grid", '],
  [/\bAreaChart\(/g,            "LineChart(filled: true, "],
  [/\bAuditTrail\(/g,           'ActivityLog(variant: "audit", '],
  [/\bSegmentedControl\(/g,     "ToggleGroup("],
  [/\bOtpInput\(/g,             "PinInput("],
  [/\bBreadcrumbPageHeader\(/g, "PageHeader("],
];

// Removed builtins → replacements.
const BUILTIN_RENAMES = [
  [/@FormatCurrency\(/g, '@Format('], // first-arg becomes value, but we want @Format(v, "currency")
  [/@FormatNumber\(/g,   '@Format('], // ditto
];

// v1 sigils → 0.5 state tiers.
function rewriteSigils(text) {
  // Rename `$query` (an old common state name) to `$searchQuery` everywhere
  // because `query` is a reserved keyword in 0.5 and `$state query = …` is
  // therefore rejected by the parser.
  text = text.replace(/\$query\b/g, "$searchQuery");
  // $$name = ... (top-level persist)
  text = text.replace(/(^|\n)([ \t]*)\$\$([a-zA-Z_][\w]*)(\s*=\s*)/g, "$1$2$persist $3$4");
  // Bare top-level $name = ... → $state name = ...
  text = text.replace(
    /(^|\n)([ \t]*)\$(?!state |persist |session |shared |computed |query |mutation |subscription |router |route\b|http |theme |i18n )([a-zA-Z_][\w]*)(\s*=\s*)/g,
    "$1$2$state $3$4",
  );
  // Any remaining `$$x` references (not assignments) become bare `$x` —
  // they refer to the variable after a `$persist x = …` declaration.
  text = text.replace(/\$\$([a-zA-Z_][\w]*)/g, "$$$1");
  return text;
}

// `@Switch(v, {k: branch, ...}, default?)` → `match v { case "k" -> branch ... }`.
function rewriteSwitch(text) {
  return rewriteParenCall(text, "@Switch", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 2) return null;
    const v = parts[0].trim();
    const body = parts[1].trim().replace(/^\{|\}$/g, "");
    const def = parts.length >= 3 ? parts.slice(2).join(",").trim() : "";
    return buildSwitch(v, body, def);
  });
}

function buildSwitch(v, body, def) {
  const pairs = splitTopLevel(body);
  const arms = pairs.map((p) => {
    const colon = p.indexOf(":");
    if (colon === -1) return null;
    const key = p.slice(0, colon).trim();
    const val = p.slice(colon + 1).trim();
    const keyOut = /^["']/.test(key) ? key : `"${key}"`;
    return `  ${keyOut} -> ${val}`;
  }).filter(Boolean);
  if (def) arms.push(`  _ -> ${def.trim()}`);
  return `match ${v.trim()} {\n${arms.join("\n")}\n}`;
}

// `Name(args) = expr` macro → `component Name(args) { expr }`.
// Detect lines like `Foo(a, b) = expression`. Multi-line expressions are
// handled by detecting balanced parens until end-of-line.
function rewriteMacros(text) {
  // Match `Name(args) = expr` at line start (or doc start). Uppercase-start
  // names become `component` declarations; lowercase-start names become
  // lambda bindings (`name = (args) => expr`).
  const out = [];
  let i = 0;
  while (i < text.length) {
    const isLineStart = i === 0 || text[i - 1] === "\n";
    if (!isLineStart) { out.push(text[i]); i++; continue; }
    const m = text.slice(i).match(/^([a-zA-Z_]\w*)\(([^)]*)\)\s*=(?![=>])\s*/);
    if (!m) { out.push(text[i]); i++; continue; }
    const name = m[1];
    const args = m[2];
    const headLen = m[0].length;
    let j = i + headLen;
    let depth = 0;
    let inStr = false, delim = null;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (ch === "\\") {
          const nxt = text[j + 1];
          if (nxt === delim) { inStr = false; j++; continue; }
          j++; continue;
        }
        if (ch === delim) inStr = false;
        continue;
      }
      if (ch === "\\") {
        const nxt = text[j + 1];
        if (nxt === '"' || nxt === "'" || nxt === "`") { inStr = true; delim = nxt; j++; continue; }
        j++; continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { inStr = true; delim = ch; continue; }
      if (ch === "(" || ch === "[" || ch === "{") { depth++; continue; }
      if (ch === ")" || ch === "]" || ch === "}") { depth--; continue; }
      if (ch === "\n" && depth === 0) break;
    }
    const expr = text.slice(i + headLen, j);
    const isUpper = /^[A-Z]/.test(name);
    if (isUpper) {
      out.push(`component ${name}(${args}) { ${expr} }`);
    } else {
      // Lowercase macros become lambda bindings.
      out.push(`${name} = (${args}) => ${expr}`);
    }
    i = j;
  }
  return out.join("");
}

// `@Each(arr, "{a, b}", template)` → `for {a, b} in arr { template }`.
// `@Each(arr, "field", template)` → `for field in arr { template }`.
function rewriteEach(text) {
  return rewriteParenCall(text, "@Each", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 3) return null;
    const arr = parts[0].trim();
    const keyRaw = parts[1].trim();
    const key = keyRaw.replace(/^"|"$/g, "");
    const tmpl = parts.slice(2).join(",").trim();
    return `for ${key} in ${arr} { ${tmpl} }`;
  });
}

// `@If(c, t, f)` → `if c { t } else { f }`.
// `@If(c, t)` → `if c { t }`.
function rewriteIf(text) {
  return rewriteParenCall(text, "@If", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 2) return null;
    const c = parts[0].trim();
    const t = parts[1].trim();
    if (parts.length === 2) return `if ${c} { ${t} }`;
    const f = parts.slice(2).join(",").trim();
    return `if ${c} { ${t} } else { ${f} }`;
  });
}

// `@Push($arr, v)` → `[...$arr, v]`.
function rewritePush(text) {
  return rewriteParenCall(text, "@Push", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 2) return null;
    return `[...${parts[0].trim()}, ${parts.slice(1).join(",").trim()}]`;
  });
}

// `@Concat(a, b)` → `[...a, ...b]`.
function rewriteConcat(text) {
  return rewriteParenCall(text, "@Concat", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 2) return null;
    return `[...${parts[0].trim()}, ...${parts.slice(1).join(",").trim()}]`;
  });
}

// `@Map(arr, "field")` → `arr.field`.
function rewriteMap(text) {
  return rewriteParenCall(text, "@Map", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 2) return null;
    const arr = parts[0].trim();
    const field = parts[1].trim().replace(/^"|"$/g, "");
    return `${arr}.${field}`;
  });
}

// `@Take(arr, n)` → `@Slice(arr, 0, n)`.
function rewriteTake(text) {
  return rewriteParenCall(text, "@Take", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 2) return null;
    return `@Slice(${parts[0].trim()}, 0, ${parts.slice(1).join(",").trim()})`;
  });
}

// `@FormatCurrency(v)` → `@Format(v, "currency")`.
// `@FormatNumber(v)` → `@Format(v, "number")`.
function rewriteFormatters(text) {
  text = text.replace(/@FormatCurrency\(([^)]+?)\)/g, (_m, v) => `@Format(${v.trim()}, "currency")`);
  text = text.replace(/@FormatNumber\(([^)]+?)\)/g,   (_m, v) => `@Format(${v.trim()}, "number")`);
  return text;
}

// `@Const(expr)` / `@Memo(expr)` are computed-binding-only — without a
// surrounding `$name = ...`, they don't have a clean expression-level
// equivalent. We unwrap them so the bare expression survives.
function rewriteConstMemo(text) {
  text = text.replace(/@Const\(([\s\S]*?)\)/g, (_m, e) => e.trim());
  text = text.replace(/@Memo\(([\s\S]*?)\)/g, (_m, e) => e.trim());
  return text;
}

// Rewrite Action([@Step(...)]) → inline lambda using balanced-paren tracking.
function rewriteSingleStepAction(text) {
  return rewriteParenCall(text, "Action", (args) => {
    const arr = args.trim();
    if (!arr.startsWith("[") || !arr.endsWith("]")) return null;
    const inner = arr.slice(1, -1).trim();
    // Inner must be a single @Step(...) — no comma at top level.
    const top = splitTopLevel(inner);
    if (top.length !== 1) return null;
    const step = top[0].trim();
    const m = step.match(/^@(\w+)\(([\s\S]*)\)$/);
    if (!m) return null;
    const kind = m[1];
    const stepArgs = m[2];
    if (kind === "ToAssistant") {
      return "null";
    } else if (kind === "Set") {
      const parts = splitTopLevel(stepArgs);
      if (parts.length !== 2) return null;
      return `() => { ${parts[0].trim()} = ${parts[1].trim()} }`;
    } else if (kind === "Reset") {
      const resets = splitTopLevel(stepArgs);
      const stmts = resets.map((v) => `${v.trim()} = ""`).join("; ");
      return `() => { ${stmts} }`;
    } else if (kind === "OpenUrl") {
      return `() => { js{ window.open(${stepArgs.trim()}, "_blank", "noopener,noreferrer") } }`;
    } else if (kind === "Navigate") {
      return `() => { js{ ctx.host.navigate(${stepArgs.trim()}) } }`;
    } else if (kind === "Js") {
      const parts = splitTopLevel(stepArgs);
      const body = parts[0]?.trim() ?? "";
      const unquoted = body.startsWith('"') || body.startsWith("'")
        ? JSON.parse(body.replace(/^'/, '"').replace(/'$/, '"'))
        : body.startsWith("`") ? body.slice(1, -1) : body;
      return `() => { js{ ${unquoted} } }`;
    } else if (kind === "Run") {
      return `() => { await $mutation.${stepArgs.trim()}.call({}) }`;
    }
    return null;
  });
}

// Multi-step Action chain → inline lambda body with sequenced statements.
function rewriteActionChainBalanced(text) {
  return rewriteParenCall(text, "Action", (args) => {
    const arr = args.trim();
    if (!arr.startsWith("[") || !arr.endsWith("]")) return null;
    const inner = arr.slice(1, -1).trim();
    const top = splitTopLevel(inner);
    if (top.length < 1) return null;
    // Every part must be an @Step(...) call.
    const steps = [];
    for (const t of top) {
      const s = t.trim();
      const m = s.match(/^@(\w+)\(([\s\S]*)\)$/);
      if (!m) return null;
      const kind = m[1];
      const sa = m[2];
      if (kind === "Set") {
        const parts = splitTopLevel(sa);
        if (parts.length !== 2) return null;
        steps.push(`${parts[0].trim()} = ${parts[1].trim()}`);
      } else if (kind === "Reset") {
        const resets = splitTopLevel(sa);
        for (const v of resets) steps.push(`${v.trim()} = ""`);
      } else if (kind === "Run") {
        steps.push(`await $mutation.${sa.trim()}.call({})`);
      } else if (kind === "ToAssistant") {
        steps.push(`emit "assistant-message" { message: ${sa.trim()} }`);
      } else if (kind === "OpenUrl") {
        steps.push(`js{ window.open(${sa.trim()}, "_blank", "noopener,noreferrer") }`);
      } else if (kind === "Navigate") {
        steps.push(`js{ ctx.host.navigate(${sa.trim()}) }`);
      } else if (kind === "Js") {
        const parts = splitTopLevel(sa);
        const body = parts[0]?.trim() ?? "";
        const unquoted = body.startsWith('"') || body.startsWith("'")
          ? JSON.parse(body.replace(/^'/, '"').replace(/'$/, '"'))
          : body.startsWith("`") ? body.slice(1, -1) : body;
        steps.push(`js{ ${unquoted} }`);
      } else {
        return null;
      }
    }
    return `() => { ${steps.join("; ")} }`;
  });
}


// `Script("id", body, deps?)` → `effect <id> uses { js } on $deps { js{ body } }`.
function rewriteScript(text) {
  // Convert `<name> = Script("id", body, deps?)` (a v1 assignment-style
  // effect declaration) into a top-level `effect <name> uses { js } …`
  // declaration. The assignment's LHS name becomes the effect id so the
  // surrounding template (which often references the LHS by name, e.g.
  // `root = Stack([..., shortcutScript])`) still resolves.
  return text.replace(
    /(^|\n)([ \t]*)([a-zA-Z_]\w*)\s*=\s*Script\(\s*"([\w-]+)"\s*,\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*(?:,\s*\[([^\]]*)\])?\s*\)/g,
    (_m, lead, indent, lhs, _id, body, deps) => {
      const trigger = deps && deps.trim()
        ? `on ${deps.split(",").map((d) => `$${d.trim().replace(/^"|"$/g, "")}`).join(", ")}`
        : "on:mount";
      const bodyText = body.startsWith("`")
        ? body.slice(1, -1)
        : JSON.parse(body);
      return `${lead}${indent}effect ${lhs} uses { js } ${trigger} { js{ ${bodyText} } }`;
    },
  );
}

// Find a `Query("name", argsLit, defaultsLit [, refresh])` call (with balanced
// parens) and rewrite into a top-level `query` + use-site `$query` binding.
// To keep the migration mechanical, we synthesize a `query` declaration
// whose `body` is the original 2nd arg (the request args) and we store the
// 3rd arg (defaults) on a `defaults:` field that we'll fall back to via
// `<binding>.data ?? defaults`. Since `query` blocks in 0.5 don't accept a
// `defaults:` field directly, we instead replace the whole assignment with
// `result = defaultsLit` so the program parses and the demo renders static
// data — Mutation handlers remain as host wiring.
function rewriteQuery(text) {
  return rewriteParenCall(text, "Query", (args) => {
    const parts = splitTopLevel(args);
    if (parts.length < 3) return null;
    const defaults = parts[2].trim();
    return defaults;
  });
}

// Mutation calls live in action bodies (or as variable bindings).
// `xxx = Mutation("name", argsLit)` becomes just `xxx = { call: () => {} }`
// so any `.call(...)` reference in action bodies still parses.
function rewriteMutation(text) {
  return rewriteParenCall(text, "Mutation", () => "({ call: () => null })");
}

// Generic balanced-paren call rewriter.
//
// Treats `\<anything>` (a backslash followed by any char) as an opaque
// pair — needed because the program text lives inside a JS template
// literal where `\`` represents a literal backtick and similar escapes
// might appear. Without this, the parser confuses such escapes with
// string boundaries.
function rewriteParenCall(text, name, fn) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(name + "(", i);
    if (idx === -1) { out.push(text.slice(i)); break; }
    const prev = idx === 0 ? "" : text[idx - 1];
    if (/[a-zA-Z0-9_$]/.test(prev)) {
      out.push(text.slice(i, idx + name.length + 1));
      i = idx + name.length + 1;
      continue;
    }
    out.push(text.slice(i, idx));
    let depth = 1, j = idx + name.length + 1;
    let inStr = false, delim = null;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (ch === "\\") {
          const nxt = text[j + 1];
          // `\"`, `\'`, or `\`` inside a string of the matching delim
          // is the JS-level escape for that delim — it closes the DSL string.
          if (nxt === delim) { inStr = false; j++; continue; }
          j++; continue;
        }
        if (ch === delim) inStr = false;
        continue;
      }
      if (ch === "\\") {
        const nxt = text[j + 1];
        if (nxt === '"' || nxt === "'" || nxt === "`") { inStr = true; delim = nxt; j++; continue; }
        j++; continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { inStr = true; delim = ch; continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") { depth--; if (depth === 0) break; }
    }
    if (j >= text.length) { out.push(text.slice(idx)); break; }
    const argsText = text.slice(idx + name.length + 1, j);
    const replacement = fn(argsText);
    out.push(replacement ?? `${name}(${argsText})`);
    i = j + 1;
  }
  return out.join("");
}

function splitTopLevel(text) {
  const parts = [];
  let cur = "", depth = 0, inStr = false, delim = null;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (inStr) {
      if (ch === "\\") {
        cur += ch;
        const nxt = text[k + 1];
        if (nxt === delim) { inStr = false; cur += nxt; k++; continue; }
        if (k + 1 < text.length) { cur += text[++k]; }
        continue;
      }
      if (ch === delim) inStr = false;
      cur += ch; continue;
    }
    if (ch === "\\") {
      cur += ch;
      const nxt = text[k + 1];
      if (nxt === '"' || nxt === "'" || nxt === "`") { inStr = true; delim = nxt; cur += nxt; k++; continue; }
      if (k + 1 < text.length) { cur += text[++k]; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; delim = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; cur += ch; continue; }
    if (ch === ")" || ch === "]" || ch === "}") { depth--; cur += ch; continue; }
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() || parts.length > 0) parts.push(cur);
  return parts;
}

// `Routes([Route("/", a), Route("*", b)], "/")` → `$router = router { ... }`.
function rewriteRoutes(text) {
  // Match Routes([ Route(...), Route(...), ... ]) optionally followed by a
  // default path. Rewrite to `$router = router { "/path" -> body ... }`.
  return text.replace(
    /Routes\(\s*\[((?:[\s\S](?!Routes\())+?)\]\s*(?:,\s*"[^"]+")?\s*\)/g,
    (_m, arms) => {
      // Extract every Route(path, body) inside the list.
      const out = [];
      let i = 0;
      const s = arms;
      while (i < s.length) {
        const idx = s.indexOf("Route(", i);
        if (idx === -1) break;
        // Find balanced parens.
        let depth = 1, j = idx + "Route(".length;
        let inStr = false, delim = null, esc = false;
        for (; j < s.length; j++) {
          const ch = s[j];
          if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === "\\") { esc = true; continue; }
            if (ch === delim) inStr = false;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === "`") { inStr = true; delim = ch; continue; }
          if (ch === "(") depth++;
          else if (ch === ")") { depth--; if (depth === 0) break; }
        }
        const inner = s.slice(idx + "Route(".length, j);
        // Split into 2 args at top-level comma.
        let dd = 0, ist = false, dlm = null, es2 = false, comma = -1;
        for (let k = 0; k < inner.length; k++) {
          const ch = inner[k];
          if (ist) {
            if (es2) { es2 = false; continue; }
            if (ch === "\\") { es2 = true; continue; }
            if (ch === dlm) ist = false;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === "`") { ist = true; dlm = ch; continue; }
          if (ch === "(" || ch === "[" || ch === "{") dd++;
          else if (ch === ")" || ch === "]" || ch === "}") dd--;
          else if (ch === "," && dd === 0) { comma = k; break; }
        }
        if (comma === -1) { i = j + 1; continue; }
        const pathRaw = inner.slice(0, comma).trim();
        const body = inner.slice(comma + 1).trim();
        // Path may be a string literal or "*" (wildcard).
        let arm = "";
        const pathLit = pathRaw.match(/^"([^"]+)"$/);
        if (pathLit) {
          if (pathLit[1] === "*") arm = `_ -> ${body}`;
          else arm = `"${pathLit[1]}" -> ${body}`;
        } else {
          arm = `${pathRaw} -> ${body}`;
        }
        out.push("  " + arm);
        i = j + 1;
      }
      return `router {\n${out.join("\n")}\n}`;
    },
  );
}

// `name=value` named arg → `name: value`. Only triggers inside a paren/bracket
// context (preceded by `(` or `,` with optional whitespace) to avoid touching
// top-level assignments.
function rewriteNamedArgsV2(text) {
  return text.replace(
    /([(,]\s*)([a-zA-Z_]\w*)=(?![=>])(?=["'`]|-?\d|\[|\{|\$|[a-zA-Z_])/g,
    "$1$2: ",
  );
}

// Apply all the rewrites to a single program-text body.
function rewriteProgram(text) {
  text = rewriteSigils(text);
  text = rewriteFormatters(text);
  text = rewriteConstMemo(text);
  text = rewriteSingleStepAction(text);
  text = rewriteActionChainBalanced(text);
  text = rewriteRoutes(text);
  text = rewriteMacros(text);
  text = rewriteScript(text);
  text = rewriteQuery(text);
  text = rewriteMutation(text);
  // Nested `@`-builtins need a fixed-point loop because each pass only
  // rewrites the outermost call; the next pass picks up the next level.
  const innerPass = (t) => {
    t = rewriteEach(t);
    t = rewriteSwitch(t);
    t = rewriteIf(t);
    t = rewritePush(t);
    t = rewriteConcat(t);
    t = rewriteMap(t);
    t = rewriteTake(t);
    t = rewriteFormatters(t);
    return t;
  };
  let prev = "";
  while (prev !== text) { prev = text; text = innerPass(text); }
  for (const [from, to] of RENAMES) text = text.replace(from, to);
  text = rewriteNamedArgsV2(text);
  return text;
}

// Find every backtick template literal and apply rewriteProgram to its body.
function processFile(path) {
  let src = readFileSync(path, "utf8");
  let out = "";
  let i = 0;
  while (i < src.length) {
    const tickIdx = src.indexOf("`", i);
    if (tickIdx === -1) { out += src.slice(i); break; }
    out += src.slice(i, tickIdx + 1);
    // Find matching close backtick.
    let j = tickIdx + 1;
    let esc = false;
    let depthInterp = 0;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (depthInterp > 0) {
        if (ch === "{") depthInterp++;
        else if (ch === "}") depthInterp--;
        continue;
      }
      if (ch === "$" && src[j + 1] === "{") { depthInterp = 1; j++; continue; }
      if (ch === "`") break;
    }
    const body = src.slice(tickIdx + 1, j);
    // Heuristic: only rewrite bodies that look like program source (contain
    // typical DSL markers). This avoids messing with non-DSL strings.
    // Detect program-shape: only the FIRST non-empty / non-comment line
    // counts. Prose strings inside `lede:` fields tend to start with
    // English words, never with a `$state` / `component` / `<name> =` form.
    const lines = body.split("\n");
    let firstCode = "";
    for (const l of lines) {
      const t = l.trim();
      if (!t) continue;
      if (t.startsWith("#")) continue;
      if (t.startsWith("//")) continue;
      firstCode = t;
      break;
    }
    const looksLikeProgram =
      /^(\$state |\$persist |\$session |\$shared |\$computed |\$query |\$mutation |\$subscription |\$router |\$\$|\$[a-zA-Z_]\w*\s*=|component |action |effect |query |mutation |subscription |theme = |[A-Za-z_]\w*\s*=)/.test(firstCode) &&
      body.length > 100;
    if (process.env.DEBUG_MIGRATE) {
      console.log(`Body len: ${body.length}, firstCode: ${JSON.stringify(firstCode.slice(0, 80))}, looksLikeProgram: ${looksLikeProgram}`);
    }
    if (looksLikeProgram) {
      out += rewriteProgram(body);
    } else {
      out += body;
    }
    out += "`";
    i = j + 1;
  }
  writeFileSync(path, out);
}

for (const f of FILES) {
  processFile(f);
  console.log(`migrated ${f}`);
}
