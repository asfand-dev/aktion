/**
 * Hooks — `$state`, `$memo`, and user-declared `$useFoo(...)`.
 *
 * Hooks are the composable per-instance state primitive. A `$`-prefixed
 * function name marks a hook (mirroring React's `use*` convention); the
 * built-in `$state` / `$memo` mirror `useState` / `useMemo`. These tests
 * exercise the full wiring through the `<aktion-app>` custom element so the
 * `setValue → notify → re-render` loop and the reset-on-unmount GC are all
 * covered, plus parser / formatter unit checks.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { parse } from "../src/parser/index.js";
import { formatProgram } from "../src/tooling/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

/** Pump several microtask turns so a click → notify → render settles. */
async function settle(times = 5): Promise<void> {
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

async function mount(program: string): Promise<AktionEl> {
  const el = create();
  el.setResponse(program);
  await settle();
  return el;
}

const texts = (el: AktionEl): string[] =>
  [...el.shadowRoot!.querySelectorAll(".rui-text")].map((n) => n.textContent ?? "");

const buttons = (el: AktionEl): HTMLButtonElement[] =>
  [...el.shadowRoot!.querySelectorAll("button")] as HTMLButtonElement[];

/** Click the first button whose visible label contains `label`. */
async function clickButton(el: AktionEl, label: string): Promise<void> {
  const btn = buttons(el).find((b) => (b.textContent ?? "").includes(label));
  if (!btn) throw new Error(`No button labelled "${label}". Found: ${buttons(el).map((b) => b.textContent).join(", ")}`);
  btn.click();
  await settle();
}

describe("Hooks — parsing & formatting", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("parses `function $useFoo(...)` into a HookDeclaration with the `$` stripped from the name", () => {
    const program = parse(`function $useCounter(start) { return start }`);
    expect(program.errors).toEqual([]);
    const decl = program.statements[0]!;
    expect(decl.kind).toBe("HookDeclaration");
    expect((decl as { name: string }).name).toBe("useCounter");
  });

  it("a non-`$` function is still an action / component, not a hook", () => {
    const program = parse(`function useCounter(start) { return start }`);
    // lowercase-first → action; PascalCase → component. Never a hook.
    expect(program.statements[0]!.kind).toBe("ActionDeclaration");
  });

  it("round-trips a hook declaration through the formatter (re-emits the `$` sigil)", () => {
    const src = `function $useToggle(initial) {\n  const [on, setOn] = $state(initial)\n  return { on: on, toggle: () => setOn(!on) }\n}\n`;
    const { formatted, errors } = formatProgram(src);
    expect(errors).toEqual([]);
    expect(formatted).toContain("function $useToggle(initial)");
  });
});

describe("Hooks — $state (useState)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders the initial value from `$state(initial)`", async () => {
    const el = await mount(`
      function Counter() {
        const [count, setCount] = $state(5)
        return Text(\`\${count}\`)
      }
      aktion = Counter()
    `);
    expect(texts(el)).toContain("5");
  });

  it("`setValue(next)` updates the value and re-renders", async () => {
    const el = await mount(`
      function Counter() {
        const [count, setCount] = $state(0)
        return Stack([Text(\`\${count}\`), Button("inc", { onClick: () => setCount(count + 1) })])
      }
      aktion = Counter()
    `);
    expect(texts(el)).toContain("0");
    await clickButton(el, "inc");
    expect(texts(el)).toContain("1");
    await clickButton(el, "inc");
    expect(texts(el)).toContain("2");
  });

  it("supports the functional updater form `setValue(prev => ...)`", async () => {
    const el = await mount(`
      function Counter() {
        const [count, setCount] = $state(10)
        return Stack([Text(\`\${count}\`), Button("inc", { onClick: () => setCount(c => c + 5) })])
      }
      aktion = Counter()
    `);
    await clickButton(el, "inc");
    expect(texts(el)).toContain("15");
  });

  it("holds independent state per instance (two Counters)", async () => {
    const el = await mount(`
      function Counter(label) {
        const [count, setCount] = $state(0)
        return Stack([Text(\`\${label}:\${count}\`), Button(\`+\${label}\`, { onClick: () => setCount(count + 1) })])
      }
      aktion = Stack([Counter("a"), Counter("b")])
    `);
    expect(texts(el)).toEqual(expect.arrayContaining(["a:0", "b:0"]));
    await clickButton(el, "+a");
    await clickButton(el, "+a");
    // Only instance "a" advanced; "b" is untouched.
    expect(texts(el)).toEqual(expect.arrayContaining(["a:2", "b:0"]));
  });

  it("preserves state across re-renders driven by other state", async () => {
    const el = await mount(`
      $banner = "hi"
      function Counter() {
        const [count, setCount] = $state(0)
        return Stack([
          Text(\`\${count}\`),
          Button("inc", { onClick: () => setCount(count + 1) }),
          Button("banner", { onClick: () => $banner = "bye" })
        ])
      }
      aktion = Counter()
    `);
    await clickButton(el, "inc");
    expect(texts(el)).toContain("1");
    // A re-render triggered by unrelated global state must NOT reset count.
    await clickButton(el, "banner");
    expect(texts(el)).toContain("1");
  });
});

