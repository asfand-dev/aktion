/**
 * Compact project summary given to the AI so generated frames feel like part
 * of one product: theme brand, page/frame inventory with structural
 * outlines, and the navigation vocabulary already in use.
 */
import type { DesignDocument, DesignNode, Frame } from "./types";
import { isExprValue } from "./types";

const MAX_CONTEXT_CHARS = 6000;

export function buildProjectContext(
  doc: DesignDocument,
  activePageId: string,
  excludeFrameId?: string,
): string {
  const lines: string[] = [];

  // Theme
  if (doc.themeTokens && Object.keys(doc.themeTokens).length > 0) {
    lines.push(
      `Theme: base "${doc.theme}" with brand overrides ${compactJson(doc.themeTokens, 600)}`,
    );
  } else {
    lines.push(`Theme: built-in "${doc.theme}" (no overrides)`);
  }

  // Pages & frames with outlines
  for (const page of doc.pages) {
    const active = page.id === activePageId ? " (current page)" : "";
    lines.push(`Page "${page.name}"${active}:`);
    if (page.frames.length === 0) {
      lines.push("  (no frames yet)");
      continue;
    }
    for (const frame of page.frames) {
      const marker = frame.id === excludeFrameId ? " ← frame being edited" : "";
      lines.push(
        `  Frame "${frame.name}" (${Math.round(frame.width)}×${Math.round(frame.height)})${marker}: ${outline(frame)}`,
      );
    }
  }

  // Navigation vocabulary
  const nav = collectNavigation(doc);
  if (nav.length > 0) {
    lines.push(`Navigation used across the project: ${nav.join(", ")}`);
  }

  const text = lines.join("\n");
  return text.length > MAX_CONTEXT_CHARS
    ? `${text.slice(0, MAX_CONTEXT_CHARS)}…`
    : text;
}

/** One-line structural outline: top-level components with child summaries. */
function outline(frame: Frame): string {
  if (frame.children.length === 0) return "(empty)";
  const parts = frame.children.slice(0, 10).map((n) => describeNode(n, 1));
  const extra = frame.children.length > 10 ? `, +${frame.children.length - 10} more` : "";
  return parts.join(", ") + extra;
}

function describeNode(node: DesignNode, depth: number): string {
  const name = node.component ?? node.name;
  const hint = textHint(node);
  const label = hint ? `${name}("${hint}")` : name;
  if (node.children.length === 0 || depth >= 2) {
    return node.children.length > 0 ? `${label}[${node.children.length}]` : label;
  }
  const inner = node.children.slice(0, 4).map((c) => describeNode(c, depth + 1));
  const extra = node.children.length > 4 ? ", …" : "";
  return `${label}[${inner.join(", ")}${extra}]`;
}

/** A short human hint from the node's primary text prop. */
function textHint(node: DesignNode): string | null {
  for (const key of ["title", "label", "value", "content", "brand", "text"]) {
    const v = node.props[key];
    if (typeof v === "string" && v.trim()) {
      return v.length > 28 ? `${v.slice(0, 27)}…` : v;
    }
  }
  return null;
}

/** Unique nav labels/targets used in the project (Navbar items, links, ...). */
function collectNavigation(doc: DesignDocument): string[] {
  const found = new Set<string>();
  const visitValue = (value: unknown): void => {
    if (found.size >= 16 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visitValue);
      return;
    }
    if (typeof value === "object") {
      if (isExprValue(value as never)) return;
      const obj = value as Record<string, unknown>;
      const label = typeof obj.label === "string" ? obj.label : null;
      const target =
        typeof obj.to === "string" ? obj.to : typeof obj.href === "string" ? obj.href : null;
      if (label && target) found.add(`"${label}" → ${target}`);
      else if (label && "to" in obj) found.add(`"${label}"`);
      for (const v of Object.values(obj)) visitValue(v);
    }
  };
  const visitNode = (node: DesignNode): void => {
    for (const value of Object.values(node.props)) visitValue(value);
    node.children.forEach(visitNode);
  };
  for (const page of doc.pages) {
    for (const frame of page.frames) frame.children.forEach(visitNode);
  }
  return [...found].slice(0, 16);
}

function compactJson(value: unknown, max: number): string {
  const json = JSON.stringify(value);
  return json.length > max ? `${json.slice(0, max)}…` : json;
}
