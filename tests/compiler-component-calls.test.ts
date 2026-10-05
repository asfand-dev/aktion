/**
 * How a call binds its arguments to a user component's parameters.
 *
 *   - A `...rest` parameter gathers every remaining argument into an array, in
 *     every module language (it used to receive the first extra argument as a
 *     scalar, with the rest spilled into `children`).
 *   - A call written in a `.aktion.js` / `.aktion.ts` module to a component
 *     declared in one binds positionally, as JavaScript does — TypeScript types
 *     that call with the component's plain signature. The DSL used to read an
 *     object-literal argument as named props whenever one of its keys was
 *     `key` or a parameter name, so `KVRow({ key: "a", value: "1" })` lost its
 *     argument with `tsc` green.
 *   - Everything else keeps the DSL's named props: calls written in `.aktion`,
 *     and calls to `.aktion` components (whose generated declaration types the
 *     trailing props bag).
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled, type Screen } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

afterEach(() => cleanup());

const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };
const lines = (...l: string[]): string => l.join("\n");

async function mount(files: Record<string, string>, entry: string): Promise<Screen> {
  const res = await linkProject({ entry, files, frontends });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  return screen;
}

/** The rendered text of every `Text`, in order, joined by ` | `. */
async function texts(files: Record<string, string>, entry: string): Promise<string> {
  const screen = await mount(files, entry);
  return [...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent?.trim()).join(" | ");
}

/** `src` as a single module in each of the three languages. */
const everyLanguage = (src: string) =>
  (["app.aktion", "app.aktion.js", "app.aktion.ts"] as const).map((entry) => ({ entry, files: { [entry]: src } }));

describe("rest parameters on components", () => {
  it("`...labels` gathers every argument", async () => {
    const src = lines(
      "function Tags(...labels) {",
      '  return Text("tags:" + labels.length + ":" + labels.join(","))',
      "}",
      '$app(Column([Tags("a", "b", "c"), Tags()]))',
    );
    for (const { entry, files } of everyLanguage(src)) {
      expect(await texts(files, entry), entry).toBe("tags:3:a,b,c | tags:0:");
    }
  });

  it("after a positional parameter, the rest gathers only the remainder", async () => {
    const src = lines(
      "function Line(title, ...parts) {",
      '  return Text(title + "|" + parts.length + "|" + parts.join("+"))',
      "}",
      '$app(Column([Line("T", "x", "y")]))',
    );
    for (const { entry, files } of everyLanguage(src)) {
      expect(await texts(files, entry), entry).toBe("T|2|x+y");
    }
  });

  it("object literals passed to a rest parameter are values, not named props", async () => {
    const src = lines(
      "function Legend(...entries) {",
      '  return Text("n=" + entries.length + " " + entries.map((e) => e.name).join(","))',
      "}",
      '$app(Column([Legend({ name: "A" }, { name: "B" })]))',
    );
    for (const { entry, files } of everyLanguage(src)) {
      expect(await texts(files, entry), entry).toBe("n=2 A,B");
    }
  });

  it("a PascalCase arrow component with a rest parameter (W4)", async () => {
    const src = lines('const List = (...items) => Text("list:" + items.length)', '$app(Column([List("a", "b")]))');
    for (const entry of ["app.aktion.js", "app.aktion.ts"]) {
      expect(await texts({ [entry]: src }, entry), entry).toBe("list:2");
    }
  });

  it("typed children as a rest parameter render (.aktion.ts)", async () => {
    const src = lines(
      'import { $app, Column, Text, type AktionNode } from "aktion-runtime/dsl"',
      "export function Panel(title: string, ...kids: AktionNode[]): AktionNode {",
      '  return Column([Text(title + ":" + String(Array.isArray(kids)) + ":" + String(kids.length)), ...kids])',
      "}",
      '$app(Panel("T", Text("KID-A"), Text("KID-B")))',
    );
    expect(await texts({ "app.aktion.ts": src }, "app.aktion.ts")).toBe("T:true:2 | KID-A | KID-B");
  });

  it("a `.aktion` call still reads `key:` and leaves the values to the rest parameter", async () => {
    const src = lines(
      "function Tags(...labels) {",
      '  return Text("tags:" + labels.join(","))',
      "}",
      '$app(Column([Tags("a", "b", { key: "t" })]))',
    );
    const screen = await mount({ "app.aktion": src }, "app.aktion");
    expect(screen.shadowRoot.querySelector(".rui-text")?.textContent).toBe("tags:a,b");
    expect(screen.shadowRoot.querySelector('[data-rui-key="t"]')).not.toBeNull();
  });
});

