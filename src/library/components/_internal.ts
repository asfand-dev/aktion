/**
 * Internal DOM helpers shared by primitives (`feedback.ts`) and pattern
 * composites (`patterns.ts`). Not exported from the package barrel — these
 * are implementation details that keep avatar/initials rendering consistent
 * across every component that needs them.
 */

import { el } from "../utils.js";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

/** Render an `<rui-avatar>` matching the canonical Avatar primitive. */
export function renderAvatar(src: string, name: string, size: AvatarSize): HTMLElement {
  const root = el("span", { class: "rui-avatar", "data-size": size, role: "img" });
  if (src) {
    const img = el("img", { src, alt: name, loading: "lazy" });
    img.addEventListener("error", () => {
      img.replaceWith(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
    });
    root.append(img);
  } else {
    root.append(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
  }
  return root;
}

/** Two-letter initials, falling back to `?` for empty input. */
export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || trimmed.charAt(0).toUpperCase();
}
