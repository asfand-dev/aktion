/**
 * Design tree -> Aktion program text.
 *
 * The same generator powers three surfaces:
 *  - the canvas renderer (editor mode: every node is wrapped in a
 *    `display: contents` HTMLTag carrying `data-node-id`, giving the editor
 *    pixel-accurate hit-testing and selection overlays with zero layout cost);
 *  - the code panel / .aktion export (clean mode, pretty-printed);
 *  - the preview + PNG/SVG export pipeline (clean mode).
 *
 * Prop typing comes from Aktion's own `componentSchema()` (see schema.ts), so
 * any component added to Aktion is supported here automatically.
 */
import type { DesignDocument, DesignNode, Frame, PropValue } from "./types";
import { isExprValue } from "./types";
import type { SchemaIndex } from "./schema";

export interface CodegenOptions {
  /** Wrap nodes in data-node-id carriers for canvas hit-testing. */
  editor?: boolean;
  /** Print symbol instances as `SymbolFn()` calls instead of inlining. */
  symbolsAsCalls?: boolean;
  /** Theme name baked into the program (used by preview/export). */
  theme?: string;
}

/**
 * Style for the absolute-position wrapper of a freely-placed node. The
 * wrapper is the node's real box: with an explicit width children stretch to
 * fill it, without one it shrink-wraps its content — Figma-like semantics on
 * plain CSS.
 */
function layoutWrapperStyle(layout: NonNullable<DesignNode["layout"]>): string {
  const parts = [
    "position: absolute",
    `left: ${Math.round(layout.x)}px`,
    `top: ${Math.round(layout.y)}px`,
    "display: flex",
    "flex-direction: column",
    "align-items: stretch",
  ];
  if (layout.width !== undefined) parts.push(`width: ${Math.round(layout.width)}px`);
  if (layout.height !== undefined) parts.push(`height: ${Math.round(layout.height)}px`);
  return parts.join("; ");
}

/**
 * Editor-only placeholder rendered inside empty layout containers so they
 * stay visible, selectable, and easy to drop into. Never emitted in clean /
 * export mode.
 */
function containerPlaceholder(componentName: string, depth: number): string {
  const style =
    "min-height: 56px; min-width: 96px; flex: 1 1 auto; align-self: stretch; " +
    "display: flex; align-items: center; justify-content: center; " +
    "border: 1.5px dashed rgba(120, 132, 156, 0.55); border-radius: 8px; " +
    "color: rgba(120, 132, 156, 0.9); font-size: 12px; " +
    "font-family: system-ui, sans-serif; padding: 8px 14px; pointer-events: none";
  const pad = INDENT.repeat(depth + 1);
  return `HTMLTag("div", { attributes: { style: ${JSON.stringify(style)}, "data-placeholder": "1" }, children: [${JSON.stringify(`${componentName} — drop components here`)}] })${pad ? "" : ""}`;
}

const INDENT = "  ";

// ---------------------------------------------------------------------------
// Value printing — prop values are JSON, which is a strict subset of Aktion.
// ---------------------------------------------------------------------------

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function printValue(value: PropValue, depth = 0): string {
  if (isExprValue(value)) return value.$expr.trim();
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
      return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => printValue(v as PropValue, depth + 1));
    return wrapList("[", items, "]", depth);
  }
  const entries = Object.entries(value).map(([k, v]) => {
    const key = IDENT_RE.test(k) ? k : JSON.stringify(k);
    return `${key}: ${printValue(v as PropValue, depth + 1)}`;
  });
  if (entries.length === 0) return "{}";
  return wrapList("{ ", entries, " }", depth);
}

function wrapList(open: string, items: string[], close: string, depth: number): string {
  const oneLine = `${open}${items.join(", ")}${close}`;
  if (oneLine.length <= 72 && !oneLine.includes("\n")) return oneLine;
  const pad = INDENT.repeat(depth + 1);
  const padEnd = INDENT.repeat(depth);
  return `${open.trim()}\n${pad}${items.join(`,\n${pad}`)}\n${padEnd}${close.trim()}`;
}

// ---------------------------------------------------------------------------
// Node -> expression
// ---------------------------------------------------------------------------

