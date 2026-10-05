// Negative corpus for round 2 of the library fixes (icon names, the optional
// marker, empty generic lists). Directive format and layer tags: see
// negative.dsl.ts.
import {
  ActivityLog, Breadcrumb, Button, CalendarView, Callout, Icon, PinInput, Rating, SignaturePad,
  TagInput, ToggleGroup,
} from "aktion-runtime/dsl";

// ---- icon names are strings ----------------------------------------------------
// @ts-expect-error TS2769 [types] an icon name is a string, not a number
Icon(5);
// @ts-expect-error TS2769 [types] … on a component's icon prop too
Button("Save", { icon: 7 });
// @ts-expect-error TS2769 [types] `false` hides a Callout's icon; `true` is not a name
Callout("Saved", { icon: true });
// @ts-expect-error TS2769 [types] the home icon is a boolean or a name
Breadcrumb(["Home", "Docs"], { homeIcon: 0 });
// @ts-expect-error TS2769 [types] a Rating family is a name
Rating({ value: 3, icon: 2 });
// @ts-expect-error TS2769 [types] a ToggleGroup item object's icon is a name
ToggleGroup("view", { items: [{ value: "grid", icon: 3 }] });

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
