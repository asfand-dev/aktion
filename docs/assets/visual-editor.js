/**
 * Aktion Visual Editor.
 *
 * A drag-and-drop authoring surface for the Aktion language.
 *
 * Layout:
 *   ┌─────────┬──────────────────────────┬────────────┐
 *   │ Palette │ Canvas (visual tree)     │ Inspector  │
 *   └─────────┴──────────────────────────┴────────────┘
 *   │ Bottom: live preview · code · standalone HTML    │
 *
 * The user composes the right-hand side of the `_app_` assignment by
 * dragging components from the palette onto the canvas. Every component
 * surfaces its real prop catalog (read from the language spec) so the
 * inspector can render typed editors with enum suggestions, and any prop
 * can be flipped into "raw expression" mode for advanced Aktion syntax.
 *
 * Source-text round-trip:
 *   - Import: parses the program, extracts the `_app_` expression by
 *     bracket-tracking the original source, and walks the AST into the
 *     visual tree. Every other top-level statement (state, components,
 *     actions, effects, theme overrides) survives verbatim as a "prelude"
 *     block.
 *   - Export: emits the prelude unchanged, then re-serialises the visual
 *     tree as `_app_ = <expr>` and concatenates the two.
 */

import {
  defaultLibrary,
  findPositionalIndex,
  parse,
  getLanguageSpec,
} from "../../dist/aktion.js";

const CDN_BUNDLE = "https://asfand-dev.github.io/aktion/dist/aktion.js";

const langSpec = getLanguageSpec();
const componentNames = new Set(langSpec.components.map((c) => c.name));
const specByName = new Map();
for (const spec of defaultLibrary.components) specByName.set(spec.name, spec);

// Group order matches the docs site palette layout.
const GROUP_ORDER = [
  "Layout",
  "Content",
  "Forms",
  "Data",
  "Charts",
  "Patterns",
  "App shell",
  "Navigation",
  "Feedback & Media",
  "Editors & overlays",
  "Chat",
  "Advanced UI",
  "Helpers",
  "Theming",
  "Routing",
  "Escape hatches",
  "Other",
];

// ---------------------------------------------------------------------------
// State

const LS_KEY = "rui:ve:state";

const state = {
  tree: null,             // root VisualNode
  prelude: "",            // raw text of statements that come before _app_
  rootId: "_app_",
  selectedId: null,
  draggingId: null,       // id of node being dragged inside the canvas
  paletteSearch: "",
  paletteOpenGroups: new Set(GROUP_ORDER),
  bottomTab: "preview",
  bottomOpen: true,
  paletteOpen: true,
  inspectorOpen: true,
  theme: "light",
};

// ---------------------------------------------------------------------------
// Helpers

const $ = (id) => document.getElementById(id);

function uuid() {
  return "n_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  return String(s ?? "").replace(/[<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
}

function quote(text) {
  // Emit a double-quoted Aktion string literal. The lexer accepts the same
  // escape repertoire as JS, so a JSON-style stringify is enough.
  return JSON.stringify(String(text));
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style") node.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "html") node.innerHTML = v;
      else if (k === "data") {
        for (const [dk, dv] of Object.entries(v)) {
          if (dv == null) continue;
          node.dataset[dk] = String(dv);
        }
      } else if (typeof v === "boolean") {
        if (v) node.setAttribute(k, "");
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  if (children) {
    appendChildren(node, children);
  }
  return node;
}

function appendChildren(node, children) {
  if (children == null) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(node, c);
    return;
  }
  if (children instanceof Node) {
    node.append(children);
    return;
  }
  if (typeof children === "string" || typeof children === "number") {
    node.append(document.createTextNode(String(children)));
  }
}

function showToast(message, opts) {
  const el = $("ve-toast");
  if (!el) return;
  el.textContent = "";
  if (opts && opts.icon) {
    const i = document.createElement("i");
    i.className = "fa-solid fa-" + opts.icon;
    el.append(i);
  }
  el.append(document.createTextNode(message));
  el.dataset.tone = (opts && opts.tone) || "";
  el.dataset.visible = "true";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.dataset.visible = "false"; }, 2000);
}

// ---------------------------------------------------------------------------
// Spec helpers

function getEntry(name) {
  return langSpec.componentsByName[name] || null;
}

function getRuntimeSpec(name) {
  return specByName.get(name) || null;
}

function getPositionalPropName(name) {
  const spec = getRuntimeSpec(name);
  if (!spec) return null;
  const idx = findPositionalIndex(spec);
  return idx >= 0 ? spec.props[idx].name : null;
}

/**
 * Slot kind for a given prop type:
 *   - "children" → array of child Nodes (drop target, reorderable)
 *   - "child"    → single child Node
 *   - null       → not a node slot (regular value)
 *
 * `Foo[]` and `Foo` where `Foo` is a known component also resolve to
 * children/child slots so authors can visually compose Series, MenuItem,
 * KanbanColumn, etc.
 */
function getSlotKind(typeStr) {
  const t = String(typeStr || "").trim();
  if (t === "Node[]") return "children";
  if (t === "Node") return "child";
  if (t.endsWith("[]")) {
    const inner = t.slice(0, -2);
    if (componentNames.has(inner)) return "children";
  } else if (componentNames.has(t)) {
    return "child";
  }
  return null;
}

function slotAcceptsAny(typeStr) {
  const t = String(typeStr || "").trim();
  return t === "Node" || t === "Node[]";
}

function slotElementName(typeStr) {
  const t = String(typeStr || "").trim();
  if (t.endsWith("[]")) return t.slice(0, -2);
  return t;
}

// ---------------------------------------------------------------------------
// Node model
//
// VisualNode:
//   { id, kind: "component", name, slots: { propName: VisualNode[] | VisualNode|null }, raws: { propName: string } }
//   { id, kind: "expr", raw: "<aktion source>" }    // for non-component children encountered during import

function emptyNodeForComponent(name) {
  const entry = getEntry(name);
  if (!entry) {
    return { id: uuid(), kind: "component", name, slots: {}, raws: {} };
  }
  const node = { id: uuid(), kind: "component", name, slots: {}, raws: {} };
  // For each prop, set up empty slot containers; populate raw defaults for
  // required primitive props so the new component renders right away.
  for (const param of entry.params) {
    const slotKind = getSlotKind(param.type);
    if (slotKind === "children") {
      node.slots[param.name] = [];
    } else if (slotKind === "child" && param.required) {
      node.slots[param.name] = null;
    } else if (slotKind == null && param.required) {
      node.raws[param.name] = defaultRawForParam(param);
    }
  }
  return node;
}

function defaultRawForParam(param) {
  const t = String(param.type || "").trim();
  if (param.enumValues && param.enumValues.length > 0) {
    return quote(param.enumValues[0]);
  }
  if (t === "string") return quote(param.name === "value" ? "" : prettyDefault(param.name));
  if (t === "string[]") return "[]";
  if (t === "number") return "0";
  if (t === "boolean") return "false";
  if (t === "object") return "{}";
  if (t.endsWith("[]")) return "[]";
  if (t === "callable") return "() => {}";
  if (t === "any") return "null";
  return quote("");
}

function prettyDefault(propName) {
  if (/title|label|name|caption|heading/i.test(propName)) return "Untitled";
  if (/subtitle|description|hint|message|body|placeholder/i.test(propName)) return "Lorem ipsum";
  if (/icon/i.test(propName)) return "star";
  if (/url|href|src|to|path/i.test(propName)) return "/";
  return "";
}

/**
 * Walk the tree (DFS) invoking `fn(node, parent, slotName)` for every
 * node. Returning false from fn stops the traversal early.
 */
function walkNodes(root, fn, parent, slotName) {
  if (!root) return;
  if (fn(root, parent || null, slotName || null) === false) return;
  if (root.kind !== "component") return;
  for (const [name, slot] of Object.entries(root.slots)) {
    if (Array.isArray(slot)) {
      for (const child of slot) walkNodes(child, fn, root, name);
    } else if (slot && typeof slot === "object") {
      walkNodes(slot, fn, root, name);
    }
  }
}

function findNode(id, root = state.tree) {
  let found = null;
  walkNodes(root, (n) => {
    if (n.id === id) { found = n; return false; }
    return true;
  });
  return found;
}

function findContainer(id, root = state.tree) {
  let result = null;
  walkNodes(root, (n, parent, slotName) => {
    if (n.id === id) {
      if (!parent) { result = { parent: null, slotName: null, isList: false, index: -1 }; return false; }
      const slot = parent.slots[slotName];
      if (Array.isArray(slot)) {
        result = { parent, slotName, isList: true, index: slot.indexOf(n) };
      } else {
        result = { parent, slotName, isList: false, index: -1 };
      }
      return false;
    }
    return true;
  });
  return result;
}

function detachNode(id) {
  const info = findContainer(id);
  if (!info || !info.parent) return null;
  const node = findNode(id);
  if (info.isList) {
    info.parent.slots[info.slotName] = info.parent.slots[info.slotName].filter((n) => n.id !== id);
  } else {
    info.parent.slots[info.slotName] = null;
  }
  return node;
}

function deleteNode(id) {
  const node = detachNode(id);
  if (!node) return false;
  if (state.selectedId === id) state.selectedId = null;
  return true;
}

function deepCloneNode(node) {
  const next = JSON.parse(JSON.stringify(node));
  // Reassign fresh ids so duplicates don't collide with originals.
  walkNodes(next, (n) => { n.id = uuid(); });
  return next;
}

function duplicateNode(id) {
  const info = findContainer(id);
  const node = findNode(id);
  if (!node) return false;
  const copy = deepCloneNode(node);
  if (!info || !info.parent) {
    state.tree = copy;
  } else if (info.isList) {
    const arr = info.parent.slots[info.slotName];
    arr.splice(info.index + 1, 0, copy);
  } else {
    info.parent.slots[info.slotName] = copy;
  }
  state.selectedId = copy.id;
  return true;
}

