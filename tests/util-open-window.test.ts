/**
 * `$util.openUrl` and `$util.openWindow` — reaching a new browsing context from
 * a program that has no `window`.
 *
 * Three properties are under test, and each one is the reason a call site would
 * otherwise be wrong:
 *
 *  1. **The scheme allow-list is the whole security story.** A program under the
 *     `"safe"` global-access policy cannot touch `window`, so these two builtins
 *     are its only route to `window.open`. `javascript:` executes in the opened
 *     context and `data:`/`blob:` let a program mint a document and then point a
 *     user at it from a trusted origin, so both are rejected here rather than at
 *     each call site.
 *  2. **The feature bag is re-emitted, never forwarded.** An author's string
 *     would otherwise carry an unknown key straight to the browser, which is how
 *     a feature the allow-list exists to withhold gets set anyway.
 *  3. **`openWindow` opens FIRST and navigates later.** That ordering is the
 *     entire point: the open has to happen inside the user gesture, and the URL
 *     only exists after the fetch. The tests assert the two really are separate
 *     calls, because collapsing them back into one is the obvious "simplification"
 *     that reintroduces the popup block.
 *
 * The fake `window` below is a plain object rather than jsdom's: jsdom's
 * `window.open` returns `null` unconditionally, so a test written against it
 * would pass for an implementation that never opened anything.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Util } from "../src/runtime/util.js";

/** One opened context, with the two members the handle actually reads. */
type FakeChild = {
  closed: boolean;
  opener: unknown;
  location: { href: string };
  close: () => void;
};

type OpenCall = { url: string; target: string; features: string | undefined };

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

let calls: OpenCall[] = [];
let children: FakeChild[] = [];
/** What the next `window.open` answers. `null` is a popup blocker. */
let openResult: FakeChild | null | "child" = "child";

const newChild = (): FakeChild => {
  const child: FakeChild = {
    closed: false,
    opener: { fake: "opener" },
    location: { href: "about:blank" },
    close() {
      child.closed = true;
    },
  };
  children.push(child);
  return child;
};

const installWindow = (): void => {
  const open = (url?: string | URL, target?: string, features?: string): FakeChild | null => {
    calls.push({ url: String(url ?? ""), target: String(target ?? ""), features });
    return openResult === "child" ? newChild() : openResult;
  };
  Object.defineProperty(globalThis, "window", { value: { open }, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: { baseURI: "https://dcd.example.com/app/" }, configurable: true, writable: true });
};

beforeEach(() => {
  calls = [];
  children = [];
  openResult = "child";
  installWindow();
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true, writable: true });
  vi.restoreAllMocks();
});

