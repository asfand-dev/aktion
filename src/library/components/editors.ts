/**
 * Editor components:
 *
 *   - RichTextEditor — `contenteditable`-based WYSIWYG editor for CMS / email.
 *   - CodeEditor — Lightweight, dependency-free code editor (textarea + gutter).
 *   - ContextMenu — Right-click / long-press menu attachable to any wrapped node.
 *   - ColorPicker — Hex / RGB / HSL form control with preset swatches.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  valueAttr, sanitiseHref, sanitiseCssColor,
} from "../utils.js";
import { attachOnChange } from "./wrappers.js";
import { withFieldShell } from "./forms-shared.js";
import { setSanitisedHtml, readSanitisedHtml } from "../html-sanitizer.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";
import { closeFloating, openFloating, deferToPaint, type FloatingSide } from "../floating.js";

/* ----------------------------------------------------------------------- *
 * RichTextEditor
 * ----------------------------------------------------------------------- */

interface RteCommand {
  /** Stable token authors pass in `tools` (matched case-insensitively). */
  key: string;
  command: string;
  icon: string;
  label: string;
  block?: string;
}

const DEFAULT_RTE_TOOLS: RteCommand[] = [
  { key: "bold", command: "bold", icon: "bold", label: "Bold" },
  { key: "italic", command: "italic", icon: "italic", label: "Italic" },
  { key: "underline", command: "underline", icon: "underline", label: "Underline" },
  { key: "strikethrough", command: "strikeThrough", icon: "strikethrough", label: "Strikethrough" },
  { key: "heading", command: "formatBlock", icon: "heading", label: "Heading", block: "h2" },
  { key: "quote", command: "formatBlock", icon: "quote-left", label: "Quote", block: "blockquote" },
  { key: "bulletList", command: "insertUnorderedList", icon: "list-ul", label: "Bullet list" },
  { key: "numberedList", command: "insertOrderedList", icon: "list-ol", label: "Numbered list" },
  { key: "link", command: "createLink", icon: "link", label: "Link" },
];

const RTE_TOOL_KEYS = DEFAULT_RTE_TOOLS.map((t) => t.key);

/**
 * Resolve the `tools` prop to an ordered toolbar. An empty / absent prop keeps
 * the full set; otherwise the author's order is honoured so a comment box can
 * ship `["bold", "italic", "link"]` and an email composer can forbid `link`.
 */
function selectRteTools(raw: unknown): RteCommand[] {
  const requested = asArray<unknown>(raw)
    .map((t) => asString(t).trim().toLowerCase())
    .filter(Boolean);
  if (requested.length === 0) return DEFAULT_RTE_TOOLS;
  const out: RteCommand[] = [];
  for (const token of requested) {
    const tool = DEFAULT_RTE_TOOLS.find(
      (t) => t.key.toLowerCase() === token
        || t.command.toLowerCase() === token
        || t.block === token,
    );
    if (tool && !out.includes(tool)) out.push(tool);
  }
  return out;
}

/**
 * Reflect the caret's active formatting into `aria-pressed` on every tool.
 *
 * `role="toolbar"` toggle buttons must expose a pressed state, and there was
 * no visual or assistive signal at all before — toggling bold was guesswork.
 * Inline commands answer `queryCommandState`; block commands do not, so they
 * are compared against `queryCommandValue("formatBlock")` instead.
 */
