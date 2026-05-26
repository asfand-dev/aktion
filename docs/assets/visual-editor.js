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
 * The user composes the right-hand side of the `aktion` assignment by
 * dragging components from the palette onto the canvas. Every component
 * surfaces its real prop catalog (read from the language spec) so the
 * inspector can render typed editors with enum suggestions, and any prop
 * can be flipped into "raw expression" mode for advanced Aktion syntax.
 *
 * Source-text round-trip:
 *   - Import: parses the program, extracts the `aktion` expression by
 *     bracket-tracking the original source, and walks the AST into the
 *     visual tree. Every other top-level statement (state, components,
 *     actions, effects, theme overrides) survives verbatim as a "prelude"
 *     block.
 *   - Export: emits the prelude unchanged, then re-serialises the visual
 *     tree as `aktion = <expr>` and concatenates the two.
 */

import {
  defaultLibrary,
  findPositionalIndex,
  parse,
  getLanguageSpec,
} from "../../dist/aktion.js?v=2026.05.25-bind-deprecated";

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
//
// The editor models the program as a list of "entities" — typed top-level
// declarations (assignments, state, function / effect decls, and
// any free-form leftover source that we can't classify safely). Each
// entity has its own visual tree (for component-call assignments) or raw
// text body (for functions/effects/state defaults).
//
// `activeEntityId` decides which entity drives the canvas. The live
// preview always re-emits the FULL program so identifier references
// (sidebar, pages, $todos, …) stay bound regardless of which entity the
// user is editing.

const LS_KEY = "rui:ve:state";

const state = {
  // Legacy single-tree fields (kept for backwards compat with persisted
  // state and as a fallback when no entities are loaded yet).
  tree: null,             // root VisualNode of the active entity
  prelude: "",            // free-form leftover that we couldn't classify
  rootId: "aktion",
  // Entity-based model — see `parseEntities()` for the shape.
  entities: [],           // Entity[]
  activeEntityId: null,
  selectedId: null,
  hoveredId: null,        // id of node currently hovered in the canvas
  draggingId: null,       // id of node being dragged inside the canvas
  paletteSearch: "",
  paletteOpenGroups: new Set(GROUP_ORDER),
  paletteOpen: true,
  paletteTab: "components", // "components" | "outline"
  inspectorOpen: true,
  theme: "light",
  device: "desktop",      // "desktop" | "tablet" | "mobile"
  zoom: 1,                // 0.5 .. 1.5
  mode: "edit",           // "edit" | "preview" | "raw"
  drop: null,             // { parentId, slotName, index } during drag
  // Maps populated by decorateRenderedDOM after every render.
  rectsById: new Map(),
  rectsBySlot: new Map(), // key: parentId+":"+slotName -> array of child rects
};

// Undo / redo history. Each entry is a snapshot of { tree, prelude, rootId }.
const history = {
  past: [],
  future: [],
  max: 80,
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
/**
 * Decide whether a prop type string accepts a visual subtree, and if so
 * whether it's a single child or a list. Handles `Node[]`, `Node`, simple
 * component names (`Sidebar`, `Card`, …), and union types restricted to
 * known component names — `(SidebarItem | SidebarSection)[]` resolves to
 * a children slot so the visual editor can drop / re-order items.
 */
function getSlotKind(typeStr) {
  const t = String(typeStr || "").trim();
  if (t === "Node[]") return "children";
  if (t === "Node") return "child";
  if (t.endsWith("[]")) {
    const inner = t.slice(0, -2).trim();
    if (isComponentUnion(inner)) return "children";
  } else if (isComponentUnion(t)) {
    return "child";
  }
  return null;
}

/**
 * True when `inner` is either a single known component name or a union
 * of known component names (e.g. `(A | B | C)` or `A | B`). Strips
 * surrounding parens / spaces so it matches the spec strings used in
 * `src/library/components/*`.
 */
function isComponentUnion(inner) {
  if (!inner) return false;
  const stripped = inner.replace(/^\(|\)$/g, "").trim();
  if (!stripped) return false;
  const parts = stripped.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => componentNames.has(p));
}

function slotAcceptsAny(typeStr) {
  const t = String(typeStr || "").trim();
  return t === "Node" || t === "Node[]";
}

function slotElementName(typeStr) {
  const t = String(typeStr || "").trim();
  let inner = t;
  if (inner.endsWith("[]")) inner = inner.slice(0, -2).trim();
  inner = inner.replace(/^\(|\)$/g, "").trim();
  // For union types, return the first member — the visual editor uses
  // this primarily for drop-target hints and create-from-palette flows.
  const first = inner.split("|").map((s) => s.trim()).find(Boolean);
  return first || t;
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

/**
 * Locate a node by id. When `root` is omitted, search every assignment
 * entity's tree (active tree first, then the rest) so cross-entity
 * selections from the WYSIWYG canvas resolve correctly even before the
 * active entity has been swapped in.
 */
function findNode(id, root) {
  if (!id) return null;
  if (root !== undefined) {
    let found = null;
    walkNodes(root, (n) => {
      if (n.id === id) { found = n; return false; }
      return true;
    });
    return found;
  }
  if (state.tree) {
    let found = null;
    walkNodes(state.tree, (n) => {
      if (n.id === id) { found = n; return false; }
      return true;
    });
    if (found) return found;
  }
  for (const ent of state.entities || []) {
    if (ent.kind !== "assignment" || !ent.tree) continue;
    if (ent.tree === state.tree) continue;
    let found = null;
    walkNodes(ent.tree, (n) => {
      if (n.id === id) { found = n; return false; }
      return true;
    });
    if (found) return found;
  }
  return null;
}

/**
 * Locate the parent/slot information for a node id. Like `findNode`, the
 * search spans every assignment entity when no explicit root is provided
 * so mutations triggered from the canvas continue working when the user
 * hasn't focused the owning entity yet.
 */
function findContainer(id, root) {
  if (!id) return null;
  const searchIn = (tree) => {
    let result = null;
    walkNodes(tree, (n, parent, slotName) => {
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
  };
  if (root !== undefined) return searchIn(root);
  if (state.tree) {
    const r = searchIn(state.tree);
    if (r) return r;
  }
  for (const ent of state.entities || []) {
    if (ent.kind !== "assignment" || !ent.tree) continue;
    if (ent.tree === state.tree) continue;
    const r = searchIn(ent.tree);
    if (r) return r;
  }
  return null;
}

/**
 * Return the assignment entity that owns `nodeId`. Used by the canvas
 * to switch the active entity when the user clicks a component that
 * lives outside the currently focused binding.
 */
function findOwnerEntity(id) {
  if (!id) return null;
  for (const ent of state.entities || []) {
    if (ent.kind !== "assignment" || !ent.tree) continue;
    let hit = false;
    walkNodes(ent.tree, (n) => {
      if (n.id === id) { hit = true; return false; }
      return true;
    });
    if (hit) return ent;
  }
  return null;
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
// Entities — top-level program model
//
// `parseEntities(source)` slices a complete Aktion program into entries.
// The parser walks line-by-line, classifying each top-level statement by
// the keyword that starts it (`component`, `action`, `effect`, `$state =`,
// `name =`). Anything we can't classify becomes a "free" entity that the
// user can edit as raw text.
//
// Each entity has:
//   - `id`: unique editor handle (not persisted to source).
//   - `kind`: "assignment" | "state" | "component-decl" | "action-decl"
//             | "effect-decl" | "free".
//   - `name`: display name.
//   - `source`: original or current source slice (always round-tripped).
//   - `tree` / `raw`: optional structured form for visual editing.

const ROOT_ENTITY_NAME = "aktion";

function uuidEntity() {
  return "e_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
}

/**
 * Classify a top-level statement by its first non-whitespace token. The
 * heuristics intentionally favour false negatives — when we can't be sure,
 * we fall back to a "free" entity that round-trips verbatim.
 */
function classifyStatement(line) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("//")) return null;
  if (/^function\s+[A-Z]\w*\s*\(/.test(trimmed)) return "component-decl";
  if (/^function\s+[a-z_]\w*\s*\(/.test(trimmed)) return "action-decl";
  if (/^effect\s*\(/.test(trimmed)) return "effect-decl";
  if (/^\$[A-Za-z_]\w*\s*=/.test(trimmed)) return "state";
  if (/^(let\s+)?\$[A-Za-z_]\w*\s*=/.test(trimmed)) return "state";
  if (/^[A-Za-z_]\w*\s*=/.test(trimmed)) return "assignment";
  return "free";
}

/**
 * Same bracket-tracking logic as `scanExpressionEnd` but extended to
 * follow `{ … }` blocks (function / effect bodies). Returns
 * the position one past the statement's last character.
 */
function scanStatementEnd(source, start, kind) {
  let i = start;
  const stack = []; // "(" / "[" / "{" / "tpl-expr"
  let str = null;
  let comment = null;
  let seenOpenBrace = false;
  const wantsBlock = kind === "component-decl" || kind === "action-decl" || kind === "effect-decl";
  while (i < source.length) {
    const ch = source[i];
    if (comment === "line") {
      if (ch === "\n") {
        comment = null;
        if (!wantsBlock && stack.length === 0) return i;
        if (wantsBlock && seenOpenBrace && stack.length === 0) return i;
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
        str = null;
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
    if (ch === "/" && source[i + 1] === "*") { comment = "block"; i += 2; continue; }
    if (ch === '"' || ch === "'") { str = ch; i++; continue; }
    if (ch === "`") { str = "`"; i++; continue; }
    if (ch === "(" || ch === "[") { stack.push(ch); i++; continue; }
    if (ch === "{") {
      stack.push("{");
      if (wantsBlock) seenOpenBrace = true;
      i++; continue;
    }
    if (ch === ")" || ch === "]") { stack.pop(); i++; continue; }
    if (ch === "}") {
      const top = stack[stack.length - 1];
      stack.pop();
      if (top === "tpl-expr") str = "`";
      if (wantsBlock && seenOpenBrace && stack.length === 0) return i + 1;
      i++; continue;
    }
    if (!wantsBlock && ch === "\n" && stack.length === 0) return i;
    i++;
  }
  return i;
}

/**
 * Slice the source into a list of entities, preserving everything between
 * recognised statements as "free" entities so nothing is dropped.
 */
function parseEntities(source) {
  const entities = [];
  const text = String(source ?? "");
  let i = 0;
  let freeStart = 0;
  const flushFree = (until) => {
    if (until <= freeStart) return;
    const slice = text.slice(freeStart, until).trim();
    if (slice.length === 0) return;
    entities.push({
      id: uuidEntity(),
      kind: "free",
      name: "Misc",
      source: slice,
    });
  };
  while (i < text.length) {
    // Skip leading whitespace; remember where the next "free" run started.
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    // Skip whole-line comments and accumulate them into the free bucket.
    if (text[i] === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl + 1;
      continue;
    }
    const lineStart = i;
    // Read up to end-of-line to peek at the statement header.
    const nl = text.indexOf("\n", i);
    const headerLine = text.slice(lineStart, nl < 0 ? text.length : nl);
    const kind = classifyStatement(headerLine);
    if (!kind || kind === "free") {
      i = nl < 0 ? text.length : nl + 1;
      continue;
    }
    const end = scanStatementEnd(text, lineStart, kind);
    flushFree(lineStart);
    const slice = text.slice(lineStart, end);
    const entity = buildEntityFromSource(kind, slice);
    if (entity) entities.push(entity);
    i = end;
    freeStart = i;
  }
  flushFree(text.length);
  return entities;
}

/**
 * Build a structured entity from its raw source slice. The visual tree
 * for assignments is constructed by re-parsing `name = <expr>` so we get
 * a clean AST; everything else keeps the raw source for round-tripping.
 */
function buildEntityFromSource(kind, sliceRaw) {
  const slice = String(sliceRaw).trim();
  const id = uuidEntity();
  if (kind === "state" || kind === "assignment") {
    const m = slice.match(/^(\$?[A-Za-z_]\w*)\s*=\s*([\s\S]*)$/);
    if (!m) return { id, kind: "free", name: "Misc", source: slice };
    const isState = m[1].startsWith("$");
    const name = isState ? m[1].slice(1) : m[1];
    const rhs = m[2].trim();
    if (isState) {
      return { id, kind: "state", name, raw: rhs, source: slice };
    }
    const program = parse(`${name} = ${rhs}`);
    let tree = null;
    let raw = rhs;
    if (program.statements && program.statements.length > 0) {
      const first = program.statements[0];
      if (first.kind === "Assignment") {
        if (first.expression.kind === "Call" && componentNames.has(first.expression.callee)) {
          tree = buildComponentNode(first.expression, []);
          raw = null;
        }
      }
    }
    return { id, kind: "assignment", name, tree, raw, source: slice };
  }
  if (kind === "component-decl") {
    const headerMatch = slice.match(/^function\s+([A-Z]\w*)\s*\(([^)]*)\)/);
    if (!headerMatch) return { id, kind: "free", name: "Misc", source: slice };
    const name = headerMatch[1];
    const params = headerMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    return { id, kind: "component-decl", name, params, source: slice };
  }
  if (kind === "action-decl") {
    const headerMatch = slice.match(/^function\s+([a-z_]\w*)\s*\(([^)]*)\)/);
    const name = headerMatch ? headerMatch[1] : "anonymous";
    return { id, kind: "action-decl", name, source: slice };
  }
  if (kind === "effect-decl") {
    return { id, kind: "effect-decl", name: "effect", source: slice };
  }
  return { id, kind: "free", name: "Misc", source: slice };
}

/**
 * Locate the active entity in the entity list, falling back to the root
 * `aktion` entity (or the first one) so the canvas always has something
 * to display.
 */
function activeEntity() {
  if (state.entities.length === 0) return null;
  if (state.activeEntityId) {
    const hit = state.entities.find((e) => e.id === state.activeEntityId);
    if (hit) return hit;
  }
  const root = state.entities.find(
    (e) => e.kind === "assignment" && e.name === ROOT_ENTITY_NAME,
  );
  return root || state.entities[0];
}

/**
 * Promote the active entity's tree into the legacy `state.tree` slot so
 * the existing canvas / inspector code paths keep working unchanged.
 */
function syncActiveTreeFromEntity() {
  const ent = activeEntity();
  if (!ent) {
    state.tree = null;
    return;
  }
  if (ent.kind === "assignment" && ent.tree) {
    state.tree = ent.tree;
  } else {
    state.tree = null;
  }
}

/**
 * Build the source for every entity that has been structurally edited,
 * falling back to the stored raw `source` for entities we never opened
 * visually.
 */
function emitEntitySource(ent) {
  if (ent.kind === "assignment") {
    if (ent.tree) return ent.name + " = " + emitNode(ent.tree, 0);
    if (ent.raw != null) return ent.name + " = " + ent.raw;
    return ent.source || "";
  }
  if (ent.kind === "state") {
    return "$" + ent.name + " = " + (ent.raw ?? "null");
  }
  return ent.source || "";
}

// ---------------------------------------------------------------------------
// History (undo / redo)
//
// Each call to `commit()` snapshots the current tree before the next mutation
// runs. `undo()` / `redo()` swap snapshots in/out and trigger a re-render.

function snapshotTree() {
  return {
    tree: state.tree ? JSON.parse(JSON.stringify(state.tree)) : null,
    prelude: state.prelude,
    rootId: state.rootId,
  };
}

function commit() {
  history.past.push(snapshotTree());
  if (history.past.length > history.max) history.past.shift();
  history.future.length = 0;
  updateUndoRedoButtons();
}

function undo() {
  if (history.past.length === 0) return;
  history.future.push(snapshotTree());
  const prev = history.past.pop();
  state.tree = prev.tree;
  state.prelude = prev.prelude;
  state.rootId = prev.rootId;
  state.selectedId = null;
  saveState();
  updateUndoRedoButtons();
  scheduleRender();
}

function redo() {
  if (history.future.length === 0) return;
  history.past.push(snapshotTree());
  const next = history.future.pop();
  state.tree = next.tree;
  state.prelude = next.prelude;
  state.rootId = next.rootId;
  state.selectedId = null;
  saveState();
  updateUndoRedoButtons();
  scheduleRender();
}

function updateUndoRedoButtons() {
  const u = $("ve-undo");
  const r = $("ve-redo");
  if (u) u.disabled = history.past.length === 0;
  if (r) r.disabled = history.future.length === 0;
}

// ---------------------------------------------------------------------------
// Code generation

const INDENT_UNIT = "  ";

/**
 * Serialise the full program. When the entity model is in play, emit
 * each entity in order (using the structurally edited tree for the
 * active assignment, raw source for the rest). Otherwise fall back to
 * the single-tree path.
 */
function emitProgram() {
  if (state.entities && state.entities.length > 0) {
    syncActiveEntityFromTree();
    const parts = [];
    for (const ent of state.entities) {
      const src = emitEntitySource(ent);
      if (src && src.trim().length > 0) parts.push(src);
    }
    const prelude = (state.prelude || "").trim();
    if (prelude) parts.push(prelude);
    return parts.join("\n\n") + "\n";
  }
  const tree = state.tree;
  const exprSrc = emitNode(tree, 0);
  const prelude = (state.prelude || "").trim();
  const head = prelude ? prelude + "\n\n" : "";
  const rootId = state.rootId || "aktion";
  return head + rootId + " = " + exprSrc + "\n";
}

/**
 * Push edits made through `state.tree` back into the active entity so
 * the next emit reflects the user's drag/drop work.
 */
function syncActiveEntityFromTree() {
  const ent = activeEntity();
  if (!ent || ent.kind !== "assignment") return;
  if (state.tree) {
    ent.tree = state.tree;
    ent.raw = null;
  }
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

  // Canonical "one positional + trailing options object" emission.
  //
  // Named args (everything in `args`) become entries in a trailing
  // `{ key: value, ... }` object literal. Empty options object is
  // omitted entirely.
  if (!positionalArg && args.length === 0) return node.name + "()";

  const optionsSrc = args.length > 0 ? buildOptionsObject(args, depth) : null;
  const positionalSrc = positionalArg ? positionalArg.src : null;

  const parts = [];
  if (positionalSrc != null) parts.push(positionalSrc);
  if (optionsSrc != null) parts.push(optionsSrc.src);

  const hasMultiline =
    (positionalArg && positionalArg.multiLine) ||
    (optionsSrc && optionsSrc.multiLine);
  const inline = node.name + "(" + parts.join(", ") + ")";
  if (!hasMultiline && inline.length <= 80) return inline;

  const fuseHead = fusedPositional && positionalArg && parts.length > 1;
  if (fuseHead && optionsSrc) {
    return node.name + "(" + positionalSrc + ", " + optionsSrc.src + ")";
  }
  if (parts.length === 1) {
    return node.name + "(" + parts[0] + ")";
  }
  return (
    node.name + "(\n" +
    parts.map((p) => childIndent + p).join(",\n") + "\n" +
    indent + ")"
  );
}

/**
 * Pack a list of named args into a single trailing options-object literal.
 * Returns `{ src, multiLine }` where `src` is the rendered `{ ... }` text.
 * Omits the object entirely when `args` is empty.
 */
function buildOptionsObject(args, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const inner = INDENT_UNIT.repeat(depth + 1);
  const props = args.map((a) => a.name + ": " + a.src);
  const totalLen = props.reduce((n, p) => n + p.length + 2, 0) + 2;
  const anyMulti = args.some((a) => a.multiLine);
  if (!anyMulti && totalLen <= 70) {
    return { src: "{ " + props.join(", ") + " }", multiLine: false };
  }
  return {
    src: "{\n" + props.map((p) => inner + p).join(",\n") + "\n" + indent + "}",
    multiLine: true,
  };
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
    const raw = node.raws[param.name];
    const hasRaw = raw != null && raw !== "";
    if (!Array.isArray(arr)) {
      return hasRaw ? raw : null;
    }
    if (arr.length === 0) {
      // Empty visual array but a raw expression is bound — emit the raw
      // (e.g. `content: pages`) so identifier references survive the
      // round-trip. Otherwise fall back to `[]` for required slots only.
      if (hasRaw) return raw;
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
    case "If": return ifToSource(expr, depth);
    case "Switch": return switchToSource(expr, depth);
    case "For": return forToSource(expr, depth);
    case "Lambda": return lambdaToSource(expr, depth);
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
    return formatObjectKey(p.key) + ": " + exprToSource(p.value, depth + 1);
  });
  const totalLen = parts.reduce((n, p) => n + p.length + 2, 0);
  if (totalLen <= 60 && !parts.some((p) => p.includes("\n"))) {
    return "{" + parts.join(", ") + "}";
  }
  return "{\n" + parts.map((p) => inner + p).join(",\n") + "\n" + indent + "}";
}

/**
 * Object literal keys must be either a valid identifier, the reserved
 * `default` keyword (for Router arms), or a quoted string. Anything with
 * special characters (slashes, colons, dashes…) needs quotes.
 */
const VALID_IDENT_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function formatObjectKey(key) {
  if (key === "default") return "default";
  if (VALID_IDENT_KEY.test(key)) return key;
  return quote(key);
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
  let out = "if (" + exprToSource(expr.test, depth) + ") {\n" + ind1 + blockBody(expr.consequent, depth + 1) + "\n" + indent + "}";
  if (expr.alternate) {
    if (expr.alternate.kind === "If") {
      out += " else " + ifToSource(expr.alternate, depth);
    } else if (expr.alternate.kind === "Block") {
      out += " else {\n" + ind1 + blockBody(expr.alternate, depth + 1) + "\n" + indent + "}";
    }
  }
  return out;
}

function switchToSource(expr, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const ind1 = INDENT_UNIT.repeat(depth + 1);
  const ind2 = INDENT_UNIT.repeat(depth + 2);
  const arms = (expr.cases || []).map((c) => {
    const bodyStr = (c.body || []).map((s) => statementToSource(s, depth + 2)).join("\n" + ind2);
    if (c.test === null) {
      return ind1 + "default: " + bodyStr;
    }
    // Trailing `break` keeps subsequent cases independent. The parser
    // accepts `break` with or without a semicolon — emit without to
    // avoid the newline-after-break edge case in switch-as-expression.
    return ind1 + "case " + exprToSource(c.test, depth + 1) + ": " + bodyStr + "; break";
  });
  return "switch (" + exprToSource(expr.discriminant, depth) + ") {\n" + arms.join("\n") + "\n" + indent + "}";
}

function forToSource(expr, depth) {
  const indent = INDENT_UNIT.repeat(depth);
  const ind1 = INDENT_UNIT.repeat(depth + 1);
  let binding;
  if (expr.destructure) {
    binding = "{" + expr.destructure.join(", ") + "}";
  } else if (expr.index) {
    binding = "[" + expr.item + ", " + expr.index + "]";
  } else {
    binding = expr.item;
  }
  const head = "for (let " + binding + " of " + exprToSource(expr.iterable, depth) + ")";
  return head + " {\n" + ind1 + blockBody(expr.body, depth + 1) + "\n" + indent + "}";
}

function lambdaToSource(expr, depth) {
  const params = expr.params.map((p) => p.name).join(", ");
  if (expr.body && expr.body.kind === "Block") {
    const indent = INDENT_UNIT.repeat(depth);
    const ind1 = INDENT_UNIT.repeat(depth + 1);
    return "(" + params + ") => {\n" + ind1 + blockBody(expr.body, depth + 1) + "\n" + indent + "}";
  }
  // An expression-bodied lambda whose body is an Object literal needs
  // parens to disambiguate from a Block: `(x) => ({ a: 1 })`.
  if (expr.body && expr.body.kind === "Object") {
    return "(" + params + ") => (" + exprToSource(expr.body, depth) + ")";
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
    const def = defaultEntities();
    return {
      tree: def.tree,
      prelude: "",
      entities: def.entities,
      activeEntityId: def.entities[0].id,
      warnings: [],
      errors: [],
      rootId: ROOT_ENTITY_NAME,
    };
  }

  // Pass 1: classify every top-level statement into a typed entity.
  const entities = parseEntities(text);
  // Pass 2: try to validate the whole program so we can surface parse
  // errors. The structured entities take precedence on edits; errors
  // are advisory.
  const program = parse(text);
  const errors = program.errors || [];
  const warnings = [];

  if (entities.length === 0) {
    const def = defaultEntities();
    return {
      tree: def.tree,
      prelude: text.replace(/\s+$/, ""),
      entities: def.entities,
      activeEntityId: def.entities[0].id,
      warnings: [{ message: "Couldn't recognise any top-level statement. Source kept as prelude." }],
      errors,
      rootId: ROOT_ENTITY_NAME,
    };
  }

  // Ensure there's always an `aktion` entity so the canvas has a default
  // focus. If the source had no `aktion`, synthesize a stub pointing at
  // an empty stack so authors can continue editing visually.
  const hasApp = entities.some(
    (e) => e.kind === "assignment" && e.name === ROOT_ENTITY_NAME,
  );
  let activeEntityId = null;
  if (!hasApp) {
    const stub = {
      id: uuidEntity(),
      kind: "assignment",
      name: ROOT_ENTITY_NAME,
      tree: createDefaultTree(),
      raw: null,
      source: "",
    };
    entities.unshift(stub);
    activeEntityId = stub.id;
  } else {
    const app = entities.find(
      (e) => e.kind === "assignment" && e.name === ROOT_ENTITY_NAME,
    );
    activeEntityId = app.id;
  }

  // Use the active entity's tree (when present) as the legacy `tree`
  // field so the existing canvas paths keep working.
  const active = entities.find((e) => e.id === activeEntityId);
  const tree = active && active.tree ? active.tree : createDefaultTree();

  return {
    tree,
    prelude: "",
    entities,
    activeEntityId,
    warnings,
    errors,
    rootId: ROOT_ENTITY_NAME,
  };
}

/**
 * Default entity list — a single `aktion` assignment with the default
 * starter tree. Used when no source is provided or no statements parse.
 */
function defaultEntities() {
  const tree = createDefaultTree();
  const root = {
    id: uuidEntity(),
    kind: "assignment",
    name: ROOT_ENTITY_NAME,
    tree,
    raw: null,
    source: "",
  };
  return { tree, entities: [root] };
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
    const args = expr.arguments || [];
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    const hasTrailingObj = lastArg && lastArg.kind === "Object";
    const positionalArgs = hasTrailingObj ? args.slice(0, -1) : args;
    positionalArgs.forEach((arg, idx) => {
      node.raws["__arg_" + idx] = exprToSource(arg);
    });
    if (hasTrailingObj) {
      for (const prop of lastArg.properties) {
        if (!prop.spread) node.raws[prop.key] = exprToSource(prop.value);
      }
    }
    return node;
  }

  const positional = getPositionalPropName(name);
  const args = expr.arguments || [];
  const lastArg = args.length > 0 ? args[args.length - 1] : null;
  const hasTrailingObj = lastArg && lastArg.kind === "Object"
    && !(positional && args.length === 1);
  const positionalArgs = hasTrailingObj ? args.slice(0, -1) : args;
  const namedProps = hasTrailingObj ? (lastArg.properties || []) : [];

  let positionalConsumed = false;
  for (const arg of positionalArgs) {
    if (!positionalConsumed && positional) {
      const param = entry.params.find((p) => p.name === positional);
      if (param) {
        assignArg(node, param, arg, warnings);
        positionalConsumed = true;
        continue;
      }
    }
    const next = entry.params.find((p) =>
      !(p.name in node.slots) && !(p.name in node.raws),
    );
    if (next) assignArg(node, next, arg, warnings);
  }

  for (const prop of namedProps) {
    if (prop.spread) continue;
    const param = entry.params.find((p) => p.name === prop.key);
    if (param) assignArg(node, param, prop.value, warnings);
    else node.raws[prop.key] = exprToSource(prop.value);
  }

  // Ensure required Node[] slots exist as empty arrays so the user can
  // drop into them visually even when the imported source omitted them.
  // Skip slots already bound to a raw expression (e.g. identifier
  // references like `pages` or `sidebar`); creating an empty array there
  // would silently clobber the binding when the program is re-emitted.
  for (const param of entry.params) {
    const slotKind = getSlotKind(param.type);
    if (slotKind !== "children") continue;
    if (param.name in node.slots) continue;
    if (param.name in node.raws) continue;
    node.slots[param.name] = [];
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

/**
 * Mark every drag-aware canvas (WYSIWYG stage + Raw Edit canvas) as
 * actively dragging. CSS observes this flag to enlarge drop zones,
 * brighten slot fills, fade out non-targets, and reveal the thin
 * insertion lines between sibling cards in the raw view.
 */
function markStageDragging(active) {
  for (const id of ["ve-stage", "ve-raw-canvas"]) {
    const node = $(id);
    if (!node) continue;
    if (active) node.dataset.dragging = "true";
    else delete node.dataset.dragging;
  }
}

function startPaletteDrag(name, e) {
  currentDragPayload = { kind: "new", name };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "copy";
    try { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(currentDragPayload)); }
    catch (_) { /* some browsers reject custom types */ }
    try { e.dataTransfer.setData("text/plain", name); } catch (_) {}
  }
  markStageDragging(true);
  // Render immediately (not via requestAnimationFrame) so drop zones appear
  // before the user has even moved the mouse.
  renderOverlay();
}

function startNodeDrag(id, e) {
  currentDragPayload = { kind: "move", id };
  state.draggingId = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(currentDragPayload)); }
    catch (_) {}
  }
  markStageDragging(true);
  renderOverlay();
  // In Raw Edit, fade the source card via direct DOM tagging — we must
  // NOT re-render the tree here, otherwise the original drag-source
  // element is destroyed mid-dragstart and the browser cancels the drag.
  if (state.mode === "raw") {
    const card = e.currentTarget instanceof HTMLElement
      ? e.currentTarget
      : (e.target && e.target.closest ? e.target.closest(".ve-node") : null);
    if (card) card.dataset.dragging = "true";
  }
}

