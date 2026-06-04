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
