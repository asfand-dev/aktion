import { describe, expect, it } from "vitest";
import { render } from "../src/testing/index.js";

const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const stars = (s: any) => s.shadowRoot.querySelectorAll(".rui-rating-star");
const full = (s: any) => s.shadowRoot.querySelectorAll('.rui-rating-star[data-fill="full"]').length;

describe("Rating as an interactive input", () => {
  it("bound value: click updates the bound atom and fires onChange", async () => {
    const s = render(`
$rating = 0
$picked = null
$app(Rating({ value: $rating, interactive: true, onChange: (v) => { $picked = v } }))
`);
    await flush();
    expect(stars(s)[0].tagName).toBe("BUTTON");
    (stars(s)[3] as HTMLElement).click();
    await flush();
    expect(s.state.get("rating")).toBe(4);
    expect(s.state.get("picked")).toBe(4);
    expect(full(s)).toBe(4);
  });

  it("onChange only (no binding): click fires onChange AND visibly selects", async () => {
    const s = render(`
$picked = null
$app(Rating({ value: 2, onChange: (v) => { $picked = v } }))
`);
    await flush();
    expect(stars(s)[0].tagName).toBe("BUTTON"); // interactive because onChange present
    expect(full(s)).toBe(2);
    (stars(s)[4] as HTMLElement).click();
    await flush();
    expect(s.state.get("picked")).toBe(5);
    expect(full(s)).toBe(5); // uncontrolled local selection updates the view
  });

  it("interactive: true without binding or onChange still selects", async () => {
    const s = render(`$app(Rating({ value: 1, interactive: true }))`);
    await flush();
    expect(stars(s)[0].tagName).toBe("BUTTON");
    (stars(s)[2] as HTMLElement).click();
    await flush();
    expect(full(s)).toBe(3);
  });

  it("display mode (no interactive / onChange) renders static spans", async () => {
    const s = render(`$app(Rating({ value: 4 }))`);
    await flush();
    expect(stars(s)[0].tagName).toBe("SPAN");
    expect(full(s)).toBe(4);
  });

  it("readonly forces display mode even with onChange", async () => {
    const s = render(`$app(Rating({ value: 3, readonly: true, onChange: (v) => {} }))`);
    await flush();
    expect(stars(s)[0].tagName).toBe("SPAN");
  });
});