function endDrag() {
  currentDragPayload = null;
  state.draggingId = null;
  markStageDragging(false);
  renderOverlay();
  // Strip any direct DOM dragging tags applied in startNodeDrag. We do
  // not re-render here either — performDrop already schedules a render
  // when the drop actually mutated the tree.
  if (state.mode === "raw") {
    const canvas = $("ve-raw-canvas");
    if (canvas) {
      canvas.querySelectorAll(".ve-node[data-dragging=\"true\"]").forEach((c) => {
        delete c.dataset.dragging;
      });
    }
  }
}

// Backwards-compat alias kept because other modules may still call it.
const endNodeDrag = endDrag;

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
  const setActive = (on) => {
    if (on) el.dataset.active = "true";
    else delete el.dataset.active;
  };
  el.addEventListener("dragenter", (e) => {
    if (!accept(payloadFromEvent(e))) return;
    e.preventDefault();
    depth++;
    setActive(true);
  });
  el.addEventListener("dragover", (e) => {
    if (!accept(payloadFromEvent(e))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = currentDragPayload && currentDragPayload.kind === "move" ? "move" : "copy";
  });
  el.addEventListener("dragleave", () => {
    depth--;
    if (depth <= 0) { depth = 0; setActive(false); }
  });
  el.addEventListener("drop", (e) => {
    const payload = payloadFromEvent(e);
    if (!accept(payload)) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    setActive(false);
    onDrop(payload);
    endDrag();
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
  // If the dropped/moved node landed in an entity other than the active
  // one (cross-entity drops are now possible from the WYSIWYG canvas),
  // swap the active entity so the inspector and action bar work on the
  // node the user just placed.
  const owner = findOwnerEntity(state.selectedId);
  if (owner && owner.id !== state.activeEntityId) {
    syncActiveEntityFromTree();
    state.activeEntityId = owner.id;
    syncActiveTreeFromEntity();
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
//
// The palette renders a 2-up grid of preview cards. Each card has a stylized
// SVG schematic (computed from the component's category + name) so the user
// can recognise the shape at a glance and drag it onto the canvas.

/**
 * Show / hide palette-pane sections based on the current tab. Tabs are
 * a thin presentation layer over the same pane — switching them just
 * flips `hidden` on every element tagged `data-tab-for=...`.
 */
function applyPaletteTab() {
  const pane = document.querySelector(".ve-pane--palette");
  if (pane) pane.dataset.tab = state.paletteTab;
  document.querySelectorAll(".ve-palette-tab").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.paletteTab === state.paletteTab));
  });
  document.querySelectorAll("[data-tab-for]").forEach((node) => {
    const showFor = node.dataset.tabFor;
    node.hidden = showFor !== state.paletteTab;
  });
  updateOutlineBadge();
  if (state.paletteTab === "outline") renderOutline();
}

/**
 * Keep the small numeric badge on the Outline tab in sync with the
 * current entity count. Cheap enough to call after every state mutation
 * so the badge never reads as stale "0" after an import.
 */
function updateOutlineBadge() {
  const badge = $("ve-outline-badge");
  if (badge) badge.textContent = String((state.entities || []).length);
}

function setPaletteTab(tab) {
  state.paletteTab = tab === "outline" ? "outline" : "components";
  applyPaletteTab();
  saveState();
}

const ENTITY_GROUPS = [
  { key: "assignment", label: "Bindings",   icon: "fa-link",         createKind: null },
  { key: "state",      label: "State",      icon: "fa-bolt",         createKind: "state" },
  { key: "component-decl", label: "Components", icon: "fa-cube",     createKind: "component-decl" },
  { key: "action-decl", label: "Actions",   icon: "fa-play",         createKind: "action-decl" },
  { key: "effect-decl", label: "Effects",   icon: "fa-wave-square",  createKind: "effect-decl" },
  { key: "free",        label: "Other",     icon: "fa-code",         createKind: null },
];

function entityIcon(ent) {
  switch (ent.kind) {
    case "assignment": return "fa-link";
    case "state": return "fa-bolt";
    case "component-decl": return "fa-cube";
    case "action-decl": return "fa-play";
    case "effect-decl": return "fa-wave-square";
    default: return "fa-code";
  }
}

function entitySubLabel(ent) {
  if (ent.kind === "assignment" && ent.tree) return ent.tree.name || "expr";
  if (ent.kind === "state") return "$" + ent.name;
  if (ent.kind === "component-decl") return "(" + (ent.params || []).join(", ") + ")";
  if (ent.kind === "action-decl") return "()";
  if (ent.kind === "effect-decl") return "effect";
  return "";
}

function renderOutline() {
  const root = $("ve-outline");
  if (!root) return;
  root.innerHTML = "";
  const badge = $("ve-outline-badge");
  if (badge) badge.textContent = String(state.entities.length);

  if (state.entities.length === 0) {
    root.append(el("div", { class: "ve-outline-empty" }, "No top-level statements yet. Import a program or use the + button to create one."));
    return;
  }

  const buckets = new Map();
  for (const g of ENTITY_GROUPS) buckets.set(g.key, []);
  for (const ent of state.entities) {
    if (!buckets.has(ent.kind)) buckets.set(ent.kind, []);
    buckets.get(ent.kind).push(ent);
  }

  for (const group of ENTITY_GROUPS) {
    const list = buckets.get(group.key) || [];
    if (list.length === 0 && !group.createKind) continue;
    const wrap = el("div", { class: "ve-outline-group" });
    const header = el("div", { class: "ve-outline-group-header" }, [
      el("span", null, group.label + " · " + list.length),
      group.createKind ? el("button", {
        type: "button",
        class: "ve-outline-add",
        title: "Add " + group.label.toLowerCase(),
        onClick: () => createEntity(group.createKind),
      }, [el("i", { class: "fa-solid fa-plus" })]) : null,
    ]);
    wrap.append(header);
    for (const ent of list) {
      wrap.append(renderOutlineItem(ent));
    }
    root.append(wrap);
  }
}

function renderOutlineItem(ent) {
  const isActive = ent.id === state.activeEntityId;
  const item = el("button", {
    type: "button",
    class: "ve-outline-item",
    data: { active: String(isActive) },
    onClick: () => {
      focusEntity(ent.id);
    },
  }, [
    el("i", { class: "fa-solid " + entityIcon(ent), "aria-hidden": "true" }),
    el("span", { class: "ve-outline-item-name" }, ent.name),
    el("span", { class: "ve-outline-item-sub" }, entitySubLabel(ent)),
    canDeleteEntity(ent) ? el("button", {
      type: "button",
      class: "ve-outline-item-delete",
      title: "Delete",
      onClick: (e) => {
        e.stopPropagation();
        if (confirm("Delete " + ent.name + "?")) {
          deleteEntity(ent.id);
        }
      },
    }, [el("i", { class: "fa-solid fa-trash" })]) : null,
  ]);
  return item;
}

function canDeleteEntity(ent) {
  // The root `aktion` binding is required by the runtime — keep it.
  return !(ent.kind === "assignment" && ent.name === ROOT_ENTITY_NAME);
}

/**
 * Make `entityId` the active entity. Pushes any in-flight tree edits
 * back into the previously active entity first, then loads the new
 * one's tree (when present) into `state.tree`.
 */
function focusEntity(entityId) {
  syncActiveEntityFromTree();
  state.activeEntityId = entityId;
  state.selectedId = null;
  syncActiveTreeFromEntity();
  saveState();
  scheduleRender();
}

function deleteEntity(entityId) {
  commit();
  state.entities = state.entities.filter((e) => e.id !== entityId);
  if (state.activeEntityId === entityId) {
    const fallback = state.entities[0];
    state.activeEntityId = fallback ? fallback.id : null;
    syncActiveTreeFromEntity();
  }
  updateOutlineBadge();
  saveState();
  scheduleRender();
}