const syncRteToolStates = (origin: Element | null): void => {
  if (!origin) return;
  const live = origin.closest(".rui-rich-text");
  if (!live) return;
  let block = "";
  try {
    block = String(document.queryCommandValue?.("formatBlock") ?? "").toLowerCase();
  } catch {
    // Unsupported in some engines / sandboxes — leave every tool unpressed.
  }
  for (const btn of live.querySelectorAll<HTMLElement>(".rui-rich-text-tool")) {
    const command = btn.getAttribute("data-command") ?? "";
    const wanted = btn.getAttribute("data-block");
    let active = false;
    if (command === "formatBlock") {
      active = !!wanted && block === wanted;
    } else if (command !== "createLink") {
      try {
        active = document.queryCommandState?.(command) ?? false;
      } catch {
        active = false;
      }
    }
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
};

export const RichTextEditor: ComponentSpec = {
  name: "RichTextEditor",
  description:
    "Rich-text WYSIWYG editor for CMS, email, and comment surfaces. " +
    "Renders a small toolbar (bold / italic / underline / strikethrough / " +
    "headings / lists / quote / link) above a `contenteditable` region; pass " +
    "`tools` to subset it. Pass `$variable` as `value` for two-way binding — " +
    "the HTML body is written back to state on every edit. Provide " +
    "`placeholder` for the empty-state prompt, `maxHeight` to make a long " +
    "document scroll, `readonly` for review flows, and " +
    "`label`/`hint`/`error`/`required` for a labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound HTML body (typically $variable)" },
    { name: "placeholder", type: "string", optional: true, description: "Empty-state prompt" },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height for the editor area (default 160px)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current HTML on every keystroke" },
    { name: "tools", type: "string[]", optional: true, enum: RTE_TOOL_KEYS, description: "Subset (and order) of toolbar tools — defaults to all of them" },
    { name: "maxHeight", type: "string", optional: true, description: "CSS max-height for the editor area; the body scrolls past it" },
    { name: "readonly", type: "boolean", optional: true, description: "Content stays readable and selectable at full contrast but cannot be edited" },
    { name: "name", type: "string", optional: true, description: "Form field name — the HTML body is mirrored into a hidden input for native submission" },
    { name: "label", type: "string", optional: true, description: "Field label rendered above the editor" },
    { name: "hint", type: "string", optional: true, aliases: ["helperText"], description: "Helper text rendered below the editor" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the editor (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*`)" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const placeholder = asString(props.placeholder, "Start writing…");
    const disabled = asBoolean(props.disabled);
    const readonly = asBoolean(props.readonly);
    // `readonly` deliberately does NOT set `data-disabled`: the stylesheet dims
    // that to 0.6 opacity, and a review surface has to stay full-contrast.
    const inert = disabled || readonly;
    const root = el("div", {
      class: "rui-rich-text",
      "data-disabled": disabled ? "true" : "false",
      "data-readonly": readonly ? "true" : "false",
    });

    const tools = selectRteTools(props.tools);
    const toolbar = el("div", { class: "rui-rich-text-toolbar", role: "toolbar", "aria-label": "Formatting" });
    let firstEnabled = true;
    for (const tool of tools) {
      const btn = el("button", {
        type: "button",
        class: "rui-rich-text-tool",
        "data-command": tool.command,
        "data-block": tool.block ?? null,
        "aria-label": tool.label,
        "aria-pressed": "false",
        title: tool.label,
        disabled: inert ? "" : null,
        // A toolbar is a single tab stop: the first enabled tool holds it and
        // the arrow keys move a roving focus between the rest.
        tabindex: !inert && firstEnabled ? "0" : "-1",
      });
      if (!inert && firstEnabled) firstEnabled = false;
      const iconNode = renderIcon(tool.icon);
      if (iconNode) btn.append(iconNode);
      btn.onmousedown = (event) => event.preventDefault();
      btn.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as Element;
        const live = origin.closest(".rui-rich-text");
        const editor = live?.querySelector<HTMLElement>(".rui-rich-text-content");
        if (!editor || editor.getAttribute("contenteditable") === "false") return;
        editor.focus();
        try {
          if (tool.command === "createLink") {
            // `sanitiseHref` is the single chokepoint for anything that lands
            // on an `href`: a pasted `javascript:` URL here would otherwise
            // become a live script anchor, and get persisted by `getValue`.
            const safe = sanitiseHref(window.prompt("URL"), "");
            if (safe) document.execCommand("createLink", false, safe);
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
        syncRteToolStates(origin);
      };
      toolbar.append(btn);
    }
    toolbar.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      const bar = (e.currentTarget ?? e.target) as HTMLElement;
      const items = Array.from(bar.querySelectorAll<HTMLButtonElement>(".rui-rich-text-tool:not([disabled])"));
      if (items.length === 0) return;
      e.preventDefault();
      const active = (bar.getRootNode() as Document | ShadowRoot).activeElement;
      const found = items.findIndex((t) => t === active);
      const current = found < 0 ? 0 : found;
      const next = e.key === "Home" ? 0
        : e.key === "End" ? items.length - 1
          : e.key === "ArrowRight" ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
      for (const t of items) t.setAttribute("tabindex", "-1");
      const target = items[next]!;
      target.setAttribute("tabindex", "0");
      target.focus();
    };
    root.append(toolbar);

    const initial = asString(props.value) || "";
    const isEmpty = (html: string): boolean => {
      const text = html.replace(/<br\s*\/?>(?=\s*$)/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
      return text.length === 0;
    };
    // `props.value` present (even as "") means the program is asserting the
    // body; absent means the content is user-owned and must never be recomputed
    // from a stale prop.
    const asserts = props.value !== undefined && props.value !== null;
    const emptySlot = helpers.useInstanceState<boolean | null>("empty", null);
    const liveSlot = helpers.useInstanceState<HTMLElement | null>("live", null);
    const assertedSlot = helpers.useInstanceState<string | null>("asserted", null);
    const emptyNow = asserts ? isEmpty(initial) : (emptySlot.get() ?? isEmpty(initial));
    const heightStyle = `min-height:${asString(props.minHeight, "160px")};`
      + (asString(props.maxHeight) ? `max-height:${asString(props.maxHeight)};` : "");
    const editor = el("div", {
      class: "rui-rich-text-content",
      id,
      contenteditable: inert ? "false" : "true",
      role: "textbox",
      "aria-multiline": "true",
      "aria-readonly": readonly ? "true" : null,
      "aria-placeholder": placeholder,
      "aria-label": asString(props.label) || null,
      "data-placeholder": placeholder,
      "data-empty": emptyNow ? "true" : "false",
      // The user's caret, selection and typed markup live in these children.
      // Without this the reconciler diffs them against the render-time `value`
      // and deletes the draft on any unrelated re-render — and there is no
      // caret-preserving path for contenteditable the way there is for inputs.
      "data-rui-preserve": "",
      style: heightStyle,
    });
    // `value` is fully untrusted: it is a DSL prop, and when bound to a
    // `$variable` it also carries whatever an HTTP/WebSocket response or a
    // stored value put there. It used to be assigned straight to `innerHTML`.
    setSanitisedHtml(editor, initial);

    const hiddenName = asString(props.name);
    if (hiddenName) {
      root.append(el("input", {
        type: "hidden",
        class: "rui-rich-text-mirror",
        name: hiddenName,
        value: valueAttr(props.value),
      }));
    }

    /** Sync everything derived from the live content: placeholder + form mirror. */
    const refreshLive = (target: HTMLElement): void => {
      const empty = isEmpty(target.innerHTML);
      emptySlot.set(empty);
      liveSlot.set(target);
      target.setAttribute("data-empty", empty ? "true" : "false");
      const mirror = target.closest(".rui-rich-text")?.querySelector<HTMLInputElement>(".rui-rich-text-mirror");
      if (mirror) mirror.value = readSanitisedHtml(target);
    };

    // The editor subtree is preserved, so morph will not push a programmatic
    // `value` change into it. Apply those ourselves against the live node, and
    // only when the asserted value actually changed — otherwise a re-render
    // would rewrite the DOM under the caret on every keystroke.
    if (asserts && assertedSlot.get() !== initial) {
      const previous = assertedSlot.get();
      assertedSlot.set(initial);
      const live = liveSlot.get();
      // …and only when the editor does not already hold it. A keystroke
      // round-trips through the `$variable` (`getValue` writes the sanitised
      // body back), so the new assertion is usually the user's own text coming
      // home — replacing identical markup would collapse the caret on every
      // character typed. `readSanitisedHtml` is the same normalisation the
      // write-back uses, so the two strings are directly comparable.
      if (previous !== null && live?.isConnected && readSanitisedHtml(live) !== initial) {
        setSanitisedHtml(live, initial);
        refreshLive(live);
      }
    }
    if (liveSlot.get() === null) {
      // First mount only: capture the node the reconciler will keep forever.
      // A re-render's snapshot is discarded, so it never gets here.
      deferToPaint(() => {
        if (editor.isConnected) liveSlot.set(editor);
      });
    }

    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !inert) {
      helpers.bindState(editor, stateName, {
        event: "input",
        // Sync the placeholder state on every keystroke, alongside the
        // state write — keeps both behaviours in the single property-based
        // `oninput` slot so the morph reconciler transfers them as a unit.
        getValue: (n) => {
          const target = n as HTMLElement;
          refreshLive(target);
          // Sanitise on the way OUT as well. A user can paste arbitrary markup
          // into a contenteditable, and this value is written into a
          // `$variable` that may be persisted and re-rendered later.
          return readSanitisedHtml(target);
        },
      });
    } else {
      editor.oninput = (event) => {
        refreshLive((event.currentTarget ?? event.target) as HTMLElement);
      };
    }
    editor.onblur = (event) => {
      refreshLive((event.currentTarget ?? event.target) as HTMLElement);
    };
    // Caret moves change which formats are active, so re-read the command state
    // whenever the selection can have moved.
    editor.onkeyup = (event) => syncRteToolStates((event.currentTarget ?? event.target) as Element);
    editor.onmouseup = (event) => syncRteToolStates((event.currentTarget ?? event.target) as Element);
    attachOnChange(editor, props.onChange, helpers, {
      event: "input",
      getValue: (n) => readSanitisedHtml(n as HTMLElement),
    });
    root.append(editor);
    return withFieldShell(root, props, { idKey: "id" });
  },
};

/* ----------------------------------------------------------------------- *
 * CodeEditor — lightweight textarea-based editor with gutter
 * ----------------------------------------------------------------------- */

const CODE_LANGUAGES = ["text", "javascript", "typescript", "json", "html", "css", "bash", "python", "sql", "markdown"] as const;

/**
 * One shared line box for the gutter and the textarea, in px.
 *
 * The stylesheet gave both `line-height: 1.6` but different font sizes (12px vs
 * an inherited 13px), so the numbers drifted 1.6px per line and were a full
 * line out of register by line 13. A unitless multiplier cannot be shared
 * across two different font sizes — an absolute value can.
 */
const CODE_LINE_HEIGHT = 20;

/** Rebuild a gutter to hold exactly one number per line of `text`. */
const fillGutter = (gutter: Element, text: string): void => {
  gutter.replaceChildren();
  const total = Math.max(1, text.split(/\r?\n/).length);
  for (let i = 1; i <= total; i += 1) {
    gutter.append(el("span", { class: "rui-code-editor-line" }, [String(i)]));
  }
};

/**
 * Insert `text` over the current selection through `execCommand("insertText")`.
 *
 * This is the only programmatic textarea edit browsers push onto the native
 * undo stack, so Ctrl+Z still recovers the previous text after an indent. A
 * plain `value =` assignment wipes the undo history instead.
 */
const insertText = (target: HTMLTextAreaElement, text: string): boolean => {
  // `execCommand` edits whatever holds the selection, so it is only correct
  // while the textarea we mean is the focused element.
  if ((target.getRootNode() as Document | ShadowRoot).activeElement !== target) return false;
  try {
    return document.execCommand?.("insertText", false, text) ?? false;
  } catch {
    return false;
  }
};

/** Indent (or, for `outdent`, unindent) every line the selection touches. */
const reindent = (target: HTMLTextAreaElement, outdent: boolean, indent: string): void => {
  const value = target.value;
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? start;

  if (start === end && !outdent) {
    if (!insertText(target, indent)) {
      if (typeof target.setRangeText === "function") target.setRangeText(indent, start, end, "end");
      else target.value = value.slice(0, start) + indent + value.slice(end);
      target.selectionStart = target.selectionEnd = start + indent.length;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return;
  }

  // Line-wise: a selection must be indented, never replaced. Expand to whole
  // lines so partial selections behave like every other code editor.
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  const outdentRe = new RegExp(`^(?:\\t| {1,${indent.length}})`);
  let firstDelta = 0;
  let totalDelta = 0;
  const lines = value.slice(lineStart, lineEnd).split("\n").map((line, i) => {
    const updated = outdent ? line.replace(outdentRe, "") : indent + line;
    const delta = updated.length - line.length;
    if (i === 0) firstDelta = delta;
    totalDelta += delta;
    return updated;
  });
  if (totalDelta === 0) return;
  const replacement = lines.join("\n");

  target.setSelectionRange(lineStart, lineEnd);
  if (!insertText(target, replacement)) {
    if (typeof target.setRangeText === "function") target.setRangeText(replacement, lineStart, lineEnd, "end");
    else target.value = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const nextStart = Math.max(lineStart, start + firstDelta);
  target.setSelectionRange(nextStart, Math.max(nextStart, end + totalDelta));
};

export const CodeEditor: ComponentSpec = {
  name: "CodeEditor",
  description:
    "Lightweight, dependency-free code editor. Pairs a styled textarea " +
    "with a synchronised line-number gutter — no syntax highlighting, but " +
    "the editor stays a single rendered node so it works inside Shadow " +
    "DOM. Tab / Shift+Tab indent and unindent the selected lines, and " +
    "Ctrl/Cmd+S calls `onSave`. Use for dev tooling, snippet editing, " +
    "prompt playgrounds. Pass a `$variable` as `value` for two-way " +
    "binding, `maxHeight` for a fixed-height scrolling pane, and " +
    "`label`/`hint`/`error` to surface a parse error under the field. For " +
    "read-only rendering with highlights prefer `CodeBlock`.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound source text (typically $variable)" },
    { name: "language", type: "string", optional: true, enum: CODE_LANGUAGES, description: "Language label shown on the header (default `text`)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height for the editor area (default 200px)" },
    { name: "tabSize", type: "number", optional: true, description: "Spaces per Tab (default 2)" },
    { name: "showGutter", type: "boolean", optional: true, description: "Show line-number gutter (default true)" },
    { name: "readonly", type: "boolean", optional: true, description: "Content stays focusable and submittable but cannot be edited" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current source on every keystroke" },
    { name: "maxHeight", type: "string", optional: true, description: "CSS max-height for the editor area; the body scrolls past it" },
    { name: "filename", type: "string", optional: true, description: "Filename shown on the left of the header" },
    { name: "copyable", type: "boolean", optional: true, description: "Show a copy-to-clipboard button on the right of the header" },
    { name: "onSave", type: "callable", optional: true, description: "Called with the current source on Ctrl/Cmd+S" },
    { name: "name", type: "string", optional: true, description: "Form field name (defaults to `id`)" },
    { name: "disabled", type: "boolean", optional: true, description: "Disable the control (non-editable, skipped by tab order, not submitted)" },
    { name: "label", type: "string", optional: true, description: "Field label rendered above the editor" },
    { name: "hint", type: "string", optional: true, aliases: ["helperText"], description: "Helper text rendered below the editor" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the editor (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*`)" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const language = asString(props.language, "text");
    const showGutter = props.showGutter === undefined ? true : asBoolean(props.showGutter);
    const tabSize = Math.max(1, Math.min(8, Math.floor(asNumber(props.tabSize, 2))));
    const readonly = asBoolean(props.readonly);
    const disabled = asBoolean(props.disabled);
    const inert = readonly || disabled;
    const minHeight = asString(props.minHeight, "200px");
    const maxHeight = asString(props.maxHeight);

    // Same contract as `valueAttr`: a present `value` prop is an assertion, an
    // absent one means the text belongs to the user. `syncTextArea` in the
    // reconciler has no "attribute absent" escape hatch, so the last content we
    // saw on the live node is replayed into the fresh one instead — otherwise
    // an `onChange`-only editor blanks itself on any unrelated re-render.
    const sourceSlot = helpers.useInstanceState<string | null>("source", null);
    const asserts = props.value !== undefined && props.value !== null;
    const source = asserts ? asString(props.value) : (sourceSlot.get() ?? "");

    const root = el("div", {
      class: "rui-code-editor",
      "data-language": language,
      "data-gutter": showGutter ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
    });

    const head = el("div", { class: "rui-code-editor-head" });
    // `.rui-code-editor-head` is `space-between`, i.e. laid out for a trailing
    // element; group the metadata so the copy button lands on the right.
    const meta = el("div", {
      class: "rui-code-editor-head-meta",
      style: "display:flex;align-items:center;gap:8px;min-width:0;",
    });
    const filename = asString(props.filename);
    if (filename) {
      meta.append(el("span", {
        class: "rui-code-editor-filename",
        style: "font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
      }, [filename]));
    }
    meta.append(el("span", { class: "rui-code-editor-language" }, [language]));
    head.append(meta);
    if (asBoolean(props.copyable)) {
      const copyBtn = el("button", {
        type: "button",
        class: "rui-code-block-copy rui-code-editor-copy",
        "aria-label": "Copy code",
      }, ["Copy"]);
      copyBtn.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as HTMLElement;
        const area = origin.closest(".rui-code-editor")?.querySelector<HTMLTextAreaElement>(".rui-code-editor-textarea");
        if (!area) return;
        navigator.clipboard?.writeText(area.value)?.catch(() => {
          // Clipboard permission denied — leave the button unmarked.
        });
        origin.setAttribute("data-copied", "true");
        const timer = setTimeout(() => origin.removeAttribute("data-copied"), 1500) as unknown as number;
        helpers.registerDisposer(() => clearTimeout(timer), "rui-code-editor-copy");
      };
      head.append(copyBtn);
    }
    root.append(head);

    const body = el("div", {
      class: "rui-code-editor-body",
      style: `min-height:${minHeight};` + (maxHeight ? `max-height:${maxHeight};overflow:auto;` : ""),
    });
    const gutter = el("div", {
      class: "rui-code-editor-gutter",
      "aria-hidden": "true",
      // Identical font metrics to the textarea, or the numbers drift out of
      // register; `overflow: hidden` is what makes the scroll sync below work.
      style: `font-size:13px;line-height:${CODE_LINE_HEIGHT}px;overflow:hidden;`,
    });
    if (showGutter) {
      fillGutter(gutter, source);
      body.append(gutter);
    }
    const textarea = el("textarea", {
      class: "rui-code-editor-textarea",
      id,
      name: asString(props.name) || id,
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      placeholder: asString(props.placeholder),
      readonly: readonly ? "" : null,
      disabled: disabled ? "" : null,
      // `min-width: 0` defeats the grid column's automatic minimum size, which
      // otherwise refuses to shrink below the textarea's min-content width and
      // pushes the code out of the `overflow: hidden` root on narrow viewports.
      style: `tab-size:${tabSize};-moz-tab-size:${tabSize};line-height:${CODE_LINE_HEIGHT}px;min-width:0;`,
    }) as HTMLTextAreaElement;
    textarea.value = source;

    /** Rebuild the live gutter and remember the user-owned text. */
    const readSource = (n: HTMLElement): string => {
      const target = n as HTMLTextAreaElement;
      sourceSlot.set(target.value);
      if (showGutter) {
        const liveGutter = target.closest(".rui-code-editor")
          ?.querySelector<HTMLElement>(".rui-code-editor-gutter");
        if (liveGutter) fillGutter(liveGutter, target.value);
      }
      return target.value;
    };

    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !inert) {
      // One `oninput` slot only — `bindState` assigns the same property, so the
      // gutter rebuild has to travel inside `getValue` rather than in a second
      // handler that this call would silently clobber.
      helpers.bindState(textarea, stateName, { event: "input", getValue: readSource });
    } else {
      textarea.oninput = (event) => {
        readSource((event.currentTarget ?? event.target) as HTMLElement);
      };
    }
    // A user-dragged `resize: vertical` makes the textarea scroll internally
    // while the gutter does not, so keep the two scroll offsets together.
    textarea.onscroll = (event) => {
      const target = (event.currentTarget ?? event.target) as HTMLTextAreaElement;
      const liveGutter = target.closest(".rui-code-editor")
        ?.querySelector<HTMLElement>(".rui-code-editor-gutter");
      if (liveGutter) liveGutter.scrollTop = target.scrollTop;
    };
    textarea.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const target = (e.currentTarget ?? e.target) as HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        // The browser's own Save-Page dialog is never what an editor wants.
        e.preventDefault();
        helpers.invoke(props.onSave, target.value);
        return;
      }
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (target.readOnly || target.disabled) return;
      e.preventDefault();
      reindent(target, e.shiftKey, " ".repeat(tabSize));
    };
    if (!inert) {
      attachOnChange(textarea, props.onChange, helpers, {
        event: "input",
        getValue: readSource,
      });
    }
    body.append(textarea);
    root.append(body);
    return withFieldShell(root, props, { idKey: "id" });
  },
};

