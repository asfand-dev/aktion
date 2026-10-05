/**
 * WebComponent's `properties` description used to restate the blocked
 * property list by hand (in a different case, and short of three entries).
 * It is now built from the list `applyProperties` checks; this pins that
 * every name the description promises is skipped really is skipped.
 */

import { afterEach, describe, expect, it } from "vitest";
import { WebComponent } from "../src/library/components/interop.js";
import { cleanup, flush, render } from "../src/testing/index.js";

afterEach(() => cleanup());

const description = WebComponent.props.find((p) => p.name === "properties")!.description!;

/** The backticked names between "the built-in DOM properties" and "are silently skipped". */
const listed = (): string[] => {
  const start = description.indexOf("the built-in DOM properties");
  const end = description.indexOf("are silently skipped");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return [...description.slice(start, end).matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
};

const SENTINEL = "zz-blocked";

describe("WebComponent `properties`", () => {
  it("lists the blocked DOM properties and prototype keys", () => {
    expect(listed()).toEqual([
      "src", "href", "action", "formAction", "style", "id", "attributes", "shadowRoot",
      "contentEditable", "innerHTML", "outerHTML", "insertAdjacentHTML", "srcdoc",
      "constructor", "__proto__", "prototype",
    ]);
  });

  it.each(listed())("skips `%s`, as the description says", async (name) => {
    const properties = Object.fromEntries([[name, SENTINEL], ["chartData", [1, 2]]]);
    const screen = render(`$app(WebComponent("x-widget", { properties: $props }))`, { state: { props: properties } });
    await flush();
    const host = screen.shadowRoot.querySelector("x-widget") as unknown as Record<string, unknown>;
    expect(host.chartData, "an ordinary property still passes").toEqual([1, 2]);
    expect(host[name]).not.toBe(SENTINEL);
    expect(Object.getPrototypeOf(host)).not.toBe(SENTINEL);
  });

  it("skips them in any letter case", async () => {
    const screen = render(`$app(WebComponent("x-widget", { properties: { InnerHtml: "<b>x</b>", HREF: "javascript:x" } }))`);
    await flush();
    const host = screen.shadowRoot.querySelector("x-widget") as unknown as Record<string, unknown>;
    expect(host.InnerHtml).toBeUndefined();
    expect(host.HREF).toBeUndefined();
  });
});
