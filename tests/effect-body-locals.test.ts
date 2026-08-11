/**
 * Locals inside an `$effect` body.
 *
 * The effect runner has its own statement dispatch (`runStatement` in
 * `src/runtime/effects.ts`) rather than sharing the evaluator's. It used to
 * treat EVERY assignment as a state write, so `const rows = …` was filed under
 * `ctx.state` instead of being bound as a local — and the next line read the
 * name back as undefined, silently, with no error anywhere. An effect body that
 * was a single `if` worked; one that pulled a value into a name first computed
 * on nothing.
 *
 * The fix is to honour the parser's `isState` flag — the `$` sigil — and hand
 * everything else to the same block runner that binds locals inside an `if`, a
 * `for` body or a function. These tests pin both halves of that split.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

function text(html: string): string {
  return html.replaceAll(/<[^>]*>/g, "");
}

describe("$effect body locals", () => {
  it("binds a const declared in the body", async () => {
    const screen = render(`
$n = 2
$out = "unset"
$effect(() => {
  const doubled = $n * 2
  $out = \`\${doubled}\`
}, [$n])
$app(Text($out))
`);
    await settle();
    expect(text(screen.html())).toBe("4");
  });

  it("binds a let, and a second local can read the first", async () => {
    const screen = render(`
$n = 2
$out = "unset"
$effect(() => {
  let base = $n
  const next = base + 1
  $out = \`\${next}\`
}, [$n])
$app(Text($out))
`);
    await settle();
    expect(text(screen.html())).toBe("3");
  });

  it("keeps a local's type — it is the value, not a state box", async () => {
    const screen = render(`
$n = 2
$out = "unset"
$effect(() => {
  const doubled = $n * 2
  $out = typeof doubled
}, [$n])
$app(Text($out))
`);
    await settle();
    expect(text(screen.html())).toBe("number");
  });

  it("holds the result of a call, with its members readable", async () => {
    const screen = render(`
$ids = ["a", "b", "c"]
$out = "unset"
function withoutA(list) {
  return list.filter(id => id !== "a")
}
$effect(() => {
  const kept = withoutA($ids)
  $out = \`\${kept.length}:\${kept.join(",")}\`
}, [$ids])
$app(Text($out))
`);
    await settle();
    expect(text(screen.html())).toBe("2:b,c");
  });

  it("does not leak the local into state", async () => {
    const screen = render(`
$n = 1
$out = "unset"
$effect(() => {
  const scratch = $n + 41
  $out = \`\${scratch}\`
}, [$n])
$app(Text($out))
`);
    await settle();
    expect(text(screen.html())).toBe("42");
    expect(screen.state.get("scratch")).toBeUndefined();
  });

  it("still writes state for a $-prefixed assignment", async () => {
    const screen = render(`
$n = 5
$doubled = 0
$effect(() => {
  $doubled = $n * 2
}, [$n])
$app(Text(\`\${$doubled}\`))
`);
    await settle();
    expect(text(screen.html())).toBe("10");
    expect(screen.state.get("doubled")).toBe(10);
  });

  it("uses a local to decide a state write", async () => {
    const screen = render(`
$ids = ["x", "y"]
$kept = []
$effect(() => {
  const next = $ids.filter(id => id !== "x")
  if (next.length !== $ids.length) {
    $kept = next
  }
}, [$ids])
$app(Text(\`\${$kept.join("|")}\`))
`);
    await settle();
    expect(text(screen.html())).toBe("y");
  });
});
