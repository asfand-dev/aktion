/**
 * Render an evaluated program tree into the shadow DOM.
 *
 * The renderer is intentionally simple: it walks the tree and asks the
 * library for a render function per component. There is no diffing — we
 * render the whole tree on each tick. For typical assistant responses
 * (a few cards, a table, a chart) this is fast enough and avoids the
 * complexity of a virtual DOM.
 */

import { isComponentNode, type ComponentNode } from "../runtime/evaluator.js";
import { isActionPayload } from "../runtime/builtins.js";
import type { ActionRunner } from "../runtime/actions.js";
import type { StateStore } from "../runtime/state.js";
import type { ScriptRunner } from "../runtime/scripts.js";
import { findComponent } from "../library/registry.js";
import {
  mapPositionalArgs,
  type ComponentLibrary,
  type RenderHelpers,
} from "../library/types.js";

export interface RenderOptions {
  library: ComponentLibrary;
  state: StateStore;
  actionRunner: ActionRunner;
  /** Optional script runner — when omitted, Script() and @Js are no-ops. */
  scriptRunner?: ScriptRunner;
}

export class Renderer {
  constructor(private readonly options: RenderOptions) {}

  render(value: unknown): Node {
    if (value === null || value === undefined) return document.createTextNode("");
    if (Array.isArray(value)) {
      const fragment = document.createDocumentFragment();
      for (const item of value) fragment.append(this.render(item));
      return fragment;
    }
    if (isComponentNode(value)) return this.renderComponent(value);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return document.createTextNode(String(value));
    }
    return document.createTextNode("");
  }

  private renderComponent(node: ComponentNode): Node {
    const spec = findComponent(this.options.library, node.name);
    if (!spec) {
      const placeholder = document.createElement("div");
      placeholder.className = "rui-unknown-component";
      placeholder.textContent = `[unknown component: ${node.name}]`;
      return placeholder;
    }
    const props = mapPositionalArgs(spec, node.args);
    const scriptRunner = this.options.scriptRunner;
    const helpers: RenderHelpers = {
      renderNode: (childValue) => this.render(childValue),
      runAction: (payload) => {
        if (isActionPayload(payload)) void this.options.actionRunner.run(payload);
      },
      bindState: (element, name, options) => {
        const event = options?.event ?? this.eventFor(element);
        const getter = options?.getValue ?? this.defaultValueGetter(element);
        element.addEventListener(event, () => {
          const next = getter(element);
          this.options.state.set(name, next);
        });
      },
      registerScript: (declaration) => {
        scriptRunner?.declare(declaration);
      },
      javascriptEnabled: Boolean(scriptRunner?.isEnabled()),
    };
    try {
      return spec.render(node, props, helpers);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[llm-response-ui-lang] failed to render ${spec.name}`, err);
      const fallback = document.createElement("div");
      fallback.className = "rui-render-error";
      fallback.textContent = `[render error in ${spec.name}]`;
      return fallback;
    }
  }

  private eventFor(element: HTMLElement): string {
    if (element instanceof HTMLSelectElement) return "change";
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) return "change";
    return "input";
  }

  private defaultValueGetter(element: HTMLElement): (el: HTMLElement) => unknown {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return (el) => (el as HTMLInputElement).checked;
    }
    if (element instanceof HTMLInputElement && element.type === "radio") {
      return (el) => (el as HTMLInputElement).value;
    }
    if (element instanceof HTMLInputElement && element.type === "number") {
      return (el) => Number((el as HTMLInputElement).value);
    }
    return (el) => (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }
}
