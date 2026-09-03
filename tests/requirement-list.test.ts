/**
 * RequirementList — the checklist a field points `aria-describedby` at.
 *
 * The component exists because a single `error` string cannot answer "which of
 * these rules did I break?": it restates every rule at once and leaves the
 * reader to diff the sentence against what they typed. So the value of this
 * component is entirely in the per-row verdict, and that verdict has to reach
 * three different readers intact:
 *
 *   1. A sighted reader, via the glyph and the colour.
 *   2. A screen-reader user, via a visually-hidden word — the glyph is
 *      `aria-hidden` and the colour does not exist for them at all.
 *   3. A reader on an UNTOUCHED form, who must be told nothing. This is the
 *      subtle one and it is why `met` is tri-state: "not evaluated yet" is not
 *      "you broke this rule", and a red cross on a field nobody has typed into
 *      accuses the reader of a mistake they have not made.
 *
 * (3) is one `asBoolean` away from being lost — that helper maps `undefined`
 * and `null` to `false`, i.e. to a verdict — so the "null / undefined stay
 * pending" cases below are the load-bearing ones in this file. An "improvement"
 * that routed `met` through `asBoolean` would still render, still pass every
 * structural gate, and quietly paint every fresh password form red.
 *
 * Most cases render the spec directly rather than through a program: only a
 * direct call can pass `met: undefined` distinctly from an omitted key, and
 * `null` distinctly from `false`, which is exactly the distinction under test.
 * The end-to-end block at the bottom covers what a direct call cannot — prop
 * aliases (resolved by the evaluator, not the render) and re-render, where the
 * count in the live region has to be recomputed rather than left stale.
 */

import { describe, expect, it, afterEach } from "vitest";
import { RequirementList } from "../src/library/components/advanced-forms.js";
import { componentStyles } from "../src/theme/styles.js";
import { cleanup, flush, render } from "../src/testing/index.js";

afterEach(() => cleanup());

const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await flush(); };

const node = { __kind: "Component", name: "RequirementList", args: [], props: {} } as never;

/**
 * Render the spec straight to DOM.
 *
 * No helper stubs: this render is pure — node and props in, elements out. A
 * permissive stub would hide a future dependency on `helpers` (instance state,
 * an auto-generated id) behind a passing test, and that dependency is worth
 * noticing, so an unstubbed call that throws is the better failure.
 */
const list = (props: Record<string, unknown>): HTMLElement =>
  RequirementList.render(node, props, {} as never) as HTMLElement;

const rows = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>("li.rui-requirement")];

const states = (root: HTMLElement): (string | null)[] =>
  rows(root).map((r) => r.getAttribute("data-met"));

const texts = (root: HTMLElement): (string | null)[] =>
  rows(root).map((r) => r.querySelector(".rui-requirement-text")?.textContent ?? null);

const liveRegions = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')];

/* ------------------------------------------------------------------ *
 * The tri-state
 * ------------------------------------------------------------------ */

