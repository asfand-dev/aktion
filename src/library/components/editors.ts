/**
 * Editor components:
 *
 *   - RichTextEditor — `contenteditable`-based WYSIWYG editor for CMS / email.
 *   - CodeEditor — Lightweight, dependency-free code editor (textarea + gutter).
 *   - ContextMenu — Right-click menu attachable to any wrapped node.
 *   - ColorPicker — Hex / RGB form control with preset swatches.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon } from "../utils.js";
import { attachOnChange } from "./wrappers.js";

/* ----------------------------------------------------------------------- *
 * RichTextEditor
 * ----------------------------------------------------------------------- */

interface RteCommand {
  command: string;
  icon: string;
  label: string;
  block?: string;
}

const DEFAULT_RTE_TOOLS: RteCommand[] = [
  { command: "bold", icon: "bold", label: "Bold" },
  { command: "italic", icon: "italic", label: "Italic" },
  { command: "underline", icon: "underline", label: "Underline" },
  { command: "strikeThrough", icon: "strikethrough", label: "Strikethrough" },
  { command: "formatBlock", icon: "heading", label: "Heading", block: "h2" },
  { command: "formatBlock", icon: "quote-left", label: "Quote", block: "blockquote" },
  { command: "insertUnorderedList", icon: "list-ul", label: "Bullet list" },
  { command: "insertOrderedList", icon: "list-ol", label: "Numbered list" },
  { command: "createLink", icon: "link", label: "Link" },
];

export const RichTextEditor: ComponentSpec = {
  name: "RichTextEditor",
  description:
    "Rich-text WYSIWYG editor for CMS, email, and comment surfaces. " +
    "Renders a small toolbar (bold / italic / underline / strikethrough / " +
    "headings / lists / quote / link) above a `contenteditable` region. " +
    "Pass `$variable` as `value` for two-way binding — the HTML body is " +
    "written back to state on every edit. Provide `placeholder` for the " +
    "empty-state prompt.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound HTML body (typically $variable)" },
    { name: "placeholder", type: "string", optional: true, description: "Empty-state prompt" },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height for the editor area (default 160px)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current HTML on every keystroke" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const placeholder = asString(props.placeholder, "Start writing…");
    const disabled = asBoolean(props.disabled);
    const root = el("div", {
      class: "rui-rich-text",
      "data-disabled": disabled ? "true" : "false",
    });
    const toolbar = el("div", { class: "rui-rich-text-toolbar", role: "toolbar" });
    for (const tool of DEFAULT_RTE_TOOLS) {
      const btn = el("button", {
        type: "button",
        class: "rui-rich-text-tool",
        "data-command": tool.command,
        "data-block": tool.block ?? null,
        "aria-label": tool.label,
        title: tool.label,
        disabled: disabled ? "" : null,
      });
      const iconNode = renderIcon(tool.icon);
      if (iconNode) btn.append(iconNode);
      btn.onmousedown = (event) => event.preventDefault();
      btn.onclick = (event) => {
        const live = (event.currentTarget as Element).closest(".rui-rich-text");
        const editor = live?.querySelector<HTMLElement>(".rui-rich-text-content");
        if (!editor) return;
        editor.focus();
        try {
          if (tool.command === "createLink") {
            const url = window.prompt("URL");
            if (url) document.execCommand("createLink", false, url);
          } else if (tool.command === "formatBlock" && tool.block) {
            document.execCommand("formatBlock", false, tool.block);
          } else {
            document.execCommand(tool.command, false);
          }
        } catch {
          // execCommand can throw in some sandboxed contexts; swallow.
        }
        // Dispatch an input event so the state binding picks up the change.
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      };
      toolbar.append(btn);
    }
    root.append(toolbar);

    const initial = asString(props.value) || "";
    const isEmpty = (html: string): boolean => {
      const text = html.replace(/<br\s*\/?>(?=\s*$)/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
      return text.length === 0;
    };
    const editor = el("div", {
      class: "rui-rich-text-content",
      id,
      contenteditable: disabled ? "false" : "true",
      role: "textbox",
      "aria-multiline": "true",
      "aria-placeholder": placeholder,
      "data-placeholder": placeholder,
      "data-empty": isEmpty(initial) ? "true" : "false",
      style: `min-height:${asString(props.minHeight, "160px")};`,
      html: initial,
    });
    const refreshEmpty = (target: HTMLElement): void => {
      target.setAttribute("data-empty", isEmpty(target.innerHTML) ? "true" : "false");
    };
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !disabled) {
      helpers.bindState(editor, stateName, {
        event: "input",
        // Sync the placeholder state on every keystroke, alongside the
        // state write — keeps both behaviours in the single property-based
        // `oninput` slot so the morph reconciler transfers them as a unit.
        getValue: (n) => {
          const target = n as HTMLElement;
          refreshEmpty(target);
          return target.innerHTML;
        },
      });
    } else {
      editor.oninput = (event) => {
        const target = (event.currentTarget ?? event.target) as HTMLElement;
        refreshEmpty(target);
      };
    }
    editor.onblur = (event) => {
      const target = (event.currentTarget ?? event.target) as HTMLElement;
      refreshEmpty(target);
    };
    attachOnChange(editor, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLElement).innerHTML,
    });
    root.append(editor);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * CodeEditor — lightweight textarea-based editor with gutter
 * ----------------------------------------------------------------------- */

