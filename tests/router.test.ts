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

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const waitForRenders = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i += 1) await flush();
};

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
  });

  it("navigate updates the path and fires listeners", () => {
    const router = new Router();
    const seen: string[] = [];
    router.subscribe((d) => seen.push(d.path));
    router.navigate("/about");
    router.navigate("/about");
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
    router.stop();
  });

  describe("history mode", () => {
    afterEach(() => {
      if (typeof window !== "undefined") window.history.pushState({}, "", "/");
    });

    it("reads pathname on start and navigates via pushState", () => {
      if (typeof window === "undefined") return;
      window.history.pushState({}, "", "/about");
      const router = new Router();
      router.configure({ mode: "history" });
      router.start();
      expect(router.getMode()).toBe("history");
      expect(router.getPath()).toBe("/about");
      router.navigate("/contact");
      expect(router.getPath()).toBe("/contact");
      expect(window.location.pathname).toBe("/contact");
      router.stop();
    });

    it("strips and re-applies basePath", () => {
      if (typeof window === "undefined") return;
      window.history.pushState({}, "", "/app/dash");
      const router = new Router();
      router.configure({ mode: "history", basePath: "/app/" });
      router.start();
      expect(router.getPath()).toBe("/dash");
      router.navigate("/settings");
      expect(router.getPath()).toBe("/settings");
      expect(window.location.pathname).toBe("/app/settings");
      router.stop();
    });

    it("configure() is a no-op once the router has started", () => {
      const router = new Router();
      router.start();
      router.configure({ mode: "history" });
      expect(router.getMode()).toBe("hash");
      router.stop();
    });
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

interface RoutingElement extends HTMLElement {
  setResponse(text: string): void;
  navigate(path: string): void;
  route: string;
  getSystemPrompt(opts?: Record<string, unknown>): string;
}

describe("<aktion-app>: routing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof window !== "undefined") window.location.hash = "";
  });

  const create = (): RoutingElement => {
    if (typeof window !== "undefined") window.location.hash = "";
    const el = document.createElement("aktion-app") as unknown as RoutingElement;
    document.body.appendChild(el);
    return el;
  };

  it("renders the matching arm of `$router({ … })` based on the current path", async () => {
    const el = create();
    window.location.hash = "#/about";
    await flush();
    el.setResponse(`pages = $router({
  "/":      Card([CardHeader("Home")]),
  "/about": Card([CardHeader("About")]),
  default:  Callout("warning", "Not found")
})
aktion = Stack([pages])`);
    await waitForRenders();
    const shadow = el.shadowRoot!;
    const titles = Array.from(shadow.querySelectorAll(".rui-card-title")).map((n) => n.textContent);
    expect(titles).toContain("About");
    expect(titles).not.toContain("Home");
  });

  it("falls back to the `default` arm when no path matches", async () => {
    const el = create();
    window.location.hash = "#/nonexistent";
    await flush();
    el.setResponse(`pages = $router({
  "/":      Card([CardHeader("Home")]),
  "/about": Card([CardHeader("About")]),
  default:  Card([CardHeader("404")])
})
aktion = Stack([pages])`);
    await waitForRenders();
    const titles = Array.from(el.shadowRoot!.querySelectorAll(".rui-card-title")).map((n) => n.textContent);
    expect(titles).toContain("404");
    expect(titles).not.toContain("Home");
  });

  it("matches a wildcard catch-all", async () => {
    const el = create();
    window.location.hash = "#/anything-goes/here";
    await flush();
    el.setResponse(`pages = $router({
  "/": Card([CardHeader("Home")]),
  "*": Card([CardHeader("404")])
})
aktion = Stack([pages])`);
    await waitForRenders();
    const titles = Array.from(el.shadowRoot!.querySelectorAll(".rui-card-title")).map((n) => n.textContent);
    expect(titles).toContain("404");
  });

  it("injects path params as the `params` loop variable", async () => {
    const el = create();
    window.location.hash = "#/users/42";
    await flush();
    el.setResponse(`pages = $router({
  "/users/:id": Card([CardHeader("User " + params.id, "Detail page")]),
  default:      Card([CardHeader("404")])
})
aktion = Stack([pages])`);
    await waitForRenders();
    const title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("User 42");
  });

  it("exposes the reactive `route` object with .path / .params / .pattern", async () => {
    const el = create();
    window.location.hash = "#/users/7";
    await flush();
    el.setResponse(`pages = $router({
  "/users/:id": Card([CardHeader(\`User \${route.params.id}\`, route.path)]),
  default:      Card([CardHeader("404")])
})
aktion = Stack([pages])`);
    await waitForRenders();
    const shadow = el.shadowRoot!;
    const title = shadow.querySelector(".rui-card-title")?.textContent;
    const subtitle = shadow.querySelector(".rui-card-subtitle")?.textContent;
    expect(title).toBe("User 7");
    expect(subtitle).toBe("/users/7");
  });

  it("template literal `${route}` coerces to the current path string", async () => {
    const el = create();
    window.location.hash = "#/dashboard";
    await flush();
    el.setResponse(`aktion = Card([CardHeader("Path", \`Now at \${route}\`)])`);
    await waitForRenders();
    const subtitle = el.shadowRoot!.querySelector(".rui-card-subtitle")?.textContent;
    expect(subtitle).toBe("Now at /dashboard");
  });

  it("`route.navigate(path)` updates the URL hash and re-renders", async () => {
    const el = create();
    el.setResponse(`pages = $router({
  "/":         Card([CardHeader("Home")]),
  "/settings": Card([CardHeader("Settings")])
})
function goSettings() { route.navigate("/settings") }
trigger = Button("Go", { onClick: goSettings })
aktion = Stack([trigger, pages])`);
    await waitForRenders();
    expect(el.route).toBe("/");

    const button = el.shadowRoot!.querySelector<HTMLButtonElement>(".rui-button");
    expect(button).not.toBeNull();
    button!.click();
    await waitForRenders();

    expect(el.route).toBe("/settings");
    const title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("Settings");
  });

  it("re-renders when the element's `navigate()` method is called", async () => {
    const el = create();
    el.setResponse(`pages = $router({
  "/":         Card([CardHeader("Home")]),
  "/settings": Card([CardHeader("Settings")])
})
aktion = Stack([pages])`);
    await waitForRenders();
    expect(el.route).toBe("/");
    let title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("Home");

    el.navigate("/settings");
    await waitForRenders();
    expect(el.route).toBe("/settings");
    title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("Settings");
  });

  it("re-renders a $router nested inside a (memoised) component on navigate", async () => {
    // Regression: `$router({...})` inside a `function Pages()` component
    // recorded no `route` dependency, so per-component memoisation skipped
    // re-running its body on a hash/navigate change — the page only updated
    // on a full reload. The arm must switch live.
    const el = create();
    el.setResponse(`aktion = AppShell(Navigation(), [Pages()])
function Navigation() {
  return Sidebar([
    SidebarSection("Pages", [
      SidebarItem("Page 1", { to: "/page1" }),
      SidebarItem("Page 2", { to: "/page2" })
    ])
  ])
}
function Pages() {
  return $router({
    "/page1": Page1(),
    "/page2": Page2(),
    default:  Page1()
  })
}
function Page1() { return Text("PAGE-ONE-BODY") }
function Page2() { return Text("PAGE-TWO-BODY") }`);
    await waitForRenders();
    expect(el.shadowRoot!.textContent).toContain("PAGE-ONE-BODY");
    expect(el.shadowRoot!.textContent).not.toContain("PAGE-TWO-BODY");

    el.navigate("/page2");
    await waitForRenders();

    expect(el.route).toBe("/page2");
    expect(el.shadowRoot!.textContent).toContain("PAGE-TWO-BODY");
    expect(el.shadowRoot!.textContent).not.toContain("PAGE-ONE-BODY");
  });

  it("NavLink reflects data-active for the current path (prefix + exact)", async () => {
    const el = create();
    window.location.hash = "#/settings/profile";
    await flush();
    el.setResponse(`pages = $router({
  "/":           Card([CardHeader("Home")]),
  "/settings/*": Card([CardHeader("Settings")])
})
nav = Stack([
  NavLink("Home", { to: "/", exact: true }),
  NavLink("Settings", { to: "/settings" }),
  NavLink("Profile", { to: "/settings/profile", exact: true })
], { direction: "row" })
aktion = Stack([nav, pages])`);
    await waitForRenders();
    const links = Array.from(el.shadowRoot!.querySelectorAll<HTMLAnchorElement>(".rui-nav-link"));
    const states = links.map((a) => ({ label: a.textContent?.trim(), active: a.getAttribute("data-active") }));
    expect(states).toEqual([
      { label: "Home", active: "false" },
      { label: "Settings", active: "true" },
      { label: "Profile", active: "true" },
    ]);
  });

  it("NavLink onclick navigates to the target route", async () => {
    const el = create();
    el.setResponse(`pages = $router({
  "/":      Card([CardHeader("Home")]),
  "/about": Card([CardHeader("About")])
})
nav = Stack([
  NavLink("Home", { to: "/" }),
  NavLink("About", { to: "/about" })
], { direction: "row" })
aktion = Stack([nav, pages])`);
    await waitForRenders();
    expect(el.route).toBe("/");

    const links = el.shadowRoot!.querySelectorAll<HTMLAnchorElement>(".rui-nav-link");
    expect(links).toHaveLength(2);
    links[1]!.click();
    await waitForRenders();
    expect(el.route).toBe("/about");
    const title = el.shadowRoot!.querySelector(".rui-card-title")?.textContent;
    expect(title).toBe("About");
  });

  it("dispatches a route-change event when the path changes", async () => {
    const el = create();
    el.setResponse(`pages = $router({
  "/":  Card([CardHeader("A")]),
  "/b": Card([CardHeader("B")])
})
aktion = Stack([pages])`);
    await waitForRenders();
    const events: Array<{ path: string; previousPath: string | null }> = [];
    el.addEventListener("route-change", (evt) => {
      events.push((evt as CustomEvent).detail);
    });
    el.navigate("/b");
    await waitForRenders();
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]!.path).toBe("/b");
  });
});

describe("system prompt: routing", () => {
  it("includes a routing section in the full prompt", () => {
    const text = generatePrompt(defaultLibrary);
    expect(text).toContain("$router({");
    expect(text).toContain("NavLink");
    expect(text).toContain("route.path");
    // The route handle is `route`, never `$route` — but `$router` legitimately
    // contains the substring, so assert `$route` only at a word boundary.
    expect(text).not.toMatch(/\$route\b/);
  });

  it("omits the routing section from the chat-mode prompt", () => {
    const text = generatePrompt(defaultLibrary, { mode: "chat" });
    expect(text).not.toContain("## Routing");
    expect(text).not.toContain("NavLink(");
  });
});
