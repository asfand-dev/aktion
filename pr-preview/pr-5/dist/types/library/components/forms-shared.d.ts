/**
 * Shared form helpers used by forms.ts and new-components.ts.
 */
/**
 * Wrap a bare input element in a field shell with a label, required marker,
 * hint, and error message — but ONLY when one of those props is supplied
 * (suggestions-global V.4). When none are present, the input is returned
 * unchanged so existing call sites keep identical output (backwards
 * compatible). Also wires `required` + `aria-invalid` / `aria-describedby`
 * on the control for accessibility.
 */
export declare function withFieldShell(control: HTMLElement, props: Record<string, unknown>, options?: {
    idKey?: string;
}): HTMLElement;
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
    readonly description: "Validation error rendered below the control (marks it invalid)";
}, {
    readonly name: "required";
    readonly type: "boolean";
    readonly optional: true;
    readonly description: "Mark the field required (adds a `*` and the `required` attribute)";
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
    readonly description: "Called when the control gains focus";
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
interface FocusHelpers {
    invoke: (handler: unknown, ...args: unknown[]) => void;
}
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