const CODE_LANGUAGES = ["text", "javascript", "typescript", "json", "html", "css", "bash", "python", "sql", "markdown"] as const;

export const CodeEditor: ComponentSpec = {
  name: "CodeEditor",
  description:
    "Lightweight, dependency-free code editor. Pairs a styled textarea " +
    "with a synchronised line-number gutter — no syntax highlighting, but " +
    "the editor stays a single rendered node so it works inside Shadow " +
    "DOM. Use for dev tooling, snippet editing, prompt playgrounds. Pass " +
    "a `$variable` as `value` for two-way binding. For read-only " +
    "rendering with highlights prefer `CodeBlock`.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound source text (typically $variable)" },
    { name: "language", type: "string", optional: true, enum: CODE_LANGUAGES, description: "Language label shown on the header (default `text`)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height for the editor area (default 200px)" },
    { name: "tabSize", type: "number", optional: true, description: "Spaces per Tab (default 2)" },
    { name: "showGutter", type: "boolean", optional: true, description: "Show line-number gutter (default true)" },
    { name: "readonly", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current source on every keystroke" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const value = asString(props.value);
    const language = asString(props.language, "text");
    const showGutter = props.showGutter === undefined ? true : asBoolean(props.showGutter);
    const tabSize = Math.max(1, Math.min(8, Math.floor(asNumber(props.tabSize, 2))));
    const readonly = asBoolean(props.readonly);
    const minHeight = asString(props.minHeight, "200px");
    const root = el("div", {
      class: "rui-code-editor",
      "data-language": language,
      "data-gutter": showGutter ? "true" : "false",
    });
    const head = el("div", { class: "rui-code-editor-head" });
    head.append(el("span", { class: "rui-code-editor-language" }, [language]));
    root.append(head);
    const body = el("div", {
      class: "rui-code-editor-body",
      style: `min-height:${minHeight};`,
    });
    const gutter = el("div", { class: "rui-code-editor-gutter", "aria-hidden": "true" });
    const renderGutter = (text: string) => {
      gutter.replaceChildren();
      const lines = text.split(/\r?\n/);
      const total = Math.max(1, lines.length);
      for (let i = 1; i <= total; i += 1) {
        gutter.append(el("span", { class: "rui-code-editor-line" }, [String(i)]));
      }
    };
    if (showGutter) {
      renderGutter(value);
      body.append(gutter);
    }
    const textarea = el("textarea", {
      class: "rui-code-editor-textarea",
      id,
      name: id,
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      placeholder: asString(props.placeholder),
      readonly: readonly ? "" : null,
      style: `tab-size:${tabSize};-moz-tab-size:${tabSize};`,
    }) as HTMLTextAreaElement;
    textarea.value = value;
    textarea.oninput = (event) => {
      const target = event.currentTarget as HTMLTextAreaElement;
      if (!showGutter) return;
      const liveRoot = target.closest(".rui-code-editor");
      const liveGutter = liveRoot?.querySelector<HTMLElement>(".rui-code-editor-gutter");
      if (!liveGutter) return;
      liveGutter.replaceChildren();
      const lines = target.value.split(/\r?\n/);
      const total = Math.max(1, lines.length);
      for (let i = 1; i <= total; i += 1) {
        liveGutter.append(el("span", { class: "rui-code-editor-line" }, [String(i)]));
      }
    };
    // Honour Tab as indentation rather than focus-change.
    textarea.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (e.key !== "Tab") return;
      e.preventDefault();
      const target = e.currentTarget as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const indent = " ".repeat(tabSize);
      target.value = target.value.slice(0, start) + indent + target.value.slice(end);
      target.selectionStart = target.selectionEnd = start + indent.length;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !readonly) {
      helpers.bindState(textarea, stateName, {
        event: "input",
        getValue: (n) => (n as HTMLTextAreaElement).value,
      });
    }
    if (!readonly) {
      attachOnChange(textarea, props.onChange, helpers, {
        event: "input",
        getValue: (n) => (n as HTMLTextAreaElement).value,
      });
    }
    body.append(textarea);
    root.append(body);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ContextMenu — right-click menu attachable to a child node
 * ----------------------------------------------------------------------- */