/**
 * Create a new entity by kind. State / actions / effects start as
 * minimal source stubs the user can edit through the inspector;
 * component declarations get a renderable tree wired up to a stub
 * body so authors can drop components into them immediately.
 */
function createEntity(kind) {
  commit();
  const id = uuidEntity();
  let entity;
  if (kind === "state") {
    const name = uniqueEntityName("count", "state");
    entity = { id, kind: "state", name, raw: "0", source: "$" + name + " = 0" };
  } else if (kind === "action-decl") {
    const name = uniqueEntityName("doSomething", "action-decl");
    entity = {
      id,
      kind: "action-decl",
      name,
      source: "function " + name + "() {\n  // TODO: implement\n}",
    };
  } else if (kind === "effect-decl") {
    entity = {
      id,
      kind: "effect-decl",
      name: "effect",
      source: "effect(() => {\n  // TODO: implement\n}, [\"mount\"])",
    };
  } else if (kind === "component-decl") {
    const name = uniqueEntityName("MyComponent", "component-decl");
    entity = {
      id,
      kind: "component-decl",
      name,
      params: [],
      source:
        "function " + name + "() {\n" +
        "  return Card([CardHeader(\"" + name + "\")])\n" +
        "}",
    };
  } else {
    return;
  }
  state.entities.push(entity);
  state.activeEntityId = entity.id;
  syncActiveTreeFromEntity();
  updateOutlineBadge();
  saveState();
  scheduleRender();
  showToast("Created " + entity.name, { icon: "plus" });
}

function uniqueEntityName(base, kind) {
  const taken = new Set(
    state.entities.filter((e) => e.kind === kind).map((e) => e.name),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 99; i += 1) {
    const candidate = base + i;
    if (!taken.has(candidate)) return candidate;
  }
  return base + Date.now().toString(36);
}

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
      el("span", null, groupName + " · " + list.length),
      el("i", { class: "fa-solid fa-chevron-right", "aria-hidden": "true" }),
    ]);
    wrap.append(head);

    const grid = el("div", { class: "ve-palette-grid" });
    for (const c of list) {
      grid.append(renderPaletteCard(c));
    }
    wrap.append(grid);
    root.append(wrap);
  }
  if (total === 0) {
    root.append(el("div", { class: "ve-palette-empty" },
      "No components match \"" + search + "\""));
  }
}

function renderPaletteCard(entry) {
  const card = el("button", {
    class: "ve-palette-card",
    type: "button",
    title: entry.name + " — " + (entry.description || ""),
    draggable: "true",
    onDragstart: (e) => { startPaletteDrag(entry.name, e); card.dataset.dragging = "true"; },
    onDragend: () => { card.dataset.dragging = "false"; },
    onClick: () => addComponentSmart(entry.name),
  });
  const thumb = el("div", { class: "ve-pal-thumb" });
  thumb.append(componentSchematic(entry));
  card.append(thumb);
  card.append(el("div", { class: "ve-pal-name" }, entry.name));
  const positional = entry.params.find((p) => !p.required && p.name !== "children");
  const tag = positional ? positional.name : (entry.params[0] && entry.params[0].name) || "";
  card.append(el("div", { class: "ve-pal-tags" }, tag));
  return card;
}

/**
 * Click-to-add fallback for users without drag input. Tries to place the
 * new component into the currently selected node's first children slot;
 * falls back to the root tree's children slot.
 */
// stub — moved below schematic helpers
const _addComponentSmartStub = null; void _addComponentSmartStub;

// ---------------------------------------------------------------------------
// Component schematics
//
// Lightweight SVG sketches that hint at the component's shape on the palette
// card. Curated for the most common components; falls back to a category
// pattern + monogram for the long tail. The intent is recognisability at a
// glance, not literal previews.

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      node.setAttribute(k, String(v));
    }
  }
  return node;
}

function makeSvg(content) {
  const root = svgEl("svg", {
    viewBox: "0 0 96 54",
    xmlns: SVG_NS,
    "aria-hidden": "true",
    preserveAspectRatio: "xMidYMid meet",
  });
  root.innerHTML = content;
  return root;
}

const COLOR = {
  bg: "var(--doc-bg-soft)",
  line: "var(--doc-border-strong)",
  fill: "var(--doc-primary-soft)",
  primary: "var(--doc-primary)",
  text: "var(--doc-text-subtle)",
};

// Specific schematics for high-profile components. Coordinates use a
// 96×54 viewbox so cards stay crisp at any size. Use stroke="currentColor"
// where we want theme-adaptive lines via CSS variables in fill/stroke.
const SCHEMATICS = {
  // ---- Layout ----
  Stack: `
    <rect x="6" y="9"  width="84" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="6" y="20" width="84" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="6" y="31" width="84" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="6" y="42" width="84" height="6" rx="2" fill="${COLOR.fill}"/>`,
  Grid: `
    <rect x="6"  y="6"  width="40" height="18" rx="3" fill="${COLOR.fill}"/>
    <rect x="50" y="6"  width="40" height="18" rx="3" fill="${COLOR.fill}"/>
    <rect x="6"  y="28" width="40" height="18" rx="3" fill="${COLOR.fill}"/>
    <rect x="50" y="28" width="40" height="18" rx="3" fill="${COLOR.fill}"/>`,
  Card: `
    <rect x="8" y="8" width="80" height="38" rx="4" fill="none" stroke="${COLOR.line}" stroke-width="1.5"/>
    <rect x="14" y="14" width="48" height="4" rx="1.5" fill="${COLOR.primary}"/>
    <rect x="14" y="22" width="68" height="2" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="28" width="40" height="2" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="36" width="22" height="6" rx="2" fill="${COLOR.fill}"/>`,
  CardHeader: `
    <rect x="8" y="14" width="48" height="6" rx="2" fill="${COLOR.primary}"/>
    <rect x="8" y="24" width="68" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="8" y="30" width="44" height="3" rx="1" fill="${COLOR.line}"/>`,
  Section: `
    <rect x="6" y="8" width="84" height="38" rx="4" fill="${COLOR.bg}" stroke="${COLOR.line}" stroke-width="1"/>
    <rect x="14" y="14" width="40" height="4" rx="1.5" fill="${COLOR.primary}"/>
    <rect x="14" y="24" width="68" height="2" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="30" width="60" height="2" rx="1" fill="${COLOR.line}"/>`,
  StackItem: `
    <rect x="6"  y="20" width="20" height="14" rx="2" fill="${COLOR.fill}"/>
    <rect x="30" y="20" width="60" height="14" rx="2" fill="${COLOR.primary}" opacity=".25"/>`,
  Spacer: `
    <line x1="20" y1="27" x2="76" y2="27" stroke="${COLOR.line}" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="M16 27 L22 23 L22 31 Z" fill="${COLOR.line}"/>
    <path d="M80 27 L74 23 L74 31 Z" fill="${COLOR.line}"/>`,
  Divider: `
    <line x1="8" y1="27" x2="88" y2="27" stroke="${COLOR.line}" stroke-width="1.5"/>`,
  Container: `
    <rect x="14" y="6" width="68" height="42" rx="3" fill="none" stroke="${COLOR.line}" stroke-width="1.5" stroke-dasharray="3 2"/>
    <rect x="20" y="14" width="56" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="20" y="24" width="40" height="3" rx="1" fill="${COLOR.line}"/>`,

  // ---- Content ----
  Heading: `
    <rect x="8" y="14" width="60" height="10" rx="2" fill="${COLOR.primary}"/>
    <rect x="8" y="32" width="40" height="3" rx="1" fill="${COLOR.line}"/>`,
  Text: `
    <rect x="8" y="14" width="80" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="8" y="22" width="64" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="8" y="30" width="74" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="8" y="38" width="32" height="3" rx="1" fill="${COLOR.line}"/>`,
  Quote: `
    <rect x="14" y="12" width="74" height="30" rx="2" fill="${COLOR.bg}"/>
    <rect x="8"  y="12" width="3"  height="30" fill="${COLOR.primary}"/>
    <rect x="20" y="18" width="60" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="20" y="26" width="50" height="3" rx="1" fill="${COLOR.line}"/>`,
  Code: `
    <rect x="6" y="6" width="84" height="42" rx="3" fill="${COLOR.bg}"/>
    <rect x="14" y="14" width="48" height="3" rx="1" fill="${COLOR.primary}"/>
    <rect x="20" y="22" width="60" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="20" y="30" width="40" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="20" y="38" width="50" height="3" rx="1" fill="${COLOR.line}"/>`,
  Markdown: `
    <rect x="8" y="10" width="34" height="5" rx="1.5" fill="${COLOR.primary}"/>
    <rect x="8" y="20" width="80" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="8" y="28" width="62" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="8" y="38" width="22" height="5" rx="1.5" fill="${COLOR.primary}"/>`,

  // ---- Forms ----
  Button: `
    <rect x="20" y="20" width="56" height="14" rx="3" fill="${COLOR.primary}"/>
    <rect x="34" y="25" width="28" height="4" rx="1.5" fill="white" opacity=".95"/>`,
  Input: `
    <rect x="8" y="20" width="80" height="16" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}" stroke-width="1"/>
    <rect x="14" y="26" width="32" height="4" rx="1" fill="${COLOR.line}"/>`,
  Textarea: `
    <rect x="8" y="10" width="80" height="34" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}" stroke-width="1"/>
    <rect x="14" y="18" width="60" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="26" width="48" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="34" width="36" height="3" rx="1" fill="${COLOR.line}"/>`,
  Select: `
    <rect x="8" y="20" width="80" height="16" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="14" y="26" width="40" height="4" rx="1" fill="${COLOR.line}"/>
    <path d="M76 26 L80 30 L84 26" stroke="${COLOR.text}" stroke-width="1.5" fill="none"/>`,
  Checkbox: `
    <rect x="20" y="20" width="14" height="14" rx="2" fill="${COLOR.primary}"/>
    <path d="M23 27 L27 31 L33 23" stroke="white" stroke-width="2" fill="none"/>
    <rect x="40" y="24" width="38" height="6" rx="2" fill="${COLOR.line}"/>`,
  Radio: `
    <circle cx="27" cy="27" r="7" fill="none" stroke="${COLOR.line}" stroke-width="1.5"/>
    <circle cx="27" cy="27" r="3.5" fill="${COLOR.primary}"/>
    <rect x="40" y="24" width="38" height="6" rx="2" fill="${COLOR.line}"/>`,
  Switch: `
    <rect x="20" y="20" width="28" height="14" rx="7" fill="${COLOR.primary}"/>
    <circle cx="42" cy="27" r="5" fill="white"/>`,
  Slider: `
    <rect x="10" y="26" width="76" height="2" rx="1" fill="${COLOR.line}"/>
    <rect x="10" y="26" width="40" height="2" rx="1" fill="${COLOR.primary}"/>
    <circle cx="50" cy="27" r="6" fill="${COLOR.primary}"/>`,
  Form: `
    <rect x="8" y="6" width="80" height="42" rx="3" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="14" y="12" width="68" height="6" rx="2" fill="white" stroke="${COLOR.line}"/>
    <rect x="14" y="22" width="68" height="6" rx="2" fill="white" stroke="${COLOR.line}"/>
    <rect x="14" y="36" width="22" height="8" rx="2" fill="${COLOR.primary}"/>`,
  Field: `
    <rect x="8" y="10" width="40" height="4" rx="1.5" fill="${COLOR.text}"/>
    <rect x="8" y="20" width="80" height="14" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="14" y="40" width="50" height="3" rx="1" fill="${COLOR.line}"/>`,

  // ---- Data ----
  Table: `
    <rect x="6" y="8" width="84" height="38" rx="2" fill="none" stroke="${COLOR.line}"/>
    <rect x="6" y="8" width="84" height="9" fill="${COLOR.fill}"/>
    <line x1="6"  y1="26" x2="90" y2="26" stroke="${COLOR.line}"/>
    <line x1="6"  y1="36" x2="90" y2="36" stroke="${COLOR.line}"/>
    <line x1="34" y1="8"  x2="34" y2="46" stroke="${COLOR.line}"/>
    <line x1="62" y1="8"  x2="62" y2="46" stroke="${COLOR.line}"/>`,
  Stats: `
    <rect x="6"  y="14" width="26" height="26" rx="3" fill="${COLOR.fill}"/>
    <rect x="36" y="14" width="26" height="26" rx="3" fill="${COLOR.fill}"/>
    <rect x="66" y="14" width="24" height="26" rx="3" fill="${COLOR.fill}"/>`,
  StatCard: `
    <rect x="14" y="10" width="68" height="34" rx="3" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="20" y="16" width="24" height="3" rx="1" fill="${COLOR.text}"/>
    <rect x="20" y="22" width="40" height="8" rx="2" fill="${COLOR.primary}"/>
    <rect x="20" y="34" width="20" height="3" rx="1" fill="${COLOR.line}"/>`,
  KPIList: `
    <rect x="6" y="14" width="84" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="6" y="24" width="84" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="6" y="34" width="84" height="6" rx="2" fill="${COLOR.fill}"/>`,
  List: `
    <circle cx="14" cy="16" r="2" fill="${COLOR.primary}"/>
    <rect x="22" y="14" width="60" height="3" rx="1" fill="${COLOR.line}"/>
    <circle cx="14" cy="27" r="2" fill="${COLOR.primary}"/>
    <rect x="22" y="25" width="50" height="3" rx="1" fill="${COLOR.line}"/>
    <circle cx="14" cy="38" r="2" fill="${COLOR.primary}"/>
    <rect x="22" y="36" width="55" height="3" rx="1" fill="${COLOR.line}"/>`,
  Badge: `
    <rect x="28" y="22" width="40" height="14" rx="7" fill="${COLOR.primary}"/>
    <rect x="36" y="27" width="24" height="4" rx="1.5" fill="white" opacity=".9"/>`,
  Tag: `
    <path d="M12 18 L40 12 L82 22 L82 32 L40 42 L12 36 Z" fill="${COLOR.fill}" stroke="${COLOR.line}"/>`,
  Avatar: `
    <circle cx="48" cy="27" r="14" fill="${COLOR.primary}"/>
    <circle cx="48" cy="22" r="5" fill="white"/>
    <path d="M37 36 Q48 28 59 36" fill="white"/>`,
  Rating: `
    <g fill="${COLOR.primary}">
      <polygon points="14,28 17,22 20,28 26,28 21,32 23,38 17,34 11,38 13,32 8,28"/>
      <polygon points="32,28 35,22 38,28 44,28 39,32 41,38 35,34 29,38 31,32 26,28"/>
      <polygon points="50,28 53,22 56,28 62,28 57,32 59,38 53,34 47,38 49,32 44,28"/>
    </g>
    <g fill="${COLOR.line}">
      <polygon points="68,28 71,22 74,28 80,28 75,32 77,38 71,34 65,38 67,32 62,28"/>
    </g>`,
  Progress: `
    <rect x="8" y="24" width="80" height="6" rx="3" fill="${COLOR.bg}"/>
    <rect x="8" y="24" width="48" height="6" rx="3" fill="${COLOR.primary}"/>`,

  // ---- Charts ----
  LineChart: `
    <line x1="8" y1="44" x2="88" y2="44" stroke="${COLOR.line}"/>
    <polyline points="10,38 24,28 38,32 52,18 66,22 80,12" fill="none" stroke="${COLOR.primary}" stroke-width="2"/>
    <circle cx="52" cy="18" r="2" fill="${COLOR.primary}"/>`,
  BarChart: `
    <line x1="8" y1="44" x2="88" y2="44" stroke="${COLOR.line}"/>
    <rect x="14" y="28" width="10" height="14" fill="${COLOR.primary}"/>
    <rect x="30" y="20" width="10" height="22" fill="${COLOR.primary}"/>
    <rect x="46" y="32" width="10" height="10" fill="${COLOR.primary}"/>
    <rect x="62" y="14" width="10" height="28" fill="${COLOR.primary}"/>
    <rect x="78" y="24" width="8"  height="18" fill="${COLOR.primary}"/>`,
  AreaChart: `
    <polygon points="8,44 20,30 36,34 52,18 68,22 88,14 88,44" fill="${COLOR.fill}"/>
    <polyline points="8,44 20,30 36,34 52,18 68,22 88,14" fill="none" stroke="${COLOR.primary}" stroke-width="1.5"/>`,
  PieChart: `
    <circle cx="48" cy="27" r="18" fill="${COLOR.primary}"/>
    <path d="M48 27 L48 9 A18 18 0 0 1 64 36 Z" fill="${COLOR.fill}"/>
    <path d="M48 27 L64 36 A18 18 0 0 1 32 36 Z" fill="${COLOR.line}" opacity=".5"/>`,
  DonutChart: `
    <circle cx="48" cy="27" r="18" fill="none" stroke="${COLOR.line}" stroke-width="6"/>
    <circle cx="48" cy="27" r="18" fill="none" stroke="${COLOR.primary}" stroke-width="6" stroke-dasharray="60 113"/>`,
  Sparkline: `
    <polyline points="6,32 16,28 26,30 36,22 46,26 56,18 66,24 76,14 86,18" fill="none" stroke="${COLOR.primary}" stroke-width="1.5"/>`,

  // ---- Patterns ----
  Hero: `
    <rect x="6" y="6" width="84" height="42" rx="3" fill="${COLOR.fill}"/>
    <rect x="14" y="14" width="50" height="6" rx="2" fill="${COLOR.primary}"/>
    <rect x="14" y="24" width="68" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="30" width="56" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="14" y="38" width="22" height="6" rx="2" fill="${COLOR.primary}"/>`,
  PageHeader: `
    <rect x="6"  y="8"  width="20" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="6"  y="16" width="50" height="8" rx="2" fill="${COLOR.primary}"/>
    <rect x="6"  y="28" width="60" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="68" y="14" width="20" height="10" rx="2" fill="${COLOR.fill}"/>
    <rect x="68" y="28" width="20" height="10" rx="2" fill="${COLOR.primary}"/>`,
  PricingCard: `
    <rect x="14" y="6" width="68" height="42" rx="3" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="22" y="12" width="30" height="3" rx="1" fill="${COLOR.text}"/>
    <rect x="22" y="20" width="30" height="8" rx="2" fill="${COLOR.primary}"/>
    <rect x="22" y="32" width="50" height="2" rx="1" fill="${COLOR.line}"/>
    <rect x="22" y="38" width="40" height="2" rx="1" fill="${COLOR.line}"/>`,
  PricingTable: `
    <rect x="6"  y="6"  width="26" height="42" rx="3" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="35" y="6"  width="26" height="42" rx="3" fill="${COLOR.fill}" stroke="${COLOR.primary}"/>
    <rect x="64" y="6"  width="26" height="42" rx="3" fill="${COLOR.bg}" stroke="${COLOR.line}"/>`,
  FeatureGrid: `
    <rect x="6"  y="6"  width="40" height="18" rx="2" fill="${COLOR.fill}"/>
    <rect x="50" y="6"  width="40" height="18" rx="2" fill="${COLOR.fill}"/>
    <rect x="6"  y="28" width="40" height="18" rx="2" fill="${COLOR.fill}"/>
    <rect x="50" y="28" width="40" height="18" rx="2" fill="${COLOR.fill}"/>`,
  FollowUpBlock: `
    <rect x="6"  y="14" width="84" height="8" rx="4" fill="${COLOR.fill}"/>
    <rect x="6"  y="26" width="84" height="8" rx="4" fill="${COLOR.fill}"/>
    <rect x="6"  y="38" width="60" height="8" rx="4" fill="${COLOR.fill}"/>`,
  Empty: `
    <circle cx="48" cy="22" r="10" fill="none" stroke="${COLOR.line}" stroke-width="1.5"/>
    <line x1="42" y1="22" x2="54" y2="22" stroke="${COLOR.line}" stroke-width="1.5"/>
    <rect x="30" y="38" width="36" height="3" rx="1" fill="${COLOR.line}"/>`,

  // ---- App shell ----
  AppShell: `
    <rect x="6" y="6" width="22" height="42" fill="${COLOR.fill}"/>
    <rect x="32" y="6" width="58" height="9" fill="${COLOR.fill}"/>
    <rect x="32" y="19" width="58" height="29" fill="${COLOR.bg}" stroke="${COLOR.line}"/>`,
  Sidebar: `
    <rect x="6" y="6" width="24" height="42" fill="${COLOR.fill}"/>
    <rect x="10" y="14" width="16" height="3" rx="1" fill="${COLOR.primary}"/>
    <rect x="10" y="22" width="14" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="10" y="30" width="14" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="34" y="6" width="56" height="42" fill="${COLOR.bg}" stroke="${COLOR.line}"/>`,
  Topbar: `
    <rect x="6" y="6" width="84" height="14" fill="${COLOR.fill}"/>
    <rect x="14" y="11" width="20" height="4" rx="1" fill="${COLOR.primary}"/>
    <rect x="60" y="10" width="22" height="6" rx="2" fill="${COLOR.primary}"/>
    <rect x="6" y="22" width="84" height="26" fill="${COLOR.bg}" stroke="${COLOR.line}"/>`,

  // ---- Navigation ----
  Tabs: `
    <rect x="6" y="14" width="20" height="8" rx="2" fill="${COLOR.primary}"/>
    <rect x="28" y="14" width="20" height="8" rx="2" fill="${COLOR.fill}"/>
    <rect x="50" y="14" width="20" height="8" rx="2" fill="${COLOR.fill}"/>
    <line x1="6" y1="24" x2="90" y2="24" stroke="${COLOR.line}"/>
    <rect x="14" y="32" width="68" height="14" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}"/>`,
  Breadcrumb: `
    <rect x="6"  y="22" width="14" height="4" rx="1" fill="${COLOR.line}"/>
    <text x="22" y="27" font-size="6" fill="${COLOR.line}">›</text>
    <rect x="28" y="22" width="20" height="4" rx="1" fill="${COLOR.line}"/>
    <text x="50" y="27" font-size="6" fill="${COLOR.line}">›</text>
    <rect x="56" y="22" width="24" height="4" rx="1" fill="${COLOR.primary}"/>`,
  NavLink: `
    <rect x="14" y="22" width="68" height="10" rx="3" fill="${COLOR.fill}"/>
    <rect x="20" y="26" width="40" height="3" rx="1" fill="${COLOR.primary}"/>`,
  Pagination: `
    <rect x="14" y="22" width="10" height="10" rx="2" fill="${COLOR.fill}"/>
    <rect x="28" y="22" width="10" height="10" rx="2" fill="${COLOR.primary}"/>
    <rect x="42" y="22" width="10" height="10" rx="2" fill="${COLOR.fill}"/>
    <rect x="56" y="22" width="10" height="10" rx="2" fill="${COLOR.fill}"/>
    <rect x="70" y="22" width="10" height="10" rx="2" fill="${COLOR.fill}"/>`,

  // ---- Feedback ----
  Alert: `
    <rect x="6" y="14" width="84" height="26" rx="3" fill="${COLOR.fill}"/>
    <circle cx="16" cy="27" r="4" fill="${COLOR.primary}"/>
    <rect x="26" y="22" width="50" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="26" y="29" width="40" height="3" rx="1" fill="${COLOR.line}"/>`,
  Toast: `
    <rect x="14" y="16" width="68" height="22" rx="3" fill="${COLOR.text}"/>
    <circle cx="22" cy="27" r="3" fill="${COLOR.primary}"/>
    <rect x="30" y="22" width="40" height="3" rx="1" fill="white" opacity=".8"/>
    <rect x="30" y="28" width="30" height="3" rx="1" fill="white" opacity=".5"/>`,
  Spinner: `
    <circle cx="48" cy="27" r="14" fill="none" stroke="${COLOR.line}" stroke-width="3"/>
    <path d="M48 13 A14 14 0 0 1 62 27" fill="none" stroke="${COLOR.primary}" stroke-width="3"/>`,
  Skeleton: `
    <rect x="6" y="10" width="84" height="6" rx="2" fill="${COLOR.line}" opacity=".4"/>
    <rect x="6" y="22" width="68" height="6" rx="2" fill="${COLOR.line}" opacity=".4"/>
    <rect x="6" y="34" width="50" height="6" rx="2" fill="${COLOR.line}"  opacity=".4"/>`,
  Image: `
    <rect x="8" y="6" width="80" height="42" rx="3" fill="${COLOR.fill}" stroke="${COLOR.line}"/>
    <circle cx="32" cy="22" r="4" fill="${COLOR.primary}"/>
    <path d="M14 38 L36 24 L52 32 L74 18 L84 28 L84 42 L14 42 Z" fill="${COLOR.primary}" opacity=".4"/>`,
  Video: `
    <rect x="8" y="6" width="80" height="42" rx="3" fill="${COLOR.text}"/>
    <polygon points="38,18 38,38 60,28" fill="white" opacity=".95"/>`,
  Icon: `
    <circle cx="48" cy="27" r="16" fill="${COLOR.primary}" opacity=".15"/>
    <path d="M48 17 L51 25 L60 25 L53 30 L56 38 L48 33 L40 38 L43 30 L36 25 L45 25 Z" fill="${COLOR.primary}"/>`,

  // ---- Chat ----
  ChatMessage: `
    <rect x="6" y="10" width="50" height="14" rx="6" fill="${COLOR.fill}"/>
    <rect x="14" y="14" width="36" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="40" y="30" width="50" height="14" rx="6" fill="${COLOR.primary}"/>
    <rect x="48" y="34" width="36" height="3" rx="1" fill="white" opacity=".9"/>`,
  Composer: `
    <rect x="6" y="20" width="64" height="14" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}"/>
    <rect x="14" y="26" width="32" height="3" rx="1" fill="${COLOR.line}"/>
    <rect x="74" y="20" width="14" height="14" rx="3" fill="${COLOR.primary}"/>`,
  Suggestion: `
    <rect x="6" y="22" width="22" height="10" rx="5" fill="${COLOR.fill}"/>
    <rect x="32" y="22" width="22" height="10" rx="5" fill="${COLOR.fill}"/>
    <rect x="58" y="22" width="22" height="10" rx="5" fill="${COLOR.fill}"/>`,

  // ---- Routing & shells ----
  Router: `
    <rect x="6" y="14" width="20" height="6" rx="2" fill="${COLOR.primary}"/>
    <rect x="6" y="24" width="20" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="6" y="34" width="20" height="6" rx="2" fill="${COLOR.fill}"/>
    <rect x="32" y="10" width="56" height="34" rx="2" fill="${COLOR.bg}" stroke="${COLOR.line}"/>`,

  // ---- Theming ----
  Theme: `
    <circle cx="32" cy="27" r="10" fill="${COLOR.primary}"/>
    <circle cx="48" cy="27" r="10" fill="${COLOR.fill}"/>
    <circle cx="64" cy="27" r="10" fill="${COLOR.line}" opacity=".5"/>`,
};

