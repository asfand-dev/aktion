/**
 * Data components: Table, Col, List, ListItem, StatCard, Tree, TreeNode,
 * Sparkline.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, fillTableCell,
  isComponentNode, sanitiseHref, sanitiseCssLength, spacingCssValue, SPACING_TOKENS,
} from "../utils.js";
import { renderInlineSparkline } from "./patterns.js";
import { pickIconForLabel } from "./_internal.js";

const COL_ALIGN = ["left", "center", "right"] as const;
const SURFACE_TONES = ["default", "primary", "success", "warning", "danger", "info"] as const;

export const Col: ComponentSpec = {
  name: "Col",
  description:
    "Single column inside a Table or DataGrid. Use `align` for per-column " +
    "text alignment, `format` for cell rendering " +
    "(`text|number|currency|date`), `currency` for the money code used by " +
    "`format: \"currency\"`, `locale` for the BCP-47 tag those formats are " +
    "rendered in, and `width`/`wrap` to stop one long column from " +
    "forcing the whole table into horizontal scroll. `values` may be plain " +
    "values OR an " +
    "array of component nodes — e.g. `Col(\"Status\", rows.map(r => " +
    "Badge(r.status)))` or `Col(\"Actions\", rows.map(r => Button(\"Edit\")))` " +
    "— each component renders directly in its cell. Pass " +
    "`render: (value, index, row) => …` for the same effect when you prefer to " +
    "keep `values` as the raw row data (return a component, string, or " +
    "array). `row` is the whole row (header-keyed) and stays correct even when " +
    "DataGrid sorts — prefer `row.otherColumn` over indexing a sibling array. " +
    "Pass `onClick: (value, index, row) => …` to make the whole cell " +
    "clickable (pointer + keyboard). `sortable` and `filterable` only take " +
    "effect inside `DataGrid` (Table ignores them).",
  props: [
    { name: "header", type: "string" },
    { name: "values", type: "any[]", description: "Column values. Plain values are formatted as text; component nodes (e.g. `rows.map(r => Badge(r.status))`) render directly. You can also pass the full row array and map each cell with `render`." },
    { name: "format", type: "string", optional: true, enum: ["text", "number", "currency", "date"] },
    { name: "align", type: "string", optional: true, enum: COL_ALIGN, description: "Per-column horizontal alignment" },
    { name: "sortable", type: "boolean", optional: true, description: "DataGrid: enable click-to-sort on this column" },
    { name: "filterable", type: "boolean", optional: true, description: "DataGrid: enable a per-column filter chip" },
    { name: "render", type: "callable", optional: true, aliases: ["cell"], description: "`(value, index, row) => Component | string | array` — map each cell to arbitrary content (buttons, badges, links). `row` is the whole row (header-keyed), so it stays correct even when DataGrid sorts internally — prefer `row.otherColumn` over an `index` lookup into a sibling array." },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick", "cellClick"], description: "`(value, index, row) => void` — fired when a cell in this column is clicked or activated via keyboard." },
    // New slots are appended, never inserted: DataGrid reads Col slots 0-7 positionally.
    { name: "currency", type: "string", optional: true, description: "ISO 4217 code used by `format: \"currency\"` — `EUR`, `GBP`, `CHF`, … (default `USD`)." },
    { name: "width", type: "string", optional: true, description: "CSS width for the column (`240px`, `30%`). Caps the column instead of letting one long value stretch the table." },
    { name: "wrap", type: "boolean", optional: true, description: "Let long cell text wrap onto several lines instead of pushing the table into horizontal scroll." },
    { name: "headerTooltip", type: "string", optional: true, aliases: ["hint"], description: "Explanation shown on hover/focus of the header cell — e.g. `MRR = monthly recurring revenue`." },
    { name: "locale", type: "string", optional: true, description: "BCP-47 tag (`de-DE`, `en-GB`, `fr-CH`) used by `format: \"number\"|\"currency\"|\"date\"` for separators, digit grouping and date order. Defaults to the Table's `locale`, then the viewer's browser." },
  ],
  // Cols are read positionally inside Table.render — this render is a fallback.
  render: (_node, props) => {
    const wrapper = el("div", { class: "rui-col" });
    wrapper.append(el("strong", {}, [asString(props.header)]));
    return wrapper;
  },
};

const TABLE_DENSITY = ["comfortable", "compact"] as const;

export const Table: ComponentSpec = {
  name: "Table",
  description:
    "Tabular data view. Children must be Col components. `density=\"compact\"` " +
    "tightens row padding for dense data, `striped=true` zebra-stripes the " +
    "rows, `sticky=true` pins the header row when the table scrolls, and " +
    "`maxHeight` sizes that scroll box. Set `loading=true` while a query is " +
    "in flight so the table shows skeleton rows instead of its empty state, " +
    "`onRowClick` for row-level navigation, and `allowOverflow=true` when a " +
    "cell renders an overlay that must escape the scroll box. " +
    "The empty-state row uses `emptyLabel` when set.",
  props: [
    { name: "columns", type: "Col[]" },
    { name: "caption", type: "string", optional: true, aliases: ["title"] },
    { name: "density", type: "string", optional: true, enum: TABLE_DENSITY, description: "Row padding (default `comfortable`)" },
    { name: "striped", type: "boolean", optional: true, description: "Zebra-stripe alternating rows" },
    { name: "sticky", type: "boolean", optional: true, description: "Pin the header row when the table scrolls" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when the table has no rows (default `No data`)" },
    { name: "loading", type: "boolean", optional: true, description: "Show shimmering skeleton rows while data loads, instead of the empty state" },
    { name: "loadingRows", type: "number", optional: true, description: "Skeleton rows drawn while `loading` (default 3)" },
    { name: "maxHeight", type: "string", optional: true, description: "CSS max-height for the scroll box (`320px`, `50vh`) — overrides the default cap `sticky` applies" },
    { name: "onRowClick", type: "callable", optional: true, aliases: ["rowAction"], description: "`(rowIndex, row) => void` — fired when a row is clicked or activated via keyboard. `row` is header-keyed." },
    { name: "allowOverflow", type: "boolean", optional: true, aliases: ["overflow"], description: "Drop the wrapper's scroll clipping so an overlay rendered inside a cell is not cut off (the table then widens the page instead of scrolling internally)." },
    { name: "ariaLabel", type: "string", optional: true, description: "Accessible name for the table when there is no `caption`" },
    { name: "locale", type: "string", optional: true, description: "BCP-47 tag (`de-DE`, `en-GB`) applied to every `number`/`currency`/`date` column that does not set its own `locale` — an invoice table formats in the customer's locale, not the browser's." },
  ],
  render: (_node, props, helpers) => {
    const cols = asArray<{ args?: unknown[] }>(props.columns);
    const density = asString(props.density, "comfortable");
    const striped = asBoolean(props.striped);
    const loading = asBoolean(props.loading);
    const maxHeight = sanitiseCssLength(props.maxHeight, "");
    const allowOverflow = asBoolean(props.allowOverflow);
    // A sticky header needs a scrollport, which `allowOverflow` deliberately
    // removes — the two cannot both be on (DataGrid resolves it the same way).
    const sticky = asBoolean(props.sticky) && !allowOverflow;
    // `overflow-x: auto` on the wrapper makes `overflow-y` compute to `auto`
    // too, so the box clips a cell's Dropdown/Tooltip on BOTH axes. Released
    // inline (as DataGrid and ComparisonTable do) rather than through a
    // stylesheet hook, so the prop works in a host that ships its own theme.
    const wrapperStyle = allowOverflow
      ? "overflow:visible;"
      : maxHeight
        // Inline so it beats the `[data-sticky="true"]` cap without `!important`.
        ? `max-height:${maxHeight};overflow:auto;`
        : "";
    const wrapper = el("div", {
      class: "rui-table-wrapper",
      "data-density": density,
      "data-striped": striped ? "true" : "false",
      "data-sticky": sticky ? "true" : "false",
      // Kept as a styling hook: the table now widens the page instead of
      // scrolling inside itself, which the theme may want to react to.
      "data-overflow": allowOverflow ? "visible" : null,
      style: wrapperStyle || null,
    });
    const caption = asString(props.caption);
    const ariaLabel = asString(props.ariaLabel);
    const table = el("table", {
      class: "rui-table",
      // A `<caption>` already names the table, and an aria-label would shadow
      // it — only name the table explicitly when there is no caption.
      "aria-label": !caption && ariaLabel ? ariaLabel : null,
      "aria-busy": loading ? "true" : null,
    });

    if (caption) table.append(el("caption", { class: "rui-table-caption" }, [caption]));

    const aligns = cols.map((col) => {
      const align = asString(col.args?.[3], "");
      return (COL_ALIGN as readonly string[]).includes(align) ? align : "";
    });
    const widths = cols.map((col) => sanitiseCssLength(col.args?.[9], ""));
    const cellStyles = widths.map((width) => (width ? `width:${width};max-width:${width};` : null));
    // `null` = the column said nothing, so the stylesheet default applies.
    const wrapAttrs = cols.map((col) => {
      const raw = col.args?.[10];
      if (raw === undefined || raw === null) return null;
      return asBoolean(raw) ? "true" : "false";
    });
    // `.rui-table` is pinned to `min-width: max-content`, and a cell's
    // max-content contribution is its whole unwrapped line — so `Col(wrap:)`
    // switched `white-space` and changed nothing, because the table still grew
    // to the width the text wanted. Released inline (as `allowOverflow` is) so
    // the opt-in also works in a host that ships its own theme.
    if (wrapAttrs.some((w) => w === "true")) table.style.minWidth = "0";

    const thead = el("thead");
    const headRow = el("tr");
    for (let c = 0; c < cols.length; c += 1) {
      const col = cols[c]!;
      const headerTooltip = asString(col.args?.[11]);
      const th = el("th", {
        // Explicit association: the implicit-header heuristic fails as soon as
        // the table gains a caption row or a merged layout.
        scope: "col",
        "data-align": aligns[c] || null,
        "data-wrap": wrapAttrs[c] ?? null,
        title: headerTooltip || null,
        style: cellStyles[c] ?? null,
      }, [asString(col.args?.[0])]);
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = el("tbody");
    const columnValues = cols.map((col) => asArray(col.args?.[1]));
    const formats = cols.map((col) => asString(col.args?.[2], "text"));
    const renders = cols.map((col) => col.args?.[6]);
    const clicks = cols.map((col) => col.args?.[7]);
    // One formatter per column so `format: "currency"` renders the column's own
    // currency and locale instead of hardcoding a single market's money.
    const tableLocale = localeTag(props.locale);
    const formatters = cols.map((col) => colFormatter(col.args, tableLocale));
    const rowCount = Math.max(0, ...columnValues.map((c) => c.length));
    const onRowClick = props.onRowClick;

    const headers = cols.map((col, c) => asString(col.args?.[0]) || `col-${c}`);
    for (let r = 0; r < rowCount; r += 1) {
      const tr = el("tr");
      // Header-keyed row so a cell `render`/`onClick` can read sibling columns (#11).
      const rowObj: Record<string, unknown> = {};
      columnValues.forEach((values, c) => { rowObj[headers[c]!] = values[r]; });
      columnValues.forEach((values, c) => {
        const format = formats[c] ?? "text";
        const align = aligns[c];
        const td = el("td", {
          "data-format": format,
          "data-align": align || null,
          "data-wrap": wrapAttrs[c] ?? null,
          style: cellStyles[c] ?? null,
        });
        fillTableCell(
          td,
          { format, render: renders[c], onClick: clicks[c] },
          values[r],
          r,
          helpers,
          formatters[c] ?? formatCell,
          rowObj,
        );
        tr.append(td);
      });
      if (typeof onRowClick === "function") {
        tr.setAttribute("data-clickable", "true");
        tr.tabIndex = 0;
        // Property handlers only — morph copies them onto the kept row, so the
        // index this closure captured always matches the row it lands on.
        const fire = (event: Event): boolean => {
          const target = event.target as Element | null;
          // Rendered buttons / links / inputs keep their own activation, and a
          // `Col(onClick:)` cell stops propagation before we ever see it.
          if (target?.closest("input,button,a,label,select,textarea")) return false;
          helpers.invoke(onRowClick, r, rowObj);
          return true;
        };
        tr.onclick = (event) => { fire(event); };
        tr.onkeydown = (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if (fire(event)) event.preventDefault();
        };
      }
      tbody.append(tr);
    }

    if (rowCount === 0 && loading) {
      // A fetch in flight must not read as "there is no data".
      const skeletonRows = Math.max(1, Math.min(20, Math.round(asNumber(props.loadingRows, 3))));
      const skeletonCols = Math.max(1, cols.length);
      for (let r = 0; r < skeletonRows; r += 1) {
        const tr = el("tr", { class: "rui-table-loading-row", "aria-hidden": "true" });
        for (let c = 0; c < skeletonCols; c += 1) {
          const td = el("td");
          td.append(el("div", { class: "rui-skeleton-line", style: "height:12px;" }));
          tr.append(td);
        }
        tbody.append(tr);
      }
    } else if (rowCount === 0) {
      const emptyRow = el("tr");
      const emptyLabel = asString(props.emptyLabel, "No data");
      emptyRow.append(el("td", {
        colspan: String(cols.length || 1),
        class: "rui-table-empty",
      }, [emptyLabel]));
      tbody.append(emptyRow);
    }

    table.append(tbody);
    wrapper.append(table);
    return wrapper;
  },
};

export const ListItem: ComponentSpec = {
  name: "ListItem",
  description:
    "Single list row: title, optional description, optional leading icon, " +
    "and an optional `trailing` slot for a badge / switch / chevron. Pass " +
    "`onClick` (or `href`) to make the row activatable, `active=true` to mark " +
    "it as the current selection, and `tone` for per-row status emphasis.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true, aliases: ["meta"] },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick", "action"], description: "Callable fired when the row is activated (click or Enter/Space)" },
    { name: "href", type: "string", optional: true, description: "Render the row as a real link so middle-click / open-in-new-tab work" },
    { name: "trailing", type: "Node[]", optional: true, aliases: ["actions", "accessory"], description: "Components pinned to the right of the row (Badge, Switch, icon button)" },
    { name: "active", type: "boolean", optional: true, aliases: ["selected"], description: "Marks the row as the current selection (list-as-navigation, list-as-picker)" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: SURFACE_TONES, description: "Status emphasis for the row (failed / queued / done lists)" },
  ],
  render: (_node, props, helpers) => {
    const hasAction = typeof props.onClick === "function";
    return buildListRow({
      title: asString(props.title),
      description: asString(props.description),
      icon: props.icon,
      tone: asString(props.tone, "default"),
      active: asBoolean(props.active),
      href: sanitiseHref(props.href, ""),
      onActivate: hasAction ? () => helpers.invoke(props.onClick) : null,
      trailing: asArray<unknown>(props.trailing).map((item) => helpers.renderNode(item)),
    });
  },
};

export const List: ComponentSpec = {
  name: "List",
  description:
    "Vertical list. `items` are normally `ListItem(...)` nodes, but plain " +
    "strings and `{title, description, icon}` objects are accepted and " +
    "coerced into rows. `divided=true` renders a flush list with hairline " +
    "separators instead of a bordered card per row, `gap` spaces the rows, " +
    "and `emptyLabel` is shown when `items` is empty.",
  props: [
    { name: "items", type: "ListItem[]" },
    { name: "ordered", type: "boolean", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when the list has no items (default `No items`)" },
    { name: "divided", type: "boolean", optional: true, description: "Flush list separated by hairlines instead of one bordered card per row" },
    { name: "gap", type: "string", optional: true, enum: SPACING_TOKENS, description: "Space between rows" },
  ],
  render: (_node, props, helpers) => {
    const tag = asBoolean(props.ordered) ? "ol" : "ul";
    const gap = spacingCssValue(props.gap);
    const root = el(tag as "ul", {
      class: "rui-list",
      "data-divided": asBoolean(props.divided) ? "true" : null,
      style: gap ? `gap:${gap};` : null,
    });
    const items = asArray<unknown>(props.items);
    for (const item of items) root.append(renderListEntry(item, helpers));
    if (items.length === 0) {
      // A filtered `$query` that matched nothing used to render a zero-height
      // `<ul>` — indistinguishable from a failed render.
      root.append(el("li", { class: "rui-list-empty" }, [asString(props.emptyLabel, "No items")]));
    }
    return root;
  },
};

export const StatCard: ComponentSpec = {
  name: "StatCard",
  description:
    "Single KPI card with label, value, optional delta, optional icon, " +
    "optional `hint` (\"vs. last quarter\"), and optional inline sparkline " +
    "(`spark=[…numbers]`). Pass `onClick` to make the whole tile a drill-down " +
    "target. Use inside `Stats` for a uniform KPI strip.",
  props: [
    { name: "label", type: "string" },
    { name: "value", type: "string" },
    { name: "trend", type: "string", optional: true, enum: ["up", "down", "flat"] },
    { name: "delta", type: "string", optional: true, description: "Change vs previous period" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a chip beside the label. Omit it and one is guessed from the label; pass `\"none\"` for no icon at all." },
    { name: "spark", type: "number[]", optional: true, description: "Optional inline sparkline values" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: SURFACE_TONES },
    { name: "hint", type: "string", optional: true, aliases: ["description"], description: "Small qualifier under the value (`vs. last quarter`, `excl. tax`)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick", "action"], description: "Callable fired when the card is clicked — the standard KPI drill-down" },
  ],
  render: (_node, props, helpers) => {
    const tone = asString(props.tone, "default");
    const clickable = typeof props.onClick === "function";
    const root = el(clickable ? "button" : "div", {
      class: "rui-stat-card",
      type: clickable ? "button" : null,
      "data-tone": tone,
      "data-clickable": clickable ? "true" : null,
    }) as HTMLElement;
    const labelRow = el("div", { class: "rui-stat-label-row" });
    const label = asString(props.label);
    const iconName = iconOverride(props.icon) ?? pickIconForLabel(label) ?? "";
    const iconNode = renderIcon(iconName, { className: "rui-stat-icon" });
    if (iconNode) labelRow.append(iconNode);
    labelRow.append(el("div", { class: "rui-stat-label" }, [label]));
    root.append(labelRow);
    root.append(el("div", { class: "rui-stat-value" }, [asString(props.value)]));
    const delta = asString(props.delta);
    const trend = asString(props.trend);
    if (delta || trend) {
      // Direction must never be colour-only (WCAG 1.4.1): keep the arrow glyph
      // even when a delta string is present, and name the direction for AT —
      // `data-trend` reaches nobody.
      const arrow = trend ? trendArrow(trend) : "";
      root.append(el("div", {
        class: "rui-stat-trend",
        "data-trend": trend || "flat",
        "aria-label": trend ? [delta, `trending ${trend}`].filter(Boolean).join(", ") : null,
      }, [[arrow, delta].filter(Boolean).join(" ")]));
    }
    // Same class as the `Stats` strip's hint so converting a strip into a
    // StatCard grid keeps the qualifier looking identical.
    const hint = asString(props.hint);
    if (hint) root.append(el("div", { class: "rui-stat-hint rui-stats-hint" }, [hint]));
    const spark = finiteNumbers(props.spark);
    if (spark.length > 1) {
      const sparkWrap = el("div", { class: "rui-stat-spark" });
      sparkWrap.append(renderInlineSparkline(spark, tone === "default" ? "primary" : tone));
      root.append(sparkWrap);
    }
    if (clickable) root.onclick = () => helpers.invoke(props.onClick);
    return root;
  },
};

export const Sparkline: ComponentSpec = {
  name: "Sparkline",
  description:
    "Tiny inline trend chart for KPIs, table cells, and dashboards. " +
    "Renders an SVG line with a soft fill — use anywhere you would " +
    "otherwise reach for `LineChart` but a single value series should " +
    "stay inline with surrounding text. `width`/`height` size it (default " +
    "80x24), `min`/`max` fix the scale so a strip of sparklines shares one " +
    "baseline, and `label` gives screen readers the trend (\"7-day trend, " +
    "up 12%\").",
  props: [
    { name: "values", type: "number[]" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "width", type: "number|string", optional: true, description: "Chart width — a px number or any CSS length (`100%`, `12rem`). Default 80." },
    { name: "height", type: "number|string", optional: true, description: "Chart height — a px number or any CSS length. Default 24." },
    { name: "min", type: "number", optional: true, description: "Fixed scale minimum. Set `min`/`max` on every sparkline in a strip so their slopes are comparable." },
    { name: "max", type: "number", optional: true, description: "Fixed scale maximum" },
    { name: "label", type: "string", optional: true, aliases: ["ariaLabel"], description: "Screen-reader description of the trend. Without it the chart stays decorative (`aria-hidden`)." },
  ],
  render: (_node, props) => {
    const tone = asString(props.tone, "primary");
    const values = finiteNumbers(props.values);
    const wrap = el("span", { class: "rui-sparkline-wrap" });
    if (values.length === 0) {
      // An empty series used to reserve a blank 80x24 box, which reads as a
      // broken chart. A dash says "no data" in the footprint of text.
      wrap.append(el("span", { class: "rui-sparkline-empty" }, ["—"]));
      return wrap;
    }
    const svg = renderSparklineSvg(values, tone, {
      width: props.width,
      height: props.height,
      min: props.min === undefined || props.min === null ? null : asNumber(props.min),
      max: props.max === undefined || props.max === null ? null : asNumber(props.max),
      label: asString(props.label),
    });
    wrap.append(svg);
    // `.rui-sparkline-wrap` is `inline-flex`, so it is shrink-to-fit: a relative
    // `width` on the svg would resolve against a box that is itself sized by the
    // svg. Mirror the length onto the wrapper so `width: "100%"` fills the card.
    const widthAttr = svg.getAttribute("width") ?? "";
    if (pxValue(widthAttr) === null) wrap.style.width = widthAttr;
    return wrap;
  },
};

export const TreeNode: ComponentSpec = {
  name: "TreeNode",
  description:
    "Single node in a Tree view. When `children` is provided the node " +
    "renders as an expandable branch with a chevron; otherwise it renders " +
    "as a leaf. `onClick` fires on click, `href` makes the row a real link, " +
    "`onToggle` fires with the new open state, and `disabled=true` makes the " +
    "row inert. Set `hasChildren=true` (with no `children` yet) plus " +
    "`onToggle` to lazy-load a subtree the first time the branch is opened. " +
    "`expanded` is the INITIAL open " +
    "state — a branch the user collapsed stays collapsed across re-renders. " +
    "Use `active=true` to highlight the current selection, or drive selection " +
    "from `Tree(selectedId:)` instead. In a checkable Tree it is the node's " +
    "`nodeId` (or label) that appears in `Tree(checkedIds:)`.",
  props: [
    { name: "label", type: "string" },
    { name: "children", aliases: ["child"], type: "TreeNode[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon shown before the label" },
    { name: "expanded", type: "boolean", optional: true, description: "Whether the branch starts open (initial value — the user's own collapse wins afterwards)" },
    { name: "active", type: "boolean", optional: true, aliases: ["selected"], description: "Highlights the row as the current selection" },
    { name: "badge", type: "string", optional: true, description: "Trailing chip (count or status)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable fired when the row is clicked" },
    { name: "href", type: "string", optional: true, description: "Render the row as a real link (docs sidebars, file paths) so middle-click works" },
    { name: "disabled", type: "boolean", optional: true, description: "Renders the row inert — permission-gated or unavailable nodes" },
    { name: "onToggle", type: "callable", optional: true, description: "`(open) => void` — fired when the branch expands or collapses. Use it to lazy-load children." },
    { name: "nodeId", type: "string", optional: true, aliases: ["value"], description: "Stable id for `Tree(selectedId:)` / `Tree(expandedIds:)` (defaults to the label)" },
    { name: "hasChildren", type: "boolean", optional: true, aliases: ["lazy"], description: "Render an expandable branch even though `children` is still empty — the lazy-loading half of `onToggle`: open the branch, fetch, re-render with real children." },
  ],
  render: (_node, props, helpers) => {
    const children = asArray<unknown>(props.children);
    // A branch with no children yet: without this a lazily-loaded folder had no
    // chevron, so there was nothing for the user to open and `onToggle` — the
    // documented fetch hook — could never fire.
    const hasChildren = children.length > 0 || asBoolean(props.hasChildren);
    const active = asBoolean(props.active);
    const disabled = asBoolean(props.disabled);
    const label = asString(props.label);
    const nodeId = asString(props.nodeId) || label;
    const href = disabled ? "" : sanitiseHref(props.href, "");
    const hasAction = !disabled && typeof props.onClick === "function";

    // `expanded` is an INITIAL value, not an assertion. Morph only protects the
    // `open` attribute from *removal*, so re-emitting the prop on every render
    // sprang a user-collapsed branch back open on any unrelated state change
    // (a keystroke in a search box two panels away).
    const expandedProp = props.expanded === undefined || props.expanded === null
      ? null
      : asBoolean(props.expanded);
    const openSlot = helpers.useInstanceState<boolean>("open", expandedProp ?? false);
    const lastExpandedProp = helpers.useInstanceState<boolean | null>("expandedProp", expandedProp);
    // A *changed* prop is still honoured so a program can drive expansion from
    // state (reveal a search hit, "expand all").
    if (expandedProp !== null && expandedProp !== lastExpandedProp.get()) {
      lastExpandedProp.set(expandedProp);
      openSlot.set(expandedProp);
    }
    const open = hasChildren && openSlot.get();

    const rowTag = href ? "a" : hasAction ? "button" : "div";
    const row = el(rowTag, {
      type: rowTag === "button" ? "button" : null,
      href: href || null,
      class: "rui-tree-node-row",
      "data-tree-id": nodeId,
      "data-active": active ? "true" : "false",
      "data-disabled": disabled ? "true" : null,
      "aria-disabled": disabled ? "true" : null,
      disabled: rowTag === "button" && disabled ? "" : null,
      // A branch's treeitem is the `<details>` below, because that is the
      // element which also *contains* the `role="group"` child. Keeping the
      // role on the label row (as this used to) left `role="tree"` owning zero
      // treeitems, so the whole nesting/level relationship was lost.
      role: hasChildren ? null : "treeitem",
      "aria-level": hasChildren ? null : "1",
      "aria-selected": hasChildren ? null : active ? "true" : "false",
    }) as HTMLElement;

    // Branch rows get their chevron as a sibling control inside the summary —
    // a real <button> cannot be nested inside the row's own <button>.
    if (!hasChildren) {
      row.append(el("span", { class: "rui-tree-node-chevron-spacer", "aria-hidden": "true" }));
    }
    const iconNode = renderIcon(props.icon, { className: "rui-tree-node-icon" });
    if (iconNode) row.append(iconNode);
    row.append(el("span", { class: "rui-tree-node-label" }, [label]));
    const badge = asString(props.badge);
    if (badge) row.append(el("span", { class: "rui-tree-node-badge" }, [badge]));

    if (hasAction) {
      row.onclick = () => helpers.invoke(props.onClick);
    }

    if (!hasChildren) return row;

    // Branch: a <details> so expand/collapse keeps working without script and
    // survives morph reconciliation.
    const details = el("details", {
      class: "rui-tree-node",
      role: "treeitem",
      "data-tree-id": nodeId,
      // The `<details>` is the treeitem, so it is the element whose state AT
      // reads — and the element a checkable Tree guards on. Carrying `disabled`
      // only on the inner row left a disabled folder checkable.
      "aria-disabled": disabled ? "true" : null,
      "data-active": active ? "true" : "false",
      "aria-expanded": open ? "true" : "false",
      "aria-level": "1",
      "aria-selected": active ? "true" : "false",
    });
    if (open) details.setAttribute("open", "");
    details.ontoggle = (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLDetailsElement;
      openSlot.set(live.open);
      live.setAttribute("aria-expanded", live.open ? "true" : "false");
      live.querySelector(".rui-tree-node-chevron-button")
        ?.setAttribute("aria-expanded", live.open ? "true" : "false");
      helpers.invoke(props.onToggle, live.open);
    };

    const summary = el("summary", {
      class: "rui-tree-node-summary",
      // Flatten the disclosure wrapper: the <details> is the treeitem, and an
      // extra button between `tree` and `treeitem` breaks the ARIA structure.
      role: "none",
      style: TREE_SUMMARY_RESET,
    });
    // A real control, not an `aria-hidden` glyph: collapsing a branch must not
    // depend on the browser's <summary> activation surviving a click that lands
    // inside the row's own <button> (Blink suppresses it).
    const toggle = el("button", {
      type: "button",
      class: "rui-tree-node-chevron-button",
      "aria-label": `Toggle ${label}`,
      "aria-expanded": open ? "true" : "false",
      style: TREE_CHEVRON_RESET,
    });
    const chevron = renderIcon("chevron-right", { className: "rui-tree-node-chevron" });
    if (chevron) toggle.append(chevron);
    toggle.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const live = (event.currentTarget as Element).closest("details.rui-tree-node");
      if (!(live instanceof HTMLDetailsElement)) return;
      // The `toggle` handler above persists the new state.
      live.open = !live.open;
    };
    summary.append(toggle);
    summary.append(row);
    // When the row itself is activatable, swallow the summary's default toggle
    // so clicking the label runs the action; the chevron owns expansion.
    if (hasAction || href) {
      summary.onclick = (event) => {
        const target = event.target as Element | null;
        // The chevron owns expansion and the checkbox owns checking; cancelling
        // a checkbox click would also revert the box (the canceled-activation
        // steps restore `checked` after dispatch).
        if (target?.closest(".rui-tree-node-chevron-button, .rui-tree-node-checkbox")) return;
        event.preventDefault();
      };
    }
    details.append(summary);

    const childList = el("div", { class: "rui-tree-node-children", role: "group" });
    for (const child of children) childList.append(helpers.renderNode(child));
    if (children.length === 0) {
      // `hasChildren` branch whose subtree has not arrived. `role="group"` may
      // only own treeitems, so the placeholder is one — disabled, so it is
      // announced but can be neither selected nor checked.
      childList.append(el("div", {
        class: "rui-tree-node-row rui-tree-node-pending",
        role: "treeitem",
        "aria-level": "1",
        "aria-disabled": "true",
        style: TREE_PENDING_RESET,
      }, ["Loading…"]));
    }
    // Levels are assigned bottom-up: every subtree renders itself starting at
    // level 1, so nesting one shifts the whole subtree down by one. Depth stays
    // correct without threading a level prop through `renderNode`.
    for (const descendant of childList.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
      descendant.setAttribute(
        "aria-level",
        String(asNumber(descendant.getAttribute("aria-level"), 1) + 1),
      );
    }
    details.append(childList);
    return details;
  },
};

export const Tree: ComponentSpec = {
  name: "Tree",
  description:
    "Hierarchical tree view. Children must be TreeNode entries. Use for " +
    "file browsers, nested navigation, category pickers, and any " +
    "parent/child structure with arbitrary depth. Bind `selectedId` to a " +
    "`$variable` (and/or pass `onSelect`) for container-level single " +
    "selection instead of wiring `active` + `onClick` on every node; " +
    "`expandedIds` opens the named branches (reveal a search hit, expand " +
    "all). `checkable=true` puts a checkbox on every node and binds " +
    "`checkedIds` — the standard shape for a folder-sync / permission picker; " +
    "checking a branch checks its whole subtree and a partly-checked branch " +
    "renders mixed. The tree implements the standard keyboard model: Up/Down " +
    "move, Right/Left expand/collapse, Home/End jump, Enter activates, Space " +
    "checks.",
  props: [
    { name: "items", type: "TreeNode[]" },
    { name: "selectedId", type: "string", optional: true, aliases: ["selected", "value"], description: "Id (or label) of the selected node — bind a `$variable` for two-way selection" },
    { name: "onSelect", type: "callable", optional: true, description: "`(nodeId) => void` — fired when a row is activated" },
    { name: "expandedIds", type: "any[]", optional: true, description: "Ids (or labels) of branches to open. Additive: it opens branches, it never forces one closed." },
    { name: "ariaLabel", type: "string", optional: true, description: "Accessible name for the tree (`Files`, `Categories`) — needed as soon as a page shows more than one" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when there are no items (default `No items`)" },
    // Appended, never inserted: `checkedIds` is read from slot 7 for binding.
    { name: "checkable", type: "boolean", optional: true, description: "Show a checkbox on every node for multi-selection (\"pick the folders to sync\", permission trees)" },
    { name: "checkedIds", type: "any[]", optional: true, aliases: ["checkedKeys"], description: "Ids (or labels) of the checked nodes — bind a `$variable` for two-way multi-selection. Checking a branch checks its subtree; a partly-checked branch is reported mixed and is NOT listed here." },
    { name: "onCheck", type: "callable", optional: true, description: "`(checkedIds) => void` — fired with the whole checked-id array whenever a checkbox changes" },
  ],
  render: (node, props, helpers) => {
    const items = asArray(props.items);
    // Read the binding from the DECLARED slot index — `argMeta.find(…)` would
    // grab the first `$`-bound slot, which here is usually `items`.
    const checkedStateName = node.argMeta?.[7]?.stateRef;
    const checkable = asBoolean(props.checkable) || checkedStateName !== undefined;
    const root = el("div", {
      class: "rui-tree",
      role: "tree",
      "aria-label": asString(props.ariaLabel) || null,
      // Checkboxes are exactly what `aria-multiselectable` describes; without it
      // a screen reader announces a single-select tree with stray checked states.
      "aria-multiselectable": checkable ? "true" : null,
    });
    for (const item of items) root.append(helpers.renderNode(item));

    if (items.length === 0) {
      root.append(el("div", { class: "rui-tree-empty" }, [asString(props.emptyLabel, "No items")]));
      return root;
    }

    const checkedSlot = helpers.useInstanceState<string[] | null>("checked", null);
    const readChecked = (): string[] => {
      const src = checkedStateName ? props.checkedIds : (checkedSlot.get() ?? props.checkedIds);
      return asArray<unknown>(src).map((v) => asString(v));
    };

    const expandedIds = new Set(asArray<unknown>(props.expandedIds).map((v) => asString(v)));
    if (expandedIds.size > 0) {
      for (const branch of root.querySelectorAll<HTMLElement>("details.rui-tree-node")) {
        if (!expandedIds.has(branch.dataset.treeId ?? "")) continue;
        branch.setAttribute("open", "");
        branch.setAttribute("aria-expanded", "true");
      }
    }

    if (checkable) {
      installTreeCheckboxes(root);
      applyTreeChecks(root, new Set(readChecked()));
    }

    const selectedId = asString(props.selectedId);
    if (selectedId) applyTreeSelection(root, selectedId);
    applyRovingTabindex(root);

    // Read the state ref from the DECLARED slot index — `argMeta.find(…)` would
    // grab the first `$`-bound slot, which here is usually `items`.
    const selectStateName = node.argMeta?.[1]?.stateRef;
    const wantsSelect = typeof props.onSelect === "function" || selectStateName !== undefined;

    /** Toggle one node plus its subtree, then re-derive every ancestor. */
    const toggleCheck = (item: HTMLElement, liveRoot: HTMLElement): void => {
      if (item.getAttribute("aria-disabled") === "true") return;
      // "mixed" counts as not-checked, so one press fills the rest of the subtree.
      const on = item.getAttribute("aria-checked") !== "true";
      const next = new Set(readChecked());
      for (const target of [item, ...subtreeTreeItems(item)]) {
        if (target.getAttribute("aria-disabled") === "true") continue;
        const id = target.dataset.treeId ?? "";
        if (!id) continue;
        if (on) next.add(id); else next.delete(id);
      }
      // A branch counts as checked only while every enabled child is, so
      // unchecking one leaf has to drop its ancestors out of `checkedIds` —
      // they are mixed, and a host that saved the array would otherwise
      // restore the whole subtree.
      normaliseTreeChecks(liveRoot, next);
      const ids = Array.from(next);
      if (checkedStateName) helpers.setState(checkedStateName, ids);
      else checkedSlot.set(ids);
      helpers.invoke(props.onCheck, ids);
      // Reflect it now: an unbound tree gets no re-render at all, and a bound
      // one cannot see the write in `props` until the render lands.
      applyTreeChecks(liveRoot, new Set(ids));
    };

    if (wantsSelect || checkable) {
      root.onclick = (event) => {
        const target = event.target as Element | null;
        if (!target) return;
        const liveRoot = (event.currentTarget ?? event.target) as HTMLElement;
        if (checkable && target.classList.contains("rui-tree-node-checkbox")) {
          // Deliberately NOT prevented: an input is the click's activation
          // target, so the enclosing <summary> does not toggle, and cancelling
          // would restore the box's old `checked` after this handler returns —
          // undoing the state we are about to paint from the model.
          const item = treeItemForCheckbox(target);
          if (item) toggleCheck(item, liveRoot);
          return;
        }
        if (!wantsSelect || target.closest(".rui-tree-node-chevron-button")) return;
        const row = target.closest(".rui-tree-node-row");
        if (!(row instanceof HTMLElement) || row.getAttribute("aria-disabled") === "true") return;
        const id = row.dataset.treeId ?? "";
        // Reflect the selection in the live DOM straight away: a program that
        // only passed `onSelect` still gets the highlight, and a bound one gets
        // it before the re-render lands.
        applyTreeSelection(liveRoot, id);
        applyRovingTabindex(liveRoot);
        if (selectStateName) helpers.setState(selectStateName, id);
        helpers.invoke(props.onSelect, id);
      };
    }

    root.onkeydown = (event) => {
      if (!TREE_KEYS.has(event.key)) return;
      const liveRoot = (event.currentTarget ?? event.target) as HTMLElement;
      const visible = visibleTreeItems(liveRoot);
      if (visible.length === 0) return;
      const origin = (event.target as Element | null)?.closest('[role="treeitem"]');
      const current = origin instanceof HTMLElement ? origin : null;
      const index = current ? visible.indexOf(current) : -1;
      const focusAt = (next: number): void => {
        const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
        if (!target) return;
        for (const item of treeItems(liveRoot)) item.tabIndex = item === target ? 0 : -1;
        target.focus();
      };
      switch (event.key) {
        case "ArrowDown": event.preventDefault(); focusAt(index + 1); return;
        case "ArrowUp": event.preventDefault(); focusAt(index < 0 ? 0 : index - 1); return;
        case "Home": event.preventDefault(); focusAt(0); return;
        case "End": event.preventDefault(); focusAt(visible.length - 1); return;
        default: break;
      }
      if (!current) return;
      const branch = current instanceof HTMLDetailsElement ? current : null;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (!branch) return;
        if (!branch.open) branch.open = true; else focusAt(index + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (branch?.open) { branch.open = false; return; }
        const parent = current.parentElement?.closest('[role="treeitem"]');
        if (parent instanceof HTMLElement) focusAt(visible.indexOf(parent));
        return;
      }
      // Space is the check key in a multi-select tree (WAI-ARIA), leaving Enter
      // for the node's own action.
      if (checkable && event.key === " ") {
        event.preventDefault();
        toggleCheck(current, liveRoot);
        return;
      }
      // Enter / Space activate the row the treeitem stands for.
      const rowNode = current.classList.contains("rui-tree-node-row")
        ? current
        : current.querySelector(".rui-tree-node-summary > .rui-tree-node-row");
      event.preventDefault();
      if (rowNode instanceof HTMLElement && rowNode.tagName !== "DIV") rowNode.click();
      else if (branch) branch.open = !branch.open;
    };

    return root;
  },
};

