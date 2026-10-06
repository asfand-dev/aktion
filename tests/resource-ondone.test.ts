/**
 * `$save.onDone = () => $list.refetch()` written at the top level — the idiom
 * the system prompt teaches — reaches a `$mutation(...)` / `$query(...)` atom.
 *
 * Those atoms are derivations: the derivation pass builds their bag after the
 * top-level statements ran, so the assignment landed on the atom's seed value
 * and the new bag replaced it. After planning `typeof $save.onDone` was
 * "undefined" (it was "function" for `$http`, whose bag is built earlier), and
 * the mutation never refetched the list. The bag also rebuilds when state its
 * config reads changes; `onDone` now moves to the new bag both times.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, render, renderCompiled, type Screen } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

afterEach(() => cleanup());

const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };
const lines = (...l: string[]): string => l.join("\n");

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flush();
    await new Promise((done) => setTimeout(done, 5));
  }
}

const texts = (screen: Screen): string[] =>
  [...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent ?? "");

/** A fetch mock that records `METHOD url` and answers every GET with how many GETs there were. */
function api(): { requests: string[]; fetch: (url: string, init: { method: string }) => { json: unknown } } {
  const requests: string[] = [];
  let gets = 0;
  return {
    requests,
    fetch: (url, init) => {
      requests.push(`${init.method} ${url}`);
      if (init.method === "GET") gets += 1;
      return { json: init.method === "GET" ? { gets } : { saved: true } };
    },
  };
}

async function mount(source: string, language: "aktion" | "ts", fetch: ReturnType<typeof api>["fetch"]): Promise<Screen> {
  if (language === "aktion") {
    const screen = render(source, { fetch });
    await settle();
    return screen;
  }
  const entry = "app.aktion.ts";
  const res = await linkProject({ entry, files: { [entry]: source }, frontends });
  expect(res.diagnostics).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
    { fetch },
  );
  await settle();
  return screen;
}

/** The documented idiom, in `.aktion` and as a `.aktion.ts` module. */
const IDIOM_AKTION = lines(
  '$list = $query({ url: "/api/items" })',
  '$save = $mutation({ url: "/api/items", method: "POST" })',
  '$log = ""',
  "$save.onDone = () => { $log = $log + \"saved \"; $list.refetch() }",
  '$list.onDone = () => { $log = $log + "loaded " }',
  '$app(Column([Button("Save", { onClick: () => $save.mutate({ body: { a: 1 } }) }), Text(JSON.stringify($list.data)), Text($log), Text(typeof $save.onDone + "/" + typeof $list.onDone)]))',
);

const IDIOM_TS = lines(
  'import { $app, $mutation, $query, Button, Column, Text } from "aktion-runtime/dsl"',
  'let $list = $query({ url: "/api/items" })',
  'let $save = $mutation({ url: "/api/items", method: "POST" })',
  'let $log = ""',
  "$save.onDone = () => { $log = $log + \"saved \"; void $list.refetch() }",
  '$list.onDone = () => { $log = $log + "loaded " }',
  'export default $app(Column([Button("Save", { onClick: () => { void $save.mutate({ body: { a: 1 } }) } }), Text(JSON.stringify($list.data)), Text($log), Text(typeof $save.onDone + "/" + typeof $list.onDone)]))',
);

describe("a top-level onDone on a $mutation / $query atom", () => {
  for (const [language, source] of [["aktion", IDIOM_AKTION], ["ts", IDIOM_TS]] as const) {
    it(`runs: the $query's after its first response, the $mutation's after mutate() (.${language === "ts" ? "aktion.ts" : "aktion"})`, async () => {
      const { requests, fetch } = api();
      const screen = await mount(source, language, fetch);
      expect(texts(screen)).toEqual(['{"gets":1}', "loaded ", "function/function"]);
      await screen.click(screen.getByRole("button"));
      await settle();
      // The mutation's onDone refetched the list, whose onDone ran again.
      expect(requests).toEqual(["GET /api/items", "POST /api/items", "GET /api/items"]);
      expect(texts(screen)).toEqual(['{"gets":2}', "loaded saved loaded ", "function/function"]);
    });
  }

  it("is kept when the bag is rebuilt because state its config reads changed", async () => {
    const { requests, fetch } = api();
    const screen = await mount(
      lines(
        "$id = 1",
        '$log = ""',
        '$save = $mutation({ url: "/api/save/" + $id })',
        '$item = $query({ url: "/api/item/" + $id })',
        '$save.onDone = () => { $log = $log + "save " }',
        '$item.onDone = () => { $log = $log + "item " }',
        '$app(Column([Button("next", { onClick: () => { $id = $id + 1 } }), Button("save", { onClick: () => $save.mutate() }), Text($log)]))',
      ),
      "aktion",
      fetch,
    );
    expect(texts(screen)).toEqual(["item "]);
    await screen.click(screen.getByRole("button", { name: "next" }));
    await settle();
    await screen.click(screen.getByRole("button", { name: "save" }));
    await settle();
    expect(requests).toEqual(["GET /api/item/1", "GET /api/item/2", "POST /api/save/2"]);
    expect(texts(screen)).toEqual(["item item save "]);
  });

  it("does not replace the onDone of a cached $query another atom shares", async () => {
    const { requests, fetch } = api();
    const screen = await mount(
      lines(
        '$log = ""',
        '$a = $query({ url: "/api/shared", key: "shared" })',
        '$b = $query({ url: "/api/shared", key: "shared" })',
        '$a.onDone = () => { $log = $log + "a " }',
        '$b.onDone = () => { $log = $log + "b " }',
        "$app(Text($log))",
      ),
      "aktion",
      fetch,
    );
    expect(requests).toEqual(["GET /api/shared"]);
    expect(texts(screen)).toEqual(["a "]);
  });

  it("control: a $http atom's onDone was already kept", async () => {
    const { fetch } = api();
    const screen = await mount(
      lines('$r = $http({ url: "/api/r" })', '$done = "no"', '$r.onDone = () => { $done = "yes" }', "$app(Text($done))"),
      "aktion",
      fetch,
    );
    expect(texts(screen)).toEqual(["yes"]);
  });
});