/* ----------------------------------------------------------------------- *
 * ContextMenu — right-click / long-press menu attachable to a child node
 * ----------------------------------------------------------------------- */

const CONTEXT_TRIGGERS = ["contextmenu", "click", "longpress"] as const;
const CONTEXT_PLACEMENTS = ["bottom", "top", "left", "right"] as const;

/** How long a touch has to rest before the menu opens. */
const LONG_PRESS_MS = 500;
/** How far a touch may drift before it counts as a scroll, not a press. */
const LONG_PRESS_SLOP = 10;

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

interface PointerMenuState {
  /** The live panel — which the fallback path may have reparented out of the root. */
  panel: HTMLElement;
  /** Full teardown: hide, un-promote, release the dismissal listeners. */
  close: () => void;
}

/**
 * The open pointer menu of a component instance, registered under BOTH the live
 * root and the live panel.
 *
 * Two keys because a close path can only reach one of them: Escape arrives on
 * the target wrapper (root side), an item click arrives on a button inside the
 * panel — and when the floating layer falls back to reparenting, that panel no
 * longer sits inside the root, so `closest(".rui-context-menu")` from the button
 * comes back null.
 *
 * Module scope rather than a `let` in `render`: the morph reconciler copies a
 * fresh render closure onto the live nodes after every re-render, so a
 * render-scoped handle to the installed listeners would be lost — which is how
 * the previous version accumulated a `document` listener pair per open.
 */
