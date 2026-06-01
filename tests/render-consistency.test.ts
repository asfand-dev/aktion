/**
 * React-consistent re-rendering.
 *
 * Two behaviours pinned down here:
 *
 *   1. Case-insensitive component state. A `function` that declares `$state`
 *      and is used to build the UI seeds that state once and preserves later
 *      updates — whether named `App` (PascalCase) or `app` (lowercase). The
 *      first-letter case must not change whether clicking a button "sticks".
 *
 *   2. Per-component memoization. A component only re-executes when its own
 *      inputs change — its args (props) or a `$state` path it read. Changing
 *      `$user.age` must not re-run a component that only read `$user.name`,
 *      matching React-with-memo / Solid granularity.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
}

function create(): AktionEl {
  const el = document.createElement("aktion-app") as AktionEl;
  document.body.appendChild(el);
  return el;
}
const textOf = (el: AktionEl): string => el.shadowRoot!.textContent ?? "";
async function clickButton(el: AktionEl, label: string): Promise<void> {
  const btn = [...el.shadowRoot!.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").includes(label),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`No button "${label}"; have: ${[...el.shadowRoot!.querySelectorAll("button")].map((b) => b.textContent)}`);
  btn.click();
  await settle();
}

describe("Case-insensitive component state", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  const PROGRAM = (fn: string) => `
    aktion = ${fn}()
    function ${fn}() {
      $user = { name: "Old Name" }
      return [
        Button("Name", () => $user.name = "New Name"),
        showName($user.name),
      ]
    }
    function showName(name) { return Text("Name: " + name) }
  `;

  for (const fn of ["App", "app"]) {
    it(`clicking the button updates the name with a ${/^[A-Z]/.test(fn) ? "PascalCase" : "lowercase"} root (\`${fn}\`)`, async () => {
      const el = await (async () => {
        const e = create();
        e.setResponse(PROGRAM(fn));
        await settle();
        return e;
      })();
      expect(textOf(el)).toContain("Name: Old Name");
      await clickButton(el, "Name");
      // The seed must not be re-applied on re-render — the click sticks.
      expect(textOf(el)).toContain("Name: New Name");
    });
  }
});

describe("Per-component memoization", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  // Mirrors the reported example: App owns $user, passes name/age down.
  const PROGRAM = `
    aktion = App()
    function App() {
      $user = { name: "Asfand", age: 10 }
      return [
        UpdateValues({ onName: (e) => $user.name = e, onAge: (e) => $user.age = e }),
        ShowName($user.name),
        ShowAge($user.age),
      ]
    }
    function ShowName(name) { console.log("render:name"); return Text("Name: " + name) }
    function ShowAge(age) { console.log("render:age"); return Text("Age: " + age) }
    function UpdateValues({ onName, onAge }) {
      return Buttons([Button("Name", () => onName("New Name")), Button("Age", () => onAge(20))])
    }
  `;

  it("re-runs only the component whose data changed", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(String(a[0])); });

    const el = create();
    el.setResponse(PROGRAM);
    await settle();
    // Initial render runs both leaves.
    expect(logs).toContain("render:name");
    expect(logs).toContain("render:age");

    // Click "Name" → only $user.name changes → only ShowName re-runs.
    logs.length = 0;
    await clickButton(el, "Name");
    expect(textOf(el)).toContain("Name: New Name");
    expect(textOf(el)).toContain("Age: 10");
    expect(logs).toContain("render:name");
    expect(logs).not.toContain("render:age"); // ← ShowAge skipped (memoized)

    // Click "Age" → only $user.age changes → only ShowAge re-runs.
    logs.length = 0;
    await clickButton(el, "Age");
    expect(textOf(el)).toContain("Name: New Name");
    expect(textOf(el)).toContain("Age: 20");
    expect(logs).toContain("render:age");
    expect(logs).not.toContain("render:name"); // ← ShowName skipped (memoized)
  });

  it("propagates a change through a memoized ancestor to a deep dependent (soundness)", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(String(a[0])); });
    const el = create();
    // Outer reads nothing reactive; Middle reads nothing; only Leaf reads
    // $deep. Changing $deep must re-run Leaf even though Outer and Middle are
    // memoized (their args/deps are unchanged) — reuse descends into children.
    el.setResponse(`
      $deep = "a"
      aktion = Outer()
      function Outer() {
        console.log("render:outer")
        return [ Button("Bump", () => $deep = "b"), Middle() ]
      }
      function Middle() { console.log("render:middle"); return Leaf() }
      function Leaf() { console.log("render:leaf:" + $deep); return Text($deep) }
    `);
    await settle();
    logs.length = 0;
    await clickButton(el, "Bump");
    expect(textOf(el)).toContain("b");
    // Leaf re-ran (it reads $deep); Outer/Middle were memoized (unchanged).
    expect(logs).toContain("render:leaf:b");
    expect(logs).not.toContain("render:outer");
    expect(logs).not.toContain("render:middle");
  });

  it("re-runs a component when its prop changes even if the state path it reads is elsewhere", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(String(a[0])); });
    const el = create();
    // `Label` reads no state directly; it re-runs purely because its prop changes.
    el.setResponse(`
      $count = 0
      aktion = Wrapper()
      function Wrapper() {
        $count = 0
        return [
          Button("Inc", () => $count = $count + 1),
          Label($count),
        ]
      }
      function Label(n) { console.log("render:label:" + n); return Text("Count: " + n) }
    `);
    await settle();
    logs.length = 0;
    await clickButton(el, "Inc");
    expect(textOf(el)).toContain("Count: 1");
    expect(logs).toContain("render:label:1"); // prop changed → re-ran
  });
});
