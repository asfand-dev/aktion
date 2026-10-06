/**
 * Shared form helpers used by forms.ts and new-components.ts.
 */
/**
 * Wrap a bare input element in a field shell with a label, an optional/required
 * marker, guidance above the control, and a message below it — but ONLY when one
 * of those props is supplied (suggestions-global V.4). When none are present, the
 * input is returned unchanged so existing call sites keep identical output
 * (backwards compatible). Also wires `required` + `aria-invalid` /
 * `aria-describedby` on the control for accessibility.
 *
 * The vertical order is label → description → control → message, which is the
 * order a reader needs it in: what the field is, what to put in it, the field,
 * then what went wrong. `description` is guidance that is true whatever the value
 * is; `hint` is a note about the value; `warning` and `error` are verdicts on it.
 *
 * Only ONE message renders, in the order error > warning > hint: they occupy the
 * same slot, and a field that is simultaneously wrong and merely unusual has
 * nothing to gain from saying both. All of them join `aria-describedby`
 * (description first), so the control is described by everything it shows.
 *
 * `ownsName` is for a composite that hands the shell its WRAPPER and names its
 * own form control from `props.name` — an inner `<input>` / `<textarea>`, or a
 * hidden field carrying a value no visible control holds (a PIN, a tag list, a
 * drawing). The shell then leaves `name` alone: on the wrapper it was inert,
 * because a `<div name>` is submitted with no form.
 */
export declare function withFieldShell(control: HTMLElement, props: Record<string, unknown>, options?: {
    idKey?: string;
    ownsName?: boolean;
}): HTMLElement;
/**
 * The text of a field's "optional" marker, or `""` for none.
 *
 * `optional` is `true` for the built-in word or a string to say it another way —
 * the built-in is English, and a field shell cannot translate. Anything else
 * (`false`, a number, absent) renders no marker: `asString(false)` used to print
 * the word "false" as the marker. `required` wins: a field cannot be both, and
 * the attribute-backed state is the one assistive tech already announces.
 *
 * Shared by the field shell, `FormControl` and the controls that render their
 * own label (Checkbox, Slider, DatePicker, DateRangePicker), so the rule cannot
 * drift between them again.
 */
export declare function optionalMarkText(props: Record<string, unknown>): string;
/**
 * The marker element for {@link optionalMarkText}.
 *
 * NOT `aria-hidden`, unlike the required star. `required` is announced by the
 * attribute of the same name, so its star is decoration; HTML has no `optional`
 * attribute, which makes this text the only thing that carries the state — and
 * WCAG 3.3.2 wants it carried.
 */