const CATEGORY_FALLBACK = {
  Layout:           "Stack",
  Content:          "Text",
  Forms:            "Input",
  Data:             "Table",
  Charts:           "BarChart",
  Patterns:         "Hero",
  "App shell":      "AppShell",
  Navigation:       "Tabs",
  "Feedback & Media": "Alert",
  "Editors & overlays": "Markdown",
  Chat:             "ChatMessage",
  "Advanced UI":    "Theme",
  Helpers:          "Spacer",
  Theming:          "Theme",
  Routing:          "Router",
  "Escape hatches": "Code",
  Other:            "Card",
};

function componentSchematic(entry) {
  const direct = SCHEMATICS[entry.name];
  if (direct) return makeSvg(direct);
  // Heuristic: pick a schematic from a name suffix match.
  for (const [name, content] of Object.entries(SCHEMATICS)) {
    if (entry.name.endsWith(name) && entry.name !== name) return makeSvg(content);
  }
  // Category fallback + monogram so the long tail still looks distinct.
  const fallback = SCHEMATICS[CATEGORY_FALLBACK[entry.group] || "Card"] || SCHEMATICS.Card;
  const initials = entry.name
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  const monogram = `
    <g transform="translate(0,0)" opacity=".55">${fallback}</g>
    <rect x="60" y="34" width="30" height="14" rx="3" fill="${COLOR.primary}"/>
    <text x="75" y="44" font-size="9" font-weight="700" font-family="ui-sans-serif, system-ui" fill="white" text-anchor="middle">${initials}</text>`;
  return makeSvg(monogram);
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
        commit();
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
// Rendering — canvas (WYSIWYG)
//
// The canvas hosts a real <aktion-app> instance rendering the live program.
// On top of it we draw a transparent overlay layer with selection, hover,
// drop zones, action toolbars, and slot-fill CTAs.
//
// Pipeline per render:
//   1. emitProgram() → push the source into <aktion-app>
//   2. After the runtime renders its shadow DOM, decorateRenderedDOM()
//      walks the rendered tree in parallel with our visual tree, tags
//      each rendered element with `data-veid="<nodeId>"`, and stores
//      bounding rects relative to the overlay's coordinate space.
//   3. renderOverlay() reads the rect map + state and paints all overlay
//      elements at the right positions.

let lastEmittedSource = "";

function renderCanvas() {
  const preview = $("ve-preview");
  const overlay = $("ve-overlay");
  if (!preview || !overlay) return;
  // Raw Edit mode renders a tree-of-cards canvas instead (see
  // renderRawCanvas) — skip the WYSIWYG rebuild while it's hidden.
  if (state.mode === "raw") return;

  // Sync theme + device + zoom every render — cheap and avoids drift.
  preview.setAttribute("theme", state.theme || "light");
  const frame = $("ve-stage-frame");
  if (frame) {
    frame.dataset.device = state.device || "desktop";
    frame.dataset.mode = state.mode || "edit";
    frame.style.setProperty("--ve-zoom", String(state.zoom || 1));
  }

  // Sync edit-mode shadow DOM stylesheet + host attribute.
  ensureShadowEditStyles(preview);
  if (state.mode === "preview") delete preview.dataset.veditorMode;
  else preview.dataset.veditorMode = "edit";

  // When the active entity is a source-only declaration (state /
  // action / effect / free / component-decl), we still want to show
  // the live preview of the whole program — but we have no visual
  // tree to overlay. Emit the program, paint an explainer in the
  // overlay, and bail out before the decorate pass.
  const ent = activeEntity();
  if ((!state.tree || !ent || ent.kind !== "assignment") && ent) {
    const source = emitProgram();
    if (source !== lastEmittedSource) {
      lastEmittedSource = source;
      if (typeof preview.setResponse === "function") preview.setResponse(source);
      else preview.setAttribute("response", source);
    }
    overlay.innerHTML = "";
    paintNonAssignmentStage(ent);
    return;
  }

  if (!state.tree) {
    overlay.innerHTML = "";
    if (typeof preview.setResponse === "function") preview.setResponse("");
    paintEmptyStage();
    return;
  }

  const source = emitProgram();
  if (source !== lastEmittedSource) {
    lastEmittedSource = source;
    if (typeof preview.setResponse === "function") {
      preview.setResponse(source);
    } else {
      preview.setAttribute("response", source);
    }
  }

  // The runtime renders synchronously after setResponse(); decorate on
  // the next animation frame so layout is finalised. We also schedule a
  // second pass after one more frame to catch any async re-renders the
  // runtime may queue (effects, async actions).
  requestAnimationFrame(() => {
    decorateRenderedDOM();
    renderOverlay();
    requestAnimationFrame(() => {
      decorateRenderedDOM();
      renderOverlay();
    });
  });
}

function paintEmptyStage() {
  // Show a friendly empty state when there's no tree at all.
  const overlay = $("ve-overlay");
  overlay.innerHTML = "";
  overlay.append(el("div", { class: "ve-stage-empty" }, [
    el("i", { class: "fa-solid fa-cubes-stacked", "aria-hidden": "true" }),
    el("h3", null, "Drag a component to start"),
    el("p", null, "Pick anything from the palette and drop it on the canvas."),
  ]));
}

/**
 * Friendly explainer when the active entity has no visual tree (state /
 * action / effect / component decl). The live program preview still
 * renders behind the overlay banner so the user keeps a sense of how
 * their changes affect the running app — they can flip to Preview mode
 * to interact with it.
 */
function paintNonAssignmentStage(ent) {
  const overlay = $("ve-overlay");
  if (!overlay) return;
  if (state.mode === "preview") return; // let the preview show as-is
  const messages = {
    "state": ["Editing state default", "Adjust the $" + ent.name + " default in the inspector. The live preview reflects your changes."],
    "action-decl": ["Editing action", "Edit the `function " + ent.name + "()` body in the inspector. Component callers stay live."],
    "effect-decl": ["Editing effect", "Edit the effect body in the inspector. Deps and the rate-limit modifier go inside the `[...]` array."],
    "component-decl": ["Editing component", "Edit the `function " + ent.name + "()` declaration in the inspector. Switch to `aktion` in the outline to compose it visually."],
    "free": ["Editing source", "This block didn't classify as a known declaration. Edit it directly in the inspector."],
  };
  const [title, sub] = messages[ent.kind] || ["Editing entity", "Use the inspector to make changes."];
  overlay.append(el("div", { class: "ve-stage-empty" }, [
    el("i", { class: "fa-solid " + entityIcon(ent), "aria-hidden": "true" }),
    el("h3", null, title + " · " + ent.name),
    el("p", null, sub),
  ]));
}

/**
 * Inject a small stylesheet into aktion-app's shadow root so empty
 * structural containers (Stack/Grid/Box/Card content/Section/Container)
 * still have a visible footprint in edit mode. Without this, an empty
 * Stack would collapse to 0 height and there would be nothing for the
 * overlay's slot fill to align to.
 *
 * The styles are scoped via :host([data-veditor-mode="edit"]) so they
 * only apply in edit mode — preview mode renders the live UI as-is.
 */
function ensureShadowEditStyles(preview) {
  const sr = preview && preview.shadowRoot;
  if (!sr) return;
  if (sr.getElementById("ve-shadow-edit-styles")) return;
  const style = document.createElement("style");
  style.id = "ve-shadow-edit-styles";
  style.textContent = `
    :host([data-veditor-mode="edit"]) .rui-stack:empty,
    :host([data-veditor-mode="edit"]) .rui-grid:empty,
    :host([data-veditor-mode="edit"]) .rui-box:empty,
    :host([data-veditor-mode="edit"]) .rui-card:empty,
    :host([data-veditor-mode="edit"]) .rui-card-content:empty,
    :host([data-veditor-mode="edit"]) .rui-section:empty,
    :host([data-veditor-mode="edit"]) .rui-container:empty,
    :host([data-veditor-mode="edit"]) .rui-masonry-grid:empty,
    :host([data-veditor-mode="edit"]) .rui-stack-item:empty,
    :host([data-veditor-mode="edit"]) .rui-grid-item:empty {
      min-height: 72px;
      min-width: 72px;
      border: 2px dashed color-mix(in srgb, currentColor 25%, transparent);
      border-radius: 8px;
      background: color-mix(in srgb, currentColor 3%, transparent);
      box-sizing: border-box;
    }
    :host([data-veditor-mode="edit"]) .rui-grid:empty {
      min-height: 120px;
    }
  `;
  sr.appendChild(style);
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
  // Raw expressions bound to slot props (e.g. `content: pages`) are
  // semantically "filled" — the runtime resolves them — so treat the
  // owning node as non-empty in tree views and inspectors.
  const entry = getEntry(node.name);
  if (entry) {
    for (const param of entry.params) {
      if (!getSlotKind(param.type)) continue;
      const raw = node.raws ? node.raws[param.name] : null;
      if (raw != null && raw !== "") return true;
    }
  }
  return false;
}

function nodeSummary(node) {
  const entry = getEntry(node.name);
  if (!entry) return "";
  const parts = [];
  // Surface raw-bound slot references first (e.g. `sidebar=sidebar`,
  // `content=pages`) — these tell the user at a glance which entities
  // this component pulls in, even when the slot is "empty" visually.
  for (const param of entry.params) {
    if (parts.length >= 2) break;
    if (!getSlotKind(param.type)) continue;
    const raw = node.raws ? node.raws[param.name] : null;
    if (raw == null || raw === "") continue;
    let display = String(raw).replace(/\s+/g, " ");
    if (display.length > 28) display = display.slice(0, 25) + "…";
    parts.push(param.name + "→" + display);
  }
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
// DOM-to-node decoration
//
// After every render of <aktion-app>, we walk the visual tree and the
// rendered shadow DOM in parallel. For each visual component node we store
// the rendered DOM element + its bounding rect (in stage-frame space) so the
// overlay can position selection / hover / drop indicators precisely. We
// also tag each tagged DOM element with `data-veid="<id>"` so click handlers
// can resolve a click target back to a visual node via composedPath().

function decorateRenderedDOM() {
  state.rectsById.clear();
  state.rectsBySlot.clear();
  visitedEntitiesDuringWalk.clear();
  const preview = $("ve-preview");
  const frame = $("ve-stage-frame");
  if (!preview || !preview.shadowRoot || !frame) return;
  const frameRect = frame.getBoundingClientRect();
  const sr = preview.shadowRoot;
  // Clear stale `data-veid` from previous renders. The runtime morphs DOM
  // so attributes can survive on retained nodes that no longer correspond
  // to our visual tree.
  for (const stale of sr.querySelectorAll("[data-veid]")) {
    delete stale.dataset.veid;
    delete stale.dataset.veEntity;
  }
  // The Aktion runtime renders into <div class="rui-root">. Fall back to
  // the first non-style / non-link / non-error-banner element so we degrade
  // gracefully if the class ever changes.
  let rendered = sr.querySelector(".rui-root");
  if (!rendered) {
    for (const child of sr.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === "style" || tag === "link") continue;
      if (child.classList && child.classList.contains("rui-error-banner")) continue;
      rendered = child;
      break;
    }
  }
  if (!rendered) return;
  // Walk from `aktion` so the WYSIWYG canvas can tag (and therefore select /
  // hover / drop on) every rendered component — even those defined in a
  // different top-level binding (e.g. `aktion = Stack([block])` where
  // `block`, `card`, `followup` live in their own assignments). Falling
  // back to the active tree keeps the old behaviour when no `aktion`
  // entity exists yet.
  const rootEnt = (state.entities || []).find(
    (e) => e.kind === "assignment" && e.name === ROOT_ENTITY_NAME && e.tree,
  );
  let startTree = null;
  let startEntityId = null;
  if (rootEnt && rootEnt.tree) {
    startTree = rootEnt.tree;
    startEntityId = rootEnt.id;
  } else if (state.tree) {
    startTree = state.tree;
    const ent = activeEntity();
    startEntityId = ent ? ent.id : null;
  }
  if (!startTree) return;
  // The rui-root wraps the program tree in one element. Drill down into
  // its single child if the visual root is a single component (the common
  // case — `aktion = Stack(...)`).
  let renderedRoot = rendered;
  if (startTree.kind === "component" && rendered.children.length === 1) {
    renderedRoot = rendered.children[0];
  }
  if (startEntityId) visitedEntitiesDuringWalk.add(startEntityId);
  walkParallel(startTree, renderedRoot, frameRect, startEntityId);
}

// Visited entity ids during a single `decorateRenderedDOM` pass. Prevents
// pathological cycles (`a = Stack([b])`, `b = Stack([a])`) from blowing
// the stack. Reset at the top of every decorate.
const visitedEntitiesDuringWalk = new Set();

function walkParallel(visualNode, domEl, frameRect, ownerEntityId) {
  if (!visualNode || !domEl) return;
  // Tag DOM + store rect. Cross-entity walks overwrite the same `data-veid`
  // attribute multiple times — the LAST write wins, which is exactly what
  // we want: an `expr` placeholder that resolves to another entity should
  // be replaced by that entity's actual root component for click/hover.
  if (domEl instanceof HTMLElement) {
    domEl.dataset.veid = visualNode.id;
    if (ownerEntityId) domEl.dataset.veEntity = ownerEntityId;
  }
  state.rectsById.set(visualNode.id, {
    el: domEl,
    rect: rectIn(domEl, frameRect),
    entityId: ownerEntityId,
  });
  // `expr` placeholder bound to an identifier? Follow the reference into
  // the resolved entity so its tree is walked at this DOM position.
  if (visualNode.kind === "expr") {
    const ref = findEntityByIdentifier(String(visualNode.raw || "").trim());
    if (ref && ref.kind === "assignment" && ref.tree && !visitedEntitiesDuringWalk.has(ref.id)) {
      visitedEntitiesDuringWalk.add(ref.id);
      walkParallel(ref.tree, domEl, frameRect, ref.id);
      visitedEntitiesDuringWalk.delete(ref.id);
    }
    return;
  }
  if (visualNode.kind !== "component") return;
  const entry = getEntry(visualNode.name);
  if (!entry) return;

  for (const param of entry.params) {
    const slotKind = getSlotKind(param.type);
    if (!slotKind) continue;
    const slot = visualNode.slots[param.name];
    if (slotKind === "children") {
      const arr = Array.isArray(slot) ? slot : [];
      const container = arr.length > 0
        ? findContainerForCount(domEl, arr.length)
        : findEmptySlotContainer(domEl);
      const slotKey = visualNode.id + ":" + param.name;
      const childInfos = [];
      // Children slot bound to a raw identifier (e.g. `AppShell(content: pages)`)?
      // Walk into the referenced entity at the slot's first child element so
      // the user can click through to e.g. an entire `pages = Tabs([...])`
      // subtree.
      const rawBinding = visualNode.raws ? visualNode.raws[param.name] : null;
      if (arr.length === 0 && rawBinding != null && rawBinding !== "") {
        const ref = findEntityByIdentifier(String(rawBinding).trim());
        if (ref && ref.kind === "assignment" && ref.tree
          && !visitedEntitiesDuringWalk.has(ref.id)
          && container && container.children && container.children.length > 0) {
          visitedEntitiesDuringWalk.add(ref.id);
          walkParallel(ref.tree, container.children[0], frameRect, ref.id);
          visitedEntitiesDuringWalk.delete(ref.id);
        }
      }
      for (let i = 0; i < arr.length; i++) {
        const childEl = container && container.children[i] ? container.children[i] : null;
        if (childEl) walkParallel(arr[i], childEl, frameRect, ownerEntityId);
        childInfos.push(childEl ? rectIn(childEl, frameRect) : null);
      }
      state.rectsBySlot.set(slotKey, {
        param,
        container,
        containerRect: container ? rectIn(container, frameRect) : null,
        childRects: childInfos,
        empty: arr.length === 0,
        direction: container ? detectDirection(container) : "column",
        entityId: ownerEntityId,
      });
    } else if (slotKind === "child") {
      if (slot && typeof slot === "object" && slot.kind) {
        // Single-child slot. The visual subtree's rendered root is the
        // first descendant element with substantive content.
        walkParallel(slot, domEl, frameRect, ownerEntityId);
      } else {
        // Single-child slot bound to an identifier reference — follow it.
        const rawBinding = visualNode.raws ? visualNode.raws[param.name] : null;
        if (rawBinding != null && rawBinding !== "") {
          const ref = findEntityByIdentifier(String(rawBinding).trim());
          if (ref && ref.kind === "assignment" && ref.tree
            && !visitedEntitiesDuringWalk.has(ref.id)) {
            visitedEntitiesDuringWalk.add(ref.id);
            walkParallel(ref.tree, domEl, frameRect, ref.id);
            visitedEntitiesDuringWalk.delete(ref.id);
          }
        }
      }
    }
  }
}

function rectIn(domEl, frameRect) {
  const er = domEl.getBoundingClientRect();
  return {
    top: er.top - frameRect.top,
    left: er.left - frameRect.left,
    width: er.width,
    height: er.height,
  };
}

function detectDirection(container) {
  try {
    const cs = getComputedStyle(container);
    if (cs.flexDirection && cs.flexDirection.includes("row")) return "row";
    if (cs.gridTemplateColumns && cs.gridTemplateColumns !== "none") {
      // Distinguish row-flow grids from column-flow ones via the longest axis
      // of the resolved track list.
      return "grid";
    }
  } catch (_) {}
  return "column";
}

/**
 * BFS for a descendant whose direct child element count matches `count`.
 * Used to locate the rendered children container of a visual node.
 */
function findContainerForCount(rootEl, count) {
  const queue = [rootEl];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.children.length === count) return cur;
    for (const c of cur.children) queue.push(c);
  }
  // Fallback: the root itself, even if counts don't match. Better to map
  // partially than to return nothing.
  return rootEl;
}