const POINTER_MENUS: WeakMap<HTMLElement, PointerMenuState> = new WeakMap();

/** In-flight long presses, keyed by the live target wrapper. */
interface LongPressState { timer: number; x: number; y: number }
const LONG_PRESSES: WeakMap<Element, LongPressState> = new WeakMap();

const cancelLongPress = (target: Element | null | undefined): void => {
  if (!target) return;
  const pending = LONG_PRESSES.get(target);
  if (!pending) return;
  clearTimeout(pending.timer);
  LONG_PRESSES.delete(target);
};

/**
 * Find the registration for whichever context menu `origin` belongs to.
 *
 * Handlers must always work off the LIVE tree: the render closure's own `menu`
 * node is a discarded snapshot after any re-render, and closing that instead of
 * the live panel would leave the live one promoted in the top layer for good.
 */
const pointerMenuFrom = (origin: Element | null): PointerMenuState | null => {
  if (!origin) return null;
  const root = origin.closest<HTMLElement>(".rui-context-menu");
  const byRoot = root ? POINTER_MENUS.get(root) : undefined;
  if (byRoot) return byRoot;
  const panel = origin.closest<HTMLElement>(".rui-context-menu-pop");
  return (panel ? POINTER_MENUS.get(panel) : null) ?? null;
};

/** The live panel for whichever context menu `origin` belongs to. */
const livePanelFor = (origin: Element | null): HTMLElement | null => {
  if (!origin) return null;
  const registered = pointerMenuFrom(origin)?.panel;
  if (registered) return registered;
  return origin.closest<HTMLElement>(".rui-context-menu-pop")
    ?? origin.closest(".rui-context-menu")?.querySelector<HTMLElement>(".rui-context-menu-pop")
    ?? null;
};

/**
 * Hide, un-promote and un-listen whichever menu `origin` belongs to.
 *
 * Pure teardown: it reports nothing to the program. `setMenuOpen` owns the
 * instance state, the `open` write-back and `onOpenChange`.
 */
const teardownMenu = (origin: Element | null): void => {
  const state = pointerMenuFrom(origin);
  if (state) {
    state.close();
    return;
  }
  // No registration (never opened, or already dismissed) — still make sure the
  // panel we can see is marked closed and un-promoted.
  const panel = livePanelFor(origin);
  if (!panel) return;
  panel.setAttribute("data-open", "false");
  origin?.closest(".rui-context-menu")?.setAttribute("data-open", "false");
  closeFloating(panel);
  disposeDismissListeners(panel);
  disposeDismissListeners(origin?.closest<HTMLElement>(".rui-context-menu"));
};

/**
 * A zero-size virtual anchor at a viewport point.
 *
 * ContextMenu is the one popup with no anchor element — it opens wherever the
 * pointer was — and the floating layer only ever asks an anchor for its
 * `getBoundingClientRect`. A degenerate rect at the cursor makes
 * `side: "bottom"` / `align: "start"` place the panel's top-left corner exactly
 * on the cursor (what the hand-rolled `left`/`top` used to do), while the
 * layer's flip / shift / height-cap logic now keeps a right-click near the
 * bottom or right edge fully on screen.
 *
 * Deliberately not a real element: a marker inside the component subtree would
 * be an unexpected child for the morph reconciler, and one parked on
 * `document.body` would have to be tracked and removed on every close path. The
 * layer's `ResizeObserver.observe(anchor)` rejects a non-Element, which it
 * already tolerates — and a point cannot resize, so there is nothing to observe.
 */