describe("Hooks — $memo (useMemo)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("returns the cached value when dependencies are unchanged", async () => {
    // `$tick` is read inside the memo fn but is NOT a dependency, so bumping
    // it re-renders without recomputing — the displayed value stays stale.
    const el = await mount(`
      $tick = 0
      $base = 10
      function Demo() {
        const value = $memo(() => $base * 2 + $tick, [$base])
        return Stack([
          Text(\`\${value}\`),
          Button("tick", { onClick: () => $tick = $tick + 1 })
        ])
      }
      aktion = Demo()
    `);
    expect(texts(el)).toContain("20"); // 10*2 + 0
    await clickButton(el, "tick");      // $tick → 1, but deps [$base] unchanged
    expect(texts(el)).toContain("20"); // cached — NOT 21
  });

  it("recomputes when a dependency changes", async () => {
    const el = await mount(`
      $tick = 0
      $base = 10
      function Demo() {
        const value = $memo(() => $base * 2 + $tick, [$base])
        return Stack([
          Text(\`\${value}\`),
          Button("tick", { onClick: () => $tick = $tick + 1 }),
          Button("base", { onClick: () => $base = $base + 1 })
        ])
      }
      aktion = Demo()
    `);
    await clickButton(el, "tick");      // $tick = 1 (not a dep)
    await clickButton(el, "base");      // $base = 11 → recompute: 11*2 + 1
    expect(texts(el)).toContain("23");
  });

  it("recomputes every render when no dependency array is given", async () => {
    const el = await mount(`
      $tick = 0
      function Demo() {
        const value = $memo(() => $tick * 10)
        return Stack([
          Text(\`\${value}\`),
          Button("tick", { onClick: () => $tick = $tick + 1 })
        ])
      }
      aktion = Demo()
    `);
    expect(texts(el)).toContain("0");
    await clickButton(el, "tick");
    expect(texts(el)).toContain("10");
  });
});

describe("Hooks — user-declared $hooks compose the built-ins", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("a custom `$useCounter` shares the calling component's hook slots", async () => {
    const el = await mount(`
      function $useCounter(start) {
        const [count, setCount] = $state(start)
        return { count: count, increment: () => setCount(c => c + 1) }
      }
      function Counter() {
        const c = $useCounter(3)
        return Stack([Text(\`\${c.count}\`), Button("inc", { onClick: c.increment })])
      }
      aktion = Counter()
    `);
    expect(texts(el)).toContain("3");
    await clickButton(el, "inc");
    expect(texts(el)).toContain("4");
  });

  it("two calls of the same hook in one component get independent slots", async () => {
    const el = await mount(`
      function $useCounter(start) {
        const [count, setCount] = $state(start)
        return { count: count, inc: () => setCount(c => c + 1) }
      }
      function Demo() {
        const a = $useCounter(0)
        const b = $useCounter(100)
        return Stack([
          Text(\`a=\${a.count}\`), Button("+a", { onClick: a.inc }),
          Text(\`b=\${b.count}\`), Button("+b", { onClick: b.inc })
        ])
      }
      aktion = Demo()
    `);
    expect(texts(el)).toEqual(expect.arrayContaining(["a=0", "b=100"]));
    await clickButton(el, "+a");
    await clickButton(el, "+a");
    await clickButton(el, "+b");
    // Each hook call owns a distinct slot — they never alias.
    expect(texts(el)).toEqual(expect.arrayContaining(["a=2", "b=101"]));
  });

  it("a custom hook can combine $state and $memo", async () => {
    const el = await mount(`
      function $useDoubler(start) {
        const [n, setN] = $state(start)
        const doubled = $memo(() => n * 2, [n])
        return { doubled: doubled, bump: () => setN(v => v + 1) }
      }
      function Demo() {
        const d = $useDoubler(4)
        return Stack([Text(\`\${d.doubled}\`), Button("bump", { onClick: d.bump })])
      }
      aktion = Demo()
    `);
    expect(texts(el)).toContain("8");  // 4 * 2
    await clickButton(el, "bump");      // n → 5
    expect(texts(el)).toContain("10"); // 5 * 2
  });
});

describe("Hooks — reset on unmount", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("resets `$state` to its initial value when the instance unmounts and remounts", async () => {
    const el = await mount(`
      $show = true
      function Counter() {
        const [n, setN] = $state(0)
        return Stack([Text(\`n=\${n}\`), Button("inc", { onClick: () => setN(n + 1) })])
      }
      aktion = Stack([
        $show ? Counter() : Text("hidden"),
        Button("toggle", { onClick: () => $show = !$show })
      ])
    `);
    await clickButton(el, "inc");
    await clickButton(el, "inc");
    expect(texts(el)).toContain("n=2");

    // Unmount the Counter, then bring it back.
    await clickButton(el, "toggle"); // $show = false → Counter leaves the tree
    expect(texts(el)).toContain("hidden");
    await clickButton(el, "toggle"); // $show = true → Counter remounts fresh
    expect(texts(el)).toContain("n=0");
  });
});