/**
 * Inline resets for the elements this file promoted from a plain `<div>`/`<span>`
 * to a real control. A `<button>` brings its own border, background, centred
 * text and font, and an `<a>` brings an underline — so an activatable row or a
 * chevron would render as browser chrome until the stylesheet catches up. Inline
 * (as the sibling components do) so the markup is correct in a host that ships
 * its own theme.
 */
const CONTROL_RESET =
  "appearance:none;background:none;border:0;padding:0;font:inherit;" +
  "color:inherit;text-decoration:none;cursor:pointer";
/** `.rui-list-text`'s own flex column, plus the row growth the trailing slot needs. */
const LIST_ACTION_RESET = `${CONTROL_RESET};display:flex;flex-direction:column;` +
  "gap:2px;min-width:0;flex:1 1 auto;text-align:left";
const TRAILING_SLOT =
  "margin-left:auto;display:flex;align-items:center;gap:var(--rui-spacing-xs);flex:0 0 auto";
/** The summary lays the chevron out beside the row; its base rule is `display: block`. */
const TREE_SUMMARY_RESET = "display:flex;align-items:center;gap:2px;list-style:none";
const TREE_CHEVRON_RESET = `${CONTROL_RESET};display:inline-flex;align-items:center;` +
  "justify-content:center;flex:0 0 auto";