function moveNode(id, dir) {
  const info = findContainer(id);
  if (!info || !info.parent || !info.isList) return false;
  const arr = info.parent.slots[info.slotName];
  const i = info.index;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return false;
  const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  return true;
}

/**
 * Insert `node` into a container slot. The destination is `(parentId,
 * slotName)`. For list slots, `index` is the insertion index (Infinity →
 * append). For single-child slots, the existing child (if any) is
 * replaced and returned to the caller for cleanup.
 */
function insertNode(parentId, slotName, index, node) {
  const parent = findNode(parentId);
  if (!parent) return false;
  const entry = getEntry(parent.name);
  const param = entry && entry.params.find((p) => p.name === slotName);
  const slotKind = param ? getSlotKind(param.type) : null;
  if (slotKind === "children") {
    if (!Array.isArray(parent.slots[slotName])) parent.slots[slotName] = [];
    const arr = parent.slots[slotName];
    const i = Math.min(Math.max(index, 0), arr.length);
    arr.splice(i, 0, node);
    return true;
  }
  if (slotKind === "child") {
    parent.slots[slotName] = node;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Default tree

function createDefaultTree() {
  const stack = emptyNodeForComponent("Stack");
  const card = emptyNodeForComponent("Card");
  const header = emptyNodeForComponent("CardHeader");
  header.raws.title = quote("Hello, world");
  header.raws.subtitle = quote("Drag a component from the palette to get started");
  card.slots.children = [header];
  stack.slots.children = [card];
  return stack;
}

// ---------------------------------------------------------------------------
// Code generation

const INDENT_UNIT = "  ";

function emitProgram() {
  const tree = state.tree;
  const exprSrc = emitNode(tree, 0);
  const prelude = (state.prelude || "").trim();
  const head = prelude ? prelude + "\n\n" : "";
  const rootId = state.rootId || "_app_";
  return head + rootId + " = " + exprSrc + "\n";
}

function emitNode(node, depth) {
  if (!node) return "null";
  if (node.kind === "expr") return node.raw;
  return emitComponent(node, depth);
}

function emitComponent(node, depth) {
  const entry = getEntry(node.name);
  const indent = INDENT_UNIT.repeat(depth);
  const childIndent = INDENT_UNIT.repeat(depth + 1);

  // Collect arguments in spec order. Positional prop, when present and
  // non-empty, becomes the first arg without a name prefix.
  const positional = entry ? getPositionalPropName(node.name) : null;
  const positionalParam = entry ? entry.params.find((p) => p.name === positional) : null;
  const positionalIsChildren = positionalParam ? getSlotKind(positionalParam.type) === "children" : false;

  // Pre-compute the special "fused" positional children array — its
  // brackets glue directly to the function call so we render
  // `Stack([\n  ...\n])` instead of the verbose four-line shape.
  let fusedPositional = null;
  if (positionalIsChildren && Array.isArray(node.slots[positional])) {
    fusedPositional = emitFusedChildrenArg(node.slots[positional], depth);
  }

  const args = [];
  let positionalArg = null;
  const visited = new Set();
  if (entry) {
    for (const param of entry.params) {
      visited.add(param.name);
      if (param.name === positional && fusedPositional != null) {
        positionalArg = { name: param.name, src: fusedPositional.src, multiLine: fusedPositional.multiLine, param };
        continue;
      }
      const arg = renderArgValue(node, param, depth + 1);
      if (arg == null) continue;
      if (param.name === positional && positionalArg == null) {
        positionalArg = { name: param.name, src: arg, multiLine: arg.includes("\n"), param };
      } else {
        args.push({ name: param.name, src: arg, multiLine: arg.includes("\n"), named: true, param });
      }
    }
  }
  for (const [name, slot] of Object.entries(node.slots || {})) {
    if (visited.has(name)) continue;
    if (Array.isArray(slot) && slot.length === 0) continue;
    const src = emitSlotValue(slot, depth + 1);
    if (src != null) args.push({ name, src, multiLine: src.includes("\n"), named: true });
  }
  for (const [name, raw] of Object.entries(node.raws || {})) {
    if (visited.has(name)) continue;
    if (raw == null || raw === "") continue;
    args.push({ name, src: raw, multiLine: String(raw).includes("\n"), named: true });
  }

  const orderedArgs = positionalArg ? [positionalArg, ...args] : args;
  if (orderedArgs.length === 0) return node.name + "()";

  const renderedSingleLine = orderedArgs.map((a, i) => {
    const isFirstPositional = i === 0 && a === positionalArg;
    return isFirstPositional ? a.src : a.name + ": " + a.src;
  });
  const totalLen = renderedSingleLine.reduce((n, p) => n + p.length + 2, 0);
  const hasMultiline = orderedArgs.some((a) => a.multiLine);

  if (!hasMultiline && totalLen <= 80) {
    return node.name + "(" + renderedSingleLine.join(", ") + ")";
  }

  // Multi-line: each non-fused arg lands on its own indented line; the
  // fused positional children array stays glued to the opening paren.
  const fuseHead = fusedPositional && positionalArg && positionalArg === orderedArgs[0];
  const headPart = fuseHead ? positionalArg.src : null;
  const tailArgs = headPart ? orderedArgs.slice(1) : orderedArgs;
  const tailLines = tailArgs.map((a, i) => {
    const isFirstPositional = !headPart && i === 0 && a === positionalArg;
    const prefix = isFirstPositional ? "" : a.name + ": ";
    return childIndent + prefix + a.src;
  });

  if (headPart && tailArgs.length === 0) {
    return node.name + "(" + headPart + ")";
  }
  if (headPart) {
    return node.name + "(" + headPart + ",\n" + tailLines.join(",\n") + "\n" + indent + ")";
  }
  return node.name + "(\n" + tailLines.join(",\n") + "\n" + indent + ")";
}

/**
 * Emit a Node[] children array fused with the parent call. Children are
 * indented one level deeper than the parent component (depth+1), and the
 * closing bracket sits at the parent's indent so it lines up with the
 * `)` that follows.
 */
function emitFusedChildrenArg(children, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const childIndent = INDENT_UNIT.repeat(depth + 1);
  if (children.length === 0) return { src: "[]", multiLine: false };
  const parts = children.map((c) => emitNode(c, depth + 1));
  // Try a compact single-line array first.
  const inline = "[" + parts.join(", ") + "]";
  if (!inline.includes("\n") && inline.length <= 80) {
    return { src: inline, multiLine: false };
  }
  const body = parts.map((p) => childIndent + p).join(",\n");
  return { src: "[\n" + body + "\n" + indent + "]", multiLine: true };
}

/**
 * Compute the source for a single prop's value. Returns null when the
 * prop should be omitted (unset). For Node[]/Node slot props, builds the
 * array/child expression by recursing into emitNode; for raw props,
 * returns the stored expression text.
 */
function renderArgValue(node, param, depth) {
  const slotKind = getSlotKind(param.type);
  const indent = INDENT_UNIT.repeat(depth);
  const innerIndent = INDENT_UNIT.repeat(depth + 1);

  if (slotKind === "children") {
    const arr = node.slots[param.name];
    if (!Array.isArray(arr)) {
      const raw = node.raws[param.name];
      return raw != null && raw !== "" ? raw : null;
    }
    if (arr.length === 0) {
      // For required children prop, emit empty array. For optional, omit.
      if (!param.required) return null;
      return "[]";
    }
    const childSrc = arr.map((c) => innerIndent + emitNode(c, depth + 1)).join(",\n");
    return "[\n" + childSrc + "\n" + indent + "]";
  }
  if (slotKind === "child") {
    const child = node.slots[param.name];
    if (!child) {
      const raw = node.raws[param.name];
      return raw != null && raw !== "" ? raw : null;
    }
    return emitNode(child, depth);
  }
  // Plain raw value.
  const raw = node.raws[param.name];
  if (raw == null || raw === "") return null;
  return raw;
}

function emitSlotValue(slot, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const innerIndent = INDENT_UNIT.repeat(depth + 1);
  if (Array.isArray(slot)) {
    if (slot.length === 0) return "[]";
    const childSrc = slot.map((c) => innerIndent + emitNode(c, depth + 1)).join(",\n");
    return "[\n" + childSrc + "\n" + indent + "]";
  }
  if (slot && typeof slot === "object" && slot.kind) {
    return emitNode(slot, depth);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Standalone HTML export

// ---------------------------------------------------------------------------
// AST → source serializer (used to round-trip raw expression values).
//
// We don't need byte-identical output — just valid Aktion that survives a
// re-parse. The visual editor only cares about expression-level shapes
// (no statements: those get round-tripped via the source-text prelude).

function exprToSource(expr, depth = 0) {
  if (expr == null) return "null";
  switch (expr.kind) {
    case "Literal": return literalToSource(expr.value);
    case "Identifier": return expr.name;
    case "StateRef": return "$" + expr.name;
    case "Array": return arrayToSource(expr.elements, depth);
    case "Object": return objectToSource(expr.properties, depth);
    case "Member": return memberToSource(expr, depth);
    case "Unary": return expr.operator + exprToSource(expr.argument, depth);
    case "Binary":
      return "(" + exprToSource(expr.left, depth) + " " + expr.operator + " " + exprToSource(expr.right, depth) + ")";
    case "Ternary":
      return "(" + exprToSource(expr.test, depth) + " ? " +
        exprToSource(expr.consequent, depth) + " : " +
        exprToSource(expr.alternate, depth) + ")";
    case "Call": return callToSource(expr, depth);
    case "MethodCall": return methodCallToSource(expr, depth);
    case "BuiltinCall": return builtinCallToSource(expr, depth);
    case "Template": return templateToSource(expr);
    case "Spread": return "..." + exprToSource(expr.argument, depth);
    case "NamedArg": return expr.name + ": " + exprToSource(expr.value, depth);
    case "If": return ifToSource(expr, depth);
    case "Match": return matchToSource(expr, depth);
    case "For": return forToSource(expr, depth);
    case "Lambda": return lambdaToSource(expr, depth);
    case "JsBlock": return "js{ " + expr.body + " }";
    case "Bind": return "bind:" + expr.prop + ": " + exprToSource(expr.target, depth);
    case "Block": return blockToSource(expr, depth);
    default: return "/* unsupported: " + (expr.kind || "?") + " */";
  }
}

function literalToSource(value) {
  if (value === null) return "null";
  if (typeof value === "string") return quote(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return "null";
}

function arrayToSource(elements, depth) {
  if (!elements || elements.length === 0) return "[]";
  const indent = INDENT_UNIT.repeat(depth);
  const inner = INDENT_UNIT.repeat(depth + 1);
  const parts = elements.map((e) => exprToSource(e, depth + 1));
  const totalLen = parts.reduce((n, p) => n + p.length + 2, 0);
  if (totalLen <= 80 && !parts.some((p) => p.includes("\n"))) {
    return "[" + parts.join(", ") + "]";
  }
  return "[\n" + parts.map((p) => inner + p).join(",\n") + "\n" + indent + "]";
}

function objectToSource(properties, depth) {
  if (!properties || properties.length === 0) return "{}";
  const indent = INDENT_UNIT.repeat(depth);
  const inner = INDENT_UNIT.repeat(depth + 1);
  const parts = properties.map((p) => {
    if (p.spread) return "..." + exprToSource(p.value, depth + 1);
    return p.key + ": " + exprToSource(p.value, depth + 1);
  });
  const totalLen = parts.reduce((n, p) => n + p.length + 2, 0);
  if (totalLen <= 60 && !parts.some((p) => p.includes("\n"))) {
    return "{" + parts.join(", ") + "}";
  }
  return "{\n" + parts.map((p) => inner + p).join(",\n") + "\n" + indent + "}";
}

function memberToSource(expr, depth) {
  const obj = exprToSource(expr.object, depth);
  if (expr.property != null) {
    return obj + (expr.optional ? "?." : ".") + expr.property;
  }
  if (expr.computed) {
    return obj + (expr.optional ? "?." : "") + "[" + exprToSource(expr.computed, depth) + "]";
  }
  return obj;
}

function callToSource(expr, depth) {
  return expr.callee + argsToSource(expr.arguments, depth);
}

function methodCallToSource(expr, depth) {
  const obj = exprToSource(expr.object, depth);
  return obj + (expr.optional ? "?." : ".") + expr.method + argsToSource(expr.arguments, depth);
}

function builtinCallToSource(expr, depth) {
  return "@" + expr.name + argsToSource(expr.arguments, depth);
}

function argsToSource(args, depth) {
  if (!args || args.length === 0) return "()";
  const indent = INDENT_UNIT.repeat(depth);
  const inner = INDENT_UNIT.repeat(depth + 1);
  const parts = args.map((a) => exprToSource(a, depth + 1));
  const totalLen = parts.reduce((n, p) => n + p.length + 2, 0);
  if (totalLen <= 80 && !parts.some((p) => p.includes("\n"))) {
    return "(" + parts.join(", ") + ")";
  }
  return "(\n" + parts.map((p) => inner + p).join(",\n") + "\n" + indent + ")";
}

function templateToSource(expr) {
  let out = "`";
  for (let i = 0; i < expr.quasis.length; i++) {
    out += expr.quasis[i].replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    if (i < expr.expressions.length) {
      out += "${" + exprToSource(expr.expressions[i], 0) + "}";
    }
  }
  return out + "`";
}

function ifToSource(expr, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const ind1 = INDENT_UNIT.repeat(depth + 1);
  let out = "if " + exprToSource(expr.test, depth) + " {\n" + ind1 + blockBody(expr.consequent, depth + 1) + "\n" + indent + "}";
  if (expr.alternate) {
    if (expr.alternate.kind === "If") {
      out += " else " + ifToSource(expr.alternate, depth);
    } else if (expr.alternate.kind === "Block") {
      out += " else {\n" + ind1 + blockBody(expr.alternate, depth + 1) + "\n" + indent + "}";
    }
  }
  return out;
}

function matchToSource(expr, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const ind1 = INDENT_UNIT.repeat(depth + 1);
  const arms = expr.arms.map((arm) => {
    const pat = arm.pattern === "_" ? "default" : exprToSource(arm.pattern, depth + 1);
    return ind1 + pat + ": " + exprToSource(arm.body, depth + 1);
  });
  return "match " + exprToSource(expr.discriminant, depth) + " {\n" + arms.join(",\n") + "\n" + indent + "}";
}

function forToSource(expr, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const ind1 = INDENT_UNIT.repeat(depth + 1);
  let head = "for ";
  if (expr.destructure) {
    head += "{" + expr.destructure.join(", ") + "}";
  } else {
    head += expr.item + (expr.index ? ", " + expr.index : "");
  }
  head += " in " + exprToSource(expr.iterable, depth);
  return head + " {\n" + ind1 + blockBody(expr.body, depth + 1) + "\n" + indent + "}";
}

function lambdaToSource(expr, depth) {
  const params = expr.params.map((p) => p.name).join(", ");
  if (expr.body && expr.body.kind === "Block") {
    const indent = INDENT_UNIT.repeat(depth);
    const ind1 = INDENT_UNIT.repeat(depth + 1);
    return "(" + params + ") => {\n" + ind1 + blockBody(expr.body, depth + 1) + "\n" + indent + "}";
  }
  return "(" + params + ") => " + exprToSource(expr.body, depth);
}

function blockToSource(expr, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const ind1 = INDENT_UNIT.repeat(depth + 1);
  return "{\n" + ind1 + blockBody(expr, depth + 1) + "\n" + indent + "}";
}

function blockBody(block, depth) {
  if (!block || !block.body) return "";
  const ind = INDENT_UNIT.repeat(depth);
  return block.body.map((stmt) => statementToSource(stmt, depth)).join("\n" + ind);
}

function statementToSource(stmt, depth) {
  if (!stmt) return "";
  switch (stmt.kind) {
    case "Assignment":
      return (stmt.isState ? "$" : "") + stmt.identifier + " = " + exprToSource(stmt.expression, depth);
    case "ExpressionStatement":
      return exprToSource(stmt.expression, depth);
    case "Return":
      return "return" + (stmt.argument ? " " + exprToSource(stmt.argument, depth) : "");
    case "Await":
      return "await " + exprToSource(stmt.argument, depth);
    case "Cleanup":
      return "cleanup(" + exprToSource(stmt.callback, depth) + ")";
    default:
      return "/* statement: " + stmt.kind + " */";
  }
}

// ---------------------------------------------------------------------------
// Standalone HTML export

function buildStandaloneHtml(source, theme, title) {
  const safeSource = JSON.stringify(source).replace(/<\/(script)/gi, "<\\/$1");
  const safeTitle = escapeHtml(title || "Aktion app");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>" + safeTitle + "</title>",
    '  <meta name="generator" content="Aktion visual editor" />',
    '  <script type="module" src="' + CDN_BUNDLE + '"></script>',
    "  <style>",
    "    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }",
    "    aktion-app { display: block; min-height: 100vh; }",
    "  </style>",
    "</head>",
    "<body>",
    '  <aktion-app theme="' + escapeAttr(theme || "light") + '"></aktion-app>',
    '  <script type="module">',
    '    const el = document.querySelector("aktion-app");',
    "    const SOURCE = " + safeSource + ";",
    '    customElements.whenDefined("aktion-app").then(() => {',
    '      if (typeof el.setResponse === "function") el.setResponse(SOURCE);',
    '      else el.setAttribute("response", SOURCE);',
    "    });",
    "  </script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Import — Aktion source → visual tree
//
// Strategy: bracket-track the original source to find the range of the
// `<rootId> = <expr>` assignment. Slice that out as the prelude (which
// preserves comments/formatting verbatim) and re-parse `<rootId> = <expr>`
// to walk the assignment expression.

function findAssignmentRange(source, rootId) {
  // Locate the line that starts with `rootId =`. Match the first
  // non-comment line that does so at depth 0.
  const rxStart = new RegExp("(^|\\n)\\s*" + rootId.replace(/[$]/g, "\\$") + "\\s*=", "g");
  let m;
  while ((m = rxStart.exec(source))) {
    const startLine = m.index === 0 ? 0 : m.index + 1; // skip the leading newline
    // Consume "rootId =" up to the first non-equals character to find the
    // expression start.
    let i = startLine;
    while (i < source.length && source[i] !== "=") i++;
    if (source[i] !== "=") continue;
    i++;
    // Skip whitespace after =
    while (i < source.length && (source[i] === " " || source[i] === "\t")) i++;
    const exprStart = i;
    const exprEnd = scanExpressionEnd(source, exprStart);
    return { assignStart: startLine, exprStart, exprEnd };
  }
  return null;
}

/**
 * Scan forward from `start`, tracking strings/comments/template literals
 * and bracket depth. Returns the position one past the last character of
 * the expression. The expression terminates on a newline at depth 0 OR on
 * end-of-source.
 */
function scanExpressionEnd(source, start) {
  let i = start;
  const stack = []; // tracks bracket types: "(", "[", "{", "tpl-expr"
  let str = null;  // " ' or `
  let comment = null;
  while (i < source.length) {
    const ch = source[i];
    if (comment === "line") {
      if (ch === "\n") {
        comment = null;
        if (stack.length === 0) return i;
        i++; continue;
      }
      i++; continue;
    }
    if (comment === "block") {
      if (ch === "*" && source[i + 1] === "/") { comment = null; i += 2; continue; }
      i++; continue;
    }
    if (str === "`") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") { str = null; i++; continue; }
      if (ch === "$" && source[i + 1] === "{") {
        stack.push("tpl-expr");
        str = null; // exit template-string mode while we walk the embedded expr
        i += 2; continue;
      }
      i++; continue;
    }
    if (str) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === str) { str = null; i++; continue; }
      i++; continue;
    }
    if (ch === "/" && source[i + 1] === "/") { comment = "line"; i += 2; continue; }
    if (ch === "#") { comment = "line"; i++; continue; }
    if (ch === "/" && source[i + 1] === "*") { comment = "block"; i += 2; continue; }
    if (ch === '"' || ch === "'") { str = ch; i++; continue; }
    if (ch === "`") { str = "`"; i++; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { stack.push(ch); i++; continue; }
    if (ch === ")" || ch === "]") { stack.pop(); i++; continue; }
    if (ch === "}") {
      const top = stack[stack.length - 1];
      stack.pop();
      if (top === "tpl-expr") str = "`"; // resume template-string scanning
      i++; continue;
    }
    if (ch === "\n" && stack.length === 0) return i;
    i++;
  }
  return i;
}

function importFromSource(source) {
  const text = String(source ?? "");
  if (!text.trim()) {
    return { tree: createDefaultTree(), prelude: "", warnings: [], errors: [] };
  }
  // Try the configured rootId first, fall back to `_app_`.
  let range = findAssignmentRange(text, state.rootId);
  let rootId = state.rootId;
  if (!range && state.rootId !== "_app_") {
    range = findAssignmentRange(text, "_app_");
    if (range) rootId = "_app_";
  }
  if (!range) {
    // No `_app_` assignment found. Treat the whole source as a prelude
    // and start the visual tree from a default Stack so the user can
    // continue authoring.
    return {
      tree: createDefaultTree(),
      prelude: text.replace(/\s+$/, ""),
      warnings: [{ message: "No `" + rootId + " =` assignment found. Source kept as prelude." }],
      errors: [],
    };
  }

  const exprSrc = text.slice(range.exprStart, range.exprEnd);
  const before = text.slice(0, range.assignStart).replace(/\s+$/, "");
  const after = text.slice(range.exprEnd).replace(/^\s+/, "");
  const preludeParts = [];
  if (before) preludeParts.push(before);
  if (after) preludeParts.push(after);
  const prelude = preludeParts.join("\n\n");

  // Re-parse just the assignment so we get the expression AST cleanly.
  const program = parse(rootId + " = " + exprSrc);
  const warnings = [];
  const errors = program.errors || [];
  let tree = createDefaultTree();
  if (program.statements && program.statements.length > 0) {
    const first = program.statements[0];
    if (first.kind === "Assignment") {
      tree = buildVisualTree(first.expression, warnings);
    }
  }

  return { tree, prelude, warnings, errors, rootId };
}

/**
 * Walk an expression AST into a VisualNode tree. Component calls become
 * component nodes; anything else collapses to an "expr" node carrying the
 * serialised source so the user can still see and replace it.
 */
function buildVisualTree(expr, warnings) {
  if (!expr) return createDefaultTree();
  if (expr.kind === "Call" && componentNames.has(expr.callee)) {
    return buildComponentNode(expr, warnings);
  }
  return { id: uuid(), kind: "expr", raw: exprToSource(expr) };
}

function buildComponentNode(expr, warnings) {
  const name = expr.callee;
  const entry = getEntry(name);
  const node = { id: uuid(), kind: "component", name, slots: {}, raws: {} };
  if (!entry) {
    // Unknown component (extension-registered). Keep all args as raw.
    expr.arguments.forEach((arg, idx) => {
      if (arg.kind === "NamedArg") {
        node.raws[arg.name] = exprToSource(arg.value);
      } else {
        node.raws["__arg_" + idx] = exprToSource(arg);
      }
    });
    return node;
  }

  const positional = getPositionalPropName(name);
  // The first positional arg (if any) maps to the spec's positional prop.
  let positionalConsumed = false;
  for (const arg of expr.arguments) {
    if (arg.kind === "NamedArg") {
      const param = entry.params.find((p) => p.name === arg.name);
      if (param) assignArg(node, param, arg.value, warnings);
      else node.raws[arg.name] = exprToSource(arg.value);
      continue;
    }
    if (!positionalConsumed && positional) {
      const param = entry.params.find((p) => p.name === positional);
      if (param) {
        assignArg(node, param, arg, warnings);
        positionalConsumed = true;
        continue;
      }
    }
    // Otherwise: stray positional arg. Bucket it onto the first unassigned
    // prop so we keep round-tripping working — the user can fix it later.
    const next = entry.params.find((p) =>
      !(p.name in node.slots) && !(p.name in node.raws),
    );
    if (next) assignArg(node, next, arg, warnings);
  }

  // Ensure required Node[] slots exist as empty arrays so the user can
  // drop into them visually even when the imported source omitted them.
  for (const param of entry.params) {
    const slotKind = getSlotKind(param.type);
    if (slotKind === "children" && !(param.name in node.slots)) {
      node.slots[param.name] = [];
    }
  }
  return node;
}

/**
 * Route a single argument to its target prop slot. For Node[]/Node typed
 * params we recurse into `buildComponentNode` for component children and
 * fall through to a raw "expr" wrapper for anything else (identifiers,
 * `for` comprehensions, `if` expressions, etc.). Non-node params always
 * land in `node.raws` as serialized source.
 */
function assignArg(node, param, valueExpr, warnings) {
  const slotKind = getSlotKind(param.type);
  if (slotKind === "children") {
    if (valueExpr.kind === "Array") {
      node.slots[param.name] = valueExpr.elements.map((elNode) => {
        if (elNode.kind === "Call" && componentNames.has(elNode.callee)) {
          return buildComponentNode(elNode, warnings);
        }
        return { id: uuid(), kind: "expr", raw: exprToSource(elNode) };
      });
      return;
    }
    // Slot expects an array but got something else (identifier, for-expr,
    // ternary, …). Keep the original source so it round-trips.
    node.raws[param.name] = exprToSource(valueExpr);
    return;
  }
  if (slotKind === "child") {
    if (valueExpr.kind === "Call" && componentNames.has(valueExpr.callee)) {
      node.slots[param.name] = buildComponentNode(valueExpr, warnings);
      return;
    }
    node.raws[param.name] = exprToSource(valueExpr);
    return;
  }
  node.raws[param.name] = exprToSource(valueExpr);
}

// ---------------------------------------------------------------------------
// Drag-and-drop machinery
//
// The palette emits drags with payload { kind: "new", name }.
// The canvas re-emits existing nodes with payload { kind: "move", id }.
// Drop targets accept either: a "drop gap" inside a list slot, or an
// "empty slot" for required Node/Node[] containers.

const DRAG_TYPE = "application/x-aktion-payload";

let currentDragPayload = null;

function startPaletteDrag(name, e) {
  currentDragPayload = { kind: "new", name };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "copy";
    try { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(currentDragPayload)); }
    catch (_) { /* some browsers reject custom types */ }
    try { e.dataTransfer.setData("text/plain", name); } catch (_) {}
  }
}

function startNodeDrag(id, e) {
  currentDragPayload = { kind: "move", id };
  state.draggingId = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(currentDragPayload)); }
    catch (_) {}
  }
  // Re-render so the source node fades.
  scheduleRender();
}

