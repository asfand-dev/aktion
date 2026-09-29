/**
 * Aktion DevTools — code rendering.
 *
 * A highlighter for the Aktion DSL, a virtualised read-only code view with
 * diagnostics on their lines, and an overlay editor with live highlighting.
 *
 * The highlighter is intentionally separate from the runtime's lexer. Colour is
 * a presentation concern, it has to tolerate half-typed programs (an unclosed
 * template while you are typing), and it needs comments — which the runtime
 * lexer discards. Validity is never decided here: the Source view asks the
 * runtime (`analyzeProgram`) whether a program parses, so the colours and the
 * verdict can disagree only about colour.
 */

import { h, render, unmountAll, Widget, type Child, type VElement, type VNode } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";

/** One coloured run of text within a line. */
export interface Tok {
  /** Class suffix: `kw` `str` `tpl` `num` `state` `comp` `fn` `com` `punc` `op` `prop` `bool`, or `""`. */
  t: string;
  v: string;
}

const KEYWORDS = new Set([
  "function", "import", "export", "from", "as", "if", "else", "switch", "case", "break", "continue", "for",
  "while", "do", "of", "in", "let", "var", "const", "await", "async", "return", "default", "try", "catch",
  "finally", "throw", "new", "typeof", "instanceof", "delete", "void", "match", "this",
]);
const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);
const OPERATORS = ["===", "!==", "**=", "...", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "+", "-", "*", "/", "%", "=", "<", ">", "!", "?", "&", "|", "^", "~", ":"];
const PUNCT = new Set(["(", ")", "[", "]", "{", "}", ",", ";", "."]);

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[\w]/;

/**
 * Tokenise `source` into lines of coloured runs. Never throws and always
 * returns exactly `source.split("\n").length` lines, whatever the input.
 */
export function highlightLines(source: string): Tok[][] {
  const lines: Tok[][] = [[]];
  const push = (t: string, v: string): void => {
    if (v === "") return;
    // Split any run that crosses a newline (block comments, templates).
    const parts = v.split("\n");
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) lines.push([]);
      const part = parts[i]!;
      if (part === "") continue;
      const line = lines[lines.length - 1]!;
      const last = line[line.length - 1];
      if (last && last.t === t) last.v += part;
      else line.push({ t, v: part });
    }
  };

  // Mode stack: "code" (with a brace depth, for `${ … }`) or "tpl".
  const stack: Array<{ mode: "code" | "tpl"; depth: number }> = [{ mode: "code", depth: 0 }];
  let lastSignificant = "";
  let i = 0;
  const n = source.length;

  const peekNonSpace = (from: number): string => {
    let j = from;
    while (j < n && (source[j] === " " || source[j] === "\t")) j += 1;
    return source[j] ?? "";
  };

  while (i < n) {
    const frame = stack[stack.length - 1]!;
    const c = source[i]!;

    if (frame.mode === "tpl") {
      let j = i;
      let buf = "";
      while (j < n) {
        const ch = source[j]!;
        if (ch === "\\" && j + 1 < n) { buf += ch + source[j + 1]; j += 2; continue; }
        if (ch === "`") break;
        if (ch === "$" && source[j + 1] === "{") break;
        buf += ch;
        j += 1;
      }
      push("tpl", buf);
      i = j;
      if (i >= n) break;
      if (source[i] === "`") {
        push("tpl", "`");
        stack.pop();
        i += 1;
        lastSignificant = "`";
      } else {
        push("punc", "${");
        stack.push({ mode: "code", depth: 0 });
        i += 2;
        lastSignificant = "{";
      }
      continue;
    }

    // ---- code mode ----
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      let j = i;
      while (j < n && (source[j] === " " || source[j] === "\t" || source[j] === "\n" || source[j] === "\r")) j += 1;
      push("", source.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      let j = source.indexOf("\n", i);
      if (j < 0) j = n;
      push("com", source.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      let j = source.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      push("com", source.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      if (source[j] === c) j += 1;
      push("str", source.slice(i, j));
      i = j;
      lastSignificant = "str";
      continue;
    }
    if (c === "`") {
      push("tpl", "`");
      stack.push({ mode: "tpl", depth: 0 });
      i += 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?n?)/.exec(source.slice(i, i + 40));
      const text = match?.[0] || c;
      push("num", text);
      i += text.length;
      lastSignificant = "num";
      continue;
    }
    if (c === "$" || IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(source[j]!)) j += 1;
      const word = source.slice(i, j);
      const next = peekNonSpace(j);
      let t = "";
      if (word.startsWith("$")) t = next === "(" ? "fn" : "state";
      else if (KEYWORDS.has(word)) t = "kw";
      else if (LITERALS.has(word)) t = "bool";
      else if (next === ":" && (lastSignificant === "{" || lastSignificant === ",")) t = "prop";
      else if (/^[A-Z]/.test(word)) t = "comp";
      else if (next === "(") t = "fn";
      else if (lastSignificant === ".") t = "prop";
      push(t, word);
      i = j;
      lastSignificant = word;
      continue;
    }
    if (c === "{") {
      frame.depth += 1;
      push("punc", c);
      i += 1;
      lastSignificant = "{";
      continue;
    }
    if (c === "}") {
      if (frame.depth === 0 && stack.length > 1) {
        push("punc", "}");
        stack.pop();
        i += 1;
        lastSignificant = "}";
        continue;
      }
      frame.depth = Math.max(0, frame.depth - 1);
      push("punc", c);
      i += 1;
      lastSignificant = "}";
      continue;
    }
    if (PUNCT.has(c) && !(c === "." && source.startsWith("...", i))) {
      push("punc", c);
      i += 1;
      lastSignificant = c;
      continue;
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (op) {
      push("op", op);
      i += op.length;
      lastSignificant = op === ":" ? ":" : op;
      continue;
    }
    push("", c);
    i += 1;
  }
  // `split("\n")` semantics: trailing newline means a trailing empty line.
  const expected = source.split("\n").length;
  while (lines.length < expected) lines.push([]);
  return lines;
}

