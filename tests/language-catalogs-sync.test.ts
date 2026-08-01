/**
 * The editor-facing catalogs must stay in sync with the runtime data they
 * project. Each one exists because a downstream artifact (the docs playground,
 * the VS Code extension, the LSP server, the agent skill) is forbidden from
 * hand-listing the same data — but a projection can itself fall behind its
 * source, which is a subtler version of the same bug.
 */

import { describe, expect, it } from "vitest";
import { universalPropCatalog } from "../src/language/components.js";
import { UNIVERSAL_PROP_NAMES } from "../src/library/sx.js";
import { builtinCatalog } from "../src/language/builtins.js";
import { namespaceCatalog } from "../src/language/namespaces.js";
import { defaultLibrary } from "../src/library/index.js";

describe("universalPropCatalog mirrors UNIVERSAL_PROP_NAMES", () => {
  it("lists exactly the props the validator accepts on every component", () => {
    // The playground appends this catalog to every component's params so `sx:`
    // and `animate:` complete. If it drifts, the editor either offers a prop the
    // validator rejects or hides one it accepts.
    expect([...universalPropCatalog].map((p) => p.name).sort())
      .toEqual([...UNIVERSAL_PROP_NAMES].sort());
  });

  it("describes every entry, so hover has something to show", () => {
    for (const prop of universalPropCatalog) {
      expect(prop.name, "name").toBeTruthy();
      expect(prop.type, `${prop.name}.type`).toBeTruthy();
      expect(prop.description, `${prop.name}.description`).toBeTruthy();
    }
  });

  it("shadows only the universal props already known to be shadowed", () => {
    /**
     * When a component declares a prop whose name is also a universal prop, the
     * component's prop wins and the universal channel is unreachable there. The
     * library already handles the case that mattered most — `data` — by giving the
     * universal channel a second spelling, `dataAttrs`.
     *
     * Asserting on the set of shadowed NAMES rather than on component.prop pairs
     * is deliberate: `id` and `style` are shadowed by dozens of components (every
     * form control declares `id`), so a pair-level allowlist would be 35 entries
     * of pure maintenance. The invariant that actually matters is that no NEW
     * universal prop starts being shadowed — that is what silently removes a
     * capability authors were told they had.
     *
     *   id      — form controls and `Section` declare it, with the same meaning
     *             (the element's DOM id), so nothing is lost.
     *   style   — `Text` / `TextContent` declare a typographic `style`, which is
     *             NOT the universal inline-CSS `style`; use `sx` on those two.
     *             `Css.style` IS the inline-CSS one, by design.
     *   anchor  — `OverlayItem.anchor` positions the overlay; the universal
     *             `anchor` (a scroll-target id) is unreachable on it.
     *   role    — six components declare it, and the split matters. On `OnClick`
     *             and `MenuItem` it means the SAME thing (the ARIA role), so
     *             nothing is lost — `MenuItem`'s is even enum-constrained. On
     *             `PersonChip`, `Testimonial`, `ProfileCard` and `AuthorByline`
     *             it is the person's job title, so on those four the universal
     *             `role` ARIA escape valve added in 0.6.0 is genuinely
     *             unreachable; wrap them in `Css` / `HTMLTag` if a role must be
     *             set. Worth revisiting if ARIA corrections are ever needed
     *             there — the fix would be a `dataAttrs`-style second spelling.
     *   data    — handled by the `dataAttrs` alias on the six components
     *             (`LineChart`, `JsonTree`, `Async`, `Draggable`, `Lottie`,
     *             `QRCode`) that declare their own `data`.
     *   class   — only `Css`, the wrapper whose entire purpose is to set `class`
     *             and `style` on its child. Intentional, not a collision.
     */
    const EXPECTED_SHADOWED = ["anchor", "class", "data", "id", "role", "style"];

    const universal = new Set(universalPropCatalog.map((p) => p.name));
    const shadowed = new Set<string>();
    for (const spec of defaultLibrary.components) {
      for (const prop of spec.props) {
        if (universal.has(prop.name)) shadowed.add(prop.name);
      }
    }

    expect(
      [...shadowed].sort(),
      "a universal prop is newly shadowed by a component's own prop — either rename " +
        "the component prop or give the universal channel a second spelling, as " +
        "`dataAttrs` does for `data`",
    ).toEqual(EXPECTED_SHADOWED);
  });

  it("the documented shadowings still exist (so the allowance cannot go stale)", () => {
    // If one of these is renamed, the comment above becomes misleading — better to
    // fail here and force it to be re-read than to leave a stale explanation.
    for (const entry of [
      "Section.id", "OverlayItem.anchor", "AuthorByline.role", "PersonChip.role",
      "OnClick.role", "MenuItem.role", "Text.style", "Css.class",
    ]) {
      const [component, prop] = entry.split(".");
      const spec = defaultLibrary.components.find((c) => c.name === component);
      expect(spec, component).toBeDefined();
      expect(spec!.props.some((p) => p.name === prop), entry).toBe(true);
    }
  });
});

describe("catalog invariants", () => {
  it("every builtin has a sigil, category and signature", () => {
    for (const b of builtinCatalog) {
      expect(b.sigil, b.name).toBe(`$${b.name}`);
      expect(b.category, b.name).toBeTruthy();
      expect(b.signature, b.name).toContain(b.sigil);
    }
  });

  it("every namespace member has a signature that starts with its own name", () => {
    for (const ns of namespaceCatalog) {
      for (const m of ns.members) {
        expect(m.signature, `$${ns.name}.${m.name}`).toMatch(new RegExp(`^${m.name}\\b`));
      }
    }
  });
});
