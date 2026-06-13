/**
 * Style-migration helpers: `tailwindToSx` (deepened — arbitrary values + more
 * color shades), and the new `cssToSx` (raw CSS → sx) and `styledToSx`
 * (styled-components / emotion template → sx) extractors. Each keeps an honest
 * `_unmapped` list so a migration never silently drops intent.
 */

import { describe, expect, it } from "vitest";
import { tailwindToSx, cssToSx, styledToSx } from "../src/tooling/schema.js";

describe("tailwindToSx — arbitrary values", () => {
  it("maps arbitrary width / height / spacing to raw lengths", () => {
    expect(tailwindToSx("w-[327px]")).toEqual({ w: "327px" });
    expect(tailwindToSx("h-[12rem]")).toEqual({ h: "12rem" });
    expect(tailwindToSx("p-[14px]")).toEqual({ p: "14px" });
    expect(tailwindToSx("gap-[10px]")).toEqual({ gap: "10px" });
    expect(tailwindToSx("max-w-[42rem]")).toEqual({ maxW: "42rem" });
  });

  it("distinguishes arbitrary text size from arbitrary text color", () => {
    expect(tailwindToSx("text-[13px]")).toEqual({ fontSize: "13px" });
    expect(tailwindToSx("text-[#abc]")).toEqual({ color: "#abc" });
    expect(tailwindToSx("bg-[#ff0000]")).toEqual({ bg: "#ff0000" });
  });

  it("maps arbitrary radius / z / opacity / inset", () => {
    expect(tailwindToSx("rounded-[12px]")).toEqual({ radius: "12px" });
    expect(tailwindToSx("z-[60]")).toEqual({ zIndex: "60" });
    expect(tailwindToSx("opacity-[0.6]")).toEqual({ opacity: 0.6 });
    expect(tailwindToSx("top-[5px]")).toEqual({ top: "5px" });
  });

  it("recognises extended color-shade palettes", () => {
    expect(tailwindToSx("bg-emerald-500")).toEqual({ bg: "success" });
    expect(tailwindToSx("text-zinc-600")).toEqual({ color: "text-muted" });
    expect(tailwindToSx("bg-indigo-500")).toEqual({ bg: "info" });
  });

  it("still records genuinely unsupported utilities under _unmapped", () => {
    const sx = tailwindToSx("rotate-45 transition-all w-[200px]");
    expect(sx.w).toBe("200px");
    expect(sx._unmapped).toContain("rotate-45");
    expect(sx._unmapped).toContain("transition-all");
  });
});

describe("cssToSx", () => {
  it("maps a declaration string onto sx keys", () => {
    expect(cssToSx("display:flex; gap:12px; color:#1a1a1a")).toEqual({
      display: "flex",
      gap: "12px",
      color: "#1a1a1a",
    });
  });

  it("maps flex alignment CSS values to bounded sx tokens", () => {
    expect(cssToSx("align-items: flex-start; justify-content: space-between")).toEqual({
      align: "start",
      justify: "between",
    });
  });

  it("accepts a full rule and uses the first body", () => {
    const sx = cssToSx(".btn { padding: 8px; border-radius: 6px }");
    expect(sx.p).toBe("8px");
    expect(sx.radius).toBe("6px");
  });

  it("surfaces declarations the bounded sx surface can't express", () => {
    const sx = cssToSx("display:flex; transform: rotate(3deg); transition: all .2s");
    expect(sx.display).toBe("flex");
    expect(sx._unmapped).toEqual([
      "transform: rotate(3deg)",
      "transition: all .2s",
    ]);
  });
});

describe("styledToSx", () => {
  it("strips interpolations and extracts top-level declarations", () => {
    const sx = styledToSx(`
      display: flex;
      padding: 12px 16px;
      color: \${p => p.color};
      gap: 8px;
    `);
    expect(sx.display).toBe("flex");
    expect(sx.gap).toBe("8px");
    // `padding: 12px 16px` is a shorthand → kept verbatim as `p`.
    expect(sx.p).toBe("12px 16px");
  });

  it("peels nested blocks into _unmapped", () => {
    const sx = styledToSx(`
      color: red;
      &:hover { opacity: 0.8; }
    `);
    expect(sx.color).toBe("red");
    expect((sx._unmapped as string[]).some((s) => s.includes(":hover"))).toBe(true);
  });
});