/* -------------------------------------------------------------------------- */
/*  Line rendering                                                             */
/* -------------------------------------------------------------------------- */

/** Case-insensitive match ranges of `needle` in `text`. */
function matchRanges(text: string, needle: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (!needle) return out;
  const hay = text.toLowerCase();
  const q = needle.toLowerCase();
  let from = 0;
  while (from <= hay.length) {
    const found = hay.indexOf(q, from);
    if (found < 0) break;
    out.push([found, found + q.length]);
    from = found + Math.max(1, q.length);
  }
  return out;
}

/** Render one line's tokens, splitting runs at search-match boundaries so matches keep their colour. */
export function renderTokens(tokens: ReadonlyArray<Tok>, search = ""): Child[] {
  const plain = tokens.map((tok) => tok.v).join("");
  const ranges = matchRanges(plain, search.trim());
  if (ranges.length === 0) {
    return tokens.map((tok) => (tok.t ? h("span", { class: `tok-${tok.t}` }, tok.v) : tok.v));
  }
  const out: Child[] = [];
  let offset = 0;
  let r = 0;
  for (const tok of tokens) {
    let start = 0;
    while (start < tok.v.length) {
      const abs = offset + start;
      while (r < ranges.length && ranges[r]![1] <= abs) r += 1;
      const range = ranges[r];
      let end = tok.v.length;
      let inMatch = false;
      if (range) {
        if (abs >= range[0]) {
          inMatch = true;
          end = Math.min(end, range[1] - offset);
        } else {
          end = Math.min(end, range[0] - offset);
        }
      }
      const text = tok.v.slice(start, end);
      const node: Child = tok.t ? h("span", { class: `tok-${tok.t}` }, text) : text;
      out.push(inMatch ? h("mark", {}, node) : node);
      start = end;
    }
    offset += tok.v.length;
  }
  return out;
}

export interface LineMarker {
  severity: "error" | "warn";
  message: string;
}

