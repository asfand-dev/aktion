/** Curated types for the components of src/library/components/scheduling.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Calendar: {
    generics: [{ name: "Ev", default: "CalendarEvent", constraint: "CalendarEvent" }],
    types: {
      CalendarEventColor: "export type CalendarEventColor = \"primary\" | \"success\" | \"warning\" | \"danger\" | \"info\" | (string & {});",
      CalendarEvent: `export interface CalendarEvent {
  readonly date: string;
  readonly label?: string | number;
  readonly color?: CalendarEventColor;
  readonly time?: string | number;
}`,
    },
    props: {
      selected: "string",
      onSelect: "(iso: string) => void",
      events: "readonly (string | Ev)[]",
      onNavigate: "(year: number, month: number) => void",
      minDate: "string",
      maxDate: "string",
      disabledDates: "readonly string[]",
      onEventClick: "(event: Ev, iso: string) => void",
      locale: "string",
      weekdayLabels: "readonly string[]",
      monthLabels: "readonly string[]",
    },
  },
} satisfies ComponentTypeTable;
