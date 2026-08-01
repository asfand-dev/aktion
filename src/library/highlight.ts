/**
 * Tiny, dependency-free syntax highlighter (suggestions-global VIII.3).
 *
 * Tokenises a line of code into `{ text, cls }` spans for a handful of common
 * languages. It is intentionally lightweight (a single-pass scanner, not a
 * full parser) — enough to colour keywords, strings, comments, numbers, and
 * punctuation in docs/snippets without pulling in a 200 KB grammar engine.
 * Output is always plain text segments, so the caller can build DOM spans
 * safely (no HTML injection).
 */

export interface HlToken {
  text: string;
  /** Token class suffix (`rui-hl-<cls>`), or null for plain text. */
  cls: string | null;
}

const KEYWORDS: Record<string, Set<string>> = {
  js: new Set([
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "new", "class", "extends", "super", "this",
    "import", "export", "from", "default", "try", "catch", "finally", "throw", "typeof",
    "instanceof", "in", "of", "await", "async", "yield", "delete", "void", "null",
    "undefined", "true", "false", "interface", "type", "enum", "public", "private",
    "protected", "readonly", "static", "as", "implements", "namespace",
  ]),
  py: new Set([
    "def", "return", "if", "elif", "else", "for", "while", "import", "from", "as",
    "class", "try", "except", "finally", "raise", "with", "lambda", "yield", "pass",
    "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False",
    "global", "nonlocal", "async", "await", "self",
  ]),
  css: new Set([]),
  json: new Set(["true", "false", "null"]),
};

function langFamily(lang: string): "js" | "py" | "css" | "json" | "html" | "generic" {
  const l = lang.toLowerCase();
  // Aktion is a strict subset of JavaScript, so the JS tokenizer fits it.
  if (["js", "jsx", "ts", "tsx", "javascript", "typescript", "mjs", "cjs", "aktion"].includes(l)) return "js";
  if (["py", "python"].includes(l)) return "py";
  if (["css", "scss", "less"].includes(l)) return "css";
  if (["json", "jsonc"].includes(l)) return "json";
  if (["html", "xml", "svg", "vue"].includes(l)) return "html";
  return "generic";
}

const IDENT = /[A-Za-z_$][\w$]*/y;
const NUMBER = /0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?/y;
const WS = /\s+/y;

/** Tokenise one line. `state` carries an open block-comment flag across lines. */
/**
 * Longest line the highlighter will tokenise. The HTML tokeniser's regex has
 * super-linear cost on pathological input (a long run of unbalanced quotes or
 * an unterminated comment), so a single very long line of untrusted code — an
 * LLM response, a pasted payload — could otherwise block the render thread for
 * seconds. Past this length the line renders as plain, unhighlighted text,
 * which is a cosmetic loss rather than a correctness one.
 */
const MAX_HIGHLIGHT_LINE_LENGTH = 4096;

export function highlightLine(
  line: string,
  lang: string,
  state: { inBlockComment: boolean },
): HlToken[] {
  if (line.length > MAX_HIGHLIGHT_LINE_LENGTH) return [{ text: line, cls: null }];
  const family = langFamily(lang);
  if (family === "html") return highlightHtmlLine(line);
  const tokens: HlToken[] = [];
  const keywords = KEYWORDS[family === "generic" ? "js" : family] ?? KEYWORDS.js!;
  let i = 0;
  const n = line.length;

  const push = (text: string, cls: string | null): void => {
    if (text) tokens.push({ text, cls });
  };

  while (i < n) {
    // Continue an open block comment.
    if (state.inBlockComment) {
      const close = line.indexOf("*/", i);
      if (close === -1) { push(line.slice(i), "comment"); i = n; break; }
      push(line.slice(i, close + 2), "comment");
      i = close + 2;
      state.inBlockComment = false;
      continue;
    }
    const ch = line[i]!;
    const two = line.slice(i, i + 2);

    // Line comments.
    if ((family === "py" && ch === "#") || ((family === "js" || family === "css" || family === "generic") && two === "//")) {
      push(line.slice(i), "comment");
      break;
    }
    // Block comments (/* … */).
    if ((family === "js" || family === "css" || family === "generic") && two === "/*") {
      const close = line.indexOf("*/", i + 2);
      if (close === -1) { push(line.slice(i), "comment"); state.inBlockComment = true; i = n; break; }
      push(line.slice(i, close + 2), "comment");
      i = close + 2;
      continue;
    }
    // Strings (', ", `).
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (line[j] === "\\") { j += 2; continue; }
        if (line[j] === ch) { j += 1; break; }
        j += 1;
      }
      push(line.slice(i, j), "string");
      i = j;
      continue;
    }
    // Whitespace.
    WS.lastIndex = i;
    const wsm = WS.exec(line);
    if (wsm && wsm.index === i) { push(wsm[0], null); i += wsm[0].length; continue; }
    // Numbers.
    NUMBER.lastIndex = i;
    const numm = NUMBER.exec(line);
    if (numm && numm.index === i && numm[0]) { push(numm[0], "number"); i += numm[0].length; continue; }
    // Identifiers / keywords.
    IDENT.lastIndex = i;
    const idm = IDENT.exec(line);
    if (idm && idm.index === i) {
      const word = idm[0];
      // A function-call name (ident followed by `(`) gets the "fn" class.
      const after = line[i + word.length];
      if (keywords.has(word)) push(word, "keyword");
      else if (after === "(") push(word, "fn");
      else push(word, null);
      i += word.length;
      continue;
    }
    // Punctuation / operators — single char.
    push(ch, "punct");
    i += 1;
  }
  return tokens;
}

/** Minimal HTML/XML tokeniser: tags, attribute names, strings. */
function highlightHtmlLine(line: string): HlToken[] {
  const tokens: HlToken[] = [];
  const re = /(<\/?[\w-]+)|(\/?>)|([\w-]+)(?==)|("[^"]*"|'[^']*')|(<!--.*?-->)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) tokens.push({ text: line.slice(last, m.index), cls: null });
    if (m[1]) tokens.push({ text: m[1], cls: "tag" });
    else if (m[2]) tokens.push({ text: m[2], cls: "tag" });
    else if (m[3]) tokens.push({ text: m[3], cls: "attr" });
    else if (m[4]) tokens.push({ text: m[4], cls: "string" });
    else if (m[5]) tokens.push({ text: m[5], cls: "comment" });
    last = re.lastIndex;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), cls: null });
  return tokens;
}

/** True when `lang` is a language we can meaningfully highlight. */
export function isHighlightable(lang: string): boolean {
  return langFamily(lang) !== "generic" || lang.length > 0;
}
