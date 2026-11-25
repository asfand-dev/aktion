import { AktionDevtoolsHook, DevtoolsAppRecord } from './hook.js';
import { AppModel } from './model.js';
import { RecordedStep } from './recorder.js';
/** What an export needs — a structural subset of the view context. */
export interface SessionSource {
    model: AppModel;
    hook: Pick<AktionDevtoolsHook, "protocolVersion" | "libraryVersion">;
    app: DevtoolsAppRecord | null;
}
export declare const SESSION_FORMAT = "aktion-devtools-session";
/** The whole session as pretty-printed JSON. */
export declare function exportSessionJson(ctx: SessionSource, extras?: {
    steps?: ReadonlyArray<RecordedStep>;
    note?: string;
}): string;
export interface ImportedSession {
    label: string;
    model: AppModel;
    program: string | null;
    exportedAt: string | null;
    environment: Record<string, unknown> | null;
    steps: RecordedStep[];
    note?: string;
}
/**
 * Rebuild a model from an exported session. Tolerant by design: a file from an
 * older panel (no `format` field) or a truncated one imports what it has.
 */
export declare function importSessionJson(text: string, fileName?: string): ImportedSession;
/**
 * A bug report a person can paste into a ticket: what happened, where, and the
 * evidence — errors, failed requests, the steps that reproduce it — in Markdown.
 */
export declare function bugReportMarkdown(ctx: SessionSource, extras?: {
    steps?: ReadonlyArray<RecordedStep>;
    title?: string;
    vitals?: string[];
}): string;
