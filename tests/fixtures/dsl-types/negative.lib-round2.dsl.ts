// Negative corpus for round 2 of the library fixes (the optional marker, empty
// generic lists). Directive format and layer tags: see negative.dsl.ts.
import {
  ActivityLog, CalendarView, PinInput, SignaturePad, TagInput,
} from "aktion-runtime/dsl";

// ---- the optional marker -------------------------------------------------------------
// @ts-expect-error TS2769 [types] a number is not a marker (it renders nothing)
PinInput("pin", { label: "PIN", optional: 1 });
// @ts-expect-error TS2769 [types] … on TagInput either
TagInput("tags", { label: "Tags", optional: 0 });
// @ts-expect-error TS2769 [types] … nor on a pad
SignaturePad({ label: "Signature", optional: 2 });

// ---- an empty list falls back to the default item type, not to `any` -----------------
// @ts-expect-error TS2339 [types] an empty list types `item` as ActivityLogItem, which has no `missing`
ActivityLog([], { onItemClick: (_i, item) => item.missing });
// @ts-expect-error TS2339 [types] … and `event` as CalendarViewEvent
CalendarView({ events: [], onEventClick: (_id, event) => event.location });
