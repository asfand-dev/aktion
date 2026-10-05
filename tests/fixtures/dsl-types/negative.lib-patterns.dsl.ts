// Negative corpus for the pattern / chart / wrapper components. Directive
// format and layer tags: see the header of negative.dsl.ts.
import { Gantt, PageHeader, PersonChip, SectionHeader, Stats, Sticky, Text, Tour } from "aktion-runtime/dsl";

// ---- SectionHeader -------------------------------------------------------------
// @ts-expect-error TS2769 [types] `status` is a Badge / Pill / StatusDot node (the old `Tag` hint typed it `unknown`)
SectionHeader("Billing", { status: "Active" });

// ---- PersonChip -------------------------------------------------------------------
// @ts-expect-error TS2769 [validator] legacy size spellings are accepted, an unknown token is not
PersonChip("Ada", { size: "huge" });

// ---- Gantt ---------------------------------------------------------------------------
// @ts-expect-error TS2769 [types] only success / warning / danger / info / muted are styled; `primary` draws the default bar
Gantt([{ label: "Build", start: "2026-01-01", end: "2026-01-05", tone: "primary" }]);
// @ts-expect-error TS2769 [types] … and the `status` alias takes the same tones
Gantt([{ label: "Build", start: "2026-01-01", end: "2026-01-05", status: "neutral" }]);

// ---- PageHeader ---------------------------------------------------------------------
// @ts-expect-error TS2769 [types] a crumb needs its text, as `label` or `title`
PageHeader("Orders", { breadcrumbs: [{ to: "/shop" }] });

// ---- Stats ----------------------------------------------------------------------------
// @ts-expect-error TS2769 [types] a KPI object needs a `label`
Stats([{ value: 1 }], { layout: "grid" });

// ---- CSS lengths / steps -----------------------------------------------------------------
// @ts-expect-error TS2769 [types] a CSS length is a string or a number, not a boolean
Sticky([Text("toolbar")], { offset: true });
// @ts-expect-error TS2769 [types] `current` is a step index
Tour(["a", "b"], { current: "1" });
