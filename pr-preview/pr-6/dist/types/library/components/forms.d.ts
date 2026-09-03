import { ComponentSpec } from '../types.js';
/**
 * The one button vocabulary. Every button-shaped control (`Button` here,
 * `IconButton` in new-components.ts) must take its `variant` / `size` enum from
 * these arrays rather than restate them: the two lists drifted once already —
 * IconButton advertised four variants where Button had seven, so `variant:
 * "outline"` was valid on one and a validation error on the other — and a
 * duplicated literal gives nothing to notice the next divergence.
 * Every value here has a matching `.rui-button[data-variant|data-size]` and
 * `.rui-icon-button[data-variant|data-size]` rule in the theme.
 */
export declare const BUTTON_VARIANTS: readonly ["primary", "secondary", "outline", "ghost", "link", "danger", "default"];
export declare const BUTTON_SIZES: readonly ["xs", "sm", "md", "lg", "xl"];
/**
 * Normalise a size token to the canonical `xs|sm|md|lg|xl` vocabulary.
 * `extra-small` / `small` / `large` / `extra-large` are accepted as verbose
 * spellings; anything unrecognised (or empty) falls back to `md`.
 *
 * Exported alongside `BUTTON_SIZES` so IconButton resolves sizes by the same
 * rules instead of keeping its own copy. IconButton's copy accepted `small` /
 * `large` where this one did not, so the verbose pair is honoured here too —
 * consolidating must not quietly narrow what either control used to take.
 */
export declare function normaliseButtonSize(value: unknown): string;
export declare const Button: ComponentSpec;
export declare const Buttons: ComponentSpec;
/**
 * `ButtonGroup` is the *segmented* sibling of `Buttons`: instead of separate
 * buttons with a gap, the items butt directly against each other into one
 * continuous control, with only the outer corners rounded and shared
 * 1px dividers between items. Distinct from `SegmentedControl`/`ToggleGroup`,
 * which render a padded track with a floating "active" chip.
 *
 * Each child is marked with `data-pos` (start / middle / end) so the theme can
 * round the right corners and collapse the adjoining borders.
 */
export declare const ButtonGroup: ComponentSpec;
/**
 * `InputGroup` wraps a single field with an optional leading icon and an
 * optional trailing action (a button or icon-button), all inside one shared
 * bordered shell — the pattern behind search fields, password reveal,
 * copy-to-clipboard inputs, and unit-suffixed numeric fields.
 *
 * The nested control keeps its own behaviour (binding, validation); the group
 * only owns the shell, so the border/focus ring is drawn once around the whole
 * composite instead of around the bare input.
 */
export declare const InputGroup: ComponentSpec;
export declare const Input: ComponentSpec;
export declare const TextArea: ComponentSpec;
export declare const SelectItem: ComponentSpec;
export declare const Select: ComponentSpec;
export declare const Checkbox: ComponentSpec;
export declare const CheckBoxItem: ComponentSpec;
export declare const CheckBoxGroup: ComponentSpec;
export declare const Radio: ComponentSpec;
export declare const FormControl: ComponentSpec;
export declare const SearchBar: ComponentSpec;
export declare const Form: ComponentSpec;
export declare const Slider: ComponentSpec;
export declare const NumberInput: ComponentSpec;
export declare const DatePicker: ComponentSpec;
export declare const FileUpload: ComponentSpec;
export declare const Combobox: ComponentSpec;
export declare const MultiSelect: ComponentSpec;
export declare const DateRangePicker: ComponentSpec;
