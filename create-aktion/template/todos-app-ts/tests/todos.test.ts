/**
 * Mounts the compiled app and drives the full CRUD loop against an in-memory
 * fake REST API (so the tests never hit the network). `render({ fetch })`
 * installs the mock for `$http(...)`; `screen.requests` records what was sent.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, waitFor, json } from "aktion-runtime/test";
import type { AktionElement } from "aktion-runtime";
import app from "../src/app.aktion.ts";
import type { Todo } from "../src/types.ts";

afterEach(() => cleanup());


/** A tiny stateful fake of the /todos REST collection. */
function makeApi(seed: Todo[]) {
  let items = seed.map((t) => ({ ...t }));
  let nextId = Math.max(0, ...items.map((t) => t.id)) + 1;
  return (url: string, init: { method: string; body?: unknown }) => {
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? {};
    const id = Number(url.split("/").pop());
    if (method === "POST") {
      const created = { id: nextId++, title: body.title, isCompleted: false };
      items = [...items, created];
      return json(created, 201);
    }
    if (method === "PATCH" || method === "PUT") {
      items = items.map((t) => (t.id === id ? { ...t, ...body } : t));
      return json(items.find((t) => t.id === id) ?? null);
    }
    if (method === "DELETE") {
      items = items.filter((t) => t.id !== id);
      return json({ ok: true });
    }
    return json(items); // GET
  };
}

const SEED: Todo[] = [
  { id: 1, title: "Buy oat milk", isCompleted: false },
  { id: 2, title: "Walk the dog", isCompleted: true },
];

function mountApp(fetch: ReturnType<typeof makeApi>) {
  const screen = render("", { fetch });
  (screen.container as unknown as AktionElement).mountCompiled(app);
  return screen;
}

// Each checkbox is named after its todo (a visually hidden label), so a title
// can appear twice — query with the `All` variants.
describe("todos REST app", () => {
  it("loads todos from the API", async () => {
    const screen = mountApp(makeApi(SEED));
    expect((await screen.findAllByText("Buy oat milk", { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Walk the dog", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.requests[0]?.method).toBe("GET");
  });

  it("adds a todo — POST then refetch", async () => {
    const screen = mountApp(makeApi(SEED));
    await screen.findAllByText("Buy oat milk", { exact: false });
    await screen.user.type(screen.getByPlaceholderText("What needs doing?"), "Write tests");
    await screen.click("Add");
    expect((await screen.findAllByText("Write tests", { exact: false })).length).toBeGreaterThan(0);
    expect(screen.requests.some((r) => r.method === "POST")).toBe(true);
  });

  it("toggles a todo — PATCH", async () => {
    const screen = mountApp(makeApi(SEED));
    await screen.findAllByText("Buy oat milk", { exact: false });
    const checkbox = screen.shadowRoot.querySelector("#done-1") as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    await screen.user.click(checkbox);
    await waitFor(() => screen.requests.some((r) => r.method === "PATCH"));
    expect(screen.requests.some((r) => r.method === "PATCH")).toBe(true);
  });

  it("deletes a todo — DELETE then refetch", async () => {
    const screen = mountApp(makeApi(SEED));
    await screen.findAllByText("Buy oat milk", { exact: false });
    const del = screen.shadowRoot.querySelector('button[aria-label="Delete"]') as HTMLButtonElement;
    expect(del).toBeTruthy();
    await screen.user.click(del);
    await waitFor(() => screen.queryAllByText("Buy oat milk").length === 0);
    expect(screen.requests.some((r) => r.method === "DELETE")).toBe(true);
  });
});
