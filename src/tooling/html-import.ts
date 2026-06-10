/**
 * HTML → Aktion importer (suggestions-global XIV.1).
 *
 * A pragmatic codemod that converts a chunk of static HTML into an equivalent
 * Aktion program string, mapping common tags to the closest library component.
 * It is not a 1:1 fidelity tool — it gives authors a running head-start that
 * they then refine. Parsing uses the DOM when available (browsers / jsdom /
 * happy-dom) and falls back to a tiny tag tokenizer in pure-Node contexts.
 *
 *   import { htmlToAktion } from "aktion-runtime/tooling";
 *   const program = htmlToAktion("<section><h1>Hi</h1><p>Body</p></section>");
 *   // → $app(Section([Heading("Hi"), Text("Body")]))
 */

import { tailwindToSx } from "./schema.js";

interface ImportNode {
  tag: string;
  attrs: Record<string, string>;
  children: ImportNode[];
  text?: string;
}

const VOID_TAGS = new Set(["img", "input", "br", "hr", "meta", "link", "source", "area", "base", "col", "embed", "param", "track", "wbr"]);
const SKIP_TAGS = new Set(["script", "style", "head", "meta", "link", "title", "noscript"]);

/** Heading level → Aktion. */
function headingFor(tag: string, text: string): string {
  const level = Number(tag[1]);
  if (level === 1) return `Display(${q(text)})`;
  if (level === 2) return `Heading(${q(text)})`;
  return `Heading(${q(text)}, { level: ${level} })`;
}

const INLINE_TEXT_TAGS = new Set(["span", "p", "strong", "em", "b", "i", "small", "label", "figcaption", "blockquote", "code", "pre", "td", "th", "caption"]);

/** Quote + escape a string for embedding in Aktion source. */
function q(s: string): string {
  return JSON.stringify(s.replace(/\s+/g, " ").trim());
}

