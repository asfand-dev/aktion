/**
 * Verifies the Aktion Testing Library (`src/testing/index.ts`) against the
 * real runtime: render → query → interact → assert on DOM, $state, events,
 * $http (mocked), and routing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  renderComponent,
  cleanup,
  flush,
  json,
  within,
} from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  try { window.location.hash = ""; } catch { /* ignore */ }
});

describe("render + queries", () => {
  it("renders a program and finds visible text", async () => {
    const screen = render(`$app(Text("Hello World"))`);
    await flush();
    expect(screen.getByText("Hello World", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Nope")).toBeNull();
  });

  it("getByRole finds a button by its accessible name", async () => {
    const screen = render(`$app(Button("Save changes"))`);
    await flush();
    const btn = screen.getByRole("button", { name: "Save changes" });
    expect(btn.tagName).toBe("BUTTON");
  });

  it("getByTestId finds a component marked with the universal testId prop", async () => {
    // Before `testId` existed the only way to put a test id on a component was
    // `HTMLTag("span", { attributes: { "data-testid": "chip" } })` around it, or
    // `data: { testid: … }` on the components that do not shadow `data`.
    const screen = render(`$app(Button("Save", { testId: "save" }))`);
    await flush();
    const btn = screen.getByTestId("save");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toContain("Save");
  });

  it("within() and Screen agree on test ids that are not bare identifiers", async () => {
    // `testId` passes its value through verbatim, so a test id may legally hold
    // spaces, dots, colons, slashes and non-ASCII text. Both query surfaces
    // escape before building the selector — `Screen.getByTestId` always did,
    // `within()` did not until this was fixed.
    //
    // Not covered here: a value holding a `"` or a `\\`. Those are exactly the
    // characters escaping exists for, but jsdom's selector engine cannot match
    // an attribute value containing either one even from a correctly escaped
    // selector, so BOTH surfaces miss and the assertion would prove nothing.
    // Verify that pair in a real browser.
    const ids = ["row 3", "user.row:3", "grp/sub-1", "zeile-drei-ü"];
    const buttons = ids.map((id, n) => `Button("B${n}", { testId: "${id}" })`).join(", ");
    const screen = render(`$app(Card([${buttons}]))`);
    await flush();
    const card = screen.shadowRoot!.querySelector(".rui-card") as HTMLElement;
    const scoped = within(card);
    for (const [n, id] of ids.entries()) {
      expect(scoped.getByTestId(id).textContent, id).toContain(`B${n}`);
      expect(scoped.queryAllByTestId(id), id).toHaveLength(1);
      expect(screen.getByTestId(id), id).toBe(scoped.getByTestId(id));
    }

    expect(scoped.queryByTestId("row 4")).toBeNull();
  });
});

describe("interaction + reactive state", () => {
  it("clicking a button updates $state and the DOM", async () => {
    const screen = render(`
      $count = 0
      $app(Column([
        Text(\`Count: \${$count}\`),
        Button("Increment", { onClick: () => $count = $count + 1 })
      ]))
    `);
    await flush();
    expect(screen.state.get("count")).toBe(0);

    await screen.click("Increment");
    expect(screen.state.get("count")).toBe(1);
    expect(screen.getByText("Count: 1", { exact: false })).toBeTruthy();

    await screen.click("Increment");
    await screen.click("Increment");
    expect(screen.state.get("count")).toBe(3);
  });

  it("typing into a bound input writes through to $state", async () => {
    const screen = render(`
      $name = ""
      $app(Column([
        Input("Name", { value: $name }),
        Text(\`Hi \${$name}\`)
      ]))
    `);
    await flush();
    const input = screen.shadowRoot.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();

    await screen.user.type(input, "Ada");
    expect(screen.state.get("name")).toBe("Ada");
    expect(screen.getByText("Hi Ada", { exact: false })).toBeTruthy();
  });
});

describe("renderComponent", () => {
  it("mounts a single component expression and captures a click", async () => {
    const screen = renderComponent(
      `Button("Save", { onClick: () => $saved = true })`,
    );
    await flush();
    await screen.click("Save");
    expect(screen.state.get("saved")).toBe(true);
  });

  it("accepts a setup block of helper DSL", async () => {
    const screen = renderComponent(`Greeting("Ada")`, {
      setup: `function Greeting(name) { return Text(\`Hello, \${name}!\`) }`,
    });
    await flush();
    expect(screen.getByText("Hello, Ada!", { exact: false })).toBeTruthy();
  });
});

describe("events", () => {
  it("captures a custom $emit(...) event", async () => {
    const screen = render(
      `
        function notify() { $emit("saved", { id: 7 }) }
        $app(Button("Save", { onClick: notify }))
      `,
      { captureEvents: ["saved"] },
    );
    await flush();
    await screen.click("Save");
    expect(screen.emitted("saved")).toEqual([{ id: 7 }]);
    expect(screen.lastEvent("saved")).toEqual({ id: 7 });
  });
});

describe("$http with a mocked fetch", () => {
  it("resolves a resource and exposes the captured request", async () => {
    const screen = render(
      `
        $users = $http({ url: "https://api.test/users" })
        $app(Text(\`Loaded: \${$users.loading}\`))
      `,
      {
        fetch: (url) => {
          expect(url).toContain("/users");
          return json([{ id: 1 }, { id: 2 }]);
        },
      },
    );

    const resource = await screen.waitForState(
      "users",
      (v: any) => v && Array.isArray(v.data),
    );
    expect((resource as any).data).toHaveLength(2);
    expect(screen.requests[0]?.url).toContain("/users");
    expect(screen.requests[0]?.method).toBe("GET");
  });
});

describe("routing", () => {
  it("renders the matching $router arm and follows navigation", async () => {
    const screen = render(
      `
        $app($router({
          "/":      Text("Home page"),
          "/about": Text("About page"),
          default:  Text("Not found")
        }))
      `,
      { route: "/about" },
    );
    await flush();
    expect(screen.getByText("About page", { exact: false })).toBeTruthy();

    await screen.navigate("/");
    expect(screen.getByText("Home page", { exact: false })).toBeTruthy();
  });
});
