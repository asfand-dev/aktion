/**
 * docs/showcase.aktion is the page every pull request screenshots
 * (.github/workflows/_screenshots.yml), so a gap in it is a gap in review: a
 * component missing from the page is a component whose visual changes nobody
 * sees. These checks keep it complete as the library grows — adding a
 * component without a specimen fails here, not silently in a screenshot.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import "../src/index.js";
import { parse, walk } from "../src/parser/index.js";
import type { Expression } from "../src/parser/index.js";
import { defaultLibrary } from "../src/library/index.js";
import { getDiagnostics } from "../src/tooling/language-service.js";

const SOURCE = readFileSync("docs/showcase.aktion", "utf-8");
const program = parse(SOURCE);

const flush = (): Promise<void> => new Promise<void>((r) => queueMicrotask(() => r()));
const settle = async (n = 12): Promise<void> => { for (let i = 0; i < n; i += 1) await flush(); };
afterEach(() => { document.body.innerHTML = ""; });

// The page embeds an OpenStreetMap iframe; a connected one makes happy-dom
// fetch it for real. Keep the network out of the test run.
const settings = (window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }).happyDOM.settings;
const iframeLoading = settings.disableIframePageLoading;
beforeAll(() => { settings.disableIframePageLoading = true; });
afterAll(() => { settings.disableIframePageLoading = iframeLoading; });

/** The literal `groups = [{ name, count, … }]` table the page's headers are built from. */
function declaredGroups(): Array<{ name: unknown; count: unknown }> {
  const statement = program.statements.find((s) => s.kind === "Assignment" && s.identifier === "groups");
  if (!statement || statement.kind !== "Assignment" || statement.expression.kind !== "Array") return [];
  const literal = (expr: Expression | undefined): unknown => (expr?.kind === "Literal" ? expr.value : undefined);
  return statement.expression.elements.map((element) => {
    const props = element.kind === "Object" ? element.properties : [];
    const field = (key: string) => literal(props.find((p) => p.key === key)?.value);
    return { name: field("name"), count: field("count") };
  });
}

describe("docs/showcase.aktion", () => {
  it("has no diagnostics, warnings included", () => {
    // A warning here is usually an unknown component, which renders as nothing.
    const diagnostics = getDiagnostics(SOURCE, defaultLibrary).map((d) => `L${d.line} ${d.severity}: ${d.message}`);
    expect(diagnostics).toEqual([]);
  });

  it("calls every registered component", () => {
    const called = new Set<string>();
    walk(program, ({ node }) => {
      if (node.kind === "Call") called.add(node.callee);
    });
    const missing = defaultLibrary.components.map((c) => c.name).filter((name) => !called.has(name));
    expect(missing, `add a specimen to docs/showcase.aktion for: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists every group, in catalogue order, with its real component count", () => {
    const expected = (defaultLibrary.componentGroups ?? []).map((g) => ({ name: g.name, count: g.components?.length ?? 0 }));
    expect(expected.length).toBeGreaterThan(10);
    expect(declaredGroups()).toEqual(expected);
  });

  it("renders without errors and tells the host page it is ready", async () => {
    const el = document.createElement("aktion-app") as HTMLElement & { setResponse(t: string): void };
    const ready: unknown[] = [];
    el.addEventListener("showcase:ready", (event) => ready.push((event as CustomEvent).detail));
    document.body.appendChild(el);
    el.setResponse(SOURCE);
    await settle();

    const sr = el.shadowRoot!;
    const errors = [...sr.querySelectorAll(".rui-render-error, .rui-unknown-component")].map((e) => e.textContent);
    expect(errors).toEqual([]);
    // One band per group, each reachable from the hero index by its id.
    for (const id of ["layout", "forms", "charts", "patterns", "escape-hatches"]) {
      expect(sr.getElementById(id), `section #${id}`).toBeTruthy();
    }
    expect(sr.textContent).toContain(`All ${defaultLibrary.components.length} built-in components`);
    // The footer's OnMount is the readiness signal docs/showcase.html waits for.
    expect(ready).toEqual([{ components: defaultLibrary.components.length }]);
  });

  it("only opens and pre-validates things in capture mode", async () => {
    // Without ?capture=1 nothing may open, focus or scroll on load: a populated
    // ValidationSummary would pull the page down to the forms section.
    const el = document.createElement("aktion-app") as HTMLElement & { setResponse(t: string): void };
    document.body.appendChild(el);
    el.setResponse(SOURCE);
    await settle();
    const summary = el.shadowRoot!.querySelector(".rui-validation-summary");
    expect(summary?.getAttribute("data-empty")).toBe("true");
  });
});
