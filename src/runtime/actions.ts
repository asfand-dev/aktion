/**
 * Runs `Action([...])` payloads.
 *
 * Steps execute sequentially. A failing `@Run` short-circuits the rest.
 */

import type { ActionPayload, ActionStep } from "./builtins.js";
import type { EvaluationContext } from "./evaluator.js";
import type { Router } from "./router.js";
import type { ScriptRunner } from "./scripts.js";
import { sanitiseHref } from "../library/utils.js";

export interface ActionRunnerOptions {
  getContext: () => EvaluationContext;
  /** Called when the LLM should be addressed (@ToAssistant). */
  onAssistantMessage?: (message: string) => void;
  /** Override how URLs are opened (defaults to window.open). */
  onOpenUrl?: (url: string) => void;
  /** Router used to handle `@Navigate("...")` steps. */
  router?: Router;
  /** Bridge for `@Js("...")` steps. */
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
        // Sanitise so a hostile `javascript:` URL emitted by an LLM/tool
        // response cannot execute when the user clicks a button. A consumer
        // who overrides `onOpenUrl` still receives the sanitised value; the
        // unsafe placeholder (`#`) is harmless to pass through.
        const safeUrl = sanitiseHref(step.url, "#");
        const opener = this.options.onOpenUrl;
        if (opener) opener(safeUrl);
        else if (safeUrl !== "#" && typeof window !== "undefined") {
          // `noreferrer` rounds out `noopener` so the destination cannot
          // read the opener's `document.referrer`.
          window.open(safeUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }
      case "Navigate": {
        this.options.router?.navigate(step.path);
        return;
      }
      case "Js": {
        this.options.scriptRunner?.runInline(step.code, step.args);
        return;
      }
    }
  }
}
