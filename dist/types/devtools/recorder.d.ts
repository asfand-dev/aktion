/**
 * Aktion DevTools — interaction recorder and test generator.
 *
 * Click through a bug once; get a runnable test that reproduces it. That is the
 * whole idea: the slowest part of writing a regression test is not the
 * assertion, it is re-deriving the eight interactions that led to the broken
 * state and then guessing at selectors that will still match next week.
 *
 * The recorder listens on the app's render root (inside the shadow root, so
 * events are not retargeted to the host), turns each interaction into a
 * **query strategy** rather than a DOM path, and emits `aktion-runtime/test`
 * code. Query selection follows Testing Library's priority order — test id,
 * then role + accessible name, then label, then placeholder, then text — because
 * a test that finds a button by its accessible name keeps passing when the
 * markup around it changes, and one that finds it by `div > div:nth-child(3)`
 * does not.
 */
/** How a recorded step locates its element. */
export interface QueryStrategy {
    kind: "testid" | "role" | "label" | "placeholder" | "text" | "css";
    /** Primary value: the id, role, label text, placeholder, or selector. */
    value: string;
    /** Accessible name, for `role` queries. */
    name?: string;
}
/** One recorded interaction. */
export interface RecordedStep {
    type: "click" | "type" | "select" | "check" | "uncheck" | "key" | "navigate" | "wait";
    query?: QueryStrategy;
    /** Typed text, selected option, or navigation path. */
    value?: string;
    /** Key name for a `key` step. */
    key?: string;
    time: number;
    /** Human-readable one-liner shown in the recorder list. */
    label: string;
}
/** Options for the generated test. */
export interface CodegenOptions {
    /** Test name. */
    title?: string;
    /** The program source to inline; omit to emit a `PROGRAM` placeholder. */
    program?: string;
    /** Reactive state to assert at the end, as `name → value` pairs. */
    assertions?: Array<{
        name: string;
        value: unknown;
    }>;
    /** Emit `import { describe, it, expect } from "vitest"` (default true). */
    vitestImports?: boolean;
    /** Package specifier for the testing entry. */
    packageName?: string;
}
/**
 * Choose the most robust query for an element.
 *
 * Ordered by how well each survives an unrelated edit to the UI. A `css`
 * strategy is the last resort and is flagged as such in the generated code, so
 * a brittle step is visible rather than silently fragile.
 */
export declare function chooseQuery(element: Element, root?: Node | null): QueryStrategy;
/** The `screen.*` expression that resolves a strategy. */
export declare function queryExpression(query: QueryStrategy): string;
/** Short human description of a strategy, for the recorder list. */
export declare function queryLabel(query: QueryStrategy): string;
/**
 * Records interactions on one app's render root.
 *
 * Typing is coalesced: a text field receives one `type` step carrying its final
 * value, not one per keystroke — a 12-step test for typing "ada@example.com" is
 * unreadable and slower to run for no benefit.
 */
export declare class InteractionRecorder {
    private readonly steps;
    private target;
    private listeners;
    private recording;
    private onChange;
    /** Element whose typing is still being coalesced into the last step. */
    private typingElement;
    /** True while events are being captured. */
    get isRecording(): boolean;
    /** Steps recorded so far, oldest first. */
    list(): ReadonlyArray<RecordedStep>;
    /** Drop every recorded step. */
    clear(): void;
    /** Remove one step by index (a misclick should not poison the test). */
    remove(index: number): void;
    /**
     * Start capturing on `root`.
     *
     * Listeners are attached in the CAPTURE phase so a handler that calls
     * `stopPropagation()` (a menu closing itself, a form intercepting submit)
     * cannot hide the interaction from the recorder.
     */
    start(root: Element | null, onChange: () => void): boolean;
    /** Stop capturing, keeping the recorded steps. */
    stop(): void;
    /**
     * Append a step the DOM cannot report — a route change, or an explicit wait.
     * The panel calls this when it sees a `route` event while recording, so a test
     * that navigates mid-flow reproduces the navigation instead of silently
     * depending on it.
     */
    addStep(step: Omit<RecordedStep, "time">): void;
    private push;
    private onClick;
    private onInput;
    private onChangeEvent;
    private onKeyDown;
}
/**
 * Emit a runnable `aktion-runtime/test` test from recorded steps.
 *
 * The program is inlined as a template literal so the file is self-contained —
 * a test that references a program you have to reconstruct is not a
 * reproduction. Assertions come from the state the app ended in, which is
 * usually exactly the invariant that broke.
 */
export declare function generateTest(steps: ReadonlyArray<RecordedStep>, options?: CodegenOptions): string;
/**
 * A one-off snapshot test: the current rendered HTML plus the current state.
 *
 * Useful as a baseline before a refactor — the assertion is not "this is
 * right", it is "this did not change".
 */
export declare function generateSnapshotTest(program: string, state: Record<string, unknown>, options?: {
    title?: string;
    packageName?: string;
}): string;
