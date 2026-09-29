/**
 * Accessibility — a WCAG 2.2-mapped audit of the rendered tree (score, grouped
 * issues numbered to match on-page markers, and a fix for each), the
 * accessibility tree as assistive tech reads it, page structure (landmarks,
 * heading outline, keyboard tab order with a step-by-step focus walk), and
 * vision tools: colour-blindness and low-vision simulation, text scaling, and
 * a contrast checker that suggests a passing colour.
 */

import { h, type Child } from "../core/vdom.js";
import { virtualList } from "../core/virtual-list.js";
import { can, renderRootElement, type UiState, type ViewContext, type ViewDefinition } from "../context.js";
import {
  a11yScore, accessibilityTree, announce, auditAccessibility, contrastRatio, effectiveBackground, headingOutline, landmarks,
  parseColor, RULE_INFO, tabOrder, type A11yFinding, type A11yImpact, type AxNode,
} from "../a11y.js";
import { cssPath, describeElement } from "../overlay.js";
import { inlineCode, singleLine } from "../analysis/markdown.js";
import { visibleFindings } from "../shell/effects.js";
import { icon } from "../ui/icons.js";
import {
  button, card, chip, downloadText, emptyState, field, filterChip, iconButton, kv, note, plural, richText, scoreRing, searchField, segmented,
  spacer, toggleSwitch, viewbar, vsep, fmtAgo, type Tone,
} from "../ui/kit.js";
import { split } from "../ui/layout.js";
import { noApp, paneSize, setPaneSize } from "./common.js";

/* -------------------------------------------------------------------------- */
/*  WCAG reference                                                             */
/* -------------------------------------------------------------------------- */

const WCAG: Record<string, { name: string; level: "A" | "AA" | "AAA"; slug: string }> = {
  "1.1.1": { name: "Non-text Content", level: "A", slug: "non-text-content" },
  "1.2.2": { name: "Captions (Prerecorded)", level: "A", slug: "captions-prerecorded" },
  "1.3.1": { name: "Info and Relationships", level: "A", slug: "info-and-relationships" },
  "1.3.5": { name: "Identify Input Purpose", level: "AA", slug: "identify-input-purpose" },
  "1.4.3": { name: "Contrast (Minimum)", level: "AA", slug: "contrast-minimum" },
  "1.4.11": { name: "Non-text Contrast", level: "AA", slug: "non-text-contrast" },
  "2.1.1": { name: "Keyboard", level: "A", slug: "keyboard" },
  "2.4.3": { name: "Focus Order", level: "A", slug: "focus-order" },
  "2.4.4": { name: "Link Purpose (In Context)", level: "A", slug: "link-purpose-in-context" },
  "2.4.6": { name: "Headings and Labels", level: "AA", slug: "headings-and-labels" },
  "2.5.8": { name: "Target Size (Minimum)", level: "AA", slug: "target-size-minimum" },
  "3.3.2": { name: "Labels or Instructions", level: "A", slug: "labels-or-instructions" },
  "4.1.2": { name: "Name, Role, Value", level: "A", slug: "name-role-value" },
};

export function wcagUrl(criterion: string): string | null {
  const entry = WCAG[criterion];
  return entry ? `https://www.w3.org/WAI/WCAG22/Understanding/${entry.slug}.html` : null;
}

const IMPACTS: ReadonlyArray<A11yImpact> = ["critical", "serious", "moderate", "minor"];
const IMPACT_TONE: Record<A11yImpact, Tone> = { critical: "red", serious: "orange", moderate: "amber", minor: "blue" };
const CATEGORY_LABEL: Record<Exclude<UiState["a11yCategory"], "all">, string> = {
  names: "Names", structure: "Structure", aria: "ARIA", keyboard: "Keyboard", contrast: "Contrast", forms: "Forms", media: "Media",
};

/* -------------------------------------------------------------------------- */
/*  Colour helpers                                                             */
/* -------------------------------------------------------------------------- */

type Rgb = { r: number; g: number; b: number };

export function toHex(color: Rgb): string {
  const part = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * The smallest shift of `fg` toward black or white that reaches `target`
 * contrast against `bg` — the colour a designer would pick, not just "use
 * black".
 */
export function suggestForeground(fg: Rgb, bg: Rgb, target: number): { hex: string; ratio: number } | null {
  if (contrastRatio(fg, bg) >= target) return { hex: toHex(fg), ratio: contrastRatio(fg, bg) };
  let best: { hex: string; ratio: number; t: number } | null = null;
  for (const toward of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]) {
    for (let step = 1; step <= 100; step += 1) {
      const t = step / 100;
      const candidate = mix(fg, toward, t);
      const rounded = { r: Math.round(candidate.r), g: Math.round(candidate.g), b: Math.round(candidate.b) };
      const ratio = contrastRatio(rounded, bg);
      if (ratio >= target) {
        if (!best || t < best.t) best = { hex: toHex(rounded), ratio, t };
        break;
      }
    }
  }
  return best ? { hex: best.hex, ratio: best.ratio } : null;
}

/** Foreground + effective background actually painted for an element. */
function elementColors(element: Element): { fg: Rgb; bg: Rgb } | null {
  if (typeof getComputedStyle !== "function") return null;
  try {
    const bg = effectiveBackground(element) ?? { r: 255, g: 255, b: 255 };
    const parsed = parseColor(getComputedStyle(element).color);
    if (!parsed) return null;
    const fg = parsed.a >= 1 ? parsed : mix(bg, parsed, parsed.a);
    return { fg: { r: Math.round(fg.r), g: Math.round(fg.g), b: Math.round(fg.b) }, bg };
  } catch {
    return null;
  }
}

function isLarge(element: Element): boolean {
  try {
    const style = getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    return size >= 24 || (size >= 18.66 && weight >= 700);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Running the audit                                                          */
/* -------------------------------------------------------------------------- */

export function runAudit(ctx: ViewContext, options: { quiet?: boolean } = {}): void {
  const root = renderRootElement(ctx.app);
  if (!root) return;
  const started = performance.now();
  const result = auditAccessibility(root);
  const score = a11yScore(result.findings);
  const { ui } = ctx;
  ui.a11yPrevScore = ui.a11yRun ? ui.a11yRun.score : null;
  ui.a11yRun = { ...result, at: Date.now(), score };
  if (ui.a11ySelected !== null && ui.a11ySelected >= result.findings.length) ui.a11ySelected = null;
  if (!options.quiet) {
    const ms = Math.round(performance.now() - started);
    ctx.toast(result.findings.length === 0
      ? `No issues across ${result.examined} elements (${ms}ms)`
      : `${plural(result.findings.length, "issue")} across ${result.examined} elements — score ${score}`,
    result.findings.length === 0 ? "good" : score >= 90 ? "info" : "warn");
  }
}

function reportMarkdown(ctx: ViewContext, findings: ReadonlyArray<A11yFinding>): string {
  const run = ctx.ui.a11yRun!;
  const lines = [
    `# Accessibility report — ${ctx.app?.label ?? "app"}`,
    "",
    `Score **${run.score}/100** · ${findings.length} issues · ${run.examined} elements · ${new Date(run.at).toISOString()}`,
    "",
  ];
  const byRule = new Map<string, A11yFinding[]>();
  for (const finding of findings) byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding]);
  for (const [rule, items] of byRule) {
    const info = RULE_INFO[rule];
    lines.push(`## ${info?.title ?? rule} (\`${rule}\`) — ${items[0]!.impact}, ×${items.length}`);
    if (items[0]!.wcag?.length) lines.push(`WCAG ${items[0]!.wcag.map((c) => `${c} ${WCAG[c]?.name ?? ""}`.trim()).join(", ")}`);
    lines.push("", `**Fix:** ${items[0]!.help}`, "");
    for (const item of items.slice(0, 20)) lines.push(`- ${singleLine(item.message)}${item.detail ? ` (${singleLine(item.detail)})` : ""} — ${inlineCode(cssPath(item.element))}`);
    if (items.length > 20) lines.push(`- …and ${items.length - 20} more`);
    lines.push("");
  }
  return lines.join("\n");
}

