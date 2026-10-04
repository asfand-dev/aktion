// A host-registered component, declared by module augmentation in
// host-components.ts, imported next to the built-ins (§7.9.4). Type-level
// fixture only (not `*.aktion.ts`): the default library has no PriceBadge.
import type {} from "./host-components.ts";
import { Row, Text, PriceBadge } from "aktion-runtime/dsl";

export const row = Row([Text("Total"), PriceBadge(9.99, { currency: "EUR", testId: "price" })]);

// @ts-expect-error the augmentation's own signature applies (amount is a number)
PriceBadge("9.99");