interface ContextMenuItem {
  label: string;
  action: unknown;
  icon: string;
  shortcut: string;
  variant: string;
  disabled: boolean;
  separator: boolean;
}

function extractContextItem(raw: unknown): ContextMenuItem | null {
  if (!raw) return null;
  if (typeof raw === "object") {
    const node = raw as { __kind?: string; name?: string; args?: unknown[] };
    if (node.__kind === "Component" && node.name === "MenuItem" && Array.isArray(node.args)) {
      const args = node.args;
      return {
        label: asString(args[0]),
        action: args[1],
        icon: asString(args[2]),
        shortcut: asString(args[3]),
        variant: asString(args[4], "default"),
        disabled: asBoolean(args[5]),
        separator: false,
      };
    }
    if (node.__kind === "Component" && node.name === "MenuSeparator") {
      return { label: "", action: null, icon: "", shortcut: "", variant: "default", disabled: false, separator: true };
    }
    const r = raw as Record<string, unknown>;
    if (r.separator) {
      return { label: "", action: null, icon: "", shortcut: "", variant: "default", disabled: false, separator: true };
    }
    return {
      label: asString(r.label),
      action: r.action,
      icon: asString(r.icon),
      shortcut: asString(r.shortcut),
      variant: asString(r.variant, "default"),
      disabled: asBoolean(r.disabled),
      separator: false,
    };
  }
  return null;
}

export const ContextMenu: ComponentSpec = {
  name: "ContextMenu",
  description:
    "Right-click (or long-press) menu that attaches to a child node. " +
    "Wraps `target` and shows the menu at the pointer when the user " +
    "right-clicks anywhere inside it. Items are `MenuItem(...)` nodes, " +
    "`MenuSeparator()` entries, or `{label, action, icon?, shortcut?, " +
    "variant?, disabled?, separator?}` objects. Use on table rows, tree " +
    "nodes, kanban cards, file browser entries.",
  props: [
    { name: "target", type: "Node", description: "Child node the menu is bound to" },
    { name: "items", type: "any[]", description: "MenuItem nodes or {label, action} objects" },
    { name: "label", type: "string", optional: true, description: "ARIA label for the menu" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-context-menu" });
    const wrap = el("div", { class: "rui-context-menu-target" });
    wrap.append(helpers.renderNode(props.target));
    root.append(wrap);
    const menu = el("div", {
      class: "rui-context-menu-pop",
      role: "menu",
      "aria-label": asString(props.label) || null,
      "data-open": "false",
    });
    const items = asArray<unknown>(props.items)
      .map(extractContextItem)
      .filter((i): i is ContextMenuItem => i !== null);
    for (const item of items) {
      if (item.separator) {
        menu.append(el("div", { class: "rui-menu-separator", role: "separator" }));
        continue;
      }
      const btn = el("button", {
        type: "button",
        class: "rui-menu-item",
        role: "menuitem",
        "data-variant": item.variant,
        disabled: item.disabled ? "" : null,
      });
      const iconNode = renderIcon(item.icon, { className: "rui-menu-item-icon" });
      if (iconNode) btn.append(iconNode);
      btn.append(el("span", { class: "rui-menu-item-label" }, [item.label]));
      if (item.shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [item.shortcut]));
      if (!item.disabled) {
        btn.onclick = () => {
          helpers.invoke(item.action);
          menu.setAttribute("data-open", "false");
        };
      }
      menu.append(btn);
    }
    root.append(menu);

    const closeAll = () => menu.setAttribute("data-open", "false");
    const open = (clientX: number, clientY: number) => {
      const liveRoot = wrap.isConnected ? wrap.closest(".rui-context-menu") as HTMLElement | null : null;
      const liveMenu = liveRoot?.querySelector<HTMLElement>(".rui-context-menu-pop") ?? menu;
      const rect = liveRoot?.getBoundingClientRect();
      const x = rect ? clientX - rect.left : clientX;
      const y = rect ? clientY - rect.top : clientY;
      liveMenu.style.left = `${x}px`;
      liveMenu.style.top = `${y}px`;
      liveMenu.setAttribute("data-open", "true");
      const dismiss = (event: Event) => {
        if (event.target && liveMenu.contains(event.target as Node)) return;
        liveMenu.setAttribute("data-open", "false");
        document.removeEventListener("click", dismiss, true);
        document.removeEventListener("contextmenu", dismiss, true);
      };
      setTimeout(() => {
        document.addEventListener("click", dismiss, true);
        document.addEventListener("contextmenu", dismiss, true);
      }, 0);
    };

    wrap.oncontextmenu = (event) => {
      event.preventDefault();
      open(event.clientX, event.clientY);
    };
    wrap.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        open(rect.left, rect.top + rect.height);
      }
      if (e.key === "Escape") closeAll();
    };
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ColorPicker
 * ----------------------------------------------------------------------- */

