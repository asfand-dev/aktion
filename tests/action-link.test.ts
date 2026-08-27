/**
 * ActionLink — the chat primitive that RUNS something instead of navigating.
 *
 * It used to be `<a href="#" role="button">`, and every part of that was a
 * promise the platform did not keep:
 *
 *   1. `role="button"` tells a screen-reader user the control activates with
 *      Space. A native anchor activates on Enter only, so Space did nothing —
 *      the ARIA contract was a lie the moment it was written.
 *   2. `disabled` is not a valid attribute on `<a>`. An inert link therefore
 *      stayed focusable and announced as live.
 *   3. `#` leaked into the status bar on hover and into the URL on
 *      middle-click / open-in-new-tab.
 *
 * The fix was to render the element whose built-in behaviour already matches
 * the promise. So the first thing this file pins is the TAG, and the keyboard
 * tests below are written to fail if it ever drifts back.
 *
 * Two implementation details moved OUT of the component in the same pass, both
 * because inline anything is unthemeable: the icon gap (now
 * `.rui-action-link-icon`) and — the subtle one — `font: inherit`, whose fifth
 * longhand is `line-height`. Inline, that beat every stylesheet, so `vision`'s
 * `line-height: 20px` was a rule that could never fire. The inline style now
 * lists four longhands and says nothing about the line box.
 *
 * CSS is asserted against the exported stylesheet text, not `getComputedStyle`:
 * happy-dom does not cascade `:host(...)` rules out of an adopted stylesheet, so
 * a computed-style assertion would pass whatever the CSS said. Same technique as
 * `tests/callout-vision-anatomy.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { componentStyles } from "../src/theme/styles.js";
import { cleanup, flush, render, type Screen } from "../src/testing/index.js";

afterEach(() => cleanup());

async function settle(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Mount one program and hand back the screen plus its first ActionLink. */
async function mount(program: string): Promise<{ screen: Screen; el: HTMLButtonElement }> {
  const screen = render(program);
  await settle();
  const el = screen.shadowRoot.querySelector(".rui-action-link") as HTMLButtonElement;
  expect(el, "no .rui-action-link rendered").toBeTruthy();
  return { screen, el };
}

/**
 * Which keys the PLATFORM activates an element with, straight out of the HTML
 * spec's activation-behaviour table.
 *
 * happy-dom dispatches a `KeyboardEvent` but implements no activation behaviour,
 * so a bare `keydown` would leave every keyboard assertion vacuous. This supplies
 * the UA's half — and deliberately supplies it *per element type*, so the
 * assertions still turn on WHICH ELEMENT the component rendered, which is the
 * thing under test. An `<a href>` gets Enter and not Space; anything wearing
 * `role="button"` without being one gets neither, exactly as a real browser
 * behaves and exactly the trap this component was rewritten to escape.
 */
function activatesOn(el: Element, key: string): boolean {
  if (el.tagName === "BUTTON") return key === "Enter" || key === " ";
  if (el.tagName === "A") return el.hasAttribute("href") && key === "Enter";
  return false;
}

/**
 * The button's own children in DOM order, as `"icon"` / `"label"`.
 *
 * Read from `childNodes`, not `children`: the label is a bare text node, so the
 * glyph is the only ELEMENT child and `firstElementChild` === `lastElementChild`
 * — an order assertion phrased that way passes whichever side the icon is on.
 */
function order(el: Element): string[] {
  return [...el.childNodes]
    .filter((n) => n.nodeType === 1 || (n.textContent ?? "").trim() !== "")
    .map((n) => (n.nodeType === 1 ? "icon" : "label"));
}

/** Press `key` on `el` the way a user would, UA activation included. */
async function press(el: HTMLElement, key: string): Promise<void> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  if (!event.defaultPrevented && activatesOn(el, key)) el.click();
  el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  await settle();
}

const COUNTER = `$runs = 0`;
const BUMP = `onClick: () => { $runs = $runs + 1 }`;

