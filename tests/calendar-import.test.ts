/**
 * Tests for Calendar (VIII.6) and the HTML → Aktion importer (XIV.1).
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { htmlToAktion } from "../src/tooling/index.js";
import { parse } from "../src/parser/index.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await flush(); };
type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("Calendar (VIII.6)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders a month grid with full weeks and the right in-month days", async () => {
    const el = create();
    // February 2024 (leap year) has 29 days; month index 1. Feb 1 2024 is a
    // Thursday, so the Google-style grid pads to 5 full weeks (35 cells).
    el.setResponse(`$app(Calendar({ month: 1, year: 2024 }))`);
    await settle();
    const inMonth = el.shadowRoot?.querySelectorAll('.rui-gcal-day[data-in-month="true"]');
    expect(inMonth?.length).toBe(29);
    expect(el.shadowRoot?.querySelectorAll(".rui-gcal-day").length).toBe(35);
    expect(el.shadowRoot?.querySelectorAll(".rui-gcal-weekday").length).toBe(7);
    expect(el.shadowRoot?.querySelector(".rui-gcal-title")?.textContent).toBe("February 2024");
  });

  it("marks the selected day, dots string events, and chips object events", async () => {
    const el = create();
    el.setResponse(`$app(Calendar({ month: 1, year: 2024, selected: "2024-02-14", events: ["2024-02-14", "2024-02-20", { date: "2024-02-09", label: "Design review", color: "success" }] }))`);
    await settle();
    const sel = el.shadowRoot?.querySelector('.rui-gcal-day[data-selected="true"]') as HTMLElement;
    expect(sel?.getAttribute("data-iso")).toBe("2024-02-14");
    expect(sel?.getAttribute("aria-label")).toBe("February 14, 2024");
    expect(el.shadowRoot?.querySelectorAll(".rui-gcal-dot").length).toBe(2);
    const chip = el.shadowRoot?.querySelector(".rui-gcal-chip") as HTMLElement;
    expect(chip?.textContent).toBe("Design review");
  });

  it("fires onSelect with the ISO date", async () => {
    const el = create();
    el.setResponse(`$picked = ""
$app(Column([Text(\`p:\${$picked}\`), Calendar({ month: 1, year: 2024, onSelect: (iso) => { $picked = iso } })]))`);
    await settle();
    const day = [...(el.shadowRoot?.querySelectorAll(".rui-gcal-day") ?? [])].find((d) => d.getAttribute("data-iso") === "2024-02-10") as HTMLButtonElement;
    day.click();
    await settle();
    expect(el.shadowRoot?.textContent).toContain("p:2024-02-10");
  });

  it("pages months with the toolbar and jumps back with Today", async () => {
    const el = create();
    el.setResponse(`$app(Calendar({ month: 1, year: 2024 }))`);
    await settle();
    const next = el.shadowRoot?.querySelector('.rui-gcal-nav[data-dir="next"]') as HTMLButtonElement;
    next.click();
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-gcal-title")?.textContent).toBe("March 2024");
    const prev = el.shadowRoot?.querySelector('.rui-gcal-nav[data-dir="prev"]') as HTMLButtonElement;
    prev.click();
    prev.click();
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-gcal-title")?.textContent).toBe("January 2024");
    const today = el.shadowRoot?.querySelector(".rui-gcal-today") as HTMLButtonElement;
    today.click();
    await settle();
    const now = new Date();
    expect(el.shadowRoot?.querySelector(".rui-gcal-title")?.textContent).toContain(String(now.getFullYear()));
  });

  it("hides the toolbar controls when navigable is false", async () => {
    const el = create();
    el.setResponse(`$app(Calendar({ month: 1, year: 2024, navigable: false }))`);
    await settle();
    expect(el.shadowRoot?.querySelector(".rui-gcal-nav")).toBeNull();
    expect(el.shadowRoot?.querySelector(".rui-gcal-today")).toBeNull();
    expect(el.shadowRoot?.querySelector(".rui-gcal-title")?.textContent).toBe("February 2024");
  });
});

describe("htmlToAktion importer (XIV.1)", () => {
  it("maps headings, paragraphs, and links", () => {
    const out = htmlToAktion(`<section><h1>Hello</h1><p>Body text</p><a href="/x">Go</a></section>`);
    expect(out).toContain("Section(");
    expect(out).toContain('Display("Hello")');
    expect(out).toContain('Text("Body text")');
    expect(out).toContain('Link("Go", { href: "/x" })');
  });

  it("maps images and buttons", () => {
    const out = htmlToAktion(`<img src="a.png" alt="pic"><button>Click</button>`);
    expect(out).toContain('Image("a.png", { alt: "pic" })');
    expect(out).toContain('Button("Click")');
  });

  it("produces parseable Aktion for multiple roots", () => {
    const out = htmlToAktion(`<h1>A</h1><p>B</p>`);
    expect(out).toContain('Display("A")');
    expect(out).toContain('Text("B")');
    // The generated program must parse without throwing.
    expect(() => parse(out)).not.toThrow();
  });

  it("renders the imported program in a live element", async () => {
    const el = create();
    const program = htmlToAktion(`<section><h2>Imported</h2><p>From HTML</p></section>`);
    el.setResponse(program);
    await settle();
    expect(el.shadowRoot?.textContent).toContain("Imported");
    expect(el.shadowRoot?.textContent).toContain("From HTML");
  });
});
