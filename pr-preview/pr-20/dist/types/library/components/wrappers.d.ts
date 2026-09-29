import { ComponentSpec, RenderHelpers } from '../types.js';
export declare const OnClick: ComponentSpec;
export declare const OnMouse: ComponentSpec;
export declare const OnKeyboard: ComponentSpec;
export declare const OnFocus: ComponentSpec;
export declare const OnIntersect: ComponentSpec;
export declare const OnMount: ComponentSpec;
export declare const Link: ComponentSpec;
export declare const Css: ComponentSpec;
export declare function attachOnChange(element: HTMLElement, callback: unknown, helpers: RenderHelpers, options: {
    event?: string;
    getValue: (el: HTMLElement) => unknown;
}): void;
