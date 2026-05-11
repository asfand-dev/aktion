/**
 * Runs `Action([...])` payloads.
 *
 * Steps execute sequentially. A failing `@Run` short-circuits the rest.
 */

import type { ActionPayload, ActionStep } from "./builtins.js";
import type { EvaluationContext } from "./evaluator.js";
import type { ScriptRunner } from "./scripts.js";

export interface ActionRunnerOptions {
  getContext: () => EvaluationContext;
  /** Called when the LLM should be addressed (@ToAssistant). */
  onAssistantMessage?: (message: string) => void;
  /** Override how URLs are opened (defaults to window.open). */
  onOpenUrl?: (url: string) => void;
  /** Optional bridge for `@Js("...")` steps (when JS interactions are on). */
  scriptRunner?: ScriptRunner;
}

export class ActionRunner {
  constructor(private readonly options: ActionRunnerOptions) {}

  async run(payload: ActionPayload): Promise<void> {
    for (const step of payload.steps) {
      try {
        await this.runStep(step);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[streaming-ui-script] action step failed", step, err);
        return;
      }
    }
  }

  private async runStep(step: ActionStep): Promise<void> {
    const ctx = this.options.getContext();
    switch (step.kind) {
      case "Set":
        ctx.state.set(step.name, step.value);
        return;
      case "Reset":
        ctx.state.reset(...step.names);
        return;
      case "Run":
        await ctx.queries.run(step.ref, this.options.getContext);
        return;
      case "ToAssistant":
        this.options.onAssistantMessage?.(step.message);
        return;
      case "OpenUrl": {
        const opener = this.options.onOpenUrl;
        if (opener) opener(step.url);
        else if (typeof window !== "undefined") window.open(step.url, "_blank", "noopener");
        return;
      }
      case "Js": {
        // No-op when scripts are disabled — the action keeps flowing through
        // other steps so a single button can still @Run mutations, etc.
        this.options.scriptRunner?.runInline(step.code, step.args);
        return;
      }
    }
  }
}
