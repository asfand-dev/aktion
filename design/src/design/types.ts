/**
 * The design document model — the single source of truth persisted as JSON on
 * `Project.document`. Everything in the editor (canvas, layers, inspector,
 * code generation, export) operates on this tree.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Raw Aktion expression escape hatch. A prop whose value is `{ $expr: "..." }`
 * is emitted verbatim by the code generator — this is how designs bind props
 * to reactive state, handlers, or any Aktion expression
 * (e.g. `{ $expr: "() => $toast.success('Saved')" }`).
 */
export interface ExprValue {
  $expr: string;
}

export type PropValue = JsonValue | ExprValue;

export function isExprValue(v: PropValue | undefined): v is ExprValue {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as ExprValue).$expr === "string"
  );
}

/**
 * Figma-style free placement within the owning frame. Only honored on direct
 * children of a frame; moving a node into a layout container clears it.
 * Coordinates are frame-local CSS pixels.
 */
export interface NodeLayout {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** A node in a frame: an Aktion component instance or a symbol instance. */
export interface DesignNode {
  id: string;
  type: "component" | "instance";
  /** User-facing label shown in the layers panel. */
  name: string;
  /** Aktion component name (`type === "component"`), e.g. "Button". */
  component?: string;
  /** Referenced symbol (`type === "instance"`). */
  symbolId?: string;
  /** Literal props; `sx` lives here too. Children are NOT stored in props. */
  props: Record<string, PropValue>;
  /** Child nodes, rendered into the component's node-typed slot. */
  children: DesignNode[];
  /** Absolute placement (free position); undefined = in flow. */
  layout?: NodeLayout;
  visible: boolean;
  locked: boolean;
}

/** A top-level artboard on the canvas, positioned in world coordinates. */
export interface Frame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS background color of the artboard. */
  background: string;
  children: DesignNode[];
}

export interface PageDef {
  id: string;
  name: string;
  frames: Frame[];
}

/** A reusable master component ("symbol"); instances reference it by id. */
export interface SymbolDef {
  id: string;
  name: string;
  root: DesignNode;
}

export interface DesignDocument {
  version: 1;
  /** Aktion base theme name (light, dark, glass, ...). */
  theme: string;
  /**
   * Custom brand overrides in Aktion's grouped `$theme({...})` shape
   * (colors/radius/spacing/font/shadows/gradients/fonts + optional `name`
   * base). When set, every generated program starts with a `$theme` statement
   * so the canvas, preview, exports, and AI all share the brand.
   */
  themeTokens?: { [key: string]: JsonValue };
  pages: PageDef[];
  symbols: SymbolDef[];
}

/** Location of a node inside a document. */
export interface NodeLocation {
  node: DesignNode;
  /** Parent node, or null when the node sits directly in a frame. */
  parent: DesignNode | null;
  frame: Frame;
  page: PageDef;
  /** Index within the parent's (or frame's) children array. */
  index: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** Shape of the project payload exchanged with the API. */
export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; email: string };
  role: "owner" | "editor" | "viewer";
  shareCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  document: DesignDocument;
}

export interface ShareInfo {
  id: string;
  canEdit: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface AssetInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