function nodeExpr(
  node: DesignNode,
  doc: DesignDocument,
  schema: SchemaIndex,
  opts: CodegenOptions,
  depth: number,
): string | null {
  if (!node.visible) return null;

  if (node.type === "instance") {
    const symbol = doc.symbols.find((s) => s.id === node.symbolId);
    if (!symbol) return null;
    if (opts.symbolsAsCalls) {
      return withPlacement(node, `${symbolFnName(symbol.name, symbol.id)}()`, null, depth);
    }
    // Instances are atomic on the canvas: the wrapper carries the INSTANCE id
    // so hit-testing selects the instance, never the symbol internals.
    const inner = nodeExpr(
      { ...symbol.root, visible: true },
      doc,
      schema,
      { ...opts, editor: false },
      depth,
    );
    if (!inner) return null;
    return withPlacement(node, inner, opts.editor ? node.id : null, depth);
  }

  const component = node.component ?? "Column";
  const info = schema.byName.get(component);
  const positional = info?.positional ?? null;
  // Children map into the positional slot when it accepts nodes OR
  // component-typed items (AccordionItem[], BentoCell[], ...).
  const positionalIsNode =
    positional != null &&
    (info?.positionalIsChildSlot ?? /Node/.test(positional.type));

  // Named props (skip the positional one — it is emitted as the bare arg).
  const named: string[] = [];
  for (const [key, value] of Object.entries(node.props)) {
    if (value === undefined) continue;
    if (positional && key === positional.name) continue;
    const printed = printValue(value, depth + 1);
    const propKey = IDENT_RE.test(key) ? key : JSON.stringify(key);
    named.push(`${propKey}: ${printed}`);
  }

  // Children -> the node-typed positional slot; otherwise a `children` prop
  // if the component declares one.
  const childExprs = node.children
    .map((c) => {
      const expr = nodeExpr(c, doc, schema, opts, depth + 1);
      return expr;
    })
    .filter((e): e is string => e !== null);

  // Editor-only: keep empty layout containers visible and droppable.
  if (
    opts.editor &&
    positionalIsNode &&
    childExprs.length === 0 &&
    node.props[positional.name] === undefined &&
    info?.acceptsChildren
  ) {
    childExprs.push(containerPlaceholder(component, depth + 1));
  }

  let positionalArg: string | null = null;
  if (positionalIsNode && childExprs.length > 0) {
    positionalArg = wrapList("[", childExprs, "]", depth);
  } else if (positional && node.props[positional.name] !== undefined) {
    positionalArg = printValue(node.props[positional.name], depth + 1);
  } else if (!positionalIsNode && childExprs.length > 0) {
    const childrenProp = info?.props.find(
      (p) => p.name === "children" && /Node/.test(p.type),
    );
    if (childrenProp) {
      named.push(`children: ${wrapList("[", childExprs, "]", depth)}`);
    }
  }

  const args: string[] = [];
  if (positionalArg !== null) args.push(positionalArg);
  if (named.length > 0) args.push(wrapList("{ ", named, " }", depth));

  const call = `${component}(${args.join(", ")})`;
  return withPlacement(node, call, opts.editor ? node.id : null, depth);
}

/**
 * Apply free placement and/or the editor identity wrapper to a generated
 * node expression. Freely-placed nodes get a real positioned box (which also
 * carries the id in editor mode); flow nodes keep the zero-cost
 * `display: contents` id carrier.
 */
function withPlacement(
  node: DesignNode,
  inner: string,
  editorId: string | null,
  depth: number,
): string {
  if (node.layout) {
    const attrs: string[] = [];
    if (editorId) attrs.push(`"data-node-id": ${JSON.stringify(editorId)}`);
    attrs.push(`style: ${JSON.stringify(layoutWrapperStyle(node.layout))}`);
    const pad = INDENT.repeat(depth + 1);
    const padEnd = INDENT.repeat(depth);
    return (
      `HTMLTag("div", { attributes: { ${attrs.join(", ")} }, children: [\n` +
      `${pad}${inner}\n${padEnd}] })`
    );
  }
  return editorId ? wrapWithId(editorId, inner, depth) : inner;
}

/**
 * Editor-mode identity carrier: a `display: contents` div contributes no
 * layout of its own but gives the canvas a DOM element mapping back to the
 * design node.
 */
function wrapWithId(id: string, inner: string, depth: number): string {
  const pad = INDENT.repeat(depth + 1);
  const padEnd = INDENT.repeat(depth);
  return (
    `HTMLTag("div", { attributes: { "data-node-id": ${JSON.stringify(id)}, style: "display: contents" }, children: [\n` +
    `${pad}${inner}\n${padEnd}] })`
  );
}

