import { ViewContext, ViewDefinition } from '../context.js';
import { SecurityReport } from '../analysis/security.js';
export declare function runScan(ctx: ViewContext, options?: {
    quiet?: boolean;
}): SecurityReport | null;
/** Fetch the page's own response headers (HEAD, same origin, no cache). */
export declare function fetchPageHeaders(): Promise<Record<string, string>>;
export declare const securityView: ViewDefinition;