function endNodeDrag() {
  currentDragPayload = null;
  state.draggingId = null;
  scheduleRender();
}

function payloadFromEvent(e) {
  if (currentDragPayload) return currentDragPayload;
  try {
    const raw = e.dataTransfer && e.dataTransfer.getData(DRAG_TYPE);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function attachDropTarget(el, accept, onDrop) {
  let depth = 0;
  el.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (!accept(payloadFromEvent(e))) return;
    depth++;
    el.classList.add("is-drag-over");
  });
  el.addEventListener("dragover", (e) => {
    if (!accept(payloadFromEvent(e))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = currentDragPayload && currentDragPayload.kind === "move" ? "move" : "copy";
  });
  el.addEventListener("dragleave", () => {
    depth--;
    if (depth <= 0) { depth = 0; el.classList.remove("is-drag-over"); }
  });
  el.addEventListener("drop", (e) => {
    const payload = payloadFromEvent(e);
    if (!accept(payload)) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    el.classList.remove("is-drag-over");
    onDrop(payload);
  });
}

function performDrop(payload, parentId, slotName, index) {
  if (!payload) return;
  if (payload.kind === "new") {
    const node = emptyNodeForComponent(payload.name);
    insertNode(parentId, slotName, index, node);
    state.selectedId = node.id;
  } else if (payload.kind === "move") {
    if (payload.id === parentId) return; // can't drop into self
    if (isAncestor(payload.id, parentId)) return; // can't drop into descendant
    // Capture the destination indices BEFORE removing the source so we
    // adjust correctly when the source sits in the same list.
    const sourceContainer = findContainer(payload.id);
    const node = detachNode(payload.id);
    if (!node) return;
    let dropIndex = index;
    if (sourceContainer && sourceContainer.parent
        && sourceContainer.parent.id === parentId
        && sourceContainer.slotName === slotName
        && sourceContainer.isList
        && sourceContainer.index < index) {
      dropIndex = index - 1;
    }
    insertNode(parentId, slotName, dropIndex, node);
    state.selectedId = node.id;
  }
  saveState();
  scheduleRender();
}

function isAncestor(ancestorId, descendantId) {
  const ancestor = findNode(ancestorId);
  if (!ancestor) return false;
  let found = false;
  walkNodes(ancestor, (n) => {
    if (n.id === descendantId) { found = true; return false; }
    return true;
  });
  return found;
}

// ---------------------------------------------------------------------------
// Rendering — palette

function renderPalette() {
  const root = $("ve-palette");
  if (!root) return;
  root.innerHTML = "";
  const search = state.paletteSearch.trim().toLowerCase();
  const groups = new Map();
  for (const c of langSpec.components) {
    if (search && !c.name.toLowerCase().includes(search)
        && !(c.description || "").toLowerCase().includes(search)
        && !(c.group || "").toLowerCase().includes(search)) {
      continue;
    }
    const g = c.group || "Other";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  let total = 0;
  for (const [, list] of groups) total += list.length;
  $("ve-palette-count").textContent = total ? total + " of " + langSpec.components.length : "";

  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  for (const [groupName, list] of ordered) {
    const isOpen = state.paletteOpenGroups.has(groupName) || !!search;
    const wrap = el("div", {
      class: "ve-palette-group",
      data: { open: String(isOpen) },
    });
    const head = el("button", {
      class: "ve-palette-group-header",
      type: "button",
      onClick: () => {
        if (state.paletteOpenGroups.has(groupName)) state.paletteOpenGroups.delete(groupName);
        else state.paletteOpenGroups.add(groupName);
        renderPalette();
      },
    }, [
      el("span", null, groupName + " (" + list.length + ")"),
      el("i", { class: "fa-solid fa-chevron-right", "aria-hidden": "true" }),
    ]);
    wrap.append(head);

    const items = el("div", { class: "ve-palette-items" });
    for (const c of list) {
      const item = el("div", {
        class: "ve-palette-item",
        draggable: "true",
        title: c.description,
        onDragstart: (e) => startPaletteDrag(c.name, e),
        onClick: () => addComponentSmart(c.name),
      }, [
        el("div", { class: "ve-pal-icon" }, paletteIconFor(c)),
        el("div", { class: "ve-pal-meta" }, [
          el("div", { class: "ve-pal-name" }, c.name),
          el("div", { class: "ve-pal-sig" }, c.signature),
        ]),
      ]);
      items.append(item);
    }
    wrap.append(items);
    root.append(wrap);
  }
  if (total === 0) {
    root.append(el("div", { style: "padding:18px; color: var(--doc-text-muted); text-align:center; font-size: 13px;" },
      "No components match \"" + search + "\""));
  }
}

function paletteIconFor(entry) {
  // Pick a tiny visual cue per group so the palette isn't a wall of text.
  const map = {
    "Layout": "fa-table-cells-large",
    "Content": "fa-paragraph",
    "Forms": "fa-pen-to-square",
    "Data": "fa-table",
    "Charts": "fa-chart-line",
    "Patterns": "fa-shapes",
    "App shell": "fa-window-maximize",
    "Navigation": "fa-compass",
    "Feedback & Media": "fa-bell",
    "Editors & overlays": "fa-pen",
    "Chat": "fa-comments",
    "Advanced UI": "fa-wand-magic-sparkles",
    "Helpers": "fa-puzzle-piece",
    "Theming": "fa-palette",
    "Routing": "fa-route",
    "Escape hatches": "fa-code",
  };
  const cls = map[entry.group] || "fa-cube";
  return el("i", { class: "fa-solid " + cls, "aria-hidden": "true" });
}

/**
 * Click-to-add fallback for users without drag input. Tries to place the
 * new component into the currently selected node's first children slot;
 * falls back to the root tree's children slot.
 */
function addComponentSmart(name) {
  const node = emptyNodeForComponent(name);
  let target = state.selectedId ? findNode(state.selectedId) : null;
  if (!target) target = state.tree;
  // Walk up from target until we find a component with a children slot.
  while (target) {
    const entry = getEntry(target.name);
    if (entry) {
      const childrenParam = entry.params.find((p) => getSlotKind(p.type) === "children");
      if (childrenParam) {
        if (!Array.isArray(target.slots[childrenParam.name])) {
          target.slots[childrenParam.name] = [];
        }
        target.slots[childrenParam.name].push(node);
        state.selectedId = node.id;
        saveState();
        scheduleRender();
        return;
      }
    }
    const info = findContainer(target.id);
    target = info && info.parent ? info.parent : null;
  }
  showToast("No drop target found for " + name, { tone: "danger", icon: "circle-exclamation" });
}

// ---------------------------------------------------------------------------
// Rendering — canvas

function renderCanvas() {
  const canvas = $("ve-canvas");
  if (!canvas) return;
  canvas.innerHTML = "";
  if (!state.tree) {
    canvas.append(el("div", { class: "ve-slot-empty" }, "Empty canvas. Drag a component from the palette."));
    return;
  }
  const wrap = el("div", { class: "ve-tree-root" });
  wrap.append(renderTreeNode(state.tree, null, null, 0));
  canvas.append(wrap);
}

function renderTreeNode(node, parent, slotName, depth) {
  if (node.kind === "expr") return renderExprNode(node, parent, slotName);
  return renderComponentNode(node, parent, slotName, depth);
}

function renderExprNode(node, parent, slotName) {
  const wrap = el("div", {
    class: "ve-node",
    draggable: parent ? "true" : "false",
    data: { kind: "expr", selected: state.selectedId === node.id, dragging: state.draggingId === node.id, expanded: "false" },
    onClick: (e) => { e.stopPropagation(); state.selectedId = node.id; scheduleRender(); },
    onDragstart: parent ? (e) => { e.stopPropagation(); startNodeDrag(node.id, e); } : null,
    onDragend: parent ? () => endNodeDrag() : null,
  }, [
    el("div", { class: "ve-node-head" }, [
      el("span", { class: "ve-drag" }, [el("i", { class: "fa-solid fa-grip-vertical" })]),
      el("span", { class: "ve-name", style: "color: var(--doc-text-muted);" }, "expr"),
      el("span", { class: "ve-summary" }, node.raw),
      el("div", { class: "ve-actions" }, parent ? [
        el("button", { type: "button", title: "Delete", class: "is-danger",
          onClick: (e) => { e.stopPropagation(); deleteNode(node.id); saveState(); scheduleRender(); },
        }, [el("i", { class: "fa-solid fa-trash" })]),
      ] : null),
    ]),
  ]);
  return wrap;
}

function renderComponentNode(node, parent, slotName, depth) {
  const entry = getEntry(node.name);
  const expanded = state.selectedId === node.id || hasFilledChildSlot(node) || depth < 2;
  const wrap = el("div", {
    class: "ve-node",
    draggable: parent ? "true" : "false",
    data: {
      kind: "component",
      selected: state.selectedId === node.id,
      dragging: state.draggingId === node.id,
      expanded: String(expanded),
    },
    onClick: (e) => { e.stopPropagation(); state.selectedId = node.id; scheduleRender(); },
    onDragstart: parent ? (e) => { e.stopPropagation(); startNodeDrag(node.id, e); } : null,
    onDragend: parent ? () => endNodeDrag() : null,
  });
  wrap.append(renderNodeHeader(node, parent));
  if (entry) {
    const body = el("div", { class: "ve-node-body" });
    let hasContent = false;
    for (const param of entry.params) {
      const slotKind = getSlotKind(param.type);
      if (!slotKind) continue;
      const slot = node.slots[param.name];
      const presentForChild = slotKind === "child" && slot;
      const presentForChildren = slotKind === "children" && Array.isArray(slot);
      // Always render the first Node[] slot for a parent; render others
      // only when they exist or are required.
      const isFirstChildrenParam = param.name === firstChildrenParamName(entry);
      if (slotKind === "children" && !presentForChildren && !param.required && !isFirstChildrenParam) continue;
      if (slotKind === "child" && !presentForChild && !param.required) continue;

      hasContent = true;
      body.append(renderSlot(node, param, depth));
    }
    if (hasContent) wrap.append(body);
  }
  return wrap;
}

function firstChildrenParamName(entry) {
  for (const p of entry.params) {
    if (getSlotKind(p.type) === "children") return p.name;
  }
  return null;
}

function hasFilledChildSlot(node) {
  for (const slot of Object.values(node.slots || {})) {
    if (Array.isArray(slot) && slot.length > 0) return true;
    if (slot && !Array.isArray(slot) && typeof slot === "object" && slot.kind) return true;
  }
  return false;
}

function renderNodeHeader(node, parent) {
  const entry = getEntry(node.name);
  const summary = nodeSummary(node);
  const head = el("div", { class: "ve-node-head" }, [
    el("span", { class: "ve-drag" }, [el("i", { class: "fa-solid fa-grip-vertical" })]),
    el("span", { class: "ve-name" }, node.name),
    el("span", { class: "ve-summary" }, summary || (entry ? entry.signature : "")),
    el("div", { class: "ve-actions" }, parent ? [
      el("button", { type: "button", title: "Move up",
        onClick: (e) => { e.stopPropagation(); if (moveNode(node.id, "up")) { saveState(); scheduleRender(); } },
      }, [el("i", { class: "fa-solid fa-arrow-up" })]),
      el("button", { type: "button", title: "Move down",
        onClick: (e) => { e.stopPropagation(); if (moveNode(node.id, "down")) { saveState(); scheduleRender(); } },
      }, [el("i", { class: "fa-solid fa-arrow-down" })]),
      el("button", { type: "button", title: "Duplicate",
        onClick: (e) => { e.stopPropagation(); duplicateNode(node.id); saveState(); scheduleRender(); },
      }, [el("i", { class: "fa-solid fa-clone" })]),
      el("button", { type: "button", title: "Delete", class: "is-danger",
        onClick: (e) => { e.stopPropagation(); deleteNode(node.id); saveState(); scheduleRender(); },
      }, [el("i", { class: "fa-solid fa-trash" })]),
    ] : [
      el("span", { class: "ve-summary-chip" }, "root"),
    ]),
  ]);
  return head;
}

function nodeSummary(node) {
  const entry = getEntry(node.name);
  if (!entry) return "";
  const parts = [];
  for (const param of entry.params) {
    if (parts.length >= 2) break;
    if (getSlotKind(param.type)) continue;
    const raw = node.raws[param.name];
    if (raw == null || raw === "") continue;
    let display = raw;
    if (display.length > 36) display = display.slice(0, 33) + "…";
    parts.push(param.name + "=" + display);
  }
  return parts.join("  ");
}

function renderSlot(node, param, depth) {
  const slotKind = getSlotKind(param.type);
  const slot = el("div", { class: "ve-slot" }, [
    el("div", { class: "ve-slot-label" },
      param.name + " · " + param.type + (param.required ? " *" : "")),
  ]);
  if (slotKind === "children") {
    const arr = Array.isArray(node.slots[param.name]) ? node.slots[param.name] : [];
    const list = el("div", { class: "ve-slot-children" });
    if (arr.length === 0) {
      const empty = el("div", { class: "ve-slot-empty" }, "Drop a component here");
      attachDropTarget(empty,
        (p) => acceptsPayload(p, param, node, 0),
        (p) => performDrop(p, node.id, param.name, 0));
      list.append(empty);
    } else {
      // First gap (index 0)
      list.append(renderDropGap(node, param, 0));
      arr.forEach((child, idx) => {
        list.append(renderTreeNode(child, node, param.name, depth + 1));
        list.append(renderDropGap(node, param, idx + 1));
      });
    }
    slot.append(list);
  } else if (slotKind === "child") {
    const child = node.slots[param.name];
    if (child) {
      slot.append(renderTreeNode(child, node, param.name, depth + 1));
    } else {
      const empty = el("div", { class: "ve-slot-empty" }, "Drop a single component here");
      attachDropTarget(empty,
        (p) => acceptsPayload(p, param, node, 0),
        (p) => performDrop(p, node.id, param.name, 0));
      slot.append(empty);
    }
  }
  return slot;
}

function renderDropGap(node, param, index) {
  const gap = el("div", { class: "ve-drop-gap" });
  attachDropTarget(gap,
    (p) => acceptsPayload(p, param, node, index),
    (p) => performDrop(p, node.id, param.name, index));
  return gap;
}

function acceptsPayload(payload, param, node, _index) {
  if (!payload) return false;
  if (payload.kind === "new") {
    if (slotAcceptsAny(param.type)) return true;
    const inner = slotElementName(param.type);
    if (inner === payload.name) return true;
    if (componentNames.has(inner)) return inner === payload.name;
    return true;
  }
  if (payload.kind === "move") {
    if (payload.id === node.id) return false;
    if (isAncestor(payload.id, node.id)) return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rendering — breadcrumbs

function renderBreadcrumbs() {
  const root = $("ve-breadcrumbs");
  if (!root) return;
  root.innerHTML = "";
  if (!state.selectedId) {
    root.append(el("span", { style: "color: var(--doc-text-subtle); font-style: italic;" }, "Click any component to edit its props"));
    return;
  }
  // Walk from root to the selected node, building the path.
  const path = [];
  let info = findContainer(state.selectedId);
  let cur = findNode(state.selectedId);
  while (cur) {
    path.unshift(cur);
    if (!info || !info.parent) break;
    cur = info.parent;
    info = findContainer(cur.id);
  }
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    const isLast = i === path.length - 1;
    const btn = el("button", {
      type: "button",
      class: isLast ? "is-current" : "",
      onClick: () => { state.selectedId = node.id; scheduleRender(); },
    }, node.kind === "expr" ? "expr" : node.name);
    root.append(btn);
    if (i < path.length - 1) {
      root.append(el("i", { class: "fa-solid fa-chevron-right", "aria-hidden": "true" }));
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering — inspector

function renderInspector() {
  const root = $("ve-inspector");
  if (!root) return;
  root.innerHTML = "";

  if (!state.selectedId) {
    root.append(el("div", { class: "ve-inspector-empty" }, [
      el("i", { class: "fa-solid fa-mouse-pointer", "aria-hidden": "true" }),
      el("p", null, "Select a component on the canvas to edit its properties."),
    ]));
    renderPreludeBlock(root);
    return;
  }

  const node = findNode(state.selectedId);
  if (!node) {
    state.selectedId = null;
    return renderInspector();
  }
  if (node.kind === "expr") return renderExprInspector(node, root);
  return renderComponentInspector(node, root);
}

function renderExprInspector(node, root) {
  const info = findContainer(node.id);
  root.append(el("div", { class: "ve-insp-title" }, [
    el("i", { class: "fa-solid fa-code" }),
    el("span", null, "Raw expression"),
    el("span", { class: "ve-insp-group-tag" }, "import"),
  ]));
  root.append(el("p", { class: "ve-insp-desc" },
    "This child wasn't recognised as a built-in component during import. Edit the source below or replace it by deleting it and dropping a new component."));
  const ta = el("textarea", {
    class: "ve-prop-input",
    style: "min-height: 140px;",
    onInput: (e) => { node.raw = e.target.value; queueCodeUpdate(); },
  });
  ta.value = node.raw;
  root.append(ta);
  if (info && info.parent) {
    root.append(el("div", { class: "ve-insp-actions", style: "margin-top: 14px;" }, [
      el("button", { class: "ve-btn", onClick: () => { deleteNode(node.id); saveState(); scheduleRender(); } }, [
        el("i", { class: "fa-solid fa-trash" }), el("span", null, "Delete"),
      ]),
    ]));
  }
}

function renderComponentInspector(node, root) {
  const entry = getEntry(node.name);
  root.append(el("div", { class: "ve-insp-title" }, [
    el("i", { class: "fa-solid fa-cube" }),
    el("span", null, node.name),
    el("span", { class: "ve-insp-group-tag" }, entry ? entry.group : "unknown"),
  ]));
  if (entry) {
    root.append(el("p", { class: "ve-insp-desc" }, entry.description));
  }
  const info = findContainer(node.id);
  const isRoot = !info || !info.parent;
  root.append(el("div", { class: "ve-insp-actions" }, [
    el("button", { class: "ve-btn", disabled: isRoot,
      onClick: () => { duplicateNode(node.id); saveState(); scheduleRender(); },
    }, [el("i", { class: "fa-solid fa-clone" }), el("span", null, "Duplicate")]),
    el("button", { class: "ve-btn", disabled: isRoot,
      onClick: () => { if (moveNode(node.id, "up")) { saveState(); scheduleRender(); } },
    }, [el("i", { class: "fa-solid fa-arrow-up" }), el("span", null, "Up")]),
    el("button", { class: "ve-btn", disabled: isRoot,
      onClick: () => { if (moveNode(node.id, "down")) { saveState(); scheduleRender(); } },
    }, [el("i", { class: "fa-solid fa-arrow-down" }), el("span", null, "Down")]),
    el("button", { class: "ve-btn", style: "color: var(--doc-danger); border-color: rgba(239,68,68,.25);", disabled: isRoot,
      onClick: () => {
        const before = info && info.parent ? info.parent.id : null;
        deleteNode(node.id);
        state.selectedId = before;
        saveState();
        scheduleRender();
      },
    }, [el("i", { class: "fa-solid fa-trash" }), el("span", null, "Delete")]),
  ]));

  if (!entry) {
    root.append(el("p", { class: "ve-insp-desc" },
      "This component isn't registered. Editing limited to raw props."));
  }

  const props = entry ? entry.params : [];
  const setProps = props.filter((p) =>
    (p.name in node.raws) || (p.name in node.slots),
  );
  // Render set props in spec order.
  for (const param of props) {
    if (!(param.name in node.raws) && !(param.name in node.slots) && !param.required) continue;
    root.append(renderPropEditor(node, param));
  }
  // Render an "Add property" picker for unset optional props.
  const unset = props.filter((p) =>
    !(p.name in node.raws) && !(p.name in node.slots),
  );
  if (unset.length > 0) {
    root.append(renderAddPropertyControl(node, unset));
  }
  renderPreludeBlock(root);
}

function renderPropEditor(node, param) {
  const wrap = el("div", { class: "ve-prop", data: { prop: param.name } });
  const slotKind = getSlotKind(param.type);
  const head = el("div", { class: "ve-prop-head" }, [
    el("span", { class: "ve-prop-name" }, param.name),
    param.required ? el("span", { class: "ve-prop-required", title: "Required" }, "*") : null,
    el("span", { class: "ve-prop-type" }, param.type),
    el("span", { class: "ve-prop-spacer" }),
    !param.required ? el("button", {
      class: "ve-prop-clear", title: "Remove this property",
      onClick: () => {
        delete node.raws[param.name];
        delete node.slots[param.name];
        saveState();
        scheduleRender();
      },
    }, "✕") : null,
  ]);
  wrap.append(head);

  if (slotKind === "children" || slotKind === "child") {
    const slot = node.slots[param.name];
    const summary = slotKind === "children"
      ? (Array.isArray(slot) ? slot.length + " child" + (slot.length === 1 ? "" : "ren") : "0 children")
      : (slot ? slot.name || "expr" : "empty");
    wrap.append(el("div", { class: "ve-prop-input", style: "color: var(--doc-text-muted); cursor: default;" },
      "Drop components on the canvas slot — current: " + summary));
  } else {
    wrap.append(renderRawValueEditor(node, param));
  }
  if (param.description) {
    wrap.append(el("div", { class: "ve-prop-desc" }, param.description));
  }
  return wrap;
}

function renderRawValueEditor(node, param) {
  const raw = node.raws[param.name] != null ? node.raws[param.name] : "";
  const t = String(param.type || "").trim();
  const decoded = decodeRaw(raw, t);

  // If the user has already used a structured form, keep showing it. If
  // the raw text doesn't decode cleanly to the typed shape, fall through
  // to the free-text editor.
  if (param.enumValues && param.enumValues.length > 0 && decoded.kind === "string") {
    const sel = el("select", {
      class: "ve-prop-input",
      onChange: (e) => updateRaw(node, param.name, quote(e.target.value)),
    });
    if (!param.required) sel.append(el("option", { value: "__unset__" }, "—"));
    for (const v of param.enumValues) {
      const opt = el("option", { value: v }, v);
      if (v === decoded.value) opt.selected = true;
      sel.append(opt);
    }
    return sel;
  }
  if (t === "boolean" && decoded.kind === "boolean") {
    return el("label", { class: "ve-prop-bool" }, [
      el("input", {
        type: "checkbox",
        checked: decoded.value,
        onChange: (e) => updateRaw(node, param.name, e.target.checked ? "true" : "false"),
      }),
      el("span", null, decoded.value ? "true" : "false"),
    ]);
  }
  if (t === "number" && decoded.kind === "number") {
    return el("input", {
      type: "number",
      class: "ve-prop-input",
      value: String(decoded.value),
      onInput: (e) => {
        const n = e.target.value;
        if (n === "" || isNaN(Number(n))) return;
        updateRaw(node, param.name, n);
      },
    });
  }
  if (t === "string" && decoded.kind === "string") {
    const isLong = /description|body|message|details|caption/i.test(param.name);
    if (isLong) {
      const ta = el("textarea", {
        class: "ve-prop-input",
        rows: 3,
        onInput: (e) => updateRaw(node, param.name, quote(e.target.value)),
      });
      ta.value = decoded.value;
      return ta;
    }
    const inp = el("input", {
      type: "text",
      class: "ve-prop-input",
      value: decoded.value,
      onInput: (e) => updateRaw(node, param.name, quote(e.target.value)),
    });
    return inp;
  }
  if (t === "string[]" && decoded.kind === "string[]") {
    const inp = el("input", {
      type: "text",
      class: "ve-prop-input",
      value: decoded.values.join(", "),
      placeholder: "Comma-separated values",
      onInput: (e) => {
        const items = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
        updateRaw(node, param.name, "[" + items.map(quote).join(", ") + "]");
      },
    });
    return inp;
  }

  // Fallback: free-text raw expression editor.
  const ta = el("textarea", {
    class: "ve-prop-input",
    rows: raw.length > 64 || raw.includes("\n") ? 4 : 1,
    onInput: (e) => updateRaw(node, param.name, e.target.value),
    placeholder: "Raw Aktion expression",
  });
  ta.value = raw;
  return ta;
}

function updateRaw(node, propName, raw) {
  if (raw === "" || raw == null) {
    delete node.raws[propName];
  } else {
    node.raws[propName] = raw;
  }
  queueCodeUpdate();
  // Don't re-render the whole inspector on every keystroke — that would
  // blow away input focus. Just refresh the canvas summary and code.
  refreshSelectedSummary();
  saveState();
}

function refreshSelectedSummary() {
  // Lightweight refresh: update the canvas node's summary line and the
  // code/preview without rebuilding the inspector DOM.
  const sel = state.selectedId;
  if (!sel) { renderCanvas(); return; }
  // Find the node card in the canvas, replace its summary chip.
  const canvas = $("ve-canvas");
  const cards = canvas.querySelectorAll(".ve-node");
  cards.forEach((card) => {
    if (card.dataset.id !== sel) return;
    // We'll just re-render the canvas — this is cheap.
  });
  renderCanvas();
}

/**
 * Decode a raw Aktion expression text into a structured form for typed
 * editors. Returns `{ kind: "raw" }` when we can't safely round-trip the
 * value through a typed editor.
 */
function decodeRaw(raw, type) {
  const r = String(raw).trim();
  if (r === "") return { kind: "empty" };
  if (r === "true" || r === "false") return { kind: "boolean", value: r === "true" };
  if (/^-?\d+(\.\d+)?$/.test(r)) return { kind: "number", value: Number(r) };
  if (/^"([^"\\]|\\.)*"$/.test(r) || /^'([^'\\]|\\.)*'$/.test(r)) {
    try {
      const parsed = JSON.parse(r.replace(/^'/, "\"").replace(/'$/, "\""));
      return { kind: "string", value: parsed };
    } catch (_) {
      // Try a tolerant unquote.
      return { kind: "string", value: r.slice(1, -1).replace(/\\(.)/g, "$1") };
    }
  }
  if (type === "string[]" && /^\[/.test(r)) {
    try {
      // Try a JSON-lenient parse for ["a","b"] arrays.
      const j = JSON.parse(r.replace(/'/g, "\""));
      if (Array.isArray(j) && j.every((v) => typeof v === "string")) {
        return { kind: "string[]", values: j };
      }
    } catch (_) {}
  }
  return { kind: "raw" };
}

function renderAddPropertyControl(node, unset) {
  const wrap = el("div", { style: "margin-top: 8px;" });
  const btn = el("button", {
    class: "ve-prop-add",
    type: "button",
    onClick: () => {
      const list = wrap.querySelector(".ve-prop-add-list");
      if (list) { list.remove(); return; }
      const items = el("div", { class: "ve-prop-add-list" });
      for (const p of unset) {
        items.append(el("button", {
          type: "button",
          onClick: () => addProp(node, p),
        }, [
          el("strong", null, p.name),
          el("code", null, p.type),
        ]));
      }
      wrap.append(items);
    },
  }, [
    el("i", { class: "fa-solid fa-plus", style: "margin-right: 6px;" }),
    el("span", null, "Add property (" + unset.length + ")"),
  ]);
  wrap.append(btn);
  return wrap;
}

function addProp(node, param) {
  const slotKind = getSlotKind(param.type);
  if (slotKind === "children") {
    node.slots[param.name] = [];
  } else if (slotKind === "child") {
    node.slots[param.name] = null;
  } else {
    node.raws[param.name] = defaultRawForParam(param);
  }
  saveState();
  scheduleRender();
}

function renderPreludeBlock(root) {
  const wrap = el("div", { class: "ve-prelude" });
  wrap.append(el("h4", null, "Prelude"));
  wrap.append(el("p", null,
    "Free-form Aktion source emitted before the " + state.rootId + " assignment. " +
    "Use this for state ($), components, actions, effects, theme overrides."));
  const ta = el("textarea", {
    class: "ve-prop-input",
    rows: 6,
    placeholder: "$count = 0\naction inc() { $count = $count + 1 }",
    onInput: (e) => { state.prelude = e.target.value; queueCodeUpdate(); saveState(); },
  });
  ta.value = state.prelude || "";
  wrap.append(ta);
  root.append(wrap);
}

// ---------------------------------------------------------------------------
// Bottom panel — code preview, HTML preview, live render

function updateBottomPanel() {
  const code = emitProgram();
  const htmlCode = buildStandaloneHtml(code, state.theme, "Aktion app");

  const codeEl = $("ve-code");
  if (codeEl) codeEl.innerHTML = highlightAktion(code);
  const htmlEl = $("ve-html");
  if (htmlEl) htmlEl.textContent = htmlCode;

  const preview = $("ve-preview");
  if (preview) {
    if (typeof preview.setTheme === "function") preview.setTheme(state.theme);
    else preview.setAttribute("theme", state.theme);
    if (typeof preview.setResponse === "function") preview.setResponse(code);
    else preview.setAttribute("response", code);
  }
}

function highlightAktion(source) {
  // Tiny in-place highlighter for the read-only code panel. Reuses the
  // language tokenizer so colours match the playground / language docs.
  const tagToClass = {
    component: "tk-comp",
    string: "tk-string",
    number: "tk-number",
    state: "tk-state",
    builtin: "tk-builtin",
    comment: "tk-comment",
    property: "tk-key",
  };
  const tokenizer = langSpec.tokenizer;
  const out = [];
  const lines = source.split("\n");
  for (const line of lines) {
    const stream = makeStream(line);
    const state = tokenizer.startState();
    while (!stream.eol()) {
      const start = stream.pos;
      const kind = tokenizer.token(stream, state);
      const text = line.slice(start, stream.pos);
      const cls = tagToClass[kind];
      if (cls) {
        out.push('<span class="' + cls + '">' + escapeHtml(text) + "</span>");
      } else {
        out.push(escapeHtml(text));
      }
    }
    out.push("\n");
  }
  return out.join("").replace(/\n$/, "");
}

/**
 * Minimal CodeMirror-compatible StringStream shim so we can drive the
 * shared tokenizer without pulling CM in. Only implements the methods
 * the Aktion tokenizer touches.
 */
function makeStream(line) {
  return {
    string: line,
    pos: 0,
    start: 0,
    eol() { return this.pos >= this.string.length; },
    sol() { return this.pos === 0; },
    peek() { return this.string[this.pos]; },
    next() { return this.pos < this.string.length ? this.string[this.pos++] : undefined; },
    eat(match) {
      const ch = this.string[this.pos];
      if (typeof match === "string" ? ch === match : (match && match.test && match.test(ch))) {
        this.pos++; return ch;
      }
      return null;
    },
    eatWhile(match) {
      const start = this.pos;
      while (this.eat(match)) { /* loop */ }
      return this.pos > start;
    },
    eatSpace() { return this.eatWhile(/[\s\u00a0]/); },
    skipToEnd() { this.pos = this.string.length; },
    skipTo(ch) {
      const i = this.string.indexOf(ch, this.pos);
      if (i < 0) return false;
      this.pos = i; return true;
    },
    backUp(n) { this.pos -= n; },
    column() { return this.pos; },
    indentation() { return 0; },
    match(pattern, consume, caseInsensitive) {
      if (typeof pattern === "string") {
        const cased = (s) => caseInsensitive ? s.toLowerCase() : s;
        const slice = this.string.slice(this.pos, this.pos + pattern.length);
        if (cased(slice) === cased(pattern)) {
          if (consume !== false) this.pos += pattern.length;
          return true;
        }
        return null;
      }
      const m = this.string.slice(this.pos).match(pattern);
      if (!m || m.index > 0) return null;
      if (consume !== false) this.pos += m[0].length;
      return m;
    },
    current() { return this.string.slice(this.start, this.pos); },
    indent() { return 0; },
  };
}

// ---------------------------------------------------------------------------
// Persistence

function saveState() {
  try {
    const payload = {
      tree: state.tree,
      prelude: state.prelude,
      rootId: state.rootId,
      theme: state.theme,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (_) { /* quota / privacy */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && data.tree) {
      state.tree = data.tree;
      state.prelude = data.prelude || "";
      state.rootId = data.rootId || "_app_";
      state.theme = data.theme || "light";
      return true;
    }
  } catch (_) {}
  return false;
}

// ---------------------------------------------------------------------------
// Render scheduling

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderCanvas();
    renderInspector();
    renderBreadcrumbs();
    queueCodeUpdate();
  });
}

const queueCodeUpdate = debounce(updateBottomPanel, 80);

// ---------------------------------------------------------------------------
// Examples

const EXAMPLES = [
  {
    name: "Welcome card",
    desc: "Stack with a card and a follow-up block.",
    code:
      '_app_ = Stack([\n' +
      '  Card([CardHeader("Hello, world", subtitle: "Generated visually")]),\n' +
      '  FollowUpBlock([\n' +
      '    FollowUpItem("Tell me more"),\n' +
      '    FollowUpItem("Show an example")\n' +
      '  ])\n' +
      '])',
  },
  {
    name: "Dashboard",
    desc: "Header + KPI strip + chart.",
    code:
      '_app_ = Stack([\n' +
      '  PageHeader("Sales", subtitle: "This week"),\n' +
      '  Stats([\n' +
      '    StatCard("Revenue", value: "$12,540", trend: "up", delta: "+12%", icon: "sack-dollar"),\n' +
      '    StatCard("Orders",  value: "138",     trend: "up", delta: "+4%",  icon: "cart-shopping"),\n' +
      '    StatCard("Returns", value: "4",       trend: "down", delta: "-1", icon: "rotate-left")\n' +
      '  ]),\n' +
      '  Card([\n' +
      '    CardHeader("Daily traffic"),\n' +
      '    LineChart(["Mo","Tu","We","Th","Fr","Sa","Su"],\n' +
      '      series: [Series("This week", values: [820, 1240, 1500, 1180, 1310, 980, 740])])\n' +
      '  ])\n' +
      '])',
  },
  {
    name: "Reactive todo",
    desc: "Reactive state, action, and a for-loop.",
    code:
      '$todos = [{id: 1, text: "First task", done: false}]\n' +
      '$draft = ""\n\n' +
      'action addTodo() {\n' +
      '  $todos = [...$todos, {id: $todos.length + 1, text: $draft, done: false}]\n' +
      '  $draft = ""\n' +
      '}\n\n' +
      'component Row(t) {\n' +
      '  return Card([Text(t.text)])\n' +
      '}\n\n' +
      '_app_ = Stack([\n' +
      '  Card([CardHeader("Todo list")]),\n' +
      '  Input("draft", placeholder: "What needs doing?", value: $draft),\n' +
      '  Button("Add", action: addTodo, variant: "primary"),\n' +
      '  for t in $todos { Row(t) }\n' +
      '])',
  },
  {
    name: "Pricing table",
    desc: "Three pricing cards in a grid.",
    code:
      '_app_ = Stack([\n' +
      '  Hero("Plans for every team", subtitle: "Pick the size that fits."),\n' +
      '  PricingTable([\n' +
      '    PricingCard("Starter", price: "$0",  period: "/mo", features: ["1 user", "Community support"]),\n' +
      '    PricingCard("Team",    price: "$24", period: "/mo", features: ["10 users", "Email support"], featured: true),\n' +
      '    PricingCard("Scale",   price: "$99", period: "/mo", features: ["Unlimited", "Priority support"])\n' +
      '  ])\n' +
      '])',
  },
];

function showExamplesModal() {
  const list = $("ve-example-list");
  if (!list) return;
  list.innerHTML = "";
  for (const ex of EXAMPLES) {
    const card = el("button", {
      class: "ve-btn",
      style: "flex-direction: column; align-items: flex-start; padding: 14px; height: auto; gap: 4px; text-align: left;",
      onClick: () => {
        const result = importFromSource(ex.code);
        applyImportResult(result);
        $("ve-example-backdrop").hidden = true;
        showToast("Loaded " + ex.name, { icon: "check" });
      },
    }, [
      el("strong", null, ex.name),
      el("span", { style: "font-size: 12px; color: var(--doc-text-muted); font-weight: 400;" }, ex.desc),
    ]);
    list.append(card);
  }
  $("ve-example-backdrop").hidden = false;
}

// ---------------------------------------------------------------------------
// Import / Export plumbing

function applyImportResult(result) {
  state.tree = result.tree;
  state.prelude = result.prelude;
  if (result.rootId) state.rootId = result.rootId;
  state.selectedId = null;
  if (result.warnings && result.warnings.length > 0) {
    showToast(result.warnings[0].message, { icon: "circle-exclamation" });
  }
  if (result.errors && result.errors.length > 0) {
    showToast(result.errors.length + " parse error(s) — see code panel", { tone: "danger", icon: "circle-exclamation" });
  }
  saveState();
  scheduleRender();
}

function downloadFile(text, filename, type) {
  const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast("Copied", { icon: "check" }),
      () => showToast("Couldn't copy", { tone: "danger", icon: "circle-exclamation" }),
    );
  }
}

// ---------------------------------------------------------------------------
// Bootstrap

function bindToolbar() {
  $("ve-new").addEventListener("click", () => {
    if (!confirm("Reset the canvas to a blank Stack? Your current work will be lost.")) return;
    state.tree = createDefaultTree();
    state.prelude = "";
    state.selectedId = null;
    saveState();
    scheduleRender();
  });
  $("ve-import").addEventListener("click", () => {
    $("ve-import-text").value = "";
    $("ve-import-backdrop").hidden = false;
    setTimeout(() => $("ve-import-text").focus(), 50);
  });
  $("ve-load-example").addEventListener("click", showExamplesModal);
  $("ve-theme").addEventListener("change", (e) => {
    state.theme = e.target.value;
    saveState();
    queueCodeUpdate();
  });
  $("ve-toggle-palette").addEventListener("click", (e) => {
    state.paletteOpen = !state.paletteOpen;
    $("ve-app").dataset.palette = String(state.paletteOpen);
    e.currentTarget.setAttribute("aria-pressed", String(state.paletteOpen));
  });
  $("ve-toggle-inspector").addEventListener("click", (e) => {
    state.inspectorOpen = !state.inspectorOpen;
    $("ve-app").dataset.inspector = String(state.inspectorOpen);
    e.currentTarget.setAttribute("aria-pressed", String(state.inspectorOpen));
  });
  $("ve-export-aktion").addEventListener("click", () => {
    downloadFile(emitProgram(), "aktion-" + Date.now() + ".aktion", "text/plain;charset=utf-8");
  });
  $("ve-export-html").addEventListener("click", () => {
    downloadFile(buildStandaloneHtml(emitProgram(), state.theme, "Aktion app"),
      "aktion-" + Date.now() + ".html", "text/html;charset=utf-8");
  });
}

function bindBottom() {
  document.querySelectorAll(".ve-bottom-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.bottomTab = btn.dataset.tab;
      document.querySelectorAll(".ve-bottom-tab").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.tab === state.bottomTab));
      });
      document.querySelectorAll(".ve-bottom-tab-panel").forEach((p) => {
        p.dataset.active = String(p.dataset.tab === state.bottomTab);
      });
    });
  });
  $("ve-bottom-toggle").addEventListener("click", (e) => {
    state.bottomOpen = !state.bottomOpen;
    $("ve-app").dataset.bottom = String(state.bottomOpen);
    const i = e.currentTarget.querySelector("i");
    i.classList.toggle("fa-chevron-down", state.bottomOpen);
    i.classList.toggle("fa-chevron-up", !state.bottomOpen);
  });
  $("ve-code-copy").addEventListener("click", () => copyText(emitProgram()));
  $("ve-code-download").addEventListener("click", () => {
    downloadFile(emitProgram(), "aktion-" + Date.now() + ".aktion", "text/plain;charset=utf-8");
  });
  $("ve-html-copy").addEventListener("click", () => copyText(buildStandaloneHtml(emitProgram(), state.theme, "Aktion app")));
  $("ve-html-download").addEventListener("click", () => {
    downloadFile(buildStandaloneHtml(emitProgram(), state.theme, "Aktion app"),
      "aktion-" + Date.now() + ".html", "text/html;charset=utf-8");
  });
}