/** Collect the immediate text of a node (ignoring nested element text). */
function ownText(node: ImportNode): string {
  if (node.text != null) return node.text;
  return node.children.filter((c) => c.tag === "#text").map((c) => c.text ?? "").join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Resolve a node's `class` attribute into the closest sx object (XIV.1+2):
 * Tailwind-ish utilities become `sx` tokens; unrecognised classes are kept
 * under `className` so no styling intent is silently dropped.
 */
function classToOpts(node: ImportNode): { sx: Record<string, unknown>; rest: string } {
  const cls = node.attrs.class ?? "";
  if (!cls.trim()) return { sx: {}, rest: "" };
  const sx = tailwindToSx(cls);
  const unmapped = Array.isArray(sx._unmapped) ? (sx._unmapped as string[]) : [];
  delete sx._unmapped;
  return { sx, rest: unmapped.join(" ") };
}

/** Serialize sx + leftover classes into a `, { ... }` opts suffix. */
function optsSuffix(sx: Record<string, unknown>, rest: string): string {
  const parts: string[] = [];
  if (Object.keys(sx).length > 0) parts.push(`sx: ${JSON.stringify(sx)}`);
  if (rest) parts.push(`className: ${q(rest)}`);
  return parts.length > 0 ? `, { ${parts.join(", ")} }` : "";
}

/**
 * Pick the container component for a block element: `flex` classes map to
 * `Row`/`Column` (Tailwind's default flex direction is row), everything else
 * stays a `Stack`. The display/direction keys the component already implies
 * are dropped from the sx.
 */
function containerFor(node: ImportNode, childList: string): string {
  const { sx, rest } = classToOpts(node);
  let name = "Stack";
  if (sx.display === "flex") {
    name = sx.direction === "column" || sx.direction === "column-reverse" ? "Column" : "Row";
    delete sx.display;
    if (typeof sx.direction === "string") delete sx.direction;
  }
  return `${name}(${childList || "[]"}${optsSuffix(sx, rest)})`;
}

/** Convert one node to an Aktion expression string (or null to skip). */
function convertNode(node: ImportNode): string | null {
  if (node.tag === "#text") {
    const t = (node.text ?? "").replace(/\s+/g, " ").trim();
    return t ? `Text(${q(t)})` : null;
  }
  const tag = node.tag.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  const kids = node.children.map(convertNode).filter((x): x is string => x != null);
  const childList = kids.length > 0 ? `[${kids.join(", ")}]` : "";

  switch (tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return headingFor(tag, ownText(node) || textOfSubtree(node));
    case "p":
      return `Text(${q(textOfSubtree(node))})`;
    case "a": {
      const href = node.attrs.href ?? "#";
      return `Link(${q(textOfSubtree(node))}, { href: ${q(href)} })`;
    }
    case "img":
      return `Image(${q(node.attrs.src ?? "")}, { alt: ${q(node.attrs.alt ?? "")} })`;
    case "button":
      return `Button(${q(textOfSubtree(node))})`;
    case "ul": case "ol":
      return `Stack(${childList || "[]"})`;
    case "li":
      return `Text(${q(textOfSubtree(node))})`;
    case "section": {
      const { sx, rest } = classToOpts(node);
      return `Section(${childList || "[]"}${optsSuffix(sx, rest)})`;
    }
    case "nav":
      return `NavBar(${childList || "[]"})`;
    case "header": case "footer": case "main": case "article": case "aside": case "div": case "form":
      return containerFor(node, childList);
    case "span": case "strong": case "em": case "b": case "i": case "small": case "label":
      return `Text(${q(textOfSubtree(node))})`;
    case "br":
      return null;
    case "input":
      return `Input(${q(node.attrs.name ?? node.attrs.id ?? "field")}, { placeholder: ${q(node.attrs.placeholder ?? "")} })`;
    case "textarea":
      return `TextArea(${q(node.attrs.name ?? node.attrs.id ?? "field")}, { placeholder: ${q(node.attrs.placeholder ?? "")} })`;
    case "table":
      return `Stack(${childList || "[]"})`;
    case "tr":
      return `Row(${childList || "[]"})`;
    case "td": case "th":
      return `Text(${q(textOfSubtree(node))})`;
    case "blockquote":
      return `Quote(${q(textOfSubtree(node))})`;
    case "code": case "pre":
      return `CodeBlock(${q(textOfSubtree(node))})`;
    case "hr":
      return `Separator()`;
    default:
      // Unknown tag → a Stack wrapper so children survive.
      return kids.length > 0 ? `Stack(${childList})` : (ownText(node) ? `Text(${q(ownText(node))})` : null);
  }
}

/** Flattened text of a node and its descendants. */
function textOfSubtree(node: ImportNode): string {
  if (node.tag === "#text") return node.text ?? "";
  if (INLINE_TEXT_TAGS.has(node.tag.toLowerCase()) || node.children.every((c) => c.tag === "#text")) {
    return node.children.map(textOfSubtree).join(" ").replace(/\s+/g, " ").trim();
  }
  return ownText(node);
}

/** Parse HTML into ImportNodes via the DOM when available. */
function parseWithDom(html: string): ImportNode[] | null {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const toNode = (n: Node): ImportNode => {
      if (n.nodeType === 3) return { tag: "#text", attrs: {}, children: [], text: n.textContent ?? "" };
      const eln = n as Element;
      const attrs: Record<string, string> = {};
      for (const a of Array.from(eln.attributes ?? [])) attrs[a.name] = a.value;
      return {
        tag: eln.tagName.toLowerCase(),
        attrs,
        children: Array.from(eln.childNodes).map(toNode),
      };
    };
    return Array.from(doc.body.childNodes).map(toNode);
  } catch {
    return null;
  }
}

/** Minimal fallback tokenizer for environments without a DOM. */
function parseFallback(html: string): ImportNode[] {
  const roots: ImportNode[] = [];
  const stack: ImportNode[] = [];
  const push = (node: ImportNode): void => {
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.children.push(node);
  };
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) { // close tag
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.tag === m[1]!.toLowerCase()) { stack.length = i; break; }
      }
    } else if (m[2]) { // open tag
      const tag = m[2].toLowerCase();
      const attrs: Record<string, string> = {};
      const attrRe = /([\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
      let am: RegExpExecArray | null;
      while ((am = attrRe.exec(m[3] ?? "")) !== null) {
        attrs[am[1]!] = (am[2] ?? "").replace(/^["']|["']$/g, "");
      }
      const node: ImportNode = { tag, attrs, children: [] };
      push(node);
      if (!VOID_TAGS.has(tag) && m[4] !== "/") stack.push(node);
    } else if (m[5]) { // text
      const text = m[5];
      if (text.trim()) push({ tag: "#text", attrs: {}, children: [], text });
    }
  }
  return roots;
}

/**
 * Convert an HTML string to an Aktion program. The result is wrapped in
 * `$app(...)`; a single root renders directly, multiple roots become a
 * `Column([...])`.
 */
export function htmlToAktion(html: string): string {
  const input = typeof html === "string" ? html : "";
  const nodes = parseWithDom(input) ?? parseFallback(input);
  const exprs = nodes.map(convertNode).filter((x): x is string => x != null);
  if (exprs.length === 0) return `$app(Text(""))`;
  if (exprs.length === 1) return `$app(${exprs[0]})`;
  return `$app(Column([\n  ${exprs.join(",\n  ")}\n]))`;
}
