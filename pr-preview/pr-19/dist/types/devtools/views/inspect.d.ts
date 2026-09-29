import { ViewContext, ViewDefinition } from '../context.js';
import { InstanceNode } from '../protocol.js';
/**
 * The nodes the tree shows. With a filter: a flat list of matches. With the
 * Library toggle off: only user components, each re-parented to its nearest
 * kept ancestor so the hierarchy survives instead of collapsing to a list.
 */
export declare function visibleNodes(ctx: Pick<ViewContext, "ui">, nodes: ReadonlyArray<InstanceNode>): InstanceNode[];
export declare const inspectView: ViewDefinition;
