import { ComponentLibrary, ComponentSpec } from '../library/types.js';
export interface ToolSpec {
    name: string;
    description: string;
    argsExample?: Record<string, unknown>;
    kind?: "Query" | "Mutation";
}
export type PromptMode = "full" | "chat";
export interface PromptOptions {
    mode?: PromptMode;
    preamble?: string;
    additionalRules?: ReadonlyArray<string>;
    examples?: ReadonlyArray<string>;
    tools?: ReadonlyArray<ToolSpec>;
    toolExamples?: ReadonlyArray<string>;
    toolCalls?: boolean;
    bindings?: boolean;
    inlineMode?: boolean;
    editMode?: boolean;
}
export declare function generatePrompt(library: ComponentLibrary, options?: PromptOptions): string;
export declare function describeComponentSpec(spec: ComponentSpec): string;