export interface CodeViewOptions {
  lines: ReadonlyArray<ReadonlyArray<Tok>>;
  markers?: ReadonlyMap<number, LineMarker>;
  /** 1-based. */
  focusLine?: number | null;
  search?: string;
  onLineClick?: (line: number) => void;
  rowHeight?: number;
  testid?: string;
  /** Number shown for the first line (for excerpts). */
  firstLine?: number;
  /** Render every line without virtualisation (short excerpts). */
  inline?: boolean;
  version?: unknown;
  /** Show diagnostic messages at the end of their line. */
  lens?: boolean;
}

const LINE_HEIGHT = 19;

function codeLine(options: CodeViewOptions, index: number): VElement {
  const lineNo = (options.firstLine ?? 1) + index;
  const tokens = options.lines[index] ?? [];
  const marker = options.markers?.get(lineNo);
  const search = options.search ?? "";
  const hit = search.trim() !== "" && tokens.map((t) => t.v).join("").toLowerCase().includes(search.trim().toLowerCase());
  return h(
    "div",
    {
      class: [
        "code-line",
        options.focusLine === lineNo ? "is-focus" : "",
        hit ? "is-hit" : "",
        marker ? (marker.severity === "error" ? "is-error" : "is-warn") : "",
      ],
      "data-line": lineNo,
      onClick: options.onLineClick ? () => options.onLineClick!(lineNo) : undefined,
    },
    h("span", { class: "code-gutter", "data-tip": marker?.message },
      marker ? h("span", { class: `mark t-${marker.severity}` }) : null,
      String(lineNo)),
    h("span", { class: "code-text" },
      ...renderTokens(tokens, search),
      tokens.length === 0 ? " " : null,
      marker && options.lens !== false ? h("span", { class: `code-diag t-${marker.severity}` }, marker.message) : null),
  );
}

/** A read-only, syntax-highlighted code view. */
export function codeView(options: CodeViewOptions): VNode {
  if (options.inline) {
    return h("div", { class: "code", "data-dt": options.testid }, ...options.lines.map((_, index) => codeLine(options, index)));
  }
  const indices = options.lines.map((_, i) => i);
  const focusIndex = options.focusLine ? options.focusLine - (options.firstLine ?? 1) : null;
  let cols = 0;
  for (const line of options.lines) {
    let width = 0;
    for (const tok of line) width += tok.v.length + (tok.v.split("\t").length - 1);
    if (width > cols) cols = width;
  }
  return h("div", { class: "code-scroll", style: { "--code-cols": String(cols) } }, virtualList({
    items: indices,
    rowHeight: options.rowHeight ?? LINE_HEIGHT,
    renderRow: (index) => codeLine(options, index),
    rowKey: (index) => index,
    className: "code",
    testid: options.testid,
    version: [options.lines, options.markers, options.focusLine, options.search, options.version],
    scrollTo: focusIndex,
    overscan: 12,
    role: "list",
    ariaLabel: "Program source",
  }));
}

/* -------------------------------------------------------------------------- */
/*  Editor                                                                     */
/* -------------------------------------------------------------------------- */

export interface CodeEditorProps {
  value: string;
  /** Every edit. The editor owns its text; this is a notification. */
  onChange: (text: string) => void;
  /** Ctrl/⌘ + Enter or Ctrl/⌘ + S. */
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  markers?: ReadonlyMap<number, LineMarker>;
  testid?: string;
  label?: string;
}

/** Programs larger than this edit as plain text: highlighting every keystroke would lag. */
const HIGHLIGHT_LIMIT = 200_000;

/**
 * Overlay editor: a transparent `<textarea>` over a highlighted `<pre>`.
 *
 * The textarea is the real editor — selection, IME, undo, spellcheck-off, and
 * every platform shortcut work because it IS the platform's editor. The layer
 * underneath only paints. Both share one font, one line height, and one
 * padding, and the layer follows the textarea's scroll, so the caret always
 * sits on the character it looks like it sits on.
 */
export class CodeEditor extends Widget<CodeEditorProps> {
  private textarea!: HTMLTextAreaElement;
  private layer!: HTMLElement;
  private gutter!: HTMLElement;
  private painted = "";
  private framePending = false;

