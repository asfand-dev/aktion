import { ComponentSpec } from '../types.js';
export declare const StackItem: ComponentSpec;
export declare const Row: ComponentSpec;
export declare const Column: ComponentSpec;
export declare const Stack: ComponentSpec;
export declare const Center: ComponentSpec;
export declare const Card: ComponentSpec;
export declare const CardHeader: ComponentSpec;
export declare const CardFooter: ComponentSpec;
/**
 * `CardSection` is a full-bleed horizontal band *inside* a Card that
 * colour-codes a chunk of its content — the status band pattern (an inline
 * "this is activating / succeeded / needs attention" stripe that spans the
 * card's full width, edge to edge, with a tinted background and a rule above
 * and below). Distinct from `Callout`, which is a self-contained bordered
 * notice box; a CardSection is part of the card's own body flow.
 */
export declare const CardSection: ComponentSpec;
export declare const Separator: ComponentSpec;
export declare const Steps: ComponentSpec;
export declare const TabItem: ComponentSpec;
export declare const Tabs: ComponentSpec;
export declare const AccordionItem: ComponentSpec;
export declare const Accordion: ComponentSpec;
/** Resolve a grid span from a number or fraction string (e.g. `"1/3"` → 4 on a 12-col grid). */
export declare function resolveSpan(span: unknown): number;
export declare const GridItem: ComponentSpec;
export declare const Box: ComponentSpec;
export declare const Fragment: ComponentSpec;
export declare const Grid: ComponentSpec;
export declare const AspectRatio: ComponentSpec;
export declare const ScrollArea: ComponentSpec;
export declare const Modal: ComponentSpec;