/**
 * For empty children slots, find the first descendant that visually
 * represents the slot region. We pick the deepest single-child chain so
 * the slot fill bounds match the rendered placeholder — falling back to
 * the root element if the chain ends in a leaf with text.
 */
function findEmptySlotContainer(rootEl) {
  let cur = rootEl;
  while (cur && cur.children.length === 1) cur = cur.children[0];
  return cur || rootEl;
}

// ---------------------------------------------------------------------------
// Overlay rendering
//
// The overlay is recomputed from `state.rectsById` + `state.rectsBySlot`.
// It contains: hover outline + label, selection outline + action bar, drop
// zones (visible while dragging), and slot-fill CTAs for empty containers.

function renderOverlay() {
  const overlay = $("ve-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  // Mirror current mode + drag state on the stage so CSS can react.
  const stage = $("ve-stage");
  const frame = $("ve-stage-frame");
  if (stage) stage.dataset.mode = state.mode || "edit";
  if (frame) frame.dataset.mode = state.mode || "edit";

  if (!state.tree) {
    paintEmptyStage();
    return;
  }

  // Preview mode: render nothing — the live aktion-app is the deliverable.
  if (state.mode === "preview") {
    renderBreadcrumbs();
    return;
  }

  // Edit-mode container chrome: dashed outlines + tiny type badges so the
  // user can see the structure even when components are visually nested.
  renderContainerChrome(overlay);

  // Hover outline (skip when hovered === selected to avoid double rings).
  if (state.hoveredId && state.hoveredId !== state.selectedId && !currentDragPayload) {
    const hover = state.rectsById.get(state.hoveredId);
    if (hover) {
      overlay.append(buildOutline(hover.rect, "ve-outline--hover"));
      const node = findNode(state.hoveredId);
      if (node) overlay.append(buildHoverLabel(hover.rect, node));
    }
  }

  // Slot fills: visible CTAs for every empty Node[] / Node slot.
  renderSlotFills(overlay);

  // Drop zones (visible while a drag is active).
  if (currentDragPayload) renderDropZones(overlay);

  // Selection outline + floating toolbar (hide bar while dragging so it
  // doesn't get in the way of the drop targets).
  if (state.selectedId && !currentDragPayload) {
    const sel = state.rectsById.get(state.selectedId);
    if (sel) {
      overlay.append(buildOutline(sel.rect, "ve-outline--selected"));
      overlay.append(buildActionBar(sel.rect, state.selectedId));
    }
  } else if (state.selectedId && currentDragPayload) {
    const sel = state.rectsById.get(state.selectedId);
    if (sel) overlay.append(buildOutline(sel.rect, "ve-outline--selected"));
  }

  renderBreadcrumbs();
}

/**
 * Edit-mode visual chrome: faint dashed outlines around every component +
 * small named badges in the top-left corner. Helps users see the layout
 * structure (especially Stack / Grid / Box / Container) without having to
 * click each one. The chrome is opacity-controlled by CSS so it brightens
 * during drag and fades during normal editing.
 */
function renderContainerChrome(overlay) {
  // Decide which containers are "valid drop targets" for the current drag —
  // we use this to brighten only the relevant outlines/badges so the canvas
  // doesn't light up everywhere when the user starts dragging.
  const validIds = new Set();
  if (currentDragPayload) {
    for (const [slotKey, info] of state.rectsBySlot) {
      if (!info.param) continue;
      if (getSlotKind(info.param.type) !== "children") continue;
      const [parentId] = slotKey.split(":");
      const parent = findNode(parentId);
      if (!parent) continue;
      if (acceptsPayload(currentDragPayload, info.param, parent, 0)) {
        validIds.add(parentId);
      }
    }
  }
  for (const [, node] of allComponentNodes()) {
    if (node.kind !== "component") continue;
    if (node.id === state.selectedId) continue; // selection ring covers this
    const info = state.rectsById.get(node.id);
    if (!info || !info.rect) continue;
    const rect = info.rect;
    if (rect.width < 4 || rect.height < 4) continue;
    const isValidTarget = validIds.has(node.id);
    overlay.append(el("div", {
      class: "ve-container-outline",
      data: { veidOutline: node.id, validTarget: isValidTarget ? "true" : "false" },
      style: outlineStyle(rect),
    }));
    // Only show the name badge during drag for valid containers, to keep the
    // canvas calm in normal edit mode (badges otherwise appear on hover).
    if (currentDragPayload && isValidTarget) {
      overlay.append(el("div", {
        class: "ve-container-badge",
        data: { validTarget: "true" },
        style: "top:" + rect.top + "px;left:" + rect.left + "px;",
      }, node.name));
    }
  }
}

function buildOutline(rect, className) {
  return el("div", {
    class: "ve-outline " + className,
    style: outlineStyle(rect),
  });
}

function outlineStyle(rect) {
  return "top:" + rect.top + "px;left:" + rect.left + "px;width:"
    + rect.width + "px;height:" + rect.height + "px;";
}

function buildHoverLabel(rect, node) {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top - 4);
  return el("div", {
    class: "ve-hover-label",
    style: "top:" + top + "px;left:" + left + "px;",
  }, node.kind === "component" ? node.name : "expr");
}

function buildActionBar(rect, nodeId) {
  const node = findNode(nodeId);
  if (!node) return null;
  const info = findContainer(nodeId);
  const isRoot = !info || !info.parent;
  const left = Math.max(0, rect.left);
  // Place above the selection. If the selection is near the top, flip below.
  const aboveTop = rect.top - 6;
  const showBelow = aboveTop < 32;
  const styleTop = showBelow ? rect.top + rect.height + 6 : rect.top;
  const styleTransform = showBelow ? "transform: translateY(0);" : "";
  const bar = el("div", {
    class: "ve-action-bar",
    style: "top:" + styleTop + "px;left:" + left + "px;" + styleTransform,
    onMousedown: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation(),
  });
  // Drag handle + name (drag here to reorder).
  bar.append(el("div", {
    class: "ve-action-name",
    draggable: !isRoot,
    onDragstart: !isRoot ? (e) => startNodeDrag(node.id, e) : null,
    onDragend: !isRoot ? () => endNodeDrag() : null,
    title: isRoot ? "Root component" : "Drag to move",
  }, [
    el("i", { class: "fa-solid fa-grip-vertical", style: "margin-right: 4px; opacity: .65;" }),
    document.createTextNode(node.kind === "expr" ? "expr" : node.name),
  ]));
  bar.append(el("div", { class: "ve-action-sep" }));
  // Parent button
  if (info && info.parent) {
    bar.append(actionButton("fa-arrow-turn-up", "Select parent", () => {
      state.selectedId = info.parent.id;
      scheduleRender();
    }));
  }
  if (!isRoot && info.isList) {
    bar.append(actionButton("fa-arrow-up", "Move up", () => {
      commit();
      if (moveNode(nodeId, "up")) { saveState(); scheduleRender(); }
    }));
    bar.append(actionButton("fa-arrow-down", "Move down", () => {
      commit();
      if (moveNode(nodeId, "down")) { saveState(); scheduleRender(); }
    }));
  }
  bar.append(actionButton("fa-clone", "Duplicate", () => {
    commit();
    duplicateNode(nodeId);
    saveState();
    scheduleRender();
  }));
  if (!isRoot) {
    bar.append(actionButton("fa-trash", "Delete", () => {
      commit();
      deleteNode(nodeId);
      saveState();
      scheduleRender();
    }, "is-danger"));
  }
  return bar;
}

function actionButton(icon, title, onClick, extraClass) {
  return el("button", {
    type: "button",
    title,
    class: extraClass || "",
    onClick: (e) => { e.stopPropagation(); onClick(e); },
  }, [el("i", { class: "fa-solid " + icon })]);
}

/**
 * Render slot-fill CTAs: a visible placeholder over every Node[] / Node
 * slot. In edit mode they're always shown so the user can see where things
 * can go; during drag they brighten and become primary drop targets. They
 * also work as click-to-add launchers (focus the palette).
 *
 * For empty slots we expand the drop area to a comfortable minimum so even
 * a Stack or Grid that renders 0px tall is still targetable.
 */
function renderSlotFills(overlay) {
  // Only show slot fills for empty Node[] (children) slots, and only when
  // they have a *real* slot container distinct from the parent component.
  // Otherwise the fill would cover rendered title/subtitle/badge content
  // of components like PageHeader, Hero, Banner, etc. Single-Node optional
  // slots remain editable from the inspector.
  for (const [, node] of allComponentNodes()) {
    const entry = getEntry(node.name);
    if (!entry) continue;
    const parentInfo = state.rectsById.get(node.id);
    for (const param of entry.params) {
      const slotKind = getSlotKind(param.type);
      if (slotKind !== "children") continue;
      // Skip slots already bound to a raw expression — the runtime
      // resolves them at evaluation time (e.g. `content: pages`), so the
      // "Empty …" placeholder would be misleading and would also obscure
      // the live preview behind it.
      const rawBinding = node.raws ? node.raws[param.name] : null;
      if (rawBinding != null && rawBinding !== "") continue;
      const arr = node.slots[param.name];
      const isEmpty = !Array.isArray(arr) || arr.length === 0;
      if (!isEmpty) continue;
      const slotInfo = state.rectsBySlot.get(node.id + ":" + param.name);
      const slotContainer = slotInfo && slotInfo.container;
      const containerRect = slotInfo && slotInfo.containerRect;
      const parentRect = parentInfo && parentInfo.rect;

      // Trustworthy slot container = a child element of the rendered
      // component, NOT the component itself. (decorateRenderedDOM falls
      // back to the rootEl when it can't locate a real slot container.)
      const isRealSlotContainer = !!(slotContainer && slotInfo
        && slotInfo.container !== parentInfo?.el);

      let baseRect = null;
      if (isRealSlotContainer && containerRect) {
        baseRect = containerRect;
      } else if (isStructuralContainer(node.name) && parentRect
        && !nodeHasOtherPopulatedSlots(node, param, entry)) {
        // Pure-structural container with no extra chrome and no other
        // filled slot — safe to cover its full rect with a slot fill.
        // For multi-slot containers like AppShell / SplitView we'd
        // otherwise obscure the rendered content of the filled sibling.
        baseRect = parentRect;
      } else {
        // Parent has chrome (title/header/etc) or a sibling slot is
        // already populated — skip the visual fill. The inspector still
        // exposes the prop so the user can bind / edit it directly.
        continue;
      }
      overlay.append(buildSlotFill(baseRect, node, param));
    }
  }
}

// Names of components whose entire rect is OK to cover with a slot-fill
// placeholder when their children slot is empty (no decorative content
// would be obscured).
const STRUCTURAL_CONTAINER_NAMES = new Set([
  "Stack", "Grid", "Box", "Container", "Card", "Form", "FormSection",
  "FieldSet", "ScrollArea", "AspectRatio", "Spacer", "Sticky",
  "ResizablePanels", "MasonryGrid", "Drawer", "Modal", "Popover",
  "Tabs", "TabItem", "Accordion", "AccordionItem",
  "Stats", "FeatureGrid", "BadgeList", "Buttons",
  "Sidebar", "SidebarSection", "AppShell", "SplitView",
  "Navbar", "Toolbar", "DropdownMenu", "Menu",
  "FollowUpBlock", "ListBlock", "List", "ChatBubble",
]);
function isStructuralContainer(name) {
  return STRUCTURAL_CONTAINER_NAMES.has(name);
}

/**
 * Check whether any other slot prop on the same node already has visual
 * children or a raw expression binding. Used by `renderSlotFills` to
 * avoid overlaying the entire structural container when only one of
 * several slots is empty — e.g. an `AppShell` with a filled `content`
 * but an empty `topbar` shouldn't paint the fill over the whole shell.
 */
function nodeHasOtherPopulatedSlots(node, skipParam, entry) {
  if (!entry) return false;
  for (const param of entry.params) {
    if (param.name === skipParam.name) continue;
    const kind = getSlotKind(param.type);
    if (!kind) continue;
    const slot = node.slots ? node.slots[param.name] : null;
    if (kind === "children" && Array.isArray(slot) && slot.length > 0) return true;
    if (kind === "child" && slot && typeof slot === "object" && slot.kind) return true;
    const raw = node.raws ? node.raws[param.name] : null;
    if (raw != null && raw !== "") return true;
  }
  return false;
}

