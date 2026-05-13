/**
 * JavaScript-interactions components.
 *
 * `Script("id", "body", deps?)` is a behaviour-only node — it renders an
 * invisible placeholder and delegates execution to the `ScriptRunner` that
 * lives on the host `<streaming-ui-script>` element.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString } from "../utils.js";

export const Script: ComponentSpec = {
  name: "Script",
  description:
    "Run JavaScript when this node mounts (and again when any listed $variable changes). Body receives `ctx` with state, tools, refs, dispatch, open, cleanup, signal, host.",
  props: [
    { name: "id", type: "string", description: "Stable identifier — reused to dedupe re-renders." },
    { name: "body", type: "string", description: "JavaScript source. `ctx` is the runtime bridge." },
    {
      name: "deps",
      type: "string[]",
      optional: true,
      description:
        "Names of $variables to watch (without the leading $). Omit (or pass null) to run once on mount; [] also means once.",
    },
  ],
  render: (_node, props, helpers) => {
    const id = asString(props.id).trim();
    const body = asString(props.body);
    if (id && body) {
      const deps = props.deps === null || props.deps === undefined
        ? undefined
        : asArray<unknown>(props.deps)
            .map((value) => asString(value).trim())
            .filter(Boolean);
      helpers.registerScript({ id, body, deps });
    }
    // Behavior-only node: render an empty placeholder. `display:contents` lets
    // it sit inside a Stack/Card without taking layout space.
    return el("template", {
      class: "rui-script",
      "data-script-id": id || null,
    });
  },
};
