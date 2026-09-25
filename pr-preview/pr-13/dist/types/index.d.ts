import { AktionElement, defineElement } from './element.js';
export { AktionElement, defineElement };
export * from './parser/index.js';
export * from './runtime/index.js';
export * from './library/index.js';
export * from './renderer/index.js';
export * from './prompt/index.js';
export * from './theme/index.js';
export * from './language/index.js';
export * from './compiler/index.js';
export { componentSchema, suggestComponent, tailwindToSx, cssToSx, styledToSx, buildGallery, } from './tooling/schema.js';
export type { LibrarySchema, ComponentSchemaEntry, ComponentPropSchema, GalleryOptions, } from './tooling/schema.js';
export { htmlToAktion } from './tooling/html-import.js';
declare global {
    interface HTMLElementTagNameMap {
        "aktion-app": AktionElement;
    }
}
export declare const SYSTEM_PROMPT_TEXT: string;
