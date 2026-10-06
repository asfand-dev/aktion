// Negative corpus for the data / chart / canvas / interop components. Directive
// format and layer tags: see the header of negative.dsl.ts.
import {
  ActivityLog, CalendarView, Col, DataGrid, Heatmap, InfiniteList, Mount,
} from "aktion-runtime/dsl";

// ---- Col ----------------------------------------------------------------------
// @ts-expect-error TS2769 [validator] DataGrid only pins to the left edge ("right" was a silent no-op)
DataGrid([Col("Name", ["a"], { pinned: "right" })]);

// ---- callbacks receive the author's own objects -----------------------------
// @ts-expect-error TS2339 [types] `item` is the entry as written: a field it does not have is not there
ActivityLog([{ title: "Deployed", id: 42 }], { onItemClick: (_i, item) => item.missing });
// @ts-expect-error TS2339 [types] … and the same for a CalendarView event
CalendarView({ events: [{ date: "2026-07-06", title: "Standup" }], onEventClick: (_id, event) => event.location });
// @ts-expect-error TS2769 [types] an ActivityLog entry still needs a title
ActivityLog([{ actor: "Ann" }]);

// ---- InfiniteList -------------------------------------------------------------
// @ts-expect-error TS2769 [types] IntersectionObserver takes px / % only (the runtime falls back to 200px)
InfiniteList([], { rootMargin: "10vh" });

// ---- Heatmap ------------------------------------------------------------------
// @ts-expect-error TS2345 [types] the labels are optional, the values are not
Heatmap({ xLabels: ["Mon"] });

// ---- Mount --------------------------------------------------------------------
// @ts-expect-error TS2339 [types] `update` receives the live host as a DomElement, not an arbitrary object
Mount({ setup: () => 1, update: (_instance, _props, node) => node.nope });