describe("object-literal arguments in JavaScript-shaped modules bind positionally", () => {
  const kv = lines(
    "function KVRow(entry) {",
    '  return Text(entry ? entry.key + "=" + entry.value : "<missing entry>")',
    "}",
    'const rows = [{ key: "a", value: "1" }]',
    '$app(Column([KVRow({ key: "name", value: "Ada" }), ...rows.map((r) => KVRow({ key: r.key, value: r.value })), KVRow(rows[0])]))',
  );

  it("an object with a `key` field is the argument (.aktion.js, .aktion.ts)", async () => {
    for (const entry of ["app.aktion.js", "app.aktion.ts"]) {
      expect(await texts({ [entry]: kv }, entry), entry).toBe("name=Ada | a=1 | a=1");
    }
  });

  it("control: a `.aktion` module keeps the DSL meaning (`key:` is the identity key)", async () => {
    expect(await texts({ "app.aktion": kv }, "app.aktion")).toBe("<missing entry> | <missing entry> | a=1");
  });

  it("an object whose key is named like another parameter does not overwrite it", async () => {
    const src = lines(
      "function Field(label: string, value: { label: string; id: number }) {",
      '  return Text(label + ":" + String(value && value.id))',
      "}",
      '$app(Column([Field("Name", { label: "x", id: 1 })]))',
    );
    expect(await texts({ "app.aktion.ts": src }, "app.aktion.ts")).toBe("Name:1");
    const js = src.replace("label: string, value: { label: string; id: number }", "label, value");
    expect(await texts({ "app.aktion.js": js }, "app.aktion.js")).toBe("Name:1");
  });

  it("a component imported from another `.aktion.ts` module, with an object first and a string second", async () => {
    const files = {
      "app.aktion.ts": lines(
        'import { $app, Column } from "aktion-runtime/dsl"',
        'import { Tag, UserCard } from "./cards.aktion.ts"',
        '$app(Column([Tag({ key: "env", value: "prod" }), UserCard({ name: "Ada", title: "Dr" }, "Boss")]))',
      ),
      "cards.aktion.ts": lines(
        'import { Text, type AktionNode } from "aktion-runtime/dsl"',
        "interface Pair { key: string; value: string }",
        "export function Tag(tag: Pair): AktionNode {",
        '  return Text("TAG=" + tag.key + ":" + tag.value)',
        "}",
        "export function UserCard(user: { name: string; title: string }, title: string): AktionNode {",
        '  return Text("USER=" + user.name + " TITLE=" + title)',
        "}",
      ),
    };
    expect(await texts(files, "app.aktion.ts")).toBe("TAG=env:prod | USER=Ada TITLE=Boss");
  });

  it("a destructured props parameter receives the whole object, `key` included", async () => {
    const src = lines(
      "function Card({ title, tone }: { title: string; tone?: string; key?: string }) {",
      '  return Text("CARD title=" + title + " tone=" + tone)',
      "}",
      '$app(Column([Card({ title: "keyed", tone: "x", key: "c1" })]))',
    );
    expect(await texts({ "app.aktion.ts": src }, "app.aktion.ts")).toBe("CARD title=keyed tone=x");
  });

  it("`key:` on an extra trailing object (one JavaScript ignores) is still the identity key", async () => {
    const src = lines(
      "function Row(item) {",
      "  return Text(item.label)",
      "}",
      'const items = [{ id: "a", label: "A" }, { id: "b", label: "B" }]',
      "$app(Column(items.map((item) => Row(item, { key: item.id }))))",
    );
    const screen = await mount({ "app.aktion.js": src }, "app.aktion.js");
    expect([...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent)).toEqual(["A", "B"]);
    expect(screen.shadowRoot.querySelector('[data-rui-key="a"]')).not.toBeNull();
    expect(screen.shadowRoot.querySelector('[data-rui-key="b"]')).not.toBeNull();
  });
});

describe("the DSL's named props are kept where the caller's types promise them", () => {
  it("a `.aktion.ts` call to a `.aktion` component passes named props", async () => {
    const files = {
      "app.aktion.ts": lines(
        'import { $app, Column } from "aktion-runtime/dsl"',
        'import { Card } from "./card.aktion"',
        '$app(Column([Card({ title: "Named" }), Card("Positional", "sub")]))',
      ),
      "card.aktion": lines("export function Card(title, subtitle = \"-\") {", '  return Text(title + "/" + subtitle)', "}"),
    };
    expect(await texts(files, "app.aktion.ts")).toBe("Named/- | Positional/sub");
  });

  it("a `.aktion` call with `key:` reaches a destructured `.aktion.js` component", async () => {
    const files = {
      "app.aktion": lines(
        'import { Card } from "./card.aktion.js"',
        '$app(Column([Card({ title: "keyed", tone: "x", key: "c1" }), Card({ title: "plain" })]))',
      ),
      "card.aktion.js": lines(
        'export function Card({ title, tone = "info" }) {',
        '  return Text("CARD title=" + title + " tone=" + tone)',
        "}",
      ),
    };
    const screen = await mount(files, "app.aktion");
    expect([...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent)).toEqual([
      "CARD title=keyed tone=x",
      "CARD title=plain tone=info",
    ]);
    expect(screen.shadowRoot.querySelector('[data-rui-key="c1"]')).not.toBeNull();
  });

  it("the same call in a `.aktion` program binds the destructured props too", async () => {
    const src = lines(
      'function Card({ title, tone = "info" }) {',
      '  return Text("CARD title=" + title + " tone=" + tone)',
      "}",
      '$app(Column([Card({ title: "keyed", key: "c1" })]))',
    );
    expect(await texts({ "app.aktion": src }, "app.aktion")).toBe("CARD title=keyed tone=info");
  });
});
