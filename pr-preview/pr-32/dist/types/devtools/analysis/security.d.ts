import { NetworkRequest } from '../model.js';
import { ProgramSecurityProfile } from '../introspect.js';
export type Severity = "high" | "medium" | "low" | "info";
export type SecurityCategory = "program" | "dom" | "transport" | "storage" | "headers" | "csp";
export interface SecurityFinding {
    /** Stable per-finding id (`rule:evidence`). */
    id: string;
    rule: string;
    severity: Severity;
    category: SecurityCategory;
    title: string;
    detail: string;
    fix: string;
    evidence?: string;
    element?: Element;
    /** Source line for program findings. */
    line?: number;
    requestId?: string;
    storageKey?: string;
}
export interface OriginSummary {
    origin: string;
    requests: number;
    failed: number;
    firstParty: boolean;
    secure: boolean;
    credentials: boolean;
}
export interface StorageItem {
    area: "local" | "session" | "cookie";
    key: string;
    size: number;
    kind: "jwt" | "api-key" | "private-key" | "secret-name" | "none";
    /** Decoded JWT claims worth showing (`exp`, `sub`, `iss`, `aud`). */
    jwt?: {
        exp?: number;
        iat?: number;
        sub?: string;
        iss?: string;
        aud?: string;
        alg?: string;
        expired?: boolean;
    };
}
export interface HeaderCheck {
    header: string;
    value: string | null;
    status: "good" | "warn" | "missing" | "info";
    note: string;
}
export interface CspViolation {
    time: number;
    directive: string;
    blocked: string;
    source: string;
    disposition: string;
    sample?: string;
}
export interface SecurityReport {
    at: number;
    findings: SecurityFinding[];
    score: number;
    counts: Record<Severity, number>;
    origins: OriginSummary[];
    storage: StorageItem[];
    headers: HeaderCheck[] | null;
    profile: ProgramSecurityProfile | null;
    examined: number;
    pageOrigin: string;
    secureContext: boolean;
}
export interface SecurityInput {
    root: Element | null;
    requests: ReadonlyArray<NetworkRequest>;
    profile: ProgramSecurityProfile | null;
    location?: {
        href: string;
        protocol: string;
        hostname: string;
        origin: string;
    } | null;
    storage?: {
        local: Array<[string, string]>;
        session: Array<[string, string]>;
        cookies: Array<[string, string]>;
    } | null;
    headers?: Record<string, string> | null;
    cspMeta?: string | null;
    violations?: ReadonlyArray<CspViolation>;
    limit?: number;
}
/** Decode a JWT's header + claims, or `null` when the value is not one. */
export declare function decodeJwt(value: string, now?: number): StorageItem["jwt"] | null;
/** Classify a stored value by what it looks like. */
export declare function classifySecret(key: string, value: string): {
    kind: StorageItem["kind"];
    label?: string;
    jwt?: StorageItem["jwt"];
};
/** Local hosts where plain http is normal. */
export declare function isLocalHost(hostname: string): boolean;
/**
 * A data: URL that cannot run code where it is: an image, audio, video, font,
 * or caption payload loaded by a media element (an SVG drawn by `<img>` or an
 * SVG `<image>` runs no script). `url` is already trimmed and lower-cased.
 */
export declare function isInertDataUrl(tag: string, attr: string, url: string): boolean;
export declare function scanSecurity(input: SecurityInput): SecurityReport;
/** The first query parameter (or JWT-shaped value) in `raw` that looks like a credential. */
export declare function checkUrlSecrets(raw: string): string | null;
export declare function checkHeaders(headers: Record<string, string>, cspMeta: string | null, https: boolean): HeaderCheck[];
/** Read all three storage areas from the page. Every read is guarded — storage may be blocked. */
export declare function readPageStorage(): {
    local: Array<[string, string]>;
    session: Array<[string, string]>;
    cookies: Array<[string, string]>;
};