function reportJson(ctx: ViewContext, findings: ReadonlyArray<A11yFinding>): string {
  const run = ctx.ui.a11yRun!;
  return JSON.stringify({
    app: ctx.app?.label, at: new Date(run.at).toISOString(), score: run.score, examined: run.examined, truncated: run.truncated,
    findings: findings.map((f) => ({ rule: f.rule, impact: f.impact, category: f.category, wcag: f.wcag, message: f.message, help: f.help, detail: f.detail, selector: cssPath(f.element), element: describeElement(f.element) })),
  }, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Issues pane                                                                */
/* -------------------------------------------------------------------------- */

type IssueRow =
  | { kind: "group"; rule: string; impact: A11yImpact; count: number; wcag: string[] }
  | { kind: "finding"; finding: A11yFinding; index: number; number: number };

function issueRows(ui: UiState, numbered: ReadonlyArray<A11yFinding>, allFindings: ReadonlyArray<A11yFinding>): IssueRow[] {
  const query = ui.a11yFilter.trim().toLowerCase();
  const groups = new Map<string, Array<{ finding: A11yFinding; number: number }>>();
  numbered.forEach((finding, i) => {
    if (query && !`${finding.rule} ${finding.message} ${finding.detail ?? ""} ${RULE_INFO[finding.rule]?.title ?? ""}`.toLowerCase().includes(query)) return;
    const list = groups.get(finding.rule) ?? [];
    list.push({ finding, number: i + 1 });
    groups.set(finding.rule, list);
  });
  const rows: IssueRow[] = [];
  for (const [rule, items] of groups) {
    const first = items[0]!.finding;
    rows.push({ kind: "group", rule, impact: first.impact, count: items.length, wcag: first.wcag ?? [] });
    if (ui.a11yCollapsed.has(rule)) continue;
    for (const item of items) rows.push({ kind: "finding", finding: item.finding, index: allFindings.indexOf(item.finding), number: item.number });
  }
  return rows;
}

function selectFinding(ctx: ViewContext, finding: A11yFinding, index: number): void {
  ctx.ui.a11ySelected = index;
  ctx.highlightElement(finding.element, { component: RULE_INFO[finding.rule]?.title ?? finding.rule, kind: finding.impact }, true);
  try {
    finding.element.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    /* detached */
  }
  ctx.refresh();
}

function findingDetail(ctx: ViewContext, finding: A11yFinding, number: number | null): Child {
  const { app } = ctx;
  const info = RULE_INFO[finding.rule];
  const owner = can(app, "instanceForNode") ? app.instanceForNode(finding.element) : null;
  const connected = finding.element.isConnected;
  let contrast: Child = null;
  if (finding.rule === "color-contrast" || finding.rule === "non-text-contrast") {
    const colors = elementColors(finding.element);
    if (colors) {
      const large = isLarge(finding.element);
      const target = finding.rule === "non-text-contrast" ? 3 : large ? 3 : 4.5;
      const ratio = contrastRatio(colors.fg, colors.bg);
      const suggestion = suggestForeground(colors.fg, colors.bg, target + 0.05);
      contrast = h("div", { class: "ax-contrast", "data-dt": "contrast-fix" },
        h("div", { class: "ax-sample", style: { color: toHex(colors.fg), background: toHex(colors.bg) } }, "Aa", h("small", {}, `${ratio.toFixed(2)}:1`)),
        suggestion ? h("div", { class: "ax-sample", style: { color: suggestion.hex, background: toHex(colors.bg) } }, "Aa", h("small", {}, `${suggestion.ratio.toFixed(2)}:1`)) : null,
        h("div", { class: "ax-contrast-text" },
          h("div", {}, `Needs ${target}:1${finding.rule === "color-contrast" ? (large ? " (large text)" : " (normal text)") : " (UI component)"} — has ${ratio.toFixed(2)}:1.`),
          suggestion ? h("div", { class: "row-flex" }, "Try ", h("code", {}, suggestion.hex), ` on ${toHex(colors.bg)}`,
            iconButton({ icon: "copy", size: "sm", label: "Copy the suggested colour", onClick: () => ctx.copy(suggestion.hex, "the colour") }),
            button({ label: "Check", size: "sm", variant: "ghost", onClick: () => { ctx.ui.contrastFg = toHex(colors.fg); ctx.ui.contrastBg = toHex(colors.bg); ctx.ui.a11yPane = "vision"; ctx.refresh(); } })) : null));
    }
  }
  return h("div", { class: "ax-detail", "data-dt": "a11y-detail" },
    h("div", { class: "pane-head" },
      number !== null ? h("span", { class: ["ax-num", `t-${IMPACT_TONE[finding.impact]}`] }, String(number)) : null,
      h("span", { class: "pane-title" }, info?.title ?? finding.rule),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ctx.ui.a11ySelected = null; ctx.highlightElement(null, undefined, true); ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      h("div", { class: "chips" },
        chip(finding.impact, IMPACT_TONE[finding.impact]),
        chip(finding.rule, "grey", { mono: true }),
        finding.category ? chip(CATEGORY_LABEL[finding.category], "grey", { outline: true }) : null,
        finding.detail ? chip(finding.detail, "amber", { mono: true }) : null,
        !connected ? chip("element removed", "grey", { tip: "The DOM changed since the audit ran — re-run it" }) : null),
      h("div", { class: "ax-message" }, ...richText(finding.message)),
      note("accent", [h("strong", {}, "How to fix. "), ...richText(finding.help)], { icon: "wand" }),
      contrast,
      finding.wcag && finding.wcag.length > 0 ? h("div", {},
        h("div", { class: "it-sub" }, "WCAG 2.2"),
        h("div", { class: "ax-wcag" }, ...finding.wcag.map((criterion) => {
          const entry = WCAG[criterion];
          const url = wcagUrl(criterion);
          return h(url ? "a" : "span", { key: criterion, class: "ax-sc", href: url ?? undefined, target: url ? "_blank" : undefined, rel: url ? "noopener noreferrer" : undefined },
            h("span", { class: "ax-sc-id" }, criterion),
            h("span", { class: "ax-sc-name" }, entry?.name ?? "Success criterion"),
            entry ? h("span", { class: "ax-sc-level" }, entry.level) : null,
            url ? icon("external", { size: 11 }) : null);
        }))) : null,
      h("div", {},
        h("div", { class: "it-sub" }, "Element"),
        h("code", { class: "ax-el" }, describeElement(finding.element)),
        h("div", { class: "ax-announce", "data-tip": "What a screen reader says when this element gets focus" }, icon("a11y", { size: 13 }), h("span", {}, announce(finding.element))),
        h("div", { class: "row-flex ax-el-actions" },
          button({ label: "Show", size: "sm", icon: "target", disabled: !connected, onClick: () => selectFinding(ctx, finding, ctx.ui.a11ySelected ?? 0) }),
          owner ? button({ label: "Inspect component", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(owner, { reveal: true }) }) : null,
          button({ label: "Copy selector", size: "sm", variant: "ghost", icon: "copy", onClick: () => ctx.copy(cssPath(finding.element), "the selector") })))));
}

function issuesPane(ctx: ViewContext): Child {
  const { ui } = ctx;
  const run = ui.a11yRun;
  if (!run) {
    return h("div", { class: "dt-scroll" }, emptyState({
      icon: "a11y",
      title: "Audit this app for accessibility",
      body: "Checks names, labels, contrast, ARIA, keyboard reachability, target size, structure and media against WCAG 2.2 — the failures generated UIs actually ship. Findings are numbered on the page too.",
      actions: [button({ label: "Run audit", variant: "primary", icon: "play", testid: "a11y-run", onClick: () => runAudit(ctx) })],
    }));
  }
  const numbered = visibleFindings(run.findings, ui);
  const rows = issueRows(ui, numbered, run.findings);
  const selected = ui.a11ySelected !== null ? run.findings[ui.a11ySelected] ?? null : null;
  const selectedNumber = selected ? numbered.indexOf(selected) + 1 || null : null;
  const counts = Object.fromEntries(IMPACTS.map((impact) => [impact, run.findings.filter((f) => f.impact === impact).length])) as Record<A11yImpact, number>;
  const categories = Object.keys(CATEGORY_LABEL) as Array<Exclude<UiState["a11yCategory"], "all">>;
  const catCounts = new Map(categories.map((c) => [c, run.findings.filter((f) => f.category === c && ui.a11yImpacts.has(f.impact)).length]));
  const trend = ui.a11yPrevScore !== null && ui.a11yPrevScore !== run.score ? run.score - ui.a11yPrevScore : 0;
  const rowHeight = ctx.rowHeight + 6;

  const summary = h("div", { class: "ax-summary", "data-dt": "a11y-summary" },
    scoreRing(run.score, { size: 58, label: "Accessibility score" }),
    h("div", { class: "ax-summary-text" },
      h("div", { class: "ax-summary-title" },
        run.findings.length === 0 ? "No issues found" : `${plural(run.findings.length, "issue")} · ${plural(new Set(run.findings.map((f) => f.rule)).size, "rule")}`,
        trend !== 0 ? h("span", { class: ["ax-trend", trend > 0 ? "is-up" : "is-down"] }, `${trend > 0 ? "▲" : "▼"} ${Math.abs(trend)}`) : null),
      h("div", { class: "t3" }, `${run.examined} elements · ${fmtAgo(run.at, Date.now())}${run.truncated ? " · capped at 4000 elements" : ""}`)),
    h("div", { class: "ax-impacts" }, ...IMPACTS.map((impact) => filterChip({
      label: impact, count: counts[impact], on: ui.a11yImpacts.has(impact), swatch: `var(--dt-${IMPACT_TONE[impact]})`, testid: `a11y-impact-${impact}`,
      onToggle: () => { if (ui.a11yImpacts.has(impact)) ui.a11yImpacts.delete(impact); else ui.a11yImpacts.add(impact); ctx.refresh(); },
    }))));

  const filters = h("div", { class: "ax-filters" },
    h("div", { class: "ax-cats", role: "group", "aria-label": "Category" },
      filterChip({ label: "All", on: ui.a11yCategory === "all", onToggle: () => { ui.a11yCategory = "all"; ctx.refresh(); } }),
      ...categories.filter((c) => (catCounts.get(c) ?? 0) > 0).map((c) => filterChip({
        label: CATEGORY_LABEL[c], count: catCounts.get(c), on: ui.a11yCategory === c,
        onToggle: () => { ui.a11yCategory = ui.a11yCategory === c ? "all" : c; ctx.refresh(); },
      }))),
    spacer(),
    searchField({ value: ui.a11yFilter, placeholder: "Filter issues…", width: "180px", onInput: (v) => { ui.a11yFilter = v; ctx.refresh(); } }));

  const list = run.findings.length === 0
    ? h("div", { class: "dt-scroll" }, emptyState({ icon: "checkCircle", title: "Nothing to fix", body: "Automated checks catch roughly a third of real-world barriers. Walk the page with the keyboard (Structure → Keyboard) and try a vision simulation next." }))
    : virtualList({
        items: rows,
        rowHeight,
        rowKey: (row) => (row.kind === "group" ? `g:${row.rule}` : `f:${row.index}`),
        version: [ui.a11ySelected, ui.a11yCollapsed.size, run.at, ui.a11yFilter, ui.a11yCategory, [...ui.a11yImpacts].join()],
        role: "list", ariaLabel: "Accessibility issues", testid: "a11y-issues",
        empty: emptyState({ icon: "filter", title: "No issue matches the filters" }),
        onKeyDown: (event) => {
          const findingsOnly = rows.filter((r): r is Extract<IssueRow, { kind: "finding" }> => r.kind === "finding");
          const at = findingsOnly.findIndex((r) => r.index === ui.a11ySelected);
          if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); const next = findingsOnly[Math.min(findingsOnly.length - 1, at + 1)]; if (next) selectFinding(ctx, next.finding, next.index); }
          if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); const prev = findingsOnly[Math.max(0, at - 1)]; if (prev) selectFinding(ctx, prev.finding, prev.index); }
        },
        renderRow: (row) => {
          if (row.kind === "group") {
            const collapsed = ui.a11yCollapsed.has(row.rule);
            return h("div", {
              class: "row ax-group", role: "button", "aria-expanded": !collapsed, "data-dt": "a11y-group",
              onClick: () => { if (collapsed) ui.a11yCollapsed.delete(row.rule); else ui.a11yCollapsed.add(row.rule); ctx.refresh(); },
            },
              h("span", { class: ["twist", collapsed ? "" : "is-open"], "aria-hidden": "true" }, icon("chevronRight", { size: 11 })),
              h("span", { class: `ax-dot t-${IMPACT_TONE[row.impact]}` }),
              h("span", { class: "ax-group-title" }, RULE_INFO[row.rule]?.title ?? row.rule),
              h("span", { class: "ax-group-rule mono" }, row.rule),
              spacer(),
              ...row.wcag.slice(0, 2).map((c) => h("span", { class: "ax-wcag-mini", "data-tip": WCAG[c] ? `WCAG ${c} ${WCAG[c]!.name} (${WCAG[c]!.level})` : `WCAG ${c}` }, c)),
              h("span", { class: "ax-count num" }, String(row.count)));
          }
          const selectedRow = row.index === ui.a11ySelected;
          return h("div", {
            class: ["row", "ax-item", selectedRow ? "is-selected" : ""], role: "listitem", "data-dt": "a11y-finding",
            onClick: () => selectFinding(ctx, row.finding, row.index),
            onMouseEnter: () => ctx.highlightElement(row.finding.element, { component: `#${row.number}`, kind: row.finding.rule }),
            onMouseLeave: () => ctx.highlightElement(null),
          },
            h("span", { class: ["ax-num", `t-${IMPACT_TONE[row.finding.impact]}`] }, String(row.number)),
            h("span", { class: "ellipsis grow" }, row.finding.message),
            row.finding.detail ? h("span", { class: "ax-detail-chip mono" }, row.finding.detail) : null);
        },
      });

  const left = h("div", { class: "ax-left" }, summary, run.findings.length > 0 ? filters : null, list);
  if (!selected) return left;
  const detail = findingDetail(ctx, selected, selectedNumber);
  return ctx.width() >= 780
    ? split({ size: paneSize(ctx, "a11y.issues", Math.round(ctx.width() * 0.52)), min: 320, onResize: (s) => setPaneSize(ctx, "a11y.issues", s), first: left, second: detail })
    : split({ direction: "col", size: Math.round(ctx.height() * 0.45), min: 160, onResize: () => undefined, first: left, second: detail });
}

