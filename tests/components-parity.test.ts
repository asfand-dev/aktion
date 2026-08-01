/**
 * Tests for the components added to close functional gaps against UI block:
 *  - `Pill`          — soft tinted STATE label (vs Badge's solid chip)
 *  - `ButtonGroup`   — buttons joined edge-to-edge into one control
 *  - `InputGroup`    — one bordered shell around field + icon + action
 *  - `FilterPill`    — toggleable filter (vs FilterChips' removable chips)
 *  - `ActionStripe`  — full-width clickable navigation row
 *  - `CardSection`   — full-bleed semantic band inside a Card
 *  - `LoadingDots`  — three sequenced dots (vs Spinner's rotating ring)
 *  - `CardHeader`'s new `eyebrow` slot
 *  - `Callout`'s new `actions` (footer) slot
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

type ScriptedEl = HTMLElement & { setResponse(text: string): void };

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await flush();
};

const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

const render = async (program: string): Promise<ShadowRoot> => {
  const el = create();
  el.setResponse(program);
  await settle();
  return el.shadowRoot as ShadowRoot;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Pill", () => {
  it("renders a tone-tagged pill with its label", async () => {
    const root = await render(`$app(Pill("SSL active", { tone: "success" }))`);
    const pill = root.querySelector(".rui-pill");
    expect(pill).toBeTruthy();
    expect(pill?.getAttribute("data-tone")).toBe("success");
    expect(pill?.textContent).toContain("SSL active");
  });

  it("maps Aktion tone synonyms onto the UI block vocabulary", async () => {
    const root = await render(
      `$app(Column([Pill("a", { tone: "danger" }), Pill("b", { tone: "info" }), Pill("c", { tone: "primary" })]))`,
    );
    const tones = [...root.querySelectorAll(".rui-pill")].map((p) => p.getAttribute("data-tone"));
    expect(tones).toEqual(["critical", "activating", "corporate"]);
  });

  it("falls back to neutral for an unknown tone", async () => {
    const root = await render(`$app(Pill("x", { tone: "banana" }))`);
    expect(root.querySelector(".rui-pill")?.getAttribute("data-tone")).toBe("neutral");
  });
});

describe("ButtonGroup", () => {
  it("tags each child with its position so only outer corners round", async () => {
    const root = await render(
      `$app(ButtonGroup([Button("Day"), Button("Week"), Button("Month")]))`,
    );
    const items = [...root.querySelectorAll(".rui-button-group-item")];
    expect(items).toHaveLength(3);
    expect(items.map((b) => b.getAttribute("data-pos"))).toEqual(["start", "middle", "end"]);
    expect(root.querySelector(".rui-button-group")?.getAttribute("role")).toBe("group");
  });

  it("marks a lone child as the only item", async () => {
    const root = await render(`$app(ButtonGroup([Button("Solo")]))`);
    expect(root.querySelector(".rui-button-group-item")?.getAttribute("data-pos")).toBe("only");
  });
});

describe("InputGroup", () => {
  it("wraps the field and renders leading icon, suffix, and trailing action", async () => {
    const root = await render(
      `$app(InputGroup(Input({ id: "q" }), { icon: "magnifying-glass", suffix: "GB", action: Button("Go") }))`,
    );
    expect(root.querySelector(".rui-input-group")).toBeTruthy();
    expect(root.querySelector(".rui-input-group-icon")).toBeTruthy();
    expect(root.querySelector(".rui-input-group-field .rui-input")).toBeTruthy();
    expect(root.querySelector(".rui-input-group-suffix")?.textContent).toBe("GB");
    expect(root.querySelector(".rui-input-group-action .rui-button")).toBeTruthy();
  });
});

describe("FilterPill", () => {
  it("reflects active state on both data-active and aria-pressed", async () => {
    const root = await render(
      `$app(Row([FilterPill("Any"), FilterPill("Current", { active: true, count: 12 })]))`,
    );
    const pills = [...root.querySelectorAll(".rui-filter-pill")];
    expect(pills.map((p) => p.getAttribute("data-active"))).toEqual(["false", "true"]);
    expect(pills.map((p) => p.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    expect(pills[1].querySelector(".rui-filter-pill-count")?.textContent).toBe("12");
  });

  it("invokes onToggle with the NEXT active state", async () => {
    const root = await render(
      `function Demo() {
  const [got, setGot] = $state("none")
  return Column([
    FilterPill("F", { active: false, onToggle: (next) => setGot(String(next)) }),
    Text("got=" + got),
  ])
}
$app(Demo())`,
    );
    expect(root.textContent).toContain("got=none");
    (root.querySelector(".rui-filter-pill") as HTMLButtonElement).click();
    await settle();
    // inactive pill reports `true` as its next state
    expect(root.textContent).toContain("got=true");
  });

  it("reports false as the next state when already active", async () => {
    const root = await render(
      `function Demo() {
  const [got, setGot] = $state("none")
  return Column([
    FilterPill("F", { active: true, onToggle: (next) => setGot(String(next)) }),
    Text("got=" + got),
  ])
}
$app(Demo())`,
    );
    (root.querySelector(".rui-filter-pill") as HTMLButtonElement).click();
    await settle();
    expect(root.textContent).toContain("got=false");
  });

  it("does not fire when disabled", async () => {
    const root = await render(
      `function Demo() {
  const [got, setGot] = $state("none")
  return Column([
    FilterPill("F", { disabled: true, onToggle: () => setGot("fired") }),
    Text("got=" + got),
  ])
}
$app(Demo())`,
    );
    const pill = root.querySelector(".rui-filter-pill") as HTMLButtonElement;
    expect(pill.disabled).toBe(true);
    pill.click();
    await settle();
    expect(root.textContent).toContain("got=none");
  });
});

describe("ActionStripe", () => {
  it("renders label, description, value and a chevron as a button", async () => {
    const root = await render(
      `$app(ActionStripe("DNS records", { icon: "list", description: "Manage records", value: "12", onClick: () => {} }))`,
    );
    const stripe = root.querySelector(".rui-action-stripe");
    expect(stripe?.tagName).toBe("BUTTON");
    expect(root.querySelector(".rui-action-stripe-label")?.textContent).toBe("DNS records");
    expect(root.querySelector(".rui-action-stripe-description")?.textContent).toBe("Manage records");
    expect(root.querySelector(".rui-action-stripe-value")?.textContent).toBe("12");
    expect(root.querySelector(".rui-action-stripe-chevron")).toBeTruthy();
  });

  it("renders as an anchor when given href", async () => {
    const root = await render(`$app(ActionStripe("Docs", { href: "/docs" }))`);
    expect(root.querySelector(".rui-action-stripe")?.tagName).toBe("A");
  });

  it("marks disabled and skips the click handler", async () => {
    const root = await render(
      `function Demo() {
  const [got, setGot] = $state("none")
  return Column([
    ActionStripe("X", { disabled: true, onClick: () => setGot("fired") }),
    Text("got=" + got),
  ])
}
$app(Demo())`,
    );
    const stripe = root.querySelector(".rui-action-stripe") as HTMLButtonElement;
    expect(stripe.getAttribute("data-disabled")).toBe("true");
    stripe.click();
    await settle();
    expect(root.textContent).toContain("got=none");
  });
});

describe("CardSection", () => {
  it("renders a tone-tagged band with its children", async () => {
    const root = await render(
      `$app(Card([CardSection([Text("all good")], { tone: "success" })]))`,
    );
    const section = root.querySelector(".rui-card-section");
    expect(section).toBeTruthy();
    expect(section?.getAttribute("data-tone")).toBe("success");
    expect(section?.textContent).toContain("all good");
  });

  it("defaults to the default tone", async () => {
    const root = await render(`$app(Card([CardSection([Text("x")])]))`);
    expect(root.querySelector(".rui-card-section")?.getAttribute("data-tone")).toBe("default");
  });
});

describe("CardHeader eyebrow", () => {
  it("renders the eyebrow above the title", async () => {
    const root = await render(
      `$app(Card([CardHeader("Main title", { eyebrow: "Category", subtitle: "Sub" })]))`,
    );
    const header = root.querySelector(".rui-card-header") as HTMLElement;
    const order = [...header.children].map((c) => c.className);
    expect(order[0]).toBe("rui-card-eyebrow");
    expect(order[1]).toBe("rui-card-title");
    expect(order[2]).toBe("rui-card-subtitle");
    expect(root.querySelector(".rui-card-eyebrow")?.textContent).toBe("Category");
  });

  it("omits the eyebrow when not supplied", async () => {
    const root = await render(`$app(Card([CardHeader("Only title")]))`);
    expect(root.querySelector(".rui-card-eyebrow")).toBeNull();
  });
});

describe("Callout actions (footer)", () => {
  it("renders an action row under the body", async () => {
    const root = await render(
      `$app(Callout({ tone: "warning", title: "Heads up", description: "Do this", actions: [Button("Do this"), Button("Later", { variant: "secondary" })] }))`,
    );
    const footer = root.querySelector(".rui-callout-footer");
    expect(footer).toBeTruthy();
    expect(footer?.querySelectorAll(".rui-button")).toHaveLength(2);
    // footer lives inside the body, after the description
    expect(root.querySelector(".rui-callout-body .rui-callout-footer")).toBeTruthy();
  });

  it("omits the footer when no actions are given", async () => {
    const root = await render(`$app(Callout({ tone: "info", title: "T" }))`);
    expect(root.querySelector(".rui-callout-footer")).toBeNull();
  });
});

describe("Callout structure (UI block message / message__section split)", () => {
  it("wraps icon and body in an inner section so the bar and the radius live on different nodes", async () => {
    const root = await render(`$app(Callout({ tone: "success", title: "Saved", description: "Body." }))`);
    const outer = root.querySelector(".rui-callout") as HTMLElement;
    // The outer element holds ONLY the section — icon and body moved inside it, which is
    // what lets the outer clip the section's inset bar with its own border-radius.
    expect([...outer.children].map((c) => c.className)).toEqual(["rui-callout-section"]);
    const section = outer.children[0] as HTMLElement;
    // renderIcon emits a compound class ("rui-icon rui-callout-icon"), so match on
    // classList rather than the exact className string.
    const has = (name: string) =>
      [...section.children].some((c) => c.classList.contains(name));
    expect(has("rui-callout-icon")).toBe(true);
    expect(has("rui-callout-body")).toBe(true);
  });

  it("keeps the footer inside the body, inside the section", async () => {
    const root = await render(
      `$app(Callout({ tone: "warning", title: "T", actions: [Button("Go")] }))`,
    );
    expect(root.querySelector(".rui-callout-section .rui-callout-body .rui-callout-footer")).toBeTruthy();
  });
});

describe("LoadingDots", () => {
  it("renders three dots and an optional label", async () => {
    const root = await render(`$app(LoadingDots("Working…"))`);
    const wrap = root.querySelector(".rui-loading-dots");
    expect(wrap).toBeTruthy();
    expect(root.querySelectorAll(".rui-loading-dots-dot")).toHaveLength(3);
    expect(root.querySelector(".rui-loading-dots-label")?.textContent).toBe("Working…");
    // announced for assistive tech
    expect(wrap?.getAttribute("role")).toBe("status");
    expect(wrap?.getAttribute("aria-label")).toBe("Working…");
    // the dots themselves are decorative
    expect(root.querySelector(".rui-loading-dots-track")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("falls back to a Loading announcement with no label", async () => {
    const root = await render(`$app(LoadingDots())`);
    expect(root.querySelector(".rui-loading-dots")?.getAttribute("aria-label")).toBe("Loading");
    expect(root.querySelector(".rui-loading-dots-label")).toBeNull();
  });

  it("carries size and tone hooks", async () => {
    const root = await render(`$app(LoadingDots("x", { size: "sm", tone: "success" }))`);
    const el = root.querySelector(".rui-loading-dots");
    expect(el?.getAttribute("data-size")).toBe("sm");
    expect(el?.getAttribute("data-tone")).toBe("success");
  });
});

describe("field `disabled` + temporal input types", () => {
  it("disables a bare Input (no label/hint/error shell)", async () => {
    const root = await render(`$app(Input({ id: "a", value: "x", disabled: true }))`);
    const input = root.querySelector(".rui-input") as HTMLInputElement;
    // The shell short-circuits when there is no label/hint/error, so `disabled`
    // has to be applied before that early return.
    expect(input.disabled).toBe(true);
  });

  it("disables an Input that DOES have a field shell", async () => {
    const root = await render(
      `$app(Input({ id: "b", label: "L", hint: "H", value: "x", disabled: true }))`,
    );
    expect((root.querySelector(".rui-input") as HTMLInputElement).disabled).toBe(true);
    expect(root.querySelector(".rui-field")).toBeTruthy();
  });

  it("leaves a field editable when disabled is absent or false", async () => {
    const root = await render(
      `$app(Column([Input({ id: "c", value: "x" }), Input({ id: "d", value: "y", disabled: false })]))`,
    );
    const inputs = [...root.querySelectorAll(".rui-input")] as HTMLInputElement[];
    expect(inputs.map((i) => i.disabled)).toEqual([false, false]);
  });

  it("disables a plain Select and a searchable one", async () => {
    const root = await render(
      `$app(Column([
  Select({ id: "s1", value: "a", disabled: true, items: [SelectItem("a", "A")] }),
  Select({ id: "s2", value: "a", disabled: true, searchable: true, items: [SelectItem("a", "A")] })
]))`,
    );
    expect((root.querySelector("select.rui-select") as HTMLSelectElement).disabled).toBe(true);
    // The searchable variant renders a Combobox; it must honour disabled too
    // rather than hard-coding false. Assert on the TRIGGER specifically — the
    // panel's filter input comes first in document order.
    const combo = root.querySelector(".rui-select-searchable") as HTMLElement;
    expect(combo).toBeTruthy();
    expect(combo.getAttribute("data-disabled")).toBe("true");
    const trigger = combo.querySelector(".rui-combobox-trigger") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });

  it("disables TextArea through the same shared shell", async () => {
    const root = await render(`$app(TextArea({ id: "t", value: "x", disabled: true }))`);
    expect((root.querySelector(".rui-textarea") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("accepts the temporal input types a maintenance window needs", async () => {
    const root = await render(
      `$app(Column([
  Input({ id: "t1", type: "time", value: "02:00" }),
  Input({ id: "t2", type: "datetime-local", value: "2026-07-29T02:00" }),
  Input({ id: "t3", type: "date", value: "2026-07-29" })
]))`,
    );
    const types = [...root.querySelectorAll(".rui-input")].map((i) => i.getAttribute("type"));
    expect(types).toEqual(["time", "datetime-local", "date"]);
  });
});
