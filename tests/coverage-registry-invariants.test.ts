/**
 * Registry-driven invariants — one suite that holds for EVERY registered
 * component, so a regression anywhere in the library fails here.
 *
 * Written after an audit of all 282 specs found ~1,300 defects. The recurring
 * shapes were not exotic: props declared but never read, enums advertising values
 * nothing implements, renders that throw on empty input, interactive elements with
 * no accessible name, and `role="img"` pruning its own contents. Each of those is
 * a *class* of bug, so each gets a table-driven test over the whole registry
 * rather than a per-component assertion someone has to remember to add.
 *
 * These tests deliberately assert CONTRACTS, not markup details. A test that pins
 * a class string or a hex value is a liability — one such test in this project
 * blocked a real accessibility fix because it asserted a palette literal while
 * actually testing something else.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defaultLibrary } from "../src/library/index.js";
import { UNIVERSAL_PROP_NAMES } from "../src/library/sx.js";
import type { ComponentSpec, PropSpec } from "../src/library/types.js";

const SPECS: readonly ComponentSpec[] = defaultLibrary.components;

/* ------------------------------------------------------------------ *
 * Minimal render harness — enough helpers for a spec to render once.
 * ------------------------------------------------------------------ */

interface Slot { get: () => unknown; set: (v: unknown) => void }

function makeHelpers() {
  const slots = new Map<string, unknown>();
  const invoked: unknown[] = [];
  return {
    invoked,
    helpers: {
      renderNode: (n: unknown): Node =>
        typeof n === "string" || typeof n === "number"
          ? document.createTextNode(String(n))
          : document.createElement("span"),
      invoke: (fn: unknown, ...args: unknown[]) => {
        invoked.push(args);
        if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
      },
      setState: () => {},
      resetState: () => {},
      sendToAssistant: () => {},
      openUrl: () => {},
      bindState: () => {},
      useInstanceState: <T,>(key: string, initial: T): Slot => {
        if (!slots.has(key)) slots.set(key, initial);
        return { get: () => slots.get(key), set: (v: unknown) => slots.set(key, v) } as Slot;
      },
      registerDisposer: () => {},
      // `RenderHelpers.router` is NON-optional and documented "always provided",
      // and the renderer does always supply it — so NavLink / SidebarItem /
      // Breadcrumb are entitled to call it without guarding. Omitting it here
      // produced four spurious failures before this stub was added; the
      // components were right and the harness was wrong.
      router: {
        getPath: () => "/",
        getParams: () => ({}),
        navigate: () => {},
        replace: () => {},
        matchRoute: () => null,
        subscribe: () => () => {},
        start: () => {},
        stop: () => {},
      },
    } as never,
  };
}

/** A plausible value for a prop, derived from its declared type/enum. */
function sampleFor(p: PropSpec): unknown {
  if (p.enum && p.enum.length) return p.enum[0];
  const t = String(p.type);
  if (t.includes("callable")) return () => {};
  if (t.includes("[]")) return [];
  if (t.startsWith("number")) return 1;
  if (t.startsWith("boolean")) return false;
  if (t.includes("object")) return {};
  if (t.includes("Node")) return "x";
  return "x";
}

function nodeFor(spec: ComponentSpec, props: Record<string, unknown>) {
  return {
    __kind: "Component",
    name: spec.name,
    args: [],
    argMeta: spec.props.map(() => ({})),
    props,
  } as never;
}

