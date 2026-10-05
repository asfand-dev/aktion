/** Curated types for the components of src/library/components/advanced-forms.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  DateTimePicker: {
    props: {
      value: "string",
      min: "string",
      max: "string",
      step: "number | \"any\"",
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  MaskedInput: {
    props: {
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  MentionInput: {
    types: {
      MentionInputPerson: "export interface MentionInputPerson {\n  /** Inserted as `@handle` (first of handle, username, value, name, label, id). */\n  readonly handle?: string | number;\n  readonly username?: string | number;\n  readonly value?: string | number;\n  /** Display text (first of label, name, value, id). */\n  readonly label?: string | number;\n  readonly name?: string | number;\n  readonly id?: string | number;\n}",
    },
    props: {
      people: "readonly (string | MentionInputPerson)[]",
      onSearch: "(query: string) => void",
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  MultiStepForm: {
    types: {
      MultiStepFormStep: `export interface MultiStepFormStep {
  readonly title: string | number;
  readonly details?: string | number;
  /** Body rendered while this step is active. */
  readonly content?: Children;
}`,
    },
    props: {
      steps: "readonly MultiStepFormStep[]",
      onSubmit: "() => void",
      onStepChange: "(step: number) => void",
      onStepClick: "(index: number) => void",
    },
  },
  PasswordInput: {
    props: {
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  PinInput: {
    props: {
      onChange: "(value: string) => void",
      onComplete: "(code: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  RequirementList: {
    types: {
      RequirementListItem: `export type RequirementListItem =
  | { readonly label: string | number; readonly met?: boolean | null }
  | { readonly text: string | number; readonly met?: boolean | null };`,
    },
    props: {
      items: "readonly (string | RequirementListItem)[]",
    },
  },
  TagInput: {
    props: {
      suggestions: "readonly (string | number)[]",
      onChange: "(tags: string[]) => void",
      onBlur: "(tags: string[]) => void",
      onFocus: "(tags: string[]) => void",
    },
  },
  TimePicker: {
    props: {
      value: "string",
      min: "string",
      max: "string",
      step: "number | \"any\"",
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  ValidationSummary: {
    types: {
      ValidationSummaryError: `export type ValidationSummaryError =
  | { readonly message: string | number; readonly label?: string | number; readonly field?: string | number }
  | { readonly error: string | number; readonly label?: string | number; readonly field?: string | number };`,
    },
    props: {
      errors: "readonly (string | ValidationSummaryError | false | null | undefined)[]",
      onErrorClick: "(field: string) => void",
    },
  },
} satisfies ComponentTypeTable;
