/**
 * Mounts the compiled chat app and verifies both paths: the offline echo
 * fallback (no API key → no network) and a real OpenAI call (key seeded into
 * localStorage → POST to the completions endpoint, reply rendered). Network is
 * mocked via `render({ fetch })`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush, json } from "aktion-runtime/test";
import type { AktionElement } from "aktion-runtime";
import app from "../src/app.aktion";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

function mountApp(options = {}) {
  const screen = render("", options);
  (screen.container as unknown as AktionElement).mountCompiled(app);
  return screen;
}

describe("openai chatbot", () => {
  it("echoes locally when no API key is set", async () => {
    const screen = mountApp();
    await flush();
    await screen.user.type(screen.getByPlaceholderText("Message the assistant…"), "Hello there");
    await screen.click("Send");
    await flush(4);
    expect(screen.getByText("You said: Hello there", { exact: false })).toBeTruthy();
    expect(screen.requests.length, "no network in echo mode").toBe(0);
  });

  it("ignores an empty message", async () => {
    const screen = mountApp();
    await flush();
    await screen.click("Send");
    await flush(2);
    expect(screen.requests.length).toBe(0);
    expect(screen.queryAllByText("You", { exact: true })).toHaveLength(0);
  });

  it("calls the OpenAI endpoint when a key is configured", async () => {
    window.localStorage.setItem("openai_key", JSON.stringify("sk-test"));
    const reply = "The capital of France is Paris.";
    const screen = mountApp({
      fetch: (url: string, init: { method: string; body?: string }) => {
        expect(url).toContain("openai.com");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("gpt-4o-mini");
        expect(body.messages.some((m: { content: string }) => m.content === "Capital of France?")).toBe(true);
        return json({ choices: [{ message: { role: "assistant", content: reply } }] });
      },
    });
    await flush();
    await screen.user.type(screen.getByPlaceholderText("Message the assistant…"), "Capital of France?");
    await screen.click("Send");
    expect(await screen.findByText(reply, { exact: false })).toBeTruthy();
    expect(screen.requests.some((r) => r.method === "POST")).toBe(true);
  });
});
