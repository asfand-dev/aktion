/**
 * Host-registered components reach `aktion-runtime/dsl` by module
 * augmentation, so calls to them are checked like library calls. `Toolbar`'s
 * rest parameter is named `props` only to exercise the rule's rest-parameter
 * mapping: every argument from the rest position on binds to it.
 */
import type { AktionNode } from "aktion-runtime/dsl";

declare module "aktion-runtime/dsl" {
  export interface PriceBadgeNamed {
    currency?: "EUR" | "USD";
  }
  export function PriceBadge(amount: number, props?: PriceBadgeNamed): AktionNode<"PriceBadge">;

  export interface ToolbarNamed {
    dense?: boolean;
    sticky?: boolean;
  }
  export function Toolbar(title: string, ...props: ToolbarNamed[]): AktionNode<"Toolbar">;
}
