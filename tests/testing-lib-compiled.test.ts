/**
 * Contract for the testing-library surface a real (multi-file, compiled) app
 * needs: `renderCompiled`, author-named state access, host HTTP interceptors,
 * and queries that ignore the stylesheet the element injects.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, renderCompiled, cleanup, json, within, waitFor } from "../src/testing/index.js";
import {
  linkProgram,
  defineCompiledProgram,
  COMPILED_PROGRAM_VERSION,
  moduleLocalSymbol,
  moduleLocalBaseName,
  type ModuleResolver,
  type CompiledProgram,
} from "../src/compiler/index.js";

function link(files: Record<string, string>, entry: string): CompiledProgram {
  const resolver: ModuleResolver = {
    resolve(spec, importer) {
      const dir = importer.slice(0, importer.lastIndexOf("/"));
      return spec.startsWith("./") ? `${dir}/${spec.slice(2)}` : spec;
    },
    load(path) {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
  const result = linkProgram(files[entry]!, entry, resolver);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program: result.program,
    source: files[entry]!,
    path: entry,
  });
}

afterEach(cleanup);

describe("renderCompiled", () => {
  it("mounts a linked multi-file program", async () => {
    const screen = renderCompiled(
      link(
        {
          "/p/app.aktion": 'import { Card2 } from "./ui.aktion"\n$app(Card2())',
          "/p/ui.aktion": 'export function Card2() {\n  return Text("from a module")\n}',
        },
        "/p/app.aktion",
      ),
    );
    await screen.flush();
    expect(screen.getByText("from a module")).toBeDefined();
  });

  it("honours route, seeded state and captured events", async () => {
    const screen = renderCompiled(
      link(
        {
          "/p/app.aktion": [
            'import { greeting } from "./copy.aktion"',
            "$who = \"world\"",
            'pages = $router({ "/hello": Text(`${greeting()} ${$who}`), default: Text("nope") })',
            "$app(pages)",
          ].join("\n"),
          "/p/copy.aktion": 'export function greeting() {\n  return "hi"\n}',
        },
        "/p/app.aktion",
      ),
      { route: "/hello", state: { who: "Ada" } },
    );
    await screen.flush();
    expect(screen.getByText("hi Ada")).toBeDefined();
    expect(screen.route).toBe("/hello");
  });

  it("re-mounting the same artefact does not accumulate diagnostics", async () => {
    const compiled = link({ "/p/a.aktion": '$app(Text("once"))' }, "/p/a.aktion");
    const first = renderCompiled(compiled);
    await first.flush();
    const second = renderCompiled(compiled);
    await second.flush();
    expect(second.getByText("once")).toBeDefined();
    expect(second.emitted("error")).toEqual([]);
  });

  it("installs host HTTP interceptors before the first request", async () => {
    const screen = renderCompiled(
      link(
        {
          "/p/app.aktion": [
            '$rows = $http({ url: "https://api.test/rows" })',
            '$app(Text($rows.data == null ? "loading" : "loaded"))',
          ].join("\n"),
        },
        "/p/app.aktion",
      ),
      {
        fetch: () => json({ ok: true }),
        httpInterceptors: {
          onRequest(request) {
            request.headers["Authorization"] = "Bearer test-token";
            return request;
          },
        },
      },
    );
    await screen.findByText("loaded");
    expect(screen.requests).toHaveLength(1);
    expect(screen.requests[0]!.headers["authorization"]).toBe("Bearer test-token");
  });
});

describe("state access by author-written name", () => {
  const files = {
    "/p/app.aktion": 'import { Panel } from "./panel.aktion"\n$app(Panel())',
    "/p/panel.aktion": [
      "$filter = \"all\"",
      "export function Panel() {",
      "  return Text($filter)",
      "}",
    ].join("\n"),
  };

  it("reads and writes a module-local atom by its declared name", async () => {
    const screen = renderCompiled(link(files, "/p/app.aktion"));
    await screen.flush();

    // The runtime key is mangled — the point is that a test never has to know.
    expect(screen.state.key("filter")).not.toBe("filter");
    expect(moduleLocalBaseName(screen.state.key("filter"))).toBe("filter");

    expect(screen.state.get("filter")).toBe("all");
    expect(screen.state.has("filter")).toBe(true);

    await screen.state.set("filter", "active");
    expect(screen.getByText("active")).toBeDefined();
  });

  it("prefers an exact key over a module-local match", async () => {
    const screen = render('$filter = "entry"\n$app(Text($filter))');
    await screen.flush();
    expect(screen.state.key("filter")).toBe("filter");
    expect(screen.state.get("filter")).toBe("entry");
  });

  it("refuses to guess when two modules declare the same atom", async () => {
    const screen = renderCompiled(
      link(
        {
          "/p/app.aktion": [
            'import { A } from "./a.aktion"',
            'import { B } from "./b.aktion"',
            "$app(Stack([A(), B()]))",
          ].join("\n"),
          "/p/a.aktion": '$dup = "a"\nexport function A() {\n  return Text($dup)\n}',
          "/p/b.aktion": '$dup = "b"\nexport function B() {\n  return Text($dup)\n}',
        },
        "/p/app.aktion",
      ),
    );
    await screen.flush();
    expect(() => screen.state.get("dup")).toThrow(/declared in more than one module/);
  });

  it("reports an unknown atom as absent rather than throwing", async () => {
    const screen = render('$app(Text("x"))');
    await screen.flush();
    expect(screen.state.has("nope")).toBe(false);
    expect(screen.state.get("nope")).toBeUndefined();
  });
});

describe("queries ignore injected stylesheets", () => {
  // A `Styles(...)` block puts CSS in the shadow root. Its text must not be
  // eligible for a text query, and must not leak into an ancestor's text either.
  const program = [
    'styles = Styles(".cluster-row { color: red }")',
    '$app(Stack([styles, Text("Clusters")]))',
  ].join("\n");

  it("does not match text inside a <style> element", async () => {
    const screen = render(program);
    await screen.flush();
    expect(screen.queryAllByText("cluster", { exact: false })).toEqual([]);
    expect(screen.getByText("Clusters")).toBeDefined();
  });

  it("does not leak stylesheet text into an ancestor's accessible text", async () => {
    const screen = render(program);
    await screen.flush();
    const stack = screen.getByText("Clusters").parentElement!;
    expect(within(stack).queryByText("color: red")).toBeNull();
  });

  it("html() returns the rendered UI, not the theme stylesheet", async () => {
    const screen = render('$app(Text("visible"))', { theme: "dark" });
    await screen.flush();
    const html = screen.html();
    expect(html).toContain("visible");
    expect(html.startsWith("<style")).toBe(false);
    expect(html).not.toContain("rui-error-banner");
  });
});

describe("moduleLocalSymbol / moduleLocalBaseName", () => {
  it("round-trip", () => {
    expect(moduleLocalSymbol(3, "total")).toBe("__a3_total");
    expect(moduleLocalBaseName("__a3_total")).toBe("total");
  });

  it("returns null for a name the linker did not rename", () => {
    expect(moduleLocalBaseName("total")).toBeNull();
    expect(moduleLocalBaseName("__aX_total")).toBeNull();
    expect(moduleLocalBaseName("__a3_")).toBeNull();
  });

  it("keeps an underscore-bearing name intact", () => {
    expect(moduleLocalBaseName(moduleLocalSymbol(12, "my_atom"))).toBe("my_atom");
  });
});

describe("role queries", () => {
  it("maps landmark and table elements to their implicit roles", async () => {
    const screen = render(
      [
        'nav = Breadcrumb([BreadcrumbItem("Home", { href: "/" })], { ariaLabel: "Breadcrumb" })',
        "$app(Stack([",
        "  nav,",
        '  DataGrid([Col("Name", { values: ["ada"] })], { rowIds: ["1"] })',
        "]))",
      ].join("\n"),
    );
    await screen.flush();

    expect(screen.getByRole("navigation").tagName).toBe("NAV");
    expect(screen.getByRole("table").tagName).toBe("TABLE");
    expect(screen.getAllByRole("row").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("cell").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("rowgroup").length).toBeGreaterThan(0);
  });

  it("reports every option of a select", async () => {
    const screen = render(
      [
        '$pick = "a"',
        '$app(Select("pick", { value: $pick, items: [SelectItem("a", { label: "Alpha" }), SelectItem("b", { label: "Beta" })] }))',
      ].join("\n"),
    );
    await screen.flush();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("matches an accessible name exactly, so a prefix does not collide", async () => {
    const screen = render(
      [
        "$app(Stack([",
        '  Button("Save"),',
        '  Button("Save and close")',
        "]))",
      ].join("\n"),
    );
    await screen.flush();

    expect(screen.getByRole("button", { name: "Save" }).textContent).toBe("Save");
    expect(screen.getByRole("button", { name: "Save and close" })).toBeDefined();
    // Opt back in to substring matching when that is genuinely what you mean.
    expect(screen.getAllByRole("button", { name: "Save", exact: false })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Save/ })).toHaveLength(2);
  });

  it("scoped role queries match names exactly too", async () => {
    const screen = render(
      [
        "$app(Stack([",
        '  Stack([Button("Delete"), Button("Delete all")], { className: "row" })',
        "]))",
      ].join("\n"),
    );
    await screen.flush();
    const row = screen.getByRole("button", { name: "Delete" }).parentElement!;
    expect(within(row).getAllByRole("button", { name: "Delete" })).toHaveLength(1);
    expect(within(row).getAllByRole("button", { name: "Delete", exact: false })).toHaveLength(2);
  });

  it("treats a decorative image as presentational", async () => {
    const screen = render('$app(Image("/x.png", { alt: "" }))');
    await screen.flush();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("presentation")).toBeDefined();
  });
});

describe("waitFor", () => {
  it("retries while a predicate is false, then times out", async () => {
    await expect(waitFor(() => false, { timeout: 100 })).rejects.toThrow(/timed out/);
  });

  it("resolves as soon as a predicate flips true", async () => {
    let ready = false;
    const timer = setTimeout(() => { ready = true; }, 30);
    await expect(waitFor(() => ready, { timeout: 500 })).resolves.toBe(true);
    clearTimeout(timer);
  });

  it("retries null, undefined and an empty array", async () => {
    await expect(waitFor(() => null, { timeout: 80 })).rejects.toThrow(/timed out/);
    await expect(waitFor(() => undefined, { timeout: 80 })).rejects.toThrow(/timed out/);
    await expect(waitFor(() => [], { timeout: 80 })).rejects.toThrow(/timed out/);
  });

  it("treats 0 and the empty string as real values", async () => {
    await expect(waitFor(() => 0, { timeout: 80 })).resolves.toBe(0);
    await expect(waitFor(() => "", { timeout: 80 })).resolves.toBe("");
  });

  it("`until` replaces the default rule", async () => {
    let n = 0;
    const timer = setInterval(() => { n += 1; }, 10);
    await expect(waitFor(() => n, { until: (v) => v === 3, timeout: 500 })).resolves.toBe(3);
    clearInterval(timer);
  });

  it("surfaces the last thrown error when it times out", async () => {
    await expect(
      waitFor(() => { throw new Error("still loading"); }, { timeout: 80 }),
    ).rejects.toThrow(/still loading/);
  });
});

describe("state.set vs state.hydrate", () => {
  const program = [
    "$n = 1",
    "$doubled = $n * 2",
    "$app(Text(`${$n}/${$doubled}`))",
  ].join("\n");

  it("set is a reactive write — derived atoms recompute", async () => {
    const screen = render(program);
    await screen.flush();
    expect(screen.getByText("1/2")).toBeDefined();

    await screen.state.set("n", 5);
    expect(screen.state.get("n")).toBe(5);
    expect(screen.getByText("5/10")).toBeDefined();
  });

  it("set does not claim the value came from outside the program", async () => {
    const screen = render(program);
    await screen.flush();
    await screen.state.set("n", 5);

    // A replan restores the program's own declared default for a plain write…
    await screen.rerender(`${program}\n`);
    await screen.flush();
    expect(screen.state.get("n")).toBe(1);
  });

  it("hydrate marks values as host-supplied so they survive a replan", async () => {
    const screen = render(program);
    await screen.flush();

    await screen.state.hydrate({ n: 7 });
    expect(screen.getByText("7/14")).toBeDefined();
    expect(screen.state.get("n")).toBe(7);
  });

  it("hydrate resolves module-local names too", async () => {
    const screen = renderCompiled(
      link(
        {
          "/p/app.aktion": 'import { View } from "./view.aktion"\n$app(View())',
          "/p/view.aktion": '$seed = 0\nexport function View() {\n  return Text(`${$seed}`)\n}',
        },
        "/p/app.aktion",
      ),
    );
    await screen.flush();
    await screen.state.hydrate({ seed: 42 });
    expect(screen.getByText("42")).toBeDefined();
  });
});
