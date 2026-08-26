/**
 * Aktion DevTools — the panel's UI kit.
 *
 * Plain DOM, no framework. That is deliberate and load-bearing: the panel has
 * to be able to debug a program whose renderer is broken, so it cannot share
 * that renderer's fate. Everything here is a small function returning a `Node`,
 * which keeps every tab in the same visual language without a component layer.
 *
 * All of it is pure presentation — no hook access, no app record, no protocol
 * knowledge beyond {@link DevtoolsValue}. Tabs import from here; nothing here
 * imports a tab.
 */

import type { DevtoolsValue } from "./protocol.js";
import { parseEditedValue } from "./serialize.js";

/* -------------------------------------------------------------------------- */
/*  DOM builder                                                                */
/* -------------------------------------------------------------------------- */

export type Attrs = Record<string, unknown>;
export type Child = Node | string | number | null | undefined | false;

/**
 * Create an element. `on*` keys become listeners, `class` / `style` are
 * strings, `true` becomes a bare attribute, and `null` / `false` / `undefined`
 * are skipped — so a conditional attribute is just `title: maybe && "…"`.
 */
export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "style") node.setAttribute("style", String(value));
    else if (key === "html") node.innerHTML = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

/** Append children, flattening arrays and skipping empties. */
export function append(parent: Node, children: ReadonlyArray<Child | Child[]>): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, child);
      continue;
    }
    parent.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
}

