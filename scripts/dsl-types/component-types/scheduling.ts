/** Curated types for the components of src/library/components/scheduling.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Calendar: {
    generics: [{ name: "Ev", default: "CalendarEvent", constraint: "CalendarEvent" }],
    types: {
      CalendarEventOf: "/** The event type `onEventClick` receives: the inferred one, or `CalendarEvent` when nothing was inferred (an empty list). */\nexport type CalendarEventOf<T> = [T] extends [never] ? CalendarEvent : T;",
      CalendarEventColor: "export type CalendarEventColor = \"primary\" | \"success\" | \"warning\" | \"danger\" | \"info\" | (string & {});",
      CalendarEvent: `export interface CalendarEvent {
  readonly date: string;
  /** Chip text; an event with neither \`label\` nor \`title\` renders as a dot. */
  readonly label?: string | number;
  /** Read as the chip text when \`label\` is absent. */
  readonly title?: string | number;
  /** A tone name or a CSS colour; one the sanitiser rejects falls back to \`primary\`. */
  readonly color?: CalendarEventColor;
  /** Read as the colour when \`color\` is absent. */
  readonly tone?: CalendarEventColor;
  readonly time?: string | number;
}`,
    },
    props: {
      selected: "string",
      onSelect: "(iso: string) => unknown",
      events: "readonly (string | Ev)[]",
      onNavigate: "(year: number, month: number) => unknown",
      minDate: "string",
      maxDate: "string",
      disabledDates: "readonly string[]",
      onEventClick: "(event: CalendarEventOf<Ev>, iso: string) => unknown",
      locale: "string",
      weekdayLabels: "readonly string[]",
      monthLabels: "readonly string[]",
    },
  },
} satisfies ComponentTypeTable;