export declare function optionalMarkNode(text: string): HTMLElement;
/** Props every field-shell-capable input accepts (for spec declarations). */
export declare const FIELD_SHELL_PROPS: readonly [{
    readonly name: "disabled";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Disable the control (non-editable, skipped by tab order)";
}, {
    readonly name: "label";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Field label rendered above the control";
}, {
    readonly name: "hint";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Helper text rendered below the control";
}, {
    readonly name: "error";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Validation error rendered below the control (marks it invalid). Takes the message slot ahead of `warning` and `hint`";
}, {
    readonly name: "warning";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Cautionary note below the control for a value that is accepted but probably not what was meant. Announced politely and does NOT mark the field invalid; takes the message slot ahead of `hint`";
}, {
    readonly name: "description";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Guidance rendered BETWEEN the label and the control — what to put in the field, as opposed to `hint`, which is a note about the value below it";
}, {
    readonly name: "required";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Mark the field required (adds a `*` and the `required` attribute)";
}, {
    readonly name: "optional";
    readonly type: "boolean | string";
    readonly optional: true;
    readonly description: "Mark the field optional in its label: `true` for \"(optional)\", or a string to word it another way (e.g. a translation). Ignored when `required` is set";
}, {
    readonly name: "invalid";
    readonly type: "boolean";
    readonly optional: true;
    readonly aliases: readonly ["ariaInvalid"];
    readonly description: "Mark the control invalid without supplying a message — for a field whose explanation lives outside it, e.g. in a `RequirementList` or a form-level summary";
}, {
    readonly name: "describedBy";
    readonly type: "string";
    readonly optional: true;
    readonly aliases: readonly ["ariaDescribedBy"];
    readonly description: "Space-separated ids of elements that describe this control, merged into its `aria-describedby` alongside the shell's own message";
}, {
    readonly name: "onBlur";
    readonly type: "callable";
    readonly optional: true;
    readonly aliases: readonly ["onblur"];
    readonly description: "Called with the current value when focus leaves the control (validate-on-blur, `form.touch`)";
}, {
    readonly name: "onFocus";
    readonly type: "callable";
    readonly optional: true;
    readonly aliases: readonly ["onfocus"];
    readonly description: "Called with the current value (the same value `onBlur` receives) when the control gains focus";
}, {
    readonly name: "name";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Form field name submitted to the server (defaults to `id`)";
}, {
    readonly name: "labelHidden";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context";
}];
export declare function fieldShellExtraProps(exclude?: readonly string[]): ({
    readonly name: "disabled";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Disable the control (non-editable, skipped by tab order)";
} | {
    readonly name: "label";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Field label rendered above the control";
} | {
    readonly name: "hint";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Helper text rendered below the control";
} | {
    readonly name: "error";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Validation error rendered below the control (marks it invalid). Takes the message slot ahead of `warning` and `hint`";
} | {
    readonly name: "warning";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Cautionary note below the control for a value that is accepted but probably not what was meant. Announced politely and does NOT mark the field invalid; takes the message slot ahead of `hint`";
} | {
    readonly name: "description";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Guidance rendered BETWEEN the label and the control — what to put in the field, as opposed to `hint`, which is a note about the value below it";
} | {
    readonly name: "required";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Mark the field required (adds a `*` and the `required` attribute)";
} | {
    readonly name: "optional";
    readonly type: "boolean | string";
    readonly optional: true;
    readonly description: "Mark the field optional in its label: `true` for \"(optional)\", or a string to word it another way (e.g. a translation). Ignored when `required` is set";
} | {
    readonly name: "invalid";
    readonly type: "boolean";
    readonly optional: true;
    readonly aliases: readonly ["ariaInvalid"];
    readonly description: "Mark the control invalid without supplying a message — for a field whose explanation lives outside it, e.g. in a `RequirementList` or a form-level summary";
} | {
    readonly name: "describedBy";
    readonly type: "string";
    readonly optional: true;
    readonly aliases: readonly ["ariaDescribedBy"];
    readonly description: "Space-separated ids of elements that describe this control, merged into its `aria-describedby` alongside the shell's own message";
} | {
    readonly name: "onBlur";
    readonly type: "callable";
    readonly optional: true;
    readonly aliases: readonly ["onblur"];
    readonly description: "Called with the current value when focus leaves the control (validate-on-blur, `form.touch`)";
} | {
    readonly name: "onFocus";
    readonly type: "callable";
    readonly optional: true;
    readonly aliases: readonly ["onfocus"];
    readonly description: "Called with the current value (the same value `onBlur` receives) when the control gains focus";
} | {
    readonly name: "name";
    readonly type: "string";
    readonly optional: true;
    readonly description: "Form field name submitted to the server (defaults to `id`)";
} | {
    readonly name: "labelHidden";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context";
})[];
interface FocusHelpers {
    invoke: (handler: unknown, ...args: unknown[]) => void;
}
/**
 * Wire an `onChange`-style prop as a DOM **property** handler, composed on top
 * of whatever handler `bindState` (or the component itself) already installed
 * for the same event.
 *
 * Not `addEventListener`: the morph reconciler cannot transfer a listener onto
 * the node it keeps, so the callback captured by the FIRST render is the only
 * one that ever runs. Inside a `.map` that lambda still holds the departed
 * row's loop variables, so typing in row 2 renames row 1 while the visible
 * value (a property handler, refreshed by morph) stays correct: silent data
 * corruption. A handler supplied only on a later render never fired, and one
 * withdrawn later kept firing.
 *
 * The property is assigned unconditionally and the prop is read *inside* the
 * handler, so a callback that only appears on a later render (`onChange:
 * $editing ? save : null`) is picked up as well. The value is read off the
 * LIVE node the event fired on, not the render-time element.
 */
export declare function bindChangeHandler(element: HTMLElement, props: Record<string, unknown>, helpers: FocusHelpers, options: {
    event: string;
    getValue: (node: HTMLElement) => unknown;
    prop?: string;
}): void;
/**
 * Chain an extra property handler after whatever is already assigned to
 * `propKey` — `bindState` owns the same keys (`oninput` / `onchange`), and
 * layering a second `addEventListener` instead is exactly what morph cannot
 * carry over.
 */
export declare function composeHandler(element: HTMLElement, propKey: string, extra: (event: Event) => void): void;
/**
 * Wire `onBlur`/`onFocus` props as DOM property handlers (morph contract —
 * fresh closures survive node reuse). `onBlur` receives the control's current
 * value so `form.touch(name)` / validate-on-blur flows work (V.1).
 */
export declare function attachFocusHandlers(control: HTMLElement, props: Record<string, unknown>, helpers: FocusHelpers, getValue?: (node: HTMLElement) => unknown): void;
export interface ComboboxItem {
    value: string;
    label: string;
    /** Option is listed but not selectable. */
    disabled?: boolean;
    /** Optional heading this option is bucketed under. */
    group?: string;
}
export declare function extractComboboxItems(raw: unknown): ComboboxItem[];
export {};