const pointerAnchor = (clientX: number, clientY: number): HTMLElement => {
  const rect = {
    x: clientX,
    y: clientY,
    left: clientX,
    right: clientX,
    top: clientY,
    bottom: clientY,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect;
  return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
};

interface MenuContext {
  openSlot: { get(): boolean; set(value: boolean): void };
  /** State name behind a `$`-bound `open`, for the write-back. */
  stateName: string | undefined;
  onOpenChange: unknown;
  helpers: RenderHelpers;
  side: FloatingSide;
  offset: number;
  /** Which opener is wired, which also decides what counts as an outside click. */
  trigger: string;
}

/**
 * Show the menu against `anchor`, promoted out of every clipping ancestor.
 *
 * Without the promotion the panel is amputated by any non-visible `overflow`
 * ancestor — and the description sends authors straight at the worst offenders
 * (table rows, kanban cards, file browsers), plus the two editors in this file,
 * which both clip.
 */
const openMenuAt = (origin: Element, anchor: HTMLElement, ctx: MenuContext): void => {
  // A second open has to MOVE the menu, and `openFloating` keeps the options it
  // was first opened with, so always tear the previous open down first. This
  // also restores a reparented panel into the component root, where the query
  // below can find it again.
  teardownMenu(origin);
  const liveRoot = origin.closest<HTMLElement>(".rui-context-menu");
  const panel = liveRoot?.querySelector<HTMLElement>(".rui-context-menu-pop");
  if (!liveRoot || !panel) return;
  const wrap = liveRoot.querySelector<HTMLElement>(".rui-context-menu-target");
  // `data-open` must flip before positioning: the panel is `display: none`
  // until then, and a hidden panel measures 0×0 — which would defeat both the
  // flip decision and the height cap.
  liveRoot.setAttribute("data-open", "true");
  panel.setAttribute("data-open", "true");
  wrap?.setAttribute("aria-expanded", "true");
  wrap?.setAttribute("data-state", "open");
  // The corporate theme styles the open state on the icon button *inside* the
  // target (`.rui-context-menu-target .rui-icon-button[data-state="open"]`), so
  // the overflow-menu pattern needs the flag there too.
  wrap?.querySelector(".rui-icon-button")?.setAttribute("data-state", "open");
  openFloating(panel, {
    anchor,
    side: ctx.side,
    align: "start",
    offset: ctx.offset,
    layer: "dropdown",
  });

  const host = panel.getRootNode() as Document | ShadowRoot;
  // What counts as "outside": for a click-triggered menu the trigger itself has
  // to stay inside, or the capture-phase dismissal would close the menu a moment
  // before the trigger's own handler re-opened it. For a right-click menu a
  // left-click on the target *should* dismiss.
  const dismissHost = ctx.trigger === "click" ? liveRoot : panel;
  const report = (): void => {
    ctx.openSlot.set(false);
    if (ctx.stateName) ctx.helpers.setState(ctx.stateName, false);
    close();
    ctx.helpers.invoke(ctx.onOpenChange, false);
  };
  const onContextElsewhere = (event: Event): void => {
    if (event.composedPath().includes(panel)) return;
    report();
  };
  const release = (): void => {
    POINTER_MENUS.delete(liveRoot);
    POINTER_MENUS.delete(panel);
    host.removeEventListener("contextmenu", onContextElsewhere, true);
    disposeDismissListeners(dismissHost);
  };
  const close = (): void => {
    liveRoot.setAttribute("data-open", "false");
    panel.setAttribute("data-open", "false");
    wrap?.setAttribute("aria-expanded", "false");
    wrap?.removeAttribute("data-state");
    wrap?.querySelector(".rui-icon-button")?.removeAttribute("data-state");
    // Every close path must un-promote, or the panel is orphaned in the top
    // layer where nothing can dismiss it.
    const doc = panel.getRootNode() as Document | ShadowRoot;
    const hadFocus = panel.contains(doc.activeElement);
    closeFloating(panel);
    release();
    if (hadFocus) wrap?.focus();
  };
  // Registered BEFORE the listeners below: a same-key disposer runs the previous
  // cleanup immediately, and the dismissal registry is keyed by element — so
  // registering after installing would tear down the pair we just armed.
  ctx.helpers.registerDisposer(release, "rui-context-menu");
  POINTER_MENUS.set(liveRoot, { panel, close });
  POINTER_MENUS.set(panel, { panel, close });

  // Outside-click and Escape come from the shared helper: it attaches to the
  // panel's own root node (so `event.target` is not retargeted away by the
  // shadow boundary, which made the old `document`-level containment check dead
  // code), installs exactly one pair per open, and auto-disposes when the panel
  // is unmounted — the three leak modes the hand-rolled listeners had.
  installDismissListeners({
    liveRoot: dismissHost,
    key: "rui-context-menu",
    onDismiss: () => {
      if (!POINTER_MENUS.has(panel)) return;
      report();
    },
  });
  // A right-click anywhere else must move/close this menu, and right-clicks do
  // not produce a `click` event for the helper above to see.
  host.addEventListener("contextmenu", onContextElsewhere, true);

  // ARIA requires a `menu` to take focus so the arrow keys have somewhere to
  // start; without it Escape also never reached a handler. An `aria-disabled`
  // row is reachable by arrow key but a dead landing spot, so prefer an
  // actionable one and only fall back to the first row.
  const rows = panel.querySelectorAll<HTMLElement>("[role=menuitem]");
  (panel.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled='true'])") ?? rows[0])?.focus();
};

/** Apply an open/closed transition, keeping instance state and the program in sync. */
const setMenuOpen = (
  origin: Element,
  next: boolean,
  anchor: HTMLElement,
  ctx: MenuContext,
): void => {
  ctx.openSlot.set(next);
  if (ctx.stateName) ctx.helpers.setState(ctx.stateName, next);
  if (next) openMenuAt(origin, anchor, ctx);
  else teardownMenu(origin);
  ctx.helpers.invoke(ctx.onOpenChange, next);
};