function buildSlotFill(rect, parentNode, param) {
  // Use the actual slot container rect when we have it. Constrain to a
  // sensible minimum so 0×0 empty containers are still clickable but never
  // larger than the parent itself (so we don't bleed over header/footer
  // siblings of an "empty" children slot).
  const minW = Math.max(Math.min(rect.width, 480), Math.min(160, rect.width || 160));
  const minH = Math.max(Math.min(rect.height, 200), Math.min(72, rect.height || 72));
  const valid = !currentDragPayload
    || acceptsPayload(currentDragPayload, param, parentNode, 0);
  const acceptedLabel = describeAcceptedTypes(param);
  const fill = el("div", {
    class: "ve-slot-fill",
    data: { valid: valid ? "true" : "false", slotKind: "children" },
    style: "top:" + rect.top + "px;left:" + rect.left + "px;width:"
      + minW + "px;height:" + minH + "px;",
    onClick: (e) => {
      e.stopPropagation();
      state.selectedId = parentNode.id;
      const search = $("ve-palette-input");
      if (search) search.focus();
      scheduleRender();
    },
  }, [
    el("div", { class: "ve-slot-fill-icon" }, [
      el("i", { class: "fa-solid fa-circle-plus" }),
    ]),
    el("div", { class: "ve-slot-fill-cta" },
      currentDragPayload ? "Release to drop here" : "Drop into " + param.name),
    el("div", { class: "ve-slot-fill-meta" },
      parentNode.name + " · accepts " + (acceptedLabel || "components")),
  ]);
  attachDropTarget(fill,
    (p) => acceptsPayload(p, param, parentNode, 0),
    (p) => { commit(); performDrop(p, parentNode.id, param.name, 0); });
  return fill;
}

function describeAcceptedTypes(param) {
  const t = (param && param.type) || "";
  if (!t) return "";
  if (t === "Node[]" || t === "Node") return "any component";
  if (t.endsWith("[]")) return t.slice(0, -2);
  return t;
}

/**
 * While a drag is active, render generous drop-zone gaps between siblings
 * of every Node[] slot the payload can target. The user drops between them
 * to insert at that index.
 *
 * Zones are sized so they are large enough to hit easily (CSS expands them
 * during drag via [data-dragging="true"] on the stage). They overlap a few
 * pixels into the adjacent siblings on purpose so the entire gap is a
 * valid target.
 */
function renderDropZones(overlay) {
  for (const [slotKey, info] of state.rectsBySlot) {
    if (!info.param || getSlotKind(info.param.type) !== "children") continue;
    if (!info.containerRect) continue;
    const [parentId] = slotKey.split(":");
    const parent = findNode(parentId);
    if (!parent) continue;
    if (!acceptsPayload(currentDragPayload, info.param, parent, 0)) continue;
    if (info.empty) continue; // empty handled by slot fill
    const dir = info.direction;
    const isRow = dir === "row";
    for (let i = 0; i <= info.childRects.length; i++) {
      const zone = buildDropZone(info, i, isRow);
      if (!zone) continue;
      attachDropTarget(zone,
        (p) => acceptsPayload(p, info.param, parent, i),
        (p) => { commit(); performDrop(p, parent.id, info.param.name, i); });
      overlay.append(zone);
    }
  }
}

function buildDropZone(info, index, isRow) {
  // The hit area is generous (HIT px) so users can target it easily, but the
  // visible cue is a thin "insertion line" that sits between the two
  // sibling rects without overlapping their content. The line grows when the
  // zone is :active.
  const cr = info.containerRect;
  const HIT = 18;
  let top, left, width, height;
  if (isRow) {
    if (index === 0) {
      const c0 = info.childRects[0];
      if (!c0) return null;
      left = c0.left - HIT / 2;
    } else if (index === info.childRects.length) {
      const last = info.childRects[index - 1];
      if (!last) return null;
      left = last.left + last.width - HIT / 2;
    } else {
      const a = info.childRects[index - 1];
      const b = info.childRects[index];
      if (!a || !b) return null;
      left = (a.left + a.width + b.left) / 2 - HIT / 2;
    }
    top = cr.top;
    height = cr.height;
    width = HIT;
  } else {
    if (index === 0) {
      const c0 = info.childRects[0];
      if (!c0) return null;
      top = c0.top - HIT / 2;
    } else if (index === info.childRects.length) {
      const last = info.childRects[index - 1];
      if (!last) return null;
      top = last.top + last.height - HIT / 2;
    } else {
      const a = info.childRects[index - 1];
      const b = info.childRects[index];
      if (!a || !b) return null;
      top = (a.top + a.height + b.top) / 2 - HIT / 2;
    }
    left = cr.left;
    width = cr.width;
    height = HIT;
  }
  return el("div", {
    class: "ve-drop-zone " + (isRow ? "ve-drop-zone--col" : "ve-drop-zone--row"),
    style: "top:" + top + "px;left:" + left + "px;width:" + width + "px;height:" + height + "px;",
  }, [
    el("div", { class: "ve-drop-zone-line" }),
  ]);
}

/**
 * Yield every component node that has been tagged on the canvas by the
 * most recent `decorateRenderedDOM` pass. With cross-entity walking
 * enabled, this includes components defined in other assignment
 * bindings (e.g. `block`, `card` referenced from `aktion`), so the
 * overlay chrome — slot fills, drop zones, container outlines — keeps
 * working when the user has navigated into a child binding.
 */
