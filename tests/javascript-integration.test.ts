/**
 * Behavioural tests for the built-in JavaScript interactions feature.
 *
 * Covers:
 *   - `Script` / `@Js` always run.
 *   - Script bodies run after render and `ctx` is wired correctly.
 *   - Re-renders dispose obsolete scripts and re-run scripts whose deps changed.
 *   - `@Js("...")` action steps execute on button click.
 *   - The system prompt documents JS in the default (full) flavour and
 *     omits it in the compact `chat` flavour.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const waitForRenders = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await flush();
};

interface ElementWithApi extends HTMLElement {
  setResponse(text: string): void;
  appendChunk(text: string): void;
  clear(): void;
  streaming: boolean;
  getSystemPrompt(opts?: Record<string, unknown>): string;
  setTools(tools: Record<string, (args: Record<string, unknown>) => unknown>): void;
  state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
}

const mount = (attributes: Record<string, string> = {}): ElementWithApi => {
  // Cast through `unknown` because the class declares `state` private but
  // we need to read it here for assertions; structural overlap rules require
  // the intermediate cast.
  const el = document.createElement("streaming-ui-script") as unknown as ElementWithApi;
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
};

describe("javascript interactions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("runs a Script body once when the program mounts", async () => {
    const el = mount();

    (window as unknown as { __runs?: number }).__runs = 0;
    el.setResponse(
      `runner = Script("runner", "window.__runs = (window.__runs ?? 0) + 1;")
root = Stack([runner])`,
    );
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(1);

    // Repeated renders without dep changes should NOT re-run the script.
    el.state.set("__noop__", Math.random());
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(1);
  });

  it("re-runs the script only when a dep changes, and cleans up between runs", async () => {
    const el = mount();
    (window as unknown as { __runs?: number; __cleans?: number }).__runs = 0;
    (window as unknown as { __runs?: number; __cleans?: number }).__cleans = 0;

    el.setResponse(`$count = 0
runner = Script("runner", "window.__runs += 1; ctx.cleanup(() => { window.__cleans += 1; });", ["count"])
root = Stack([runner])`);
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(1);
    expect((window as unknown as { __cleans: number }).__cleans).toBe(0);

    el.state.set("count", 1);
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(2);
    expect((window as unknown as { __cleans: number }).__cleans).toBe(1);

    el.state.set("count", 1);
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(2);

    el.state.set("count", 2);
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(3);
    expect((window as unknown as { __cleans: number }).__cleans).toBe(2);
  });

  it("disposes scripts when they leave the tree", async () => {
    const el = mount();
    (window as unknown as { __cleans?: number }).__cleans = 0;
    el.setResponse(`$show = true
runner = Script("runner", "ctx.cleanup(() => { window.__cleans += 1; });", [])
root = Stack([$show ? runner : null])`);
    await waitForRenders();
    expect((window as unknown as { __cleans: number }).__cleans).toBe(0);

    el.state.set("show", false);
    await waitForRenders();
    expect((window as unknown as { __cleans: number }).__cleans).toBe(1);
  });

  it("exposes ctx.state.set so a script can drive reactive UI", async () => {
    const el = mount();
    el.setResponse(`$msg = "loading"
label = TextContent("" + $msg, "large-heavy")
boot = Script("boot", "ctx.state.set('msg', 'ready');", [])
root = Stack([label, boot])`);
    await waitForRenders();
    const text = el.shadowRoot!.querySelector(".rui-text")?.textContent;
    expect(text).toBe("ready");
  });

  it("exposes ctx.tools as a proxy that calls registered handlers", async () => {
    const el = mount();
    el.setTools({
      load_data: async ({ id }) => ({ id, hello: "world" }),
    });
    el.setResponse(`$result = ""
label = TextContent($result, "small")
fetcher = Script("fetcher", "const data = await ctx.tools.load_data({ id: 42 }); ctx.state.set('result', JSON.stringify(data));", [])
root = Stack([label, fetcher])`);
    await waitForRenders(20);
    const text = el.shadowRoot!.querySelector(".rui-text")?.textContent;
    expect(text).toContain('"id":42');
    expect(text).toContain('"hello":"world"');
  });

  it("runs @Js action steps on button click", async () => {
    const programJs = `$count = 0
label = TextContent("" + $count, "large-heavy")
btn = Button("Inc", Action([@Js("ctx.state.set('count', (ctx.state.get('count') ?? 0) + 1);")]))
root = Stack([label, btn])`;

    const el = mount();
    el.setResponse(programJs);
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    button.click();
    await waitForRenders();
    expect(el.shadowRoot!.querySelector(".rui-text")?.textContent).toBe("1");
  });

  it("supports the canonical 'add via spread' pattern without any JS", async () => {
    // The todo-app teaching pattern: adding an item is fully declarative.
    // No Script/@Js needed. This regression-tests array spread in @Set and
    // the .length shortcut working together.
    const el = mount();
    el.setResponse(
      "$todos = []\n" +
      "$draft = \"\"\n" +
      "addBtn = Button(\"Add\", Action([@Set($todos, [...$todos, {id: $todos.length + 1, text: $draft}]), @Reset($draft)]))\n" +
      "root = Stack([addBtn])",
    );
    await waitForRenders();
    el.state.set("draft", "first task");
    await waitForRenders();
    const button = el.shadowRoot!.querySelector("button") as HTMLButtonElement;
    button.click();
    await waitForRenders();
    const todos = el.state.get("todos") as Array<{ id: number; text: string }>;
    expect(todos).toHaveLength(1);
    expect(todos[0]).toEqual({ id: 1, text: "first task" });
    // @Reset returns the state to its declared default, not undefined.
    expect(el.state.get("draft")).toBe("");
  });

  it("passes per-item args from @Js(body, args) into ctx.args at click time", async () => {
    // Regression: LLMs were trying to read loop variables via ctx.state, which
    // does not work. `@Js(body, {id: t.id})` is the correct way to bake the
    // loop variable into the action step at render time.
    const el = mount();
    el.setResponse(
      "$todos = [{id:1, name:\"a\"}, {id:2, name:\"b\"}, {id:3, name:\"c\"}]\n" +
      "list = @Each($todos, \"t\", row)\n" +
      "row = Button(t.name, Action([@Js(\"ctx.state.set('clicked', ctx.args.id)\", {id: t.id})]))\n" +
      "root = Stack([list])",
    );
    await waitForRenders();
    const buttons = el.shadowRoot!.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    (buttons[1] as HTMLButtonElement).click();
    await waitForRenders();
    expect(el.state.get("clicked")).toBe(2);
    (buttons[2] as HTMLButtonElement).click();
    await waitForRenders();
    expect(el.state.get("clicked")).toBe(3);
  });

  it("ctx.args defaults to an empty object so handlers can safely destructure", async () => {
    const el = mount();
    el.setResponse(
      "btn = Button(\"x\", Action([@Js(\"ctx.state.set('args_kind', typeof ctx.args)\")]))\n" +
      "root = Stack([btn])",
    );
    await waitForRenders();
    (el.shadowRoot!.querySelector("button") as HTMLButtonElement).click();
    await waitForRenders();
    expect(el.state.get("args_kind")).toBe("object");
  });

  it("runs a Script whose body uses a multi-line backtick string", async () => {
    // Backtick strings let LLMs write JS bodies with real newlines instead of
    // having to escape them as \n. This regression-tests both the lexer and
    // the script runner together.
    const el = mount();
    (window as unknown as { __bt?: number }).__bt = 0;
    el.setResponse(
      "boot = Script(\"boot\", `\n  const next = (window.__bt ?? 0) + 1;\n  window.__bt = next;\n  ctx.state.set('count', next);\n`)\n" +
      "root = Stack([boot])",
    );
    await waitForRenders();
    expect((window as unknown as { __bt: number }).__bt).toBe(1);
    expect(el.state.get("count")).toBe(1);
  });

  it("skips Script execution while streaming, then runs after streaming ends", async () => {
    const el = mount();
    (window as unknown as { __runs?: number }).__runs = 0;
    el.streaming = true;
    el.setResponse(
      `boot = Script("boot", "window.__runs = (window.__runs ?? 0) + 1;")
root = Stack([boot])`,
    );
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(0);

    el.streaming = false;
    await waitForRenders();
    expect((window as unknown as { __runs: number }).__runs).toBe(1);
  });

  it("includes the JavaScript section in the default (full) system prompt", () => {
    const el = mount();
    const prompt = el.getSystemPrompt();
    expect(prompt).toContain("JavaScript interactions");
    expect(prompt).toContain('Script("id", body, deps?)');
    expect(prompt).toContain("@Js(");
  });

  it("omits the JavaScript section from the chat-mode system prompt", () => {
    const el = mount();
    const prompt = el.getSystemPrompt({ mode: "chat" });
    expect(prompt).not.toContain("## JavaScript interactions");
    expect(prompt).not.toContain('Script("id", body, deps?)');
    expect(prompt).not.toContain("@Js(");
  });

  it("teaches the LLM about backtick-quoted multi-line bodies", () => {
    // The single biggest LLM authoring error is escaping newlines inside
    // double-quoted Script bodies. The full prompt should call out backticks
    // as the preferred surface for multi-line code.
    const proxy = document.createElement("streaming-ui-script") as unknown as ElementWithApi;
    const prompt = proxy.getSystemPrompt();
    expect(prompt).toContain("backtick-quoted string");
    expect(prompt).toContain("multi-line backtick body");
  });

  it("resets cleanly on setResponse so old scripts don't leak across programs", async () => {
    const el = mount();
    (window as unknown as { __cleans?: number }).__cleans = 0;
    el.setResponse(`runner = Script("runner", "ctx.cleanup(() => { window.__cleans += 1; });", [])
root = Stack([runner])`);
    await waitForRenders();
    expect((window as unknown as { __cleans: number }).__cleans).toBe(0);

    el.setResponse(`root = Stack([])`);
    await waitForRenders();
    expect((window as unknown as { __cleans: number }).__cleans).toBe(1);
  });
});
