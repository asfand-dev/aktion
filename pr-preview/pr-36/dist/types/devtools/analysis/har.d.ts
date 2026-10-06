import { NetworkRequest } from '../model.js';
/** Quote for a POSIX shell: single quotes, with embedded ones escaped. */
export declare function shellQuote(value: string): string;
/** A copy-pasteable cURL command, one flag (with its value) per continued line. */
export declare function toCurl(request: Pick<NetworkRequest, "method" | "url" | "requestHeaders" | "requestBody">): string;
export declare function toFetch(request: Pick<NetworkRequest, "method" | "url" | "requestHeaders" | "requestBody">): string;
/**
 * A HAR 1.2 document. `epochOffset` converts the model's monotonic clock
 * (`performance.now()`) into wall-clock time for `startedDateTime`.
 */
export declare function toHar(requests: ReadonlyArray<NetworkRequest>, options: {
    epochOffset: number;
    creator?: string;
    version?: string;
    pageTitle?: string;
}): string;