function* allComponentNodes() {
  const seen = new Set();
  for (const [id] of state.rectsById) {
    if (seen.has(id)) continue;
    const node = findNode(id);
    if (!node || node.kind !== "component") continue;
    seen.add(id);
    yield [id, node];
  }
  // Fallback: when the rect map is empty (e.g. an initial render before
  // decorate has run), walk the active tree so the overlay still has
  // something to paint.
  if (state.rectsById.size === 0 && state.tree) {
    const stack = [state.tree];
    while (stack.length > 0) {
      const n = stack.pop();
      if (n.kind === "component" && !seen.has(n.id)) {
        seen.add(n.id);
        yield [n.id, n];
        for (const slot of Object.values(n.slots || {})) {
          if (Array.isArray(slot)) for (const c of slot) stack.push(c);
          else if (slot && typeof slot === "object" && slot.kind) stack.push(slot);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering — Raw Edit canvas (tree of cards)
//
// In Raw Edit mode the canvas pane shows the underlying aktion expression
// as a nested tree of cards — one per VisualNode — with drag handles,
// inline toolbar buttons (move up/down, duplicate, delete) and per-slot
// drop zones. It reuses the same payload model (currentDragPayload,
// attachDropTarget, performDrop) as the WYSIWYG canvas, so dragging from
// the palette or rearranging cards stays in sync with the live preview
// the moment the user switches back to Edit / Preview.

function renderRawCanvas() {
  const canvas = $("ve-raw-canvas");
  if (!canvas) return;
  canvas.innerHTML = "";
  if (state.mode !== "raw") return;
  const ent = activeEntity();
  if (ent && (ent.kind !== "assignment" || !ent.tree)) {
    canvas.append(el("div", { class: "ve-raw-empty" }, [
      el("i", { class: "fa-solid " + entityIcon(ent), "aria-hidden": "true" }),
      el("h3", null, ent.kind + " · " + ent.name),
      el("p", null, "Source-only entity. Use the inspector to edit, or focus aktion in the outline to keep composing visually."),
    ]));
    return;
  }
  if (!state.tree) {
    canvas.append(el("div", { class: "ve-raw-empty" }, [
      el("i", { class: "fa-solid fa-sitemap", "aria-hidden": "true" }),
      el("h3", null, "Empty canvas"),
      el("p", null, "Drag a component from the palette to start the tree."),
    ]));
    return;
  }
  canvas.append(renderRawTreeNode(state.tree, null, null, 0));
}

function renderRawTreeNode(node, parent, slotName, depth) {
  if (node.kind === "expr") return renderRawExprNode(node, parent);
  return renderRawComponentNode(node, parent, slotName, depth);
}

function renderRawExprNode(node, parent) {
  // When the expression is a bare identifier referencing another
  // assignment entity (e.g. `Stack([block])`), surface a "drill into"
  // button so the user can jump straight to that entity's tree from the
  // raw view without first selecting the placeholder and going through
  // the inspector.
  const referenced = findEntityByIdentifier(String(node.raw || "").trim());
  return el("div", {
    class: "ve-node",
    draggable: parent ? "true" : "false",
    data: {
      kind: "expr",
      selected: state.selectedId === node.id,
      dragging: state.draggingId === node.id,
      expanded: "false",
    },
    onClick: (e) => { e.stopPropagation(); state.selectedId = node.id; scheduleRender(); },
    onDragstart: parent ? (e) => { e.stopPropagation(); startNodeDrag(node.id, e); } : null,
    onDragend: parent ? () => endNodeDrag() : null,
  }, [
    el("div", { class: "ve-node-head" }, [
      el("span", { class: "ve-drag" }, [el("i", { class: "fa-solid fa-grip-vertical" })]),
      el("span", {
        class: "ve-name",
        style: "color: " + (referenced ? "var(--doc-primary)" : "var(--doc-text-muted)") + ";",
      }, referenced ? referenced.name : "expr"),
      el("span", { class: "ve-summary" }, node.raw || ""),
      el("div", { class: "ve-actions" }, [
        referenced ? el("button", {
          type: "button",
          title: "Open " + referenced.name + " in the editor",
          onClick: (e) => {
            e.stopPropagation();
            focusEntity(referenced.id);
          },
        }, [el("i", { class: "fa-solid fa-arrow-up-right-from-square" })]) : null,
        parent ? el("button", {
          type: "button", title: "Delete", class: "is-danger",
          onClick: (e) => {
            e.stopPropagation();
            deleteNode(node.id);
            saveState();
            scheduleRender();
          },
        }, [el("i", { class: "fa-solid fa-trash" })]) : null,
      ]),
    ]),
  ]);
}

function renderRawComponentNode(node, parent, slotName, depth) {
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
  wrap.append(renderRawNodeHeader(node, parent));
  if (entry) {
    const body = el("div", { class: "ve-node-body" });
    let hasContent = false;
    for (const param of entry.params) {
      const slotKind = getSlotKind(param.type);
      if (!slotKind) continue;
      const slot = node.slots[param.name];
      const presentForChild = slotKind === "child" && slot;
      const presentForChildren = slotKind === "children" && Array.isArray(slot);
      // A raw-bound slot (identifier reference, for-expr, ternary, …)
      // counts as "present" — the inspector still needs to surface it
      // so the user can rebind or open the referenced entity.
      const rawBinding = node.raws ? node.raws[param.name] : null;
      const hasRaw = rawBinding != null && rawBinding !== "";
      // Always render the first Node[] slot; render optional slots only
      // when present or marked required.
      const isFirstChildrenParam = param.name === firstChildrenParamName(entry);
      if (slotKind === "children" && !presentForChildren && !hasRaw && !param.required && !isFirstChildrenParam) continue;
      if (slotKind === "child" && !presentForChild && !hasRaw && !param.required) continue;
      hasContent = true;
      body.append(renderRawSlot(node, param, depth));
    }
    if (hasContent) wrap.append(body);
  }
  return wrap;
}

function renderRawNodeHeader(node, parent) {
  const entry = getEntry(node.name);
  const summary = nodeSummary(node);
  return el("div", { class: "ve-node-head" }, [
    el("span", { class: "ve-drag" }, [el("i", { class: "fa-solid fa-grip-vertical" })]),
    el("span", { class: "ve-name" }, node.name),
    el("span", { class: "ve-summary" }, summary || (entry ? entry.signature : "")),
    el("div", { class: "ve-actions" }, parent ? [
      el("button", {
        type: "button", title: "Move up",
        onClick: (e) => {
          e.stopPropagation();
          if (moveNode(node.id, "up")) { saveState(); scheduleRender(); }
        },
      }, [el("i", { class: "fa-solid fa-arrow-up" })]),
      el("button", {
        type: "button", title: "Move down",
        onClick: (e) => {
          e.stopPropagation();
          if (moveNode(node.id, "down")) { saveState(); scheduleRender(); }
        },
      }, [el("i", { class: "fa-solid fa-arrow-down" })]),
      el("button", {
        type: "button", title: "Duplicate",
        onClick: (e) => {
          e.stopPropagation();
          duplicateNode(node.id);
          saveState();
          scheduleRender();
        },
      }, [el("i", { class: "fa-solid fa-clone" })]),
      el("button", {
        type: "button", title: "Delete", class: "is-danger",
        onClick: (e) => {
          e.stopPropagation();
          deleteNode(node.id);
          saveState();
          scheduleRender();
        },
      }, [el("i", { class: "fa-solid fa-trash" })]),
    ] : [
      el("span", { class: "ve-summary-chip" }, "root"),
    ]),
  ]);
}

function renderRawSlot(node, param, depth) {
  const slotKind = getSlotKind(param.type);
  const slot = el("div", { class: "ve-slot" }, [
    el("div", { class: "ve-slot-label" },
      param.name + " · " + param.type + (param.required ? " *" : "")),
  ]);
  // Slot bound to an expression (identifier / for-comprehension / ternary)?
  // Render a binding card with the source text and, when the identifier
  // matches another entity, a quick-jump button to focus it.
  const raw = node.raws ? node.raws[param.name] : null;
  if (raw != null && raw !== "") {
    slot.append(renderRawBindingCard(node, param, raw));
    return slot;
  }
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
      list.append(renderRawDropGap(node, param, 0));
      arr.forEach((child, idx) => {
        list.append(renderRawTreeNode(child, node, param.name, depth + 1));
        list.append(renderRawDropGap(node, param, idx + 1));
      });
    }
    slot.append(list);
  } else if (slotKind === "child") {
    const child = node.slots[param.name];
    if (child) {
      slot.append(renderRawTreeNode(child, node, param.name, depth + 1));
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

/**
 * Card shown for slot props bound to an expression rather than a visual
 * subtree (e.g. `AppShell(sidebar, pages)`). It surfaces the bound
 * expression and, when it references another entity (`sidebar`, `pages`),
 * offers a quick way to focus that entity in the outline.
 */
function renderRawBindingCard(node, param, raw) {
  const referencedEntity = findEntityByIdentifier(String(raw).trim());
  const card = el("div", { class: "ve-slot-binding" }, [
    el("div", { class: "ve-slot-binding-head" }, [
      el("i", { class: "fa-solid fa-link", "aria-hidden": "true" }),
      el("span", { class: "ve-slot-binding-label" }, "Bound expression"),
    ]),
    el("code", { class: "ve-slot-binding-expr" }, String(raw)),
    el("div", { class: "ve-slot-binding-actions" }, [
      referencedEntity ? el("button", {
        type: "button",
        class: "ve-btn",
        title: "Open " + referencedEntity.name + " in the inspector",
        onClick: (e) => {
          e.stopPropagation();
          focusEntity(referencedEntity.id);
        },
      }, [
        el("i", { class: "fa-solid fa-arrow-up-right-from-square" }),
        el("span", null, "Open " + referencedEntity.name),
      ]) : null,
      el("button", {
        type: "button",
        class: "ve-btn",
        title: "Replace this expression with an inline visual subtree",
        onClick: (e) => {
          e.stopPropagation();
          delete node.raws[param.name];
          if (getSlotKind(param.type) === "children") node.slots[param.name] = [];
          else node.slots[param.name] = null;
          state.selectedId = node.id;
          saveState();
          scheduleRender();
        },
      }, [
        el("i", { class: "fa-solid fa-eraser" }),
        el("span", null, "Clear binding"),
      ]),
    ]),
  ]);
  return card;
}

/**
 * Look up an entity in the current entity list by its top-level name.
 * Returns the matching entity (assignment / component-decl / state) or
 * null when no match exists.
 */
function findEntityByIdentifier(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  // Only resolve bare identifiers — anything with parens, dots, etc.
  // is a richer expression that doesn't map cleanly to one entity.
  if (!/^\$?[A-Za-z_]\w*$/.test(trimmed)) return null;
  const isState = trimmed.startsWith("$");
  const cleanName = isState ? trimmed.slice(1) : trimmed;
  return (state.entities || []).find((e) => {
    if (isState) return e.kind === "state" && e.name === cleanName;
    return e.name === cleanName;
  }) || null;
}

function renderRawDropGap(node, param, index) {
  const gap = el("div", { class: "ve-drop-gap" });
  attachDropTarget(gap,
    (p) => acceptsPayload(p, param, node, index),
    (p) => performDrop(p, node.id, param.name, index));
  return gap;
}

// ---------------------------------------------------------------------------
// Rendering — breadcrumbs

function renderBreadcrumbs() {
  const root = $("ve-breadcrumbs");
  if (!root) return;
  root.innerHTML = "";
  // Quick way back to `aktion` whenever the user has drilled into another
  // binding (either by clicking a cross-entity component on the canvas
  // or by selecting one from the Outline tab). A single click goes home;
  // a tooltip explains the shortcut.
  const ent = activeEntity();
  const appEnt = (state.entities || []).find(
    (e) => e.kind === "assignment" && e.name === ROOT_ENTITY_NAME,
  );
  if (appEnt && ent && ent.id !== appEnt.id) {
    root.append(el("button", {
      type: "button",
      title: "Back to " + ROOT_ENTITY_NAME,
      style: "padding-right: 6px;",
      onClick: () => focusEntity(appEnt.id),
    }, [
      el("i", { class: "fa-solid fa-house", "aria-hidden": "true" }),
    ]));
    root.append(el("i", { class: "fa-solid fa-chevron-right", "aria-hidden": "true" }));
  }
  // First crumb is the active entity — clicking it pops a menu to switch
  // to a different top-level binding without opening the outline tab.
  if (ent) {
    const ebtn = el("button", {
      type: "button",
      class: state.selectedId ? "" : "is-current",
      title: "Switch entity",
      onClick: (e) => {
        e.stopPropagation();
        openEntitySwitcher(ebtn);
      },
    }, [
      el("i", { class: "fa-solid " + entityIcon(ent), "aria-hidden": "true", style: "margin-right: 6px;" }),
      el("span", null, ent.name),
      el("i", {
        class: "fa-solid fa-caret-down",
        style: "margin-left: 6px; font-size: 9px; opacity: .6;",
        "aria-hidden": "true",
      }),
    ]);
    root.append(ebtn);
  }
  if (!state.selectedId) {
    if (!ent) {
      root.append(el("span", { style: "color: var(--doc-text-subtle); font-style: italic;" }, "Click any component to edit its props"));
    }
    return;
  }
  root.append(el("i", { class: "fa-solid fa-chevron-right", "aria-hidden": "true" }));
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

  // Entity-level banner so the user always knows which top-level thing is
  // currently active in the canvas.
  const ent = activeEntity();
  if (ent) root.append(renderEntityBanner(ent));

  // Non-tree entities (state defaults, action / effect bodies, raw
  // declarations) get a focused inline editor instead of the component
  // inspector — there's no visual tree to fall back to.
  if (ent && (ent.kind === "state" || ent.kind === "action-decl" || ent.kind === "effect-decl" || ent.kind === "free")) {
    root.append(renderEntitySourceEditor(ent));
    renderPreludeBlock(root);
    return;
  }
  if (ent && ent.kind === "component-decl") {
    root.append(renderComponentDeclEditor(ent));
    renderPreludeBlock(root);
    return;
  }

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

function renderEntityBanner(ent) {
  const wrap = el("div", { class: "ve-insp-title", style: "margin-bottom: 6px;" }, [
    el("i", { class: "fa-solid " + entityIcon(ent), "aria-hidden": "true" }),
    el("span", null, ent.name),
    el("span", { class: "ve-insp-group-tag" }, ent.kind),
  ]);
  return wrap;
}

/**
 * Inline source editor for entities that have no structural tree —
 * state defaults, action / effect bodies, and free-form fragments. The
 * textarea keeps the user in control of the exact source we round-trip
 * back into the program.
 */
function renderEntitySourceEditor(ent) {
  const wrap = el("div", { class: "ve-prelude" });
  if (ent.kind === "state") {
    wrap.append(el("h4", null, "State default — $" + ent.name));
    wrap.append(el("p", null,
      "Initial value for $" + ent.name + ". Use any Aktion literal — strings, numbers, arrays, objects."));
    const nameInput = el("input", {
      class: "ve-prop-input",
      type: "text",
      value: ent.name,
      placeholder: "stateName",
      onInput: (e) => {
        ent.name = e.target.value.replace(/[^A-Za-z0-9_]/g, "");
        queueCodeUpdate();
        saveState();
      },
    });
    wrap.append(el("p", { style: "margin: 8px 0 4px;" }, "Name"));
    wrap.append(nameInput);
    wrap.append(el("p", { style: "margin: 8px 0 4px;" }, "Default"));
    const ta = el("textarea", {
      class: "ve-prop-input",
      rows: 4,
      onInput: (e) => {
        ent.raw = e.target.value;
        queueCodeUpdate();
        saveState();
      },
    });
    ta.value = ent.raw || "";
    wrap.append(ta);
    return wrap;
  }
  const heading = ent.kind === "action-decl"
    ? "Action body"
    : ent.kind === "effect-decl"
      ? "Effect body"
      : "Source";
  wrap.append(el("h4", null, heading));
  if (ent.kind === "action-decl") {
    wrap.append(el("p", null,
      "Full source of the `function " + ent.name + "(...) { ... }` declaration. Edit freely — the entire block is written back verbatim."));
  } else if (ent.kind === "effect-decl") {
    wrap.append(el("p", null,
      "Full source of the `effect(() => { ... }, [...])` declaration. Deps and rate-limit modifiers go in the array."));
  } else {
    wrap.append(el("p", null,
      "Top-level source the editor couldn't classify. Edit directly — the original text is preserved on export."));
  }
  const ta = el("textarea", {
    class: "ve-prop-input",
    rows: Math.min(20, Math.max(6, (ent.source || "").split("\n").length + 2)),
    style: "font-family: var(--doc-mono); font-size: 12px;",
    onInput: (e) => {
      ent.source = e.target.value;
      queueCodeUpdate();
      saveState();
    },
  });
  ta.value = ent.source || "";
  wrap.append(ta);
  return wrap;
}

/**
 * Inspector for `component <Name>(params) { … }` declarations. Lets the
 * user rename the component, edit its parameter list, and edit the body
 * source. (A full visual tree round-trip for the component body is a
 * follow-up — for now we keep the source authoritative so authors can
 * iterate on complex bodies that the visual tree wouldn't yet model.)
 */
function renderComponentDeclEditor(ent) {
  const wrap = el("div", { class: "ve-prelude" });
  wrap.append(el("h4", null, "Component declaration"));
  wrap.append(el("p", null,
    "Define a reusable component you can drop into the canvas like any built-in. Components surface in the Outline tab and can be invoked from " + ROOT_ENTITY_NAME + " or any other binding."));

  wrap.append(el("p", { style: "margin: 8px 0 4px;" }, "Name"));
  const nameInput = el("input", {
    class: "ve-prop-input",
    type: "text",
    value: ent.name,
    onInput: (e) => {
      const next = e.target.value.replace(/[^A-Za-z0-9_]/g, "");
      // Keep the source in sync so the header still matches the new name.
      ent.source = ent.source.replace(/^function\s+[A-Za-z_]\w*/, "function " + next);
      ent.name = next;
      queueCodeUpdate();
      saveState();
    },
  });
  wrap.append(nameInput);

  wrap.append(el("p", { style: "margin: 8px 0 4px;" }, "Parameters (comma-separated)"));
  const paramsInput = el("input", {
    class: "ve-prop-input",
    type: "text",
    value: (ent.params || []).join(", "),
    placeholder: "task, isDone",
    onInput: (e) => {
      const next = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
      ent.params = next;
      ent.source = ent.source.replace(
        /^(component\s+[A-Za-z_]\w*\s*\()[^)]*(\))/,
        "$1" + next.join(", ") + "$2",
      );
      queueCodeUpdate();
      saveState();
    },
  });
  wrap.append(paramsInput);

  wrap.append(el("p", { style: "margin: 8px 0 4px;" }, "Body source"));
  const ta = el("textarea", {
    class: "ve-prop-input",
    rows: Math.min(24, Math.max(8, (ent.source || "").split("\n").length + 1)),
    style: "font-family: var(--doc-mono); font-size: 12px;",
    onInput: (e) => {
      ent.source = e.target.value;
      // Re-derive name/params from the header so the outline label stays
      // in sync without forcing the user to keep the inputs above edited.
      const header = e.target.value.match(/^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
      if (header) {
        ent.name = header[1];
        ent.params = header[2].split(",").map((s) => s.trim()).filter(Boolean);
        nameInput.value = ent.name;
        paramsInput.value = ent.params.join(", ");
      }
      queueCodeUpdate();
      saveState();
    },
  });
  ta.value = ent.source || "";
  wrap.append(ta);
  return wrap;
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
  // Cross-entity context hint: if the selected node is the root of a
  // non-`aktion` binding, surface that so the user knows duplicating /
  // deleting from here only affects this binding — to remove the
  // reference from `aktion`, they need to switch back.
  const cont = findContainer(node.id);
  const owningEnt = findOwnerEntity(node.id);
  if (cont && !cont.parent && owningEnt && owningEnt.name !== ROOT_ENTITY_NAME) {
    root.append(el("div", {
      class: "ve-insp-desc",
      style: "background: var(--doc-bg-soft); border: 1px solid var(--doc-border-subtle); border-radius: var(--doc-radius-sm); padding: 8px 10px; margin: 0 0 14px; display: flex; gap: 8px; align-items: center;",
    }, [
      el("i", { class: "fa-solid fa-link", style: "color: var(--doc-primary);", "aria-hidden": "true" }),
      el("span", { style: "flex: 1; min-width: 0;" }, [
        document.createTextNode("Root of "),
        el("code", { style: "font-family: var(--doc-mono);" }, owningEnt.name),
        document.createTextNode(" — referenced from other bindings."),
      ]),
    ]));
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
    const hasRaw = node.raws && node.raws[param.name];
    if (hasRaw) {
      // The prop is bound to an identifier / expression (e.g. another
      // entity like `sidebar` or `pages`). Show an editable text input
      // and a "Reset to slot" button so authors can flip between an
      // expression binding and an inline visual subtree.
      const inp = el("input", {
        type: "text",
        class: "ve-prop-input",
        value: node.raws[param.name] || "",
        onInput: (e) => {
          node.raws[param.name] = e.target.value;
          queueCodeUpdate();
          saveState();
        },
      });
      wrap.append(inp);
      wrap.append(el("div", { class: "ve-prop-desc", style: "margin-top: 4px;" },
        "Identifier / expression reference. Clear this to drop components inline."));
      wrap.append(el("button", {
        class: "ve-btn",
        style: "margin-top: 6px;",
        onClick: () => {
          delete node.raws[param.name];
          if (slotKind === "children") node.slots[param.name] = [];
          else node.slots[param.name] = null;
          saveState();
          scheduleRender();
        },
      }, [
        el("i", { class: "fa-solid fa-eraser" }),
        el("span", null, "Clear and drop inline"),
      ]));
    } else {
      const summary = slotKind === "children"
        ? (Array.isArray(slot) ? slot.length + " child" + (slot.length === 1 ? "" : "ren") : "0 children")
        : (slot ? slot.name || "expr" : "empty");
      wrap.append(el("div", { class: "ve-prop-input", style: "color: var(--doc-text-muted); cursor: default;" },
        "Drop components on the canvas slot — current: " + summary));
    }
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
  // Push the latest tree to the live preview without rebuilding the inspector
  // DOM (which would blow away the focused input). The canvas re-render is
  // cheap because <aktion-app> diffs internally.
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
    "Use this for state ($), functions, effects, theme overrides."));
  const ta = el("textarea", {
    class: "ve-prop-input",
    rows: 6,
    placeholder: "$count = 0\nfunction inc() { $count = $count + 1 }",
    onInput: (e) => { state.prelude = e.target.value; queueCodeUpdate(); saveState(); },
  });
  ta.value = state.prelude || "";
  wrap.append(ta);
  root.append(wrap);
}

// ---------------------------------------------------------------------------
// Source drawer — fills .aktion + standalone HTML panes
//
// The .aktion panel hosts a real editable textarea so power users can hand-
// edit the entire program and re-import it. We keep the textarea value in
// sync with the visual tree when the user has NOT started editing locally;
// once they start typing we leave it alone (marking it "dirty") until they
// click Apply or Revert. This way they never lose pending edits to a
// background re-render triggered by a canvas change.

const sourceEditState = {
  dirty: false,
  lastEmitted: "",
};

function updateSourceDrawer() {
  const code = emitProgram();
  const htmlCode = buildStandaloneHtml(code, state.theme, "Aktion app");

  const edit = $("ve-code-edit");
  if (edit) {
    if (!sourceEditState.dirty) {
      edit.value = code;
    }
    sourceEditState.lastEmitted = code;
    updateSourceHint();
  }
  const htmlEl = $("ve-html");
  if (htmlEl) htmlEl.textContent = htmlCode;
}

function updateSourceHint(errorMessage) {
  const hint = $("ve-source-hint");
  if (!hint) return;
  hint.innerHTML = "";
  if (errorMessage) {
    hint.dataset.state = "error";
    const ic = document.createElement("i");
    ic.className = "fa-solid fa-circle-exclamation";
    hint.append(ic);
    hint.append(document.createTextNode(" " + errorMessage));
    return;
  }
  if (sourceEditState.dirty) {
    hint.dataset.state = "dirty";
    const ic = document.createElement("i");
    ic.className = "fa-solid fa-pen-to-square";
    hint.append(ic);
    hint.append(document.createTextNode(" Local edits not yet applied — click Apply changes to re-import."));
    return;
  }
  hint.dataset.state = "clean";
  const ic = document.createElement("i");
  ic.className = "fa-solid fa-circle-check";
  hint.append(ic);
  hint.append(document.createTextNode(" In sync with the visual tree."));
}

/**
 * Re-parse the textarea contents back into the entity / tree state. The
 * program goes through the regular import pipeline so any classifiable
 * declaration shows up in the Outline, and parse errors surface as a
 * red banner under the textarea (the canvas keeps showing whatever is
 * currently rendered).
 */
function applySourceEdits() {
  const edit = $("ve-code-edit");
  if (!edit) return;
  const src = edit.value;
  try {
    const result = importFromSource(src);
    commit();
    applyImportResult(result);
    sourceEditState.dirty = false;
    // Surface parse diagnostics in the hint banner so the user can see
    // exactly what tripped — the canvas already reflects whichever
    // entities the importer salvaged from the partial parse.
    if (result.errors && result.errors.length > 0) {
      const first = result.errors[0];
      const at = first.line != null ? " (line " + (first.line + 1) + ")" : "";
      updateSourceHint(
        "Applied with " + result.errors.length + " parse error"
        + (result.errors.length === 1 ? "" : "s")
        + " — first" + at + ": " + (first.message || "syntax error"),
      );
    } else {
      showToast("Applied source edits", { icon: "check", tone: "success" });
      updateSourceHint();
    }
  } catch (err) {
    updateSourceHint("Couldn't apply: " + (err && err.message ? err.message : String(err)));
  }
}

function revertSourceEdits() {
  const edit = $("ve-code-edit");
  if (!edit) return;
  edit.value = sourceEditState.lastEmitted || emitProgram();
  sourceEditState.dirty = false;
  updateSourceHint();
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
    syncActiveEntityFromTree();
    const payload = {
      tree: state.tree,
      prelude: state.prelude,
      rootId: state.rootId,
      entities: state.entities,
      activeEntityId: state.activeEntityId,
      theme: state.theme,
      device: state.device,
      zoom: state.zoom,
      mode: state.mode,
      paletteTab: state.paletteTab,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (_) { /* quota / privacy */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && (data.tree || (Array.isArray(data.entities) && data.entities.length > 0))) {
      state.tree = data.tree || null;
      state.prelude = data.prelude || "";
      state.rootId = data.rootId || "aktion";
      state.entities = Array.isArray(data.entities) ? data.entities : [];
      state.activeEntityId = data.activeEntityId || null;
      state.theme = data.theme || "light";
      state.device = data.device || "desktop";
      state.zoom = typeof data.zoom === "number" ? data.zoom : 1;
      state.mode = (data.mode === "preview" || data.mode === "raw") ? data.mode : "edit";
      state.paletteTab = data.paletteTab === "outline" ? "outline" : "components";
      // Backfill an entity list from a legacy tree-only snapshot so users
      // upgrading from the previous editor don't lose their work.
      if (state.entities.length === 0 && state.tree) {
        const stub = {
          id: uuidEntity(),
          kind: "assignment",
          name: state.rootId || ROOT_ENTITY_NAME,
          tree: state.tree,
          raw: null,
          source: "",
        };
        state.entities = [stub];
        state.activeEntityId = stub.id;
      }
      syncActiveTreeFromEntity();
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
    renderRawCanvas();
    renderInspector();
    renderBreadcrumbs();
    if (state.paletteTab === "outline") renderOutline();
    queueCodeUpdate();
  });
}

const queueCodeUpdate = debounce(updateSourceDrawer, 80);

// ---------------------------------------------------------------------------
// Examples

const EXAMPLES = [
  {
    name: "Welcome card",
    desc: "Stack with a card and a follow-up block.",
    code:
      'aktion = Stack([\n' +
      '  Card([CardHeader("Hello, world", { subtitle: "Generated visually" })]),\n' +
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
      'aktion = Stack([\n' +
      '  PageHeader("Sales", { subtitle: "This week" }),\n' +
      '  Stats([\n' +
      '    StatCard("Revenue", { value: "$12,540", trend: "up", delta: "+12%", icon: "sack-dollar" }),\n' +
      '    StatCard("Orders",  { value: "138",     trend: "up", delta: "+4%",  icon: "cart-shopping" }),\n' +
      '    StatCard("Returns", { value: "4",       trend: "down", delta: "-1", icon: "rotate-left" })\n' +
      '  ]),\n' +
      '  Card([\n' +
      '    CardHeader("Daily traffic"),\n' +
      '    LineChart(["Mo","Tu","We","Th","Fr","Sa","Su"],\n' +
      '      { series: [Series("This week", { values: [820, 1240, 1500, 1180, 1310, 980, 740] })] })\n' +
      '  ])\n' +
      '])',
  },
  {
    name: "Reactive todo",
    desc: "Reactive state, action, and a for-loop.",
    code:
      '$todos = [{id: 1, text: "First task", done: false}]\n' +
      '$draft = ""\n\n' +
      'function addTodo() {\n' +
      '  $todos = [...$todos, {id: $todos.length + 1, text: $draft, done: false}]\n' +
      '  $draft = ""\n' +
      '}\n\n' +
      'function Row(t) {\n' +
      '  return Card([Text(t.text)])\n' +
      '}\n\n' +
      'aktion = Stack([\n' +
      '  Card([CardHeader("Todo list")]),\n' +
      '  Input("draft", { placeholder: "What needs doing?", value: $draft }),\n' +
      '  Button("Add", { action: addTodo, variant: "primary" }),\n' +
      '  for (let t of $todos) { Row(t) }\n' +
      '])',
  },
  {
    name: "Pricing table",
    desc: "Three pricing cards in a grid.",
    code:
      'aktion = Stack([\n' +
      '  Hero("Plans for every team", { subtitle: "Pick the size that fits." }),\n' +
      '  PricingTable([\n' +
      '    PricingCard("Starter", { price: "$0",  period: "/mo", features: ["1 user", "Community support"] }),\n' +
      '    PricingCard("Team",    { price: "$24", period: "/mo", features: ["10 users", "Email support"], featured: true }),\n' +
      '    PricingCard("Scale",   { price: "$99", period: "/mo", features: ["Unlimited", "Priority support"] })\n' +
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
  state.entities = result.entities || [];
  state.activeEntityId = result.activeEntityId || null;
  state.tree = result.tree;
  state.prelude = result.prelude || "";
  if (result.rootId) state.rootId = result.rootId;
  state.selectedId = null;
  syncActiveTreeFromEntity();
  updateOutlineBadge();
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
    commit();
    const def = defaultEntities();
    state.entities = def.entities;
    state.activeEntityId = def.entities[0].id;
    state.tree = def.tree;
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
    scheduleRender();
  });
  $("ve-toggle-palette").addEventListener("click", (e) => {
    state.paletteOpen = !state.paletteOpen;
    $("ve-app").dataset.palette = String(state.paletteOpen);
    e.currentTarget.setAttribute("aria-pressed", String(state.paletteOpen));
    requestAnimationFrame(() => { decorateRenderedDOM(); renderOverlay(); });
  });
  $("ve-toggle-inspector").addEventListener("click", (e) => {
    state.inspectorOpen = !state.inspectorOpen;
    $("ve-app").dataset.inspector = String(state.inspectorOpen);
    e.currentTarget.setAttribute("aria-pressed", String(state.inspectorOpen));
    requestAnimationFrame(() => { decorateRenderedDOM(); renderOverlay(); });
  });
  $("ve-undo").addEventListener("click", undo);
  $("ve-redo").addEventListener("click", redo);
  $("ve-source").addEventListener("click", () => {
    updateSourceDrawer();
    $("ve-source-backdrop").hidden = false;
  });
  $("ve-export-html").addEventListener("click", () => {
    downloadFile(buildStandaloneHtml(emitProgram(), state.theme, "Aktion app"),
      "aktion-" + Date.now() + ".html", "text/html;charset=utf-8");
  });

  // Device width selector
  document.querySelectorAll(".ve-canvas-tools button[data-device]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.device = btn.dataset.device;
      document.querySelectorAll(".ve-canvas-tools button[data-device]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.device === state.device));
      });
      saveState();
      scheduleRender();
    });
  });

  // Zoom in / out
  document.querySelectorAll(".ve-canvas-tools button[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = parseInt(btn.dataset.zoom, 10);
      const steps = [0.5, 0.75, 1, 1.25, 1.5];
      const cur = steps.indexOf(state.zoom);
      const next = Math.max(0, Math.min(steps.length - 1, (cur === -1 ? 2 : cur) + dir));
      state.zoom = steps[next];
      $("ve-zoom-display").textContent = Math.round(state.zoom * 100) + "%";
      saveState();
      scheduleRender();
    });
  });
}

