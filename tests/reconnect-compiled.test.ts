/**
 * A compiled program survives its element being moved in the DOM.
 *
 * A move is a disconnect + reconnect, and the reconnect re-plans the program.
 * It used to re-plan by re-parsing `currentResponse`: for a program compiled by
 * the Vite plugin / `compileAktionSource` that text was only the ENTRY module,
 * so every imported component vanished (a "Loading" skeleton rendered instead,
 * with no error); for `linkProject` it was a re-print in which imported
 * components (`__a1_Counter`) re-parsed as actions, so per-instance state broke.
 * The element now re-plans from the AST it mounted.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, flush, render } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject, type CompiledProgram } from "../src/compiler/index.js";
import { compileAktionSource } from "../src/plugin/index.js";
import type { AktionElement } from "../src/element.js";

afterEach(() => cleanup());

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await flush();
};

function mount(compiled: CompiledProgram): AktionElement {
  const screen = render("");
  const el = screen.container as unknown as AktionElement;
  el.mountCompiled(compiled);
  return el;
}

async function move(el: AktionElement): Promise<void> {
  const parent = el.parentNode!;
  parent.removeChild(el);
  await settle();
  parent.appendChild(el);
  await settle();
}

const text = (el: AktionElement): string => el.shadowRoot?.textContent ?? "";
const labels = (el: AktionElement): string =>
  [...(el.shadowRoot?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim()).join(" , ");
const clickFirst = async (el: AktionElement): Promise<void> => {
  (el.shadowRoot!.querySelector("button") as HTMLButtonElement).click();
  await settle();
};

describe("compiled programs and a DOM move (reconnect)", () => {
  it("keeps the imported modules of a program compiled from disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aktion-reconnect-"));
    try {
      writeFileSync(join(dir, "greet.aktion"), 'export function Greeting(name) {\n  return Text("Hello " + name)\n}\n');
      const compiled = compileAktionSource(
        'import { Greeting } from "./greet.aktion"\n$app(Greeting("Ada"))',
        join(dir, "app.aktion"),
        { root: dir },
      );
      const el = mount(compiled);
      await settle();
      expect(text(el)).toContain("Hello Ada");
      await move(el);
      expect(text(el)).toContain("Hello Ada");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const [form, counter] of [
    [
      "per-instance `$n = 0`",
      'export function Counter(label) {\n  $n = 0\n  return Button(label + ":" + $n, { onClick: () => { $n = $n + 1 } })\n}',
    ],
    [
      "`$state` hook",
      'export function Counter(label) {\n  const [n, setN] = $state(0)\n  return Button(label + ":" + n, { onClick: () => setN(n + 1) })\n}',
    ],
  ] as const) {
    it(`keeps an imported component's ${form} isolated per instance`, async () => {
      const res = await linkProject({
        entry: "app.aktion",
        files: {
          "app.aktion": 'import { Counter } from "./counter.aktion"\n$app(Column([Counter("A"), Counter("B")]))',
          "counter.aktion": counter,
        },
      });
      expect(res.diagnostics).toEqual([]);
      const el = mount(
        defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion" }),
      );
      await settle();
      await clickFirst(el);
      expect(labels(el)).toBe("A:1 , B:0");

      await move(el);
      // Clicking A after the move changes A and only A. (Before the fix the
      // `$n` form shared one atom across both instances and the `$state` form
      // stopped responding.)
      const before = labels(el);
      await clickFirst(el);
      const [a0, b0] = before.split(" , ").map((l) => Number(l.split(":")[1]));
      expect(labels(el)).toBe(`A:${a0! + 1} , B:${b0}`);
    });
  }

  it("still re-parses after the program is replaced through the string path", async () => {
    const res = await linkProject({ entry: "app.aktion", files: { "app.aktion": '$app(Text("compiled"))' } });
    const el = mount(
      defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion" }),
    );
    await settle();
    expect(text(el)).toContain("compiled");
    el.setResponse('$app(Text("string"))');
    await settle();
    await move(el);
    expect(text(el)).toContain("string");
    expect(text(el)).not.toContain("compiled");
  });
});