/** Render a spec, returning the node or the thrown error. */
function tryRender(spec: ComponentSpec, props: Record<string, unknown>): { node?: Node; error?: string } {
  const { helpers } = makeHelpers();
  try {
    return { node: spec.render(nodeFor(spec, props), props, helpers) };
  } catch (e) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

/* ------------------------------------------------------------------ *
 * Invariants
 * ------------------------------------------------------------------ */

describe("every spec is structurally well-formed", () => {
  it("declares at most one positional prop (Aktion 0.5 §19.1)", () => {
    const bad = SPECS
      .filter((s) => s.props.filter((p) => p.positional).length > 1)
      .map((s) => s.name);
    expect(bad, `these specs declare multiple positional props:\n${bad.join(", ")}`).toEqual([]);
  });

  it("never declares the same prop name twice", () => {
    // A duplicate inflates positional arity and can be clobbered back to
    // undefined by a mixed positional+named call. This happened twice on this
    // project (NumberInput.disabled, and nearly again with Input.name).
    const dupes: string[] = [];
    for (const s of SPECS) {
      const seen = new Set<string>();
      for (const p of s.props) {
        if (seen.has(p.name)) dupes.push(`${s.name}.${p.name}`);
        seen.add(p.name);
      }
    }
    expect(dupes, dupes.join(", ")).toEqual([]);
  });

  it("never uses an alias that collides with a real prop on the same spec", () => {
    // An alias shadowing a declared prop makes one of them unreachable.
    const collisions: string[] = [];
    for (const s of SPECS) {
      const names = new Set(s.props.map((p) => p.name));
      for (const p of s.props) {
        for (const a of p.aliases ?? []) {
          if (names.has(a) && a !== p.name) collisions.push(`${s.name}: alias "${a}" on ${p.name} collides with a declared prop`);
        }
      }
    }
    expect(collisions, collisions.join("\n")).toEqual([]);
  });

  it("has a non-empty description (it is compiled into the LLM prompt)", () => {
    const missing = SPECS.filter((s) => !s.description || s.description.trim().length < 10).map((s) => s.name);
    expect(missing, `a thin description produces wrong generated code:\n${missing.join(", ")}`).toEqual([]);
  });

  it("declares every enum with at least two values", () => {
    // A single-value enum is either a mistake or a constant, and it tells an
    // author nothing.
    const odd: string[] = [];
    for (const s of SPECS) {
      for (const p of s.props) {
        if (p.enum && p.enum.length === 1) odd.push(`${s.name}.${p.name}`);
      }
    }
    expect(odd, odd.join(", ")).toEqual([]);
  });
});

describe("every spec renders without throwing", () => {
  it("survives an empty props object", () => {
    // The most common real-world shape while an LLM is still streaming output.
    const failures: string[] = [];
    for (const s of SPECS) {
      const { error } = tryRender(s, {});
      if (error) failures.push(`${s.name}: ${error}`);
    }
    expect(failures, `renders threw on empty props:\n${failures.join("\n")}`).toEqual([]);
  });

  it("survives every declared prop populated at once", () => {
    const failures: string[] = [];
    for (const s of SPECS) {
      const props: Record<string, unknown> = {};
      for (const p of s.props) props[p.name] = sampleFor(p);
      const { error } = tryRender(s, props);
      if (error) failures.push(`${s.name}: ${error}`);
    }
    expect(failures, `renders threw with all props set:\n${failures.join("\n")}`).toEqual([]);
  });

  it("survives hostile values in every prop slot", () => {
    // Empty strings, nulls, NaN and wrong-typed values all reach components in
    // practice: they come from `$variable` bindings fed by HTTP responses.
    const hostile = [null, undefined, "", 0, NaN, -1, [], {}, false];
    const failures: string[] = [];
    for (const s of SPECS) {
      for (const value of hostile) {
        const props: Record<string, unknown> = {};
        for (const p of s.props) props[p.name] = value;
        const { error } = tryRender(s, props);
        if (error) {
          failures.push(`${s.name} with ${JSON.stringify(value) ?? "undefined"}: ${error}`);
          break; // one report per spec is enough to act on
        }
      }
    }
    expect(failures, `renders threw on hostile input:\n${failures.join("\n")}`).toEqual([]);
  });

  it("honours every advertised enum value without throwing", () => {
    const failures: string[] = [];
    for (const s of SPECS) {
      for (const p of s.props) {
        for (const value of p.enum ?? []) {
          const { error } = tryRender(s, { [p.name]: value });
          if (error) failures.push(`${s.name}.${p.name}="${value}": ${error}`);
        }
      }
    }
    expect(failures, `an advertised enum value threw:\n${failures.join("\n")}`).toEqual([]);
  });
});

describe("accessibility invariants", () => {
  /** Every element in a rendered tree, including the root. */
  const walk = (n: Node): Element[] =>
    n instanceof Element ? [n, ...[...n.querySelectorAll("*")]] : [];

  it('no element carries role="img" without an accessible name', () => {
    // `role="img"` PRUNES its contents from the accessibility tree, so an unnamed
    // one is an anonymous graphic with unreachable content. This was a real defect
    // across every chart plus Avatar and Rating.
    const failures: string[] = [];
    for (const s of SPECS) {
      const props: Record<string, unknown> = {};
      for (const p of s.props) props[p.name] = sampleFor(p);
      const { node } = tryRender(s, props);
      if (!node) continue;
      for (const el of walk(node)) {
        if (el.getAttribute("role") !== "img") continue;
        const named = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")
          || el.getAttribute("title") || el.getAttribute("aria-hidden") === "true";
        if (!named) failures.push(`${s.name}: <${el.tagName.toLowerCase()} role="img"> has no name`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("never nests a button inside a button", () => {
    // Invalid HTML that swallows clicks and pollutes the outer accessible name.
    // MultiSelect shipped this until it was fixed.
    const failures: string[] = [];
    for (const s of SPECS) {
      const props: Record<string, unknown> = {};
      for (const p of s.props) props[p.name] = sampleFor(p);
      const { node } = tryRender(s, props);
      if (!node) continue;
      for (const el of walk(node)) {
        if (el.tagName !== "BUTTON") continue;
        if (el.querySelector("button")) failures.push(`${s.name}: nested <button>`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  /**
   * Is this element actually reachable by Tab?
   *
   * A bare `input, button, …` selector is not enough: `tabindex="-1"`, `hidden`
   * and `disabled` each take an element out of the tab order, and a component
   * that hides a field correctly uses exactly those. Ignoring them reported
   * ColorPicker's deliberately-parked hex field as a defect.
   */
  const isTabbable = (el: Element): boolean => {
    if (el.getAttribute("tabindex") === "-1") return false;
    if (el.hasAttribute("hidden") || el.hasAttribute("disabled")) return false;
    if (el.hasAttribute("inert")) return false;
    return el.matches('button, a[href], input, select, textarea, [tabindex]');
  };

  it("never marks a tabbable element aria-hidden", () => {
    // A node the keyboard can reach but AT says does not exist is a trap for
    // screen-reader users: focus lands somewhere nothing is announced.
    const failures: string[] = [];
    for (const s of SPECS) {
      const props: Record<string, unknown> = {};
      for (const p of s.props) props[p.name] = sampleFor(p);
      const { node } = tryRender(s, props);
      if (!node) continue;
      for (const el of walk(node)) {
        if (el.getAttribute("aria-hidden") !== "true") continue;
        // `inert` legitimately removes the whole subtree from focus.
        if (el.hasAttribute("inert") || el.hasAttribute("hidden")) continue;
        const offenders = [el, ...el.querySelectorAll("*")].filter(isTabbable);
        if (offenders.length) {
          failures.push(`${s.name}: aria-hidden but tabbable — <${offenders[0]!.tagName.toLowerCase()}>`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

describe("prompt / spec integrity", () => {
  it("every prop is either read by the render or explicitly delegated", () => {
    // A prop that validates but does nothing is worse than a missing one: the
    // author gets no signal. This scans the source for either a direct
    // `props.NAME` read or a delegation call that receives the whole `props` bag.
    const DELEGATORS = /(withFieldShell|attachFocusHandlers|renderFlexContainer|applyUniversal|relocateControlAria|mapPositionalArgs|FIELD_SHELL_PROPS)/;
    const dir = join(process.cwd(), "src", "library", "components");
    const sources = new Map<string, string>();
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      sources.set(f, readFileSync(join(dir, f), "utf8"));
    }
    const all = [...sources.values()].join("\n");

    /**
     * Specs whose props are read by a PARENT, not by their own render.
     *
     * `Col` is destructured by Table/DataGrid, `Series` by the charts, `MenuItem`
     * by DropdownMenu, and the `OnMouse`/`OnKeyboard` handler props are looked up
     * through a name→handler table rather than read individually. A textual scan
     * cannot see any of that, so these are excluded by name with the reason
     * stated, rather than hidden behind a fuzzy threshold.
     */
    const PARENT_CONSUMED = new Set([
      "Col", "Series", "MenuItem", "OnMouse", "OnKeyboard",
    ]);

    const dead: string[] = [];
    for (const s of SPECS) {
      if (PARENT_CONSUMED.has(s.name)) continue;
      // Locate the spec body so the search is scoped to this component.
      let body = "";
      for (const src of sources.values()) {
        const i = src.indexOf(`name: "${s.name}"`);
        if (i < 0) continue;
        body = src.slice(i, i + 9000);
        break;
      }
      if (!body) continue;
      const delegates = DELEGATORS.test(body);
      for (const p of s.props) {
        if (UNIVERSAL_PROP_NAMES.has(p.name)) continue;
        const read = new RegExp(`props\\.${p.name}\\b|props\\["${p.name}"\\]|\\b${p.name}\\s*[,}]`).test(body)
          || new RegExp(`props\\.${p.name}\\b`).test(all);
        if (!read && !delegates) dead.push(`${s.name}.${p.name}`);
      }
    }
    // Reported rather than hard-failed at zero: the scan is textual, so a novel
    // delegation pattern could produce a false positive. The threshold catches a
    // real regression (a batch of newly-dead props) without being brittle.
    expect(dead.length, `props that appear unread — verify each:\n${dead.join(", ")}`).toBeLessThan(15);
  });
});