function bindSourceDrawer() {
  const close = () => { $("ve-source-backdrop").hidden = true; };
  $("ve-source-close").addEventListener("click", close);
  $("ve-source-backdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });
  document.querySelectorAll(".ve-drawer-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.sourceTab;
      document.querySelectorAll(".ve-drawer-tab").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.sourceTab === tab));
      });
      document.querySelectorAll(".ve-drawer-panel").forEach((p) => {
        p.dataset.active = String(p.dataset.sourceTab === tab);
      });
    });
  });
  // Source editing: typing marks the textarea dirty so background
  // re-renders won't overwrite the user's pending edits. Cmd/Ctrl+Enter
  // applies, Esc reverts. Tab inserts two spaces so the user doesn't lose
  // focus when indenting code.
  const codeEdit = $("ve-code-edit");
  if (codeEdit) {
    codeEdit.addEventListener("input", () => {
      sourceEditState.dirty = codeEdit.value !== sourceEditState.lastEmitted;
      updateSourceHint();
    });
    codeEdit.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const start = codeEdit.selectionStart;
        const end = codeEdit.selectionEnd;
        codeEdit.value = codeEdit.value.slice(0, start) + "  " + codeEdit.value.slice(end);
        codeEdit.selectionStart = codeEdit.selectionEnd = start + 2;
        sourceEditState.dirty = true;
        updateSourceHint();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        applySourceEdits();
        return;
      }
      if (e.key === "Escape" && sourceEditState.dirty) {
        e.preventDefault();
        revertSourceEdits();
      }
    });
  }
  $("ve-code-copy").addEventListener("click", () => copyText(emitProgram()));
  $("ve-code-download").addEventListener("click", () => {
    downloadFile(emitProgram(), "aktion-" + Date.now() + ".aktion", "text/plain;charset=utf-8");
  });
  const applyBtn = $("ve-code-apply");
  if (applyBtn) applyBtn.addEventListener("click", applySourceEdits);
  const revertBtn = $("ve-code-revert");
  if (revertBtn) revertBtn.addEventListener("click", revertSourceEdits);
  $("ve-html-copy").addEventListener("click", () => copyText(buildStandaloneHtml(emitProgram(), state.theme, "Aktion app")));
  $("ve-html-download").addEventListener("click", () => {
    downloadFile(buildStandaloneHtml(emitProgram(), state.theme, "Aktion app"),
      "aktion-" + Date.now() + ".html", "text/html;charset=utf-8");
  });
}

/**
 * WYSIWYG canvas interactions:
 *   - Single click in the live preview selects the deepest visual node.
 *     Clicks bubble up via `composedPath()`; we walk it in order and pick
 *     the first element with `data-veid`.
 *   - Hover updates `state.hoveredId` and triggers an overlay-only repaint.
 *   - Double-click on a leaf text-bearing component opens an inline edit.
 *   - Click handlers run in capture phase + stopImmediatePropagation so the
 *     embedded Aktion runtime does not fire its own action handlers while
 *     the user is editing.
 */
function bindCanvasInteractions() {
  const preview = $("ve-preview");
  const overlay = $("ve-overlay");
  const stage = $("ve-stage");
  if (!preview || !overlay) return;

  const findHostId = (path) => {
    for (const node of path) {
      if (node && node.dataset && node.dataset.veid) return node.dataset.veid;
      if (node === preview) break;
    }
    return null;
  };

  const findHostInfo = (path) => {
    for (const node of path) {
      if (node && node.dataset && node.dataset.veid) {
        return { id: node.dataset.veid, entityId: node.dataset.veEntity || null };
      }
      if (node === preview) break;
    }
    return null;
  };

  /**
   * Make the entity that owns `nodeId` the active one. Used when the user
   * clicks (or drops onto) a component that lives in a different binding
   * than the one currently focused on the canvas. Keeps the existing
   * `state.tree`-scoped selection / inspector logic working unchanged.
   */
  const switchEntityIfNeeded = (entityId, nodeId) => {
    let targetEntId = entityId || null;
    if (!targetEntId && nodeId) {
      const owner = findOwnerEntity(nodeId);
      if (owner) targetEntId = owner.id;
    }
    if (!targetEntId) return false;
    if (targetEntId === state.activeEntityId) return false;
    syncActiveEntityFromTree();
    state.activeEntityId = targetEntId;
    syncActiveTreeFromEntity();
    return true;
  };

  preview.addEventListener("click", (e) => {
    if (state.mode === "preview") return; // pass clicks through to the live app
    const hit = findHostInfo(e.composedPath());
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!hit) {
      state.selectedId = null;
      scheduleRender();
      return;
    }
    switchEntityIfNeeded(hit.entityId, hit.id);
    state.selectedId = hit.id;
    saveState();
    scheduleRender();
  }, true);

  // Click outside the rendered preview (on the empty stage / dot grid area)
  // also deselects. We listen on the stage and only act when the click did
  // NOT pass through any interactive overlay element or the preview itself —
  // those have their own handlers.
  if (stage) {
    stage.addEventListener("click", (e) => {
      if (state.mode === "preview") return;
      const path = e.composedPath();
      if (path.includes(preview)) return; // handled by the preview listener
      // Ignore clicks on overlay UI (action bars, drop zones, slot fills).
      for (const node of path) {
        if (node === overlay) break;
        if (node && node.classList && (
          node.classList.contains("ve-action-bar") ||
          node.classList.contains("ve-slot-fill") ||
          node.classList.contains("ve-drop-zone")
        )) return;
      }
      if (state.selectedId) {
        state.selectedId = null;
        scheduleRender();
      }
    });
  }

  preview.addEventListener("dblclick", (e) => {
    if (state.mode === "preview") return;
    const hit = findHostInfo(e.composedPath());
    if (!hit) return;
    const node = findNode(hit.id);
    if (!node || node.kind !== "component") return;
    const target = e.composedPath()[0];
    e.preventDefault();
    e.stopImmediatePropagation();
    // Inline editing mutates the node's `raws` directly — make sure the
    // node lives in the active tree first so subsequent re-renders and
    // saves pick it up.
    switchEntityIfNeeded(hit.entityId, hit.id);
    state.selectedId = hit.id;
    startInlineEdit(node, target);
  }, true);

  preview.addEventListener("mousemove", (e) => {
    if (state.mode === "preview") return;
    const id = findHostId(e.composedPath());
    if (id !== state.hoveredId) {
      state.hoveredId = id;
      renderOverlay();
    }
  });
  preview.addEventListener("mouseleave", () => {
    state.hoveredId = null;
    renderOverlay();
  });

  // Reposition overlays on scroll / resize so outlines stay aligned.
  const reposition = debounce(() => {
    decorateRenderedDOM();
    renderOverlay();
  }, 16);
  window.addEventListener("resize", reposition);
  $("ve-stage").addEventListener("scroll", reposition);
}

/**
 * Inline text editing: when the user double-clicks a component whose
 * "primary text" prop has a string raw value, we replace the rendered
 * text with an absolutely positioned input bound to that prop. Pressing
 * Enter or blurring commits the change.
 */
function startInlineEdit(node, targetEl) {
  const entry = getEntry(node.name);
  if (!entry) return;
  // Pick the most likely text prop. Prefer `title`, then `label`, then any
  // plain string raw that already exists, then the positional string prop.
  const candidates = ["title", "label", "value", "subtitle", "text", "name"];
  const positional = getPositionalPropName(node.name);
  let propName = null;
  for (const c of candidates) {
    const param = entry.params.find((p) => p.name === c);
    if (param && (param.type === "string" || param.type === "any")) { propName = c; break; }
  }
  if (!propName && positional) {
    const param = entry.params.find((p) => p.name === positional);
    if (param && (param.type === "string" || param.type === "any")) propName = positional;
  }
  if (!propName) return;

  const overlay = $("ve-overlay");
  const targetRect = targetEl ? rectIn(targetEl, $("ve-stage-frame").getBoundingClientRect()) : state.rectsById.get(node.id).rect;
  const decoded = decodeRaw(node.raws[propName] || "", "string");
  const initial = decoded && decoded.kind === "string" ? decoded.value : "";
  const input = el("input", {
    class: "ve-edit-input",
    type: "text",
    value: initial,
    style: "top:" + (targetRect.top - 2) + "px;left:" + (targetRect.left - 4) + "px;width:"
      + Math.max(120, targetRect.width + 8) + "px;height:" + (targetRect.height + 4) + "px;",
  });
  const commitEdit = () => {
    commit();
    node.raws[propName] = quote(input.value);
    saveState();
    scheduleRender();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") { input.value = initial; input.blur(); }
  });
  input.addEventListener("blur", commitEdit);
  overlay.append(input);
  input.focus();
  input.select();
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
  // dragend always fires on the source — even when the drop was rejected or
  // happened outside any registered target. Use it to tear down drag state.
  document.addEventListener("dragend", () => endDrag());
  // A successful drop on a registered target already calls endDrag() via
  // attachDropTarget. This is the safety net for drops outside any zone.
  document.addEventListener("drop", () => {
    if (currentDragPayload) endDrag();
  });
}

/**
 * Stage-level fallback drop handler. Lets users drop a palette item
 * anywhere on the canvas and have it appended to the root's first
 * children slot — much friendlier than failing silently when the user
 * misses a precise drop zone.
 *
 * Specific drop zones (slot fills, between-sibling gaps) call
 * stopPropagation so they take precedence; this handler only runs when
 * the drop event bubbles all the way up to the stage.
 */
function bindStageDropFallback() {
  const stage = $("ve-stage");
  if (!stage) return;
  stage.addEventListener("dragenter", (e) => {
    if (currentDragPayload) e.preventDefault();
  });
  stage.addEventListener("dragover", (e) => {
    if (!currentDragPayload) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = currentDragPayload.kind === "move" ? "move" : "copy";
  });
  stage.addEventListener("drop", (e) => {
    const payload = payloadFromEvent(e);
    if (!payload) return;
    e.preventDefault();
    const root = state.tree;
    if (!root || root.kind !== "component") { endDrag(); return; }
    const entry = getEntry(root.name);
    if (!entry) { endDrag(); return; }
    const childrenParam = entry.params.find((p) => getSlotKind(p.type) === "children");
    if (!childrenParam) {
      showToast(root.name + " doesn't accept children — drop on a different container",
        { tone: "danger", icon: "circle-exclamation" });
      endDrag();
      return;
    }
    const arr = Array.isArray(root.slots[childrenParam.name]) ? root.slots[childrenParam.name] : [];
    if (!acceptsPayload(payload, childrenParam, root, arr.length)) { endDrag(); return; }
    commit();
    performDrop(payload, root.id, childrenParam.name, arr.length);
    endDrag();
  });
}

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (cmd && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
      const info = findContainer(state.selectedId);
      if (info && info.parent) {
        commit();
        deleteNode(state.selectedId);
        saveState();
        scheduleRender();
      }
    }
    if (cmd && e.key.toLowerCase() === "d" && state.selectedId) {
      e.preventDefault();
      commit();
      duplicateNode(state.selectedId);
      saveState();
      scheduleRender();
    }
    // Mode shortcuts: E for edit, P for preview, R for raw (unmodified)
    if (!cmd && !e.shiftKey && !e.altKey) {
      if (e.key === "e" || e.key === "E") { setMode("edit"); return; }
      if (e.key === "p" || e.key === "P") { setMode("preview"); return; }
      if (e.key === "r" || e.key === "R") { setMode("raw"); return; }
    }
    if (e.key === "Escape") {
      if (!$("ve-source-backdrop").hidden) { $("ve-source-backdrop").hidden = true; return; }
      if (!$("ve-import-backdrop").hidden) { $("ve-import-backdrop").hidden = true; return; }
      if (!$("ve-example-backdrop").hidden) { $("ve-example-backdrop").hidden = true; return; }
      if (state.selectedId) { state.selectedId = null; scheduleRender(); }
    }
  });
}

/**
 * Switch between edit, preview, and raw modes. All three share the
 * palette, inspector, and toolbar — only the centre canvas changes:
 *   - "edit"   → WYSIWYG stage with full editing chrome (overlay).
 *   - "preview"→ WYSIWYG stage with the overlay hidden.
 *   - "raw"   → tree-of-cards canvas (the previous editor's view).
 */
function setMode(mode) {
  const allowed = mode === "preview" || mode === "raw" ? mode : "edit";
  if (state.mode === allowed) return;
  state.mode = allowed;

  if (allowed === "preview") {
    state.selectedId = null;
    state.hoveredId = null;
  } else if (allowed === "raw") {
    // Clear hover; selection survives across edit/raw so users can keep
    // editing the same node in either view.
    state.hoveredId = null;
  }

  document.querySelectorAll(".ve-mode-btn").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === allowed));
  });

  const app = $("ve-app");
  if (app) app.dataset.mode = allowed;

  saveState();
  scheduleRender();
}

function bindModeToggle() {
  document.querySelectorAll(".ve-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
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

function bindPaletteTabs() {
  for (const btn of document.querySelectorAll(".ve-palette-tab")) {
    btn.addEventListener("click", () => setPaletteTab(btn.dataset.paletteTab));
  }
  const addBtn = $("ve-outline-add");
  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCreateEntityMenu(addBtn);
    });
  }
}

function openCreateEntityMenu(anchor) {
  closeCreateEntityMenu();
  const menu = el("div", { class: "ve-add-menu", id: "ve-add-menu" });
  const items = [
    { kind: "component-decl", label: "Component", icon: "fa-cube" },
    { kind: "action-decl",    label: "Action",    icon: "fa-play" },
    { kind: "effect-decl",    label: "Effect",    icon: "fa-wave-square" },
    { kind: "state",          label: "State",     icon: "fa-bolt" },
  ];
  for (const item of items) {
    menu.append(el("button", {
      type: "button",
      onClick: () => {
        closeCreateEntityMenu();
        createEntity(item.kind);
      },
    }, [
      el("i", { class: "fa-solid " + item.icon, "aria-hidden": "true" }),
      el("span", null, "New " + item.label),
    ]));
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = rect.bottom + 6 + "px";
  menu.style.left = Math.max(8, rect.right - 200) + "px";
  setTimeout(() => {
    document.addEventListener("click", closeCreateEntityMenu, { once: true });
  }, 0);
}

function closeCreateEntityMenu() {
  const m = $("ve-add-menu");
  if (m) m.remove();
}

/**
 * Popover menu listing every entity in the current program. Clicking
 * one swaps it in as the active entity without having to leave the
 * canvas. `aktion` always floats to the top with a "home" icon so the
 * user can find their entry point at a glance, no matter how many
 * bindings the program has.
 */
function openEntitySwitcher(anchor) {
  closeCreateEntityMenu();
  const menu = el("div", { class: "ve-add-menu", id: "ve-add-menu", style: "max-height: 320px; min-width: 220px; overflow: auto;" });
  const visible = (state.entities || []).filter((e) => e.kind !== "free");
  // Sort: `aktion` first, then alphabetically by name within kind so the
  // long-tail bindings stay scannable.
  const sorted = visible.slice().sort((a, b) => {
    if (a.name === ROOT_ENTITY_NAME) return -1;
    if (b.name === ROOT_ENTITY_NAME) return 1;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return String(a.name).localeCompare(String(b.name));
  });
  for (const ent of sorted) {
    const isActive = ent.id === state.activeEntityId;
    const isRoot = ent.name === ROOT_ENTITY_NAME && ent.kind === "assignment";
    menu.append(el("button", {
      type: "button",
      style: isActive ? "background: var(--doc-bg-soft); color: var(--doc-primary);" : "",
      onClick: () => {
        closeCreateEntityMenu();
        focusEntity(ent.id);
      },
    }, [
      el("i", { class: "fa-solid " + (isRoot ? "fa-house" : entityIcon(ent)), "aria-hidden": "true" }),
      el("span", null, ent.name),
      el("span", { style: "margin-left: auto; font-size: 11px; color: var(--doc-text-muted); font-family: var(--doc-mono);" }, ent.kind),
    ]));
  }
  if (sorted.length === 0) {
    menu.append(el("div", {
      style: "padding: 12px; color: var(--doc-text-muted); font-size: 12px; text-align: center;",
    }, "No bindings yet"));
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = rect.bottom + 6 + "px";
  menu.style.left = rect.left + "px";
  setTimeout(() => {
    document.addEventListener("click", closeCreateEntityMenu, { once: true });
  }, 0);
}

async function bootstrap() {
  // Wait for the custom element to register, otherwise the preview's
  // `setResponse(...)` call goes to a generic HTMLElement.
  if (typeof customElements !== "undefined") {
    try { await customElements.whenDefined("aktion-app"); } catch (_) {}
  }
  if (!loadState()) {
    const def = defaultEntities();
    state.entities = def.entities;
    state.activeEntityId = def.entities[0].id;
    state.tree = def.tree;
  }
  $("ve-theme").value = state.theme;
  $("ve-zoom-display").textContent = Math.round((state.zoom || 1) * 100) + "%";
  document.querySelectorAll(".ve-canvas-tools button[data-device]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.device === (state.device || "desktop")));
  });
  document.querySelectorAll(".ve-mode-btn").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === (state.mode || "edit")));
  });

  const app = $("ve-app");
  if (app) app.dataset.mode = state.mode || "edit";

  bindToolbar();
  bindModeToggle();
  bindSourceDrawer();
  bindImportModal();
  bindExamplesModal();
  bindGlobalDragEnd();
  bindStageDropFallback();
  bindKeyboard();
  bindPaletteSearch();
  bindPaletteTabs();
  bindCanvasInteractions();

  applyPaletteTab();
  renderPalette();
  scheduleRender();
  updateUndoRedoButtons();
}

bootstrap().catch((err) => {
  const stage = $("ve-stage");
  if (stage) {
    stage.innerHTML = '<div class="ve-stage-empty"><i class="fa-solid fa-circle-exclamation"></i><h3>Couldn\'t load the editor</h3><p>' + escapeHtml(err.message || String(err)) + "</p></div>";
  }
});
