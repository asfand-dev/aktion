import { TabContext, TabDefinition } from '../context.js';
import { InstanceNode } from '../protocol.js';
export declare const inspectTab: TabDefinition;
/**
 * The rows to show, with depth re-derived from the *visible* ancestors.
 *
 * Hiding library components must not flatten the hierarchy: a user component
 * nested three library components deep is still nested, and indenting it at zero
 * makes siblings and children indistinguishable. Each visible node is therefore
 * re-parented to its nearest visible ancestor, and its depth recomputed from
 * that chain.
 */
export declare function visibleNodes(ctx: TabContext, nodes: ReadonlyArray<InstanceNode>): InstanceNode[];
