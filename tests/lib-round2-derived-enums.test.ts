/**
 * Two lists that used to be hand-copied and are now read from their source:
 *
 *   - Icon's `variant` enum is `SUPPORTED_VARIANTS` (src/icons/index.ts), the
 *     styles `resolveIconClasses` honours;
 *   - ContextMenu's accepted row roles are MenuItem's `role` enum, so
 *     ContextMenu and DropdownMenu cannot disagree about a role.
 */

import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "../src/library/components/content.js";
import { MenuItem } from "../src/library/components/menu.js";
import { SUPPORTED_VARIANTS } from "../src/icons/index.js";
import { cleanup, render } from "../src/testing/index.js";

afterEach(() => cleanup());

describe("Icon(variant:)", () => {
  it("offers exactly SUPPORTED_VARIANTS, in order", () => {
    expect(Icon.props.find((p) => p.name === "variant")?.enum).toEqual([...SUPPORTED_VARIANTS]);
  });
});

describe("ContextMenu row roles", () => {
  const roles = MenuItem.props.find((p) => p.name === "role")!.enum!;

  const rowRoles = async (menu: "ContextMenu" | "DropdownMenu", items: string): Promise<string[]> => {
    const call = menu === "ContextMenu"
      ? `ContextMenu(Text("target"), ${items})`
      : `DropdownMenu(Button("Menu"), ${items}, { open: true })`;
    const screen = render(`$app(${call})`);
    await screen.flush();
    const rows = [...screen.shadowRoot.querySelectorAll(".rui-menu-item")].map((r) => r.getAttribute("role") ?? "");
    cleanup();
    return rows;
  };

  it("accepts every role MenuItem declares, and the same ones DropdownMenu does", async () => {
    expect(roles.length).toBeGreaterThan(1);
    const items = `[${[...roles, "button"].map((role) => `{ label: "${role}", role: "${role}" }`).join(", ")}]`;
    const context = await rowRoles("ContextMenu", items);
    expect(context).toEqual([...roles, "menuitem"]);
    expect(await rowRoles("DropdownMenu", items)).toEqual(context);
  });
});