describe("RequirementList tri-state", () => {
  it("distinguishes met, unmet and not-yet-checked", () => {
    const root = list({
      items: [
        { label: "At least 8 characters", met: true },
        { label: "One digit", met: false },
        { label: "One symbol" },
      ],
    });
    expect(states(root)).toEqual(["true", "false", "pending"]);
    expect(texts(root)).toEqual(["At least 8 characters", "One digit", "One symbol"]);
  });

  it("keeps met: null and met: undefined PENDING, never unmet", () => {
    // The single most important assertion in this file. `asBoolean` would fold
    // both of these into `false`, and a form the user has not typed into yet
    // would render every rule as broken. Asserted in one render alongside a
    // real `false` so the two are visibly different states, not two spellings
    // of the same one.
    const root = list({
      items: [
        { label: "explicit null", met: null },
        { label: "explicit undefined", met: undefined },
        { label: "key omitted" },
        { label: "genuinely unmet", met: false },
      ],
    });
    expect(states(root)).toEqual(["pending", "pending", "pending", "false"]);
    // Spelled out, because "pending" and "false" being unequal is the whole point.
    expect(states(root)[0]).not.toBe("false");
    expect(states(root)[1]).not.toBe("false");
  });

  it("gives a pending row the neutral dot, not the cross", () => {
    // The glyph is the sighted reader's channel, so it has to move with the
    // state and not just the colour: a cross recoloured grey still reads as a
    // failure.
    const root = list({
      items: [{ label: "a", met: true }, { label: "b", met: false }, { label: "c" }],
    });
    const glyphs = rows(root).map((r) => r.querySelector(".rui-requirement-icon")?.className ?? "");
    expect(glyphs[0]).toContain("rui-icon rui-requirement-icon fa-solid fa-check");
    expect(glyphs[1]).toContain("rui-icon rui-requirement-icon fa-solid fa-xmark");
    expect(glyphs[2]).not.toContain("xmark");
  });

  it("treats a non-boolean met as a verdict, not as not-yet-checked", () => {
    // Only the two absent values are pending. Anything the program actually
    // supplied — including a number that arrived from a length check — is an
    // answer, and answering is what makes a row red or green rather than grey.
    // Asserted as "not pending" rather than pinning true/false: which verdict a
    // truthy non-boolean earns is a judgement call that may be revisited, but
    // it must never silently become "the form has not been checked".
    const root = list({ items: [{ label: "zero", met: 0 }, { label: "one", met: 1 }] });
    expect(states(root)).not.toContain("pending");
  });

  it("renders a bare string as a not-yet-checked row", () => {
    // The shorthand an author reaches for first: a list of rules with no
    // verdicts yet. It must be neutral, for the same reason as above.
    const root = list({ items: ["One uppercase letter", "One digit"] });
    expect(states(root)).toEqual(["pending", "pending"]);
    expect(texts(root)).toEqual(["One uppercase letter", "One digit"]);
  });

  it("pending: true overrides every row's own verdict", () => {
    // For a field the user has not touched: the program already knows which
    // rules the (empty) value fails, and must be able to withhold that.
    const root = list({
      items: [{ label: "a", met: true }, { label: "b", met: false }, { label: "c" }],
      pending: true,
      announce: true,
    });
    expect(states(root)).toEqual(["pending", "pending", "pending"]);
    expect(root.getAttribute("data-pending")).toBe("true");
    // A withheld verdict is not a met verdict: the count must not credit the
    // row that would have been green.
    expect(liveRegions(root)[0]?.textContent).toBe("0 of 3 requirements met");
    // And no row claims a state in text either.
    expect(root.querySelector(".rui-requirement .rui-visually-hidden")).toBeNull();
  });

  it("marks the root data-pending only when asked", () => {
    expect(list({ items: ["a"] }).getAttribute("data-pending")).toBeNull();
    expect(list({ items: ["a"], pending: false }).getAttribute("data-pending")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

describe("RequirementList title", () => {
  it("renders the title above the list", () => {
    const root = list({ items: ["a"], title: "Your password must:" });
    const title = root.querySelector(".rui-requirement-list-title")!;
    expect(title.textContent).toBe("Your password must:");
    // Above, not below: the heading has to be read before the rules it heads.
    expect(title.nextElementSibling?.tagName).toBe("UL");
  });

  it("renders no title element when none is supplied", () => {
    // An empty heading element is a blank row of vertical space in the layout
    // and a nameless node in the tree.
    for (const props of [{ items: ["a"] }, { items: ["a"], title: "" }, { items: ["a"], title: null }]) {
      expect(list(props).querySelector(".rui-requirement-list-title")).toBeNull();
    }
  });

  it("keeps the title when there is nothing to list", () => {
    // The heading is the author's text and stands on its own; dropping it would
    // make a streaming render flicker its own caption in and out.
    const root = list({ items: [], title: "Your password must:" });
    expect(root.querySelector(".rui-requirement-list-title")?.textContent).toBe("Your password must:");
  });
});

/* ------------------------------------------------------------------ *
 * Nothing to list
 * ------------------------------------------------------------------ */

describe("RequirementList with nothing to list", () => {
  it("omits the <ul> entirely rather than rendering an empty one", () => {
    // An empty `<ul>` is announced as "list, 0 items" — a promise of content
    // that is not there, which is worse than silence. This matters most while
    // an LLM is still streaming the props in.
    for (const items of [[], null, undefined, 0, {}, [null, undefined]]) {
      const root = list({ items });
      expect(root.className).toContain("rui-requirement-list");
      expect(root.querySelector("ul"), `items = ${JSON.stringify(items) ?? "undefined"}`).toBeNull();
      expect(rows(root)).toEqual([]);
    }
  });

  it("says nothing when asked to announce an empty list", () => {
    // "0 of 0 requirements met" is a sentence about nothing. No rows, no count.
    const root = list({ items: [], announce: true });
    expect(liveRegions(root)).toEqual([]);
  });

  it("accepts a single rule passed without a wrapping array", () => {
    // `items` is normalised through `asArray`, so one scalar is one row rather
    // than an empty list — the distinction between "nothing to show" and "one
    // thing, loosely passed".
    const root = list({ items: "One symbol" });
    expect(states(root)).toEqual(["pending"]);
    expect(texts(root)).toEqual(["One symbol"]);
  });
});

/* ------------------------------------------------------------------ *
 * The screen-reader state channel (WCAG 1.4.1)
 * ------------------------------------------------------------------ */

describe("RequirementList state is never colour-only", () => {
  it("carries the verdict as text, because the glyph is aria-hidden", () => {
    // WCAG 1.4.1: colour cannot be the only carrier of meaning. Here the glyph
    // is `aria-hidden` and the colour is a CSS token, so for a screen-reader
    // user — and for anyone who cannot separate the green from the red — the
    // visually-hidden word is the ONLY channel. That is asserted together with
    // the glyph being hidden, because either fact alone is not the guarantee:
    // an unhidden glyph would make the prefix redundant, and a missing prefix
    // with a hidden glyph leaves nothing at all.
    const root = list({ items: [{ label: "One digit", met: true }, { label: "One symbol", met: false }] });
    for (const icon of root.querySelectorAll(".rui-requirement-icon")) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
    expect(rows(root)[0]!.querySelector(".rui-visually-hidden")?.textContent).toBe("Met: ");
    expect(rows(root)[1]!.querySelector(".rui-visually-hidden")?.textContent).toBe("Not met: ");
  });

  it("reads out as the verdict then the rule", () => {
    // Order is the assertion: "Met: One digit" is a sentence, "One digit Met:"
    // is a stutter that arrives after the reader has already formed an opinion
    // about the rule. The icon contributes no text, so the row's whole
    // accessible text is prefix + label.
    const root = list({ items: [{ label: "One digit", met: true }] });
    expect(rows(root)[0]!.textContent).toBe("Met: One digit");
  });

  it("gives a not-yet-checked row no verdict text at all", () => {
    // "Not checked yet" is the absence of a verdict, not a third one worth
    // saying on every row of an untouched form.
    const root = list({ items: [{ label: "One symbol" }] });
    expect(rows(root)[0]!.querySelector(".rui-visually-hidden")).toBeNull();
    expect(rows(root)[0]!.textContent).toBe("One symbol");
  });

  it("honours metLabel / unmetLabel", () => {
    // The prefix is prose, so it has to be translatable and re-wordable —
    // otherwise a localised app has one English word per row.
    const root = list({
      items: [{ label: "a", met: true }, { label: "b", met: false }],
      metLabel: "Erfüllt",
      unmetLabel: "Nicht erfüllt",
    });
    expect(rows(root)[0]!.textContent).toBe("Erfüllt: a");
    expect(rows(root)[1]!.textContent).toBe("Nicht erfüllt: b");
  });

  it("falls back to the default prefix when the override is absent or empty", () => {
    // A binding that has not resolved yet arrives as null or as "", and the row
    // still has to name its state: falling through to a bare ": a" reads as a
    // missing word, and it is the ONE row in the list whose verdict a screen
    // reader cannot recover — the glyph is hidden and the colour is not there.
    for (const metLabel of [null, undefined, ""]) {
      const root = list({ items: [{ label: "a", met: true }], metLabel });
      expect(rows(root)[0]!.textContent, `metLabel = ${JSON.stringify(metLabel)}`).toBe("Met: a");
    }
    for (const unmetLabel of [null, undefined, ""]) {
      const root = list({ items: [{ label: "b", met: false }], unmetLabel });
      expect(rows(root)[0]!.textContent, `unmetLabel = ${JSON.stringify(unmetLabel)}`).toBe("Not met: b");
    }
  });

  it("hides the prefix visually with a rule that keeps it in the a11y tree", () => {
    // `.rui-visually-hidden` is the whole mechanism: if that class ever became
    // `display: none` the prefix would leave the accessibility tree too and
    // every assertion above would still pass while the guarantee was gone.
    const at = componentStyles.indexOf(".rui-visually-hidden {");
    expect(at).toBeGreaterThan(-1);
    const body = componentStyles.slice(componentStyles.indexOf("{", at) + 1, componentStyles.indexOf("}", at));
    expect(body).toContain("position: absolute");
    expect(body).not.toContain("display: none");
    expect(body).not.toContain("visibility: hidden");
  });
});

/* ------------------------------------------------------------------ *
 * The live region
 * ------------------------------------------------------------------ */

describe("RequirementList announcements", () => {
  it("is silent unless asked", () => {
    // A list that talks on every keystroke is worse than one that stays quiet,
    // so `announce` is opt-in and its absence must add no live region anywhere
    // in the subtree — not on the root, not on a row.
    for (const props of [{ items: ["a", "b"] }, { items: ["a", "b"], announce: false }]) {
      const root = list(props);
      expect(liveRegions(root)).toEqual([]);
      expect(root.getAttribute("aria-live")).toBeNull();
      expect(root.getAttribute("role")).toBeNull();
    }
  });

  it("adds exactly one polite, atomic live region carrying the count", () => {
    const root = list({
      items: [{ label: "a", met: true }, { label: "b", met: false }, { label: "c" }],
      announce: true,
    });
    const regions = liveRegions(root);
    expect(regions).toHaveLength(1);
    const status = regions[0]!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    // Atomic: the count is one sentence, and re-reading only the changed digit
    // is unintelligible.
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe("1 of 3 requirements met");
    // Visually hidden, not visible: the rows themselves already show the count.
    expect(status.className).toContain("rui-visually-hidden");
    // …and still in the accessibility tree, which is the point of it.
    expect(status.getAttribute("aria-hidden")).toBeNull();
  });

  it("announces a COUNT, not the rule text", () => {
    // One sentence per rule per keystroke is unusable; the count is the summary
    // that survives being read on every edit.
    const root = list({ items: [{ label: "At least 8 characters", met: true }], announce: true });
    expect(liveRegions(root)[0]!.textContent).not.toContain("At least 8 characters");
  });

  it("puts the live region beside the list, never inside it", () => {
    // Two separate defects guarded here. A `<div>` child of a `<ul>` is invalid
    // HTML and gets re-parented by real parsers. And a `role="status"` on an
    // `<li>` REPLACES its `listitem` role, so the list loses an item and the
    // "3 of 5" the user hears no longer matches the list they are hearing it
    // about.
    const root = list({ items: ["a", "b"], announce: true });
    const ul = root.querySelector("ul")!;
    const status = liveRegions(root)[0]!;
    expect(status.parentElement).toBe(root);
    expect(ul.querySelector('[role="status"], [aria-live]')).toBeNull();
    expect([...ul.children].every((c) => c.tagName === "LI")).toBe(true);
    for (const row of rows(root)) expect(row.getAttribute("role")).toBeNull();
    // After the list, so a reader tabbing through source order meets the rules
    // before the summary of them.
    expect(status.previousElementSibling).toBe(ul);
  });

  it("substitutes {met} and {total} in announceText", () => {
    const root = list({
      items: [{ label: "a", met: true }, { label: "b", met: true }, { label: "c", met: false }],
      announce: true,
      announceText: "{met}/{total} rules satisfied",
    });
    expect(liveRegions(root)[0]!.textContent).toBe("2/3 rules satisfied");
  });

  it("substitutes every occurrence, not just the first", () => {
    // A single `String.replace` with a string pattern replaces one occurrence,
    // so a template that repeats a placeholder would leak the literal
    // "{total}" into what the screen reader says.
    const root = list({
      items: [{ label: "a", met: true }, { label: "b", met: false }],
      announce: true,
      announceText: "{met} of {total} — {total} in total, {met} done",
    });
    expect(liveRegions(root)[0]!.textContent).toBe("1 of 2 — 2 in total, 1 done");
  });

  it("uses a template that mentions neither placeholder verbatim", () => {
    // Substitution must not be a precondition: an author who just wants a fixed
    // "requirements updated" ping gets exactly that, with no leftover braces.
    const root = list({
      items: [{ label: "a", met: true }],
      announce: true,
      announceText: "Requirements updated",
    });
    expect(liveRegions(root)[0]!.textContent).toBe("Requirements updated");
  });

  it("counts only met rows, and counts every row in the total", () => {
    // The total is the number of RENDERED rows, so a dropped junk entry must not
    // inflate it — otherwise the user hears "2 of 4" while looking at 3 rules.
    const root = list({
      items: [{ label: "a", met: true }, null, { label: "b", met: true }, { label: "c" }],
      announce: true,
    });
    expect(rows(root)).toHaveLength(3);
    expect(liveRegions(root)[0]!.textContent).toBe("2 of 3 requirements met");
  });
});

/* ------------------------------------------------------------------ *
 * Hostile input
 * ------------------------------------------------------------------ */

describe("RequirementList survives hostile items", () => {
  it("drops unusable entries instead of rendering an empty row", () => {
    // Every one of these shapes reaches a component in practice, because
    // `items` is usually a `$variable` fed by an HTTP response. A row with no
    // text is a bullet with a verdict attached to nothing — the reader is told
    // a rule failed and never told which.
    const root = list({
      items: [null, undefined, 7, true, [], {}, { met: true }, { label: "" }, { label: null }, "  "],
    });
    // Note "  " is a non-empty string, so it does become a row — the render
    // takes the author's whitespace at face value rather than second-guessing
    // it. Everything else is dropped.
    expect(texts(root)).toEqual(["  "]);
  });

  it("never renders a row whose text is empty", () => {
    const root = list({
      items: [{}, { label: "" }, { label: "Real rule", met: false }, 0, { met: false }],
    });
    for (const row of rows(root)) {
      expect(row.querySelector(".rui-requirement-text")?.textContent).toBeTruthy();
    }
    expect(texts(root)).toEqual(["Real rule"]);
  });

  it("keeps the surviving rules in their original order", () => {
    const root = list({ items: ["first", null, "second", {}, "third"] });
    expect(texts(root)).toEqual(["first", "second", "third"]);
  });

  it("reads an alternate label key rather than stringifying the object", () => {
    // The row an API actually returns. Without this the label renders as the
    // literal "[object Object]".
    const root = list({ items: [{ text: "From a text key", met: true }] });
    expect(texts(root)).toEqual(["From a text key"]);
    expect(root.textContent).not.toContain("[object");
  });

  it("does not throw on any of the shapes the registry gate replays", () => {
    // Mirrors the hostile sweep in coverage-registry-invariants, narrowed to
    // this spec so a failure here names the component instead of the sweep.
    for (const value of [null, undefined, "", 0, NaN, -1, [], {}, false, true]) {
      const props: Record<string, unknown> = {};
      for (const p of RequirementList.props) props[p.name] = value;
      expect(() => list(props), `every prop = ${String(value)}`).not.toThrow();
    }
    expect(() => list({})).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Through a real program
 * ------------------------------------------------------------------ */

describe("RequirementList in a program", () => {
  it("accepts the rules / requirements aliases", async () => {
    // Aliases are resolved by the evaluator before `props` reaches the render,
    // so a direct call cannot exercise them — an advertised alias that the
    // validator rejects is a hard error in the author's app.
    for (const prop of ["rules", "requirements"]) {
      const screen = render(`$app(RequirementList({ ${prop}: ["One symbol"] }))`);
      await settle();
      const root = screen.shadowRoot.querySelector<HTMLElement>(".rui-requirement-list")!;
      expect(texts(root), prop).toEqual(["One symbol"]);
      cleanup();
    }
  });

  it("re-renders verdicts and the count when the value changes", async () => {
    // The reason the count lives in one atomic region rather than on each row:
    // it has to be RECOMPUTED on re-render, not appended to. A stale "0 of 2"
    // beside two green rows is the failure mode this pins.
    const screen = render(`$pw = ""
$app(Column([
  Button("fill", { onClick: () => { $pw = "abcdefg1" } }),
  RequirementList([
    { label: "At least 8 characters", met: $pw.length >= 8 },
    { label: "One digit", met: /[0-9]/.test($pw) }
  ], { announce: true })
]))`);
    await settle();
    const root = () => screen.shadowRoot.querySelector<HTMLElement>(".rui-requirement-list")!;
    expect(states(root())).toEqual(["false", "false"]);
    expect(liveRegions(root())[0]!.textContent).toBe("0 of 2 requirements met");

    (screen.shadowRoot.querySelector("button") as HTMLElement).click();
    await settle();
    expect(states(root())).toEqual(["true", "true"]);
    expect(liveRegions(root())[0]!.textContent).toBe("2 of 2 requirements met");
    // Still exactly one region: re-render must not accumulate them.
    expect(liveRegions(root())).toHaveLength(1);
  });

  it("keeps met undefined pending when the program supplies no verdict", async () => {
    // Same guarantee as the direct-call case, but through the real evaluator:
    // an untouched form has to render neutral end to end, not just in a unit
    // test that hand-builds the props bag.
    const screen = render(`$app(RequirementList([
  { label: "At least 8 characters" },
  { label: "One digit", met: null }
]))`);
    await settle();
    const root = screen.shadowRoot.querySelector<HTMLElement>(".rui-requirement-list")!;
    expect(states(root)).toEqual(["pending", "pending"]);
  });
});