describe("$util.openUrl — what may be opened", () => {
  it("opens an absolute https URL in a new tab by default", () => {
    expect(Util.openUrl("https://docs.ionos.com/cloud")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://docs.ionos.com/cloud");
    expect(calls[0].target).toBe("_blank");
  });

  it("resolves a relative URL against the document base", () => {
    // The reason the parse lives in the builtin: `new URL("help")` alone throws,
    // and a try/catch at the call site would turn a valid path into "no".
    expect(Util.openUrl("help/backups")).toBe(true);
    expect(calls[0].url).toBe("https://dcd.example.com/app/help/backups");
  });

  it("opens mailto: and tel:, which the OS handles rather than renders", () => {
    expect(Util.openUrl("mailto:support@example.com")).toBe(true);
    expect(Util.openUrl("tel:+491234")).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["blob:https://dcd.example.com/1234"],
    ["file:///etc/passwd"],
    ["vbscript:msgbox(1)"],
  ])("refuses %s without calling window.open", (url) => {
    expect(Util.openUrl(url)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty, whitespace or non-string URL", () => {
    for (const bad of ["", "   ", null, undefined, 42, {}]) {
      expect(Util.openUrl(bad)).toBe(false);
    }

    expect(calls).toHaveLength(0);
  });

  it("answers false rather than throwing when the host has no window", () => {
    Object.defineProperty(globalThis, "window", { value: undefined, configurable: true, writable: true });
    expect(Util.openUrl("https://example.com")).toBe(false);
  });
});

describe("$util.openUrl — targets and features", () => {
  it("passes a named target through so repeated opens reuse one window", () => {
    Util.openUrl("https://example.com/console", { target: "backup-console" });
    expect(calls[0].target).toBe("backup-console");
  });

  it("adds noopener for _blank but NOT for a named target", () => {
    // `noopener` makes the browser ignore the name and open a fresh context every
    // time, which would silently defeat the reuse the name was asked for.
    Util.openUrl("https://example.com/a");
    expect(calls[0].features).toContain("noopener=yes");

    Util.openUrl("https://example.com/b", { target: "console" });
    expect(calls[1].features ?? "").not.toContain("noopener=yes");
  });

  it("lets an explicit noopener:false override the _blank default", () => {
    Util.openUrl("https://example.com/a", { noopener: false });
    expect(calls[0].features ?? "").not.toContain("noopener=yes");
  });

  it.each([[true], [1], ["1"], ["yes"], ["true"]])(
    "reads %p as noopener ON, the same as inside `features`",
    (value) => {
      // The option and the feature bag used to disagree: the option was tested with
      // `=== true`, so a truthy non-boolean read as FALSE and silently switched the
      // `_blank` default OFF — one value meaning opposite things depending only on
      // where the author wrote it.
      Util.openUrl("https://example.com", { noopener: value });
      expect(calls.at(-1)?.features ?? "").toContain("noopener=yes");

      Util.openUrl("https://example.com", { target: "console", features: { noopener: value } });
      expect(calls.at(-1)?.features ?? "").toContain("noopener=yes");
    },
  );

  it.each([[false], [0], ["0"], ["no"], ["false"], [""]])(
    "reads %p as noopener OFF, the same as inside `features`",
    (value) => {
      Util.openUrl("https://example.com", { noopener: value });
      expect(calls.at(-1)?.features ?? "").not.toContain("noopener=yes");

      Util.openUrl("https://example.com", { target: "console", features: { noopener: value } });
      expect(calls.at(-1)?.features ?? "").not.toContain("noopener=yes");
    },
  );

  it("serialises a size bag, rounding and emitting flags as yes/no", () => {
    Util.openUrl("https://example.com", {
      target: "console",
      features: { width: 1024.6, height: 700, resizable: true, scrollbars: false },
    });
    const features = calls[0].features ?? "";
    expect(features).toContain("width=1025");
    expect(features).toContain("height=700");
    expect(features).toContain("resizable=yes");
    expect(features).toContain("scrollbars=no");
  });

  it("drops a key outside the allow-list, from a bag AND from a string", () => {
    Util.openUrl("https://example.com", { target: "console", features: { width: 800, evil: "yes" } });
    expect(calls[0].features).toBe("width=800");

    // The string form is re-parsed rather than forwarded, which is what stops an
    // unknown key reaching the browser by the back door.
    Util.openUrl("https://example.com", { target: "console", features: "location=0,width=1024,height=700,evil=yes" });
    expect(calls[1].features).toBe("location=no,width=1024,height=700");
  });
});

describe("$util.openWindow — the deferred open", () => {
  it("opens about:blank immediately and reports ok", () => {
    const win = Util.openWindow({ name: "console", features: { width: 1024, height: 700 } });
    expect(win.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("about:blank");
    expect(calls[0].target).toBe("console");
    expect(calls[0].features).toBe("width=1024,height=700");
  });

  it("clears the child's opener while it is still same-origin about:blank", () => {
    // The `noopener` protection, applied in the one order that keeps the handle:
    // `noopener` would make window.open return null and there would be nothing to
    // navigate.
    Util.openWindow();
    expect(children[0].opener).toBeNull();
  });

  it("navigates the SAME context it already opened — one open, one navigation", () => {
    const win = Util.openWindow({ name: "console" });
    expect(win.navigate("https://sso.example.com/?jwt=abc")).toBe(true);
    // Still one `window.open`: the second step is a location write, which is what
    // makes it survive the popup blocker.
    expect(calls).toHaveLength(1);
    expect(children[0].location.href).toBe("https://sso.example.com/?jwt=abc");
  });

  it("applies the same scheme allow-list on navigate", () => {
    const win = Util.openWindow();
    expect(win.navigate("javascript:alert(1)")).toBe(false);
    expect(children[0].location.href).toBe("about:blank");
  });

  it("reports ok:false when the popup was blocked, and stays safe to drive", () => {
    openResult = null;
    const win = Util.openWindow();
    expect(win.ok).toBe(false);
    expect(win.closed).toBe(true);
    expect(win.navigate("https://example.com")).toBe(false);
    expect(() => {
      win.close();
    }).not.toThrow();
  });

  it("closes the context, and refuses to navigate a closed one", () => {
    const win = Util.openWindow();
    win.close();
    expect(win.closed).toBe(true);
    expect(children[0].closed).toBe(true);
    expect(win.navigate("https://example.com")).toBe(false);
    // Closing twice is the ordinary shape of an error path that also has a
    // dismiss button.
    expect(() => {
      win.close();
    }).not.toThrow();
  });

  it("reports closed when the USER closed the window", () => {
    const win = Util.openWindow();
    children[0].closed = true;
    expect(win.closed).toBe(true);
  });

  it("answers a closed handle rather than throwing when the host has no window", () => {
    Object.defineProperty(globalThis, "window", { value: undefined, configurable: true, writable: true });
    const win = Util.openWindow();
    expect(win.ok).toBe(false);
    expect(win.closed).toBe(true);
  });

  it("still returns a usable handle when the opener write is refused", () => {
    // A strict embedder can make `child.opener = null` throw. The mitigation is
    // best-effort; failing the open over it would be worse than the risk.
    openResult = null;
    const child = newChild();
    Object.defineProperty(child, "opener", {
      get: () => undefined,
      set: () => {
        throw new Error("refused");
      },
      configurable: true,
    });
    openResult = child;
    const win = Util.openWindow();
    expect(win.ok).toBe(true);
    expect(win.navigate("https://example.com")).toBe(true);
  });
});