/** A `hasChildren` branch that is open but still empty; not a real row. */
const TREE_PENDING_RESET = "color:var(--rui-color-text-muted);cursor:default";
const TREE_CHECKBOX_RESET =
  "flex:0 0 auto;width:14px;height:14px;margin:0;cursor:pointer;" +
  "accent-color:var(--rui-color-primary)";
/** Lays a leaf's injected checkbox out beside the row it belongs to. */
const TREE_CHECK_ROW_RESET = "display:flex;align-items:center;gap:2px";

function trendArrow(trend: string): string {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "—";
}

/**
 * Resolve an explicitly chosen icon from a prop that must also be able to say
 * "no icon at all". Returns `null` when the program said nothing (so the caller
 * may guess from the label) and `""` when it opted out — `icon: ""` used to be
 * falsy and fell straight through to the keyword guess, which made an
 * icon-free KPI strip unreachable.
 */
function iconOverride(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value === false) return "";
  const name = asString(value).trim();
  return name === "" || name.toLowerCase() === "none" ? "" : name;
}

/**
 * Numeric series entries only.
 *
 * `asNumber` maps `null` / `"n/a"` to 0, so one missing day in
 * `[120, null, 118, 121]` plunged the line to zero and rescaled the chart to
 * 0-121 — reading as an outage that never happened. Gaps are skipped instead.
 */
