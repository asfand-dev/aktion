/**
 * Regression test for the `Map` component vs. the JS `Map` constructor.
 *
 * `Map` is both a library component (static OpenStreetMap embed) and a
 * curated JS global (the `Map` constructor). A call like
 * `Map(lat, { lng })` must build the COMPONENT — earlier the curated-global
 * call path won and invoked the constructor without `new`, throwing
 * "Constructor Map requires 'new'" and rendering nothing. `new Map()` must
 * keep resolving to the constructor.
 */
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  Router,
  type EvaluationContext,
} from "../src/runtime/index.js";
import { Renderer } from "../src/renderer/renderer.js";
import { defaultLibrary } from "../src/library/index.js";

function harness(src: string) {
  const state = new StateStore();
  const router = new Router();
  const ctx: EvaluationContext = createContext(state, {
    router,
    library: defaultLibrary,
  });
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(
      `Unexpected parse errors:\n${program.errors.map((e) => `  ${e.message}`).join("\n")}`,
    );
  }
  planProgram(program, ctx);
  const renderer = new Renderer({
    library: defaultLibrary,
    state,
    router,
    evaluationContext: () => ctx,
  });
  renderer.beginRender();
  const root = ctx.bindings.get("aktion")?.();
  const node = renderer.render(root);
  const host = document.createElement("div");
  host.appendChild(node);
  renderer.endRender();
  return host;
}

describe("Map component vs Map constructor", () => {
  it("`Map(lat, { lng })` renders the OpenStreetMap embed", () => {
    const host = harness(`
      aktion = Map(65.0, { lng: -16.0, zoom: 5, markers: [
        { lat: 64.1466, lng: -21.9426, label: "Reykjavík" },
        { lat: 65.6839, lng: -18.0907, label: "Akureyri" }
      ] })
    `);
    const figure = host.querySelector(".rui-map");
    expect(figure, "Map figure should render").not.toBeNull();
    const iframe = host.querySelector<HTMLIFrameElement>(".rui-map-iframe");
    expect(iframe, "Map iframe should render").not.toBeNull();
    const src = iframe?.getAttribute("src") ?? "";
    expect(src).toContain("openstreetmap.org");
    expect(src).toContain("marker=65,-16");
    // Markers render alongside the map.
    expect(host.querySelectorAll(".rui-map-marker")).toHaveLength(2);
    expect(host.textContent).toContain("Reykjavík");
  });

  it("`Map` referenced as a positional-only call still renders", () => {
    const host = harness(`aktion = Map(40.0, { lng: -74.0 })`);
    expect(host.querySelector(".rui-map-iframe")).not.toBeNull();
  });

  it("`new Map()` still resolves to the JS constructor", () => {
    // The constructor path (evaluateNew → identifier resolution) must be
    // untouched: building a real Map and reading it back proves it.
    const host = harness(`
      $m = new Map()
      aktion = Text(\`size:\${$m.size}\`)
    `);
    expect(host.textContent).toContain("size:0");
  });
});
