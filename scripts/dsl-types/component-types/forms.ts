/** Curated types for the components of src/library/components/forms.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Button: {
    props: {
      onClick: "() => void",
      size: "\"xs\" | \"sm\" | \"md\" | \"lg\" | \"xl\" | \"m\" | \"small\" | \"normal\" | \"large\"",
    },
  },
  ButtonGroup: {
    props: {
      size: "\"sm\" | \"md\" | \"lg\"",
    },
  },
  CheckBoxGroup: {
    types: {
      CheckBoxGroupItemData: "export interface CheckBoxGroupItemData { readonly label: string | number; readonly name: string | number; readonly description?: string | number; readonly defaultChecked?: boolean; readonly checked?: boolean; readonly disabled?: boolean; readonly value?: string | number; }",
    },
    props: {
      items: "readonly (AktionNode<\"CheckBoxItem\"> | CheckBoxGroupItemData | string)[]",
      value: "Readonly<Record<string, boolean>>",
      onChange: "(value: Record<string, boolean>) => void",
      optional: "true | string",
    },
  },
  Checkbox: {
    props: {
      onChange: "(checked: boolean) => void",
      optional: "true | string",
    },
  },
  Combobox: {
    types: {
      ComboboxItemData: "export interface ComboboxItemData { readonly value?: string | number | null; readonly id?: string | number | null; readonly key?: string | number | null; readonly code?: string | number | null; readonly label?: string | number | null; readonly name?: string | number | null; readonly title?: string | number | null; readonly text?: string | number | null; readonly description?: string | number | null; readonly disabled?: boolean | null; readonly group?: string | number | null; }",
    },
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | ComboboxItemData | string)[]",
      value: "string | number | null",
      onOpenChange: "(open: boolean) => void",
      onChange: "(value: string) => void",
      onSearch: "(query: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
      optional: "true | string",
    },
  },
  DatePicker: {
    props: {
      value: "string | null",
      min: "string",
      max: "string",
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
      locale: "string",
      optional: "true | string",
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
      onChange: "(range: DateRangePickerRange) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
      locale: "string",
      optional: "true | string",
    },
  },
  FileUpload: {
    props: {
      onSelect: "(files: ArrayLike<DomFile>) => void",
      onRemove: "(file: DomFile) => void",
    },
  },
  Form: {
    props: {
      onSubmit: "() => void",
    },
  },
  FormControl: {
    props: {
      description: "string | number | AktionNode",
      optional: "true | string",
    },
  },
  Input: {
    types: {
      InputValidationHint: "export type InputValidationHint = \"required\" | \"email\" | `minLength:${number}` | `maxLength:${number}` | `pattern:${string}` | `min:${string}` | `max:${string}`;",
      InputValidationRules: "export interface InputValidationRules { readonly minLength?: number | `${number}`; readonly maxLength?: number | `${number}`; readonly pattern?: string; readonly min?: number | string; readonly max?: number | string; }",
      InputAutocomplete: "export type InputAutocomplete = \"on\" | \"off\" | \"name\" | \"honorific-prefix\" | \"given-name\" | \"additional-name\" | \"family-name\" | \"honorific-suffix\" | \"nickname\" | \"email\" | \"username\" | \"new-password\" | \"current-password\" | \"one-time-code\" | \"organization-title\" | \"organization\" | \"street-address\" | \"address-line1\" | \"address-line2\" | \"address-line3\" | \"address-level4\" | \"address-level3\" | \"address-level2\" | \"address-level1\" | \"country\" | \"country-name\" | \"postal-code\" | \"cc-name\" | \"cc-given-name\" | \"cc-additional-name\" | \"cc-family-name\" | \"cc-number\" | \"cc-exp\" | \"cc-exp-month\" | \"cc-exp-year\" | \"cc-csc\" | \"cc-type\" | \"transaction-currency\" | \"transaction-amount\" | \"language\" | \"bday\" | \"bday-day\" | \"bday-month\" | \"bday-year\" | \"sex\" | \"tel\" | \"tel-country-code\" | \"tel-national\" | \"tel-area-code\" | \"tel-local\" | \"tel-local-prefix\" | \"tel-local-suffix\" | \"tel-extension\" | \"impp\" | \"url\" | \"photo\" | \"username webauthn\" | \"current-password webauthn\" | (string & {});",
    },
    props: {
      validations: "readonly InputValidationHint[] | InputValidationRules",
      value: "string | number | null",
      onChange: "(value: string) => void",
      optional: "true | string",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
      autocomplete: "InputAutocomplete",
    },
  },
  InputGroup: {
    props: {
      optional: "true | string",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
  MultiSelect: {
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | ComboboxItemData | string)[]",
      value: "readonly (string | number)[]",
      onOpenChange: "(open: boolean) => void",
      onChange: "(values: string[]) => void",
      onSearch: "(query: string) => void",
      optional: "true | string",
    },
  },
  NumberInput: {
    props: {
      value: "number | null",
      onChange: "(value: number | null) => void",
      optional: "true | string",
      onBlur: "(value: number | null) => void",
      onFocus: "(value: number | null) => void",
      onLimit: "(limit: \"min\" | \"max\") => void",
    },
  },
  Radio: {
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | string)[]",
      value: "string | number | null",
      onChange: "(value: string) => void",
      optional: "true | string",
    },
  },
  SearchBar: {
    props: {
      value: "string | number | null",
      onSubmit: "() => void",
      onChange: "(value: string) => void",
      onClear: "() => void",
    },
  },
  Select: {
    props: {
      items: "readonly (AktionNode<\"SelectItem\"> | SelectItemData | string)[]",
      value: "string | number | null",
      onChange: "(value: string) => void",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
      onSearch: "(query: string) => void",
      optional: "true | string",
    },
  },
  Slider: {
    types: {
      SliderMark: "export interface SliderMark { readonly value: number; readonly label?: string | number; }",
    },
    props: {
      onChange: "(value: number) => void",
      marks: "readonly (number | SliderMark)[]",
      optional: "true | string",
    },
  },
  TextArea: {
    props: {
      value: "string | number | null",
      onChange: "(value: string) => void",
      optional: "true | string",
      onBlur: "(value: string) => void",
      onFocus: "(value: string) => void",
    },
  },
} satisfies ComponentTypeTable;
