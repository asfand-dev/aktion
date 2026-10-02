// Native TypeScript: a host that registers its own component (`mergeLibraries`)
// augments the module so Aktion modules can import it like a built-in (§7.9.4).
import type { AktionNode, BaseProps } from "aktion-runtime/dsl";

declare module "aktion-runtime/dsl" {
  export function PriceBadge(amount: number, props?: BaseProps & { currency?: string }): AktionNode<"PriceBadge">;
}
