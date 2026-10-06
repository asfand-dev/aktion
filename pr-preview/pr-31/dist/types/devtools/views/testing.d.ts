import { Scenario, ViewContext, ViewDefinition } from '../context.js';
import { RecordedStep } from '../recorder.js';
/** The step's label without the verb its type chip already shows. */
export declare function stepText(step: RecordedStep): string;
export declare function testSource(ctx: ViewContext, steps: ReadonlyArray<RecordedStep>): string;
export declare function applyScenario(ctx: ViewContext, scenario: Scenario): void;
/** Edge-case inputs that break real apps: empty, huge, unicode, markup, injection, numbers. */
export declare const FUZZ_STRINGS: ReadonlyArray<string>;
/** Small, fast, seedable PRNG (mulberry32). */
export declare function seededRandom(seed: number): () => number;
export declare const testingView: ViewDefinition;
