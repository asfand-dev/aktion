/** Curated types for the components of src/library/components/forms.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Button: {
    props: {
      icon: "AktionIconName",
      onClick: "() => unknown",
    },
  },
  CheckBoxGroup: {
    types: {
      CheckBoxGroupItemData: "export interface CheckBoxGroupItemData { readonly label: string | number; readonly name: string | number; readonly description?: string | number; readonly defaultChecked?: boolean; readonly checked?: boolean; readonly disabled?: boolean; readonly value?: string | number; }",
    },
    props: {
      items: "readonly (AktionNode<\"CheckBoxItem\"> | CheckBoxGroupItemData | string)[]",
      value: "Readonly<Record<string, boolean>>",
      onChange: "(value: Record<string, boolean>) => unknown",
      optional: "boolean | string",
    },
  },
  Checkbox: {
    props: {
      onChange: "(checked: boolean) => unknown",
      optional: "boolean | string",
    },
  },
  Combobox: {
    types: {
      ComboboxItemData: "export interface ComboboxItemData { readonly value?: string | number | null; readonly id?: string | number | null; readonly key?: string | number | null; readonly code?: string | number | null; readonly label?: string | number | null; readonly name?: string | number | null; readonly title?: string | number | null; readonly text?: string | number | null; readonly description?: string | number | null; readonly disabled?: boolean | null; readonly group?: string | number | null; }",
    },
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | ComboboxItemData | string)[]",
      value: "string | number | null",
      onOpenChange: "(open: boolean) => unknown",
      onChange: "(value: string) => unknown",
      onSearch: "(query: string) => unknown",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
      optional: "boolean | string",
    },
  },
  DatePicker: {
    props: {
      value: "string | null",
      min: "string",
      max: "string",
      onChange: "(value: string) => unknown",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
      locale: "string",
      optional: "boolean | string",
    },
  },
  DateRangePicker: {
    types: {
      DateRangePickerRange: "export interface DateRangePickerRange { readonly from: string; readonly to: string; }",
    },
    props: {
      from: "string | null",
      to: "string | null",
      min: "string",
      max: "string",
      onChange: "(range: DateRangePickerRange) => unknown",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
      locale: "string",
      optional: "boolean | string",
    },
  },
  FileUpload: {
    props: {
      icon: "AktionIconName",
      onSelect: "(files: DomFile[]) => unknown",
      onRemove: "(file: DomFile) => unknown",
    },
  },
  Form: {
    props: {
      onSubmit: "() => unknown",
    },
  },
  FormControl: {
    props: {
      description: "string | number | AktionNode",
      optional: "boolean | string",
    },
  },
  Input: {
    types: {
      InputValidationHint: "export type InputValidationHint = \"required\" | \"email\" | `minLength:${number}` | `maxLength:${number}` | `pattern:${string}` | `min:${string}` | `max:${string}`;",
      InputValidationRules: "export interface InputValidationRules { readonly required?: boolean | null; readonly email?: boolean | null; readonly minLength?: number | `${number}` | false | null; readonly maxLength?: number | `${number}` | false | null; readonly pattern?: string | false | null; readonly min?: number | string | false | null; readonly max?: number | string | false | null; }",
      InputAutocomplete: "export type InputAutocomplete = \"on\" | \"off\" | \"name\" | \"honorific-prefix\" | \"given-name\" | \"additional-name\" | \"family-name\" | \"honorific-suffix\" | \"nickname\" | \"email\" | \"username\" | \"new-password\" | \"current-password\" | \"one-time-code\" | \"organization-title\" | \"organization\" | \"street-address\" | \"address-line1\" | \"address-line2\" | \"address-line3\" | \"address-level4\" | \"address-level3\" | \"address-level2\" | \"address-level1\" | \"country\" | \"country-name\" | \"postal-code\" | \"cc-name\" | \"cc-given-name\" | \"cc-additional-name\" | \"cc-family-name\" | \"cc-number\" | \"cc-exp\" | \"cc-exp-month\" | \"cc-exp-year\" | \"cc-csc\" | \"cc-type\" | \"transaction-currency\" | \"transaction-amount\" | \"language\" | \"bday\" | \"bday-day\" | \"bday-month\" | \"bday-year\" | \"sex\" | \"tel\" | \"tel-country-code\" | \"tel-national\" | \"tel-area-code\" | \"tel-local\" | \"tel-local-prefix\" | \"tel-local-suffix\" | \"tel-extension\" | \"impp\" | \"url\" | \"photo\" | \"username webauthn\" | \"current-password webauthn\" | (string & {});",
    },
    props: {
      validations: "readonly InputValidationHint[] | InputValidationRules",
      value: "string | number | null",
      onChange: "(value: string) => unknown",
      optional: "boolean | string",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
      autocomplete: "InputAutocomplete",
    },
  },
  InputGroup: {
    props: {
      icon: "AktionIconName",
      optional: "boolean | string",
      onBlur: "(value: string | string[]) => unknown",
      onFocus: "(value: string | string[]) => unknown",
    },
  },
  MultiSelect: {
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | ComboboxItemData | string)[]",
      value: "readonly (string | number)[]",
      onOpenChange: "(open: boolean) => unknown",
      onChange: "(values: string[]) => unknown",
      onSearch: "(query: string) => unknown",
      optional: "boolean | string",
    },
  },
  NumberInput: {
    props: {
      value: "number | null",
      onChange: "(value: number | null) => unknown",
      optional: "boolean | string",
      onBlur: "(value: number | null) => unknown",
      onFocus: "(value: number | null) => unknown",
      onLimit: "(limit: \"min\" | \"max\") => unknown",
    },
  },
  Radio: {
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | string)[]",
      value: "string | number | null",
      onChange: "(value: string) => unknown",
      optional: "boolean | string",
    },
  },
  SearchBar: {
    props: {
      value: "string | number | null",
      onSubmit: "() => unknown",
      onChange: "(value: string) => unknown",
      onClear: "() => unknown",
    },
  },
  Select: {
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | string)[]",
      value: "string | number | null",
      onChange: "(value: string) => unknown",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
      onSearch: "(query: string) => unknown",
      optional: "boolean | string",
    },
  },
  Slider: {
    types: {
      SliderMark: "export interface SliderMark { readonly value: number; readonly label?: string | number; }",
    },
    props: {
      onChange: "(value: number) => unknown",
      marks: "readonly (number | SliderMark)[]",
      optional: "boolean | string",
    },
  },
  TextArea: {
    props: {
      value: "string | number | null",
      onChange: "(value: string) => unknown",
      optional: "boolean | string",
      onBlur: "(value: string) => unknown",
      onFocus: "(value: string) => unknown",
    },
  },
} satisfies ComponentTypeTable;
