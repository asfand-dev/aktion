// Positive fixture for the data / chart / canvas / interop components: the
// shapes their renderers accept, which the curated types used to reject or
// mistype. It must type-check with and without the DOM lib.
import {
  ActivityLog, CalendarView, Col, ComparisonTable, DataGrid, DrawingCanvas, Gauge, Heatmap, InfiniteList, Mount,
  SignaturePad, Table, Text,
  type Children,
} from "aktion-runtime/dsl";

export let $picked = "";

// ---- callbacks hand back the author's own objects --------------------------

export function Feeds(): Children {
  return [
    // `item` is the entry as written, `id` included; a non-object entry is skipped.
    ActivityLog([{ title: "Deployed", actor: "Ann", id: 42 }, null], {
      onItemClick: (index, item) => {
        const id: number = item.id;
        $picked = `${index}:${id}`;
      },
    }),
    ActivityLog({ items: [{ title: "Signed in", meta: "10.0.0.1", ip: "10.0.0.1" }], onItemClick: (_i, item) => { $picked = item.ip; } }),
    CalendarView({
      month: "2026-07",
      events: [{ date: "2026-07-06", title: "Standup", location: "Room 1" }],
      onEventClick: (eventId, event) => {
        const where: string = event.location;
        $picked = `${eventId}@${where}`;
      },
    }),
  ];
}

// ---- CSS lengths: a number is px --------------------------------------------

export function Grids(): Children {
  return [
    DataGrid([
      Col("Name", ["a"], { width: 240, minWidth: 120, maxWidth: "50%" }),
      Col("Notes", ["b"], { minWidth: "5rem", maxWidth: 400, pinned: "left" }),
    ], { maxHeight: 480, resizable: true }),
    Table([Col("Amount", [1234.5], { format: "number", locale: "de-DE", width: "30%" })], { maxHeight: 320 }),
    ComparisonTable(["Free", "Pro"], [{ label: "SSO", values: [false, true] }], { ariaLabel: "Plans" }),
    InfiniteList([Text("row")], { rootMargin: 200 }),
    InfiniteList([Text("row")], { rootMargin: "0px 10%" }),
  ];
}

// ---- optional labels, legacy sizes, field shells, imperative widgets --------

export function Widgets(): Children {
  return [
    Heatmap({ values: [[1, 2], [3, 4]] }),
    Heatmap({ xLabels: ["Mon", "Tue"], values: [[1, 2]] }),
    Gauge(72, { size: "lg" }),
    Gauge(72, { size: "l" }),
    SignaturePad({ label: "Sign", optional: "(if applicable)", onBlur: (value) => { $picked = value; } }),
    DrawingCanvas({ label: "Sketch", optional: false }),
    // `setup` that only fills `node`: `update` still runs, and reaches the node.
    Mount({
      setup: (node) => { node.setAttribute("data-ready", "true"); },
      update: (_instance, props, node) => { node.setAttribute("data-n", String(props.n)); },
      props: { n: 1 },
    }),
    Mount({
      setup: () => ({ destroy: () => {} }),
      update: (instance) => { instance.destroy(); },
      cleanup: (instance) => { instance?.destroy(); },
    }),
  ];
}
