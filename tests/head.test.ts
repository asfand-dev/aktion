/**
 * Document head management — `$head({...})`. Sets the title / meta / Open
 * Graph / JSON-LD on the client, and feeds the resolved `<head>` to
 * `renderToString` so SSR pages are crawlable.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { renderToString } from "../src/runtime/ssr.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("$head (client)", () => {
  it("sets document.title from a component body", async () => {
    render(`
      function Page() {
        $head({ title: "Dashboard — Acme" })
        return Column([Text("body")])
      }
      $app(Page())
    `);
    await settle();
    expect(document.title).toBe("Dashboard — Acme");
  });

  it("injects managed meta tags into document.head", async () => {
    render(`
      function Page() {
        $head({ meta: { description: "A great page" }, og: { title: "OG Title" } })
        return Column([Text("body")])
      }
      $app(Page())
    `);
    await settle();
    const desc = document.head.querySelector('meta[name="description"]');
    expect(desc?.getAttribute("content")).toBe("A great page");
    const og = document.head.querySelector('meta[property="og:title"]');
    expect(og?.getAttribute("content")).toBe("OG Title");
  });

  it("re-applies a reactive title when state changes", async () => {
    const screen = render(`
      $name = "Ada"
      function Page() {
        $head({ title: \`\${$name} — Acme\` })
        return Button("Rename", { onClick: () => $name = "Linus" })
      }
      $app(Page())
    `);
    await settle();
    expect(document.title).toBe("Ada — Acme");
    await screen.click("Rename");
    await settle();
    expect(document.title).toBe("Linus — Acme");
  });
});

describe("$head (SSR)", () => {
  it("emits the resolved head from renderToString", () => {
    const { head } = renderToString(`
      function Page() {
        $head({
          title: "SSR Page",
          meta: { description: "hello world" },
          og: { title: "OG", image: "/img.png" },
          twitter: { card: "summary_large_image" },
          link: [{ rel: "canonical", href: "https://acme.com/p" }],
          jsonLd: { "@type": "Product", name: "Widget" }
        })
        return Column([Text("body")])
      }
      $app(Page())
    `);
    expect(head).toContain("<title>SSR Page</title>");
    expect(head).toContain('<meta name="description" content="hello world">');
    expect(head).toContain('<meta property="og:title" content="OG">');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(head).toContain('<link rel="canonical" href="https://acme.com/p">');
    expect(head).toContain('application/ld+json');
    expect(head).toContain('"@context":"https://schema.org"');
  });

  it("composes per-route head over a layout default (later wins)", () => {
    const { head } = renderToString(`
      function App() {
        $head({ title: "Default", meta: { description: "layout" } })
        $head({ title: "Product Page" })
        return Column([Text("body")])
      }
      $app(App())
    `);
    expect(head).toContain("<title>Product Page</title>");
    // The layout's meta still survives the merge.
    expect(head).toContain('content="layout"');
  });
});
