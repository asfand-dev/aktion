/**
 * Security regression tests for the escape-hatch component, cookie writes,
 * CSV export, and state-path writes.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("HTMLTag attribute filtering", () => {
  it("forces rel=noopener on a target=_blank anchor (reverse tabnabbing)", async () => {
    const screen = render(
      `$app(HTMLTag("a", { attributes: { href: "https://example.com", target: "_blank" }, children: [Text("go")] }))`,
    );
    await settle();
    const a = screen.shadowRoot.querySelector("a") as HTMLAnchorElement | null;
    expect(a).not.toBeNull();
    expect(a!.getAttribute("rel")).toContain("noopener");
    expect(a!.getAttribute("rel")).toContain("noreferrer");
  });

  it("preserves an author-supplied rel while still adding noopener", async () => {
    const screen = render(
      `$app(HTMLTag("a", { attributes: { href: "https://example.com", target: "_blank", rel: "author" }, children: [Text("go")] }))`,
    );
    await settle();
    const rel = screen.shadowRoot.querySelector("a")!.getAttribute("rel") ?? "";
    expect(rel.split(/\s+/)).toContain("author");
    expect(rel.split(/\s+/)).toContain("noopener");
  });

  it("does not add rel for target=_self", async () => {
    const screen = render(
      `$app(HTMLTag("a", { attributes: { href: "/x", target: "_self" }, children: [Text("go")] }))`,
    );
    await settle();
    expect(screen.shadowRoot.querySelector("a")!.getAttribute("rel")).toBeNull();
  });

  it("drops srcdoc and srcset", async () => {
    const screen = render(
      `$app(HTMLTag("img", { attributes: { src: "https://example.com/a.png", srcset: "javascript:globalThis.__pwned=1 1x", srcdoc: "<script>globalThis.__pwned=1</script>" } }))`,
    );
    await settle();
    const img = screen.shadowRoot.querySelector("img")!;
    expect(img.getAttribute("srcset")).toBeNull();
    expect(img.getAttribute("srcdoc")).toBeNull();
  });

  it("drops on* handlers regardless of case", async () => {
    const screen = render(
      `$app(HTMLTag("div", { attributes: { onclick: "globalThis.__pwned=1", ONMOUSEOVER: "globalThis.__pwned=1" }, children: [Text("x")] }))`,
    );
    await settle();
    const div = screen.shadowRoot.querySelector("div.rui-root > div") ?? screen.shadowRoot.querySelector("div");
    expect(div!.getAttribute("onclick")).toBeNull();
    expect(div!.getAttribute("onmouseover")).toBeNull();
  });

  it("sanitises a javascript: href", async () => {
    const screen = render(
      `$app(HTMLTag("a", { attributes: { href: "javascript:globalThis.__pwned=1" }, children: [Text("go")] }))`,
    );
    await settle();
    const href = screen.shadowRoot.querySelector("a")?.getAttribute("href");
    expect(href === null || href === "" || href === "#").toBe(true);
  });

  it("collapses a non-allow-listed tag to div", async () => {
    const screen = render(`$app(HTMLTag("iframe", { attributes: { src: "https://evil.example" } }))`);
    await settle();
    expect(screen.shadowRoot.querySelector("iframe")).toBeNull();
  });
});

describe("cookie attribute injection", () => {
  it("rejects a path that would append extra attributes", async () => {
    const { storage } = await import("../src/runtime/storage.js");
    // `path` was interpolated into the cookie string raw, so a `;` in it added
    // attributes of the caller's choosing (`Domain=`, `SameSite=None`, …).
    storage.cookies.set("ak_test_path", "1", { path: "/; Domain=evil.example; SameSite=None" } as never);
    expect(document.cookie).not.toContain("evil.example");
    // The cookie is still written, with the path collapsed to the default.
    // (`get` deserialises, so the numeric string round-trips as a number.)
    expect(storage.cookies.get("ak_test_path")).toBe(1);
  });

  it("always emits SameSite", async () => {
    // A cookie written with no SameSite is flagged by SonarQube / CodeQL and
    // leaves cross-site behaviour to differing browser defaults.
    const { storage } = await import("../src/runtime/storage.js");
    const writes: string[] = [];
    const doc = document as unknown as { cookie: string };
    // Find the accessor wherever it lives on the prototype chain.
    let owner: object | null = doc;
    let desc: PropertyDescriptor | undefined;
    while (owner && !desc) {
      desc = Object.getOwnPropertyDescriptor(owner, "cookie");
      if (!desc) owner = Object.getPrototypeOf(owner) as object | null;
    }
    expect(desc?.set).toBeTypeOf("function");
    const realSet = desc!.set!;
    const realGet = desc!.get!;
    Object.defineProperty(doc, "cookie", {
      configurable: true,
      get() { return realGet.call(doc); },
      set(v: string) { writes.push(v); realSet.call(doc, v); },
    });
    try {
      storage.cookies.set("ak_samesite", "1");
    } finally {
      delete (doc as unknown as Record<string, unknown>).cookie;
    }
    expect(writes).toHaveLength(1);
    expect(writes[0]!.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects a domain that is not a hostname", async () => {
    const { storage } = await import("../src/runtime/storage.js");
    storage.cookies.set("ak_test_dom", "1", { domain: "evil.example; Secure; SameSite=None" } as never);
    expect(document.cookie).not.toContain("SameSite=None");
  });

  it("tolerates an undecodable cookie already in the jar", async () => {
    const { storage } = await import("../src/runtime/storage.js");
    // A malformed percent escape used to make decodeURIComponent throw, which
    // aborted the whole read and made every cookie unreadable.
    document.cookie = "ak_broken=%E0%A4%A";
    storage.cookies.set("ak_good", "yes");
    expect(storage.cookies.get("ak_good")).toBe("yes");
  });
});

describe("CSV export — spreadsheet formula injection", () => {
  it("prefixes a formula-leading cell so it is read as text", async () => {
    const screen = render(
      `$app(DataGrid({ columns: [Col("Name", { values: ["=cmd|'/c calc'!A1", "+1+1", "@SUM(A1)", "-2+3", "ok"] })], exportable: true }))`,
    );
    await settle();
    // The export builder is internal, so assert through a download interception.
    const blobs: Blob[] = [];
    const realCreate = URL.createObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return "blob:mock";
    };
    try {
      const btn = [...screen.shadowRoot.querySelectorAll("button")]
        .find((b) => (b.textContent ?? "").includes("Export"));
      expect(btn).toBeDefined();
      btn!.click();
      await settle();
    } finally {
      (URL as unknown as { createObjectURL: typeof realCreate }).createObjectURL = realCreate;
    }
    expect(blobs).toHaveLength(1);
    const csv = await blobs[0]!.text();
    // Guard against a vacuous pass — the export must actually have produced a
    // CSV body for the assertions below to mean anything.
    expect(csv).not.toBe("");
    expect(csv).toContain("Name");
    // Every dangerous leading character must be neutralised.
    expect(csv).not.toMatch(/(^|,|\n)=cmd/);
    expect(csv).not.toMatch(/(^|,|\n)\+1\+1/);
    expect(csv).not.toMatch(/(^|,|\n)@SUM/);
    expect(csv).not.toMatch(/(^|,|\n)-2\+3/);
    expect(csv).toContain("'=cmd");
    // A benign value is left untouched.
    expect(csv).toContain("ok");
  });
});

describe("state path writes", () => {
  it("refuses a __proto__ segment", async () => {
    const screen = render(
      `$obj = { a: 1 }
$app(Column([
  Button("go", { onClick: () => { $obj["__proto__"]["polluted"] = "yes" } }),
  Text($obj.a)
]))`,
    );
    await settle();
    const btn = screen.shadowRoot.querySelector("button");
    btn?.click();
    await settle();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a constructor.prototype chain", async () => {
    const screen = render(
      `$obj = { a: 1 }
$app(Column([
  Button("go", { onClick: () => { $obj["constructor"]["prototype"]["polluted2"] = "yes" } }),
  Text($obj.a)
]))`,
    );
    await settle();
    screen.shadowRoot.querySelector("button")?.click();
    await settle();
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
  });
});
