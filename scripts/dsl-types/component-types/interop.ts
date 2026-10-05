/** Curated types for the components of src/library/components/interop.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Mount: {
    generics: [{ name: "Instance", default: "unknown" }, { name: "Props", default: "Record<string, unknown>", constraint: "object" }],
    props: {
      setup: "(node: DomElement, props: Props) => Instance",
      // Runs once `setup` has returned, whatever it returned — so `instance` can
      // be the `undefined` of a setup that only fills `node`.
      update: "(instance: Instance, props: Props, node: DomElement) => void",
      cleanup: "(instance: Instance | undefined) => void",
      props: "Props",
      deps: "readonly unknown[]",
      onError: "(error: unknown, stage: \"setup\" | \"update\") => void",
    },
  },
  WebComponent: {
    props: {
      tag: "`${string}-${string}`",
      attributes: "Readonly<Record<string, string | number | boolean | null | undefined>>",
      on: "Readonly<Record<string, ((event: DomEvent) => void) | null | undefined>>",
    },
  },
} satisfies ComponentTypeTable;