function bindImportModal() {
  $("ve-import-cancel").addEventListener("click", () => { $("ve-import-backdrop").hidden = true; });
  $("ve-import-backdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  $("ve-import-confirm").addEventListener("click", () => {
    const src = $("ve-import-text").value;
    if (!src.trim()) { showToast("Paste source or upload a file first", { tone: "danger", icon: "circle-exclamation" }); return; }
    const result = importFromSource(src);
    applyImportResult(result);
    $("ve-import-backdrop").hidden = true;
    if (!result.errors || result.errors.length === 0) {
      showToast("Imported " + (state.tree && state.tree.name ? state.tree.name : "tree"), { icon: "check" });
    }
  });
  $("ve-import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      $("ve-import-text").value = text;
    } catch (err) {
      showToast("Couldn't read file: " + err.message, { tone: "danger", icon: "circle-exclamation" });
    } finally {
      e.target.value = "";
    }
  });
}

function bindExamplesModal() {
  $("ve-example-cancel").addEventListener("click", () => { $("ve-example-backdrop").hidden = true; });
  $("ve-example-backdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
}

function bindGlobalDragEnd() {
  document.addEventListener("dragend", () => {
    currentDragPayload = null;
    state.draggingId = null;
  });
  document.addEventListener("drop", () => {
    currentDragPayload = null;
    state.draggingId = null;
  });
}

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selectedId) {
        const info = findContainer(state.selectedId);
        if (info && info.parent) {
          deleteNode(state.selectedId);
          saveState();
          scheduleRender();
        }
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "d") {
      if (state.selectedId) {
        e.preventDefault();
        duplicateNode(state.selectedId);
        saveState();
        scheduleRender();
      }
    }
  });
}

function bindPaletteSearch() {
  const input = $("ve-palette-input");
  if (!input) return;
  input.addEventListener("input", (e) => {
    state.paletteSearch = e.target.value;
    renderPalette();
  });
}

async function bootstrap() {
  // Wait for the custom element to register, otherwise the preview's
  // `setResponse(...)` call goes to a generic HTMLElement.
  if (typeof customElements !== "undefined") {
    try { await customElements.whenDefined("aktion-app"); } catch (_) {}
  }
  if (!loadState()) {
    state.tree = createDefaultTree();
  }
  $("ve-theme").value = state.theme;
  $("ve-loading").hidden = true;

  bindToolbar();
  bindBottom();
  bindImportModal();
  bindExamplesModal();
  bindGlobalDragEnd();
  bindKeyboard();
  bindPaletteSearch();

  renderPalette();
  scheduleRender();
}

bootstrap().catch((err) => {
  const loading = $("ve-loading");
  if (loading) {
    loading.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>&nbsp;Couldn\'t load the editor: ' + escapeHtml(err.message || String(err));
  }
});