  mount(): Element {
    const root = document.createElement("div");
    root.className = "editor";
    if (this.props.testid) root.setAttribute("data-dt", this.props.testid);
    this.gutter = document.createElement("div");
    this.gutter.className = "editor-gutter";
    this.gutter.setAttribute("aria-hidden", "true");
    this.layer = document.createElement("pre");
    this.layer.className = "editor-layer code";
    this.layer.setAttribute("aria-hidden", "true");
    this.textarea = document.createElement("textarea");
    this.textarea.className = "editor-input";
    this.textarea.spellcheck = false;
    this.textarea.setAttribute("autocapitalize", "off");
    this.textarea.setAttribute("autocomplete", "off");
    this.textarea.setAttribute("aria-label", this.props.label ?? "Program source");
    this.textarea.setAttribute("data-dt", "editor-input");
    this.textarea.value = this.props.value;
    this.textarea.addEventListener("input", () => {
      this.props.onChange(this.textarea.value);
      this.schedulePaint();
    });
    this.textarea.addEventListener("scroll", () => this.syncScroll());
    this.textarea.addEventListener("keydown", (event) => this.onKeyDown(event));
    root.append(this.gutter, this.layer, this.textarea);
    this.paint();
    return root;
  }

  override update(previous: CodeEditorProps): void {
    // An external replacement (Revert, a history version) — not the echo of our own typing.
    if (this.props.value !== previous.value && this.props.value !== this.textarea.value) {
      this.textarea.value = this.props.value;
      this.paint();
    } else if (this.props.markers !== previous.markers) {
      this.paint(true);
    }
  }

  override unmount(): void {
    unmountAll(this.layer);
    unmountAll(this.gutter);
  }

  focus(): void {
    this.textarea.focus();
  }

  private schedulePaint(): void {
    if (this.framePending) return;
    this.framePending = true;
    const run = (): void => {
      this.framePending = false;
      this.paint();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  private paint(force = false): void {
    const text = this.textarea.value;
    if (!force && text === this.painted) return;
    this.painted = text;
    const lines = text.length > HIGHLIGHT_LIMIT ? text.split("\n").map((v) => [{ t: "", v }]) : highlightLines(text);
    const markers = this.props.markers;
    render(this.layer, lines.map((tokens, i) => {
      const marker = markers?.get(i + 1);
      return h("div", { class: ["editor-line", marker ? (marker.severity === "error" ? "is-error" : "is-warn") : ""] },
        ...renderTokens(tokens), "​");
    }));
    render(this.gutter, lines.map((_, i) => {
      const marker = markers?.get(i + 1);
      return h("div", { class: "editor-num", "data-tip": marker?.message },
        marker ? h("span", { class: `mark t-${marker.severity}` }) : null, String(i + 1));
    }));
    this.syncScroll();
  }

  private syncScroll(): void {
    this.layer.scrollTop = this.textarea.scrollTop;
    this.layer.scrollLeft = this.textarea.scrollLeft;
    this.gutter.scrollTop = this.textarea.scrollTop;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && (event.key === "Enter" || event.key.toLowerCase() === "s")) {
      event.preventDefault();
      this.props.onSubmit?.(this.textarea.value);
      return;
    }
    if (event.key === "Escape") {
      if (this.props.onCancel) {
        event.preventDefault();
        event.stopPropagation();
        this.props.onCancel();
      }
      return;
    }
    const ta = this.textarea;
    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart: start, selectionEnd: end, value } = ta;
      if (event.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        if (value.startsWith("  ", lineStart)) {
          ta.setRangeText("", lineStart, lineStart + 2, "end");
          ta.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
        }
      } else {
        ta.setRangeText("  ", start, end, "end");
      }
      this.props.onChange(ta.value);
      this.schedulePaint();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !mod) {
      // Keep the current line's indentation, and indent one step after an opener.
      const { selectionStart: start, value } = ta;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, start))?.[0] ?? "";
      const before = value.slice(lineStart, start).trimEnd();
      const extra = /[[({]$/.test(before) ? "  " : "";
      event.preventDefault();
      ta.setRangeText(`\n${indent}${extra}`, start, ta.selectionEnd, "end");
      this.props.onChange(ta.value);
      this.schedulePaint();
    }
  }
}

export function codeEditor(props: CodeEditorProps & { key?: string }): VNode {
  return h(CodeEditor, props);
}
