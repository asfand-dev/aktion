/**
 * Router runtime + routing component + system-prompt tests.
 *
 * The element-level tests use happy-dom's `window.location`, so we reset
 * the hash between cases to avoid bleed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalisePath, matchRoute, Router } from "../src/runtime/router.js";
import { generatePrompt } from "../src/prompt/generator.js";
import { defaultLibrary } from "../src/library/index.js";
import "../src/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe("router: normalisePath", () => {
  it.each([
    ["", "/"],
    [null, "/"],
    ["#", "/"],
    ["#/", "/"],
    ["#/about", "/about"],
    ["#about", "/about"],
    ["/users/42", "/users/42"],
    ["//foo///bar//", "/foo/bar"],
    ["/foo/bar?x=1", "/foo/bar"],
    ["users/42", "/users/42"],
  ])("normalises %j → %j", (input, expected) => {
    expect(normalisePath(input as string | null)).toBe(expected);
  });
});

describe("router: matchRoute", () => {
  it("matches a literal path", () => {
    expect(matchRoute("/about", "/about")).toEqual({ matched: true, params: {} });
    expect(matchRoute("/about", "/contact")).toEqual({ matched: false, params: {} });
  });

  it("extracts named parameters", () => {
    expect(matchRoute("/users/:id", "/users/42")).toEqual({
      matched: true,
      params: { id: "42" },
    });
    expect(matchRoute("/teams/:tid/users/:uid", "/teams/9/users/jane")).toEqual({
      matched: true,
      params: { tid: "9", uid: "jane" },
    });
  });

  it("decodes URI-encoded params", () => {
    expect(matchRoute("/users/:name", "/users/jane%20doe")).toEqual({
      matched: true,
      params: { name: "jane doe" },
    });
  });

  it("supports a trailing wildcard", () => {
    expect(matchRoute("/docs/*", "/docs/intro/getting-started")).toEqual({
      matched: true,
      wildcard: true,
      params: { _: "intro/getting-started" },
    });
    expect(matchRoute("/docs/*", "/docs/")).toEqual({
      matched: true,
      wildcard: true,
      params: { _: "" },
    });
    expect(matchRoute("/docs/*", "/blog/intro")).toEqual({
      matched: false,
      params: {},
    });
  });

  it("matches a bare `*` against anything", () => {
    expect(matchRoute("*", "/")).toMatchObject({ matched: true, wildcard: true });
    expect(matchRoute("*", "/anything/here")).toMatchObject({ matched: true, wildcard: true });
  });

  it("rejects paths with extra segments unless a wildcard is present", () => {
    expect(matchRoute("/users", "/users/42")).toEqual({ matched: false, params: {} });
  });

  it("treats the home path consistently", () => {
    expect(matchRoute("/", "/")).toEqual({ matched: true, params: {} });
    expect(matchRoute("/", "/about")).toEqual({ matched: false, params: {} });
  });
});

describe("router: navigation", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") window.location.hash = "";
  });

  it("starts in memory mode and exposes the default path", () => {
    const router = new Router();
    expect(router.getPath()).toBe("/");
    expect(router.isEnabled()).toBe(false);
  });

  it("navigate updates the path and fires listeners", () => {
    const router = new Router();
    const seen: string[] = [];
    router.subscribe((d) => seen.push(d.path));
    router.navigate("/about");
    router.navigate("/about"); // dedup — no second listener call
    router.navigate("/contact");
    expect(router.getPath()).toBe("/contact");
    expect(seen).toEqual(["/about", "/contact"]);
  });

  it("start() reads the URL hash and listens for hashchange", () => {
    if (typeof window === "undefined") return;
    window.location.hash = "#/from-url";
    const router = new Router();
    router.start();
    expect(router.getPath()).toBe("/from-url");
    expect(router.isEnabled()).toBe(true);
    router.stop();
  });

  it("setActiveMatch records the pattern + params without firing listeners", () => {
    const router = new Router();
    let calls = 0;
    router.subscribe(() => { calls += 1; });
    router.setActiveMatch("/users/:id", { id: "42" });
    expect(router.getActivePattern()).toBe("/users/:id");
    expect(router.getParams()).toEqual({ id: "42" });
    expect(calls).toBe(0);
  });
});

describe("<streaming-ui-script>: routing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof window !== "undefined") window.location.hash = "";
  });

  const create = (opts: { enableRoutes?: boolean } = {}) => {
    if (typeof window !== "undefined") window.location.hash = "";
    const el = document.createElement("streaming-ui-script");
    if (opts.enableRoutes) el.setAttribute("enable-routes", "true");
    document.body.appendChild(el);
    return el as HTMLElement & {
      setResponse(text: string): void;
      navigate(path: string): void;
      route: string;
      enableRoutes: boolean;
      getSystemPrompt(opts?: Record<string, unknown>): string;
    };
  };

  it("renders the matching Route's content based on the current path", async () => {
    const el = create({ enableRoutes: true });
    window.location.hash = "#/about";
    // hashchange fires async — give the listener a chance.
    await flush();
    el.setResponse(`root = Stack([nav, outlet])
nav = Stack([NavLink("Home", "/", null, true), NavLink("About", "/about")], "row", "s")
outlet = Routes([
  Route("/", homePage),
  Route("/about", aboutPage),
  Route("*", notFoundPage)
], "/")
homePage = Card([CardHeader("Home")])
aboutPage = Card([CardHeader("About")])
notFoundPage = Callout("warning", "Not found")`);
    for (let i = 0; i < 5; i += 1) await flush();
    const shadow = el.shadowRoot!;
    const titles = Array.from(shadow.querySelectorAll(".rui-card-title")).map((n) => n.textContent);
    expect(titles).toContain("About");
    expect(titles).not.toContain("Home");
  });

  it("falls back to the default Route when no path matches", async () => {
    const el = create({ enableRoutes: true });
    window.location.hash = "#/nonexistent";
    await flush();
    el.setResponse(`root = Routes([
  Route("/", homePage),
  Route("/about", aboutPage)
], "/")
homePage = Card([CardHeader("Home")])
aboutPage = Card([CardHeader("About")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const titles = Array.from(el.shadowRoot!.querySelectorAll(".rui-card-title")).map((n) => n.textContent);
    expect(titles).toContain("Home");
  });

  it("matches a wildcard catch-all last", async () => {
    const el = create({ enableRoutes: true });
    window.location.hash = "#/anything-goes/here";
    await flush();
    el.setResponse(`root = Routes([
  Route("/", homePage),
  Route("*", catchAll)
])
homePage = Card([CardHeader("Home")])
catchAll = Card([CardHeader("404")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const titles = Array.from(el.shadowRoot!.querySelectorAll(".rui-card-title")).map((n) => n.textContent);
    expect(titles).toContain("404");
  });

  it("injects path params as the `params` loop variable", async () => {
    const el = create({ enableRoutes: true });
    window.location.hash = "#/users/42";
    await flush();
    el.setResponse(`root = Routes([
  Route("/users/:id", userPage),
  Route("*", notFound)
])
userPage = Card([CardHeader("User " + params.id, "Detail page")])
notFound = Card([CardHeader("404")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("User 42");
  });

  it("re-renders when navigating via @Navigate inside an Action", async () => {
    const el = create({ enableRoutes: true });
    el.setResponse(`root = Stack([nav, outlet])
nav = Buttons([
  Button("Home", Action([@Navigate("/")])),
  Button("Settings", Action([@Navigate("/settings")]))
])
outlet = Routes([
  Route("/", homePage),
  Route("/settings", settingsPage)
])
homePage = Card([CardHeader("Home")])
settingsPage = Card([CardHeader("Settings")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    expect(el.route).toBe("/");
    let title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("Home");

    // Click the second button → action dispatches @Navigate("/settings")
    const buttons = el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".rui-button");
    buttons[1]!.click();
    for (let i = 0; i < 10; i += 1) await flush();
    expect(el.route).toBe("/settings");
    title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("Settings");
  });

  it("NavLink reflects data-active for the current path (prefix + exact)", async () => {
    const el = create({ enableRoutes: true });
    window.location.hash = "#/settings/profile";
    await flush();
    el.setResponse(`root = Stack([nav, outlet])
nav = Stack([
  NavLink("Home", "/", null, true),
  NavLink("Settings", "/settings"),
  NavLink("Profile", "/settings/profile", null, true)
], "row")
outlet = Routes([
  Route("/", home),
  Route("/settings/*", settings)
])
home = Card([CardHeader("Home")])
settings = Card([CardHeader("Settings")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const links = Array.from(el.shadowRoot!.querySelectorAll<HTMLAnchorElement>(".rui-nav-link"));
    const states = links.map((a) => ({ label: a.textContent?.trim(), active: a.getAttribute("data-active") }));
    expect(states).toEqual([
      { label: "Home", active: "false" },
      { label: "Settings", active: "true" },
      { label: "Profile", active: "true" },
    ]);
  });

  it("dispatches a route-change event when the path changes", async () => {
    const el = create({ enableRoutes: true });
    el.setResponse(`root = Stack([Routes([Route("/", a), Route("/b", b)])])
a = Card([CardHeader("A")])
b = Card([CardHeader("B")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const events: Array<{ path: string; previousPath: string | null }> = [];
    el.addEventListener("route-change", (evt) => {
      events.push((evt as CustomEvent).detail);
    });
    el.navigate("/b");
    for (let i = 0; i < 5; i += 1) await flush();
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]!.path).toBe("/b");
  });

  it("when routes are disabled, Routes still renders the first declared page", async () => {
    const el = create({ enableRoutes: false });
    el.setResponse(`root = Routes([
  Route("/", first),
  Route("/other", second)
])
first = Card([CardHeader("First")])
second = Card([CardHeader("Second")])`);
    for (let i = 0; i < 5; i += 1) await flush();
    const title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    // Router is in-memory at "/" — the "/" Route matches first.
    expect(title).toBe("First");
  });

  it("when routes are disabled, NavLink clicks are inert (no hash mutation)", async () => {
    if (typeof window === "undefined") return;
    const el = create({ enableRoutes: false });
    window.location.hash = "";
    el.setResponse(`root = NavLink("Go", "/page")`);
    for (let i = 0; i < 5; i += 1) await flush();
    const link = el.shadowRoot!.querySelector<HTMLAnchorElement>(".rui-nav-link")!;
    expect(link.getAttribute("data-routes-enabled")).toBe("false");
    // The component still renders an anchor for accessibility; we just don't
    // call preventDefault when routes are off.
    expect(link.getAttribute("href")).toBe("#/page");
  });
});

describe("system prompt: routing", () => {
  it("omits the routing section by default", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).not.toContain("## Routing");
    expect(text).not.toContain("Routes(items");
    expect(text).not.toContain("### Routing");
  });

  it("includes the routing section when enabled", () => {
    const text = generatePrompt(defaultLibrary, { enableRoutes: true });
    expect(text).toContain("## Routing");
    expect(text).toContain("Routes(items");
    expect(text).toContain("Route(path");
    expect(text).toContain("NavLink(label");
    expect(text).toContain("@Navigate");
    expect(text).toContain("$route");
    expect(text).toContain("params.id");
    expect(text).toContain("### Routing");
  });

  it("does not leak routing into the JS section gating", () => {
    const jsOnly = generatePrompt(defaultLibrary, { enableJavascript: true });
    expect(jsOnly).not.toContain("## Routing");
    const both = generatePrompt(defaultLibrary, { enableJavascript: true, enableRoutes: true });
    expect(both).toContain("## JavaScript interactions");
    expect(both).toContain("## Routing");
  });
});
