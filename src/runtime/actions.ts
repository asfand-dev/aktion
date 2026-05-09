/**
 * Runs `Action([...])` payloads.
 *
 * Steps execute sequentially. A failing `@Run` short-circuits the rest.
 */

import type { ActionPayload, ActionStep } from "./builtins.js";
import type { EvaluationContext } from "./evaluator.js";

export interface ActionRunnerOptions {
  getContext: () => EvaluationContext;
  /** Called when the LLM should be addressed (@ToAssistant). */
  onAssistantMessage?: (message: string) => void;
  /** Override how URLs are opened (defaults to window.open). */
  onOpenUrl?: (url: string) => void;
}

export class ActionRunner {
  constructor(private readonly options: ActionRunnerOptions) {}

  async run(payload: ActionPayload): Promise<void> {
    for (const step of payload.steps) {
      try {
        await this.runStep(step);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[llm-response-ui-lang] action step failed", step, err);
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
    }
  }
}
