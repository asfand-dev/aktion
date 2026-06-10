/**
 * The Aktion-built homepage (docs/index.aktion) must always parse and render
 * error-free with the current library — it dogfoods NavBar, Backdrop,
 * CodeWindow live previews, Bento, Calendar, Swatch, Table, and Footer.
 */
import { it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import "../src/index.js";
import { parse } from "../src/parser/index.js";

const flush = (): Promise<void> => new Promise<void>((r) => queueMicrotask(() => r()));
const settle = async (n = 10): Promise<void> => { for (let i = 0; i < n; i += 1) await flush(); };
afterEach(() => { document.body.innerHTML = ""; });

it("docs/index.aktion parses and renders without errors", async () => {
  const src = readFileSync("docs/index.aktion", "utf-8");
  expect(() => parse(src)).not.toThrow();
  const el = document.createElement("aktion-app") as HTMLElement & { setResponse(t: string): void };
  document.body.appendChild(el);
  el.setResponse(src);
  await settle(12);
  const sr = el.shadowRoot!;
  const errors = [...sr.querySelectorAll(".rui-render-error, .rui-unknown-component")].map(e => e.textContent);
  expect(errors).toEqual([]);
  // key sections present
  expect(sr.querySelector(".rui-navbar2")).toBeTruthy();
  expect(sr.querySelectorAll(".rui-codewindow").length).toBeGreaterThanOrEqual(4);
  expect(sr.querySelector(".rui-backdrop")).toBeTruthy();
  expect(sr.querySelectorAll(".rui-bento-cell").length).toBe(10);
  expect(sr.querySelector(".rui-gcal")).toBeTruthy();
  expect(sr.querySelectorAll(".rui-swatch").length).toBe(8);
  expect(sr.querySelector(".rui-footer")).toBeTruthy();
  expect(sr.querySelectorAll(".rui-metric").length).toBeGreaterThanOrEqual(4);
  expect(sr.textContent).toContain("270+ components");
  // Every code window must actually carry source (an unparsed multi-line
  // binding once produced empty panes) and the live previews must hold it.
  for (const pane of sr.querySelectorAll(".rui-codewindow-code")) {
    expect((pane.textContent ?? "").trim().length).toBeGreaterThan(20);
  }
  const hero = sr.querySelector(".rui-codewindow-preview aktion-app");
  expect(hero?.getAttribute("response")).toContain("Project Atlas");
});