describe("ActionLink renders a button, not a dressed-up anchor", () => {
  it("is a <button type=button>", async () => {
    const { el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    expect(el.tagName).toBe("BUTTON");
    // `type` is explicit because a bare <button> inside a <form> defaults to
    // submit — an action link that posts the surrounding form is a worse bug
    // than the one this component started with.
    expect(el.getAttribute("type")).toBe("button");
  });

  it("carries no href and no redundant role", async () => {
    const { screen, el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    expect(el.hasAttribute("href")).toBe(false);
    // A native button already HAS the button role; restating it is the smell
    // that preceded the bug.
    expect(el.getAttribute("role")).toBeNull();
    expect(screen.shadowRoot.querySelector("a.rui-action-link")).toBeNull();
  });

  it("still announces as a button, named by its visible text", async () => {
    const { screen } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("activates on Enter", async () => {
    const { screen, el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    await press(el, "Enter");
    expect(screen.state.get("runs")).toBe(1);
  });

  it("activates on Space — the promise `role=button` on an anchor could not keep", async () => {
    const { screen, el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    await press(el, " ");
    expect(screen.state.get("runs")).toBe(1);
  });

  it("needs no key handling of its own — the element supplies both keys", async () => {
    // Enter then Space on the same instance: two activations, no bookkeeping in
    // the component. That is the entire argument for the tag change.
    const { screen, el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    await press(el, "Enter");
    await press(el, " ");
    expect(screen.state.get("runs")).toBe(2);
  });

  it("the UA emulation discriminates, so the two tests above are not rubber stamps", async () => {
    // Guard for `activatesOn`. If it activated everything, "Space works" would
    // pass for the old `<a href="#" role="button">` too — which is precisely
    // the arrangement that shipped broken.
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#");
    anchor.setAttribute("role", "button");
    expect(activatesOn(anchor, "Enter")).toBe(true);
    expect(activatesOn(anchor, " ")).toBe(false);

    const span = document.createElement("span");
    span.setAttribute("role", "button");
    expect(activatesOn(span, "Enter")).toBe(false);
    expect(activatesOn(span, " ")).toBe(false);
  });
});

describe("ActionLink disabled", () => {
  it("clicking an enabled link runs the action", async () => {
    // The control case for the two tests below: without it, "nothing happened"
    // cannot be told apart from "the program never wired anything up".
    const { screen, el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    await screen.user.click(el);
    expect(screen.state.get("runs")).toBe(1);
  });

  it("disabled: true sets the attribute and attaches no handler at all", async () => {
    const { screen, el } = await mount(
      `${COUNTER}\n$app(ActionLink("Retry", { disabled: true, ${BUMP} }))`,
    );
    expect(el.hasAttribute("disabled")).toBe(true);
    // A raw dispatched click, not `.click()`: the DOM refuses to activate a
    // disabled button on its own, so `.click()` would report success even if the
    // component HAD wired the handler up. Dispatching straight at the node
    // bypasses that shield and asks the real question — is there a handler? —
    // which is what matters for a link that a stylesheet or a host could make
    // clickable again.
    await screen.fireEvent(el, "click");
    expect(screen.state.get("runs")).toBe(0);
  });

  it("disabled: false sets NO attribute — `disabled=\"false\"` is still disabled", async () => {
    // `el()` drops a `false` attribute value entirely, which is the only correct
    // handling: the HTML attribute is boolean, so ANY value — including the
    // string "false" — disables the control. An author writing
    // `disabled: $busy` with `$busy` false must get a live link.
    const { screen, el } = await mount(
      `${COUNTER}\n$app(ActionLink("Retry", { disabled: false, ${BUMP} }))`,
    );
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.disabled).toBe(false);
    await screen.user.click(el);
    expect(screen.state.get("runs")).toBe(1);
  });
});

describe("ActionLink accessible name", () => {
  it("without ariaLabel, the visible text is the name", async () => {
    const { el } = await mount(`${COUNTER}\n$app(ActionLink("View logs", { ${BUMP} }))`);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  it("ariaLabel overrides the visible text for assistive tech", async () => {
    const { screen, el } = await mount(
      `${COUNTER}\n$app(ActionLink("Rebuild", { ariaLabel: "Rebuild node dc-fra-1", ${BUMP} }))`,
    );
    expect(el.getAttribute("aria-label")).toBe("Rebuild node dc-fra-1");
    expect(screen.getByRole("button", { name: "Rebuild node dc-fra-1" })).toBe(el);
    // The visible label stays terse — the name is no longer the text.
    expect(screen.queryByRole("button", { name: "Rebuild" })).toBeNull();
    expect(el.textContent).toContain("Rebuild");
  });

  it("gives every row of a repeated action a distinct name", async () => {
    // The reason the prop exists. Three identical "Rebuild node" links in a
    // table announce identically, so a screen-reader user tabbing the column
    // hears the same three words and cannot tell which node they are about to
    // rebuild.
    const { screen } = await mount(`${COUNTER}
$app(Column([
  ActionLink("Rebuild node", { ariaLabel: "Rebuild node dc-fra-1", ${BUMP} }),
  ActionLink("Rebuild node", { ariaLabel: "Rebuild node dc-fra-2", ${BUMP} }),
  ActionLink("Rebuild node", { ariaLabel: "Rebuild node dc-txl-1", ${BUMP} })
]))`);
    const links = [...screen.shadowRoot.querySelectorAll(".rui-action-link")];
    expect(links).toHaveLength(3);
    // Visibly identical…
    expect(links.map((l) => l.textContent)).toEqual([
      "Rebuild node", "Rebuild node", "Rebuild node",
    ]);
    // …but three different things to a screen reader.
    const named = ["dc-fra-1", "dc-fra-2", "dc-txl-1"].map((id) =>
      screen.getByRole("button", { name: `Rebuild node ${id}` }),
    );
    expect(new Set(named).size).toBe(3);
    expect(screen.queryAllByRole("button", { name: "Rebuild node" })).toHaveLength(0);
  });
});

describe("ActionLink icon", () => {
  it("marks the icon side on the button so CSS can flip the gap", async () => {
    const { el } = await mount(
      `${COUNTER}\n$app(ActionLink("Download CSV", { icon: "download", ${BUMP} }))`,
    );
    expect(el.classList.contains("has-icon")).toBe(true);
    expect(el.getAttribute("data-icon-position")).toBe("start");
    // Order matters: the glyph precedes the label in the DOM, so the reading
    // order and the visual order agree without CSS reordering anything.
    expect(order(el)).toEqual(["icon", "label"]);
    expect(el.querySelector(".rui-action-link-icon")).toBeTruthy();
  });

  it("iconPosition: end moves the glyph after the label, in the DOM too", async () => {
    const { el } = await mount(
      `${COUNTER}\n$app(ActionLink("Open", { icon: "arrow-right", iconPosition: "end", ${BUMP} }))`,
    );
    expect(el.getAttribute("data-icon-position")).toBe("end");
    expect(el.classList.contains("has-icon")).toBe(true);
    // The node moves, it is not just re-styled: `order: 1` would leave a screen
    // reader and a text-only copy of the button with the glyph still in front.
    expect(order(el)).toEqual(["label", "icon"]);
    expect(el.querySelector(".rui-action-link-icon")).toBeTruthy();
  });

  it("with no icon sets NEITHER the class nor the attribute", async () => {
    // Both are load-bearing absences: `vision` draws its chevron with
    // `:not(.has-icon)::before`, so a `has-icon` class on an iconless link
    // silently deletes the affordance, and a `data-icon-position` with no icon
    // to position is a selector that matches nothing forever.
    const { el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    expect(el.classList.contains("has-icon")).toBe(false);
    expect(el.hasAttribute("data-icon-position")).toBe(false);
    expect(el.querySelector(".rui-action-link-icon")).toBeNull();
  });

  it("hides the glyph from assistive tech", async () => {
    // The icon repeats the label's meaning. Announced, it becomes "download
    // Download CSV".
    const { screen, el } = await mount(
      `${COUNTER}\n$app(ActionLink("Download CSV", { icon: "download", ${BUMP} }))`,
    );
    const icon = el.querySelector(".rui-action-link-icon")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    // The name is the label alone, with nothing from the glyph in it.
    expect(screen.getByRole("button", { name: "Download CSV" })).toBe(el);
  });
});

describe("ActionLink's chrome reset is themeable", () => {
  it("writes no inline style at all", async () => {
    // The whole reset used to be inline, where it outranked every rule a theme
    // could write — a theme could not give the control padding, a hover wash or
    // a line box. It moved into `.rui-action-link`, the same move the icon gap
    // made below and for the same reason.
    const { el } = await mount(`${COUNTER}\n$app(ActionLink("Retry", { ${BUMP} }))`);
    expect(el.getAttribute("style")).toBeNull();
  });

  it("resets the UA chrome with the four font LONGHANDS, never `font`", async () => {
    // `font: inherit` sets a fifth property — `line-height` — so a theme that
    // sets one on this control (vision does: 20px) would have a dead rule. The
    // four longhands inherit exactly what the shorthand did and leave the line
    // box alone.
    const body = ruleBody(componentStyles, "\n.rui-action-link {");
    for (const decl of [
      "background: none",
      "border: 0",
      "padding: 0",
      "text-align: inherit",
      "font-family: inherit",
      "font-size: inherit",
      "font-weight: inherit",
      "font-style: inherit",
    ]) {
      expect(body, `missing ${decl}`).toContain(decl);
    }
    expect(body, "the shorthand would take line-height with it").not.toMatch(/[^-]font\s*:/);
    expect(body).not.toContain("line-height");
  });

  it("no longer writes the icon gap inline", async () => {
    // It moved to `.rui-action-link-icon` precisely so a theme with different
    // link metrics can change it; an inline margin cannot be overridden at all.
    const { el } = await mount(
      `${COUNTER}\n$app(ActionLink("Download CSV", { icon: "download", ${BUMP} }))`,
    );
    const icon = el.querySelector(".rui-action-link-icon") as HTMLElement;
    expect(icon.style.marginRight).toBe("");
    expect(icon.style.marginInlineEnd).toBe("");
  });
});

/** Body of the first rule whose selector list contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
}

const VISION = ':host([data-rui-theme="vision"])';

describe("the ActionLink stylesheet block", () => {
  it("shows a disabled link as disabled", async () => {
    // The component has honoured `disabled` functionally since it shipped — the
    // handler is simply never attached — but looked entirely live, so the only
    // way to find out a link was inert was to click it and watch nothing happen.
    // The leading newline anchors this to the BASE rule; `vision` has its own.
    const base = ruleBody(componentStyles, "\n.rui-action-link:disabled {");
    expect(base).toContain("opacity: 0.5;");
    expect(base).toContain("cursor: not-allowed;");
    // Underlined-but-inert reads as a live link even greyed out.
    expect(base).toContain("text-decoration: none;");
  });

  it("puts the icon gap on the side the icon is on", async () => {
    const start = ruleBody(componentStyles, "\n.rui-action-link-icon {");
    expect(start).toContain("margin-inline-end: 0.35em;");
    // Logical properties, not margin-right: this flips itself in RTL.
    const end = ruleBody(
      componentStyles,
      '.rui-action-link[data-icon-position="end"] .rui-action-link-icon {',
    );
    // Both halves are needed — setting the start margin without clearing the end
    // one leaves a gap on each side of a trailing glyph.
    expect(end).toContain("margin-inline-end: 0;");
    expect(end).toContain("margin-inline-start: 0.35em;");
  });

  it("focuses the vision link in interactive blue, not the base navy ring", async () => {
    // This control was the one vision link falling through to the base
    // `:focus-visible` rule, which draws the navy `--rui-color-primary` ring
    // while every other vision control focuses on `--rui-color-focus-ring`.
    const vision = ruleBody(componentStyles, `${VISION} .rui-action-link:focus-visible {`);
    expect(vision).toContain("outline: 2px solid var(--rui-color-focus-ring);");
    expect(vision).not.toContain("--rui-color-primary");
    // An outline rather than the inset shadow the boxed controls use: there is
    // no box here to inset into.
    expect(vision).toContain("outline-offset:");
  });

  it("dims the vision disabled link further than the base sheet does", async () => {
    const vision = ruleBody(componentStyles, `${VISION} .rui-action-link:disabled {`);
    expect(vision).toContain("opacity: 0.38;");
  });
});
