/**
 * Shared form helpers used by forms.ts and new-components.ts.
 */

import { asArray, asString } from "../utils.js";

export function extractComboboxItems(raw: unknown): Array<{ value: string; label: string }> {
  const items = asArray<unknown>(raw);
  return items
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const node = entry as { __kind?: string; args?: unknown[]; value?: unknown; label?: unknown };
        if (node.__kind === "Component" && Array.isArray(node.args)) {
          const value = asString(node.args[0]);
          return { value, label: asString(node.args[1], value) };
        }
        if (node.value !== undefined || node.label !== undefined) {
          const value = asString(node.value);
          return { value, label: asString(node.label, value) };
        }
      }
      const value = asString(entry);
      return { value, label: value };
    })
    .filter((item) => item.value !== "" || item.label !== "");
}