/** A document fragment holding `children` — for a tab returning several nodes. */
export function frag(...children: Child[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  append(fragment, children);
  return fragment;
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** Duration with a precision that shrinks as the number grows. */
export function fmtMs(n: number | undefined): string {
  if (n === undefined || !isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  if (n >= 100) return `${n.toFixed(0)} ms`;
  if (n >= 10) return `${n.toFixed(1)} ms`;
  return `${n.toFixed(2)} ms`;
}

/** Offset from a timeline origin. */
export function fmtRel(ms: number): string {
  if (!isFinite(ms)) return "—";
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

/** Wall-clock time of day, for log rows. */
export function fmtClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Compact integer with a `k` / `M` suffix. */
export function fmtCount(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Byte size in the unit a human would use. */
export function fmtBytes(n: number | undefined): string {
  if (n === undefined || !isFinite(n)) return "—";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** Percentage of `num` in `den`, or an em-dash when the ratio is undefined. */
export function fmtPct(num: number, den: number): string {
  if (den <= 0) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

/**
 * Shorten a long string from the MIDDLE. For URLs and instance keys the ends
 * carry the meaning (which endpoint, which component) and the middle is
 * scaffolding, so a trailing ellipsis hides exactly the informative half.
 */
export function truncateMiddle(text: string, limit = 60): string {
  if (text.length <= limit) return text;
  const head = Math.ceil((limit - 1) / 2);
  const tail = Math.floor((limit - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** Path portion of a URL, for the network list's primary column. */
export function urlPath(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Host portion of a URL, or `""` for a relative one. */
export function urlHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------------- */
/*  Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

/** A titled block with an optional row of actions on the right. */
export function section(
  title: string | null,
  body: Child | Child[],
  options: { actions?: Child[]; flush?: boolean; id?: string } = {},
): HTMLElement {
  const head = title !== null || options.actions
    ? h(
        "div",
        { class: "sec-head" },
        title !== null ? h("p", { class: "section-title" }, title) : null,
        h("span", { class: "grow" }),
        ...(options.actions ?? []),
      )
    : null;
  return h(
    "div",
    { class: `section ${options.flush ? "is-flush" : ""}`, id: options.id },
    head,
    ...(Array.isArray(body) ? body : [body]),
  );
}

/** The sticky control strip at the top of a tab. */
export function toolbar(...children: Child[]): HTMLElement {
  return h("div", { class: "toolbar" }, ...children);
}

/** Flexible spacer for a toolbar / header row. */
export function spacer(): HTMLElement {
  return h("span", { class: "grow" });
}

/** Small coloured label. */
export function chip(label: string, tone = "grey", title?: string): HTMLElement {
  return h("span", { class: `chip ${tone}`, title }, label);
}

/** A push button in the panel's chrome style. */
export function button(
  label: Child,
  onClick: () => void,
  options: { title?: string; tone?: string; active?: boolean; disabled?: boolean } = {},
): HTMLElement {
  const el = h(
    "button",
    {
      class: `icon-btn ${options.active ? "is-on" : ""} ${options.tone ? `t-${options.tone}` : ""}`,
      title: options.title,
      onclick: onClick,
    },
    label,
  );
  if (options.disabled) (el as HTMLButtonElement).disabled = true;
  return el;
}

/** A toggle rendered as a filter chip. */
export function toggle(label: string, on: boolean, onToggle: () => void, title?: string): HTMLElement {
  return h("button", { class: `filter-chip ${on ? "is-on" : ""}`, title, onclick: onToggle }, label);
}

/** A single-select group of chips. */
export function chipGroup<T extends string>(
  values: ReadonlyArray<{ value: T; label: string; title?: string }>,
  active: T,
  onPick: (value: T) => void,
): HTMLElement {
  return h(
    "div",
    { class: "filters" },
    ...values.map((entry) =>
      toggle(entry.label, entry.value === active, () => onPick(entry.value), entry.title),
    ),
  );
}

/** Debounced-free search box; `onInput` fires on every keystroke. */
export function searchInput(
  value: string,
  onInput: (value: string) => void,
  placeholder = "Filter…",
  options: { focusKey?: string } = {},
): HTMLInputElement {
  return h("input", {
    class: "search",
    placeholder,
    value,
    // A stable focus key survives a re-render even when the surrounding tree
    // changes shape — see `FOCUS_KEY_ATTR`.
    [FOCUS_KEY_ATTR]: options.focusKey ?? `search:${placeholder}`,
    oninput: (e: Event) => onInput((e.target as HTMLInputElement).value),
  }) as HTMLInputElement;
}

/**
 * Attribute carrying a field's stable identity across re-renders.
 *
 * The panel re-renders on every runtime event, so a field the user is typing in
 * is destroyed and rebuilt several times a second. Restoring focus by POSITION
 * fails exactly when it matters — running a REPL expression grows the history
 * above the input, so the input is no longer the same child index and focus is
 * lost on the keystroke that mattered most. A declared key is positional-shape
 * independent.
 */
export const FOCUS_KEY_ATTR = "data-dt-focus";

/**
 * Attribute marking a scroll container whose position should survive a
 * re-render. Without it, a scrolled component tree jumps back to the top every
 * time an event arrives.
 */
export const SCROLL_KEY_ATTR = "data-dt-scroll";

/** A scrollable region whose scroll offset is preserved across re-renders. */
export function scrollArea(key: string, attrs: Attrs, ...children: Child[]): HTMLElement {
  return h("div", { ...attrs, [SCROLL_KEY_ATTR]: key }, ...children);
}

/** A single-line text field with a stable focus key and Enter/blur commit. */
export function textField(options: {
  focusKey: string;
  value?: string;
  placeholder?: string;
  className?: string;
  width?: string;
  title?: string;
  /** Fires on every keystroke. */
  onInput?: (value: string) => void;
  /** Fires on Enter and on blur when the value changed. */
  onCommit?: (value: string) => void;
  /** Fires on Enter only. */
  onEnter?: (value: string) => void;
}): HTMLInputElement {
  const input = h("input", {
    class: options.className ?? "search",
    placeholder: options.placeholder,
    title: options.title,
    value: options.value ?? "",
    spellcheck: "false",
    style: options.width ? `max-width:${options.width}` : undefined,
    [FOCUS_KEY_ATTR]: options.focusKey,
  }) as HTMLInputElement;
  const initial = options.value ?? "";
  if (options.onInput) {
    input.addEventListener("input", () => options.onInput!(input.value));
  }
  const commit = (): void => {
    if (options.onCommit && input.value !== initial) options.onCommit(input.value);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      options.onEnter?.(input.value);
    } else if (event.key === "Escape") {
      input.value = initial;
      input.blur();
    }
  });
  return input;
}

/** Muted inline note. */
export function muted(...children: Child[]): HTMLElement {
  return h("span", { class: "muted" }, ...children);
}

/** Even quieter note, for hints. */
export function faint(...children: Child[]): HTMLElement {
  return h("span", { class: "faint" }, ...children);
}

/** Monospace inline code. */
export function code(text: string, title?: string): HTMLElement {
  return h("code", { class: "mono", title }, text);
}

/** The "nothing here yet" block, with an actionable hint. */
export function emptyState(title: string, hint?: Child, action?: Child): HTMLElement {
  return h(
    "div",
    { class: "empty" },
    h("p", {}, title),
    hint ? h("p", { class: "faint" }, hint) : null,
    action ?? null,
  );
}

/** Key/value metadata line. */
export function kv(...pairs: Array<[string, Child]>): HTMLElement {
  return h(
    "div",
    { class: "kv" },
    ...pairs.map(([label, value]) => h("span", {}, `${label} `, h("b", {}, value as Child))),
  );
}

/** One headline number with a caption. */
export function stat(
  label: string,
  value: string,
  options: { tone?: string; title?: string; onClick?: () => void } = {},
): HTMLElement {
  return h(
    "div",
    {
      class: `stat ${options.onClick ? "is-link" : ""}`,
      title: options.title,
      onclick: options.onClick,
    },
    h("span", { class: `stat-val ${options.tone ? `t-${options.tone}` : ""}` }, value),
    h("span", { class: "stat-label" }, label),
  );
}

/** Grid of `stat`s. */
export function statGrid(...stats: Child[]): HTMLElement {
  return h("div", { class: "stat-grid" }, ...stats);
}

/** A labelled horizontal bar, for "top N" breakdowns. */
export function barRow(
  label: Child,
  fraction: number,
  note: Child,
  options: { tone?: string; title?: string; onClick?: () => void } = {},
): HTMLElement {
  const pct = Math.max(2, Math.min(100, Math.round(fraction * 100)));
  return h(
    "div",
    { class: `bar-row ${options.onClick ? "is-link" : ""}`, title: options.title, onclick: options.onClick },
    h("span", { class: "bar-row-label" }, label),
    h("span", { class: "bar-row-track" },
      h("span", { class: `bar-row-fill ${options.tone ? `t-${options.tone}` : ""}`, style: `width:${pct}%` })),
    h("span", { class: "bar-row-num" }, note),
  );
}

/** One insight line: an icon, a tone, and a sentence that names the fix. */
export function insight(tone: string, icon: string, body: Child): HTMLElement {
  return h(
    "div",
    { class: `insight t-${tone}` },
    h("span", { class: "insight-ic" }, icon),
    h("span", {}, body),
  );
}

/** A stack of `insight`s. */
export function insightList(items: ReadonlyArray<{ tone: string; icon: string; text: Child }>): HTMLElement {
  return h("div", { class: "insights" }, ...items.map((i) => insight(i.tone, i.icon, i.text)));
}

/* -------------------------------------------------------------------------- */
/*  Tables                                                                     */
/* -------------------------------------------------------------------------- */

export interface Column<T> {
  key: string;
  label: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
  /** Sort value; omit for an unsortable column. */
  sort?: (row: T) => number | string;
  render(row: T): Child;
  title?: string;
}

export interface SortState {
  key: string;
  dir: 1 | -1;
}

/**
 * A sortable table.
 *
 * Sorting is owned by the caller (it lives in the tab's UI state, so it
 * survives a re-render), which is why `sort` and `onSort` come in rather than
 * being hidden here.
 */
export function table<T>(
  columns: ReadonlyArray<Column<T>>,
  rows: ReadonlyArray<T>,
  options: {
    sort?: SortState;
    onSort?: (key: string) => void;
    rowClass?: (row: T) => string;
    onRowClick?: (row: T) => void;
    empty?: string;
  } = {},
): HTMLElement {
  const sorted = [...rows];
  const active = options.sort ? columns.find((c) => c.key === options.sort!.key) : undefined;
  if (active?.sort) {
    const dir = options.sort!.dir;
    sorted.sort((a, b) => {
      const va = active.sort!(a);
      const vb = active.sort!(b);
      if (typeof va === "string" || typeof vb === "string") {
        return dir * String(va).localeCompare(String(vb));
      }
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
  }
  if (sorted.length === 0) {
    return h("div", { class: "faint pad-sm" }, options.empty ?? "Nothing to show.");
  }
  const arrow = (key: string): string => {
    if (!options.sort || options.sort.key !== key) return "";
    return options.sort.dir === 1 ? " ▲" : " ▼";
  };
  return h(
    "table",
    { class: "dt-table" },
    h("thead", {}, h("tr", {}, ...columns.map((col) =>
      h(
        "th",
        {
          class: col.sort && options.onSort ? "sortable" : "",
          style: col.numeric ? "text-align:right" : "",
          title: col.title,
          onclick: col.sort && options.onSort ? () => options.onSort!(col.key) : undefined,
        },
        `${col.label}${arrow(col.key)}`,
      )))),
    h("tbody", {}, ...sorted.map((row) =>
      h(
        "tr",
        {
          class: options.rowClass?.(row) ?? "",
          onclick: options.onRowClick ? () => options.onRowClick!(row) : undefined,
        },
        ...columns.map((col) => h("td", { class: col.numeric ? "num" : "" }, col.render(row))),
      ))),
  );
}

/** Flip a sort state for `key`, defaulting new numeric columns to descending. */
export function nextSort(current: SortState, key: string, defaultDir: 1 | -1 = -1): SortState {
  if (current.key === key) return { key, dir: (current.dir === 1 ? -1 : 1) as 1 | -1 };
  return { key, dir: defaultDir };
}

/* -------------------------------------------------------------------------- */
/*  Values                                                                     */
/* -------------------------------------------------------------------------- */

/** Type-coloured, one-line rendering of a protocol value. */
export function valueSpan(value: DevtoolsValue, options: { title?: string } = {}): HTMLElement {
  return h("span", { class: `v t-${value.type}`, title: options.title ?? value.json ?? value.preview }, value.preview);
}

/**
 * A value that can be edited in place: click to open an input, Enter to commit,
 * Escape to cancel.
 *
 * `onCommit` receives the PARSED value (JSON where it parses, the raw string
 * otherwise), because every caller wants the same rule and re-deriving it per
 * tab is how `"42"` ends up written as a string in one place and a number in
 * another.
 */
export function editableValue(
  value: DevtoolsValue,
  onCommit: (next: unknown) => void,
  options: { title?: string; disabled?: boolean; onCancel?: () => void; focusKey?: string } = {},
): HTMLElement {
  const span = valueSpan(value, {
    title: options.title ?? (options.disabled ? "read-only" : "Click to edit · Enter commits · Esc cancels"),
  });
  if (options.disabled) {
    span.classList.add("is-readonly");
    return span;
  }
  span.classList.add("is-editable");
  span.addEventListener("click", (event) => {
    event.stopPropagation();
    const initial = value.type === "string"
      ? (safeParse(value.json) as string ?? value.preview)
      : value.json ?? value.preview;
    const input = h("input", {
      class: "edit-input",
      value: String(initial ?? ""),
      // Keyed so a re-render mid-edit (an event arrives while you are typing)
      // re-focuses the same field instead of dropping you out of the editor.
      [FOCUS_KEY_ATTR]: options.focusKey ? `edit:${options.focusKey}` : undefined,
    }) as HTMLInputElement;
    let settled = false;
    const settle = (apply: boolean): void => {
      if (settled) return;
      settled = true;
      if (apply) onCommit(parseEditedValue(input.value));
      else options.onCancel?.();
      // The owning tab re-renders on commit; on cancel put the span back so a
      // dismissed edit does not leave a stranded input behind.
      if (!apply && input.isConnected) input.replaceWith(span);
    };
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); settle(true); }
      else if (e.key === "Escape") { e.preventDefault(); settle(false); }
    });
    // Commit on blur, EXCEPT when the blur is the panel re-rendering underneath
    // us (the node is being detached). Committing then would write a value the
    // user had not finished typing.
    input.addEventListener("blur", () => {
      if (input.isConnected) settle(true);
    });
    span.replaceWith(input);
    input.focus();
    input.select();
  });
  return span;
}

function safeParse(json: string | undefined): unknown {
  if (json === undefined) return undefined;
  try { return JSON.parse(json); } catch { return undefined; }
}

/* -------------------------------------------------------------------------- */
/*  JSON tree                                                                  */
/* -------------------------------------------------------------------------- */

export interface JsonTreeOptions {
  /** Dotted path prefix for expansion keys (`state`, `response`). */
  path?: string;
  /** Set of expanded paths, owned by the caller so it survives re-renders. */
  expanded: Set<string>;
  /** Re-render callback after an expand / collapse. */
  onToggle(): void;
  /** Called with the dotted path + new value when a leaf is edited. */
  onEdit?(path: string, value: unknown): void;
  /** Paths that must not be edited (reserved atoms). */
  readOnly?(path: string, depth: number): boolean;
  /** Extra trailing content per row (a heat badge, a "reserved" tag). */
  decorate?(path: string, depth: number): Child;
  /** Highlight rows whose path is in this set. */
  highlight?: Set<string>;
  /** Deepest level rendered before collapsing (guards a cyclic-ish blob). */
  maxDepth?: number;
  /** Case-insensitive key filter applied at the top level only. */
  filter?: string;
}

/**
 * Render a plain JS value as an expandable tree, with optional inline editing.
 *
 * Rows are produced flat with padding rather than nested — a nested structure
 * re-created per keystroke is what makes a big state tree feel slow, and a flat
 * list also lets a filter hide a row without orphaning its children.
 */
export function jsonTree(value: unknown, options: JsonTreeOptions): HTMLElement {
  const container = h("div", { class: "tree" });
  const prefix = options.path ?? "";
  const entries = childEntries(value);
  const filter = (options.filter ?? "").trim().toLowerCase();
  let shown = 0;
  for (const [key, child] of entries) {
    if (filter && !key.toLowerCase().includes(filter)) continue;
    shown += 1;
    appendJsonRows(container, prefix ? `${prefix}.${key}` : key, key, child, 0, options);
  }
  if (shown === 0) {
    container.appendChild(h("div", { class: "empty" }, filter ? "Nothing matches the filter." : "Empty."));
  }
  return container;
}

function appendJsonRows(
  container: HTMLElement,
  path: string,
  key: string,
  value: unknown,
  depth: number,
  options: JsonTreeOptions,
): void {
  const type = jsonType(value);
  const children = childEntries(value);
  const expandable = children.length > 0 && depth < (options.maxDepth ?? 12);
  const open = options.expanded.has(path);
  const readOnly = options.readOnly?.(path, depth) ?? false;

  const twist = h(
    "span",
    {
      class: `twist ${expandable ? "" : "is-leaf"}`,
      onclick: expandable
        ? (event: Event) => {
            event.stopPropagation();
            if (options.expanded.has(path)) options.expanded.delete(path);
            else options.expanded.add(path);
            options.onToggle();
          }
        : undefined,
    },
    expandable ? (open ? "▾" : "▸") : "•",
  );

  const described: DevtoolsValue = {
    type,
    preview: jsonPreview(value),
    json: type === "object" || type === "array" || type === "function" ? undefined : JSON.stringify(value),
  };
  const editable = !readOnly && !expandable && type !== "function" && options.onEdit !== undefined;
  const valueNode = editable
    ? editableValue(described, (next) => options.onEdit!(path, next))
    : valueSpan(described);

  container.appendChild(h(
    "div",
    {
      class: `row ${options.highlight?.has(path) ? "is-changed" : ""}`,
      style: `padding-left:${8 + depth * 14}px`,
    },
    twist,
    h("span", { class: "k" }, key),
    h("span", { class: "sep" }, ": "),
    valueNode,
    readOnly ? h("span", { class: "tag" }, "read-only") : null,
    h("span", { class: "grow" }),
    options.decorate?.(path, depth) ?? null,
  ));

  if (expandable && open) {
    for (const [childKey, childValue] of children) {
      appendJsonRows(container, `${path}.${childKey}`, childKey, childValue, depth + 1, options);
    }
  }
}

/** `typeof`-style classification used by the tree renderer. */
export function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Immediate children of a value, as `[key, value]` pairs. */
export function childEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item] as [string, unknown]);
  if (value && typeof value === "object") {
    try {
      return Object.entries(value as Record<string, unknown>);
    } catch {
      return [];
    }
  }
  return [];
}

/** One-line preview for the tree renderer (mirrors `serialize.previewOf`). */
export function jsonPreview(value: unknown): string {
  switch (jsonType(value)) {
    case "string": {
      const text = value as string;
      return JSON.stringify(text.length > 80 ? `${text.slice(0, 80)}…` : text);
    }
    case "number":
    case "boolean": return String(value);
    case "null": return "null";
    case "undefined": return "undefined";
    case "function": return "ƒ ()";
    case "array": return `Array(${(value as unknown[]).length})`;
    case "object": {
      const keys = Object.keys(value as object);
      if (keys.length === 0) return "{}";
      return `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? `, …${keys.length - 3}` : ""} }`;
    }
    default: return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/*  Code + clipboard                                                           */
/* -------------------------------------------------------------------------- */

export interface CodeBlockOptions {
  /** Show 1-based line numbers. */
  lineNumbers?: boolean;
  /** Lines to mark, keyed by 1-based line number (within the slice) → tone. */
  markers?: Map<number, { tone: string; title: string }>;
  /** Line to scroll into view + highlight, 1-based within the slice. */
  focusLine?: number | null;
  /** Called when a line is clicked, with the 1-based line within the slice. */
  onLineClick?(line: number): void;
  /** Cap the rendered lines (a 5k-line program does not need to be in the DOM). */
  maxLines?: number;
  /**
   * Line number the slice starts at, when the caller is rendering a window of a
   * larger file. Gutter numbers are absolute; every other index stays relative.
   */
  firstLine?: number;
  /** Case-insensitive substring to mark inside each line. */
  highlight?: string;
  /** Preserve the scroll offset across re-renders under this key. */
  scrollKey?: string;
}

/**
 * Render source text with optional line numbers, gutter markers, and search
 * highlighting.
 *
 * Diagnostics land on the line that produced them, which is the difference
 * between "line 42: unknown prop" as a sentence and as a place you can look at.
 */
export function codeBlock(text: string, options: CodeBlockOptions = {}): HTMLElement {
  const lines = text.split("\n");
  const cap = options.maxLines ?? 4000;
  const shown = lines.slice(0, cap);
  const offset = (options.firstLine ?? 1) - 1;
  const needle = (options.highlight ?? "").toLowerCase();
  const wrap = h("div", {
    class: "code-block",
    ...(options.scrollKey ? { [SCROLL_KEY_ATTR]: options.scrollKey } : {}),
  });
  shown.forEach((line, index) => {
    const relative = index + 1;
    const marker = options.markers?.get(relative);
    const row = h(
      "div",
      {
        class: [
          "code-line",
          marker ? `has-marker t-${marker.tone}` : "",
          options.focusLine === relative ? "is-focus" : "",
          needle !== "" && line.toLowerCase().includes(needle) ? "is-hit" : "",
        ].filter(Boolean).join(" "),
        onclick: options.onLineClick ? () => options.onLineClick!(relative) : undefined,
      },
      options.lineNumbers === false
        ? null
        : h("span", { class: "code-gutter", title: marker?.title }, String(relative + offset)),
      renderCodeText(line, needle),
    );
    wrap.appendChild(row);
  });
  if (lines.length > cap) {
    wrap.appendChild(h("div", { class: "code-line" },
      h("span", { class: "code-gutter" }, "…"),
      h("span", { class: "code-text faint" }, `${lines.length - cap} more lines not shown`)));
  }
  return wrap;
}

/** One code line, with every occurrence of `needle` wrapped in a `<mark>`. */
function renderCodeText(line: string, needle: string): HTMLElement {
  const span = h("span", { class: "code-text" });
  if (needle === "" || !line.toLowerCase().includes(needle)) {
    span.appendChild(document.createTextNode(line === "" ? " " : line));
    return span;
  }
  const lower = line.toLowerCase();
  let cursor = 0;
  while (cursor < line.length) {
    const found = lower.indexOf(needle, cursor);
    if (found < 0) {
      span.appendChild(document.createTextNode(line.slice(cursor)));
      break;
    }
    if (found > cursor) span.appendChild(document.createTextNode(line.slice(cursor, found)));
    span.appendChild(h("mark", {}, line.slice(found, found + needle.length)));
    cursor = found + needle.length;
  }
  return span;
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea.
 *
 * The panel lives in a shadow root inside an arbitrary page, so the async
 * Clipboard API can be unavailable (insecure context) or rejected (no
 * permission) — a copy button that silently does nothing in those cases is
 * worse than one that uses the old command.
 */
export function copyText(text: string): void {
  const clipboard = (navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } }).clipboard;
  if (clipboard?.writeText) {
    void clipboard.writeText(text).catch(() => legacyCopy(text));
    return;
  }
  legacyCopy(text);
}

function legacyCopy(text: string): void {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  } catch {
    /* nothing else to try */
  }
}

/** A small "copy" button wired to `copyText`. */
export function copyButton(getText: () => string, label = "Copy", onDone?: () => void): HTMLElement {
  return button(label, () => {
    copyText(getText());
    onDone?.();
  }, { title: "Copy to clipboard" });
}

/**
 * Offer `text` as a file download.
 *
 * Used by the session export and the generated-test buttons. Revoking the URL
 * on a timer rather than immediately is deliberate: some browsers cancel a
 * download whose blob URL is revoked in the same task.
 */
export function downloadText(filename: string, text: string, mime = "application/json"): void {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    /* download unavailable — the copy button is the fallback */
  }
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** A horizontal waterfall bar, for network timings. */
export function waterfallBar(
  startFraction: number,
  widthFraction: number,
  tone: string,
  title: string,
): HTMLElement {
  const left = Math.max(0, Math.min(99, startFraction * 100));
  const width = Math.max(1, Math.min(100 - left, widthFraction * 100));
  return h("span", { class: "wf-track", title },
    h("span", { class: `wf-bar t-${tone}`, style: `left:${left}%;width:${width}%` }));
}

/** A two-column definition list, for detail panes. */
export function defList(rows: ReadonlyArray<[string, Child]>): HTMLElement {
  return h("div", { class: "deflist" }, ...rows.flatMap(([label, value]) => [
    h("div", { class: "dt" }, label),
    h("div", { class: "dd" }, value as Child),
  ]));
}

/** A collapsible group with a persistent open flag owned by the caller. */
export function disclosure(
  label: Child,
  open: boolean,
  onToggle: () => void,
  body: () => Child | Child[],
  meta?: Child,
): HTMLElement {
  return h(
    "div",
    { class: `disc ${open ? "is-open" : ""}` },
    h("div", { class: "disc-head", onclick: onToggle },
      h("span", { class: "twist" }, open ? "▾" : "▸"),
      h("span", { class: "disc-label" }, label),
      h("span", { class: "grow" }),
      meta ?? null),
    open ? h("div", { class: "disc-body" }, ...(() => {
      const content = body();
      return Array.isArray(content) ? content : [content];
    })()) : null,
  );
}