export const ContextMenu: ComponentSpec = {
  name: "ContextMenu",
  description:
    "Right-click (or long-press on touch) menu that attaches to a child " +
    "node. Wraps `target` and shows the menu at the pointer. Items are " +
    "`MenuItem(...)` nodes, `MenuSeparator()` entries, or `{label, action, " +
    "icon?, shortcut?, variant?, disabled?, separator?}` objects. Set " +
    "`trigger: \"click\"` for the overflow-menu pattern, `disabled` to " +
    "suppress it on locked rows, and pass a `$variable` as `open` to " +
    "observe or drive the open state. Shift+F10 (or the ContextMenu key) " +
    "opens it from the keyboard, and ArrowUp/ArrowDown/Home/End plus " +
    "typeahead move between items while Escape closes it and returns focus " +
    "to the target. Use on table rows, tree nodes, kanban cards, file " +
    "browser entries.",
  props: [
    { name: "target", type: "Node", description: "Child node the menu is bound to" },
    { name: "items", type: "any[]", description: "MenuItem nodes or {label, action} objects" },
    { name: "label", type: "string", optional: true, description: "ARIA label for the menu" },
    { name: "trigger", type: "string", optional: true, enum: CONTEXT_TRIGGERS, description: "What opens the menu (default `contextmenu`)" },
    { name: "disabled", type: "boolean", optional: true, description: "Never open the menu (locked / read-only rows)" },
    { name: "placement", type: "string", optional: true, enum: CONTEXT_PLACEMENTS, aliases: ["side"], description: "Which side of the anchor the menu opens on (default `bottom`)" },
    { name: "offset", type: "number", optional: true, description: "Gap in px between the anchor and the menu (default 0)" },
    { name: "open", type: "boolean", optional: true, description: "Open state — pass a $variable for two-way binding" },
    { name: "onOpenChange", type: "callable", optional: true, description: "Called with the new boolean open state" },
  ],
  render: (node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const trigger = asString(props.trigger, "contextmenu");
    const side = (asString(props.placement, "bottom") as FloatingSide);
    // A pointer menu sits with its corner *at* the cursor, not offset from it.
    const offset = Math.max(0, asNumber(props.offset, 0));

    // Open state lives in instance state, not only in the DOM attribute: the
    // fresh render used to always emit `data-open: "false"`, so any re-render
    // that landed while the menu was open snapped it shut.
    const declared = props.open === undefined ? null : asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", declared ?? false);
    const declaredSlot = helpers.useInstanceState<boolean | null>("declaredOpen", null);
    if (declared !== null && declared !== declaredSlot.get()) {
      // A *change* in the declared value is an external command; otherwise the
      // user's own open/close wins so a literal `open: false` stays an initial
      // value rather than slamming the menu shut on every re-render.
      declaredSlot.set(declared);
      openSlot.set(declared);
    }
    const isOpen = openSlot.get() && !disabled;

    const ctx: MenuContext = {
      openSlot,
      stateName: node.argMeta?.[7]?.stateRef,
      onOpenChange: props.onOpenChange,
      helpers,
      side,
      offset,
      trigger,
    };

    const root = el("div", {
      class: "rui-context-menu",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
    });
    const wrap = el("div", {
      class: "rui-context-menu-target",
      // Focusable so the Shift+F10 / ContextMenu-key opener is reachable even
      // when the wrapped target holds nothing focusable of its own.
      tabindex: disabled ? null : "0",
      "aria-haspopup": disabled ? null : "menu",
      "aria-expanded": disabled ? null : (isOpen ? "true" : "false"),
      "data-state": isOpen ? "open" : null,
      // Suppress the iOS callout that would otherwise race the long press.
      style: trigger === "longpress"
        ? "-webkit-touch-callout:none;touch-action:manipulation;user-select:none;-webkit-user-select:none;"
        : "-webkit-touch-callout:none;",
    });
    wrap.append(helpers.renderNode(props.target));
    root.append(wrap);

    const menu = el("div", {
      class: "rui-context-menu-pop",
      role: "menu",
      "aria-label": asString(props.label) || null,
      "data-open": isOpen ? "true" : "false",
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
        // `aria-disabled`, not the native attribute: a `role="menu"` row must
        // stay focusable so a keyboard user learns the action exists but is
        // unavailable. No click handler is attached below, so it is inert.
        "aria-disabled": item.disabled ? "true" : null,
        "data-disabled": item.disabled ? "true" : null,
        // Roving focus: the menu is one tab stop and Up/Down move within it.
        tabindex: "-1",
      });
      const iconNode = renderIcon(item.icon, { className: "rui-menu-item-icon" });
      if (iconNode) btn.append(iconNode);
      btn.append(el("span", { class: "rui-menu-item-label" }, [item.label]));
      if (item.shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [item.shortcut]));
      if (!item.disabled) {
        btn.onclick = (event) => {
          const origin = (event.currentTarget ?? event.target) as Element;
          // Close before invoking, like MenuItem inside DropdownMenu does: the
          // action may push state and re-render, and the panel has to be out of
          // the top layer before its node can be swapped out from under us.
          openSlot.set(false);
          if (ctx.stateName) helpers.setState(ctx.stateName, false);
          teardownMenu(origin);
          helpers.invoke(props.onOpenChange, false);
          helpers.invoke(item.action);
        };
      }
      menu.append(btn);
    }
    root.append(menu);

    const openFromPointer = (origin: Element, clientX: number, clientY: number): void => {
      setMenuOpen(origin, true, pointerAnchor(clientX, clientY), ctx);
    };

    if (!disabled && (trigger === "contextmenu" || trigger === "longpress")) {
      wrap.oncontextmenu = (event) => {
        event.preventDefault();
        openFromPointer((event.currentTarget ?? event.target) as Element, event.clientX, event.clientY);
      };
    }
    if (!disabled && trigger === "click") {
      // The overflow-menu pattern: a plain left click on the target toggles the
      // same menu, anchored to the target rather than to the pointer.
      wrap.onclick = (event) => {
        const live = (event.currentTarget ?? event.target) as HTMLElement;
        setMenuOpen(live, !openSlot.get(), live, ctx);
      };
    }
    if (!disabled && trigger !== "click") {
      // Long press: the description has always promised it, and on touch there
      // is no `contextmenu` event to hook. Timer state is keyed by the LIVE
      // wrapper so a re-render cannot orphan it, and a disposer clears it if
      // the component unmounts mid-press.
      wrap.onpointerdown = (event) => {
        const e = event as PointerEvent;
        if (trigger === "contextmenu" && e.pointerType !== "touch" && e.pointerType !== "pen") return;
        if (e.button !== 0 && e.pointerType === "mouse") return;
        const origin = (e.currentTarget ?? e.target) as Element;
        cancelLongPress(origin);
        const timer = setTimeout(() => {
          LONG_PRESSES.delete(origin);
          openFromPointer(origin, e.clientX, e.clientY);
        }, LONG_PRESS_MS) as unknown as number;
        LONG_PRESSES.set(origin, { timer, x: e.clientX, y: e.clientY });
        helpers.registerDisposer(() => cancelLongPress(origin), "rui-context-longpress");
      };
      wrap.onpointermove = (event) => {
        const e = event as PointerEvent;
        const origin = (e.currentTarget ?? e.target) as Element;
        const pending = LONG_PRESSES.get(origin);
        if (!pending) return;
        // A drifting finger is a scroll, not a press.
        if (Math.abs(e.clientX - pending.x) > LONG_PRESS_SLOP
          || Math.abs(e.clientY - pending.y) > LONG_PRESS_SLOP) cancelLongPress(origin);
      };
      wrap.onpointerup = (event) => cancelLongPress((event.currentTarget ?? event.target) as Element);
      wrap.onpointercancel = (event) => cancelLongPress((event.currentTarget ?? event.target) as Element);
      wrap.onpointerleave = (event) => cancelLongPress((event.currentTarget ?? event.target) as Element);
    }

    /**
     * Keyboard handling for the whole component.
     *
     * Assigned to BOTH `root` and `menu`: the panel is a sibling of the target
     * wrapper, so a keydown on a focused menu item never reached a handler on
     * the wrapper — Escape did nothing and the menu was stuck open. The second
     * assignment covers the floating layer's reparenting fallback, after which
     * the panel is no longer a descendant of `root` at all.
     */
    const onKeydown = (event: KeyboardEvent): void => {
      const e = event;
      const origin = (e.currentTarget ?? e.target) as Element;
      const from = (e.target as Element | null) ?? origin;
      // Top-layer promotion does NOT reparent, so the panel usually IS still a
      // descendant of the root — and a keydown on a menu item then reached both
      // assignments, moving focus two rows per ArrowDown. Let the innermost
      // handler win; when the reparenting fallback applies, the event never
      // reaches the root copy anyway.
      if (origin.classList.contains("rui-context-menu")
        && from.closest(".rui-context-menu-pop")) return;
      if (e.key === "Escape") {
        if (!openSlot.get()) return;
        e.preventDefault();
        openSlot.set(false);
        if (ctx.stateName) helpers.setState(ctx.stateName, false);
        teardownMenu(from);
        helpers.invoke(props.onOpenChange, false);
        return;
      }
      if (disabled) return;
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        const liveWrap = origin.closest(".rui-context-menu")
          ?.querySelector<HTMLElement>(".rui-context-menu-target");
        if (!liveWrap) return;
        // Keyboard invocation has no pointer, so anchor to the target element
        // and let `placement` / `offset` decide where the menu lands.
        setMenuOpen(liveWrap, true, liveWrap, ctx);
        return;
      }
      const navKey = e.key === "ArrowDown" || e.key === "ArrowUp"
        || e.key === "Home" || e.key === "End";
      // Typeahead is part of the `menu` keyboard model, so a single printable
      // character jumps to the next row starting with it — but only from inside
      // the panel, or a keystroke aimed at the wrapped target gets swallowed.
      const typeahead = !navKey
        && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!navKey && !typeahead) return;
      const panel = livePanelFor(from);
      if (!panel || panel.getAttribute("data-open") !== "true") return;
      if (typeahead && !panel.contains(from)) return;
      // `aria-disabled` rows stay in the ring: announcing one as
      // present-but-unavailable is only useful if the user can reach it.
      const options = Array.from(panel.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
      if (options.length === 0) return;
      const active = (panel.getRootNode() as Document | ShadowRoot).activeElement;
      const found = options.findIndex((o) => o === active);
      if (typeahead) {
        const ch = e.key.toLowerCase();
        for (let i = 1; i <= options.length; i += 1) {
          const candidate = options[(Math.max(found, 0) + i) % options.length]!;
          const text = candidate.querySelector(".rui-menu-item-label")?.textContent ?? "";
          if (!text.trim().toLowerCase().startsWith(ch)) continue;
          e.preventDefault();
          candidate.focus();
          return;
        }
        return;
      }
      e.preventDefault();
      // `found < 0` (nothing focused yet) has to wrap to the LAST row on
      // ArrowUp; the plain `found - 1` it replaced landed on the second-to-last.
      const next = e.key === "Home" ? 0
        : e.key === "End" ? options.length - 1
          : e.key === "ArrowDown" ? (found + 1) % options.length
            : (found <= 0 ? options.length : found) - 1;
      options[next]!.focus();
    };
    root.onkeydown = onKeydown;
    menu.onkeydown = onKeydown;

    // An `open: true` first paint has no pointer event to anchor against, so
    // position it against the target once the tree is actually connected. A
    // re-render's snapshot is discarded by morph, and its `isConnected` check
    // makes this a no-op there — the live panel is already promoted.
    if (isOpen) {
      deferToPaint(() => {
        if (!root.isConnected) return;
        const liveWrap = root.querySelector<HTMLElement>(".rui-context-menu-target");
        if (liveWrap && !pointerMenuFrom(root)) openMenuAt(liveWrap, liveWrap, ctx);
      });
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ColorPicker
 * ----------------------------------------------------------------------- */

const COLOR_FORMATS = ["hex", "rgb", "hsl"] as const;

const DEFAULT_SWATCHES = [
  "#0f172a", "#334155", "#64748b", "#94a3b8",
  "#ef4444", "#f59e0b", "#facc15", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
];

interface Rgba { r: number; g: number; b: number; a: number }

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function fromHexDigits(hex: string): Rgba {
  const at = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
  return { r: at(0), g: at(2), b: at(4), a: hex.length === 8 ? at(6) / 255 : 1 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const wedges: Array<[number, number, number]> = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r1, g1, b1] = wedges[Math.floor(hue / 60) % 6] ?? [0, 0, 0];
  return { r: clamp255((r1 + m) * 255), g: clamp255((g1 + m) * 255), b: clamp255((b1 + m) * 255) };
}

function rgbToHsl(c: Rgba): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6)
    : max === g ? 60 * ((b - r) / d + 2)
      : 60 * ((r - g) / d + 4);
  return { h: Math.round(((h % 360) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Parse the colour vocabulary a program can realistically supply: 3/4/6/8-digit
 * hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`. Returns null for anything else.
 *
 * Deliberately strict about digit counts. The previous `{6,8}` test also
 * admitted 5 and 7 digits and then sliced to 6, so a typo'd `#1234567` was
 * silently accepted as a colour the author never asked for.
 */
function parseColor(raw: unknown): Rgba | null {
  const value = asString(raw).trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      return fromHexDigits(hex.split("").map((ch) => ch + ch).join(""));
    }
    if (hex.length === 6 || hex.length === 8) return fromHexDigits(hex);
    return null;
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (!fn) return null;
  const parts = fn[2]!.split(/[,/\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (raw2: string | undefined): number => {
    const text = asString(raw2);
    const n = Number(text.endsWith("%") ? text.slice(0, -1) : text);
    return Number.isFinite(n) ? n : NaN;
  };
  const alphaText = parts[3];
  const alpha = alphaText === undefined ? 1
    : clamp01(alphaText.endsWith("%") ? num(alphaText) / 100 : num(alphaText));
  if (Number.isNaN(alpha)) return null;
  if (fn[1]!.startsWith("rgb")) {
    const [r, g, b] = [num(parts[0]), num(parts[1]), num(parts[2])];
    if ([r, g, b].some(Number.isNaN)) return null;
    const pct = (parts[0] ?? "").endsWith("%");
    const scale = (n: number): number => clamp255(pct ? (n / 100) * 255 : n);
    return { r: scale(r), g: scale(g), b: scale(b), a: alpha };
  }
  const [h, s, l] = [num(parts[0]), num(parts[1]), num(parts[2])];
  if ([h, s, l].some(Number.isNaN)) return null;
  return { ...hslToRgb(h, clamp01(s / 100), clamp01(l / 100)), a: alpha };
}

const hexByte = (n: number): string => clamp255(n).toString(16).padStart(2, "0");
const toHex6 = (c: Rgba): string => `#${hexByte(c.r)}${hexByte(c.g)}${hexByte(c.b)}`;

/** Render a parsed colour in the author's requested notation. */
function formatColor(c: Rgba, format: string, allowAlpha: boolean): string {
  const a = allowAlpha ? clamp01(c.a) : 1;
  const alphaText = String(Math.round(a * 1000) / 1000);
  if (format === "rgb") {
    return a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alphaText})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
  }
  if (format === "hsl") {
    const { h, s, l } = rgbToHsl(c);
    return a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${alphaText})` : `hsl(${h}, ${s}%, ${l}%)`;
  }
  return a < 1 ? `${toHex6(c)}${hexByte(a * 255)}` : toHex6(c);
}

/** Canonical hex form of any parseable colour, or `""` when it is not one. */
function normaliseHex(value: unknown, allowAlpha = false): string {
  const parsed = parseColor(value);
  return parsed ? formatColor(parsed, "hex", allowAlpha) : "";
}

export const ColorPicker: ComponentSpec = {
  name: "ColorPicker",
  description:
    "Hex / RGB / HSL color form control with preset swatches. Pairs a " +
    "native `<input type=\"color\">` chip with a text input and a row of " +
    "preset swatches. Pass a `$variable` as `value` (e.g. `\"#6366f1\"`) " +
    "for two-way binding; `format` picks the notation written back " +
    "(`hex` by default) and `allowAlpha` keeps the alpha channel instead of " +
    "dropping it. Use `showInput` / `showSwatches` to render only the half " +
    "you need. Use for theme builders, label color pickers, and any " +
    "\"pick a color\" surface.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound color value (typically $variable)" },
    { name: "label", type: "string", optional: true },
    { name: "swatches", type: "string[]", optional: true, description: "Preset colors (default to a 12-color palette)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected color string" },
    { name: "format", type: "string", optional: true, enum: COLOR_FORMATS, description: "Notation written back to state / onChange (default `hex`)" },
    { name: "allowAlpha", type: "boolean", optional: true, description: "Keep the alpha channel (8-digit hex / rgba / hsla) instead of dropping it" },
    { name: "showInput", type: "boolean", optional: true, description: "Show the text input (default true)" },
    { name: "showSwatches", type: "boolean", optional: true, description: "Show the preset swatch row (default true)" },
    { name: "name", type: "string", optional: true, description: "Form field name (defaults to `id`)" },
    { name: "hint", type: "string", optional: true, aliases: ["helperText"], description: "Helper text rendered below the control" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*`)" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const disabled = asBoolean(props.disabled);
    const format = asString(props.format, "hex");
    const allowAlpha = asBoolean(props.allowAlpha);
    const showInput = props.showInput === undefined ? true : asBoolean(props.showInput);
    const showSwatches = props.showSwatches === undefined ? true : asBoolean(props.showSwatches);
    const label = asString(props.label);

    const parsed = parseColor(props.value);
    const display = parsed ? formatColor(parsed, format, allowAlpha) : asString(props.value);
    const chipHex = parsed ? toHex6(parsed) : "#000000";

    const root = el("div", { class: "rui-color-picker", "data-disabled": disabled ? "true" : "false" });
    const row = el("div", { class: "rui-color-picker-row" });
    const colorInput = el("input", {
      type: "color",
      class: "rui-color-picker-color",
      id,
      name: asString(props.name) || id,
      // `valueAttr` semantics: only assert a value when the program supplied
      // one, so the reconciler leaves a user-picked colour alone otherwise.
      value: props.value === undefined || props.value === null ? null : chipHex,
      disabled: disabled ? "" : null,
    }) as HTMLInputElement;
    colorInput.value = chipHex;
    const textInput = el("input", {
      type: "text",
      class: "rui-color-picker-hex",
      id: id ? `${id}-value` : null,
      // The only `<label for>` points at the chip, so the text field needs its
      // own name — `placeholder` stops being exposed once a value is present.
      "aria-label": label ? `${label} color value` : "Color value",
      value: props.value === undefined || props.value === null ? null : display,
      placeholder: format === "hex" ? "#000000" : "rgb(0, 0, 0)",
      disabled: disabled ? "" : null,
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      inputmode: "text",
      maxlength: format === "hex" ? "9" : "32",
    }) as HTMLInputElement;
    textInput.value = display;

    /**
     * The canonical value for this control, recomposed from the LIVE nodes.
     *
     * Runs as `bindState`'s / `attachOnChange`'s `getValue`, so it is also where
     * the chip → text mirroring happens: keeping both in one property-based
     * `oninput` slot is the only way the morph reconciler can transfer them as
     * a unit. Every node is resolved from the event target — the closure's own
     * `colorInput` / `textInput` are discarded snapshots after a re-render.
     */
    const readColor = (n: HTMLElement): string => {
      const live = n.closest(".rui-color-picker");
      const chip = live?.querySelector<HTMLInputElement>(".rui-color-picker-color") ?? (n as HTMLInputElement);
      const field = live?.querySelector<HTMLInputElement>(".rui-color-picker-hex") ?? null;
      const base = parseColor(chip.value) ?? { r: 0, g: 0, b: 0, a: 1 };
      // The chip cannot express alpha, so carry whatever the text field holds.
      const alpha = allowAlpha ? (parseColor(field?.value)?.a ?? 1) : 1;
      const out = formatColor({ ...base, a: alpha }, format, allowAlpha);
      const doc = n.getRootNode() as Document | ShadowRoot;
      // Never rewrite the text field while the user is typing in it.
      if (field && doc.activeElement !== field) field.value = out;
      if (live) {
        const canonical = normaliseHex(out, allowAlpha);
        for (const swatch of live.querySelectorAll<HTMLElement>(".rui-color-picker-swatch")) {
          const own = swatch.getAttribute("data-color") ?? "";
          swatch.setAttribute("data-active", own === canonical ? "true" : "false");
        }
      }
      return out;
    };

    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !disabled) {
      helpers.bindState(colorInput, stateName, { event: "input", getValue: readColor });
    } else if (!disabled) {
      // The mirroring must happen with or without a `$variable`: with
      // `onChange`-only usage the hex field used to be wired to nothing at all.
      colorInput.oninput = (event) => {
        readColor((event.currentTarget ?? event.target) as HTMLElement);
      };
    }
    if (!disabled) {
      attachOnChange(colorInput, props.onChange, helpers, { event: "input", getValue: readColor });
    }

    if (!disabled) {
      textInput.oninput = (event) => {
        const field = (event.currentTarget ?? event.target) as HTMLInputElement;
        const next = parseColor(field.value);
        if (!next) {
          // Mid-typing garbage is not an error worth shouting about, but the
          // field has to say so — previously invalid input was silently ignored.
          field.setAttribute("aria-invalid", "true");
          return;
        }
        field.removeAttribute("aria-invalid");
        const chip = field.closest(".rui-color-picker")?.querySelector<HTMLInputElement>(".rui-color-picker-color");
        if (!chip) return;
        chip.value = toHex6(next);
        // Dispatch on the live chip so bindState AND onChange both pick it up.
        chip.dispatchEvent(new Event("input", { bubbles: true }));
      };
    }

    if (!showInput) {
      // Still rendered, just hidden: the chip cannot express alpha, so the text
      // field is also where the alpha channel is carried between edits.
      textInput.setAttribute("hidden", "");
      textInput.setAttribute("aria-hidden", "true");
      textInput.setAttribute("tabindex", "-1");
    }
    row.append(colorInput, textInput);
    root.append(row);

    if (showSwatches) {
      const swatchRow = el("div", { class: "rui-color-picker-swatches" });
      const swatches = asArray<unknown>(props.swatches).map((c) => asString(c)).filter(Boolean);
      const palette = swatches.length > 0 ? swatches : DEFAULT_SWATCHES;
      const activeHex = normaliseHex(display, allowAlpha);
      for (const swatch of palette) {
        // An unparseable swatch used to be restored verbatim into the inline
        // `style` attribute, which let `"red;position:fixed;inset:0"` paint a
        // transparent full-viewport clickjacking layer.
        const safeColor = normaliseHex(swatch, allowAlpha) || sanitiseCssColor(swatch);
        if (!safeColor) continue;
        const canonical = normaliseHex(safeColor, allowAlpha);
        const btn = el("button", {
          type: "button",
          class: "rui-color-picker-swatch",
          style: `background:${safeColor}`,
          "aria-label": safeColor,
          title: safeColor,
          "data-color": canonical,
          "data-active": canonical !== "" && canonical === activeHex ? "true" : "false",
          disabled: disabled ? "" : null,
        });
        btn.onclick = (event) => {
          const origin = (event.currentTarget ?? event.target) as HTMLElement;
          const live = origin.closest(".rui-color-picker");
          const chip = live?.querySelector<HTMLInputElement>(".rui-color-picker-color");
          if (!chip) return;
          const picked = parseColor(origin.getAttribute("data-color") ?? safeColor);
          if (!picked) return;
          const field = live?.querySelector<HTMLInputElement>(".rui-color-picker-hex");
          // Write the text field explicitly: clicking a button does not blur it
          // on every platform, and `readColor` refuses to touch a focused field.
          if (field) field.value = formatColor(picked, format, allowAlpha);
          chip.value = toHex6(picked);
          chip.dispatchEvent(new Event("input", { bubbles: true }));
        };
        swatchRow.append(btn);
      }
      root.append(swatchRow);
    }
    return withFieldShell(root, props, { idKey: "id" });
  },
};