// ---------------------------------------------------------------------------
// Frame -> program
// ---------------------------------------------------------------------------

/** Generate a complete Aktion program rendering one frame. */
export function frameProgram(
  frame: Frame,
  doc: DesignDocument,
  schema: SchemaIndex,
  opts: CodegenOptions = {},
): string {
  const children = frame.children
    .map((n) => nodeExpr(n, doc, schema, opts, 1))
    .filter((e): e is string => e !== null);

  // The root is the artboard box: exact frame height (100%/min-height would
  // collapse against aktion's auto-height shadow container, breaking both
  // hit-testing and absolute placement), clipping overflow like Figma frames.
  const rootStyle = [
    "position: relative",
    "display: flex",
    "flex-direction: column",
    "align-items: stretch",
    `height: ${Math.round(frame.height)}px`,
    "width: 100%",
    `background: ${frame.background}`,
    "overflow: clip",
  ].join("; ");

  const body =
    children.length > 0
      ? `[\n${INDENT}${children.join(`,\n${INDENT}`)}\n]`
      : "[]";

  const lines = [
    `$app(HTMLTag("div", { attributes: { "data-frame-root": ${JSON.stringify(frame.id)}, style: ${JSON.stringify(rootStyle)} }, children: ${body} }))`,
  ];
  const theme = themeStatement(doc);
  if (theme) lines.push(theme);
  return lines.join("\n");
}

/** `$theme({...})` statement carrying the project's brand overrides. */
export function themeStatement(doc: DesignDocument): string | null {
  const tokens = doc.themeTokens;
  if (!tokens || Object.keys(tokens).length === 0) return null;
  const withBase =
    "name" in tokens ? tokens : { name: doc.theme || "light", ...tokens };
  return `$theme(${printValue(withBase as PropValue, 0)})`;
}

/**
 * Clean, human-oriented program for the code panel and .aktion export.
 * Symbols become named Aktion `function` components; instances become calls.
 */
export function exportProgram(
  frame: Frame,
  doc: DesignDocument,
  schema: SchemaIndex,
  options: { inlineSymbols?: boolean } = {},
): string {
  const inline = options.inlineSymbols === true;
  const used = new Set<string>();
  collectSymbols(frame.children, doc, used);

  const symbolFns: string[] = [];
  if (!inline) {
    for (const symbol of doc.symbols) {
      if (!used.has(symbol.id)) continue;
      const body = nodeExpr(
        { ...symbol.root, visible: true },
        doc,
        schema,
        { editor: false },
        1,
      );
      if (body) {
        symbolFns.push(
          `function ${symbolFnName(symbol.name, symbol.id)}() {\n${INDENT}return ${body}\n}`,
        );
      }
    }
  }

  const children = frame.children
    .map((n) => nodeExpr(n, doc, schema, { symbolsAsCalls: !inline }, 1))
    .filter((e): e is string => e !== null);

  const body =
    children.length > 0
      ? `[\n${INDENT}${children.join(`,\n${INDENT}`)}\n]`
      : "[]";

  const parts = [
    `// ${frame.name} — generated by Aktion Design`,
    `$app(Column(${body}, { sx: { position: "relative", minH: "100vh", bg: ${JSON.stringify(frame.background)} } }))`,
  ];
  const theme = themeStatement(doc);
  if (theme) parts.push(theme);
  if (symbolFns.length > 0) parts.push("", ...symbolFns);
  return parts.join("\n");
}

function collectSymbols(children: DesignNode[], doc: DesignDocument, out: Set<string>) {
  for (const node of children) {
    if (node.type === "instance" && node.symbolId) out.add(node.symbolId);
    collectSymbols(node.children, doc, out);
  }
}

function symbolFnName(name: string, id: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "");
  const base = cleaned.length > 0 ? cleaned[0].toUpperCase() + cleaned.slice(1) : "Symbol";
  return `${base}_${id.slice(-4)}`;
}

/**
 * Standalone HTML document embedding the CDN runtime + generated program —
 * the "export as .html" format.
 */
export function standaloneHtml(programText: string, title: string, theme: string): string {
  const escaped = programText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title.replace(/[<>&]/g, "")}</title>
  <script type="module" src="https://asfand-dev.github.io/aktion/dist/aktion.js"></script>
  <style>html, body { margin: 0; padding: 0; }</style>
</head>
<body>
  <aktion-app theme="${theme}">${escaped}</aktion-app>
</body>
</html>
`;
}