function finiteNumbers(value: unknown): number[] {
  const out: number[] = [];
  for (const entry of asArray<unknown>(value)) {
    if (entry === null || entry === undefined || entry === "") continue;
    const n = typeof entry === "number" ? entry : Number(asString(entry));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 24;
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Sparkline SVG with author-controlled geometry and domain.
 *
 * `renderInlineSparkline` (patterns.ts) is deliberately fixed at 80x24 and
 * always auto-scales to its own series — right for the `Stats` strip, wrong for
 * a standalone chart that has to fill a card or share a baseline with its
 * neighbours. Same class names, so one stylesheet covers both.
 */
function renderSparklineSvg(
  values: number[],
  tone: string,
  opts: { width?: unknown; height?: unknown; min?: number | null; max?: number | null; label?: string },
): SVGSVGElement {
  const widthAttr = cssSize(opts.width, String(SPARK_WIDTH));
  const heightAttr = cssSize(opts.height, String(SPARK_HEIGHT));
  // A plain px size doubles as the coordinate system so the geometry is exact;
  // relative sizes (`100%`, `12rem`) keep the default viewBox and stretch,
  // which the non-scaling stroke keeps looking even.
  const vbW = pxValue(widthAttr) ?? SPARK_WIDTH;
  const vbH = pxValue(heightAttr) ?? SPARK_HEIGHT;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "rui-sparkline");
  svg.setAttribute("data-tone", tone);
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  svg.setAttribute("width", widthAttr);
  svg.setAttribute("height", heightAttr);
  svg.setAttribute("preserveAspectRatio", "none");
  if (opts.label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  const lo = opts.min ?? Math.min(...values);
  const hi = opts.max ?? Math.max(...values);
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  const range = max - min || 1;
  // Bias by 2px padding top/bottom so the stroke is fully visible.
  const yFor = (value: number): number =>
    2 + ((max - Math.min(max, Math.max(min, value))) / range) * (vbH - 4);

  if (values.length === 1) {
    // A single sample has no slope. Draw the baseline plus a dot so the value
    // is still visible — an empty box is indistinguishable from a failure.
    const mid = (vbH / 2).toFixed(1);
    const base = document.createElementNS(SVG_NS, "path");
    base.setAttribute("class", "rui-sparkline-baseline");
    base.setAttribute("d", `M0,${mid} L${vbW},${mid}`);
    base.setAttribute("stroke", "currentColor");
    base.setAttribute("stroke-width", "1.5");
    base.setAttribute("stroke-opacity", "0.4");
    base.setAttribute("fill", "none");
    base.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(base);
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "rui-sparkline-dot");
    dot.setAttribute("cx", (vbW / 2).toFixed(1));
    dot.setAttribute("cy", mid);
    dot.setAttribute("r", "2");
    dot.setAttribute("fill", "currentColor");
    svg.appendChild(dot);
    return svg;
  }

  const step = vbW / (values.length - 1);
  const linePath = values
    .map((value, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${yFor(value).toFixed(1)}`)
    .join(" ");
  const area = document.createElementNS(SVG_NS, "path");
  area.setAttribute("d", `${linePath} L${vbW},${vbH} L0,${vbH} Z`);
  area.setAttribute("class", "rui-sparkline-area");
  svg.appendChild(area);
  const line = document.createElementNS(SVG_NS, "path");
  line.setAttribute("d", linePath);
  line.setAttribute("class", "rui-sparkline-line");
  line.setAttribute("fill", "none");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(line);
  return svg;
}

/** Accept `160`, `"160"`, `"160px"`, `"100%"`; anything else falls back. */
function cssSize(value: unknown, fallback: string): string {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? String(value) : fallback;
  const raw = asString(value).trim();
  if (!raw) return fallback;
  return /^\d+(\.\d+)?$/.test(raw) ? raw : sanitiseCssLength(raw, fallback);
}

/** The px magnitude of a size attribute, or `null` when it is relative. */
function pxValue(attr: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(attr);
  return match?.[1] ? Number(match[1]) : null;
}

/** One list row, shared by `ListItem` and the coercion path inside `List`. */
function buildListRow(opts: {
  title: string;
  description?: string;
  icon?: unknown;
  tone?: string;
  active?: boolean;
  href?: string;
  onActivate?: (() => void) | null;
  trailing?: ReadonlyArray<Node>;
}): HTMLLIElement {
  const href = opts.href ?? "";
  const activate = opts.onActivate ?? null;
  const interactive = !!href || !!activate;
  const li = el("li", {
    class: "rui-list-item",
    "data-tone": opts.tone || "default",
    "data-active": opts.active ? "true" : "false",
    "data-clickable": interactive ? "true" : null,
    "aria-current": opts.active ? "true" : null,
  });
  const iconNode = renderIcon(opts.icon, { className: "rui-list-icon" });
  if (iconNode) li.append(iconNode);
  // The activatable region is the text block rather than the whole <li>:
  // trailing content is routinely interactive itself (a Switch, a menu button)
  // and must not nest inside the row's own link/button.
  const tag = href ? "a" : activate ? "button" : "div";
  const text = el(tag, {
    class: interactive ? "rui-list-text rui-list-action" : "rui-list-text",
    type: tag === "button" ? "button" : null,
    href: href || null,
    style: interactive ? LIST_ACTION_RESET : null,
  }) as HTMLElement;
  text.append(el("div", { class: "rui-list-title" }, [opts.title]));
  if (opts.description) text.append(el("div", { class: "rui-list-description" }, [opts.description]));
  if (activate) text.onclick = () => activate();
  li.append(text);
  const trailing = opts.trailing ?? [];
  if (trailing.length > 0) {
    // `margin-left: auto` pins it to the right edge without depending on the
    // text block growing — a non-interactive `.rui-list-text` does not grow.
    const slot = el("div", { class: "rui-list-trailing", style: TRAILING_SLOT });
    for (const item of trailing) slot.append(item);
    li.append(slot);
  }
  return li;
}

/**
 * Coerce whatever a program put in `List(items:)` into a row.
 *
 * Only `ListItem` nodes used to render: an array of plain objects produced an
 * empty `<ul>` and an array of strings injected bare text nodes into it (no
 * `<li>`, no list semantics, no styling). Both shapes are the first thing an
 * LLM reaches for — every sibling component (`Stats`, `ActivityLog`,
 * `CalendarView`) takes plain objects — so they are accepted here instead of
 * silently vanishing.
 */
function renderListEntry(item: unknown, helpers: { renderNode: (node: unknown) => Node }): Node {
  if (isComponentNode(item)) return helpers.renderNode(item);
  if (item === null || item === undefined) return document.createTextNode("");
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return buildListRow({ title: String(item) });
  }
  if (typeof item === "object") {
    const rec = item as Record<string, unknown>;
    const title = rec.title ?? rec.label ?? rec.name ?? rec.text;
    if (title !== null && title !== undefined) {
      return buildListRow({
        title: asString(title),
        description: asString(rec.description ?? rec.meta ?? rec.subtitle ?? rec.hint),
        icon: rec.icon,
        tone: asString(rec.tone, "default"),
        active: asBoolean(rec.active ?? rec.selected),
      });
    }
  }
  // Visible placeholder, like the renderer's unknown-component fallback, so a
  // wrong item shape is obvious instead of disappearing.
  return el("li", { class: "rui-list-item rui-unknown-component" }, [
    `Unsupported list item (${Array.isArray(item) ? "array" : typeof item})`,
  ]);
}

const TREE_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "]);

function treeItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'));
}

/** Treeitems the user can actually reach — anything inside a closed branch is out. */
function visibleTreeItems(root: HTMLElement): HTMLElement[] {
  return treeItems(root).filter((item) => {
    let parent = item.parentElement;
    while (parent && parent !== root) {
      if (parent instanceof HTMLDetailsElement && !parent.open) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}

function applyTreeSelection(root: HTMLElement, id: string): void {
  for (const target of root.querySelectorAll<HTMLElement>("[data-tree-id]")) {
    const match = (target.dataset.treeId ?? "") === id;
    if (target.classList.contains("rui-tree-node-row")) {
      target.setAttribute("data-active", match ? "true" : "false");
    }
    if (target.getAttribute("role") === "treeitem") {
      target.setAttribute("aria-selected", match ? "true" : "false");
    }
  }
}

/** The one direct child carrying `cls`, without relying on `:scope`. */
function directTreeChild(parent: Element | null, cls: string): HTMLElement | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.classList.contains(cls)) return child as HTMLElement;
  }
  return null;
}

/**
 * Give every treeitem a checkbox.
 *
 * The checkbox is a pointer affordance only: `aria-checked` on the treeitem is
 * what the WAI-ARIA tree pattern reads, so exposing the input as well would
 * announce two controls per node. A leaf's row IS the treeitem and may be a
 * `<button>`/`<a>`, which cannot legally contain an input (and would swallow
 * its clicks), so the leaf gets a flex holder and the box becomes a sibling.
 */
function installTreeCheckboxes(root: HTMLElement): void {
  for (const item of treeItems(root)) {
    if (item.classList.contains("rui-tree-node-pending")) continue;
    const box = el("input", {
      type: "checkbox",
      class: "rui-tree-node-checkbox",
      tabindex: "-1",
      "aria-hidden": "true",
      style: TREE_CHECKBOX_RESET,
    });
    const summary = directTreeChild(item, "rui-tree-node-summary");
    if (summary) {
      const row = directTreeChild(summary, "rui-tree-node-row");
      if (row) summary.insertBefore(box, row);
      else summary.append(box);
      continue;
    }
    const holder = el("div", { class: "rui-tree-node-check-row", style: TREE_CHECK_ROW_RESET });
    item.replaceWith(holder);
    holder.append(box);
    holder.append(item);
  }
}

/** The treeitem a checkbox belongs to — its summary's `<details>`, or its holder's row. */
function treeItemForCheckbox(box: Element): HTMLElement | null {
  const holder = box.parentElement;
  if (!holder) return null;
  if (holder.classList.contains("rui-tree-node-summary")) {
    return holder.parentElement instanceof HTMLElement ? holder.parentElement : null;
  }
  return directTreeChild(holder, "rui-tree-node-row");
}

function treeCheckbox(item: HTMLElement): HTMLInputElement | null {
  const holder = directTreeChild(item, "rui-tree-node-summary") ?? item.parentElement;
  const box = directTreeChild(holder, "rui-tree-node-checkbox");
  return box instanceof HTMLInputElement ? box : null;
}

/** Direct treeitem children of a branch (through the leaf holders, if any). */
function childTreeItems(item: HTMLElement): HTMLElement[] {
  const group = directTreeChild(item, "rui-tree-node-children");
  if (!group) return [];
  const out: HTMLElement[] = [];
  for (const child of Array.from(group.children)) {
    if (child.getAttribute("role") === "treeitem") {
      out.push(child as HTMLElement);
      continue;
    }
    const inner = directTreeChild(child, "rui-tree-node-row");
    if (inner?.getAttribute("role") === "treeitem") out.push(inner);
  }
  return out;
}

function subtreeTreeItems(item: HTMLElement): HTMLElement[] {
  return Array.from(item.querySelectorAll<HTMLElement>('[role="treeitem"]'))
    .filter((n) => !n.classList.contains("rui-tree-node-pending"));
}

function enabledChildTreeItems(item: HTMLElement): HTMLElement[] {
  return childTreeItems(item).filter((kid) =>
    kid.getAttribute("aria-disabled") !== "true"
    && !kid.classList.contains("rui-tree-node-pending"));
}

/**
 * Bring the id set in line with the tree: a branch belongs in `checkedIds` only
 * while every enabled child does. Reverse document order visits children before
 * parents, so one pass resolves any depth.
 */
function normaliseTreeChecks(root: HTMLElement, checked: Set<string>): void {
  for (const item of treeItems(root).reverse()) {
    const kids = enabledChildTreeItems(item);
    if (kids.length === 0) continue;
    const id = item.dataset.treeId ?? "";
    if (!id) continue;
    if (kids.every((kid) => checked.has(kid.dataset.treeId ?? ""))) checked.add(id);
    else checked.delete(id);
  }
}

/**
 * Paint `aria-checked` (and the box) for every node from one id set. Branches
 * are derived from their children so a partial subtree reads `mixed`.
 *
 * `indeterminate` is a property, so morph cannot carry it across a re-render —
 * `aria-checked="mixed"` is the part assistive tech reads and it survives as an
 * attribute (the same split DataGrid's select-all makes).
 */
function applyTreeChecks(root: HTMLElement, checked: Set<string>): void {
  for (const item of treeItems(root).reverse()) {
    if (item.classList.contains("rui-tree-node-pending")) continue;
    const id = item.dataset.treeId ?? "";
    const kids = enabledChildTreeItems(item);
    let state: "true" | "false" | "mixed";
    if (kids.length === 0) {
      state = checked.has(id) ? "true" : "false";
    } else if (kids.every((kid) => kid.getAttribute("aria-checked") === "true")) {
      state = "true";
    } else if (kids.some((kid) => kid.getAttribute("aria-checked") !== "false")) {
      state = "mixed";
    } else {
      state = "false";
    }
    item.setAttribute("aria-checked", state);
    const box = treeCheckbox(item);
    if (!box) continue;
    box.checked = state === "true";
    if (state === "true") box.setAttribute("checked", ""); else box.removeAttribute("checked");
    box.indeterminate = state === "mixed";
    if (state === "mixed") box.setAttribute("data-indeterminate", "true");
    else box.removeAttribute("data-indeterminate");
  }
}

/**
 * One tab stop for the whole tree (WAI-ARIA tree pattern). Without this a
 * keyboard user tabbed through both the `<summary>` and the inner row button of
 * every branch — 2N stops before reaching whatever follows the tree.
 */
function applyRovingTabindex(root: HTMLElement): void {
  for (const inner of root.querySelectorAll<HTMLElement>(
    ".rui-tree-node-summary, .rui-tree-node-summary .rui-tree-node-row, .rui-tree-node-chevron-button",
  )) {
    inner.tabIndex = -1;
  }
  const items = treeItems(root);
  const focusTarget = items.find((item) => item.getAttribute("aria-selected") === "true") ?? items[0];
  for (const item of items) item.tabIndex = item === focusTarget ? 0 : -1;
}

/**
 * ISO 4217 codes are exactly three letters. Anything else has to fall back:
 * `toLocaleString` throws a RangeError on an unknown currency, which would take
 * the whole render down.
 */
export function currencyCode(value: unknown): string {
  const code = asString(value).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

/**
 * A BCP-47 tag for `Intl`, or `undefined` meaning "whatever the host uses".
 *
 * Same hazard as an unknown currency: `toLocaleString("de_DE")` throws a
 * RangeError on a malformed tag, so one typo in `Col(locale:)` would take the
 * whole table down. Canonicalising through `Intl` decides that up front, and an
 * unusable tag degrades to the browser's own formatting.
 */
export function localeTag(value: unknown): string | undefined {
  const tag = asString(value).trim();
  if (!tag) return undefined;
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch { return undefined; }
}

/**
 * The formatter for one `Col`, bound to that column's own `currency` and
 * `locale` — with the enclosing table's `locale` as the fallback, so a EUR
 * report sets `locale` once rather than on every column.
 *
 * Reads the Col's positional slots (8 = `currency`, 12 = `locale`); slots are
 * appended to the spec, never inserted, precisely so these indices hold.
 */
export function colFormatter(
  args: readonly unknown[] | undefined,
  fallbackLocale?: string,
): (value: unknown, format: string) => string {
  const currency = currencyCode(args?.[8]);
  const locale = localeTag(args?.[12]) ?? fallbackLocale;
  return (value: unknown, format: string): string => formatCell(value, format, currency, locale);
}

/**
 * The one cell formatter, shared with `DataGrid` (advanced-data.ts).
 *
 * It used to be copy-pasted there, and the copies drifted: adding `currency`
 * here would have left the same `Col` rendering EUR in a Table and USD in a
 * DataGrid. Sorting and CSV export read through this too, so one function keeps
 * the displayed value, the sort order and the export byte-identical.
 *
 * `locale` is left `undefined` when nothing asked for one — that is what makes
 * `Intl` follow the viewer's browser, which is the right default for an app
 * whose audience is not the author's own market.
 */
export function formatCell(value: unknown, format: string, currency = "USD", locale?: string): string {
  if (value === null || value === undefined) return "";
  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString(locale) : asString(value);
    case "currency":
      return typeof value === "number"
        ? value.toLocaleString(locale, { style: "currency", currency })
        : asString(value);
    case "date":
      try {
        const d = new Date(asString(value));
        return Number.isNaN(d.getTime()) ? asString(value) : d.toLocaleDateString(locale);
      } catch { return asString(value); }
    default:
      return asString(value);
  }
}