/* -------------------------------------------------------------------------- */
/*  Accessibility tree                                                         */
/* -------------------------------------------------------------------------- */

interface AxRow {
  node: AxNode;
  path: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

const LANDMARK = new Set(["banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form"]);
const INTERACTIVE = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "switch", "combobox", "listbox", "option", "slider", "spinbutton", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem"]);

function roleTone(role: string): string {
  if (LANDMARK.has(role)) return "is-landmark";
  if (INTERACTIVE.has(role)) return "is-interactive";
  if (role === "heading") return "is-heading";
  if (role === "text" || role === "generic") return "is-text";
  return "";
}

function flattenAx(nodes: ReadonlyArray<AxNode>, collapsed: Set<string>, filter: string): AxRow[] {
  const rows: AxRow[] = [];
  const q = filter.trim().toLowerCase();
  const visit = (node: AxNode, path: string, depth: number): void => {
    // A text child that only repeats its parent's name ("button “Save”" →
    // "text Save") is noise here: the name already says it.
    const children = node.children.filter((child) => !(child.role === "text" && child.name === node.name && node.children.length === 1));
    const hasChildren = children.length > 0;
    const isCollapsed = !q && hasChildren && collapsed.has(path);
    if (!q || `${node.role} ${node.name}`.toLowerCase().includes(q)) rows.push({ node, path, depth: q ? 0 : depth, hasChildren: !q && hasChildren, collapsed: isCollapsed });
    if (isCollapsed) return;
    children.forEach((child, i) => visit(child, `${path}/${i}`, depth + 1));
  };
  nodes.forEach((node, i) => visit(node, String(i), 0));
  return rows;
}

function treePane(ctx: ViewContext): Child {
  const { app, ui, model } = ctx;
  const root = renderRootElement(app);
  const tree = ctx.memo("a11y.tree", [app?.id, model.revs.commit, root], () => accessibilityTree(root));
  const rows = flattenAx(tree, ui.a11yTreeCollapsed, ui.a11yTreeFilter);
  const selected = rows.find((r) => r.path === ui.a11yTreeSelected) ?? null;
  const selectedIndex = selected ? rows.indexOf(selected) : -1;
  const select = (row: AxRow | undefined): void => {
    if (!row) return;
    ui.a11yTreeSelected = row.path;
    ctx.highlightElement(row.node.element, { component: row.node.role, kind: row.node.name || undefined }, true);
    ctx.refresh();
  };
  const toggle = (row: AxRow): void => {
    if (ui.a11yTreeCollapsed.has(row.path)) ui.a11yTreeCollapsed.delete(row.path);
    else ui.a11yTreeCollapsed.add(row.path);
    ctx.refresh();
  };
  const list = h("div", { class: "ax-left" },
    h("div", { class: "ax-filters" },
      searchField({ value: ui.a11yTreeFilter, placeholder: "Find role or name…", onInput: (v) => { ui.a11yTreeFilter = v; ctx.refresh(); } }),
      spacer(),
      h("span", { class: "t3 num", style: { fontSize: "var(--dt-fs-sm)" } }, `${rows.length} nodes`),
      iconButton({ icon: "minimize", label: "Collapse all", size: "sm", onClick: () => { const all = flattenAx(tree, new Set(), ""); for (const r of all) if (r.hasChildren && r.depth > 0) ui.a11yTreeCollapsed.add(r.path); ctx.refresh(); } }),
      iconButton({ icon: "maximize", label: "Expand all", size: "sm", onClick: () => { ui.a11yTreeCollapsed.clear(); ctx.refresh(); } })),
    virtualList({
      items: rows, rowHeight: ctx.rowHeight, rowKey: (row) => row.path,
      version: [ui.a11yTreeSelected, ui.a11yTreeCollapsed.size, model.revs.commit, ui.a11yTreeFilter],
      scrollTo: selectedIndex >= 0 ? selectedIndex : null,
      role: "tree", ariaLabel: "Accessibility tree", testid: "a11y-tree",
      empty: emptyState({ icon: "tree", title: root ? "Nothing exposed to assistive tech" : "The app has not rendered yet" }),
      onKeyDown: (event) => {
        const row = rows[selectedIndex];
        switch (event.key) {
          case "ArrowDown": event.preventDefault(); select(rows[Math.min(rows.length - 1, selectedIndex + 1)]); break;
          case "ArrowUp": event.preventDefault(); select(rows[Math.max(0, selectedIndex - 1)]); break;
          case "ArrowRight": if (row?.hasChildren && row.collapsed) { event.preventDefault(); toggle(row); } break;
          case "ArrowLeft": if (row?.hasChildren && !row.collapsed) { event.preventDefault(); toggle(row); } break;
          default: break;
        }
      },
      renderRow: (row) => h("div", {
        class: ["row", "ax-node", row.path === ui.a11yTreeSelected ? "is-selected" : ""], role: "treeitem", "aria-level": row.depth + 1,
        "aria-expanded": row.hasChildren ? !row.collapsed : undefined, "data-dt": "ax-node",
        style: { paddingLeft: `${6 + row.depth * 14}px` },
        onClick: () => select(row),
        onMouseEnter: () => ctx.highlightElement(row.node.element, { component: row.node.role }),
        onMouseLeave: () => ctx.highlightElement(null),
      },
        h("button", { type: "button", tabindex: -1, "aria-hidden": "true", class: ["twist", row.hasChildren ? "" : "is-leaf", row.hasChildren && !row.collapsed ? "is-open" : ""], onClick: (event: MouseEvent) => { event.stopPropagation(); toggle(row); } }, icon("chevronRight", { size: 11 })),
        h("span", { class: ["ax-role", roleTone(row.node.role)] }, row.node.role),
        row.node.name ? h("span", { class: "ax-name ellipsis" }, row.node.role === "text" ? row.node.name : `“${row.node.name}”`) : (INTERACTIVE.has(row.node.role) ? h("span", { class: "ax-unnamed" }, "no name") : null),
        row.node.states.length > 0 ? h("span", { class: "ax-states" }, row.node.states.slice(0, 3).join(" · ")) : null,
        row.node.focusable ? h("span", { class: "ax-focusable", "data-tip": "In the tab order" }, icon("keyboard", { size: 11 })) : null),
    }));
  if (!selected) return list;
  const node = selected.node;
  const findings = ui.a11yRun?.findings.filter((f) => f.element === node.element) ?? [];
  const owner = can(app, "instanceForNode") ? app.instanceForNode(node.element) : null;
  const detail = h("div", { class: "ax-detail", "data-dt": "ax-node-detail" },
    h("div", { class: "pane-head" }, h("span", { class: ["ax-role", roleTone(node.role)] }, node.role), h("span", { class: "pane-title" }, node.name || "(no name)"), spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.a11yTreeSelected = null; ctx.highlightElement(null, undefined, true); ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      h("div", { class: "ax-announce is-big" }, icon("a11y", { size: 14 }), h("span", {}, announce(node.element))),
      kv([
        ["Role", h("code", {}, node.role)],
        ["Name", node.name ? node.name : h("span", { class: "tone-red" }, INTERACTIVE.has(node.role) ? "missing — this control is announced without a name" : "none")],
        ["States", node.states.length > 0 ? h("span", { class: "chips" }, ...node.states.map((s) => chip(s, "grey"))) : "none"],
        ["Keyboard", node.focusable ? "in the tab order" : "not focusable"],
        ["Element", h("code", {}, describeElement(node.element))],
      ]),
      findings.length > 0 ? h("div", {}, h("div", { class: "it-sub" }, `Audit issues on this element (${findings.length})`),
        ...findings.map((f) => note(f.impact === "minor" ? "info" : "warn", [h("strong", {}, `${RULE_INFO[f.rule]?.title ?? f.rule}. `), f.message]))) : null,
      h("div", { class: "row-flex" },
        owner ? button({ label: "Inspect component", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(owner, { reveal: true }) }) : null,
        button({ label: "Copy selector", size: "sm", variant: "ghost", icon: "copy", onClick: () => ctx.copy(cssPath(node.element), "the selector") }))));
  return ctx.width() >= 780
    ? split({ size: paneSize(ctx, "a11y.tree", Math.round(ctx.width() * 0.55)), min: 300, onResize: (s) => setPaneSize(ctx, "a11y.tree", s), first: list, second: detail })
    : split({ direction: "col", size: Math.round(ctx.height() * 0.5), min: 160, onResize: () => undefined, first: list, second: detail });
}

/* -------------------------------------------------------------------------- */
/*  Structure: landmarks, headings, keyboard                                   */
/* -------------------------------------------------------------------------- */

function walkTo(ctx: ViewContext, order: ReadonlyArray<Element>, index: number): void {
  const element = order[index];
  if (!element) return;
  ctx.ui.a11yWalk = index;
  try {
    (element as HTMLElement).focus({ preventScroll: false });
  } catch {
    /* not focusable after all */
  }
  ctx.highlightElement(element, { component: `Tab stop ${index + 1}`, kind: announce(element) }, true);
  ctx.refresh();
}

function structurePane(ctx: ViewContext): Child {
  const { app, ui, model } = ctx;
  const root = renderRootElement(app);
  const marks = ctx.memo("a11y.landmarks", [app?.id, model.revs.commit, root], () => landmarks(root));
  const headings = ctx.memo("a11y.headings", [app?.id, model.revs.commit, root], () => headingOutline(root));
  const order = ctx.memo("a11y.tabs", [app?.id, model.revs.commit, root], () => tabOrder(root));
  const hover = (element: Element | null, label?: string): void => ctx.highlightElement(element, label ? { component: label } : undefined);

  const landmarkNotes: Child[] = [];
  const roleCount = (role: string): number => marks.filter((m) => m.role === role).length;
  if (roleCount("main") === 0) landmarkNotes.push(note("warn", ["No ", h("code", {}, "main"), " landmark — screen-reader users cannot jump straight to the content. Wrap it in ", h("code", {}, "<main>"), "."]));
  if (roleCount("main") > 1) landmarkNotes.push(note("warn", "More than one main landmark."));
  if (roleCount("navigation") > 1 && marks.filter((m) => m.role === "navigation" && m.label === "navigation").length > 0) landmarkNotes.push(note("info", "Several navigation landmarks without labels — give each an aria-label so they can be told apart."));

  const headingNotes: Child[] = [];
  if (headings.length > 0 && !headings.some((hd) => hd.level === 1)) headingNotes.push(note("info", "No level-1 heading. The page's main heading should be an h1."));
  if (headings.some((hd) => hd.skipped)) headingNotes.push(note("warn", "The outline skips levels (marked below). Screen-reader users navigate by heading level, so a hole reads like missing content."));

  const walkIndex = ui.a11yWalk >= 0 && ui.a11yWalk < order.length ? ui.a11yWalk : -1;
  return h("div", { class: "dt-scroll" },
    h("div", { class: "ax-structure" },
      card({
        title: "Keyboard", icon: "keyboard", testid: "a11y-keyboard",
        sub: plural(order.length, "tab stop"),
        actions: [toggleSwitch({ checked: ui.a11yTabOrder, label: "Show path on page", testid: "a11y-taborder-toggle", onChange: (v) => { ui.a11yTabOrder = v; ctx.refresh(); } })],
        flush: true,
        body: h("div", {},
          h("div", { class: "ax-walk" },
            button({ label: "Previous", size: "sm", icon: "chevronLeft", disabled: order.length === 0 || walkIndex <= 0, onClick: () => walkTo(ctx, order, walkIndex - 1) }),
            button({ label: walkIndex < 0 ? "Start focus walk" : "Next", size: "sm", variant: "primary", icon: walkIndex < 0 ? "play" : "chevronRight", testid: "a11y-walk-next", disabled: order.length === 0 || walkIndex >= order.length - 1, onClick: () => walkTo(ctx, order, walkIndex + 1) }),
            h("span", { class: "ax-walk-status" }, walkIndex >= 0 ? [h("strong", {}, `${walkIndex + 1}/${order.length}`), " ", announce(order[walkIndex]!)] : "Moves real focus through the app, announcing each stop the way a screen reader would."),
            walkIndex >= 0 ? iconButton({ icon: "close", label: "End walk", size: "sm", onClick: () => { ui.a11yWalk = -1; ctx.highlightElement(null, undefined, true); ctx.refresh(); } }) : null),
          order.length === 0
            ? h("div", { class: "dt-pad t3" }, "Nothing in the app can take keyboard focus.")
            : h("ol", { class: "ax-stops" }, ...order.slice(0, 120).map((element, i) => h("li", {
                key: i, class: ["ax-stop", i === walkIndex ? "is-on" : ""],
                onMouseEnter: () => hover(element, `Tab stop ${i + 1}`), onMouseLeave: () => hover(null),
                onClick: () => walkTo(ctx, order, i),
              }, h("span", { class: "ax-stop-n num" }, String(i + 1)), h("span", { class: "ellipsis" }, announce(element)),
                Number(element.getAttribute("tabindex") ?? "0") > 0 ? chip(`tabindex=${element.getAttribute("tabindex")}`, "amber", { tip: "Positive tabindex reorders focus — avoid it" }) : null)))),
      }),
      card({
        title: "Landmarks", icon: "landmark", testid: "a11y-landmarks", sub: plural(marks.length, "landmark"),
        actions: [toggleSwitch({ checked: ui.a11yLandmarks, label: "Outline on page", onChange: (v) => { ui.a11yLandmarks = v; ctx.refresh(); } })],
        body: h("div", { class: "stack" },
          ...landmarkNotes,
          marks.length === 0 ? h("div", { class: "t3" }, "No landmarks.") : h("div", { class: "ax-marks" }, ...marks.map((mark, i) => h("div", {
            key: i, class: "ax-mark", onMouseEnter: () => hover(mark.element, mark.label), onMouseLeave: () => hover(null),
            onClick: () => ctx.highlightElement(mark.element, { component: mark.label }, true),
          }, h("span", { class: "ax-role is-landmark" }, mark.role), h("span", { class: "ellipsis" }, mark.label === mark.role ? h("span", { class: "t4" }, "unlabelled") : mark.label.slice(mark.role.length + 1)))))),
      }),
      card({
        title: "Heading outline", icon: "heading", testid: "a11y-headings", sub: plural(headings.length, "heading"),
        body: h("div", { class: "stack" },
          ...headingNotes,
          headings.length === 0 ? h("div", { class: "t3" }, "No headings. Long pages without them are hard to skim with a screen reader.") : h("div", { class: "ax-outline" }, ...headings.map((heading, i) => h("div", {
            key: i, class: ["ax-heading", heading.skipped ? "is-skipped" : "", !heading.text ? "is-empty" : ""],
            style: { paddingLeft: `${(heading.level - 1) * 16 + 4}px` },
            onMouseEnter: () => hover(heading.element, `h${heading.level}`), onMouseLeave: () => hover(null),
            onClick: () => ctx.highlightElement(heading.element, { component: `h${heading.level}` }, true),
          }, h("span", { class: "ax-hlevel" }, `H${heading.level}`), h("span", { class: "ellipsis" }, heading.text || "(empty heading)"),
            heading.skipped ? chip("skipped a level", "red") : null)))),
      })));
}

/* -------------------------------------------------------------------------- */
/*  Vision                                                                     */
/* -------------------------------------------------------------------------- */

const VISION: ReadonlyArray<{ value: UiState["a11yVision"]; label: string; detail: string }> = [
  { value: "none", label: "Normal vision", detail: "No simulation" },
  { value: "deuteranopia", label: "Deuteranopia", detail: "No green cones · ~1 in 16 men have some green weakness" },
  { value: "protanopia", label: "Protanopia", detail: "No red cones · reds look dark" },
  { value: "tritanopia", label: "Tritanopia", detail: "No blue cones · rare" },
  { value: "achromatopsia", label: "Achromatopsia", detail: "No colour at all · meaning must not rely on hue" },
  { value: "blur", label: "Blurred vision", detail: "Uncorrected eyesight, cataracts, a phone at arm's length" },
  { value: "low-contrast", label: "Low contrast", detail: "Glare, ageing eyes, a dim screen outdoors" },
];

function contrastChecker(ctx: ViewContext): Child {
  const { ui } = ctx;
  const fg = parseColor(ui.contrastFg);
  const bg = parseColor(ui.contrastBg);
  const ratio = fg && bg ? contrastRatio(fg, bg) : null;
  const pass = (target: number): Child => (ratio === null ? chip("—", "grey") : ratio >= target ? chip("pass", "green", { icon: "check" }) : chip("fail", "red", { icon: "close" }));
  const suggestion = fg && bg && ratio !== null && ratio < 4.5 ? suggestForeground(fg, bg, 4.55) : null;
  const colorInput = (value: string, label: string, onChange: (v: string) => void): Child => h("span", { class: "ax-color" },
    h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000", "aria-label": `${label} colour picker`, onInput: (e: Event) => onChange((e.target as HTMLInputElement).value) }),
    field({ value, mono: true, width: "96px", label, onInput: onChange }));
  const selectedElement = ui.a11ySelected !== null ? ui.a11yRun?.findings[ui.a11ySelected]?.element ?? null : null;
  return card({
    title: "Contrast checker", icon: "contrast", testid: "a11y-contrast",
    actions: selectedElement ? [button({ label: "From selected issue", size: "sm", variant: "ghost", onClick: () => { const c = elementColors(selectedElement); if (c) { ui.contrastFg = toHex(c.fg); ui.contrastBg = toHex(c.bg); ctx.refresh(); } } })] : [],
    body: h("div", { class: "ax-checker" },
      h("div", { class: "ax-checker-inputs" },
        h("label", { class: "ax-field" }, h("span", { class: "t3" }, "Text"), colorInput(ui.contrastFg, "Text colour", (v) => { ui.contrastFg = v; ctx.refresh(); })),
        iconButton({ icon: "refresh", label: "Swap", size: "sm", onClick: () => { const t = ui.contrastFg; ui.contrastFg = ui.contrastBg; ui.contrastBg = t; ctx.refresh(); } }),
        h("label", { class: "ax-field" }, h("span", { class: "t3" }, "Background"), colorInput(ui.contrastBg, "Background colour", (v) => { ui.contrastBg = v; ctx.refresh(); }))),
      h("div", { class: "ax-checker-preview", style: { color: fg ? ui.contrastFg : undefined, background: bg ? ui.contrastBg : undefined } },
        h("div", { class: "ax-big" }, "Large text 24px"),
        h("div", {}, "Body text at 14px should stay readable for everyone.")),
      h("div", { class: "ax-ratio num", "data-dt": "contrast-ratio" }, ratio === null ? "—" : `${ratio.toFixed(2)}:1`),
      h("div", { class: "ax-grades" },
        h("span", {}, "AA normal ", h("small", { class: "t3" }, "4.5"), pass(4.5)),
        h("span", {}, "AA large ", h("small", { class: "t3" }, "3"), pass(3)),
        h("span", {}, "AAA normal ", h("small", { class: "t3" }, "7"), pass(7)),
        h("span", {}, "AAA large ", h("small", { class: "t3" }, "4.5"), pass(4.5)),
        h("span", {}, "UI parts ", h("small", { class: "t3" }, "3"), pass(3))),
      suggestion ? note("accent", ["Closest passing text colour: ", h("code", {}, suggestion.hex), ` (${suggestion.ratio.toFixed(2)}:1). `,
        button({ label: "Use it", size: "sm", variant: "ghost", onClick: () => { ui.contrastFg = suggestion.hex; ctx.refresh(); } })], { icon: "wand" }) : null),
  });
}

function visionPane(ctx: ViewContext): Child {
  const { ui, app } = ctx;
  const canScale = can(app, "getTheme") && can(app, "setThemeTokens");
  return h("div", { class: "dt-scroll" },
    h("div", { class: "ax-structure" },
      card({
        title: "Vision simulation", icon: "vision", testid: "a11y-vision",
        sub: "Applied to the app only — the panel stays true-colour",
        body: h("div", { class: "ax-visions" }, ...VISION.map((mode) => h("button", {
          key: mode.value, type: "button", class: ["ax-vision", ui.a11yVision === mode.value ? "is-on" : ""], "aria-pressed": ui.a11yVision === mode.value, "data-dt": `vision-${mode.value}`,
          onClick: () => { ui.a11yVision = mode.value; ctx.refresh(); },
        }, h("span", { class: ["ax-vision-swatch", `is-${mode.value}`], "aria-hidden": "true" }), h("span", { class: "ax-vision-label" }, mode.label), h("span", { class: "ax-vision-detail" }, mode.detail)))),
      }),
      card({
        title: "Text size", icon: "type", testid: "a11y-textscale",
        sub: "WCAG 1.4.4 — text must work at 200%",
        body: h("div", { class: "stack" },
          segmented([
            { value: "1", label: "100%" }, { value: "1.25", label: "125%" }, { value: "1.5", label: "150%" }, { value: "2", label: "200%" },
          ], String(ui.emulateTextScale), (value) => { ui.emulateTextScale = Number(value); ctx.refresh(); }, { label: "Text scale" }),
          canScale ? h("div", { class: "t3" }, "Scales the theme's font-size tokens, so the app reflows the way it would for a user with larger default text. Look for clipped labels and overlapping controls.") : note("info", "This runtime does not expose its theme tokens, so text scaling is unavailable.")),
      }),
      contrastChecker(ctx)));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "Accessibility", "a11y");
  if (ui.a11yRequested) {
    ui.a11yRequested = false;
    runAudit(ctx, { quiet: ui.a11yAuto && ui.a11yRun !== null });
  }
  const run = ui.a11yRun;
  const numbered = run ? visibleFindings(run.findings, ui) : [];
  let body: Child;
  switch (ui.a11yPane) {
    case "tree": body = treePane(ctx); break;
    case "structure": body = structurePane(ctx); break;
    case "vision": body = visionPane(ctx); break;
    default: body = issuesPane(ctx);
  }
  const simulating = ui.a11yVision !== "none" || ui.emulateTextScale !== 1;
  return h("div", { class: "ax", "data-dt": "a11y" },
    viewbar(
      segmented([
        { value: "issues", label: "Issues", icon: "warning", count: run ? run.findings.length : null },
        { value: "tree", label: "A11y tree", icon: "tree" },
        { value: "structure", label: "Structure", icon: "landmark" },
        { value: "vision", label: "Vision", icon: "vision", count: simulating ? "on" : null },
      ], ui.a11yPane, (value) => {
        if (ui.a11yWalk >= 0 && value !== "structure") { ui.a11yWalk = -1; ctx.highlightElement(null, undefined, true); }
        ui.a11yPane = value;
        ctx.refresh();
      }, { label: "Accessibility view", testid: "a11y-panes" }),
      spacer(),
      simulating ? chip("simulation on", "purple", { icon: "vision", onClick: () => { ui.a11yVision = "none"; ui.emulateTextScale = 1; ctx.refresh(); }, tip: "Click to turn every simulation off" }) : null,
      run ? toggleSwitch({ checked: ui.a11yShowOnPage, label: "Markers", testid: "a11y-markers", onChange: (v) => { ui.a11yShowOnPage = v; ctx.refresh(); } }) : null,
      run ? toggleSwitch({ checked: ui.a11yAuto, label: "Auto", testid: "a11y-auto", onChange: (v) => { ui.a11yAuto = v; ctx.refresh(); } }) : null,
      vsep(),
      button({ label: run ? "Re-run" : "Run audit", size: "sm", variant: run ? "default" : "primary", icon: run ? "refresh" : "play", testid: "a11y-rerun", onClick: () => runAudit(ctx) }),
      run ? iconButton({ icon: "download", label: "Export report", size: "sm", onClick: (event: MouseEvent) => ctx.openMenu(event, [
        { label: "Copy as Markdown", icon: "copy", run: () => ctx.copy(reportMarkdown(ctx, numbered), "the report") },
        { label: "Download JSON", icon: "download", run: () => downloadText(`a11y-${app.label.replace(/[^\w.-]+/g, "_")}.json`, reportJson(ctx, numbered)) },
        { label: "Download Markdown", icon: "file", run: () => downloadText(`a11y-${app.label.replace(/[^\w.-]+/g, "_")}.md`, reportMarkdown(ctx, numbered), "text/markdown") },
      ]) }) : null),
    body);
}