const DEFAULT_SWATCHES = [
  "#0f172a", "#334155", "#64748b", "#94a3b8",
  "#ef4444", "#f59e0b", "#facc15", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
];

function normaliseHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6,8}$/.test(hex)) return "";
  return `#${hex.toLowerCase().slice(0, 6)}`;
}

export const ColorPicker: ComponentSpec = {
  name: "ColorPicker",
  description:
    "Hex / RGB color form control with preset swatches. Pairs a native " +
    "`<input type=\"color\">` chip with a hex text input and a row of " +
    "preset swatches. Pass a `$variable` as `value` (hex string, e.g. " +
    "`\"#6366f1\"`) for two-way binding. Use for theme builders, label " +
    "color pickers, and any \"pick a color\" surface.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound hex value (typically $variable)" },
    { name: "label", type: "string", optional: true },
    { name: "swatches", type: "string[]", optional: true, description: "Preset hex colors (default to a 12-color palette)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected hex string" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const value = normaliseHex(asString(props.value)) || asString(props.value, "#000000");
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-color-picker", "data-disabled": disabled ? "true" : "false" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-color-picker-label", for: id }, [label]));
    const row = el("div", { class: "rui-color-picker-row" });
    const colorInput = el("input", {
      type: "color",
      class: "rui-color-picker-color",
      id,
      name: id,
      value: normaliseHex(value) || "#000000",
      disabled: disabled ? "" : null,
    }) as HTMLInputElement;
    const textInput = el("input", {
      type: "text",
      class: "rui-color-picker-hex",
      value,
      placeholder: "#000000",
      disabled: disabled ? "" : null,
      autocomplete: "off",
    }) as HTMLInputElement;
    const swatchRow = el("div", { class: "rui-color-picker-swatches" });
    const swatches = asArray<unknown>(props.swatches).map((c) => asString(c)).filter(Boolean);
    const palette = swatches.length > 0 ? swatches : DEFAULT_SWATCHES;
    for (const swatch of palette) {
      const safeHex = normaliseHex(swatch) || swatch;
      const btn = el("button", {
        type: "button",
        class: "rui-color-picker-swatch",
        style: `background:${safeHex}`,
        "aria-label": safeHex,
        title: safeHex,
        "data-active": safeHex.toLowerCase() === value.toLowerCase() ? "true" : "false",
      });
      btn.onclick = () => {
        colorInput.value = normaliseHex(safeHex) || colorInput.value;
        textInput.value = safeHex;
        colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      };
      swatchRow.append(btn);
    }
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !disabled) {
      helpers.bindState(colorInput, stateName, {
        event: "input",
        getValue: (n) => (n as HTMLInputElement).value,
      });
      // Keep the hex text input in sync with the color picker.
      colorInput.addEventListener("input", () => {
        textInput.value = colorInput.value;
      });
      textInput.oninput = () => {
        const next = normaliseHex(textInput.value);
        if (!next) return;
        colorInput.value = next;
        colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      };
    }
    if (!disabled) {
      attachOnChange(colorInput, props.onChange, helpers, {
        event: "input",
        getValue: (n) => (n as HTMLInputElement).value,
      });
    }
    row.append(colorInput, textInput);
    root.append(row, swatchRow);
    return root;
  },
};
