/**
 * Extended hooks — `$ref` (useRef), `$reducer` (useReducer), `$id` (useId).
 * These mirror the React primitives of the same name and compose with
 * `$state` / `$memo` in the same per-instance hook scope.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

describe("$reducer", () => {
  it("dispatches actions through a reducer and re-renders", async () => {
    const screen = render(`
      function Counter() {
        const [n, dispatch] = $reducer((state, action) => {
          switch (action) {
            case "inc": return state + 1
            case "dec": return state - 1
            default:    return state
          }
        }, 0)
        return Column([
          Text(\`n=\${n}\`),
          Button("Inc", { onClick: () => dispatch("inc") }),
          Button("Dec", { onClick: () => dispatch("dec") })
        ])
      }
      $app(Counter())
    `);
    await flush();
    expect(screen.getByText("n=0", { exact: false })).toBeTruthy();

    await screen.click("Inc");
    await screen.click("Inc");
    expect(screen.getByText("n=2", { exact: false })).toBeTruthy();

    await screen.click("Dec");
    expect(screen.getByText("n=1", { exact: false })).toBeTruthy();
  });
});

describe("$id", () => {
  it("returns a stable, unique id per instance", async () => {
    const screen = render(`
      function Field() {
        const id = $id("field")
        return Text(id)
      }
      $app(Column([Field(), Field()]))
    `);
    await flush();
    const texts = [...screen.shadowRoot.querySelectorAll(".rui-text")].map(
      (n) => n.textContent ?? "",
    );
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/^field-/);
    expect(texts[1]).toMatch(/^field-/);
    expect(texts[0]).not.toBe(texts[1]); // two instances → distinct ids
  });
});

describe("$ref", () => {
  it("holds a mutable value that persists across renders without re-rendering", async () => {
    const screen = render(`
      function Widget() {
        const slot = $ref(0)
        const [shown, setShown] = $state(0)
        return Column([
          Text(\`shown=\${shown}\`),
          Text(\`ref=\${slot.current}\`),
          Button("Stash", { onClick: () => { slot.current = 42 } }),
          Button("Reveal", { onClick: () => setShown(slot.current) })
        ])
      }
      $app(Widget())
    `);
    await flush();
    expect(screen.getByText("ref=0", { exact: false })).toBeTruthy();

    // Mutating ref.current does not re-render — the displayed shown stays 0.
    await screen.click("Stash");
    expect(screen.getByText("shown=0", { exact: false })).toBeTruthy();

    // A state write reveals the stashed ref value, proving it persisted.
    await screen.click("Reveal");
    expect(screen.getByText("shown=42", { exact: false })).toBeTruthy();
  });
});