export const a11yView: ViewDefinition = {
  id: "a11y",
  label: "Accessibility",
  icon: "a11y",
  group: "quality",
  hint: "WCAG 2.2 audit, accessibility tree, keyboard walk, vision simulation",
  keywords: "accessibility a11y wcag aria contrast screen reader tab order landmarks headings color blind vision audit",
  badge: (ctx) => {
    const run = ctx.ui.a11yRun;
    if (!run) return null;
    const severe = run.findings.filter((f) => f.impact === "critical" || f.impact === "serious").length;
    return severe > 0 ? { value: severe, tone: "red" } : run.findings.length > 0 ? { value: run.findings.length, tone: "amber" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "a11y:run", label: "Run accessibility audit", icon: "a11y", keywords: "wcag audit", run: () => { ctx.ui.a11yRequested = true; ctx.ui.a11yPane = "issues"; ctx.selectTab("a11y"); } },
    { id: "a11y:taborder", label: `${ctx.ui.a11yTabOrder ? "Hide" : "Show"} keyboard tab order on the page`, icon: "tabOrder", run: () => { ctx.ui.a11yTabOrder = !ctx.ui.a11yTabOrder; ctx.refresh(); } },
    { id: "a11y:landmarks", label: `${ctx.ui.a11yLandmarks ? "Hide" : "Show"} landmarks on the page`, icon: "landmark", run: () => { ctx.ui.a11yLandmarks = !ctx.ui.a11yLandmarks; ctx.refresh(); } },
    ...VISION.filter((m) => m.value !== "none").map((mode) => ({
      id: `a11y:vision:${mode.value}`, label: `Simulate ${mode.label.toLowerCase()}`, icon: "vision" as const, keywords: "color blind vision",
      run: () => { ctx.ui.a11yVision = mode.value; ctx.refresh(); },
    })),
    { id: "a11y:vision:none", label: "Stop vision simulation", icon: "eye", run: () => { ctx.ui.a11yVision = "none"; ctx.ui.emulateTextScale = 1; ctx.refresh(); } },
  ],
  css: /* css */ `
.ax { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ax-left { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.ax-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ax-summary { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.ax-summary-text { display: flex; flex-direction: column; gap: 3px; min-width: 150px; }
.ax-summary-title { font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 8px; }
.ax-summary-text .t3 { font-size: var(--dt-fs-sm); }
.ax-trend { font-size: var(--dt-fs-xs); font-weight: 700; padding: 1px 6px; border-radius: 99px; }
.ax-trend.is-up { color: var(--dt-green); background: var(--dt-green-soft); }
.ax-trend.is-down { color: var(--dt-red); background: var(--dt-red-soft); }
.ax-impacts { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.ax-filters { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.ax-cats { display: flex; gap: 5px; flex-wrap: wrap; }
.ax-group { gap: 8px; font-weight: 600; background: var(--dt-bg-1); cursor: pointer; border-bottom: 1px solid var(--dt-border); }
.ax-group:hover { background: var(--dt-bg-hover); }
.ax-group-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ax-group-rule { color: var(--dt-text-3); font-weight: 400; font-size: var(--dt-fs-xs); white-space: nowrap; }
.ax-wcag-mini { font: 600 10px/1 var(--dt-mono); color: var(--dt-text-3); border: 1px solid var(--dt-border-strong); border-radius: 4px; padding: 2px 4px; }
.ax-count { min-width: 22px; text-align: center; font-size: var(--dt-fs-xs); font-weight: 700; color: var(--dt-text-2); background: var(--dt-bg-active); border-radius: 99px; padding: 2px 6px; }
.ax-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dt-text-4); }
.ax-dot.t-red { background: var(--dt-red); } .ax-dot.t-orange { background: var(--dt-orange); } .ax-dot.t-amber { background: var(--dt-amber); } .ax-dot.t-blue { background: var(--dt-blue); }
.ax-item { gap: 8px; padding-left: 30px; cursor: pointer; }
.ax-num { flex: none; min-width: 20px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font: 700 10px/1 var(--dt-sans); color: #fff; background: var(--dt-text-4); font-variant-numeric: tabular-nums; }
.ax-num.t-red { background: var(--dt-red); } .ax-num.t-orange { background: var(--dt-orange); } .ax-num.t-amber { background: var(--dt-amber); color: #1a1300; } .ax-num.t-blue { background: var(--dt-blue); }
.ax-detail-chip { font-size: var(--dt-fs-xs); color: var(--dt-amber); flex: none; }
.ax-message { font-size: var(--dt-fs-md); line-height: 1.5; color: var(--dt-text); }
.ax-wcag { display: flex; flex-direction: column; gap: 4px; }
.ax-sc { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--dt-border); border-radius: var(--dt-r-sm); color: var(--dt-text); text-decoration: none; font-size: var(--dt-fs-sm); }
a.ax-sc:hover { border-color: var(--dt-accent); background: var(--dt-accent-soft); }
.ax-sc-id { font: 600 var(--dt-fs-xs) var(--dt-mono); color: var(--dt-accent-text); }
.ax-sc-name { flex: 1 1 auto; }
.ax-sc-level { font-size: 10px; font-weight: 700; color: var(--dt-text-3); border: 1px solid var(--dt-border-strong); border-radius: 4px; padding: 1px 4px; }
.ax-el { display: block; padding: 7px 9px; border-radius: var(--dt-r-sm); background: var(--dt-bg-2); font-size: var(--dt-fs-sm); overflow-wrap: anywhere; }
.ax-announce { display: flex; align-items: flex-start; gap: 7px; margin-top: 8px; padding: 7px 9px; border-radius: var(--dt-r-sm); border: 1px dashed var(--dt-border-strong); color: var(--dt-text-2); font-size: var(--dt-fs-sm); font-style: italic; }
.ax-announce > svg { margin-top: 2px; flex: none; color: var(--dt-accent); }
.ax-announce.is-big { font-size: var(--dt-fs-md); margin-top: 0; }
.ax-el-actions { margin-top: 8px; flex-wrap: wrap; }
.ax-contrast { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ax-sample { width: 64px; height: 52px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border-strong); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 20px; font-weight: 650; line-height: 1.1; }
.ax-sample small { font-size: 10px; font-weight: 600; opacity: 0.9; }
.ax-contrast-text { display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-sm); min-width: 180px; flex: 1 1 auto; }
.ax-node { gap: 6px; }
.ax-role { font: 600 var(--dt-fs-xs) var(--dt-mono); color: var(--dt-text-2); white-space: nowrap; }
.ax-role.is-landmark { color: var(--dt-purple); }
.ax-role.is-interactive { color: var(--dt-cyan); }
.ax-role.is-heading { color: var(--dt-amber); }
.ax-role.is-text { color: var(--dt-text-4); font-weight: 400; }
.ax-name { color: var(--dt-text); }
.ax-unnamed { color: var(--dt-red); font-size: var(--dt-fs-xs); font-style: italic; }
.ax-states { color: var(--dt-text-3); font-size: var(--dt-fs-xs); white-space: nowrap; }
.ax-focusable { color: var(--dt-text-3); display: inline-flex; margin-left: auto; }
.ax-structure { padding: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 12px; align-items: start; }
.ax-walk { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.ax-walk-status { flex: 1 1 200px; font-size: var(--dt-fs-sm); color: var(--dt-text-2); min-width: 0; }
.ax-stops { list-style: none; margin: 0; padding: 4px 0; max-height: 320px; overflow: auto; }
.ax-stop { display: flex; align-items: center; gap: 8px; padding: 4px 12px; font-size: var(--dt-fs-sm); cursor: pointer; }
.ax-stop:hover { background: var(--dt-bg-hover); }
.ax-stop.is-on { background: var(--dt-accent-soft); }
.ax-stop-n { min-width: 22px; height: 18px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: var(--dt-accent); color: #fff; flex: none; }
.ax-marks, .ax-outline { display: flex; flex-direction: column; }
.ax-mark, .ax-heading { display: flex; align-items: center; gap: 8px; padding: 5px 4px; font-size: var(--dt-fs-sm); border-radius: var(--dt-r-sm); cursor: pointer; min-width: 0; }
.ax-mark:hover, .ax-heading:hover { background: var(--dt-bg-hover); }
.ax-hlevel { font: 700 10px/1 var(--dt-mono); color: var(--dt-amber); border: 1px solid currentColor; border-radius: 4px; padding: 2px 4px; flex: none; }
.ax-heading.is-skipped .ax-hlevel, .ax-heading.is-empty .ax-hlevel { color: var(--dt-red); }
.ax-heading.is-empty > .ellipsis { color: var(--dt-red); font-style: italic; }
.ax-visions { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.ax-vision { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 26px 1fr; grid-template-rows: auto auto; column-gap: 8px; row-gap: 2px; padding: 8px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); }
.ax-vision:hover { border-color: var(--dt-border-strong); background: var(--dt-bg-hover); }
.ax-vision:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: 1px; }
.ax-vision.is-on { border-color: var(--dt-accent); background: var(--dt-accent-soft); }
.ax-vision-swatch { grid-row: 1 / 3; width: 26px; height: 26px; border-radius: 50%; background: conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444); }
.ax-vision-swatch.is-deuteranopia { background: conic-gradient(#a39b5b, #c9b35a, #b5aa62, #5c78c2, #7a7ab6, #a39b5b); }
.ax-vision-swatch.is-protanopia { background: conic-gradient(#8a8151, #c4b456, #cab86a, #4f73c4, #6b76b5, #8a8151); }
.ax-vision-swatch.is-tritanopia { background: conic-gradient(#e0464b, #f28d9a, #56c3c7, #46a0b0, #c27a86, #e0464b); }
.ax-vision-swatch.is-achromatopsia { background: conic-gradient(#555, #aaa, #888, #666, #777, #555); }
.ax-vision-swatch.is-blur { filter: blur(2px); }
.ax-vision-swatch.is-low-contrast { filter: contrast(0.45) brightness(1.15); }
.ax-vision-label { font-weight: 600; font-size: var(--dt-fs-sm); color: var(--dt-text); }
.ax-vision-detail { font-size: var(--dt-fs-xs); color: var(--dt-text-3); line-height: 1.35; }
.ax-checker { display: flex; flex-direction: column; gap: 12px; }
.ax-checker-inputs { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.ax-field { display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-xs); }
.ax-color { display: inline-flex; align-items: center; gap: 6px; }
.ax-color input[type="color"] { width: 28px; height: 26px; padding: 0; border: 1px solid var(--dt-border-strong); border-radius: var(--dt-r-sm); background: none; cursor: pointer; }
.ax-checker-preview { padding: 12px 14px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border-strong); display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.ax-big { font-size: 24px; font-weight: 650; line-height: 1.15; }
.ax-ratio { font-size: 28px; font-weight: 750; letter-spacing: -0.02em; }
.ax-grades { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; font-size: var(--dt-fs-sm); }
.ax-grades > span { display: flex; align-items: center; gap: 6px; }
.ax-grades > span > .chip { margin-left: auto; }
`,
};
